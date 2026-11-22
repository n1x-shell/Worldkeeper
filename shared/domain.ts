import { BUILTIN_TYPES, ID_PATTERN_SOURCE } from './recordTypes.js';

/**
 * Shared domain vocabulary for The Worldkeeper.
 * Used by both the server (validation, import) and the client (labels, filters).
 * Nothing in this file is world lore: it only names the categories the source library uses.
 */

export const CANON_STATUSES = ['CANON', 'PROPOSED', 'CONFLICT', 'UNDEFINED', 'RUMOR', 'BELIEF', 'SECRET'] as const;
export type CanonStatus = (typeof CANON_STATUSES)[number];

/** Additional labels that can accompany a canon status (mostly for mechanics). */
export const CANON_FLAGS = [
  ...CANON_STATUSES,
  'OFFICIAL',
  'HOMEBREW',
  'OUTSIDE 2024 CORE',
  'UNVERIFIED',
] as const;
export type CanonFlag = (typeof CANON_FLAGS)[number];

export const MECHANICS_STATUSES = ['OFFICIAL', 'HOMEBREW', 'OUTSIDE 2024 CORE', 'UNVERIFIED'] as const;
export type MechanicsStatus = (typeof MECHANICS_STATUSES)[number];

/** A realm's key (see shared/realms.ts: realms are the library's own data, not a fixed list). */
export type Realm = string;

/**
 * Record types. The registry (shared/recordTypes.ts) is the one source: these are the built-in types, for code that has
 * no library at hand. A library can hold more (its own, or a pack's), so a type is any string the library's registry
 * knows; features ask the registry by trait, never by listing types here.
 */
export const ENTITY_TYPES = BUILTIN_TYPES.map((t) => t.key);
export type EntityType = string;

/** The built-in types' labels (the library's registry has its own types' too). */
export const ENTITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(BUILTIN_TYPES.map((t) => [t.key, t.label]));

/** The Codex's browse groups, from the built-in types (the client builds them from the library's registry). */
export const TYPE_GROUPS: Record<string, string[]> = BUILTIN_TYPES.reduce(
  (out, t) => {
    for (const g of t.browse) (out[g] ??= []).push(t.key);
    return out;
  },
  {} as Record<string, string[]>,
);

export const RELATIONSHIP_TYPES = [
  'part_of',
  'lives_in',
  'comes_from',
  'leads',
  'member_of',
  'allied_with',
  'opposes',
  'controls',
  'seeks',
  'created',
  'destroyed',
  'related_to',
  'present_at',
  'knows_about',
  'connected_through',
  'references',
  'contains',
  'same_as',
  'draft_of',
  'custom',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  part_of: 'Part of',
  lives_in: 'Lives in',
  comes_from: 'Comes from',
  leads: 'Leads',
  member_of: 'Member of',
  allied_with: 'Allied with',
  opposes: 'Opposes',
  controls: 'Controls',
  seeks: 'Seeks',
  created: 'Created',
  destroyed: 'Destroyed',
  related_to: 'Related to',
  present_at: 'Present at',
  knows_about: 'Knows about',
  connected_through: 'Connected through',
  references: 'References',
  contains: 'Contains',
  same_as: 'Same being as (dual role)',
  draft_of: 'Draft of',
  custom: 'Custom',
};

/** Relationship types that are naturally symmetric; others are directional. */
export const SYMMETRIC_RELATIONSHIPS: RelationshipType[] = ['allied_with', 'opposes', 'related_to', 'connected_through', 'same_as'];

export const VAULT_STATES = ['Sealed', 'Opened', 'Damaged', 'Partially opened', 'Changed', 'Unknown'] as const;

export const CONDITIONS_2024 = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

/** Stable IDs (NPC-010, CON-001-DOM, TWN-0001): any type's prefix, see shared/recordTypes.ts. */
export { ID_PATTERN_SOURCE };
export const BRACKET_REF_RE = () => new RegExp(`\\[(${ID_PATTERN_SOURCE})\\]`, 'g');
export const BARE_ID_RE = new RegExp(`^${ID_PATTERN_SOURCE}$`);

/** Headings that mark GM-only material. Such sections are never published wholesale to players. */
export const SECRET_HEADING_RE = /(gm[- ]?only|gm truth|gm's view|secret|hidden truth|true nature|truth behind|what the gm knows|gm notes?)/i;

export interface EntitySummary {
  id: string;
  name: string;
  aliases?: string[];
  redirect_to?: string | null;
  type: EntityType;
  realm: Realm;
  canon_status: CanonStatus;
  canon_flags: string[];
  category_raw: string | null;
  parent_id: string | null;
  tags: string[];
  archived: boolean;
  favorite: boolean;
  revealed: boolean;
  updated_at: string;
}

export interface Entity extends EntitySummary {
  aliases: string[];
  parent_raw: string | null;
  realm_raw: string | null;
  realms: Realm[];
  canon_raw: string | null;
  source_raw: string | null;
  fields: [string, string][];
  body: string;
  notes: string;
  source_visibility: 'gm' | 'player' | null;
  player_summary: string;
  revealed_sections: string[];
  revealed_facts: string[];
  origin: 'import' | 'user';
  /** The setting pack the record came with (its cleaning rules apply to it); null for the GM's own. */
  pack_id: string | null;
  source_file: string | null;
  source_hash: string | null;
  redirect_to: string | null;
  version: number;
  created_at: string;
  modified_since_import: boolean;
}

export interface Relationship {
  id: number;
  source_id: string;
  target_id: string;
  type: RelationshipType;
  directed: boolean;
  label: string;
  description: string;
  canon_status: CanonStatus;
  origin: 'import-parent' | 'import-field' | 'import-reference' | 'user';
  source_context: string;
}

/** Reading of a relationship from the other end, e.g. "Leads" → "Led by". */
export const RELATIONSHIP_INVERSE_LABELS: Partial<Record<RelationshipType, string>> = {
  part_of: 'Contains',
  lives_in: 'Home of',
  comes_from: 'Birthplace of',
  leads: 'Led by',
  member_of: 'Has member',
  controls: 'Controlled by',
  seeks: 'Sought by',
  created: 'Created by',
  destroyed: 'Destroyed by',
  present_at: 'Attended by',
  knows_about: 'Known to',
  references: 'Mentioned in',
  contains: 'Part of',
  draft_of: 'Has draft',
};

/** Human wording for a relationship as seen from one record. */
export function relationshipLabel(type: string, outgoing: boolean): string {
  const t = type as RelationshipType;
  if (t === 'references') return outgoing ? 'Mentions' : 'Mentioned in';
  if (outgoing || SYMMETRIC_RELATIONSHIPS.includes(t)) return RELATIONSHIP_LABELS[t] ?? type;
  return RELATIONSHIP_INVERSE_LABELS[t] ?? RELATIONSHIP_LABELS[t] ?? type;
}
