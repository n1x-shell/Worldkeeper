/**
 * Plans of places (v0.9.24, docs/BETA_PLAN.md C8): a dungeon, a cave, a building or a settlement laid out from what
 * its record says, and drawn as an ink line map with a grid, to be used as it is or dressed up in a mapping tool.
 *
 * Everything here is pure and seeded: the same seed and the same asks give the same plan, so a plan can be remembered
 * by its seed alone, and what was exported yesterday can be drawn again today.
 */

/** A random source: numbers from 0 up to (not including) 1. */
export type Rnd = () => number;

/**
 * A seeded source. The seed is stirred first, so seeds that are close together (two clicks a millisecond apart) give
 * plans that have nothing in common.
 */
export function rng(seed: number): Rnd {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  s = (s ^ (s >>> 16)) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
export const int = (rnd: Rnd, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
export const pick = <T>(rnd: Rnd, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
export const chance = (rnd: Rnd, p: number) => rnd() < p;
export function shuffled<T>(rnd: Rnd, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** A number from two whole numbers and a seed, the same every time: for the wobble of a hand-drawn line. */
export function noise(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const PLAN_KINDS = ['dungeon', 'cave', 'building', 'settlement'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** A numbered place on a plan, with its line in the key. */
export interface Area {
  n: number;
  name: string;
  /** Where its number is drawn, in squares. */
  x: number;
  y: number;
  /** How big it is, in feet (for a cave or a settlement's building, roughly). */
  feet: [number, number] | null;
  /** The ways out of it, in words ("door north", "stairs up"). */
  exits: string[];
  /** The storey it is on, for a building with more than one. */
  floor?: string;
}

/**
 * An opening in a wall. Walls run along the edges of squares: `side: 'n'` is the top edge of square (x, y), `'w'` its
 * left edge.
 */
export type OpeningKind = 'door' | 'double' | 'arch' | 'secret' | 'bars' | 'window' | 'open';
export interface Opening {
  x: number;
  y: number;
  side: 'n' | 'w';
  kind: OpeningKind;
}

export type FeatureKind =
  | 'stairs'
  | 'pillar'
  | 'statue'
  | 'altar'
  | 'tomb'
  | 'pool'
  | 'rubble'
  | 'chest'
  | 'throne'
  | 'hearth'
  | 'table'
  | 'bed'
  | 'counter'
  | 'shelf'
  | 'barrel'
  | 'pew'
  | 'anvil'
  | 'well'
  | 'trap'
  | 'stall';
/** Something drawn in a room. `x`, `y`, `w` and `h` are in squares (parts of a square are fine). */
export interface Feature {
  kind: FeatureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which way it faces or climbs: 0 north, 1 east, 2 south, 3 west. */
  dir?: 0 | 1 | 2 | 3;
  /** For the GM's copy only (a trap). */
  gm?: boolean;
}

/** A plan on squares: a dungeon, a cave or a building. */
export interface GridPlan {
  kind: 'dungeon' | 'cave' | 'building';
  /** Squares across and down, margins included. */
  w: number;
  h: number;
  /** Feet to a square. */
  feet: number;
  /** For each square, the room or passage it belongs to; 0 is solid. Walls stand wherever two neighbours differ. */
  cells: Int16Array;
  /** Rooms and passages cut roughly (a cave, a mine): their walls are drawn uneven. */
  rough: Set<number>;
  /** Solid squares that are rock or earth, hatched where they meet a floor. A building's outside is not. */
  rock: Uint8Array;
  openings: Opening[];
  features: Feature[];
  areas: Area[];
  /** Titles drawn over parts of the sheet: the storeys of a building. */
  captions: { text: string; x: number; y: number }[];
}

/** A plan of a settlement: streets and roofs, not squares. Distances are in squares all the same, for the grid. */
export type Pt = [number, number];
export interface TownPlan {
  kind: 'settlement';
  w: number;
  h: number;
  feet: number;
  roads: { points: Pt[]; width: number }[];
  /** Each building is its corners, in order. `key` is its number on the plan, if it has one. */
  buildings: { corners: Pt[]; key?: number }[];
  /** Open ground among the streets: the market square, a green. */
  squares: Pt[][];
  /** Water: a river as a line with a width; the sea or a lake as an outline. */
  rivers: { points: Pt[]; width: number }[];
  water: Pt[][];
  bridges: { x: number; y: number; angle: number; length: number; width: number }[];
  piers: { x: number; y: number; angle: number; length: number }[];
  /** The wall: its corners in order (joined end to start if `closed`), its towers, and its gates. */
  wall: { points: Pt[]; closed: boolean; width: number; towers: Pt[]; gates: { x: number; y: number; angle: number; width: number }[] } | null;
  /** Each tree is where it stands and how wide its crown is. */
  trees: [number, number, number][];
  fields: { corners: Pt[]; angle: number }[];
  areas: Area[];
}

export type Plan = GridPlan | TownPlan;

export const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const DIR_WORDS = ['north', 'east', 'south', 'west'] as const;

/** The opening on the edge between two squares that sit side by side, or undefined. */
export function edgeOf(ax: number, ay: number, bx: number, by: number): { x: number; y: number; side: 'n' | 'w' } {
  return ax === bx ? { x: ax, y: Math.max(ay, by), side: 'n' } : { x: Math.max(ax, bx), y: ay, side: 'w' };
}
export const edgeKey = (e: { x: number; y: number; side: 'n' | 'w' }) => `${e.x},${e.y},${e.side}`;

/** A size in feet, as the key gives it. */
export const feetText = (f: [number, number] | null) => (f ? `${f[0]} × ${f[1]} ft` : '');
