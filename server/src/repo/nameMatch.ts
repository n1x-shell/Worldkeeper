/**
 * Find records by the plain names the source text uses in lists ("Leaders: Highlord Theos Valcairn, Grand
 * Theurgist Selara Dawnveil", "Known figures: Hadrek the Emberborn, Sister Kallisa"). A name matches only when it
 * points at exactly one record, so nothing is linked on a guess.
 */
import type { TypeRegistry } from '../../../shared/recordTypes.js';

/** Titles that the source sometimes writes before a name and sometimes leaves off. */
const TITLES =
  /^(?:the\s+)?(?:high\s+shaman|high\s+prophet|grand\s+theurgist|knight-commander|archivist-elder|scribe-mother|sorcerer-king|chief\s+wright|master\s+speaker|highlord|inquisitor|lady|lord|brother|sister|father|mother|elder|master|mistress|archivist|magister|magistrate|general|warlord|champion|exile|archon|archmagister|pyromancer|grandmaster|justicar|marshal|ritekeeper|captain|professor|warden|spymaster|old)\s+/i;

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^the\s+/, '')
    .replace(/[.,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every way a record's name may be written: in full, without its nickname, without its title. */
function variants(name: string): string[] {
  const out = new Set<string>();
  const full = normName(name);
  out.add(full);
  const beforeQuote = normName(name.split(/[“"]/)[0]);
  if (beforeQuote) out.add(beforeQuote);
  for (const v of [...out]) {
    const untitled = v.replace(TITLES, '');
    if (untitled && untitled !== v) out.add(untitled);
  }
  return [...out].filter((v) => v.length >= 3);
}

export interface NameIndex {
  find(text: string): string | null;
  typeOf(id: string): string | undefined;
  /** Records named in running text, written as proper names (case-sensitive, whole words). */
  scan(text: string): string[];
}

/** What of a record matters for finding it by name. */
export interface NameRow {
  id: string;
  name: string;
  type: string;
  aliases: string;
  archived: number;
}

/** A name in running text starts at a word's start and ends at its end ("Kaelholm's" counts, "Kaelholmers" doesn't). */
const BEFORE = /[\w'’-]/;
const AFTER = /(?![\w-]|['’](?!s\b))/y;
/** Names are looked up by how they start (every proper name has at least five letters). */
const START = 4;

/**
 * Every record's names, kept between saves (v0.9.20). It used to be built from every record, with one search pattern
 * of every name in the library, each time a record was saved: fine at a few hundred records, most of a save at a few
 * thousand. Now a record is put in or taken out by itself (`set`, `delete`), and names in running text are found by
 * looking up how each word starts, so neither a save nor a scan gets slower as the library grows.
 */
export class NameStore implements NameIndex {
  private byName = new Map<string, Set<string>>();
  private types = new Map<string, string>();
  /** Proper names for prose: written as in the record, without a leading "The" and without nicknames. */
  private proper = new Map<string, Set<string>>();
  private byStart = new Map<string, string[]>();
  private entries = new Map<string, { variants: string[]; base: string | null }>();
  /** Kinds whose names are often ordinary words ("Guardian", "Warrior"); they are only found in lists, not prose. */
  private generic: Set<string>;

  constructor(private reg: TypeRegistry, rows: Iterable<NameRow> = []) {
    this.generic = new Set(reg.with('commonNoun'));
    for (const r of rows) this.set(r);
  }

  /** Put a record in as it is now (an archived record, or one of a kind that only organises others, stays out). */
  set(r: NameRow) {
    this.delete(r.id);
    if (r.archived || this.reg.get(r.type)?.traits.meta) return;
    this.types.set(r.id, r.type);
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(r.aliases || '[]');
    } catch {
      aliases = [];
    }
    const all = new Set<string>();
    for (const n of [r.name, ...aliases]) for (const v of variants(n)) all.add(v);
    for (const v of all) {
      if (!this.byName.has(v)) this.byName.set(v, new Set());
      this.byName.get(v)!.add(r.id);
    }
    let base: string | null = null;
    if (!this.generic.has(r.type)) {
      const b = r.name.split(/[“"]/)[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/^The\s+/, '').trim();
      if (b.length >= 5) {
        base = b;
        if (!this.proper.has(b)) {
          this.proper.set(b, new Set());
          const key = b.slice(0, START);
          // Longest first: "Harrowgate Bridge" is tried before "Harrowgate".
          this.byStart.set(key, [...(this.byStart.get(key) ?? []), b].sort((x, y) => y.length - x.length));
        }
        this.proper.get(b)!.add(r.id);
      }
    }
    this.entries.set(r.id, { variants: [...all], base });
  }

  delete(id: string) {
    const e = this.entries.get(id);
    this.types.delete(id);
    if (!e) return;
    this.entries.delete(id);
    for (const v of e.variants) {
      const ids = this.byName.get(v);
      ids?.delete(id);
      if (ids && !ids.size) this.byName.delete(v);
    }
    if (e.base) {
      const ids = this.proper.get(e.base);
      ids?.delete(id);
      if (ids && !ids.size) {
        this.proper.delete(e.base);
        const key = e.base.slice(0, START);
        const left = (this.byStart.get(key) ?? []).filter((b) => b !== e.base);
        if (left.length) this.byStart.set(key, left);
        else this.byStart.delete(key);
      }
    }
  }

  /** Names in running text. A name counts only when exactly one record has it, so nothing is linked on a guess. */
  scan(text: string): string[] {
    const out = new Set<string>();
    for (let i = 0; i + START <= text.length; i++) {
      if (i > 0 && BEFORE.test(text[i - 1])) continue;
      const candidates = this.byStart.get(text.substr(i, START));
      if (!candidates) continue;
      for (const name of candidates) {
        const ids = this.proper.get(name)!;
        if (ids.size !== 1 || !text.startsWith(name, i)) continue;
        AFTER.lastIndex = i + name.length;
        if (!AFTER.test(text)) continue;
        out.add(ids.values().next().value!);
        // On from the end of the name (the next letter is not a word's start, so the loop moves past it).
        i += name.length - 1;
        break;
      }
    }
    return [...out];
  }

  find(text: string): string | null {
    for (const v of variants(text)) {
      const hit = this.byName.get(v);
      if (hit && hit.size === 1) return [...hit][0];
    }
    return null;
  }

  typeOf(id: string) {
    return this.types.get(id);
  }
}

/** Split a list written in prose ("A, B and C", bullets, semicolons) into its items. */
export function listItems(text: string): string[] {
  return text
    .replace(/\[[A-Z]{2,4}-\d{3}[^\]]*\]/g, '')
    .split(/\n|;|,|\band\b/)
    .map((s) =>
      s
        .replace(/^\s*[-*]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^(?:led by|leader:?)\s+/i, '')
        .trim(),
    )
    .filter((s) => s && s.length <= 60 && !/^(?:none|undefined|none on the cards)\b/i.test(s));
}
