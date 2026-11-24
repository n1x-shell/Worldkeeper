/**
 * Prepare everything the desktop (Tauri) app ships:
 *
 *   desktop/build/server/index.mjs        the API server bundled into one file (esbuild)
 *   desktop/build/server/node_modules/    the native SQLite driver (better-sqlite3, with this platform's build only)
 *   desktop/build/client/                 the built web client
 *   desktop/build/player-site/            the static Player Handbook (published by "Publish for Players")
 *   src-tauri/binaries/node-<triple>      the Node.js runtime, shipped as a Tauri sidecar
 *
 * The Node binary is the one running this script. It must be an LTS release (the app ships it to GMs for years):
 * the build stops on a Current or odd-numbered release unless WORLDKEEPER_ALLOW_NON_LTS=1 (for trying one out).
 * better-sqlite3 uses Node-API, so its build works with any Node.js it supports.
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

// 0. Only an LTS Node.js goes into the app.
if (!process.release.lts && process.env.WORLDKEEPER_ALLOW_NON_LTS !== '1') {
  console.error(
    `[desktop] Node.js ${process.version} is not an LTS release. Build the desktop app with the Active LTS Node.js (see .nvmrc and https://nodejs.org/en/about/previous-releases), or set WORLDKEEPER_ALLOW_NON_LTS=1 to try this one anyway.`,
  );
  process.exit(1);
}
log(`Node.js ${process.version} (LTS ${process.release.lts ?? 'no'})`);

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
// Also the data the server reads at run time: stat blocks, the Return's omens, encounter terrains, the setting pack.
// The core record templates.
fs.cpSync(path.join(root, 'assets', 'templates'), path.join(out, 'additions', 'templates'), { recursive: true });
// The bundled setting packs (the Worldkeeper setting), each with its manifest, content and data.
fs.rmSync(path.join(out, 'packs'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'packs'), path.join(out, 'packs'), { recursive: true, filter: (src) => !src.split(path.sep).includes('drafts') });

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

// 3. Native SQLite driver: better-sqlite3 13+ needs no runtime dependencies, and ships prebuilt Node-API builds for
// every platform in prebuilds/; only this platform's goes into the app (or a local build, if npm compiled one).
const sqliteSrc = path.join(root, 'node_modules', 'better-sqlite3');
const sqliteOut = path.join(out, 'server', 'node_modules', 'better-sqlite3');
const musl = process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
const target = `${musl ? 'linuxmusl' : process.platform}-${process.arch}.node`;
fs.cpSync(sqliteSrc, sqliteOut, {
  recursive: true,
  filter: (p) => {
    const rel = path.relative(sqliteSrc, p).split(path.sep);
    if (['src', 'deps', 'docs', 'benchmark', 'test'].includes(rel[0])) return false;
    if (rel[0] === 'prebuilds' && rel[1] && rel[1] !== target) return false;
    if (rel[0] === 'build' && rel.length > 1 && rel[1] !== 'Release') return false;
    return !p.endsWith('.o') && !rel.some((r) => r === 'obj' || r === 'obj.target');
  },
});
const nativeOk = fs.existsSync(path.join(sqliteOut, 'prebuilds', target)) || fs.existsSync(path.join(sqliteOut, 'build', 'Release', 'better_sqlite3.node'));
if (!nativeOk) throw new Error(`No better-sqlite3 build for ${target}; run npm install first`);

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
// On Linux, the official Node.js binary carries debug symbols the app never uses: strip them (about 30 MB). The dynamic
// symbols native modules link against are kept, and the smoke check below runs this very binary. Not on macOS, where
// stripping would break the binary's signature, nor Windows (its symbols are in separate files).
if (process.platform === 'linux' && process.env.WORLDKEEPER_NO_STRIP !== '1') {
  const before = fs.statSync(sidecar).size;
  try {
    execFileSync('strip', [sidecar]);
    log(`stripped debug symbols: ${(before / 1048576).toFixed(1)} MB → ${(fs.statSync(sidecar).size / 1048576).toFixed(1)} MB`);
  } catch {
    log('strip is not installed: the runtime keeps its debug symbols');
  }
}

// 5. Smoke check: the bundle must start with plain Node (no tsx, no repository node_modules)
log('checking that the bundled server starts');
const tmpData = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'wk-desktop-check-'));
const { spawn } = await import('node:child_process');
const port = 43000 + Math.floor(Math.random() * 1000);
const child = spawn(sidecar, [path.join(out, 'server/index.mjs')], {
  cwd: out,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', WORLDKEEPER_DATA_DIR: tmpData, WORLDKEEPER_STATIC_DIR: path.join(out, 'client'), WORLDKEEPER_PLAYER_SITE_DIR: path.join(out, 'player-site'), WORLDKEEPER_ADDITIONS_DIR: path.join(out, 'additions'), WORLDKEEPER_PACKS_DIR: path.join(out, 'packs'), NODE_PATH: '' },
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
// Stop the server and wait until it has exited: on Windows its open files (the library's database) keep the folder
// locked until then.
await new Promise((r) => {
  if (child.exitCode !== null || child.signalCode !== null) return r();
  child.once('exit', r);
  child.kill();
  setTimeout(r, 10000);
});
// The check's data folder is temporary: a lock Windows hasn't released yet is retried, and never fails the build.
try {
  fs.rmSync(tmpData, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch (e) {
  log(`could not remove the check's temporary folder (${e.code}): ${tmpData}`);
}
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
