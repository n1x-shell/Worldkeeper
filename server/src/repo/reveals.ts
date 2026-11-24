/**
 * What players know, per campaign (docs/LIBRARIES_PLAN.md §2.1). A reveal is either to everyone (the record's own
 * revealed, revealed_sections and revealed_facts: common knowledge in the world) or to one campaign
 * (campaign_reveals). A campaign's players see both: the record, each section and each fact. Maps, pins and outlines
 * work the same way (their own player_visible / hidden, plus campaign_map_reveals).
 *
 * The scope of a player view is a campaign id, or null for what's revealed to everyone (the published handbook).
 */
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { SECRET_HEADING_RE } from '../../../shared/domain.js';
import { updateEntity } from './entities.js';

export type RevealScope = number | null;

/** SQL for "this record is revealed in the scope", against the entities table (one parameter: the scope). */
export const REVEALED_IN_SCOPE = '(revealed = 1 OR id IN (SELECT entity_id FROM campaign_reveals WHERE campaign_id = ? AND revealed = 1))';

/** The records revealed in a scope (archived ones never). */
export function revealedIds(db: DB, scope: RevealScope): Set<string> {
  return new Set((db.prepare(`SELECT id FROM entities WHERE archived = 0 AND ${REVEALED_IN_SCOPE}`).all(scope) as { id: string }[]).map((r) => r.id));
}

export const isRevealed = (db: DB, id: string, scope: RevealScope) => !!db.prepare(`SELECT 1 FROM entities WHERE id = ? AND archived = 0 AND ${REVEALED_IN_SCOPE}`).get(id, scope);

interface RevealCols {
  id: string;
  revealed: number;
  revealed_sections: string;
  revealed_facts: string;
}

/** A record's reveal columns as a campaign's players see them: everyone's, with the campaign's added. */
export function inScope<T extends RevealCols>(db: DB, rows: T[], scope: RevealScope): T[] {
  if (scope == null || !rows.length) return rows;
  const extra = new Map(
    (
      db.prepare('SELECT entity_id, revealed, revealed_sections, revealed_facts FROM campaign_reveals WHERE campaign_id = ?').all(scope) as {
        entity_id: string;
        revealed: number;
        revealed_sections: string;
        revealed_facts: string;
      }[]
    ).map((r) => [r.entity_id, r]),
  );
  const union = (a: string, b: string) => JSON.stringify([...new Set([...parseJson<string[]>(a, []), ...parseJson<string[]>(b, [])])]);
  return rows.map((r) => {
    const x = extra.get(r.id);
    if (!x) return r;
    return { ...r, revealed: r.revealed || x.revealed, revealed_sections: union(r.revealed_sections, x.revealed_sections), revealed_facts: union(r.revealed_facts, x.revealed_facts) };
  });
}

// ---------------------------------------------------------------- maps

export type MapPart = 'map' | 'marker' | 'shape';

/** The maps, pins and outlines revealed to a campaign (besides those revealed to everyone). */
export function campaignMapReveals(db: DB, scope: RevealScope): Record<MapPart, Set<number>> {
  const out: Record<MapPart, Set<number>> = { map: new Set(), marker: new Set(), shape: new Set() };
  if (scope == null) return out;
  for (const r of db.prepare('SELECT kind, ref_id FROM campaign_map_reveals WHERE campaign_id = ?').all(scope) as { kind: MapPart; ref_id: number }[]) out[r.kind].add(r.ref_id);
  return out;
}

// ---------------------------------------------------------------- revealing to a campaign

/**
 * Reveal a record to one campaign: the record itself, and any sections (never a GM-only one) and facts. Adds to what
 * the campaign already knows; `hide` takes the record back from it (everything it learned of it).
 */
export function revealToCampaign(db: DB, campaignId: number, entityId: string, o: { sections?: string[]; facts?: string[]; hide?: boolean } = {}) {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  if (!db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId)) throw notFound('Record');
  if (o.hide) {
    db.prepare('DELETE FROM campaign_reveals WHERE campaign_id = ? AND entity_id = ?').run(campaignId, entityId);
    return null;
  }
  for (const h of o.sections ?? []) if (SECRET_HEADING_RE.test(h)) throw badRequest(`"${h}" is for the GM only and can't be revealed`);
  const cur = db.prepare('SELECT revealed_sections, revealed_facts FROM campaign_reveals WHERE campaign_id = ? AND entity_id = ?').get(campaignId, entityId) as
    | { revealed_sections: string; revealed_facts: string }
    | undefined;
  const sections = [...new Set([...parseJson<string[]>(cur?.revealed_sections ?? '[]', []), ...(o.sections ?? [])])];
  const facts = [...new Set([...parseJson<string[]>(cur?.revealed_facts ?? '[]', []), ...(o.facts ?? []).map((f) => f.trim()).filter(Boolean)])];
  db.prepare(
    `INSERT INTO campaign_reveals (campaign_id, entity_id, revealed, revealed_sections, revealed_facts) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(campaign_id, entity_id) DO UPDATE SET revealed = 1, revealed_sections = excluded.revealed_sections,
       revealed_facts = excluded.revealed_facts, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(campaignId, entityId, JSON.stringify(sections), JSON.stringify(facts));
  return { campaign_id: campaignId, entity_id: entityId, sections, facts };
}

/** Show or hide a map, a pin or an outline to one campaign. */
export function revealMapPartToCampaign(db: DB, campaignId: number, kind: MapPart, refId: number, on: boolean) {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  if (on) db.prepare('INSERT OR IGNORE INTO campaign_map_reveals (campaign_id, kind, ref_id) VALUES (?, ?, ?)').run(campaignId, kind, refId);
  else db.prepare('DELETE FROM campaign_map_reveals WHERE campaign_id = ? AND kind = ? AND ref_id = ?').run(campaignId, kind, refId);
}

/** Which campaigns know a record (besides everyone), with what each was shown: for the GM's "who knows what". */
export function whoKnows(db: DB, entityId: string) {
  return (
    db
      .prepare(`SELECT cr.campaign_id, c.title, cr.revealed_sections, cr.revealed_facts FROM campaign_reveals cr JOIN campaigns c ON c.id = cr.campaign_id WHERE cr.entity_id = ? ORDER BY c.title`)
      .all(entityId) as { campaign_id: number; title: string; revealed_sections: string; revealed_facts: string }[]
  ).map((r) => ({
    campaign_id: r.campaign_id,
    title: r.title,
    sections: parseJson<string[]>(r.revealed_sections, []),
    facts: parseJson<string[]>(r.revealed_facts, []),
  }));
}

// ---------------------------------------------------------------- for the GM: who learns this

/** The campaigns a reveal can go to: every campaign not archived. */
export function revealCampaigns(db: DB) {
  return db.prepare(`SELECT id, title FROM campaigns WHERE status != 'archived' ORDER BY id`).all() as { id: number; title: string }[];
}

/**
 * Who a new reveal goes to unless the GM says otherwise (docs/LIBRARIES_PLAN.md §5, answer 1): with two or more
 * campaigns, the campaign at hand (`preferred`, e.g. the live session's) or else the active one; otherwise everyone.
 */
export function defaultRevealTarget(db: DB, preferred?: number | null): RevealScope {
  const cs = revealCampaigns(db);
  if (cs.length < 2) return null;
  const want = preferred ?? (Number((db.prepare(`SELECT value FROM settings WHERE key = 'active_campaign_id'`).get() as { value: string } | undefined)?.value) || null);
  return want && cs.some((c) => c.id === want) ? want : null;
}

/** A record's reveals for the GM: to everyone, to each campaign, and who a new reveal goes to by default. */
export function recordReveals(db: DB, entityId: string) {
  const e = db.prepare('SELECT revealed, revealed_sections, revealed_facts FROM entities WHERE id = ?').get(entityId) as
    | { revealed: number; revealed_sections: string; revealed_facts: string }
    | undefined;
  if (!e) throw notFound('Record');
  return {
    everyone: { revealed: !!e.revealed, sections: parseJson<string[]>(e.revealed_sections, []), facts: parseJson<string[]>(e.revealed_facts, []) },
    campaigns: whoKnows(db, entityId),
    choices: revealCampaigns(db),
    default: defaultRevealTarget(db),
  };
}

/** Take sections or facts back from one campaign (the record stays known to it). */
export function unrevealFromCampaign(db: DB, campaignId: number, entityId: string, o: { sections?: string[]; facts?: string[] }) {
  const cur = db.prepare('SELECT revealed_sections, revealed_facts FROM campaign_reveals WHERE campaign_id = ? AND entity_id = ?').get(campaignId, entityId) as
    | { revealed_sections: string; revealed_facts: string }
    | undefined;
  if (!cur) return;
  const drop = (json: string, gone?: string[]) => JSON.stringify(parseJson<string[]>(json, []).filter((x) => !(gone ?? []).includes(x)));
  db.prepare(`UPDATE campaign_reveals SET revealed_sections = ?, revealed_facts = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE campaign_id = ? AND entity_id = ?`).run(
    drop(cur.revealed_sections, o.sections),
    drop(cur.revealed_facts, o.facts),
    campaignId,
    entityId,
  );
}

const union = (...lists: string[][]) => [...new Set(lists.flat())];

/** Make what one campaign learned of a record common knowledge: everyone sees it, and the campaign's own copy goes. */
export function promoteToEveryone(db: DB, entityId: string, campaignId: number) {
  return db.transaction(() => {
    const r = recordReveals(db, entityId);
    const c = r.campaigns.find((x) => x.campaign_id === campaignId);
    if (!c) throw badRequest('That campaign has not learned of this record');
    updateEntity(
      db,
      entityId,
      { revealed: true, revealed_sections: union(r.everyone.sections, c.sections), revealed_facts: union(r.everyone.facts, c.facts), reason: `Revealed to everyone (was ${c.title} only)` },
      'reveal',
    );
    db.prepare('DELETE FROM campaign_reveals WHERE campaign_id = ? AND entity_id = ?').run(campaignId, entityId);
    return recordReveals(db, entityId);
  })();
}

/** Take a world-wide reveal back to one campaign: that campaign keeps it, every other group loses it. */
export function onlyToCampaign(db: DB, entityId: string, campaignId: number) {
  return db.transaction(() => {
    const r = recordReveals(db, entityId);
    if (!r.everyone.revealed) throw badRequest('This record is not revealed to everyone');
    revealToCampaign(db, campaignId, entityId, { sections: r.everyone.sections, facts: r.everyone.facts });
    const title = r.choices.find((c) => c.id === campaignId)?.title ?? 'one campaign';
    updateEntity(db, entityId, { revealed: false, revealed_sections: [], revealed_facts: [], reason: `Revealed to ${title} only` }, 'reveal');
    return recordReveals(db, entityId);
  })();
}

/** Show or hide a map, a pin or an outline: to everyone (its own player_visible / hidden) or to one campaign. */
export function revealMapPart(db: DB, kind: MapPart, refId: number, campaignId: RevealScope, on: boolean) {
  const table = { map: 'maps', marker: 'map_markers', shape: 'map_shapes' }[kind];
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(refId)) throw notFound(kind === 'map' ? 'Map' : kind === 'marker' ? 'Pin' : 'Outline');
  if (campaignId == null) {
    if (kind === 'map') db.prepare('UPDATE maps SET player_visible = ? WHERE id = ?').run(on ? 1 : 0, refId);
    else db.prepare(`UPDATE ${table} SET hidden = ? WHERE id = ?`).run(on ? 0 : 1, refId);
  } else revealMapPartToCampaign(db, campaignId, kind, refId, on);
  return { kind, ref_id: refId, campaign_id: campaignId, on };
}

/** For a map: which campaigns were shown it, and each of its pins and outlines (for the GM's Atlas). */
export function mapRevealsFor(db: DB, mapId: number) {
  const rows = db
    .prepare(
      `SELECT kind, ref_id, campaign_id FROM campaign_map_reveals WHERE (kind = 'map' AND ref_id = ?)
         OR (kind = 'marker' AND ref_id IN (SELECT id FROM map_markers WHERE map_id = ?))
         OR (kind = 'shape' AND ref_id IN (SELECT id FROM map_shapes WHERE map_id = ?))`,
    )
    .all(mapId, mapId, mapId) as { kind: MapPart; ref_id: number; campaign_id: number }[];
  const out: Record<MapPart, Record<number, number[]>> = { map: {}, marker: {}, shape: {} };
  for (const r of rows) (out[r.kind][r.ref_id] ??= []).push(r.campaign_id);
  return out;
}
