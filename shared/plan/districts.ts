/**
 * Joined plans (v0.9.27): a town or a city in districts, and a district drawn closer as a plan of its own.
 *
 * The districts are worked out from the plan as it is drawn, with no dice: the houses about the middle are one ward,
 * and the rest are shared out around it, each ward named for what stands in it. A district's own plan is the same
 * streets and houses cut from the city's plan and drawn at more squares to the foot, so the two agree.
 */
import type { Area, Pt, TownPlan } from './model.js';

const mid = (ps: Pt[]): Pt => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const far = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** The smallest outline with no dents that holds every point. */
function hull(points: Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(ps), ...half(ps.reverse())];
}

/** The part of an outline nearer to one point than to another. */
function nearer(poly: Pt[], mine: Pt, other: Pt): Pt[] {
  const m: Pt = [(mine[0] + other[0]) / 2, (mine[1] + other[1]) / 2];
  const n: Pt = [other[0] - mine[0], other[1] - mine[1]];
  const side = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    const [sa, sb] = [side(a), side(b)];
    if (sa <= 0) out.push(a);
    if (sa <= 0 !== sb <= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** What a ward is called for what stands in it: the first that fits, each name used once. */
const NAMED: [RegExp, string][] = [
  [/\b(market|bazaar|exchange|fair ?ground)\b/i, 'Market Ward'],
  [/\b(keep|castle|citadel|palace|fort|fortress|garrison|barracks)\b/i, 'Castle Ward'],
  [/\b(temple|church|cathedral|abbey|shrine|chapel|sanctuary|priory)\b/i, 'Temple Ward'],
  [/\b(docks?|harbou?r|wharf|quay|piers?|shipyard)\b/i, 'The Docks'],
  [/\b(college|collegium|library|school|academy|university|scribe\S*)\b/i, 'Scholars’ Quarter'],
  [/\b(guild\w*|smith\w*|forge|tanner\w*|mill|brewer\w*|warehouse|bakery|workshops?|weaver\w*|potter\w*)\b/i, 'Craftsmen’s Quarter'],
  [/\b(gate|gatehouse)\b/i, 'Gate Ward'],
  [/\b(bridge)\b/i, 'Bridge Ward'],
];
const COMPASS = ['East Ward', 'Southeast Ward', 'South Ward', 'Southwest Ward', 'West Ward', 'Northwest Ward', 'North Ward', 'Northeast Ward'];
const SPARE = ['Newtown', 'The Rows', 'Highside', 'Lowside', 'The Shambles', 'The Warrens'];

/** How many districts a settlement of each size has: a hamlet and a village are one place. */
export const DISTRICTS = { hamlet: 0, village: 0, town: 4, city: 6 } as const;

/**
 * A settlement's plan with its districts marked: each with a name, where the name is written, and its outline; and
 * the lines drawn between one district and the next. A place too small for them is given back as it is.
 */
export function withDistricts(plan: TownPlan, count: number): TownPlan {
  const mids = plan.buildings.map((b) => mid(b.corners));
  if (count < 2 || mids.length < count * 5) return plan;
  const heart = mid(mids);
  // To begin with: the houses nearest the middle are one ward, and the rest are shared out around it like the slices
  // of a pie. Then each house goes to the ward whose middle is nearest, a few times over, until they settle.
  const order = mids.map((_, i) => i).sort((a, b) => far(mids[a], heart) - far(mids[b], heart) || a - b);
  const share = Math.ceil(mids.length / count);
  const groups: number[][] = [order.slice(0, share)];
  const rest = order.slice(share).sort((a, b) => Math.atan2(mids[a][1] - heart[1], mids[a][0] - heart[0]) - Math.atan2(mids[b][1] - heart[1], mids[b][0] - heart[0]) || a - b);
  const slice = Math.ceil(rest.length / (count - 1));
  for (let i = 0; i < count - 1; i++) groups.push(rest.slice(i * slice, (i + 1) * slice));
  let centres = groups.filter((g) => g.length).map((g) => mid(g.map((i) => mids[i])));
  let owner: number[] = [];
  for (let round = 0; round < 8; round++) {
    owner = mids.map((p) => centres.reduce((best, c, i) => (far(p, c) < far(p, centres[best]) ? i : best), 0));
    const members = centres.map((_, i) => mids.filter((_p, k) => owner[k] === i));
    // A ward of a handful of houses is no ward: its houses go to their neighbours.
    const kept = centres.map((c, i) => (members[i].length >= Math.max(4, mids.length * 0.05) ? mid(members[i]) : null)).filter((c): c is Pt => !!c);
    if (kept.length < 2) return plan;
    centres = kept;
  }
  owner = mids.map((p) => centres.reduce((best, c, i) => (far(p, c) < far(p, centres[best]) ? i : best), 0));

  // Each ward's ground: the town's outline, cut down to what is nearer its middle than any other's.
  const all = plan.buildings.flatMap((b) => b.corners);
  const around = mid(all);
  const bound = hull(all).map(([x, y]): Pt => {
    const d = Math.hypot(x - around[0], y - around[1]) || 1;
    return [x + ((x - around[0]) / d) * 1.5, y + ((y - around[1]) / d) * 1.5];
  });
  const cells = centres.map((c, i) => centres.reduce((poly, d, j) => (j === i || poly.length < 3 ? poly : nearer(poly, c, d)), bound));
  const lines: [Pt, Pt][] = [];
  cells.forEach((cell, i) =>
    cell.forEach((a, k) => {
      const b = cell[(k + 1) % cell.length];
      const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // The side it shares with a neighbour is as far from the neighbour's middle as from its own: drawn once.
      const j = centres.findIndex((c, n) => n > i && Math.abs(far(m, c) - far(m, centres[i])) < 1e-6);
      if (j >= 0 && far(a, b) > 0.05) lines.push([a.map(r2) as Pt, b.map(r2) as Pt]);
    }),
  );

  // Names: for what stands in each, then the middle one, then by where they lie.
  const names: (string | null)[] = centres.map(() => null);
  const wardOf = (p: Pt) => centres.reduce((best, c, i) => (far(p, c) < far(p, centres[best]) ? i : best), 0);
  const things: string[][] = centres.map(() => []);
  for (const a of plan.areas) things[wardOf([a.x, a.y])].push(a.name);
  for (const p of plan.piers) things[wardOf([p.x, p.y])].push('pier');
  for (const [re, name] of NAMED) {
    const i = things.findIndex((list, k) => names[k] === null && list.some((t) => re.test(t)));
    if (i >= 0) names[i] = name;
  }
  const middle = centres.reduce((best, c, i) => (far(c, heart) < far(centres[best], heart) ? i : best), 0);
  if (names[middle] === null) names[middle] = 'Old Town';
  const used = new Set(names.filter(Boolean));
  centres.forEach((c, i) => {
    if (names[i] !== null) return;
    const turn = Math.round(Math.atan2(c[1] - heart[1], c[0] - heart[0]) / (Math.PI / 4));
    const name = [COMPASS[(turn + 8) % 8], ...SPARE].find((n) => !used.has(n)) ?? `Ward ${i + 1}`;
    names[i] = name;
    used.add(name);
  });

  const districts = centres.map((_c, i) => ({ name: names[i]!, at: mid(mids.filter((_p, k) => owner[k] === i)).map(r2) as Pt, outline: cells[i].map((p) => p.map(r2) as Pt) }));
  return { ...plan, districts, districtLines: lines };
}

/** The district a point of the plan lies in, if the plan has districts. */
export function districtAt(plan: TownPlan, x: number, y: number): number {
  return (plan.districts ?? []).findIndex((d) => inside([x, y], d.outline));
}

/**
 * A district as a plan of its own: the same streets, houses, walls and water as on the settlement's plan, cut out
 * around the district and drawn closer (so many feet to a square). Its numbered places are those that stand in it,
 * numbered afresh; `from[i]` is the number each had on the settlement's plan.
 */
export function districtPlan(town: TownPlan, index: number, feet = 10): { plan: TownPlan; from: number[] } | null {
  const d = town.districts?.[index];
  if (!d || d.outline.length < 3) return null;
  const k = town.feet / feet;
  const xs = d.outline.map((p) => p[0]);
  const ys = d.outline.map((p) => p[1]);
  // A little of what lies around it, and never more than a sheet can hold.
  const [x0, y0] = [Math.max(0, Math.floor(Math.min(...xs) - 1.5)), Math.max(0, Math.floor(Math.min(...ys) - 1.5))];
  const [x1, y1] = [Math.min(town.w, Math.ceil(Math.max(...xs) + 1.5)), Math.min(town.h, Math.ceil(Math.max(...ys) + 2))];
  const [w, h] = [Math.min(280, Math.ceil((x1 - x0) * k)), Math.min(280, Math.ceil((y1 - y0) * k))];
  const at = (p: Pt): Pt => [r2((p[0] - x0) * k), r2((p[1] - y0) * k)];
  const near = (p: Pt, by = 6) => p[0] > -by && p[1] > -by && p[0] < w + by && p[1] < h + by;
  const touches = (ps: Pt[]) => ps.some((p) => near(p, 2));
  // A road may run right across the sheet with no bend on it: kept if the oblong around it meets the sheet.
  const crosses = (ps: Pt[]) => Math.max(...ps.map((p) => p[0])) > -4 && Math.min(...ps.map((p) => p[0])) < w + 4 && Math.max(...ps.map((p) => p[1])) > -4 && Math.min(...ps.map((p) => p[1])) < h + 4;
  const numbered = town.areas.filter((a) => near(at([a.x, a.y]), 0)).sort((a, b) => a.n - b.n);
  const now = new Map(numbered.map((a, i) => [a.n, i + 1]));
  const areas: Area[] = numbered.map((a, i) => {
    const [x, y] = at([a.x, a.y]);
    return { ...a, n: i + 1, x, y, exits: [...a.exits] };
  });
  const line = <T extends { points: Pt[]; width: number }>(l: T): T => ({ ...l, points: l.points.map(at), width: r2(l.width * k) });
  const plan: TownPlan = {
    kind: 'settlement',
    w,
    h,
    feet,
    roads: town.roads.map(line).filter((r) => crosses(r.points)),
    buildings: town.buildings
      .map((b) => ({ corners: b.corners.map(at), ...(b.key && now.has(b.key) ? { key: now.get(b.key) } : {}) }))
      .filter((b) => touches(b.corners)),
    squares: town.squares.map((s) => s.map(at)),
    rivers: town.rivers.map(line),
    water: town.water.map((s) => s.map(at)),
    bridges: town.bridges.map((b) => ({ ...b, x: at([b.x, b.y])[0], y: at([b.x, b.y])[1], length: r2(b.length * k), width: r2(b.width * k) })).filter((b) => near([b.x, b.y])),
    piers: town.piers.map((p) => ({ ...p, x: at([p.x, p.y])[0], y: at([p.x, p.y])[1], length: r2(p.length * k) })).filter((p) => near([p.x, p.y])),
    wall: town.wall
      ? {
          points: town.wall.points.map(at),
          closed: town.wall.closed,
          width: r2(town.wall.width * k),
          towers: town.wall.towers.map(at).filter((p) => near(p)),
          gates: town.wall.gates.map((g) => ({ ...g, x: at([g.x, g.y])[0], y: at([g.x, g.y])[1], width: r2(g.width * k) })).filter((g) => near([g.x, g.y])),
        }
      : null,
    trees: town.trees.map(([x, y, s]): [number, number, number] => [...at([x, y]), r2(s * k)]).filter(([x, y]) => near([x, y], 3)),
    fields: town.fields.map((f) => ({ ...f, corners: f.corners.map(at) })).filter((f) => touches(f.corners)),
    areas,
    // It is on the same ground as the town: its edge, its rifts and its growths come with it.
    ...(town.land ? { land: town.land } : {}),
    ...(town.island ? { island: town.island.map(at) } : {}),
    ...(town.rifts ? { rifts: town.rifts.map(line) } : {}),
    ...(town.growths ? { growths: town.growths.map(([x, y, s]): [number, number, number] => [...at([x, y]), r2(s * k)]).filter(([x, y]) => near([x, y], 3)) } : {}),
  };
  return { plan, from: numbered.map((a) => a.n) };
}
