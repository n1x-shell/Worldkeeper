/**
 * Import rules from a copy of the 5etools data (the GM's own, never part of this repository): spells, species,
 * classes and subclasses, backgrounds and feats from the books the GM owns, turned into one private rules pack.
 *
 * Only the books in BOOKS come in. A species from another book comes in only when a people page in the world names
 * it ("Use the half-orc rules"), and is marked as an older printing. 5etools' own formatting tags are turned into
 * plain text. Like every rules pack, the result stays in the GM's library and is never published or exported.
 */
import AdmZip from 'adm-zip';
import type Database from 'better-sqlite3';
import { badRequest } from '../lib/errors.js';
import { rulesSpeciesName } from '../../../shared/rulesView.js';
import { listPacks } from './rulesPacks.js';

type DB = Database.Database;
type J = Record<string, unknown>;

/** The books to take, newest printings first (an earlier book here wins a clash of names). */
export const BOOKS: Record<string, string> = {
  XPHB: "Player's Handbook (2024)",
  XDMG: "Dungeon Master's Guide (2024)",
  XMM: 'Monster Manual (2025)',
  EFA: 'Eberron: Forge of the Artificer',
  MPMM: 'Monsters of the Multiverse',
  AAG: "Spelljammer: Astral Adventurer's Guide",
  TCE: "Tasha's Cauldron of Everything",
  XGE: "Xanathar's Guide to Everything",
};
const ORDER = Object.keys(BOOKS);
const rank = (src: string) => (ORDER.includes(src) ? ORDER.indexOf(src) : 100);
/** For species the world asks for that none of the books have: older printings, best first. */
const LEGACY_ORDER = ['PHB', 'VGM', 'ERLW', 'MTF', 'EGW', 'MOT', 'GGR', 'VRGR', 'FTD', 'SCAG', 'EEPC', 'DMG'];
const legacyRank = (src: string) => (LEGACY_ORDER.includes(src) ? LEGACY_ORDER.indexOf(src) : 50);
/** Your books first, then older printings. */
const score = (src: string) => (src in BOOKS ? rank(src) : 100 + legacyRank(src));
const cite = (o: J) => `${BOOKS[o.source as string] ?? (o.source as string)}${o.page ? ` p. ${o.page}` : ''}`;

// ---------------------------------------------------------------- text
const TAG = /\{@(\w+)\s*([^{}]*?)\}/g;
/** 5etools inline tags to plain text: {@spell fireball|XPHB} → fireball; {@dc 15} → DC 15; {@hit 4} → +4. */
export function plainTags(s: string): string {
  let out = s;
  for (let i = 0; i < 4 && out.includes('{@'); i++)
    out = out.replace(TAG, (_m, tag: string, body: string) => {
      const parts = body.split('|');
      const text = parts[0];
      switch (tag) {
        case 'dc':
          return `DC ${text}`;
        case 'hit':
          return /^[+-]/.test(text) ? text : `+${text}`;
        case 'h':
          return 'Hit: ';
        case 'atk':
        case 'atkr':
          return text.includes('r') && text.includes('m') ? 'Melee or Ranged Attack Roll:' : text.includes('r') ? 'Ranged Attack Roll:' : 'Melee Attack Roll:';
        case 'recharge':
          return text ? `(Recharge ${text}${text === '6' ? '' : '-6'})` : '(Recharge 6)';
        case 'chance':
          return `${text} percent`;
        case 'actSave':
          return `${text.toUpperCase()} Saving Throw:`;
        case 'actSaveFail':
          return 'Failure:';
        case 'actSaveSuccess':
          return 'Success:';
        case 'actSaveSuccessOrFail':
          return 'Failure or Success:';
        case 'actTrigger':
          return 'Trigger:';
        case 'actResponse':
          return 'Response:';
        case 'note':
        case 'b':
        case 'i':
        case 'bold':
        case 'italic':
          return text;
        case 'filter':
        case 'book':
        case 'adventure':
        case 'link':
        case '5etools':
        case 'footnote':
          return text;
        default:
          // Links show their display text if they have one (the third part), else the name.
          return parts.length >= 3 && parts[2] ? parts[2] : text;
      }
    });
  return out.replace(/\s+/g, ' ').trim();
}

/** 5etools entries (strings, named sections, lists, tables...) to plain paragraphs. */
export function renderEntries(entries: unknown, out: string[] = []): string[] {
  const list = Array.isArray(entries) ? entries : entries == null ? [] : [entries];
  for (const e of list) {
    if (typeof e === 'string') {
      out.push(plainTags(e));
      continue;
    }
    if (!e || typeof e !== 'object') continue;
    const o = e as J;
    const type = (o.type as string) ?? 'entries';
    if (type.startsWith('ref')) continue; // references to features listed on their own
    if (type === 'list') {
      for (const it of (o.items as unknown[]) ?? []) {
        if (typeof it === 'string') out.push(`• ${plainTags(it)}`);
        else {
          const io = it as J;
          const body = renderEntries(io.entries ?? io.entry ?? [], []).join(' ');
          out.push(`• ${io.name ? `${label(io.name as string)} ` : ''}${body}`);
        }
      }
      continue;
    }
    if (type === 'table') {
      if (o.caption) out.push(plainTags(o.caption as string));
      const cols = ((o.colLabels as string[]) ?? []).map(plainTags);
      if (cols.length) out.push(cols.join(' | '));
      for (const row of (o.rows as unknown[][]) ?? []) {
        const cells = (Array.isArray(row) ? row : (((row as J).row as unknown[]) ?? [])).map((c) =>
          typeof c === 'string' ? plainTags(c) : typeof c === 'number' ? String(c) : renderEntries(c, []).join(' ') || cellText(c as J),
        );
        out.push(cells.join(' | '));
      }
      continue;
    }
    if (type === 'item' || type === 'itemSub') {
      out.push(`${o.name ? `${label(o.name as string)} ` : ''}${renderEntries(o.entries ?? o.entry ?? [], []).join(' ')}`);
      continue;
    }
    const inner = renderEntries(o.entries ?? o.entry ?? o.items ?? [], []);
    if (o.name && inner.length) inner[0] = `${label(o.name as string)} ${inner[0]}`;
    else if (o.name) inner.unshift(plainTags(o.name as string));
    out.push(...inner);
  }
  return out;
}
/** A run-in heading: "Feat:" stays as it is, "Rage" becomes "Rage." */
const label = (name: string) => {
  const n = plainTags(name);
  return /[.:!?]$/.test(n) ? n : `${n}.`;
};
function cellText(c: J): string {
  if (c?.type === 'cell') {
    const r = c.roll as J | undefined;
    if (r) return r.exact != null ? String(r.exact) : `${r.min}-${r.max}`;
  }
  return '';
}
const text = (entries: unknown) => renderEntries(entries).join('\n\n');

// ---------------------------------------------------------------- reading
function openData(buf: Buffer) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw badRequest('That file is not a zip.');
  }
  const races = zip.getEntries().find((e) => /(^|\/)data\/races\.json$/.test(e.entryName) || /^races\.json$/.test(e.entryName));
  if (!races) throw badRequest("That zip doesn't look like 5etools: no data/races.json in it.");
  const base = races.entryName.slice(0, -'races.json'.length);
  const read = (path: string): J => {
    const e = zip.getEntry(base + path);
    return e ? (JSON.parse(e.getData().toString('utf8')) as J) : {};
  };
  const all = (dir: string, prefix: string, key: string): J[] =>
    zip
      .getEntries()
      .filter((e) => e.entryName.startsWith(`${base}${dir}/${prefix}`) && e.entryName.endsWith('.json'))
      .flatMap((e) => ((JSON.parse(e.getData().toString('utf8')) as J)[key] as J[]) ?? []);
  return { read, all };
}

/** Keep one of each name: the best-ranked book. */
function best<T extends J>(items: T[], key: (o: T) => string, score: (o: T) => number) {
  const m = new Map<string, T>();
  for (const o of items) {
    const k = key(o).toLowerCase();
    const cur = m.get(k);
    if (!cur || score(o) < score(cur)) m.set(k, o);
  }
  return [...m.values()];
}
const inBooks = (o: J) => (o.source as string) in BOOKS;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const title = (s: string) =>
  s
    .split(' ')
    .map((w, i) => (i > 0 && ['of', 'and', 'the', 'or', 'a', 'to'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

// ---------------------------------------------------------------- spells
const SCHOOL: Record<string, string> = { A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment', V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation' };
const UNIT: Record<string, string> = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction' };
function spellTime(s: J) {
  const t = ((s.time as J[]) ?? [])[0] ?? {};
  const unit = t.unit as string;
  let out = UNIT[unit] ?? `${t.number} ${unit}${(t.number as number) > 1 ? 's' : ''}`;
  if (t.condition) out += `, which you take ${plainTags(t.condition as string)}`;
  if ((s.meta as J)?.ritual) out += ' or Ritual';
  return out;
}
function spellRange(s: J) {
  const r = (s.range as J) ?? {};
  const d = (r.distance as J) ?? {};
  const dist =
    d.type === 'self'
      ? 'Self'
      : d.type === 'touch'
        ? 'Touch'
        : d.type === 'sight'
          ? 'Sight'
          : d.type === 'unlimited'
            ? 'Unlimited'
            : `${d.amount} ${d.amount === 1 ? String(d.type).replace(/s$/, '') : d.type}`;
  if (r.type === 'point') return dist;
  if (r.type === 'special') return 'Special';
  return `Self (${d.amount}-${String(d.type).replace(/s$/, '').replace('feet', 'foot')} ${r.type})`;
}
function spellComponents(s: J) {
  const c = (s.components as J) ?? {};
  const parts = [c.v && 'V', c.s && 'S', c.m && `M (${typeof c.m === 'string' ? c.m : (c.m as J).text})`].filter(Boolean);
  return parts.join(', ');
}
function spellDuration(s: J) {
  const d = ((s.duration as J[]) ?? [])[0] ?? {};
  if (d.type === 'instant') return 'Instantaneous';
  if (d.type === 'permanent') return (d.ends as string[] | undefined)?.includes('trigger') ? 'Until dispelled or triggered' : 'Until dispelled';
  if (d.type === 'special') return 'Special';
  const t = d.duration as J;
  const span = `${t.amount} ${t.type}${(t.amount as number) > 1 ? 's' : ''}`;
  return d.concentration ? `Concentration, up to ${span}` : t.upTo ? `Up to ${span}` : span;
}

// ---------------------------------------------------------------- the import
export interface FivetoolsResult {
  counts: Record<string, number>;
  books: string[];
  legacySpecies: string[];
  missingSpecies: string[];
}

export function importFivetools(db: DB, buf: Buffer): { pack: ReturnType<typeof listPacks>[number]; result: FivetoolsResult } {
  const { read, all } = openData(buf);
  const entries: { kind: string; name: string; cls: string; data: J }[] = [];
  const add = (kind: string, name: string, cls: string, data: J) => entries.push({ kind, name, cls, data });

  // Spells, with their class lists from 5etools' lookup.
  const lookup = read('generated/gendata-spell-source-lookup.json') as Record<string, Record<string, { class?: Record<string, Record<string, unknown>> }>>;
  const spells = best(
    all('spells', 'spells-', 'spell').filter(inBooks),
    (s) => s.name as string,
    (s) => rank(s.source as string),
  );
  for (const s of spells) {
    const cl = lookup[(s.source as string).toLowerCase()]?.[(s.name as string).toLowerCase()]?.class ?? {};
    const classes = new Set<string>();
    for (const [src, names] of Object.entries(cl)) if (src in BOOKS || src === 'PHB') for (const n of Object.keys(names)) classes.add(n);
    const higher = renderEntries(s.entriesHigherLevel ?? []);
    add('spell', s.name as string, '', {
      name: s.name,
      level: s.level,
      school: SCHOOL[s.school as string] ?? s.school,
      classes: [...classes].sort(),
      time: spellTime(s),
      range: spellRange(s),
      components: spellComponents(s),
      duration: spellDuration(s),
      concentration: ((s.duration as J[]) ?? []).some((d) => d.concentration),
      ritual: !!(s.meta as J)?.ritual,
      material: !!(s.components as J)?.m,
      text: [text(s.entries), ...higher].filter(Boolean).join('\n\n'),
      source: cite(s),
    });
  }

  // Species: the books' own, plus older printings the world's peoples name.
  const racesFile = read('races.json');
  const races = (racesFile.race as J[]) ?? [];
  const subraces = ((racesFile.subrace as J[]) ?? []).filter((s) => s.name);
  const species = (r: J, extra?: J) => {
    const size = ((r.size as string[]) ?? ['M']).map((x) => ({ T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large' })[x] ?? x);
    const sp = r.speed as number | J;
    const walk = typeof sp === 'number' ? sp : ((sp?.walk as number) ?? 30);
    const traits = [...((r.entries as J[]) ?? []), ...((extra?.entries as J[]) ?? [])]
      .filter((e) => e && typeof e === 'object' && e.name)
      .map((e) => ({ name: plainTags(e.name as string), text: text(e.entries ?? []) }));
    const other = typeof sp === 'object' ? Object.entries(sp ?? {}).filter(([k, v]) => k !== 'walk' && typeof v === 'number') : [];
    if (other.length) traits.unshift({ name: 'Speeds', text: other.map(([k, v]) => `${title(k)} ${v} ft.`).join(', ') });
    return { type: title(((r.creatureTypes as string[]) ?? ['humanoid']).join(' or ')), size, sizeText: size.join(' or '), speed: walk, traits, source: cite(extra ?? r) };
  };
  const own = best(
    races.filter(inBooks),
    (r) => r.name as string,
    (r) => rank(r.source as string),
  );
  for (const r of own) add('species', r.name as string, '', species(r));
  const haveSpecies = new Set(own.map((r) => norm(r.name as string)));
  const wanted = new Set<string>();
  for (const row of db.prepare(`SELECT player_summary, body, fields FROM entities WHERE type IN ('people','species','culture')`).all() as J[]) {
    const n = rulesSpeciesName(`${row.player_summary ?? ''}\n${row.body ?? ''}\n${row.fields ?? ''}`);
    if (n) wanted.add(n);
  }
  const legacySpecies: string[] = [];
  const missingSpecies: string[] = [];
  for (const w of wanted) {
    if (haveSpecies.has(norm(w))) continue;
    const cands = [
      ...races.filter((r) => norm(r.name as string) === norm(w)).map((r) => ({ r, sub: undefined as J | undefined })),
      ...subraces
        .filter((s) => norm(`${s.name} ${s.raceName}`) === norm(w) || norm(`${s.raceName} ${s.name}`) === norm(w) || norm(s.name as string) === norm(w))
        .map((s) => ({ r: races.find((r) => r.name === s.raceName && r.source === s.raceSource) ?? {}, sub: s as J | undefined })),
    ].sort((a, b) => score((a.sub ?? a.r).source as string) - score((b.sub ?? b.r).source as string));
    const c = cands[0];
    if (!c) {
      missingSpecies.push(w);
      continue;
    }
    const data = species(c.r, c.sub);
    const src = (c.sub ?? c.r).source as string;
    if (!(src in BOOKS)) {
      data.source = `${data.source} (older printing)`;
      legacySpecies.push(`${w} (${src})`);
    }
    add('species', w, '', data);
    haveSpecies.add(norm(w));
  }

  // Classes: the 2024 classes and the Artificer, with their features, and every subclass from the books.
  const classFiles = all('class', 'class-', 'class');
  const classFeatures = all('class', 'class-', 'classFeature');
  const subclassList = all('class', 'class-', 'subclass');
  const subFeatures = all('class', 'class-', 'subclassFeature');
  const optional = ((read('optionalfeatures.json').optionalfeature as J[]) ?? []).filter(inBooks);
  const options = (type: string) =>
    best(
      optional.filter((o) => (o.featureType as string[]).includes(type)),
      (o) => o.name as string,
      (o) => rank(o.source as string),
    )
      .sort((a, b) => (a.name as string).localeCompare(b.name as string))
      .map((o) => `${o.name}${o.prerequisite ? ` (${prereq(o.prerequisite as J[])})` : ''}: ${text(o.entries)}`)
      .join('\n\n');
  const classes = best(
    classFiles.filter((c) => c.source === 'XPHB' || c.source === 'EFA'),
    (c) => c.name as string,
    (c) => rank(c.source as string),
  );
  for (const c of classes) {
    const feats = classFeatures
      .filter((f) => f.className === c.name && f.classSource === c.source)
      .map((f) => ({ level: f.level as number, name: plainTags(f.name as string), text: text(f.entries) }));
    const extra: Record<string, [number, string, string]> = { Warlock: [1, 'Eldritch Invocation options', 'EI'], Sorcerer: [2, 'Metamagic options', 'MM'] };
    const x = extra[c.name as string];
    if (x) feats.push({ level: x[0], name: x[1], text: options(x[2]) });
    add('class', c.name as string, c.name as string, { features: feats.filter((f) => f.text).sort((a, b) => a.level - b.level), source: cite(c) });
  }
  const subs = best(
    subclassList.filter(inBooks).filter((s) => classes.some((c) => c.name === s.className)),
    (s) => `${s.className}|${s.name}`,
    (s) => rank(s.source as string) * 10 + (s.classSource === 'XPHB' || s.classSource === 'EFA' ? 0 : 1),
  );
  for (const s of subs) {
    const feats = subFeatures.filter((f) => f.className === s.className && f.subclassShortName === s.shortName && f.subclassSource === s.source);
    // The first feature is usually the subclass itself: its opening text, with the real features listed on their own.
    const intro = feats.find((f) => f.name === s.name || f.name === s.shortName);
    const list = feats
      .filter((f) => f !== intro)
      .map((f) => ({ level: f.level as number, name: plainTags(f.name as string), text: text(f.entries).replace(/^\d+(st|nd|rd|th)-level [^.]*? feature\s*/i, '') }));
    if ((s.shortName === 'Battle Master' || s.name === 'Battle Master') && !list.some((f) => /maneuver options/i.test(f.name)))
      list.push({ level: 3, name: 'Maneuver options', text: options('MV:B') });
    add('subclass', s.name as string, s.className as string, {
      name: s.name,
      about: intro ? text(intro.entries) : '',
      features: list.filter((f) => f.text).sort((a, b) => a.level - b.level),
      source: cite(s),
    });
  }

  // Feats.
  const CAT: Record<string, string> = { O: 'Origin', G: 'General', FS: 'Fighting Style', 'FS:P': 'Fighting Style', 'FS:R': 'Fighting Style', EB: 'Epic Boon' };
  const feats = best(
    ((read('feats.json').feat as J[]) ?? []).filter(inBooks),
    (f) => norm(f.name as string),
    (f) => rank(f.source as string),
  );
  for (const f of feats)
    add('feat', f.name as string, '', {
      category: CAT[f.category as string] ?? (f.source === 'TCE' || f.source === 'XGE' ? 'General (2014 rules)' : 'General'),
      prerequisite: f.prerequisite ? prereq(f.prerequisite as J[]) : '',
      text: text(f.entries),
      source: cite(f),
    });

  // Backgrounds, with their kit as "Choose A or B: (A) ...; or (B) 50 GP".
  const bgs = best(
    ((read('backgrounds.json').background as J[]) ?? []).filter(inBooks),
    (b) => b.name as string,
    (b) => rank(b.source as string),
  );
  for (const b of bgs) {
    const ab = ((b.ability as J[]) ?? [])[0] as J | undefined;
    const from = ((((ab?.choose as J)?.weighted as J)?.from ?? (ab?.choose as J)?.from ?? []) as string[]).map((a) => ABIL[a] ?? a);
    const featKey = Object.keys(((b.feats as J[]) ?? [])[0] ?? {})[0] ?? '';
    const [fname, fvar] = featKey
      .split('|')[0]
      .split(';')
      .map((x) => x.trim());
    add('background', b.name as string, '', {
      abilities: from,
      feat: fname ? `${title(fname)}${fvar ? ` (${title(fvar)})` : ''}` : '',
      skills: proficiencyNames(b.skillProficiencies as J[]),
      tool: proficiencyNames(b.toolProficiencies as J[]).join(', '),
      equipment: kitText(b.startingEquipment as J[]),
      text: text(b.entries),
      source: cite(b),
    });
  }

  if (!entries.length) throw badRequest('Nothing from your books was found in that 5etools copy.');
  const id = '5etools';
  db.transaction(() => {
    db.prepare('DELETE FROM rules_entries WHERE pack_id = ?').run(id);
    db.prepare(
      `INSERT INTO rules_packs (id, name, source, enabled, imported_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, source = excluded.source, imported_at = excluded.imported_at`,
    ).run(id, 'Your books (from 5etools)', Object.values(BOOKS).join('; '), new Date().toISOString());
    const ins = db.prepare('INSERT OR REPLACE INTO rules_entries (pack_id, kind, name, cls, data) VALUES (?, ?, ?, ?, ?)');
    for (const e of entries) ins.run(id, e.kind, e.name, e.cls, JSON.stringify(e.data));
  })();
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  return { pack: listPacks(db).find((p) => p.id === id)!, result: { counts, books: Object.values(BOOKS), legacySpecies, missingSpecies } };
}

function prereq(list: J[]): string {
  return list
    .map((p) => {
      const parts: string[] = [];
      if (p.level) parts.push(`Level ${typeof p.level === 'object' ? (p.level as J).level : p.level}+`);
      for (const a of (p.ability as J[]) ?? [])
        parts.push(
          Object.entries(a)
            .map(([k, v]) => `${ABIL[k] ?? k} ${v}+`)
            .join(' or '),
        );
      if (p.spellcasting || p.spellcasting2020 || p.spellcastingFeature) parts.push('Spellcasting or Pact Magic feature');
      if (p.feature) parts.push(`${(p.feature as string[]).join(' or ')} feature`);
      for (const f of (p.feat as string[]) ?? []) parts.push(title(f.split('|')[0]));
      for (const r of (p.race as J[]) ?? []) parts.push(title(String(r.name)));
      if (p.proficiency) parts.push('the right armor or weapon training');
      if (p.other) parts.push(plainTags(p.other as string));
      if (p.otherSummary) parts.push(plainTags(((p.otherSummary as J).entry as string) ?? ''));
      return parts.filter(Boolean).join(', ');
    })
    .filter(Boolean)
    .join('; or ');
}

function proficiencyNames(list: J[] | undefined): string[] {
  const first = (list ?? [])[0] ?? {};
  const out: string[] = [];
  for (const [k, v] of Object.entries(first)) {
    if (k === 'choose') out.push(`Choose from ${(((v as J).from as string[]) ?? []).map(title).join(', ')}`);
    else if (k === 'anyArtisansTool') out.push("One kind of Artisan's Tools");
    else if (k === 'anyMusicalInstrument') out.push('One kind of Musical Instrument');
    else if (k === 'anyGamingSet') out.push('One kind of Gaming Set');
    else if (v) out.push(title(k));
  }
  return out;
}

function kitText(list: J[] | undefined): string {
  const kit = (list ?? [])[0];
  if (!kit) return '';
  const side = (items: unknown[]) =>
    items
      .map((it) => {
        if (typeof it === 'string') return title(it.split('|')[0]);
        const o = it as J;
        if (o.value != null) return `${(o.value as number) / 100} GP`;
        if (o.special) return `${o.quantity ? `${o.quantity} ` : ''}${title(String(o.special))}`;
        if (o.equipmentType) return { setGaming: 'Gaming Set', toolArtisan: "Artisan's Tools", instrumentMusical: 'Musical Instrument' }[o.equipmentType as string] ?? title(String(o.equipmentType));
        const name = title(String(o.item ?? o.displayName ?? '').split('|')[0]);
        return o.quantity && (o.quantity as number) > 1 ? `${o.quantity} ${name}` : name;
      })
      .join(', ');
  if (kit.A && kit.B) return `Choose A or B: (A) ${side(kit.A as unknown[])}; or (B) ${side(kit.B as unknown[])}`;
  return side((kit._ ?? kit.A ?? []) as unknown[]);
}
