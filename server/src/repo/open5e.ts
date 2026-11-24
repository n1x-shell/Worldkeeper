/**
 * Open content from Open5e (api.open5e.com): openly licensed fifth-edition material such as Level Up Advanced 5th
 * Edition, Kobold Press's Black Flag SRD and Tome of Beasts. The GM chooses sources; each comes in as its own rules
 * pack (creatures, magic items, gear, spells, feats and backgrounds), named with its publisher and licence, and kept in
 * the GM's library like any other pack (see docs/RULES_PACKS.md). Nothing from Open5e is part of the app.
 */
import { saveRulesPack } from './sharedRules.js';
import type Database from 'better-sqlite3';
import { badRequest } from '../lib/errors.js';
import { listPacks } from './rulesPacks.js';
import { XP_BY_CR } from './fivetools.js';

type DB = Database.Database;
type J = Record<string, any>;
export type Fetcher = (url: string) => Promise<J>;

export const OPEN5E = 'https://api.open5e.com/v2';
const defaultFetch: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw badRequest(`Open5e answered ${r.status}. Try again later.`);
  return (await r.json()) as J;
};

const LICENCES: Record<string, string> = { 'cc-by-40': 'CC BY 4.0', 'ogl-10a': 'OGL 1.0a', cc0: 'CC0', orc: 'ORC' };
export interface Open5eDocument {
  key: string;
  name: string;
  publisher: string;
  licences: string[];
  system: string;
  permalink: string;
  /** Already in the app: the SRD 5.2 is built in. */
  builtIn: boolean;
}

/** Every source Open5e offers, with its licences. */
export async function open5eDocuments(get: Fetcher = defaultFetch): Promise<Open5eDocument[]> {
  const out: Open5eDocument[] = [];
  for await (const d of pages(get, `${OPEN5E}/documents/?limit=100&format=json`))
    out.push({
      key: d.key,
      name: d.name,
      publisher: d.publisher?.name ?? (typeof d.publisher === 'string' ? d.publisher : ''),
      licences: ((d.licenses ?? []) as unknown[]).map((l) => (typeof l === 'string' ? l : ((l as J).key ?? (l as J).name))).map((k: string) => LICENCES[k] ?? k),
      system: d.gamesystem?.name ?? '',
      permalink: d.permalink ?? '',
      builtIn: d.key === 'srd-2024',
    });
  return out.filter((d) => d.licences.length);
}

async function* pages(get: Fetcher, first: string) {
  let url: string | null = first;
  for (let guard = 0; url && guard < 200; guard++) {
    const page: J = await get(url);
    for (const x of (page.results as J[]) ?? []) yield x;
    url = page.next ?? null;
  }
}
async function all(get: Fetcher, kind: string, doc: string) {
  const out: J[] = [];
  for await (const x of pages(get, `${OPEN5E}/${kind}/?document__key__in=${encodeURIComponent(doc)}&limit=100&format=json`)) out.push(x);
  return out;
}

// ---------------------------------------------------------------- converters
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** "cold, necrotic; bludgeoning from nonmagical attacks" → "Cold, Necrotic; Bludgeoning from nonmagical attacks". */
const capList = (s: string) => s.replace(/(^|[,;]\s*)([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase());
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const crText = (cr: number) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));
const pbFor = (cr: number) => (cr >= 29 ? 9 : cr >= 25 ? 8 : cr >= 21 ? 7 : cr >= 17 ? 6 : cr >= 13 ? 5 : cr >= 9 ? 4 : cr >= 5 ? 3 : 2);
const AB = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBR = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
/** Open5e's environments in the terms the encounter generator uses. */
const ENV: Record<string, string> = {
  coast: 'coastal',
  hills: 'hill',
  caves: 'underdark',
  underworld: 'underdark',
  ocean: 'underwater',
  lake: 'coastal',
  ruins: 'urban',
  sewer: 'urban',
  temple: 'urban',
  tomb: 'underdark',
  tob_badlands: 'desert',
  shadowfell: 'planar, shadowfell',
  'srd_ethereal-plane': 'planar, ethereal',
  'srd_astral-plane': 'planar, astral',
  srd_feywild: 'planar, feywild',
  srd_abyss: 'planar, abyss',
  srd_hell: 'planar, nine hells',
  srd_elysium: 'planar, upper',
  'srd_plane-of-air': 'planar, air',
  'srd_plane-of-earth': 'planar, earth',
  'srd_plane-of-fire': 'planar, fire',
  'srd_plane-of-water': 'planar, water',
};
/** Open5e text is Markdown: keep it readable as plain text. */
const md = (s: unknown) =>
  String(s ?? '')
    .replace(/\r/g, '')
    .replace(/\*\*\*?([^*]+)\*\*\*?/g, '$1')
    .replace(/(^|\s)_([^_]+)_/g, '$1$2')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export function creatureFrom(c: J, doc: string): J {
  const cr = Number(c.challenge_rating ?? 0);
  const ab = AB.map((a) => Number(c.ability_scores?.[a] ?? 10));
  const mods = AB.map((a, i) => Number(c.modifiers?.[a] ?? Math.floor((ab[i] - 10) / 2)));
  const saves = Object.entries((c.saving_throws ?? {}) as Record<string, number>).map(([a, v]) => `${ABBR[AB.indexOf(a)] ?? cap(a)} ${signed(v)}`);
  const skills = Object.entries((c.skill_bonuses ?? {}) as Record<string, number>).map(([s, v]) => `${cap(s.replace(/_/g, ' ')).replace(/ Of /g, ' of ')} ${signed(v)}`);
  const sp = (c.speed ?? {}) as J;
  const speed = [`${sp.walk ?? 0} ft.`, ...['burrow', 'climb', 'fly', 'swim'].filter((k) => sp[k]).map((k) => `${cap(k)} ${sp[k]} ft.${k === 'fly' && sp.hover ? ' (hover)' : ''}`)].join(', ');
  const senses = [
    ...['blindsight', 'darkvision', 'tremorsense', 'truesight'].filter((k) => c[`${k}_range`]).map((k) => `${cap(k)} ${c[`${k}_range`]} ft.`),
    `Passive Perception ${c.passive_perception ?? 10 + mods[4]}`,
  ].join(', ');
  const ri = (c.resistances_and_immunities ?? {}) as J;
  const imm = [ri.damage_immunities_display, ri.condition_immunities_display]
    .filter(Boolean)
    .map((x: string) => capList(x))
    .join('; ');
  const groups: Record<string, J[]> = { traits: [], actions: [], bonus: [], reactions: [], legendary: [] };
  for (const t of (c.traits ?? []) as J[]) groups.traits.push({ name: t.name, text: md(t.desc) });
  const where: Record<string, string> = { ACTION: 'actions', BONUS_ACTION: 'bonus', REACTION: 'reactions', LEGENDARY_ACTION: 'legendary', LAIR_ACTION: 'legendary', MYTHIC_ACTION: 'legendary' };
  for (const a of [...((c.actions ?? []) as J[])].sort((x, y) => (x.order_in_statblock ?? 0) - (y.order_in_statblock ?? 0))) {
    const u = a.usage_limits as J | null;
    const limit = u?.type === 'PER_DAY' ? ` (${u.param}/Day)` : u?.type === 'RECHARGE_ON_ROLL' ? ` (Recharge ${u.param}${u.param < 6 ? '–6' : ''})` : '';
    const cost = a.action_type === 'LEGENDARY_ACTION' && a.legendary_action_cost > 1 ? ` (Costs ${a.legendary_action_cost} Actions)` : '';
    groups[where[a.action_type] ?? 'actions'].push({ name: `${a.name}${limit}${cost}`, text: md(a.desc) });
  }
  if (groups.legendary.length && !c.legendary_desc) groups.legendary.unshift({ name: '', text: `Legendary Action Uses: ${c.legendary_action_count ?? 3}.` });
  else if (c.legendary_desc) groups.legendary.unshift({ name: '', text: md(c.legendary_desc) });
  const crs = crText(cr);
  return {
    id: `open5e:${c.key}`,
    name: c.name,
    meta: `${c.size?.name ?? 'Medium'} ${c.type?.name ?? 'Creature'}${c.subcategory ? ` (${c.subcategory})` : ''}${c.alignment ? `, ${cap(c.alignment)}` : ''}`,
    kind: 'creature',
    ac: c.armor_class,
    hp: `${c.hit_points}${c.hit_dice ? ` (${c.hit_dice})` : ''}`,
    hpAvg: c.hit_points,
    init: c.initiative_bonus ?? mods[1],
    speed,
    ab,
    cr: crs,
    xp: c.experience_points ?? XP_BY_CR[crs],
    pb: c.proficiency_bonus ?? pbFor(cr),
    saves: saves.join(', '),
    skills: skills.join(', '),
    vuln: capList(ri.damage_vulnerabilities_display ?? ''),
    res: capList(ri.damage_resistances_display ?? ''),
    imm,
    gear: '',
    senses,
    languages: c.languages?.as_string || 'None',
    ...groups,
    environment: ((c.environments ?? []) as J[]).map((e) => ENV[e.key] ?? e.key).filter((e: string) => e && !e.startsWith('srd_')),
    source: doc,
  };
}

const RARITY: Record<string, string> = { common: 'common', uncommon: 'uncommon', rare: 'rare', 'very-rare': 'very rare', 'very rare': 'very rare', legendary: 'legendary', artifact: 'artifact' };
export function itemFrom(i: J, doc: string, magic: boolean): J {
  const w = i.weapon as J | null;
  const a = i.armor as J | null;
  const stats = w
    ? `${cap(String(w.is_simple ? 'simple' : 'martial'))} weapon. ${w.damage_dice ?? ''} ${cap(w.damage_type?.name ?? '')} damage.${
        (w.properties ?? []).length
          ? ` ${(w.properties as J[])
              .map((p) => p.property?.name ?? p.name)
              .filter(Boolean)
              .join(', ')}.`
          : ''
      }`
    : a
      ? `AC ${a.ac_display ?? a.ac_base}.${a.strength_score_required ? ` Strength ${a.strength_score_required} needed.` : ''}${a.grants_stealth_disadvantage ? ' Disadvantage on Stealth.' : ''}`
      : '';
  const rarity = RARITY[String(i.rarity?.key ?? i.rarity?.name ?? '').toLowerCase()] ?? '';
  const att = i.requires_attunement ? `requires attunement${i.attunement_detail ? ` ${String(i.attunement_detail).replace(/^requires attunement\s*/i, '')}` : ''}` : '';
  const cost = Number(i.cost ?? 0);
  return {
    name: i.name,
    type: i.category?.name ?? (magic ? 'Wondrous Item' : 'Gear'),
    rarity,
    attunement: att,
    magic: magic && !!rarity,
    value: cost > 0 ? cost : null,
    weight: Number(i.weight ?? 0) || null,
    text: [stats, md(i.desc)].filter(Boolean).join('\n\n'),
    tables: [],
    source: doc,
  };
}

export function spellFrom(s: J, doc: string): J {
  const comps = [s.verbal && 'V', s.somatic && 'S', s.material && `M${s.material_specified ? ` (${s.material_specified})` : ''}`].filter(Boolean).join(', ');
  return {
    name: s.name,
    level: Number(s.level ?? 0),
    school: s.school?.name ?? '',
    classes: ((s.classes ?? []) as J[]).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean),
    time: `${cap(String(s.casting_time ?? '').replace(/_/g, ' '))}${s.ritual ? ' or Ritual' : ''}`,
    range: s.range_text ?? (s.range ? `${s.range} ${s.range_unit ?? 'feet'}` : ''),
    components: comps,
    duration: `${s.concentration ? 'Concentration, up to ' : ''}${s.duration ?? ''}`,
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    material: !!s.material,
    text: [md(s.desc), s.higher_level ? `At Higher Levels. ${md(s.higher_level)}` : ''].filter(Boolean).join('\n\n'),
    source: doc,
  };
}

export function featFrom(f: J, doc: string): J {
  const benefits = ((f.benefits ?? []) as J[]).map((b) => `• ${md(b.desc)}`).join('\n');
  const cat: Record<string, string> = { GENERAL: 'General', ORIGIN: 'Origin', FIGHTING_STYLE: 'Fighting Style', EPIC_BOON: 'Epic Boon' };
  return { category: cat[f.type] ?? cap(String(f.type ?? 'General').toLowerCase()), prerequisite: f.prerequisite ?? '', text: [md(f.desc), benefits].filter(Boolean).join('\n'), source: doc };
}

export function backgroundFrom(b: J, doc: string): J {
  const ben = (type: string) => ((b.benefits ?? []) as J[]).find((x) => x.type === type)?.desc ?? '';
  const abilities = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'].filter((a) => new RegExp(`\\b${a}\\b`).test(ben('ability_score')));
  return {
    abilities,
    feat: md(ben('feat')),
    skills: md(ben('skill_proficiency'))
      .split(/,| and /)
      .map((x) => x.replace(/\.$/, '').trim())
      .filter(Boolean),
    tool: md(ben('tool_proficiency')),
    equipment: md(ben('equipment')),
    text: [md(b.desc), ...((b.benefits ?? []) as J[]).map((x) => `${x.name}. ${md(x.desc)}`)].filter(Boolean).join('\n\n'),
    source: doc,
  };
}

/** Import the chosen sources, each as its own pack ("open5e-<key>"); importing a source again replaces its pack. */
export async function importOpen5e(db: DB, keys: string[], get: Fetcher = defaultFetch) {
  const docs = await open5eDocuments(get);
  const chosen = docs.filter((d) => keys.includes(d.key) && !d.builtIn);
  if (!chosen.length) throw badRequest('Choose at least one source (the SRD 5.2 is already built in).');
  const results: { key: string; name: string; counts: Record<string, number> }[] = [];
  for (const d of chosen) {
    const cite = `${d.name} (${d.publisher}, ${d.licences.join(' or ')})`;
    const entries: { kind: string; name: string; cls: string; data: J }[] = [];
    for (const c of await all(get, 'creatures', d.key)) entries.push({ kind: 'creature', name: c.name, cls: '', data: creatureFrom(c, cite) });
    for (const i of await all(get, 'magicitems', d.key)) entries.push({ kind: 'item', name: i.name, cls: '', data: itemFrom(i, cite, true) });
    for (const i of await all(get, 'items', d.key)) entries.push({ kind: 'item', name: i.name, cls: '', data: itemFrom(i, cite, false) });
    for (const s of await all(get, 'spells', d.key)) entries.push({ kind: 'spell', name: s.name, cls: '', data: spellFrom(s, cite) });
    for (const f of await all(get, 'feats', d.key)) entries.push({ kind: 'feat', name: f.name, cls: '', data: featFrom(f, cite) });
    for (const b of await all(get, 'backgrounds', d.key)) entries.push({ kind: 'background', name: b.name, cls: '', data: backgroundFrom(b, cite) });
    const id = `open5e-${d.key}`;
    saveRulesPack(db, { id, name: d.name, source: `${d.publisher}, ${d.licences.join(' or ')}, from Open5e` }, entries);
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    results.push({ key: d.key, name: d.name, counts });
  }
  return { packs: listPacks(db), results };
}
