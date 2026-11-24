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
