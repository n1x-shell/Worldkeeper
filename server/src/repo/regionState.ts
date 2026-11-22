/**
 * The state of the world, region by region, for a campaign: who holds each region, which agendas and standing touch
 * it, what has changed there, what the party has seen and found, and what's still to find. The GM sees all of it;
 * players get a short "what you've heard lately" built only from what they already know.
 */
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { rankOf } from '../../../shared/standing.js';
import { types } from './recordTypes.js';

export const REGION_IDS = [
  'REG-001',
  'REG-002',
  'REG-003',
  'REG-004',
  'REG-005',
  'REG-006',
  'REG-301',
  'REG-302',
  'REG-303',
  'REG-304',
  'REG-305',
  'REG-306',
  'ETH-501',
  'ETH-502',
  'ETH-503',
  'ETH-504',
  'ETH-505',
  'ETH-506',
  'ETH-507',
];

/** Every record inside a region (its places, and what's in them), up to four levels down. */
function within(db: DB, regionId: string): Set<string> {
  const rows = db
    .prepare(
      `WITH RECURSIVE inside(id, depth) AS (SELECT id, 0 FROM entities WHERE id = ? UNION ALL SELECT e.id, inside.depth + 1 FROM entities e JOIN inside ON e.parent_id = inside.id WHERE inside.depth < 4)
       SELECT id FROM inside`,
    )
    .all(regionId) as { id: string }[];
  const ids = new Set(rows.map((r) => r.id));
  // People who live there count too.
  const q = `SELECT source_id FROM relationships WHERE type = 'lives_in' AND target_id IN (${[...ids].map(() => '?').join(',')})`;
  for (const r of db.prepare(q).all(...ids) as { source_id: string }[]) ids.add(r.source_id);
  return ids;
}

/** The faction that holds a region: the one whose record names it as its main dominion. */
function holder(db: DB, regionId: string) {
  return (db.prepare(`SELECT id, name FROM entities WHERE type = 'faction' AND body LIKE ? LIMIT 1`).get(`%Main dominion:%[${regionId}]%`) as { id: string; name: string } | undefined) ?? null;
}

export function regionState(db: DB, campaignId: number, regionId: string) {
  const r = db.prepare('SELECT id, name, type, player_summary, revealed FROM entities WHERE id = ?').get(regionId) as
    | { id: string; name: string; type: string; player_summary: string; revealed: number }
    | undefined;
  if (!r) throw notFound('Region');
  const ids = within(db, regionId);
  const list = [...ids];
  const reg = types(db);
  const typeOf = new Map((db.prepare(`SELECT id, type FROM entities WHERE id IN (${list.map(() => '?').join(',') || "''"})`).all(...list) as { id: string; type: string }[]).map((x) => [x.id, x.type]));
  const inList = `(${list.map(() => '?').join(',')})`;
  const name = db.prepare('SELECT name, type FROM entities WHERE id = ?');
  const nm = (id: string) => (name.get(id) as { name: string } | undefined)?.name ?? id;
  const hold = holder(db, regionId);

  // Factions with a stake: the holder, and the factions of people who live there.
  const factionIds = new Set<string>(hold ? [hold.id] : []);
  for (const f of db
    .prepare(`SELECT DISTINCT r.target_id FROM relationships r JOIN entities e ON e.id = r.target_id WHERE r.type = 'member_of' AND e.type = 'faction' AND r.source_id IN ${inList}`)
    .all(...list) as { target_id: string }[])
    factionIds.add(f.target_id);
  const fl = [...factionIds];
  const fIn = `(${fl.map(() => '?').join(',') || "''"})`;
  const agendas = db
    .prepare(`SELECT p.id, p.faction_id, p.title, p.progress, p.segments, p.status FROM faction_plans p WHERE p.campaign_id = ? AND p.status = 'active' AND p.faction_id IN ${fIn}`)
    .all(campaignId, ...fl) as { id: number; faction_id: string; title: string; progress: number; segments: number; status: string }[];
  const standing = (
    db.prepare(`SELECT faction_id, renown FROM faction_standing WHERE campaign_id = ? AND faction_id IN ${fIn}`).all(campaignId, ...fl) as { faction_id: string; renown: number }[]
  ).map((s) => ({ ...s, name: nm(s.faction_id), rank: rankOf(s.renown) }));

  // What has changed there in this campaign.
  const changes = db
    .prepare(`SELECT id, entity_id, field, value, status, created_at FROM campaign_state WHERE campaign_id = ? AND entity_id IN ${inList} ORDER BY id DESC LIMIT 20`)
    .all(campaignId, ...list) as { id: number; entity_id: string; field: string; value: string; status: string; created_at: string }[];

  // What the party has seen there.
  const discovered = (db.prepare(`SELECT DISTINCT entity_id FROM map_discoveries WHERE campaign_id = ? AND entity_id IN ${inList}`).all(campaignId, ...list) as { entity_id: string }[]).map(
    (x) => x.entity_id,
  );
  const visits = db
    .prepare(
      `SELECT t.entity_id, t.label, s.number session, t.created_at FROM map_travel t LEFT JOIN sessions s ON s.id = t.session_id WHERE t.campaign_id = ? AND t.entity_id IN ${inList} ORDER BY t.id DESC LIMIT 10`,
    )
    .all(campaignId, ...list) as { entity_id: string; label: string; session: number | null; created_at: string }[];

  // What's still to find, and what the party has heard.
  const clues = (
    db
      .prepare(
        `SELECT cl.id, cl.note, cl.entity_id, se.title secret, m.title mystery FROM clues cl JOIN secrets se ON se.id = cl.secret_id LEFT JOIN mysteries m ON m.id = se.mystery_id
         LEFT JOIN clue_found cf ON cf.clue_id = cl.id AND cf.campaign_id = ? WHERE cf.clue_id IS NULL AND cl.entity_id IN ${inList}`,
      )
      .all(campaignId, ...list) as { id: number; note: string; entity_id: string; secret: string; mystery: string | null }[]
  ).slice(0, 20);
  const rumours = db
    .prepare(`SELECT r.id, r.text, r.source_id, r.about, h.heard_at FROM rumours r LEFT JOIN rumour_heard h ON h.rumour_id = r.id AND h.campaign_id = ? WHERE r.stale = 0`)
    .all(campaignId) as {
    id: number;
    text: string;
    source_id: string | null;
    about: string;
    heard_at: string | null;
  }[];
  const here = rumours.filter((x) => (x.source_id && ids.has(x.source_id)) || parseJson<string[]>(x.about, []).some((a) => ids.has(a)));
  return {
    region: { id: r.id, name: r.name, type: r.type },
    holder: hold,
    places: list.filter((id) => id !== regionId && reg.get(typeOf.get(id) ?? '')?.pin === 'site').length,
    agendas: agendas.map((a) => ({ ...a, faction: nm(a.faction_id) })),
    standing,
    changes: changes.map((c) => ({ ...c, entity: nm(c.entity_id) })),
    discovered: discovered.map((id) => ({ id, name: nm(id) })),
    visits,
    clues,
    rumours: {
      heard: here.filter((x) => x.heard_at).length,
      unheard: here.filter((x) => !x.heard_at).length,
      latest: here
        .filter((x) => x.heard_at)
        .sort((a, b) => (b.heard_at! > a.heard_at! ? 1 : -1))
        .slice(0, 5)
        .map((x) => x.text),
    },
  };
}

export function allRegionStates(db: DB, campaignId: number) {
  return REGION_IDS.filter((id) => db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id)).map((id) => regionState(db, campaignId, id));
}

/**
 * The players' version: only regions they know, and only what they've seen or heard there: places discovered, when
 * they were last there, and the rumours they've heard. No GM notes, no agendas, no unfound clues.
 */
export function playerRegions(db: DB, campaignId: number) {
  const revealed = db.prepare('SELECT 1 FROM entities WHERE id = ? AND revealed = 1');
  return allRegionStates(db, campaignId)
    .filter((s) => revealed.get(s.region.id) && (s.discovered.length || s.visits.length || s.rumours.heard))
    .map((s) => ({
      id: s.region.id,
      name: s.region.name,
      discovered: s.discovered.filter((d) => revealed.get(d.id)).map((d) => d.name),
      // A stop at an unrevealed place isn't named for players.
      lastVisit: s.visits[0] ? { place: !s.visits[0].entity_id || revealed.get(s.visits[0].entity_id) ? s.visits[0].label : null, session: s.visits[0].session } : null,
      heard: s.rumours.latest,
    }));
}
