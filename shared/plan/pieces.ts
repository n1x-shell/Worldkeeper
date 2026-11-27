/**
 * Ready-made pieces (v0.9.26): a shrine, a guard post, a row of cells, and the like, to set down on a plan whole and
 * join up by hand. Each is a few rooms and passages with their doors and what stands in them, drawn here on a small
 * grid of its own and turned as the GM likes when it is set down.
 */
import type { FeatureKind, GridPlan, OpeningKind, Pt } from './model.js';
import { PASSAGE, describe, fit, reach, regionAt, shapeOf, standsInWall } from './edit.js';

export interface Piece {
  key: string;
  label: string;
  about: string;
  /** Squares across and down, before turning. */
  w: number;
  h: number;
  /** Its rooms: each a name and the oblongs that make it up, as [x, y, w, h]. */
  rooms: { name: string; boxes: [number, number, number, number][] }[];
  /** Squares of passage, as oblongs. */
  passages?: [number, number, number, number][];
  /** Openings: on the top ('n') or left ('w') edge of a square. */
  openings?: [x: number, y: number, side: 'n' | 'w', kind: OpeningKind][];
  /** Things, each on a square, facing a way (0 north, 1 east, 2 south, 3 west). */
  things?: [kind: FeatureKind, x: number, y: number, dir?: 0 | 1 | 2 | 3][];
}

export const PIECES: Piece[] = [
  {
    key: 'guard-post',
    label: 'Guard post',
    about: 'A small room off a passage, with a table and a door that bars.',
    w: 4,
    h: 5,
    rooms: [{ name: 'Guard post', boxes: [[0, 0, 4, 3]] }],
    passages: [[1, 3, 1, 2]],
    openings: [[1, 3, 'n', 'bars']],
    things: [
      ['table', 2, 1],
      ['barrel', 0, 0],
    ],
  },
  {
    key: 'shrine',
    label: 'Shrine',
    about: 'A pillared room with an altar at the far end and a vestry behind it.',
    w: 5,
    h: 10,
    rooms: [
      { name: 'Shrine', boxes: [[0, 2, 5, 7]] },
      { name: 'Vestry', boxes: [[1, 0, 3, 2]] },
    ],
    passages: [[2, 9, 1, 1]],
    openings: [
      [2, 9, 'n', 'double'],
      [3, 2, 'n', 'door'],
    ],
    things: [
      ['altar', 2, 2, 2],
      ['pillar', 1, 4],
      ['pillar', 3, 4],
      ['pillar', 1, 6],
      ['pillar', 3, 6],
      ['shelf', 1, 0, 2],
    ],
  },
  {
    key: 'cells',
    label: 'Row of cells',
    about: 'A passage with three barred cells on each side.',
    w: 7,
    h: 6,
    rooms: [
      { name: 'Cell', boxes: [[0, 0, 2, 2]] },
      { name: 'Cell', boxes: [[0, 2, 2, 2]] },
      { name: 'Cell', boxes: [[0, 4, 2, 2]] },
      { name: 'Cell', boxes: [[5, 0, 2, 2]] },
      { name: 'Cell', boxes: [[5, 2, 2, 2]] },
      { name: 'Cell', boxes: [[5, 4, 2, 2]] },
    ],
    passages: [[2, 0, 3, 6]],
    openings: [
      [2, 0, 'w', 'bars'],
      [2, 2, 'w', 'bars'],
      [2, 4, 'w', 'bars'],
      [5, 1, 'w', 'bars'],
      [5, 3, 'w', 'bars'],
      [5, 5, 'w', 'bars'],
    ],
    things: [
      ['bed', 0, 0, 2],
      ['bed', 0, 2, 2],
      ['bed', 0, 4, 2],
      ['bed', 6, 0, 2],
      ['bed', 6, 2, 2],
      ['bed', 6, 4, 2],
    ],
  },
  {
    key: 'crypt',
    label: 'Crypt',
    about: 'A long vault with tombs in niches down both sides.',
    w: 7,
    h: 9,
    rooms: [
      {
        name: 'Crypt',
        boxes: [
          [2, 0, 3, 9],
          [0, 1, 2, 1],
          [0, 4, 2, 1],
          [0, 7, 2, 1],
          [5, 1, 2, 1],
          [5, 4, 2, 1],
          [5, 7, 2, 1],
        ],
      },
    ],
    things: [
      ['tomb', 0, 1, 1],
      ['tomb', 0, 4, 1],
      ['tomb', 0, 7, 1],
      ['tomb', 5, 1, 1],
      ['tomb', 5, 4, 1],
      ['tomb', 5, 7, 1],
      ['statue', 3, 0],
    ],
  },
  {
    key: 'vault',
    label: 'Vault and antechamber',
    about: 'A strongroom behind a portcullis, with a trap in the room before it.',
    w: 5,
    h: 8,
    rooms: [
      { name: 'Antechamber', boxes: [[1, 4, 3, 4]] },
      { name: 'Vault', boxes: [[0, 0, 5, 4]] },
    ],
    openings: [[2, 4, 'n', 'bars']],
    things: [
      ['chest', 0, 0],
      ['chest', 4, 0],
      ['chest', 2, 0],
      ['trap', 2, 5],
    ],
  },
  {
    key: 'great-hall',
    label: 'Pillared hall',
    about: 'A great hall with two rows of pillars and a dais at one end.',
    w: 9,
    h: 12,
    rooms: [{ name: 'Great hall', boxes: [[0, 0, 9, 12]] }],
    openings: [],
    things: [
      ['throne', 4, 0, 2],
      ['pillar', 2, 2],
      ['pillar', 6, 2],
      ['pillar', 2, 4],
      ['pillar', 6, 4],
      ['pillar', 2, 6],
      ['pillar', 6, 6],
      ['pillar', 2, 8],
      ['pillar', 6, 8],
      ['pillar', 2, 10],
      ['pillar', 6, 10],
    ],
  },
  {
    key: 'well-room',
    label: 'Well room',
    about: 'A round-cornered room with a well in the middle.',
    w: 5,
    h: 5,
    rooms: [
      {
        name: 'Well room',
        boxes: [
          [1, 0, 3, 5],
          [0, 1, 5, 3],
        ],
      },
    ],
    things: [['well', 2, 2]],
  },
  {
    key: 'crossroads',
    label: 'Crossroads',
    about: 'Four passages meeting, with a statue where they cross.',
    w: 7,
    h: 7,
    rooms: [],
    passages: [
      [3, 0, 1, 7],
      [0, 3, 7, 1],
      [2, 2, 3, 3],
    ],
    things: [['statue', 3, 3]],
  },
  {
    key: 'stair',
    label: 'Stair down',
    about: 'A landing with stairs going down, behind a door.',
    w: 3,
    h: 5,
    rooms: [{ name: 'Stair', boxes: [[0, 0, 3, 3]] }],
    passages: [[1, 3, 1, 2]],
    openings: [[1, 3, 'n', 'door']],
    things: [['stairs', 1, 0, 2]],
  },
  {
    key: 'secret-room',
    label: 'Secret room',
    about: 'A small room behind a secret door, with something worth hiding.',
    w: 3,
    h: 4,
    rooms: [{ name: 'Hidden room', boxes: [[0, 0, 3, 3]] }],
    passages: [[1, 3, 1, 1]],
    openings: [[1, 3, 'n', 'secret']],
    things: [
      ['chest', 1, 0],
      ['shelf', 0, 1, 1],
    ],
  },
  {
    key: 'barracks',
    label: 'Barracks',
    about: 'Beds down both walls, a table, and an armoury off it.',
    w: 8,
    h: 6,
    rooms: [
      { name: 'Barracks', boxes: [[0, 0, 5, 6]] },
      { name: 'Armoury', boxes: [[5, 1, 3, 4]] },
    ],
    openings: [[5, 3, 'w', 'door']],
    things: [
      ['bed', 0, 0, 2],
      ['bed', 2, 0, 2],
      ['bed', 4, 0, 2],
      ['bed', 0, 4, 2],
      ['bed', 2, 4, 2],
      ['table', 2, 2],
      ['shelf', 7, 1, 3],
      ['shelf', 7, 3, 3],
      ['barrel', 5, 4],
    ],
  },
  {
    key: 'collapse',
    label: 'Fallen passage',
    about: 'A passage half blocked by a fall of rock.',
    w: 2,
    h: 7,
    rooms: [],
    passages: [
      [0, 0, 1, 7],
      [1, 2, 1, 3],
    ],
    things: [
      ['rubble', 0, 3],
      ['rubble', 1, 2],
      ['rubble', 1, 4],
    ],
  },
];

/** A point of a piece after `turns` quarter turns clockwise, in a piece `w` by `h` before turning. */
const turned = (x: number, y: number, w: number, h: number, turns: number): Pt => {
  let [px, py, pw, ph] = [x, y, w, h];
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) [px, py, pw, ph] = [ph - 1 - py, px, ph, pw];
  return [px, py];
};
/** A piece's size as it lies when turned. */
export const pieceSize = (piece: Piece, turns: number): [number, number] => (turns % 2 ? [piece.h, piece.w] : [piece.w, piece.h]);

/** The squares a piece would cover with its top left corner at a square, turned so many quarter turns. */
export function pieceSquares(piece: Piece, x: number, y: number, turns: number): Pt[] {
  const out: Pt[] = [];
  for (const [bx, by, bw, bh] of [...piece.rooms.flatMap((r) => r.boxes), ...(piece.passages ?? [])])
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        const [tx, ty] = turned(bx + i, by + j, piece.w, piece.h, turns);
        out.push([x + tx, y + ty]);
      }
  return out;
}

/**
 * A piece set down on a plan with its top left corner at a square. Its rooms are new rooms, numbered from `n` on;
 * `names` gives their names back, for the key. Null if any of it would lie on a room already there, or off the sheet.
 */
export function setDown(plan: GridPlan, piece: Piece, x: number, y: number, turns: number, n: number): { plan: GridPlan; names: string[] } | null {
  if (plan.kind === 'cave') return null;
  // Set down partly off the sheet, the sheet grows to take it.
  const [pw, ph] = pieceSize(piece, turns);
  const grown = reach(plan, x, y, x + pw - 1, y + ph - 1);
  [plan, x, y] = [grown.plan, x + grown.dx, y + grown.dy];
  const squares = pieceSquares(piece, x, y, turns);
  for (const [sx, sy] of squares) {
    if (sx < 0 || sy < 0 || sx >= plan.w || sy >= plan.h) return null;
    if (regionAt(plan, sx, sy) > PASSAGE) return null;
  }
  const p: GridPlan = { ...plan, cells: plan.cells.slice(), rock: plan.rock.slice(), rough: new Set(plan.rough), openings: plan.openings.map((o) => ({ ...o })), features: plan.features.map((f) => ({ ...f })), areas: plan.areas.map((a) => ({ ...a, exits: [...a.exits] })), captions: plan.captions.map((c) => ({ ...c })) };
  let region = PASSAGE;
  for (const v of p.cells) if (v > region) region = v;
  const at = (px: number, py: number): Pt => {
    const [tx, ty] = turned(px, py, piece.w, piece.h, turns);
    return [x + tx, y + ty];
  };
  for (const [bx, by, bw, bh] of piece.passages ?? [])
    for (let j = 0; j < bh; j++)
      for (let i = 0; i < bw; i++) {
        const [cx, cy] = at(bx + i, by + j);
        if (p.cells[cy * p.w + cx] === 0) p.cells[cy * p.w + cx] = PASSAGE;
      }
  const names: string[] = [];
  for (const room of piece.rooms) {
    region++;
    const mine: Pt[] = [];
    for (const [bx, by, bw, bh] of room.boxes) for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) mine.push(at(bx + i, by + j));
    for (const [cx, cy] of mine) p.cells[cy * p.w + cx] = region;
    if (p.rough.size) p.rough.add(region);
    // Its number on the square nearest its middle.
    const [mx, my] = [mine.reduce((s, c) => s + c[0], 0) / mine.length, mine.reduce((s, c) => s + c[1], 0) / mine.length];
    const spot = mine.reduce((best, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best), mine[0]);
    p.areas.push({ n: n + names.length, name: room.name, x: spot[0] + 0.5, y: spot[1] + 0.5, feet: null, exits: [] });
    names.push(room.name);
  }
  for (const [kind, fx, fy, dir = 0] of piece.things ?? []) {
    const [cx, cy] = at(fx, fy);
    const d = ((dir + turns) % 4) as 0 | 1 | 2 | 3;
    // A thing two squares long is drawn from its top left square: after turning, that is the lesser of its two ends.
    const long = kind === 'bed' || kind === 'tomb' || kind === 'stairs';
    const [ex, ey] = long ? at(fx + (dir % 2 ? 1 : 0), fy + (dir % 2 ? 0 : 1)) : [cx, cy];
    p.features.push(shapeOf(kind, Math.min(cx, ex), Math.min(cy, ey), d));
  }
  for (const [ox, oy, side, kind] of piece.openings ?? []) {
    // The two squares the opening lies between, turned with the piece; the opening is on the edge they share.
    const [a, b] = side === 'n' ? [at(ox, oy - 1), at(ox, oy)] : [at(ox - 1, oy), at(ox, oy)];
    const o = a[0] === b[0] ? { x: a[0], y: Math.max(a[1], b[1]), side: 'n' as const, kind } : { x: Math.max(a[0], b[0]), y: a[1], side: 'w' as const, kind };
    if (standsInWall(p, o)) p.openings.push(o);
  }
  p.areas.sort((a, b) => a.n - b.n);
  return { plan: describe(fit(p)), names };
}
