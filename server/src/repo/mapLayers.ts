/**
 * The campaign on the map (GM only): open quests, the places in the campaign's adventures, where people are, and the
 * prepared encounters, each drawn at the pin of its place (or of the nearest place above it that has a pin on this
 * map). Also the region panel: a region's terrain, its encounter tables and its places, alongside its state in the
 * campaign (regionState).
 */
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { notFound } from '../lib/errors.js';
import { placeProfile } from './places.js';
import { regionState } from './regionState.js';
import { types } from './recordTypes.js';

/** Record types that are places (what an adventure or a quest can happen at). */
/** Places worth listing inside a region (not the region's own sub-regions). */

export type LayerId = 'quests' | 'adventures' | 'people' | 'encounters';
export interface LayerItem {
  id: string;
  label: string;
  /** Where it opens in the GM app. */
  href: string;
  hint?: string;
}
/** One layer's things at one place. */
export interface LayerSpot {
  layer: LayerId;
  entity_id: string;
  place: string;
  x: number;
  y: number;
  items: LayerItem[];
}

/** The pin on this map for a record, or for the nearest record above it (up to six levels) that has one. */
function pinFinder(db: DB, mapId: number) {
  const pins = new Map<string, { x: number; y: number; label: string; entity_id: string }>();
  for (const m of db.prepare('SELECT entity_id, x, y, label FROM map_markers WHERE map_id = ? AND entity_id IS NOT NULL').all(mapId) as {
    entity_id: string;
    x: number;
    y: number;
    label: string;
  }[])
    if (!pins.has(m.entity_id)) pins.set(m.entity_id, m);
  const parent = db.prepare('SELECT parent_id FROM entities WHERE id = ?');
  const cache = new Map<string, ReturnType<typeof find>>();
  function find(id: string) {
    let cur: string | null = id;
    for (let i = 0; cur && i < 7; i++) {
      const pin = pins.get(cur);
      if (pin) return pin;
      cur = (parent.get(cur) as { parent_id: string | null } | undefined)?.parent_id ?? null;
    }
    return null;
  }
  return (id: string | null | undefined) => {
    if (!id) return null;
    if (!cache.has(id)) cache.set(id, find(id));
    return cache.get(id) ?? null;
  };
}

export function campaignLayers(db: DB, campaignId: number, mapId: number): LayerSpot[] {
  const pinOf = pinFinder(db, mapId);
  const spots = new Map<string, LayerSpot>();
  const add = (layer: LayerId, placeId: string | null | undefined, item: LayerItem) => {
    const pin = pinOf(placeId);
    if (!pin) return;
    const key = `${layer}:${pin.entity_id}`;
    const s = spots.get(key) ?? { layer, entity_id: pin.entity_id, place: pin.label, x: pin.x, y: pin.y, items: [] };
    if (!s.items.some((i) => i.id === item.id)) s.items.push(item);
    spots.set(key, s);
  };

  // Quests still in play (open, active or rumoured), at their place.
  for (const q of db
    .prepare(`SELECT id, title, status, player_visible, location_id FROM quests WHERE campaign_id = ? AND status IN ('open', 'active', 'rumoured') AND location_id IS NOT NULL`)
    .all(campaignId) as { id: number; title: string; status: string; player_visible: number; location_id: string }[])
    add('quests', q.location_id, { id: `quest:${q.id}`, label: q.title, href: '/campaign/quests', hint: `${q.status}${q.player_visible ? '' : ', hidden from players'}` });

  // The places in the campaign's adventures (not finished or shelved) and their scenes.
  const places = types(db).with('place');
  const isPlace = db.prepare(`SELECT 1 FROM entities WHERE id = ? AND type IN (${places.map(() => '?').join(',') || "''"})`);
  for (const a of db.prepare(`SELECT id, title, status, linked_ids FROM adventures WHERE campaign_id = ? AND status NOT IN ('completed', 'shelved')`).all(campaignId) as {
    id: number;
    title: string;
    status: string;
    linked_ids: string;
  }[]) {
    const ids = new Set(parseJson<string[]>(a.linked_ids, []));
    for (const s of db.prepare('SELECT linked_ids FROM scenes WHERE adventure_id = ?').all(a.id) as { linked_ids: string }[]) for (const id of parseJson<string[]>(s.linked_ids, [])) ids.add(id);
    for (const id of ids) if (isPlace.get(id, ...places)) add('adventures', id, { id: `adventure:${a.id}`, label: a.title, href: `/adventure/${a.id}`, hint: a.status });
  }

  // Where people live or are found.
  for (const r of db
    .prepare(
      `SELECT DISTINCT r.source_id id, e.name, r.target_id place FROM relationships r JOIN entities e ON e.id = r.source_id
       WHERE e.type = 'npc' AND e.archived = 0 AND r.type IN ('lives_in', 'present_at')`,
    )
    .all() as { id: string; name: string; place: string }[])
    add('people', r.place, { id: r.id, label: r.name, href: `/e/${r.id}` });

  // Prepared and running encounters with a place.
  for (const e of db.prepare(`SELECT id, title, status, location_id FROM encounters WHERE campaign_id = ? AND status != 'finished' AND location_id IS NOT NULL`).all(campaignId) as {
    id: number;
    title: string;
    status: string;
    location_id: string;
  }[])
    add('encounters', e.location_id, { id: `encounter:${e.id}`, label: e.title, href: `/tracker/${e.id}`, hint: e.status });

  for (const s of spots.values()) s.items.sort((a, b) => a.label.localeCompare(b.label));
  return [...spots.values()];
}

/** Every record inside a region (its places and what's in them), up to four levels down. */
function inside(db: DB, regionId: string): string[] {
  return (
    db
      .prepare(
        `WITH RECURSIVE inside(id, depth) AS (SELECT id, 0 FROM entities WHERE id = ? UNION ALL SELECT e.id, inside.depth + 1 FROM entities e JOIN inside ON e.parent_id = inside.id WHERE inside.depth < 4)
         SELECT id FROM inside WHERE id != ?`,
      )
      .all(regionId, regionId) as { id: string }[]
  ).map((r) => r.id);
}

/** The region panel: terrain, encounter tables, places inside, and (with a campaign) its state in that campaign. */
export function regionPanel(db: DB, regionId: string, campaignId: number | null) {
  const r = db.prepare('SELECT id, name, type FROM entities WHERE id = ?').get(regionId) as { id: string; name: string; type: string } | undefined;
  if (!r) throw notFound('Region');
  const ids = inside(db, regionId);
  const name = db.prepare(`SELECT id, name, type FROM entities WHERE id = ? AND archived = 0`);
  const places = ids
    .map((id) => name.get(id) as { id: string; name: string; type: string } | undefined)
    .filter((e): e is { id: string; name: string; type: string } => !!e && types(db).get(e.type)?.pin === 'site')
    .sort((a, b) => a.name.localeCompare(b.name));
  const tables = (db.prepare(`SELECT id, name, die FROM random_tables WHERE source LIKE ?`).all(`%(${regionId})%`) as { id: number; name: string; die: string }[]).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  let state: ReturnType<typeof regionState> | null = null;
  if (campaignId) {
    try {
      state = regionState(db, campaignId, regionId);
    } catch {
      state = null;
    }
  }
  const profile = placeProfile(db, regionId);
  return { region: r, terrain: profile.terrain.length ? { label: r.name, terrain: profile.terrain } : null, profile, tables, places, state };
}
