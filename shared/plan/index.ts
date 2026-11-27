/**
 * From a place's record to its plan: what kind of plan suits it, what its text says is in it, the choices the GM can
 * change, and the key that goes with the drawing.
 */
import { feetText, rng, type GridPlan, type Land, type Plan, type PlanKind } from './model.js';
import { makeCave, makeDungeon } from './dungeon.js';
import { BUILDING_USES, buildingFurnishings, buildingUse, makeBuilding } from './building.js';
import { TOWN_SIZES, makeSettlement, placeNames, type TownAsk, type TownSize } from './settlement.js';
import { roomNames } from './names.js';
import { fullKeyMarkdown, roomsFor, type KeyRoom } from './key.js';
import { unpack, type PackedPlan } from './edit.js';
import { furnishAgain, keptRooms } from './again.js';
import { DISTRICTS, districtAt, withDistricts } from './districts.js';
import { lieGrid, lieTown } from './land.js';
import { makeShip } from './ship.js';

export * from './model.js';
export { drawPlan, DRAW_DEFAULTS, ART_KINDS, type DrawOptions, type PlanArt } from './draw.js';
export { BUILDING_USES } from './building.js';
export { TOWN_SIZES, type TownSize } from './settlement.js';
export * from './key.js';
export * from './edit.js';
export * from './pieces.js';
export { DISTRICTS, districtPlan } from './districts.js';

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
  /**
   * What is in each numbered place, once the GM has keyed any of it. Then the plan's places are these, and `names`
   * is what the plan is drawn from for them.
   */
  key?: KeyRoom[];
  /**
   * The plan as the GM has changed it by hand (v0.9.26). Once this is here the plan is this drawing, as it stands:
   * the seed and the choices above made it at first and no longer do.
   */
  drawn?: PackedPlan;
  /** For a place under another (v0.9.27): where its way in comes from, in words ("the wine cellar of the Gilded Flagon"). */
  from?: string;
  /** A town or a city drawn in districts. */
  districts?: boolean;
  /** What the GM calls each district, in the plan's order, and the record that is its own, if it has one. */
  wards?: Ward[];
  /** The lie of the land (v0.9.28), if it is not ordinary ground. */
  land?: Land;
}
export interface Ward {
  name: string;
  record?: string;
}

export const PLAN_LABELS: Record<PlanKind, string> = { dungeon: 'Dungeon', cave: 'Cave', building: 'Building', settlement: 'Settlement', ship: 'Ship' };
/** What each lie of the land is called, and what it does to a plan. */
export const LAND_LABELS: Record<Land, { label: string; hint: string }> = {
  plain: { label: 'Ordinary ground', hint: '' },
  overgrown: { label: 'Overgrown', hint: 'Growth on the floors and among the houses; walls the roots have broken.' },
  shattered: { label: 'Shattered', hint: 'A rift runs across it, bridged where a passage or a great road meets it.' },
  aloft: { label: 'Aloft, in the sky', hint: 'An island in the air: the ground ends a little way out, and there are clouds beyond.' },
  adrift: { label: 'Adrift, between worlds', hint: 'Fragments in the mist. A dungeon’s passages are gone: doors that share a letter open on one another.' },
  unearthly: { label: 'Unearthly', hint: 'Nothing is straight, and there are more ways round than there should be.' },
  void: { label: 'The void, among the stars', hint: 'A black sheet of stars around it.' },
};
const ROOMY = { small: 0.78, medium: 1, large: 1.32 };
const LOOPS = { one: 0, some: 0.5, many: 1 };
export const MAX_NAMES = 40;

export function makePlan(s: PlanSettings): Plan {
  return withWards(s.drawn ? unpack(s.drawn) : generate(s), s.wards);
}
/** A settlement's districts called what the GM calls them. */
export function withWards(plan: Plan, wards: Ward[] | undefined): Plan {
  if (plan.kind !== 'settlement' || !plan.districts || !wards?.length) return plan;
  return { ...plan, districts: plan.districts.map((d, i) => (wards[i]?.name.trim() ? { ...d, name: wards[i].name.trim() } : d)) };
}

/**
 * A dungeon drawn again around the rooms marked to be kept: they stay where they are with what is in them and the doors
 * between them; every other room is set down afresh, and the passages are all cut anew. `names` are the places of the
 * key, in order. Null for any other kind of plan.
 */
export function redrawRest(plan: Plan, s: PlanSettings, names: string[], seed: number): GridPlan | null {
  if (plan.kind !== 'dungeon') return null;
  const { kept, openings } = keptRooms(plan);
  const list = names.slice(0, MAX_NAMES);
  return makeDungeon({ seed, names: list, roomy: ROOMY[s.size], rough: plan.rough.size > 0, loops: LOOPS[s.ways], secrets: s.secrets, traps: s.traps ? Math.max(1, Math.round(list.length / 4)) : 0, kept, keptOpenings: openings });
}

/** One room's furnishings set down afresh, to suit the name it has now. Null if the place is not a room. */
export function refurnish(plan: Plan, s: PlanSettings, n: number, name: string, seed: number): GridPlan | null {
  if (plan.kind === 'settlement') return null;
  return furnishAgain(plan, n, name, seed, plan.kind === 'building' ? buildingFurnishings(name, s.use) : undefined);
}

/** A plan made afresh from its seed and choices, whatever has been drawn by hand. */
export function generate(s: PlanSettings): Plan {
  const land = s.land ?? 'plain';
  const names = s.names.slice(0, MAX_NAMES);
  const from = s.from ? { from: s.from } : {};
  // On unearthly ground there are more ways round than there should be.
  const loops = land === 'unearthly' ? 1 : LOOPS[s.ways];
  if (s.kind === 'settlement') {
    const town = lieTown(makeSettlement({ seed: s.seed, names, size: s.town, water: s.water, walled: s.walled, around: s.around }), land, s.seed);
    // The districts are worked out from the town as it stands on its ground. (A town turned about has them turned with it.)
    return s.districts ? withDistricts(town, DISTRICTS[s.town]) : town;
  }
  const plan =
    s.kind === 'cave'
      ? makeCave({ seed: s.seed, names, roomy: ROOMY[s.size], loops, ...from })
      : s.kind === 'building'
        ? makeBuilding({ seed: s.seed, use: s.use, names, roomy: s.size === 'small' ? 0.85 : s.size === 'large' ? 1.2 : 1 })
        : s.kind === 'ship'
          ? makeShip({ seed: s.seed, size: s.size, names })
          : makeDungeon({ seed: s.seed, names, roomy: ROOMY[s.size], rough: s.rough, loops, secrets: s.secrets, traps: s.traps ? Math.max(1, Math.round(names.length / 4)) : 0, ...from });
  return lieGrid(plan, land, s.seed);
}

/**
 * Names for a plan nobody has keyed: rooms that suit a place of this name, the usual rooms of a building of this use
 * (none are given: the building's own are used), or the places a settlement of this size has.
 */
export function madeNames(s: Pick<PlanSettings, 'kind' | 'seed' | 'town' | 'water' | 'walled'>, about: string, count: number): string[] {
  const rnd = rng(s.seed + 101);
  // A building and a ship have the rooms of their kind until the record or the GM names others.
  if (s.kind === 'building' || s.kind === 'ship') return [];
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
/** A heading inside a key is a name whole: "3. St. Oda's chapel" is "St. Oda's chapel". */
const headingName = (text: string) =>
  text
    .replace(/^\s*(?:(?:room|area|level|site)\s+)?\d{1,3}\s*[.):–—-]\s*/i, '')
    .replace(/[.:,;]+$/, '')
    .slice(0, 60)
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
  // Within a key, places are its smaller headings if it has any (the lines under one are what is in that place);
  // else its numbered lines and its lines that begin in bold.
  let depth = 0;
  let headings: string[] = [];
  let listed: string[] = [];
  const close = () => {
    for (const n of headings.length ? headings : listed) add(n);
    [headings, listed] = [[], []];
  };
  for (const line of lines) {
    const h = /^(#{1,5})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const text = clean(h[2]);
      if (depth && h[1].length > depth) headings.push(headingName(text));
      else {
        close();
        depth = KEY_HEADING.test(text) ? h[1].length : 0;
      }
      continue;
    }
    if (!depth || headings.length) continue;
    const numbered = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(\*\*.+?\*\*.*)$/.exec(line);
    if (numbered) listed.push(itemName(numbered[1]));
    else if (bullet) listed.push(itemName(bullet[1]));
  }
  close();
  if (out.length) return out;
  for (const line of lines) {
    const h = /^#{1,5}\s+(?:(?:room|area|level|site)\s+)?(\d{1,3})\s*[.):–—-]\s*(.+?)\s*#*\s*$/i.exec(line);
    if (h) add(headingName(clean(h[2])));
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
  /** What its realm is called, if that is known: it may say what ground the place is on. */
  realm?: string;
  terrain: string[];
  danger: 'safe' | 'risky' | 'deadly';
  wealth: 'poor' | 'modest' | 'rich';
}

const CAVE = /\b(caves?|caverns?|grotto|grottoes|warren|burrows?|den|sinkhole|chasm|underdark)\b/i;
const ROUGH = /\b(mines?|quarry|delve|diggings|tunnels|sewers?|catacombs?)\b/i;
const DUNGEON = /\b(dungeon|vault|tomb|crypt|ruins?|ruined|lair|labyrinth|maze|undercity|depths|sunken|barrow|necropolis|prison|oubliette|asylum)\b/i;
const TOWN = /\b(hamlet|village|town|city|capital|metropolis|thorp|outpost|camp|encampment|settlement|port|refuge)\b/i;

const SHIP = /\b(ship|galley|galleon|cog|caravel|carrack|sloop|skiff|barge|longship|frigate|schooner|brigantine|airship|skyship|voidship|starship|shipwreck|boat|dhow|trireme|man-of-war)\b/i;
const BOAT = /\b(boat|skiff|sloop|cutter|launch|barge|longboat|ferry|dhow|cog)\b/i;
const GREAT_SHIP = /\b(galleon|man-of-war|great ship|flagship|carrack|dreadnought|treasure ship)\b/i;
/** Words that say what ground a place is on: the first that fits. */
const LIES: [RegExp, Land][] = [
  [/\b(void|among the stars|between the stars|star-?sea|astral sea|voidship|starship)\b/i, 'void'],
  [/\b(floating|aloft|sky-?ship|airship|in the sky|skyborne|sky-?city|cloud-?borne|above the clouds|among the clouds|in the clouds|hovers?|hovering)\b/i, 'aloft'],
  [/\b(ethereal|adrift|between worlds|the between|unmoored|limbo)\b/i, 'adrift'],
  [/\b(unearthly|eldritch|aberrant|otherworldly|non-euclidean|wrong angles|madness)\b/i, 'unearthly'],
  [/\b(shattered|sundered|riven|cloven|fractured|the rift|a rift|great rift)\b/i, 'shattered'],
  [/\b(overgrown|fung\w*|spores?|mycel\w*|the bloom|vine-?choked|jungle-?choked|moulder\w*|molder\w*)\b/i, 'overgrown'],
];

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
  else if (SHIP.test(near) && !Object.values(BUILDING_USES).some((u) => u.test.test(near))) kind = 'ship';
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
    size: kind === 'building' ? (p.wealth === 'poor' ? 'small' : p.wealth === 'rich' ? 'large' : 'medium') : kind === 'ship' ? (BOAT.test(near) ? 'small' : GREAT_SHIP.test(near) ? 'large' : 'medium') : 'medium',
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
    // A town or a city is drawn in districts.
    ...(kind === 'settlement' && (town === 'town' || town === 'city') ? { districts: true } : {}),
  };
  // The lie of the land, from what the record is called, what it is for, how it begins, and the realm it is in.
  // (Only how it begins: a town that mentions a rift three paragraphs down is not on one.)
  const first = start.split(/(?<=[.!?])\s/)[0].slice(0, 220);
  const ground = LIES.find(([re]) => re.test(`${near}. ${first} ${p.realm ?? ''}`))?.[1];
  if (ground) settings.land = ground;
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
    // A place is called what the key calls it now, which may not be the name the plan was drawn for.
    const ward = plan.kind === 'settlement' ? plan.districts?.[districtAt(plan, a.x, a.y)]?.name : undefined;
    const where = [a.floor, ward, size].filter(Boolean).join(', ');
    out.push({ n, name: names[n - 1] ?? a.name, detail: where + (where ? '. ' : '') + exits, onPlan: true });
  }
  return out;
}

/**
 * The key as Markdown, for a record's text, for a plan nothing has been keyed to: each place with its size and its
 * ways out. Read back by `keyedNames`, it gives the same names in the same order.
 */
export function keyMarkdown(plan: Plan, names: string[]): string {
  return fullKeyMarkdown(roomsFor(plan, names), planKey(plan, names));
}

export const TOWN_LABELS = Object.fromEntries(Object.entries(TOWN_SIZES).map(([k, v]) => [k, v.label])) as Record<TownSize, string>;
