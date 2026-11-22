/**
 * Import rules from a copy of the 5etools data (the GM's own, never part of this repository): spells, species,
 * classes and subclasses, backgrounds and feats from the books the GM owns, turned into one private rules pack.
 *
 * Only the books the GM chooses come in (DEFAULT_BOOKS if they don't). A species from another book comes in only when a people page in the world names
 * it ("Use the half-orc rules"), and is marked as an older printing. 5etools' own formatting tags are turned into
 * plain text. Like every rules pack, the result stays in the GM's library and is never published or exported.
 */
import AdmZip from 'adm-zip';
import type Database from 'better-sqlite3';
import { badRequest } from '../lib/errors.js';
import { rulesSpeciesName } from '../../../shared/rulesView.js';
import { listPacks } from './rulesPacks.js';
import { types } from './recordTypes.js';

type DB = Database.Database;
type J = Record<string, unknown>;

/** The books imported when the GM hasn't chosen: the eight they own. */
export const DEFAULT_BOOKS = ['XPHB', 'XDMG', 'XMM', 'EFA', 'MPMM', 'AAG', 'TCE', 'XGE'];

/**
 * The books chosen for this import, newest printing first (an earlier book wins a clash of names), with their titles.
 * Set at the start of each import; the import runs start to finish without yielding, so one import never sees another's.
 */
let BOOKS: Record<string, string> = {};
let ORDER: string[] = [];
const rank = (src: string) => (ORDER.includes(src) ? ORDER.indexOf(src) : 100);
/** For species the world asks for that none of the chosen books have: older printings, best first. */
const LEGACY_ORDER = ['XPHB', 'MPMM', 'EFA', 'AAG', 'PHB', 'VGM', 'ERLW', 'MTF', 'EGW', 'MOT', 'GGR', 'VRGR', 'FTD', 'SCAG', 'EEPC', 'DMG'];
const legacyRank = (src: string) => (LEGACY_ORDER.includes(src) ? LEGACY_ORDER.indexOf(src) : 50);
/** The chosen books first, then other printings. */
const score = (src: string) => (src in BOOKS ? rank(src) : 100 + legacyRank(src));
let TITLES: Record<string, string> = {};
const cite = (o: J) => `${TITLES[o.source as string] ?? (o.source as string)}${o.page ? ` p. ${o.page}` : ''}`;

// ---------------------------------------------------------------- text
const TAG = /\{@(\w+)\s*([^{}]*?)\}/g;
/** 5etools inline tags to plain text: {@spell fireball|XPHB} → fireball; {@dc 15} → DC 15; {@hit 4} → +4. */
export function plainTags(s: string): string {
  // A few books put an entry object, a number or nothing where text usually goes.
  if (typeof s !== 'string') return s == null ? '' : typeof s === 'object' ? renderEntries([s]).join(' ') : String(s);
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
          return `${text
            .split(/\s*\/\s*|,\s*/)
            .map((a) => ({ str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' })[a.trim().toLowerCase()] ?? a.toUpperCase())
            .join(' or ')} Saving Throw:`;
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

interface BookInfo {
  id: string;
  name: string;
  published: string;
  group: string;
}
/** Every book and source in the copy, from its books list (and adventures, for the few rules they hold). */
function bookInfo(read: (p: string) => J): Record<string, BookInfo> {
  const out: Record<string, BookInfo> = {};
  for (const file of ['adventures.json', 'books.json'])
    for (const b of ((read(file).book ?? read(file).adventure) as J[]) ?? [])
      out[b.id as string] = { id: b.id as string, name: b.name as string, published: (b.published as string) ?? '', group: (b.group as string) ?? '' };
  return out;
}

export interface ScannedBook {
  id: string;
  name: string;
  published: string;
  group: string;
  /** How many of each kind of rule the book has. */
  counts: Record<string, number>;
  /** Unearthed Arcana playtest material, or a book 5etools doesn't list (usually homebrew). */
  unofficial: boolean;
}
/** What's in a 5etools copy: each book with rules for the sheet, and how many of each. */
export function scanFivetools(buf: Buffer): ScannedBook[] {
  const { read, all } = openData(buf);
  const info = bookInfo(read);
  const counts: Record<string, Record<string, number>> = {};
  const count = (kind: string, items: J[]) => {
    for (const o of items) {
      const src = o.source as string;
      if (!src) continue;
      (counts[src] ??= {})[kind] = (counts[src][kind] ?? 0) + 1;
    }
  };
  count('spell', all('spells', 'spells-', 'spell'));
  count('species', (read('races.json').race as J[]) ?? []);
  count('class', all('class', 'class-', 'class'));
  count(
    'subclass',
    all('class', 'class-', 'subclass').filter((s) => !s._copy),
  );
  count('feat', (read('feats.json').feat as J[]) ?? []);
  count('background', (read('backgrounds.json').background as J[]) ?? []);
  count(
    'creature',
    all('bestiary', 'bestiary-', 'monster').filter((m) => !m._copy),
  );
  count(
    'item',
    ((read('items.json').item as J[]) ?? []).filter((i) => !i._copy),
  );
  return Object.entries(counts)
    .map(([id, c]) => {
      const b = info[id];
      return { id, name: b?.name ?? id, published: b?.published ?? '', group: b?.group ?? '', counts: c, unofficial: !b || /^UA/.test(id) || b.group === 'homebrew' };
    })
    .sort((a, b) => Number(a.unofficial) - Number(b.unofficial) || b.published.localeCompare(a.published) || a.name.localeCompare(b.name));
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

export function importFivetools(db: DB, buf: Buffer, books: string[] = DEFAULT_BOOKS): { pack: ReturnType<typeof listPacks>[number]; result: FivetoolsResult } {
  const { read, all } = openData(buf);
  const info = bookInfo(read);
  TITLES = Object.fromEntries(Object.values(info).map((b) => [b.id, b.name]));
  if (!books.length) throw badRequest('Choose at least one book.');
  // Newest printing first, so a reprint wins over the book it reprints.
  ORDER = [...new Set(books)].sort((a, b) => (info[b]?.published ?? '').localeCompare(info[a]?.published ?? ''));
  BOOKS = Object.fromEntries(ORDER.map((id) => [id, TITLES[id] ?? id]));
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
    for (const [src, names] of Object.entries(cl)) if (src in BOOKS || src === 'PHB' || src === 'XPHB') for (const n of Object.keys(names)) classes.add(n);
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
  const folk = types(db).with('folk');
  for (const row of db.prepare(`SELECT player_summary, body, fields FROM entities WHERE type IN (${folk.map(() => '?').join(',') || "''"})`).all(...folk) as J[]) {
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
    // A class with no features of its own (a setting book's placeholder) never replaces a real one.
    classFiles.filter((c) => (c.source as string) in BOOKS && !/sidekick/i.test(c.name as string) && classFeatures.some((f) => f.className === c.name && f.classSource === c.source)),
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
    // Prefer the version written for the class being imported (5etools fits older subclasses to the 2024 classes).
    (s) => rank(s.source as string) * 10 + (classes.some((c) => c.name === s.className && c.source === s.classSource) ? 0 : 1),
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

  setItemTemplates(read('items-base.json').itemEntry as J[]);
  // Creatures, as the app's own stat blocks (GM only), and magic items and gear.
  const monsters = best(
    all('bestiary', 'bestiary-', 'monster').filter((m) => inBooks(m) && !m._copy),
    (m) => m.name as string,
    (m) => rank(m.source as string),
  );
  for (const m of monsters) add('creature', m.name as string, '', creatureBlock(m));
  const items = best(
    ((read('items.json').item as J[]) ?? []).filter((i) => inBooks(i) && !i._copy),
    (i) => i.name as string,
    (i) => rank(i.source as string),
  );
  for (const i of items) add('item', i.name as string, '', itemEntry(i));
  // Mundane weapons and armor, and the generic magic items ("+1 Weapon", "Flame Tongue") that fit many base items.
  const have = new Set(items.map((i) => (i.name as string).toLowerCase()));
  const base = best(
    ((read('items-base.json').baseitem as J[]) ?? []).filter((i) => inBooks(i) && !have.has((i.name as string).toLowerCase())),
    (i) => i.name as string,
    (i) => rank(i.source as string),
  );
  for (const i of base) add('item', i.name as string, '', itemEntry(i));
  const variants = best(
    ((read('magicvariants.json').magicvariant as J[]) ?? [])
      .filter((v) => v.inherits && !have.has((v.name as string).toLowerCase()))
      .map((v) => ({ ...(v.inherits as J), ...v, source: (v.inherits as J).source, page: (v.inherits as J).page }) as J)
      .filter(inBooks),
    (v) => v.name as string,
    (v) => rank(v.source as string),
  );
  for (const v of variants) add('item', v.name as string, '', itemEntry(v));

  if (!entries.length) throw badRequest('Nothing from the chosen books was found in that 5etools copy.');
  db.prepare(`INSERT INTO settings (key, value) VALUES ('fivetools_books', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(ORDER));
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

/** The books chosen last time, or the defaults. */
export function chosenBooks(db: DB): string[] {
  const v = (db.prepare(`SELECT value FROM settings WHERE key = 'fivetools_books'`).get() as { value: string } | undefined)?.value;
  try {
    return v ? (JSON.parse(v) as string[]) : DEFAULT_BOOKS;
  } catch {
    return DEFAULT_BOOKS;
  }
}

// ---------------------------------------------------------------- creatures
const SIZE: Record<string, string> = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
const ALIGN: Record<string, string> = { L: 'Lawful', N: 'Neutral', C: 'Chaotic', G: 'Good', E: 'Evil', U: 'Unaligned', A: 'Any alignment' };
export const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};
const crPb = (cr: string) => {
  const n = cr.includes('/') ? 0 : Number(cr);
  return n >= 29 ? 9 : n >= 25 ? 8 : n >= 21 ? 7 : n >= 17 ? 6 : n >= 13 ? 5 : n >= 9 ? 4 : n >= 5 ? 3 : 2;
};
const amod = (n: number) => Math.floor((n - 10) / 2);
const sgn = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
/** A list that may hold plain strings, or objects naming a group with a note ("resist" and "immune" lists). */
function damageList(list: unknown): string {
  if (!Array.isArray(list)) return '';
  return list
    .map((x) => {
      if (typeof x === 'string') return title(x);
      const o = x as J;
      const inner = damageList(o.resist ?? o.immune ?? o.vulnerable ?? o.conditionImmune ?? []);
      return o.special
        ? plainTags(o.special as string)
        : [o.preNote, inner, o.note]
            .filter(Boolean)
            .map((t) => plainTags(String(t)))
            .join(' ');
    })
    .filter(Boolean)
    .join(', ');
}
const named = (list: unknown) => ((list as J[]) ?? []).filter((e) => e && typeof e === 'object').map((e) => ({ name: plainTags((e.name as string) ?? ''), text: text(e.entries ?? []) }));
function spellcastingEntries(sc: J): { name: string; text: string } {
  const lines = [text(sc.headerEntries ?? [])];
  if (!(sc.hidden as string[] | undefined)?.includes('will') && sc.will) lines.push(`At will: ${(sc.will as string[]).map(plainTags).join(', ')}`);
  if (!(sc.hidden as string[] | undefined)?.includes('daily'))
    for (const [k, v] of Object.entries((sc.daily as J) ?? {})) lines.push(`${k.replace('e', '')}/Day${k.endsWith('e') ? ' each' : ''}: ${(v as string[]).map(plainTags).join(', ')}`);
  for (const [lvl, v] of Object.entries((sc.spells as J) ?? {})) {
    const o = v as J;
    lines.push(`${lvl === '0' ? 'Cantrips' : `Level ${lvl}${o.slots ? ` (${o.slots} slots)` : ''}`}: ${((o.spells as string[]) ?? []).map(plainTags).join(', ')}`);
  }
  lines.push(text(sc.footerEntries ?? []));
  return { name: plainTags(sc.name as string), text: lines.filter(Boolean).join('\n') };
}
/** A 5etools creature as one of the app's stat blocks. */
export function creatureBlock(m: J): J {
  const type = typeof m.type === 'string' ? m.type : ((m.type as J)?.type as string | J);
  const typeName = typeof type === 'string' ? type : (((type as J)?.choose as string[] | undefined)?.join(' or ') ?? '');
  const tags = typeof m.type === 'object' ? ((m.type as J).tags as unknown[] | undefined)?.map((t) => (typeof t === 'string' ? t : (t as J).tag)) : undefined;
  const align = ((m.alignment as unknown[]) ?? []).map((a) => (typeof a === 'string' ? ALIGN[a] : '')).filter(Boolean);
  const meta = `${((m.size as string[]) ?? ['M']).map((x) => SIZE[x]).join(' or ')} ${title(String(typeName))}${tags?.length ? ` (${tags.map((t) => title(String(t))).join(', ')})` : ''}${align.length ? `, ${align.join(' ')}` : ''}`;
  const ac = ((m.ac as unknown[]) ?? [])[0];
  const acNum = typeof ac === 'number' ? ac : ((ac as J)?.ac as number);
  const hp = (m.hp as J) ?? {};
  const cr = typeof m.cr === 'string' ? m.cr : (((m.cr as J)?.cr as string) ?? '0');
  const pb = crPb(cr);
  const ab = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => (m[k] as number) ?? 10);
  const initProf = ((m.initiative as J)?.proficiency as number) ?? 0;
  const speed = Object.entries((m.speed as J) ?? {})
    .filter(([k, v]) => !['choose', 'alternate', 'canHover'].includes(k) && (typeof v === 'number' || (v && typeof v === 'object')))
    .map(
      ([k, v]) =>
        `${k === 'walk' ? '' : `${title(k)} `}${typeof v === 'number' ? v : (v as J).number} ft.${typeof v === 'object' && (v as J).condition ? ` ${plainTags((v as J).condition as string)}` : ''}`,
    )
    .join(', ');
  const kv = (o: unknown) =>
    Object.entries((o as J) ?? {})
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => (k === 'special' ? plainTags(String(v)) : `${title(k)} ${v}`))
      .join(', ');
  const casting = ((m.spellcasting as J[]) ?? []).map((sc) => ({ sc, entry: spellcastingEntries(sc) }));
  const castAs = (where: string) => casting.filter((c) => ((c.sc.displayAs as string) ?? 'trait') === where).map((c) => c.entry);
  const legendary = named(m.legendary);
  if (legendary.length) {
    // As the 2024 books print it: "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature's turn, …"
    const n = (m.legendaryActions as number) ?? 3;
    const lair = m.legendaryActionsLair as number | undefined;
    const short = shortName(m);
    const head = m.legendaryHeader
      ? text(m.legendaryHeader)
      : `Legendary Action Uses: ${n}${lair ? ` (${lair} in Lair)` : ''}. Immediately after another creature's turn, ${short} can expend a use to take one of the following actions. ${short[0].toUpperCase()}${short.slice(1)} regains all expended uses at the start of each of its turns.`;
    legendary.unshift({ name: '', text: head });
  }
  return {
    id: `book:${String(m.source).toLowerCase()}:${String(m.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`,
    name: m.name,
    meta,
    kind: 'creature',
    ac: acNum,
    hp: hp.special ? plainTags(String(hp.special)) : hp.average != null ? `${hp.average} (${plainTags(String(hp.formula ?? ''))})` : '',
    hpAvg: hp.average,
    init: amod(ab[1]) + initProf * pb,
    speed,
    ab,
    cr,
    xp: XP_BY_CR[cr],
    pb,
    saves: kv(m.save),
    skills: kv(m.skill),
    vuln: damageList(m.vulnerable),
    res: damageList(m.resist),
    imm: [damageList(m.immune), damageList(m.conditionImmune)].filter(Boolean).join('; '),
    gear: ((m.gear as unknown[]) ?? []).map((g) => title(String(typeof g === 'string' ? g : (g as J).item).split('|')[0])).join(', '),
    senses: [...((m.senses as string[]) ?? []).map((x) => plainTags(x).replace(/^./, (c) => c.toUpperCase())), ...(m.passive != null ? [`Passive Perception ${m.passive}`] : [])].join(', '),
    languages: ((m.languages as string[]) ?? []).map(plainTags).join(', ') || 'None',
    traits: [...named(m.trait), ...castAs('trait')],
    actions: [...named(m.action), ...castAs('action')],
    bonus: [...named(m.bonus), ...castAs('bonus')],
    reactions: [...named(m.reaction), ...castAs('reaction')],
    legendary,
    environment: (m.environment as string[]) ?? [],
    source: cite(m),
  };
}

// ---------------------------------------------------------------- items
const ITEM_TYPE: Record<string, string> = {
  A: 'Ammunition',
  AF: 'Ammunition',
  AT: "Artisan's Tools",
  EM: 'Eldritch Machine',
  EXP: 'Explosive',
  FD: 'Food and Drink',
  G: 'Adventuring Gear',
  GS: 'Gaming Set',
  HA: 'Heavy Armor',
  INS: 'Musical Instrument',
  LA: 'Light Armor',
  M: 'Melee Weapon',
  MA: 'Medium Armor',
  MNT: 'Mount',
  P: 'Potion',
  R: 'Ranged Weapon',
  RD: 'Rod',
  RG: 'Ring',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  T: 'Tools',
  TAH: 'Tack and Harness',
  TG: 'Trade Good',
  VEH: 'Vehicle',
  WD: 'Wand',
  $A: 'Art Object',
  $G: 'Gemstone',
  $C: 'Coinage',
};
// Text several items share ("{#itemEntry Ioun Stone|XDMG}"), with each item's own values filled in.
let ITEM_TEMPLATES: Record<string, unknown[]> = {};
export function setItemTemplates(list: J[] | undefined) {
  ITEM_TEMPLATES = Object.fromEntries((list ?? []).map((t) => [`${String(t.name).toLowerCase()}|${String(t.source).toLowerCase()}`, (t.entriesTemplate as unknown[]) ?? []]));
}
function expandShared(entries: unknown, i: J): unknown {
  if (!Array.isArray(entries)) return entries;
  return entries.flatMap((e) => {
    const m = typeof e === 'string' ? /^\{#itemEntry ([^|}]+)\|?([^}]*)\}$/.exec(e) : null;
    if (!m) return [e];
    const tpl = ITEM_TEMPLATES[`${m[1].toLowerCase()}|${(m[2] || 'dmg').toLowerCase()}`] ?? Object.entries(ITEM_TEMPLATES).find(([k]) => k.startsWith(`${m[1].toLowerCase()}|`))?.[1];
    if (!tpl) return [];
    const val = (k: string) => {
      const v = i[k];
      return Array.isArray(v) ? v.map((x) => title(String(x))).join(', ') : String(v ?? '');
    };
    return JSON.parse(JSON.stringify(tpl).replace(/\{\{(?:getFullImmRes )?item\.(\w+)\}\}/g, (_, k: string) => val(k).replace(/"/g, '\\"'))) as unknown[];
  });
}

/** A 5etools item: what it is, its rarity and attunement, and its rules. */
export function itemEntry(i: J): J {
  const code = String(i.type ?? '').split('|')[0];
  const kind = i.wondrous ? 'Wondrous Item' : (ITEM_TYPE[code] ?? (i.staff ? 'Staff' : i.weapon ? 'Weapon' : i.armor ? 'Armor' : 'Item'));
  const att = i.reqAttune === true ? 'requires attunement' : typeof i.reqAttune === 'string' ? `requires attunement ${plainTags(i.reqAttune)}` : '';
  const rarity = i.rarity && i.rarity !== 'none' && i.rarity !== 'unknown' ? String(i.rarity) : '';
  const DMG: Record<string, string> = {
    A: 'Acid',
    B: 'Bludgeoning',
    C: 'Cold',
    F: 'Fire',
    O: 'Force',
    L: 'Lightning',
    N: 'Necrotic',
    P: 'Piercing',
    I: 'Poison',
    Y: 'Psychic',
    R: 'Radiant',
    S: 'Slashing',
    T: 'Thunder',
  };
  const PROP: Record<string, string> = {
    A: 'Ammunition',
    AF: 'Ammunition',
    BF: 'Burst Fire',
    F: 'Finesse',
    H: 'Heavy',
    L: 'Light',
    LD: 'Loading',
    R: 'Reach',
    RLD: 'Reload',
    S: 'Special',
    T: 'Thrown',
    '2H': 'Two-Handed',
    V: 'Versatile',
  };
  const stats: string[] = [];
  if (i.weaponCategory) {
    const props = ((i.property as unknown[]) ?? [])
      .map((x) => String(typeof x === 'string' ? x : (x as J).uid).split('|')[0])
      .map((x) => (x === 'V' && i.dmg2 ? `Versatile (${i.dmg2})` : x === 'T' || x === 'A' ? `${PROP[x]}${i.range ? ` (${i.range} ft.)` : ''}` : (PROP[x] ?? x)));
    stats.push(
      `${title(String(i.weaponCategory))} weapon. ${i.dmg1 ? `${i.dmg1} ${DMG[i.dmgType as string] ?? ''} damage.` : ''}${props.length ? ` ${props.join(', ')}.` : ''}${(i.mastery as string[] | undefined)?.length ? ` Mastery: ${(i.mastery as unknown[]).map((m) => String(typeof m === 'string' ? m : (m as J).uid).split('|')[0]).join(', ')}.` : ''}`,
    );
  }
  if (i.armor || code === 'S')
    stats.push(
      `${code === 'S' ? `+${i.ac} AC` : `AC ${i.ac}${code === 'LA' ? ' + Dex modifier' : code === 'MA' ? ' + Dex modifier (max 2)' : ''}`}.${i.strength ? ` Strength ${i.strength} needed.` : ''}${i.stealth ? ' Disadvantage on Stealth.' : ''}`,
    );
  const fill = (e: unknown) => JSON.parse(JSON.stringify(e ?? []).replace(/\{=(\w+)(?:\/\w+)?\}/g, (_, k: string) => String(i[k] ?? ''))) as unknown;
  const body = [stats.join(' '), text(fill(expandShared(i.entries, i)))].filter(Boolean).join('\n\n');
  return {
    name: i.name,
    type: i.namePrefix || i.nameSuffix ? 'Magic item (applies to a fitting weapon or armor)' : kind,
    rarity,
    attunement: att,
    magic: !!rarity,
    value: typeof i.value === 'number' ? (i.value as number) / 100 : null,
    weight: i.weight ?? null,
    text: body,
    // A generic magic item names the items it makes: "Flame Tongue " + "Longsword".
    ...(i.namePrefix || i.nameSuffix ? { prefix: (i.namePrefix as string) ?? '', suffix: (i.nameSuffix as string) ?? '' } : {}),
    tables: ((i.lootTables as string[]) ?? []).map((t) => t.split('|')[0]),
    source: cite(i),
  };
}

/** How a stat block names its creature in running text: "the dragon", "the lich" (5etools' shortName, else its name). */
function shortName(m: J): string {
  const s = m.shortName;
  if (s === true) return `the ${String(m.name).toLowerCase()}`;
  if (typeof s === 'string') return m.isNamedCreature ? s : `the ${s.toLowerCase()}`;
  return m.isNamedCreature ? String(m.name) : `the ${String(m.name).toLowerCase()}`;
}
