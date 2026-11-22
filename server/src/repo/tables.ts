/**
 * Random tables for a place (docs/OWN_WORLD_PLAN.md §2.9): each belongs to a region and suits a band of party levels.
 * A hand-made table (a pack's or the GM's) comes first; otherwise an encounter table is generated from the creatures in
 * the rules packs that are on, by the place's terrain and danger and the party's level (encounters.ts). "Regenerate"
 * rebuilds a generated one; "Copy to edit" makes it the GM's own.
 */
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { randomTables } from './campaigns.js';
import { DIFFICULTIES, suggestEncounters, type Difficulty } from './encounters.js';
import { placeProfile } from './places.js';
import { difficultyFor } from '../../../shared/places.js';

/** The level bands generated tables use (the 2024 treasure tiers). */
export const LEVEL_BANDS: [number, number][] = [
  [1, 4],
  [5, 10],
  [11, 16],
  [17, 20],
];
export const bandFor = (level: number): [number, number] => LEVEL_BANDS.find(([a, b]) => level >= a && level <= b) ?? LEVEL_BANDS[0];

interface TableRow {
  id: number;
  name: string;
  die: string;
  region_id: string | null;
  level_min: number | null;
  level_max: number | null;
  kind: string;
  auto: number;
}

/** Tables from before regions and bands were columns: read "levels 1 to 4" from their names. */
export function adoptTableBands(db: DB) {
  let rows: { id: number; name: string }[];
  try {
    rows = db.prepare(`SELECT id, name FROM random_tables WHERE level_min IS NULL AND name LIKE '%level%'`).all() as typeof rows;
  } catch {
    return; // a library from before migration 25
  }
  const set = db.prepare('UPDATE random_tables SET level_min = ?, level_max = ? WHERE id = ?');
  for (const r of rows) {
    const m = /levels?\s+(\d+)\s*(?:to|-|–)\s*(\d+)/i.exec(r.name);
    if (m) set.run(Number(m[1]), Number(m[2]), r.id);
  }
}

/** A region's tables, hand-made first. */
export function tablesFor(db: DB, regionId: string, kind?: string): TableRow[] {
  return (
    db
      .prepare(`SELECT id, name, die, region_id, level_min, level_max, kind, auto FROM random_tables WHERE region_id = ? ${kind ? 'AND kind = ?' : ''}`)
      .all(...(kind ? [regionId, kind] : [regionId])) as TableRow[]
  ).sort((a, b) => a.auto - b.auto || (a.level_min ?? 0) - (b.level_min ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

const suits = (t: TableRow, level: number) => (t.level_min == null || level >= t.level_min) && (t.level_max == null || level <= t.level_max);

/**
 * A region's encounter table for a party level: a hand-made one that suits it, else a generated one, else (with
 * generate) a new generated one, when the rules packs have creatures for its terrain.
 */
export function encounterTableFor(db: DB, regionId: string, level: number, opts: { generate?: boolean } = {}): { id: number; name: string } | null {
  const all = tablesFor(db, regionId, 'encounter');
  const hit = all.find((t) => !t.auto && suits(t, level)) ?? all.find((t) => t.auto && suits(t, level)) ?? all.find((t) => !t.auto) ?? null;
  if (hit || !opts.generate) return hit;
  const made = generateEncounterTable(db, regionId, level);
  return made.entries.length ? { id: made.id, name: made.name } : null;
}

const plural = (name: string, n: number) => {
  const s = name.toLowerCase();
  if (n === 1) return /^[aeiou]/.test(s) ? `an ${s}` : `a ${s}`;
  return `${n} ${s.endsWith('f') ? `${s.slice(0, -1)}ves` : s.endsWith('y') && !/[aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(s) ? `${s}es` : `${s}s`}`;
};

/**
 * Generate (or regenerate) a region's encounter table for the level band holding this level: eight rows of creatures
 * from the rules packs that are on, in the place's terrain, at its danger's difficulty with a mix either side.
 */
export function generateEncounterTable(db: DB, regionId: string, level: number, rng: () => number = Math.random) {
  const place = db.prepare('SELECT id, name FROM entities WHERE id = ?').get(regionId) as { id: string; name: string } | undefined;
  if (!place) throw notFound('Place');
  const [lo, hi] = bandFor(level);
  const profile = placeProfile(db, regionId);
  const base = DIFFICULTIES.indexOf(difficultyFor(profile.danger));
  const mid = Math.round((lo + hi) / 2);
  // Mostly the place's own difficulty, with an easier and a harder fight now and then.
  const plan: Difficulty[] = [0, 0, 0, 0, 0, -1, -1, 1].map((d) => DIFFICULTIES[Math.max(0, Math.min(2, base + d))]);
  const rows: { weight: number; text: string }[] = [];
  const seen = new Set<string>();
  for (const difficulty of plan) {
    const ideas = suggestEncounters(db, { level: mid, difficulty, terrain: profile.terrain, count: 4, rng }).ideas;
    const idea = ideas.find((i) => !seen.has(i.creatures.map((c) => c.id).join('+')));
    if (!idea) continue;
    seen.add(idea.creatures.map((c) => c.id).join('+'));
    const who = idea.creatures.map((c) => plural(c.name, c.count)).join(' and ');
    rows.push({ weight: 1, text: `**Fight.** ${who.charAt(0).toUpperCase()}${who.slice(1)} (${difficulty}, ${idea.xp.toLocaleString('en')} XP).` });
  }
  const name = `Encounters: ${place.name}, levels ${lo} to ${hi}`;
  const existing = db.prepare(`SELECT id FROM random_tables WHERE region_id = ? AND kind = 'encounter' AND auto = 1 AND level_min = ? AND level_max = ?`).get(regionId, lo, hi) as
    | { id: number }
    | undefined;
  const data = {
    name,
    die: rows.length ? `d${rows.length}` : '',
    entries: rows,
    source: `Generated from your rules packs (${profile.terrain.join(', ') || 'any terrain'}, ${profile.danger})`,
    region_id: regionId,
    level_min: lo,
    level_max: hi,
    kind: 'encounter' as const,
    auto: true,
  };
  const t = (existing ? randomTables.update(db, existing.id, data) : randomTables.create(db, data)) as { id: number; name: string; entries: unknown[] };
  return { id: t.id, name: t.name, entries: rows, terrain: profile.terrain, danger: profile.danger };
}

/** Make any table the GM's own, to change freely: a copy that is never regenerated. */
export function copyTable(db: DB, id: number) {
  const t = randomTables.get(db, id) as { name: string; die: string; entries: unknown[]; region_id: string | null; level_min: number | null; level_max: number | null; kind: string };
  if (!t) throw badRequest('No such table');
  return randomTables.create(db, {
    name: `${t.name.replace(/ \(your copy\)$/, '')} (your copy)`,
    die: t.die,
    entries: t.entries,
    source: 'user',
    region_id: t.region_id,
    level_min: t.level_min,
    level_max: t.level_max,
    kind: t.kind,
    auto: false,
  });
}
