/**
 * A pack's content in a library: its update (records, links, timeline, rumours, mysteries, maps, adventures, tables:
 * what "Apply additions" did for the Worldkeeper setting), and marking what it shipped as the pack's, so a later
 * update, or an uninstall, touches only that. The GM's own work is never marked.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { applyAdditions } from '../additions.js';
import { adventureFiles, parseAdventure } from '../adventureAdditions.js';
import { parseTables } from '../tableAdditions.js';
import { mapSpecs } from '../mapAdditions.js';
import { itemTables, treasureData } from '../repo/treasure.js';
import { findPack, installPack } from './registry.js';

/** Install a pack if needed, then bring its content into the library. Returns what changed, with any ID clashes. */
export function updatePack(db: DB, id: string, uploadsDir?: string) {
  const found = findPack(id);
  if (!found) throw notFound('Setting pack');
  installPack(db, id);
  const result = applyAdditions(db, path.join(found.dir, 'lore'), uploadsDir, id);
  const marked = markPackRows(db, id, found.dir);
  db.prepare('UPDATE setting_packs SET version = ?, updated_at = ? WHERE id = ?').run(found.manifest.version, new Date().toISOString(), id);
  return { ...result, marked };
}

/**
 * Mark the rows a pack shipped as the pack's: its timeline rows, rumours, mysteries, secrets and clues; its curated
 * links; its maps (with their pins and shapes); its adventures and tables. Matched by what the pack's folder holds,
 * so a library from before packs is adopted by the pack's next update.
 */
export function markPackRows(db: DB, id: string, dir: string) {
  const n: Record<string, number> = {};
  const run = (label: string, sql: string, ...args: unknown[]) => (n[label] = (n[label] ?? 0) + db.prepare(sql).run(...args).changes);
  db.transaction(() => {
    run('timeline', `UPDATE timeline_rows SET pack_id = ? WHERE origin = 'additions' AND pack_id IS NULL`, id);
    run('rumours', `UPDATE rumours SET pack_id = ? WHERE origin = 'handbook' AND pack_id IS NULL`, id);
    for (const t of ['mysteries', 'secrets', 'clues']) run(t, `UPDATE ${t} SET pack_id = ? WHERE origin = 'additions' AND pack_id IS NULL`, id);
    // Links the importer derived from the pack's records (fields, parents, references).
    run('links', `UPDATE relationships SET pack_id = ? WHERE pack_id IS NULL AND origin LIKE 'import%' AND source_id IN (SELECT id FROM entities WHERE pack_id = ?)`, id, id);
    // Curated links (links.json).
    const linksFile = path.join(dir, 'lore', 'links.json');
    if (fs.existsSync(linksFile)) {
      const { links } = JSON.parse(fs.readFileSync(linksFile, 'utf8')) as { links: { source: string; target: string; type: string }[] };
      const mark = db.prepare('UPDATE relationships SET pack_id = ? WHERE source_id = ? AND target_id = ? AND type = ? AND pack_id IS NULL');
      for (const l of links) n.links = (n.links ?? 0) + mark.run(id, l.source, l.target, l.type).changes;
    }
    // Maps, by name, with their pins and shapes.
    const mapsDir = path.join(dir, 'maps');
    if (fs.existsSync(mapsDir)) {
      for (const base of mapSpecs(mapsDir)) {
        const spec = JSON.parse(fs.readFileSync(path.join(mapsDir, `${base}.pins.json`), 'utf8')) as { name: string };
        run('maps', 'UPDATE maps SET pack_id = ? WHERE name = ? AND pack_id IS NULL', id, spec.name);
      }
      run('pins', 'UPDATE map_markers SET pack_id = ? WHERE pack_id IS NULL AND map_id IN (SELECT id FROM maps WHERE pack_id = ?)', id, id);
      run('shapes', 'UPDATE map_shapes SET pack_id = ? WHERE pack_id IS NULL AND map_id IN (SELECT id FROM maps WHERE pack_id = ?)', id, id);
    }
    // Adventures and random tables, by title and name.
    const advDir = path.join(dir, 'adventures');
    if (fs.existsSync(advDir))
      for (const f of adventureFiles(advDir)) run('adventures', 'UPDATE adventures SET pack_id = ? WHERE title = ? AND pack_id IS NULL', id, parseAdventure(fs.readFileSync(f, 'utf8')).title);
    const tablesDir = path.join(dir, 'tables');
    const names = fs.existsSync(tablesDir)
      ? fs
          .readdirSync(tablesDir)
          .filter((x) => x.endsWith('.md'))
          .flatMap((f) => parseTables(fs.readFileSync(path.join(tablesDir, f), 'utf8')).map((t) => t.name))
      : [];
    const treasureDir = path.join(dir, 'treasure');
    if (fs.existsSync(treasureDir)) names.push(...itemTables(treasureData(treasureDir)).map((t) => t.name));
    for (const name of names) run('tables', 'UPDATE random_tables SET pack_id = ? WHERE name = ? AND pack_id IS NULL', id, name);
  })();
  return n;
}
