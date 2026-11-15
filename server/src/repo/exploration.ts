/**
 * Map exploration for a campaign: the places the party has discovered on each map, and the trail of where it has been.
 * The GM can prepare these at any time; players only see them while the active campaign has a live session
 * ("in play"), as fog of war and a party marker on the handbook's maps.
 */
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getActiveCampaignId } from './campaigns.js';

export interface TravelStop {
  id: number;
  entity_id: string | null;
  x: number;
  y: number;
  label: string;
  session_id: number | null;
  created_at: string;
}

/** The active campaign and its live session, when one is being played. */
export function inPlay(db: DB): { campaignId: number; sessionId: number } | null {
  const campaignId = getActiveCampaignId(db);
  if (campaignId == null) return null;
  const s = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
  return s ? { campaignId, sessionId: s.id } : null;
}

function liveSessionId(db: DB, campaignId: number): number | null {
  const s = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
  return s?.id ?? null;
}

function checkCampaignAndMap(db: DB, campaignId: number, mapId: number) {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  if (!db.prepare('SELECT 1 FROM maps WHERE id = ?').get(mapId)) throw notFound('Map');
}

/** Places discovered on a map. The campaign's starting place counts as discovered from the start. */
export function discoveredOn(db: DB, campaignId: number, mapId: number): string[] {
  const ids = new Set((db.prepare('SELECT entity_id FROM map_discoveries WHERE campaign_id = ? AND map_id = ?').all(campaignId, mapId) as { entity_id: string }[]).map((r) => r.entity_id));
  const start = db.prepare('SELECT starting_location_id FROM campaigns WHERE id = ?').get(campaignId) as { starting_location_id: string | null } | undefined;
  if (start?.starting_location_id && db.prepare('SELECT 1 FROM map_markers WHERE map_id = ? AND entity_id = ?').get(mapId, start.starting_location_id)) ids.add(start.starting_location_id);
  return [...ids];
}

export function trailOn(db: DB, campaignId: number, mapId: number): TravelStop[] {
  return db.prepare('SELECT id, entity_id, x, y, label, session_id, created_at FROM map_travel WHERE campaign_id = ? AND map_id = ? ORDER BY id').all(campaignId, mapId) as TravelStop[];
}

export function explorationFor(db: DB, campaignId: number, mapId: number) {
  checkCampaignAndMap(db, campaignId, mapId);
  return {
    campaign_id: campaignId,
    map_id: mapId,
    live: liveSessionId(db, campaignId) != null,
    discovered: discoveredOn(db, campaignId, mapId),
    trail: trailOn(db, campaignId, mapId),
  };
}

export function setDiscovered(db: DB, campaignId: number, mapId: number, entityId: string, discovered: boolean) {
  checkCampaignAndMap(db, campaignId, mapId);
  if (!db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId)) throw notFound('Record');
  if (discovered) db.prepare('INSERT OR IGNORE INTO map_discoveries (campaign_id, map_id, entity_id, session_id) VALUES (?, ?, ?, ?)').run(campaignId, mapId, entityId, liveSessionId(db, campaignId));
  else db.prepare('DELETE FROM map_discoveries WHERE campaign_id = ? AND map_id = ? AND entity_id = ?').run(campaignId, mapId, entityId);
  return explorationFor(db, campaignId, mapId);
}

/**
 * Move the party: to a place on the map (its pin's position), or to a point. The place becomes discovered, and a
 * live session gets a line in its log.
 */
export function travel(db: DB, campaignId: number, mapId: number, to: { entity_id?: string | null; x?: number; y?: number; label?: string }) {
  checkCampaignAndMap(db, campaignId, mapId);
  let { x, y } = to;
  let label = to.label?.trim() ?? '';
  if (to.entity_id) {
    const m = db.prepare('SELECT x, y, label FROM map_markers WHERE map_id = ? AND entity_id = ? LIMIT 1').get(mapId, to.entity_id) as { x: number; y: number; label: string } | undefined;
    if (!m) throw badRequest('That place has no pin on this map');
    x = m.x;
    y = m.y;
    if (!label) {
      const e = db.prepare('SELECT name FROM entities WHERE id = ?').get(to.entity_id) as { name: string } | undefined;
      label = e?.name ?? m.label;
    }
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) throw badRequest('Choose a place, or a point on the map');
  const sessionId = liveSessionId(db, campaignId);
  db.transaction(() => {
    db.prepare('INSERT INTO map_travel (campaign_id, map_id, entity_id, x, y, label, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(campaignId, mapId, to.entity_id ?? null, x, y, label, sessionId);
    if (to.entity_id) db.prepare('INSERT OR IGNORE INTO map_discoveries (campaign_id, map_id, entity_id, session_id) VALUES (?, ?, ?, ?)').run(campaignId, mapId, to.entity_id, sessionId);
    if (sessionId != null)
      db.prepare(`INSERT INTO session_log (session_id, kind, text, entity_id) VALUES (?, 'travel', ?, ?)`).run(sessionId, `The party travelled to ${label || 'a new place'}.`, to.entity_id ?? null);
  })();
  return explorationFor(db, campaignId, mapId);
}

export function removeTravel(db: DB, campaignId: number, stopId: number) {
  const r = db.prepare('SELECT map_id FROM map_travel WHERE id = ? AND campaign_id = ?').get(stopId, campaignId) as { map_id: number } | undefined;
  if (!r) throw notFound('Travel stop');
  db.prepare('DELETE FROM map_travel WHERE id = ?').run(stopId);
  return explorationFor(db, campaignId, r.map_id);
}

export function clearTrail(db: DB, campaignId: number, mapId: number) {
  checkCampaignAndMap(db, campaignId, mapId);
  db.prepare('DELETE FROM map_travel WHERE campaign_id = ? AND map_id = ?').run(campaignId, mapId);
  return explorationFor(db, campaignId, mapId);
}

/**
 * What players may see of the exploration on a map: only while in play, only revealed places, and the party's
 * trail. Null outside play, so the maps look exactly as they do without a campaign.
 */
export function playerExploration(db: DB, mapId: number, revealed: Set<string>) {
  const play = inPlay(db);
  if (!play) return null;
  const trail = trailOn(db, play.campaignId, mapId).map((t) => ({
    x: t.x,
    y: t.y,
    label: t.entity_id && !revealed.has(t.entity_id) ? '' : t.label,
  }));
  return {
    discovered: discoveredOn(db, play.campaignId, mapId).filter((id) => revealed.has(id)),
    trail,
  };
}
