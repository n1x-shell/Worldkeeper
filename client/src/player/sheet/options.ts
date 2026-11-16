/**
 * Choices for a character sheet and the builder, from the handbook itself: the world's peoples (and which rules each
 * uses), the classes and their subclasses as the world knows them, and the backgrounds. The SRD rules text (spells,
 * class features, species traits, feats) is loaded only when a sheet needs it.
 */
import { useEffect, useState } from 'react';
import type { PEntity } from '../source';
import { CLASSES, SRD_SPECIES } from '../../../../shared/rules2024';
import type { SrdSpell, SrdText, WorldBackground } from './srd';

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
  /** The SRD species whose rules it uses, if it says so ("Use the halfling rules"). */
  rules: string | null;
  /** What the page says to use at the table, in its own words. */
  atTable: string;
  summary: string;
}
export function peoplesFrom(entities: PEntity[]): PeopleOption[] {
  return entities
    .filter((e) => ['people', 'species', 'culture'].includes(e.type))
    .map((e) => {
      const atTable = plain(/\*\*At the table\.\*\*\s*([^\n]+)/.exec(e.summary ?? '')?.[1] ?? '');
      const rules = SRD_SPECIES.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(atTable.replace(/dwarven|elven/gi, (m) => (m.toLowerCase().startsWith('dwarv') ? 'dwarf' : 'elf')))) ?? null;
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
    if (c.srdSubclass && !subs.some((s) => s.name === c.srdSubclass)) subs.unshift({ name: c.srdSubclass, book: 'SRD 5.2.1', known: null });
    return { id: e?.id ?? null, name: c.name, tagline: /^\*([^*\n]+)\*/.exec(e?.summary?.trim() ?? '')?.[1] ?? '', summary: e?.summary ?? '', subclasses: subs };
  });
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
    cached ??= get<PEntity[]>('/api/player/entities', []).then(async (es) => {
      const tables = await Promise.all(es.filter(isBackgroundTable).map((e) => get<PEntity | null>(`/api/player/entities/${encodeURIComponent(e.id)}`, null)));
      return { peoples: peoplesFrom(es), classes: classesFrom(es), backgrounds: backgroundsFrom(tables.filter((x): x is PEntity => !!x)) };
    });
    let live = true;
    void cached.then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
  }, []);
  return opts;
}

let spells: Promise<SrdSpell[]> | null = null;
let text: Promise<SrdText> | null = null;
export const loadSpells = () => (spells ??= import('../../../../shared/srd/spells.json').then((m) => m.default as SrdSpell[]));
export const loadRulesText = () => (text ??= import('../../../../shared/srd/text.json').then((m) => m.default as unknown as SrdText));
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
