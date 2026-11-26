import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { fixtureFiles, tempContext, tempDir, zipOf } from './helpers.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createApp } from '../server/src/app.js';
import { updateEntity } from '../server/src/repo/entities.js';
import { maps } from '../server/src/repo/maps.js';
import { GitHubError, gitBlobSha, publishToGitHub } from '../server/src/publish/github.js';
import { exportJson } from '../server/src/backup/exporter.js';
import { createBackup } from '../server/src/backup/backup.js';

// ---- A small in-memory stand-in for the GitHub REST API (Git Data + Pages endpoints) ----
// It behaves as GitHub's documentation says the real one does (docs.github.com, read for v0.9.23): a tree entry may
// carry a text file's content; a tree may be built on another; an empty repository can't be given a branch until it
// has a first commit; and it can tell a client to slow down, with the headers GitHub uses.
function fakeGitHub(opts: { token: string; pagesAllowed: boolean; empty?: boolean; noInlineText?: boolean }) {
  const blobs = new Map<string, Buffer>();
  const trees = new Map<string, { path: string; sha: string; type: string; mode: string }[]>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  const refs = new Map<string, string>();
  let pages: { source: { branch: string; path: string }; html_url: string } | null = null;
  const calls: string[] = [];
  const authSeen: string[] = [];
  /** Tells the next requests that change something to slow down: each entry is one refusal's headers. */
  const slowDown: Record<string, string>[] = [];
  const state = { empty: !!opts.empty };
  const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
  const emptyRepo = (r: express.Response) => r.status(409).json({ message: 'Git Repository is empty.' });
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, res, next) => {
    calls.push(`${req.method} ${req.path}`);
    authSeen.push(String(req.headers.authorization));
    if (req.headers.authorization !== `Bearer ${opts.token}`) return res.status(401).json({ message: 'Bad credentials' });
    if (req.method !== 'GET' && slowDown.length) {
      const headers = slowDown.shift()!;
      return res.status(headers.status === '429' ? 429 : 403).set(headers).json({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' });
    }
    next();
  });
  const base = '/repos/me/handbook';
  app.get(base, (_q, r) => r.json({ full_name: 'me/handbook' }));
  app.get('/repos/:o/:r', (_q, r) => r.status(404).json({ message: 'Not Found' }));
  app.get(`${base}/git/ref/heads/:b`, (q, r) => (state.empty ? emptyRepo(r) : refs.has(q.params.b) ? r.json({ object: { sha: refs.get(q.params.b) } }) : r.status(404).json({ message: 'Not Found' })));
  app.get(`${base}/git/commits/:sha`, (q, r) => r.json({ sha: q.params.sha, tree: { sha: commits.get(q.params.sha)!.tree } }));
  app.get(`${base}/git/trees/:sha`, (q, r) => r.json({ sha: q.params.sha, tree: trees.get(q.params.sha), truncated: false }));
  // The first file of an empty repository: what makes it a repository with a branch.
  app.put(`${base}/contents/:file`, (q, r) => {
    if (!state.empty) return r.status(422).json({ message: 'Invalid request. "sha" wasn\'t supplied.' });
    const data = Buffer.from(q.body.content, 'base64');
    const blob = gitBlobSha(data);
    blobs.set(blob, data);
    const tree = sha1(`start:${q.params.file}`);
    trees.set(tree, [{ path: q.params.file, sha: blob, type: 'blob', mode: '100644' }]);
    const commit = sha1(`start-commit:${q.body.message}`);
    commits.set(commit, { tree, parents: [], message: q.body.message });
    refs.set('main', commit);
    state.empty = false;
    r.status(201).json({ commit: { sha: commit } });
  });
  app.post(`${base}/git/blobs`, (q, r) => {
    if (state.empty) return emptyRepo(r);
    const data = Buffer.from(q.body.content, 'base64');
    const sha = gitBlobSha(data);
    blobs.set(sha, data);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/trees`, (q, r) => {
    if (state.empty) return emptyRepo(r);
    const given = q.body.tree as { path: string; sha?: string; content?: string; type: string; mode: string }[];
    const merged = new Map((q.body.base_tree ? (trees.get(q.body.base_tree) ?? []) : []).map((t) => [t.path, t]));
    for (const t of given) {
      if (t.sha !== undefined && t.content !== undefined) return r.status(422).json({ message: 'Using both tree.sha and content will return an error.' });
      let sha = t.sha;
      if (t.content !== undefined) {
        if (opts.noInlineText) return r.status(422).json({ message: 'tree.content is not accepted here' });
        const data = Buffer.from(t.content, 'utf8');
        sha = gitBlobSha(data);
        blobs.set(sha, data);
      }
      if (!sha || !blobs.has(sha)) return r.status(422).json({ message: `missing blob ${sha}` });
      merged.set(t.path, { path: t.path, sha, type: t.type, mode: t.mode });
    }
    // As git does: the same files make the same tree, however they were sent.
    const tree = [...merged.values()].sort((x, y) => (x.path < y.path ? -1 : 1));
    const sha = sha1(JSON.stringify(tree.map((t) => [t.path, t.sha])));
    trees.set(sha, tree);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/commits`, (q, r) => {
    if (state.empty) return emptyRepo(r);
    const sha = sha1(JSON.stringify(q.body) + commits.size);
    commits.set(sha, q.body);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/refs`, (q, r) => {
    // "You are unable to create new references for empty repositories, even if the commit SHA-1 hash used exists."
    if (state.empty) return emptyRepo(r);
    refs.set(q.body.ref.replace('refs/heads/', ''), q.body.sha);
    r.status(201).json({});
  });
  app.patch(`${base}/git/refs/heads/:b`, (q, r) => {
    const parent = commits.get(q.body.sha)!.parents[0];
    if (parent !== refs.get(q.params.b)) return r.status(422).json({ message: 'Update is not a fast forward' });
    refs.set(q.params.b, q.body.sha);
    r.json({});
  });
  app.get(`${base}/pages`, (_q, r) => (pages ? r.json(pages) : r.status(404).json({ message: 'Not Found' })));
  app.post(`${base}/pages`, (q, r) => {
    if (!opts.pagesAllowed) return r.status(403).json({ message: 'Resource not accessible by personal access token' });
    pages = { source: q.body.source, html_url: 'https://me.github.io/handbook/' };
    r.status(201).json(pages);
  });
  const filesOn = (branch: string) => {
    const tree = trees.get(commits.get(refs.get(branch)!)!.tree)!;
    return new Map(tree.map((t) => [t.path, blobs.get(t.sha)!]));
  };
  return { app, calls, authSeen, refs, commits, filesOn, slowDown, state };
}

/** A stand-in of its own, for a test that needs GitHub in a particular state. */
async function withGitHub<T>(opts: Parameters<typeof fakeGitHub>[0], fn: (gh: ReturnType<typeof fakeGitHub>, api: string) => Promise<T>): Promise<T> {
  const fake = fakeGitHub(opts);
  const srv = await new Promise<import('node:http').Server>((resolve) => {
    const s = fake.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    return await fn(fake, `http://127.0.0.1:${(srv.address() as AddressInfo).port}`);
  } finally {
    srv.close();
  }
}
const textFile = (path: string, text: string) => ({ path, data: Buffer.from(text, 'utf8') });
const picture = (path: string, n: number) => ({ path, data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, n & 255, n >> 8]), Buffer.alloc(64, n & 255)]) });
const changing = (calls: string[]) => calls.filter((c) => !c.startsWith('GET '));

const siteDir = tempDir('wk-site-');
fs.mkdirSync(path.join(siteDir, 'assets'));
fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><div id="root"></div>');
fs.writeFileSync(path.join(siteDir, 'assets', 'app.js'), 'console.log("player app")');
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let server: import('node:http').Server;
let gh: ReturnType<typeof fakeGitHub>;

beforeAll(async () => {
  process.env.WORLDKEEPER_PLAYER_SITE_DIR = siteDir;
  gh = fakeGitHub({ token: 'test-token-123', pagesAllowed: true });
  await new Promise<void>((resolve) => {
    server = gh.app.listen(0, '127.0.0.1', () => resolve());
  });
  process.env.WORLDKEEPER_GITHUB_API = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server?.close();
  delete process.env.WORLDKEEPER_GITHUB_API;
  delete process.env.WORLDKEEPER_PLAYER_SITE_DIR;
});

function seeded() {
  const ctx = tempContext();
  const files = readZip(zipOf(fixtureFiles()));
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'f'));
  // Reveal one record (with a secret-bearing GM section) and publish one map.
  updateEntity(ctx.db, 'SET-001', { revealed: true, player_summary: 'A quiet town kept by @[Test Keeper].', revealed_sections: ['Overview', 'GM-only truths'] });
  fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-1-abc.png'), PNG);
  fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-2-secret.png'), PNG);
  maps.create(ctx.db, { name: 'Shared map', image_file: 'map-1-abc.png', player_visible: true });
  maps.create(ctx.db, { name: 'DM map', image_file: 'map-2-secret.png', player_visible: false });
  return { ctx, app: createApp(ctx) };
}

describe('player handbook site', () => {
  it('git blob ids match git hash-object', () => {
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('ZIP contains the player app, player-safe data and only published map images', async () => {
    const { app } = seeded();
    const res = await request(app).get('/api/publish/site.zip').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const zip = new AdmZip(res.body as Buffer);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual([
      'player-handbook/.nojekyll',
      'player-handbook/assets/app.js',
      'player-handbook/data/player.json',
      'player-handbook/index.html',
      'player-handbook/precache.json',
      'player-handbook/robots.txt',
      'player-handbook/uploads/map-1-abc.png',
    ]);
    const data = zip.getEntry('player-handbook/data/player.json')!.getData().toString('utf8');
    expect(data).toContain('A quiet town kept by Test Keeper.');
    for (const secret of ['Hidden Test Villain', 'forbidden ledger', 'Test_Bible.md', 'NPC-001', 'map-2-secret', 'LOC-002'])
      expect(data).not.toContain(secret);
  });
});

describe('publishing to GitHub Pages', () => {
  it('publishes, skips unchanged files, and only uploads what changed', async () => {
    const { ctx, app } = seeded();
    expect((await request(app).post('/api/publish/github').send({ confirm: true })).status).toBe(400); // not configured
    const cfg = await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'test-token-123' });
    expect(cfg.status).toBe(200);
    expect(cfg.body.tokenSaved).toBe(true);
    expect(cfg.body.config).toEqual({ repo: 'me/handbook', branch: 'gh-pages' });
    expect(cfg.body.preview).toMatchObject({ entries: 1, maps: 1 });
    expect((await request(app).post('/api/publish/github').send({})).status).toBe(400); // needs confirmation

    const first = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ changed: true, uploaded: 7, pages: 'created', url: 'https://me.github.io/handbook/' });
    const site = gh.filesOn('gh-pages');
    expect([...site.keys()].sort()).toEqual(['.nojekyll', 'assets/app.js', 'data/player.json', 'index.html', 'precache.json', 'robots.txt', 'uploads/map-1-abc.png']);
    const published = site.get('data/player.json')!.toString('utf8');
    expect(published).not.toContain('Hidden Test Villain');
    expect(gh.authSeen.every((a) => a === 'Bearer test-token-123')).toBe(true);

    const second = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(second.body).toMatchObject({ changed: false, uploaded: 0, pages: 'enabled' });

    updateEntity(ctx.db, 'SET-001', { revealed_facts: ['The gate is barred at night.'] });
    const firstCommit = gh.refs.get('gh-pages')!;
    const third = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(third.body).toMatchObject({ changed: true, uploaded: 1, unchanged: 6 });
    expect(gh.commits.get(gh.refs.get('gh-pages')!)!.parents).toEqual([firstCommit]);
    expect(gh.filesOn('gh-pages').get('data/player.json')!.toString('utf8')).toContain('The gate is barred at night.');
    expect((await request(app).get('/api/publish')).body.last).toMatchObject({ changed: true, uploaded: 1 });
  });

  it('reports a rejected token and an unknown repository in plain words', async () => {
    const { app } = seeded();
    await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'wrong' });
    const bad = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/did not accept the token/);
    await request(app).put('/api/publish/config').send({ repo: 'me/other', token: 'test-token-123' });
    const missing = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(missing.body.error).toMatch(/not found, or the token cannot access it/);
    expect((await request(app).put('/api/publish/config').send({ repo: 'not a repo' })).status).toBe(400);
  });

  it('keeps the token out of the database, API responses, exports and backups', async () => {
    const { ctx, app } = seeded();
    await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'super-secret-token' });
    const secretsFile = path.join(ctx.paths.sharedDir, 'secrets.json');
    expect(fs.existsSync(secretsFile)).toBe(true);
    if (process.platform !== 'win32') expect(fs.statSync(secretsFile).mode & 0o077).toBe(0);
    for (const url of ['/api/publish', '/api/settings', '/api/meta']) expect(JSON.stringify((await request(app).get(url)).body)).not.toContain('super-secret-token');
    expect(JSON.stringify(exportJson(ctx.db))).not.toContain('super-secret-token');
    const b = createBackup(ctx.db, ctx.paths, 'manual');
    expect(fs.readFileSync(path.join(ctx.paths.backupsDir, b.file)).includes('super-secret-token')).toBe(false);
    // Clearing the token
    const cleared = await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: '' });
    expect(cleared.body.tokenSaved).toBe(false);
  });
});

describe('publishing, as GitHub’s own rules ask (v0.9.23)', () => {
  const target = { owner: 'me', repo: 'handbook', branch: 'gh-pages', token: 't', message: 'Update player handbook' };

  it('sends text with the tree and only pictures one by one, so a first publish is a handful of requests, not one for each file', async () => {
    await withGitHub({ token: 't', pagesAllowed: true }, async (gh, apiBase) => {
      // About what a handbook is: seventy files of the app, its data, and a few pictures.
      const files = [...Array.from({ length: 70 }, (_, i) => textFile(`assets/chunk-${i}.js`, `export const n${i} = ${i}; // ${'x'.repeat(2000)}`)), textFile('index.html', '<!doctype html>'), textFile('data/player.json', JSON.stringify({ entries: 'é ü — “quoted”' })), { path: '.nojekyll', data: Buffer.alloc(0) }, picture('uploads/map-1.png', 1), picture('uploads/map-2.png', 2)];
      const slept: number[] = [];
      const first = await publishToGitHub({ ...target, files, apiBase, sleep: async (ms) => void slept.push(ms) });
      expect(first).toMatchObject({ changed: true, uploaded: files.length, unchanged: 0, pages: 'created' });
      // Three blobs (two pictures and the empty file), one tree for 75 files, a commit, the branch, and Pages.
      const sent = changing(gh.calls);
      expect(sent.filter((c) => c.endsWith('/git/blobs'))).toHaveLength(3);
      expect(sent.length).toBeLessThanOrEqual(8);
      expect(slept).toEqual([]);
      // Every file arrived byte for byte, text sent with the tree included.
      const site = gh.filesOn('gh-pages');
      expect(site.size).toBe(files.length);
      for (const f of files) expect(site.get(f.path)!.equals(f.data), f.path).toBe(true);

      // Published again unchanged: nothing is sent at all.
      gh.calls.length = 0;
      const again = await publishToGitHub({ ...target, files, apiBase });
      expect(again).toMatchObject({ changed: false, uploaded: 0, unchanged: files.length });
      expect(changing(gh.calls).filter((c) => !c.endsWith('/git/trees'))).toEqual([]);

      // One file changed and one no longer published: one commit on the last, and the dropped file is gone.
      const next = files.filter((f) => f.path !== 'assets/chunk-3.js').map((f) => (f.path === 'data/player.json' ? textFile(f.path, '{"entries":"new"}') : f));
      const third = await publishToGitHub({ ...target, files: next, apiBase });
      expect(third).toMatchObject({ changed: true, uploaded: 1 });
      expect(gh.filesOn('gh-pages').has('assets/chunk-3.js')).toBe(false);
      expect(gh.filesOn('gh-pages').get('data/player.json')!.toString()).toBe('{"entries":"new"}');
    });
  });

  it('keeps each request a modest size, and spaces out many pictures', async () => {
    await withGitHub({ token: 't', pagesAllowed: true }, async (gh, apiBase) => {
      // Big text files and a great many pictures (a world with a portrait for everyone).
      const files = [...Array.from({ length: 12 }, (_, i) => textFile(`assets/big-${i}.js`, String(i % 10).repeat(150_000))), textFile('assets/huge.js', 'y'.repeat(400_000)), ...Array.from({ length: 60 }, (_, i) => picture(`uploads/p-${i}.png`, i))];
      const slept: number[] = [];
      await publishToGitHub({ ...target, files, apiBase, sleep: async (ms) => void slept.push(ms) });
      const sent = changing(gh.calls);
      // The text went in several trees, each built on the last; the file too big to ride along went by itself.
      expect(sent.filter((c) => c.endsWith('/git/trees')).length).toBeGreaterThan(1);
      expect(sent.filter((c) => c.endsWith('/git/blobs'))).toHaveLength(61);
      // A pause of at least a second between each of that many uploads, as GitHub asks.
      expect(slept).toHaveLength(60);
      expect(Math.min(...slept)).toBeGreaterThanOrEqual(1000);
      const site = gh.filesOn('gh-pages');
      for (const f of files) expect(site.get(f.path)!.equals(f.data), f.path).toBe(true);
    });
  });

  it('starts a repository that has nothing in it yet, which GitHub won’t give a branch to otherwise', async () => {
    await withGitHub({ token: 't', pagesAllowed: true, empty: true }, async (gh, apiBase) => {
      const files = [textFile('index.html', '<!doctype html>'), picture('uploads/map.png', 7)];
      const res = await publishToGitHub({ ...target, files, apiBase, sleep: async () => undefined });
      expect(res).toMatchObject({ changed: true, uploaded: 2, pages: 'created' });
      // A README on the repository's own branch first; then the handbook on its branch, with only the handbook in it.
      expect(gh.calls).toContain('PUT /repos/me/handbook/contents/README.md');
      expect([...gh.filesOn('main').keys()]).toEqual(['README.md']);
      expect(gh.filesOn('main').get('README.md')!.toString()).toContain('gh-pages');
      expect([...gh.filesOn('gh-pages').keys()].sort()).toEqual(['index.html', 'uploads/map.png']);
      expect(gh.commits.get(gh.refs.get('gh-pages')!)!.parents).toEqual([]);
    });
  });

  it('waits as long as GitHub says when told to slow down, and then goes on', async () => {
    await withGitHub({ token: 't', pagesAllowed: true }, async (gh, apiBase) => {
      const soon = String(Math.ceil(Date.now() / 1000) + 30);
      gh.slowDown.push({ 'retry-after': '7' }, { status: '429', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': soon }, {});
      const slept: number[] = [];
      const res = await publishToGitHub({ ...target, files: [textFile('index.html', 'x'), picture('uploads/m.png', 1)], apiBase, sleep: async (ms) => void slept.push(ms) });
      expect(res.changed).toBe(true);
      // Seven seconds as asked; until the limit is given back (about thirty seconds); a minute when nothing says how long.
      expect(slept[0]).toBe(7000);
      expect(slept[1]).toBeGreaterThan(25_000);
      expect(slept[1]).toBeLessThan(35_000);
      expect(slept[2]).toBe(60_000);
      expect([...gh.filesOn('gh-pages').keys()].sort()).toEqual(['index.html', 'uploads/m.png']);
    });
  });

  it('does not wait for ever: it says how long to leave it', async () => {
    await withGitHub({ token: 't', pagesAllowed: true }, async (gh, apiBase) => {
      // Told to wait an hour: not something to sit through.
      gh.slowDown.push({ 'retry-after': '3600' });
      const slept: number[] = [];
      const long = await publishToGitHub({ ...target, files: [picture('a.png', 1)], apiBase, sleep: async (ms) => void slept.push(ms) }).catch((e: GitHubError) => e);
      expect(long).toBeInstanceOf(GitHubError);
      expect((long as GitHubError).message).toMatch(/slow down.*publish again in about 60 minutes/);
      expect(slept).toEqual([]);
      // Told again and again: four waits, then it stops.
      for (let i = 0; i < 9; i++) gh.slowDown.push({ 'retry-after': '2' });
      const many = await publishToGitHub({ ...target, files: [picture('b.png', 2)], apiBase, sleep: async (ms) => void slept.push(ms) }).catch((e: GitHubError) => e);
      expect((many as GitHubError).message).toMatch(/slow down/);
      expect(slept).toEqual([2000, 2000, 2000, 2000]);
    });
  });

  it('falls back to sending files one by one if text is not taken with the tree', async () => {
    await withGitHub({ token: 't', pagesAllowed: true, noInlineText: true }, async (gh, apiBase) => {
      const files = [textFile('index.html', '<!doctype html>'), textFile('assets/app.js', 'console.log(1)'), picture('uploads/m.png', 3)];
      await publishToGitHub({ ...target, files, apiBase, sleep: async () => undefined });
      const site = gh.filesOn('gh-pages');
      for (const f of files) expect(site.get(f.path)!.equals(f.data), f.path).toBe(true);
    });
  });

  it('says which permission the token lacks, in the words GitHub’s settings use', async () => {
    await withGitHub({ token: 't', pagesAllowed: false }, async (_gh, apiBase) => {
      const res = await publishToGitHub({ ...target, files: [textFile('index.html', 'x')], apiBase });
      // The files are there; only turning the site on was refused, and the note says what to do.
      expect(res).toMatchObject({ changed: true, pages: 'not-enabled' });
      expect(res.pagesNote).toMatch(/Pages: Read and write/);
      expect(res.pagesNote).toMatch(/Settings → Pages/);
    });
  });
});
