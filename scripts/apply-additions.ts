/**
 * Bring the Worldkeeper additions (new lore records and curated links in assets/lore/) into your own library.
 * Archive records are never changed or removed, and the links can be edited in the app like any others.
 * Back up first (Library → Backups), or let the app's daily backup cover you.
 *
 *   npx tsx scripts/apply-additions.ts [data dir]     (default: ./data, or WORLDKEEPER_DATA_DIR)
 */
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import { applyAdditions } from '../server/src/additions.js';

const ctx = new AppContext(resolvePaths(process.argv[2]));
const r = applyAdditions(ctx.db);
console.log(`Additions applied: ${r.records} records (${r.imported?.created ?? 0} new, ${r.imported?.updated ?? 0} updated), ${r.links.added} links, ${r.rumours.total} rumours (${r.rumours.added} new), ${r.mysteries.mysteries} mysteries with ${r.mysteries.secrets} secrets and ${r.mysteries.clues} clues, ${r.timeline} timeline rows.`);
if (r.links.skipped.length) console.log(`Skipped ${r.links.skipped.length} links whose records are not in this library: ${r.links.skipped.join('; ')}`);
