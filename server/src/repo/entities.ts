import type { DB } from '../db/connection.js';
import { parseJson, now } from '../lib/json.js';
import { sha256 } from '../lib/hash.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { Entity, EntitySummary, Realm, EntityType, CanonStatus } from '../../../shared/domain.js';
import { BARE_ID_RE, CANON_STATUSES, ENTITY_TYPES, REALMS } from '../../../shared/domain.js';
import { z } from 'zod';
import { reindexEntity } from './search.js';
import { rebuildDerivedRelationships } from './relationships.js';

export interface EntityRow {
  id: string;
  name: string;
  aliases: string;
  category_raw: string | null;
  type: string;
  parent_raw: string | null;
  parent_id: string | null;
  realm_raw: string | null;
  realm: string;
  realms: string;
  canon_raw: string | null;
  canon_status: string;
  canon_flags: string;
  source_raw: string | null;
  tags: string;
  fields: string;
  body: string;
  notes: string;
  source_visibility: string | null;
  revealed: number;
  player_summary: string;
  revealed_sections: string;
  revealed_facts: string;
  origin: string;
  source_file: string | null;
  source_hash: string | null;
  import_content_hash: string | null;
  redirect_to: string | null;
  archived: number;
  favorite: number;
  version: number;
  created_at: string;
  updated_at: string;
}

/** The lore-bearing fields. Their hash detects whether a record changed since import. */
export interface ContentFields {
  name: string;
  aliases: string[];
  category_raw: string | null;
  type: string;
  parent_raw: string | null;
  parent_id: string | null;
  realm_raw: string | null;
  realm: string;
  canon_raw: string | null;
  canon_status: string;
  source_raw: string | null;
  tags: string[];
  fields: [string, string][];
  body: string;
}

export function contentHash(c: ContentFields): string {
  return sha256(
    JSON.stringify([
      c.name,
      c.aliases,
      c.category_raw,
      c.type,
      c.parent_raw,
      c.parent_id,
      c.realm_raw,
      c.realm,
      c.canon_raw,
      c.canon_status,
      c.source_raw,
      c.tags,
      c.fields,
      c.body,
    ]),
  );
}

export function rowToEntity(r: EntityRow): Entity {
  const e: Entity = {
    id: r.id,
    name: r.name,
    aliases: parseJson(r.aliases, []),
    category_raw: r.category_raw,
    type: r.type as EntityType,
    parent_raw: r.parent_raw,
    parent_id: r.parent_id,
    realm_raw: r.realm_raw,
    realm: r.realm as Realm,
    realms: parseJson(r.realms, []),
    canon_raw: r.canon_raw,
    canon_status: r.canon_status as CanonStatus,
    canon_flags: parseJson(r.canon_flags, []),
    source_raw: r.source_raw,
    tags: parseJson(r.tags, []),
    fields: parseJson(r.fields, []),
    body: r.body,
    notes: r.notes,
    source_visibility: (r.source_visibility as 'gm' | 'player' | null) ?? null,
    revealed: !!r.revealed,
    player_summary: r.player_summary,
    revealed_sections: parseJson(r.revealed_sections, []),
    revealed_facts: parseJson(r.revealed_facts, []),
    origin: r.origin as 'import' | 'user',
    source_file: r.source_file,
    source_hash: r.source_hash,
    redirect_to: r.redirect_to,
    archived: !!r.archived,
    favorite: !!r.favorite,
    version: r.version,
    created_at: r.created_at,
    updated_at: r.updated_at,
    modified_since_import: false,
  };
  e.modified_since_import = r.origin === 'import' && !!r.import_content_hash && contentHash(e) !== r.import_content_hash;
  return e;
}

export function toSummary(e: Entity | EntityRow): EntitySummary {
  const ent = 'aliases' in e && typeof e.aliases === 'string' ? rowToEntity(e as EntityRow) : (e as Entity);
  return {
    id: ent.id,
    name: ent.name,
    aliases: ent.aliases,
    redirect_to: ent.redirect_to,
    type: ent.type,
    realm: ent.realm,
    canon_status: ent.canon_status,
    canon_flags: ent.canon_flags,
    category_raw: ent.category_raw,
    parent_id: ent.parent_id,
    tags: ent.tags,
    archived: ent.archived,
    favorite: ent.favorite,
    revealed: ent.revealed,
    updated_at: ent.updated_at,
  };
}

export function getEntityRow(db: DB, id: string): EntityRow | undefined {
  return db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as EntityRow | undefined;
}

export function getEntity(db: DB, id: string): Entity {
  const row = getEntityRow(db, id);
  if (!row) throw notFound(`Record ${id}`);
  return rowToEntity(row);
}

export interface ListFilters {
  type?: string[];
  realm?: string[];
  canon?: string[];
  tag?: string;
  parent?: string;
  includeArchived?: boolean;
  includeMeta?: boolean;
  favorite?: boolean;
  q?: string;
}

export function listEntities(db: DB, f: ListFilters = {}): EntitySummary[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.type?.length) {
    where.push(`type IN (${f.type.map(() => '?').join(',')})`);
    args.push(...f.type);
  } else if (!f.includeMeta) {
    where.push(`type NOT IN ('redirect')`);
  }
  if (f.realm?.length) {
    where.push(`realm IN (${f.realm.map(() => '?').join(',')})`);
    args.push(...f.realm);
  }
  if (f.canon?.length) {
    where.push(`(${f.canon.map(() => `(canon_status = ? OR canon_flags LIKE ?)`).join(' OR ')})`);
    for (const c of f.canon) args.push(c, `%"${c}"%`);
  }
  if (f.tag) {
    where.push(`tags LIKE ?`);
    args.push(`%"${f.tag}"%`);
  }
  if (f.parent) {
    where.push('parent_id = ?');
    args.push(f.parent);
  }
  if (f.favorite) where.push('favorite = 1');
  if (!f.includeArchived) where.push('archived = 0');
  if (f.q) {
    where.push('(name LIKE ? OR id LIKE ? OR aliases LIKE ?)');
    args.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const sql = `SELECT * FROM entities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
  return (db.prepare(sql).all(...args) as EntityRow[]).map((r) => toSummary(rowToEntity(r)));
}

export function saveRevision(db: DB, e: Entity, changeType: string, reason: string) {
  db.prepare(
    'INSERT INTO entity_revisions (entity_id, version, change_type, reason, snapshot) VALUES (?, ?, ?, ?, ?)',
  ).run(e.id, e.version, changeType, reason, JSON.stringify(e));
}

export function listRevisions(db: DB, id: string) {
  return db
    .prepare('SELECT id, entity_id, version, change_type, reason, created_at FROM entity_revisions WHERE entity_id = ? ORDER BY id DESC')
    .all(id);
}

export function getRevision(db: DB, revId: number) {
  const r = db.prepare('SELECT * FROM entity_revisions WHERE id = ?').get(revId) as
    | { id: number; entity_id: string; snapshot: string; version: number; change_type: string; reason: string; created_at: string }
    | undefined;
  if (!r) throw notFound('Revision');
  return { ...r, snapshot: parseJson<Entity>(r.snapshot, {} as Entity) };
}

// ---------- Writing ----------

export const entityInputSchema = z.object({
  id: z.string().regex(BARE_ID_RE).optional(),
  name: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().max(300)).max(100).default([]),
  category_raw: z.string().max(300).nullable().optional(),
  type: z.enum(ENTITY_TYPES),
  parent_id: z.string().max(40).nullable().optional(),
  parent_raw: z.string().max(500).nullable().optional(),
  realm: z.enum(REALMS),
  canon_status: z.enum(CANON_STATUSES),
  canon_flags: z.array(z.string().max(40)).max(20).optional(),
  canon_raw: z.string().max(500).nullable().optional(),
  source_raw: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(100)).max(100).default([]),
  fields: z.array(z.tuple([z.string().max(100), z.string().max(5000)])).max(100).default([]),
  body: z.string().max(2_000_000).default(''),
  notes: z.string().max(2_000_000).default(''),
});
export type EntityInput = z.infer<typeof entityInputSchema>;

export const entityPatchSchema = entityInputSchema
  .omit({ id: true })
  .partial()
  .extend({
    player_summary: z.string().max(100_000).optional(),
    revealed: z.boolean().optional(),
    revealed_sections: z.array(z.string().max(300)).max(200).optional(),
    revealed_facts: z.array(z.string().max(5000)).max(500).optional(),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
    expected_version: z.number().int().optional(),
    reason: z.string().max(2000).optional(),
  });
export type EntityPatch = z.infer<typeof entityPatchSchema>;

const PLAY_STATE_KEYS = ['player_summary', 'revealed', 'revealed_sections', 'revealed_facts', 'favorite', 'archived'] as const;

export function nextCustomId(db: DB, prefix = 'CUS'): string {
  const rows = db.prepare(`SELECT id FROM entities WHERE id LIKE ?`).all(`${prefix}-%`) as { id: string }[];
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.id.split('-')[1], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export function findSimilarNames(db: DB, name: string, excludeId?: string): EntitySummary[] {
  const norm = name.toLowerCase().replace(/^the\s+/, '').trim();
  const rows = db
    .prepare(`SELECT * FROM entities WHERE (lower(name) LIKE ? OR lower(aliases) LIKE ?) AND type != 'redirect'`)
    .all(`%${norm}%`, `%${norm}%`) as EntityRow[];
  return rows.filter((r) => r.id !== excludeId).map((r) => toSummary(rowToEntity(r)));
}

/** Create a user-authored record. New records default to PROPOSED unless the DM sets otherwise. */
export function createEntity(db: DB, input: EntityInput, reason = 'Created'): Entity {
  const data = entityInputSchema.parse(input);
  const id = data.id ?? nextCustomId(db);
  if (getEntityRow(db, id)) throw badRequest(`ID ${id} already exists. Stable IDs are never reused.`);
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO entities (id, name, aliases, category_raw, type, parent_raw, parent_id, realm, realms, canon_raw, canon_status,
        canon_flags, source_raw, tags, fields, body, notes, origin, created_at, updated_at)
       VALUES (@id, @name, @aliases, @category_raw, @type, @parent_raw, @parent_id, @realm, @realms, @canon_raw, @canon_status,
        @canon_flags, @source_raw, @tags, @fields, @body, @notes, 'user', @ts, @ts)`,
    ).run({
      id,
      name: data.name,
      aliases: JSON.stringify(data.aliases),
      category_raw: data.category_raw ?? null,
      type: data.type,
      parent_raw: data.parent_raw ?? null,
      parent_id: data.parent_id ?? null,
      realm: data.realm,
      realms: JSON.stringify([data.realm]),
      canon_raw: data.canon_raw ?? data.canon_status,
      canon_status: data.canon_status,
      canon_flags: JSON.stringify(data.canon_flags ?? [data.canon_status]),
      source_raw: data.source_raw ?? null,
      tags: JSON.stringify(data.tags),
      fields: JSON.stringify(data.fields),
      body: data.body,
      notes: data.notes,
      ts,
    });
    const e = getEntity(db, id);
    saveRevision(db, e, 'create', reason);
    rebuildDerivedRelationships(db, id);
    reindexEntity(db, id);
    if (e.canon_status === 'PROPOSED') {
      db.prepare(`INSERT INTO proposals (kind, entity_id, title, payload, reason) VALUES ('new_entity', ?, ?, '{}', ?)`).run(
        id,
        `New record: ${e.name}`,
        reason,
      );
    }
    return e;
  });
  return tx();
}

export class VersionConflictError extends Error {
  constructor(public current: Entity) {
    super('This record was changed elsewhere since you opened it.');
  }
}

/**
 * Update a record. Every change bumps the version and stores a revision snapshot of the PREVIOUS state,
 * so any edit can be inspected and reverted. Imported source documents are never touched.
 */
export function updateEntity(db: DB, id: string, patch: EntityPatch, changeType = 'edit'): Entity {
  const p = entityPatchSchema.parse(patch) as Record<string, unknown> & EntityPatch;
  // Only apply keys the caller sent: schema defaults must never blank stored lore.
  const provided = new Set(Object.keys(patch ?? {}));
  for (const k of Object.keys(p)) if (!provided.has(k)) delete p[k];
  const tx = db.transaction(() => {
    const before = getEntity(db, id);
    if (p.expected_version != null && p.expected_version !== before.version) throw new VersionConflictError(before);
    const sets: string[] = [];
    const args: Record<string, unknown> = { id };
    const assign = (col: string, val: unknown) => {
      sets.push(`${col} = @${col}`);
      args[col] = val;
    };
    let contentChanged = false;
    const json = (v: unknown) => JSON.stringify(v);
    const contentCols: [keyof EntityPatch, string, (v: never) => unknown][] = [
      ['name', 'name', (v: string) => v],
      ['aliases', 'aliases', json],
      ['category_raw', 'category_raw', (v: string | null) => v],
      ['type', 'type', (v: string) => v],
      ['parent_id', 'parent_id', (v: string | null) => v],
      ['parent_raw', 'parent_raw', (v: string | null) => v],
      ['realm', 'realm', (v: string) => v],
      ['canon_status', 'canon_status', (v: string) => v],
      ['canon_flags', 'canon_flags', json],
      ['canon_raw', 'canon_raw', (v: string | null) => v],
      ['source_raw', 'source_raw', (v: string | null) => v],
      ['tags', 'tags', json],
      ['fields', 'fields', json],
      ['body', 'body', (v: string) => v],
    ];
    for (const [key, col, conv] of contentCols) {
      if (p[key] === undefined) continue;
      const newVal = conv(p[key] as never);
      const oldVal = (() => {
        const v = (before as unknown as Record<string, unknown>)[col];
        return typeof newVal === 'string' && typeof v !== 'string' && v !== null ? JSON.stringify(v) : v;
      })();
      if (newVal !== oldVal) {
        assign(col, newVal);
        contentChanged = true;
      }
    }
    if (p.notes !== undefined && p.notes !== before.notes) assign('notes', p.notes);
    for (const k of PLAY_STATE_KEYS) {
      const v = p[k];
      if (v === undefined) continue;
      if (typeof v === 'boolean') assign(k, v ? 1 : 0);
      else if (Array.isArray(v)) assign(k, JSON.stringify(v));
      else assign(k, v);
    }
    if (!sets.length) return before;
    // Autosave sends many small writes; one revision per editing burst (same reason, within 10 minutes)
    // keeps history meaningful. The stored snapshot is the state before the burst began.
    const last = db
      .prepare('SELECT change_type, reason, created_at FROM entity_revisions WHERE entity_id = ? ORDER BY id DESC LIMIT 1')
      .get(id) as { change_type: string; reason: string; created_at: string } | undefined;
    const coalesce =
      changeType === 'edit' &&
      last?.change_type === 'edit' &&
      last.reason === (p.reason ?? '') &&
      Date.now() - new Date(last.created_at).getTime() < 10 * 60 * 1000;
    if (!coalesce) saveRevision(db, before, changeType, p.reason ?? '');
    sets.push('version = version + 1', 'updated_at = @ts');
    args.ts = now();
    db.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = @id`).run(args);
    if (contentChanged) {
      rebuildDerivedRelationships(db, id);
      reindexEntity(db, id);
    }
    return getEntity(db, id);
  });
  return tx();
}

/** Restore the lore content of an earlier revision (as a new version; history is kept). */
export function revertToRevision(db: DB, id: string, revisionId: number, reason: string): Entity {
  const rev = getRevision(db, revisionId);
  if (rev.entity_id !== id) throw badRequest('Revision belongs to a different record');
  const s = rev.snapshot;
  return updateEntity(
    db,
    id,
    {
      name: s.name,
      aliases: s.aliases,
      category_raw: s.category_raw,
      type: s.type,
      parent_id: s.parent_id,
      parent_raw: s.parent_raw,
      realm: s.realm,
      canon_status: s.canon_status,
      canon_flags: s.canon_flags,
      canon_raw: s.canon_raw,
      source_raw: s.source_raw,
      tags: s.tags,
      fields: s.fields,
      body: s.body,
      reason: reason || `Reverted to revision ${revisionId} (version ${rev.version})`,
    },
    'revert',
  );
}

/** Accept the current content of an imported record as the new reviewed baseline. */
export function acceptAsBaseline(db: DB, id: string, note: string) {
  const e = getEntity(db, id);
  db.prepare('UPDATE entities SET import_content_hash = ? WHERE id = ?').run(contentHash(e), id);
  saveRevision(db, e, 'approved', note || 'Change approved in Canon Review');
}

/** Duplicate as a new PROPOSED draft linked to the original. The original is unchanged. */
export function duplicateAsDraft(db: DB, id: string): Entity {
  const src = getEntity(db, id);
  const copy = createEntity(
    db,
    {
      name: `${src.name} (draft)`,
      aliases: [],
      category_raw: src.category_raw,
      type: src.type,
      parent_id: src.parent_id,
      parent_raw: src.parent_raw,
      realm: src.realm,
      canon_status: 'PROPOSED',
      canon_flags: ['PROPOSED'],
      source_raw: `Draft derived from ${src.name} [${src.id}]`,
      tags: src.tags.filter((t) => !t.startsWith('status/')).concat('status/proposed'),
      fields: src.fields,
      body: src.body,
      notes: '',
    },
    `Duplicated from ${src.id}`,
  );
  db.prepare(
    `INSERT OR IGNORE INTO relationships (source_id, target_id, type, directed, origin, canon_status) VALUES (?, ?, 'draft_of', 1, 'user', 'PROPOSED')`,
  ).run(copy.id, src.id);
  return copy;
}

export function recordView(db: DB, id: string) {
  db.prepare('INSERT INTO recent_views (entity_id, viewed_at) VALUES (?, ?) ON CONFLICT(entity_id) DO UPDATE SET viewed_at = excluded.viewed_at').run(
    id,
    now(),
  );
}

export function recentViews(db: DB, limit = 12): EntitySummary[] {
  const rows = db
    .prepare(
      `SELECT e.* FROM recent_views r JOIN entities e ON e.id = r.entity_id ORDER BY r.viewed_at DESC LIMIT ?`,
    )
    .all(limit) as EntityRow[];
  return rows.map((r) => toSummary(rowToEntity(r)));
}

export function recentlyEdited(db: DB, limit = 10) {
  return db
    .prepare(
      `SELECT r.entity_id, r.change_type, r.reason, MAX(r.created_at) AS created_at, e.name, e.type, e.realm FROM entity_revisions r
       JOIN entities e ON e.id = r.entity_id WHERE r.change_type NOT IN ('import','pre-import') GROUP BY r.entity_id ORDER BY MAX(r.id) DESC LIMIT ?`,
    )
    .all(limit);
}
