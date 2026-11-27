/**
 * A plan changed by hand (v0.9.26). Once the GM moves a wall, the plan is no longer made afresh from its number: it is
 * its own drawing, kept as it stands. This file is that drawing put away and brought back (`pack`, `unpack`), and
 * every change that can be made to it: rooms added, moved, resized and taken away; passages cut; squares painted and
 * rubbed out; doors put in walls; things set down in rooms; a settlement's buildings moved, turned, added and removed.
 *
 * Every change gives a new plan and leaves the old one as it was, so that each step can be undone.
 */
import { DIRS, DIR_WORDS, type Area, type Feature, type FeatureKind, type GridPlan, type Opening, type OpeningKind, type Plan, type Pt, type TownPlan } from './model.js';

// ---- Put away and brought back ---------------------------------------------------------------------------------------

/** A plan on squares as plain numbers and lists, for keeping. Runs of the same square are written once with a count. */
export interface PackedGrid {
  kind: GridPlan['kind'];
  w: number;
  h: number;
  feet: number;
  cells: number[];
  rock: number[];
  rough: number[];
  openings: Opening[];
  features: Feature[];
  areas: Area[];
  captions: GridPlan['captions'];
}
export type PackedPlan = PackedGrid | TownPlan;

const runs = (xs: ArrayLike<number>): number[] => {
  const out: number[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j < xs.length && xs[j] === xs[i]) j++;
    out.push(xs[i], j - i);
    i = j;
  }
  return out;
};
const unrun = (rs: number[], into: Int16Array | Uint8Array) => {
  let at = 0;
  for (let i = 0; i + 1 < rs.length && at < into.length; i += 2) {
    into.fill(rs[i], at, Math.min(into.length, at + rs[i + 1]));
    at += rs[i + 1];
  }
  return into;
};

export function pack(plan: Plan): PackedPlan {
  if (plan.kind === 'settlement') return plan;
  return { kind: plan.kind, w: plan.w, h: plan.h, feet: plan.feet, cells: runs(plan.cells), rock: runs(plan.rock), rough: [...plan.rough], openings: plan.openings, features: plan.features, areas: plan.areas, captions: plan.captions };
}
export function unpack(p: PackedPlan): Plan {
  if (p.kind === 'settlement') return p;
  return {
    kind: p.kind,
    w: p.w,
    h: p.h,
    feet: p.feet,
    cells: unrun(p.cells, new Int16Array(p.w * p.h)) as Int16Array,
    rough: new Set(p.rough),
    rock: unrun(p.rock, new Uint8Array(p.w * p.h)) as Uint8Array,
    openings: p.openings.map((o) => ({ ...o })),
    features: p.features.map((f) => ({ ...f })),
    areas: p.areas.map((a) => ({ ...a, exits: [...a.exits] })),
    captions: p.captions.map((c) => ({ ...c })),
  };
}

// ---- Plans on squares ------------------------------------------------------------------------------------------------

/** The passage's number in a dungeon: every passage is one region, so that they run into each other. */
export const PASSAGE = 1;

const copy = (p: GridPlan): GridPlan => ({
  ...p,
  cells: p.cells.slice(),
  rock: p.rock.slice(),
  rough: new Set(p.rough),
  openings: p.openings.map((o) => ({ ...o })),
  features: p.features.map((f) => ({ ...f })),
  areas: p.areas.map((a) => ({ ...a, exits: [...a.exits] })),
  captions: p.captions.map((c) => ({ ...c })),
});
export const regionAt = (p: GridPlan, x: number, y: number) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.cells[Math.floor(y) * p.w + Math.floor(x)]);
/** The region a numbered place stands in: the one under its number. */
export const regionOf = (p: GridPlan, a: Area) => regionAt(p, a.x, a.y);
/** The numbered place whose room this region is (a cave is all one region: none). */
export const areaIn = (p: GridPlan, region: number) => (region > PASSAGE && p.kind !== 'cave' ? p.areas.find((a) => regionOf(p, a) === region) : undefined);

/** The squares a region covers, and whether they fill the oblong around them. */
export function roomBox(p: GridPlan, region: number): { x: number; y: number; w: number; h: number; whole: boolean; squares: number } | null {
  let [x0, y0, x1, y1, n] = [p.w, p.h, -1, -1, 0];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.cells[y * p.w + x] === region) ([x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]), n++;
  return n ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, whole: n === (x1 - x0 + 1) * (y1 - y0 + 1), squares: n } : null;
}

/** The two squares an opening lies between: above and below it, or left and right of it. */
const across = (o: { x: number; y: number; side: 'n' | 'w' }): [Pt, Pt] => (o.side === 'n' ? [[o.x, o.y - 1], [o.x, o.y]] : [[o.x - 1, o.y], [o.x, o.y]]);
/** Whether an opening is in a wall: between two different rooms, in a building's outside wall, or a way out at the sheet's edge. */
export function standsInWall(p: GridPlan, o: Opening): boolean {
  const [a, b] = across(o).map(([x, y]) => regionAt(p, x, y));
  if (o.kind === 'open') return (a === 0) !== (b === 0);
  if (a === b) return false;
  return (a !== 0 && b !== 0) || p.kind === 'building';
}

/** The middle of the square a thing stands on. */
const footOf = (f: Feature): Pt => [Math.floor(f.x + f.w / 2), Math.floor(f.y + f.h / 2)];
/** The thing on a square, if any: its place in the list. */
export function featureAt(p: GridPlan, x: number, y: number): number {
  for (let i = p.features.length - 1; i >= 0; i--) {
    const f = p.features[i];
    if (x + 0.85 > f.x && x + 0.15 < f.x + f.w && y + 0.85 > f.y && y + 0.15 < f.y + f.h) return i;
  }
  return -1;
}

const WORD: Partial<Record<OpeningKind, string>> = { door: 'door', double: 'door', arch: 'archway', secret: 'secret door', bars: 'portcullis' };

/**
 * After a change: openings that no longer stand in a wall and things no longer on a floor are taken away; a number
 * left on solid ground moves to the nearest square of its room, or goes if the room has; and each place's size and
 * ways out are worked out again from the drawing. `before` is the plan as it was, to know which room each number had.
 */
function settle(p: GridPlan, before: GridPlan): GridPlan {
  // One opening to a place in a wall: a door moved onto another's place gives way to it.
  const taken = new Set<string>();
  p.openings = p.openings.filter((o) => {
    const at = `${o.x},${o.y},${o.side}`;
    if (taken.has(at) || !standsInWall(p, o)) return false;
    taken.add(at);
    return true;
  });
  p.features = p.features.filter((f) => {
    const [x, y] = footOf(f);
    return regionAt(p, x, y) !== 0;
  });
  const kept: Area[] = [];
  for (const a of p.areas) {
    if (regionAt(p, a.x, a.y) !== 0) {
      kept.push(a);
      continue;
    }
    // Its square is gone: the nearest square of the room it had (or, in a cave, any floor close by).
    const was = before.areas.find((b) => b.n === a.n);
    const region = was ? regionOf(before, was) : 0;
    let best: Pt | null = null;
    let d = Infinity;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const r = p.cells[y * p.w + x];
        if (r === 0 || (p.kind !== 'cave' && r !== region)) continue;
        const k = Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y);
        if (k < d && (p.kind !== 'cave' || k <= 4)) [best, d] = [[x, y], k];
      }
    if (best) kept.push({ ...a, x: best[0] + 0.5, y: best[1] + 0.5 });
  }
  p.areas = kept;
  return describe(p);
}

/** Each numbered place's size and ways out, read from the drawing. What it had that no door explains (stairs, the way in) is kept. */
export function describe(p: GridPlan): GridPlan {
  if (p.kind === 'cave') return p;
  for (const a of p.areas) {
    const region = regionOf(p, a);
    const box = region > PASSAGE ? roomBox(p, region) : null;
    if (!box) continue;
    a.feet = [box.w * p.feet, box.h * p.feet];
    const doors: string[] = [];
    for (const o of p.openings) {
      const word = WORD[o.kind];
      if (!word) continue;
      const [[ax, ay], [bx, by]] = across(o);
      const [ra, rb] = [regionAt(p, ax, ay), regionAt(p, bx, by)];
      // Seen from the first square the opening is to the south or east; from the second, north or west.
      if (ra === region) doors.push(`${word} ${DIR_WORDS[o.side === 'n' ? 2 : 1]}`);
      else if (rb === region) doors.push(`${word} ${DIR_WORDS[o.side === 'n' ? 0 : 3]}`);
    }
    const other = a.exits.filter((e) => !/^(door|archway|secret door|portcullis) /.test(e));
    a.exits = [...new Set(doors), ...other];
  }
  return p;
}

/**
 * The sheet cut or grown to fit what is drawn on it: two squares of margin, three at the bottom for the title (and at
 * the top over a building's storeys). A side where a cave opens to the edge of the sheet is left as it is.
 */
export function fit(plan: GridPlan): GridPlan {
  let [x0, y0, x1, y1] = [plan.w, plan.h, -1, -1];
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) if (plan.cells[y * plan.w + x]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  if (x1 < 0) return plan;
  const open = { n: false, s: false, w: false, e: false };
  for (const o of plan.openings) {
    if (o.kind !== 'open') continue;
    if (o.side === 'n' && o.y === 0) open.n = true;
    if (o.side === 'n' && o.y === plan.h) open.s = true;
    if (o.side === 'w' && o.x === 0) open.w = true;
    if (o.side === 'w' && o.x === plan.w) open.e = true;
  }
  const top = plan.captions.length ? 3 : 2;
  // How far each edge of the sheet moves outward (inward if negative).
  const left = open.w ? 0 : 2 - x0;
  const up = open.n ? 0 : top - y0;
  const right = open.e ? 0 : 2 - (plan.w - 1 - x1);
  const down = open.s ? 0 : 3 - (plan.h - 1 - y1);
  if (!left && !up && !right && !down) return plan;
  shift = [shift[0] + left, shift[1] + up];
  const [w, h] = [plan.w + left + right, plan.h + up + down];
  const cells = new Int16Array(w * h);
  const rock = new Uint8Array(w * h);
  // New ground is rock if the sheet is all rock (a dungeon, a cave); a building's outside is not.
  const allRock = plan.rock.every((v) => v === 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [sx, sy] = [x - left, y - up];
      const inside = sx >= 0 && sy >= 0 && sx < plan.w && sy < plan.h;
      cells[y * w + x] = inside ? plan.cells[sy * plan.w + sx] : 0;
      rock[y * w + x] = inside ? plan.rock[sy * plan.w + sx] : allRock ? 1 : 0;
    }
  return {
    ...plan,
    w,
    h,
    cells,
    rock,
    openings: plan.openings.map((o) => ({ ...o, x: o.x + left, y: o.y + up })),
    features: plan.features.map((f) => ({ ...f, x: f.x + left, y: f.y + up })),
    areas: plan.areas.map((a) => ({ ...a, x: a.x + left, y: a.y + up })),
    captions: plan.captions.map((c) => ({ ...c, x: c.x + left, y: c.y + up })),
  };
}

const done = (p: GridPlan, before: GridPlan) => fit(settle(p, before));
const newRegion = (p: GridPlan) => {
  let top = PASSAGE;
  for (const v of p.cells) if (v > top) top = v;
  return top + 1;
};
const inSheet = (p: GridPlan, x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h;

// How far the drawing has been moved on its sheet by the change being made: a sheet that grows on its left or at its
// top moves everything on it. Whoever shows a cursor on the plan moves it by as much (see `withShift`).
let shift: [number, number] = [0, 0];
/** A change made, and how far it moved what was already drawn: so many squares across and down. */
export function withShift<T>(work: () => T): [T, number, number] {
  shift = [0, 0];
  const made = work();
  return [made, shift[0], shift[1]];
}

/** The largest sheet a hand can draw: 200 squares each way (a thousand feet). */
const MOST = 200;
/**
 * The sheet grown so that an oblong drawn partly off it has ground to lie on. Gives the plan and how far everything on
 * it has moved. A side where a cave opens to the edge does not grow; nor does a sheet past its largest size.
 */
export function reach(plan: GridPlan, x0: number, y0: number, x1: number, y1: number): { plan: GridPlan; dx: number; dy: number } {
  const open = (side: 'n' | 'w', at: number) => plan.openings.some((o) => o.kind === 'open' && o.side === side && (side === 'n' ? o.y : o.x) === at);
  const left = open('w', 0) ? 0 : Math.max(0, -x0);
  const up = open('n', 0) ? 0 : Math.max(0, -y0);
  const right = open('w', plan.w) ? 0 : Math.max(0, x1 - (plan.w - 1));
  const down = open('n', plan.h) ? 0 : Math.max(0, y1 - (plan.h - 1));
  const [w, h] = [plan.w + left + right, plan.h + up + down];
  if ((!left && !up && !right && !down) || w > MOST || h > MOST) return { plan, dx: 0, dy: 0 };
  const cells = new Int16Array(w * h);
  const rock = new Uint8Array(w * h);
  const allRock = plan.rock.every((v) => v === 1);
  if (allRock) rock.fill(1);
  for (let y = 0; y < plan.h; y++)
    for (let x = 0; x < plan.w; x++) {
      cells[(y + up) * w + x + left] = plan.cells[y * plan.w + x];
      rock[(y + up) * w + x + left] = plan.rock[y * plan.w + x];
    }
  shift = [shift[0] + left, shift[1] + up];
  const moved = <T extends { x: number; y: number }>(v: T): T => ({ ...v, x: v.x + left, y: v.y + up });
  return { plan: { ...plan, w, h, cells, rock, rough: new Set(plan.rough), openings: plan.openings.map(moved), features: plan.features.map(moved), areas: plan.areas.map((a) => ({ ...moved(a), exits: [...a.exits] })), captions: plan.captions.map(moved) }, dx: left, dy: up };
}

/**
 * Squares made floor. `region` is the room they join, the passage (`PASSAGE`), or in a cave the cave. Solid ground
 * and passage give way to a room; another room's squares are left alone.
 */
export function paint(plan: GridPlan, squares: Pt[], region: number): GridPlan {
  if (!squares.length) return plan;
  const xs = squares.map((c) => c[0]);
  const ys = squares.map((c) => c[1]);
  const grown = reach(plan, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  const p = copy(grown.plan);
  for (const [sx, sy] of squares) {
    const [x, y] = [sx + grown.dx, sy + grown.dy];
    if (!inSheet(p, x, y)) continue;
    const was = p.cells[y * p.w + x];
    if (was === 0 || (was === PASSAGE && region !== PASSAGE)) p.cells[y * p.w + x] = region;
  }
  return done(p, plan);
}

/** Squares made solid again. */
export function rubOut(plan: GridPlan, squares: Pt[]): GridPlan {
  const p = copy(plan);
  for (const [x, y] of squares) if (inSheet(p, x, y)) p.cells[y * p.w + x] = 0;
  return done(p, plan);
}

/** A new room: an oblong between two corners, numbered `n` and named, on whatever of it is not another room. */
export function addRoom(plan: GridPlan, ax: number, ay: number, bx: number, by: number, n: number, name: string): GridPlan | null {
  const grown = reach(plan, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
  const p = copy(grown.plan);
  [ax, ay, bx, by] = [ax + grown.dx, ay + grown.dy, bx + grown.dx, by + grown.dy];
  const region = newRegion(p);
  const [x0, x1, y0, y1] = [Math.max(0, Math.min(ax, bx)), Math.min(p.w - 1, Math.max(ax, bx)), Math.max(0, Math.min(ay, by)), Math.min(p.h - 1, Math.max(ay, by))];
  const got: Pt[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const was = p.cells[y * p.w + x];
      if (was === 0 || was === PASSAGE) ((p.cells[y * p.w + x] = region), got.push([x, y]));
    }
  if (!got.length) return null;
  if (p.rough.size) p.rough.add(region);
  // The number in the middle of what it got.
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const at = got.reduce((best, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best), got[0]);
  p.areas.push({ n, name, x: at[0] + 0.5, y: at[1] + 0.5, feet: null, exits: [] });
  p.areas.sort((a, b) => a.n - b.n);
  return done(p, plan);
}

/**
 * A room moved so many squares across and down, with what is in it and the doors in its walls (those that still
 * stand in a wall where it lands). Null if it would land on another room or leave the sheet.
 */
export function moveRoom(before: GridPlan, region: number, dx: number, dy: number): GridPlan | null {
  const box = roomBox(before, region);
  if (!box || region <= PASSAGE || before.kind === 'cave' || (!dx && !dy)) return null;
  // Moved past the edge of the sheet, the sheet grows to take it.
  const plan = reach(before, box.x + dx, box.y + dy, box.x + box.w - 1 + dx, box.y + box.h - 1 + dy).plan;
  const p = copy(plan);
  const mine: Pt[] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (plan.cells[y * p.w + x] === region) mine.push([x, y]);
  if (!mine.length) return null;
  for (const [x, y] of mine) {
    const [nx, ny] = [x + dx, y + dy];
    if (!inSheet(p, nx, ny)) return null;
    const there = plan.cells[ny * p.w + nx];
    if (there !== 0 && there !== region && there !== PASSAGE) return null;
  }
  for (const [x, y] of mine) p.cells[y * p.w + x] = 0;
  for (const [x, y] of mine) p.cells[(y + dy) * p.w + x + dx] = region;
  const inRoom = (x: number, y: number) => regionAt(plan, x, y) === region;
  for (const f of p.features) if (inRoom(...footOf(f))) [f.x, f.y] = [f.x + dx, f.y + dy];
  for (const a of p.areas) if (inRoom(a.x, a.y)) [a.x, a.y] = [a.x + dx, a.y + dy];
  for (const o of p.openings) if (across(o).some(([x, y]) => inRoom(x, y))) [o.x, o.y] = [o.x + dx, o.y + dy];
  // Its doors come before any they have landed on, so that a room keeps its own.
  p.openings.sort((a, b) => Number(across(b).some(([x, y]) => regionAt(p, x, y) === region)) - Number(across(a).some(([x, y]) => regionAt(p, x, y) === region)));
  return done(p, plan);
}

/** An oblong room given a new oblong. What was in the part given up goes; its number stays inside it. */
export function resizeRoom(before: GridPlan, region: number, x: number, y: number, w: number, h: number): GridPlan | null {
  const box = roomBox(before, region);
  if (!box || !box.whole || region <= PASSAGE || before.kind === 'cave' || w < 1 || h < 1) return null;
  const grown = reach(before, x, y, x + w - 1, y + h - 1);
  const plan = grown.plan;
  [x, y] = [x + grown.dx, y + grown.dy];
  const p = copy(plan);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inSheet(p, x + i, y + j)) return null;
      const there = plan.cells[(y + j) * p.w + x + i];
      if (there !== 0 && there !== region && there !== PASSAGE) return null;
    }
  for (let i = 0; i < p.cells.length; i++) if (p.cells[i] === region) p.cells[i] = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.cells[(y + j) * p.w + x + i] = region;
  for (const a of p.areas) if (regionOf(plan, a) === region) [a.x, a.y] = [Math.max(x, Math.min(x + w - 1, Math.floor(a.x))) + 0.5, Math.max(y, Math.min(y + h - 1, Math.floor(a.y))) + 0.5];
  return done(p, plan);
}

/**
 * A room taken away: its squares, what was in them, and its number. (In a cave, or for a number set down in a
 * passage, only the number goes.) The other numbers stay as they are until `closeUp`.
 */
export function removeRoom(plan: GridPlan, n: number): GridPlan {
  const p = copy(plan);
  const a = p.areas.find((x) => x.n === n);
  const region = a ? regionOf(p, a) : 0;
  if (region > PASSAGE && p.kind !== 'cave') for (let i = 0; i < p.cells.length; i++) if (p.cells[i] === region) p.cells[i] = 0;
  p.areas = p.areas.filter((x) => x.n !== n);
  return done(p, plan);
}

/**
 * The numbers closed up after a change that took places away, so that they run 1, 2, 3 again. `order[i]` is the number
 * the place now numbered i + 1 had before: the key is put in the same order by it.
 */
export function closeUp<T extends Plan>(plan: T): { plan: T; order: number[] } {
  const order = plan.areas.map((a) => a.n).sort((a, b) => a - b);
  return { plan: order.every((n, i) => n === i + 1) ? plan : renumber(plan, order), order };
}

/** A number set down on a floor that has none: a place to key in a cave, or a room made by painting. */
export function addNumber(plan: GridPlan, x: number, y: number, n: number, name: string): GridPlan | null {
  if (regionAt(plan, x, y) === 0) return null;
  const p = copy(plan);
  p.areas.push({ n, name, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, feet: null, exits: [] });
  p.areas.sort((a, b) => a.n - b.n);
  return describe(p);
}

/** A place's number moved to another square of its room. */
export function moveNumber(plan: GridPlan, n: number, x: number, y: number): GridPlan | null {
  const a = plan.areas.find((k) => k.n === n);
  if (!a) return null;
  const region = regionOf(plan, a);
  if (regionAt(plan, x, y) !== region) return null;
  const p = copy(plan);
  const mine = p.areas.find((k) => k.n === n)!;
  [mine.x, mine.y] = [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
  return p;
}

/** The places put in a new order: `order[i]` is the old number of the place that is now number i + 1. */
export function renumber<T extends Plan>(plan: T, order: number[]): T {
  const now = new Map(order.map((old, i) => [old, i + 1]));
  const areas = plan.areas
    .filter((a) => now.has(a.n))
    .map((a) => ({ ...a, n: now.get(a.n)! }))
    .sort((a, b) => a.n - b.n);
  if (plan.kind !== 'settlement') return { ...plan, areas };
  return { ...plan, areas, buildings: plan.buildings.map((b) => (b.key ? (now.has(b.key) ? { ...b, key: now.get(b.key) } : { corners: b.corners }) : b)) };
}

/** A place's name on the plan (what a map's pin and a picture's alt text call it). */
export function rename<T extends Plan>(plan: T, n: number, name: string): T {
  return { ...plan, areas: plan.areas.map((a) => (a.n === n ? { ...a, name } : a)) };
}

/** Whether a place is kept as it is when the rest is drawn again. */
export function keep<T extends Plan>(plan: T, n: number, kept: boolean): T {
  return { ...plan, areas: plan.areas.map((a) => (a.n === n ? { ...a, kept: kept || undefined } : a)) };
}

/**
 * An opening put in the wall on one side of a square, changed to another kind, or (with `null`) taken out. Null if
 * there is no wall there to put it in.
 */
export function setOpening(plan: GridPlan, x: number, y: number, side: 'n' | 'w', kind: OpeningKind | null): GridPlan | null {
  const p = copy(plan);
  p.openings = p.openings.filter((o) => !(o.x === x && o.y === y && o.side === side));
  if (kind) {
    const o: Opening = { x, y, side, kind };
    if (!standsInWall(p, o)) return null;
    p.openings.push(o);
  }
  return describe(p);
}
export const openingAt = (p: GridPlan, x: number, y: number, side: 'n' | 'w') => p.openings.find((o) => o.x === x && o.y === y && o.side === side) ?? null;

/** How each thing sits on its square or squares, facing `dir` (0 north, 1 east, 2 south, 3 west). */
export function shapeOf(kind: FeatureKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 0): Feature {
  const upright = dir % 2 === 0;
  const long = (inset: number): Feature => (upright ? { kind, x: x + inset, y: y + inset, w: 1 - 2 * inset, h: 2 - 2 * inset, dir } : { kind, x: x + inset, y: y + inset, w: 2 - 2 * inset, h: 1 - 2 * inset, dir });
  switch (kind) {
    case 'pillar':
      return { kind, x: x + 0.22, y: y + 0.22, w: 0.56, h: 0.56 };
    case 'statue':
      return { kind, x: x + 0.18, y: y + 0.18, w: 0.64, h: 0.64 };
    case 'chest':
      return { kind, x: x + 0.2, y: y + 0.28, w: 0.6, h: 0.44 };
    case 'well':
      return { kind, x: x + 0.1, y: y + 0.1, w: 0.8, h: 0.8 };
    case 'pool':
      return { kind, x: x + 0.1, y: y + 0.1, w: 1.8, h: 1.8 };
    case 'table':
      return { kind, x: x + 0.14, y: y + 0.14, w: 0.72, h: 0.72 };
    case 'anvil':
      return { kind, x: x + 0.2, y: y + 0.3, w: 0.6, h: 0.4 };
    case 'altar':
    case 'throne':
      return { kind, x: x + 0.12, y: y + 0.12, w: 0.76, h: 0.76, dir };
    case 'tomb':
      return long(0.14);
    case 'bed':
      return long(0.12);
    case 'stairs':
      return upright ? { kind, x, y, w: 1, h: 2, dir } : { kind, x, y, w: 2, h: 1, dir };
    case 'shelf':
    case 'counter':
    case 'pew': {
      const deep = kind === 'pew' ? 0.32 : 0.3;
      // Along the wall it faces away from.
      if (dir === 2) return { kind, x: x + 0.1, y: y + 0.06, w: 0.8, h: deep, dir };
      if (dir === 0) return { kind, x: x + 0.1, y: y + 0.94 - deep, w: 0.8, h: deep, dir };
      if (dir === 1) return { kind, x: x + 0.06, y: y + 0.1, w: deep, h: 0.8, dir };
      return { kind, x: x + 0.94 - deep, y: y + 0.1, w: deep, h: 0.8, dir };
    }
    case 'trap':
      return { kind, x, y, w: 1, h: 1, gm: true };
    default:
      // A hearth, a stall, rubble, barrels: the whole square.
      return { kind, x, y, w: 1, h: 1, dir };
  }
}
/** The things that can be set down by hand, in the order the palette shows them. */
export const THINGS: [FeatureKind, string][] = [
  ['stairs', 'Stairs'],
  ['pillar', 'Pillar'],
  ['statue', 'Statue'],
  ['altar', 'Altar'],
  ['tomb', 'Tomb'],
  ['throne', 'Throne'],
  ['chest', 'Chest'],
  ['well', 'Well'],
  ['pool', 'Pool'],
  ['rubble', 'Rubble'],
  ['table', 'Table'],
  ['bed', 'Bed'],
  ['hearth', 'Hearth'],
  ['shelf', 'Shelves'],
  ['counter', 'Counter'],
  ['barrel', 'Barrels'],
  ['pew', 'Bench'],
  ['anvil', 'Anvil'],
  ['stall', 'Stall'],
  ['trap', 'Trap (your copy only)'],
];
/** The kinds of opening that can be put in a wall by hand. */
export const OPENINGS: [OpeningKind, string][] = [
  ['door', 'Door'],
  ['double', 'Wide door'],
  ['arch', 'Open archway'],
  ['secret', 'Secret door'],
  ['bars', 'Portcullis'],
  ['window', 'Window'],
];

/** Whether every square a thing covers is floor: a bed or a stair is two squares long, and both must be. */
function fits(p: GridPlan, f: Feature): boolean {
  for (let y = Math.floor(f.y + 0.01); y <= Math.floor(f.y + f.h - 0.01); y++) for (let x = Math.floor(f.x + 0.01); x <= Math.floor(f.x + f.w - 0.01); x++) if (regionAt(p, x, y) === 0) return false;
  return true;
}
/** A thing set down on a square of floor. Whatever stood there goes. Null if the square is not floor. */
export function putThing(plan: GridPlan, kind: FeatureKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 0): GridPlan | null {
  if (regionAt(plan, x, y) === 0) return null;
  const p = copy(plan);
  const f = shapeOf(kind, x, y, dir);
  if (!fits(p, f)) return null;
  const there = featureAt(p, x, y);
  if (there >= 0) p.features.splice(there, 1);
  p.features.push(f);
  return p;
}
/** The thing on a square taken away. */
export function takeThing(plan: GridPlan, x: number, y: number): GridPlan | null {
  const i = featureAt(plan, x, y);
  if (i < 0) return null;
  const p = copy(plan);
  p.features.splice(i, 1);
  return p;
}
/** The thing on a square turned a quarter turn. */
export function turnThing(plan: GridPlan, x: number, y: number): GridPlan | null {
  const i = featureAt(plan, x, y);
  if (i < 0) return null;
  const p = copy(plan);
  const f = p.features[i];
  const turned = shapeOf(f.kind, Math.floor(f.x), Math.floor(f.y), (((f.dir ?? 0) + 1) % 4) as 0 | 1 | 2 | 3);
  if (!fits(p, turned)) return null;
  p.features[i] = turned;
  return p;
}

/**
 * Stairs set down in a numbered place, for a way down to the level below (v0.9.27): on two squares of its floor with
 * nothing on them, as far from its doors and its number as may be. Null if the place has no room for them.
 */
export function stairsDown(plan: GridPlan, n: number, to = ''): GridPlan | null {
  const a = plan.areas.find((k) => k.n === n);
  if (!a) return null;
  const region = regionOf(plan, a);
  const mine = (x: number, y: number) => regionAt(plan, x, y) === region && (plan.kind !== 'cave' || Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) <= 4);
  const busy = (x: number, y: number) => featureAt(plan, x, y) >= 0 || (Math.floor(a.x) === x && Math.floor(a.y) === y);
  const doors = plan.openings.flatMap((o) => across(o)).filter(([x, y]) => regionAt(plan, x, y) === region);
  let best: { f: Feature; score: number } | null = null;
  for (let y = 0; y < plan.h; y++)
    for (let x = 0; x < plan.w; x++)
      for (const dir of [0, 1, 2, 3] as const) {
        const f = shapeOf('stairs', x, y, dir);
        const squares: Pt[] = dir % 2 === 0 ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]];
        if (!squares.every(([sx, sy]) => mine(sx, sy) && !busy(sx, sy))) continue;
        // Away from the doors (never on a doorstep) and off the number; against a wall for choice.
        const fromDoors = Math.min(9, ...doors.flatMap(([dx, dy]) => squares.map(([sx, sy]) => Math.abs(dx - sx) + Math.abs(dy - sy))));
        if (fromDoors === 0) continue;
        const walls = squares.reduce((sum, [sx, sy]) => sum + DIRS.filter(([ex, ey]) => regionAt(plan, sx + ex, sy + ey) !== region).length, 0);
        const score = fromDoors * 2 + walls + Math.min(3, Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y)) * 0.5;
        if (!best || score > best.score + 1e-9) best = { f, score };
      }
  if (!best) return null;
  const p = copy(plan);
  p.features.push(best.f);
  // The key says where they go, among the place's ways out.
  const mineNow = p.areas.find((k) => k.n === n)!;
  mineNow.exits = [...mineNow.exits.filter((e) => !e.startsWith('stairs down')), to.trim() ? `stairs down to ${to.trim().slice(0, 80)}` : 'stairs down'];
  return p;
}

/** The wall nearest a point within a square: which square's top or left edge it is. `fx`, `fy` are 0 to 1 across and down the square. */
export function nearestEdge(x: number, y: number, fx: number, fy: number): { x: number; y: number; side: 'n' | 'w' } {
  const d = [fy, 1 - fx, 1 - fy, fx];
  const side = d.indexOf(Math.min(...d));
  return side === 0 ? { x, y, side: 'n' } : side === 1 ? { x: x + 1, y, side: 'w' } : side === 2 ? { x, y: y + 1, side: 'n' } : { x, y, side: 'w' };
}
/** The edge crossed in stepping from a square one way: for the keyboard, where there is no point within the square. */
export function edgeToward(x: number, y: number, dir: number): { x: number; y: number; side: 'n' | 'w' } {
  const [dx, dy] = DIRS[dir];
  return dy ? { x, y: dy > 0 ? y + 1 : y, side: 'n' } : { x: dx > 0 ? x + 1 : x, y, side: 'w' };
}

// ---- Settlements -----------------------------------------------------------------------------------------------------

const centre = (corners: Pt[]): Pt => [corners.reduce((s, c) => s + c[0], 0) / corners.length, corners.reduce((s, c) => s + c[1], 0) / corners.length];
const round2 = (v: number) => Math.round(v * 100) / 100;
function inside(pt: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
/** The building at a point of a settlement's plan: its place in the list, the topmost first; or -1. */
export function buildingAt(t: TownPlan, x: number, y: number): number {
  for (let i = t.buildings.length - 1; i >= 0; i--) if (inside([x, y], t.buildings[i].corners)) return i;
  return -1;
}
/** A building's number follows it: the middle of the building, or of its main block if it has a wing. */
const numberSpot = (corners: Pt[]): Pt => (corners.length === 6 ? centre([corners[0], corners[5], corners[3], corners[4]]) : centre(corners));
const withNumber = (t: TownPlan, i: number): TownPlan => {
  const b = t.buildings[i];
  if (!b?.key) return t;
  const [x, y] = numberSpot(b.corners).map(round2);
  return { ...t, areas: t.areas.map((a) => (a.n === b.key ? { ...a, x, y } : a)) };
};
const change = (t: TownPlan, i: number, corners: Pt[]): TownPlan | null => {
  if (!t.buildings[i] || corners.some(([x, y]) => x < 0 || y < 0 || x > t.w || y > t.h)) return null;
  const buildings = t.buildings.map((b, j) => (j === i ? { ...b, corners: corners.map(([x, y]) => [round2(x), round2(y)] as Pt) } : b));
  return withNumber({ ...t, buildings }, i);
};

/** A building moved so far across and down (in squares; parts of a square are fine). Null if it would leave the sheet. */
export const moveBuilding = (t: TownPlan, i: number, dx: number, dy: number) => (t.buildings[i] ? change(t, i, t.buildings[i].corners.map(([x, y]) => [x + dx, y + dy])) : null);
/** A building turned about its middle, by so many degrees. */
export function turnBuilding(t: TownPlan, i: number, degrees: number): TownPlan | null {
  const b = t.buildings[i];
  if (!b) return null;
  const [cx, cy] = centre(b.corners);
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return change(t, i, b.corners.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]));
}
/** A building made larger or smaller about its middle: `by` 1.2 is a fifth larger. */
export function scaleBuilding(t: TownPlan, i: number, by: number): TownPlan | null {
  const b = t.buildings[i];
  if (!b) return null;
  const [cx, cy] = centre(b.corners);
  const across = Math.max(...b.corners.map(([x]) => x)) - Math.min(...b.corners.map(([x]) => x));
  if (across * by < 0.4 || across * by > 12) return null;
  return change(t, i, b.corners.map(([x, y]) => [cx + (x - cx) * by, cy + (y - cy) * by]));
}
/** A house set down at a point: about thirty feet by twenty-four, square to the sheet. */
export function addBuilding(t: TownPlan, x: number, y: number): TownPlan | null {
  const [w, h] = [30 / t.feet / 2, 24 / t.feet / 2];
  const corners: Pt[] = [
    [x - w, y - h],
    [x + w, y - h],
    [x + w, y + h],
    [x - w, y + h],
  ];
  if (corners.some(([cx, cy]) => cx < 0 || cy < 0 || cx > t.w || cy > t.h)) return null;
  return { ...t, buildings: [...t.buildings, { corners: corners.map(([cx, cy]) => [round2(cx), round2(cy)] as Pt) }] };
}
/** A building taken away, and its number with it. The other numbers stay as they are until `closeUp`. */
export function removeBuilding(t: TownPlan, i: number): TownPlan {
  const b = t.buildings[i];
  if (!b) return t;
  return { ...t, buildings: t.buildings.filter((_, j) => j !== i), areas: b.key ? t.areas.filter((a) => a.n !== b.key) : t.areas };
}
/** A building given a number and a name: a place to key. */
export function numberBuilding(t: TownPlan, i: number, n: number, name: string): TownPlan | null {
  const b = t.buildings[i];
  if (!b || b.key) return null;
  const [x, y] = numberSpot(b.corners).map(round2);
  const xs = b.corners.map((c) => c[0]);
  const ys = b.corners.map((c) => c[1]);
  const feet: [number, number] = [Math.round(((Math.max(...xs) - Math.min(...xs)) * t.feet) / 5) * 5, Math.round(((Math.max(...ys) - Math.min(...ys)) * t.feet) / 5) * 5];
  return { ...t, buildings: t.buildings.map((o, j) => (j === i ? { ...o, key: n } : o)), areas: [...t.areas, { n, name, x, y, feet, exits: [] }].sort((a, c) => a.n - c.n) };
}
/** A numbered place of a settlement taken out of the key: its building stays, as a house like any other. */
export function unnumber(t: TownPlan, n: number): TownPlan {
  return { ...t, areas: t.areas.filter((a) => a.n !== n), buildings: t.buildings.map((o) => (o.key === n ? { corners: o.corners } : o)) };
}
