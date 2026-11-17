/**
 * The Worldkeeper setting's own mechanics, each of which a GM can switch off to run a standard D&D campaign (see
 * docs/FEATURES.md, "Campaign mechanics"). Pure data, used by the server and both apps.
 */
export interface Mechanics {
  /** The setting's own pages: Aetheris, Kaelmar and the Ethereal Realm in the menu, the setting quick reference. */
  setting: boolean;
  /** Thinning, true names, named memories and Shardscarred, on sheets and character pages. */
  thinning: boolean;
  /** The Return: its clock for the GM and its omens for players. */
  theReturn: boolean;
  /** Salvage from the Ethereal Realm fades unless it's anchored. */
  fading: boolean;
  /** The Treasure tool rolls from the setting's own items and regional tables (mapped to the GM's books). Off: from the books. */
  worldTreasure: boolean;
}
export type MechanicKey = keyof Mechanics;

export const MECHANICS: { key: MechanicKey; label: string; about: string }[] = [
  { key: 'setting', label: 'The setting’s pages', about: 'Aetheris, Kaelmar and the Ethereal Realm in the menu, and the setting’s quick reference and rules.' },
  { key: 'thinning', label: 'Thinning, true names and memories', about: 'The Thinning track, true names, named memories and Shardscarred, on sheets and character pages.' },
  { key: 'theReturn', label: 'The Return', about: 'The Return’s clock for the GM, and its signs and omens for players.' },
  { key: 'fading', label: 'Fading salvage', about: 'Treasure from the Ethereal Realm fades unless it’s anchored.' },
  { key: 'worldTreasure', label: 'The setting’s treasure', about: 'The Treasure tool rolls the setting’s own items and regional tables. Off: it rolls magic items from your books.' },
];

export const SETTING_PRESET: Mechanics = { setting: true, thinning: true, theReturn: true, fading: true, worldTreasure: true };
export const STANDARD_PRESET: Mechanics = { setting: false, thinning: false, theReturn: false, fading: false, worldTreasure: false };

/** Fill in any missing switch from a default. */
export const withDefaults = (m: Partial<Mechanics> | null | undefined, base: Mechanics): Mechanics => ({ ...base, ...(m ?? {}) });
