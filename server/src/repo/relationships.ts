import type { DB } from '../db/connection.js';
import { z } from 'zod';
import { RELATIONSHIP_TYPES, CANON_STATUSES, SYMMETRIC_RELATIONSHIPS, type Relationship } from '../../../shared/domain.js';
import { parseJson } from '../lib/json.js';
import { collectRefs, type MentionIndex } from '../../../shared/mentions.js';
import { loadMentionIndex } from './mentions.js';
import { listItems, loadNameIndex, type NameIndex } from './nameMatch.js';
import { badRequest, notFound } from '../lib/errors.js';

interface RelRow {
  id: number;
  source_id: string;
  target_id: string;
  type: string;
  directed: number;
  label: string;
  description: string;
  canon_status: string;
  origin: string;
  source_context: string;
}

const toRel = (r: RelRow): Relationship => ({ ...r, directed: !!r.directed } as Relationship);



/** Field names whose `[ID]` values express a specific relationship. */
const FIELD_RELATIONS: { match: RegExp; type: Relationship['type']; reverse: boolean }[] = [
  { match: /^(leaders?|leadership|rulers or keepers|keeper)$/i, type: 'leads', reverse: true },
  { match: /^ruling faction$/i, type: 'controls', reverse: true },
  { match: /^region$/i, type: 'part_of', reverse: false },
];

const PLACE_TYPES = new Set(['continent', 'realm', 'region', 'nation', 'settlement', 'landmark', 'building', 'dungeon', 'vault', 'ethereal_domain', 'adventure_location', 'world']);
const GROUP_TYPES = new Set(['faction', 'cult', 'family']);

/** Section headings whose text is a list of people, groups or places. */
const LIST_SECTION = /^(?:associated groups|known relationships and locations|associated people and places|known figures|approved leader|leaders?|leadership|family|members?|canon location|location|closest interested party|held by|holder|bearer)\b/i;
const HELD_TYPES = new Set(['shard', 'artifact', 'item', 'vault_key']);

/**
 * What a name in a list section means, given who wrote it and what it names.
 * Returns [type, reverse]: reverse means the named record is the source (e.g. a faction's "Leaders" list gives
 * "NPC leads faction").
 */
function sectionRelation(heading: string, sourceType: string, targetType: string): [Relationship['type'], boolean] | null {
  const h = heading.toLowerCase();
  if (HELD_TYPES.has(sourceType)) {
    // Where a treasure lies, who holds it, and who is after it.
    if (/location/.test(h) && PLACE_TYPES.has(targetType)) return ['contains', true];
    if (/interested/.test(h) && (GROUP_TYPES.has(targetType) || targetType === 'npc')) return ['seeks', true];
    if (/held|holder|bearer/.test(h) && (GROUP_TYPES.has(targetType) || targetType === 'npc')) return ['controls', true];
    return null;
  }
  if (sourceType === 'npc') {
    if (GROUP_TYPES.has(targetType)) return ['member_of', false];
    if (PLACE_TYPES.has(targetType)) return ['lives_in', false];
    if (targetType === 'npc') return ['related_to', false];
    return null;
  }
  if (GROUP_TYPES.has(sourceType)) {
    if (targetType === 'npc') return /leader|leadership/.test(h) ? ['leads', true] : ['member_of', true];
    if (PLACE_TYPES.has(targetType)) return ['related_to', false];
    if (GROUP_TYPES.has(targetType)) return ['related_to', false];
  }
  return null;
}

/**
 * Regenerate relationships derived from a record's own text: its Parent field, structured metadata fields,
 * and every `Name [ID]` cross-reference in the body. User-curated relationships are never touched.
 * Redirect IDs (e.g. a legacy locator) resolve to their authoritative record.
 */
export function rebuildDerivedRelationships(db: DB, id: string, index: MentionIndex = loadMentionIndex(db), names?: NameIndex) {
  const row = db.prepare('SELECT id, type, parent_id, fields, body, redirect_to FROM entities WHERE id = ?').get(id) as
    | { id: string; type: string; parent_id: string | null; fields: string; body: string; redirect_to: string | null }
    | undefined;
  db.prepare(`DELETE FROM relationships WHERE source_id = ? AND origin IN ('import-parent','import-reference')`).run(id);
  // Field-derived links may point either way (e.g. "NPC leads Faction" comes from the faction's Leaders field),
  // so they are identified by the record whose field produced them.
  db.prepare(`DELETE FROM relationships WHERE origin = 'import-field' AND source_context LIKE ?`).run(`field:${id}:%`);
  if (!row || row.type === 'redirect') return;

  const exists = db.prepare('SELECT id, redirect_to FROM entities WHERE id = ?');
  const resolve = (ref: string): string | null => {
    const hit = exists.get(ref) as { id: string; redirect_to: string | null } | undefined;
    if (!hit) return null;
    return hit.redirect_to ?? hit.id;
  };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO relationships (source_id, target_id, type, directed, label, origin, source_context, canon_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CANON')`,
  );
  const linked = new Set<string>();

  if (row.parent_id) {
    const p = resolve(row.parent_id);
    if (p && p !== id) {
      insert.run(id, p, 'part_of', 1, 'Parent', 'import-parent', 'Parent field');
      linked.add(p);
    }
  }
  for (const [key, value] of parseJson<[string, string][]>(row.fields, [])) {
    const rule = FIELD_RELATIONS.find((r) => r.match.test(key));
    for (const ref of collectRefs(value, index).ids) {
      const t = resolve(ref);
      if (!t || t === id) continue;
      if (rule) {
        const [s, d] = rule.reverse ? [t, id] : [id, t];
        insert.run(s, d, rule.type, 1, key, 'import-field', `field:${id}:${key}`);
      } else {
        insert.run(id, t, 'related_to', 1, key, 'import-field', `field:${id}:${key}`);
      }
      linked.add(t);
    }
  }
  // Lists written in plain names ("Associated groups: Celestial Order", "Known figures: Hadrek, Sister Kallisa").
  const nameIndex = names ?? loadNameIndex(db);
  {
    let heading = '';
    const sections = new Map<string, string[]>();
    for (const line of row.body.split(/\r?\n/)) {
      const h = /^#{1,4}\s+(.+)/.exec(line);
      if (h) heading = h[1].trim();
      else if (LIST_SECTION.test(heading)) sections.set(heading, [...(sections.get(heading) ?? []), line]);
    }
    for (const [sec, lines] of sections) {
      const text = lines.join('\n');
      const targets = new Set<string>(collectRefs(text, index).ids.map((r) => resolve(r)).filter((t): t is string => !!t));
      for (const item of listItems(text)) {
        const t = nameIndex.find(item);
        if (t) targets.add(t);
      }
      // Names inside a sentence ("Beneath the Bloodmarked Fields", "Inside the waystone at the Crossroads of Fate").
      for (const t of nameIndex.scan(text)) targets.add(t);
      for (const t of targets) {
        if (t === id) continue;
        const rel = sectionRelation(sec, row.type, nameIndex.typeOf(t) ?? '');
        if (!rel) continue;
        const [s, d] = rel[1] ? [t, id] : [id, t];
        insert.run(s, d, rel[0], 1, sec, 'import-field', `field:${id}:section:${sec}`);
        linked.add(t);
      }
    }
  }

  let heading = '';
  for (const line of row.body.split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.+)/.exec(line);
    if (h) {
      heading = h[1].trim();
      continue;
    }
    for (const ref of collectRefs(line, index).ids) {
      const t = resolve(ref);
      if (!t || t === id || linked.has(t)) continue;
      linked.add(t);
      insert.run(id, t, 'references', 1, heading, 'import-reference', line.trim().slice(0, 400));
    }
    // Records named in plain prose ("Elder Sorrel leads the Eastern Tendril") are mentions too.
    for (const t of nameIndex.scan(line.replace(/\[[A-Z]{2,4}-\d{3}[^\]]*\]/g, ''))) {
      if (t === id || linked.has(t)) continue;
      linked.add(t);
      insert.run(id, t, 'references', 1, heading, 'import-reference', line.trim().slice(0, 400));
    }
  }
}

export function listRelationshipsFor(db: DB, id: string) {
  const rows = db
    .prepare(
      `SELECT r.*, s.name AS source_name, s.type AS source_type, t.name AS target_name, t.type AS target_type
       FROM relationships r LEFT JOIN entities s ON s.id = r.source_id LEFT JOIN entities t ON t.id = r.target_id
       WHERE r.source_id = ? OR r.target_id = ? ORDER BY r.origin = 'user' DESC, r.type, r.id`,
    )
    .all(id, id) as (RelRow & { source_name: string; target_name: string; source_type: string; target_type: string })[];
  return rows.map((r) => ({ ...toRel(r), source_name: r.source_name, target_name: r.target_name, source_type: r.source_type, target_type: r.target_type }));
}

export const relationshipInputSchema = z.object({
  source_id: z.string().min(1).max(40),
  target_id: z.string().min(1).max(40),
  type: z.enum(RELATIONSHIP_TYPES),
  directed: z.boolean().optional(),
  label: z.string().max(200).default(''),
  description: z.string().max(5000).default(''),
  canon_status: z.enum(CANON_STATUSES).default('PROPOSED'),
});

export function createRelationship(db: DB, input: z.input<typeof relationshipInputSchema>): Relationship {
  const d = relationshipInputSchema.parse(input);
  if (d.source_id === d.target_id) throw badRequest('A record cannot relate to itself');
  for (const id of [d.source_id, d.target_id]) {
    if (!db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id)) throw badRequest(`Unknown record ${id}`);
  }
  const directed = d.directed ?? !SYMMETRIC_RELATIONSHIPS.includes(d.type);
  const res = db
    .prepare(
      `INSERT INTO relationships (source_id, target_id, type, directed, label, description, canon_status, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
       ON CONFLICT(source_id, target_id, type, origin) DO UPDATE SET label = excluded.label, description = excluded.description,
         canon_status = excluded.canon_status, directed = excluded.directed`,
    )
    .run(d.source_id, d.target_id, d.type, directed ? 1 : 0, d.label, d.description, d.canon_status);
  const row = db
    .prepare('SELECT * FROM relationships WHERE source_id = ? AND target_id = ? AND type = ? AND origin = ?')
    .get(d.source_id, d.target_id, d.type, 'user') as RelRow;
  void res;
  return toRel(row);
}

export function updateRelationship(db: DB, relId: number, patch: Partial<z.input<typeof relationshipInputSchema>>) {
  const row = db.prepare('SELECT * FROM relationships WHERE id = ?').get(relId) as RelRow | undefined;
  if (!row) throw notFound('Relationship');
  const merged = relationshipInputSchema.parse({ ...row, directed: !!row.directed, ...patch });
  if (row.origin !== 'user') {
    // Promote a text-derived link into a curated one; the derived link stays derivable from the text.
    return createRelationship(db, merged);
  }
  db.prepare(
    `UPDATE relationships SET type = ?, directed = ?, label = ?, description = ?, canon_status = ? WHERE id = ?`,
  ).run(merged.type, (merged.directed ?? true) ? 1 : 0, merged.label, merged.description, merged.canon_status, relId);
  return toRel(db.prepare('SELECT * FROM relationships WHERE id = ?').get(relId) as RelRow);
}

export function deleteRelationship(db: DB, relId: number) {
  const row = db.prepare('SELECT origin FROM relationships WHERE id = ?').get(relId) as { origin: string } | undefined;
  if (!row) throw notFound('Relationship');
  if (row.origin !== 'user') throw badRequest('This link comes from the record text. Edit the text to remove it.');
  db.prepare('DELETE FROM relationships WHERE id = ?').run(relId);
}

export interface GraphFilters {
  depth?: number;
  types?: string[];
  relTypes?: string[];
  realms?: string[];
  canon?: string[];
  /** Keep only records tagged with one of these eras (era/<key>); the focus record is always kept. */
  eras?: string[];
  includeReferences?: boolean;
  limit?: number;
}

/** Focused neighbourhood graph around one record, so the graph stays readable at any library size. */
export function neighbourhood(db: DB, focus: string, f: GraphFilters = {}) {
  const depth = Math.min(Math.max(f.depth ?? 1, 1), 3);
  const limit = Math.min(f.limit ?? 120, 400);
  const nodeInfo = db.prepare('SELECT id, name, type, realm, canon_status, tags FROM entities WHERE id = ?');
  const relsOf = db.prepare('SELECT * FROM relationships WHERE source_id = ? OR target_id = ?');
  const nodes = new Map<string, { id: string; name: string; type: string; realm: string; canon_status: string; depth: number }>();
  const edges = new Map<number, Relationship>();
  const root = nodeInfo.get(focus) as { id: string; name: string; type: string; realm: string; canon_status: string } | undefined;
  if (!root) throw notFound(`Record ${focus}`);
  const { tags: _rt, ...rootRest } = root as typeof root & { tags?: string };
  nodes.set(focus, { ...rootRest, depth: 0 });
  let frontier = [focus];
  for (let d = 1; d <= depth && nodes.size < limit; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of relsOf.all(id, id) as RelRow[]) {
        if (f.includeReferences === false && r.origin === 'import-reference') continue;
        if (f.relTypes?.length && !f.relTypes.includes(r.type)) continue;
        const other = r.source_id === id ? r.target_id : r.source_id;
        let info = nodes.get(other);
        if (!info) {
          const n = nodeInfo.get(other) as { id: string; name: string; type: string; realm: string; canon_status: string } | undefined;
          if (!n) continue;
          if (f.types?.length && !f.types.includes(n.type)) continue;
          if (f.realms?.length && !f.realms.includes(n.realm)) continue;
          if (f.canon?.length && !f.canon.includes(n.canon_status)) continue;
          if (f.eras?.length && !f.eras.some((era) => (n as unknown as { tags: string }).tags.includes(`"era/${era}"`))) continue;
          if (nodes.size >= limit) continue;
          const { tags: _t, ...rest } = n as typeof n & { tags?: string };
          info = { ...rest, depth: d };
          nodes.set(other, info);
          next.push(other);
        }
        edges.set(r.id, toRel(r));
      }
    }
    frontier = next;
  }
  // Keep only edges whose both ends are present.
  const edgeList = [...edges.values()].filter((e) => nodes.has(e.source_id) && nodes.has(e.target_id));
  return { focus, nodes: [...nodes.values()], edges: edgeList, truncated: nodes.size >= limit };
}

export function brokenReferences(db: DB) {
  const all = db.prepare(`SELECT id, name, parent_id, fields, body FROM entities WHERE type != 'redirect'`).all() as {
    id: string;
    name: string;
    parent_id: string | null;
    fields: string;
    body: string;
  }[];
  const ids = new Set((db.prepare('SELECT id FROM entities').all() as { id: string }[]).map((r) => r.id));
  const index = loadMentionIndex(db);
  const out: { from: string; from_name: string; ref: string; where: string }[] = [];
  for (const e of all) {
    const seen = new Set<string>();
    const check = (ref: string, where: string) => {
      if (ids.has(ref) || seen.has(ref)) return;
      seen.add(ref);
      out.push({ from: e.id, from_name: e.name, ref, where });
    };
    if (e.parent_id) check(e.parent_id, 'Parent');
    for (const [k, v] of parseJson<[string, string][]>(e.fields, [])) for (const r of collectRefs(v, index).broken) check(r, k);
    for (const line of e.body.split('\n')) for (const r of collectRefs(line, index).broken) check(r, line.trim().slice(0, 200));
  }
  const danglingRels = db
    .prepare(
      `SELECT r.id, r.source_id, r.target_id, r.type FROM relationships r
       WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.source_id) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.target_id)`,
    )
    .all();
  return { references: out, danglingRelationships: danglingRels };
}
