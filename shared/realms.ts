/**
 * Realms as data (docs/OWN_WORLD_PLAN.md §2.1): the worlds, continents and planes of a library. Each library holds its
 * own; the Worldkeeper setting's four (the World, Aetheris, Kaelmar and the Ethereal Realm) are rows like any other.
 */

export const REALM_KINDS = ['world', 'continent', 'plane', 'region_group'] as const;
export type RealmKind = (typeof REALM_KINDS)[number];
export const REALM_KIND_LABELS: Record<RealmKind, string> = {
  world: 'World',
  continent: 'Continent',
  plane: 'Plane',
  region_group: 'Region group',
};

/** The realm colours, each defined for both themes in the stylesheet (`--rc-<key>`) and checked for AA contrast. */
export const REALM_COLORS = ['blue', 'amber', 'green', 'violet', 'red', 'teal', 'rose', 'slate'] as const;
export type RealmColor = (typeof REALM_COLORS)[number];

/** The realm icons (each maps to an icon in the app). */
export const REALM_ICONS = ['globe', 'mountain', 'flame', 'ghost', 'trees', 'waves', 'castle', 'sun', 'moon', 'snowflake', 'sparkles', 'compass', 'skull', 'crown'] as const;
export type RealmIcon = (typeof REALM_ICONS)[number];

export interface RealmInfo {
  /** Stable key, as stored on records (e.g. "aetheris"). */
  id: string;
  name: string;
  kind: RealmKind;
  parent_id: string | null;
  color: RealmColor;
  icon: RealmIcon;
  description: string;
  sort_order: number;
  archived: boolean;
  /** How many records belong to it (GM API only). */
  records?: number;
}

/** The realm every library starts with, and every record defaults to. */
export const DEFAULT_REALM = 'world';

/** A realm's key from its name: "The Sunken Isles" → "sunken-isles". */
export function realmKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/^the\s+/, '')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'realm'
  );
}

export const REALM_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Realms in reading order: by sort order, then name; each world followed by what's in it. */
export function sortRealms<T extends Pick<RealmInfo, 'id' | 'name' | 'parent_id' | 'sort_order'>>(list: T[]): T[] {
  const byOrder = (a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const ids = new Set(list.map((r) => r.id));
  const roots = list.filter((r) => !r.parent_id || !ids.has(r.parent_id)).sort(byOrder);
  const out: T[] = [];
  const walk = (r: T) => {
    out.push(r);
    for (const c of list.filter((x) => x.parent_id === r.id).sort(byOrder)) walk(c);
  };
  roots.forEach(walk);
  // Anything in a cycle (shouldn't happen) still shows.
  for (const r of list) if (!out.includes(r)) out.push(r);
  return out;
}
