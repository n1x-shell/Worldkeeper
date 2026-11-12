/**
 * Worldkeeper additions: lore written for this world on top of the imported archive.
 *
 *  - assets/lore/*.md        new records, in the archive's record format (drafts/ folders are skipped)
 *  - assets/lore/links.json  links between records (homes, origins, groups) that the archive text does not give
 *
 * Applying them never changes or removes archive records. Links are stored as curated links, so the GM can edit or
 * delete them in the app like any other.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/connection.js';
import type { SourceFile } from './import/scan.js';
import { buildPlan, commitPlan } from './import/importer.js';
import { createRelationship } from './repo/relationships.js';
import { RELATIONSHIP_TYPES, type RelationshipType } from '../../shared/domain.js';
import { readPlayerText, syncRumours } from './repo/rumours.js';

export const DEFAULT_ADDITIONS_DIR = path.resolve(import.meta.dirname, '../../assets/lore');

/** The new lore records, as source files the importer understands. */
export function loreFiles(dir = DEFAULT_ADDITIONS_DIR): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string) => {
    for (const ent of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      if (ent.name.startsWith('.') || ent.name === 'drafts') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.md'))
        out.push({ path: `Worldkeeper_Additions/${path.relative(dir, full).split(path.sep).join('/')}`, content: fs.readFileSync(full, 'utf8') });
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
}

/** Add the curated links. Links whose records do not exist (yet) are skipped and reported. */
export function applyLinks(db: DB, dir = DEFAULT_ADDITIONS_DIR): { added: number; skipped: string[] } {
  const file = path.join(dir, 'links.json');
  if (!fs.existsSync(file)) return { added: 0, skipped: [] };
  const { links } = JSON.parse(fs.readFileSync(file, 'utf8')) as { links: LinkSpec[] };
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  // A link the archive text already gives (or a "leads" that implies membership) is not repeated.
  const already = db.prepare(
    `SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ? AND origin <> 'user' AND (type = ? OR (? = 'member_of' AND type = 'leads'))`,
  );
  const curated = db.prepare(`SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ? AND type = ? AND origin = 'user'`);
  let added = 0;
  const skipped: string[] = [];
  for (const l of links) {
    if (!RELATIONSHIP_TYPES.includes(l.type as RelationshipType) || !exists.get(l.source) || !exists.get(l.target)) {
      skipped.push(`${l.source} ${l.type} ${l.target}`);
      continue;
    }
    if (already.get(l.source, l.target, l.type, l.type)) continue;
    if (curated.get(l.source, l.target, l.type)) continue;
    createRelationship(db, { source_id: l.source, target_id: l.target, type: l.type as RelationshipType, label: l.label ?? '', canon_status: 'CANON' });
    added++;
  }
  return { added, skipped };
}

/** Bring the additions into an existing library: the new records first, then the links. */
export function applyAdditions(db: DB, dir = DEFAULT_ADDITIONS_DIR) {
  const files = loreFiles(dir);
  const imported = files.length ? commitPlan(db, files, buildPlan(db, files, 'Worldkeeper additions')) : null;
  const links = applyLinks(db, dir);
  const rumours = syncRumours(db, readPlayerText(path.resolve(dir, '../player-text')));
  return { records: files.length, imported, links, rumours };
}
