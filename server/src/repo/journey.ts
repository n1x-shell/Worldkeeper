/**
 * "Travel to here": move the party on the map, work out the miles and the days on the road at a pace (shared/travel),
 * move the campaign's calendar on by those days, and roll the region's encounter table once a day. Each part is
 * the GM's choice; a live session gets every roll in its log.
 */
import { encounterTableFor } from './tables.js';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { PACES, milesBetween, travelDays, type Pace } from '../../../shared/travel.js';
import { travel, trailOn } from './exploration.js';
import { setCampaignDate } from './calendar.js';
import { rollTable } from './campaigns.js';
import { creatureMentions } from './encounters.js';

/** At most this many days of encounters are rolled at once. */
export const MAX_ROLLED_DAYS = 30;

/** The region a place is in (walking up its parents), or the region outline on this map that holds a point. */
export function regionAt(db: DB, mapId: number, at: { entity_id?: string | null; x: number; y: number }): string | null {
  const row = db.prepare('SELECT type, parent_id FROM entities WHERE id = ?');
  let cur = at.entity_id ?? null;
  for (let i = 0; cur && i < 8; i++) {
    const e = row.get(cur) as { type: string; parent_id: string | null } | undefined;
    if (!e) break;
    if (e.type === 'region' || e.type === 'ethereal_domain') return cur;
    cur = e.parent_id;
  }
  for (const s of db.prepare(`SELECT entity_id, points FROM map_shapes WHERE map_id = ? AND kind = 'region' AND entity_id IS NOT NULL`).all(mapId) as { entity_id: string; points: string }[])
    if (inside(parseJson<[number, number][]>(s.points, []), at.x, at.y)) return s.entity_id;
  return null;
}
function inside(poly: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The party's level: the average of the campaign's player characters (1 without any). */
export function partyLevel(db: DB, campaignId: number) {
  const r = db.prepare(`SELECT AVG(level) l FROM characters WHERE campaign_id = ? AND kind = 'pc'`).get(campaignId) as { l: number | null };
  return Math.max(1, Math.round(r.l ?? 1));
}

export interface JourneyInput {
  campaign_id: number;
  map_id: number;
  to: { entity_id?: string | null; x?: number; y?: number; label?: string };
  pace?: Pace;
  /** Days on the road; worked out from the map's scale when not given. */
  days?: number | null;
  advance?: boolean;
  roll?: boolean;
}

export function journey(db: DB, input: JourneyInput, rng: () => number = Math.random) {
  const pace: Pace = input.pace && input.pace in PACES ? input.pace : 'normal';
  const map = db.prepare('SELECT id, width, scale_miles FROM maps WHERE id = ?').get(input.map_id) as { id: number; width: number; scale_miles: number | null } | undefined;
  if (!map) throw badRequest('Unknown map');
  const from = trailOn(db, input.campaign_id, input.map_id).at(-1) ?? null;
  const exploration = travel(db, input.campaign_id, input.map_id, input.to);
  const to = exploration.trail.at(-1)!;
  const miles = from ? milesBetween(from, to, map) : null;
  const days = Math.max(0, Math.min(365, Math.round(input.days ?? (miles != null ? travelDays(miles, pace) : 0))));
  const where = to.label || 'a new place';
  let date: string | null = null;
  if (input.advance && days > 0) date = setCampaignDate(db, input.campaign_id, { days, reason: `travelling to ${where}` }).text;

  const rolls: { day: number; result: string; creatures: { id: string; name: string }[] }[] = [];
  const region = regionAt(db, input.map_id, { entity_id: to.entity_id, x: to.x, y: to.y });
  const table = region ? encounterTableFor(db, region, partyLevel(db, input.campaign_id), { generate: !!input.roll }) : null;
  if (input.roll && days > 0 && table) {
    const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(input.campaign_id) as { id: number } | undefined;
    for (let d = 1; d <= Math.min(days, MAX_ROLLED_DAYS); d++) {
      const r = rollTable(db, table.id, rng);
      rolls.push({ day: d, result: r.result, creatures: creatureMentions(db, r.result) });
      if (live) db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'note', ?)`).run(live.id, `On the road to ${where}, day ${d} (${table.name}): ${r.result}`);
    }
  }
  const regionName = region ? ((db.prepare('SELECT name FROM entities WHERE id = ?').get(region) as { name: string } | undefined)?.name ?? null) : null;
  return { exploration, miles, days, pace, date, region: region ? { id: region, name: regionName } : null, table, rolls };
}
