/**
 * The GM's own magic items and spells (v0.9.5, docs/BETA_PLAN.md B2). They are kept in the library, so they travel
 * with its backups and shared worldbooks, and they join the rules the app already reads: an item shows in Your Books,
 * treasure and on sheets by its name; a spell shows in the sheet's and the builder's spell lists for its classes.
 * A worldbook's own (its homebrew/ folder) come in the same way, marked with its id.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';

export type HomebrewKind = 'item' | 'spell';
export const HOMEBREW_SOURCE = 'Your own';

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;
export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] as const;

const itemSchema = z.object({
  /** "Wondrous Item", "Weapon (Longsword)", "Potion"… as the books write it. */
  type: z.string().trim().max(80).default('Wondrous Item'),
  /** Empty for something that isn't magic. */
  rarity: z.enum(['', ...RARITIES]).default(''),
  /** "requires attunement", "requires attunement by a cleric", or empty. */
  attunement: z.string().trim().max(120).default(''),
  value: z.number().min(0).max(10_000_000).nullable().default(null),
  weight: z.number().min(0).max(100_000).nullable().default(null),
  text: z.string().trim().min(1, 'Say what it does').max(20_000),
});

const spellSchema = z.object({
  level: z.number().int().min(0).max(9),
  school: z.enum(SCHOOLS),
  classes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  time: z.string().trim().max(120).default('Action'),
  range: z.string().trim().max(120).default(''),
  components: z.string().trim().max(300).default(''),
  duration: z.string().trim().max(120).default('Instantaneous'),
  ritual: z.boolean().default(false),
  text: z.string().trim().min(1, 'Say what it does').max(20_000),
});

const bodySchema = z.object({
  kind: z.enum(['item', 'spell']),
  name: z.string().trim().min(1, 'Give it a name').max(120),
  /** The record this is the rules of (an item record), if any. */
  entity_id: z.string().max(40).nullable().optional(),
  data: z.unknown(),
});

export interface Homebrew {
  id: number;
  kind: HomebrewKind;
  name: string;
  entity_id: string | null;
  /** The worldbook it came with; null for the GM's own. */
  pack_id: string | null;
  data: Record<string, unknown>;
}
interface Row {
  id: number;
  kind: HomebrewKind;
  name: string;
  entity_id: string | null;
  pack_id: string | null;
  data: string;
  record_name: string | null;
}

/** What is kept for each kind, with what follows from it filled in. */
function shape(kind: HomebrewKind, data: unknown): Record<string, unknown> {
  if (kind === 'item') {
    const d = itemSchema.parse(data ?? {});
    return { ...d, magic: !!d.rarity };
  }
  const d = spellSchema.parse(data ?? {});
  return { ...d, concentration: /^concentration/i.test(d.duration), material: /\bM\b/.test(d.components) };
}

const out = (r: Row): Homebrew => ({
  id: r.id,
  kind: r.kind,
  // The rules of a record go by the record's name as it is now.
  name: r.record_name ?? r.name,
  entity_id: r.entity_id,
  pack_id: r.pack_id,
  data: parseJson<Record<string, unknown>>(r.data, {}),
});
const SELECT = `SELECT h.id, h.kind, h.name, h.entity_id, h.pack_id, h.data, e.name AS record_name FROM homebrew h LEFT JOIN entities e ON e.id = h.entity_id`;

export function listHomebrew(db: DB, kind?: HomebrewKind): Homebrew[] {
  try {
    const rows = (kind ? db.prepare(`${SELECT} WHERE h.kind = ? ORDER BY h.name COLLATE NOCASE`).all(kind) : db.prepare(`${SELECT} ORDER BY h.kind, h.name COLLATE NOCASE`).all()) as Row[];
    return rows.map(out);
  } catch {
    return []; // a library from before migration 35
  }
}

/** The rules a record has of its own (an item record's), if any. */
export function homebrewForRecord(db: DB, entityId: string): Homebrew | null {
  const r = db.prepare(`${SELECT} WHERE h.entity_id = ?`).get(entityId) as Row | undefined;
  return r ? out(r) : null;
}

/** Make one, or change one (with `id`). A name can be used once for each kind. */
export function saveHomebrew(db: DB, body: unknown, id?: number): Homebrew {
  const b = bodySchema.parse(body ?? {});
  const data = shape(b.kind, b.data);
  if (b.entity_id && !db.prepare('SELECT 1 FROM entities WHERE id = ?').get(b.entity_id)) throw notFound('Record');
  const clash = db.prepare('SELECT id FROM homebrew WHERE kind = ? AND name = ? COLLATE NOCASE').get(b.kind, b.name) as { id: number } | undefined;
  if (clash && clash.id !== id) throw badRequest(`You already have ${b.kind === 'item' ? 'an item' : 'a spell'} called ${b.name}`);
  if (id === undefined) {
    if (b.entity_id && db.prepare('SELECT 1 FROM homebrew WHERE entity_id = ?').get(b.entity_id)) throw badRequest('That record already has rules of its own');
    id = Number(db.prepare('INSERT INTO homebrew (kind, name, entity_id, data) VALUES (?, ?, ?, ?)').run(b.kind, b.name, b.entity_id ?? null, JSON.stringify(data)).lastInsertRowid);
  } else {
    const was = db.prepare('SELECT kind FROM homebrew WHERE id = ?').get(id) as { kind: string } | undefined;
    if (!was) throw notFound(b.kind === 'item' ? 'Item' : 'Spell');
    if (was.kind !== b.kind) throw badRequest('An item can’t become a spell, or a spell an item');
    // Changing a worldbook's makes it the GM's own: an update of the worldbook leaves it alone.
    db.prepare(`UPDATE homebrew SET name = ?, entity_id = COALESCE(?, entity_id), data = ?, pack_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(
      b.name,
      b.entity_id ?? null,
      JSON.stringify(data),
      id,
    );
  }
  return out(db.prepare(`${SELECT} WHERE h.id = ?`).get(id) as Row);
}

export function deleteHomebrew(db: DB, id: number) {
  if (!db.prepare('DELETE FROM homebrew WHERE id = ?').run(id).changes) throw notFound('Item or spell');
}

/** The GM's items as the rest of the app reads items (Your Books, treasure, sheets). */
export function homebrewItems(db: DB) {
  return listHomebrew(db, 'item').map((h) => ({ tables: [], ...h.data, name: h.name, source: HOMEBREW_SOURCE, homebrew: h.id }));
}

/** The GM's spells as rules entries, for the sheet's and the builder's spell lists. */
export function homebrewSpells(db: DB) {
  return listHomebrew(db, 'spell').map((h) => ({ kind: 'spell' as const, name: h.name, cls: '', data: { ...h.data, name: h.name } }));
}

/** A stamp that changes whenever the GM's items or spells do (for the caches that hold them). */
export function homebrewStamp(db: DB): string {
  try {
    const r = db.prepare(`SELECT COUNT(*) n, COALESCE(MAX(updated_at), '') t FROM homebrew`).get() as { n: number; t: string };
    return `${r.n}:${r.t}`;
  } catch {
    return '';
  }
}

/**
 * A worldbook's own items and spells (its homebrew/homebrew.json), each added once: one the library already has by
 * that name, the GM's or another worldbook's, is left alone.
 */
export function applyHomebrew(db: DB, list: { kind?: unknown; name?: unknown; entity_id?: unknown; data?: unknown }[], packId: string): number {
  let added = 0;
  const have = db.prepare('SELECT 1 FROM homebrew WHERE kind = ? AND name = ? COLLATE NOCASE');
  const record = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  const linked = db.prepare('SELECT 1 FROM homebrew WHERE entity_id = ?');
  for (const h of list) {
    if ((h.kind !== 'item' && h.kind !== 'spell') || typeof h.name !== 'string' || !h.name.trim() || have.get(h.kind, h.name.trim())) continue;
    let data: Record<string, unknown>;
    try {
      data = shape(h.kind, h.data);
    } catch {
      continue; // not rules this version reads
    }
    const entity = typeof h.entity_id === 'string' && record.get(h.entity_id) && !linked.get(h.entity_id) ? h.entity_id : null;
    db.prepare('INSERT INTO homebrew (kind, name, entity_id, pack_id, data) VALUES (?, ?, ?, ?, ?)').run(h.kind, h.name.trim().slice(0, 120), entity, packId, JSON.stringify(data));
    added++;
  }
  return added;
}
