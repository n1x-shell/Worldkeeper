/**
 * Build the Player Handbook from the archive's player-tagged records (Tags: vis/player), as first published to
 * the gh-pages branch. Imports the archive into a fresh data folder, reveals only safe sections, and writes the
 * static site to an output folder (push that folder to gh-pages, or publish from the app instead).
 *
 *   npx tsx scripts/build-player-tagged-handbook.ts <fresh data dir> <archive.zip> <output dir>
 *
 * The world map in assets/maps/ (world-map.png + world-map.pins.json) is added as a player-visible map.
 * Pins link only to records that end up revealed; the others are left off.
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
import { getEntity, updateEntity } from '../server/src/repo/entities.js';
import { splitSections } from '../server/src/import/parseMarkdown.js';
import { isSecretHeading } from '../server/src/player/projection.js';
import { buildPlayerSite } from '../server/src/publish/site.js';
import { maps, markers } from '../server/src/repo/maps.js';
import { imageSize } from '../server/src/routes/atlas.js';

const [dataDir, archive, outDir] = process.argv.slice(2);
const ctx = new AppContext(resolvePaths(dataDir));
const files = readSource(archive);
commitPlan(ctx.db, files, buildPlan(ctx.db, files, path.basename(archive)));
// Same rule as the app's display filter for editorial notes about the source.
const EDITORIAL = /^(sources?|references|unspecified fields|tome implementation|review notes|limits( of the source)?|record boundaries|source boundary|use and verification|missing facts|limitations|open questions|unknowns|amsel entry (rule|notes)|use in amsel|status)(\s*\[[^\]]*\])?$/i;
// DM-facing sections (table advice, campaign bookkeeping, notes about the source).
const DM_FACING = /^(use in play|connections and use|verification boundary|cross-entry role link.*|mechanics note|provenance note|related documents|related|undefined|notes|campaign use|adventure material|attitude toward the party.*|established limits|other possibilities|boundaries)$/i;
// Spoilers: things that are secret elsewhere in the lore. The myths entry is exempt for the Hidden Ones (player-known myth).
// Bookkeeping for the DM / editors: placeholders and instructions about the source, not lore.
const BOOKKEEPING = (text: string) =>
  text.trim() === 'UNDEFINED' || /do not (assign|place|create|turn|invent)|without (approval|an owner decision)|\bAmsel\b|belongs? in Tome|owner decision/i.test(text);
// Each sealed vault's purpose is secret (vault records are SECRET); keep sections that name one out.
const VAULTS = /\b(Seed Vault|Mirewell|Arborhold|Cradlehorn|Cinderlock|Anvilreach|Rimeholt|Deepcall|Saltgate|Greyhall|Watchbarrow|Glassmere|Hollowbell)\b/;
const SPOILER = (id: string, text: string) => VAULTS.test(text) || BOOKKEEPING(text.split('\n').slice(1).join('\n')) || /Forgotten One|thirteenth (shard|crystal)|Root Core|Seventh Ward|\[SECRET|GM only/i.test(text) || (id !== 'COS-910' && /Hidden Ones/.test(text));
const ids = (ctx.db.prepare(`SELECT id FROM entities WHERE tags LIKE '%"vis/player"%' AND type NOT IN ('index','register','redirect') AND canon_flags NOT LIKE '%SECRET%'`).all() as { id: string }[]).map((r) => r.id);
const headingsUsed = new Map<string, number>();
for (const id of ids) {
  const e = getEntity(ctx.db, id);
  const sections = splitSections(e.body).filter((s) => s.heading && s.content.trim() && !isSecretHeading(s.heading) && !EDITORIAL.test(s.heading.trim()) && !DM_FACING.test(s.heading.trim()) && !SPOILER(id, s.heading + '\n' + s.content));
  for (const s of sections) headingsUsed.set(s.heading, (headingsUsed.get(s.heading) ?? 0) + 1);
  if (!sections.length) continue; // nothing safe to show: leave the record unrevealed
  updateEntity(ctx.db, id, { revealed: true, revealed_sections: sections.map((s) => s.heading), reason: 'Published to the Player Handbook (player-tagged in the archive)' });
}
// World map: image + pins (pixel positions from the top-left; the atlas measures y from the bottom).
const mapDir = path.resolve(import.meta.dirname, '../assets/maps');
const pinsFile = path.join(mapDir, 'world-map.pins.json');
if (fs.existsSync(pinsFile)) {
  const spec = JSON.parse(fs.readFileSync(pinsFile, 'utf8')) as { name: string; image: string; pins: { id: string; label: string; x: number; y: number; category: string }[] };
  const img = fs.readFileSync(path.join(mapDir, spec.image));
  const size = imageSize(img);
  if (!size) throw new Error(`Could not read the size of ${spec.image}`);
  const file = `map-world-${img.length.toString(16)}${path.extname(spec.image)}`;
  fs.writeFileSync(path.join(ctx.paths.uploadsDir, file), img);
  const map = maps.create(ctx.db, { name: spec.name, kind: 'image', image_file: file, width: size.width, height: size.height, player_visible: true, layers: ['Locations'] }) as { id: number };
  let placed = 0;
  for (const p of spec.pins) {
    if (!getEntity(ctx.db, p.id).revealed) continue;
    markers.create(ctx.db, { map_id: map.id, entity_id: p.id, label: p.label, x: p.x, y: size.height - p.y, category: p.category, layer: 'Locations', hidden: false });
    placed++;
  }
  console.log(`world map: ${size.width}x${size.height}, ${placed} pins`);
}

const { files: site, summary } = buildPlayerSite(ctx.db, ctx.paths);
fs.rmSync(outDir, { recursive: true, force: true });
for (const f of site) {
  const p = path.join(outDir, f.path);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.data);
}
console.log(JSON.stringify(summary));
console.log('sections revealed by heading:', JSON.stringify([...headingsUsed.entries()].sort((a, b) => b[1] - a[1])));
