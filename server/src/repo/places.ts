/**
 * A place's profile for encounters and treasure (shared/places.ts): its terrain, danger and wealth, from its own facts,
 * else the places it sits in, else (terrain only) an installed setting pack's encounters/terrain.json. Danger defaults
 * to risky and wealth to modest.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { findPack, installedPacks } from '../packs/registry.js';
import { readDanger, readTerrain, readWealth, type Danger, type Terrain, type Wealth } from '../../../shared/places.js';
import { types } from './recordTypes.js';

export interface PlaceProfile {
  terrain: Terrain[];
  danger: Danger;
  wealth: Wealth;
  /** Where each came from: the record whose fact it is (or 'pack'), or null for the default. */
  from: { terrain: string | null; danger: string | null; wealth: string | null };
}

/** The installed packs' terrain for their places (their encounters/terrain.json), by record ID. */
export function packTerrains(db: DB): Record<string, { label: string; terrain: string[] }> {
  const out: Record<string, { label: string; terrain: string[] }> = {};
  for (const p of installedPacks(db)) {
    const dir = findPack(p.id)?.dir;
    const f = dir && path.join(dir, 'encounters', 'terrain.json');
    if (f && fs.existsSync(f)) Object.assign(out, (JSON.parse(fs.readFileSync(f, 'utf8')) as { regions?: typeof out }).regions ?? {});
  }
  return out;
}

const fact = (fields: [string, string][], name: string) => fields.find(([k]) => k.toLowerCase() === name)?.[1] ?? null;

/** The place and the places it sits in, nearest first. */
function chainOf(db: DB, id: string) {
  const get = db.prepare('SELECT id, parent_id, fields FROM entities WHERE id = ?');
  const out: { id: string; fields: [string, string][] }[] = [];
  for (let cur: string | null = id, guard = 0; cur && guard < 8; guard++) {
    const r = get.get(cur) as { id: string; parent_id: string | null; fields: string } | undefined;
    if (!r || out.some((x) => x.id === r.id)) break;
    out.push({ id: r.id, fields: parseJson<[string, string][]>(r.fields, []) });
    cur = r.parent_id;
  }
  return out;
}

export function placeProfile(db: DB, id: string): PlaceProfile {
  const chain = chainOf(db, id);
  const p: PlaceProfile = { terrain: [], danger: 'risky', wealth: 'modest', from: { terrain: null, danger: null, wealth: null } };
  for (const e of chain) {
    if (!p.from.terrain) {
      const t = readTerrain(fact(e.fields, 'terrain'));
      if (t.length) [p.terrain, p.from.terrain] = [t, e.id];
    }
    if (!p.from.danger) {
      const d = readDanger(fact(e.fields, 'danger'));
      if (d) [p.danger, p.from.danger] = [d, e.id];
    }
    if (!p.from.wealth) {
      const w = readWealth(fact(e.fields, 'wealth'));
      if (w) [p.wealth, p.from.wealth] = [w, e.id];
    }
  }
  if (!p.from.terrain) {
    const pt = packTerrains(db);
    const hit = chain.find((e) => pt[e.id]?.terrain?.length);
    if (hit) [p.terrain, p.from.terrain] = [readTerrain(pt[hit.id].terrain.join(' ')), hit.id];
  }
  return p;
}

/** Every region-sized place, with its profile: the choices for encounters and treasure by place. */
export function regionPlaces(db: DB) {
  const keys = types(db).with('regionLike');
  if (!keys.length) return [];
  const rows = db.prepare(`SELECT id, name FROM entities WHERE archived = 0 AND type IN (${keys.map(() => '?').join(',')}) ORDER BY name`).all(...keys) as { id: string; name: string }[];
  return rows.map((r) => ({ id: r.id, label: r.name, ...placeProfile(db, r.id) }));
}

/** The region-sized places that have (or inherit) a terrain: the choices for encounters by region. */
export const placesWithTerrain = (db: DB) => regionPlaces(db).filter((r) => r.terrain.length);
