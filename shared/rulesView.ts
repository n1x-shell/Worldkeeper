/**
 * The rules a character sheet and builder can draw on, merged from every enabled rules pack: the built-in SRD 5.2.1
 * and any packs the GM imported (see docs/RULES_PACKS.md). Pure data and functions, used by the server and the client.
 */

export interface RuleFeature {
  level: number;
  name: string;
  text: string;
}
export interface RuleSpell {
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
  source?: string;
}
export interface RuleSubclass {
  name: string;
  about: string;
  features: RuleFeature[];
  source?: string;
}
export interface RuleSpecies {
  type: string;
  size: string[];
  sizeText: string;
  speed: number;
  traits: { name: string; text: string }[];
  source?: string;
}
export interface RuleFeat {
  category: string;
  prerequisite: string;
  text: string;
  source?: string;
}
export interface RuleBackground {
  abilities: string[];
  feat: string;
  skills: string[];
  tool: string;
  equipment: string;
  text?: string;
  source?: string;
}
export interface RulesView {
  /** Whether the built-in SRD is in use. */
  srd: boolean;
  /** The imported packs in use. */
  packs: { id: string; name: string; source: string }[];
  spells: RuleSpell[];
  classes: Record<string, { features: RuleFeature[]; subclasses: Record<string, RuleSubclass> }>;
  species: Record<string, RuleSpecies>;
  feats: Record<string, RuleFeat>;
  backgrounds: Record<string, RuleBackground>;
}

export const emptyRulesView = (srd = false): RulesView => ({ srd, packs: [], spells: [], classes: {}, species: {}, feats: {}, backgrounds: {} });

/** The SRD's data (shared/srd/text.json and spells.json) as a rules view. */
export function srdRulesView(text: unknown, spells: unknown): RulesView {
  const t = text as {
    classes: Record<string, { features: RuleFeature[]; subclass: RuleSubclass | null }>;
    species: Record<string, RuleSpecies>;
    feats: Record<string, RuleFeat>;
    backgrounds: Record<string, RuleBackground>;
  };
  const source = 'SRD 5.2.1';
  const view = emptyRulesView(true);
  view.spells = (spells as RuleSpell[]).map((s) => ({ ...s, source }));
  for (const [c, v] of Object.entries(t.classes)) view.classes[c] = { features: v.features, subclasses: v.subclass ? { [v.subclass.name]: { ...v.subclass, source } } : {} };
  for (const [n, v] of Object.entries(t.species)) view.species[n] = { ...v, source };
  for (const [n, v] of Object.entries(t.feats)) view.feats[n] = { ...v, source };
  for (const [n, v] of Object.entries(t.backgrounds)) view.backgrounds[n] = { ...v, source };
  return view;
}

export type RuleKind = 'spell' | 'species' | 'class' | 'subclass' | 'background' | 'feat';
/** Add one pack entry to a view, replacing anything of the same name. */
export function addRule(view: RulesView, kind: RuleKind, name: string, cls: string, data: Record<string, unknown>, source: string) {
  const d = { ...data, source } as never;
  if (kind === 'spell') view.spells = [...view.spells.filter((s) => s.name.toLowerCase() !== name.toLowerCase()), d];
  else if (kind === 'species') view.species[name] = d;
  else if (kind === 'feat') view.feats[name] = d;
  else if (kind === 'background') view.backgrounds[name] = d;
  else if (kind === 'class') view.classes[name] = { features: (data as { features: RuleFeature[] }).features, subclasses: view.classes[name]?.subclasses ?? {} };
  else {
    view.classes[cls] ??= { features: [], subclasses: {} };
    view.classes[cls].subclasses[name] = d;
  }
}

/** Look a name up regardless of case ("sea elf" finds "Sea Elf"). */
export function byName<T>(rec: Record<string, T>, name: string | null | undefined): T | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const k = Object.keys(rec).find((x) => x.toLowerCase() === n);
  return k ? rec[k] : undefined;
}
