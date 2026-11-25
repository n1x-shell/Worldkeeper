/**
 * Bulk tools (v0.9.13, docs/BETA_PLAN.md B7): tags across the library, one change to many records, two records made
 * one, and find-and-replace in records' text. Every record a tool changes keeps its earlier state in its history
 * (change type "bulk" or "merge"), so each can be looked at and put back one by one.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { CANON_STATUSES } from '../../../shared/domain.js';
import type { Entity } from '../../../shared/domain.js';
import { getEntity, getEntityRow, saveRevision, updateEntity } from './entities.js';
import { rebuildDerivedRelationships } from './relationships.js';
import { reindexEntity } from './search.js';
import { revealToCampaign } from './reveals.js';
import { realmExists } from './realms.js';
import { types } from './recordTypes.js';

// ---- Tags ------------------------------------------------------------------------------------------------------------

/** Tags the app keeps in step with a record's realm, canon status and visibility: shown, not edited by hand. */
const SYSTEM_TAG = /^(realm|status|vis)\//;
const cleanTag = (t: string) =>
  t
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);

const taggedRows = (db: DB, tag: string) =>
  (db.prepare(`SELECT id, tags FROM entities WHERE tags LIKE ? ESCAPE '\\'`).all(`%${JSON.stringify(tag).replace(/[\\%_]/g, (m) => `\\${m}`)}%`) as { id: string; tags: string }[])
    .map((r) => ({ id: r.id, tags: parseJson<string[]>(r.tags, []) }))
    .filter((r) => r.tags.includes(tag));

/** Every tag in the library with how many records carry it. */
export function tagList(db: DB): { tag: string; count: number; system: boolean }[] {
  const counts = new Map<string, number>();
  for (const { tags } of db.prepare(`SELECT tags FROM entities WHERE type != 'redirect' AND tags != '[]'`).all() as { tags: string }[]) for (const t of parseJson<string[]>(tags, [])) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count, system: SYSTEM_TAG.test(tag) })).sort((a, b) => Number(a.system) - Number(b.system) || a.tag.localeCompare(b.tag));
}

/** Rename a tag everywhere. Renaming onto a tag that exists merges the two. Returns how many records changed. */
export function renameTag(db: DB, from: string, toRaw: string): { changed: number; merged: boolean } {
  const to = cleanTag(toRaw);
  if (!to) throw badRequest('Give the tag a name');
  if (SYSTEM_TAG.test(from) || SYSTEM_TAG.test(to)) throw badRequest('That tag is kept by the app: change the record’s realm, canon status or visibility instead');
  if (from === to) return { changed: 0, merged: false };
  return db.transaction(() => {
    const rows = taggedRows(db, from);
    if (!rows.length) throw notFound('Tag');
    const merged = taggedRows(db, to).length > 0;
    for (const r of rows) updateEntity(db, r.id, { tags: [...new Set(r.tags.map((t) => (t === from ? to : t)))], reason: `Tag “${from}” renamed “${to}”` }, 'bulk');
    return { changed: rows.length, merged };
  })();
}

export function deleteTag(db: DB, tag: string): { changed: number } {
  if (SYSTEM_TAG.test(tag)) throw badRequest('That tag is kept by the app');
  return db.transaction(() => {
    const rows = taggedRows(db, tag);
    if (!rows.length) throw notFound('Tag');
    for (const r of rows) updateEntity(db, r.id, { tags: r.tags.filter((t) => t !== tag), reason: `Tag “${tag}” removed everywhere` }, 'bulk');
    return { changed: rows.length };
  })();
}

// ---- One change to many records --------------------------------------------------------------------------------------

const zIds = z.array(z.string().min(1).max(40)).min(1).max(5000);
const bulkSchema = z.object({
  ids: zIds,
  action: z.discriminatedUnion('do', [
    z.object({ do: z.literal('tag'), add: z.array(z.string().max(100)).max(20).default([]), remove: z.array(z.string().max(100)).max(20).default([]) }),
    z.object({ do: z.literal('realm'), realm: z.string().min(1).max(60) }),
    z.object({ do: z.literal('parent'), parent_id: z.string().max(40).nullable() }),
    z.object({ do: z.literal('canon'), canon_status: z.enum(CANON_STATUSES) }),
    /** Known to everyone's players, or to one campaign's. */
    z.object({ do: z.literal('reveal'), revealed: z.boolean(), campaign_id: z.number().int().positive().nullable().optional() }),
    z.object({ do: z.literal('archive'), archived: z.boolean() }),
  ]),
});

/** A record's tags with the one the app keeps for a realm or a canon status swapped for the new one. */
const swapSystem = (tags: string[], prefix: 'realm' | 'status', value: string) => (tags.some((t) => t.startsWith(`${prefix}/`)) ? [...tags.filter((t) => !t.startsWith(`${prefix}/`)), `${prefix}/${value}`] : tags);

/** The same change to every record named. All of them, or (on a mistake in the request) none. */
export function bulkEdit(db: DB, input: unknown): { changed: number; unchanged: number; skipped: { id: string; reason: string }[] } {
  const { ids, action: a } = bulkSchema.parse(input);
  if (a.do === 'realm' && !realmExists(db, a.realm)) throw badRequest('There is no such world or realm in this library');
  if (a.do === 'parent' && a.parent_id && !getEntityRow(db, a.parent_id)) throw notFound('The record to put them in');
  if (a.do === 'reveal' && a.campaign_id && !db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(a.campaign_id)) throw notFound('Campaign');
  const add = a.do === 'tag' ? [...new Set(a.add.map(cleanTag).filter(Boolean))] : [];
  const remove = a.do === 'tag' ? a.remove : [];
  if (a.do === 'tag' && [...add, ...remove].some((t) => SYSTEM_TAG.test(t))) throw badRequest('Tags for realm, canon status and visibility are kept by the app');
  if (a.do === 'tag' && !add.length && !remove.length) throw badRequest('Name a tag to add or take off');
  return db.transaction(() => {
    let changed = 0;
    let unchanged = 0;
    const skipped: { id: string; reason: string }[] = [];
    // A record can't sit inside itself or inside something that sits in it.
    const above = (id: string | null) => {
      const out = new Set<string>();
      for (let cur = id, guard = 0; cur && guard < 50 && !out.has(cur); guard++) {
        out.add(cur);
        cur = getEntityRow(db, cur)?.parent_id ?? null;
      }
      return out;
    };
    const parentChain = a.do === 'parent' ? above(a.parent_id) : new Set<string>();
    for (const id of [...new Set(ids)]) {
      const row = getEntityRow(db, id);
      if (!row || row.type === 'redirect') {
        skipped.push({ id, reason: 'No such record' });
        continue;
      }
      const tags = parseJson<string[]>(row.tags, []);
      const before = row.version;
      let after = before;
      if (a.do === 'tag') after = updateEntity(db, id, { tags: [...new Set([...tags.filter((t) => !remove.includes(t)), ...add])], reason: 'Tags changed with others' }, 'bulk').version;
      else if (a.do === 'realm') after = updateEntity(db, id, { realm: a.realm, tags: swapSystem(tags, 'realm', a.realm), reason: 'Moved with others' }, 'bulk').version;
      else if (a.do === 'canon') after = updateEntity(db, id, { canon_status: a.canon_status, tags: swapSystem(tags, 'status', a.canon_status.toLowerCase()), reason: 'Canon status set with others' }, 'bulk').version;
      else if (a.do === 'archive') after = updateEntity(db, id, { archived: a.archived }, 'bulk').version;
      else if (a.do === 'parent') {
        if (parentChain.has(id)) {
          skipped.push({ id, reason: 'It can’t be put inside itself' });
          continue;
        }
        after = updateEntity(db, id, { parent_id: a.parent_id, parent_raw: null, reason: 'Moved with others' }, 'bulk').version;
      } else if (a.campaign_id) {
        const knew = !!db.prepare('SELECT 1 FROM campaign_reveals WHERE campaign_id = ? AND entity_id = ?').get(a.campaign_id, id);
        if (knew !== a.revealed) {
          revealToCampaign(db, a.campaign_id, id, a.revealed ? {} : { hide: true });
          after = before + 1;
        }
      } else after = updateEntity(db, id, { revealed: a.revealed }, 'bulk').version;
      if (after === before) unchanged++;
      else changed++;
    }
    return { changed, unchanged, skipped };
  })();
}

// ---- Two records made one --------------------------------------------------------------------------------------------

/** Columns that hold a record's ID, to point at the kept record. `own`: at most one row per record (the kept one's stays). */
const POINTERS: [table: string, column: string, own?: true][] = [
  ['entities', 'parent_id'],
  ['campaigns', 'starting_location_id'],
  ['quests', 'giver_id'],
  ['quests', 'location_id'],
  ['session_log', 'entity_id'],
  ['campaign_state', 'entity_id'],
  ['faction_plans', 'faction_id'],
  ['encounters', 'location_id'],
  ['proposals', 'entity_id'],
  ['random_tables', 'region_id'],
  ['maps', 'entity_id'],
  ['map_markers', 'entity_id'],
  ['map_shapes', 'entity_id'],
  ['rumours', 'source_id'],
  ['secrets', 'source_id'],
  ['clues', 'entity_id'],
  ['map_discoveries', 'entity_id', true],
  ['map_travel', 'entity_id'],
  ['faction_standing', 'faction_id', true],
  ['renown_log', 'faction_id'],
  ['party_treasure', 'entity_id'],
  ['bastions', 'location_id'],
  ['bastions', 'host_faction_id'],
  ['entity_images', 'entity_id'],
  ['profiles', 'entity_id', true],
  ['statblocks', 'entity_id', true],
  ['homebrew', 'entity_id', true],
  ['campaign_reveals', 'entity_id', true],
  ['recent_views', 'entity_id', true],
];

/**
 * Fold one record into another. The kept record takes the other's name and alternate names as its own alternate
 * names, its tags, the facts it lacks, its text (under a heading), its notes, pictures and everything that pointed at
 * it; the other becomes a redirect, so its ID and every link written with it still lead somewhere.
 */
export function mergeRecords(db: DB, keepId: string, fromId: string): Entity {
  if (keepId === fromId) throw badRequest('Choose two different records');
  return db.transaction(() => {
    const keep = getEntity(db, keepId);
    const from = getEntity(db, fromId);
    if (keep.type === 'redirect' || from.type === 'redirect') throw badRequest('One of these has already been merged into another record');
    if (types(db).get(keep.type)?.traits.meta || types(db).get(from.type)?.traits.meta) throw badRequest('Index and register pages can’t be merged');
    // The kept record must not end up inside itself: if it sits in the other, it moves up to where the other sat.
    const keepParent = keep.parent_id === from.id ? from.parent_id : keep.parent_id;

    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const aliases = [...keep.aliases];
    for (const a of [from.name, ...from.aliases]) if (a.trim() && !same(a, keep.name) && !aliases.some((x) => same(x, a))) aliases.push(a);
    const tags = [...new Set([...keep.tags, ...from.tags.filter((t) => !SYSTEM_TAG.test(t))])];
    const fields = [...keep.fields];
    const clash: [string, string][] = [];
    for (const [k, v] of from.fields) {
      const mine = fields.find(([key]) => same(key, k));
      if (!mine) fields.push([k, v]);
      else if (!same(mine[1], v) && v.trim()) clash.push([k, v]);
    }
    const extra = [clash.map(([k, v]) => `- **${k}:** ${v}`).join('\n'), from.body.trim() && !keep.body.includes(from.body.trim()) ? from.body.trim() : ''].filter(Boolean).join('\n\n');
    const body = extra ? `${keep.body.trimEnd()}\n\n## From ${from.name}\n\n${extra}\n` : keep.body;
    const notes = from.notes.trim() && !keep.notes.includes(from.notes.trim()) ? [keep.notes.trimEnd(), from.notes.trim()].filter(Boolean).join('\n\n') : keep.notes;

    // The other record first: its last state goes to its history, then it becomes a redirect.
    saveRevision(db, from, 'merge', `Merged into ${keep.name} (${keep.id})`);
    db.prepare(
      `UPDATE entities SET type = 'redirect', redirect_to = ?, body = ?, fields = '[]', notes = '', parent_id = NULL, parent_raw = NULL, revealed = 0, favorite = 0, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(keep.id, `Merged into ${keep.name} [${keep.id}].`, from.id);

    for (const [table, column, own] of POINTERS) {
      db.prepare(`UPDATE OR IGNORE ${table} SET ${column} = ? WHERE ${column} = ?`).run(keep.id, from.id);
      // Where each record has one row of its own (a stat block, what a campaign knows), the kept record's stays.
      if (own) db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(from.id);
    }
    db.prepare('UPDATE entities SET parent_id = NULL WHERE id = ? AND parent_id = ?').run(keep.id, keep.id);
    // Links made by hand; the ones read from text are worked out again below.
    for (const col of ['source_id', 'target_id']) db.prepare(`UPDATE OR IGNORE relationships SET ${col} = ? WHERE ${col} = ? AND origin != 'derived'`).run(keep.id, from.id);
    db.prepare(`DELETE FROM relationships WHERE source_id = ? OR target_id = ? OR (source_id = target_id AND source_id = ?)`).run(from.id, from.id, keep.id);
    const inTimeline = db.prepare(`SELECT id, entity_ids FROM timeline_rows WHERE entity_ids LIKE ?`).all(`%"${from.id}"%`) as { id: number; entity_ids: string }[];
    for (const r of inTimeline) db.prepare('UPDATE timeline_rows SET entity_ids = ? WHERE id = ?').run(JSON.stringify([...new Set(parseJson<string[]>(r.entity_ids, []).map((x) => (x === from.id ? keep.id : x)))]), r.id);

    const merged = updateEntity(
      db,
      keep.id,
      { aliases, tags, fields, body, notes, parent_id: keepParent, ...(keep.player_summary.trim() || !from.player_summary.trim() ? {} : { player_summary: from.player_summary }), reason: `${from.name} (${from.id}) merged into this` },
      'merge',
    );
    // Records whose text names the other one: their links now lead here.
    const mentioning = db.prepare(`SELECT id FROM entities WHERE id != ? AND type != 'redirect' AND (body LIKE ? OR fields LIKE ? OR body LIKE ?)`).all(keep.id, `%[${from.id}]%`, `%[${from.id}]%`, `%@[${from.name}%`) as { id: string }[];
    for (const m of mentioning) rebuildDerivedRelationships(db, m.id);
    rebuildDerivedRelationships(db, keep.id);
    reindexEntity(db, from.id);
    reindexEntity(db, keep.id);
    return merged;
  })();
}

// ---- Find and replace ------------------------------------------------------------------------------------------------

const PARTS = ['name', 'body', 'player_summary', 'notes', 'fields', 'aliases'] as const;
type Part = (typeof PARTS)[number];
const PART_LABEL: Record<Part, string> = { name: 'Name', body: 'Text', player_summary: 'Players’ text', notes: 'Your notes', fields: 'Facts', aliases: 'Alternate names' };

const findSchema = z.object({
  find: z.string().min(1).max(500),
  replace: z.string().max(2000).default(''),
  matchCase: z.boolean().default(false),
  wholeWord: z.boolean().default(false),
  parts: z.array(z.enum(PARTS)).min(1).default(['body', 'player_summary', 'notes', 'fields']),
  type: z.string().max(40).optional(),
  realm: z.string().max(60).optional(),
  /** Only these records (the ones ticked in the preview); all that match when left out. */
  ids: zIds.optional(),
});
type FindOptions = z.infer<typeof findSchema>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matcher(o: FindOptions): RegExp {
  // "Whole word" by letters and digits of any alphabet, so names with accents work.
  const core = o.wholeWord ? `(?<![\\p{L}\\p{N}])${escapeRe(o.find)}(?![\\p{L}\\p{N}])` : escapeRe(o.find);
  return new RegExp(core, o.matchCase ? 'gu' : 'giu');
}

interface FoundRow {
  id: string;
  name: string;
  type: string;
  realm: string;
  count: number;
  /** Where the matches are, in plain words. */
  where: string[];
  /** The first match in its line, before and after. */
  before: string;
  after: string;
}

function candidates(db: DB, o: FindOptions) {
  const where = [`type NOT IN ('redirect')`, 'archived = 0'];
  const args: unknown[] = [];
  if (o.type) (where.push('type = ?'), args.push(o.type));
  if (o.realm) (where.push('realm = ?'), args.push(o.realm));
  if (o.ids) (where.push(`id IN (${o.ids.map(() => '?').join(',')})`), args.push(...o.ids));
  return db.prepare(`SELECT id, name, type, realm, aliases, fields, body, notes, player_summary FROM entities WHERE ${where.join(' AND ')} ORDER BY name`).all(...args) as {
    id: string;
    name: string;
    type: string;
    realm: string;
    aliases: string;
    fields: string;
    body: string;
    notes: string;
    player_summary: string;
  }[];
}

/** One record's parts with the replacement made, and how many matches each had. */
function replaced(r: ReturnType<typeof candidates>[number], o: FindOptions, re: RegExp) {
  const counts: Partial<Record<Part, number>> = {};
  const sub = (part: Part, text: string) => {
    let n = 0;
    // A function, so "$1" and "$&" in the replacement are plain text.
    const out = text.replace(re, () => (n++, o.replace));
    if (n) counts[part] = (counts[part] ?? 0) + n;
    return out;
  };
  const has = (p: Part) => o.parts.includes(p);
  const out = {
    name: has('name') ? sub('name', r.name) : r.name,
    body: has('body') ? sub('body', r.body) : r.body,
    player_summary: has('player_summary') ? sub('player_summary', r.player_summary) : r.player_summary,
    notes: has('notes') ? sub('notes', r.notes) : r.notes,
    // A fact's value changes; its label (the template's) stays.
    fields: has('fields') ? parseJson<[string, string][]>(r.fields, []).map(([k, v]) => [k, sub('fields', v)] as [string, string]) : parseJson<[string, string][]>(r.fields, []),
    aliases: has('aliases') ? parseJson<string[]>(r.aliases, []).map((a) => sub('aliases', a)) : parseJson<string[]>(r.aliases, []),
  };
  return { out, counts };
}

function snippet(text: string, re: RegExp, replace: string): { before: string; after: string } | null {
  const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
  if (!m) return null;
  const start = Math.max(text.lastIndexOf('\n', m.index) + 1, m.index - 60);
  const endLine = text.indexOf('\n', m.index + m[0].length);
  const end = Math.min(endLine === -1 ? text.length : endLine, m.index + m[0].length + 60);
  const pre = (start > 0 && text[start - 1] !== '\n' ? '…' : '') + text.slice(start, m.index);
  const post = text.slice(m.index + m[0].length, end) + (end < text.length && text[end] !== '\n' ? '…' : '');
  return { before: `${pre}${m[0]}${post}`, after: `${pre}${replace}${post}` };
}

/** What a find-and-replace would change: nothing is written. */
export function findInRecords(db: DB, input: unknown): { records: FoundRow[]; matches: number; more: boolean } {
  const o = findSchema.parse(input);
  const re = matcher(o);
  const records: FoundRow[] = [];
  let matches = 0;
  for (const r of candidates(db, o)) {
    const { counts } = replaced(r, o, re);
    const parts = PARTS.filter((p) => counts[p]);
    if (!parts.length) continue;
    const count = parts.reduce((n, p) => n + counts[p]!, 0);
    matches += count;
    const first = parts[0];
    const text = first === 'fields' ? parseJson<[string, string][]>(r.fields, []).map(([k, v]) => `${k}: ${v}`).join('\n') : first === 'aliases' ? parseJson<string[]>(r.aliases, []).join('\n') : r[first];
    const s = snippet(text, re, o.replace) ?? { before: '', after: '' };
    records.push({ id: r.id, name: r.name, type: r.type, realm: r.realm, count, where: parts.map((p) => `${PART_LABEL[p]}${counts[p]! > 1 ? ` (${counts[p]})` : ''}`), ...s });
  }
  return { records: records.slice(0, 500), matches, more: records.length > 500 };
}

/** Make the replacement, in the records named (or all that match). Each keeps its earlier text in its history. */
export function replaceInRecords(db: DB, input: unknown): { changed: number; matches: number } {
  const o = findSchema.parse(input);
  if (o.find === o.replace) throw badRequest('The replacement is the same as what it replaces');
  const re = matcher(o);
  return db.transaction(() => {
    let changed = 0;
    let matches = 0;
    for (const r of candidates(db, o)) {
      const { out, counts } = replaced(r, o, re);
      const n = PARTS.reduce((sum, p) => sum + (counts[p] ?? 0), 0);
      if (!n) continue;
      if (counts.name && !out.name.trim()) throw badRequest(`That would leave ${r.name} with no name`);
      updateEntity(
        db,
        r.id,
        {
          ...(counts.name ? { name: out.name.trim() } : {}),
          ...(counts.body ? { body: out.body } : {}),
          ...(counts.player_summary ? { player_summary: out.player_summary } : {}),
          ...(counts.notes ? { notes: out.notes } : {}),
          ...(counts.fields ? { fields: out.fields } : {}),
          ...(counts.aliases ? { aliases: [...new Set(out.aliases.map((a) => a.trim()).filter(Boolean))] } : {}),
          reason: `Find and replace: “${o.find}” → “${o.replace}”`,
        },
        'bulk',
      );
      changed++;
      matches += n;
    }
    return { changed, matches };
  })();
}
