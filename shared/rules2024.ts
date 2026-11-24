/**
 * D&D 2024 rules data for building and keeping a character: classes, their level tables, backgrounds, weapons and
 * armor, and the sums that come from them (hit points, spell slots, armor class, attack bonuses).
 *
 * This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
 * available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
 * International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
 *
 * Backgrounds outside the SRD are listed by their mechanics only (ability scores, skills, tool and feat).
 */
import TABLES from './srd/tables.json';
import { type Ability, type Sheet, mod } from './sheet';
import { proficiencyBonus } from './play';

export const ABILITY_NAMES: Record<Ability, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
/** Point buy: 27 points, scores 8 to 15 before bonuses. */
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export interface Resource {
  name: string;
  max: number;
  used: number;
  /** When it comes back: all on a short rest, one on a short rest (and all on a long rest), or only on a long rest. */
  reset: 'short' | 'short-one' | 'long';
}

export interface ArmorTraining {
  light?: boolean;
  medium?: boolean;
  heavy?: boolean;
  shields?: boolean;
}

export interface ClassInfo {
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  primary: string;
  saves: Ability[];
  skillCount: number;
  /** Skills to choose from, or every skill. */
  skillFrom: string[] | 'any';
  weapons: string;
  /** Which martial weapons count as proficient, if only some do. */
  martial: 'all' | 'none' | 'light' | 'finesse-or-light';
  tools: string;
  armor: ArmorTraining;
  /** Starting equipment choices, the last being gold only. */
  equipment: { items: string[]; gp: number }[];
  caster?: 'full' | 'half' | 'pact';
  spellAbility?: Ability;
  /** The SRD's own subclass, with its features in the rules text. */
  srdSubclass?: string;
  /** Not in the SRD: the numbers come from the class's own book. */
  outsideSrd?: boolean;
}

const SKILL = {
  barb: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
  cler: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
  druid: ['Animal Handling', 'Arcana', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
  fight: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Persuasion', 'Perception', 'Survival'],
  monk: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
  pal: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
  rang: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
  rogue: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth'],
  sorc: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
  lock: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
  wiz: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Nature', 'Religion'],
  art: ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Sleight of Hand'],
};

export const CLASSES: ClassInfo[] = [
  {
    name: 'Barbarian',
    hitDie: 12,
    primary: 'Strength',
    saves: ['STR', 'CON'],
    skillCount: 2,
    skillFrom: SKILL.barb,
    weapons: 'Simple and Martial weapons',
    martial: 'all',
    tools: '',
    armor: { light: true, medium: true, shields: true },
    equipment: [
      { items: ['Greataxe', '4 Handaxes', "Explorer's Pack"], gp: 15 },
      { items: [], gp: 75 },
    ],
    srdSubclass: 'Path of the Berserker',
  },
  {
    name: 'Bard',
    hitDie: 8,
    primary: 'Charisma',
    saves: ['DEX', 'CHA'],
    skillCount: 3,
    skillFrom: 'any',
    weapons: 'Simple weapons',
    martial: 'none',
    tools: 'Three Musical Instruments of your choice',
    armor: { light: true },
    equipment: [
      { items: ['Leather Armor', '2 Daggers', 'Musical Instrument', "Entertainer's Pack"], gp: 19 },
      { items: [], gp: 90 },
    ],
    caster: 'full',
    spellAbility: 'CHA',
    srdSubclass: 'College of Lore',
  },
  {
    name: 'Cleric',
    hitDie: 8,
    primary: 'Wisdom',
    saves: ['WIS', 'CHA'],
    skillCount: 2,
    skillFrom: SKILL.cler,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: '',
    armor: { light: true, medium: true, shields: true },
    equipment: [
      { items: ['Chain Shirt', 'Shield', 'Mace', 'Holy Symbol', "Priest's Pack"], gp: 7 },
      { items: [], gp: 110 },
    ],
    caster: 'full',
    spellAbility: 'WIS',
    srdSubclass: 'Life Domain',
  },
  {
    name: 'Druid',
    hitDie: 8,
    primary: 'Wisdom',
    saves: ['INT', 'WIS'],
    skillCount: 2,
    skillFrom: SKILL.druid,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: 'Herbalism Kit',
    armor: { light: true, shields: true },
    equipment: [
      { items: ['Leather Armor', 'Shield', 'Sickle', 'Druidic Focus (Quarterstaff)', "Explorer's Pack", 'Herbalism Kit'], gp: 9 },
      { items: [], gp: 50 },
    ],
    caster: 'full',
    spellAbility: 'WIS',
    srdSubclass: 'Circle of the Land',
  },
  {
    name: 'Fighter',
    hitDie: 10,
    primary: 'Strength or Dexterity',
    saves: ['STR', 'CON'],
    skillCount: 2,
    skillFrom: SKILL.fight,
    weapons: 'Simple and Martial weapons',
    martial: 'all',
    tools: '',
    armor: { light: true, medium: true, heavy: true, shields: true },
    equipment: [
      { items: ['Chain Mail', 'Greatsword', 'Flail', '8 Javelins', "Dungeoneer's Pack"], gp: 4 },
      { items: ['Studded Leather Armor', 'Scimitar', 'Shortsword', 'Longbow', '20 Arrows', 'Quiver', "Dungeoneer's Pack"], gp: 11 },
      { items: [], gp: 155 },
    ],
    srdSubclass: 'Champion',
  },
  {
    name: 'Monk',
    hitDie: 8,
    primary: 'Dexterity and Wisdom',
    saves: ['STR', 'DEX'],
    skillCount: 2,
    skillFrom: SKILL.monk,
    weapons: 'Simple weapons and Martial weapons that have the Light property',
    martial: 'light',
    tools: "One type of Artisan's Tools or Musical Instrument",
    armor: {},
    equipment: [
      { items: ['Spear', '5 Daggers', "Artisan's Tools or Musical Instrument", "Explorer's Pack"], gp: 11 },
      { items: [], gp: 50 },
    ],
    srdSubclass: 'Warrior of the Open Hand',
  },
  {
    name: 'Paladin',
    hitDie: 10,
    primary: 'Strength and Charisma',
    saves: ['WIS', 'CHA'],
    skillCount: 2,
    skillFrom: SKILL.pal,
    weapons: 'Simple and Martial weapons',
    martial: 'all',
    tools: '',
    armor: { light: true, medium: true, heavy: true, shields: true },
    equipment: [
      { items: ['Chain Mail', 'Shield', 'Longsword', '6 Javelins', 'Holy Symbol', "Priest's Pack"], gp: 9 },
      { items: [], gp: 150 },
    ],
    caster: 'half',
    spellAbility: 'CHA',
    srdSubclass: 'Oath of Devotion',
  },
  {
    name: 'Ranger',
    hitDie: 10,
    primary: 'Dexterity and Wisdom',
    saves: ['STR', 'DEX'],
    skillCount: 3,
    skillFrom: SKILL.rang,
    weapons: 'Simple and Martial weapons',
    martial: 'all',
    tools: '',
    armor: { light: true, medium: true, shields: true },
    equipment: [
      { items: ['Studded Leather Armor', 'Scimitar', 'Shortsword', 'Longbow', '20 Arrows', 'Quiver', 'Druidic Focus (sprig of mistletoe)', "Explorer's Pack"], gp: 7 },
      { items: [], gp: 150 },
    ],
    caster: 'half',
    spellAbility: 'WIS',
    srdSubclass: 'Hunter',
  },
  {
    name: 'Rogue',
    hitDie: 8,
    primary: 'Dexterity',
    saves: ['DEX', 'INT'],
    skillCount: 4,
    skillFrom: SKILL.rogue,
    weapons: 'Simple weapons and Martial weapons that have the Finesse or Light property',
    martial: 'finesse-or-light',
    tools: "Thieves' Tools",
    armor: { light: true },
    equipment: [
      { items: ['Leather Armor', '2 Daggers', 'Shortsword', 'Shortbow', '20 Arrows', 'Quiver', "Thieves' Tools", "Burglar's Pack"], gp: 8 },
      { items: [], gp: 100 },
    ],
    srdSubclass: 'Thief',
  },
  {
    name: 'Sorcerer',
    hitDie: 6,
    primary: 'Charisma',
    saves: ['CON', 'CHA'],
    skillCount: 2,
    skillFrom: SKILL.sorc,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: '',
    armor: {},
    equipment: [
      { items: ['Spear', '2 Daggers', 'Arcane Focus (crystal)', "Dungeoneer's Pack"], gp: 28 },
      { items: [], gp: 50 },
    ],
    caster: 'full',
    spellAbility: 'CHA',
    srdSubclass: 'Draconic Sorcery',
  },
  {
    name: 'Warlock',
    hitDie: 8,
    primary: 'Charisma',
    saves: ['WIS', 'CHA'],
    skillCount: 2,
    skillFrom: SKILL.lock,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: '',
    armor: { light: true },
    equipment: [
      { items: ['Leather Armor', 'Sickle', '2 Daggers', 'Arcane Focus (orb)', 'Book (occult lore)', "Scholar's Pack"], gp: 15 },
      { items: [], gp: 100 },
    ],
    caster: 'pact',
    spellAbility: 'CHA',
    srdSubclass: 'Fiend Patron',
  },
  {
    name: 'Wizard',
    hitDie: 6,
    primary: 'Intelligence',
    saves: ['INT', 'WIS'],
    skillCount: 2,
    skillFrom: SKILL.wiz,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: '',
    armor: {},
    equipment: [
      { items: ['2 Daggers', 'Arcane Focus (Quarterstaff)', 'Robe', 'Spellbook', "Scholar's Pack"], gp: 5 },
      { items: [], gp: 55 },
    ],
    caster: 'full',
    spellAbility: 'INT',
    srdSubclass: 'Evoker',
  },
  {
    name: 'Artificer',
    hitDie: 8,
    primary: 'Intelligence',
    saves: ['CON', 'INT'],
    skillCount: 2,
    skillFrom: SKILL.art,
    weapons: 'Simple weapons',
    martial: 'none',
    tools: "Thieves' Tools, Tinker's Tools, and one kind of Artisan's Tools",
    armor: { light: true, medium: true, shields: true },
    equipment: [{ items: [], gp: 150 }],
    caster: 'half',
    spellAbility: 'INT',
    outsideSrd: true,
  },
];

export const classInfo = (name: string | undefined) => CLASSES.find((c) => c.name.toLowerCase() === (name ?? '').trim().toLowerCase());

export interface LevelRow {
  level: number;
  features: string[];
  [column: string]: number | string | string[];
}
const TABLE = TABLES as unknown as Record<string, LevelRow[]>;
/** A class's row of its features table at a level, if the SRD has it. */
export const classRow = (cls: string, level: number): LevelRow | undefined => TABLE[classInfo(cls)?.name ?? '']?.[Math.min(20, Math.max(1, level)) - 1];

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Spell slots for a class at a level: the class's own table, or the half-caster table rounded up for one outside the SRD. */
export function spellSlotsFor(cls: string, level: number): Record<string, number> {
  const info = classInfo(cls);
  if (!info?.caster) return {};
  if (info.caster === 'pact') {
    const r = classRow('Warlock', level)!;
    return { [String(r.slotLevel)]: num(r.pactSlots) };
  }
  const row = info.outsideSrd ? classRow('Paladin', Math.min(20, level + 1)) : classRow(info.name, level);
  const out: Record<string, number> = {};
  for (let i = 1; i <= 9; i++) if (num(row?.[`s${i}`])) out[String(i)] = num(row?.[`s${i}`]);
  return out;
}

/** How many cantrips and prepared spells a class has at a level. */
export function spellCounts(cls: string, level: number) {
  const r = classRow(cls, level);
  return { cantrips: num(r?.cantrips), prepared: num(r?.prepared) };
}

/** Fixed hit points: the full Hit Die at level 1, then the average (half the die plus 1) each level, plus Constitution each level. */
export function hitPointsFor(hitDie: number, level: number, conMod: number, extraPerLevel = 0) {
  return Math.max(1, hitDie + conMod + (level - 1) * (hitDie / 2 + 1 + conMod) + level * extraPerLevel);
}

/** Levels at which a class gains an Ability Score Improvement (or another feat), and the Epic Boon. */
export const featLevels = (cls: string) =>
  (TABLE[classInfo(cls)?.name ?? ''] ?? []).filter((r) => r.features.includes('Ability Score Improvement') || r.features.includes('Epic Boon')).map((r) => r.level);

/** How many weapons a class can use Weapon Mastery with. */
export function masteryCount(cls: string, level: number) {
  const r = classRow(cls, level);
  if (r && typeof r.mastery === 'number') return r.mastery;
  return ['Paladin', 'Ranger', 'Rogue'].includes(classInfo(cls)?.name ?? '') ? 2 : 0;
}

/** Class resources to track on the sheet (uses that come back on a rest). */
export function resourcesFor(cls: string, level: number, s: Sheet): Resource[] {
  const r = classRow(cls, level);
  const c = classInfo(cls)?.name;
  if (!r || !c) return [];
  const out: Resource[] = [];
  const add = (name: string, max: number, reset: Resource['reset']) => max > 0 && out.push({ name, max, used: 0, reset });
  if (c === 'Barbarian') add('Rage', num(r.rages), 'short-one');
  if (c === 'Bard') add('Bardic Inspiration', Math.max(1, mod(s, 'CHA')), level >= 5 ? 'short' : 'long');
  if (c === 'Cleric' || c === 'Paladin') add('Channel Divinity', num(r.channel), 'short-one');
  if (c === 'Druid') add('Wild Shape', num(r.wildShape), 'short-one');
  if (c === 'Fighter') {
    add('Second Wind', num(r.secondWind), 'short-one');
    add('Action Surge', level >= 17 ? 2 : level >= 2 ? 1 : 0, 'short');
    add('Indomitable', level >= 17 ? 3 : level >= 13 ? 2 : level >= 9 ? 1 : 0, 'long');
  }
  if (c === 'Monk') add('Focus Points', num(r.focus), 'short');
  if (c === 'Paladin') add('Lay On Hands (HP)', 5 * level, 'long');
  if (c === 'Ranger') add('Favored Enemy', num(r.favoredEnemy), 'long');
  if (c === 'Sorcerer') {
    add('Sorcery Points', num(r.sorceryPoints), 'long');
    add('Innate Sorcery', 2, 'long');
  }
  if (c === 'Wizard') add('Arcane Recovery', 1, 'long');
  return out;
}

export interface BackgroundInfo {
  name: string;
  abilities: Ability[];
  feat: string;
  skills: string[];
  tool: string;
  /** Equipment choice A, if known (the SRD's four backgrounds); B is always 50 GP. */
  equipment?: { items: string[]; gp: number };
  srd?: boolean;
}
const bg = (name: string, abilities: string, feat: string, skills: string, tool: string, equipment?: BackgroundInfo['equipment']): BackgroundInfo => ({
  name,
  abilities: abilities.split(' ') as Ability[],
  feat,
  skills: skills.split(', '),
  tool,
  ...(equipment ? { equipment, srd: true } : {}),
});
export const BACKGROUNDS: BackgroundInfo[] = [
  bg('Acolyte', 'INT WIS CHA', 'Magic Initiate (Cleric)', 'Insight, Religion', "Calligrapher's Supplies", {
    items: ["Calligrapher's Supplies", 'Book (prayers)', 'Holy Symbol', 'Parchment (10 sheets)', 'Robe'],
    gp: 8,
  }),
  bg('Artisan', 'STR DEX INT', 'Crafter', 'Investigation, Persuasion', "One kind of Artisan's Tools"),
  bg('Charlatan', 'DEX CON CHA', 'Skilled', 'Deception, Sleight of Hand', 'Forgery Kit'),
  bg('Criminal', 'DEX CON INT', 'Alert', 'Sleight of Hand, Stealth', "Thieves' Tools", { items: ['2 Daggers', "Thieves' Tools", 'Crowbar', '2 Pouches', "Traveler's Clothes"], gp: 16 }),
  bg('Entertainer', 'STR DEX CHA', 'Musician', 'Acrobatics, Performance', 'One kind of Musical Instrument'),
  bg('Farmer', 'STR CON WIS', 'Tough', 'Animal Handling, Nature', "Carpenter's Tools"),
  bg('Guard', 'STR INT WIS', 'Alert', 'Athletics, Perception', 'One kind of Gaming Set'),
  bg('Guide', 'DEX CON WIS', 'Magic Initiate (Druid)', 'Stealth, Survival', "Cartographer's Tools"),
  bg('Hermit', 'CON WIS CHA', 'Healer', 'Medicine, Religion', 'Herbalism Kit'),
  bg('Merchant', 'CON INT CHA', 'Lucky', 'Animal Handling, Persuasion', "Navigator's Tools"),
  bg('Noble', 'STR INT CHA', 'Skilled', 'History, Persuasion', 'One kind of Gaming Set'),
  bg('Sage', 'CON INT WIS', 'Magic Initiate (Wizard)', 'Arcana, History', "Calligrapher's Supplies", {
    items: ['Quarterstaff', "Calligrapher's Supplies", 'Book (history)', 'Parchment (8 sheets)', 'Robe'],
    gp: 8,
  }),
  bg('Sailor', 'STR DEX WIS', 'Tavern Brawler', 'Acrobatics, Perception', "Navigator's Tools"),
  bg('Scribe', 'DEX INT WIS', 'Skilled', 'Investigation, Perception', "Calligrapher's Supplies"),
  bg('Soldier', 'STR DEX CON', 'Savage Attacker', 'Athletics, Intimidation', 'One kind of Gaming Set', {
    items: ['Spear', 'Shortbow', '20 Arrows', 'Gaming Set', "Healer's Kit", 'Quiver', "Traveler's Clothes"],
    gp: 14,
  }),
  bg('Wayfarer', 'DEX WIS CHA', 'Lucky', 'Insight, Stealth', "Thieves' Tools"),
];
export const backgroundInfo = (name: string | undefined) => BACKGROUNDS.find((b) => b.name.toLowerCase() === (name ?? '').trim().toLowerCase());

export interface Weapon {
  name: string;
  category: 'Simple' | 'Martial';
  ranged: boolean;
  damage: string;
  type: string;
  properties: string[];
  mastery: string;
}
// name | damage | type | properties (; separated) | mastery
const W = (category: Weapon['category'], ranged: boolean, rows: string) =>
  rows
    .trim()
    .split('\n')
    .map((row) => {
      const [name, damage, type, props, mastery] = row.split('|').map((x) => x.trim());
      return { name, category, ranged, damage, type, properties: props ? props.split(';').map((p) => p.trim()) : [], mastery };
    });
export const WEAPONS: Weapon[] = [
  ...W(
    'Simple',
    false,
    `
Club|1d4|Bludgeoning|Light|Slow
Dagger|1d4|Piercing|Finesse; Light; Thrown (Range 20/60)|Nick
Greatclub|1d8|Bludgeoning|Two-Handed|Push
Handaxe|1d6|Slashing|Light; Thrown (Range 20/60)|Vex
Javelin|1d6|Piercing|Thrown (Range 30/120)|Slow
Light Hammer|1d4|Bludgeoning|Light; Thrown (Range 20/60)|Nick
Mace|1d6|Bludgeoning||Sap
Quarterstaff|1d6|Bludgeoning|Versatile (1d8)|Topple
Sickle|1d4|Slashing|Light|Nick
Spear|1d6|Piercing|Thrown (Range 20/60); Versatile (1d8)|Sap`,
  ),
  ...W(
    'Simple',
    true,
    `
Dart|1d4|Piercing|Finesse; Thrown (Range 20/60)|Vex
Light Crossbow|1d8|Piercing|Ammunition (Range 80/320; Bolt); Loading; Two-Handed|Slow
Shortbow|1d6|Piercing|Ammunition (Range 80/320; Arrow); Two-Handed|Vex
Sling|1d4|Bludgeoning|Ammunition (Range 30/120; Bullet)|Slow`,
  ),
  ...W(
    'Martial',
    false,
    `
Battleaxe|1d8|Slashing|Versatile (1d10)|Topple
Flail|1d8|Bludgeoning||Sap
Glaive|1d10|Slashing|Heavy; Reach; Two-Handed|Graze
Greataxe|1d12|Slashing|Heavy; Two-Handed|Cleave
Greatsword|2d6|Slashing|Heavy; Two-Handed|Graze
Halberd|1d10|Slashing|Heavy; Reach; Two-Handed|Cleave
Lance|1d10|Piercing|Heavy; Reach; Two-Handed (unless mounted)|Topple
Longsword|1d8|Slashing|Versatile (1d10)|Sap
Maul|2d6|Bludgeoning|Heavy; Two-Handed|Topple
Morningstar|1d8|Piercing||Sap
Pike|1d10|Piercing|Heavy; Reach; Two-Handed|Push
Rapier|1d8|Piercing|Finesse|Vex
Scimitar|1d6|Slashing|Finesse; Light|Nick
Shortsword|1d6|Piercing|Finesse; Light|Vex
Trident|1d8|Piercing|Thrown (Range 20/60); Versatile (1d10)|Topple
Warhammer|1d8|Bludgeoning|Versatile (1d10)|Push
War Pick|1d8|Piercing|Versatile (1d10)|Sap
Whip|1d4|Slashing|Finesse; Reach|Slow`,
  ),
  ...W(
    'Martial',
    true,
    `
Blowgun|1|Piercing|Ammunition (Range 25/100; Needle); Loading|Vex
Hand Crossbow|1d6|Piercing|Ammunition (Range 30/120; Bolt); Light; Loading|Vex
Heavy Crossbow|1d10|Piercing|Ammunition (Range 100/400; Bolt); Heavy; Loading; Two-Handed|Push
Longbow|1d8|Piercing|Ammunition (Range 150/600; Arrow); Heavy; Two-Handed|Slow
Musket|1d12|Piercing|Ammunition (Range 40/120; Bullet); Loading; Two-Handed|Slow
Pistol|1d10|Piercing|Ammunition (Range 30/90; Bullet); Loading|Vex`,
  ),
];
export const weaponInfo = (name: string) => {
  const n = name
    .trim()
    .toLowerCase()
    .replace(/^\d+\s+/, '');
  return WEAPONS.find((w) => w.name.toLowerCase() === n || `${w.name.toLowerCase()}s` === n || (n.endsWith('es') && w.name.toLowerCase() === n.slice(0, -2)));
};

export interface Armor {
  name: string;
  category: 'Light' | 'Medium' | 'Heavy' | 'Shield';
  base: number;
  /** The most Dexterity can add: none for heavy armor, 2 for medium. */
  dexMax: number | null;
  strength?: number;
  stealthDisadvantage?: boolean;
}
export const ARMOR: Armor[] = [
  { name: 'Padded Armor', category: 'Light', base: 11, dexMax: null, stealthDisadvantage: true },
  { name: 'Leather Armor', category: 'Light', base: 11, dexMax: null },
  { name: 'Studded Leather Armor', category: 'Light', base: 12, dexMax: null },
  { name: 'Hide Armor', category: 'Medium', base: 12, dexMax: 2 },
  { name: 'Chain Shirt', category: 'Medium', base: 13, dexMax: 2 },
  { name: 'Scale Mail', category: 'Medium', base: 14, dexMax: 2, stealthDisadvantage: true },
  { name: 'Breastplate', category: 'Medium', base: 14, dexMax: 2 },
  { name: 'Half Plate Armor', category: 'Medium', base: 15, dexMax: 2, stealthDisadvantage: true },
  { name: 'Ring Mail', category: 'Heavy', base: 14, dexMax: 0, stealthDisadvantage: true },
  { name: 'Chain Mail', category: 'Heavy', base: 16, dexMax: 0, strength: 13, stealthDisadvantage: true },
  { name: 'Splint Armor', category: 'Heavy', base: 17, dexMax: 0, strength: 15, stealthDisadvantage: true },
  { name: 'Plate Armor', category: 'Heavy', base: 18, dexMax: 0, strength: 15, stealthDisadvantage: true },
];
export const armorInfo = (name: string | undefined) => ARMOR.find((a) => a.name.toLowerCase() === (name ?? '').trim().toLowerCase());

/** Armor Class from what the character wears, with how it was worked out. */
export function armorClass(s: Sheet, cls: string): { value: number; how: string } {
  const armor = armorInfo(s.armorWorn);
  const dex = mod(s, 'DEX');
  const shield = s.shield ? 2 : 0;
  const plus = (n: number, what: string) => (n ? ` ${n >= 0 ? '+' : '−'} ${Math.abs(n)} ${what}` : '');
  if (armor) {
    const d = armor.dexMax === null ? dex : Math.min(dex, armor.dexMax);
    return { value: armor.base + d + shield, how: `${armor.name} ${armor.base}${plus(d, 'Dex')}${plus(shield, 'Shield')}` };
  }
  const c = classInfo(cls)?.name;
  if (c === 'Barbarian') return { value: 10 + dex + mod(s, 'CON') + shield, how: `Unarmored Defense 10${plus(dex, 'Dex')}${plus(mod(s, 'CON'), 'Con')}${plus(shield, 'Shield')}` };
  if (c === 'Monk' && !shield) return { value: 10 + dex + mod(s, 'WIS'), how: `Unarmored Defense 10${plus(dex, 'Dex')}${plus(mod(s, 'WIS'), 'Wis')}` };
  return { value: 10 + dex + shield, how: `Unarmored 10${plus(dex, 'Dex')}${plus(shield, 'Shield')}` };
}

/** Whether a class is proficient with a weapon. */
export function weaponProficient(cls: string, w: Weapon) {
  const info = classInfo(cls);
  if (!info) return w.category === 'Simple';
  if (w.category === 'Simple') return true;
  if (info.martial === 'all') return true;
  if (info.martial === 'light') return w.properties.includes('Light');
  if (info.martial === 'finesse-or-light') return w.properties.includes('Light') || w.properties.includes('Finesse');
  return false;
}

/** An attack row for a weapon: the bonus to hit, damage and notes (range, properties, mastery). */
export function attackFor(w: Weapon, s: Sheet, cls: string, level: number) {
  const str = mod(s, 'STR');
  const dex = mod(s, 'DEX');
  const useDex = w.ranged || (w.properties.includes('Finesse') && dex > str);
  const ab = w.ranged && w.properties.some((p) => p.startsWith('Thrown')) ? str : useDex ? dex : str;
  const prof = weaponProficient(cls, w) ? proficiencyBonus(level) : 0;
  const hit = ab + prof;
  const masters = (s.masteries ?? []).includes(w.name);
  return {
    name: w.name,
    bonus: `${hit >= 0 ? '+' : ''}${hit}`,
    damage: `${w.damage}${ab ? (ab > 0 ? ` + ${ab}` : ` − ${-ab}`) : ''} ${w.type}`,
    notes: [w.properties.join(', '), masters ? `Mastery: ${w.mastery}` : ''].filter(Boolean).join('. '),
  };
}

export const STANDARD_LANGUAGES = ['Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc'];
export const RARE_LANGUAGES = ['Abyssal', 'Celestial', 'Deep Speech', 'Druidic', 'Infernal', 'Primordial', 'Sylvan', "Thieves' Cant", 'Undercommon'];
export const ORIGIN_FEATS = [
  'Alert',
  'Crafter',
  'Healer',
  'Lucky',
  'Magic Initiate (Cleric)',
  'Magic Initiate (Druid)',
  'Magic Initiate (Wizard)',
  'Musician',
  'Savage Attacker',
  'Skilled',
  'Tavern Brawler',
  'Tough',
];
