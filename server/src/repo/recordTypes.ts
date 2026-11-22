/**
 * The library's record types (shared/recordTypes.ts): the built-in ones, written at every start, and the GM's own.
 * Server code asks `types(db)` by trait instead of naming types.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { BUILTIN_TYPES, TYPE_CATEGORIES, TYPE_KEY_RE, TYPE_PREFIX_RE, makeTypeRegistry, type RecordTypeDef, type TypeRegistry } from '../../../shared/recordTypes.js';

export interface RecordTypeInfo extends RecordTypeDef {
  builtin: boolean;
  archived: boolean;
  sort_order: number;
  /** How many records have it (the GM API's list only). */
  records?: number;
}

interface Row {
  key: string;
  label: string;
  plural: string;
  prefix: string;
  icon: string;
  pin: 'area' | 'site' | null;
  category: RecordTypeDef['category'];
  browse: string;
  handbook: string;
  traits: string;
  aliases: string;
  pack_id: string | null;
  builtin: number;
  sort_order: number;
  archived: number;
}

const toInfo = (r: Row): RecordTypeInfo => ({
  key: r.key,
  label: r.label,
  plural: r.plural,
  prefix: r.prefix,
  icon: r.icon,
  pin: r.pin,
  category: r.category,
  browse: parseJson<string[]>(r.browse, []),
  handbook: r.handbook,
  traits: parseJson(r.traits, {}),
  aliases: parseJson<string[]>(r.aliases, []),
  pack: r.pack_id,
  builtin: !!r.builtin,
  sort_order: r.sort_order,
  archived: !!r.archived,
});

/**
 * Write the built-in types into the library: new ones are added, and existing built-in rows take the shipped values
 * (a GM's label or icon change lives on a type of their own). A GM's own type with a built-in's prefix keeps its row,
 * and the built-in is skipped.
 */
export function syncBuiltinTypes(db: DB) {
  const upsert = db.prepare(
    `INSERT INTO record_types (key, label, plural, prefix, icon, pin, category, browse, handbook, traits, aliases, pack_id, builtin, sort_order)
     VALUES (@key, @label, @plural, @prefix, @icon, @pin, @category, @browse, @handbook, @traits, @aliases, @pack, 1, @sort_order)
     ON CONFLICT(key) DO UPDATE SET label = excluded.label, plural = excluded.plural, prefix = excluded.prefix, icon = excluded.icon,
       pin = excluded.pin, category = excluded.category, browse = excluded.browse, handbook = excluded.handbook, traits = excluded.traits,
       aliases = excluded.aliases, pack_id = excluded.pack_id, sort_order = excluded.sort_order
     WHERE record_types.builtin = 1`,
  );
  const prefixTaken = db.prepare('SELECT key FROM record_types WHERE prefix = ?');
  db.transaction(() => {
    BUILTIN_TYPES.forEach((t, i) => {
      const owner = prefixTaken.get(t.prefix) as { key: string } | undefined;
      if (owner && owner.key !== t.key) return;
      upsert.run({ ...t, browse: JSON.stringify(t.browse), traits: JSON.stringify(t.traits), aliases: JSON.stringify(t.aliases ?? []), sort_order: i });
    });
  })();
  cache.delete(db);
}

export function listRecordTypes(db: DB, opts: { counts?: boolean; includeArchived?: boolean } = {}): RecordTypeInfo[] {
  const rows = (db.prepare('SELECT * FROM record_types ORDER BY sort_order, label').all() as Row[]).map(toInfo).filter((t) => opts.includeArchived || !t.archived);
  if (opts.counts) {
    const counts = new Map((db.prepare('SELECT type, COUNT(*) n FROM entities WHERE archived = 0 GROUP BY type').all() as { type: string; n: number }[]).map((r) => [r.type, r.n]));
    for (const t of rows) t.records = counts.get(t.key) ?? 0;
  }
  return rows;
}

// One registry per library, rebuilt when its types change.
const cache = new WeakMap<DB, TypeRegistry>();

/** The library's type registry. Falls back to the built-ins for a library opened before migration 20. */
export function types(db: DB): TypeRegistry {
  let reg = cache.get(db);
  if (!reg) {
    let list: RecordTypeDef[];
    try {
      list = listRecordTypes(db, { includeArchived: true });
    } catch {
      list = BUILTIN_TYPES;
    }
    reg = makeTypeRegistry(list.length ? list : BUILTIN_TYPES);
    cache.set(db, reg);
  }
  return reg;
}

/** SQL for "type IN (...)" over the types with these traits, with its arguments. */
export function typeIn(db: DB, keys: string[]): { sql: string; args: string[] } {
  return keys.length ? { sql: `(${keys.map(() => '?').join(',')})`, args: keys } : { sql: `('')`, args: [] };
}

const typeInput = z.object({
  key: z.string().regex(TYPE_KEY_RE, 'Use lower-case letters, digits and underscores').optional(),
  label: z.string().trim().min(1).max(60),
  plural: z.string().trim().min(1).max(60).optional(),
  prefix: z.string().regex(TYPE_PREFIX_RE, 'Two to five capital letters'),
  icon: z.string().max(30).default('file'),
  pin: z.enum(['area', 'site']).nullable().default(null),
  category: z.enum(TYPE_CATEGORIES).default('thing'),
  browse: z.array(z.string().max(30)).max(10).default([]),
  handbook: z.string().max(30).default('other'),
  traits: z
    .object({
      place: z.boolean().optional(),
      regionLike: z.boolean().optional(),
      holdable: z.boolean().optional(),
      group: z.boolean().optional(),
      folk: z.boolean().optional(),
      person: z.boolean().optional(),
      commonNoun: z.boolean().optional(),
      intro: z.boolean().optional(),
    })
    .default({}),
  aliases: z.array(z.string().max(60)).max(20).default([]),
});

/** A type of the GM's own (Library → Templates). Its key comes from its label; its prefix must be free. */
export function createRecordType(db: DB, input: unknown): RecordTypeInfo {
  const d = typeInput.parse(input);
  const key =
    d.key ??
    d.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  if (!TYPE_KEY_RE.test(key)) throw badRequest('Give the type a name that starts with a letter');
  if (db.prepare('SELECT 1 FROM record_types WHERE key = ?').get(key)) throw badRequest(`There is already a type called "${key}"`);
  const owner = db.prepare('SELECT label FROM record_types WHERE prefix = ?').get(d.prefix) as { label: string } | undefined;
  if (owner) throw badRequest(`${owner.label} already uses the prefix ${d.prefix}`);
  const order = ((db.prepare('SELECT MAX(sort_order) m FROM record_types').get() as { m: number | null }).m ?? 0) + 1;
  db.prepare(
    `INSERT INTO record_types (key, label, plural, prefix, icon, pin, category, browse, handbook, traits, aliases, pack_id, builtin, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
  ).run(key, d.label, d.plural ?? `${d.label}s`, d.prefix, d.icon, d.pin, d.category, JSON.stringify(d.browse), d.handbook, JSON.stringify(d.traits), JSON.stringify(d.aliases), order);
  cache.delete(db);
  return getRecordType(db, key);
}

export function getRecordType(db: DB, key: string): RecordTypeInfo {
  const r = db.prepare('SELECT * FROM record_types WHERE key = ?').get(key) as Row | undefined;
  if (!r) throw notFound('Record type');
  return toInfo(r);
}

/** Change one of the GM's own types (built-ins are fixed; archive one to hide it). */
export function updateRecordType(db: DB, key: string, input: unknown): RecordTypeInfo {
  const t = getRecordType(db, key);
  const patch = z.object({ archived: z.boolean().optional() }).passthrough().parse(input);
  if (t.builtin) {
    if (patch.archived !== undefined) db.prepare('UPDATE record_types SET archived = ? WHERE key = ?').run(patch.archived ? 1 : 0, key);
  } else {
    const d = typeInput.partial().parse(input);
    if (d.prefix && d.prefix !== t.prefix) {
      const owner = db.prepare('SELECT label FROM record_types WHERE prefix = ? AND key <> ?').get(d.prefix, key) as { label: string } | undefined;
      if (owner) throw badRequest(`${owner.label} already uses the prefix ${d.prefix}`);
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined || k === 'key') continue;
      sets.push(`${k} = ?`);
      vals.push(Array.isArray(v) || (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
    }
    if (patch.archived !== undefined) {
      sets.push('archived = ?');
      vals.push(patch.archived ? 1 : 0);
    }
    if (sets.length) db.prepare(`UPDATE record_types SET ${sets.join(', ')} WHERE key = ?`).run(...vals, key);
  }
  cache.delete(db);
  return getRecordType(db, key);
}

/** Delete one of the GM's own types that no record uses. */
export function deleteRecordType(db: DB, key: string) {
  const t = getRecordType(db, key);
  if (t.builtin) throw badRequest('Built-in types can be archived, not deleted');
  const n = (db.prepare('SELECT COUNT(*) n FROM entities WHERE type = ?').get(key) as { n: number }).n;
  if (n) throw badRequest(`${n} record${n === 1 ? '' : 's'} use this type. Change them first, or archive the type.`);
  db.prepare('DELETE FROM record_types WHERE key = ?').run(key);
  db.prepare('DELETE FROM templates WHERE type = ? AND origin = ?').run(key, 'user');
  cache.delete(db);
}

/** Whether a type exists in this library. */
export const typeExists = (db: DB, key: string) => !!types(db).get(key);
