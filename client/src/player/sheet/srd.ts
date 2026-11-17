/**
 * The rules text the sheet and builder use (spells, class and subclass features, species traits, feats), from the SRD
 * 5.2.1 and the GM's rules packs. Pure functions only (no browser), so tests can use them too.
 */
import type { Feature } from '../../../../shared/sheet';
import { byName, type RuleSpell, type RulesView } from '../../../../shared/rulesView';

/** A background from the world's own tables. */
export interface WorldBackground {
  name: string;
  who: string;
  skills: string;
  tool: string;
  feat: string;
  from: string;
}

export type SrdSpell = RuleSpell;
/** The rules in use: the SRD (unless turned off) and the GM's imported rules packs. */
export type SrdText = RulesView;

/** Class features up to a level: the class's own, then its subclass's, from whichever pack has them. */
export function classFeaturesFor(t: RulesView, cls: string, level: number, subclass?: string): Feature[] {
  const c = byName(t.classes, cls);
  if (!c) return [];
  const own = c.features.filter((f) => f.level <= level).map((f) => ({ name: f.name, source: `${cls} ${f.level}`, text: f.text }));
  const sc = byName(c.subclasses, subclass);
  const sub = sc ? sc.features.filter((f) => f.level <= level).map((f) => ({ name: f.name, source: `${sc.name} ${f.level}`, text: f.text })) : [];
  return [...own, ...sub].sort((a, b) => Number(/\d+$/.exec(a.source)?.[0]) - Number(/\d+$/.exec(b.source)?.[0]));
}
/** Whether the rules have a class's features (and the subclass's, if one is named). */
export const hasClassRules = (t: RulesView, cls: string) => !!byName(t.classes, cls)?.features.length;
/** A species' traits. */
export const speciesTraitsFor = (t: RulesView, species: string): Feature[] => (byName(t.species, species)?.traits ?? []).map((x) => ({ name: x.name, source: species, text: x.text }));
/** A feat's rules text, if a pack has it ("Magic Initiate (Cleric)" finds "Magic Initiate"). */
export function featFor(t: RulesView, name: string): Feature {
  const f = byName(t.feats, name) ?? byName(t.feats, name.replace(/\s*\(.*\)$/, ''));
  return { name, source: f ? `${f.category || 'Feat'}${f.category ? ' feat' : ''}` : 'Feat', text: f?.text ?? '' };
}

export { rulesSpeciesName } from '../../../../shared/rulesView';
