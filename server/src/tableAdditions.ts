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
  /** Each entry's weight (1 when not given). */
  weights?: number[];
  kind?: string;
  levels?: { level_min: number; level_max: number };
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
    const k = line.match(/^Kind:\s*(encounter|treasure|other)\s*$/);
    if (k) cur.kind = k[1];
    const lv = line.match(/^Levels:\s*(\d+)\s*(?:to|-|–)\s*(\d+)\s*$/);
    if (lv) cur.levels = { level_min: Number(lv[1]), level_max: Number(lv[2]) };
    // "3. [x2] A pack of wolves": an entry with a weight.
    const e = line.match(/^\d+\.\s+(?:\[x(\d+)\]\s+)?(.+)$/);
    if (e) {
      cur.entries.push(e[2].trim());
      (cur.weights ??= []).push(Math.max(1, Number(e[1] ?? 1)));
    }
  }
  return out;
}

/** Write tables in the format parseTables reads (for a shared worldbook). */
export function tablesToMarkdown(list: { name: string; region_id: string | null; kind: string; level_min: number | null; level_max: number | null; entries: { weight?: number; text: string }[] }[]) {
  return `${list
    .map((t) =>
      [
        `# ${t.name.replace(/\r?\n/g, ' ')}`,
        ...(t.region_id ? [`Region: ${t.region_id}`] : []),
        `Kind: ${t.kind}`,
        ...(t.level_min != null && t.level_max != null ? [`Levels: ${t.level_min} to ${t.level_max}`] : []),
        '',
        ...t.entries.map((e, i) => `${i + 1}. ${(e.weight ?? 1) > 1 ? `[x${e.weight}] ` : ''}${e.text.replace(/\r?\n/g, ' ')}`),
      ].join('\n'),
    )
    .join('\n\n')}\n`;
}

export function applyTables(db: DB, dir: string, source = 'Worldkeeper additions'): string[] {
  if (!fs.existsSync(dir)) return [];
  const specs = fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.md'))
    .sort()
    .flatMap((f) => parseTables(fs.readFileSync(path.join(dir, f), 'utf8')));
  return applyTableSpecs(db, specs, source);
}

const band = (name: string) => {
  const m = /levels?\s+(\d+)\s*(?:to|-|–)\s*(\d+)/i.exec(name);
  return m ? { level_min: Number(m[1]), level_max: Number(m[2]) } : {};
};

/** Add tables the library doesn't have yet (by name). */
export function applyTableSpecs(db: DB, specs: TableSpec[], source = 'Worldkeeper additions'): string[] {
  const have = db.prepare('SELECT 1 FROM random_tables WHERE name = ?');
  const added: string[] = [];
  for (const t of specs) {
    if (!t.entries.length || have.get(t.name)) continue;
    randomTables.create(db, {
      name: t.name,
      die: `d${t.weights ? t.weights.reduce((a, b) => a + b, 0) : t.entries.length}`,
      entries: t.entries.map((text, i) => ({ weight: t.weights?.[i] ?? 1, text })),
      source: `${source}${t.region ? ` (${t.region})` : ''}`,
      region_id: t.region,
      kind: t.kind ?? (/^Encounters/i.test(t.name) ? 'encounter' : /^Treasure/i.test(t.name) ? 'treasure' : 'other'),
      ...(t.levels ?? band(t.name)),
    });
    added.push(t.name);
  }
  return added;
}
