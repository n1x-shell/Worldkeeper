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

export const REALMS = ['world', 'aetheris', 'kaelmar', 'ethereal'] as const;
export type Realm = (typeof REALMS)[number];

export const REALM_LABELS: Record<Realm, string> = {
  world: 'World',
  aetheris: 'Aetheris',
  kaelmar: 'Kaelmar',
  ethereal: 'Ethereal Realm',
};

/** Normalised template types. `category_raw` always keeps the original source text. */
export const ENTITY_TYPES = [
  'world',
  'continent',
  'realm',
  'region',
  'nation',
  'settlement',
  'landmark',
  'building',
  'dungeon',
  'vault',
  'vault_key',
  'npc',
  'faction',
  'cult',
  'family',
  'culture',
  'people',
  'calling',
  'species',
  'deity',
  'event',
  'cosmology',
  'magic_system',
  'artifact',
  'shard',
  'item',
  'creature',
  'rule',
  'ethereal_domain',
  'system',
  'adventure_hook',
  'adventure_location',
  'index',
  'register',
  'redirect',
  'custom',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  world: 'World',
  continent: 'Continent',
  realm: 'Realm',
  region: 'Region',
  nation: 'Nation',
  settlement: 'Settlement',
  landmark: 'Landmark',
  building: 'Building',
  dungeon: 'Dungeon',
  vault: 'Vault',
  vault_key: 'Vault Key',
  npc: 'NPC',
  faction: 'Faction',
  cult: 'Cult',
  family: 'Family',
  culture: 'Culture',
  people: 'People',
  calling: 'Calling',
  species: 'Species',
  deity: 'Deity',
  event: 'Historical Event',
  cosmology: 'Cosmology',
  magic_system: 'Magic System',
  artifact: 'Artifact',
  shard: 'Crystal Shard',
  item: 'Item',
  creature: 'Creature',
  rule: 'Rule',
  ethereal_domain: 'Ethereal Domain',
  system: 'Shared System',
  adventure_hook: 'Adventure Hook',
  adventure_location: 'Adventure Location',
  index: 'Index / Guide',
  register: 'Continuity Register',
  redirect: 'Redirect (legacy ID)',
  custom: 'Custom Entry',
};

/** Groupings used by the sidebar encyclopedia sections. */
export const TYPE_GROUPS: Record<string, EntityType[]> = {
  places: ['continent', 'realm', 'region', 'nation', 'settlement', 'landmark', 'building', 'dungeon', 'vault', 'ethereal_domain', 'adventure_location'],
  regions: ['region', 'nation', 'settlement'],
  landmarks: ['landmark', 'building', 'dungeon', 'vault', 'adventure_location'],
  npcs: ['npc'],
  factions: ['faction', 'cult', 'family'],
  artifacts: ['shard', 'artifact', 'item', 'vault_key'],
  creatures: ['creature'],
  events: ['event'],
  cultures: ['people', 'culture', 'species', 'calling'],
  magic: ['magic_system', 'cosmology'],
  pantheon: ['deity'],
  rules: ['rule', 'system'],
  hooks: ['adventure_hook'],
};

export const RELATIONSHIP_TYPES = [
  'part_of',
  'lives_in',
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

/** Regex for stable IDs used across the library, e.g. NPC-010, CON-001-DOM, PPL-008-009, HOOK-001-INDEX, IDX-AETH-FAI. */
export const ID_PREFIXES = [
  'WLD', 'CON', 'REG', 'LOC', 'SET', 'VLT', 'KEY', 'NPC', 'FAC', 'CLT', 'FAM', 'PPL', 'CAL', 'DEI',
  'COS', 'HIS', 'SHD', 'ART', 'ITM', 'CRE', 'RUL', 'ETH', 'SYS', 'HOOK', 'DEC', 'GDE', 'IDX', 'CUS',
] as const;
export const ID_PATTERN_SOURCE = `(?:${ID_PREFIXES.join('|')})-[A-Z0-9]{3,6}(?:-[A-Z0-9]+)*`;
export const BRACKET_REF_RE = () => new RegExp(`\\[(${ID_PATTERN_SOURCE})\\]`, 'g');
export const BARE_ID_RE = new RegExp(`^${ID_PATTERN_SOURCE}$`);

/** Headings that mark GM-only material. Such sections are never published wholesale to players. */
export const SECRET_HEADING_RE = /(gm[- ]?only|gm truth|gm's view|secret|hidden truth|true nature|truth behind|what the gm knows|gm notes?)/i;

export interface EntitySummary {
  id: string;
  name: string;
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
