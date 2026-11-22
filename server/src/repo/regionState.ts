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
import { realmIntros } from './realms.js';

/**
 * The regions a campaign's state is kept for: records of a region-sized type (a region, nation or domain) inside a
 * continent, realm or domain, in the realms' order. A continent's or realm's own record isn't one (a domain's is: the
 * domain is the region), nor is a region inside another region. A world with no continents keeps its regions in the
 * world itself, so they count there too.
 */
export function regionIds(db: DB): string[] {
  const keys = types(db).with('regionLike');
  if (!keys.length) return [];
  const introOf = new Map<string, string>(); // record → the kind of realm it introduces
  const kinds = new Map((db.prepare('SELECT id, kind FROM realms').all() as { id: string; kind: string }[]).map((r) => [r.id, r.kind]));
  for (const [realm, id] of realmIntros(db)) introOf.set(id, kinds.get(realm) ?? '');
  const rows = db
    .prepare(
      `SELECT e.id, r.kind, e.parent_id, p.type parent_type FROM entities e LEFT JOIN realms r ON r.id = e.realm LEFT JOIN entities p ON p.id = e.parent_id
       WHERE e.archived = 0 AND e.type IN (${keys.map(() => '?').join(',')}) ORDER BY COALESCE(r.sort_order, 0), e.id`,
    )
    .all(...keys) as { id: string; kind: string | null; parent_id: string | null; parent_type: string | null }[];
  const regionLike = new Set(keys);
  const regions = rows.filter(
    (r) => (!introOf.has(r.id) || introOf.get(r.id) === 'domain') && (!r.parent_type || !regionLike.has(r.parent_type) || introOf.has(r.parent_id!)),
  );
  const inside = regions.filter((r) => r.kind && r.kind !== 'world');
  return (inside.length ? inside : regions).map((r) => r.id);
}

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

/**
 * The faction that holds a region: the region's own "Ruling faction" fact (its template's), or else the faction whose
 * record names the region as its main dominion (the archive's wording).
 */
function holder(db: DB, regionId: string) {
  const fields = (db.prepare('SELECT fields FROM entities WHERE id = ?').get(regionId) as { fields: string } | undefined)?.fields ?? '[]';
  const fact = parseJson<[string, string][]>(fields, []).find(([k, v]) => /^ruling faction$/i.test(k) && v.trim())?.[1] ?? '';
  const named = /\[([A-Z]{2,5}-[A-Z0-9-]+)\]/.exec(fact)?.[1];
  const byFact = named
    ? (db.prepare('SELECT id, name FROM entities WHERE id = ?').get(named) as { id: string; name: string } | undefined)
    : fact
      ? (db.prepare('SELECT id, name FROM entities WHERE lower(name) = lower(?) AND archived = 0 LIMIT 1').get(fact.trim()) as { id: string; name: string } | undefined)
      : undefined;
  return byFact ?? (db.prepare(`SELECT id, name FROM entities WHERE type = 'faction' AND body LIKE ? LIMIT 1`).get(`%Main dominion:%[${regionId}]%`) as { id: string; name: string } | undefined) ?? null;
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
  return regionIds(db).map((id) => regionState(db, campaignId, id));
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
