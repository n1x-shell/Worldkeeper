import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { now, parseJson } from '../lib/json.js';

/**
 * Small, explicit CRUD helper for simple tables. Every write is validated by a zod schema;
 * JSON columns are serialised/deserialised in one place. Column names come from the schema
 * (never from user input), so the generated SQL is safe.
 */
export interface CrudOptions<S extends z.ZodObject<z.ZodRawShape>> {
  table: string;
  schema: S;
  jsonColumns?: string[];
  boolColumns?: string[];
  orderBy?: string;
  touchUpdatedAt?: boolean;
  onChange?: (db: DB, row: Record<string, unknown>) => void;
  onDelete?: (db: DB, id: number) => void;
}

export function makeCrud<S extends z.ZodObject<z.ZodRawShape>>(opts: CrudOptions<S>) {
  const jsonCols = new Set(opts.jsonColumns ?? []);
  const boolCols = new Set(opts.boolColumns ?? []);
  const columns = Object.keys(opts.schema.shape);
  const order = opts.orderBy ?? 'id';

  const decode = (row: Record<string, unknown> | undefined) => {
    if (!row) return row;
    const out: Record<string, unknown> = { ...row };
    for (const c of jsonCols) if (typeof out[c] === 'string') out[c] = parseJson(out[c] as string, null);
    for (const c of boolCols) if (c in out) out[c] = !!out[c];
    return out;
  };
  const encode = (data: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (jsonCols.has(k)) out[k] = JSON.stringify(v);
      else if (boolCols.has(k)) out[k] = v ? 1 : 0;
      else out[k] = v;
    }
    return out;
  };

  const api = {
    list(db: DB, where: Record<string, string | number | null> = {}) {
      const keys = Object.keys(where).filter((k) => columns.includes(k) || k === 'id');
      const clause = keys.length ? 'WHERE ' + keys.map((k) => (where[k] === null ? `${k} IS NULL` : `${k} = @${k}`)).join(' AND ') : '';
      return (db.prepare(`SELECT * FROM ${opts.table} ${clause} ORDER BY ${order}`).all(where) as Record<string, unknown>[]).map(
        (r) => decode(r)!,
      );
    },
    get(db: DB, id: number) {
      const row = decode(db.prepare(`SELECT * FROM ${opts.table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined);
      if (!row) throw notFound(opts.table.replace(/_/g, ' '));
      return row;
    },
    create(db: DB, input: unknown) {
      const data = encode(opts.schema.parse(input) as Record<string, unknown>);
      const keys = Object.keys(data);
      const res = db
        .prepare(`INSERT INTO ${opts.table} (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`)
        .run(data);
      const row = api.get(db, Number(res.lastInsertRowid));
      opts.onChange?.(db, row);
      return row;
    },
    update(db: DB, id: number, input: unknown) {
      api.get(db, id);
      const parsed = opts.schema.partial().parse(input) as Record<string, unknown>;
      // Only write keys the caller actually sent (zod defaults must never overwrite stored values).
      const provided = new Set(Object.keys((input ?? {}) as object));
      for (const k of Object.keys(parsed)) if (!provided.has(k)) delete parsed[k];
      const data = encode(parsed);
      const keys = Object.keys(data);
      const sets = keys.map((k) => `${k} = @${k}`);
      const hasUpdated = db.prepare(`SELECT 1 FROM pragma_table_info('${opts.table}') WHERE name = 'updated_at'`).get() != null;
      if (hasUpdated && opts.touchUpdatedAt !== false) {
        sets.push('updated_at = @__ts');
        data.__ts = now();
      }
      if (sets.length) db.prepare(`UPDATE ${opts.table} SET ${sets.join(', ')} WHERE id = @__id`).run({ ...data, __id: id });
      const row = api.get(db, id);
      opts.onChange?.(db, row);
      return row;
    },
    remove(db: DB, id: number) {
      api.get(db, id);
      db.prepare(`DELETE FROM ${opts.table} WHERE id = ?`).run(id);
      opts.onDelete?.(db, id);
    },
  };
  return api;
}

export const zId = z.string().max(40).nullable().optional();
export const zText = (max = 200_000) => z.string().max(max);
