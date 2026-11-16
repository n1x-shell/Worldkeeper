/**
 * The SRD 5.2.1's rules text, as the sheet and builder use it: spells, class and subclass features, species traits,
 * feats. Pure functions only (no browser), so tests and the server can use them too.
 */
import type { Feature } from '../../../../shared/sheet';

/** A background from the world's own tables. */
export interface WorldBackground {
  name: string;
  who: string;
  skills: string;
  tool: string;
  feat: string;
  from: string;
}

export interface SrdSpell {
  name: string;
  level: number;
  school: string;
  classes: string[];
  time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  material: boolean;
  text: string;
}
export interface SrdText {
  classes: Record<string, { features: { level: number; name: string; text: string }[]; subclass: { name: string; about: string; features: { level: number; name: string; text: string }[] } | null }>;
  species: Record<string, { type: string; size: string[]; sizeText: string; speed: number; traits: { name: string; text: string }[] }>;
  feats: Record<string, { category: string; prerequisite: string; text: string }>;
  backgrounds: Record<string, { abilities: string[]; feat: string; skills: string[]; tool: string; equipment: string }>;
}
/** Class features up to a level, from the SRD (the class's own, then its SRD subclass's if that is the subclass). */
export function classFeaturesFor(t: SrdText, cls: string, level: number, subclass?: string): Feature[] {
  const c = t.classes[cls];
  if (!c) return [];
  const own = c.features.filter((f) => f.level <= level).map((f) => ({ name: f.name, source: `${cls} ${f.level}`, text: f.text }));
  const sub =
    c.subclass && subclass && c.subclass.name === subclass ? c.subclass.features.filter((f) => f.level <= level).map((f) => ({ name: f.name, source: `${subclass} ${f.level}`, text: f.text })) : [];
  return [...own, ...sub].sort((a, b) => Number(/\d+$/.exec(a.source)?.[0]) - Number(/\d+$/.exec(b.source)?.[0]));
}
/** A species' traits from the SRD. */
export const speciesTraitsFor = (t: SrdText, species: string): Feature[] => (t.species[species]?.traits ?? []).map((x) => ({ name: x.name, source: species, text: x.text }));
/** A feat's rules text from the SRD, if it is there ("Magic Initiate (Cleric)" finds "Magic Initiate"). */
export function featFor(t: SrdText, name: string): Feature {
  const base = name.replace(/\s*\(.*\)$/, '');
  const f = t.feats[name] ?? t.feats[base];
  return { name, source: f ? `${f.category} feat` : 'Feat', text: f?.text ?? '' };
}
