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

const PREFIX_TYPES: Record<string, EntityType> = {
  WLD: 'world',
  CON: 'continent',
  REG: 'region',
  LOC: 'landmark',
  SET: 'settlement',
  VLT: 'vault',
  KEY: 'vault_key',
  NPC: 'npc',
  FAC: 'faction',
  CLT: 'cult',
  FAM: 'family',
  PPL: 'people',
  CAL: 'calling',
  DEI: 'deity',
  COS: 'cosmology',
  HIS: 'event',
  SHD: 'shard',
  ART: 'artifact',
  ITM: 'item',
  CRE: 'creature',
  RUL: 'rule',
  ETH: 'ethereal_domain',
  SYS: 'system',
  HOOK: 'adventure_hook',
  DEC: 'register',
  GDE: 'index',
  IDX: 'index',
  CUS: 'custom',
};

export function idPrefix(id: string): string {
  return id.split('-')[0];
}

export function isTemplatePlaceholder(value: string | null | undefined): boolean {
  return !value || /^\[?UNDEFINED/i.test(value.trim());
}

export function normalizeType(id: string, categoryRaw: string | null): EntityType {
  const cat = (categoryRaw ?? '').toLowerCase();
  if (cat.includes('legacy cross-reference')) return 'redirect';
  if (/^(index|register|guide|npc directory|travel guide|rules guide|adventure tool|campaign arcs)/.test(cat)) {
    if (cat.startsWith('register')) return 'register';
    if (cat.startsWith('index') || cat.startsWith('guide') || cat.startsWith('npc directory')) return 'index';
  }
  if (cat.startsWith('world')) return 'world';
  if (cat.startsWith('realm')) return 'realm';
  if (cat.startsWith('continent')) return id === 'CON-501' ? 'realm' : 'continent';
  if (cat.startsWith('building')) return 'building';
  if (cat.startsWith('magic system')) return 'magic_system';
  if (cat.startsWith('religion')) return 'deity';
  if (cat.startsWith('historical')) return 'event';
  if (cat.startsWith('ethereal group')) return 'faction';
  if (cat.startsWith('people')) return 'people';
  if (cat.startsWith('shared system') || cat.startsWith('shared rules') || cat.startsWith('travel guide')) return 'system';
  if (cat.startsWith('rule')) return 'rule';
  if (cat.startsWith('adventure')) return 'adventure_hook';
  if (cat.startsWith('campaign arcs')) return 'adventure_hook';
  const prefixType = PREFIX_TYPES[idPrefix(id)];
  if (prefixType === 'ethereal_domain' && !cat.startsWith('ethereal domain')) return 'index';
  if (prefixType === 'world' && id !== 'WLD-901') return 'index';
  return prefixType ?? 'custom';
}

/**
 * The Worldkeeper setting's realms, as its archive names them, with how they are first created in a library. (These
 * move into the setting's pack with its import profile; docs/OWN_WORLD_PLAN.md step 3.)
 */
export const SETTING_REALMS: Record<string, { name: string; kind: RealmKind; parent_id: string | null; color: RealmColor; icon: RealmIcon; sort_order: number }> = {
  aetheris: { name: 'Aetheris', kind: 'continent', parent_id: 'world', color: 'amber', icon: 'mountain', sort_order: 1 },
  kaelmar: { name: 'Kaelmar', kind: 'continent', parent_id: 'world', color: 'green', icon: 'flame', sort_order: 2 },
  ethereal: { name: 'The Ethereal Realm', kind: 'realm', parent_id: null, color: 'violet', icon: 'ghost', sort_order: 3 },
  /** The realm The World sits in (owner decision, DEC-910). */
  evershroud: { name: 'Evershroud', kind: 'realm', parent_id: null, color: 'slate', icon: 'moon', sort_order: 0 },
  // The Ethereal Realm's domains (owner decision, DEC-910): the Hollow Verge, and the six deeper ones beneath it.
  'hollow-verge': { name: 'The Hollow Verge', kind: 'domain', parent_id: 'ethereal', color: 'violet', icon: 'ghost', sort_order: 4 },
  'fields-of-lost-realities': { name: 'The Fields of Lost Realities', kind: 'domain', parent_id: 'hollow-verge', color: 'teal', icon: 'sparkles', sort_order: 5 },
  'ossuary-of-kings': { name: 'The Ossuary of Kings', kind: 'domain', parent_id: 'hollow-verge', color: 'slate', icon: 'skull', sort_order: 6 },
  'silent-archive': { name: 'The Silent Archive', kind: 'domain', parent_id: 'hollow-verge', color: 'blue', icon: 'moon', sort_order: 7 },
  'loom-of-eternity': { name: 'The Loom of Eternity', kind: 'domain', parent_id: 'hollow-verge', color: 'amber', icon: 'snowflake', sort_order: 8 },
  'citadel-of-the-hidden': { name: 'The Citadel of the Hidden', kind: 'domain', parent_id: 'hollow-verge', color: 'rose', icon: 'castle', sort_order: 9 },
  'black-horizon': { name: 'The Black Horizon', kind: 'domain', parent_id: 'hollow-verge', color: 'red', icon: 'compass', sort_order: 10 },
};

/**
 * The archive's record for each of the Ethereal Realm's domains. Those records, and archive records whose parent is one
 * (the domains' landmarks), belong to that domain; the setting's own additions name their domain in their realm field.
 */
export const SETTING_DOMAIN_RECORDS: Record<string, string> = {
  'ETH-501': 'hollow-verge',
  'ETH-502': 'fields-of-lost-realities',
  'ETH-503': 'ossuary-of-kings',
  'ETH-504': 'silent-archive',
  'ETH-505': 'loom-of-eternity',
  'ETH-506': 'citadel-of-the-hidden',
  'ETH-507': 'black-horizon',
};

/** Words in a realm field that don't name a realm. */
const NOT_A_REALM = /^(both|all|any|every(where)?|multiple|various|n\/?a|none|unknown|undefined|-|—|cross[- ]realm)\b/i;

export interface KnownRealm {
  id: string;
  name: string;
}

/**
 * A record's realm from its "Continent or realm" field. The setting's own names are understood as they always were;
 * otherwise the field is matched against the library's realms by name or id, and a name the library doesn't have yet
 * comes back as `created`, for the importer to add as a new realm.
 */
export function normalizeRealm(raw: string | null, known: KnownRealm[] = []): { realm: Realm; realms: Realm[]; created?: KnownRealm } {
  const r = (raw ?? '').toLowerCase();
  const actual = /actual established domain:\s*([^;]+)/.exec(r);
  const focus = actual ? actual[1] : r;
  const found: Realm[] = [];
  if (r.includes('aetheris')) found.push('aetheris');
  if (r.includes('kaelmar')) found.push('kaelmar');
  if (r.includes('ethereal')) found.push('ethereal');
  // The library's own realms, by name (with or without "The") or id.
  const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, '').trim();
  for (const k of known) {
    if (k.id === 'world' || found.includes(k.id)) continue;
    const n = bare(k.name);
    if (n && (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(r) || r.trim() === k.id)) found.push(k.id);
  }
  let realm: Realm = 'world';
  const f = focus.trim();
  // A domain of the setting's Ethereal Realm named first ("The Hollow Verge (Ethereal Realm)"): the record is in that
  // domain, and still in the Ethereal Realm.
  const domain = Object.keys(SETTING_REALMS).find((id) => SETTING_REALMS[id].kind === 'domain' && bare(f).startsWith(bare(SETTING_REALMS[id].name)));
  if (domain) return { realm: domain, realms: [domain, 'ethereal'] };
  if (f.startsWith('world') || !f) realm = 'world';
  else if (focus.includes('ethereal') && !focus.includes('aetheris') && !focus.includes('kaelmar')) realm = 'ethereal';
  else if (focus.startsWith('aetheris') && !focus.includes('kaelmar')) realm = 'aetheris';
  else if (focus.startsWith('kaelmar') && !focus.includes('aetheris')) realm = 'kaelmar';
  else if (focus.startsWith('ethereal')) realm = 'ethereal';
  else {
    const own = found.find((id) => !SETTING_REALMS[id]);
    if (own) realm = own;
    else if (!found.length && !NOT_A_REALM.test(f)) {
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

export function blockToDraft(block: ParsedBlock, file: string, realms: KnownRealm[] = []): EntityDraft {
  const m = block.meta;
  const id = block.id.trim();
  const name = metaValue(m, 'Name') ?? id;
  const category = metaValue(m, 'Category');
  const parentRaw = metaValue(m, 'Parent');
  const realmRaw = metaValue(m, 'Continent or realm');
  const canonRaw = metaValue(m, 'Canon status');
  const tags = splitList(metaValue(m, 'Tags')).map((t) => t.toLowerCase());
  const type = normalizeType(id, category);
  const { realm, realms: inRealms, created } = normalizeRealm(realmRaw, realms);
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
