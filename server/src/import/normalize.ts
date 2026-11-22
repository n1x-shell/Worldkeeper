import {
  BRACKET_REF_RE,
  CANON_FLAGS,
  CANON_STATUSES,
  ID_PATTERN_SOURCE,
  type CanonStatus,
  type EntityType,
  type Realm,
} from '../../../shared/domain.js';
import { metaValue, type ParsedBlock } from './parseMarkdown.js';
import { realmKey, type RealmColor, type RealmIcon, type RealmKind } from '../../../shared/realms.js';
import { BUILTIN_REGISTRY, type TypeRegistry } from '../../../shared/recordTypes.js';
import type { ImportProfile } from '../../../shared/packs.js';

const STANDARD_KEYS = new Set([
  'id',
  'name',
  'alternate names',
  'category',
  'parent',
  'continent or realm',
  'canon status',
  'source',
  'tags',
]);


export function idPrefix(id: string): string {
  return id.split('-')[0];
}

export function isTemplatePlaceholder(value: string | null | undefined): boolean {
  return !value || /^\[?UNDEFINED/i.test(value.trim());
}

/**
 * A record's type from its "Category:". A setting pack's archive is read by its import profile first (its own Category
 * wording and fixed IDs); then the library's type registry (key, label, plural or alias), so a GM's own types and a
 * Markdown export read back as they were; then, for a pack's archive, its ID prefixes as a last resort.
 */
export function normalizeType(id: string, categoryRaw: string | null, reg: TypeRegistry = BUILTIN_REGISTRY, profile?: ImportProfile): EntityType {
  const cat = (categoryRaw ?? '').toLowerCase();
  if (profile) {
    if (profile.idTypes?.[id]) return profile.idTypes[id];
    for (const r of profile.categoryRules ?? []) if (new RegExp(r.pattern).test(cat)) return r.type;
  }
  const known = reg.fromCategory(categoryRaw);
  if (known) return known;
  const byPrefix = profile?.prefixTypes?.[idPrefix(id)];
  if (!byPrefix) return 'custom';
  if (typeof byPrefix === 'string') return byPrefix;
  if (byPrefix.ids && !byPrefix.ids.includes(id)) return byPrefix.else;
  if (byPrefix.category && !new RegExp(byPrefix.category).test(cat)) return byPrefix.else;
  return byPrefix.type;
}

export interface KnownRealm {
  id: string;
  name: string;
  kind?: RealmKind;
  parent_id?: string | null;
}

/**
 * A record's realm from its "Continent or realm" field. A pack's archive is read by its import profile (the words that
 * name its realms, and which part of the field says where a record really is); otherwise the field is matched against
 * the library's realms by name or id. A domain named first ("The Hollow Verge (Ethereal Realm)") is the record's realm,
 * and the realm that holds the domain is one of its realms too. A name the library doesn't have yet comes back as
 * `created`, for the importer to add as a new realm.
 */
export function normalizeRealm(raw: string | null, known: KnownRealm[] = [], profile?: ImportProfile): { realm: Realm; realms: Realm[]; created?: KnownRealm } {
  const r = (raw ?? '').toLowerCase();
  const actual = profile?.realmFocus ? new RegExp(profile.realmFocus).exec(r) : null;
  const focus = actual ? actual[1] : r;
  const byId = new Map(known.map((k) => [k.id, k]));
  const named = profile?.realmNames ?? {};
  const found: Realm[] = [];
  for (const [word, id] of Object.entries(named)) if (r.includes(word) && !found.includes(id)) found.push(id);
  // The library's own realms, by name (with or without "The") or id.
  const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, '').trim();
  for (const k of known) {
    // A domain counts only when it's named first (below): "beyond the Black Horizon" is not in it.
    if (k.id === 'world' || k.kind === 'domain' || found.includes(k.id)) continue;
    const n = bare(k.name);
    if (n && (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(r) || r.trim() === k.id)) found.push(k.id);
  }
  const f = focus.trim();
  // A domain named first: the record is in that domain, and in the realm that holds it.
  const domain = known.find((k) => k.kind === 'domain' && bare(f).startsWith(bare(k.name)));
  if (domain) {
    let top = domain;
    for (let i = 0; i < 10 && top.parent_id && byId.get(top.parent_id); i++) top = byId.get(top.parent_id)!;
    return { realm: domain.id, realms: top.id === domain.id ? [domain.id] : [domain.id, top.id] };
  }
  let realm: Realm = 'world';
  // The pack's named realms, as its archive writes them: one realm (a plane) named alone; a continent named first
  // with no other continent; or a plane named first.
  const kindOf = (id: string) => byId.get(id)?.kind;
  const inFocus = Object.entries(named).filter(([w]) => focus.includes(w));
  const continents = inFocus.filter(([, id]) => kindOf(id) === 'continent');
  const planes = inFocus.filter(([, id]) => kindOf(id) !== 'continent');
  const first = inFocus.find(([w]) => focus.startsWith(w));
  if (f.startsWith('world') || !f) realm = 'world';
  else if (planes.length && !continents.length) realm = planes[0][1];
  else if (first && kindOf(first[1]) === 'continent' && continents.length === 1) realm = first[1];
  else if (first && kindOf(first[1]) !== 'continent') realm = first[1];
  else {
    const packIds = new Set(Object.values(named));
    const own = found.find((id) => !packIds.has(id));
    if (own) realm = own;
    else if (!found.length && !(profile?.notARealm ? new RegExp(profile.notARealm, 'i') : NOT_A_REALM).test(f)) {
      // A realm this library doesn't have yet: its name is the field's first part.
      const name = (raw ?? '').split(/[;(,/]/)[0].trim();
      if (name) {
        const id = realmKey(name);
        return { realm: id, realms: [id], created: { id, name } };
      }
    }
  }
  if (!found.includes(realm) && realm !== 'world') found.unshift(realm);
  return { realm, realms: found.length ? found : ['world'] };
}

/** Wording in a realm field that names no realm ("Both", "All"). */
const NOT_A_REALM = /^(both|all|any|every(where)?|multiple|various|n\/?a|none|unknown|undefined|-|—|cross[- ]realm)\b/i;

export function normalizeCanon(raw: string | null): { status: CanonStatus; flags: string[] } {
  if (isTemplatePlaceholder(raw)) return { status: 'UNDEFINED', flags: ['UNDEFINED'] };
  const text = raw!.toUpperCase();
  const flags: string[] = [];
  for (const f of CANON_FLAGS) {
    if (text.includes(f) && !flags.includes(f)) flags.push(f);
  }
  // The first recognised canon status in reading order is primary.
  let status: CanonStatus = 'UNDEFINED';
  let best = Infinity;
  for (const s of CANON_STATUSES) {
    const idx = text.indexOf(s);
    if (idx >= 0 && idx < best) {
      best = idx;
      status = s;
    }
  }
  return { status, flags };
}

export function splitList(raw: string | null): string[] {
  if (!raw || /^none( recorded| established)?\.?$/i.test(raw.trim())) return [];
  return raw
    .split(/;|,(?![^()[\]]*[)\]])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^none/i.test(s));
}

export function extractRefs(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(BRACKET_REF_RE())) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export const ID_RE_STRICT = new RegExp(`^${ID_PATTERN_SOURCE}$`);

export interface EntityDraft {
  id: string;
  name: string;
  aliases: string[];
  category_raw: string | null;
  type: EntityType;
  parent_raw: string | null;
  parent_id: string | null;
  realm_raw: string | null;
  realm: Realm;
  realms: Realm[];
  /** A realm the library doesn't have yet, named in this record's realm field (the importer creates it). */
  newRealm?: KnownRealm;
  canon_raw: string | null;
  canon_status: CanonStatus;
  canon_flags: string[];
  source_raw: string | null;
  tags: string[];
  fields: [string, string][];
  body: string;
  source_visibility: 'gm' | 'player' | null;
  redirect_to: string | null;
  source_file: string;
  source_line: number;
}

export function blockToDraft(block: ParsedBlock, file: string, realms: KnownRealm[] = [], reg: TypeRegistry = BUILTIN_REGISTRY, profile?: ImportProfile): EntityDraft {
  const m = block.meta;
  const id = block.id.trim();
  const name = metaValue(m, 'Name') ?? id;
  const category = metaValue(m, 'Category');
  const parentRaw = metaValue(m, 'Parent');
  const realmRaw = metaValue(m, 'Continent or realm');
  const canonRaw = metaValue(m, 'Canon status');
  const tags = splitList(metaValue(m, 'Tags')).map((t) => t.toLowerCase());
  const type = normalizeType(id, category, reg, profile);
  const { realm, realms: inRealms, created } = normalizeRealm(realmRaw, realms, profile);
  const { status, flags } = normalizeCanon(canonRaw);
  const aliasesRaw = metaValue(m, 'Alternate names');
  const aliases = splitList(aliasesRaw);
  const parentRefs = extractRefs(parentRaw);
  const vis = tags.includes('vis/gm') ? 'gm' : tags.includes('vis/player') ? 'player' : null;
  const redirect_to = type === 'redirect' ? (extractRefs(aliasesRaw)[0] ?? extractRefs(block.body)[0] ?? null) : null;
  return {
    id,
    name,
    aliases,
    category_raw: category,
    type,
    parent_raw: parentRaw,
    parent_id: parentRefs[parentRefs.length - 1] ?? null,
    realm_raw: realmRaw,
    realm,
    realms: inRealms,
    newRealm: created,
    canon_raw: canonRaw,
    canon_status: status,
    canon_flags: flags,
    source_raw: metaValue(m, 'Source'),
    tags,
    fields: m.filter(([k]) => !STANDARD_KEYS.has(k.toLowerCase())),
    body: block.body,
    source_visibility: vis,
    redirect_to,
    source_file: file,
    source_line: block.startLine,
  };
}
