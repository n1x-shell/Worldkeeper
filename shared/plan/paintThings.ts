/**
 * The painted style's furnishings and dressing (v0.9.29). What stands in a room is drawn as the thing it is: timber
 * with its grain, stone with light on it, cloth, iron, water and fire, each with its shadow on the floor. And a place is
 * dressed: torches on its walls with the light they throw, rugs, cracks and damp in the floor, cobwebs in the corners.
 *
 * Dressing is drawing only. It comes from the plan, the same every time, and is no part of it: nothing here can be in
 * anyone's way, and none of it is in the key.
 */
import { edgeKey, noise, type Feature, type GridPlan } from './model.js';
import { U, feature as inkFeature } from './draw.js';

const R = Math.round;
const EDGE = '#20170f';
const IRON = '#3a3a3d';
const GOLD = '#d8b24a';

/** What things are painted with: timber and stone as the drawing has them, asked for only when they are used. */
export interface Brush {
  wood: () => string;
  seed: number;
}
/** A thing as it is painted: its shadow (a plain shape), itself, and any light it gives. */
export interface Painted {
  shade: string;
  body: string;
  glow: string;
}

/** The light on things, their shadows, water, fire and the glow of a flame: made once for a drawing. */
export const THING_DEFS =
  `<linearGradient id="t-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.32"/></linearGradient>` +
  `<radialGradient id="t-ball" cx="0.34" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient>` +
  `<radialGradient id="t-glow"><stop offset="0" stop-color="#ffc56b" stop-opacity="0.6"/><stop offset="0.35" stop-color="#ffab45" stop-opacity="0.3"/><stop offset="0.7" stop-color="#ff9a3a" stop-opacity="0.1"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="t-fire"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.45" stop-color="#ffb23e"/><stop offset="1" stop-color="#c2410c"/></radialGradient>` +
  `<radialGradient id="t-water"><stop offset="0" stop-color="#21495c"/><stop offset="0.7" stop-color="#3a7388"/><stop offset="1" stop-color="#6aa3ad"/></radialGradient>` +
  `<radialGradient id="t-spore"><stop offset="0" stop-color="#c8f29a" stop-opacity="0.5"/><stop offset="1" stop-color="#c8f29a" stop-opacity="0"/></radialGradient>` +
  `<filter id="p-shade" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>`;

const rr = (x: number, y: number, w: number, h: number, rx = 0) => `rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}"${rx ? ` rx="${rx}"` : ''}`;
const cc = (cx: number, cy: number, r: number) => `circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}"`;
/** A shape in a material with its grain, tinted, edged, and lit from the north-west. */
const tex = (shape: string, fill: string, tint: string, k: number, sw = 4, light = 't-sheen') =>
  `<${shape} fill="${fill}"/><${shape} fill="${tint}" fill-opacity="${k}" stroke="${EDGE}" stroke-width="${sw}" stroke-linejoin="round"/><${shape} fill="url(#${light})"/>`;
/** A shape of dressed stone. */
const stone = (shape: string, colour: string, light = 't-sheen') => `<${shape} fill="${colour}" stroke="${EDGE}" stroke-width="4" stroke-linejoin="round"/><${shape} fill="url(#${light})"/>`;

const glowAt = (cx: number, cy: number, r: number, opacity: number, id = 't-glow') => `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="url(#${id})" opacity="${opacity}"/>`;

const BLANKETS = ['#7c2f2f', '#2f4f6b', '#3f5f3a', '#6b4f7a', '#8a6a2f', '#4f4a44'];
const BOOKS = ['#7c2f2f', '#2f4f6b', '#3f5f3a', '#8a6a2f', '#4a3a5c', '#6e5a42', '#27433f', '#8c4a2a'];

/** One thing standing in a room, painted. */
export function paintThing(f: Feature, b: Brush): Painted {
  const [x, y, w, h] = [f.x * U, f.y * U, f.w * U, f.h * U];
  const [cx, cy] = [x + w / 2, y + h / 2];
  const dir = f.dir ?? 0;
  const seed = b.seed;
  const [ix, iy] = [R(f.x * 4), R(f.y * 4)];
  // Things with a head and a foot are drawn facing south, their backs to the north, and turned to the way they face.
  const [lw, lh] = dir % 2 ? [h, w] : [w, h];
  const [lx, ly] = [cx - lw / 2, cy - lh / 2];
  const turned = (s: string) => `<g transform="rotate(${((dir + 2) % 4) * 90} ${R(cx)} ${R(cy)})">${s}</g>`;
  const box = `<${rr(x + 3, y + 3, w - 6, h - 6, 8)}/>`;
  const none: Painted = { shade: '', body: '', glow: '' };

  switch (f.kind) {
    case 'stairs': {
      // Treads of stone, each narrower and lighter than the one below: the narrow end is the top.
      const steps = Math.max(4, R(lh / 24));
      let s = `<${rr(lx + 5, ly, lw - 10, lh, 4)} fill="#17130f" opacity="0.5"/>`;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const half = (lw * (0.9 - 0.42 * t)) / 2;
        const g = 118 + R(t * 84);
        s += `<${rr(cx - half, ly + t * lh + 1, half * 2, lh / steps - 3, 2)} fill="rgb(${g},${g - 6},${g - 16})" stroke="${EDGE}" stroke-width="2"/>`;
      }
      return { ...none, body: turned(s) };
    }
    case 'pillar': {
      const r = w / 2;
      return { shade: `<${cc(cx, cy, r + 3)}/>`, body: stone(cc(cx, cy, r), '#a59e92', 't-ball') + `<${cc(cx, cy, r * 0.58)} fill="#c9c2b5" opacity="0.55"/>`, glow: '' };
    }
    case 'statue': {
      let star = '';
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 0.1 : 0.22) * w;
        const a = (Math.PI * i) / 5 - Math.PI / 2;
        star += `${i ? 'L' : 'M'}${R(cx + Math.cos(a) * r)} ${R(cy + Math.sin(a) * r)}`;
      }
      const body = stone(rr(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84, 7), '#8d877c') + stone(cc(cx, cy, w * 0.31), '#cbc4b6', 't-ball') + `<path d="${star}Z" fill="#3b362f" opacity="0.6"/>`;
      return { shade: `<${cc(cx, cy, w * 0.46)}/>`, body, glow: '' };
    }
    case 'altar': {
      const wide = w >= h;
      const cloth = wide ? rr(cx - w * 0.15, y - 2, w * 0.3, h + 4) : rr(x - 2, cy - h * 0.15, w + 4, h * 0.3);
      const trim = wide
        ? `M${R(cx - w * 0.15 + 7)} ${R(y)}V${R(y + h)}M${R(cx + w * 0.15 - 7)} ${R(y)}V${R(y + h)}`
        : `M${R(x)} ${R(cy - h * 0.15 + 7)}H${R(x + w)}M${R(x)} ${R(cy + h * 0.15 - 7)}H${R(x + w)}`;
      const lights: [number, number][] = wide
        ? [
            [x + 20, cy],
            [x + w - 20, cy],
          ]
        : [
            [cx, y + 20],
            [cx, y + h - 20],
          ];
      const candles = lights.map(([px, py]) => `<${cc(px, py, 8)} fill="#f4ead0" stroke="${EDGE}" stroke-width="2"/><${cc(px, py, 3.5)} fill="#ffd36b"/>`).join('');
      const body =
        stone(rr(x, y, w, h, 4), '#b3ac9f') +
        `<${rr(x + 11, y + 11, w - 22, h - 22, 3)} fill="#cdc6b8" stroke="#7d766a" stroke-width="3"/><${cloth} fill="#7d1f24" stroke="${EDGE}" stroke-width="3"/><path d="${trim}" stroke="${GOLD}" stroke-width="3" fill="none"/>${candles}`;
      return { shade: box, body, glow: lights.map(([px, py]) => glowAt(px, py, 120, 0.7)).join('') };
    }
    case 'tomb': {
      const ridge = w >= h ? `M${R(x + 26)} ${R(cy)}H${R(x + w - 26)}` : `M${R(cx)} ${R(y + 26)}V${R(y + h - 26)}`;
      return {
        shade: box,
        body:
          stone(rr(x, y, w, h, 12), '#a39c8f') +
          `<${rr(x + 13, y + 13, w - 26, h - 26, 8)} fill="#c2bbad" stroke="#6f695e" stroke-width="3"/><path d="${ridge}" stroke="#6f695e" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`,
        glow: '',
      };
    }
    case 'throne': {
      const s =
        tex(rr(lx + 9, ly + 12, lw - 18, lh - 20, 6), b.wood(), '#6b4420', 0.55) +
        `<${rr(lx + 21, ly + 30, lw - 42, lh - 48, 8)} fill="#8c2a2e" stroke="#4d1418" stroke-width="3"/>` +
        `<${rr(lx + 3, ly + 2, lw - 6, 22, 7)} fill="#5a3a1a" stroke="${EDGE}" stroke-width="4"/>` +
        `<${cc(lx + 12, ly + 13, 7)} fill="${GOLD}" stroke="${EDGE}" stroke-width="2"/><${cc(lx + lw - 12, ly + 13, 7)} fill="${GOLD}" stroke="${EDGE}" stroke-width="2"/>`;
      return { shade: box, body: turned(s), glow: '' };
    }
    case 'pool': {
      const [rx, ry] = [w / 2, h / 2];
      const rows = Math.max(2, R(h / 55));
      let ripples = '';
      for (let i = 0; i < rows; i++) {
        const yy = R(cy + (i - (rows - 1) / 2) * 34);
        const half = R(rx * (0.3 + noise(i, R(x), seed) * 0.22));
        const off = R((noise(i, R(y), seed + 9) - 0.5) * rx * 0.5);
        ripples += `M${R(cx) + off - half} ${yy}q${R(half / 2)} -10 ${half} 0t${half} 0`;
      }
      const body =
        `<ellipse cx="${R(cx)}" cy="${R(cy)}" rx="${R(rx)}" ry="${R(ry)}" fill="#8d877b" stroke="${EDGE}" stroke-width="4"/>` +
        `<ellipse cx="${R(cx)}" cy="${R(cy)}" rx="${R(rx - 11)}" ry="${R(ry - 11)}" fill="url(#t-water)" stroke="#2b3a40" stroke-width="3"/>` +
        `<path d="${ripples}" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.42"/>`;
      return { ...none, body };
    }
    case 'well': {
      const r = w / 2;
      const body =
        stone(cc(cx, cy, r), '#9c9588', 't-ball') +
        `<${cc(cx, cy, r * 0.56)} fill="#0e1920" stroke="#3a352e" stroke-width="3"/><path d="M${R(cx - r * 0.3)} ${R(cy - r * 0.18)}q${R(r * 0.2)} ${R(-r * 0.2)} ${R(r * 0.42)} ${R(-r * 0.12)}" stroke="#9fc4d2" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.55"/>`;
      return { shade: `<${cc(cx, cy, r + 3)}/>`, body, glow: '' };
    }
    case 'rubble': {
      let shade = '';
      let body = '';
      for (let i = 0; i < 7; i++) {
        const [px, py] = [x + (0.16 + noise(i, ix + iy, seed) * 0.68) * w, y + (0.16 + noise(i, ix - iy, seed + 11) * 0.68) * h];
        const r = 7 + noise(i, ix * 3 + iy, seed + 12) * 13;
        const d = `M${R(px - r)} ${R(py)}q${R(r * 0.2)} ${R(-r * 1.1)} ${R(r)} ${R(-r * 0.8)}t${R(r)} ${R(r * 0.8)}q${R(-r * 0.3)} ${R(r)} ${R(-r)} ${R(r * 0.8)}t${R(-r)} ${R(-r * 0.8)}Z`;
        const g = 120 + R(noise(i, ix, seed + 13) * 60);
        shade += `<path d="${d}"/>`;
        body += `<path d="${d}" fill="rgb(${g},${g - 5},${g - 14})" stroke="${EDGE}" stroke-width="3" stroke-linejoin="round"/><path d="${d}" fill="url(#t-ball)"/>`;
      }
      return { shade, body, glow: '' };
    }
    case 'chest': {
      const wide = w >= h;
      const bands = wide
        ? `<${rr(x + w * 0.16, y, 9, h)} fill="${IRON}"/><${rr(x + w * 0.84 - 9, y, 9, h)} fill="${IRON}"/>`
        : `<${rr(x, y + h * 0.16, w, 9)} fill="${IRON}"/><${rr(x, y + h * 0.84 - 9, w, 9)} fill="${IRON}"/>`;
      const lid = wide ? `M${R(x)} ${R(y + h * 0.36)}H${R(x + w)}` : `M${R(x + w * 0.36)} ${R(y)}V${R(y + h)}`;
      const [kx, ky] = wide ? [cx, y + h * 0.36] : [x + w * 0.36, cy];
      return {
        shade: box,
        body: tex(rr(x, y, w, h, 5), b.wood(), '#b07a3a', 0.45) + bands + `<path d="${lid}" stroke="${EDGE}" stroke-width="3"/><${cc(kx, ky, 6)} fill="${GOLD}" stroke="${EDGE}" stroke-width="2"/>`,
        glow: '',
      };
    }
    case 'hearth': {
      // Against the wall behind it, canonically the north: a block of stone, the fire in its hollow, its light in the room.
      const d = U * 0.34;
      const [hx, hy, hw] = [lx + 6, ly, lw - 12];
      let bricks = '';
      for (let i = 1; i < 4; i++) bricks += `M${R(hx + (hw * i) / 4)} ${R(hy)}v${R(d * 0.45)}`;
      const s =
        stone(rr(hx, hy, hw, d, 3), '#6f685e') +
        `<path d="${bricks}M${R(hx)} ${R(hy + d * 0.45)}h${R(hw)}" stroke="#3b362f" stroke-width="2.5" fill="none" opacity="0.7"/>` +
        `<path d="M${R(cx - 26)} ${R(hy + d)}a26 24 0 0 1 52 0Z" fill="#17110c"/><path d="M${R(cx - 19)} ${R(hy + d)}a19 17 0 0 1 38 0Z" fill="url(#t-fire)"/>`;
      // The fire's own place on the sheet, and the way it faces.
      const [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][dir];
      const [fx, fy] = [cx - dx * (lh / 2 - d), cy - dy * (lh / 2 - d)];
      return { shade: '', body: turned(s), glow: glowAt(fx + dx * 60, fy + dy * 60, 290, 1) };
    }
    case 'table': {
      const round = Math.abs(w - h) < 10;
      let stools = '';
      const stool = (sx: number, sy: number) => {
        stools += tex(cc(sx, sy, 13), b.wood(), '#8a5f33', 0.5, 3, 't-ball');
      };
      let top: string;
      let shade: string;
      if (round) {
        const r = w / 2 - 9;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          stool(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2));
        }
        top = tex(cc(cx, cy, r), b.wood(), '#c9954f', 0.42);
        shade = `<${cc(cx, cy, r + 2)}/>`;
      } else {
        const wide = w >= h;
        const n = Math.max(1, R((wide ? w : h) / 70));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          if (wide) {
            stool(x + 14 + t * (w - 28), y + 9);
            stool(x + 14 + t * (w - 28), y + h - 9);
          } else {
            stool(x + 9, y + 14 + t * (h - 28));
            stool(x + w - 9, y + 14 + t * (h - 28));
          }
        }
        top = tex(rr(x + (wide ? 4 : 16), y + (wide ? 16 : 4), w - (wide ? 8 : 32), h - (wide ? 32 : 8), 6), b.wood(), '#c9954f', 0.42);
        shade = `<${rr(x + 6, y + 6, w - 12, h - 12, 8)}/>`;
      }
      // What is left on it: a plate, a mug, a candle.
      let things = '';
      const count = 1 + R(noise(ix, iy, seed + 31) * 2);
      for (let i = 0; i < count; i++) {
        const [px, py] = [cx + (noise(ix + i, iy, seed + 32) - 0.5) * (w - 62) * 0.8, cy + (noise(ix, iy + i, seed + 33) - 0.5) * (h - 62) * 0.8];
        const k = noise(ix + i, iy + i, seed + 34);
        things +=
          k < 0.45
            ? `<${cc(px, py, 9)} fill="#e6dfcd" stroke="#6f6657" stroke-width="2"/><${cc(px, py, 5)} fill="none" stroke="#b7ae9b" stroke-width="1.5"/>`
            : k < 0.8
              ? `<${cc(px, py, 6)} fill="#5c4a36" stroke="${EDGE}" stroke-width="2"/>`
              : `<${cc(px, py, 5)} fill="#f4ead0" stroke="${EDGE}" stroke-width="1.5"/><${cc(px, py, 2.4)} fill="#ffd36b"/>`;
      }
      return { shade, body: stools + top + things, glow: '' };
    }
    case 'bed': {
      const blanket = BLANKETS[Math.floor(noise(ix, iy, seed + 41) * BLANKETS.length)];
      const top = ly + lh * 0.4;
      const s =
        tex(rr(lx + 6, ly + 3, lw - 12, lh - 6, 6), b.wood(), '#8a5f33', 0.5) +
        `<${rr(lx + 12, ly + 10, lw - 24, lh - 20, 6)} fill="#e6dfcc" stroke="#8d8674" stroke-width="2"/>` +
        `<${rr(lx + 19, ly + 15, lw - 38, 27, 10)} fill="#fbf8ee" stroke="#9c9583" stroke-width="2"/>` +
        `<${rr(lx + 12, top, lw - 24, ly + lh - 10 - top, 6)} fill="${blanket}" stroke="${EDGE}" stroke-width="2.5"/>` +
        `<${rr(lx + 12, top, lw - 24, 11, 4)} fill="#ffffff" opacity="0.32"/>` +
        `<${rr(lx + 12, top, lw - 24, ly + lh - 10 - top, 6)} fill="url(#t-sheen)"/>`;
      return { shade: box, body: turned(s), glow: '' };
    }
    case 'counter': {
      const wide = w >= h;
      let things = '';
      const n = Math.max(1, R((wide ? w : h) / 120));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.3 + noise(ix + i, iy, seed + 45) * 0.4) / n;
        const [px, py] = wide ? [x + t * w, cy] : [cx, y + t * h];
        things += noise(ix, iy + i, seed + 46) < 0.5 ? `<${cc(px, py, 6)} fill="#3f5f3a" stroke="${EDGE}" stroke-width="2"/>` : `<${cc(px, py, 7)} fill="#5c4a36" stroke="${EDGE}" stroke-width="2"/>`;
      }
      return { shade: box, body: tex(rr(x, y, w, h, 3), b.wood(), '#b9853f', 0.42) + things, glow: '' };
    }
    case 'shelf': {
      const wide = w > h;
      const [len, deep] = wide ? [w, h] : [h, w];
      let books = '';
      const n = Math.floor((len - 14) / 12);
      for (let i = 0; i < n; i++) {
        if (noise(ix + i, iy, seed + 51) < 0.1) continue;
        const c = BOOKS[Math.floor(noise(ix, iy + i, seed + 52) * BOOKS.length)];
        const d = deep - 12 - noise(i, ix + iy, seed + 53) * 6;
        books += wide ? `<${rr(x + 8 + i * 12, y + 6, 10, d)} fill="${c}"/>` : `<${rr(x + 6, y + 8 + i * 12, d, 10)} fill="${c}"/>`;
      }
      return { shade: box, body: tex(rr(x, y, w, h, 2), b.wood(), '#5a3d22', 0.5) + `<g stroke="${EDGE}" stroke-width="1.2">${books}</g>`, glow: '' };
    }
    case 'barrel': {
      const spots = [
        [0.3, 0.3],
        [0.7, 0.42],
        [0.38, 0.72],
      ];
      const n = 2 + (noise(R(x), R(y), seed) > 0.5 ? 1 : 0);
      let shade = '';
      let body = '';
      for (let i = 0; i < n; i++) {
        const [bx, by] = [x + spots[i][0] * w, y + spots[i][1] * h];
        shade += `<${cc(bx, by, 21)}/>`;
        body +=
          tex(cc(bx, by, 20), b.wood(), '#a8743a', 0.45, 4, 't-ball') +
          `<${cc(bx, by, 13)} fill="none" stroke="#3b2a18" stroke-width="2.5"/><${cc(bx, by, 19)} fill="none" stroke="${IRON}" stroke-width="2.5"/><path d="M${R(bx - 12)} ${R(by - 4)}h24M${R(bx - 12)} ${R(by + 5)}h24" stroke="#3b2a18" stroke-width="1.5" opacity="0.6"/>`;
      }
      return { shade, body, glow: '' };
    }
    case 'pew': {
      const back = w >= h ? rr(x, y, w, 8, 3) : rr(x, y, 8, h, 3);
      return { shade: box, body: tex(rr(x, y, w, h, 4), b.wood(), '#a8743a', 0.4) + `<${back} fill="#4a3018" opacity="0.75"/>`, glow: '' };
    }
    case 'anvil': {
      const r = Math.min(w, h) * 0.5;
      const [ax, ay, aw, ah] = [cx - w * 0.36, cy - h * 0.26, w * 0.72, h * 0.52];
      const d = `M${R(ax)} ${R(ay)}H${R(ax + aw)}L${R(ax + aw * 0.78)} ${R(ay + ah)}H${R(ax + aw * 0.22)}Z`;
      return {
        shade: `<${cc(cx, cy, r + 2)}/>`,
        body:
          tex(cc(cx, cy, r), b.wood(), '#6b4420', 0.5, 4, 't-ball') +
          `<path d="${d}" fill="#3d3f44" stroke="${EDGE}" stroke-width="3" stroke-linejoin="round"/><path d="M${R(ax + 8)} ${R(ay + 6)}H${R(ax + aw - 10)}" stroke="#9a9ea6" stroke-width="3" stroke-linecap="round"/>`,
        glow: '',
      };
    }
    case 'stall': {
      const [dx, dy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][dir];
      const d = dx ? `M${R(dx > 0 ? x : x + w)} ${R(y)}h${dx * R(w * 0.85)}` : `M${R(x)} ${R(dy > 0 ? y : y + h)}v${dy * R(h * 0.85)}`;
      return {
        shade: `<path d="${d}" stroke="#000000" stroke-width="12" stroke-linecap="round"/>`,
        body: `<path d="${d}" stroke="${EDGE}" stroke-width="13" stroke-linecap="round"/><path d="${d}" stroke="#9a7446" stroke-width="7" stroke-linecap="round"/>`,
        glow: '',
      };
    }
    case 'growth': {
      // Caps large and small, pale and faintly alight, with a tendril or two running out.
      const [gx, gy] = [R(f.x), R(f.y)];
      const caps = Math.max(3, R(f.w * f.h * 2.6));
      let body = '';
      for (let i = 0; i < caps; i++) {
        const [px, py] = [x + (0.2 + noise(gx * 7 + i, gy, seed + 21) * 0.6) * w, y + (0.2 + noise(gx, gy * 7 + i, seed + 22) * 0.6) * h];
        const rad = (9 + noise(gx + i, gy + i, seed + 23) * 15) * Math.min(1.7, Math.sqrt(f.w));
        const c = noise(gx + i, gy - i, seed + 28) < 0.3 ? '#c9a8d6' : '#b9d48a';
        body += `<${cc(px, py, rad)} fill="${c}" stroke="#2f3a1c" stroke-width="3"/><${cc(px, py, rad)} fill="url(#t-ball)"/><${cc(px, py, Math.max(2, rad * 0.28))} fill="#3f4a25" opacity="0.8"/>`;
      }
      const t = (k: number) =>
        `M${R(cx)} ${R(cy)}q${R((noise(gx, gy + k, seed + 24) - 0.5) * w)} ${R((noise(gx + k, gy, seed + 25) - 0.5) * h)} ${R((noise(gx + k, gy + k, seed + 26) - 0.5) * w * 0.9)} ${R((noise(gx - k, gy, seed + 27) - 0.5) * h * 0.9)}`;
      return {
        shade: '',
        body: `<path d="${t(1)}${t(2)}" fill="none" stroke="#4f6a2f" stroke-width="4" stroke-linecap="round" opacity="0.85"/>${body}`,
        glow: glowAt(cx, cy, Math.max(w, h) * 0.95, 0.9, 't-spore'),
      };
    }
    case 'bridge': {
      const along = dir % 2 === 1;
      const [bx, by, bw, bh] = along ? [x - 18, y + h * 0.2, w + 36, h * 0.6] : [x + w * 0.2, y - 18, w * 0.6, h + 36];
      let planks = '';
      const n = 6;
      for (let i = 1; i < n; i++) planks += along ? `M${R(bx + (bw * i) / n)} ${R(by)}v${R(bh)}` : `M${R(bx)} ${R(by + (bh * i) / n)}h${R(bw)}`;
      const ropes = along ? `M${R(bx)} ${R(by)}h${R(bw)}M${R(bx)} ${R(by + bh)}h${R(bw)}` : `M${R(bx)} ${R(by)}v${R(bh)}M${R(bx + bw)} ${R(by)}v${R(bh)}`;
      return {
        shade: `<${rr(bx, by, bw, bh)}/>`,
        body:
          tex(rr(bx, by, bw, bh), b.wood(), '#a8743a', 0.4, 0) +
          `<path d="${planks}" stroke="${EDGE}" stroke-width="2.5" opacity="0.7"/><path d="${ropes}" stroke="#3b2a18" stroke-width="7" stroke-linecap="round"/>`,
        glow: '',
      };
    }
    case 'trap':
      return { ...none, body: inkFeature(f, '#f3ead6', seed) };
    default:
      // The parts of a ship: the app's own drawing of them, in timber.
      return { shade: f.kind === 'mast' ? `<${cc(cx, cy, w * 0.48)}/>` : '', body: inkFeature(f, '#b9925e', seed), glow: '' };
  }
}

const RUGS: [string, string, string][] = [
  ['#7a2a2c', '#d1b06a', '#3d1517'],
  ['#2c4a66', '#cfc3a2', '#16283a'],
  ['#3f5a3a', '#d8c99a', '#1f2f1d'],
  ['#6a4a2c', '#e0cfa6', '#35240f'],
];

/** How a place is dressed: what lies on its floors, what hangs on its walls, and the light of its torches. */
export function dress(plan: GridPlan, seed: number): { under: string; over: string; glow: string } {
  const { w, h, cells } = plan;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[y * w + x]);
  const taken = new Set<number>();
  for (const f of plan.features) for (let yy = Math.floor(f.y); yy < Math.ceil(f.y + f.h); yy++) for (let xx = Math.floor(f.x); xx < Math.ceil(f.x + f.w); xx++) taken.add(yy * w + xx);
  const doors = new Set(plan.openings.map(edgeKey));
  // The edge of a square on each side, as an opening is keyed.
  const edge = (x: number, y: number, d: number) => edgeKey(d === 0 ? { x, y, side: 'n' } : d === 2 ? { x, y: y + 1, side: 'n' } : d === 3 ? { x, y, side: 'w' } : { x: x + 1, y, side: 'w' });
  const N = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const cave = plan.kind === 'cave';
  const lit = plan.kind === 'dungeon' || plan.kind === 'building';
  const land = plan.land ?? 'plain';
  let [cracks, damp, moss, stones, pools, bones, webs, torches, glow, rugs] = ['', '', '', '', '', '', '', '', '', ''];

  // Rugs, in the rooms of a house that are square enough for one: under whatever stands there.
  if (plan.kind === 'building') {
    for (const a of plan.areas) {
      if (/cellar|crypt|vault|under|dungeon/i.test(`${a.floor ?? ''} ${a.name}`) || /kitchen|store|stable|smithy|forge|privy|yard|workshop|cold/i.test(a.name)) continue;
      const id = at(Math.floor(a.x), Math.floor(a.y));
      if (!id || noise(id, a.n, seed + 78) > 0.6) continue;
      let [x0, y0, x1, y1] = [w, h, -1, -1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] === id) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      const [bw, bh] = [x1 - x0 + 1, y1 - y0 + 1];
      if (bw < 3 || bh < 3) continue;
      let whole = true;
      for (let y = y0; y <= y1 && whole; y++) for (let x = x0; x <= x1; x++) if (cells[y * w + x] !== id) whole = false;
      if (!whole) continue;
      const [rw, rh] = [Math.min(bw - 1.4, 4.6), Math.min(bh - 1.4, 3.6)];
      const [rx, ry] = [(x0 + bw / 2 - rw / 2) * U, (y0 + bh / 2 - rh / 2) * U];
      const [c, trim, dark] = RUGS[Math.floor(noise(id, 3, seed + 79) * RUGS.length)];
      const [pw, ph] = [rw * U, rh * U];
      rugs +=
        `<${rr(rx, ry, pw, ph, 5)} fill="${c}" stroke="${dark}" stroke-width="4"/>` +
        `<${rr(rx + 14, ry + 14, pw - 28, ph - 28, 3)} fill="none" stroke="${trim}" stroke-width="5"/>` +
        `<${rr(rx + 28, ry + 28, pw - 56, ph - 56, 2)} fill="${dark}" opacity="0.35"/>` +
        `<ellipse cx="${R(rx + pw / 2)}" cy="${R(ry + ph / 2)}" rx="${R(pw * 0.2)}" ry="${R(ph * 0.2)}" fill="none" stroke="${trim}" stroke-width="5" opacity="0.75"/>` +
        `<${rr(rx, ry, pw, ph, 5)} fill="url(#t-sheen)" opacity="0.6"/>`;
    }
  }

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const id = cells[y * w + x];
      if (!id) continue;
      const free = !taken.has(y * w + x);
      const [px, py] = [x * U, y * U];
      const solid = N.map(([dx, dy], d) => at(x + dx, y + dy) === 0 && !doors.has(edge(x, y, d)));
      const byWall = solid.some(Boolean);
      const j = (k: number) => noise(x, y, seed + k);
      if (plan.kind === 'ship') continue;

      // Wear in the floor: cracks in flagstones, damp and moss where the walls are, stones and puddles in a cave.
      if (plan.kind === 'dungeon' && j(72) < 0.07) {
        let [qx, qy] = [px + 15 + j(81) * 70, py + 15 + j(82) * 70];
        let d = `M${R(qx)} ${R(qy)}`;
        for (let i = 0; i < 4; i++) {
          [qx, qy] = [qx + (noise(x + i, y, seed + 83) - 0.5) * 60, qy + (noise(x, y + i, seed + 84) - 0.3) * 44];
          d += `L${R(qx)} ${R(qy)}`;
        }
        cracks += d;
      }
      if (plan.kind !== 'building' && j(73) < (byWall ? 0.16 : 0.04)) {
        const blot = `<ellipse cx="${R(px + 20 + j(85) * 60)}" cy="${R(py + 20 + j(86) * 60)}" rx="${R(26 + j(87) * 34)}" ry="${R(18 + j(88) * 24)}" transform="rotate(${R(j(89) * 180)} ${px + 50} ${py + 50})"/>`;
        if (byWall && (land === 'overgrown' || j(90) < 0.6)) moss += blot;
        else damp += blot;
      }
      if (cave && j(74) < 0.16)
        for (let i = 0; i < 3; i++) {
          const g = 96 + R(noise(x + i, y - i, seed + 91) * 50);
          stones += `<${cc(px + 10 + noise(x + i, y, seed + 92) * 80, py + 10 + noise(x, y + i, seed + 93) * 80, 3 + noise(x + i, y + i, seed + 94) * 5)} fill="rgb(${g},${g - 6},${g - 16})"/>`;
        }
      if (cave && free && j(75) < 0.035)
        pools += `<ellipse cx="${R(px + 50)}" cy="${R(py + 50)}" rx="${R(30 + j(95) * 16)}" ry="${R(20 + j(96) * 12)}" transform="rotate(${R(j(97) * 180)} ${px + 50} ${py + 50})"/>`;
      if (plan.kind !== 'building' && free && j(77) < 0.014) {
        const [bx, by, a] = [px + 30 + j(98) * 40, py + 30 + j(99) * 40, R(j(100) * 180)];
        bones += `<g transform="rotate(${a} ${R(bx)} ${R(by)})"><path d="M${R(bx - 13)} ${R(by)}h26M${R(bx - 8)} ${R(by + 8)}l18 -5"/><${cc(bx + 4, by - 9, 5.5)} fill="#e4dcc6" stroke-width="1.5"/></g>`;
      }
      // Cobwebs where two walls meet, in a place nobody keeps.
      if (plan.kind === 'dungeon' && j(76) < 0.3)
        for (let d = 0; d < 4; d++) {
          if (!solid[d] || !solid[(d + 1) % 4] || noise(x + d, y, seed + 101) > 0.5) continue;
          const [ox, oy] = [px + (d === 0 || d === 1 ? U - 9 : 9), py + (d === 1 || d === 2 ? U - 9 : 9)];
          const [sx, sy] = [d === 0 || d === 1 ? -1 : 1, d === 1 || d === 2 ? -1 : 1];
          webs += `M${ox} ${oy}l${sx * 44} 0M${ox} ${oy}l0 ${sy * 44}M${ox} ${oy}l${sx * 31} ${sy * 31}M${ox + sx * 20} ${oy}q${sx * 3} ${sy * 12} ${-sx * 20} ${sy * 20}M${ox + sx * 36} ${oy}q${sx * 4} ${sy * 22} ${-sx * 36} ${sy * 36}`;
          break;
        }
      // Torches in their brackets: spaced along the walls, never behind what stands against one.
      if (lit && free && (x + 2 * y) % 5 === 0 && j(71) < 0.55) {
        const d = solid.findIndex(Boolean);
        if (d >= 0) {
          const [dx, dy] = N[d];
          const [tx, ty] = [px + 50 + dx * 38, py + 50 + dy * 38];
          torches += `<${cc(tx, ty, 9)} fill="#2a2420" stroke="${EDGE}" stroke-width="2.5"/><${cc(tx, ty, 5.5)} fill="url(#t-fire)"/>`;
          glow += glowAt(px + 50 + dx * 8, py + 50 + dy * 8, 215, 1);
        }
      }
    }

  const under =
    rugs +
    (damp ? `<g fill="#120c07" opacity="0.2">${damp}</g>` : '') +
    (moss ? `<g fill="#3d5a24" opacity="0.3">${moss}</g>` : '') +
    (pools ? `<g fill="#3a6f86" opacity="0.55" stroke="#1b3340" stroke-width="2.5">${pools}</g>` : '') +
    (cracks ? `<path d="${cracks}" fill="none" stroke="#15100b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.42"/>` : '') +
    stones +
    (bones ? `<g fill="none" stroke="#e4dcc6" stroke-width="4" stroke-linecap="round" opacity="0.85">${bones}</g>` : '');
  const over = torches + (webs ? `<path d="${webs}" fill="none" stroke="#f2efe6" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>` : '');
  return { under, over, glow };
}
