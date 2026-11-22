/**
 * Encounters from the GM's books: groups of creatures that fit a party's level and the terrain, by the Dungeon
 * Master's Guide (2024) XP budgets; the world's regions given as terrain (packs/worldkeeper/encounters/terrain.json); and the
 * book creatures an encounter table's row names ("4 bandits and a bandit captain").
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { badRequest } from '../lib/errors.js';
import { bookCreatureData } from './bookData.js';
import { worldkeeperPath } from '../packs/paths.js';

type DB = Database.Database;

/** XP per character for a Low, Moderate or High difficulty encounter, by level (DMG 2024). */
const BUDGET: [number, number, number][] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];
export const DIFFICULTIES = ['low', 'moderate', 'high'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const TERRAINS = ['arctic', 'coastal', 'desert', 'forest', 'grassland', 'hill', 'mountain', 'swamp', 'underdark', 'underwater', 'urban', 'planar'] as const;

export function xpBudget(level: number, size: number, difficulty: Difficulty) {
  const row = BUDGET[Math.max(1, Math.min(20, Math.round(level))) - 1];
  return row[DIFFICULTIES.indexOf(difficulty)] * Math.max(1, Math.min(10, Math.round(size)));
}

const TERRAIN_FILE = worldkeeperPath('encounters', 'terrain.json');
let terrainCache: Record<string, { label: string; terrain: string[] }> | null = null;
/** The world's regions as terrain (empty for a world that has none mapped). */
export function regionTerrains(): Record<string, { label: string; terrain: string[] }> {
  if (!terrainCache) terrainCache = fs.existsSync(TERRAIN_FILE) ? (JSON.parse(fs.readFileSync(TERRAIN_FILE, 'utf8')).regions as Record<string, { label: string; terrain: string[] }>) : {};
  return terrainCache;
}
/** The terrain of the first place in a chain (a place, then what it's in) that has one. */
export const terrainFor = (ids: string[]) => ids.map((id) => regionTerrains()[id]?.terrain).find(Boolean) ?? [];

export interface EncounterIdea {
  label: string;
  creatures: { id: string; name: string; cr: string; xp: number; count: number }[];
  xp: number;
  budget: number;
}

/** A creature lives in a terrain when its environments name it ("planar" matches every plane). */
const livesIn = (env: string[], terrains: string[]) => !terrains.length || env.some((e) => terrains.some((t) => e === t || (t === 'planar' && e.startsWith('planar'))));

/** A few different groups of book creatures for the party, within the budget. */
export function suggestEncounters(
  db: DB,
  opts: { level: number; size?: number; difficulty?: Difficulty; terrain?: string[]; count?: number; rng?: () => number },
): { budget: number; ideas: EncounterIdea[]; pool: number } {
  const rng = opts.rng ?? Math.random;
  const difficulty = opts.difficulty ?? 'moderate';
  if (!DIFFICULTIES.includes(difficulty)) throw badRequest('Difficulty is low, moderate or high');
  const budget = xpBudget(opts.level, opts.size ?? 4, difficulty);
  const terrain = opts.terrain ?? [];
  const fits = bookCreatureData(db).filter((c) => (c.xp as number) > 0 && (c.xp as number) <= budget);
  // Creatures of the terrain; those found anywhere (mostly people) only when too few belong there.
  const local = fits.filter((c) => livesIn((c.environment as string[]) ?? [], terrain));
  const pool = local.length >= 12 || !terrain.length ? local : [...local, ...fits.filter((c) => ((c.environment as string[]) ?? []).includes('any'))];
  const pick = <T>(l: T[]) => l[Math.floor(rng() * l.length)];
  const within = (lo: number, hi: number) => pool.filter((c) => (c.xp as number) >= lo * budget && (c.xp as number) <= hi * budget);
  const entry = (c: Record<string, unknown>, count: number) => ({ id: c.id as string, name: c.name as string, cr: c.cr as string, xp: c.xp as number, count });
  const ideas: EncounterIdea[] = [];
  const seen = new Set<string>();
  for (let tries = 0; ideas.length < (opts.count ?? 3) && tries < 30; tries++) {
    const shape = ['solo', 'leader', 'pack'][tries % 3];
    let creatures: EncounterIdea['creatures'] = [];
    let label = '';
    if (shape === 'solo') {
      const c = within(0.6, 1);
      if (!c.length) continue;
      creatures = [entry(pick(c), 1)];
      label = 'One strong foe';
    } else if (shape === 'leader') {
      const leaders = within(0.35, 0.65);
      if (!leaders.length) continue;
      const lead = pick(leaders);
      const rest = budget - (lead.xp as number);
      // Followers that share a terrain or a type with the leader read as one group.
      const kind = (c: Record<string, unknown>) => /^\S+(?: or \S+)? (\S+)/.exec(String(c.meta))?.[1];
      const kin = pool.filter((c) => c !== lead && (c.xp as number) <= rest / 2 && kind(c) === kind(lead));
      const followers = kin.length ? kin : pool.filter((c) => c !== lead && (c.xp as number) <= rest / 2);
      if (!followers.length) continue;
      const f = pick(followers);
      creatures = [entry(lead, 1), entry(f, Math.min(8, Math.floor(rest / (f.xp as number))))];
      label = 'A leader and followers';
    } else {
      const c = within(1 / 8, 1 / 2);
      if (!c.length) continue;
      const one = pick(c);
      creatures = [entry(one, Math.min(8, Math.floor(budget / (one.xp as number))))];
      label = 'A pack';
    }
    const key = creatures.map((c) => c.id).join('+');
    if (seen.has(key) || !creatures.every((c) => c.count > 0)) continue;
    seen.add(key);
    ideas.push({ label, creatures, xp: creatures.reduce((n, c) => n + c.xp * c.count, 0), budget });
  }
  return { budget, ideas, pool: pool.length };
}

/**
 * The book creatures a table row names in plain words ("4 bandits and a bandit captain"), for their stat blocks.
 * Names given as a record ("a Legion Scout [CRE-006]") are the world's own and skipped, as are rows that aren't fights
 * or meetings (signs and strange sights).
 */
export function creatureMentions(db: DB, text: string): { id: string; name: string }[] {
  if (/\*\*(Sign|Strange)\.\*\*/.test(text)) return [];
  const plain = text.replace(/[A-Z][\w' -]*\s*\[[A-Z]{2,4}-\d+\]/g, ' ');
  const found: { id: string; name: string; at: number; len: number }[] = [];
  const creatures = bookCreatureData(db)
    .map((c) => ({ id: c.id as string, name: c.name as string }))
    .filter((c) => c.name.length > 2)
    .sort((a, b) => b.name.length - a.name.length);
  for (const c of creatures) {
    const n = c.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Written lower-case, as a kind of creature, singular or plural ("wolf", "wolves", "bandits").
    const plural = n.endsWith('f') ? `${n.slice(0, -1)}ves` : n.endsWith('y') ? `${n.slice(0, -1)}ies` : `${n}(?:e?s)?`;
    const re = new RegExp(`\\b(?:${plural}|${n})\\b`, 'g');
    for (const m of plain.matchAll(re)) {
      const at = m.index ?? 0;
      if (found.some((f) => at < f.at + f.len && f.at < at + m[0].length)) continue;
      found.push({ ...c, at, len: m[0].length });
    }
  }
  return [...new Map(found.sort((a, b) => a.at - b.at).map((f) => [f.id, { id: f.id, name: f.name }])).values()];
}
