/**
 * The lie of the land (v0.9.28): a plan laid out on ordinary ground, then changed to suit the ground it is really on.
 * Overgrown: growth on the floors, and walls the roots have broken. Shattered: a rift or two across it, with a bridge
 * where a passage crosses. Adrift: the passages gone, and the doors that opened on them lettered, each opening on the
 * others of its letter. Unearthly: no wall straight. Aloft and the void change only what lies around a place, which
 * is the drawing's business.
 *
 * Everything here is worked out from the plan and its seed, so the same plan comes out the same every time.
 */
import { DIRS, chance, rng, type Feature, type GridPlan, type Land, type Pt, type Rift, type Rnd, type TownPlan } from './model.js';
import { PASSAGE, describe, featureAt, fit, regionAt } from './edit.js';

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
const footOf = (f: Feature): Pt => [Math.floor(f.x + f.w / 2), Math.floor(f.y + f.h / 2)];
const sides = (o: { x: number; y: number; side: 'n' | 'w' }): [Pt, Pt] => (o.side === 'n' ? [[o.x, o.y - 1], [o.x, o.y]] : [[o.x - 1, o.y], [o.x, o.y]]);

/** How far a point is from a line through several points. */
export function fromLine(p: Pt, points: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return best;
}
/** Whether a point is in a rift. */
export const inRift = (rifts: Rift[] | undefined, x: number, y: number, more = 0) => (rifts ?? []).some((r) => fromLine([x, y], r.points) < r.width / 2 + more);

/** A rift from one side of a sheet to the other, wandering as it goes. */
function riftAcross(rnd: Rnd, w: number, h: number, upright: boolean, width: number): Rift {
  const points: Pt[] = [];
  const [long, wide] = upright ? [h, w] : [w, h];
  let at = wide * (0.3 + rnd() * 0.4);
  for (let t = -1; t <= long + 1; t += 2.5 + rnd()) {
    at = Math.max(wide * 0.12, Math.min(wide * 0.88, at + (rnd() - 0.5) * 3.4));
    points.push(upright ? [Math.round(at * 100) / 100, Math.round(t * 100) / 100] : [Math.round(t * 100) / 100, Math.round(at * 100) / 100]);
  }
  return { points, width };
}

/** A plan on squares, on the ground it is really on. */
export function lieGrid(plan: GridPlan, land: Land, seed: number): GridPlan {
  if (land === 'plain') return plan;
  const p = copy(plan);
  p.land = land;
  const rnd = rng((seed ^ 0x51ed27) >>> 0 || 1);
  const { w, h } = p;
  const floor = (x: number, y: number) => regionAt(p, x, y) !== 0;
  const numbered = new Set(p.areas.map((a) => `${Math.floor(a.x)},${Math.floor(a.y)}`));
  const doorsteps = new Set(p.openings.flatMap((o) => sides(o)).map(([x, y]) => `${x},${y}`));
  const free = (x: number, y: number) => floor(x, y) && featureAt(p, x, y) < 0 && !numbered.has(`${x},${y}`) && !doorsteps.has(`${x},${y}`);
  const byWall = (x: number, y: number) => DIRS.some(([dx, dy]) => !floor(x + dx, y + dy));

  if (land === 'overgrown') {
    // The roots have broken some walls; growth stands thick along them and thin in the open.
    if (p.kind !== 'cave' && p.kind !== 'ship') {
      const rooms = [...new Set(Array.from(p.cells).filter((v) => v > PASSAGE))].sort((a, b) => a - b);
      for (const r of rooms) if (chance(rnd, 0.4)) p.rough.add(r);
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!free(x, y)) continue;
        const big = free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1) && chance(rnd, 0.022);
        if (big) p.features.push({ kind: 'growth', x, y, w: 2, h: 2 });
        else if (chance(rnd, byWall(x, y) ? 0.17 : 0.035)) p.features.push({ kind: 'growth', x, y, w: 1, h: 1 });
      }
  }

  if (land === 'shattered') {
    const upright = chance(rnd, 0.5);
    p.rifts = [riftAcross(rnd, w, h, upright, 0.95 + rnd() * 0.5)];
    if (w * h > 1100) p.rifts.push(riftAcross(rnd, w, h, !upright, 0.8 + rnd() * 0.4));
    const gone = (x: number, y: number) => inRift(p.rifts, x + 0.5, y + 0.5, 0.1);
    // What stood where the ground went is gone with it; the stairs in stay, to be climbed to.
    p.features = p.features.filter((f) => f.kind === 'stairs' || !gone(...footOf(f)));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!floor(x, y)) continue;
        if (gone(x, y)) {
          // A passage is bridged; a room is left for the party to cross as they can.
          const narrow = p.kind === 'cave' ? [0, 1, 2, 3].filter((d) => floor(x + DIRS[d][0], y + DIRS[d][1])).length <= 2 : regionAt(p, x, y) === PASSAGE;
          if (narrow && featureAt(p, x, y) < 0) p.features.push({ kind: 'bridge', x, y, w: 1, h: 1, dir: floor(x - 1, y) || floor(x + 1, y) ? 1 : 0 });
        } else if (inRift(p.rifts, x + 0.5, y + 0.5, 1.2) && free(x, y) && chance(rnd, 0.1)) p.features.push({ kind: 'rubble', x, y, w: 1, h: 1 });
      }
    for (const a of p.areas) {
      const region = regionAt(p, a.x, a.y);
      const [ax, ay] = [Math.floor(a.x), Math.floor(a.y)];
      let crossed = false;
      let best: Pt | null = null;
      let d = Infinity;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (regionAt(p, x, y) !== region || (p.kind === 'cave' && Math.hypot(x - ax, y - ay) > 4)) continue;
          if (gone(x, y)) crossed = true;
          else if (featureAt(p, x, y) < 0 && Math.hypot(x - ax, y - ay) < d) [best, d] = [[x, y], Math.hypot(x - ax, y - ay)];
        }
      // Its number stands on firm ground.
      if (gone(ax, ay) && best) [a.x, a.y] = [best[0] + 0.5, best[1] + 0.5];
      if (crossed) a.exits = [...a.exits, 'the rift runs through it'];
    }
  }

  if (land === 'adrift' && p.kind === 'dungeon') {
    // The passages are gone. A door that opened on one opens now on the other doors of that passage: they share a letter.
    const seen = new Uint8Array(w * h);
    let letters = 0;
    for (let start = 0; start < w * h; start++) {
      if (p.cells[start] !== PASSAGE || seen[start]) continue;
      const squares: number[] = [start];
      seen[start] = 1;
      for (let k = 0; k < squares.length; k++)
        for (const [dx, dy] of DIRS) {
          const [x, y] = [(squares[k] % w) + dx, Math.floor(squares[k] / w) + dy];
          const c = y * w + x;
          if (x >= 0 && y >= 0 && x < w && y < h && p.cells[c] === PASSAGE && !seen[c]) (seen[c] = 1), squares.push(c);
        }
      const mine = new Set(squares);
      const doors = p.openings.filter((o) => {
        const [a, b] = sides(o).map(([x, y]) => (x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1));
        return mine.has(a) !== mine.has(b) && regionAt(p, ...sides(o)[mine.has(a) ? 1 : 0]) > PASSAGE;
      });
      // The way in keeps its passage, and so does one that leads nowhere else.
      const wayIn = p.features.some((f) => f.kind === 'stairs' && mine.has(footOf(f)[1] * w + footOf(f)[0]));
      if (doors.length < 2 || wayIn) continue;
      const letter = String.fromCharCode(65 + (letters % 26)) + (letters >= 26 ? String(Math.floor(letters / 26)) : '');
      letters++;
      const stubs = new Set<number>();
      for (const o of doors) {
        o.to = letter;
        for (const [x, y] of sides(o)) if (mine.has(y * w + x)) stubs.add(y * w + x);
      }
      for (const c of squares) if (!stubs.has(c)) p.cells[c] = 0;
    }
    p.features = p.features.filter((f) => floor(...footOf(f)));
    p.openings = p.openings.filter((o) => {
      const [a, b] = sides(o).map(([x, y]) => regionAt(p, x, y));
      return a !== b && a !== 0 && b !== 0;
    });
  }

  if (land === 'unearthly') for (const v of p.cells) if (v) p.rough.add(v);

  return describe(fit(p));
}

// ---- Settlements -----------------------------------------------------------------------------------------------------

const mid = (ps: Pt[]): Pt => [ps.reduce((s, c) => s + c[0], 0) / ps.length, ps.reduce((s, c) => s + c[1], 0) / ps.length];
const r2 = (v: number) => Math.round(v * 100) / 100;
function within(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
function hull(points: Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(ps), ...half(ps.reverse())];
}

/** A settlement, on the ground it is really on. */
export function lieTown(town: TownPlan, land: Land, seed: number): TownPlan {
  if (land === 'plain') return town;
  const rnd = rng((seed ^ 0x7a31c5) >>> 0 || 1);
  let t: TownPlan = { ...town, land };
  const centre = mid(t.buildings.length ? t.buildings.map((b) => mid(b.corners)) : [[t.w / 2, t.h / 2]]);

  if (land === 'unearthly') {
    // Everything turned about the middle, more the nearer it is: no street runs straight.
    const reach = Math.hypot(t.w, t.h) / 2;
    const at = ([x, y]: Pt): Pt => {
      const d = Math.hypot(x - centre[0], y - centre[1]);
      const a = 0.85 * Math.max(0, 1 - d / reach) ** 1.5 + Math.sin(d * 0.55) * 0.06;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      return [r2(centre[0] + (x - centre[0]) * c - (y - centre[1]) * s), r2(centre[1] + (x - centre[0]) * s + (y - centre[1]) * c)];
    };
    const xy = <T extends { x: number; y: number }>(v: T): T => ({ ...v, x: at([v.x, v.y])[0], y: at([v.x, v.y])[1] });
    // A line is given more points first, so that it bends as it turns.
    const fine = (ps: Pt[]) => ps.flatMap((q, i) => (i + 1 < ps.length ? [0, 0.25, 0.5, 0.75].map((k): Pt => [q[0] + (ps[i + 1][0] - q[0]) * k, q[1] + (ps[i + 1][1] - q[1]) * k]) : [q]));
    t = {
      ...t,
      roads: t.roads.map((r) => ({ ...r, points: fine(r.points).map(at) })),
      buildings: t.buildings.map((b) => ({ ...b, corners: b.corners.map(at) })),
      squares: t.squares.map((s) => fine([...s, s[0]]).slice(0, -1).map(at)),
      rivers: t.rivers.map((r) => ({ ...r, points: fine(r.points).map(at) })),
      water: t.water.map((s) => fine([...s, s[0]]).slice(0, -1).map(at)),
      bridges: t.bridges.map(xy),
      piers: t.piers.map(xy),
      wall: t.wall ? { ...t.wall, points: fine(t.wall.closed ? [...t.wall.points, t.wall.points[0]] : t.wall.points).slice(0, t.wall.closed ? -1 : undefined).map(at), towers: t.wall.towers.map(at), gates: t.wall.gates.map(xy) } : null,
      trees: t.trees.map(([x, y, s]): [number, number, number] => [...at([x, y]), s]),
      fields: t.fields.map((f) => ({ ...f, corners: f.corners.map(at) })),
      areas: t.areas.map(xy),
      districts: t.districts?.map((d) => ({ ...d, at: at(d.at), outline: fine([...d.outline, d.outline[0]]).slice(0, -1).map(at) })),
      districtLines: t.districtLines?.map(([a, b]): [Pt, Pt] => [at(a), at(b)]),
    };
  }

  if (land === 'overgrown') {
    // One house in six is given up to the growth; the fields are groves of it; and it stands among the houses.
    const growths: [number, number, number][] = [];
    const scale = 10 / t.feet;
    const buildings = t.buildings.filter((b) => {
      if (b.key || !chance(rnd, 0.16)) return true;
      const [x, y] = mid(b.corners);
      growths.push([r2(x), r2(y), r2((1.6 + rnd() * 1.4) * scale)]);
      return false;
    });
    for (const f of t.fields) {
      const [x, y] = mid(f.corners);
      for (let i = 0; i < 6; i++) growths.push([r2(x + (rnd() - 0.5) * 5 * scale * 2), r2(y + (rnd() - 0.5) * 5 * scale * 2), r2((1.2 + rnd() * 2.2) * scale)]);
    }
    for (const b of buildings) if (chance(rnd, 0.22)) growths.push([r2(mid(b.corners)[0] + (rnd() - 0.5) * 3 * scale), r2(mid(b.corners)[1] + (rnd() - 0.5) * 3 * scale), r2((0.5 + rnd() * 0.9) * scale)]);
    t = { ...t, buildings, fields: [], growths: growths.filter(([x, y]) => x > 0.5 && y > 0.5 && x < t.w - 0.5 && y < t.h - 0.5) };
  }

  if (land === 'shattered' || land === 'adrift') {
    // A rift through the town, a little off its middle: the houses on it are gone, and a road that met it is bridged.
    const upright = chance(rnd, 0.5);
    const width = (land === 'adrift' ? 2.4 : 1.6) * (10 / t.feet) + 0.6;
    const rift = riftAcross(rnd, t.w, t.h, upright, r2(width));
    // Brought to within a few squares of the middle, so that it parts the town and not its fields.
    const off = upright ? centre[0] - fromMiddle(rift, centre, upright) : centre[1] - fromMiddle(rift, centre, upright);
    const nudge = off + (rnd() - 0.5) * 6;
    rift.points = rift.points.map(([x, y]): Pt => (upright ? [r2(x + nudge), y] : [x, r2(y + nudge)]));
    const lost = (ps: Pt[]) => ps.some((q) => fromLine(q, rift.points) < width / 2 + 0.2);
    const kept = t.buildings.filter((b) => !lost(b.corners));
    const numbers = new Set(kept.flatMap((b) => (b.key ? [b.key] : [])));
    const bridges = [...t.bridges];
    if (land === 'shattered')
      for (const r of t.roads) {
        if (r.width < Math.max(...t.roads.map((o) => o.width)) * 0.8) continue;
        // Walked along a little at a time: where the road goes into the rift and where it comes out, a bridge between.
        const walk: Pt[] = r.points.flatMap((q, k) => {
          const next = r.points[k + 1];
          if (!next) return [q];
          const steps = Math.max(1, Math.ceil(Math.hypot(next[0] - q[0], next[1] - q[1]) / 0.25));
          return Array.from({ length: steps }, (_, n): Pt => [q[0] + ((next[0] - q[0]) * n) / steps, q[1] + ((next[1] - q[1]) * n) / steps]);
        });
        let went: Pt | null = null;
        for (const q of walk) {
          const inIt = fromLine(q, rift.points) < width / 2;
          if (inIt && !went) went = q;
          if (!inIt && went) {
            const [m, len]: [Pt, number] = [[(went[0] + q[0]) / 2, (went[1] + q[1]) / 2], Math.hypot(q[0] - went[0], q[1] - went[1])];
            // A road that runs along the rift is not bridged end to end; nor are two bridges built side by side.
            if (len < width * 2.5 && !bridges.some((o) => Math.hypot(o.x - m[0], o.y - m[1]) < width * 2)) bridges.push({ x: r2(m[0]), y: r2(m[1]), angle: Math.atan2(q[1] - went[1], q[0] - went[0]), length: r2(len + 0.8), width: r2(r.width) });
            went = null;
          }
        }
      }
    t = {
      ...t,
      rifts: [rift],
      buildings: kept,
      bridges,
      trees: t.trees.filter(([x, y]) => fromLine([x, y], rift.points) > width / 2 + 0.3),
      // A numbered place that stood on it keeps its number on the brink, where its building was.
      areas: t.areas.map((a) => (a.feet && !numbers.has(a.n) && lost([[a.x, a.y]]) ? { ...a, exits: [...a.exits, 'lost to the rift'] } : a)),
    };
  }

  if (land === 'aloft' || land === 'void' || land === 'adrift') {
    // The ground ends a little way past the last house: what lay beyond it is not there.
    const corners = [...t.buildings.flatMap((b) => b.corners), ...(t.wall?.points ?? []), ...t.squares.flat()];
    if (corners.length >= 3) {
      const around = mid(corners);
      const grow = 2.2 * (10 / t.feet) + 1.2;
      const ring = hull(corners);
      // More points along it, each pushed out and a little in or out again: a ragged edge.
      const island: Pt[] = [];
      ring.forEach((q, i) => {
        const next = ring[(i + 1) % ring.length];
        const steps = Math.max(1, Math.round(Math.hypot(next[0] - q[0], next[1] - q[1]) / 2.5));
        for (let k = 0; k < steps; k++) {
          const [x, y] = [q[0] + ((next[0] - q[0]) * k) / steps, q[1] + ((next[1] - q[1]) * k) / steps];
          const d = Math.hypot(x - around[0], y - around[1]) || 1;
          const out = grow + (rnd() - 0.5) * 1.3;
          island.push([r2(Math.max(0.6, Math.min(t.w - 0.6, x + ((x - around[0]) / d) * out))), r2(Math.max(0.6, Math.min(t.h - 1.4, y + ((y - around[1]) / d) * out)))]);
        }
      });
      const on = (q: Pt) => within(q, island);
      /** A line cut down to the stretches of it that are on the island. */
      const cut = (ps: Pt[]): Pt[][] => {
        const out: Pt[][] = [];
        let run: Pt[] = [];
        for (const q of ps) {
          if (on(q)) run.push(q);
          else {
            if (run.length > 1) out.push(run);
            run = [];
          }
        }
        if (run.length > 1) out.push(run);
        return out;
      };
      const fine = (ps: Pt[]) => ps.flatMap((q, i) => (i + 1 < ps.length ? [0, 0.2, 0.4, 0.6, 0.8].map((k): Pt => [r2(q[0] + (ps[i + 1][0] - q[0]) * k), r2(q[1] + (ps[i + 1][1] - q[1]) * k)]) : [q]));
      // Where a great road reaches the edge there is a stage, for whatever comes in from beyond.
      const widest = Math.max(...t.roads.map((r) => r.width), 0);
      const piers = t.roads.flatMap((r) => {
        if (r.width < widest * 0.8) return [];
        const stretches = cut(fine(r.points));
        return stretches.flatMap((s) => {
          const [a, b] = [s[s.length - 2], s[s.length - 1]];
          const ends = Math.hypot(b[0] - r.points[r.points.length - 1][0], b[1] - r.points[r.points.length - 1][1]) > 1;
          return ends ? [{ x: b[0], y: b[1], angle: Math.atan2(b[1] - a[1], b[0] - a[0]), length: r2(2.4 * (10 / t.feet) + 0.8) }] : [];
        });
      });
      t = {
        ...t,
        island,
        roads: t.roads.flatMap((r) => cut(fine(r.points)).map((points) => ({ ...r, points }))),
        rivers: [],
        water: [],
        bridges: land === 'adrift' ? [] : t.bridges.filter((b) => (t.rifts ?? []).some((r) => fromLine([b.x, b.y], r.points) < r.width * 2)),
        piers: piers.slice(0, 6),
        trees: t.trees.filter(([x, y]) => on([x, y])),
        fields: t.fields.filter((f) => f.corners.every(on)),
        buildings: t.buildings.filter((b) => b.corners.every(on)),
        // A numbered place that was out beyond the edge (a bridge, the docks) is brought in to the brink.
        areas: t.areas.map((a) => {
          if (on([a.x, a.y])) return a;
          const near = island.reduce((best, q) => (Math.hypot(q[0] - a.x, q[1] - a.y) < Math.hypot(best[0] - a.x, best[1] - a.y) ? q : best), island[0]);
          const d = Math.hypot(around[0] - near[0], around[1] - near[1]) || 1;
          return { ...a, x: r2(near[0] + ((around[0] - near[0]) / d) * 1.2), y: r2(near[1] + ((around[1] - near[1]) / d) * 1.2) };
        }),
      };
    }
  }
  return t;
}

/** Where a rift crosses the line through a town's middle: how far along the other way. */
function fromMiddle(rift: Rift, centre: Pt, upright: boolean): number {
  const along = upright ? 1 : 0;
  const nearest = rift.points.reduce((best, q) => (Math.abs(q[along] - centre[along]) < Math.abs(best[along] - centre[along]) ? q : best), rift.points[0]);
  return nearest[upright ? 0 : 1];
}
