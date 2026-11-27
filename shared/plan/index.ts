/**
 * From a place's record to its plan: what kind of plan suits it, what its text says is in it, the choices the GM can
 * change, and the key that goes with the drawing.
 */
import { feetText, rng, type Plan, type PlanKind } from './model.js';
import { makeCave, makeDungeon } from './dungeon.js';
import { BUILDING_USES, buildingUse, makeBuilding } from './building.js';
import { TOWN_SIZES, makeSettlement, placeNames, type TownAsk, type TownSize } from './settlement.js';
import { roomNames } from './names.js';

export * from './model.js';
export { drawPlan, DRAW_DEFAULTS, type DrawOptions } from './draw.js';
export { BUILDING_USES } from './building.js';
export { TOWN_SIZES, type TownSize } from './settlement.js';

/** What a plan is made from. The same settings always give the same plan. */
export interface PlanSettings {
  kind: PlanKind;
  seed: number;
  /** The numbered places, in the order of the key. */
  names: string[];
  /** How much room there is: small, as usual, or large. */
  size: 'small' | 'medium' | 'large';
  /** A dungeon cut roughly, as a mine is. */
  rough: boolean;
  /** How many ways round a dungeon or a cave has. */
  ways: 'one' | 'some' | 'many';
  secrets: boolean;
  traps: boolean;
  /** What a building is for (a key of BUILDING_USES). */
  use: string;
  town: TownSize;
  water: TownAsk['water'];
  walled: boolean;
  around: TownAsk['around'];
}

export const PLAN_LABELS: Record<PlanKind, string> = { dungeon: 'Dungeon', cave: 'Cave', building: 'Building', settlement: 'Settlement' };
const ROOMY = { small: 0.78, medium: 1, large: 1.32 };
const LOOPS = { one: 0, some: 0.5, many: 1 };
export const MAX_NAMES = 40;

export function makePlan(s: PlanSettings): Plan {
  const names = s.names.slice(0, MAX_NAMES);
  if (s.kind === 'cave') return makeCave({ seed: s.seed, names, roomy: ROOMY[s.size], loops: LOOPS[s.ways] });
  if (s.kind === 'building') return makeBuilding({ seed: s.seed, use: s.use, names, roomy: s.size === 'small' ? 0.85 : s.size === 'large' ? 1.2 : 1 });
  if (s.kind === 'settlement') return makeSettlement({ seed: s.seed, names, size: s.town, water: s.water, walled: s.walled, around: s.around });
  return makeDungeon({ seed: s.seed, names, roomy: ROOMY[s.size], rough: s.rough, loops: LOOPS[s.ways], secrets: s.secrets, traps: s.traps ? Math.max(1, Math.round(names.length / 4)) : 0 });
}

/**
 * Names for a plan nobody has keyed: rooms that suit a place of this name, the usual rooms of a building of this use
 * (none are given: the building's own are used), or the places a settlement of this size has.
 */
export function madeNames(s: Pick<PlanSettings, 'kind' | 'seed' | 'town' | 'water' | 'walled'>, about: string, count: number): string[] {
  const rnd = rng(s.seed + 101);
  if (s.kind === 'building') return [];
  if (s.kind === 'settlement') return placeNames(rnd, s.town, s.water, s.walled);
  return roomNames(rnd, Math.max(1, Math.min(MAX_NAMES, count)), about, s.kind === 'cave');
}

// ---- Reading a record ------------------------------------------------------------------------------------------------

const KEY_HEADING = /^(the\s+)?(rooms?|areas?|inside|map key|key|places in town|places|sites|sites and services|streets,? services and locations|locations|levels?|chambers|the plan|what is here|layout)\b/i;
const clean = (s: string) =>
  s
    .replace(/@\[([^\]]+)\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s*\[[A-Z]{2,6}-[\w-]+\]/g, '')
    .replace(/\s*\[[A-Z ]+\]\s*$/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** The name at the start of a line of a key: what is in bold, or what comes before the first full stop or colon. */
function itemName(text: string): string {
  const bold = /^\s*\*\*(.+?)\*\*/.exec(text);
  const raw = bold ? bold[1] : (/^(.*?)(?:[.:;]\s|\s[–—-]\s|\s\(|$)/.exec(text)?.[1] ?? text);
  return clean(raw)
    .replace(/^\d{1,3}[.):]\s*/, '')
    .replace(/[.:,;]+$/, '')
    .slice(0, 60)
    .trim();
}

/**
 * The places a record's text names, in order: the lines of its key (a section called Rooms, Inside, Places in town,
 * Map key and the like: its numbered lines, its lines that begin in bold, or its smaller headings), or else headings
 * anywhere that begin with a number.
 */
export function keyedNames(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  const add = (name: string) => {
    if (name && name.length >= 2 && out.length < MAX_NAMES && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  let depth = 0;
  for (const line of lines) {
    const h = /^(#{1,5})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const text = clean(h[2]);
      if (depth && h[1].length > depth) add(itemName(text));
      else depth = KEY_HEADING.test(text) ? h[1].length : 0;
      continue;
    }
    if (!depth) continue;
    const numbered = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(\*\*.+?\*\*.*)$/.exec(line);
    if (numbered) add(itemName(numbered[1]));
    else if (bullet) add(itemName(bullet[1]));
  }
  if (out.length) return out;
  for (const line of lines) {
    const h = /^#{1,5}\s+(?:(?:room|area|level|site)\s+)?(\d{1,3})\s*[.):–—-]\s*(.+?)\s*#*\s*$/i.exec(line);
    if (h) add(itemName(clean(h[2])));
  }
  return out;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** A number written in a fact: "five", "about 400", "40,000", "250–400" (the first of a range), "2k". */
export function readNumber(text: string | null | undefined): number | null {
  const t = String(text ?? '').toLowerCase();
  const m = /(\d[\d,.]*)\s*(k|thousand|million)?/.exec(t);
  if (m) {
    const n = Number(m[1].replace(/,/g, '').replace(/\.(?=\d{3}\b)/g, ''));
    if (Number.isFinite(n)) return Math.round(n * (m[2] === 'million' ? 1e6 : m[2] ? 1000 : 1));
  }
  const w = NUMBER_WORDS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t));
  return w >= 0 ? w : null;
}

/** What is known of a place, for choosing its plan. */
export interface PlaceFacts {
  id: string;
  type: string;
  name: string;
  fields: [string, string][];
  body: string;
  /** The places kept under it as records of their own. */
  children: string[];
  terrain: string[];
  danger: 'safe' | 'risky' | 'deadly';
  wealth: 'poor' | 'modest' | 'rich';
}

const CAVE = /\b(caves?|caverns?|grotto|grottoes|warren|burrows?|den|sinkhole|chasm|underdark)\b/i;
const ROUGH = /\b(mines?|quarry|delve|diggings|tunnels|sewers?|catacombs?)\b/i;
const DUNGEON = /\b(dungeon|vault|tomb|crypt|ruins?|ruined|lair|labyrinth|maze|undercity|depths|sunken|barrow|necropolis|prison|oubliette|asylum)\b/i;
const TOWN = /\b(hamlet|village|town|city|capital|metropolis|thorp|outpost|camp|encampment|settlement|port|refuge)\b/i;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The plan that suits a record, before the GM has changed anything. */
export function suggest(p: PlaceFacts): PlanSettings {
  const fact = (name: string) => p.fields.find(([k]) => k.toLowerCase() === name)?.[1] ?? '';
  const start = p.body.replace(/^#.*$/gm, '').trim().slice(0, 600);
  const about = `${p.name}. ${fact('used for')}. ${start}`;
  const near = `${p.name}. ${fact('used for')}`;

  let kind: PlanKind;
  if (p.type === 'settlement') kind = 'settlement';
  else if (p.type === 'building') kind = 'building';
  else if (CAVE.test(near)) kind = 'cave';
  else if (p.type === 'dungeon' || DUNGEON.test(near) || ROUGH.test(near)) kind = 'dungeon';
  else if (TOWN.test(near)) kind = 'settlement';
  else if (Object.values(BUILDING_USES).some((u) => u.test.test(near))) kind = 'building';
  else if (CAVE.test(about)) kind = 'cave';
  else kind = 'dungeon';

  const people = readNumber(fact('population'));
  const town: TownSize =
    people != null && people > 0
      ? people < 120
        ? 'hamlet'
        : people < 1500
          ? 'village'
          : people < 8000
            ? 'town'
            : 'city'
      : /\b(city|capital|metropolis)\b/i.test(about)
        ? 'city'
        : /\b(town|port)\b/i.test(about)
          ? 'town'
          : /\b(hamlet|thorp|outpost|camp|encampment)\b/i.test(about)
            ? 'hamlet'
            : 'village';
  const lie = `${p.terrain.join(' ')} ${about}`;
  const water: TownAsk['water'] = p.terrain.includes('coastal') || /\b(harbou?r|port|docks?|coast|sea|bay|island|quay|shore)\b/i.test(about) ? 'coast' : /\b(river|ford|bridge|stream|brook|canal|ferry|falls)\b/i.test(about) ? 'river' : 'none';
  const walled = /\b(walls?|walled|gates?|ramparts?|palisade|fortified|stockade|citadel)\b/i.test(about) || ((town === 'town' || town === 'city') && p.danger !== 'safe');
  const around: TownAsk['around'] = /\b(forest|swamp|wood|woods|jungle)\b/i.test(lie) ? 'woods' : /\b(desert|arctic|mountain|underdark|planar|underwater|ash|barrens|waste)\b/i.test(lie) ? 'open' : 'fields';

  const settings: PlanSettings = {
    kind,
    seed: hash(p.id) % 2147483647 || 1,
    names: [],
    size: kind === 'building' ? (p.wealth === 'poor' ? 'small' : p.wealth === 'rich' ? 'large' : 'medium') : 'medium',
    rough: ROUGH.test(about) && !CAVE.test(near),
    ways: 'some',
    secrets: p.danger !== 'safe',
    traps: p.danger === 'deadly',
    // What it is called and what it is for say more than a word in passing in its description.
    use: Object.values(BUILDING_USES).some((u) => u.test.test(near)) ? buildingUse(near) : buildingUse(about),
    town,
    water,
    walled,
    around,
  };
  settings.names = namesFor(p, settings);
  return settings;
}

/**
 * The numbered places for a record's plan: what its text keys, then the places kept under it as records; and if there
 * are none of either, names made up to suit it (as many rooms as its "Rooms" fact says, for a dungeon).
 */
export function namesFor(p: PlaceFacts, s: Pick<PlanSettings, 'kind' | 'seed' | 'town' | 'water' | 'walled'>): string[] {
  const own = keyedNames(p.body);
  for (const c of p.children) if (own.length < MAX_NAMES && !own.some((o) => o.toLowerCase() === c.toLowerCase())) own.push(c);
  if (own.length) return own;
  const rooms = readNumber(p.fields.find(([k]) => k.toLowerCase() === 'rooms')?.[1]);
  return madeNames(s, p.name, rooms && rooms > 0 ? rooms : s.kind === 'cave' ? 6 : 8);
}

/** Whether the numbered places came from the record (its text or its own records), not made up. */
export const hasOwnNames = (p: Pick<PlaceFacts, 'body' | 'children'>) => keyedNames(p.body).length > 0 || p.children.length > 0;

// ---- The key ---------------------------------------------------------------------------------------------------------

export interface KeyLine {
  n: number;
  name: string;
  /** Its size, and how to get out of it. Empty for a place that found no room on the plan. */
  detail: string;
  onPlan: boolean;
}

/** The key to a plan: one line for each numbered place, in order. */
export function planKey(plan: Plan, names: string[]): KeyLine[] {
  const byNumber = new Map(plan.areas.map((a) => [a.n, a]));
  const count = Math.max(names.length, ...plan.areas.map((a) => a.n), 0);
  const out: KeyLine[] = [];
  for (let n = 1; n <= count; n++) {
    const a = byNumber.get(n);
    if (!a) {
      out.push({ n, name: names[n - 1] ?? `Place ${n}`, detail: '', onPlan: false });
      continue;
    }
    const size = a.feet ? (plan.kind === 'cave' ? `about ${Math.round((a.feet[0] + a.feet[1]) / 2 / 5) * 5} ft across` : feetText(a.feet)) : '';
    const exits = a.exits.length ? `${a.exits.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '';
    out.push({ n, name: a.name, detail: [a.floor, size].filter(Boolean).join(', ') + (size || a.floor ? '. ' : '') + exits, onPlan: true });
  }
  return out;
}

/** The key as Markdown, for a record's text. Read back by `keyedNames`, it gives the same names in the same order. */
export function keyMarkdown(plan: Plan, names: string[]): string {
  return planKey(plan, names)
    .map((k) => `${k.n}. **${k.name}**${k.detail ? ` ${k.detail.trim()}` : ''}`)
    .join('\n');
}

export const TOWN_LABELS = Object.fromEntries(Object.entries(TOWN_SIZES).map(([k, v]) => [k, v.label])) as Record<TownSize, string>;
