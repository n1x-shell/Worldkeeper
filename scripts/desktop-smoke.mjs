/**
 * Does the built desktop app actually work? (v0.9.20, docs/BETA_PLAN.md A4.) Until now nothing ran an installer's app
 * before it was published: a release went out whose Linux app never showed a page, and nobody knew until it was tried
 * by hand. This starts the real app on an empty data folder and checks, from outside, that:
 *
 *   1. its own server starts (the bundled Node.js, the database's native code, the bundled files);
 *   2. its window loads the app (the page's own script asks the server for what it needs: the server logs that);
 *   3. the page, its scripts and the API answer, and a record can be written and read back;
 *   4. what ships inside it is there: the books' open rules and the Oros worldbook;
 *   5. nothing was logged as an error, and when the app is closed its server goes with it.
 *
 *   node scripts/desktop-smoke.mjs <the app's program> [arguments for it...]
 *   node scripts/desktop-smoke.mjs --find        (the program a build on this system made or installed)
 *
 * On Linux it needs a display (xvfb-run -a node scripts/desktop-smoke.mjs ...). It exits 0 when everything held.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const step = (m) => console.log('✓', m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where a build on this system leaves (or installs) the app's program. The first that exists. */
export function candidates(platform = process.platform, env = process.env) {
  const bundle = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
  const list = (dir, test) => {
    try {
      return fs
        .readdirSync(dir)
        .filter(test)
        .map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  };
  if (platform === 'darwin') {
    // Inside the .app: the program beside the bundled Node.js (which is not the app).
    return list(path.join(bundle, 'macos'), (f) => f.endsWith('.app')).flatMap((app) => list(path.join(app, 'Contents', 'MacOS'), (f) => !/node/i.test(f)));
  }
  if (platform === 'win32') {
    const isApp = (f) => /\.exe$/i.test(f) && !/node|uninstall/i.test(f);
    return [
      // Where the installer puts it (for this user, or for everyone), then the build's own copy.
      ...list(path.join(env.LOCALAPPDATA ?? '', 'The Worldkeeper'), isApp),
      ...list(path.join(env.ProgramFiles ?? '', 'The Worldkeeper'), isApp),
      ...list(path.join(root, 'src-tauri', 'target', 'release'), (f) => /^(worldkeeper|the worldkeeper)\.exe$/i.test(f)),
    ];
  }
  return ['/usr/bin/worldkeeper', ...list(path.join(bundle, 'appimage'), (f) => f.endsWith('.AppImage'))].filter((f) => fs.existsSync(f));
}

/** The port the app's server says it is on, from the log it keeps (the app picks a free one each time). */
export function portFromLog(text) {
  const m = /DM server on http:\/\/127\.0\.0\.1:(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.setTimeout(1500, () => (s.destroy(), resolve(false)));
  });

async function main() {
  let [program, ...args] = process.argv.slice(2);
  if (!program || program === '--find') {
    const found = candidates();
    if (!found.length) throw new Error('No built app found on this system. Build it first (npm run desktop:build), or give the path to its program.');
    program = found[0];
  }
  if (!fs.existsSync(program)) throw new Error(`No such program: ${program}`);
  console.log(`The app: ${program}${args.length ? ` ${args.join(' ')}` : ''}`);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-desktop-smoke-'));
  const log = path.join(dataDir, 'logs', 'worldkeeper.log');
  const serverLog = path.join(dataDir, 'logs', 'server.log');
  const readLog = (f = log) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  };
  const app = spawn(program, args, {
    // An AppImage runs without FUSE (a build machine has none); the app asks nobody for updates while it is tested.
    env: { ...process.env, WORLDKEEPER_DATA_DIR: dataDir, WORLDKEEPER_NO_UPDATE_CHECK: '1', APPIMAGE_EXTRACT_AND_RUN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own group, so that everything it started can be stopped with it.
    detached: process.platform !== 'win32',
  });
  let output = '';
  app.stdout.on('data', (d) => (output += d));
  app.stderr.on('data', (d) => (output += d));
  let exited = null;
  app.on('exit', (code, signal) => (exited = { code, signal }));
  const stop = () => {
    if (exited) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        // The whole group it started (a negative number means the group).
        process.kill(-Number(app.pid), 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  };

  let port = null;
  try {
    // 1. The server.
    const until = Date.now() + 120_000;
    while (!(port = portFromLog(readLog()))) {
      if (exited) throw new Error(`The app stopped before its server started (${JSON.stringify(exited)})`);
      if (Date.now() > until) throw new Error('The app’s server did not start within two minutes');
      await wait(500);
    }
    const base = `http://127.0.0.1:${port}`;
    const get = (url) => fetch(`${base}${url}`);
    const json = async (url, init) => {
      const r = await fetch(`${base}${url}`, init);
      if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${url} answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    };
    const post = (url, body) => json(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const health = await json('/api/health');
    if (health.ok !== true || health.mode !== 'dm') throw new Error(`Unexpected health: ${JSON.stringify(health)}`);
    step(`the app's server started on port ${port}`);

    // 2. The window: the page's own script asks for /api/meta when it starts, and the server notes the first time.
    // (Nothing here has asked for it yet.)
    const windowUntil = Date.now() + 90_000;
    while (!readLog().includes('the app’s page has loaded')) {
      if (exited) throw new Error(`The app stopped before its window loaded (${JSON.stringify(exited)})`);
      if (Date.now() > windowUntil) throw new Error('The app’s window did not load the app within 90 seconds (its server runs, but the page never asked it for anything)');
      await wait(500);
    }
    step('the window loaded the app');

    // 3. The page, a script of it, and the API.
    const page = await get('/');
    const html = await page.text();
    if (page.status !== 200 || !html.includes('<div id="root">')) throw new Error(`The front page answered ${page.status}: ${html.slice(0, 200)}`);
    const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    if (!script) throw new Error('The front page names no script');
    const js = await get(script);
    if (js.status !== 200 || !/javascript/.test(js.headers.get('content-type') ?? '')) throw new Error(`${script} answered ${js.status} as ${js.headers.get('content-type')}`);
    const deep = await get('/campaigns');
    if (deep.status !== 200 || !(await deep.text()).includes('<div id="root">')) throw new Error(`A page inside the app (/campaigns) answered ${deep.status}`);
    const meta = await json('/api/meta');
    if (meta.version !== version) throw new Error(`The app says it is version ${meta.version}; this is ${version}`);
    if (meta.desktop !== true) throw new Error('The server does not know it runs inside the desktop app');
    if (path.resolve(meta.dataDir) !== fs.realpathSync(dataDir) && path.resolve(meta.dataDir) !== path.resolve(dataDir)) throw new Error(`The app keeps its data in ${meta.dataDir}, not where it was told (${dataDir})`);
    step(`pages, scripts and the API answer (version ${meta.version})`);

    const made = await post('/api/entities', { type: 'npc', realm: 'world', name: 'Smoke Test' });
    const back = await json(`/api/entities/${encodeURIComponent(made.id)}`);
    if ((back.entity ?? back).name !== 'Smoke Test') throw new Error(`A record written was not read back: ${JSON.stringify(back).slice(0, 200)}`);
    const backup = await post('/api/backups', { reason: 'smoke' });
    if (!backup.file || !fs.existsSync(path.join(meta.library.dir, 'backups', backup.file))) throw new Error(`A backup was not made: ${JSON.stringify(backup)}`);
    step('a record is written and read back, and a backup is made');

    // 4. What ships inside it.
    const packs = await json('/api/setting-packs');
    const oros = (Array.isArray(packs) ? packs : (packs.packs ?? [])).find((p) => p.id === 'worldkeeper');
    if (!oros) throw new Error(`The Oros worldbook is not in the app: ${JSON.stringify(packs).slice(0, 300)}`);
    const rules = await json('/api/rules/packs');
    const rulePacks = Array.isArray(rules) ? rules : (rules.packs ?? []);
    if (!rulePacks.length) throw new Error('The app has no rules at all (the open rules should ship with it)');
    // Adding the worldbook reads everything it is made of out of the app's own files.
    await post('/api/setting-packs/worldkeeper/install', {});
    const after = await json('/api/meta');
    if (!(after.entities > 100)) throw new Error(`Adding the Oros worldbook brought only ${after.entities} records`);
    step(`what ships with it is there: ${rulePacks.length} rules pack${rulePacks.length === 1 ? '' : 's'}, and the Oros worldbook, which adds ${after.entities - 1} records`);

    // 5. Nothing went wrong on the way.
    const errors = readLog()
      .split('\n')
      .filter((l) => / ERROR /.test(l));
    if (errors.length) throw new Error(`The app logged ${errors.length} error(s):\n${errors.join('\n')}`);
    step('nothing was logged as an error');
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    console.error('\n--- what the app printed ---\n' + (output.trim() || '(nothing)'));
    console.error('\n--- logs/worldkeeper.log ---\n' + (readLog().trim() || '(empty)'));
    console.error('\n--- logs/server.log ---\n' + (readLog(serverLog).trim() || '(empty)'));
    stop();
    process.exitCode = 1;
    return;
  }

  // Closing the app takes its server with it (a server left behind would keep the library open).
  stop();
  const gone = Date.now() + 20_000;
  while (await portOpen(port)) {
    if (Date.now() > gone) {
      console.error('✗ The app was closed but its server still answers after 20 seconds');
      process.exitCode = 1;
      return;
    }
    await wait(500);
  }
  step('closing the app stops its server');
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* left for the system's own clean-up */
  }
  console.log('Desktop smoke test passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
