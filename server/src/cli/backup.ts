/**
 * Command-line backup:  npm run backup [-- reason]
 * Writes a versioned .wkbackup.zip (database snapshot + map images) to the data folder's backups/.
 */
import { resolvePaths } from '../config.js';
import { AppContext } from '../context.js';
import { createBackup } from '../backup/backup.js';

const ctx = new AppContext(resolvePaths());
const b = createBackup(ctx.db, ctx.paths, process.argv[2] ?? 'manual');
console.log(`Backup written: ${ctx.paths.backupsDir}/${b.file} (${(b.size / 1024 / 1024).toFixed(2)} MB)`);
ctx.db.close();
