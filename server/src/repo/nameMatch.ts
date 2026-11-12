/**
 * Find records by the plain names the source text uses in lists ("Leaders: Highlord Theos Valcairn, Grand
 * Theurgist Selara Dawnveil", "Known figures: Hadrek the Emberborn, Sister Kallisa"). A name matches only when it
 * points at exactly one record, so nothing is linked on a guess.
 */
import type { DB } from '../db/connection.js';

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

/** Kinds whose names are often ordinary words ("Guardian", "Warrior"); they are only found in lists, not prose. */
const GENERIC_TYPES = new Set(['creature', 'calling', 'people', 'item', 'rule', 'system', 'species', 'culture']);

export function loadNameIndex(db: DB): NameIndex {
  const rows = db
    .prepare(`SELECT id, name, type, aliases FROM entities WHERE archived = 0 AND type NOT IN ('index','register','redirect')`)
    .all() as { id: string; name: string; type: string; aliases: string }[];
  const byName = new Map<string, Set<string>>();
  const types = new Map<string, string>();
  for (const r of rows) {
    types.set(r.id, r.type);
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(r.aliases || '[]');
    } catch {
      aliases = [];
    }
    for (const n of [r.name, ...aliases]) {
      for (const v of variants(n)) {
        if (!byName.has(v)) byName.set(v, new Set());
        byName.get(v)!.add(r.id);
      }
    }
  }
  // Proper names for prose scanning: written as in the record, without a leading "The" and without nicknames.
  const proper = new Map<string, Set<string>>();
  for (const r of rows) {
    if (GENERIC_TYPES.has(r.type)) continue;
    const base = r.name.split(/[“"]/)[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/^The\s+/, '').trim();
    if (base.length < 5) continue;
    if (!proper.has(base)) proper.set(base, new Set());
    proper.get(base)!.add(r.id);
  }
  const names = [...proper.entries()].filter(([, ids]) => ids.size === 1).map(([n]) => n).sort((a, b) => b.length - a.length);
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = names.length ? new RegExp(`(?<![\\w'’-])(${names.map(esc).join('|')})(?![\\w-]|['’](?!s\\b))`, 'g') : null;
  return {
    scan(text: string) {
      if (!re) return [];
      const out = new Set<string>();
      for (const m of text.matchAll(re)) out.add([...proper.get(m[1])!][0]);
      return [...out];
    },
    find(text: string) {
      for (const v of variants(text)) {
        const hit = byName.get(v);
        if (hit && hit.size === 1) return [...hit][0];
      }
      return null;
    },
    typeOf: (id) => types.get(id),
  };
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
