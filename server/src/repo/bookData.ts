/**
 * Creatures and items from the built-in SRD 5.2.1 and the GM's imported books (rules packs, see docs/RULES_PACKS.md), for stat blocks, the
 * encounter tracker, treasure and the character sheets. Creatures are GM only; an item's rules may reach a player who
 * has that item. Like every pack, none of this is published, exported or part of the app.
 */
import type Database from 'better-sqlite3';
import { notFound } from '../lib/errors.js';
import SRD_CREATURES from '../../../shared/srd/creatures.json' with { type: 'json' };
import SRD_HAZARDS from '../../../shared/srd/hazards.json' with { type: 'json' };
import SRD_ITEMS from '../../../shared/srd/items.json' with { type: 'json' };
import { settingPack, settingPackOn } from './settingPack.js';
import { getMechanics } from './mechanics.js';

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

const srdOn = (db: DB) => (db.prepare(`SELECT value FROM settings WHERE key = 'rules_srd'`).get() as { value: string } | undefined)?.value !== 'off';
/** The SRD 5.2.1's own creatures (and traps and contagions, as hazard cards) and items, built in like its rules. */
const SRD: Record<'creature' | 'item', J[]> = {
  creature: [...(SRD_CREATURES as unknown as { creatures: J[] }).creatures, ...(SRD_HAZARDS as unknown as { hazards: J[] }).hazards],
  item: (SRD_ITEMS as unknown as { items: J[] }).items,
};
export const srdCounts = () => ({ creature: SRD.creature.length, item: SRD.item.length });

/** Every entry of a kind: the SRD (unless switched off), then the enabled packs; the most recently imported wins. */
function entries(db: DB, kind: 'creature' | 'item'): J[] {
  const rows = db
    .prepare(
      `SELECT e.name, e.data FROM rules_entries e JOIN rules_packs p ON p.id = e.pack_id
       WHERE e.kind = ? AND p.enabled = 1 ORDER BY p.imported_at`,
    )
    .all(kind) as { name: string; data: string }[];
  const m = new Map<string, J>();
  if (srdOn(db)) for (const e of SRD[kind]) m.set(String(e.name).toLowerCase(), e);
  if (settingPackOn(db)) {
    const sp = settingPack(db);
    for (const e of kind === 'creature' ? sp.creatures : sp.items) m.set(String(e.name).toLowerCase(), e);
  }
  for (const r of rows) m.set(r.name.toLowerCase(), JSON.parse(r.data) as J);
  return [...m.values()];
}

// Parsing ~800 entries is quick, but the tracker and treasure ask often: keep them until the packs change.
let cache: { stamp: string; creatures: J[]; items: BookItem[] } | null = null;
function data(db: DB) {
  const s = db.prepare(`SELECT group_concat(id || ':' || enabled || ':' || imported_at) s FROM rules_packs`).get() as { s: string | null };
  const stamp = `${db.name}|${s.s ?? ''}|${srdOn(db)}|${settingPackOn(db)}|${getMechanics(db).thinning}`;
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

const ORD: Record<string, string> = { '1st': '1', '2nd': '2', '3rd': '3', '4th': '4', '5th': '5', '6th': '6', '7th': '7', '8th': '8', '9th': '9' };
/** The ways a written item name might appear in the books, best guess first. */
export function itemNameCandidates(raw: string): string[] {
  const n = norm(raw).replace(/\s*\(\*\)/g, '');
  const out: string[] = [];
  const add = (x: string) => {
    const t = x.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  // "Orb of Direction (XGE), a needle in a glass bead": drop trailing descriptions one at a time.
  const parts = n.split(/,\s*/);
  for (let k = parts.length; k >= 1; k--)
    add(
      parts
        .slice(0, k)
        .join(', ')
        .replace(/^(?:a|an|\d+)\s+/, ''),
    );
  // Each rewrite also applies to what the others make: "Weapon, +3 (blessed by the Order)" → "Weapon, +3" → "+3 Weapon".
  for (let i = 0; i < out.length && out.length < 40; i++) {
    const c = out[i];
    add(c.replace(/\((\d)(?:st|nd|rd|th) level\)/, (_, d: string) => `(level ${d})`)); // "Spell Scroll (2nd level)" → "(Level 2)"
    const paren = /^(.+?)\s*\(([^)]+)\)$/.exec(c);
    if (paren) {
      add(`${paren[1]}, ${paren[2]}`); // "Ioun Stone (Mastery)" → "Ioun Stone, Mastery"
      const of = /^(.+? of) (.+)$/.exec(paren[1]);
      if (of) add(`${of[1]} ${paren[2]} ${of[2]}`); // "Potion of Giant Strength (Hill)" → "Potion of Hill Giant Strength"
      add(paren[1]); // "Moon-Touched Sword (XGE)"
    }
    const comma = /^([^,(]+?),\s*([^,]+)$/.exec(c);
    if (comma) add(`${comma[2]} ${comma[1]}`); // "Weapon, +1" → "+1 Weapon"
  }
  for (const c of [...out]) if (c.endsWith('s')) (add(c.replace(/(?:es|s)$/, '')), add(c.slice(0, -1)));
  return out;
}

/**
 * The rules for an item, by the name it goes by in treasure or on a sheet: "Potion of Healing", "Weapon, +1" (the
 * book's "+1 Weapon"), "Moon-Touched Sword (XGE)", "Flame Tongue Longsword" (a generic item on a base weapon), "2
 * Daggers", "Spell Scroll (2nd level)", "Carpet of Flying" (one of the book's sizes).
 */
export function itemByName(db: DB, raw: string | null | undefined): BookItem | null {
  if (!raw?.trim()) return null;
  const items = data(db).items;
  const key = (name: string) => norm(name).replace(/\s*\(\*\)/g, '');
  const by = new Map(items.map((i) => [key(i.name), i]));
  const tries = itemNameCandidates(raw);
  for (const t of tries) if (by.has(t)) return by.get(t)!;
  // "Arcane Focus (crystal)": the thing in brackets, when it is an item of its own.
  const inner = /\(([^)]+)\)\s*$/.exec(norm(raw))?.[1];
  if (inner && by.has(inner)) return by.get(inner)!;
  // A generic magic item on a base item: "Flame Tongue Longsword", "+2 Shield", "Longsword of Wounding".
  const base = tries[0];
  for (const i of items)
    if ((i.prefix || i.suffix) && (!i.prefix || base.startsWith(norm(i.prefix))) && (!i.suffix || base.endsWith(norm(i.suffix)))) {
      const rest = base.slice(i.prefix ? norm(i.prefix).length : 0, i.suffix ? base.length - norm(i.suffix).length : undefined).trim();
      const under = by.get(rest);
      if (rest && (under || !i.prefix || !i.suffix)) return { ...i, name: raw.trim(), text: under ? `${i.text}\n\n${under.name}: ${under.text}` : i.text };
    }
  // A family the books split up: "Carpet of Flying" (by size), "Manual of Golems" (by golem).
  for (const t of tries) {
    const words = t.split(' ').filter((w) => w.length > 2 && w !== 'of' && w !== 'the');
    const family = items
      .filter((i) => key(i.name).startsWith(`${t}, `) || key(i.name).startsWith(`${t} (`) || (words.length > 1 && words.every((w) => key(i.name).includes(w.replace(/s$/, '')))))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (family.length)
      return {
        ...family[0],
        name: raw.trim(),
        text: family.length > 1 ? `The books have ${family.length} kinds: ${family.map((f) => f.name).join('; ')}. The first:\n\n${family[0].text}` : family[0].text,
      };
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

/**
 * What the Treasure tool can roll from the books: magic items with a set rarity (not artifacts or ones whose rarity
 * varies, and not the generic "+1 Weapon" kind, which need a base item), and gemstones and art objects with a worth.
 */
export function bookTreasure(db: DB) {
  const items = data(db).items;
  return {
    magic: items.filter((i) => i.magic && !i.prefix && !i.suffix && ['common', 'uncommon', 'rare', 'very rare', 'legendary'].includes(i.rarity)).map((i) => ({ name: i.name, rarity: i.rarity })),
    goods: items.filter((i) => (i.type === 'Gemstone' || i.type === 'Art Object') && i.value).map((i) => [i.name, i.value!] as [string, number]),
  };
}

/** Every book creature, in full (for the encounter generator). */
export const bookCreatureData = (db: DB) => data(db).creatures;
