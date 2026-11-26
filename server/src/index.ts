import http from 'node:http';
import path from 'node:path';
import type { Express } from 'express';
import { fileURLToPath } from 'node:url';
import { defaultRoot, resolvePaths, type Paths } from './config.js';
import { libraryEntry, markOpen } from './libraries.js';
import { recoveryApp } from './recovery.js';
import { APP_VERSION } from '../../shared/version.js';
import { AppContext } from './context.js';
import { createApp } from './app.js';
import { createBackup, listBackups } from './backup/backup.js';
import { closeTable, configureTable } from './table.js';
import { closeRemote, configureRemote } from './remote.js';

const mode = process.env.WORLDKEEPER_MODE === 'player' ? 'player' : 'dm';
const port = Number(process.env.PORT ?? (mode === 'player' ? 4320 : 4310));
// DM server is local-only by default. The player server may be exposed on the LAN deliberately.
const host = process.env.HOST ?? (mode === 'player' ? '0.0.0.0' : '127.0.0.1');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The desktop app passes the bundled client location; otherwise use the repository's build output.
const staticDir = process.env.WORLDKEEPER_STATIC_DIR || path.join(root, 'dist');
// The GM can open the table (players' handbook on the network) from the app; it starts closed.
configureTable({ staticDir });
// The GM app for another device (a tablet at the table): behind a password, and closed until the GM opens it.
configureRemote({ staticDir });

/**
 * Open the library and build the app. If the library can't be opened (an update that failed, a library from a newer
 * version, a damaged file), the GM's server still starts, and answers with a page that says what happened and what
 * to do (server/src/recovery.ts); from there the GM tries again or opens another library.
 */
let ctx: AppContext | null = null;
let app: Express;
let failure: { error: unknown; paths: Paths | null } | null = null;
function boot(libraryId?: string): boolean {
  let paths: Paths | null = null;
  try {
    if (libraryId) markOpen(defaultRoot(), libraryId);
    paths = resolvePaths();
    const opened = new AppContext(paths, mode);
    // The table server serves whichever library the GM has open (docs/LIBRARIES_PLAN.md §3.1).
    if (mode === 'player') opened.followOpenLibrary();
    ctx = opened;
    app = createApp(opened, { staticDir });
    failure = null;
    return true;
  } catch (error) {
    console.error('[worldkeeper] the library could not be opened:', error);
    // The table server has nothing to say to players without a library: it stops, as before.
    if (mode === 'player') throw error;
    failure = { error, paths };
    return false;
  }
}
if (!boot())
  app = recoveryApp(
    () => ({
      error: failure?.error,
      rootDir: failure?.paths?.rootDir ?? defaultRoot(),
      library: failure?.paths ? { id: failure.paths.libraryId, name: libraryEntry(failure.paths.rootDir, failure.paths.libraryId).name, dir: failure.paths.dataDir, backupsDir: failure.paths.backupsDir } : null,
      version: APP_VERSION,
    }),
    boot,
  );

function dailyBackup() {
  if (!ctx || mode !== 'dm') return;
  try {
    const n = (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n;
    if (!n) return;
    const last = listBackups(ctx.paths).find((b) => b.file.includes('-daily'));
    if (!last || Date.now() - new Date(last.created_at).getTime() > 24 * 3600 * 1000) {
      const b = createBackup(ctx.db, ctx.paths, 'daily');
      console.log(`[worldkeeper] automatic backup ${b.file}`);
    }
  } catch (e) {
    console.error('[worldkeeper] automatic backup failed', e);
  }
}
dailyBackup();
setInterval(dailyBackup, 3600 * 1000).unref();

// Whichever app is current answers: the real one, or the recovery page until a library opens.
http
  .createServer((req, res) => app(req, res))
  .listen(port, host, () => {
    console.log(
      ctx
        ? `[worldkeeper] ${mode.toUpperCase()} server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (data: ${ctx.paths.rootDir}, library: ${ctx.paths.libraryId})`
        : `[worldkeeper] started WITHOUT a library on http://${host}:${port}: open it to see what happened`,
    );
  });
function shutdown() {
  void closeTable();
  void closeRemote();
  try {
    ctx?.db.close();
  } finally {
    process.exit(0);
  }
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);

// Desktop sidecar: exit if the app that started us is gone (e.g. it was killed and could not stop us).
const parentPid = Number(process.env.WORLDKEEPER_PARENT_PID);
if (Number.isInteger(parentPid) && parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      console.log('[worldkeeper] desktop app has exited; shutting down');
      shutdown();
    }
  }, 1500).unref();
}
