/**
 * Command-line import:  npm run import -- <archive.zip | folder> [--dry-run] [--take-source]
 * Shows the same preview as the UI, then commits in one transaction after an automatic backup.
 */
import { resolvePaths } from '../config.js';
import { AppContext } from '../context.js';
import { readSource } from '../import/scan.js';
import { buildPlan, commitPlan, summarisePlan } from '../import/importer.js';
import { createBackup } from '../backup/backup.js';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.error('Usage: npm run import -- <archive.zip | folder> [--dry-run] [--take-source]');
  process.exit(1);
}
const ctx = new AppContext(resolvePaths());
const files = readSource(src);
const plan = buildPlan(ctx.db, files, src.split('/').pop()!);
const s = summarisePlan(plan);
console.log(JSON.stringify({ files: s.fileCount, filesByKind: s.filesByKind, entities: s.entityCount, counts: s.counts,
  skipped: s.skipped.length, duplicates: s.duplicates.length, brokenRefs: s.brokenRefs, conflicts: s.conflicts, warnings: s.warnings,
  timelineRows: s.timelineRows, templates: s.templates }, null, 2));
if (args.includes('--dry-run')) process.exit(0);
const hasData = (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n > 0;
const backup = hasData ? createBackup(ctx.db, ctx.paths, 'pre-import') : null;
const resolutions = args.includes('--take-source') ? Object.fromEntries(s.conflicts.map((c) => [c.id, 'take-source' as const])) : {};
const result = commitPlan(ctx.db, files, plan, { resolutions, backupFile: backup?.file ?? null });
console.log('Committed:', result, backup ? `backup: ${backup.file}` : '');
