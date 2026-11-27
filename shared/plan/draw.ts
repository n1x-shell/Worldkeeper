/**
 * Drawing a plan as ink on paper: SVG, so it is sharp at any size and can be turned into a picture of exactly so many
 * pixels to a square. One square is 100 units; every line's small wobble comes from the plan's own squares, so the
 * same plan is drawn the same way every time.
 */
import { DIRS, edgeKey, noise, type Feature, type GridPlan, type Opening, type Plan } from './model.js';
import { drawTown } from './drawTown.js';
import { NIGHT, clouds, mist, ragged, riftPath, stars, waves } from './drawLand.js';

export interface DrawOptions {
  /** The GM's copy shows secret doors and traps. */
  gm: boolean;
  numbers: boolean;
  grid: 'floor' | 'all' | 'none';
  /** What solid rock looks like: hatched by hand, filled in, or left as paper. */
  fill: 'hatch' | 'solid' | 'none';
  paper: 'white' | 'parchment' | 'clear';
  furnishings: boolean;
  title: string;
  /** Pixels to a square, for the picture's size. */
  px: number;
  /** For the GM's copy: letters under a place's number for what is keyed to it (`{ 3: 'ET' }`). */
  marks: Record<number, string>;
  /** A numbered place to ring: the one being worked on. Never part of a picture taken away. */
  ring: number | null;
  /** Ink on paper, or painted (v0.9.29): floors and ground in stone, wood, earth and grass. */
  style: 'ink' | 'painted';
  /** The textures the painted style is made of, each a picture as a data address. Without them it is painted in flat colours. */
  art?: Partial<PlanArt>;
}
export const DRAW_DEFAULTS: DrawOptions = { gm: true, numbers: true, grid: 'floor', fill: 'hatch', paper: 'white', furnishings: true, title: '', px: 70, marks: {}, ring: null, style: 'ink' };

/** The grounds of the painted style. */
export const ART_KINDS = ['stone', 'wood', 'earth', 'rock', 'grass', 'dirt'] as const;
export type PlanArt = Record<(typeof ART_KINDS)[number], string>;
/** Each ground's colour where there is no picture of it, how many units of the sheet one picture covers, and how far it is turned (so that its repeat does not run with the grid). */
const GROUNDS: Record<keyof PlanArt, { flat: string; size: number; turn: number }> = {
  stone: { flat: '#a39d91', size: 420, turn: 0 },
  wood: { flat: '#77604a', size: 300, turn: 0 },
  earth: { flat: '#9a8364', size: 520, turn: 0 },
  rock: { flat: '#5a5148', size: 760, turn: 14 },
  grass: { flat: '#5f7a3c', size: 640, turn: -11 },
  dirt: { flat: '#b18c61', size: 520, turn: 7 },
};
/** Only a picture written out as letters is taken: nothing that could close the mark it is put in. */
const PICTURE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
/** The fills of the painted style: ask for a ground as it is needed, and take the patterns for those asked for at the end. */
export function paints(o: DrawOptions): { fill: (k: keyof PlanArt) => string; defs: () => string } {
  const used = new Set<keyof PlanArt>();
  const has = (k: keyof PlanArt) => PICTURE.test(o.art?.[k] ?? '');
  return {
    fill: (k) => {
      used.add(k);
      return has(k) ? `url(#p-${k})` : GROUNDS[k].flat;
    },
    defs: () =>
      [...used]
        .filter(has)
        .map((k) => {
          const g = GROUNDS[k];
          return `<pattern id="p-${k}" width="${g.size}" height="${g.size}" patternUnits="userSpaceOnUse"${g.turn ? ` patternTransform="rotate(${g.turn})"` : ''}><image href="${o.art![k]}" width="${g.size}" height="${g.size}" preserveAspectRatio="none"/></pattern>`;
        })
        .join(''),
  };
}
/** What lies beyond a place in the painted style: the sky, the mist, the sea. */
export const SKY = '#b9d2e2';
export const HAZE = '#cdc9bf';
export const SEA = '#3c6b82';
/** What a thing is made of, in the painted style: wood, stone, water, growth. */
const WOODEN = new Set<Feature['kind']>(['table', 'bed', 'chest', 'barrel', 'shelf', 'counter', 'pew', 'stall', 'bridge', 'mast', 'helm', 'ballista', 'throne']);
const tone = (kind: Feature['kind']) => (WOODEN.has(kind) ? '#b9925e' : kind === 'pool' ? '#7fa9bb' : kind === 'growth' ? '#a3bd7f' : kind === 'trap' ? '#f3ead6' : '#cbc5ba');

/** The letters for what is keyed to a place, and the ring round the one being worked on. */
export function keyMarks(n: number, x: number, y: number, o: DrawOptions, halo: string): string {
  let out = '';
  if (o.ring === n) out += `<circle cx="${x}" cy="${y}" r="62" fill="none" stroke="${GM_INK}" stroke-width="9" stroke-dasharray="20 12"/>`;
  const marks = o.gm ? o.marks[n] : '';
  if (marks) out += `<text x="${x}" y="${y + 50}" font-size="27" font-weight="700" letter-spacing="3" text-anchor="middle" dominant-baseline="central" fill="${GM_INK}" stroke="${halo}" stroke-width="9" stroke-linejoin="round" paint-order="stroke">${esc(marks)}</text>`;
  return out;
}

export const U = 100;
export const INK = '#1d1a16';
export const GM_INK = '#a3261e';
export const PAPERS = { white: { sheet: '#ffffff', floor: '#ffffff', line: '#bdb6a8' }, parchment: { sheet: '#efe4cb', floor: '#fbf5e6', line: '#c3b697' }, clear: { sheet: 'none', floor: '#ffffff', line: '#bdb6a8' } } as const;

export const r1 = (v: number) => Math.round(v * U);
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Drawing {
  svg: string;
  /** Squares across and down. */
  w: number;
  h: number;
  /** The picture's size in pixels at the pixels-to-a-square asked for. */
  width: number;
  height: number;
}

export function drawPlan(plan: Plan, options: Partial<DrawOptions> = {}): Drawing {
  const o = { ...DRAW_DEFAULTS, ...options };
  const body = plan.kind === 'settlement' ? drawTown(plan, o) : drawGrid(plan, o);
  const [width, height] = [Math.round(plan.w * o.px), Math.round(plan.h * o.px)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.w * U} ${plan.h * U}" width="${width}" height="${height}" font-family="Georgia, 'Times New Roman', serif">${body}</svg>`;
  return { svg, w: plan.w, h: plan.h, width, height };
}

/** The title along the bottom, the scale beside it, and north. */
export function legend(plan: Plan, o: DrawOptions, sheet: string, dark = false): string {
  const out: string[] = [];
  const halo = dark ? INK : sheet === 'none' ? '#ffffff' : sheet;
  const ink = dark ? '#ffffff' : INK;
  const text = (x: number, y: number, s: string, size: number, anchor: string, extra = '') =>
    `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" fill="${ink}" stroke="${halo}" stroke-width="${Math.round(size / 3.5)}" stroke-linejoin="round" paint-order="stroke"${extra}>${esc(s)}</text>`;
  const scale = `1 square = ${plan.feet} ft`;
  if (o.title) out.push(text(0.5, plan.h - 0.55, o.title, 62, 'start', ' font-weight="700"'));
  out.push(text(plan.w - 0.5, plan.h - 0.55, scale, 38, 'end', ' font-style="italic"'));
  // North, in the top right corner.
  const [cx, cy] = [plan.w - 1, 1.05];
  out.push(
    `<g transform="translate(${r1(cx)} ${r1(cy)})"><circle r="46" fill="${halo}"/><path d="M0 -40 L13 14 L0 5 L-13 14 Z" fill="${ink}"/><path d="M0 5 L0 34" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>` +
      `<text y="-48" font-size="30" font-weight="700" text-anchor="middle" fill="${ink}" stroke="${halo}" stroke-width="8" paint-order="stroke">N</text></g>`,
  );
  return out.join('');
}

function drawGrid(plan: GridPlan, o: DrawOptions): string {
  const { w, h, cells } = plan;
  const painted = o.style === 'painted';
  const paper = PAPERS[painted ? 'white' : o.paper];
  const doorFill = painted ? '#b9925e' : paper.floor;
  const seed = (w * 73856093) ^ (h * 19349663) ^ (plan.areas.length * 83492791);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[y * w + x]);
  const floor = (x: number, y: number) => at(x, y) !== 0;
  const openings = new Map<string, Opening>(plan.openings.map((p) => [edgeKey(p), p]));
  const land = plan.land ?? 'plain';
  const ship = plan.kind === 'ship';
  // What is outside its walls is not rock: a building's, and a ship's.
  const building = plan.kind === 'building' || ship;

  // ---- Where each corner of the squares is drawn: a little off true, and well off where the walls are rough. --------
  // A ship's hull is rounded like rough rock, and as true as a wall.
  const hullAt = (x: number, y: number) => ship && (at(x, y) === 0 || at(x - 1, y) === 0 || at(x, y - 1) === 0 || at(x - 1, y - 1) === 0);
  const roughAt = (x: number, y: number) => hullAt(x, y) || plan.rough.has(at(x, y)) || plan.rough.has(at(x - 1, y)) || plan.rough.has(at(x, y - 1)) || plan.rough.has(at(x - 1, y - 1));
  const pos = (x: number, y: number): [number, number] => {
    if (x <= 0 || y <= 0 || x >= w || y >= h) return [x * U, y * U];
    const amp = hullAt(x, y) ? 0 : roughAt(x, y) ? 0.21 : 0.028;
    // On unearthly ground the walls bend in long curves as well: nothing is straight.
    const [bx, by] = land === 'unearthly' ? [Math.sin(y * 0.71 + x * 0.23 + (seed % 7)) * 0.19, Math.sin(x * 0.67 - y * 0.19 + (seed % 5)) * 0.19] : [0, 0];
    return [Math.round((x + bx + (noise(x, y, seed) - 0.5) * 2 * amp) * U), Math.round((y + by + (noise(x, y, seed + 7) - 0.5) * 2 * amp) * U)];
  };
  const mid = (a: [number, number], b: [number, number]): [number, number] => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  type V = [number, number];
  /** A line through the corners given: straight between true corners, rounded off at rough ones. */
  const through = (vs: V[], closed: boolean): string => {
    const n = vs.length;
    const p = vs.map(([x, y]) => pos(x, y));
    const rough = vs.map(([x, y]) => roughAt(x, y));
    if (closed && rough.every(Boolean)) {
      let d = `M${mid(p[n - 1], p[0]).join(' ')}`;
      for (let i = 0; i < n; i++) d += `Q${p[i].join(' ')} ${mid(p[i], p[(i + 1) % n]).join(' ')}`;
      return `${d}Z`;
    }
    // Start at a true corner, so the line closes on one.
    let s = 0;
    if (closed) while (rough[s]) s++;
    const idx = (i: number) => (s + i) % n;
    let d = `M${p[idx(0)].join(' ')}`;
    let atMid = false;
    const last = closed ? n : n - 1;
    for (let i = 1; i <= last; i++) {
      const k = idx(i);
      const ends = !closed && i === last;
      if (closed && i === last) break;
      if (rough[k] && !ends) {
        const next = idx(i + 1);
        if (!atMid) d += `L${mid(p[idx(i - 1)], p[k]).join(' ')}`;
        d += `Q${p[k].join(' ')} ${mid(p[k], p[next]).join(' ')}`;
        atMid = true;
      } else {
        d += `L${p[k].join(' ')}`;
        atMid = false;
      }
    }
    return closed ? `${d}Z` : d;
  };

  // ---- The outline of the floor: every edge between floor and solid, joined up into rings. ---------------------------
  interface Edge {
    from: V;
    to: V;
    dir: number;
    open: boolean;
    /** The solid side is not rock: the outside of a building. */
    outer: boolean;
    used?: boolean;
  }
  const starts = new Map<string, Edge[]>();
  const add = (from: V, to: V, dir: number, key: string, sx: number, sy: number) => {
    const op = openings.get(key);
    const outer = sx < 0 || sy < 0 || sx >= w || sy >= h ? building : !plan.rock[sy * w + sx];
    const e: Edge = { from, to, dir, open: !!op && op.kind !== 'secret', outer };
    const k = `${from[0]},${from[1]}`;
    starts.set(k, [...(starts.get(k) ?? []), e]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!floor(x, y)) continue;
      if (!floor(x, y - 1)) add([x, y], [x + 1, y], 0, `${x},${y},n`, x, y - 1);
      if (!floor(x + 1, y)) add([x + 1, y], [x + 1, y + 1], 1, `${x + 1},${y},w`, x + 1, y);
      if (!floor(x, y + 1)) add([x + 1, y + 1], [x, y + 1], 2, `${x},${y + 1},n`, x, y + 1);
      if (!floor(x - 1, y)) add([x, y + 1], [x, y], 3, `${x},${y},w`, x - 1, y);
    }
  const rings: Edge[][] = [];
  for (const list of starts.values())
    for (const first of list) {
      if (first.used) continue;
      const ring: Edge[] = [];
      let e: Edge | undefined = first;
      while (e && !e.used) {
        e.used = true;
        ring.push(e);
        const next: Edge[] = (starts.get(`${e.to[0]},${e.to[1]}`) ?? []).filter((c) => !c.used);
        const d: number = e.dir;
        // Where two rooms touch only at a corner, keep to the room being walked round.
        e = next.find((c) => c.dir === (d + 1) % 4) ?? next.find((c) => c.dir === d) ?? next.find((c) => c.dir === (d + 3) % 4);
      }
      // A ship's hull runs fair from one outer corner to the next: the corners where it steps in are left out, and the
      // rounding does the rest.
      const fair = ship ? ring.filter((e, i) => e.dir !== (ring[(i + ring.length - 1) % ring.length].dir + 3) % 4) : ring;
      if (fair.length >= 4) rings.push(fair);
    }
  const floorPath = rings.map((ring) => through(ring.map((e) => e.from), true)).join('');

  // The walls: the same rings, left out where there is a door or a way out.
  const wallPaths = { thin: '', thick: '' };
  for (const ring of rings) {
    const which = ring[0].outer ? 'thick' : 'thin';
    if (!ring.some((e) => e.open)) {
      wallPaths[which] += through(ring.map((e) => e.from), true);
      continue;
    }
    const s = ring.findIndex((e) => e.open);
    const turned = [...ring.slice(s + 1), ...ring.slice(0, s + 1)];
    let run: Edge[] = [];
    for (const e of turned) {
      if (e.open) {
        if (run.length) wallPaths[which] += through([...run.map((r) => r.from), run[run.length - 1].to], false);
        run = [];
      } else run.push(e);
    }
  }

  // Walls between two rooms, or a room and a passage beside it: straight runs along the squares' edges.
  let inner = '';
  const innerRun = (vs: V[]) => {
    if (vs.length > 1) inner += `M${vs.map(([x, y]) => pos(x, y).join(' ')).join('L')}`;
  };
  const wallBetween = (a: number, b: number, key: string) => a !== 0 && b !== 0 && a !== b && (!openings.has(key) || openings.get(key)!.kind === 'secret');
  for (let y = 1; y < h; y++) {
    let run: V[] = [];
    for (let x = 0; x <= w; x++) {
      if (x < w && wallBetween(at(x, y - 1), at(x, y), `${x},${y},n`)) run = run.length ? [...run, [x + 1, y]] : [[x, y], [x + 1, y]];
      else (innerRun(run), (run = []));
    }
  }
  for (let x = 1; x < w; x++) {
    let run: V[] = [];
    for (let y = 0; y <= h; y++) {
      if (y < h && wallBetween(at(x - 1, y), at(x, y), `${x},${y},w`)) run = run.length ? [...run, [x, y + 1]] : [[x, y], [x, y + 1]];
      else (innerRun(run), (run = []));
    }
  }

  const wallW = building ? 11 : 15;
  const thickW = 26;

  // ---- Doors and other openings --------------------------------------------------------------------------------------
  let stubs = '';
  let stubsThick = '';
  const doors: string[] = [];
  const marks: string[] = [];
  for (const p of plan.openings) {
    const a: V = [p.x, p.y];
    const b: V = p.side === 'n' ? [p.x + 1, p.y] : [p.x, p.y + 1];
    const [pa, pb] = [pos(...a), pos(...b)];
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const horizontal = p.side === 'n';
    if (p.kind === 'open') continue;
    // A door that opens somewhere not next door: its letter, on the GM's copy, on the stub of passage before it.
    if (p.to && o.gm) {
      const [n1, n2] = p.side === 'n' ? [at(p.x, p.y - 1), at(p.x, p.y)] : [at(p.x - 1, p.y), at(p.x, p.y)];
      const out = n1 === 1 || n2 !== 1 ? -1 : 1;
      const [lx, ly] = horizontal ? [mx, my + out * 0.5] : [mx + out * 0.5, my];
      marks.push(
        `<text x="${r1(lx)}" y="${r1(ly)}" font-size="46" font-weight="700" font-style="italic" text-anchor="middle" dominant-baseline="central" fill="${GM_INK}" stroke="${paper.floor}" stroke-width="12" paint-order="stroke">${esc(p.to)}</text>`,
      );
    }
    if (p.kind === 'secret') {
      if (o.gm)
        marks.push(
          `<text x="${r1(mx)}" y="${r1(my)}" font-size="46" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${GM_INK}" stroke="${paper.floor}" stroke-width="12" paint-order="stroke">S</text>`,
        );
      continue;
    }
    const [n1, n2] = p.side === 'n' ? [at(p.x, p.y - 1), at(p.x, p.y)] : [at(p.x - 1, p.y), at(p.x, p.y)];
    const outer = building && (n1 === 0 || n2 === 0);
    const gap = p.kind === 'double' ? 0.76 : 0.6;
    const s = (1 - gap) / 2;
    const stub = horizontal ? `M${pa.join(' ')}L${r1(a[0] + s)} ${r1(a[1])}M${r1(b[0] - s)} ${r1(b[1])}L${pb.join(' ')}` : `M${pa.join(' ')}L${r1(a[0])} ${r1(a[1] + s)}M${r1(b[0])} ${r1(b[1] - s)}L${pb.join(' ')}`;
    if (outer) stubsThick += stub;
    else stubs += stub;
    const rect = (along: number, across: number, extra: string) =>
      horizontal
        ? `<rect x="${r1(mx - along / 2)}" y="${r1(my - across / 2)}" width="${r1(along)}" height="${r1(across)}" ${extra}/>`
        : `<rect x="${r1(mx - across / 2)}" y="${r1(my - along / 2)}" width="${r1(across)}" height="${r1(along)}" ${extra}/>`;
    if (p.kind === 'door' || p.kind === 'double') {
      doors.push(rect(gap, outer ? 0.3 : 0.24, `fill="${doorFill}" stroke="${INK}" stroke-width="7"`));
      if (p.kind === 'double') doors.push(horizontal ? `<path d="M${r1(mx)} ${r1(my - 0.12)}V${r1(my + 0.12)}" stroke="${INK}" stroke-width="6"/>` : `<path d="M${r1(mx - 0.12)} ${r1(my)}H${r1(mx + 0.12)}" stroke="${INK}" stroke-width="6"/>`);
    } else if (p.kind === 'arch') {
      // The jambs of an open doorway.
      for (const t of [-gap / 2, gap / 2])
        doors.push(horizontal ? `<path d="M${r1(mx + t)} ${r1(my - 0.09)}V${r1(my + 0.09)}" stroke="${INK}" stroke-width="${wallW}" stroke-linecap="round"/>` : `<path d="M${r1(mx - 0.09)} ${r1(my + t)}H${r1(mx + 0.09)}" stroke="${INK}" stroke-width="${wallW}" stroke-linecap="round"/>`);
    } else if (p.kind === 'bars') {
      for (const t of [-0.2, 0, 0.2]) doors.push(`<circle cx="${r1(horizontal ? mx + t : mx)}" cy="${r1(horizontal ? my : my + t)}" r="7" fill="${INK}"/>`);
    } else if (p.kind === 'window') {
      doors.push(rect(gap, 0.14, `fill="${painted ? '#bfd4dd' : paper.floor}" stroke="${INK}" stroke-width="5"`));
    }
  }

  // ---- Rock ------------------------------------------------------------------------------------------------------------
  const near = (x: number, y: number, d: number) => {
    for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) if (floor(x + i, y + j)) return true;
    return false;
  };
  const isRock = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !floor(x, y) && plan.rock[y * w + x] === 1;
  // In the sky, in the mist and in the void a place stands on an island: so many squares of ground round its floors,
  // and nothing beyond. (A ship is its own island.)
  const rim = ship ? 0 : land === 'aloft' ? 2 : land === 'adrift' || land === 'void' ? 1 : -1;
  const isle = (x: number, y: number) => rim >= 0 && x >= 0 && y >= 0 && x < w && y < h && (floor(x, y) || (rim > 0 && near(x, y, rim)));
  let hatch = '';
  let solid = '';
  if (o.fill === 'hatch') {
    // Little bundles of three or four short strokes, each at its own angle, three bundles to a square each way:
    // thick against the walls, thinning out a square further off.
    const K = 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!isRock(x, y) || (rim >= 0 && !isle(x, y))) continue;
        const close = near(x, y, 1);
        if (!close && !near(x, y, 2)) continue;
        for (let k = 0; k < K * K; k++) {
          const [sx, sy] = [x * K + (k % K), y * K + Math.floor(k / K)];
          if (!close && noise(sx, sy, seed + 3) > 0.3) continue;
          const angle = noise(sx, sy, seed + 1) * Math.PI;
          const [cx, cy] = [(sx + 0.5) / K + (noise(sx, sy, seed + 2) - 0.5) * 0.1, (sy + 0.5) / K + (noise(sx, sy, seed + 4) - 0.5) * 0.1];
          const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
          const lines = noise(sx, sy, seed + 5) > 0.55 ? 4 : 3;
          for (let i = 0; i < lines; i++) {
            const off = (i - (lines - 1) / 2) * 0.085;
            const len = 0.17 + noise(sx * 4 + i, sy, seed + 6) * 0.05;
            const [px, py] = [cx - uy * off, cy + ux * off];
            hatch += `M${r1(px - ux * len)} ${r1(py - uy * len)}L${r1(px + ux * len)} ${r1(py + uy * len)}`;
          }
        }
      }
  } else if (o.fill === 'solid') {
    // Rock filled in: the whole sheet where it is all rock, else the squares of rock themselves.
    if (rim < 0 && plan.rock.every((v) => v === 1)) solid = `M0 0H${w * U}V${h * U}H0Z`;
    else
      for (let y = 0; y < h; y++) {
        let from = -1;
        for (let x = 0; x <= w; x++) {
          const on = x < w && isRock(x, y) && (rim < 0 || isle(x, y));
          if (on && from < 0) from = x;
          if (!on && from >= 0) {
            solid += `M${from * U - 2} ${y * U - 2}H${x * U + 2}V${(y + 1) * U + 2}H${from * U - 2}Z`;
            from = -1;
          }
        }
      }
  }

  // ---- The grid --------------------------------------------------------------------------------------------------------
  let grid = '';
  if (o.grid !== 'none') {
    for (let x = 1; x < w; x++) grid += `M${x * U} 0V${h * U}`;
    for (let y = 1; y < h; y++) grid += `M0 ${y * U}H${w * U}`;
  }

  // ---- What lies around it ---------------------------------------------------------------------------------------------
  const night = land === 'void' && paper.sheet !== 'none';
  const around: string[] = [];
  if (paper.sheet !== 'none') {
    const open = (x: number, y: number) => !isle(x, y) && !floor(x, y);
    if (land === 'void') around.push(stars(w, h, seed, open));
    else if (land === 'aloft') around.push(clouds(w, h, seed, open, INK, paper.sheet));
    else if (land === 'adrift') around.push(mist(w, h, seed, open));
    else if (ship) around.push(waves(w, h, seed, open, INK));
  }
  let ground = '';
  let drop = '';
  if (rim > 0) {
    // The island: the outline of its ground, ragged, and under its southern edges the strokes of the drop.
    const next = new Map<string, { to: V; dir: number; used?: boolean }[]>();
    const side = (from: V, to: V, dir: number) => next.set(`${from[0]},${from[1]}`, [...(next.get(`${from[0]},${from[1]}`) ?? []), { to, dir }]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!isle(x, y)) continue;
        if (!isle(x, y - 1)) side([x, y], [x + 1, y], 0);
        if (!isle(x + 1, y)) side([x + 1, y], [x + 1, y + 1], 1);
        if (!isle(x, y + 1)) side([x + 1, y + 1], [x, y + 1], 2);
        if (!isle(x - 1, y)) side([x, y + 1], [x, y], 3);
        if (land === 'aloft' && !isle(x, y + 1) && y + 1 < h)
          for (const k of [0.2, 0.5, 0.8]) {
            const len = 0.2 + noise(x * 3 + Math.round(k * 10), y, seed + 43) * 0.45;
            drop += `M${r1(x + k)} ${r1(y + 1.12)}v${Math.round(len * U)}`;
          }
      }
    for (const list of next.values())
      for (const first of list) {
        if (first.used) continue;
        const ring: V[] = [];
        let e: { to: V; dir: number; used?: boolean } | undefined = first;
        let from: V | null = null;
        for (const [k, es] of next) if (es.includes(first)) from = k.split(',').map(Number) as V;
        while (e && !e.used && from) {
          e.used = true;
          ring.push(from);
          const d: number = e.dir;
          from = e.to;
          const options: { to: V; dir: number; used?: boolean }[] = (next.get(`${e.to[0]},${e.to[1]}`) ?? []).filter((c) => !c.used);
          e = options.find((c) => c.dir === (d + 1) % 4) ?? options.find((c) => c.dir === d) ?? options.find((c) => c.dir === (d + 3) % 4);
        }
        if (ring.length >= 4) ground += ragged(ring, seed, 0.3, ([x, y]) => x <= 0 || y <= 0 || x >= w || y >= h);
      }
    const sheet = paper.sheet === 'none' ? '#ffffff' : paper.sheet;
    if (!painted) {
      around.push(`<path d="${ground}" fill="${sheet}" fill-rule="evenodd" stroke="${INK}" stroke-width="${night ? 0 : 5}" stroke-linejoin="round"/>`);
      if (drop) around.push(`<path d="${drop}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" opacity="0.8"/>`);
    }
  }
  // A rift: the ground gone, in a broken line across floors and rock alike.
  const rifts = (plan.rifts ?? []).map((r) => `<path d="${riftPath(r, seed)}" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`);

  const stroke = `stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  // A mast and a helm are the ship; growth and a bridge are the ground: they are drawn whether or not furnishings are.
  const always = new Set<Feature['kind']>(['stairs', 'pillar', 'trap', 'mast', 'helm', 'growth', 'bridge']);
  const shownThings = plan.features.filter((f) => (o.gm || !f.gm) && (o.furnishings || always.has(f.kind)));
  const titles = plan.captions.map((c) => {
    // On a patch of clear paper, so that it reads over the hatching round a cellar.
    const half = c.text.length * 11 + 16;
    const sheet = paper.sheet === 'none' ? '#ffffff' : paper.sheet;
    return `<rect x="${r1(c.x) - half}" y="${r1(c.y) - 40}" width="${half * 2}" height="56" rx="10" fill="${sheet}"/><text x="${r1(c.x)}" y="${r1(c.y)}" font-size="44" font-style="italic" text-anchor="middle" fill="${INK}">${esc(c.text)}</text>`;
  });
  const numbers = o.numbers
    ? plan.areas.map(
        (a) =>
          keyMarks(a.n, r1(a.x), r1(a.y), o, paper.floor) +
          `<text x="${r1(a.x)}" y="${r1(a.y)}" font-size="${a.n > 99 ? 40 : 50}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${INK}" stroke="${paper.floor}" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${a.n}</text>`,
      )
    : [];

  // ---- Painted: floors of stone, wood or earth, on rock or grass, with the shade of the walls on them -------------------
  if (painted) {
    const paint = paints(o);
    const allRock = plan.rock.every((v) => v === 1);
    const floorOf = plan.kind === 'cave' ? 'earth' : plan.kind === 'dungeon' ? 'stone' : 'wood';
    const beyond = land === 'void' ? NIGHT : land === 'aloft' ? SKY : land === 'adrift' ? HAZE : ship ? SEA : null;
    const groundFill = paint.fill(allRock ? 'rock' : 'grass');
    // Rock is in shadow: the floors are what is lit.
    const dim = (d: string) => (allRock ? `<path d="${d}" fill="#0e0b08" fill-rule="evenodd" opacity="0.5"/>` : '');
    const out: string[] = ['', `<rect width="${w * U}" height="${h * U}" fill="${beyond ?? groundFill}"/>`];
    if (!beyond) out.push(dim(`M0 0H${w * U}V${h * U}H0Z`));
    out.push(...around);
    if (ground) out.push(`<path d="${ground}" fill="${groundFill}" fill-rule="evenodd" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`, dim(ground));
    if (drop) out.push(`<path d="${drop}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" opacity="0.8"/>`);
    if (!allRock) {
      // A building's cellar is dug in rock.
      let under = '';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRock(x, y) && near(x, y, 2)) under += `M${x * U - 2} ${y * U - 2}h${U + 4}v${U + 4}h${-U - 4}Z`;
      if (under) out.push(`<path d="${under}" fill="${paint.fill('rock')}"/><path d="${under}" fill="#0e0b08" opacity="0.5"/>`);
    }
    out.push(`<path d="${floorPath}" fill="${paint.fill(floorOf)}" fill-rule="evenodd"/>`);
    out.push(`<path d="${floorPath}" fill="${floorOf === 'wood' ? '#ecd6b0' : '#f1e7d0'}" fill-rule="evenodd" opacity="${floorOf === 'wood' ? 0.32 : 0.2}"/>`);
    out.push(`<path d="${wallPaths.thin}${wallPaths.thick}${inner}" fill="none" stroke="#000000" stroke-width="84" stroke-linejoin="round" opacity="0.42" filter="url(#p-soft)" clip-path="url(#floor)"/>`);
    if (o.grid !== 'none') out.push(`<path d="${grid}" stroke="#17130f" stroke-opacity="0.34" stroke-width="2.5" fill="none"${o.grid === 'floor' ? ' clip-path="url(#floor)"' : ''}/>`);
    for (const f of shownThings) if (f.kind !== 'bridge') out.push(feature(f, tone(f.kind), seed));
    // Walls with some body to them: a dark edge and a core of stone or timber. A cave's are the rock itself.
    const core = plan.kind === 'cave' ? '' : ship ? '#7d6246' : '#9a9286';
    for (const [d, wide] of [[`${wallPaths.thin}${inner}${stubs}`, wallW + 7], [`${wallPaths.thick}${stubsThick}`, thickW + 4]] as const) {
      if (!d) continue;
      out.push(`<path d="${d}" stroke="#15110d" ${stroke} stroke-width="${wide}"/>`);
      if (core) out.push(`<path d="${d}" stroke="${core}" ${stroke} stroke-width="${wide - 10}"/>`);
    }
    out.push(...doors, ...rifts);
    for (const f of shownThings) if (f.kind === 'bridge') out.push(feature(f, tone(f.kind), seed));
    out.push(...marks, ...titles, ...numbers);
    const light = land === 'aloft' || land === 'adrift';
    out.push(legend(plan, o, light ? '#ffffff' : 'none', !light));
    out[0] = `<defs>${paint.defs()}<filter id="p-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="26"/></filter><clipPath id="floor"><path d="${floorPath}" clip-rule="evenodd"/></clipPath></defs>`;
    return out.join('');
  }

  // ---- Put together, from the paper up ---------------------------------------------------------------------------------
  const out: string[] = [];
  if (paper.sheet !== 'none') out.push(`<rect width="${w * U}" height="${h * U}" fill="${night ? NIGHT : paper.sheet}"/>`);
  out.push(...around);
  if (o.grid === 'all') out.push(`<path d="${grid}" stroke="${paper.line}" stroke-width="2.5" fill="none"${night ? ' opacity="0.45"' : ''}/>`);
  if (hatch) out.push(`<path d="${hatch}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`);
  if (solid) out.push(`<path d="${solid}" fill="${INK}"/>`);
  out.push(`<path d="${floorPath}" fill="${paper.floor}" fill-rule="evenodd"/>`);
  if (o.grid !== 'none') out.push(`<clipPath id="floor"><path d="${floorPath}" clip-rule="evenodd"/></clipPath><path d="${grid}" stroke="${paper.line}" stroke-width="2.5" fill="none" clip-path="url(#floor)"/>`);
  for (const f of shownThings) if (f.kind !== 'bridge') out.push(feature(f, paper.floor, seed));
  if (wallPaths.thin + stubs + inner) out.push(`<path d="${wallPaths.thin}${inner}${stubs}" stroke="${INK}" ${stroke} stroke-width="${wallW}"/>`);
  if (wallPaths.thick + stubsThick) out.push(`<path d="${wallPaths.thick}${stubsThick}" stroke="${INK}" ${stroke} stroke-width="${thickW}"/>`);
  out.push(...doors);
  // The rift is over the walls it has broken; a bridge is over the rift.
  out.push(...rifts);
  for (const f of shownThings) if (f.kind === 'bridge') out.push(feature(f, paper.floor, seed));
  out.push(...marks, ...titles, ...numbers);
  out.push(legend(plan, o, paper.sheet, night || (rim < 0 && o.fill === 'solid' && plan.rock.every((v) => v === 1))));
  return out.join('');
}

/** One thing standing in a room. */
function feature(f: Feature, floor: string, seed: number): string {
  const [x, y, w, h] = [r1(f.x), r1(f.y), r1(f.w), r1(f.h)];
  const [cx, cy] = [x + w / 2, y + h / 2];
  const line = `stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  // The same pen with no width of its own, for a line that is given one.
  const pen = `stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"`;
  const dir = f.dir ?? 0;
  switch (f.kind) {
    case 'stairs': {
      // Treads across the way of travel, each narrower than the one below it: the narrow end is the top.
      const along = dir % 2 ? w : h;
      const across = dir % 2 ? h : w;
      const steps = Math.max(4, Math.round(along / 22));
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const half = (across * (0.86 - 0.5 * t)) / 2;
        // t runs from the bottom of the flight to its top, which is the way `dir` points.
        const k = dir === 0 ? [cx, y + h - t * h] : dir === 2 ? [cx, y + t * h] : dir === 1 ? [x + t * w, cy] : [x + w - t * w, cy];
        d += dir % 2 ? `M${Math.round(k[0])} ${Math.round(k[1] - half)}V${Math.round(k[1] + half)}` : `M${Math.round(k[0] - half)} ${Math.round(k[1])}H${Math.round(k[0] + half)}`;
      }
      return `<path d="${d}" ${line} fill="none"/>`;
    }
    case 'pillar':
      return `<circle cx="${cx}" cy="${cy}" r="${Math.round(w / 2)}" fill="${INK}"/>`;
    case 'statue': {
      let star = '';
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 0.19 : 0.42) * w;
        const a = (Math.PI * i) / 5 - Math.PI / 2;
        star += `${i ? 'L' : 'M'}${Math.round(cx + Math.cos(a) * r)} ${Math.round(cy + Math.sin(a) * r)}`;
      }
      return `<circle cx="${cx}" cy="${cy}" r="${Math.round(w / 2)}" fill="${floor}" ${line}/><path d="${star}Z" fill="${INK}"/>`;
    }
    case 'altar':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${floor}" ${line}/><rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" fill="none" stroke="${INK}" stroke-width="4"/>`;
    case 'tomb':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${floor}" ${line}/><rect x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}" rx="8" fill="none" stroke="${INK}" stroke-width="4"/>`;
    case 'throne': {
      // A seat with a high back, the back to the wall.
      const back = dir === 2 ? `M${x} ${y + 10}H${x + w}` : dir === 0 ? `M${x} ${y + h - 10}H${x + w}` : dir === 1 ? `M${x + 10} ${y}V${y + h}` : `M${x + w - 10} ${y}V${y + h}`;
      return `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="6" fill="${floor}" ${line}/><path d="${back}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>`;
    }
    case 'pool': {
      const [rx, ry] = [Math.round(w / 2), Math.round(h / 2)];
      let ripples = '';
      for (let i = 0; i < Math.max(2, Math.round(h / 55)); i++) {
        const yy = Math.round(cy + (i - (Math.max(2, Math.round(h / 55)) - 1) / 2) * 34);
        const half = Math.round(rx * (0.35 + noise(i, x, seed) * 0.25));
        const off = Math.round((noise(i, y, seed + 9) - 0.5) * rx * 0.5);
        ripples += `M${cx + off - half} ${yy}q${Math.round(half / 2)} -12 ${half} 0t${half} 0`;
      }
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${floor}" ${line}/><path d="${ripples}" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    }
    case 'well':
      return `<circle cx="${cx}" cy="${cy}" r="${Math.round(w / 2)}" fill="${floor}" stroke="${INK}" stroke-width="11"/><circle cx="${cx}" cy="${cy}" r="${Math.round(w / 4)}" fill="${INK}"/>`;
    case 'rubble': {
      let d = '';
      for (let i = 0; i < 6; i++) {
        const [px, py] = [x + (0.14 + noise(i, x + y, seed) * 0.72) * w, y + (0.14 + noise(i, x - y, seed + 11) * 0.72) * h];
        const r = 5 + noise(i, x * 3 + y, seed + 12) * 11;
        // A small stone: a lopsided ring.
        d += `M${Math.round(px - r)} ${Math.round(py)}q${Math.round(r * 0.2)} ${Math.round(-r * 1.1)} ${Math.round(r)} ${Math.round(-r * 0.8)}t${Math.round(r)} ${Math.round(r * 0.8)}q${Math.round(-r * 0.3)} ${Math.round(r)} ${Math.round(-r)} ${Math.round(r * 0.8)}t${Math.round(-r)} ${Math.round(-r * 0.8)}Z`;
      }
      return `<path d="${d}" fill="${floor}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    }
    case 'chest':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${floor}" ${line}/><path d="M${x} ${Math.round(y + h * 0.4)}H${x + w}" stroke="${INK}" stroke-width="4"/><circle cx="${cx}" cy="${Math.round(y + h * 0.4)}" r="5" fill="${INK}"/>`;
    case 'hearth': {
      // Against the wall behind it: `dir` is the way it faces into the room. A block of stone with the fire's hollow.
      const d = r1(0.3);
      const [hx, hy, hw, hh] = dir === 2 ? [x + 8, y, w - 16, d] : dir === 0 ? [x + 8, y + h - d, w - 16, d] : dir === 1 ? [x, y + 8, d, h - 16] : [x + w - d, y + 8, d, h - 16];
      const [fx, fy] = [hx + hw / 2, hy + hh / 2];
      const arc = dir === 2 ? `M${fx - 22} ${hy + hh}a22 22 0 0 1 44 0Z` : dir === 0 ? `M${fx - 22} ${hy}a22 22 0 0 0 44 0Z` : dir === 1 ? `M${hx + hw} ${fy - 22}a22 22 0 0 0 0 44Z` : `M${hx} ${fy - 22}a22 22 0 0 1 0 44Z`;
      return `<rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" fill="${INK}"/><path d="${arc}" fill="${floor}"/>`;
    }
    case 'table':
      return Math.abs(w - h) < 10 ? `<circle cx="${cx}" cy="${cy}" r="${Math.round(w / 2)}" fill="${floor}" ${line}/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${floor}" ${line}/>`;
    case 'bed': {
      // The pillow is at the wall: the end away from the way the bed faces.
      const p = 0.26;
      const pillow = dir === 2 ? `M${x} ${y + r1(p)}H${x + w}` : dir === 0 ? `M${x} ${y + h - r1(p)}H${x + w}` : dir === 1 ? `M${x + r1(p)} ${y}V${y + h}` : `M${x + w - r1(p)} ${y}V${y + h}`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${floor}" ${line}/><path d="${pillow}" stroke="${INK}" stroke-width="4"/>`;
    }
    case 'counter':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${floor}" ${line}/>`;
    case 'shelf': {
      let d = '';
      const longways = w > h;
      const n = Math.max(1, Math.round((longways ? w : h) / 50));
      for (let i = 1; i < n; i++) d += longways ? `M${Math.round(x + (w * i) / n)} ${y}V${y + h}` : `M${x} ${Math.round(y + (h * i) / n)}H${x + w}`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${floor}" stroke="${INK}" stroke-width="5"/><path d="${d}" stroke="${INK}" stroke-width="3"/>`;
    }
    case 'barrel': {
      let out = '';
      const spots = [
        [0.3, 0.3],
        [0.7, 0.42],
        [0.38, 0.72],
      ];
      const n = 2 + (noise(x, y, seed) > 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const [bx, by] = [Math.round(x + spots[i][0] * w), Math.round(y + spots[i][1] * h)];
        out += `<circle cx="${bx}" cy="${by}" r="19" fill="${floor}" stroke="${INK}" stroke-width="5"/><circle cx="${bx}" cy="${by}" r="9" fill="none" stroke="${INK}" stroke-width="3"/>`;
      }
      return out;
    }
    case 'pew':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${floor}" stroke="${INK}" stroke-width="5"/>`;
    case 'anvil':
      return `<path d="M${x} ${y}H${x + w}L${x + Math.round(w * 0.78)} ${y + h}H${x + Math.round(w * 0.22)}Z" fill="${INK}"/>`;
    case 'stall': {
      // A partition out from the wall, one to a square.
      const [dx, dy] = DIRS[dir];
      const d = dx ? `M${dx > 0 ? x : x + w} ${y}h${dx * Math.round(w * 0.85)}` : `M${x} ${dy > 0 ? y : y + h}v${dy * Math.round(h * 0.85)}`;
      return `<path d="${d}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
    }
    case 'trap':
      return `<g fill="none" stroke="${GM_INK}" stroke-width="6" stroke-linejoin="round"><path d="M${cx} ${y + 16}L${x + w - 16} ${cy}L${cx} ${y + h - 16}L${x + 16} ${cy}Z" fill="${floor}"/></g><text x="${cx}" y="${cy}" font-size="34" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${GM_INK}">T</text>`;
    case 'growth': {
      // A clump of caps, large and small, with spores about them and a tendril or two running out.
      const [ix, iy] = [Math.round(f.x), Math.round(f.y)];
      const caps = Math.max(3, Math.round(f.w * f.h * 2.6));
      let out = '';
      let dots = '';
      for (let i = 0; i < caps; i++) {
        const [px, py] = [x + (0.2 + noise(ix * 7 + i, iy, seed + 21) * 0.6) * w, y + (0.2 + noise(ix, iy * 7 + i, seed + 22) * 0.6) * h];
        const rad = Math.round((9 + noise(ix + i, iy + i, seed + 23) * 15) * Math.min(1.7, Math.sqrt(f.w)));
        out += `<circle cx="${Math.round(px)}" cy="${Math.round(py)}" r="${rad}" fill="${floor}" ${pen} stroke-width="4.5"/><circle cx="${Math.round(px)}" cy="${Math.round(py)}" r="${Math.max(2, Math.round(rad * 0.3))}" fill="${INK}"/>`;
        dots += `M${Math.round(px + rad + 6)} ${Math.round(py - rad * 0.4)}h1M${Math.round(px - rad - 5)} ${Math.round(py + rad * 0.6)}h1`;
      }
      const t = (k: number) => `M${cx} ${cy}q${Math.round((noise(ix, iy + k, seed + 24) - 0.5) * w)} ${Math.round((noise(ix + k, iy, seed + 25) - 0.5) * h)} ${Math.round((noise(ix + k, iy + k, seed + 26) - 0.5) * w * 0.9)} ${Math.round((noise(ix - k, iy, seed + 27) - 0.5) * h * 0.9)}`;
      return `<path d="${t(1)}${t(2)}" fill="none" ${pen} stroke-width="3" opacity="0.8"/>${out}<path d="${dots}" ${pen} stroke-width="5"/>`;
    }
    case 'bridge': {
      // Planks across, between two ropes: the way over a rift.
      const along = dir % 2 === 1;
      const [bx, by, bw, bh] = along ? [x - 18, y + Math.round(h * 0.2), w + 36, Math.round(h * 0.6)] : [x + Math.round(w * 0.2), y - 18, Math.round(w * 0.6), h + 36];
      let planks = '';
      const n = 5;
      for (let i = 1; i < n; i++) planks += along ? `M${bx + Math.round((bw * i) / n)} ${by}v${bh}` : `M${bx} ${by + Math.round((bh * i) / n)}h${bw}`;
      const ropes = along ? `M${bx} ${by}h${bw}M${bx} ${by + bh}h${bw}` : `M${bx} ${by}v${bh}M${bx + bw} ${by}v${bh}`;
      return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${floor}"/><path d="${planks}" ${pen} stroke-width="3"/><path d="${ropes}" ${pen} stroke-width="7"/>`;
    }
    case 'mast':
      // The mast, and its yard lying across the deck.
      return `<path d="M${cx} ${cy - 150}V${cy + 150}" ${pen} stroke-width="9" opacity="0.85"/><circle cx="${cx}" cy="${cy}" r="${Math.round(w * 0.46)}" fill="${floor}" ${pen} stroke-width="8"/><circle cx="${cx}" cy="${cy}" r="${Math.round(w * 0.2)}" fill="${INK}"/>`;
    case 'helm': {
      // A wheel: its rim, its hub and its spokes, run out a little past the rim.
      const rad = Math.round(w * 0.36);
      let spokes = '';
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        const [ux, uy] = [Math.cos(a) * (rad + 9), Math.sin(a) * (rad + 9)];
        spokes += `M${Math.round(cx - ux)} ${Math.round(cy - uy)}L${Math.round(cx + ux)} ${Math.round(cy + uy)}`;
      }
      return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${floor}" ${line}/><path d="${spokes}" ${pen} stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="7" fill="${INK}"/>`;
    }
    case 'ballista': {
      // A stock along the way it points, and its bow across the front of it.
      const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
      const [fx, fy] = [cx + dx * w * 0.3, cy + dy * h * 0.3];
      const [sx, sy] = [-dy * w * 0.42, dx * h * 0.42];
      return `<path d="M${Math.round(cx - dx * w * 0.38)} ${Math.round(cy - dy * h * 0.38)}L${Math.round(cx + dx * w * 0.42)} ${Math.round(cy + dy * h * 0.42)}" ${pen} stroke-width="11"/><path d="M${Math.round(fx - sx)} ${Math.round(fy - sy)}Q${Math.round(fx + dx * w * 0.22)} ${Math.round(fy + dy * h * 0.22)} ${Math.round(fx + sx)} ${Math.round(fy + sy)}" fill="none" ${pen} stroke-width="7"/><path d="M${Math.round(fx - sx)} ${Math.round(fy - sy)}L${Math.round(cx - dx * w * 0.2)} ${Math.round(cy - dy * h * 0.2)}L${Math.round(fx + sx)} ${Math.round(fy + sy)}" fill="none" ${pen} stroke-width="2.5"/>`;
    }
    default:
      return '';
  }
}
