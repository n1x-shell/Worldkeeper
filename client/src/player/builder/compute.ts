/**
 * The character builder's choices, and the D&D 2024 sheet they make. Everything is worked out the way the rules say:
 * ability scores from the array, point buy or rolls plus the background's increases and later Ability Score
 * Improvements; fixed hit points; proficiencies from class and background; armor class and attacks from the gear.
 */
import { ABILITIES, mod, type Ability, type Feature, type Sheet, type SheetChar, type Spell } from '../../../../shared/sheet';
import { proficiencyBonus } from '../../../../shared/play';
import {
  ARMOR,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  armorClass,
  attackFor,
  backgroundInfo,
  classInfo,
  featLevels,
  hitPointsFor,
  resourcesFor,
  spellSlotsFor,
  weaponInfo,
} from '../../../../shared/rules2024';
import type { SrdSpell, SrdText, WorldBackground } from '../sheet/srd';
import { byName } from '../../../../shared/rulesView';
import { classFeaturesFor, featFor, speciesTraitsFor } from '../sheet/srd';

export type Method = 'standard' | 'pointbuy' | 'roll' | 'manual';
export interface Improvement {
  level: number;
  kind: 'asi' | 'feat';
  /** For an Ability Score Improvement: two +1s (the same ability twice for +2). */
  picks: (Ability | '')[];
  feat: string;
}
export interface Build {
  level: number;
  people: string;
  cls: string;
  subclass: string;
  background: string;
  /** The three abilities a background can raise (fixed for the Player's Handbook's, chosen for the world's). */
  bgAbilities: Ability[];
  bonusMode: '2-1' | '1-1-1';
  /** Which ability gets +2 and which +1 (2-1 mode). */
  plusTwo: Ability | '';
  plusOne: Ability | '';
  method: Method;
  base: Record<Ability, number>;
  rolls: number[];
  improvements: Improvement[];
  classSkills: string[];
  expertise: string[];
  languages: string[];
  masteries: string[];
  classKit: number;
  bgKit: number;
  spells: string[];
  name: string;
  pronouns: string;
  alignment: string;
  appearance: string;
  personality: string;
  /** A small portrait as a data URL (kept in this browser until it is sent to a sheet). */
  portrait: string;
  start: string;
  hometown: string;
  faction: string;
  family: string;
  rival: string;
  debt: string;
  notes: string;
}

export const EMPTY_BUILD: Build = {
  level: 1,
  people: '',
  cls: '',
  subclass: '',
  background: '',
  bgAbilities: [],
  bonusMode: '2-1',
  plusTwo: '',
  plusOne: '',
  method: 'standard',
  base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 },
  rolls: [],
  improvements: [],
  classSkills: [],
  expertise: [],
  languages: [],
  masteries: [],
  classKit: 0,
  bgKit: 0,
  spells: [],
  name: '',
  pronouns: '',
  alignment: '',
  appearance: '',
  personality: '',
  portrait: '',
  start: '',
  hometown: '',
  faction: '',
  family: '',
  rival: '',
  debt: '',
  notes: '',
};

/** 4d6, drop the lowest. */
export const rollScore = () => {
  const d = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  return d[1] + d[2] + d[3];
};
export const pointsSpent = (base: Record<Ability, number>) => ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[base[a]] ?? 99), 0);
/** The scores the chosen method can hand out (for the array and rolls). */
export const methodPool = (b: Build) => (b.method === 'standard' ? STANDARD_ARRAY : b.method === 'roll' ? b.rolls : []);

/** A background's kit A from its rules text: "Choose A or B: (A) Item, Item, 8 GP; or (B) 50 GP". */
export function parseKit(equipment: string | undefined): { items: string[]; gp: number } | null {
  const m = /\(A\)\s*(.*?);?\s*or\s*\(B\)/i.exec(equipment ?? '');
  if (!m) return null;
  const parts = m[1]
    .split(/,\s*(?![^()]*\))/)
    .map((x) => x.replace(/^and\s+/i, '').trim())
    .filter(Boolean);
  const gold = parts.find((x) => /^\d[\d,]*\s*GP$/i.test(x));
  return { items: parts.filter((x) => x !== gold), gp: gold ? Number(gold.replace(/[^\d]/g, '')) : 0 };
}

/** The background as the builder knows it: the Player's Handbook's, or one of the world's. A rules pack's kit wins. */
/** A background from the rules packs (a book's, or homebrew), in the builder's terms. */
export function packBackground(rules: SrdText | null | undefined, name: string | undefined) {
  const r = byName(rules?.backgrounds ?? {}, name);
  if (!r || !name) return null;
  const abilities = (r.abilities ?? []).map((a) => ABILITIES.find((k) => ABILITY_NAME[k].toLowerCase() === a.toLowerCase() || k === a.toUpperCase())).filter((a): a is Ability => !!a);
  return { name: name.trim(), abilities, skills: r.skills ?? [], tool: r.tool ?? '', feat: r.feat ?? '' };
}
const ABILITY_NAME: Record<Ability, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };

export function backgroundFor(b: Build, world: WorldBackground[], rules?: SrdText | null) {
  const phb = backgroundInfo(b.background);
  const packKit = parseKit(byName(rules?.backgrounds ?? {}, b.background)?.equipment);
  if (phb) return { name: phb.name, abilities: phb.abilities, skills: phb.skills, tool: phb.tool, feat: phb.feat, kit: packKit ?? phb.equipment ?? null, who: '', fixed: true };
  const w = world.find((x) => x.name === b.background);
  if (!w) {
    const pack = packBackground(rules, b.background);
    return pack ? { ...pack, abilities: pack.abilities.length ? pack.abilities : b.bgAbilities, kit: packKit, who: '', fixed: pack.abilities.length === 3 } : null;
  }
  const skills = w.skills
    .split(/,| and /)
    .map((x) => x.trim())
    .filter(Boolean);
  return { name: w.name, abilities: b.bgAbilities, skills, tool: w.tool, feat: w.feat, kit: packKit, who: w.who, fixed: false };
}

/** Final ability scores: base, the background's increases, then each Ability Score Improvement (to 20 at most). */
export function finalScores(b: Build): Record<Ability, number> {
  const out = { ...b.base };
  if (b.bonusMode === '2-1') {
    if (b.plusTwo) out[b.plusTwo] += 2;
    if (b.plusOne && b.plusOne !== b.plusTwo) out[b.plusOne] += 1;
  } else for (const a of b.bgAbilities.slice(0, 3)) out[a] += 1;
  for (const imp of b.improvements.filter((i) => i.level <= b.level)) {
    if (imp.kind !== 'asi') continue;
    for (const a of imp.picks ?? []) if (a) out[a] = Math.min(20, out[a] + 1);
  }
  return out;
}

/** How many Expertise picks a class has at a level. */
export function expertiseCount(cls: string, level: number) {
  const c = classInfo(cls)?.name;
  if (c === 'Rogue') return level >= 6 ? 4 : 2;
  if (c === 'Bard') return level >= 9 ? 4 : level >= 2 ? 2 : 0;
  if (c === 'Ranger') return level >= 9 ? 3 : level >= 2 ? 1 : 0;
  return 0;
}

/** The improvements a level-N character has (one per Ability Score Improvement level, and the Epic Boon). */
export function improvementSlots(b: Build): Improvement[] {
  return featLevels(b.cls)
    .filter((l) => l <= b.level)
    .map((l) => b.improvements.find((i) => i.level === l) ?? { level: l, kind: l === 19 ? 'feat' : 'asi', picks: ['', ''], feat: '' });
}

/** Turn "4 Handaxes", "20 Arrows" into a weapon name. */
const itemWeapon = (item: string) =>
  weaponInfo(
    item
      .replace(/^\d+\s+/, '')
      .replace(/\(.*\)$/, '')
      .trim(),
  );

/** The equipment the kits give, as lines, and the gold. */
export function kitFor(b: Build, world: WorldBackground[], rules?: SrdText | null) {
  const c = classInfo(b.cls);
  const ck = c?.equipment[Math.min(b.classKit, (c?.equipment.length ?? 1) - 1)];
  const bg = backgroundFor(b, world, rules);
  const bk = bg?.kit && b.bgKit === 0 ? bg.kit : { items: [], gp: 50 };
  return { items: [...(ck?.items ?? []), ...bk.items], gp: (ck?.gp ?? 0) + bk.gp, bgKitUnknown: !!bg && !bg.kit && b.bgKit === 0 };
}

/** The sheet this build makes. The SRD text and spells fill in features and spell details when loaded. */
export function buildSheet(b: Build, opts: { world: WorldBackground[]; speciesRules: string | null; text: SrdText | null; spells: SrdSpell[] | null }): SheetChar {
  const info = classInfo(b.cls);
  const level = b.level;
  const scores = finalScores(b);
  const draft: Sheet = { abilities: scores };
  const bg = backgroundFor(b, opts.world, opts.text);
  const sp = opts.speciesRules && opts.text ? (byName(opts.text.species, opts.speciesRules) ?? null) : null;
  const imps = improvementSlots(b);
  const featNames = [bg?.feat, ...imps.filter((i) => i.kind === 'feat' && i.feat).map((i) => i.feat)].filter((x): x is string => !!x);
  const hasFeat = (n: string) => featNames.some((f) => f.toLowerCase().startsWith(n.toLowerCase()));
  const hitDie = info?.hitDie ?? 8;
  const extra = (opts.speciesRules === 'Dwarf' ? 1 : 0) + (hasFeat('Tough') ? 2 : 0);
  const maxHp = hitPointsFor(hitDie, level, mod(draft, 'CON'), extra);
  const kit = kitFor(b, opts.world, opts.text);
  const armorItem = kit.items.map((i) => ARMOR.find((a) => a.name.toLowerCase() === i.toLowerCase())).find(Boolean);
  const shield = kit.items.includes('Shield') && !!info?.armor.shields;
  const skills = [...new Set([...(bg?.skills ?? []), ...b.classSkills])];
  const feats: Feature[] = opts.text ? featNames.map((f) => featFor(opts.text!, f)) : featNames.map((f) => ({ name: f, source: 'Feat', text: '' }));
  // Only spells of a level the character has slots for (a build sent to a sheet at a lower level drops the rest).
  const maxSpell = Math.max(0, ...Object.keys(spellSlotsFor(b.cls, level)).map(Number));
  const spellList: Spell[] = b.spells
    .filter((n) => {
      const x = opts.spells?.find((s) => s.name === n);
      return !x || info?.outsideSrd || x.level <= maxSpell;
    })
    .map((n) => {
      const x = opts.spells?.find((s) => s.name === n);
      return x
        ? {
            name: x.name,
            level: x.level,
            prepared: true,
            time: x.time.replace(/, which you take.*$/, ''),
            range: x.range,
            concentration: x.concentration,
            ritual: x.ritual,
            material: x.material,
            notes: '',
          }
        : { name: n, level: 1, prepared: true };
    });
  const slots = spellSlotsFor(b.cls, level);
  const sheet: Sheet = {
    ...draft,
    saves: info?.saves ?? [],
    skills,
    expertise: b.expertise.filter((e) => skills.includes(e)),
    hitDie: `d${hitDie}`,
    hitDiceSpent: 0,
    maxHp,
    hp: maxHp,
    tempHp: 0,
    speed: `${sp?.speed ?? 30} ft.`,
    size: sp?.size[0] ?? 'Medium',
    armorTraining: info?.armor ?? {},
    weaponProf: info?.weapons ?? '',
    toolProf: [info?.tools, bg?.tool].filter(Boolean).join('; '),
    languages: ['Common', ...b.languages].join(', '),
    masteries: b.masteries,
    armorWorn: armorItem?.name,
    shield,
    equipment: kit.items.join('\n'),
    coins: { gp: kit.gp },
    spellAbility: info?.spellAbility,
    spellSlots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { max: v, used: 0 }])),
    spells: spellList,
    classFeatures: opts.text && info ? classFeaturesFor(opts.text, info.name, level, b.subclass) : [],
    speciesTraits: opts.text && opts.speciesRules ? speciesTraitsFor(opts.text, opts.speciesRules) : [],
    featList: feats,
    subclass: level >= 3 ? b.subclass : '',
    background: b.background,
    alignment: b.alignment,
    appearance: b.appearance,
    personality: b.personality,
    pronouns: b.pronouns,
    backstory: [
      b.start && `Starts in ${b.start}.`,
      b.hometown && `Hometown: ${b.hometown}.`,
      b.faction && `Ties to ${b.faction}.`,
      b.family && `Family: ${b.family}.`,
      b.rival && `Rival: ${b.rival}.`,
      b.debt && `Owes: ${b.debt}.`,
      b.notes,
    ]
      .filter(Boolean)
      .join('\n'),
    xp: 0,
    deathSaves: { successes: 0, failures: 0 },
    ...(b.portrait ? { portrait: b.portrait } : {}),
  };
  if (hasFeat('Alert')) sheet.initiativeBonus = mod(sheet, 'DEX') + proficiencyBonus(level);
  sheet.ac = armorClass(sheet, b.cls).value;
  const weapons = [...new Set(kit.items.map(itemWeapon).filter((w): w is NonNullable<typeof w> => !!w))];
  sheet.attacks = weapons.map((w) => attackFor(w, sheet, b.cls, level));
  sheet.resources = resourcesFor(b.cls, level, sheet);
  return { name: b.name || 'Unnamed', species: b.people, class_name: info?.name ?? b.cls, level, sheet };
}
