/**
 * What lies around a place, drawn (v0.9.28): stars in the void, clouds in the sky, mist between worlds, the sea round a
 * ship; and a rift across broken ground. Each is worked out from the squares of the sheet and the plan's own number,
 * so the same plan is drawn the same way every time.
 */
import { noise, type Pt, type Rift } from './model.js';

const U = 100;
const r = (v: number) => Math.round(v * U);
export const NIGHT = '#0b0c11';
type Open = (x: number, y: number) => boolean;

/** Stars: a scatter of points, a few of them large and four-rayed. */
export function stars(w: number, h: number, seed: number, open: Open): string {
  let small = '';
  let large = '';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!open(x, y)) continue;
      for (let k = 0; k < 2; k++) {
        const n = noise(x * 2 + k, y, seed + 51);
        if (n < 0.42) continue;
        const [cx, cy] = [r(x + noise(x, y * 2 + k, seed + 52)), r(y + noise(x * 2 + k, y, seed + 53))];
        const size = 2 + noise(x, y + k, seed + 54) * 5;
        if (n > 0.965) large += `M${cx} ${cy - 26}L${cx + 5} ${cy - 5}L${cx + 26} ${cy}L${cx + 5} ${cy + 5}L${cx} ${cy + 26}L${cx - 5} ${cy + 5}L${cx - 26} ${cy}L${cx - 5} ${cy - 5}Z`;
        else small += `<circle cx="${cx}" cy="${cy}" r="${size.toFixed(1)}" opacity="${(0.45 + n * 0.55).toFixed(2)}"/>`;
      }
    }
  return `<g fill="#ffffff">${small}${large ? `<path d="${large}"/>` : ''}</g>`;
}

/** Clouds: where there is open sky for one, three or four billows over a flat underside. */
export function clouds(w: number, h: number, seed: number, open: Open, ink: string, sheet: string): string {
  let d = '';
  for (let gy = 0; gy * 3 < h; gy++)
    for (let gx = 0; gx * 5 < w; gx++) {
      if (noise(gx, gy, seed + 61) < 0.3) continue;
      const [x, y] = [gx * 5 + noise(gx, gy, seed + 62) * 2.5, gy * 3 + 1 + noise(gx, gy, seed + 63) * 1.6];
      const s = 0.75 + noise(gx, gy, seed + 64) * 0.6;
      const clear = [0, 1.4 * s, 2.8 * s].every((dx) => [-0.9 * s, 0.1].every((dy) => open(Math.floor(x + dx), Math.floor(y + dy)))) && x + 3 * s < w - 0.3 && y - s > 0.3 && y < h - 1.2;
      if (!clear) continue;
      const [x0, y0, k] = [r(x), r(y), s * U];
      const q = (dx: number, dy: number, ex: number, ey: number) => `q${Math.round(dx * k)} ${Math.round(dy * k)} ${Math.round(ex * k)} ${Math.round(ey * k)}`;
      d += `M${x0} ${y0}${q(-0.35, -0.55, 0.45, -0.5)}${q(0.3, -0.75, 1.05, -0.2)}${q(0.55, -0.5, 0.95, 0.15)}${q(0.7, 0, 0.4, 0.55)}Z`;
    }
  return d ? `<path d="${d}" fill="${sheet}" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round" opacity="0.8"/>` : '';
}

/** Mist: short wavering strokes, thin and pale. */
export function mist(w: number, h: number, seed: number, open: Open): string {
  let d = '';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!open(x, y) || noise(x, y, seed + 71) < 0.38) continue;
      const [x0, y0] = [r(x + noise(x, y, seed + 72) * 0.4), r(y + 0.2 + noise(x, y, seed + 73) * 0.6)];
      const len = 26 + Math.round(noise(x, y, seed + 74) * 22);
      d += `M${x0} ${y0}q${len / 2} -16 ${len} 0t${len} 0`;
    }
  return d ? `<path d="${d}" fill="none" stroke="#8d877a" stroke-width="4" stroke-linecap="round" opacity="0.7"/>` : '';
}

/** The sea: little waves, here and there. */
export function waves(w: number, h: number, seed: number, open: Open, ink: string): string {
  let d = '';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!open(x, y) || noise(x, y, seed + 81) < 0.5) continue;
      const [x0, y0] = [r(x + noise(x, y, seed + 82) * 0.3), r(y + 0.3 + noise(x, y, seed + 83) * 0.5)];
      d += `M${x0} ${y0}q11 -15 22 0q11 15 22 0q11 -15 22 0`;
    }
  return d ? `<path d="${d}" fill="none" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" opacity="0.5"/>` : '';
}

/** A rift as an outline: its two sides, each broken and uneven. */
export function riftPath(rift: Rift, seed: number): string {
  // More points along it than it was laid out with, so that the sides are jagged.
  const fine: Pt[] = [];
  for (let i = 0; i + 1 < rift.points.length; i++) {
    const [a, b] = [rift.points[i], rift.points[i + 1]];
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6));
    for (let k = 0; k < steps; k++) fine.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  }
  fine.push(rift.points[rift.points.length - 1]);
  const left: string[] = [];
  const right: string[] = [];
  fine.forEach((p, i) => {
    const [a, b] = [fine[Math.max(0, i - 1)], fine[Math.min(fine.length - 1, i + 1)]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
    const [wl, wr] = [(rift.width / 2) * (0.6 + noise(i, 1, seed + 91) * 0.8), (rift.width / 2) * (0.6 + noise(i, 2, seed + 92) * 0.8)];
    left.push(`${r(p[0] + nx * wl)} ${r(p[1] + ny * wl)}`);
    right.unshift(`${r(p[0] - nx * wr)} ${r(p[1] - ny * wr)}`);
  });
  return `M${[...left, ...right].join('L')}Z`;
}

/** A closed outline through points, each a little off true and the corners rounded: the edge of an island. */
export function ragged(ring: Pt[], seed: number, amp: number, fixed?: (p: Pt) => boolean): string {
  const p = ring.map(([x, y], i): [number, number] => (fixed?.([x, y]) ? [r(x), r(y)] : [r(x + (noise(i, Math.round(x * 3), seed + 41) - 0.5) * 2 * amp), r(y + (noise(Math.round(y * 3), i, seed + 42) - 0.5) * 2 * amp)]));
  const n = p.length;
  const mid = (a: [number, number], b: [number, number]) => `${Math.round((a[0] + b[0]) / 2)} ${Math.round((a[1] + b[1]) / 2)}`;
  let d = `M${mid(p[n - 1], p[0])}`;
  for (let i = 0; i < n; i++) d += `Q${p[i].join(' ')} ${mid(p[i], p[(i + 1) % n])}`;
  return `${d}Z`;
}
