/**
 * Session prep from the world: everything the campaign's state says is relevant to the next session, gathered in one
 * place. Where the party is, what's nearby, the mysteries with clues still to find there, faction agendas about to
 * move, standing close to a rank change, the people met, open quests, and the tables for the region.
 *
 * Read-only: it never changes the session. The client can copy parts into empty prep fields.
 */
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { standingFor } from './standing.js';
import { BOOKS_REGION, treasureData } from './treasure.js';
import { bookTreasure } from './bookData.js';
import { moduleOn } from './modules.js';
import { placeProfile } from './places.js';
import { tablesFor } from './tables.js';
import { comingUp } from './calendar.js';
import { types } from './recordTypes.js';

interface Ent {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
}

export function sessionBriefing(db: DB, sessionId: number) {
  const s = db.prepare('SELECT id, campaign_id, number FROM sessions WHERE id = ?').get(sessionId) as { id: number; campaign_id: number; number: number } | undefined;
  if (!s) throw notFound('Session');
  const c = db.prepare('SELECT id, title, starting_location_id FROM campaigns WHERE id = ?').get(s.campaign_id) as { id: number; title: string; starting_location_id: string | null };
  const ent = db.prepare('SELECT id, name, type, parent_id FROM entities WHERE id = ?');
  const get = (id: string | null | undefined) => (id ? (ent.get(id) as Ent | undefined) : undefined);

  // The previous session's recap.
  const prev = db.prepare(`SELECT number, title, recap FROM sessions WHERE campaign_id = ? AND number < ? AND status = 'completed' ORDER BY number DESC LIMIT 1`).get(c.id, s.number) as
    | { number: number; title: string; recap: string }
    | undefined;

  // Where the party is: its last stop on any map, or where the campaign started.
  const stop = db.prepare('SELECT entity_id, label FROM map_travel WHERE campaign_id = ? ORDER BY id DESC LIMIT 1').get(c.id) as { entity_id: string | null; label: string } | undefined;
  const here = get(stop?.entity_id) ?? get(c.starting_location_id);
  const hereLabel = here?.name ?? stop?.label ?? '';

  // The chain of places it sits in (settlement, region, continent), and the region it belongs to.
  const chain: Ent[] = [];
  const reg = types(db);
  const isPlace = (e: Ent) => !!reg.get(e.type)?.traits.place;
  // A region-sized place below the continent or world level: a region, nation or domain (not the whole continent).
  const isRegion = (e: Ent) => !!reg.get(e.type)?.traits.regionLike && !reg.get(e.type)?.traits.intro;
  for (let e = here, guard = 0; e && guard < 8 && isPlace(e) && !chain.some((x) => x.id === e!.id); e = get(e.parent_id), guard++) chain.push(e);
  // A place with no region above it (a town straight under its continent) is its own region.
  const region = chain.find(isRegion) ?? chain.find((e) => e.id !== here?.id && !reg.get(e.type)?.traits.intro) ?? chain[0];

  // Places nearby: what the location contains, and its siblings within the same parent.
  // Ids that count as "here": the place, the place it's in, and what's nearby (not the whole continent).
  const ids = new Set(chain.slice(0, 2).map((e) => e.id));
  const nearbyRows = here
    ? (db
        .prepare(
          `SELECT id, name, type FROM entities WHERE archived = 0 AND (parent_id = ? OR parent_id = ?) AND id != ? AND type NOT IN ('npc','creature','rule','index','register','redirect') ORDER BY name LIMIT 24`,
        )
        .all(here.id, here.parent_id ?? '', here.id) as { id: string; name: string; type: string }[])
    : [];
  for (const n of nearbyRows) ids.add(n.id);

  // People: those who live here or nearby, and those the party has met in play.
  const locals = here
    ? (db
        .prepare(
          `SELECT DISTINCT e.id, e.name FROM relationships r JOIN entities e ON e.id = r.source_id
           WHERE r.type = 'lives_in' AND e.type = 'npc' AND r.target_id IN (${[...ids].map(() => '?').join(',')}) ORDER BY e.name LIMIT 20`,
        )
        .all(...ids) as { id: string; name: string }[])
    : [];
  const met = db
    .prepare(
      `SELECT e.id, e.name, MAX(l.id) last FROM session_log l JOIN sessions se ON se.id = l.session_id JOIN entities e ON e.id = l.entity_id
       WHERE se.campaign_id = ? AND e.type = 'npc' GROUP BY e.id ORDER BY last DESC LIMIT 12`,
    )
    .all(c.id) as { id: string; name: string }[];
  for (const p of [...locals, ...met]) ids.add(p.id);

  // Mysteries with clues still to find here: unfound clues pointing at anything nearby, for secrets not yet known.
  const clueRows = db
    .prepare(
      `SELECT cl.id, cl.kind, cl.note, cl.entity_id, se.title secret, se.id secret_id, m.title mystery, m.question, COALESCE(sp.state, 'unknown') state, se.about, se.source_id
       FROM clues cl JOIN secrets se ON se.id = cl.secret_id LEFT JOIN mysteries m ON m.id = se.mystery_id
       LEFT JOIN secret_progress sp ON sp.secret_id = se.id AND sp.campaign_id = ?
       LEFT JOIN clue_found cf ON cf.clue_id = cl.id AND cf.campaign_id = ?
       WHERE cf.clue_id IS NULL AND COALESCE(sp.state, 'unknown') != 'known'`,
    )
    .all(c.id, c.id) as {
    id: number;
    kind: string;
    note: string;
    entity_id: string | null;
    secret: string;
    secret_id: number;
    mystery: string | null;
    question: string;
    state: string;
    about: string;
    source_id: string | null;
  }[];
  const clues = clueRows
    .filter((r) => (r.entity_id && ids.has(r.entity_id)) || (r.source_id && ids.has(r.source_id)) || parseJson<string[]>(r.about, []).some((a) => ids.has(a)))
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      note: r.note,
      entity_id: r.entity_id,
      entity: r.entity_id ? (get(r.entity_id)?.name ?? null) : null,
      secret: r.secret,
      mystery: r.mystery,
      question: r.question,
      state: r.state,
    }));

  // Faction agendas close to their end.
  const agendas = db
    .prepare(
      `SELECT p.id, p.faction_id, e.name faction, p.title, p.progress, p.segments FROM faction_plans p LEFT JOIN entities e ON e.id = p.faction_id WHERE p.campaign_id = ? AND p.status = 'active' ORDER BY (p.segments - p.progress), p.id`,
    )
    .all(c.id) as { id: number; faction_id: string; faction: string | null; title: string; progress: number; segments: number }[];
  const agendasDue = agendas.filter((a) => a.segments - a.progress <= 2);

  // Standing close to a rank change (within 2 Renown either way).
  const standing = standingFor(db, c.id)
    .filter((r) => r.renown !== 0 || r.log.length)
    .map((r) => {
      const toNext = r.next ? r.next.at - r.renown : null;
      return { faction_id: r.faction_id, name: r.name, renown: r.renown, rank: r.rank, next: r.next, close: toNext != null && toNext <= 2 };
    });

  // Open quests.
  const quests = db.prepare(`SELECT id, title, status, description FROM quests WHERE campaign_id = ? AND status IN ('open', 'active', 'rumoured') ORDER BY id`).all(c.id) as {
    id: number;
    title: string;
    status: string;
    description: string;
  }[];

  // The party's level, for the right tier of table.
  const lv = db.prepare(`SELECT AVG(level) lv FROM characters WHERE campaign_id = ? AND kind = 'pc'`).get(c.id) as { lv: number | null };
  const level = Math.max(1, Math.round(lv.lv ?? 1));
  const tierKey = level <= 4 ? '1-4' : level <= 10 ? '5-10' : level <= 16 ? '11-16' : '17-20';

  // Tables for the region: the encounter tables tagged with it, and the treasure region it belongs to.
  const regionIds = region ? [region.id] : [];
  const tables = regionIds.length ? tablesFor(db, regionIds[0]) : [];
  const tLevel = (t: { level_min: number | null; level_max: number | null }) => (t.level_min == null || level >= t.level_min) && (t.level_max == null || level <= t.level_max);
  const tData = treasureData();
  // The setting's region for the place, when its treasure is on; otherwise (or anywhere it doesn't cover) the books.
  const worldRegion = moduleOn(db, 'setting-treasure', c.id) ? (Object.entries(tData.regions).find(([, r]) => r.ids.some((x) => chain.some((e) => e.id === x)))?.[0] ?? null) : null;
  const treasureRegion = worldRegion ?? (bookTreasure(db).magic.length ? BOOKS_REGION : null);

  return {
    session: { id: s.id, number: s.number },
    campaign: { id: c.id, title: c.title },
    previous: prev ?? null,
    location: here ? { id: here.id, name: here.name, type: here.type } : hereLabel ? { id: null, name: hereLabel, type: '' } : null,
    chain: chain.slice(1).map((e) => ({ id: e.id, name: e.name })),
    region: region ? { id: region.id, name: region.name } : null,
    nearby: nearbyRows,
    locals,
    met,
    clues,
    agendas: agendasDue,
    standing,
    quests,
    level,
    tables: tables.filter(tLevel).map((t) => ({ id: t.id, name: t.name })),
    // Festivals and the GM's events in the next two weeks.
    coming: comingUp(db, c.id, 14).map((x) => ({ kind: x.kind, title: x.title, inDays: x.inDays })),
    // The terrain here, for encounters from the GM's books (the nearest place with one: the place, then its region).
    terrain: chain.length ? placeProfile(db, chain[0].id).terrain : [],
    treasure: treasureRegion ? { region: treasureRegion, tier: tierKey, label: worldRegion ? tData.regions[worldRegion].label : 'From the SRD and your books' } : null,
  };
}

/**
 * Who's nearby, for the live session: the people who live where the party is (or close by), each with what the GM
 * needs to play them on the spot. Looks and manner come from their handbook page, or from their record.
 */
export function nearbyPeople(db: DB, sessionId: number) {
  const b = sessionBriefing(db, sessionId);
  // People at the party's own spot first, then those in what it contains and beside it, then the wider area.
  const here = b.location?.id ?? null;
  const rings = [here ? [here] : [], b.nearby.map((n) => n.id), b.chain.slice(0, 1).map((c) => c.id)];
  const livesIn = db.prepare(
    `SELECT DISTINCT e.id, e.name FROM relationships r JOIN entities e ON e.id = r.source_id WHERE r.type = 'lives_in' AND e.type = 'npc' AND e.archived = 0 AND r.target_id = ? ORDER BY e.name`,
  );
  const seen = new Set<string>();
  const people: { id: string; name: string; ring: number }[] = [];
  rings.forEach((ids, ring) => {
    for (const id of ids) for (const p of livesIn.all(id) as { id: string; name: string }[]) if (!seen.has(p.id) && seen.add(p.id)) people.push({ ...p, ring });
  });
  const row = db.prepare(`SELECT id, name, body, fields, player_summary, revealed FROM entities WHERE id = ?`);
  const rumours = db.prepare(`SELECT text FROM rumours WHERE source_id = ? AND stale = 0 ORDER BY id`);
  return {
    place: b.location?.name ?? null,
    people: people.map((p) => {
      const e = row.get(p.id) as { id: string; name: string; body: string; fields: string; player_summary: string; revealed: number };
      const ps = e.player_summary ?? '';
      const grab = (label: string) => new RegExp(`\\*\\*${label}\\.\\*\\*\\s*([^\\n]+)`).exec(ps)?.[1]?.trim() ?? null;
      const appearance = /## Appearance and voice\n([^\n]+)/.exec(e.body)?.[1]?.trim() ?? null;
      const table = /\| People \| Class \| Known as \| Pronouns \| From \|\n\|[- |]+\|\n\| (.*?) \| (.*?) \| (.*?) \| (.*?) \|/.exec(ps);
      const field = (k: string) => parseJson<[string, string][]>(e.fields, []).find(([key]) => key.toLowerCase() === k)?.[1] ?? null;
      return {
        id: e.id,
        name: e.name,
        species: table?.[1] ?? field('species'),
        knownAs: table?.[3] ?? null,
        pronouns: table?.[4] ?? field('pronouns'),
        tagline: /^\*([^*\n]+)\*/.exec(ps.trim())?.[1] ?? null,
        looks: grab('Looks') ?? appearance,
        manner: grab('Manner'),
        rumours: (rumours.all(e.id) as { text: string }[]).map((r) => r.text),
        gmOnly: !e.revealed,
        /** 0: right here, 1: close by, 2: elsewhere in the area. */
        distance: p.ring,
      };
    }),
  };
}
