/**
 * Random encounter tables shipped with the Worldkeeper additions (packs/worldkeeper/tables/*.md), added to the GM's Random Tables.
 * A table the library already has (by name) is left alone, so the GM's own edits are kept.
 *
 * File format: "# Table name", an optional "Region: ID" line, then numbered entries ("1. …"). Lines before the first
 * table (a "Note:") are ignored.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/connection.js';
import { randomTables } from './repo/campaigns.js';

export interface TableSpec {
  name: string;
  region: string | null;
  entries: string[];
}

export function parseTables(text: string): TableSpec[] {
  const out: TableSpec[] = [];
  let cur: TableSpec | null = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = line.match(/^# (.+)$/);
    if (h) {
      cur = { name: h[1].trim(), region: null, entries: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const r = line.match(/^Region:\s*([A-Z]{2,5}-\d{3,4})/);
    if (r) cur.region = r[1];
    const e = line.match(/^\d+\.\s+(.+)$/);
    if (e) cur.entries.push(e[1].trim());
  }
  return out;
}

export function applyTables(db: DB, dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const specs = fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.md'))
    .sort()
    .flatMap((f) => parseTables(fs.readFileSync(path.join(dir, f), 'utf8')));
  return applyTableSpecs(db, specs);
}

/** Add tables the library doesn't have yet (by name). */
export function applyTableSpecs(db: DB, specs: TableSpec[]): string[] {
  const have = db.prepare('SELECT 1 FROM random_tables WHERE name = ?');
  const added: string[] = [];
  for (const t of specs) {
    if (!t.entries.length || have.get(t.name)) continue;
    randomTables.create(db, {
      name: t.name,
      die: `d${t.entries.length}`,
      entries: t.entries.map((text) => ({ weight: 1, text })),
      source: `Worldkeeper additions${t.region ? ` (${t.region})` : ''}`,
    });
    added.push(t.name);
  }
  return added;
}
