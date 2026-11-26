/** When something goes wrong (v0.9.19, docs/BETA_PLAN.md A3): the log file, and the details for a bug report. */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { tempContext, tempDir } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { logError, logFile, logInfo, logTail, logsDir, scrub, startLog, stopLog } from '../server/src/log.js';
import { clientReport, diagnosticsText } from '../server/src/diagnostics.js';
import { recoveryApp } from '../server/src/recovery.js';
import { APP_VERSION } from '../shared/version.js';

afterEach(() => {
  stopLog();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const read = (dir: string, name = 'worldkeeper.log') => fs.readFileSync(path.join(logsDir(dir), name), 'utf8');

describe('the log file', () => {
  it('keeps what the server says, with the time and how serious it is', () => {
    const dir = tempDir();
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(startLog(dir)).toBe(path.join(dir, 'logs', 'worldkeeper.log'));
    console.log('[worldkeeper] starting', { port: 4310 });
    console.warn('careful');
    logInfo('library lib-abc is open, schema 37');
    const lines = read(dir).trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z INFO  \[worldkeeper\] starting \{ port: 4310 \}$/);
    expect(lines[1]).toMatch(/ WARN  careful$/);
    expect(lines[2]).toMatch(/ INFO  \[worldkeeper\] library lib-abc is open, schema 37$/);
    // Run from a terminal, it is still said there too.
    expect(out).toHaveBeenCalledWith('[worldkeeper] starting', { port: 4310 });
    stopLog();
    expect(logFile()).toBeNull();
    console.log('after');
    expect(read(dir)).not.toContain('after');
  });

  it('writes an error with where in the code it happened', () => {
    const dir = tempDir();
    startLog(dir);
    logError('POST /api/entities failed', Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' }));
    const text = read(dir);
    expect(text).toMatch(/ ERROR POST \/api\/entities failed \[SQLITE_IOERR\]\n {4}Error: disk I\/O error\n {4} +at /);
    // Every line of one entry is indented under it, so entries can be told apart.
    expect(text.split('\n').filter((l) => l && !l.startsWith('    '))).toHaveLength(1);
  });

  it('stays small: a full file is set aside, and only one older file is kept', () => {
    const dir = tempDir();
    startLog(dir);
    const line = 'x'.repeat(9_990);
    for (let i = 0; i < 250; i++) logInfo(`${i} ${line}`);
    const names = fs.readdirSync(logsDir(dir)).sort();
    expect(names).toEqual(['worldkeeper.log', 'worldkeeper.log.1']);
    for (const n of names) expect(fs.statSync(path.join(logsDir(dir), n)).size).toBeLessThanOrEqual(1_000_000);
    // The newest is in the current file; the tail reads across both.
    expect(read(dir)).toContain(' 249 ');
    const tail = logTail(dir, 120).split('\n');
    expect(tail).toHaveLength(120);
    expect(tail.at(-1)).toContain(' 249 ');
    expect(tail[0]).toContain(' 130 ');
  });

  it('without a log file (the tests, the command-line tools), an error still reaches the terminal', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logError('the automatic backup failed', new Error('no space left'));
    expect(String(err.mock.calls[0][0])).toContain('the automatic backup failed');
    logInfo('silent');
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('takes the home folder, which is usually a name, out of anything that will be sent', () => {
    expect(scrub('data: /home/maria/.local/share/app.worldkeeper.desktop', '/home/maria')).toBe('data: ~/.local/share/app.worldkeeper.desktop');
    expect(scrub('C:\\Users\\Maria Lopez\\AppData\\Roaming\\x and C:/Users/Maria Lopez/AppData', 'C:\\Users\\Maria Lopez')).toBe('~\\AppData\\Roaming\\x and ~/AppData');
    expect(scrub('at file:///Users/sam/app.js', '/Users/sam')).toBe('at file://~/app.js');
    // Nothing to take out when the home folder is the disk itself.
    expect(scrub('/data/worldkeeper', '/')).toBe('/data/worldkeeper');
  });
});

describe('unexpected errors', () => {
  it('are logged with the kind of request, never what was sent', async () => {
    const ctx = tempContext();
    startLog(ctx.paths.rootDir);
    const app = createApp(ctx);
    // Something nothing expected, in the middle of an ordinary request.
    const prepare = vi.spyOn(ctx.db, 'prepare').mockImplementation(() => {
      throw new TypeError('cannot read the thing');
    });
    const res = await request(app).post('/api/entities?q=whisper').send({ type: 'npc', realm: 'world', name: 'The Secret Villain' }).expect(500);
    expect(res.body).toEqual({ error: 'cannot read the thing' });
    prepare.mockRestore();
    const text = read(ctx.paths.rootDir);
    expect(text).toContain('POST /api/entities failed');
    expect(text).toContain('TypeError: cannot read the thing');
    expect(text).not.toContain('Secret Villain');
    expect(text).not.toContain('whisper');
    // What the GM is told to expect (a refused request, a missing page) is not an error to log.
    const before = read(ctx.paths.rootDir);
    await request(app).get('/api/entities/NOPE-1').expect(404);
    await request(app).post('/api/entities').send({}).expect(400);
    expect(read(ctx.paths.rootDir)).toBe(before);
  });

  it('from the page are logged too: cut to size, and not without end', async () => {
    const ctx = tempContext();
    startLog(ctx.paths.rootDir);
    const app = createApp(ctx);
    const r = await request(app)
      .post('/api/log/client')
      .send({ message: 'x is undefined', stack: 'TypeError: x is undefined\n    at Page (index.js:1:2)', where: '/campaigns/3' })
      .expect(200);
    expect(r.body).toEqual({ logged: true });
    expect(read(ctx.paths.rootDir)).toMatch(/ ERROR in the page at \/campaigns\/3: x is undefined\n {4}TypeError: x is undefined/);
    // Not a report; a "where" that is more than a path (a search, something typed) is dropped.
    expect((await request(app).post('/api/log/client').send({ nope: 1 })).body).toEqual({ logged: false });
    expect(clientReport({ message: 'm', where: '/search?q=the secret' }, 1)).toEqual({ message: 'm', stack: undefined, where: undefined });
    expect(clientReport({ message: 'm'.repeat(2000), stack: 's'.repeat(9000) }, 1)).toMatchObject({ message: 'm'.repeat(500), stack: 's'.repeat(4000) });
    // A screen failing in a loop: twenty a minute, then nothing until the next minute.
    const t = Date.now() + 120_000;
    const logged = Array.from({ length: 30 }, () => clientReport({ message: 'again' }, t)).filter(Boolean);
    expect(logged).toHaveLength(20);
    expect(clientReport({ message: 'again' }, t + 61_000)).not.toBeNull();
  });
});

describe('the details for a bug report', () => {
  it('say what the app, the computer and the library are, with the log, and nothing from the world', async () => {
    const ctx = tempContext();
    startLog(ctx.paths.rootDir);
    const app = createApp(ctx);
    await request(app).post('/api/entities').send({ type: 'npc', realm: 'world', name: 'Mirelle the Unseen', summary: 'She poisoned the duke.' }).expect(200);
    await request(app).post('/api/campaigns').send({ title: 'The Iron Crown' }).expect(200);
    logError('GET /api/briefing failed', new Error(`cannot open ${path.join(ctx.paths.dataDir, 'worldkeeper.db')}`));
    const d = (await request(app).get('/api/diagnostics').expect(200)).body as { text: string; logs: string; canOpen: boolean; report: string };
    expect(d.text.split('\n')[0]).toBe(`The Worldkeeper ${APP_VERSION} (run from source)`);
    expect(d.text).toMatch(/\nSystem: \S+/);
    expect(d.text).toMatch(/\nLibrary: schema \d+ of \d+ · records 1 · campaigns 1 · sessions 0 · characters 0\n/);
    expect(d.text).toMatch(/\nFiles: database \d+(\.\d)? (kB|MB) · pictures 0 \(1 kB\) · backups /);
    expect(d.text).toMatch(/\nWorldbooks: none · rules from books: \d+ · parts on: /);
    expect(d.text).toContain('Table: closed · GM app on the network: closed');
    expect(d.text).toContain('Update check: on, never run');
    expect(d.text).toContain('GET /api/briefing failed');
    // Numbers and versions only: no record, no campaign, no library name.
    for (const secret of ['Mirelle', 'poisoned', 'Iron Crown']) expect(d.text).not.toContain(secret);
    expect(d).toMatchObject({ logs: logsDir(ctx.paths.rootDir), canOpen: false, report: 'https://github.com/n1x-shell/Worldkeeper/issues/new/choose' });
    // Showing the folder is the desktop app's.
    await request(app).post('/api/diagnostics/open-logs').expect(400);
  });

  it('never name the home folder', () => {
    const ctx = tempContext();
    const home = path.dirname(ctx.paths.rootDir);
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    const text = diagnosticsText({ ctx, rootDir: ctx.paths.rootDir });
    expect(text).toContain(`Data folder: ~${path.sep}${path.basename(ctx.paths.rootDir)}`);
    expect(text).not.toContain(home);
  });

  it('are on the page shown when no library can be opened, where there is no app to copy them from', async () => {
    const dir = tempDir();
    startLog(dir);
    logError('the library lib-x could not be opened', new Error('file is not a database'));
    const app = recoveryApp(() => ({ error: new Error('file is not a database'), rootDir: dir, library: null, version: APP_VERSION, details: diagnosticsText({ rootDir: dir, lines: 60 }) }), () => false);
    const page = (await request(app).get('/').expect(503)).text;
    expect(page).toContain('Details, for a bug report');
    expect(page).toContain('https://github.com/n1x-shell/Worldkeeper/issues');
    expect(page).toContain(`The Worldkeeper ${APP_VERSION}`);
    expect(page).toContain('the library lib-x could not be opened');
  });

  it('are not part of a backup or an export of everything', async () => {
    const ctx = tempContext();
    startLog(ctx.paths.rootDir);
    logInfo('something');
    const app = createApp(ctx);
    const zip = (await request(app).get('/api/libraries/everything').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    })).body as Buffer;
    const { default: AdmZip } = await import('adm-zip');
    const names = new AdmZip(zip).getEntries().map((e) => e.entryName);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /(^|\/)logs\//.test(n) || n.endsWith('.log'))).toEqual([]);
  });
});

describe('the bug report forms', () => {
  it('ask for the details the app copies, and warn that reports are public', () => {
    const dir = path.resolve(__dirname, '../.github/ISSUE_TEMPLATE');
    const bug = fs.readFileSync(path.join(dir, 'bug_report.yml'), 'utf8');
    expect([...bug.matchAll(/^ {4}id: (\w+)$/gm)].map((m) => m[1])).toEqual(['what', 'steps', 'details', 'how', 'data']);
    // The form names the button as the app does.
    expect(bug).toContain('Copy details for a bug report');
    expect(bug).toContain('Settings → Help and bug reports');
    expect(bug).toMatch(/Reports here are \*\*public\*\*/);
    // The pages the forms point to exist in this repository.
    const links = [...fs.readFileSync(path.join(dir, 'config.yml'), 'utf8').matchAll(/url: \S+\/blob\/main\/(\S+)/g)].map((m) => m[1]);
    expect(links.length).toBe(2);
    for (const l of links) expect(fs.existsSync(path.resolve(__dirname, '..', l))).toBe(true);
  });
});
