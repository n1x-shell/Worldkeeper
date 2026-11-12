/**
 * Prepare everything the desktop (Tauri) app ships:
 *
 *   desktop/build/server/index.mjs        the API server bundled into one file (esbuild)
 *   desktop/build/server/node_modules/    the native SQLite driver (better-sqlite3 + its runtime deps)
 *   desktop/build/client/                 the built web client
 *   desktop/build/player-site/            the static Player Handbook (published by "Publish for Players")
 *   src-tauri/binaries/node-<triple>      the Node.js runtime, shipped as a Tauri sidecar
 *
 * The Node binary is the one running this script, so the native module ABI always matches.
 * Run on each target OS (Tauri does not cross-compile the WebView shell):  npm run desktop:prepare
 */
import { build } from 'esbuild';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'desktop', 'build');
const log = (m) => console.log(`[desktop] ${m}`);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'server'), { recursive: true });

// 1. Client
if (!process.argv.includes('--skip-client')) {
  log('building client');
  execSync('npx vite build', { cwd: root, stdio: 'inherit' });
  execSync('npx vite build --config vite.player.config.ts', { cwd: root, stdio: 'inherit' });
}
fs.cpSync(path.join(root, 'dist'), path.join(out, 'client'), { recursive: true });
// The static Player Handbook that "Publish for Players" uploads.
fs.cpSync(path.join(root, 'dist-player'), path.join(out, 'player-site'), { recursive: true });
// The Worldkeeper additions (new lore records, links, rumour text, mysteries) for Library > Worldkeeper additions.
fs.rmSync(path.join(out, 'additions'), { recursive: true, force: true });
for (const dir of ['lore', 'player-text'])
  fs.cpSync(path.join(root, 'assets', dir), path.join(out, 'additions', dir), { recursive: true, filter: (src) => !src.split(path.sep).includes('drafts') });

// 2. Server bundle (everything except the native driver)
log('bundling server');
await build({
  entryPoints: [path.join(root, 'server/src/index.ts')],
  outfile: path.join(out, 'server/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['better-sqlite3'],
  // CommonJS dependencies inside an ESM bundle need a real `require`.
  banner: { js: "import { createRequire as __wkCreateRequire } from 'node:module'; const require = __wkCreateRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

// 3. Native SQLite driver with its runtime dependencies only
const copyPkg = (name, filter) => {
  const src = path.join(root, 'node_modules', name);
  const dst = path.join(out, 'server', 'node_modules', name);
  fs.cpSync(src, dst, { recursive: true, filter: filter ?? (() => true) });
};
copyPkg('better-sqlite3', (p) => !/[\\/](src|deps|docs|benchmark)([\\/]|$)/.test(path.relative(path.join(root, 'node_modules', 'better-sqlite3'), p)) && !p.endsWith('.o') && !/[\\/]obj(\.target)?([\\/]|$)/.test(p));
copyPkg('bindings');
copyPkg('file-uri-to-path');
const nativeOk = fs.existsSync(path.join(out, 'server/node_modules/better-sqlite3/build/Release/better_sqlite3.node'));
if (!nativeOk) throw new Error('better_sqlite3.node is missing; run npm install first');

// 4. Node runtime as the Tauri sidecar (named with the Rust target triple, as Tauri requires)
const triple =
  process.env.TAURI_TARGET_TRIPLE ||
  execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    .split('\n')
    .find((l) => l.startsWith('host:'))
    .slice(6)
    .trim();
const binDir = path.join(root, 'src-tauri', 'binaries');
fs.mkdirSync(binDir, { recursive: true });
const ext = process.platform === 'win32' ? '.exe' : '';
// A distinctive name: Linux packages install sidecars into /usr/bin, where `node` would clash with a system Node.js.
const sidecar = path.join(binDir, `worldkeeper-node-${triple}${ext}`);
fs.copyFileSync(process.execPath, sidecar);
fs.chmodSync(sidecar, 0o755);
log(`node ${process.version} → ${path.relative(root, sidecar)}`);

// 5. Smoke check: the bundle must start with plain Node (no tsx, no repository node_modules)
log('checking that the bundled server starts');
const tmpData = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'wk-desktop-check-'));
const { spawn } = await import('node:child_process');
const port = 43000 + Math.floor(Math.random() * 1000);
const child = spawn(sidecar, [path.join(out, 'server/index.mjs')], {
  cwd: out,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', WORLDKEEPER_DATA_DIR: tmpData, WORLDKEEPER_STATIC_DIR: path.join(out, 'client'), WORLDKEEPER_PLAYER_SITE_DIR: path.join(out, 'player-site'), WORLDKEEPER_ADDITIONS_DIR: path.join(out, 'additions'), NODE_PATH: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (d) => (stderr += d));
let ok = false;
for (let i = 0; i < 60 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const h = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    const pub = await (await fetch(`http://127.0.0.1:${port}/api/publish`)).json();
    ok = h.ok === true && page.includes('<div id="root">') && pub.available === true;
  } catch {
    /* not up yet */
  }
}
child.kill();
fs.rmSync(tmpData, { recursive: true, force: true });
if (!ok) throw new Error(`bundled server did not start:\n${stderr}`);
const size = (p) => {
  let n = 0;
  for (const f of fs.readdirSync(p, { recursive: true })) {
    const full = path.join(p, f);
    if (fs.statSync(full).isFile()) n += fs.statSync(full).size;
  }
  return n;
};
log(`ready: resources ${(size(out) / 1048576).toFixed(1)} MB + node runtime ${(fs.statSync(sidecar).size / 1048576).toFixed(1)} MB`);
