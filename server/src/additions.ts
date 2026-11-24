/**
 * Worldkeeper additions: lore written for this world on top of the imported archive.
 *
 *  - packs/worldkeeper/lore/*.md        new records, in the archive's record format (drafts/ folders are skipped)
 *  - packs/worldkeeper/lore/links.json  links between records (homes, origins, groups) that the archive text does not give
 *  - timeline.json files under packs/worldkeeper/lore: rows for the World Timeline (eras the GM has set by hand are kept)
 *
 * Applying them never changes or removes archive records. Links are stored as curated links, so the GM can edit or
 * delete them in the app like any other.
 */
import { keepTimelineReveals } from './repo/timeline.js';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { addImage } from './repo/entityImages.js';
import path from 'node:path';
import { applyErrata } from './errata.js';
import type { DB } from './db/connection.js';
import type { SourceFile } from './import/scan.js';
import { buildPlan, commitPlan } from './import/importer.js';
import { createRelationship, rebuildAllDerivedRelationships } from './repo/relationships.js';
import { RELATIONSHIP_TYPES, type RelationshipType } from '../../shared/domain.js';
import { readPlayerText, syncRumours } from './repo/rumours.js';
import { syncMysteries } from './repo/mysteries.js';
import { deriveTimelineEras } from './repo/eras.js';
import { applyMaps } from './mapAdditions.js';
import { applyAdventures } from './adventureAdditions.js';
import { applyTables, applyTableSpecs } from './tableAdditions.js';
import { itemTables, treasureData } from './repo/treasure.js';
import { worldkeeperPath } from './packs/paths.js';
import { findPack } from './packs/registry.js';
import { applyHomebrew } from './repo/homebrew.js';

/** The Worldkeeper pack's lore folder (packs/worldkeeper/lore, or the installed copy). */
export const DEFAULT_ADDITIONS_DIR = worldkeeperPath('lore');

/** The new lore records, as source files the importer understands. */
export function loreFiles(dir = DEFAULT_ADDITIONS_DIR): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string) => {
    for (const ent of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      if (ent.name.startsWith('.') || ent.name === 'drafts') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.md')) out.push({ path: `Worldkeeper_Additions/${path.relative(dir, full).split(path.sep).join('/')}`, content: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

interface LinkSpec {
  source: string;
  target: string;
  type: string;
  label?: string;
  description?: string;
  /** The label this link was shipped with before; a library's link that still has it gets the new one. */
  was_label?: string;
}

/** Add the curated links. Links whose records do not exist (yet) are skipped and reported. */
export function applyLinks(db: DB, dir = DEFAULT_ADDITIONS_DIR): { added: number; skipped: string[] } {
  const file = path.join(dir, 'links.json');
  if (!fs.existsSync(file)) return { added: 0, skipped: [] };
  const { links } = JSON.parse(fs.readFileSync(file, 'utf8')) as { links: LinkSpec[] };
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  // A link the archive text already gives (or a "leads" that implies membership) is not repeated.
  const already = db.prepare(`SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ? AND origin <> 'user' AND (type = ? OR (? = 'member_of' AND type = 'leads'))`);
  const curated = db.prepare(`SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ? AND type = ? AND origin = 'user'`);
  let added = 0;
  const skipped: string[] = [];
  for (const l of links) {
    if (!RELATIONSHIP_TYPES.includes(l.type as RelationshipType) || !exists.get(l.source) || !exists.get(l.target)) {
      skipped.push(`${l.source} ${l.type} ${l.target}`);
      continue;
    }
    if (already.get(l.source, l.target, l.type, l.type)) continue;
    if (curated.get(l.source, l.target, l.type)) {
      // A shipped label that changed (for example a travel time): updated only where the library still has the old one.
      if (l.was_label && l.label !== l.was_label)
        db.prepare(`UPDATE relationships SET label = ? WHERE source_id = ? AND target_id = ? AND type = ? AND origin = 'user' AND label = ?`).run(l.label, l.source, l.target, l.type, l.was_label);
      continue;
    }
    createRelationship(db, { source_id: l.source, target_id: l.target, type: l.type as RelationshipType, label: l.label ?? '', description: l.description ?? '', canon_status: 'CANON' });
    added++;
  }
  return { added, skipped };
}

interface TimelineSpec {
  sort_order: number;
  time_label: string;
  event: string;
  realm_label?: string;
  access?: string;
  entity_ids?: string[];
  era?: string;
}

/** Replace the additions' World Timeline rows. Rows imported from the archive, and the GM's own rows, are untouched. */
export function applyTimeline(db: DB, dir = DEFAULT_ADDITIONS_DIR): number {
  const specs: TimelineSpec[] = [];
  const walk = (d: string) => {
    for (const ent of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      if (ent.name.startsWith('.') || ent.name === 'drafts') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === 'timeline.json') specs.push(...(JSON.parse(fs.readFileSync(full, 'utf8')) as { rows: TimelineSpec[] }).rows);
    }
  };
  walk(dir);
  const kept = new Map(
    (db.prepare(`SELECT event, era FROM timeline_rows WHERE origin = 'additions' AND era_origin = 'user'`).all() as { event: string; era: string | null }[]).map((r) => [r.event, r.era]),
  );
  const ins = db.prepare(
    `INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, source, access, entity_ids, origin, era, era_origin) VALUES (?, ?, ?, ?, '', ?, ?, 'additions', ?, ?)`,
  );
  // What players were shown of these rows, kept across the replacement (repo/timeline.ts).
  const restoreReveals = keepTimelineReveals(db, 'additions');
  db.transaction(() => {
    db.prepare(`DELETE FROM timeline_rows WHERE origin = 'additions'`).run();
    for (const r of specs) {
      const userEra = kept.get(r.event);
      ins.run(
        r.sort_order,
        r.time_label,
        r.event,
        r.realm_label ?? '',
        r.access ?? 'CANON',
        JSON.stringify(r.entity_ids ?? []),
        kept.has(r.event) ? userEra : (r.era ?? null),
        kept.has(r.event) ? 'user' : null,
      );
    }
    restoreReveals();
  })();
  deriveTimelineEras(db);
  return specs.length;
}

/**
 * The world's original archive, shipped with its worldbook (packs/<id>/archive, v0.7.2): its Markdown files, at the
 * paths they had in the archive, so a library that imported the archive by hand finds them unchanged.
 */
export function archiveFiles(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string) => {
    for (const ent of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.md')) out.push({ path: path.relative(dir, full).split(path.sep).join('/'), content: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A worldbook's pictures of its records: lore/pictures.json lists them (`{ id, file, caption, player_visible }`), the
 * files are in the pictures folder beside lore. A picture the library already has from this worldbook (by its file
 * name there) isn't added again, so the GM's captions and choices are kept.
 */
export function applyPictures(db: DB, dir: string, uploadsDir: string): number {
  const list = path.join(dir, 'pictures.json');
  const folder = path.resolve(dir, '../pictures');
  if (!fs.existsSync(list) || !fs.existsSync(folder)) return 0;
  const { pictures } = JSON.parse(fs.readFileSync(list, 'utf8')) as { pictures: { id: string; file: string; caption?: string; player_visible?: boolean }[] };
  const have = db.prepare('SELECT 1 FROM entity_images WHERE entity_id = ? AND origin = ?');
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  let added = 0;
  for (const p of pictures ?? []) {
    if (typeof p.file !== 'string' || !/^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(p.file) || !exists.get(p.id) || have.get(p.id, p.file)) continue;
    const from = path.join(folder, p.file);
    if (!fs.existsSync(from)) continue;
    const name = `record-${String(p.id).replace(/[^\w-]/g, '')}-${randomBytes(6).toString('hex')}${path.extname(p.file).toLowerCase()}`;
    fs.copyFileSync(from, path.join(uploadsDir, name));
    addImage(db, p.id, name, { caption: typeof p.caption === 'string' ? p.caption : '', player_visible: !!p.player_visible, origin: p.file });
    added++;
  }
  return added;
}

/** Bring the worldbook into a library: its archive and new records first (one import), then the links and the rest. */
export function applyAdditions(db: DB, dir = DEFAULT_ADDITIONS_DIR, uploadsDir?: string, packId = 'worldkeeper') {
  const archive = archiveFiles(path.resolve(dir, '../archive'));
  const files = [...archive, ...loreFiles(dir)];
  const plan = files.length ? buildPlan(db, files, 'The Worldkeeper world', { packId }) : null;
  // A record of the GM's own with an ID the pack also uses: the GM's is kept, and the clash is reported.
  const ownIds = new Set((db.prepare(`SELECT id FROM entities WHERE origin = 'user' AND pack_id IS NULL`).all() as { id: string }[]).map((r) => r.id));
  const clashes = (plan?.entities ?? []).filter((p) => ownIds.has(p.draft.id)).map((p) => ({ id: p.draft.id, name: p.draft.name }));
  const imported = plan ? commitPlan(db, files, plan) : null;
  // Derived links follow the current rules (they're rebuilt from each record's own text; curated links are kept).
  rebuildAllDerivedRelationships(db);
  const links = applyLinks(db, dir);
  const rumours = syncRumours(db, readPlayerText(path.resolve(dir, '../player-text')));
  const mysteries = syncMysteries(db, path.join(dir, 'mysteries.json'));
  const timeline = applyTimeline(db, dir);
  // Corrections to wording the library already has (records, player text, adventures), where it's still the old wording.
  const errata = applyErrata(db, path.join(dir, 'errata.json'));
  // The world's maps (pins, routes, region outlines). Maps the library already has are only topped up.
  const mapsAdded = uploadsDir ? applyMaps(db, uploadsDir, path.resolve(dir, '../maps'), { onlyRevealed: false }) : [];
  // The records' pictures (lore/pictures.json and the pictures folder), each added once.
  const picturesAdded = uploadsDir ? applyPictures(db, dir, uploadsDir) : 0;
  // The world's own magic items and spells (homebrew/homebrew.json), each added once.
  const brewFile = path.resolve(dir, '../homebrew/homebrew.json');
  const homebrewAdded = fs.existsSync(brewFile) ? applyHomebrew(db, (JSON.parse(fs.readFileSync(brewFile, 'utf8')) as { homebrew?: object[] }).homebrew ?? [], packId) : 0;
  // Ready-to-run adventures, added to the GM's Adventures (ones the library already has are left alone).
  const adventuresAdded = applyAdventures(db, path.resolve(dir, '../adventures'));
  // Random encounter tables, added to the GM's Random Tables (ones the library already has are left alone).
  const tablesAdded = [
    ...applyTables(db, path.resolve(dir, '../tables'), packId === 'worldkeeper' ? 'Worldkeeper additions' : (findPack(packId)?.manifest.name ?? packId)),
    // Magic item tables by region and rarity, from the treasure pools.
    ...applyTableSpecs(
      db,
      itemTables(treasureData(path.resolve(dir, '../treasure'))).map((t) => ({ name: t.name, region: null, entries: t.entries })),
    ),
  ];
  // Errata for adventures run after the shipped adventures are added (a library that had none gets them corrected too).
  const adventureErrata = applyErrata(db, path.join(dir, 'errata.json'));
  return {
    records: files.length - archive.length,
    archive: archive.length,
    clashes,
    imported,
    links,
    rumours,
    mysteries,
    timeline,
    maps: mapsAdded,
    pictures: picturesAdded,
    homebrew: homebrewAdded,
    adventures: adventuresAdded,
    tables: tablesAdded,
    errata: { records: errata.records + adventureErrata.records, adventures: errata.adventures + adventureErrata.adventures },
  };
}
