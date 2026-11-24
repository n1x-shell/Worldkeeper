/**
 * Modules (docs/OWN_WORLD_PLAN.md §2.0, §2.10): optional features that live in the app's code but know nothing about
 * any one world. Each declares its pages, the API routes it owns, its sheet tabs, its parts of the player handbook
 * and the data it keeps. A module is off unless a setting pack turns it on, or the GM does (Settings → Modules); a
 * campaign can differ from the library. Switching one off hides it everywhere and deletes nothing.
 *
 * Pure data, used by the server and both apps.
 */

export const MODULE_KEYS = ['thinning', 'the-return', 'fading-salvage', 'setting-treasure', 'vaults', 'shards', 'depths-explorer', 'quick-reference', 'renown'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  about: string;
  /** GM app pages it adds (their paths); they leave the menus and refuse to open while it's off. */
  pages: string[];
  /** API paths it owns (prefixes, without /api); refused while it's off. */
  routes: string[];
  /** Character-sheet tabs it adds. */
  sheetTabs?: string[];
  /** What it adds to the player handbook and the table server. */
  handbook?: string[];
  /** Where its data lives (kept, and exported, while it's off). */
  storage: string[];
}

export const MODULES: ModuleDef[] = [
  {
    key: 'thinning',
    label: 'Thinning, true names and memories',
    about: 'A track of how far a character is coming unmade, with their true name, who knows it, named memories they lose, and the Shardscarred mark. On sheets and character pages.',
    pages: [],
    routes: [],
    sheetTabs: ['thinning'],
    handbook: ['The Thinning tab on players’ character pages'],
    storage: ['module_data (character)'],
  },
  {
    key: 'the-return',
    label: 'The Return (a clock)',
    about: 'A clock only the GM sees, whose stages bring omens the players do see. Its stages come from the worldbook.',
    pages: ['/campaign/return'],
    routes: ['/return'],
    handbook: ['Signs and Omens'],
    storage: ['return_clock', 'return_log'],
  },
  {
    key: 'fading-salvage',
    label: 'Fading salvage',
    about: 'Treasure from some regions fades unless the party learns its story and anchors it.',
    pages: [],
    routes: [],
    handbook: ['“Fading” on the party’s treasure'],
    storage: ['module_data (treasure)'],
  },
  {
    key: 'setting-treasure',
    label: 'The setting’s treasure',
    about: 'The Treasure tool rolls the setting’s own items and regional tables. Off: it rolls magic items from your books.',
    pages: [],
    routes: [],
    storage: ['the pack’s treasure folder'],
  },
  {
    key: 'vaults',
    label: 'Vaults',
    about: 'The sealed vaults: their keys, conditions and state in each campaign.',
    pages: ['/kaelmar/vaults'],
    routes: ['/special/vaults'],
    storage: ['campaign_state'],
  },
  {
    key: 'shards',
    label: 'Shards',
    about: 'The shards: who holds them, where they are and their state in each campaign.',
    pages: ['/aetheris/shards'],
    routes: ['/special/shards'],
    storage: ['campaign_state'],
  },
  {
    key: 'depths-explorer',
    label: 'Depths explorer',
    about: 'A realm of layered domains (the pack names which), from the border to the deep, with how to reach each.',
    pages: ['/ethereal/explorer'],
    routes: [],
    storage: [],
  },
  {
    key: 'quick-reference',
    label: 'Quick reference',
    about: 'The setting’s own one-page reference for the table.',
    pages: ['/quick-reference'],
    routes: [],
    storage: [],
  },
  {
    key: 'renown',
    label: 'Renown',
    about: 'The party’s standing with each faction, with ranks and what each rank earns. The ranks come from the worldbook, or a plain ladder.',
    pages: ['/campaign/standing'],
    routes: ['/standing'],
    handbook: ['Faction Standing'],
    storage: ['faction_standing', 'standing_log'],
  },
];

export const isModuleKey = (key: string): key is ModuleKey => (MODULE_KEYS as readonly string[]).includes(key);

/** Switches as stored: on, off, or absent (follow the level above). */
export type ModuleSwitches = Partial<Record<ModuleKey, boolean>>;

/** The module that owns a GM page, if any. */
export const moduleForPage = (path: string) => MODULES.find((m) => m.pages.some((p) => path === p || path.startsWith(p + '/')));

/** The module that owns an API path (without /api), if any. */
export const moduleForRoute = (path: string) => MODULES.find((m) => m.routes.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?')));

/**
 * The switches a library had as "campaign mechanics" (v0.4.0 to v0.4.3), as modules: for handbooks published then,
 * and for libraries saved then (migration 23 does the same in SQL).
 */
export function modulesFromMechanics(m: Partial<Record<'setting' | 'thinning' | 'theReturn' | 'fading' | 'worldTreasure', boolean>>): ModuleSwitches {
  const out: ModuleSwitches = {};
  const set = (k: ModuleKey, v: boolean | undefined) => v !== undefined && (out[k] = v);
  set('thinning', m.thinning);
  set('the-return', m.theReturn);
  set('fading-salvage', m.fading);
  set('setting-treasure', m.worldTreasure);
  for (const k of ['vaults', 'shards', 'depths-explorer', 'quick-reference'] as const) set(k, m.setting);
  return out;
}
