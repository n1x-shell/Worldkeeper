/**
 * Creatures and items from the GM's imported books (rules packs, see docs/RULES_PACKS.md), for stat blocks, the
 * encounter tracker, treasure and the character sheets. Creatures are GM only; an item's rules may reach a player who
 * has that item. Like every pack, none of this is published, exported or part of the app.
 */
import type Database from 'better-sqlite3';
import { notFound } from '../lib/errors.js';

type DB = Database.Database;
type J = Record<string, unknown>;

export interface BookItem {
  name: string;
  type: string;
  rarity: string;
  attunement: string;
  magic: boolean;
  value: number | null;
  weight: number | null;
  text: string;
  tables: string[];
  source: string;
  prefix?: string;
  suffix?: string;
}

/** Every entry of a kind in the enabled packs; where packs share a name, the most recently imported wins. */
function entries(db: DB, kind: 'creature' | 'item'): J[] {
  const rows = db
    .prepare(
      `SELECT e.name, e.data FROM rules_entries e JOIN rules_packs p ON p.id = e.pack_id
       WHERE e.kind = ? AND p.enabled = 1 ORDER BY p.imported_at`,
    )
    .all(kind) as { name: string; data: string }[];
  const m = new Map<string, J>();
  for (const r of rows) m.set(r.name.toLowerCase(), JSON.parse(r.data) as J);
  return [...m.values()];
}

// Parsing ~800 entries is quick, but the tracker and treasure ask often: keep them until the packs change.
let cache: { stamp: string; creatures: J[]; items: BookItem[] } | null = null;
function data(db: DB) {
  const s = db.prepare(`SELECT group_concat(id || ':' || enabled || ':' || imported_at) s FROM rules_packs`).get() as { s: string | null };
  const stamp = `${db.name}|${s.s ?? ''}`;
  if (cache?.stamp !== stamp) cache = { stamp, creatures: entries(db, 'creature'), items: entries(db, 'item') as unknown as BookItem[] };
  return cache;
}

/** Book creatures for pickers and the stat block list. */
export function bookCreatureIndex(db: DB) {
  return data(db).creatures.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    kind: 'creature',
    cr: (c.cr as string) ?? null,
    ac: (c.ac as number) ?? null,
    hp: (c.hpAvg as number) ?? null,
    init: (c.init as number) ?? null,
    meta: c.meta as string,
    source: c.source as string,
    book: true,
  }));
}

export const bookCreature = (db: DB, id: string) => data(db).creatures.find((c) => c.id === id) ?? null;

/** A creature by name, as an NPC card names its base ("Priest", "warrior veteran"). */
export function creatureByName(db: DB, name: string | null | undefined) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return data(db).creatures.find((c) => (c.name as string).toLowerCase() === n) ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/**
 * The rules for an item, by the name it goes by in treasure or on a sheet: "Potion of Healing", "Weapon, +1" (the
 * book's "+1 Weapon"), "Moon-Touched Sword (XGE)", "Flame Tongue Longsword" (a generic item on a base weapon), "2 Daggers".
 */
export function itemByName(db: DB, raw: string | null | undefined): BookItem | null {
  if (!raw) return null;
  const items = data(db).items;
  const by = new Map(items.map((i) => [norm(i.name), i]));
  const tries = new Set<string>();
  const base = norm(raw)
    .replace(/\s*\([^)]*\)\s*$/, '') // "(XGE)", "(uncommon)", "(attuned)"
    .replace(/^(?:a|an|\d+)\s+/, '') // "2 Daggers"
    .replace(/^\+(\d)\s/, '+$1 ');
  tries.add(base);
  const comma = /^(.+?),\s*(.+)$/.exec(base); // "weapon, +1" → "+1 weapon"
  if (comma) tries.add(`${comma[2]} ${comma[1]}`);
  for (const t of [...tries]) if (t.endsWith('s')) tries.add(t.replace(/(e?s)$/, '')).add(t.slice(0, -1));
  for (const t of tries) if (by.has(t)) return by.get(t)!;
  // "Arcane Focus (crystal)": the thing in brackets, when it is an item of its own.
  const inner = /\(([^)]+)\)\s*$/.exec(norm(raw))?.[1];
  if (inner && by.has(inner)) return by.get(inner)!;
  // A generic magic item on a base item: "Flame Tongue Longsword", "+2 Shield", "Longsword of Wounding".
  for (const i of items)
    if ((i.prefix || i.suffix) && (!i.prefix || base.startsWith(norm(i.prefix))) && (!i.suffix || base.endsWith(norm(i.suffix)))) {
      const rest = base.slice(i.prefix ? norm(i.prefix).length : 0, i.suffix ? base.length - norm(i.suffix).length : undefined).trim();
      const under = by.get(rest);
      if (rest && (under || !i.prefix || !i.suffix)) return { ...i, name: raw.trim(), text: under ? `${i.text}\n\n${under.name}: ${under.text}` : i.text };
    }
  return null;
}

/** Book items for the GM's browser, optionally filtered. */
export function bookItems(db: DB, q = '', limit = 200) {
  const n = norm(q);
  return data(db)
    .items.filter((i) => !n || norm(i.name).includes(n) || norm(i.type).includes(n) || i.rarity.includes(n))
    .slice(0, limit);
}

export function bookCreatures(db: DB, q = '', limit = 200) {
  const n = norm(q);
  return bookCreatureIndex(db)
    .filter((c) => !n || norm(c.name).includes(n) || norm(c.meta ?? '').includes(n))
    .slice(0, limit);
}

export function requireBookCreature(db: DB, id: string) {
  const c = bookCreature(db, id);
  if (!c) throw notFound('Creature');
  return c;
}

/** How much of each the enabled packs hold. */
export const bookCounts = (db: DB) => ({ creatures: data(db).creatures.length, items: data(db).items.length });
