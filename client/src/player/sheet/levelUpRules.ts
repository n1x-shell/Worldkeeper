/**
 * Taking a level (v0.9.6): what a level gives a character, and the sheet with it taken. Pure functions (no browser),
 * so tests use them too. The sheet stays the player's to edit afterwards: this only saves the arithmetic and the
 * looking-up, and never removes anything a player wrote.
 */
import { ABILITIES, mod, type Ability, type Feature, type Sheet, type SheetChar, type SheetResource } from '../../../../shared/sheet';
import { armorClass, attackFor, classInfo, featLevels, masteryCount, resourcesFor, spellCounts, spellSlotsFor, weaponInfo } from '../../../../shared/rules2024';
import { proficiencyBonus } from '../../../../shared/play';
import { byName, type RulesView } from '../../../../shared/rulesView';
import { featFor } from './srd';

export interface LevelGain {
  level: number;
  hitDie: number;
  conMod: number;
  /** Hit points this level gives with the fixed value: half the Hit Die plus 1, plus Constitution (at least 1). */
  hpAverage: number;
  /** Extra hit points each level from what the character already has (a Dwarf's toughness, the Tough feat). */
  hpExtra: number;
  proficiency: { from: number; to: number };
  /** The class's features at this level, and the subclass's if the character has one. */
  features: Feature[];
  /** The subclasses to choose from, when this is the level a subclass is chosen and the character has none. */
  subclasses: string[] | null;
  /** An Ability Score Improvement (or another feat) at this level; an Epic Boon at level 19. */
  improvement: 'asi' | 'boon' | null;
  /** Feats that could be taken instead of raising ability scores. */
  feats: string[];
  slots: { from: Record<string, number>; to: Record<string, number> };
  cantrips: { from: number; to: number };
  prepared: { from: number; to: number };
  masteries: { from: number; to: number };
  /** Uses that come back on a rest, as they are at this level. */
  resources: SheetResource[];
  /** False when the rules in use don't have this class: only the level's arithmetic can be offered. */
  known: boolean;
}

export interface LevelChoices {
  /** Hit points gained: the fixed value, or what the player rolled (Constitution and extras already added). */
  hp: number;
  subclass?: string;
  /** Two +1s (the same ability twice for +2), when raising ability scores. */
  abilities?: (Ability | '')[];
  /** A feat taken instead. */
  feat?: string;
}

const featNames = (s: Sheet) => (s.featList ?? []).map((f) => f.name.toLowerCase());
const hasTough = (s: Sheet) => featNames(s).some((n) => n.startsWith('tough'));
const extraPerLevel = (s: Sheet, speciesRules: string | null) => (speciesRules === 'Dwarf' ? 1 : 0) + (hasTough(s) ? 2 : 0);
const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(a) === JSON.stringify(b);

/** Features a class and subclass give at exactly one level. */
function featuresAt(rules: RulesView | null, cls: string, level: number, subclass: string | undefined): Feature[] {
  const c = rules ? byName(rules.classes, cls) : undefined;
  if (!c) return [];
  const own = c.features.filter((f) => f.level === level).map((f) => ({ name: f.name, source: `${cls} ${f.level}`, text: f.text }));
  const sc = byName(c.subclasses, subclass);
  return [...own, ...(sc ? sc.features.filter((f) => f.level === level).map((f) => ({ name: f.name, source: `${sc.name} ${f.level}`, text: f.text })) : [])];
}

/** What reaching `level` gives this character. */
export function levelGain(char: SheetChar, level: number, rules: RulesView | null, speciesRules: string | null = null): LevelGain {
  const s = char.sheet;
  const info = classInfo(char.class_name);
  const cls = info?.name ?? char.class_name;
  const hitDie = info?.hitDie ?? (Number(/\d+/.exec(s.hitDie ?? '')?.[0]) || 8);
  const conMod = mod(s, 'CON');
  const hpExtra = extraPerLevel(s, speciesRules);
  const c = rules ? byName(rules.classes, cls) : undefined;
  const improvement = featLevels(cls).includes(level) ? (level === 19 ? 'boon' : 'asi') : null;
  const feats = !rules || !improvement ? [] : Object.entries(rules.feats).filter(([name, f]) => name !== 'Ability Score Improvement' && (improvement === 'boon' ? f.category === 'Epic Boon' : f.category === 'General' || f.category === 'Origin'));
  // A subclass is chosen at the level its first features come (3 in the 2024 rules).
  const subLevel = Math.min(3, ...Object.values(c?.subclasses ?? {}).flatMap((sc) => sc.features.map((f) => f.level)));
  return {
    level,
    hitDie,
    conMod,
    hpAverage: Math.max(1, hitDie / 2 + 1 + conMod) + hpExtra,
    hpExtra,
    proficiency: { from: proficiencyBonus(level - 1), to: proficiencyBonus(level) },
    features: featuresAt(rules, cls, level, s.subclass),
    subclasses: c && !s.subclass && level >= subLevel && Object.keys(c.subclasses).length ? Object.keys(c.subclasses).sort() : null,
    improvement,
    feats: feats.map(([name]) => name).sort(),
    slots: { from: spellSlotsFor(cls, level - 1), to: spellSlotsFor(cls, level) },
    cantrips: { from: spellCounts(cls, level - 1).cantrips, to: spellCounts(cls, level).cantrips },
    prepared: { from: spellCounts(cls, level - 1).prepared, to: spellCounts(cls, level).prepared },
    masteries: { from: masteryCount(cls, level - 1), to: masteryCount(cls, level) },
    resources: resourcesFor(cls, level, s),
    known: !!info,
  };
}

/** The lines a player reads before taking the level: only what changes. */
export function gainSummary(g: LevelGain): string[] {
  const out: string[] = [];
  if (g.proficiency.to !== g.proficiency.from) out.push(`Proficiency Bonus rises to +${g.proficiency.to}.`);
  if (!same(g.slots.from, g.slots.to)) out.push(`Spell slots: ${Object.entries(g.slots.to).map(([l, n]) => `${n} of level ${l}`).join(', ')}.`);
  if (g.cantrips.to > g.cantrips.from) out.push(`You know ${g.cantrips.to} cantrips (${g.cantrips.to - g.cantrips.from} more): choose on the Spells tab.`);
  if (g.prepared.to > g.prepared.from) out.push(`You can prepare ${g.prepared.to} spells (${g.prepared.to - g.prepared.from} more): choose on the Spells tab.`);
  if (g.masteries.to > g.masteries.from) out.push(`Weapon Mastery with ${g.masteries.to} kinds of weapon (${g.masteries.to - g.masteries.from} more): choose on the Combat tab.`);
  return out;
}

/**
 * The sheet with the level taken. `before` is the character as it was (at the level below); what the sheet worked out
 * for it (Armor Class, a weapon's attack) is worked out again only where the player hadn't changed it.
 */
export function takeLevel(before: SheetChar, gain: LevelGain, choices: LevelChoices, rules: RulesView | null, speciesRules: string | null = null): Sheet {
  const old = before.sheet;
  const cls = classInfo(before.class_name)?.name ?? before.class_name;
  const level = gain.level;
  const s: Sheet = { ...old };

  // Ability scores, or a feat.
  if (gain.improvement && !choices.feat) {
    const abilities = { ...Object.fromEntries(ABILITIES.map((a) => [a, 10])), ...old.abilities };
    for (const a of choices.abilities ?? []) if (a) abilities[a] = Math.min(20, abilities[a] + 1);
    s.abilities = abilities;
  }
  if (gain.improvement && choices.feat) {
    const feat = rules ? featFor(rules, choices.feat) : { name: choices.feat, source: 'Feat', text: '' };
    if (!(old.featList ?? []).some((f) => f.name === feat.name)) s.featList = [...(old.featList ?? []), feat];
  }

  // Hit points: this level's, and one more for each earlier level where Constitution's modifier or Tough changed that.
  const conRise = mod(s, 'CON') - mod(old, 'CON');
  const extraRise = extraPerLevel(s, speciesRules) - extraPerLevel(old, speciesRules);
  const hp = Math.max(1, Math.round(choices.hp)) + conRise * level + extraRise * level;
  if (old.maxHp !== undefined) s.maxHp = old.maxHp + hp;
  if (old.hp !== undefined) s.hp = old.hp + hp;

  // The subclass, and the features: this level's, and a new subclass's from the levels before.
  const subclass = choices.subclass || old.subclass;
  if (subclass) s.subclass = subclass;
  const c = rules ? byName(rules.classes, cls) : undefined;
  const sc = c ? byName(c.subclasses, subclass) : undefined;
  const earlier = choices.subclass && sc ? sc.features.filter((f) => f.level < level).map((f) => ({ name: f.name, source: `${sc.name} ${f.level}`, text: f.text })) : [];
  const features = [...earlier, ...featuresAt(rules, cls, level, subclass)];
  const have = old.classFeatures ?? [];
  s.classFeatures = [...have, ...features.filter((f) => !have.some((h) => h.name === f.name && h.source === f.source))];

  // Spell slots and rest uses: the new numbers, keeping what's spent. Ones the player added stay.
  const slots = spellSlotsFor(cls, level);
  if (Object.keys(slots).length) s.spellSlots = Object.fromEntries(Object.entries(slots).map(([k, max]) => [k, { max, used: Math.min(max, old.spellSlots?.[k]?.used ?? 0) }]));
  const now = resourcesFor(cls, level, s);
  const kept = (old.resources ?? []).filter((r) => !now.some((n) => n.name === r.name));
  s.resources = [...now.map((n) => ({ ...n, used: Math.min(n.max, old.resources?.find((r) => r.name === n.name)?.used ?? 0) })), ...kept];

  // What the sheet worked out, where the player left it as worked out.
  if (old.ac !== undefined && old.ac === armorClass(old, cls).value) s.ac = armorClass(s, cls).value;
  if (old.initiativeBonus !== undefined && old.initiativeBonus === mod(old, 'DEX') + proficiencyBonus(level - 1)) s.initiativeBonus = mod(s, 'DEX') + proficiencyBonus(level);
  s.attacks = (old.attacks ?? []).map((a) => {
    const w = weaponInfo(a.name);
    if (!w) return a;
    const was = attackFor(w, old, cls, level - 1);
    return was.bonus === a.bonus && was.damage === a.damage ? { ...a, ...attackFor(w, s, cls, level), notes: a.notes } : a;
  });

  s.builtLevel = level;
  return s;
}
