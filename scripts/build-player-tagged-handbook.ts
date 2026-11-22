/**
 * Build the Player Handbook from the archive's player-tagged records (Tags: vis/player), as first published to
 * the gh-pages branch. Imports the archive into a fresh data folder, reveals only safe sections, and writes the
 * static site to an output folder (push that folder to gh-pages, or publish from the app instead).
 *
 *   npx tsx scripts/build-player-tagged-handbook.ts <fresh data dir> <archive.zip> <output dir>
 *
 * Maps in packs/worldkeeper/maps/ (each <name>.pins.json with its image, and an optional <name>.routes.json) are added as player-visible maps.
 * Pins link only to records that end up revealed; the others are left off.
 *
 * DM-written player text in packs/worldkeeper/player-text/*.md is published too: each "## Name" section becomes the player
 * text of the record with that name (only that text is shown, never the record's own sections). When several records
 * share a name, add the kind: "## Kaelholm (Settlement)".
 *
 * New lore records in packs/worldkeeper/lore/ (archive format) are imported alongside the archive. Drafts folders are skipped
 * everywhere: packs/worldkeeper/player-text/drafts/ and packs/worldkeeper/lore/drafts/ hold material awaiting review.
 *
 * Sections are left out when they are GM-only, editorial notes about the source, DM-facing advice, bookkeeping,
 * or mention something that is secret elsewhere in the lore (listed below). Review the output before publishing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import { readSource } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { handbookReveals } from '../server/src/player/handbookReveals.js';
import { buildPlayerSite } from '../server/src/publish/site.js';
import { applyMaps } from '../server/src/mapAdditions.js';
import { applyLinks, loreFiles } from '../server/src/additions.js';
import { applyErrata } from '../server/src/errata.js';

const [dataDir, archive, outDir] = process.argv.slice(2);
const ctx = new AppContext(resolvePaths(dataDir));
// New lore records written for this world (packs/worldkeeper/lore/, same format as the archive's records) are imported with
// the archive, then the curated links in packs/worldkeeper/lore/links.json. Drafts folders are left out.
const files = [...readSource(archive), ...loreFiles()];
commitPlan(ctx.db, files, buildPlan(ctx.db, files, path.basename(archive)));
const linked = applyLinks(ctx.db);
// Corrections to the archive's own wording (packs/worldkeeper/lore/errata.json), before anything is revealed.
const fixed = applyErrata(ctx.db, path.resolve(import.meta.dirname, '../packs/worldkeeper/lore/errata.json'));
console.log(`errata: ${fixed.records} records corrected`);
console.log(`links: ${linked.added} added${linked.skipped.length ? `, ${linked.skipped.length} skipped` : ''}`);
// The handbook's reveals (player-tagged records' safe sections, and the DM-written player text), by the same rules
// the app's "Match the published handbook" action uses (server/src/player/handbookReveals.ts).
const reveals = handbookReveals(ctx.db, { mode: 'fresh', apply: true, log: (m) => console.log(m) });
console.log(`revealed: ${reveals.newRecords} records, ${reveals.sections} sections, ${reveals.playerText} with player text`);
// Maps: every map in packs/worldkeeper/maps, with its pins, routes and region outlines (only revealed places).
for (const r of applyMaps(ctx.db, ctx.paths.uploadsDir, path.resolve(import.meta.dirname, '../packs/worldkeeper/maps'), { onlyRevealed: true }))
  console.log(`${r.name}: ${r.pins} pins, ${r.routes} routes, ${r.regions} regions`);

const { files: site, summary } = buildPlayerSite(ctx.db, ctx.paths);
fs.rmSync(outDir, { recursive: true, force: true });
for (const f of site) {
  const p = path.join(outDir, f.path);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.data);
}
console.log(JSON.stringify(summary));
