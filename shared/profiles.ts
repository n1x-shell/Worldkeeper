/**
 * Structured NPC and faction profiles.
 *
 * Each field shows (1) what the imported source says, extracted read-only from the record's own sections or
 * metadata fields, and (2) a DM value. World-scope DM values describe the character/faction in general;
 * campaign-scope values are stored per campaign and never touch the world record. A field the source does not
 * cover shows UNDEFINED until the DM fills it in. Nothing is generated.
 */

export type ProfileKind = 'npc' | 'faction';
export type ProfileFieldType = 'short' | 'text' | 'ref' | 'refs' | 'list' | 'influence' | 'image' | 'stats';
export type ProfileScope = 'world' | 'campaign';

export interface ProfileField {
  key: string;
  label: string;
  type: ProfileFieldType;
  scope: ProfileScope;
  /** GM-only material (never part of player data). */
  secret?: boolean;
  /** Regex sources matched (case-insensitive) against section headings / metadata field names. */
  source?: { sections?: string; fields?: string };
  /** Relationship types that also supply values (e.g. allied_with for Allies). */
  relationships?: string[];
  hint?: string;
  refTypes?: string[];
}

const PLACE_TYPES = ['continent', 'realm', 'region', 'nation', 'settlement', 'landmark', 'building', 'dungeon', 'vault', 'ethereal_domain', 'adventure_location'];
const GROUP_TYPES = ['faction', 'cult', 'family'];

export const NPC_PROFILE: ProfileField[] = [
  { key: 'pronouns', label: 'Pronouns', type: 'short', scope: 'world', source: { fields: '^pronouns?$' } },
  { key: 'species', label: 'Species / people', type: 'short', scope: 'world', source: { fields: '^(species|people|ancestry|race)$', sections: '^(species|people|ancestry)$' } },
  { key: 'role', label: 'Role', type: 'text', scope: 'world', source: { sections: '^(established description|role|public role|identity|description)' } },
  { key: 'appearance', label: 'Appearance', type: 'text', scope: 'world', source: { sections: 'appearance', fields: 'appearance' } },
  { key: 'voice', label: 'Voice and mannerisms', type: 'text', scope: 'world', source: { sections: 'voice|mannerism' } },
  { key: 'location', label: 'Home / usual location', type: 'ref', scope: 'world', refTypes: PLACE_TYPES, source: { fields: '^(location|home|seat)$', sections: '^(location|where)' }, relationships: ['lives_in'] },
  { key: 'factions', label: 'Factions', type: 'refs', scope: 'world', refTypes: GROUP_TYPES, source: { fields: '^factions?$', sections: 'associated groups|faction|allegiance' }, relationships: ['member_of', 'leads'] },
  { key: 'goals', label: 'Goals', type: 'text', scope: 'world', source: { sections: '^(wants|goals?|aim|long-term goal|immediate need)' } },
  { key: 'pressures', label: 'Pressures and fears', type: 'text', scope: 'world', source: { sections: 'fear|pressure|obstacle' } },
  { key: 'secrets', label: 'Secrets', type: 'text', scope: 'world', secret: true, source: { sections: 'secret', fields: '^secret' } },
  { key: 'npcKnows', label: 'What the NPC knows', type: 'text', scope: 'world', secret: true, source: { sections: 'what they know|knows' } },
  { key: 'disguise', label: 'Disguise or alternate identity', type: 'text', scope: 'world', secret: true, source: { sections: 'disguise|alternate identity|true identity' } },
  { key: 'stats', label: 'Game statistics', type: 'stats', scope: 'world', source: { sections: 'statistic|stat block|combat|mechanic', fields: 'stat' }, hint: 'Your own numbers, or where to find them.' },
  { key: 'portrait', label: 'Portrait', type: 'image', scope: 'world' },
  // Campaign scope
  { key: 'status', label: 'Current status', type: 'short', scope: 'campaign', hint: 'e.g. alive, missing, imprisoned, dead' },
  { key: 'attitude', label: 'Attitude toward the party', type: 'short', scope: 'campaign' },
  { key: 'currentLocation', label: 'Current location', type: 'ref', scope: 'campaign', refTypes: PLACE_TYPES },
  { key: 'lastEncountered', label: 'Last encountered', type: 'short', scope: 'campaign', },
  { key: 'partyKnows', label: 'What the party knows', type: 'text', scope: 'campaign' },
  { key: 'promises', label: 'Promises made', type: 'list', scope: 'campaign' },
  { key: 'debts', label: 'Debts owed', type: 'list', scope: 'campaign' },
  { key: 'recentActions', label: 'Recent actions', type: 'text', scope: 'campaign' },
];

export const FACTION_PROFILE: ProfileField[] = [
  { key: 'ideology', label: 'Ideology', type: 'text', scope: 'world', source: { sections: 'methods|identity|ideology|belief|creed|philosophy|doctrine' } },
  { key: 'leaders', label: 'Leaders', type: 'refs', scope: 'world', refTypes: ['npc'], source: { fields: '^(leaders?|leadership|rulers or keepers|keeper)$', sections: 'leader' }, relationships: ['leads'] },
  { key: 'headquarters', label: 'Headquarters', type: 'ref', scope: 'world', refTypes: PLACE_TYPES, source: { fields: '^(seat|headquarters|base)$', sections: 'seat|headquarters|stronghold' } },
  { key: 'resources', label: 'Resources', type: 'text', scope: 'world', source: { sections: 'resource|assets|strength|influence and' } },
  { key: 'allies', label: 'Allies', type: 'refs', scope: 'world', refTypes: [...GROUP_TYPES, 'npc'], source: { sections: 'all(y|ies)' }, relationships: ['allied_with'] },
  { key: 'rivals', label: 'Rivals', type: 'refs', scope: 'world', refTypes: [...GROUP_TYPES, 'npc'], source: { sections: 'tension|rival|enem|oppos' }, relationships: ['opposes'] },
  { key: 'goals', label: 'Goals', type: 'text', scope: 'world', source: { sections: '^(aim|goals?|purpose|agenda)' } },
  { key: 'secrets', label: 'Secrets', type: 'text', scope: 'world', secret: true, source: { sections: 'secret|gm' } },
  // Campaign scope
  { key: 'currentPlans', label: 'Current plans', type: 'text', scope: 'campaign', hint: 'Progress tracks are on Faction Agendas.' },
  { key: 'influence', label: 'Influence by region', type: 'influence', scope: 'campaign' },
  { key: 'attitude', label: 'Attitude toward the party', type: 'short', scope: 'campaign' },
  { key: 'recentEvents', label: 'Significant recent events', type: 'text', scope: 'campaign' },
];

export const INFLUENCE_LEVELS = ['None', 'Minor', 'Present', 'Strong', 'Dominant', 'Contested'] as const;

export function profileKindFor(type: string): ProfileKind | null {
  if (type === 'npc') return 'npc';
  if (type === 'faction' || type === 'cult' || type === 'family') return 'faction';
  return null;
}

export function profileFields(kind: ProfileKind): ProfileField[] {
  return kind === 'npc' ? NPC_PROFILE : FACTION_PROFILE;
}

export type ProfileValue = string | string[] | { region: string; level: string; note: string }[];
export type ProfileData = Record<string, ProfileValue>;
