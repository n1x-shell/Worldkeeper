/**
 * Choices for a character sheet and the builder, from the handbook itself: the world's peoples (and which rules each
 * uses), the classes and their subclasses as the world knows them, and the backgrounds. The SRD rules text (spells,
 * class features, species traits, feats) is loaded only when a sheet needs it.
 */
import { useEffect, useState } from 'react';
import { playerApiBase, type PEntity } from '../source';
import { CLASSES } from '../../../../shared/rules2024';
import { type SrdText, type WorldBackground } from './srd';
import { addRule, byName, emptyRulesView, rulesSpeciesNames, speciesInRules, srdRulesView, type RuleKind } from '../../../../shared/rulesView';
import { handbookTypesWith } from '../categories';

export * from './srd';

export const plain = (md: string) =>
  md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*+/g, '')
    .trim();

/** "Halflings" → "Halfling", "Elves" → "Elf": a people page names many, a sheet names one. */
export const singular = (n: string) =>
  n
    .replace(/ies$/, 'y')
    .replace(/ves$/, 'f')
    .replace(/([^s])s$/, '$1');

export interface PeopleOption {
  id: string;
  /** The people, as a sheet names one ("Halfling"). */
  name: string;
  plural: string;
  tagline: string;
  /** The species whose rules it uses, if it says so ("Use the halfling rules"): the first named that the rules in use have. */
  rules: string | null;
  /** What the page says to use at the table, in its own words. */
  atTable: string;
  summary: string;
}
/**
 * The peoples players can be, from the handbook's records. A people can name more than one species ("Use the tabaxi
 * rules. Without the book, use the cat-folk rules."): the first the rules in use have is its rules (the book's, where
 * the GM has it; the world's own otherwise).
 */
export function peoplesFrom(entities: PEntity[], species?: Record<string, unknown>): PeopleOption[] {
  return entities
    .filter((e) => handbookTypesWith('folk').includes(e.type))
    .map((e) => {
      const atTable = plain(/\*\*At the table\.\*\*\s*([^\n]+)/.exec(e.summary ?? '')?.[1] ?? '');
      const names = rulesSpeciesNames(atTable);
      const rules = species ? speciesInRules(names, species) : (names[0] ?? null);
      return { id: e.id, name: singular(e.name), plural: e.name, tagline: /^\*([^*\n]+)\*/.exec(e.summary?.trim() ?? '')?.[1] ?? '', rules, atTable, summary: e.summary ?? '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SubclassOption {
  name: string;
  book: string;
  /** What the world calls people of this subclass, if it has a name for them. */
  known: string | null;
}
/** Subclasses from a class page: "- Paths…, … *(PHB 2024)*; … *(Xanathar's)*", with the world's name for each group. */
export function subclassesFrom(summary: string): SubclassOption[] {
  const out: SubclassOption[] = [];
  const list = summary.split('**Subclasses.**')[1] ?? '';
  for (const line of list.split('\n')) {
    if (!line.startsWith('- ') || !line.includes('*(')) continue;
    let rest = line.slice(2);
    let known: string | null = null;
    const label = /^([A-Z][a-z]+s): /.exec(rest);
    if (label) {
      known = label[1].replace(/s$/, '');
      rest = rest.slice(label[0].length);
    }
    for (const seg of rest.split(';')) {
      const m = /(.*?)\s*\*\(([^)]+)\)\*/.exec(seg);
      if (!m) continue;
      for (const n of m[1]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean))
        out.push({ name: n, book: m[2], known });
    }
  }
  return out;
}

export interface ClassOption {
  id: string | null;
  name: string;
  tagline: string;
  summary: string;
  subclasses: SubclassOption[];
}
export function classesFrom(entities: PEntity[]): ClassOption[] {
  return CLASSES.map((c) => {
    const e = entities.find((x) => x.type === 'calling' && x.name === c.name);
    const subs = subclassesFrom(e?.summary ?? '');
    return { id: e?.id ?? null, name: c.name, tagline: /^\*([^*\n]+)\*/.exec(e?.summary?.trim() ?? '')?.[1] ?? '', summary: e?.summary ?? '', subclasses: subs };
  });
}

/** A class's subclasses: the ones its handbook page lists, then any the rules packs have that the page doesn't. */
export function subclassChoices(opt: ClassOption | undefined, rules: SrdText | null, cls: string): SubclassOption[] {
  const listed = opt?.subclasses ?? [];
  const fromRules = Object.values(byName(rules?.classes ?? {}, cls)?.subclasses ?? {})
    .filter((x) => !listed.some((l) => l.name.toLowerCase() === x.name.toLowerCase()))
    .map((x) => ({ name: x.name, book: x.source ?? 'rules pack', known: null }));
  return [...listed, ...fromRules];
}

/** Background rows from the handbook's background tables. */
export function backgroundsFrom(entities: PEntity[]): WorldBackground[] {
  const out: WorldBackground[] = [];
  for (const e of entities) {
    const text = [e.summary, ...(e.sections ?? []).map((s) => s.content)].join('\n');
    const at = text.indexOf('| Background | Who you were |');
    if (at < 0) continue;
    const from = e.name.replace(/ Backgrounds$/, '').replace('Character Options and', 'Kaelmar');
    for (const line of text.slice(at).split('\n').slice(2)) {
      if (!line.startsWith('|')) break;
      const c = line
        .split('|')
        .slice(1, -1)
        .map((x) => plain(x));
      if (c.length >= 5) out.push({ name: c[0], who: c[1], skills: c[2], tool: c[3], feat: c[4], from });
    }
  }
  return out;
}

export interface SheetOptions {
  peoples: PeopleOption[];
  classes: ClassOption[];
  backgrounds: WorldBackground[];
}
/** The handbook pages that hold background tables (read in full: the index may hold only summaries). */
export const isBackgroundTable = (e: PEntity) => /Backgrounds$|^Character Options and Backgrounds$|^Type Builds/.test(e.name);
let cached: Promise<SheetOptions> | null = null;
/** The choices for a sheet's dropdowns, from the player API (the GM server serves it too). */
export function useSheetOptions(): SheetOptions | null {
  const [opts, setOpts] = useState<SheetOptions | null>(null);
  useEffect(() => {
    const get = <T>(url: string, fallback: T) =>
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : fallback))
        .catch(() => fallback);
    cached ??= get<PEntity[]>(`${playerApiBase()}/entities`, []).then(async (es) => {
      const tables = await Promise.all(es.filter(isBackgroundTable).map((e) => get<PEntity | null>(`${playerApiBase()}/entities/${encodeURIComponent(e.id)}`, null)));
      const text = await loadRulesText().catch(() => null);
      return { peoples: peoplesFrom(es, text?.species), classes: classesFrom(es), backgrounds: backgroundsFrom(tables.filter((x): x is PEntity => !!x)) };
    });
    let live = true;
    void cached.then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
  }, []);
  return opts;
}

let rules: Promise<SrdText> | null = null;
let fallback: () => Promise<SrdText> = bundledSrd;
/** The SRD as the app ships it, for the published handbook (which has no server and never has the GM's packs). */
async function bundledSrd(): Promise<SrdText> {
  const [t, sp] = await Promise.all([import('../../../../shared/srd/text.json'), import('../../../../shared/srd/spells.json')]);
  return srdRulesView(t.default, sp.default);
}
/** For the published handbook: what to use when there's no server (the bundled SRD, unless the GM turned it off). */
export function setRulesFallback(srd: () => Promise<boolean>, open: () => Promise<{ kind: string; name: string; cls: string; data: Record<string, unknown>; source: string }[]> = async () => []) {
  fallback = async () => {
    const view = (await srd()) ? await bundledSrd() : emptyRulesView(false);
    // Openly licensed rules the GM published join (and win over) the SRD.
    for (const r of await open()) addRule(view, r.kind as RuleKind, r.name, r.cls, r.data, r.source);
    return view;
  };
}
/** The rules in use: from the GM's server (the SRD and imported packs), or the bundled SRD in the published handbook. */
export const loadRulesText = () =>
  (rules ??= fetch('/api/player/rules')
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<SrdText>) : Promise.reject(new Error('no server'))))
    .catch(() => fallback()));
export const loadSpells = () => loadRulesText().then((v) => v.spells);
/** Forget the loaded rules (after the GM imports or turns off a pack). */
export const reloadRules = () => {
  rules = null;
};
export function useLoaded<T>(load: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, [load]);
  return v;
}

/** Shrink a picture file to a small portrait (WebP, at most `size` pixels on its longer side). */
export async function portraitFromFile(file: File, size = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a picture.'));
      i.src = url;
    });
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
