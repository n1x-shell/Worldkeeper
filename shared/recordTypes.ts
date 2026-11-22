/**
 * The record-type registry (docs/OWN_WORLD_PLAN.md §2.10): what kinds of record a library holds, and what each kind
 * can do. Code asks the registry by trait ("which types are places?") instead of naming types, and never works out a
 * record's type from its ID. The built-in types are here; a library can add its own (Library → Templates) and, from
 * step 3, packs add theirs. The Worldkeeper setting's own types are marked with its pack and shown only where used.
 */

/** What a type can do. Features read these, never a list of type names. */
export interface TypeTraits {
  /** Somewhere: can be on a map, hold people, be a party's location or a hometown. */
  place?: boolean;
  /** Large enough for a region panel: terrain, region state, encounter tables. */
  regionLike?: boolean;
  /** A thing someone can carry, hold or own. */
  holdable?: boolean;
  /** A body of people: a faction, cult or family (standing, faction web, agendas). */
  group?: boolean;
  /** A people, species or culture: species rules, common names, the character builder. */
  folk?: boolean;
  /** A single person (NPCs: profiles, fight cards, who's nearby). */
  person?: boolean;
  /** Names too ordinary to link automatically in text (a creature called "Echo", a rule called "Rest"). */
  commonNoun?: boolean;
  /** Introduces a world, continent, realm or domain (that realm's own record). */
  intro?: boolean;
  /** Bookkeeping, not lore: indexes, registers and redirects (left out of New, browse lists and the handbook). */
  meta?: boolean;
}

/** How a type shows on a map: an area (regions, continents) or a site (towns, landmarks), or not at all. */
export type PinKind = 'area' | 'site' | null;

/** The broad sort of thing, for groupings such as the graph's. */
export const TYPE_CATEGORIES = ['place', 'person', 'group', 'folk', 'myth', 'thing', 'creature', 'rule', 'adventure', 'meta'] as const;
export type TypeCategory = (typeof TYPE_CATEGORIES)[number];

export interface RecordTypeDef {
  key: string;
  label: string;
  plural: string;
  /** The ID prefix new records get (e.g. SET → SET-0042). */
  prefix: string;
  /** An icon key (the client maps it to an icon). */
  icon: string;
  pin: PinKind;
  category: TypeCategory;
  /** The Codex's browse groups it appears in (e.g. "places", "regions"). */
  browse: string[];
  /** The handbook's group for it. */
  handbook: string;
  traits: TypeTraits;
  /** The pack it belongs to (null: core). A pack's types show in New and pickers only where the library uses them. */
  pack: string | null;
  /** Archive "Category:" values that mean this type, besides its label and plural. */
  aliases?: string[];
}

/** The built-in types: the core set for any world, and the Worldkeeper setting's own. */
export const BUILTIN_TYPES: RecordTypeDef[] = [
  // Places
  {
    key: 'world',
    label: 'World',
    plural: 'Worlds',
    prefix: 'WLD',
    icon: 'globe',
    pin: 'area',
    category: 'place',
    browse: [],
    handbook: 'places',
    traits: { place: true, regionLike: true, intro: true },
    pack: null,
  },
  {
    key: 'continent',
    label: 'Continent',
    plural: 'Continents',
    prefix: 'CON',
    icon: 'mountain',
    pin: 'area',
    category: 'place',
    browse: ['places'],
    handbook: 'places',
    traits: { place: true, regionLike: true, intro: true },
    pack: null,
  },
  {
    key: 'realm',
    label: 'Realm',
    plural: 'Realms',
    prefix: 'RLM',
    icon: 'sparkles',
    pin: 'area',
    category: 'place',
    browse: ['places'],
    handbook: 'places',
    traits: { place: true, regionLike: true, intro: true },
    pack: null,
    aliases: ['Plane'],
  },
  {
    key: 'region',
    label: 'Region',
    plural: 'Regions',
    prefix: 'REG',
    icon: 'map',
    pin: 'area',
    category: 'place',
    browse: ['places', 'regions'],
    handbook: 'places',
    traits: { place: true, regionLike: true },
    pack: null,
  },
  {
    key: 'nation',
    label: 'Nation',
    plural: 'Nations',
    prefix: 'NAT',
    icon: 'flag',
    pin: 'area',
    category: 'place',
    browse: ['places', 'regions'],
    handbook: 'places',
    traits: { place: true, regionLike: true },
    pack: null,
    aliases: ['Kingdom', 'Dominion'],
  },
  {
    key: 'settlement',
    label: 'Settlement',
    plural: 'Settlements',
    prefix: 'SET',
    icon: 'castle',
    pin: 'site',
    category: 'place',
    browse: ['places', 'regions'],
    handbook: 'places',
    traits: { place: true },
    pack: null,
    aliases: ['Town', 'City', 'Village'],
  },
  {
    key: 'landmark',
    label: 'Landmark',
    plural: 'Landmarks',
    prefix: 'LOC',
    icon: 'landmark',
    pin: 'site',
    category: 'place',
    browse: ['places', 'landmarks'],
    handbook: 'places',
    traits: { place: true },
    pack: null,
    aliases: ['Location', 'Site'],
  },
  {
    key: 'building',
    label: 'Building',
    plural: 'Buildings',
    prefix: 'BLD',
    icon: 'home',
    pin: 'site',
    category: 'place',
    browse: ['places', 'landmarks'],
    handbook: 'places',
    traits: { place: true },
    pack: null,
  },
  {
    key: 'dungeon',
    label: 'Dungeon',
    plural: 'Dungeons',
    prefix: 'DUN',
    icon: 'door',
    pin: 'site',
    category: 'place',
    browse: ['places', 'landmarks'],
    handbook: 'places',
    traits: { place: true },
    pack: null,
  },
  {
    key: 'adventure_location',
    label: 'Adventure Location',
    plural: 'Adventure Locations',
    prefix: 'ADV',
    icon: 'compass',
    pin: 'site',
    category: 'place',
    browse: ['places', 'landmarks'],
    handbook: 'places',
    traits: { place: true },
    pack: null,
  },
  // People
  {
    key: 'npc',
    label: 'NPC',
    plural: 'NPCs',
    prefix: 'NPC',
    icon: 'user',
    pin: null,
    category: 'person',
    browse: ['npcs'],
    handbook: 'people',
    traits: { person: true },
    pack: null,
    aliases: ['Person', 'Character'],
  },
  {
    key: 'faction',
    label: 'Faction',
    plural: 'Factions',
    prefix: 'FAC',
    icon: 'flag',
    pin: null,
    category: 'group',
    browse: ['factions'],
    handbook: 'factions',
    traits: { group: true },
    pack: null,
    aliases: ['Organization', 'Organisation', 'Guild'],
  },
  { key: 'cult', label: 'Cult', plural: 'Cults', prefix: 'CLT', icon: 'eye', pin: null, category: 'group', browse: ['factions'], handbook: 'factions', traits: { group: true }, pack: null },
  {
    key: 'family',
    label: 'Family',
    plural: 'Families',
    prefix: 'FAM',
    icon: 'users',
    pin: null,
    category: 'group',
    browse: ['factions'],
    handbook: 'factions',
    traits: { group: true },
    pack: null,
    aliases: ['House', 'Clan'],
  },
  {
    key: 'people',
    label: 'People',
    plural: 'Peoples',
    prefix: 'PPL',
    icon: 'users',
    pin: null,
    category: 'folk',
    browse: ['cultures'],
    handbook: 'peoples',
    traits: { folk: true, commonNoun: true },
    pack: null,
  },
  {
    key: 'culture',
    label: 'Culture',
    plural: 'Cultures',
    prefix: 'CUL',
    icon: 'users',
    pin: null,
    category: 'folk',
    browse: ['cultures'],
    handbook: 'peoples',
    traits: { folk: true, commonNoun: true },
    pack: null,
  },
  {
    key: 'species',
    label: 'Species',
    plural: 'Species',
    prefix: 'SPC',
    icon: 'users',
    pin: null,
    category: 'folk',
    browse: ['cultures'],
    handbook: 'peoples',
    traits: { folk: true, commonNoun: true },
    pack: null,
    aliases: ['Race', 'Ancestry'],
  },
  // Myth and history
  {
    key: 'deity',
    label: 'Deity',
    plural: 'Deities',
    prefix: 'DEI',
    icon: 'crown',
    pin: null,
    category: 'myth',
    browse: ['pantheon'],
    handbook: 'gods',
    traits: {},
    pack: null,
    aliases: ['God', 'Religion'],
  },
  {
    key: 'event',
    label: 'Historical Event',
    plural: 'Historical Events',
    prefix: 'HIS',
    icon: 'scroll',
    pin: null,
    category: 'myth',
    browse: ['events'],
    handbook: 'history',
    traits: {},
    pack: null,
    aliases: ['Event', 'History'],
  },
  { key: 'cosmology', label: 'Cosmology', plural: 'Cosmology', prefix: 'COS', icon: 'atom', pin: null, category: 'myth', browse: ['magic'], handbook: 'gods', traits: {}, pack: null },
  {
    key: 'magic_system',
    label: 'Magic System',
    plural: 'Magic Systems',
    prefix: 'MAG',
    icon: 'sparkles',
    pin: null,
    category: 'myth',
    browse: ['magic'],
    handbook: 'magic',
    traits: {},
    pack: null,
    aliases: ['Magic'],
  },
  // Things
  {
    key: 'artifact',
    label: 'Artifact',
    plural: 'Artifacts',
    prefix: 'ART',
    icon: 'gem',
    pin: null,
    category: 'thing',
    browse: ['artifacts'],
    handbook: 'treasures',
    traits: { holdable: true },
    pack: null,
  },
  {
    key: 'item',
    label: 'Item',
    plural: 'Items',
    prefix: 'ITM',
    icon: 'gem',
    pin: null,
    category: 'thing',
    browse: ['artifacts'],
    handbook: 'treasures',
    traits: { holdable: true, commonNoun: true },
    pack: null,
    aliases: ['Magic Item'],
  },
  {
    key: 'creature',
    label: 'Creature',
    plural: 'Creatures',
    prefix: 'CRE',
    icon: 'skull',
    pin: null,
    category: 'creature',
    browse: ['creatures'],
    handbook: 'creatures',
    traits: { commonNoun: true },
    pack: null,
    aliases: ['Monster', 'Beast'],
  },
  // Rules and adventures
  {
    key: 'rule',
    label: 'Rule',
    plural: 'Rules',
    prefix: 'RUL',
    icon: 'scale',
    pin: null,
    category: 'rule',
    browse: ['rules'],
    handbook: 'rules',
    traits: { commonNoun: true },
    pack: null,
    aliases: ['Custom', 'House Rule'],
  },
  {
    key: 'system',
    label: 'Shared System',
    plural: 'Shared Systems',
    prefix: 'SYS',
    icon: 'scale',
    pin: null,
    category: 'rule',
    browse: ['rules'],
    handbook: 'rules',
    traits: { commonNoun: true },
    pack: null,
  },
  {
    key: 'adventure_hook',
    label: 'Adventure Hook',
    plural: 'Adventure Hooks',
    prefix: 'HOOK',
    icon: 'swords',
    pin: null,
    category: 'adventure',
    browse: ['hooks'],
    handbook: 'other',
    traits: {},
    pack: null,
    aliases: ['Adventure', 'Hook'],
  },
  // Bookkeeping
  {
    key: 'index',
    label: 'Index / Guide',
    plural: 'Indexes and Guides',
    prefix: 'IDX',
    icon: 'book',
    pin: null,
    category: 'meta',
    browse: [],
    handbook: 'other',
    traits: { meta: true, commonNoun: true },
    pack: null,
    aliases: ['Index', 'Guide'],
  },
  {
    key: 'register',
    label: 'Continuity Register',
    plural: 'Continuity Registers',
    prefix: 'DEC',
    icon: 'book',
    pin: null,
    category: 'meta',
    browse: [],
    handbook: 'other',
    traits: { meta: true, commonNoun: true },
    pack: null,
    aliases: ['Register'],
  },
  {
    key: 'redirect',
    label: 'Redirect (legacy ID)',
    plural: 'Redirects',
    prefix: 'RDR',
    icon: 'link',
    pin: null,
    category: 'meta',
    browse: [],
    handbook: 'other',
    traits: { meta: true, commonNoun: true },
    pack: null,
  },
  { key: 'custom', label: 'Custom Entry', plural: 'Custom Entries', prefix: 'CUS', icon: 'file', pin: null, category: 'meta', browse: [], handbook: 'other', traits: {}, pack: null },
  // A pack adds its own types (the Worldkeeper setting's vault, shard, calling... are in packs/worldkeeper/pack.json).
];

/** A record type's key: lower-case letters, digits and underscores. */
export const TYPE_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
/** An ID prefix: two to five capital letters. */
export const TYPE_PREFIX_RE = /^[A-Z]{2,5}$/;

/**
 * Record IDs: a prefix of two to five capital letters, a dash, then a number or code (NPC-010, CON-001-DOM, IDX-AETH-FAI,
 * TWN-0001). Any type's prefix fits, so a pack's or the GM's own types link without changes here.
 */
export const ID_PATTERN_SOURCE = `[A-Z]{2,5}-[A-Z0-9]{3,6}(?:-[A-Z0-9]+)*`;

/** A registry: the types a library holds, with lookups by key and trait. */
export interface TypeRegistry {
  list: RecordTypeDef[];
  get: (key: string) => RecordTypeDef | undefined;
  label: (key: string) => string;
  /** Type keys with every one of these traits. */
  with: (...traits: (keyof TypeTraits)[]) => string[];
  /** Type keys in a browse group. */
  browse: (group: string) => string[];
  /** Type keys of a category. */
  of: (category: TypeCategory) => string[];
  /** A type from an archive "Category:" value: its key, label, plural or one of its aliases. */
  fromCategory: (raw: string | null | undefined) => string | undefined;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function makeTypeRegistry(list: RecordTypeDef[] = BUILTIN_TYPES): TypeRegistry {
  const byKey = new Map(list.map((t) => [t.key, t]));
  const names = new Map<string, string>();
  for (const t of list) for (const n of [t.key.replace(/_/g, ' '), t.label, t.plural, ...(t.aliases ?? [])]) if (!names.has(norm(n))) names.set(norm(n), t.key);
  return {
    list,
    get: (key) => byKey.get(key),
    label: (key) => byKey.get(key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    with: (...traits) => list.filter((t) => traits.every((tr) => t.traits[tr])).map((t) => t.key),
    browse: (group) => list.filter((t) => t.browse.includes(group)).map((t) => t.key),
    of: (category) => list.filter((t) => t.category === category).map((t) => t.key),
    fromCategory: (raw) => {
      if (!raw) return undefined;
      const n = norm(raw);
      if (names.has(n)) return names.get(n);
      // "Settlement (town)", "Landmark — ruin": the first words.
      const first = norm(raw.split(/[(,;:—–-]/)[0]);
      return names.get(first);
    },
  };
}

/** The built-in registry, for code that has no library at hand (shared helpers, tests). */
export const BUILTIN_REGISTRY = makeTypeRegistry();
