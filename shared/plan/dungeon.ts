/**
 * A dungeon of rooms and passages, and a cave. Rooms are set down one after another, each beside one already there, so
 * walking in from the entrance meets them roughly in the order they are numbered; passages are then found between them
 * the way a digger would, turning as little as possible and joining a passage that is already there.
 */
import { DIRS, DIR_WORDS, chance, edgeKey, edgeOf, int, noise, pick, rng, shuffled, type Area, type Feature, type GridPlan, type Opening, type OpeningKind, type Rnd } from './model.js';
import { furnishingsOf, sizeOf, type RoomSize } from './names.js';

export interface DungeonAsk {
  seed: number;
  /** The rooms, in the order of the key. */
  names: string[];
  /** How big rooms are: 0.75 cramped, 1 as usual, 1.35 grand. */
  roomy: number;
  /** Cut roughly, as a mine is. */
  rough: boolean;
  /** How many ways round there are, from 0 (every room on one branching path) to 1 (many loops). */
  loops: number;
  secrets: boolean;
  /** Traps marked on the GM's copy. */
  traps: number;
  /** A cave: chambers of no regular shape, joined by winding tunnels, with no doors. */
  natural?: boolean;
  /** Rooms that stay as they are (v0.9.26): the rest are set down around them, and every passage is cut anew. */
  kept?: KeptRoom[];
  /** Doors between two kept rooms, on the same squares as they are: these stay too. */
  keptOpenings?: Opening[];
}

/** A room that is there already. Its squares are on any grid: only how the kept rooms lie to one another matters. */
export interface KeptRoom {
  /** Its place in `names`. */
  at: number;
  squares: [number, number][];
  /** What stands in it, and the square its number is on. */
  features: Feature[];
  label: [number, number];
}

interface Room {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A room kept from before: its squares (it need not be an oblong), what stands in it, and where its number is. */
  fixed?: { squares: [number, number][]; features: Feature[]; label: [number, number] };
}

const N = 180;
const CORRIDOR = 1;

function dims(rnd: Rnd, size: RoomSize, roomy: number, natural = false): [number, number] {
  let w: number;
  let h: number;
  if (natural) {
    if (size === 'small') [w, h] = [int(rnd, 3, 4), int(rnd, 3, 4)];
    else if (size === 'large') [w, h] = [int(rnd, 8, 12), int(rnd, 7, 10)];
    else if (size === 'long') [w, h] = [int(rnd, 3, 4), int(rnd, 7, 11)];
    else [w, h] = [int(rnd, 4, 7), int(rnd, 4, 7)];
  } else if (size === 'small') [w, h] = [int(rnd, 2, 3), int(rnd, 2, 3)];
  else if (size === 'large') [w, h] = [int(rnd, 6, 9), int(rnd, 5, 8)];
  else if (size === 'long') [w, h] = [int(rnd, 2, 3), int(rnd, 6, 10)];
  else [w, h] = [int(rnd, 3, 6), int(rnd, 3, 5)];
  if (chance(rnd, 0.5)) [w, h] = [h, w];
  const s = (v: number) => Math.max(2, Math.min(13, Math.round(v * roomy)));
  return [s(w), s(h)];
}

const overlaps = (a: Room, b: Room, pad: number) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/** A small heap, for finding the cheapest way. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, v: number) {
    const a = this.items;
    a.push([cost, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** The squares just outside a room's walls (not its corners), each with the room square it touches and which way out it is. */
function doorsteps(r: Room): { x: number; y: number; rx: number; ry: number; dir: number }[] {
  const out: { x: number; y: number; rx: number; ry: number; dir: number }[] = [];
  if (r.fixed) {
    // A room of any shape: every square beside one of its own that is not its own.
    const mine = new Set(r.fixed.squares.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of r.fixed.squares) DIRS.forEach(([dx, dy], dir) => !mine.has(`${x + dx},${y + dy}`) && out.push({ x: x + dx, y: y + dy, rx: x, ry: y, dir }));
    return out;
  }
  for (let x = r.x; x < r.x + r.w; x++) {
    out.push({ x, y: r.y - 1, rx: x, ry: r.y, dir: 0 });
    out.push({ x, y: r.y + r.h, rx: x, ry: r.y + r.h - 1, dir: 2 });
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    out.push({ x: r.x + r.w, y, rx: r.x + r.w - 1, ry: y, dir: 1 });
    out.push({ x: r.x - 1, y, rx: r.x, ry: y, dir: 3 });
  }
  return out;
}

export function makeDungeon(ask: DungeonAsk): GridPlan {
  const rnd = rng(ask.seed);
  const cells = new Int16Array(N * N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : cells[y * N + x]);
  const names = ask.names.length ? ask.names : ['Entry hall'];

  // ---- Rooms ---------------------------------------------------------------------------------------------------------
  const rooms: Room[] = [];
  const links: { a: Room; b: Room; gap: number; extra?: boolean }[] = [];
  const natural = !!ask.natural;
  const keptDoors: Opening[] = [];
  // The way in is on one side of the first room, and nothing is built past that side: the entrance is at the edge.
  const entry = int(rnd, 0, 3);
  const pastEntrance = (r: Room, first: Room) => (entry === 2 ? r.y + r.h > first.y + first.h : entry === 0 ? r.y < first.y : entry === 1 ? r.x + r.w > first.x + first.w : r.x < first.x);
  // Rooms kept from before are set down first, where they were (the middle of them at the middle of the sheet), each
  // joined to the nearest already down. The others are then set down around them.
  const kept = new Map<number, KeptRoom>((ask.kept ?? []).filter((k) => k.at >= 0 && k.at < names.length && k.squares.length).map((k) => [k.at, k]));
  if (kept.size) {
    let [kx0, ky0, kx1, ky1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const k of kept.values()) for (const [x, y] of k.squares) [kx0, ky0, kx1, ky1] = [Math.min(kx0, x), Math.min(ky0, y), Math.max(kx1, x), Math.max(ky1, y)];
    const [ox, oy] = [(N >> 1) - Math.round((kx0 + kx1) / 2), (N >> 1) - Math.round((ky0 + ky1) / 2)];
    const gapTo = (a: Room, b: Room) => Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)) + Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    for (const [i, k] of [...kept].sort((a, b) => a[0] - b[0])) {
      const squares = k.squares.map(([x, y]) => [x + ox, y + oy] as [number, number]);
      const xs = squares.map((c) => c[0]);
      const ys = squares.map((c) => c[1]);
      const room: Room = {
        id: i + 2,
        name: names[i],
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs) + 1,
        h: Math.max(...ys) - Math.min(...ys) + 1,
        fixed: { squares, features: k.features.map((f) => ({ ...f, x: f.x + ox, y: f.y + oy })), label: [k.label[0] + ox, k.label[1] + oy] },
      };
      if (room.x < 12 || room.y < 12 || room.x + room.w > N - 12 || room.y + room.h > N - 12) continue;
      if (rooms.length) {
        const parent = rooms.reduce((best, o) => (gapTo(room, o) < gapTo(room, best) ? o : best), rooms[0]);
        links.push({ a: parent, b: room, gap: gapTo(room, parent) });
      }
      rooms.push(room);
    }
    for (const o of ask.keptOpenings ?? []) keptDoors.push({ ...o, x: o.x + ox, y: o.y + oy });
  }
  const someKept = rooms.length > 0;
  names.forEach((name, i) => {
    if (rooms.some((r) => r.id === i + 2)) return;
    const size = sizeOf(name);
    let best: { room: Room; parent: number; gap: number; score: number } | null = null;
    for (let attempt = 0, found = 0; attempt < 240 && found < 6; attempt++) {
      const [w, h] = dims(rnd, size, attempt > 120 ? ask.roomy * 0.8 : ask.roomy, natural);
      if (!rooms.length) {
        best = { room: { id: i + 2, name, x: (N >> 1) - (w >> 1), y: (N >> 1) - (h >> 1), w, h }, parent: -1, gap: 0, score: 0 };
        break;
      }
      // Mostly beside the room before, sometimes beside an older one: a main way with branches off it.
      const before = someKept ? rooms.length : i;
      const p = Math.max(0, before - 1 - Math.floor(rnd() ** 1.6 * before));
      const parent = rooms[p];
      const side = int(rnd, 0, 3);
      const gap = natural ? pick(rnd, [1, 1, 2, 3, 4]) : pick(rnd, [0, 2, 2, 3, 3, 4, 5]);
      const ov = (a: number, b: number) => Math.min(2, a, b);
      const r: Room = { id: i + 2, name, x: 0, y: 0, w, h };
      if (side === 0 || side === 2) {
        r.y = side === 0 ? parent.y - gap - h : parent.y + parent.h + gap;
        r.x = int(rnd, parent.x - w + ov(w, parent.w), parent.x + parent.w - ov(w, parent.w));
      } else {
        r.x = side === 3 ? parent.x - gap - w : parent.x + parent.w + gap;
        r.y = int(rnd, parent.y - h + ov(h, parent.h), parent.y + parent.h - ov(h, parent.h));
      }
      if (r.x < 12 || r.y < 12 || r.x + r.w > N - 12 || r.y + r.h > N - 12) continue;
      if ((!someKept && pastEntrance(r, rooms[0])) || rooms.some((o, k) => (k === p ? overlaps(r, o, 0) : overlaps(r, o, 1)))) continue;
      found++;
      const cx = rooms.reduce((s, o) => s + o.x + o.w / 2, 0) / rooms.length;
      const cy = rooms.reduce((s, o) => s + o.y + o.h / 2, 0) / rooms.length;
      const score = Math.hypot(r.x + w / 2 - cx, (r.y + h / 2 - cy) * 1.25) + rnd() * 9;
      if (!best || score < best.score) best = { room: r, parent: p, gap, score };
    }
    if (!best) return; // no room for it: the key says so (its line has no number on the plan)
    if (best.parent >= 0) links.push({ a: rooms[best.parent], b: best.room, gap: best.gap });
    rooms.push(best.room);
  });
  // In the order of the key, whatever order they were set down in.
  rooms.sort((a, b) => a.id - b.id);
  for (const r of rooms) {
    if (r.fixed) {
      for (const [x, y] of r.fixed.squares) cells[y * N + x] = r.id;
      continue;
    }
    if (!natural) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y * N + x] = r.id;
      continue;
    }
    // A chamber of no regular shape: a ragged oval, grown from its middle so that it is all one piece.
    const [mx, my] = [r.x + r.w / 2, r.y + r.h / 2];
    const inside = (x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && ((x + 0.5 - mx) / (r.w / 2)) ** 2 + ((y + 0.5 - my) / (r.h / 2)) ** 2 < 1.02 + (noise(x, y, ask.seed) - 0.5) * 0.6;
    const start: [number, number] = [Math.floor(mx), Math.floor(my)];
    cells[start[1] * N + start[0]] = r.id;
    for (let q = [start], k = 0; k < q.length; k++)
      for (const [dx, dy] of DIRS) {
        const [x, y] = [q[k][0] + dx, q[k][1] + dy];
        if (inside(x, y) && !cells[y * N + x]) ((cells[y * N + x] = r.id), q.push([x, y]));
      }
    // A big chamber has a pillar of rock left standing in it.
    if (r.w >= 7 && r.h >= 7) {
      const [px, py] = [Math.floor(mx + (chance(rnd, 0.5) ? -1 : 1) * r.w * 0.22), Math.floor(my + (chance(rnd, 0.5) ? -1 : 1) * r.h * 0.22)];
      cells[py * N + px] = 0;
      if (chance(rnd, 0.6)) cells[(py + (chance(rnd, 0.5) ? 1 : 0)) * N + px + 1] = 0;
      // Any floor the pillar has cut off from the rest is filled in again.
      const reached = new Set([start[1] * N + start[0]]);
      for (let q = [start[1] * N + start[0]], k = 0; k < q.length; k++)
        for (const [dx, dy] of DIRS) {
          const c = q[k] + dx + dy * N;
          if (cells[c] === r.id && !reached.has(c)) (reached.add(c), q.push(c));
        }
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (cells[y * N + x] === r.id && !reached.has(y * N + x)) cells[y * N + x] = 0;
    }
  }

  let [x0, y0, x1, y1] = [N, N, 0, 0];
  for (const r of rooms) [x0, y0, x1, y1] = [Math.min(x0, r.x), Math.min(y0, r.y), Math.max(x1, r.x + r.w), Math.max(y1, r.y + r.h)];
  const inBounds = (x: number, y: number) => x >= x0 - 4 && y >= y0 - 4 && x < x1 + 4 && y < y1 + 4;

  // ---- The way in ----------------------------------------------------------------------------------------------------
  // Cut first, so that no passage is dug across it: three squares out from the first room, with stairs up at the end
  // (or, for a cave, a tunnel that runs on to the edge of the sheet).
  const features: Feature[] = [];
  const openings = new Map<string, Opening>();
  const open = (ax: number, ay: number, bx: number, by: number, kind: OpeningKind) => {
    const e = edgeOf(ax, ay, bx, by);
    if (!openings.has(edgeKey(e))) openings.set(edgeKey(e), { ...e, kind });
  };
  const keep = new Set<number>();
  const first = rooms[0];
  let wayIn = '';
  let mouth: { x: number; y: number } | null = null;
  let entryStep: ReturnType<typeof doorsteps>[number] | null = null;
  // Among rooms that were there already, the way in is cut wherever there is clear ground for it: if there is none,
  // the place has no way in until one is drawn.
  const clearFor = (st: ReturnType<typeof doorsteps>[number]) => {
    const [dx, dy] = DIRS[st.dir];
    for (let k = 0; k < 4; k++) for (const side of [-1, 0, 1]) if (at(st.x + dx * k + dy * side, st.y + dy * k + dx * side) !== 0) return false;
    return true;
  };
  const sideSteps = (dir: number) => doorsteps(first).filter((st) => st.dir === dir);
  const way = someKept ? ([0, 1, 2, 3].flatMap((k) => sideSteps((entry + k) % 4).sort((a, b) => Math.abs(a.x + a.y - first.x - first.y - (first.w + first.h) / 2) - Math.abs(b.x + b.y - first.x - first.y - (first.w + first.h) / 2))).find(clearFor) ?? null) : sideSteps(entry)[sideSteps(entry).length >> 1];
  if (way) {
    const s = way;
    const entry = way.dir;
    entryStep = s;
    const [dx, dy] = DIRS[entry];
    for (let k = 0; k < 3; k++) {
      const [x, y] = [s.x + dx * k, s.y + dy * k];
      cells[y * N + x] = CORRIDOR;
      for (const side of [-1, 0, 1]) keep.add((y + dx * side) * N + x + dy * side);
    }
    keep.add((s.y + dy * 3) * N + s.x + dx * 3);
    if (natural) {
      mouth = { x: s.x + dx * 2, y: s.y + dy * 2 };
      wayIn = `the way out, ${DIR_WORDS[entry]}`;
    } else {
      open(s.x, s.y, s.rx, s.ry, 'door');
      features.push({ kind: 'stairs', x: Math.min(s.x + dx, s.x + dx * 2), y: Math.min(s.y + dy, s.y + dy * 2), w: dx ? 2 : 1, h: dy ? 2 : 1, dir: entry as 0 | 1 | 2 | 3 });
      wayIn = `stairs up to the outside, ${DIR_WORDS[entry]}`;
    }
  }

  // ---- Doors and passages --------------------------------------------------------------------------------------------
  const doorKind = (): OpeningKind => (chance(rnd, 0.16) ? 'arch' : chance(rnd, 0.07) ? 'bars' : 'door');
  const diggable = (x: number, y: number) => (at(x, y) === 0 || at(x, y) === CORRIDOR) && !keep.has(y * N + x);

  /** The cheapest passage from one room to another, through solid ground or along passages already cut. */
  const route = (a: Room, b: Room): { path: [number, number][]; from: [number, number]; to: [number, number] } | null => {
    const goals = new Map<number, [number, number]>();
    for (const s of doorsteps(b)) if (diggable(s.x, s.y)) goals.set(s.y * N + s.x, [s.rx, s.ry]);
    const starts = new Map<number, [number, number]>();
    const cost = new Map<number, number>();
    const prev = new Map<number, number>();
    const heap = new Heap();
    const stepCost = (x: number, y: number, fromX: number, fromY: number) => {
      // A tunnel wanders; a dug passage does not.
      if (natural) return at(x, y) === CORRIDOR ? 0.4 : 1 + noise(x, y, ask.seed + 5) * 2.2;
      if (at(x, y) === CORRIDOR) return 0.35;
      let c = 1;
      for (const [dx, dy] of DIRS) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx === fromX && ny === fromY) continue;
        const v = at(nx, ny);
        // Two passages side by side would read as one wide room; one hard against a room it doesn't serve looks cramped.
        if (v === CORRIDOR) c += 2.5;
        else if (v > CORRIDOR && v !== a.id && v !== b.id) c += 0.5;
      }
      return c;
    };
    for (const s of doorsteps(a)) {
      if (!diggable(s.x, s.y)) continue;
      const state = (s.y * N + s.x) * 4 + s.dir;
      const c = stepCost(s.x, s.y, s.rx, s.ry);
      if (c < (cost.get(state) ?? Infinity)) {
        cost.set(state, c);
        starts.set(s.y * N + s.x, [s.rx, s.ry]);
        heap.push(c, state);
      }
    }
    while (heap.size) {
      const [c, state] = heap.pop();
      if (c > (cost.get(state) ?? Infinity)) continue;
      const cell = state >> 2;
      const dir = state & 3;
      const [x, y] = [cell % N, Math.floor(cell / N)];
      if (goals.has(cell)) {
        const path: [number, number][] = [];
        let s: number | undefined = state;
        while (s !== undefined) {
          const k = s >> 2;
          path.unshift([k % N, Math.floor(k / N)]);
          s = prev.get(s);
        }
        const firstCell = path[0][1] * N + path[0][0];
        return { path, from: starts.get(firstCell)!, to: goals.get(cell)! };
      }
      for (let d = 0; d < 4; d++) {
        if (d === (dir + 2) % 4) continue;
        const [nx, ny] = [x + DIRS[d][0], y + DIRS[d][1]];
        if (!diggable(nx, ny) || !inBounds(nx, ny)) continue;
        const next = (ny * N + nx) * 4 + d;
        const nc = c + stepCost(nx, ny, x, y) + (d === dir ? 0 : natural ? 0.25 : 1.2);
        if (nc < (cost.get(next) ?? Infinity)) {
          cost.set(next, nc);
          prev.set(next, state);
          heap.push(nc, next);
        }
      }
    }
    return null;
  };

  /** In a cave, a tunnel that reaches a chamber's edge is carried on to its floor. */
  const into = (r: Room, x: number, y: number) => {
    const [mx, my] = [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
    for (let guard = 0; guard < 40 && cells[y * N + x] !== r.id; guard++) {
      if (cells[y * N + x] === 0) cells[y * N + x] = CORRIDOR;
      if (Math.abs(mx - x) >= Math.abs(my - y) && mx !== x) x += Math.sign(mx - x);
      else if (my !== y) y += Math.sign(my - y);
      else break;
    }
  };

  const join = (a: Room, b: Room, kinds: [OpeningKind, OpeningKind]) => {
    const r = route(a, b);
    if (!r) return false;
    for (const [x, y] of r.path) {
      if (cells[y * N + x] === 0) cells[y * N + x] = CORRIDOR;
      // A tunnel is wider here and there.
      if (natural && chance(rnd, 0.3)) {
        const [dx, dy] = pick(rnd, DIRS);
        if (diggable(x + dx, y + dy)) cells[(y + dy) * N + x + dx] = CORRIDOR;
      }
    }
    const last = r.path[r.path.length - 1];
    if (natural) {
      into(a, r.from[0], r.from[1]);
      into(b, r.to[0], r.to[1]);
    } else {
      open(r.path[0][0], r.path[0][1], r.from[0], r.from[1], kinds[0]);
      open(last[0], last[1], r.to[0], r.to[1], kinds[1]);
    }
    return true;
  };

  // Doors between two rooms that were kept stay where they are, and those two need no other way between them.
  const doored = new Set<string>();
  for (const o of keptDoors) {
    const [ax, ay] = o.side === 'n' ? [o.x, o.y - 1] : [o.x - 1, o.y];
    const [ra, rb] = [at(ax, ay), at(o.x, o.y)];
    if (ra < 2 || rb < 2 || ra === rb) continue;
    openings.set(edgeKey(o), o);
    doored.add(`${Math.min(ra, rb)}-${Math.max(ra, rb)}`);
  }
  for (const l of links) {
    const [a, b] = [l.a, l.b];
    if (doored.has(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`)) continue;
    // They share a wall: a door in it, somewhere along the part they share.
    const shared = l.gap === 0 ? doorsteps(b).filter((s) => at(s.x, s.y) === a.id) : [];
    if (shared.length) {
      const s = pick(rnd, shared);
      open(s.x, s.y, s.rx, s.ry, chance(rnd, 0.85) ? 'door' : 'arch');
    } else join(a, b, [doorKind(), doorKind()]);
  }
  if (natural && entryStep) into(first, entryStep.rx, entryStep.ry);
  // More ways round: rooms that are near each other and not yet joined.
  const placeOf = new Map(rooms.map((r, i) => [r, i]));
  const linked = new Set(links.map((l) => `${Math.min(placeOf.get(l.a)!, placeOf.get(l.b)!)}-${Math.max(placeOf.get(l.a)!, placeOf.get(l.b)!)}`));
  const near: [number, number][] = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const [a, b] = [rooms[i], rooms[j]];
      const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
      const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
      if (!linked.has(`${i}-${j}`) && dx + dy <= 7) near.push([i, j]);
    }
  const extra = Math.round(ask.loops * Math.max(1, rooms.length / 2.5));
  for (const [i, j] of shuffled(rnd, near).slice(0, extra)) {
    const secret = ask.secrets && !natural && chance(rnd, 0.4);
    if (join(rooms[i], rooms[j], [secret ? 'secret' : doorKind(), doorKind()])) links.push({ a: rooms[i], b: rooms[j], gap: 1, extra: true });
  }

  // ---- A cave is one space: its chambers and tunnels have no walls between them. -------------------------------------
  if (natural) {
    const areas: Area[] = rooms.map((r, i) => {
      let [x, y] = [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
      const kinds = furnishingsOf(r.name);
      if ((kinds.includes('pool') || kinds.includes('well')) && r.w >= 4 && r.h >= 4) {
        // The water to one side of the middle, the number to the other.
        const [pw, ph] = [Math.min(3.2, r.w * 0.36), Math.min(2.6, r.h * 0.32)];
        const wide = r.w >= r.h;
        features.push({ kind: 'pool', x: x + 0.5 - pw / 2 + (wide ? r.w * 0.22 : 0), y: y + 0.5 - ph / 2 + (wide ? 0 : r.h * 0.22), w: pw, h: ph });
        const [lx, ly] = [x - (wide ? Math.max(1, Math.round(r.w * 0.2)) : 0), y - (wide ? 0 : Math.max(1, Math.round(r.h * 0.2)))];
        if (cells[ly * N + lx] === r.id) [x, y] = [lx, ly];
      } else if (kinds.includes('rubble') || chance(rnd, 0.35)) {
        const [dx, dy] = pick(rnd, [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]);
        const [fx, fy] = [x + dx * Math.max(1, Math.floor(r.w / 4)), y + dy * Math.max(1, Math.floor(r.h / 4))];
        if (cells[fy * N + fx] === r.id) features.push({ kind: 'rubble', x: fx, y: fy, w: 1, h: 1 });
      }
      return { n: r.id - 1, name: r.name, x: x + 0.5, y: y + 0.5, feet: [r.w * 5, r.h * 5], exits: i === 0 ? [wayIn] : [] };
    });
    for (let i = 0; i < cells.length; i++) if (cells[i]) cells[i] = CAVE;
    const { plan, dx, dy } = cropped({ cells, n: N, rough: new Set([CAVE]), openings: [], features, areas, kind: 'cave' });
    // The tunnel out runs on to the edge of the sheet.
    if (mouth) {
      const [ex, ey] = DIRS[entry];
      let [x, y] = [mouth.x + dx, mouth.y + dy];
      while (x >= 0 && y >= 0 && x < plan.w && y < plan.h) {
        plan.cells[y * plan.w + x] = CAVE;
        [x, y] = [x + ex, y + ey];
      }
      plan.openings.push(entry === 0 ? { x, y: 0, side: 'n', kind: 'open' } : entry === 2 ? { x, y: plan.h, side: 'n', kind: 'open' } : entry === 3 ? { x: 0, y, side: 'w', kind: 'open' } : { x: plan.w, y, side: 'w', kind: 'open' });
    }
    return plan;
  }

  // ---- What is in the rooms ------------------------------------------------------------------------------------------
  const doorCells = new Set<number>();
  const exits = new Map<number, string[]>();
  for (const o of openings.values()) {
    const [ax, ay] = o.side === 'n' ? [o.x, o.y - 1] : [o.x - 1, o.y];
    const word = o.kind === 'arch' ? 'archway' : o.kind === 'secret' ? 'secret door' : o.kind === 'bars' ? 'portcullis' : 'door';
    for (const [x, y, dir] of [
      [ax, ay, o.side === 'n' ? 2 : 1],
      [o.x, o.y, o.side === 'n' ? 0 : 3],
    ] as [number, number, number][]) {
      doorCells.add(y * N + x);
      const id = at(x, y);
      if (id >= 2) exits.set(id, [...(exits.get(id) ?? []), `${word} ${DIR_WORDS[dir]}`]);
    }
  }
  for (const r of rooms) {
    if (r.fixed) features.push(...r.fixed.features);
    else furnish(rnd, r, features, (x, y) => doorCells.has(y * N + x));
  }

  if (ask.traps > 0) {
    const spots: [number, number][] = [];
    for (let y = y0 - 4; y < y1 + 4; y++) for (let x = x0 - 4; x < x1 + 4; x++) if (at(x, y) === CORRIDOR && !doorCells.has(y * N + x) && !features.some((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)) spots.push([x, y]);
    for (const [x, y] of shuffled(rnd, spots).slice(0, ask.traps)) features.push({ kind: 'trap', x, y, w: 1, h: 1, gm: true });
  }

  const areas: Area[] = rooms.map((r, i) => {
    const taken = (x: number, y: number) => features.some((f) => x + 0.85 > f.x && x + 0.15 < f.x + f.w && y + 0.85 > f.y && y + 0.15 < f.y + f.h);
    const spot = r.fixed ? r.fixed.label : labelSpot(r, taken);
    // A room has the number of its place in the key, whether or not every room before it found room on the plan.
    return { n: r.id - 1, name: r.name, x: spot[0] + 0.5, y: spot[1] + 0.5, feet: [r.w * 5, r.h * 5], exits: [...new Set(exits.get(r.id) ?? []), ...(i === 0 && wayIn ? [wayIn] : [])], ...(r.fixed ? { kept: true } : {}) };
  });

  const rough = new Set<number>(ask.rough ? [CORRIDOR, ...rooms.map((r) => r.id)] : []);
  return crop({ cells, n: N, rough, openings: [...openings.values()], features, areas, kind: 'dungeon' });
}

/** The square nearest the middle of a room that has nothing standing on it. */
function labelSpot(r: Room, taken: (x: number, y: number) => boolean): [number, number] {
  const [mx, my] = [r.x + (r.w - 1) / 2, r.y + (r.h - 1) / 2];
  let best: [number, number] = [Math.floor(mx), Math.floor(my)];
  let d = Infinity;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      if (taken(x, y)) continue;
      const k = Math.hypot(x - mx, y - my);
      if (k < d - 1e-9) [best, d] = [[x, y], k];
    }
  return best;
}

/**
 * Put into a room what its name says is there. Squares by a door are kept clear, and so is a way through the middle
 * where it can be.
 */
export function furnish(rnd: Rnd, r: Room, features: Feature[], byDoor: (x: number, y: number) => boolean, kinds = furnishingsOf(r.name)): void {
  const used = new Set<string>();
  const free = (x: number, y: number, w = 1, h = 1) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (x + i < r.x || y + j < r.y || x + i >= r.x + r.w || y + j >= r.y + r.h || byDoor(x + i, y + j) || used.has(`${x + i},${y + j}`)) return false;
    return true;
  };
  const put = (f: Feature, pad = 0) => {
    features.push(f);
    for (let j = Math.floor(f.y) - pad; j < Math.ceil(f.y + f.h) + pad; j++) for (let i = Math.floor(f.x) - pad; i < Math.ceil(f.x + f.w) + pad; i++) used.add(`${i},${j}`);
  };
  const wide = r.w >= r.h;
  const area = r.w * r.h;
  // The end of the room farthest from a door: where the altar or the throne is.
  const ends: { x: number; y: number; dir: 0 | 1 | 2 | 3 }[] = wide
    ? [
        { x: r.x, y: r.y + ((r.h - 1) >> 1), dir: 1 },
        { x: r.x + r.w - 1, y: r.y + ((r.h - 1) >> 1), dir: 3 },
      ]
    : [
        { x: r.x + ((r.w - 1) >> 1), y: r.y, dir: 2 },
        { x: r.x + ((r.w - 1) >> 1), y: r.y + r.h - 1, dir: 0 },
      ];
  const doorDistance = (x: number, y: number) => {
    let d = Infinity;
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) if (byDoor(i, j)) d = Math.min(d, Math.abs(i - x) + Math.abs(j - y));
    return d;
  };
  const far = [...ends].sort((a, b) => doorDistance(b.x, b.y) - doorDistance(a.x, a.y))[0];
  const corners = (): [number, number][] =>
    shuffled(rnd, [
      [r.x, r.y],
      [r.x + r.w - 1, r.y],
      [r.x, r.y + r.h - 1],
      [r.x + r.w - 1, r.y + r.h - 1],
    ]);
  /** Squares along the walls, each with the way it faces into the room. */
  const alongWalls = (): { x: number; y: number; dir: 0 | 1 | 2 | 3 }[] => {
    const out: { x: number; y: number; dir: 0 | 1 | 2 | 3 }[] = [];
    for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y: r.y, dir: 2 }, { x, y: r.y + r.h - 1, dir: 0 });
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) out.push({ x: r.x, y, dir: 1 }, { x: r.x + r.w - 1, y, dir: 3 });
    return out;
  };

  for (const kind of kinds) {
    if (kind === 'pillar') {
      if (r.w < 5 || r.h < 5) continue;
      if (wide) {
        for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) for (const y of [r.y + 1, r.y + r.h - 2]) if (free(x, y)) put({ kind, x: x + 0.22, y: y + 0.22, w: 0.56, h: 0.56 });
      } else for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) for (const x of [r.x + 1, r.x + r.w - 2]) if (free(x, y)) put({ kind, x: x + 0.22, y: y + 0.22, w: 0.56, h: 0.56 });
    } else if (kind === 'altar' || kind === 'throne') {
      const two = kind === 'altar' && (wide ? r.h : r.w) >= 4;
      const [w, h] = two ? (wide ? [1, 2] : [2, 1]) : [1, 1];
      const [x, y] = [far.x - (two && !wide && far.x + 1 >= r.x + r.w ? 1 : 0), far.y - (two && wide && far.y + 1 >= r.y + r.h ? 1 : 0)];
      if (free(x, y, w, h)) put({ kind, x: x + 0.12, y: y + 0.12, w: w - 0.24, h: h - 0.24, dir: far.dir });
    } else if (kind === 'tomb') {
      const want = Math.max(1, Math.min(4, Math.floor(area / 9)));
      let n = 0;
      if (wide) {
        for (let x = r.x + 1; x < r.x + r.w - 1 && n < want; x += 2) {
          const y = r.y + Math.max(0, (r.h - 2) >> 1);
          if (free(x, y, 1, Math.min(2, r.h))) (put({ kind, x: x + 0.15, y: y + 0.1, w: 0.7, h: Math.min(2, r.h) - 0.2 }), n++);
        }
      } else
        for (let y = r.y + 1; y < r.y + r.h - 1 && n < want; y += 2) {
          const x = r.x + Math.max(0, (r.w - 2) >> 1);
          if (free(x, y, Math.min(2, r.w), 1)) (put({ kind, x: x + 0.1, y: y + 0.15, w: Math.min(2, r.w) - 0.2, h: 0.7 }), n++);
        }
      if (!n) {
        const corner = corners().find(([x, y]) => free(x, y));
        if (corner) put({ kind, x: corner[0] + 0.15, y: corner[1] + 0.15, w: 0.7, h: 0.7 });
      }
    } else if (kind === 'chest') {
      let n = Math.max(1, Math.min(3, Math.floor(area / 10)));
      for (const [x, y] of corners().sort((a, b) => doorDistance(b[0], b[1]) - doorDistance(a[0], a[1]))) if (n > 0 && free(x, y)) (put({ kind, x: x + 0.2, y: y + 0.28, w: 0.6, h: 0.44 }), n--);
    } else if (kind === 'pool' || kind === 'well') {
      const s = kind === 'well' ? 1 : Math.max(1, Math.min(4, Math.min(r.w, r.h) - 2));
      const [x, y] = [r.x + ((r.w - s) >> 1), r.y + ((r.h - s) >> 1)];
      if (free(x, y, s, s)) put({ kind, x: x + 0.1, y: y + 0.1, w: s - 0.2, h: s - 0.2 });
    } else if (kind === 'statue') {
      let n = Math.max(1, Math.min(4, Math.floor(area / 8)));
      for (const [x, y] of corners()) if (n > 0 && free(x, y)) (put({ kind, x: x + 0.18, y: y + 0.18, w: 0.64, h: 0.64 }), n--);
    } else if (kind === 'rubble') {
      let n = Math.max(1, Math.min(4, Math.floor(area / 6)));
      for (const s of shuffled(rnd, alongWalls())) if (n > 0 && free(s.x, s.y)) (put({ kind, x: s.x, y: s.y, w: 1, h: 1 }), n--);
    } else if (kind === 'bed') {
      // A bedroom has a bed; a barracks has as many as fit.
      let n = /\b(bedroom|bedchamber|keeper|solar|master)/i.test(r.name) ? 1 : /\bguest\b/i.test(r.name) ? Math.min(2, Math.max(1, Math.floor(area / 10))) : Math.max(1, Math.min(6, Math.floor(area / 7)));
      for (const s of shuffled(rnd, alongWalls())) {
        if (n <= 0) break;
        // Head to the wall, foot into the room.
        const [dx, dy] = DIRS[s.dir];
        const [x, y] = [Math.min(s.x, s.x + dx), Math.min(s.y, s.y + dy)];
        const [w, h] = dx ? [2, 1] : [1, 2];
        if ((dx ? r.w : r.h) >= 3 && free(x, y, w, h)) (put({ kind, x: x + 0.12, y: y + 0.12, w: w - 0.24, h: h - 0.24, dir: s.dir }, 0), n--);
      }
    } else if (kind === 'table') {
      const big = area >= 30;
      const [w, h] = big ? (wide ? [2, 1] : [1, 2]) : [1, 1];
      let n = Math.max(1, Math.min(4, Math.floor(area / 14)));
      const spots: [number, number][] = [];
      for (let y = r.y + 1; y + h < r.y + r.h; y++) for (let x = r.x + 1; x + w < r.x + r.w; x++) spots.push([x, y]);
      if (!spots.length && free(r.x + ((r.w - 1) >> 1), r.y + ((r.h - 1) >> 1))) spots.push([r.x + ((r.w - 1) >> 1), r.y + ((r.h - 1) >> 1)]);
      const [mx, my] = [r.x + (r.w - w) / 2, r.y + (r.h - h) / 2];
      for (const [x, y] of spots.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))) {
        // A square's space between tables.
        let roomFor = true;
        for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (used.has(`${x + i},${y + j}`)) roomFor = false;
        if (n > 0 && roomFor && free(x, y, w, h)) (put({ kind, x: x + 0.14, y: y + 0.14, w: w - 0.28, h: h - 0.28 }), n--);
      }
    } else if (kind === 'anvil') {
      const [x, y] = [r.x + ((r.w - 1) >> 1), r.y + ((r.h - 1) >> 1)];
      if (free(x, y)) put({ kind, x: x + 0.2, y: y + 0.3, w: 0.6, h: 0.4 });
      if (free(far.x, far.y)) put({ kind: 'hearth', x: far.x, y: far.y, w: 1, h: 1, dir: far.dir });
    } else if (kind === 'shelf' || kind === 'counter') {
      // Along the longest run of wall that has no door in it.
      const runs: { x: number; y: number; dir: 0 | 1 | 2 | 3 }[][] = [];
      for (const dir of shuffled(rnd, [0, 1, 2, 3] as const)) {
        let run: { x: number; y: number; dir: 0 | 1 | 2 | 3 }[] = [];
        for (const s of alongWalls().filter((w) => w.dir === dir)) {
          if (free(s.x, s.y)) run.push(s);
          else {
            if (run.length) runs.push(run);
            run = [];
          }
        }
        if (run.length) runs.push(run);
      }
      const run = runs.sort((a, b) => b.length - a.length)[0];
      if (!run || run.length < 2) continue;
      const part = run.slice(0, Math.min(run.length, kind === 'counter' ? 4 : 6));
      const [a, b] = [part[0], part[part.length - 1]];
      const d = a.dir;
      const depth = kind === 'counter' ? 0.34 : 0.3;
      // A counter stands a square out from the wall, with room behind it; shelves are on the wall.
      const out = kind === 'counter' && (d % 2 ? r.w : r.h) >= 4 ? 1 : 0;
      const [dx, dy] = DIRS[d];
      const f: Feature =
        d === 0 || d === 2
          ? { kind, x: Math.min(a.x, b.x) + 0.1, y: a.y + dy * out + (d === 2 ? 0.06 + (out ? 0.3 : 0) : 1 - depth - 0.06 - (out ? 0.3 : 0)), w: Math.abs(a.x - b.x) + 0.8, h: depth, dir: d }
          : { kind, x: a.x + dx * out + (d === 1 ? 0.06 + (out ? 0.3 : 0) : 1 - depth - 0.06 - (out ? 0.3 : 0)), y: Math.min(a.y, b.y) + 0.1, w: depth, h: Math.abs(a.y - b.y) + 0.8, dir: d };
      put(f);
      if (out) for (const s of part) used.add(`${s.x},${s.y}`);
    } else if (kind === 'barrel') {
      let n = Math.max(1, Math.min(3, Math.floor(area / 6)));
      for (const [x, y] of corners()) if (n > 0 && free(x, y)) (put({ kind, x, y, w: 1, h: 1 }), n--);
    } else if (kind === 'pew') {
      if (wide) {
        for (let x = far.dir === 1 ? r.x + 3 : r.x + 1; x < (far.dir === 1 ? r.x + r.w - 1 : r.x + r.w - 3); x++) {
          const mid = r.y + (r.h >> 1);
          if (r.h >= 5) {
            if (free(x, r.y + 1, 1, mid - r.y - 1)) put({ kind, x: x + 0.34, y: r.y + 1 + 0.05, w: 0.32, h: mid - r.y - 1 - 0.3 });
            if (free(x, mid + 1, 1, r.y + r.h - 2 - mid)) put({ kind, x: x + 0.34, y: mid + 1 + (r.h % 2 ? 0.25 : 0.05), w: 0.32, h: r.y + r.h - 2 - mid - 0.3 });
          }
        }
      } else
        for (let y = far.dir === 2 ? r.y + 3 : r.y + 1; y < (far.dir === 2 ? r.y + r.h - 1 : r.y + r.h - 3); y++) {
          const mid = r.x + (r.w >> 1);
          if (r.w >= 5) {
            if (free(r.x + 1, y, mid - r.x - 1, 1)) put({ kind, x: r.x + 1 + 0.05, y: y + 0.34, w: mid - r.x - 1 - 0.3, h: 0.32 });
            if (free(mid + 1, y, r.x + r.w - 2 - mid, 1)) put({ kind, x: mid + 1 + (r.w % 2 ? 0.25 : 0.05), y: y + 0.34, w: r.x + r.w - 2 - mid - 0.3, h: 0.32 });
          }
        }
    } else if (kind === 'stall') {
      for (const s of alongWalls().filter((w) => w.dir === (wide ? 2 : 1))) if (free(s.x, s.y)) put({ kind, x: s.x, y: s.y, w: 1, h: 1, dir: s.dir });
    } else if (kind === 'hearth') {
      const spots = shuffled(rnd, alongWalls()).filter((s) => free(s.x, s.y));
      if (spots[0]) put({ kind, x: spots[0].x, y: spots[0].y, w: 1, h: 1, dir: spots[0].dir });
    }
  }
}

/** Cut the working sheet down to what was drawn on, with two squares of margin for the hatching and the title. */
export function cropped(p: {
  cells: Int16Array;
  /** The working sheet's squares across, and down if it is not square. */
  n: number;
  rows?: number;
  rough: Set<number>;
  openings: Opening[];
  features: Feature[];
  areas: Area[];
  kind: GridPlan['kind'];
  rock?: Uint8Array;
  captions?: GridPlan['captions'];
  margin?: number;
}): { plan: GridPlan; dx: number; dy: number } {
  const m = p.margin ?? 2;
  const rows = p.rows ?? p.n;
  // A square more at the bottom, where the title goes.
  const below = m + 1;
  let [x0, y0, x1, y1] = [p.n, rows, 0, 0];
  for (let y = 0; y < rows; y++) for (let x = 0; x < p.n; x++) if (p.cells[y * p.n + x]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  if (x1 < x0) [x0, y0, x1, y1] = [0, 0, 0, 0];
  // A caption over a storey needs the room above it.
  const above = p.captions?.length ? Math.max(m, 3) : m;
  const [w, h] = [x1 - x0 + 1 + 2 * m, y1 - y0 + 1 + above + below];
  const cells = new Int16Array(w * h);
  const rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [sx, sy] = [x + x0 - m, y + y0 - above];
      const inside = sx >= 0 && sy >= 0 && sx < p.n && sy < rows;
      cells[y * w + x] = inside ? p.cells[sy * p.n + sx] : 0;
      rock[y * w + x] = p.rock ? (inside ? p.rock[sy * p.n + sx] : 0) : 1;
    }
  const [dx, dy] = [m - x0, above - y0];
  const plan: GridPlan = {
    kind: p.kind,
    w,
    h,
    feet: 5,
    cells,
    rough: p.rough,
    rock,
    openings: p.openings.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
    features: p.features.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })),
    areas: p.areas.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    captions: (p.captions ?? []).map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
  };
  return { plan, dx, dy };
}
export const crop = (p: Parameters<typeof cropped>[0]): GridPlan => cropped(p).plan;

// ---- Caves -----------------------------------------------------------------------------------------------------------

const CAVE = 2;

export interface CaveAsk {
  seed: number;
  names: string[];
  /** 0.75 tight, 1 as usual, 1.35 vast. */
  roomy: number;
  /** How many ways round there are, as for a dungeon. */
  loops: number;
}

/** A cave: the same way of laying out as a dungeon, with chambers for rooms and tunnels for passages. */
export const makeCave = (ask: CaveAsk): GridPlan => makeDungeon({ ...ask, rough: true, secrets: false, traps: 0, natural: true });
