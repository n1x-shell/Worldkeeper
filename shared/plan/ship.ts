/**
 * A ship (v0.9.28): a hull and its decks, one under another on the sheet, stern to the left and bow to the right.
 * The top deck is open, with its masts, its helm and a cabin at the stern; below are the decks the crew live and
 * work on, and the hold. Bulkheads divide each deck into compartments, with a door on the centre line; a ladder joins
 * each deck to the next. It serves for the sea, the sky or the void alike: what lies around it is the lie of the land.
 */
import { edgeKey, int, rng, type Area, type Feature, type FeatureKind, type GridPlan, type Opening, type OpeningKind } from './model.js';
import { crop, furnish } from './dungeon.js';

export interface ShipAsk {
  seed: number;
  size: 'small' | 'medium' | 'large';
  /** Its compartments, if the record names them: each goes on the deck its name suits. */
  names: string[];
}

const SHIPS = {
  small: { length: 14, beam: 5, decks: ['Deck', 'Hold'], masts: [0.5] },
  medium: { length: 22, beam: 7, decks: ['Main deck', 'Lower deck', 'Hold'], masts: [0.34, 0.66] },
  large: { length: 30, beam: 9, decks: ['Main deck', 'Gun deck', 'Lower deck', 'Hold'], masts: [0.26, 0.5, 0.74] },
} as const;

/** The compartments a ship has when its record names none: for each deck, from the stern forward. */
const USUAL: Record<ShipAsk['size'], string[][]> = {
  small: [['Cuddy', 'Deck'], ['Hold']],
  medium: [['Captain’s cabin', 'Main deck'], ['Officers’ cabin', 'Galley', 'Crew quarters', 'Sail locker'], ['Stores', 'Hold', 'Brig']],
  large: [['Captain’s cabin', 'Chart room', 'Main deck'], ['Wardroom', 'Gun deck', 'Sick bay'], ['Officers’ cabins', 'Galley', 'Crew quarters', 'Armoury'], ['Stores', 'Hold', 'Brig', 'Cable tier']],
};

const OPEN = /\b(main deck|weather deck|upper deck|open deck|deck)$/i;
const ASTERN = /\b(captain\S*|master\S*|great cabin|chart|stateroom|cuddy|helm|wheelhouse|bridge)\b/i;
const BELOW = /\b(hold|brig|stores?|bilge|cargo|ballast|locker|tier|orlop|cistern|water casks?)\b/i;
const WEIGHT: [RegExp, number][] = [
  [/\b(hold|gun deck|crew|mess|cargo)\b/i, 5],
  [/\b(locker|brig|tier|closet|store|stores|cuddy|chart)\b/i, 2],
];
const weigh = (name: string) => WEIGHT.find(([re]) => re.test(name))?.[1] ?? 3;

/** What stands in a compartment, by its name. */
function shipFurnishings(name: string): FeatureKind[] {
  if (/\b(captain\S*|master\S*|great cabin|stateroom)\b/i.test(name)) return ['bed', 'table', 'chest'];
  if (/\b(chart|wardroom|mess)\b/i.test(name)) return ['table', 'shelf'];
  if (/\b(galley|kitchen)\b/i.test(name)) return ['hearth', 'table', 'barrel'];
  if (/\b(crew|quarters|cabins?|berth\w*|bunk\w*|sick bay|cuddy)\b/i.test(name)) return ['bed'];
  if (/\b(hold|stores?|cargo|locker|tier|armoury|armory)\b/i.test(name)) return ['barrel', 'shelf'];
  if (/\b(shrine|chapel)\b/i.test(name)) return ['altar'];
  return [];
}

interface Part {
  id: number;
  n: number;
  name: string;
  deck: number;
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
}

export function makeShip(ask: ShipAsk): GridPlan {
  const rnd = rng(ask.seed);
  const S = SHIPS[ask.size];
  const { beam } = S;
  const decks = S.decks.length;

  // ---- What is on each deck -----------------------------------------------------------------------------------------
  // The record's own compartments, each on the deck its name suits; or the usual ones. Each has its number in the key.
  let layout: { name: string; n: number }[][];
  if (ask.names.length) {
    layout = S.decks.map(() => []);
    const lower = decks > 2 ? Array.from({ length: decks - 2 }, (_, i) => i + 1) : [decks - 1];
    let turn = 0;
    ask.names.forEach((name, i) => {
      const deck = OPEN.test(name.trim()) || ASTERN.test(name) ? 0 : BELOW.test(name) ? decks - 1 : lower[turn++ % lower.length];
      layout[deck].push({ name, n: i + 1 });
    });
    // A ship has an open deck and a hold, whether or not they are named.
    let n = ask.names.length;
    if (!layout[0].some((p) => OPEN.test(p.name.trim()))) layout[0].push({ name: S.decks[0], n: ++n });
    layout.forEach((list, d) => !list.length && list.push({ name: d === decks - 1 ? 'Hold' : S.decks[d], n: ++n }));
    // The open deck is forward of the cabins.
    layout[0].sort((a, b) => Number(OPEN.test(a.name.trim())) - Number(OPEN.test(b.name.trim())));
  } else {
    let n = 0;
    layout = USUAL[ask.size].map((list) => list.map((name) => ({ name, n: ++n })));
  }

  // ---- The hull, deck by deck -----------------------------------------------------------------------------------------
  const [SW, SH] = [S.length + 6, decks * (beam + 4) + 4];
  const cells = new Int16Array(SW * SH);
  const parts: Part[] = [];
  const captions: GridPlan['captions'] = [];
  const openings = new Map<string, Opening>();
  const features: Feature[] = [];
  const stairCells = new Set<number>();
  const doorCells = new Set<number>();
  const exits = new Map<number, string[]>();
  const say = (id: number, exit: string) => exits.set(id, [...(exits.get(id) ?? []), exit]);
  /** How many squares wide the hull is at a place along it, from 0 at the stern to 1 at the bow: always an odd number. */
  const across = (t: number, wide: number) => {
    const f = t < 0.12 ? 0.74 + 0.26 * (t / 0.12) : t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) ** 1.8;
    return Math.max(1, 2 * Math.round((wide * f - 1) / 2) + 1);
  };
  let id = 1;
  const deckOf: { x0: number; len: number; cy: number }[] = [];
  for (let d = 0; d < decks; d++) {
    // Each deck down is a little shorter, and the hold a little narrower.
    const len = S.length - 2 * d;
    const wide = d === decks - 1 && beam > 5 ? beam - 2 : beam;
    const x0 = 3 + d;
    const cy = 3 + d * (beam + 4) + (beam >> 1);
    deckOf.push({ x0, len, cy });
    captions.push({ text: S.decks[d], x: 3 + S.length / 2, y: cy - (beam >> 1) - 0.75 });
    // Its compartments, from the stern forward, each as long as its use asks.
    const list = layout[d];
    const total = list.reduce((s, p) => s + weigh(p.name), 0);
    let from = 0;
    list.forEach((p, i) => {
      const last = i === list.length - 1;
      const share = last ? len - from : Math.max(2, Math.min(len - from - 2 * (list.length - 1 - i), Math.round((len * weigh(p.name)) / total)));
      id++;
      let [y0, y1] = [Infinity, -Infinity];
      for (let k = from; k < from + share; k++) {
        const rows = across((k + 0.5) / len, wide);
        for (let j = -(rows >> 1); j <= rows >> 1; j++) cells[(cy + j) * SW + x0 + k] = id;
        [y0, y1] = [Math.min(y0, cy - (rows >> 1)), Math.max(y1, cy + (rows >> 1))];
      }
      parts.push({ id, n: p.n, name: p.name, deck: d, x: x0 + from, y: y0, w: share, h: y1 - y0 + 1, open: d === 0 && OPEN.test(p.name.trim()) });
      // A door in the bulkhead between it and the one before, on the centre line: barred, for a brig.
      if (i > 0) {
        const kind: OpeningKind = /\bbrig\b/i.test(p.name) || /\bbrig\b/i.test(list[i - 1].name) ? 'bars' : 'door';
        const o: Opening = { x: x0 + from, y: cy, side: 'w', kind };
        openings.set(edgeKey(o), o);
        doorCells.add(cy * SW + x0 + from).add(cy * SW + x0 + from - 1);
        const word = kind === 'bars' ? 'portcullis' : 'door';
        say(id, `${word} west`);
        say(id - 1, `${word} east`);
      }
      from += share;
    });
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : cells[y * SW + x]);

  // ---- Ladders between decks, masts, the helm --------------------------------------------------------------------------
  // A ladder from each deck to the next, to one side of the centre line and turn about, so that two never meet.
  for (let d = 0; d + 1 < decks; d++) {
    const t = [0.46, 0.6, 0.4][d % 3];
    const side = d % 2 ? 1 : -1;
    for (const [deck, word] of [[d, 'ladder down'], [d + 1, 'ladder up']] as const) {
      const { x0, len, cy } = deckOf[deck];
      let x = x0 + Math.round(len * t) - (deck - d);
      // Clear of a bulkhead: both its squares in one compartment.
      for (let tries = 0; tries < 6 && (at(x, cy + side) === 0 || at(x, cy + side) !== at(x + 1, cy + side)); tries++) x++;
      if (at(x, cy + side) === 0 || at(x, cy + side) !== at(x + 1, cy + side)) continue;
      features.push({ kind: 'stairs', x, y: cy + side, w: 2, h: 1, dir: deck === d ? 1 : 3 });
      stairCells.add((cy + side) * SW + x).add((cy + side) * SW + x + 1);
      say(at(x, cy + side), word);
    }
  }
  const top = deckOf[0];
  const clear = (x: number, y: number) => !stairCells.has(y * SW + x) && !doorCells.has(y * SW + x) && !features.some((f) => x + 0.85 > f.x && x + 0.15 < f.x + f.w && y + 0.85 > f.y && y + 0.15 < f.y + f.h);
  for (const t of S.masts) {
    const x = top.x0 + Math.round(top.len * t);
    // The mast on the open deck; and where it comes down through the decks below, a post.
    for (let d = 0; d < decks; d++) {
      const { cy } = deckOf[d];
      if (at(x, cy) === 0 || !clear(x, cy)) continue;
      features.push(d === 0 ? { kind: 'mast', x: x + 0.08, y: cy + 0.08, w: 0.84, h: 0.84 } : { kind: 'pillar', x: x + 0.22, y: cy + 0.22, w: 0.56, h: 0.56 });
    }
  }
  const deck = parts.find((p) => p.open);
  if (deck) {
    // The helm at the after end of the open deck; on a great ship, a ballista in the bows.
    // (Clear of the cabin door, and of a ladder.)
    const hx = [1, 2, 3, 4].map((k) => deck.x + k).find((x) => at(x, top.cy) === deck.id && clear(x, top.cy));
    if (hx !== undefined) features.push({ kind: 'helm', x: hx + 0.1, y: top.cy + 0.1, w: 0.8, h: 0.8, dir: 1 });
    const bx = top.x0 + top.len - (ask.size === 'large' ? 5 : 4);
    if (ask.size !== 'small' && at(bx, top.cy) && clear(bx, top.cy)) features.push({ kind: 'ballista', x: bx, y: top.cy, w: 1, h: 1, dir: 1 });
    // A few casks about the deck.
    for (let i = 0; i < int(rnd, 1, 3); i++) {
      const [x, y] = [deck.x + int(rnd, 2, Math.max(2, deck.w - 4)), top.cy + (rnd() < 0.5 ? -1 : 1) * (beam >> 1)];
      if (at(x, y) === deck.id && clear(x, y)) features.push({ kind: 'barrel', x, y, w: 1, h: 1 });
    }
  }
  for (const p of parts) {
    if (p.open) continue;
    const before = features.length;
    furnish(rnd, p, features, (x, y) => at(x, y) !== p.id || !clear(x, y), shipFurnishings(p.name));
    // The hull curves in: nothing is left standing half out of it.
    for (let i = features.length - 1; i >= before; i--) {
      const f = features[i];
      let inside = true;
      for (let y = Math.floor(f.y + 0.01); y <= Math.floor(f.y + f.h - 0.01); y++) for (let x = Math.floor(f.x + 0.01); x <= Math.floor(f.x + f.w - 0.01); x++) if (at(x, y) !== p.id) inside = false;
      if (!inside) features.splice(i, 1);
    }
  }

  // ---- The key ---------------------------------------------------------------------------------------------------------
  const areas: Area[] = parts
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const { cy } = deckOf[p.deck];
      const [mx, my] = [p.x + (p.w - 1) / 2, cy];
      let spot: [number, number] = [Math.floor(mx), cy];
      let best = Infinity;
      for (let y = p.y; y < p.y + p.h; y++)
        for (let x = p.x; x < p.x + p.w; x++) {
          const k = Math.hypot(x - mx, y - my);
          if (at(x, y) === p.id && clear(x, y) && k < best - 1e-9) [spot, best] = [[x, y], k];
        }
      return { n: p.n, name: p.name, x: spot[0] + 0.5, y: spot[1] + 0.5, feet: [p.w * 5, p.h * 5] as [number, number], exits: [...new Set(exits.get(p.id) ?? [])], floor: S.decks[p.deck] };
    });
  return crop({ cells, n: SW, rows: SH, rough: new Set(), openings: [...openings.values()], features, areas, kind: 'ship', rock: new Uint8Array(SW * SH), captions, margin: 2 });
}
