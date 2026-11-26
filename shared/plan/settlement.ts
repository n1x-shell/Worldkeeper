/**
 * A settlement: roads out from a market place, lanes off the roads, and a house on every plot along them, thinning
 * towards the edge. A river or the sea, a wall with gates where the roads pass through it, fields or woods beyond.
 * The places the record names are the larger buildings near the middle, numbered.
 *
 * Everything is worked out in feet and handed over in squares.
 */
import { chance, int, pick, rng, type Area, type Pt, type Rnd, type TownPlan } from './model.js';
import { sizeOf } from './names.js';

export const TOWN_SIZES = {
  hamlet: { label: 'Hamlet', feet: 10, w: 44, h: 32, reach: 135, arms: 2, lanes: 1, steps: [2, 4], empty: 0.3, spread: 14, road: 12, places: 3 },
  village: { label: 'Village', feet: 10, w: 64, h: 46, reach: 235, arms: 3, lanes: 1, steps: [3, 7], empty: 0.16, spread: 7, road: 14, places: 6 },
  town: { label: 'Town', feet: 20, w: 62, h: 46, reach: 400, arms: 4, lanes: 2, steps: [4, 10], empty: 0.06, spread: 2, road: 18, places: 10 },
  city: { label: 'City', feet: 30, w: 74, h: 54, reach: 700, arms: 5, lanes: 3, steps: [7, 15], empty: 0.03, spread: 1, road: 22, places: 14 },
} as const;
export type TownSize = keyof typeof TOWN_SIZES;

export interface TownAsk {
  seed: number;
  /** The places the record names, in the order of the key. */
  names: string[];
  size: TownSize;
  water: 'none' | 'river' | 'coast';
  walled: boolean;
  /** What lies beyond the houses. */
  around: 'fields' | 'woods' | 'open';
}

// ---- A little geometry -----------------------------------------------------------------------------------------------

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (angle: number): Pt => [Math.cos(angle), Math.sin(angle)];

/** How far a point is from the nearest part of a line between two points. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = sub(b, a);
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
/** Where two lines cross, or null. */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const [r, s] = [sub(b, a), sub(d, c)];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
/** Whether two shapes with straight sides touch (each is taken as the box its corners make when its sides are tested). */
function touch(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
      const n: Pt = [q[1] - p[1], p[0] - q[0]];
      let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const v of a) [a0, a1] = [Math.min(a0, v[0] * n[0] + v[1] * n[1]), Math.max(a1, v[0] * n[0] + v[1] * n[1])];
      for (const v of b) [b0, b1] = [Math.min(b0, v[0] * n[0] + v[1] * n[1]), Math.max(b1, v[0] * n[0] + v[1] * n[1])];
      if (a1 < b0 || b1 < a0) return false;
    }
  return true;
}
/** A shape a little larger all round, for keeping things apart. */
function grown(poly: Pt[], by: number): Pt[] {
  const c: Pt = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return poly.map((p) => {
    const d = dist(p, c) || 1;
    return add(p, mul(sub(p, c), by / d));
  });
}

interface Road {
  points: Pt[];
  width: number;
  /** 0 for the roads out of town, 1 for the lanes off them, and so on. */
  rank: number;
}

/** What a named place is, when it is not a building. */
const SPECIAL: [RegExp, 'square' | 'bridge' | 'gate' | 'docks' | 'field'][] = [
  [/\b(market|square|plaza|green|common|fairground|well|fountain|cross)\b/i, 'square'],
  [/\b(bridge|ford|crossing)\b/i, 'bridge'],
  [/\b(gate|gates|gatehouse)\b/i, 'gate'],
  [/\b(dock|docks|harbou?r|quay|pier|wharf|jetty|landing|waterfront)\b/i, 'docks'],
  [/\b(fields?|farm|farms|orchard|orchards|pasture|meadow|vineyard)\b/i, 'field'],
];
const BIG = /\b(temple|church|cathedral|keep|castle|hall|guild\w*|palace|manor|abbey|college|collegium|arena|barracks|citadel|fort|fortress|sanctuary|hospital|asylum)\b/i;
const MIDDLING = /\b(inn|tavern|alehouse|chapel|shrine|warehouse|granary|mill|stables?|market hall|school|library|bathhouse|theatre|theater|court|gaol|jail)\b/i;

export function makeSettlement(ask: TownAsk): TownPlan {
  const rnd = rng(ask.seed);
  const S = TOWN_SIZES[ask.size];
  const [W, H] = [S.w * S.feet, S.h * S.feet];
  const R = S.reach;
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const jitter = (by: number) => (rnd() - 0.5) * 2 * by;

  // ---- Water -----------------------------------------------------------------------------------------------------------
  // The sea takes one side of the sheet; a river crosses it, a little off the middle of the town.
  let centre: Pt = [W / 2 + jitter(W * 0.05), H / 2 + jitter(H * 0.05)];
  const water: Pt[][] = [];
  const rivers: { points: Pt[]; width: number }[] = [];
  let shore: Pt[] = [];
  /** Which way the sea is: a unit vector, or null. */
  let seaward: Pt | null = null;
  if (ask.water === 'coast') {
    const side = int(rnd, 0, 3);
    seaward = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ][side] as Pt;
    const along = side < 2;
    const depth = (along ? H : W) * between(0.2, 0.27);
    const phase = rnd() * 6;
    const bay = between(0.03, 0.07) * (along ? H : W);
    for (let i = -1; i <= 41; i++) {
      const t = i / 40;
      const off = depth + Math.sin(t * 5 + phase) * bay + Math.sin(t * 13 + phase * 2) * bay * 0.35 + jitter(S.feet * 0.25);
      shore.push(along ? [t * W, side === 0 ? H - off : off] : [side === 2 ? W - off : off, t * H]);
    }
    const [far0, far1]: [Pt, Pt] = along ? [[W * 1.1, side === 0 ? H * 1.1 : -H * 0.1], [-W * 0.1, side === 0 ? H * 1.1 : -H * 0.1]] : [[side === 2 ? W * 1.1 : -W * 0.1, H * 1.1], [side === 2 ? W * 1.1 : -W * 0.1, -H * 0.1]];
    water.push([...shore, far0, far1]);
    // The town stands back from the water's edge, but not far.
    const mid = shore[20];
    centre = add(mid, mul(seaward, -Math.min(R * 0.55, (along ? H : W) * 0.3)));
    centre = along ? [W / 2 + jitter(W * 0.06), centre[1]] : [centre[0], H / 2 + jitter(H * 0.06)];
  } else if (ask.water === 'river') {
    const angle = rnd() * Math.PI;
    const [t, n] = [unit(angle), unit(angle + Math.PI / 2)];
    // Through a village; past the walls of a walled town, as a moat on one side.
    const off = R * (ask.walled && ask.size !== 'hamlet' ? between(1.0, 1.12) : between(0.34, 0.58)) * (chance(rnd, 0.5) ? 1 : -1);
    const width = ask.size === 'hamlet' ? 14 : ask.size === 'village' ? 22 : ask.size === 'town' ? 34 : 54;
    const [phase, wave, swing] = [rnd() * 6, between(260, 420) * (S.feet / 10) ** 0.5, between(18, 46) * (S.feet / 10) ** 0.7];
    const points: Pt[] = [];
    const span = Math.hypot(W, H);
    for (let s = -span; s <= span; s += 30) {
      const m = Math.sin(s / wave + phase) * swing + Math.sin(s / (wave * 0.37) + phase * 3) * swing * 0.3;
      points.push(add(add(centre, mul(t, s)), mul(n, off + m)));
    }
    rivers.push({ points, width });
  }
  const sea = water[0] ?? null;
  const river = rivers[0] ?? null;
  const wet = (p: Pt, margin = 0) => {
    if (sea && (inside(p, sea) || shore.some((q, i) => i > 0 && toSegment(p, shore[i - 1], q) < margin))) return true;
    if (river) for (let i = 1; i < river.points.length; i++) if (toSegment(p, river.points[i - 1], river.points[i]) < river.width / 2 + margin) return true;
    return false;
  };
  const onSheet = (p: Pt, margin = 0) => p[0] >= margin && p[1] >= margin && p[0] <= W - margin && p[1] <= H - margin;

  // ---- Roads -----------------------------------------------------------------------------------------------------------
  const roads: Road[] = [];
  const nearRoad = (p: Pt, skip?: Road, skipFrom = 0): { d: number; road: Road | null } => {
    let best = { d: Infinity, road: null as Road | null };
    for (const r of roads)
      for (let i = 1; i < r.points.length; i++) {
        if (r === skip && i <= skipFrom) continue;
        const d = toSegment(p, r.points[i - 1], r.points[i]) - r.width / 2;
        if (d < best.d) best = { d, road: r };
      }
    return best;
  };
  // The roads out of town: from the market place to the edge of the sheet, bending a little as they go.
  const first = rnd() * Math.PI * 2;
  const armAngles: number[] = [];
  for (let i = 0; i < S.arms; i++) armAngles.push(first + (i * Math.PI * 2) / S.arms + (S.arms === 2 ? jitter(0.25) : jitter(0.4)));
  const bridges: TownPlan['bridges'] = [];
  const piers: TownPlan['piers'] = [];
  for (const start of armAngles) {
    let heading = start;
    // A road towards the sea stops at the shore, and there are the docks.
    const toSea = !!seaward && Math.cos(heading) * seaward[0] + Math.sin(heading) * seaward[1] > 0.55;
    if (seaward && !toSea && Math.cos(heading) * seaward[0] + Math.sin(heading) * seaward[1] > 0.15) heading -= 0.5 * Math.sign(Math.cos(heading) * seaward[1] - Math.sin(heading) * seaward[0]) * -1;
    const points: Pt[] = [centre];
    let p = centre;
    for (let step = 0; step < 400; step++) {
      heading += jitter(0.09) + (start - heading) * 0.06;
      const next = add(p, mul(unit(heading), 34));
      if (sea && inside(next, sea)) {
        const end = add(p, mul(unit(heading), 12));
        points.push(end);
        // Jetties run out from the shore beside the road's end: three for the first road down to the water, one for another.
        const out = Math.atan2(seaward![1], seaward![0]);
        for (const k of piers.length || ask.size === 'hamlet' ? [0.6] : [-1, 0.2, 1.3]) {
          const want: Pt = [end[0] - Math.sin(heading) * k * 52, end[1] + Math.cos(heading) * k * 52];
          const from = shore.reduce((best, q) => (dist(q, want) < dist(best, want) ? q : best), shore[0]);
          piers.push({ x: from[0] - seaward![0] * 6, y: from[1] - seaward![1] * 6, angle: out + jitter(0.1), length: between(55, 100) * (S.feet / 10) ** 0.5 });
        }
        break;
      }
      points.push(next);
      p = next;
      if (!onSheet(p, -40)) break;
    }
    if (points.length > 2) roads.push({ points, width: S.road, rank: 0 });
  }
  // A bridge wherever a road out of town meets the river.
  if (river)
    for (const r of roads)
      for (let i = 1; i < r.points.length; i++)
        for (let j = 1; j < river.points.length; j++) {
          const x = crossing(r.points[i - 1], r.points[i], river.points[j - 1], river.points[j]);
          if (!x) continue;
          const angle = Math.atan2(r.points[i][1] - r.points[i - 1][1], r.points[i][0] - r.points[i - 1][0]);
          const flow = Math.atan2(river.points[j][1] - river.points[j - 1][1], river.points[j][0] - river.points[j - 1][0]);
          // The more slantwise it crosses, the longer it has to be.
          bridges.push({ x: x[0], y: x[1], angle, length: river.width / Math.max(0.45, Math.abs(Math.sin(angle - flow))) + 18, width: r.width + 4 });
        }

  // Lanes off the roads, and lanes off those: each runs until it meets another street, the water, or the edge of town.
  for (let rank = 0; rank < S.lanes; rank++) {
    for (const parent of roads.filter((r) => r.rank === rank)) {
      let travelled = between(50, 90);
      let next = travelled;
      for (let i = 1; i < parent.points.length; i++) {
        const [a, b] = [parent.points[i - 1], parent.points[i]];
        travelled += dist(a, b);
        if (travelled < next) continue;
        next = travelled + between(80, 135) * (rank ? 1.45 : 1) * (ask.size === 'city' ? 1.15 : 1);
        if (dist(b, centre) > R * (rank ? 0.9 : 1.02) || dist(b, centre) < 45) continue;
        for (const side of [1, -1]) {
          if (!chance(rnd, rank ? 0.55 : 0.8)) continue;
          let heading = Math.atan2(b[1] - a[1], b[0] - a[0]) + (side * Math.PI) / 2 + jitter(0.3);
          const points: Pt[] = [b];
          let p = b;
          let joined = false;
          const steps = Math.max(2, Math.round(int(rnd, S.steps[0], S.steps[1]) * (rank ? 0.7 : 1)));
          for (let step = 0; step < steps; step++) {
            heading += jitter(0.13);
            const q = add(p, mul(unit(heading), 32));
            if (wet(q, 14) || dist(q, centre) > R * 1.08 || !onSheet(q, 20)) break;
            const near = nearRoad(q, parent, i + 1);
            const mine = step > 1 ? nearRoad(q).d : Infinity;
            points.push(q);
            p = q;
            if (near.d < 30 || mine < 24) {
              joined = true;
              break;
            }
          }
          if (points.length >= 3 || (joined && points.length >= 2)) roads.push({ points, width: Math.max(8, S.road * (rank ? 0.5 : 0.62)), rank: rank + 1 });
        }
      }
    }
  }

  // ---- The market place ------------------------------------------------------------------------------------------------
  const squares: Pt[][] = [];
  const market = ask.size === 'hamlet' ? 34 : ask.size === 'village' ? 52 : ask.size === 'town' ? 78 : 110;
  {
    const turn = first + jitter(0.3);
    const [a, b] = [market * between(0.85, 1.2), market * between(0.7, 1)];
    squares.push(
      (
        [
          [-a, -b],
          [a, -b],
          [a, b],
          [-a, b],
        ] as Pt[]
      ).map(([x, y]) => [centre[0] + (x * Math.cos(turn) - y * Math.sin(turn)) / 2, centre[1] + (x * Math.sin(turn) + y * Math.cos(turn)) / 2] as Pt),
    );
  }

  // ---- The wall --------------------------------------------------------------------------------------------------------
  let wall: TownPlan['wall'] = null;
  const wallWidth = ask.size === 'city' ? 14 : 10;
  if (ask.walled && ask.size !== 'hamlet') {
    const n = ask.size === 'city' ? 16 : ask.size === 'town' ? 13 : 10;
    const ring: Pt[] = [];
    const turn = rnd() * 6;
    for (let i = 0; i < n; i++) {
      const angle = turn + (i * Math.PI * 2) / n + jitter(0.12);
      ring.push(add(centre, mul(unit(angle), R * (ask.size === 'village' ? 0.86 : 0.8) * between(0.9, 1.1))));
    }
    // On the coast the wall runs down to the water at each end and stops there.
    let points = ring;
    let closed = true;
    if (sea || ring.some((p) => !onSheet(p, 15))) {
      const dry = ring.map((p) => !wet(p, 10) && onSheet(p, 15));
      if (dry.some((d) => !d)) {
        // The longest stretch of it that stands on dry land.
        let best: Pt[] = [];
        for (let start = 0; start < n; start++) {
          if (!dry[start] || dry[(start + n - 1) % n]) continue;
          const run: Pt[] = [];
          for (let k = 0; k < n && dry[(start + k) % n]; k++) run.push(ring[(start + k) % n]);
          if (run.length > best.length) best = run;
        }
        points = best;
        closed = false;
      }
    }
    if (points.length >= 3) {
      const gates: NonNullable<TownPlan['wall']>['gates'] = [];
      const count = closed ? points.length : points.length - 1;
      for (const r of roads.filter((x) => x.rank === 0))
        for (let i = 1; i < r.points.length; i++)
          for (let j = 0; j < count; j++) {
            const x = crossing(r.points[i - 1], r.points[i], points[j], points[(j + 1) % points.length]);
            if (x) gates.push({ x: x[0], y: x[1], angle: Math.atan2(r.points[i][1] - r.points[i - 1][1], r.points[i][0] - r.points[i - 1][0]), width: r.width });
          }
      wall = { points, closed, width: wallWidth, towers: points, gates };
    }
  }
  const nearWall = (p: Pt) => {
    if (!wall) return Infinity;
    let d = Infinity;
    const count = wall.closed ? wall.points.length : wall.points.length - 1;
    for (let j = 0; j < count; j++) d = Math.min(d, toSegment(p, wall.points[j], wall.points[(j + 1) % wall.points.length]));
    return d;
  };

  // A lane that would run into or through the wall where there is no gate stops short of it; one that would begin
  // at the wall's foot is not there at all.
  if (wall) {
    const count = wall.closed ? wall.points.length : wall.points.length - 1;
    for (const r of roads.filter((x) => x.rank > 0)) {
      for (let i = 0; i < r.points.length; i++) {
        let stop = nearWall(r.points[i]) < wallWidth / 2 + 9;
        if (i > 0) for (let j = 0; j < count && !stop; j++) if (crossing(r.points[i - 1], r.points[i], wall.points[j], wall.points[(j + 1) % wall.points.length])) stop = true;
        if (stop) {
          r.points.length = i <= 1 ? 0 : i - 1;
          break;
        }
      }
    }
    for (let i = roads.length - 1; i >= 0; i--) if (roads[i].points.length < 2) roads.splice(i, 1);
    // And a lane that led off one now gone, or off the part of one cut away, goes with it.
    for (const rank of [2, 3, 4])
      for (let i = roads.length - 1; i >= 0; i--) {
        const r = roads[i];
        if (r.rank !== rank) continue;
        let joined = false;
        for (const o of roads) if (o !== r && o.rank < rank) for (let k = 1; k < o.points.length && !joined; k++) if (toSegment(r.points[0], o.points[k - 1], o.points[k]) < 2) joined = true;
        if (!joined) roads.splice(i, 1);
      }
  }

  // ---- Buildings -------------------------------------------------------------------------------------------------------
  const buildings: (TownPlan['buildings'][number] & { box: Pt[] })[] = [];
  /** The least and greatest x and y a road reaches: worked out once, the roads being settled by now. */
  const extents = new Map<Road, [number, number, number, number]>();
  const extent = (r: Road) => {
    let e = extents.get(r);
    if (!e) {
      e = [Math.min(...r.points.map((p) => p[0])), Math.max(...r.points.map((p) => p[0])), Math.min(...r.points.map((p) => p[1])), Math.max(...r.points.map((p) => p[1]))];
      extents.set(r, e);
    }
    return e;
  };
  const fits = (box: Pt[], pad: number): boolean => {
    const c: Pt = [(box[0][0] + box[2][0]) / 2, (box[0][1] + box[2][1]) / 2];
    if (!box.every((p) => onSheet(p, S.feet * 0.6)) || box.some((p) => wet(p, 7)) || wet(c, 7)) return false;
    if (touch(box, squares[0])) return false;
    if ([...box, c].some((p) => nearWall(p) < wallWidth / 2 + 7)) return false;
    if (wall) for (let j = 0; j < (wall.closed ? wall.points.length : wall.points.length - 1); j++) for (let k = 0; k < 4; k++) if (crossing(box[k], box[(k + 1) % 4], wall.points[j], wall.points[(j + 1) % wall.points.length])) return false;
    const [bx0, bx1, by0, by1] = [Math.min(...box.map((p) => p[0])), Math.max(...box.map((p) => p[0])), Math.min(...box.map((p) => p[1])), Math.max(...box.map((p) => p[1]))];
    for (const r of roads) {
      // A road nowhere near the plot is not looked at stretch by stretch.
      const e = extent(r);
      if (e[0] > bx1 + r.width || e[1] < bx0 - r.width || e[2] > by1 + r.width || e[3] < by0 - r.width) continue;
      for (let i = 1; i < r.points.length; i++) {
        const [a, b] = [r.points[i - 1], r.points[i]];
        if (Math.min(a[0], b[0]) > bx1 + r.width || Math.max(a[0], b[0]) < bx0 - r.width || Math.min(a[1], b[1]) > by1 + r.width || Math.max(a[1], b[1]) < by0 - r.width) continue;
        if (box.some((p) => toSegment(p, a, b) < r.width / 2 + 1.5) || toSegment(c, a, b) < r.width / 2 + 4) return false;
        for (let k = 0; k < 4; k++) if (crossing(box[k], box[(k + 1) % 4], a, b)) return false;
      }
    }
    const wide = pad ? grown(box, pad) : box;
    return !buildings.some((o) => touch(wide, o.box));
  };
  /** The point so far along a road, measured along its bends. */
  const along = (r: Road, at: number): Pt => {
    for (let i = 1; i < r.points.length; i++) {
      const len = dist(r.points[i - 1], r.points[i]);
      if (at <= len || i === r.points.length - 1) return add(r.points[i - 1], mul(sub(r.points[i], r.points[i - 1]), Math.max(0, at) / (len || 1)));
      at -= len;
    }
    return r.points[r.points.length - 1];
  };
  const lengthOf = (r: Road) => r.points.reduce((sum, p, i) => (i ? sum + dist(r.points[i - 1], p) : 0), 0);
  /** A plot beside a road: so far along it, on one side, so wide and so deep, set back so far from its edge. */
  const plot = (r: Road, at: number, side: number, front: number, deep: number, back: number): Pt[] => {
    const [a, b] = [along(r, at), along(r, at + front)];
    const t = mul(sub(b, a), 1 / (dist(a, b) || 1));
    const n: Pt = [-t[1] * side, t[0] * side];
    // On the inside of a bend the road cuts the corner between the plot's two ends: stand a little further back.
    const mid = along(r, at + front / 2);
    const bulge = Math.max(0, (mid[0] - (a[0] + b[0]) / 2) * n[0] + (mid[1] - (a[1] + b[1]) / 2) * n[1]);
    const p0 = add(a, mul(n, r.width / 2 + back + bulge));
    const p1 = add(p0, mul(t, front));
    return [p0, p1, add(p1, mul(n, deep)), add(p0, mul(n, deep))];
  };

  // The places with names first: the largest buildings, on the roads nearest the middle.
  const areas: Area[] = [];
  // Places along the roads where a large building might stand, nearest the middle first.
  const stretches: { r: Road; at: number; d: number }[] = [];
  for (const r of roads) for (let at = 8, len = lengthOf(r); at < len - 20; at += 22) stretches.push({ r, at, d: dist(along(r, at), centre) + r.rank * R * 0.1 });
  stretches.sort((x, y) => x.d - y.d);
  // On a sheet with more feet to the square, buildings are drawn a little larger than life, so that they can be read.
  const scale = (S.feet / 10) ** 0.24;
  let nextGate = 0;
  let nextBridge = 0;
  let squareUsed = false;
  let fieldsWanted = 0;
  const pending: { n: number; name: string }[] = [];
  ask.names.forEach((name, k) => {
    const n = k + 1;
    const what = SPECIAL.find(([re]) => re.test(name))?.[1];
    const toSquares = (p: Pt) => [Math.round((p[0] / S.feet) * 100) / 100, Math.round((p[1] / S.feet) * 100) / 100];
    if (what === 'square' && !squareUsed) {
      squareUsed = true;
      const [x, y] = toSquares(centre);
      return void areas.push({ n, name, x, y, feet: null, exits: [] });
    }
    if (what === 'bridge' && nextBridge < bridges.length) {
      const b = bridges[nextBridge++];
      const [x, y] = toSquares([b.x - Math.sin(b.angle) * (b.width / 2 + S.feet * 0.7), b.y + Math.cos(b.angle) * (b.width / 2 + S.feet * 0.7)]);
      return void areas.push({ n, name, x, y, feet: null, exits: [] });
    }
    if (what === 'gate' && wall && nextGate < wall.gates.length) {
      const g = wall.gates[nextGate++];
      const [x, y] = toSquares([g.x - Math.sin(g.angle) * (g.width / 2 + S.feet * 1.1), g.y + Math.cos(g.angle) * (g.width / 2 + S.feet * 1.1)]);
      return void areas.push({ n, name, x, y, feet: null, exits: [] });
    }
    if (what === 'docks' && piers.length) {
      const p = piers[0];
      const [x, y] = toSquares([p.x + Math.cos(p.angle) * p.length * 0.5 - Math.sin(p.angle) * S.feet * 0.9, p.y + Math.sin(p.angle) * p.length * 0.5 + Math.cos(p.angle) * S.feet * 0.9]);
      return void areas.push({ n, name, x, y, feet: null, exits: [] });
    }
    if (what === 'field') {
      fieldsWanted++;
      return void pending.push({ n, name });
    }
    const size = BIG.test(name) || sizeOf(name) === 'large' ? 'big' : MIDDLING.test(name) ? 'middling' : sizeOf(name) === 'small' ? 'small' : 'usual';
    const [fLo, fHi, dLo, dHi] = size === 'big' ? [58, 86, 44, 64] : size === 'middling' ? [44, 62, 34, 46] : size === 'small' ? [24, 32, 20, 28] : [34, 50, 28, 40];
    for (let attempt = 0; attempt < 3; attempt++) {
      const shrink = 1 - attempt * 0.2;
      const [front, deep] = [between(fLo, fHi) * scale * shrink, between(dLo, dHi) * scale * shrink];
      for (const s of stretches) {
        const side = chance(rnd, 0.5) ? 1 : -1;
        for (const sd of [side, -side]) {
          const box = plot(s.r, s.at, sd, front, deep, 3);
          if (!fits(box, 6)) continue;
          // Some of the larger ones have a wing: an L, not a plain oblong.
          let corners = box;
          if (size !== 'small' && chance(rnd, 0.4)) {
            const [p0, p1, p2, p3] = box;
            const [u, v] = [between(0.4, 0.6), between(0.45, 0.65)];
            const far = add(p3, mul(sub(p2, p3), u));
            const mid = add(add(p0, mul(sub(p1, p0), u)), mul(sub(p3, p0), v));
            corners = [p0, p1, add(p1, mul(sub(p2, p1), v)), mid, far, p3];
          }
          buildings.push({ corners, key: n, box });
          const c = corners.length === 4 ? mul(add(box[0], box[2]), 0.5) : mul(add(add(box[0], box[3]), add(corners[3], corners[4])), 0.25);
          const [x, y] = toSquares(c);
          areas.push({ n, name, x, y, feet: [Math.round(front / 5) * 5, Math.round(deep / 5) * 5], exits: [] });
          return;
        }
      }
    }
    // No room for it on any street: it is in the key without a number on the plan.
  });

  // Then a house on every plot the streets have room for, fewer towards the edge of town; and after that, smaller
  // houses in the gaps that are left.
  for (const small of [false, true])
    for (const r of [...roads].sort((x, y) => x.rank - y.rank)) {
      const len = lengthOf(r);
      for (const side of [1, -1]) {
        let at = between(2, 10);
        while (at < len - 12) {
          const front = (small ? between(14, 22) : between(18, 34)) * scale;
          const deep = (small ? between(13, 20) : between(16, 30)) * scale;
          const back = 2 + between(0, S.spread);
          const box = plot(r, at, side, front, deep, back);
          const mid = mul(add(box[0], box[2]), 0.5);
          const out = dist(mid, centre) / R;
          const outside = !!wall && wall.closed && !inside(mid, wall.points);
          const thin = Math.max(0, Math.min(1, (out - 0.72) / 0.42)) ** 1.4;
          if (!chance(rnd, S.empty + (small ? 0.25 : 0) + thin * (1 - S.empty) + (outside ? 0.35 : 0)) && fits(box, S.spread > 4 ? 3 : 0.8)) {
            buildings.push({ corners: box, box });
            at += front + between(0, S.spread * 1.6) + 1;
          } else at += between(5, 11);
        }
      }
    }

  // ---- Beyond the houses -----------------------------------------------------------------------------------------------
  const fields: (TownPlan['fields'][number] & { box: Pt[] })[] = [];
  const wantFields = ask.around === 'fields' ? (ask.size === 'hamlet' ? 5 : ask.size === 'village' ? 9 : 12) : fieldsWanted;
  for (let attempt = 0; attempt < 400 && fields.length < wantFields; attempt++) {
    const angle = rnd() * Math.PI * 2;
    const c = add(centre, mul(unit(angle), R * between(0.95, 1.9)));
    const [fw, fh] = [between(90, 190) * scale, between(70, 150) * scale];
    const turn = rnd() * Math.PI;
    const box = (
      [
        [-fw, -fh],
        [fw, -fh],
        [fw, fh],
        [-fw, fh],
      ] as Pt[]
    ).map(([x, y]) => [c[0] + (x * Math.cos(turn) - y * Math.sin(turn)) / 2, c[1] + (x * Math.sin(turn) + y * Math.cos(turn)) / 2] as Pt);
    // Nowhere in it may be water or road: tried at points all over it, not only at its corners.
    const over: Pt[] = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) over.push(add(add(box[0], mul(sub(box[1], box[0]), i / 4)), mul(sub(box[3], box[0]), j / 4)));
    if (!box.every((p) => onSheet(p, S.feet)) || over.some((p) => wet(p, 10) || nearRoad(p).d < 6)) continue;
    if (wall && over.some((p) => nearWall(p) < 20 || (wall.closed && inside(p, wall.points)))) continue;
    const wide = grown(box, 8);
    if (buildings.some((b) => touch(wide, b.box)) || fields.some((f) => touch(wide, f.box))) continue;
    fields.push({ corners: box, angle: turn + (chance(rnd, 0.5) ? 0 : Math.PI / 2), box });
  }
  pending.forEach((p, i) => {
    const f = fields[i % Math.max(1, fields.length)];
    if (!f) return;
    const c = mul(add(f.box[0], f.box[2]), 0.5);
    areas.push({ n: p.n, name: p.name, x: Math.round((c[0] / S.feet) * 100) / 100, y: Math.round((c[1] / S.feet) * 100) / 100, feet: null, exits: [] });
  });

  const trees: [number, number, number][] = [];
  const wantTrees = ask.around === 'woods' ? 520 : ask.around === 'fields' ? 70 : 34;
  // Trees stand in clumps: each new one near one already there, more often than not.
  for (let attempt = 0; attempt < wantTrees * 5 && trees.length < wantTrees; attempt++) {
    const from = trees.length > 4 && chance(rnd, ask.around === 'woods' ? 0.72 : 0.6) ? pick(rnd, trees) : null;
    const p: Pt = from ? [from[0] + jitter(30 * scale), from[1] + jitter(30 * scale)] : [rnd() * W, rnd() * H];
    const size = between(7, 13) * scale;
    const out = dist(p, centre) / R;
    if (!onSheet(p, size) || wet(p, size) || out < (ask.around === 'woods' ? 0.78 : 0.6)) continue;
    if (ask.around === 'woods' && out < 1.05 && chance(rnd, 0.7)) continue;
    if (nearRoad(p).d < size + 3 || nearWall(p) < size + wallWidth) continue;
    if (dist(p, [W - S.feet, S.feet]) < S.feet * 1.6) continue;
    const dot: Pt[] = [
      [p[0] - size, p[1] - size],
      [p[0] + size, p[1] - size],
      [p[0] + size, p[1] + size],
      [p[0] - size, p[1] + size],
    ];
    if (buildings.some((b) => touch(dot, b.box)) || fields.some((f) => touch(dot, f.box))) continue;
    trees.push([p[0], p[1], size]);
  }

  // ---- In squares ------------------------------------------------------------------------------------------------------
  const q = (v: number) => Math.round((v / S.feet) * 100) / 100;
  const qp = (p: Pt): Pt => [q(p[0]), q(p[1])];
  return {
    kind: 'settlement',
    w: S.w,
    h: S.h,
    feet: S.feet,
    roads: roads.map((r) => ({ points: r.points.map(qp), width: q(r.width) })),
    buildings: buildings.map((b) => ({ corners: b.corners.map(qp), ...(b.key ? { key: b.key } : {}) })),
    squares: squares.map((s) => s.map(qp)),
    rivers: rivers.map((r) => ({ points: r.points.map(qp), width: q(r.width) })),
    water: water.map((w) => w.map(qp)),
    bridges: bridges.map((b) => ({ x: q(b.x), y: q(b.y), angle: b.angle, length: q(b.length), width: q(b.width) })),
    piers: piers.map((p) => ({ x: q(p.x), y: q(p.y), angle: p.angle, length: q(p.length) })),
    wall: wall ? { points: wall.points.map(qp), closed: wall.closed, width: q(wall.width), towers: wall.towers.map(qp), gates: wall.gates.map((g) => ({ x: q(g.x), y: q(g.y), angle: g.angle, width: q(g.width) })) } : null,
    trees: trees.map(([x, y, s]) => [q(x), q(y), q(s)]),
    fields: fields.map((f) => ({ corners: f.corners.map(qp), angle: f.angle })),
    areas: areas.sort((a, b) => a.n - b.n),
  };
}

/** Names for the places of a settlement nobody has keyed yet. */
export function placeNames(rnd: Rnd, size: TownSize, water: TownAsk['water'], walled: boolean): string[] {
  const always = ['Market square', 'Inn', 'Temple'];
  const more = ['Smithy', 'Mill', 'Meeting hall', 'General store', 'Stables', 'Healer’s house', 'Brewery', 'Guildhall', 'Shrine', 'Bathhouse', 'Warehouse', 'Tannery', 'Watch house', 'Bakery', 'Scribe’s office', 'Almshouse'];
  const out = [...always.slice(0, size === 'hamlet' ? 2 : 3)];
  if (water === 'river') out.push('Bridge');
  if (water === 'coast') out.push('Docks');
  if (walled && size !== 'hamlet') out.push('Main gate');
  if (size === 'town' || size === 'city') out.push('Keep');
  const pool = [...more];
  while (out.length < TOWN_SIZES[size].places && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
