/** Is there a newer version? (v0.9.17, docs/BETA_PLAN.md A2.) Never the real network here: GitHub's answer is given. */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext, tempDir } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { RELEASES_API, checkForUpdate, installStatus, isNewer, parseVersion, setUpdateCheck, updateStatus } from '../server/src/updateCheck.js';
import { APP_VERSION } from '../shared/version.js';

type Call = { url: string; headers: Record<string, string> };
/** GitHub's list of releases, as it answers: newest first by date, every one of this project's marked pre-release. */
const github = (releases: Record<string, unknown>[], calls: Call[] = [], status = 200) =>
  ((url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(releases) });
  }) as Parameters<typeof checkForUpdate>[1] extends infer O ? (O extends { fetch?: infer F } ? NonNullable<F> : never) : never;
const release = (tag: string, o: Record<string, unknown> = {}) => ({ tag_name: tag, name: tag, html_url: `https://github.com/n1x-shell/Worldkeeper/releases/tag/${tag}`, published_at: '2026-11-24T22:13:22Z', prerelease: true, draft: false, ...o });
const [maj, min, pat] = APP_VERSION.split('.').map(Number);
const NEXT = `${maj}.${min}.${pat + 1}`;

describe('comparing versions', () => {
  it('reads them as numbers, with or without a v', () => {
    expect(parseVersion('v0.10.2')).toEqual({ parts: [0, 10, 2], pre: '' });
    expect(parseVersion('1.0.0-beta.2')).toEqual({ parts: [1, 0, 0], pre: 'beta.2' });
    expect(parseVersion('latest')).toBeNull();
    expect(isNewer('0.10.0', '0.9.17')).toBe(true);
    expect(isNewer('v0.9.17', '0.9.17')).toBe(false);
    expect(isNewer('0.9.9', '0.9.17')).toBe(false);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    // A beta comes before the release it is a beta of, and after the one before.
    expect(isNewer('1.0.0', '1.0.0-beta.3')).toBe(true);
    expect(isNewer('1.0.0-beta.3', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0-beta.10', '1.0.0-beta.9')).toBe(true);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
  });
});

describe('asking whether a newer version exists', () => {
  it('finds the highest published version, though GitHub marks them all pre-release', async () => {
    const { paths } = tempContext();
    const calls: Call[] = [];
    // Newest by date is not the highest version, and a draft is not public.
    const st = await checkForUpdate(paths, { fetch: github([release('v0.9.2'), release(`v${NEXT}`), release('v99.0.0', { draft: true }), release('nightly')], calls) });
    expect(st).toMatchObject({ enabled: true, current: APP_VERSION, newer: true, error: null, latest: { version: NEXT, url: `https://github.com/n1x-shell/Worldkeeper/releases/tag/v${NEXT}` } });
    // One request, to the list of releases, saying only what app this is.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RELEASES_API);
    expect(calls[0].url).not.toContain('/latest');
    expect(calls[0].headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': `The-Worldkeeper/${APP_VERSION}` });
    // Kept for the installation, outside any library.
    expect(JSON.parse(fs.readFileSync(path.join(paths.sharedDir, 'update.json'), 'utf8')).latest.version).toBe(NEXT);
  });

  it('asks once a day, not at all when switched off, and at once when told to', async () => {
    const { paths } = tempContext();
    const calls: Call[] = [];
    const ask = github([release('v0.9.2')], calls);
    const t0 = Date.parse('2026-12-01T10:00:00Z');
    expect((await checkForUpdate(paths, { fetch: ask, now: t0 })).newer).toBe(false);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 3 * 3600_000 });
    expect(calls).toHaveLength(1);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 25 * 3600_000 });
    expect(calls).toHaveLength(2);
    expect(setUpdateCheck(paths, false).enabled).toBe(false);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 80 * 3600_000 });
    expect(calls).toHaveLength(2);
    // "Check now" asks even when the daily check is off.
    await checkForUpdate(paths, { fetch: ask, now: t0 + 81 * 3600_000, force: true });
    expect(calls).toHaveLength(3);
    expect(updateStatus(paths).enabled).toBe(false);
  });

  it('learns nothing when offline or refused, and keeps what it knew', async () => {
    const { paths } = tempContext();
    await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`)]) });
    const offline = (() => Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { name: 'Error' }))) as ReturnType<typeof github>;
    const st = await checkForUpdate(paths, { fetch: offline, force: true });
    expect(st.error).toMatch(/ENOTFOUND/);
    expect(st).toMatchObject({ newer: true, latest: { version: NEXT } });
    expect((await checkForUpdate(paths, { fetch: github([], [], 403), force: true })).error).toBe('GitHub answered 403');
    expect((await checkForUpdate(paths, { fetch: github([]), force: true })).error).toBe('No release has been published yet');
    expect((await checkForUpdate(paths, { fetch: github({ message: 'Not Found' } as never), force: true })).error).toMatch(/list of releases/);
  });

  it('never points anywhere but this project’s releases', async () => {
    const { paths } = tempContext();
    const st = await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`, { html_url: 'https://evil.example/download', name: 'x'.repeat(5000) })]) });
    expect(st.latest!.url).toBe('https://github.com/n1x-shell/Worldkeeper/releases');
    expect(st.latest!.name).toHaveLength(200);
  });

  it('is shown and switched in the app, without the app itself asking', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    // Opening the app's pages asks GitHub nothing: only the scheduled check and "Check now" do.
    expect((await request(gm).get('/api/update')).body).toMatchObject({ enabled: true, current: APP_VERSION, latest: null, newer: false, checked_at: null });
    expect((await request(gm).put('/api/update').send({ enabled: false })).body.enabled).toBe(false);
    expect((await request(gm).get('/api/update')).body.enabled).toBe(false);
    expect((await request(gm).put('/api/update').send({ enabled: true })).body.enabled).toBe(true);
  });
});

describe('“Update and restart” in the desktop app (v0.9.18)', () => {
  it('is offered only for a release that carries the update, in an app whose shell can do it', async () => {
    const { paths } = tempContext();
    const withUpdate = release(`v${NEXT}`, { assets: [{ name: `The.Worldkeeper_${NEXT}_x64-setup.exe` }, { name: 'latest.json' }] });
    expect((await checkForUpdate(paths, { fetch: github([withUpdate]) })).latest).toMatchObject({ version: NEXT, installable: true });
    expect((await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`, { assets: [{ name: 'x.exe' }] })]), force: true })).latest!.installable).toBe(false);
    expect((await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`)]), force: true })).latest!.installable).toBe(false);
    // Run from source (or a Linux package): the shell didn't say it can update itself.
    expect(updateStatus(paths).canInstall).toBe(false);
    process.env.WORLDKEEPER_SHELL_UPDATER = '1';
    try {
      expect(updateStatus(paths).canInstall).toBe(true);
    } finally {
      delete process.env.WORLDKEEPER_SHELL_UPDATER;
    }
  });

  it('says what the shell is doing, forgets an update that finished, and reports one that didn’t', async () => {
    const ctx = tempContext();
    const { paths } = ctx;
    const gm = createApp(ctx);
    const file = path.join(paths.rootDir, 'update-status.json');
    const write = (o: Record<string, unknown>) => fs.writeFileSync(file, JSON.stringify(o));
    expect(installStatus(paths)).toBeNull();
    write({ state: 'downloading', tag: `v${NEXT}`, error: null });
    expect((await request(gm).get('/api/update')).body.install).toEqual({ state: 'downloading', tag: `v${NEXT}`, error: null });
    // The app has restarted as the version it was updating to: done, and nothing left to show.
    write({ state: 'installing', tag: `v${APP_VERSION}`, error: null });
    expect(installStatus(paths)).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
    // Left half-way for more than half an hour: not "installing" for ever.
    write({ state: 'installing', tag: `v${NEXT}`, error: null });
    expect(installStatus(paths, Date.now() + 31 * 60_000)).toMatchObject({ state: 'failed', error: expect.stringContaining('didn’t finish') });
    // The shell's own failure, and dismissing it.
    write({ state: 'failed', tag: `v${NEXT}`, error: 'The download failed or its signature didn’t match: x' });
    expect((await request(gm).get('/api/update')).body.install).toMatchObject({ state: 'failed', error: expect.stringContaining('signature') });
    expect((await request(gm).post('/api/update/dismiss')).body.install).toBeNull();
    // Anything else in that file is nothing.
    write({ state: 'rm -rf', tag: 5 });
    expect(installStatus(paths)).toBeNull();
    fs.writeFileSync(file, 'not json');
    expect(installStatus(paths)).toBeNull();
  });

  it('a release’s update manifest names each system’s file as GitHub stores it, with its signature', () => {
    const dir = tempDir();
    const put = (f: string, text: string) => (fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }), fs.writeFileSync(path.join(dir, f), text));
    for (const f of ['appimage/The Worldkeeper_1.2.3_amd64.AppImage', 'nsis/The Worldkeeper_1.2.3_x64-setup.exe', 'macos/The Worldkeeper.app.tar.gz', 'msi/The Worldkeeper_1.2.3_x64_en-US.msi']) {
      put(f, 'bytes');
      put(`${f}.sig`, `signature of ${path.basename(f)}\n`);
    }
    put('deb/The Worldkeeper_1.2.3_amd64.deb', 'bytes');
    const script = path.resolve(__dirname, '../scripts/updater-manifest.mjs');
    const m = JSON.parse(execFileSync(process.execPath, [script, dir, 'v1.2.3'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    expect(m.version).toBe('1.2.3');
    expect(m.platforms).toEqual({
      'linux-x86_64': { signature: 'signature of The Worldkeeper_1.2.3_amd64.AppImage', url: 'https://github.com/n1x-shell/Worldkeeper/releases/download/v1.2.3/The.Worldkeeper_1.2.3_amd64.AppImage' },
      'windows-x86_64': { signature: 'signature of The Worldkeeper_1.2.3_x64-setup.exe', url: 'https://github.com/n1x-shell/Worldkeeper/releases/download/v1.2.3/The.Worldkeeper_1.2.3_x64-setup.exe' },
      'darwin-aarch64': { signature: 'signature of The Worldkeeper.app.tar.gz', url: 'https://github.com/n1x-shell/Worldkeeper/releases/download/v1.2.3/The.Worldkeeper.app.tar.gz' },
    });
    // A build made without the update key has no signatures: no manifest, and the release goes out as before.
    const plain = tempDir();
    fs.writeFileSync(path.join(plain, 'The Worldkeeper_1.2.3_amd64.deb'), 'bytes');
    const run = spawnSync(process.execPath, [script, plain, 'v1.2.3'], { encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    // Only a real version tag goes into an address.
    expect(spawnSync(process.execPath, [script, dir, 'v1;rm -rf'], { encoding: 'utf8' }).status).toBe(1);
  });

  it('the public half of the update key is in the app, and no private key is in the repository', () => {
    const root = path.resolve(__dirname, '..');
    const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
    const pub = Buffer.from(conf.plugins.updater.pubkey, 'base64').toString('utf8');
    expect(pub).toMatch(/^untrusted comment: minisign public key: [0-9A-F]+\n\S+\n$/);
    // Signing happens only with the key the release workflow is given: a plain build makes no update files.
    expect(conf.bundle.createUpdaterArtifacts).toBeUndefined();
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
    expect(tracked.filter((f) => /\.key$|secret key/i.test(f))).toEqual([]);
    // A private key file begins with this line, in plain text or (as the tool writes it) in base64.
    const header = ['untrusted comment: rsign', 'encrypted secret key'].join(' ');
    const marks = [header, Buffer.from(header).toString('base64').slice(0, 56)];
    for (const f of tracked.filter((x) => /\.(json|ya?ml|md|ts|rs|toml|mjs|txt|pub)$/.test(x) && !x.startsWith('packs/worldkeeper/archive'))) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      expect(marks.some((m) => text.includes(m)), f).toBe(false);
    }
  });
});
