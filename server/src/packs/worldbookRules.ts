/**
 * Worldbooks and the GM's books (docs/WORLDBOOKS_PLAN.md §2a, W3c). A worldbook never holds book text: it names rules,
 * and the app finds each name in the rules this GM has.
 *
 *  - What a world names: the species its peoples play as ("Use the tabaxi rules"), the classes its people have (a
 *    Class fact), and the items in its treasure pools.
 *  - Where each comes from here: the SRD, the world's own rules, an open pack, one of the GM's books, or nowhere.
 *  - Sharing asks how the books count: required (it can't be added without them), optional (it can, with a warning)
 *    or safe mode (each thing only a book has gets an open stand-in of the same kind, which the GM reviews; the
 *    original is kept, so a GM with the book gets it). Open rules the world uses beyond the SRD travel with it.
 *  - Adding says what's missing, refuses a worldbook whose required books the GM doesn't have, switches the books it
 *    needs on in the library, and keeps its stand-ins (they fill in only where the original is missing).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import SRD_TEXT from '../../../shared/srd/text.json' with { type: 'json' };
import SRD_ITEMS from '../../../shared/srd/items.json' with { type: 'json' };
import SRD_CREATURES from '../../../shared/srd/creatures.json' with { type: 'json' };
import { rulesSpeciesName } from '../../../shared/rulesView.js';
import { itemNameCandidates } from '../repo/bookData.js';
import { settingPack } from '../repo/settingPack.js';
import { types } from '../repo/recordTypes.js';
import { isOpenSource } from '../repo/booksOnly.js';
import { saveRulesPack, setPackSwitch, sharedPackExists } from '../repo/sharedRules.js';
import { setStandIns, type StandIn } from '../repo/standIns.js';
export { forgetStandIns } from '../repo/standIns.js';

export type RefKind = 'species' | 'class' | 'item' | 'creature';
export interface RuleRef {
  kind: RefKind;
  name: string;
}
/** Where a named rule comes from in this GM's rules (every pack on the computer, on or off in this library). */
export interface Resolved extends RuleRef {
  from: 'srd' | 'world' | 'open' | 'book' | 'missing';
  /** The pack it was found in (an open pack or a book). */
  pack?: { id: string; name: string; source: string };
  /** The book it names, when it isn't here ("Moon-Touched Sword (XGE)": Xanathar's Guide to Everything). */
  book?: string;
}
/** What a shared worldbook's manifest says about the rules it names. */
export interface WorldbookRules {
  mode: 'required' | 'optional' | 'safe';
  books: { name: string; things: RuleRef[] }[];
  standIns: StandIn[];
  /** Open packs whose rules travel with it (in open-rules/<id>.json), with their credits. */
  open: { id: string; name: string; source: string }[];
}

type J = Record<string, unknown>;
const lc = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Books named by the short tags treasure lists use. */
const BOOK_TAGS: Record<string, string> = {
  XGE: "Xanathar's Guide to Everything",
  TCE: "Tasha's Cauldron of Everything",
  SJ: 'Spelljammer: Adventures in Space',
  WDMM: 'Waterdeep: Dungeon of the Mad Mage',
  GOS: 'Ghosts of Saltmarsh',
  BMT: 'The Book of Many Things',
  AI: 'Acquisitions Incorporated',
  DMG: "Dungeon Master's Guide (2024)",
  MPMM: 'Mordenkainen Presents: Monsters of the Multiverse',
  EFA: 'Eberron: Forge of the Artificer',
};
const tagBook = (raw: string) => {
  const m = /\(([A-Za-z]{2,5})\)\s*$/.exec(raw.trim());
  return m ? BOOK_TAGS[m[1].toUpperCase()] : undefined;
};

/** The rules a library's records (one worldbook's, or the GM's own) and a worldbook's treasure name. */
export function ruleRefs(db: DB, packId: string | null, packDir?: string): RuleRef[] {
  const out = new Map<string, RuleRef>();
  const add = (kind: RefKind, name: string) => {
    const n = name.trim();
    if (n && !out.has(`${kind}:${lc(n)}`)) out.set(`${kind}:${lc(n)}`, { kind, name: n });
  };
  const owner = packId === null ? 'pack_id IS NULL' : 'pack_id = ?';
  const args = packId === null ? [] : [packId];
  // The species each people plays as.
  const folk = types(db).with('folk');
  if (folk.length) {
    const rows = db.prepare(`SELECT body FROM entities WHERE archived = 0 AND ${owner} AND type IN (${folk.map(() => '?').join(',')})`).all(...args, ...folk) as { body: string }[];
    for (const r of rows) {
      const s = rulesSpeciesName(r.body);
      if (s) add('species', s);
    }
  }
  // The classes people have ("Class: Warlock (Great Old One Patron)", "Fighter/Wizard").
  for (const r of db.prepare(`SELECT fields FROM entities WHERE archived = 0 AND ${owner} AND fields LIKE '%"Class"%'`).all(...args) as { fields: string }[]) {
    const v = (JSON.parse(r.fields) as [string, string][]).find(([k]) => k === 'Class')?.[1] ?? '';
    for (const c of v.split(/[.(,;]/)[0].split(/\s*\/\s*/)) if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(c.trim()) && !/^(Unknown|None|Varies)$/.test(c.trim())) add('class', c.trim());
  }
  // The items its treasure pools roll.
  const pools = packDir && path.join(packDir, 'treasure', 'pools.json');
  if (pools && fs.existsSync(pools)) {
    const p = (JSON.parse(fs.readFileSync(pools, 'utf8')) as { pools?: Record<string, Record<string, string[]>> }).pools ?? {};
    for (const tiers of Object.values(p)) for (const list of Object.values(tiers)) for (const name of list) add('item', name);
  }
  return [...out.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

const SRD = {
  species: new Set(Object.keys((SRD_TEXT as unknown as { species: J }).species).map(lc)),
  class: new Set(Object.keys((SRD_TEXT as unknown as { classes: J }).classes).map(lc)),
  item: new Set((SRD_ITEMS as unknown as { items: { name: string }[] }).items.map((i) => lc(i.name))),
  creature: new Set((SRD_CREATURES as unknown as { creatures: { name: string }[] }).creatures.map((c) => lc(c.name))),
};
const names = (kind: RefKind, raw: string) => (kind === 'item' ? itemNameCandidates(raw) : [lc(raw)]);

/** Where each named rule comes from in this GM's rules. */
export function resolveRefs(db: DB, refs: RuleRef[]): Resolved[] {
  const world = settingPack(db);
  const worldNames = { item: new Set(world.items.map((i) => lc(String(i.name)))), creature: new Set(world.creatures.map((c) => lc(String(c.name)))) };
  const entry = db.prepare(
    `SELECT p.id, p.name, p.source FROM rules_entries e JOIN rules_packs p ON p.id = e.pack_id WHERE e.kind = ? AND lower(e.name) = ? ORDER BY p.imported_at DESC`,
  );
  return refs.map((r) => {
    const cands = names(r.kind, r.name);
    if (cands.some((c) => SRD[r.kind].has(c))) return { ...r, from: 'srd' };
    if ((r.kind === 'item' || r.kind === 'creature') && cands.some((c) => worldNames[r.kind as 'item' | 'creature'].has(c))) return { ...r, from: 'world' };
    // A book of the GM's wins over an open pack with the same name.
    const found = cands.flatMap((c) => entry.all(r.kind, c) as { id: string; name: string; source: string }[]);
    const book = found.find((p) => !isOpenSource(p.source));
    if (book) return { ...r, from: 'book', pack: book, book: book.name };
    if (found[0]) return { ...r, from: 'open', pack: found[0] };
    return { ...r, from: 'missing', ...(tagBook(r.name) ? { book: tagBook(r.name) } : {}) };
  });
}

// ---- Stand-ins ---------------------------------------------------------------------------------------------------

const srdSpecies = () => Object.entries((SRD_TEXT as unknown as { species: Record<string, { size: string[]; speed: number }> }).species);
const srdItems = () => (SRD_ITEMS as unknown as { items: { name: string; type: string; rarity: string; magic: boolean }[] }).items;
const CLASS_STAND_INS: Record<string, string> = { artificer: 'Wizard', 'blood hunter': 'Warlock' };

/** The open rules a thing of this kind could stand in with (for the GM's review list). */
export function standInChoices(kind: RefKind): string[] {
  if (kind === 'species') return srdSpecies().map(([n]) => n);
  if (kind === 'class') return Object.keys((SRD_TEXT as unknown as { classes: J }).classes);
  if (kind === 'item') return srdItems().filter((i) => i.magic).map((i) => i.name);
  return (SRD_CREATURES as unknown as { creatures: { name: string }[] }).creatures.map((c) => c.name);
}

/** The closest open match of the same kind: a species of the same size and speed, an item of the same rarity and kind. */
export function closestStandIn(db: DB, r: Resolved): string {
  const data = r.pack
    ? (JSON.parse(
        (db.prepare('SELECT data FROM rules_entries WHERE pack_id = ? AND kind = ? AND lower(name) = ?').get(r.pack.id, r.kind, lc(r.name)) as { data: string } | undefined)?.data ?? '{}',
      ) as J)
    : {};
  if (r.kind === 'species') {
    const size = (data.size as string[] | undefined) ?? ['Medium'];
    const speed = (data.speed as number | undefined) ?? 30;
    const all = srdSpecies();
    return (all.find(([, s]) => s.speed === speed && s.size.join() === size.join()) ?? all.find(([, s]) => s.size.some((x) => size.includes(x))) ?? ['Human'])[0];
  }
  if (r.kind === 'class') return CLASS_STAND_INS[lc(r.name)] ?? 'Fighter';
  if (r.kind === 'item') {
    const rarity = lc(String(data.rarity ?? ''));
    const kind = lc(String(data.type ?? '')).split(/[ (,]/)[0];
    const items = srdItems().filter((i) => i.magic);
    return (items.find((i) => lc(i.rarity) === rarity && lc(i.type).startsWith(kind)) ?? items.find((i) => lc(i.rarity) === rarity) ?? items.find((i) => lc(i.rarity) === 'common') ?? items[0]).name;
  }
  return 'Commoner';
}

/** What Share as a worldbook asks about: the books the world draws on, and the stand-ins safe mode would use. */
export function shareBooks(db: DB) {
  const resolved = resolveRefs(db, ruleRefs(db, null));
  const byBook = new Map<string, RuleRef[]>();
  for (const r of resolved.filter((x) => x.from === 'book')) byBook.set(r.book!, [...(byBook.get(r.book!) ?? []), { kind: r.kind, name: r.name }]);
  const open = new Map<string, { id: string; name: string; source: string }>();
  for (const r of resolved.filter((x) => x.from === 'open')) open.set(r.pack!.id, r.pack!);
  return {
    books: [...byBook].map(([name, things]) => ({ name, things })),
    standIns: resolved.filter((x) => x.from === 'book').map((r) => ({ kind: r.kind, name: r.name, book: r.book!, standIn: closestStandIn(db, r) })),
    /** The open rules each kind of thing could stand in with. */
    choices: Object.fromEntries([...new Set(resolved.filter((x) => x.from === 'book').map((r) => r.kind))].map((k) => [k, standInChoices(k)])) as Partial<Record<RefKind, string[]>>,
    open: [...open.values()],
    missing: resolved.filter((x) => x.from === 'missing').map(({ kind, name }) => ({ kind, name })),
  };
}

/** The rules part of a shared worldbook's manifest, and the open rules that travel with it. */
export function worldbookRulesFor(db: DB, mode: WorldbookRules['mode'], swaps: Record<string, string> = {}): { rules: WorldbookRules; openFiles: { path: string; content: string }[] } {
  if (!['required', 'optional', 'safe'].includes(mode)) throw badRequest('Choose how the books count: required, optional or safe mode');
  const s = shareBooks(db);
  const standIns =
    mode === 'safe'
      ? s.standIns.map((x) => {
          const chosen = swaps[`${x.kind}:${x.name}`];
          return { kind: x.kind, name: x.name, book: x.book, standIn: chosen && s.choices[x.kind]?.includes(chosen) ? chosen : x.standIn };
        })
      : [];
  // The open rules it uses beyond the SRD travel with it: only the entries it names, with the pack's credit.
  const refs = ruleRefs(db, null);
  const openFiles = s.open.map((p) => {
    const want = new Set(refs.map((r) => `${r.kind}:${lc(r.name)}`));
    const entries = (db.prepare('SELECT kind, name, cls, data FROM rules_entries WHERE pack_id = ?').all(p.id) as { kind: string; name: string; cls: string; data: string }[])
      .filter((e) => want.has(`${e.kind}:${lc(e.name)}`))
      .map((e) => ({ ...e, data: JSON.parse(e.data) as J }));
    return { path: `open-rules/${p.id}.json`, content: JSON.stringify({ ...p, entries }, null, 1) };
  });
  return { rules: { mode, books: s.books, standIns, open: s.open }, openFiles };
}

// ---- Adding --------------------------------------------------------------------------------------------------------

export interface BooksReport {
  mode: WorldbookRules['mode'] | null;
  /** Books (or "not in your rules") with the things they'd give that this GM doesn't have. */
  missing: { book: string; things: RuleRef[] }[];
  /** Books of the GM's the worldbook draws on, switched on in this library. */
  switchedOn: string[];
  /** Stand-ins in use, because the original isn't here. */
  standIns: number;
}

/** Before adding: a worldbook whose books are required can't be added without them. */
export function requireBooks(db: DB, rules: WorldbookRules | undefined) {
  if (rules?.mode !== 'required') return;
  const missing = rules.books
    .map((b) => ({ book: b.name, things: resolveRefs(db, b.things).filter((r) => r.from === 'missing') }))
    .filter((b) => b.things.length);
  if (missing.length)
    throw badRequest(
      `This worldbook needs books you haven't imported: ${missing.map((m) => `${m.book} (${m.things.map((t) => t.name).join(', ')})`).join('; ')}. Import them in Settings → Rules packs first.`,
    );
}

/** After adding: switch on the books it draws on, keep its stand-ins, bring in its open rules, and say what's missing. */
export function settleBooks(db: DB, packId: string, packDir: string, rules: WorldbookRules | undefined): BooksReport {
  // Its open rules, unless the GM already has that pack (never replace a fuller copy with the few entries it carries).
  const openDir = path.join(packDir, 'open-rules');
  if (fs.existsSync(openDir))
    for (const f of fs.readdirSync(openDir).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(fs.readFileSync(path.join(openDir, f), 'utf8')) as { id: string; name: string; source: string; entries: { kind: string; name: string; cls: string; data: J }[] };
      if (!isOpenSource(p.source ?? '') || !/^[\w-]{1,60}$/.test(p.id)) continue;
      if (sharedPackExists(db, p.id)) setPackSwitch(db, p.id, { enabled: true });
      else saveRulesPack(db, { id: p.id, name: p.name, source: p.source }, (p.entries ?? []).map((e) => ({ kind: e.kind, name: e.name, cls: e.cls ?? '', data: e.data })));
    }
  const resolved = resolveRefs(db, [...ruleRefs(db, packId, packDir), ...(rules?.books.flatMap((b) => b.things) ?? [])]);
  // The GM's books it draws on: on in this library.
  const switchedOn = new Set<string>();
  for (const r of resolved.filter((x) => x.from === 'book' || x.from === 'open')) {
    const on = (db.prepare('SELECT enabled FROM rules_packs WHERE id = ?').get(r.pack!.id) as { enabled: number } | undefined)?.enabled;
    if (!on) {
      setPackSwitch(db, r.pack!.id, { enabled: true });
      if (r.from === 'book') switchedOn.add(r.pack!.name);
    }
  }
  // Stand-ins, kept for the library (applied where the original is missing: rulesView, bookData).
  const standIns = rules?.standIns ?? [];
  setStandIns(db, packId, standIns);
  const bookOf = new Map<string, string>((rules?.books ?? []).flatMap((b) => b.things.map((t): [string, string] => [`${t.kind}:${lc(t.name)}`, b.name])));
  const groups = new Map<string, RuleRef[]>();
  const seen = new Set<string>();
  for (const r of resolved.filter((x) => x.from === 'missing')) {
    const k = `${r.kind}:${lc(r.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const book = bookOf.get(k) ?? r.book ?? 'Not in your rules';
    groups.set(book, [...(groups.get(book) ?? []), { kind: r.kind, name: r.name }]);
  }
  const missing = [...groups].map(([book, things]) => ({ book, things })).sort((a, b) => Number(a.book === 'Not in your rules') - Number(b.book === 'Not in your rules') || a.book.localeCompare(b.book));
  const missingKeys = new Set([...seen]);
  return { mode: rules?.mode ?? null, missing, switchedOn: [...switchedOn], standIns: standIns.filter((s) => missingKeys.has(`${s.kind}:${lc(s.name)}`)).length };
}

/** Whether every book the worldbook draws on is here (and it draws on at least one). */
export const hasEveryBook = (rules: WorldbookRules | undefined, report: BooksReport) => !!rules?.books.length && report.missing.every((m) => !rules.books.some((b) => b.name === m.book));
