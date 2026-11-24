/**
 * Books only (docs/WORLDBOOKS_PLAN.md §2a): one switch per library that sets the open rules aside, so the GM's own books
 * are what the app uses. The open rules are the built-in SRD and openly licensed rules packs (Open5e, a worldbook's
 * bundled open rules). A worldbook's own rules (the Worldkeeper world's creatures and items) are the world's, not a
 * stand-in for a book's, and stay on.
 *
 * It is a filter, not a change to the switches: Rules packs keeps what the GM turned on, and turning Books only off puts
 * it all back. Where the books have nothing of a kind the open rules have (no classes, say), the open rules can be kept
 * for that kind alone (`keep`).
 */
import type Database from 'better-sqlite3';
import { badRequest } from '../lib/errors.js';
import SRD_SPELLS from '../../../shared/srd/spells.json' with { type: 'json' };
import SRD_TEXT from '../../../shared/srd/text.json' with { type: 'json' };
import SRD_CREATURES from '../../../shared/srd/creatures.json' with { type: 'json' };
import SRD_HAZARDS from '../../../shared/srd/hazards.json' with { type: 'json' };
import SRD_ITEMS from '../../../shared/srd/items.json' with { type: 'json' };

type DB = Database.Database;

/** Every kind of rule, in the order the app lists them. */
export const BOOK_KINDS = ['class', 'subclass', 'species', 'background', 'feat', 'spell', 'creature', 'item'] as const;
export type BookKind = (typeof BOOK_KINDS)[number];

/** A pack whose source names an open licence. */
export const isOpenSource = (source: string) => /\b(CC[- ]?BY|CC0|OGL|ORC)\b/i.test(source);

export interface BooksOnly {
  on: boolean;
  /** Kinds the open rules still count for, because the books have none. */
  keep: BookKind[];
}

const KEY = 'rules_books_only';

export function booksOnly(db: DB): BooksOnly {
  const raw = (db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined)?.value;
  if (!raw || raw === 'off') return { on: false, keep: [] };
  try {
    const v = JSON.parse(raw) as { keep?: string[] };
    return { on: true, keep: (v.keep ?? []).filter((k): k is BookKind => (BOOK_KINDS as readonly string[]).includes(k)) };
  } catch {
    return { on: false, keep: [] };
  }
}

/** Whether the open rules count for this kind in this library. */
export function openRulesFor(db: DB, kind: string): boolean {
  const b = booksOnly(db);
  return !b.on || (b.keep as string[]).includes(kind);
}

const srdOn = (db: DB) => (db.prepare(`SELECT value FROM settings WHERE key = 'rules_srd'`).get() as { value: string } | undefined)?.value !== 'off';

/** How many of each kind the built-in SRD holds. */
function srdKindCounts(): Record<BookKind, number> {
  const t = SRD_TEXT as unknown as { classes: Record<string, { subclass: unknown }>; species: object; feats: object; backgrounds: object };
  return {
    class: Object.keys(t.classes).length,
    subclass: Object.values(t.classes).filter((c) => c.subclass).length,
    species: Object.keys(t.species).length,
    background: Object.keys(t.backgrounds).length,
    feat: Object.keys(t.feats).length,
    spell: SRD_SPELLS.length,
    creature: (SRD_CREATURES as unknown as { creatures: unknown[] }).creatures.length + (SRD_HAZARDS as unknown as { hazards: unknown[] }).hazards.length,
    item: (SRD_ITEMS as unknown as { items: unknown[] }).items.length,
  };
}

export interface BooksOnlyCheck {
  /** The GM's books in use in this library (closed rules packs that are on). */
  books: { id: string; name: string }[];
  /** What the books hold, by kind. */
  fromBooks: Record<BookKind, number>;
  /** What the open rules in use hold, by kind. */
  fromOpen: Record<BookKind, number>;
  /** Kinds the open rules have and the books don't: switching to books only leaves these empty unless kept. */
  gaps: BookKind[];
}

/** What Books only would leave: the books in use, and the kinds they don't cover that the open rules do. */
export function checkBooksOnly(db: DB): BooksOnlyCheck {
  const zero = () => Object.fromEntries(BOOK_KINDS.map((k) => [k, 0])) as Record<BookKind, number>;
  const fromBooks = zero();
  const fromOpen = zero();
  if (srdOn(db)) for (const [k, n] of Object.entries(srdKindCounts())) fromOpen[k as BookKind] += n;
  const packs = db.prepare('SELECT id, name, source FROM rules_packs WHERE enabled = 1').all() as { id: string; name: string; source: string }[];
  const counts = db.prepare('SELECT kind, COUNT(*) n FROM rules_entries WHERE pack_id = ? GROUP BY kind');
  const books: BooksOnlyCheck['books'] = [];
  for (const p of packs) {
    const open = isOpenSource(p.source);
    if (!open) books.push({ id: p.id, name: p.name });
    for (const c of counts.all(p.id) as { kind: string; n: number }[]) {
      if (!(BOOK_KINDS as readonly string[]).includes(c.kind)) continue;
      (open ? fromOpen : fromBooks)[c.kind as BookKind] += c.n;
    }
  }
  return { books, fromBooks, fromOpen, gaps: BOOK_KINDS.filter((k) => fromOpen[k] > 0 && fromBooks[k] === 0) };
}

/** Turn Books only on (keeping the open rules for `keep`) or off. */
export function setBooksOnly(db: DB, on: boolean, keep: string[] = []): BooksOnly {
  if (on) {
    if (!checkBooksOnly(db).books.length) throw badRequest('There are no books’ rules in use in this library: import your books in Rules packs first.');
    const k = keep.filter((x): x is BookKind => (BOOK_KINDS as readonly string[]).includes(x));
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(KEY, JSON.stringify({ keep: k }));
  } else db.prepare('DELETE FROM settings WHERE key = ?').run(KEY);
  return booksOnly(db);
}
