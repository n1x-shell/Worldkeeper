import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from './config.js';
import { AppContext } from './context.js';
import { createApp } from './app.js';
import { createBackup, listBackups } from './backup/backup.js';

const mode = process.env.WORLDKEEPER_MODE === 'player' ? 'player' : 'dm';
const port = Number(process.env.PORT ?? (mode === 'player' ? 4320 : 4310));
// DM server is local-only by default. The player server may be exposed on the LAN deliberately.
const host = process.env.HOST ?? (mode === 'player' ? '0.0.0.0' : '127.0.0.1');

const ctx = new AppContext(resolvePaths(), mode);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = createApp(ctx, { staticDir: path.join(root, 'dist') });

function dailyBackup() {
  try {
    const n = (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n;
    if (!n || mode !== 'dm') return;
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

app.listen(port, host, () => {
  console.log(`[worldkeeper] ${mode.toUpperCase()} server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (data: ${ctx.paths.dataDir})`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    ctx.db.close();
    process.exit(0);
  });
}
