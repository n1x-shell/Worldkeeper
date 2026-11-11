/** Player-facing grouping of entries. Only groups that contain revealed entries are ever shown. */
export interface PlayerGroup {
  key: string;
  label: string;
  types: string[];
}

export const PLAYER_GROUPS: PlayerGroup[] = [
  { key: 'places', label: 'Places', types: ['world', 'continent', 'realm', 'region', 'nation', 'settlement', 'landmark', 'building', 'dungeon', 'vault', 'ethereal_domain', 'adventure_location'] },
  { key: 'people', label: 'People', types: ['npc'] },
  { key: 'factions', label: 'Factions', types: ['faction', 'cult', 'family'] },
  { key: 'peoples', label: 'Peoples and Callings', types: ['people', 'culture', 'species', 'calling'] },
  { key: 'gods', label: 'Gods and Myths', types: ['deity', 'cosmology'] },
  { key: 'history', label: 'History', types: ['event'] },
  { key: 'magic', label: 'Magic', types: ['magic_system'] },
  { key: 'rules', label: 'Rules and Customs', types: ['rule', 'system'] },
  { key: 'treasures', label: 'Shards and Treasures', types: ['shard', 'artifact', 'item', 'vault_key'] },
  { key: 'creatures', label: 'Creatures', types: ['creature'] },
];

export const OTHER_GROUP: PlayerGroup = { key: 'other', label: 'Other', types: [] };

export function groupOf(type: string): PlayerGroup {
  return PLAYER_GROUPS.find((g) => g.types.includes(type)) ?? OTHER_GROUP;
}

export const PLAYER_REALMS: { key: string; label: string }[] = [
  { key: 'aetheris', label: 'Aetheris' },
  { key: 'kaelmar', label: 'Kaelmar' },
  { key: 'ethereal', label: 'Ethereal Realm' },
  { key: 'world', label: 'The Wider World' },
];

/** Entries linked from text (the projection writes links to revealed entries as /player/e/ID). */
export function linkedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\]\(\/player\/e\/([^)]+)\)/g)) {
    const id = decodeURIComponent(m[1]);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Plain text of a player summary (link markup removed), for list previews. */
export const plainText = (md: string) =>
  md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
