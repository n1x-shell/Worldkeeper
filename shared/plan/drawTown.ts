/**
 * Drawing a settlement: fields and water first, then the wall, the streets over it (so a road through the wall makes
 * its own gate), bridges, roofs, trees, and the numbers last.
 */
import type { Pt, TownPlan } from './model.js';
import { INK, PAPERS, U, esc, keyMarks, legend, type DrawOptions } from './draw.js';

const P = (v: number) => Math.round(v * U);
const line = (pts: Pt[], close = false) => `M${pts.map(([x, y]) => `${P(x)} ${P(y)}`).join('L')}${close ? 'Z' : ''}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function drawTown(plan: TownPlan, o: DrawOptions): string {
  const paper = PAPERS[o.paper];
  const sheet = paper.sheet === 'none' ? '#ffffff' : paper.sheet;
  const out: string[] = [];
  const round = `stroke-linecap="round" stroke-linejoin="round"`;
  if (paper.sheet !== 'none') out.push(`<rect width="${plan.w * U}" height="${plan.h * U}" fill="${paper.sheet}"/>`);

  // Fields: an outline and its furrows.
  let furrows = '';
  let hedges = '';
  for (const f of plan.fields) {
    const [p0, p1, p2, p3] = f.corners;
    hedges += line(f.corners, true);
    const along = Math.abs(Math.cos(f.angle - Math.atan2(p1[1] - p0[1], p1[0] - p0[0]))) > 0.7;
    const across = along ? dist(p0, p3) : dist(p0, p1);
    const n = Math.max(2, Math.round(across / 0.55));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [a, b] = along ? [lerp(p0, p3, t), lerp(p1, p2, t)] : [lerp(p0, p1, t), lerp(p3, p2, t)];
      furrows += line([lerp(a, b, 0.04), lerp(a, b, 0.96)]);
    }
  }
  if (hedges) out.push(`<path d="${hedges}" fill="none" stroke="${INK}" stroke-width="4" ${round}/><path d="${furrows}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="26 9" ${round} opacity="0.75"/>`);

  // The sea: its shore, and the lines of the water lapping away from it.
  for (const w of plan.water) {
    const shore = w.slice(0, -2);
    const [f0, f1] = [w[w.length - 2], w[w.length - 1]];
    const mid = shore[shore.length >> 1];
    const far: Pt = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
    const d = dist(mid, far) || 1;
    const to: Pt = [(far[0] - mid[0]) / d, (far[1] - mid[1]) / d];
    out.push(`<path d="${line(w, true)}" fill="${paper.line}" fill-opacity="0.34"/>`);
    [0.32, 0.75, 1.35].forEach((off, i) => out.push(`<path d="${line(shore.map(([x, y]) => [x + to[0] * off, y + to[1] * off] as Pt))}" fill="none" stroke="${INK}" stroke-width="${[3, 2.4, 2][i]}" stroke-dasharray="${['90 22', '46 34', '20 46'][i]}" ${round} opacity="${[0.8, 0.65, 0.5][i]}"/>`));
    out.push(`<path d="${line(shore)}" fill="none" stroke="${INK}" stroke-width="7" ${round}/>`);
  }
  // A river: two banks, the water between them a shade darker than the paper, and the run of it marked along each bank.
  for (const r of plan.rivers) {
    const d = line(r.points);
    const w = P(r.width);
    out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 12}" ${round}/><path d="${d}" fill="none" stroke="${sheet}" stroke-width="${w}" ${round}/><path d="${d}" fill="none" stroke="${paper.line}" stroke-opacity="0.34" stroke-width="${w}" ${round}/>`);
    if (w > 90) out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-dasharray="70 46" ${round} opacity="0.7" transform="translate(0 ${Math.round(w * 0.2)})"/><path d="${d}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-dasharray="34 80" stroke-dashoffset="50" ${round} opacity="0.6" transform="translate(0 ${-Math.round(w * 0.18)})"/>`);
    else out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-dasharray="40 60" ${round} opacity="0.6"/>`);
  }

  // The wall and its towers. The streets are drawn over it, which opens the gates.
  if (plan.wall) {
    const w = plan.wall;
    out.push(`<path d="${line(w.points, w.closed)}" fill="none" stroke="${INK}" stroke-width="${P(w.width)}" stroke-linejoin="round" stroke-linecap="butt"/>`);
    out.push(`<path d="${line(w.points, w.closed)}" fill="none" stroke="${sheet}" stroke-width="${Math.max(3, P(w.width) - 16)}" stroke-linejoin="round" stroke-linecap="butt" stroke-dasharray="${P(w.width * 1.1)} 8"/>`);
    for (const [x, y] of w.towers) out.push(`<circle cx="${P(x)}" cy="${P(y)}" r="${P(w.width * 1.05)}" fill="${sheet}" stroke="${INK}" stroke-width="9"/>`);
  }

  // Streets: every one drawn dark and a little wide, then every one again in the colour of the paper, so that where
  // they meet they run into each other.
  const roads = [...plan.roads].sort((a, b) => a.width - b.width);
  let edges = '';
  for (const r of roads) edges += `<path d="${line(r.points)}" fill="none" stroke="${INK}" stroke-width="${P(r.width) + 9}" ${round}/>`;
  for (const s of plan.squares) edges += `<path d="${line(s, true)}" fill="${INK}" stroke="${INK}" stroke-width="9" ${round}/>`;
  out.push(edges);
  let surface = '';
  for (const r of roads) surface += `<path d="${line(r.points)}" fill="none" stroke="${paper.floor}" stroke-width="${P(r.width)}" ${round}/>`;
  for (const s of plan.squares) surface += `<path d="${line(s, true)}" fill="${paper.floor}"/>`;
  out.push(surface);

  for (const b of plan.bridges) {
    const [l, w] = [P(b.length), P(b.width)];
    out.push(
      `<g transform="translate(${P(b.x)} ${P(b.y)}) rotate(${Math.round((b.angle * 180) / Math.PI)})"><rect x="${-l / 2}" y="${-w / 2}" width="${l}" height="${w}" fill="${paper.floor}"/>` +
        `<path d="M${-l / 2 - 10} ${-w / 2}H${l / 2 + 10}M${-l / 2 - 10} ${w / 2}H${l / 2 + 10}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/></g>`,
    );
  }
  for (const p of plan.piers) {
    const [x2, y2] = [p.x + Math.cos(p.angle) * p.length, p.y + Math.sin(p.angle) * p.length];
    const d = `M${P(p.x)} ${P(p.y)}L${P(x2)} ${P(y2)}`;
    const wide = Math.max(22, Math.round(U * (8 / plan.feet)));
    out.push(`<path d="${d}" stroke="${INK}" stroke-width="${wide + 9}" stroke-linecap="butt"/><path d="${d}" stroke="${paper.floor}" stroke-width="${wide}" stroke-linecap="butt"/><path d="${d}" stroke="${INK}" stroke-width="${wide}" stroke-dasharray="2.5 14" opacity="0.8"/>`);
  }
  // A gate's two towers, either side of the road.
  if (plan.wall)
    for (const g of plan.wall.gates) {
      const off = g.width / 2 + plan.wall.width * 0.85;
      const s = P(plan.wall.width * 1.5);
      for (const k of [-1, 1]) {
        const [x, y] = [g.x - Math.sin(g.angle) * off * k, g.y + Math.cos(g.angle) * off * k];
        out.push(`<rect x="${P(x) - s / 2}" y="${P(y) - s / 2}" width="${s}" height="${s}" fill="${INK}" transform="rotate(${Math.round((g.angle * 180) / Math.PI)} ${P(x)} ${P(y)})"/>`);
      }
    }

  // Roofs: an outline, and for a plain oblong its ridge and hips.
  let plain = '';
  let ridges = '';
  const keyed: string[] = [];
  for (const b of plan.buildings) {
    if (b.key) {
      keyed.push(`<path d="${line(b.corners, true)}" fill="${paper.line}" fill-opacity="0.55" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`);
      continue;
    }
    plain += line(b.corners, true);
    if (b.corners.length !== 4) continue;
    const [p0, p1, p2, p3] = b.corners;
    const [a, c] = [dist(p0, p1), dist(p1, p2)];
    // The ridge runs the long way, stopping half the building's width short of each end.
    const [m0, m1, k] = a >= c ? [lerp(p0, p3, 0.5), lerp(p1, p2, 0.5), c / 2 / (a || 1)] : [lerp(p0, p1, 0.5), lerp(p3, p2, 0.5), a / 2 / (c || 1)];
    const [e0, e1] = [lerp(m0, m1, Math.min(0.5, k)), lerp(m0, m1, 1 - Math.min(0.5, k))];
    const ends: [Pt, Pt][] = a >= c ? [[p0, p3], [p1, p2]] : [[p0, p1], [p3, p2]];
    ridges += `${line([e0, e1])}${line([ends[0][0], e0, ends[0][1]])}${line([ends[1][0], e1, ends[1][1]])}`;
  }
  out.push(`<path d="${plain}" fill="${paper.floor}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="${ridges}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" opacity="0.85"/>`, ...keyed);

  // Trees: a crown, with a stroke of shade on one side. Each is drawn whole, so one in front hides the one behind.
  if (plan.trees.length) {
    let trees = '';
    for (const [x, y, s] of [...plan.trees].sort((a, b) => a[1] - b[1])) {
      const r = P(s);
      trees += `<circle cx="${P(x)}" cy="${P(y)}" r="${r}"/><path d="M${P(x) - Math.round(r * 0.1)} ${P(y) + Math.round(r * 0.62)}a${Math.round(r * 0.62)} ${Math.round(r * 0.62)} 0 0 0 ${Math.round(r * 0.66)} ${-Math.round(r * 0.72)}" fill="none"/>`;
    }
    out.push(`<g fill="${paper.floor}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round">${trees}</g>`);
  }

  if (o.grid !== 'none') {
    let grid = '';
    for (let x = 1; x < plan.w; x++) grid += `M${x * U} 0V${plan.h * U}`;
    for (let y = 1; y < plan.h; y++) grid += `M0 ${y * U}H${plan.w * U}`;
    out.push(`<path d="${grid}" stroke="${paper.line}" stroke-width="2.5" fill="none" opacity="0.8"/>`);
  }

  if (o.numbers)
    for (const a of plan.areas)
      out.push(
        keyMarks(a.n, P(a.x), P(a.y) + 12, o, sheet) +
          `<circle cx="${P(a.x)}" cy="${P(a.y)}" r="44" fill="${sheet}" stroke="${INK}" stroke-width="6"/><text x="${P(a.x)}" y="${P(a.y)}" font-size="${a.n > 9 ? 44 : 50}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${INK}">${esc(String(a.n))}</text>`,
      );
  out.push(legend(plan, o, paper.sheet));
  return out.join('');
}
