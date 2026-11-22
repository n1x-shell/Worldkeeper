import { BUILTIN_REGISTRY, makeTypeRegistry, type RecordTypeDef, type TypeRegistry } from '../../../shared/recordTypes';

/** Player-facing grouping of entries. Only groups that contain revealed entries are ever shown. */
export interface PlayerGroup {
  key: string;
  label: string;
  /** The types in it, from the record-type registry (each type names its handbook group). */
  types: string[];
}

// The handbook's types: the built-ins until the handbook's own (from its info or snapshot) arrive.
let registry: TypeRegistry = BUILTIN_REGISTRY;
/** Use the handbook's record types (a GM's own or a pack's included). Call before rendering the pages. */
export function setHandbookTypes(list: RecordTypeDef[] | undefined) {
  if (list?.length) registry = makeTypeRegistry(list);
}

const GROUPS: { key: string; label: string }[] = [
  { key: 'places', label: 'Places' },
  { key: 'people', label: 'People' },
  { key: 'factions', label: 'Factions' },
  { key: 'peoples', label: 'Species and Classes' },
  { key: 'gods', label: 'Gods and Myths' },
  { key: 'history', label: 'History' },
  { key: 'magic', label: 'Magic' },
  { key: 'rules', label: 'Rules and Customs' },
  { key: 'treasures', label: 'Shards and Treasures' },
  { key: 'creatures', label: 'Creatures' },
];

/** The handbook's groups, with their types read from the registry at the time of asking. */
export const PLAYER_GROUPS: PlayerGroup[] = GROUPS.map((g) => ({
  ...g,
  get types() {
    return registry.list.filter((t) => t.handbook === g.key).map((t) => t.key);
  },
}));

export const OTHER_GROUP: PlayerGroup = { key: 'other', label: 'Other', types: [] };

export function groupOf(type: string): PlayerGroup {
  const key = registry.get(type)?.handbook;
  return PLAYER_GROUPS.find((g) => g.key === key) ?? OTHER_GROUP;
}

/** The handbook's types with a trait (places, folk...). */
export const handbookTypesWith = (trait: Parameters<TypeRegistry['with']>[0]) => registry.with(trait);

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

/**
 * A short preview for list cards: the first paragraph of the text that is not a table or a heading. Player text
 * starts with a one-line blurb, so that is normally what shows.
 */
export function previewText(md: string): string {
  for (const block of md.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || b.startsWith('|') || b.startsWith('#')) continue;
    return plainText(b);
  }
  return '';
}

export type PlayerWorkspace = 'world' | 'records' | 'maps' | 'campaign' | 'character';

/** Which workspace a handbook path belongs to. */
export function playerWorkspaceFor(path: string): PlayerWorkspace {
  const p = path.replace(/^\/player(?=\/|$)/, '') || '/';
  if (/^\/(browse|e|search|factions-web)(\/|$)/.test(p)) return 'records';
  if (/^\/maps(\/|$)/.test(p)) return 'maps';
  if (/^\/(quests|recaps|standing|treasure|handouts|calendar|regions|omens|journal)(\/|$)/.test(p)) return 'campaign';
  if (/^\/(me|builder|print)(\/|$)/.test(p)) return 'character';
  return 'world';
}
