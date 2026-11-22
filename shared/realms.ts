/**
 * Realms as data (docs/OWN_WORLD_PLAN.md §2.1): the worlds, continents and planes of a library. Each library holds its
 * own; the Worldkeeper setting's four (the World, Aetheris, Kaelmar and the Ethereal Realm) are rows like any other.
 */

/**
 * The kinds, outermost first: a realm (a plane of existence, such as Evershroud or the Ethereal Realm) holds worlds or
 * domains; a world holds continents; a continent holds region groups. A domain (a region of a realm with no world, such
 * as the Ethereal Realm's Hollow Verge) can hold further domains.
 */
export const REALM_KINDS = ['realm', 'world', 'continent', 'domain', 'region_group'] as const;
export type RealmKind = (typeof REALM_KINDS)[number];
export const REALM_KIND_LABELS: Record<RealmKind, string> = {
  realm: 'Realm',
  world: 'World',
  continent: 'Continent',
  domain: 'Domain',
  region_group: 'Region group',
};

/** What each kind may sit inside (null: the top level). A realm is always top level; a world may stand on its own. */
export const REALM_PARENT_KINDS: Record<RealmKind, (RealmKind | null)[]> = {
  realm: [null],
  world: ['realm', null],
  continent: ['world'],
  domain: ['realm', 'domain'],
  region_group: ['continent'],
};

/** Whether a `kind` may sit inside a parent of `parentKind` (null: at the top level). */
export const canSitIn = (kind: RealmKind, parentKind: RealmKind | null) => REALM_PARENT_KINDS[kind].includes(parentKind);

/** The realm colours, each defined for both themes in the stylesheet (`--rc-<key>`) and checked for AA contrast. */
export const REALM_COLORS = ['blue', 'amber', 'green', 'violet', 'red', 'teal', 'rose', 'slate'] as const;
export type RealmColor = (typeof REALM_COLORS)[number];

/** The realm icons (each maps to an icon in the app). */
export const REALM_ICONS = ['globe', 'mountain', 'flame', 'ghost', 'trees', 'waves', 'castle', 'sun', 'moon', 'snowflake', 'sparkles', 'compass', 'skull', 'crown'] as const;
export type RealmIcon = (typeof REALM_ICONS)[number];

export interface RealmInfo {
  /** Stable key, as stored on records (e.g. "sunken-isles"). */
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
  /** The record that introduces it: its own world, continent, realm or domain record (GM API only). */
  intro_id?: string | null;
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
