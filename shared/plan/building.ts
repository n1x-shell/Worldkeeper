/**
 * A building, storey by storey: its outline divided into the rooms its use calls for (or the rooms its record names),
 * with doors so that every room can be reached, stairs in the same place on every storey, windows, and what stands in
 * each room.
 */
import { chance, edgeKey, edgeOf, int, pick, rng, DIRS, DIR_WORDS, type Area, type Feature, type FeatureKind, type GridPlan, type Opening } from './model.js';
import { crop, furnish } from './dungeon.js';
import { furnishingsOf, sizeOf, storeyOf } from './names.js';
import { storeyAndName } from './key.js';

interface FloorDef {
  title: string;
  /** Below ground: no windows, earth around it. */
  under?: boolean;
  /** Rooms off a passage down the middle, as in an inn's upper floor. */
  passage?: string;
  rooms: [name: string, weight: number][];
}
interface UseDef {
  label: string;
  test: RegExp;
  /** Squares across and down, smallest and largest. */
  w: [number, number];
  h: [number, number];
  /** A wide door at the front. */
  grand?: boolean;
  floors: FloorDef[];
}

export const BUILDING_USES: Record<string, UseDef> = {
  tavern: {
    label: 'Tavern or inn',
    test: /\b(tavern|inn|alehouse|taproom|public house|hostel|hostelry)\b/i,
    w: [10, 13],
    h: [8, 10],
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Common room', 6],
          ['Kitchen', 2],
          ['Store room', 1],
          ['Private room', 1.5],
        ],
      },
      {
        title: 'Upper floor',
        passage: 'Landing',
        rooms: [
          ['Guest room', 1.5],
          ['Guest room', 1.5],
          ['Guest room', 1.5],
          ['Guest room', 1.5],
          ['Keeper’s room', 2],
        ],
      },
      {
        title: 'Cellar',
        under: true,
        rooms: [
          ['Cellar', 3],
          ['Cold store', 1],
        ],
      },
    ],
  },
  temple: {
    label: 'Temple or shrine',
    test: /\b(temple|shrine|chapel|church|cathedral|abbey|sanctuary|monastery|priory|fane)\b/i,
    w: [8, 10],
    h: [13, 17],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Nave', 7],
          ['Sanctuary', 2],
          ['Vestry', 1],
          ['Side chapel', 1],
        ],
      },
      {
        title: 'Crypt',
        under: true,
        rooms: [
          ['Crypt', 3],
          ['Ossuary', 1],
        ],
      },
    ],
  },
  smithy: {
    label: 'Smithy or workshop',
    test: /\b(smith|smithy|forge|forges|war-forges|foundry|anvil|workshop|tannery|mill)\b/i,
    w: [7, 9],
    h: [6, 7],
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Forge', 3.5],
          ['Shop', 1.5],
          ['Store room', 1],
        ],
      },
      {
        title: 'Upper floor',
        rooms: [
          ['Living room', 2],
          ['Bedroom', 1.5],
        ],
      },
    ],
  },
  shop: {
    label: 'Shop',
    test: /\b(shop|store|apothecary|bakery|market|merchant|trader|trading post|emporium|chandlery|bookseller)\b/i,
    w: [6, 8],
    h: [6, 8],
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Shop', 3],
          ['Workshop', 2],
          ['Store room', 1],
        ],
      },
      {
        title: 'Upper floor',
        rooms: [
          ['Living room', 2],
          ['Bedroom', 1.5],
          ['Small bedroom', 1],
        ],
      },
    ],
  },
  keep: {
    label: 'Keep or fort',
    test: /\b(keep|fort|fortress|castle|citadel|barracks|garrison|prison|gaol|stronghold|redoubt|gatehouse)\b/i,
    w: [11, 13],
    h: [11, 13],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Great hall', 5],
          ['Guard room', 2],
          ['Armoury', 1.5],
          ['Kitchen', 2],
          ['Store room', 1.5],
        ],
      },
      {
        title: 'Upper floor',
        passage: 'Gallery',
        rooms: [
          ['Lord’s bedchamber', 3],
          ['Solar', 2],
          ['Chapel', 2],
          ['Guest bedchamber', 1.5],
          ['Guest bedchamber', 1.5],
        ],
      },
      {
        title: 'Undercroft',
        under: true,
        rooms: [
          ['Cells', 2],
          ['Store cellar', 2],
          ['Well room', 1],
        ],
      },
    ],
  },
  tower: {
    label: 'Tower',
    test: /\b(tower|spire|lighthouse|observatory|belfry)\b/i,
    w: [5, 6],
    h: [5, 6],
    floors: [
      { title: 'Ground floor', rooms: [['Entry room', 1]] },
      {
        title: 'Second floor',
        rooms: [
          ['Kitchen', 1.5],
          ['Store room', 1],
        ],
      },
      {
        title: 'Third floor',
        rooms: [
          ['Study', 1.5],
          ['Bedroom', 1],
        ],
      },
      { title: 'Top floor', rooms: [['Work room', 1]] },
    ],
  },
  warehouse: {
    label: 'Warehouse',
    test: /\b(warehouse|granary|storehouse|depot|boathouse)\b/i,
    w: [9, 12],
    h: [12, 16],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Warehouse floor', 8],
          ['Office', 1],
          ['Strongroom', 1],
        ],
      },
    ],
  },
  stable: {
    label: 'Stable or barn',
    test: /\b(stable|stables|barn|byre|kennels)\b/i,
    w: [9, 11],
    h: [5, 6],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Stalls', 5],
          ['Tack room', 1],
          ['Feed store', 1],
        ],
      },
    ],
  },
  manor: {
    label: 'Manor',
    test: /\b(manor|mansion|palace|villa|estate|residence|townhouse|great house)\b/i,
    w: [13, 16],
    h: [9, 11],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Entrance hall', 3.5],
          ['Parlour', 2],
          ['Dining room', 2.5],
          ['Kitchen', 2.5],
          ['Study', 1.5],
          ['Servants’ quarters', 1.5],
        ],
      },
      {
        title: 'Upper floor',
        passage: 'Gallery',
        rooms: [
          ['Master bedroom', 3],
          ['Bedroom', 2],
          ['Bedroom', 2],
          ['Bedroom', 2],
          ['Dressing room', 1],
        ],
      },
      {
        title: 'Cellar',
        under: true,
        rooms: [
          ['Wine cellar', 2],
          ['Store cellar', 2],
        ],
      },
    ],
  },
  hall: {
    label: 'Hall or guildhouse',
    test: /\b(hall|guild|guildhall|guildhouse|collegium|school|academy|library|court|council|meeting house|moot)\b/i,
    w: [10, 13],
    h: [8, 10],
    grand: true,
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Great hall', 6],
          ['Antechamber', 1.5],
          ['Kitchen', 2],
          ['Office', 1.5],
        ],
      },
      {
        title: 'Upper floor',
        passage: 'Gallery',
        rooms: [
          ['Records room', 2],
          ['Master’s study', 2],
          ['Guest bedroom', 1.5],
          ['Guest bedroom', 1.5],
          ['Store room', 1],
        ],
      },
    ],
  },
  cottage: {
    label: 'Cottage',
    test: /\b(cottage|hut|hovel|shack|cabin|croft)\b/i,
    w: [5, 6],
    h: [4, 5],
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Main room', 3],
          ['Bedroom', 2],
        ],
      },
    ],
  },
  house: {
    label: 'House',
    test: /\b(house|home|dwelling|farmhouse|lodge)\b/i,
    w: [6, 8],
    h: [5, 7],
    floors: [
      {
        title: 'Ground floor',
        rooms: [
          ['Main room', 3],
          ['Kitchen', 2],
          ['Store room', 1],
        ],
      },
      {
        title: 'Upper floor',
        rooms: [
          ['Bedroom', 2],
          ['Bedroom', 2],
          ['Small bedroom', 1],
        ],
      },
    ],
  },
};

/** What a building is for, from the words used of it. */
export function buildingUse(about: string): string {
  return Object.entries(BUILDING_USES).find(([, d]) => d.test.test(about))?.[0] ?? 'house';
}

export interface BuildingAsk {
  seed: number;
  use: string;
  /** The rooms the record names, in the order of the key; empty for the usual rooms of a building of this use. */
  names: string[];
  /** 0.8 small, 1 as usual, 1.25 large. */
  roomy: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Room extends Rect {
  id: number;
  name: string;
  /** Its place in the key. */
  n: number;
  weight: number;
  passage?: boolean;
}

const WEIGHT = { small: 1, medium: 2, large: 4.5, long: 2 } as const;

/** In a building, the big rooms have a fire, and a taproom has its bar. */
function buildingFurnishings(name: string, use: string): FeatureKind[] {
  if (/\b(common room|taproom|bar)\b/i.test(name)) return ['counter', 'table', 'hearth'];
  if (/\b(main room|living room|parlour|parlor|great hall|entrance hall|dining room)\b/i.test(name)) return ['hearth', 'table'];
  if (/\b(kitchen)\b/i.test(name)) return ['hearth', 'table', 'barrel'];
  if (/\b(warehouse floor)\b/i.test(name)) return ['barrel', 'shelf'];
  if (/\b(shop)\b/i.test(name) && use !== 'smithy') return ['counter', 'shelf'];
  if (/\b(work room|study)\b/i.test(name)) return ['table', 'shelf'];
  return furnishingsOf(name);
}

export function makeBuilding(ask: BuildingAsk): GridPlan {
  const rnd = rng(ask.seed);
  const def = BUILDING_USES[ask.use] ?? BUILDING_USES.house;

  // ---- The storeys and their rooms -----------------------------------------------------------------------------------
  let floors: (FloorDef & { numbered: [name: string, weight: number, n: number][] })[];
  if (ask.names.length) {
    // The record's own rooms: on the ground floor unless a room's name says otherwise.
    const by = { ground: [] as [string, number, number][], upper: [] as [string, number, number][], under: [] as [string, number, number][] };
    // A name may carry its storey ("upper:Solar"), as the key gives it; else the storey is read from the name.
    ask.names.forEach((given, i) => {
      const { floor, name } = storeyAndName(given);
      by[floor ?? storeyOf(name)].push([name, WEIGHT[sizeOf(name)], i + 1]);
    });
    if (!by.ground.length) by.ground = by.upper.length ? by.upper.splice(0) : by.under.splice(0);
    floors = [
      { title: 'Ground floor', rooms: [], numbered: by.ground },
      ...(by.upper.length ? [{ title: 'Upper floor', rooms: [], numbered: by.upper, passage: by.upper.length >= 4 ? 'Landing' : undefined }] : []),
      ...(by.under.length ? [{ title: 'Cellar', under: true, rooms: [], numbered: by.under }] : []),
    ];
  } else {
    let n = 0;
    floors = def.floors.map((f) => ({ ...f, numbered: f.rooms.map(([name, weight]) => [name, weight, ++n]) }));
  }

  // The outline: the same on every storey.
  let W: number;
  let H: number;
  if (ask.names.length) {
    const most = Math.max(...floors.map((f) => f.numbered.reduce((s, r) => s + r[1], 0) + (f.passage ? 2 : 0)));
    const area = Math.max(20, most * 7.5 * ask.roomy);
    W = Math.max(5, Math.min(18, Math.round(Math.sqrt(area * 1.3))));
    H = Math.max(4, Math.min(18, Math.round(area / W)));
    if (def.h[0] > def.w[1]) [W, H] = [Math.min(W, H), Math.max(W, H)];
  } else {
    W = Math.max(4, Math.round(int(rnd, def.w[0], def.w[1]) * ask.roomy));
    H = Math.max(4, Math.round(int(rnd, def.h[0], def.h[1]) * ask.roomy));
  }

  const GAP = 3;
  const TOP = 2;
  // Where each storey's outline starts on the sheet (a storey that covers only part of the outline takes less room).
  const left: number[] = [];
  const SW = floors.length * W + (floors.length - 1) * GAP + 2;
  const SH = H + TOP + 2;
  const cells = new Int16Array(SW * SH);
  const rock = new Uint8Array(SW * SH);
  const rooms: (Room & { floor: number })[] = [];
  let nextId = 2;

  /** Divide a rectangle among rooms, each getting ground in proportion to its weight. */
  const divide = (rect: Rect, list: [string, number, number][], floor: number) => {
    if (!list.length) return;
    if (list.length === 1) return void rooms.push({ ...rect, id: nextId++, name: list[0][0], weight: list[0][1], n: list[0][2], floor });
    const total = list.reduce((s, r) => s + r[1], 0);
    let k = 1;
    for (let sum = list[0][1]; k < list.length - 1 && sum + list[k][1] / 2 < total / 2; k++) sum += list[k][1];
    const [a, b] = [list.slice(0, k), list.slice(k)];
    const share = a.reduce((s, r) => s + r[1], 0) / total;
    const across = rect.w > rect.h || (rect.w === rect.h && chance(rnd, 0.5));
    for (const tryAcross of [across, !across]) {
      const len = tryAcross ? rect.w : rect.h;
      if (len < 4) continue;
      const cut = Math.max(2, Math.min(len - 2, Math.round(len * share)));
      // The first rooms (the main ones) are at the front, which is the bottom of the sheet, or on the left.
      if (tryAcross) {
        divide({ ...rect, w: cut }, a, floor);
        divide({ ...rect, x: rect.x + cut, w: rect.w - cut }, b, floor);
      } else {
        divide({ ...rect, y: rect.y + rect.h - cut, h: cut }, a, floor);
        divide({ ...rect, h: rect.h - cut }, b, floor);
      }
      return;
    }
    // Too small to divide again: the first room has it all, and the others are left out of the plan.
    rooms.push({ ...rect, id: nextId++, name: list[0][0], weight: list[0][1], n: list[0][2], floor });
  };

  const heaviest = Math.max(...floors.map((f) => f.numbered.reduce((s, r) => s + r[1], 0)));
  let nextLeft = 1;
  floors.forEach((f, fi) => {
    left.push(nextLeft);
    const rect: Rect = { x: nextLeft, y: TOP, w: W, h: H };
    // A storey with much less in it than the fullest one covers only part of the outline: a loft, a small cellar.
    const share = f.numbered.reduce((s, r) => s + r[1], 0) / heaviest;
    if (fi > 0 && share < 0.65) {
      if (W >= H) rect.w = Math.max(3, Math.min(W, Math.round(W * (share + 0.12))));
      else {
        const h = Math.max(3, Math.min(H, Math.round(H * (share + 0.12))));
        [rect.y, rect.h] = [rect.y + H - h, h];
      }
    }
    nextLeft += rect.w + GAP;
    const before = rooms.length;
    const list = f.numbered;
    if (f.passage && list.length >= 3 && Math.min(rect.w, rect.h) >= 6) {
      // A passage down the middle of the long way, with rooms off it on both sides.
      const wide = Math.min(rect.w, rect.h) >= 11 ? 2 : 1;
      const total = list.reduce((s, r) => s + r[1], 0);
      let k = 1;
      for (let sum = list[0][1]; k < list.length - 1 && sum + list[k][1] / 2 < total / 2; k++) sum += list[k][1];
      if (rect.w >= rect.h) {
        const py = rect.y + ((rect.h - wide) >> 1);
        rooms.push({ x: rect.x, y: py, w: rect.w, h: wide, id: nextId++, name: f.passage, weight: 0, n: 0, floor: fi, passage: true });
        divideRow({ ...rect, h: py - rect.y }, list.slice(0, k), fi, true);
        divideRow({ ...rect, y: py + wide, h: rect.y + rect.h - py - wide }, list.slice(k), fi, true);
      } else {
        const px = rect.x + ((rect.w - wide) >> 1);
        rooms.push({ x: px, y: rect.y, w: wide, h: rect.h, id: nextId++, name: f.passage, weight: 0, n: 0, floor: fi, passage: true });
        divideRow({ ...rect, w: px - rect.x }, list.slice(0, k), fi, false);
        divideRow({ ...rect, x: px + wide, w: rect.x + rect.w - px - wide }, list.slice(k), fi, false);
      }
    } else divide(rect, list, fi);
    for (const r of rooms.slice(before)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y * SW + x] = r.id;
    if (f.under) for (let y = rect.y - 2; y < rect.y + rect.h + 2; y++) for (let x = rect.x - 2; x < rect.x + rect.w + 2; x++) if (x >= 0 && y >= 0 && x < SW && y < SH) rock[y * SW + x] = 1;
  });

  /** Rooms side by side along a strip, each at least two squares wide. */
  function divideRow(rect: Rect, list: [string, number, number][], floor: number, along: boolean) {
    const len = along ? rect.w : rect.h;
    const fit = list.slice(0, Math.max(1, Math.floor(len / 2)));
    const total = fit.reduce((s, r) => s + r[1], 0);
    let at = 0;
    fit.forEach((r, i) => {
      const left = fit.length - i - 1;
      const size = i === fit.length - 1 ? len - at : Math.max(2, Math.min(len - at - left * 2, Math.round((len * r[1]) / total)));
      rooms.push({ ...(along ? { x: rect.x + at, y: rect.y, w: size, h: rect.h } : { x: rect.x, y: rect.y + at, w: rect.w, h: size }), id: nextId++, name: r[0], weight: r[1], n: r[2], floor });
      at += size;
    });
  }

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : cells[y * SW + x]);
  const roomOf = new Map(rooms.map((r) => [r.id, r]));

  // ---- Stairs: the same squares on every storey, in a room that people pass through on each. --------------------------
  const features: Feature[] = [];
  const stairCells = new Set<number>();
  const stairRoom = new Map<number, number>();
  if (floors.length > 1) {
    let best: { x: number; y: number; down: boolean; score: number } | null = null;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (const down of [true, false]) {
          const [x2, y2] = down ? [x, y + 1] : [x + 1, y];
          if (x2 >= W || y2 >= H) continue;
          let score = rnd() * 0.5;
          let ok = true;
          floors.forEach((_, fi) => {
            const [ox, oy] = [left[fi], TOP];
            const [a, b] = [at(ox + x, oy + y), at(ox + x2, oy + y2)];
            const r = roomOf.get(a);
            if (!a || a !== b || !r) return void (ok = false);
            // Along a wall, not across the middle; and at the end of a passage, not half way down it.
            const sides = down ? [at(ox + x - 1, oy + y), at(ox + x + 1, oy + y)] : [at(ox + x, oy + y - 1), at(ox + x, oy + y + 1)];
            const ends = down ? [at(ox + x, oy + y - 1), at(ox + x, oy + y2 + 1)] : [at(ox + x - 1, oy + y), at(ox + x2 + 1, oy + y)];
            if (r.passage) {
              const alongIt = r.w >= r.h ? !down : down;
              if (!alongIt || ends.every((e) => e === a)) ok = false;
              score += 9;
            } else {
              if (Math.min(r.w, r.h) < 2) ok = false;
              if (!sides.some((s) => s !== a)) score -= 1.5;
              if (ends.some((e) => e !== a)) score += 0.8;
              score += Math.min(3, r.weight * 0.6);
              if (/\b(bed|guest|store|cold|cell|vestry|strongroom|privy|keeper|solar|chapel|study)/i.test(r.name)) score -= 2.5;
            }
          });
          if (ok && (!best || score > best.score)) best = { x, y, down, score };
        }
    const spot = best as { x: number; y: number; down: boolean } | null;
    if (spot) {
      floors.forEach((_, fi) => {
        const [ox, oy] = [left[fi] + spot.x, TOP + spot.y];
        const dir = spot.down ? (at(ox, oy - 1) !== at(ox, oy) ? 0 : 2) : at(ox - 1, oy) !== at(ox, oy) ? 3 : 1;
        features.push({ kind: 'stairs', x: ox, y: oy, w: spot.down ? 1 : 2, h: spot.down ? 2 : 1, dir });
        stairCells.add(oy * SW + ox).add((spot.down ? oy + 1 : oy) * SW + (spot.down ? ox : ox + 1));
        stairRoom.set(fi, at(ox, oy));
      });
    }
  }

  // ---- Doors: every room reached from the room with the stairs (or the main room), by way of the busiest rooms. ------
  const openings = new Map<string, Opening>();
  const doorCells = new Set<number>();
  const exits = new Map<number, string[]>();
  const open = (ax: number, ay: number, bx: number, by: number, kind: Opening['kind']) => {
    const e = edgeOf(ax, ay, bx, by);
    if (openings.has(edgeKey(e))) return;
    openings.set(edgeKey(e), { ...e, kind });
    if (kind === 'window') return;
    const dir = bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0;
    for (const [x, y, d] of [
      [ax, ay, dir],
      [bx, by, (dir + 2) % 4],
    ] as [number, number, number][]) {
      doorCells.add(y * SW + x);
      const id = at(x, y);
      if (id) exits.set(id, [...(exits.get(id) ?? []), `door ${DIR_WORDS[d]}`]);
    }
  };
  /** The edges two rooms share, as pairs of squares; none that would open onto the stairs. */
  const shared = (a: Room, b: Room) => {
    const out: [number, number, number, number][] = [];
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++)
        for (const [dx, dy] of DIRS) if (at(x + dx, y + dy) === b.id && !stairCells.has(y * SW + x) && !stairCells.has((y + dy) * SW + x + dx)) out.push([x, y, x + dx, y + dy]);
    return out;
  };
  const busy = (r: Room) => (r.passage ? 10 : 0) + r.weight - (/\b(bed|guest|cell|strongroom|privy|vestry)/i.test(r.name) ? 3 : 0);
  floors.forEach((f, fi) => {
    const here = rooms.filter((r) => r.floor === fi);
    if (!here.length) return;
    const root = here.find((r) => r.id === stairRoom.get(fi)) ?? here.find((r) => r.passage) ?? [...here].sort((a, b) => busy(b) - busy(a))[0];
    const reached = new Set([root.id]);
    while (reached.size < here.length) {
      let best: { from: Room; to: Room; edges: [number, number, number, number][]; score: number } | null = null;
      for (const from of here.filter((r) => reached.has(r.id)))
        for (const to of here.filter((r) => !reached.has(r.id))) {
          const edges = shared(from, to);
          const score = busy(from) + (from === root ? 2 : 0) + Math.min(edges.length, 3) * 0.1;
          if (edges.length && (!best || score > best.score)) best = { from, to, edges, score };
        }
      if (!best) break;
      // Away from the corners where it can be.
      const e = best.edges.length > 2 ? pick(rnd, best.edges.slice(1, -1)) : pick(rnd, best.edges);
      open(e[0], e[1], e[2], e[3], 'door');
      reached.add(best.to.id);
    }
    // The way in from outside, at the front of the main room if it has a front.
    if (fi === 0) {
      const main = [...here].sort((a, b) => busy(b) - (b.passage ? 10 : 0) - (busy(a) - (a.passage ? 10 : 0)))[0];
      const outside = (r: Room, dir: number) => {
        const out: [number, number, number, number][] = [];
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (at(x + DIRS[dir][0], y + DIRS[dir][1]) === 0 && !stairCells.has(y * SW + x)) out.push([x, y, x + DIRS[dir][0], y + DIRS[dir][1]]);
        return out;
      };
      for (const dir of [2, 3, 1, 0]) {
        const edges = outside(main, dir);
        if (!edges.length) continue;
        const e = edges[edges.length >> 1];
        open(e[0], e[1], e[2], e[3], def.grand ? 'double' : 'door');
        exits.set(main.id, [...(exits.get(main.id) ?? []).slice(0, -1), `the way in, ${DIR_WORDS[dir]}`]);
        break;
      }
      // A back door from the kitchen or the stores.
      const back = here.find((r) => r !== main && /\b(kitchen|store|stalls|workshop|forge)\b/i.test(r.name));
      if (back && chance(rnd, 0.6))
        for (const dir of [0, 1, 3]) {
          const edges = outside(back, dir);
          if (!edges.length) continue;
          const e = pick(rnd, edges);
          open(e[0], e[1], e[2], e[3], 'door');
          break;
        }
    }
    // Windows: in the outside walls of a storey above ground, a couple of squares apart.
    if (!f.under)
      for (const r of here)
        for (let dir = 0; dir < 4; dir++) {
          const run: [number, number][] = [];
          for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (at(x + DIRS[dir][0], y + DIRS[dir][1]) === 0) run.push([x, y]);
          if (/\b(store|strongroom|cell|cold)/i.test(r.name)) continue;
          const step = run.length <= 3 ? 2 : 3;
          for (let i = run.length <= 2 ? 0 : 1; i < run.length; i += step) {
            const [x, y] = run[i];
            const e = edgeOf(x, y, x + DIRS[dir][0], y + DIRS[dir][1]);
            if (!openings.has(edgeKey(e)) && !doorCells.has(y * SW + x)) openings.set(edgeKey(e), { ...e, kind: 'window' });
          }
        }
  });

  // ---- What stands in the rooms ----------------------------------------------------------------------------------------
  for (const r of rooms) {
    if (r.passage) continue;
    const blocked = (x: number, y: number) => doorCells.has(y * SW + x) || stairCells.has(y * SW + x);
    furnish(rnd, r, features, blocked, buildingFurnishings(r.name, ask.use));
  }

  const areas: Area[] = rooms
    .filter((r) => r.n > 0)
    .sort((a, b) => a.n - b.n)
    .map((r) => {
      const taken = (x: number, y: number) => stairCells.has(y * SW + x) || features.some((f) => x + 0.85 > f.x && x + 0.15 < f.x + f.w && y + 0.85 > f.y && y + 0.15 < f.y + f.h);
      const [mx, my] = [r.x + (r.w - 1) / 2, r.y + (r.h - 1) / 2];
      let spot: [number, number] = [Math.floor(mx), Math.floor(my)];
      let d = Infinity;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const k = Math.hypot(x - mx, y - my);
          if (!taken(x, y) && k < d - 1e-9) [spot, d] = [[x, y], k];
        }
      const stairs = stairRoom.get(r.floor) === r.id ? [floors[r.floor].under ? 'stairs up' : r.floor === 0 ? (floors.some((f) => !f.under && f !== floors[0]) ? 'stairs' : 'stairs down') : 'stairs'] : [];
      return { n: r.n, name: r.name, x: spot[0] + 0.5, y: spot[1] + 0.5, feet: [r.w * 5, r.h * 5] as [number, number], exits: [...new Set(exits.get(r.id) ?? []), ...stairs], floor: floors.length > 1 ? floors[r.floor].title : undefined };
    });

  const captions =
    floors.length > 1
      ? floors.map((f, fi) => {
          const here = rooms.filter((r) => r.floor === fi);
          const [x0, x1, y0] = [Math.min(...here.map((r) => r.x)), Math.max(...here.map((r) => r.x + r.w)), Math.min(...here.map((r) => r.y))];
          return { text: f.title, x: (x0 + x1) / 2, y: y0 - 0.75 };
        })
      : [];
  return crop({ cells, n: SW, rows: SH, rough: new Set(), openings: [...openings.values()], features, areas, kind: 'building', rock, captions, margin: 2 });
}
