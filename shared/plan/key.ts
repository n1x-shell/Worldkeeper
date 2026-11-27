/**
 * The key to a plan (v0.9.25): what is in each numbered place. Each place has words to read aloud and any number of
 * entries: an encounter, a trap, a puzzle, a hazard, loot, a secret, a clue, a person, or a note of anything else.
 * The GM adds, changes and removes them; the app can suggest some.
 *
 * The key is kept with the plan. A place in it has an ID of its own, so what is keyed to it stays with it when it is
 * renamed.
 */
import { pick, type Plan, type Rnd } from './model.js';

export const KEY_KINDS = ['encounter', 'trap', 'puzzle', 'hazard', 'loot', 'secret', 'clue', 'person', 'note'] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

/** How each kind is named, and the letter that marks it on the GM's copy of the plan. */
export const KEY_KIND_INFO: Record<KeyKind, { label: string; mark: string; hint: string }> = {
  encounter: { label: 'Encounter', mark: 'E', hint: 'Who or what is here, and what they do.' },
  trap: { label: 'Trap', mark: 'T', hint: 'What sets it off, what it does, and how it is found or stopped.' },
  puzzle: { label: 'Puzzle', mark: 'P', hint: 'What has to be worked out, and what happens when it is.' },
  hazard: { label: 'Hazard', mark: 'H', hint: 'A danger of the place itself: bad air, a rotten floor, deep water.' },
  loot: { label: 'Loot', mark: 'L', hint: 'What can be carried away.' },
  secret: { label: 'Secret', mark: 'S', hint: 'What is hidden here, and how it comes to light.' },
  clue: { label: 'Clue', mark: 'C', hint: 'What the party can learn here.' },
  person: { label: 'Person', mark: 'N', hint: 'Somebody to meet, and what they want.' },
  note: { label: 'Note', mark: '', hint: 'Anything else worth keying.' },
};

export interface KeyCreature {
  name: string;
  count: number;
  /** Its stat block in the GM's books or the world's own, if it was picked from them. */
  id?: string;
}
export interface KeyThing {
  name: string;
  count: number;
}

/** One thing keyed to a place. Which of the particulars are used depends on its kind. */
export interface KeyItem {
  id: string;
  kind: KeyKind;
  /** A few words: "Poison needle", "The warden's ghost". */
  title: string;
  /** The rest, as the GM writes it. */
  text: string;
  /** An encounter's creatures. */
  creatures?: KeyCreature[];
  /** A trap's, puzzle's or hazard's difficulty to notice, avoid or solve. */
  dc?: number | null;
  /** A trap's or hazard's harm, as dice and a kind: "2d10 piercing". */
  damage?: string;
  /** Loot: coin, as written ("120 gp"), and things. */
  coins?: string;
  things?: KeyThing[];
  /** A person's (or any) record. */
  entity?: string | null;
}

export type Storey = 'ground' | 'upper' | 'under';

export interface KeyRoom {
  id: string;
  name: string;
  /**
   * The name the plan was drawn for. A room's name shapes it (a great hall is large, a crypt has tombs): renaming it
   * does not redraw the plan until the GM asks.
   */
  drawnAs: string;
  /** In a building, the storey it is on. */
  floor?: Storey;
  /** Words to read aloud on entering. */
  aloud: string;
  items: KeyItem[];
}

export const newId = () => Math.random().toString(36).slice(2, 10);
export const newItem = (kind: KeyKind, more: Partial<KeyItem> = {}): KeyItem => ({ id: newId(), kind, title: '', text: '', ...more });
export const newRoom = (name: string, floor?: Storey): KeyRoom => ({ id: newId(), name, drawnAs: name, aloud: '', items: [], ...(floor ? { floor } : {}) });

const FLOOR_OF: [RegExp, Storey][] = [
  [/\b(cellar|crypt|undercroft|basement|below)\b/i, 'under'],
  [/\b(upper|second|third|top|loft|attic)\b/i, 'upper'],
];
/** The storey a plan's own title for it means ("Upper floor", "Crypt"). */
export const storeyNamed = (title: string | undefined): Storey => FLOOR_OF.find(([re]) => re.test(title ?? ''))?.[1] ?? 'ground';

/** A key for a plan nobody has keyed: one empty place for each numbered place, named as the plan has them. */
export function roomsFor(plan: Plan, names: string[]): KeyRoom[] {
  const byNumber = new Map(plan.areas.map((a) => [a.n, a]));
  const count = Math.max(names.length, ...plan.areas.map((a) => a.n), 0);
  const out: KeyRoom[] = [];
  for (let n = 1; n <= count; n++) {
    const a = byNumber.get(n);
    out.push(newRoom(names[n - 1] ?? a?.name ?? `Place ${n}`, plan.kind === 'building' ? storeyNamed(a?.floor) : undefined));
  }
  return out;
}

/**
 * The names a plan is drawn from, for these places. A building's carry their storeys (`upper:Solar`), which
 * `storeyAndName` reads back.
 */
export const drawnNames = (rooms: KeyRoom[], building: boolean): string[] => rooms.map((r) => (building && r.floor ? `${r.floor}:${r.drawnAs}` : r.drawnAs));
export function storeyAndName(name: string): { floor: Storey | null; name: string } {
  const m = /^(ground|upper|under):(.*)$/.exec(name);
  return m ? { floor: m[1] as Storey, name: m[2] } : { floor: null, name };
}

/**
 * Bring a key into line with a list of names (the record's text, as it is now): places of the same name keep what is
 * keyed to them, new names get empty places, and the order is the list's. `left` is what was dropped that had
 * anything keyed to it.
 */
export function syncRooms(rooms: KeyRoom[], names: string[]): { rooms: KeyRoom[]; left: KeyRoom[] } {
  const pool = [...rooms];
  const out = names.map((name) => {
    const i = pool.findIndex((r) => r.name.toLowerCase() === name.toLowerCase());
    return i >= 0 ? pool.splice(i, 1)[0] : newRoom(name);
  });
  return { rooms: out, left: pool.filter((r) => r.items.length || r.aloud.trim()) };
}

/** Whether a place has anything keyed to it. */
export const isKeyed = (r: KeyRoom) => r.items.length > 0 || r.aloud.trim() !== '';
/** Whether any place's name has changed since the plan was drawn for it. */
export const renamed = (rooms: KeyRoom[]) => rooms.some((r) => r.name.trim() !== r.drawnAs);

/** The letters that mark what is keyed to each numbered place, for the GM's copy: `{ 3: 'ET', 7: 'L' }`. */
export function roomMarks(rooms: KeyRoom[]): Record<number, string> {
  const out: Record<number, string> = {};
  rooms.forEach((r, i) => {
    const marks = [...new Set(r.items.map((it) => KEY_KIND_INFO[it.kind].mark).filter(Boolean))].join('');
    if (marks) out[i + 1] = marks;
  });
  return out;
}

const several = (n: number, name: string) => (n > 1 ? `${n} × ${name}` : name);

/** An entry in a line: "Trap (DC 13, 2d10 piercing): Poison needle. In the lock of the chest." */
export function itemLine(it: KeyItem): { label: string; text: string } {
  const info = KEY_KIND_INFO[it.kind];
  const bits: string[] = [];
  if (it.dc) bits.push(`DC ${it.dc}`);
  if (it.damage?.trim()) bits.push(it.damage.trim());
  const label = `${info.label}${bits.length ? ` (${bits.join(', ')})` : ''}`;
  const parts: string[] = [];
  if (it.title.trim()) parts.push(it.title.trim());
  if (it.creatures?.length) parts.push(it.creatures.map((c) => several(c.count, c.name)).join(', '));
  const loot = [it.coins?.trim(), ...(it.things ?? []).map((t) => several(t.count, t.name))].filter(Boolean);
  if (loot.length) parts.push(loot.join('; '));
  if (it.text.trim()) parts.push(it.text.trim());
  const text = parts
    .map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`))
    .join(' ')
    .replace(/\s*\n+\s*/g, ' ');
  return { label, text };
}

/**
 * The key as Markdown, for the record's text: a heading for each place with its size and ways out, the words to read
 * aloud as a quotation, and a line for each entry. Read back by `keyedNames`, it gives the same places in order.
 */
export function fullKeyMarkdown(rooms: KeyRoom[], details: { detail: string; onPlan: boolean }[]): string {
  return rooms
    .map((r, i) => {
      const d = details[i];
      const lines = [`### ${i + 1}. ${r.name}`, ''];
      if (d?.detail) lines.push(`*${d.detail.trim()}*`, '');
      if (r.aloud.trim()) lines.push(...r.aloud.trim().split(/\n/).map((l) => `> ${l}`), '');
      for (const it of r.items) {
        const { label, text } = itemLine(it);
        lines.push(`- **${label}:** ${text}`);
      }
      return lines.join('\n').trimEnd();
    })
    .join('\n\n');
}

// ---- Ideas, for a GM who wants a start -------------------------------------------------------------------------------

export type Severity = 'safe' | 'risky' | 'deadly';

/** How hard a trap is to notice or avoid, and how much it hurts, for a party of this level in a place this dangerous. */
export function trapNumbers(level: number, danger: Severity, rnd: Rnd): { dc: number; dice: string } {
  const tier = level >= 17 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0;
  const dice = { safe: ['1d10', '2d10', '4d10', '10d10'], risky: ['2d10', '4d10', '10d10', '18d10'], deadly: ['4d10', '10d10', '18d10', '24d10'] }[danger][tier];
  const [lo, hi] = { safe: [10, 11], risky: [12, 15], deadly: [16, 19] }[danger];
  return { dc: lo + Math.floor(rnd() * (hi - lo + 1)), dice };
}

const TRAPS: { title: string; text: string; harm: string }[] = [
  { title: 'Pit under a false floor', text: 'The flagstones give way under the second person to cross. A careful look finds the seam; a pole finds the hollow.', harm: 'bludgeoning' },
  { title: 'Needle in the lock', text: 'Turning anything but the right key drives a needle into the hand. Seen by anyone who looks into the keyhole with a light.', harm: 'poison' },
  { title: 'Scything blade', text: 'A blade swings out of the wall at waist height when the pressure plate before the door is trodden on. The slot it comes from is plain once looked for.', harm: 'slashing' },
  { title: 'Darts from the wall', text: 'A wire at ankle height looses darts from holes in the far wall along the whole passage. Cutting the wire with care makes it safe.', harm: 'piercing' },
  { title: 'Falling block', text: 'Lifting the object on the pedestal lets a block of stone drop from the ceiling. A weight left in its place holds the catch.', harm: 'bludgeoning' },
  { title: 'Jet of flame', text: 'Opening the door without first pressing the carved rose beside it fills the doorway with fire. The scorching on the frame gives it away.', harm: 'fire' },
  { title: 'Flooding room', text: 'The doors drop shut and water pours from the mouths of the carvings. It fills in six rounds; the drain is under the grate in the middle and is choked with silt.', harm: 'bludgeoning' },
  { title: 'Collapsing roof', text: 'The props are rotten. Any hard blow on the walls, or shouting, brings the roof down on everyone in the room.', harm: 'bludgeoning' },
  { title: 'Warding sign', text: 'A sign cut into the threshold bursts when a living creature crosses it unspoken to. It glows faintly to those who can see magic.', harm: 'force' },
  { title: 'Spiked grate', text: 'The floor is a grate that tips. Those on it slide into the spikes below unless they catch the edge.', harm: 'piercing' },
  { title: 'Sleeping smoke', text: 'A flagstone releases a sweet smoke from the censers overhead. Those who breathe it must stay awake or sleep for ten minutes; no harm otherwise.', harm: '' },
  { title: 'Rolling stone', text: 'A stone the width of the passage rolls down it from the far end when the tripwire is crossed. There is a niche to step into half way along.', harm: 'bludgeoning' },
  { title: 'Alarm', text: 'A hidden wire rings bells elsewhere. Nobody here is hurt, and everybody elsewhere is warned.', harm: '' },
  { title: 'Net and hook', text: 'A net drops and hauls whoever stands beneath to the ceiling, where they hang until cut down. It takes a blade and a minute.', harm: '' },
];
const PUZZLES: { title: string; text: string }[] = [
  { title: 'Statues that turn', text: 'Four statues stand on pivots. The door opens when each faces the thing it lost: the mason his hammer, the queen her crown, and so on, shown in the worn reliefs around the walls.' },
  { title: 'Weighted plates', text: 'Three plates in the floor must bear weight at once, and the party has to find it: bodies, rubble, or the statue from the next room.' },
  { title: 'The door that asks', text: 'A face in the door asks a question whose answer is written elsewhere in this place, for those who read the walls.' },
  { title: 'Mirrors and a beam', text: 'A beam of light from a shaft must be turned by three mirrors onto the stone above the door. One mirror is missing and one is cracked.' },
  { title: 'Levers in order', text: 'Five levers, each marked with a beast. Pulled in the order the beasts are hunted in the frieze, they open the way; pulled wrong, they reset with a clang that carries.' },
  { title: 'The missing piece', text: 'A mosaic lacks one tile, and the door behind it will not open until the picture is whole. The tile is in another room, kept by someone who thinks it lucky.' },
  { title: 'Chimes', text: 'Seven chimes hang in a row. Struck in the tune that the wind plays through the shaft above, they open the panel.' },
  { title: 'Matching signs', text: 'Each of six alcoves has a sign, and six stones carry the same signs. A stone in the wrong alcove grows too hot to hold.' },
  { title: 'Water and weights', text: 'Filling the basin to the mark lifts the gate. The three jars hold odd amounts, and only one way of pouring between them reaches the mark.' },
  { title: 'The watched door', text: 'The door opens only while nobody is looking at it. The carved eyes on it count too, and can be covered.' },
  { title: 'Names of the dead', text: 'A list of names is cut into the wall, with one gap. Speaking the missing name, which is on a tomb elsewhere here, opens the way.' },
  { title: 'Bridge of sounds', text: 'The floor is marked with letters; the wrong ones fall away. The right ones spell a word that the party has heard said in this place.' },
];
const HAZARDS: { title: string; text: string; harm: string }[] = [
  { title: 'Bad air', text: 'The air is stale and heavy. A flame burns low and blue. Anyone who stays longer than ten minutes grows faint and must leave or fall senseless.', harm: '' },
  { title: 'Rotten floor', text: 'The boards will not bear an armoured person. They give way into the room or the pit below.', harm: 'bludgeoning' },
  { title: 'Deep water', text: 'The floor is under four feet of black water, cold enough to slow the limbs. Something has been living in it.', harm: 'cold' },
  { title: 'Loose rubble', text: 'The slope of fallen stone shifts underfoot. Crossing fast means a fall and a noise.', harm: 'bludgeoning' },
  { title: 'Spores', text: 'A touch sends up a cloud from the growths on the walls. Those who breathe it cough and see things that are not there for an hour.', harm: 'poison' },
  { title: 'Bitter cold', text: 'Frost covers everything, and breath freezes on the lips. An hour here without warm clothes or a fire wearies even the strong.', harm: 'cold' },
  { title: 'Narrow ledge', text: 'The way is a ledge a foot wide over a drop. Two cannot pass, and a fight here is a fight on the edge.', harm: 'bludgeoning' },
  { title: 'Slick stone', text: 'Water and slime make the floor treacherous. Running or fighting here risks a fall.', harm: '' },
  { title: 'Unsteady roof', text: 'Dust trickles down at every loud noise. A fight in here may bring down a part of it.', harm: 'bludgeoning' },
  { title: 'Scalding steam', text: 'A vent in the floor lets out steam every few minutes, filling the room to the height of a man.', harm: 'fire' },
];

/** A trap, a puzzle or a hazard to start from, with numbers that fit the party and the place. */
export function ideaFor(kind: 'trap' | 'puzzle' | 'hazard', level: number, danger: Severity, rnd: Rnd): KeyItem {
  if (kind === 'puzzle') {
    const p = pick(rnd, PUZZLES);
    return newItem('puzzle', { title: p.title, text: p.text, dc: trapNumbers(level, danger, rnd).dc });
  }
  const t = pick(rnd, kind === 'trap' ? TRAPS : HAZARDS);
  const n = trapNumbers(level, kind === 'hazard' && danger === 'deadly' ? 'risky' : danger, rnd);
  return newItem(kind, { title: t.title, text: t.text, dc: n.dc, damage: t.harm ? `${n.dice} ${t.harm}` : '' });
}
