/**
 * The D&D 2024 character sheet: what it holds, and what can be worked out from it. Rules terms (skills, abilities,
 * conditions, weapon mastery properties) are those of the System Reference Document 5.2, used under CC-BY-4.0.
 */
import { abilityModifier, proficiencyBonus } from './play';

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS: { name: string; ability: Ability }[] = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
];

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large'];
export const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];

export interface Attack {
  name: string;
  bonus: string;
  damage: string;
  notes: string;
}
export interface Spell {
  name: string;
  level: number;
  prepared: boolean;
  /** As on the official sheet: casting time, range, Concentration, Ritual, Material, and notes. */
  time?: string;
  range?: string;
  concentration?: boolean;
  ritual?: boolean;
  material?: boolean;
  notes?: string;
}
/** A class feature, species trait or feat, with its rules text. */
export interface Feature {
  name: string;
  source: string;
  text: string;
}
/** A use that comes back on a rest (Rage, Channel Divinity, Focus Points...). */
export interface SheetResource {
  name: string;
  max: number;
  used: number;
  reset: 'short' | 'short-one' | 'long';
}
export interface Coins {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}

/** Everything on a 2024 sheet. All of it is optional: a new character starts blank. */
export interface Sheet {
  abilities?: Record<string, number>;
  saves?: string[];
  skills?: string[];
  expertise?: string[];
  ac?: number;
  maxHp?: number;
  hp?: number;
  tempHp?: number;
  initiativeBonus?: number;
  speed?: string;
  hitDie?: string;
  hitDiceSpent?: number;
  deathSaves?: { successes: number; failures: number };
  inspiration?: boolean;
  spellSlots?: Record<string, { max: number; used: number }>;
  concentration?: string | null;
  conditions?: string[];
  exhaustion?: number;
  equipment?: string;
  coins?: Coins;
  lastRest?: string;
  subclass?: string;
  background?: string;
  alignment?: string;
  size?: string;
  xp?: number;
  /** The level the sheet has taken in: when the GM raises the level past it, the sheet offers what the new level gives. */
  builtLevel?: number;
  armorProf?: string;
  weaponProf?: string;
  toolProf?: string;
  languages?: string;
  masteries?: string[];
  attacks?: Attack[];
  spellAbility?: string;
  spells?: Spell[];
  features?: string;
  traits?: string;
  feats?: string;
  classFeatures?: Feature[];
  speciesTraits?: Feature[];
  featList?: Feature[];
  armorTraining?: { light?: boolean; medium?: boolean; heavy?: boolean; shields?: boolean };
  armorWorn?: string;
  shield?: boolean;
  attunement?: string[];
  resources?: SheetResource[];
  pronouns?: string;
  /** The portrait: an uploaded picture's file name on the server, or a small data URL in the handbook's builder. */
  portrait?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  /** GM-only: setting mechanics, the character's ties to the world and hometown. Never shown to players. */
  shardscarred?: string;
  hometown?: string | null;
  ties?: { entity_id: string; kind: string; note: string }[];
}

/** A character as a sheet shows it: who they are, their level, and the sheet itself. */
export interface SheetChar {
  name: string;
  species: string;
  class_name: string;
  level: number;
  sheet: Sheet;
}

/** The parts of a sheet only the GM sees. */
export const GM_ONLY_SHEET_KEYS = ['shardscarred', 'hometown', 'ties'] as const;

export const score = (s: Sheet, a: Ability) => s.abilities?.[a] ?? 10;
export const mod = (s: Sheet, a: Ability) => abilityModifier(score(s, a));
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function saveBonus(s: Sheet, level: number, a: Ability) {
  return mod(s, a) + (s.saves?.includes(a) ? proficiencyBonus(level) : 0);
}
export function skillBonus(s: Sheet, level: number, skill: string) {
  const sk = SKILLS.find((x) => x.name === skill);
  if (!sk) return 0;
  const pb = proficiencyBonus(level);
  return mod(s, sk.ability) + (s.expertise?.includes(skill) ? pb * 2 : s.skills?.includes(skill) ? pb : 0);
}
export const passive = (s: Sheet, level: number, skill: string) => 10 + skillBonus(s, level, skill);
export const initiative = (s: Sheet) => s.initiativeBonus ?? mod(s, 'DEX');
export function spellSaveDc(s: Sheet, level: number) {
  const a = s.spellAbility as Ability | undefined;
  return a && ABILITIES.includes(a) ? 8 + proficiencyBonus(level) + mod(s, a) : null;
}
export function spellAttack(s: Sheet, level: number) {
  const a = s.spellAbility as Ability | undefined;
  return a && ABILITIES.includes(a) ? proficiencyBonus(level) + mod(s, a) : null;
}

/** A short rest: uses that come back on a short rest, and a Warlock's Pact Magic slots. Spending Hit Dice is up to the player. */
export function shortRest(s: Sheet, pactSlots = false, when = new Date().toLocaleDateString()): Sheet {
  return {
    ...s,
    resources: (s.resources ?? []).map((r) => (r.reset === 'short' ? { ...r, used: 0 } : r.reset === 'short-one' ? { ...r, used: Math.max(0, r.used - 1) } : r)),
    ...(pactSlots ? { spellSlots: Object.fromEntries(Object.entries(s.spellSlots ?? {}).map(([k, v]) => [k, { ...v, used: 0 }])) } : {}),
    lastRest: `Short rest (${when})`,
  };
}

/** A long rest (2024): all Hit Points and Hit Dice back, spell slots restored, Exhaustion down by one, no Temporary Hit Points. */
export function longRest(s: Sheet, when = new Date().toLocaleDateString()): Sheet {
  return {
    ...s,
    hp: s.maxHp ?? s.hp,
    tempHp: 0,
    hitDiceSpent: 0,
    deathSaves: { successes: 0, failures: 0 },
    exhaustion: Math.max(0, (s.exhaustion ?? 0) - 1),
    spellSlots: Object.fromEntries(Object.entries(s.spellSlots ?? {}).map(([k, v]) => [k, { ...v, used: 0 }])),
    resources: (s.resources ?? []).map((r) => ({ ...r, used: 0 })),
    lastRest: `Long rest (${when})`,
  };
}
