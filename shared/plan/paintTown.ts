/**
 * A settlement, painted (v0.9.29): grass and earth from photographs, roofs with a lit side and a shaded one, the
 * shadows of its houses, walls and trees, water with its shallows, and what a town has about it: stalls in the square,
 * boats at the piers, chimneys, bushes and stones. The plan is the same one ink draws.
 */
import { noise, type Pt, type TownPlan } from './model.js';
import { HAZE, INK, SEA, SKY, U, esc, keyMarks, legend, paints, type DrawOptions } from './draw.js';
import { NIGHT, clouds, mist, ragged, riftPath, stars } from './drawLand.js';
import { fromLine } from './land.js';
import { THING_DEFS } from './paintThings.js';

const P = (v: number) => Math.round(v * U);
const R = Math.round;
const line = (pts: Pt[], close = false) => `M${pts.map(([x, y]) => `${P(x)} ${P(y)}`).join('L')}${close ? 'Z' : ''}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const deg = (a: number) => R((a * 180) / Math.PI);

const ROOFS = ['#9a5a3c', '#7d6a54', '#a8763f', '#6f6156', '#8b4f38', '#a8905a'];
const SLATE = '#5f6f82';
const GREENS = ['#4f7b3e', '#456f3a', '#5c8444'];
const AWNINGS: [string, string][] = [
  ['#a33a36', '#efe6d2'],
  ['#2f5d7a', '#efe6d2'],
  ['#b98a2e', '#efe6d2'],
  ['#3f6a44', '#efe6d2'],
];

export function paintTown(plan: TownPlan, o: DrawOptions): string {
  const paint = paints(o);
  const land = plan.land ?? 'plain';
  const seed = (plan.w * 73856093) ^ (plan.h * 19349663) ^ (plan.buildings.length * 83492791);
  const night = land === 'void';
  const round = `stroke-linecap="round" stroke-linejoin="round"`;
  const dressed = o.dressing;
  // How big a thing ten feet across is, in squares.
  const ten = 10 / plan.feet;
  const [grass, dirt] = [paint.fill('grass'), paint.fill('dirt')];
  const isle = plan.island?.length ? plan.island : null;
  const beyond = land === 'void' ? NIGHT : land === 'aloft' ? SKY : land === 'adrift' ? HAZE : SEA;
  let defs = '';
  const out: string[] = ['', `<rect width="${plan.w * U}" height="${plan.h * U}" fill="${isle ? beyond : grass}"/>`];
  const shadow = (inner: string, dx = 9, dy = 12, opacity = 0.4) => `<g fill="#000000" stroke="none" opacity="${opacity}" filter="url(#p-shade)" transform="translate(${dx} ${dy})">${inner}</g>`;

  // The ground it stands on, where that ends: beyond it the stars, the clouds or the mist.
  if (isle) {
    const on = (x: number, y: number) => {
      let hit = false;
      for (let i = 0, j = isle.length - 1; i < isle.length; j = i++) {
        const [a, b] = [isle[i], isle[j]];
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
      }
      return hit;
    };
    const open = (x: number, y: number) => !on(x, y) && !on(x + 1, y) && !on(x, y + 1) && !on(x + 1, y + 1) && !on(x + 0.5, y + 0.5);
    out.push(land === 'void' ? stars(plan.w, plan.h, seed, open) : land === 'aloft' ? clouds(plan.w, plan.h, seed, open, INK, '#ffffff') : mist(plan.w, plan.h, seed, open));
    const edge = ragged(isle, seed, 0.12);
    // The rock under an island in the sky, seen past its southern edge.
    if (land === 'aloft') out.push(`<path d="${edge}" fill="#4a4036" stroke="${INK}" stroke-width="6" stroke-linejoin="round" transform="translate(0 ${P(0.45)})"/>`);
    out.push(`<path d="${edge}" fill="${grass}" stroke="${INK}" stroke-width="${night ? 0 : 7}" stroke-linejoin="round"/>`);
    defs += `<clipPath id="isle"><path d="${edge}"/></clipPath>`;
  }
  const onIsle = isle ? ' clip-path="url(#isle)"' : '';

  // What grows and lies about: bushes, stones, flowers. Drawn first, so that streets and houses lie over them.
  if (dressed) {
    let [bushes, rocks, flowers] = ['', '', ''];
    for (let y = 0; y < plan.h; y++)
      for (let x = 0; x < plan.w; x++) {
        const n = noise(x, y, seed + 51);
        const [px, py] = [(x + noise(x, y, seed + 52)) * U, (y + noise(x, y, seed + 53)) * U];
        if (n < 0.07)
          for (let i = 0; i < 3; i++)
            bushes += `<circle cx="${R(px + (noise(x + i, y, seed + 54) - 0.5) * 50)}" cy="${R(py + (noise(x, y + i, seed + 55) - 0.5) * 40)}" r="${R((14 + noise(x + i, y + i, seed + 56) * 12) * Math.max(0.7, ten))}"/>`;
        else if (n < 0.1)
          rocks += `<ellipse cx="${R(px)}" cy="${R(py)}" rx="${R(10 + noise(x, y, seed + 57) * 12)}" ry="${R(7 + noise(x, y, seed + 58) * 8)}" transform="rotate(${R(n * 3000) % 180} ${R(px)} ${R(py)})"/>`;
        else if (n < 0.2)
          for (let i = 0; i < 4; i++)
            flowers += `<circle cx="${R(px + (noise(x + i, y, seed + 59) - 0.5) * 70)}" cy="${R(py + (noise(x, y + i, seed + 60) - 0.5) * 70)}" r="3.2" fill="${['#f4efd9', '#e9cf5e', '#d9a3c4'][i % 3]}"/>`;
      }
    out.push(`<g${onIsle}><g opacity="0.75">${flowers}</g><g fill="#3d6630" stroke="#24401f" stroke-width="3">${bushes}</g><g fill="#8f897c" stroke="#3b362f" stroke-width="2.5">${rocks}</g></g>`);
  }

  // Fields: tilled earth under a crop, its furrows, and a hedge round it.
  plan.fields.forEach((f, i) => {
    const [p0, p1, p2, p3] = f.corners;
    const d = line(f.corners, true);
    const crop = ['#a8963f', '#6b8a3a', '#7a5a38', '#8c9a45'][Math.floor(noise(i, R(p0[0]), seed + 61) * 4)];
    let furrows = '';
    const along = Math.abs(Math.cos(f.angle - Math.atan2(p1[1] - p0[1], p1[0] - p0[0]))) > 0.7;
    const across = along ? dist(p0, p3) : dist(p0, p1);
    const n = Math.max(2, R(across / 0.55));
    for (let k = 1; k < n; k++) {
      const [a, b] = along ? [lerp(p0, p3, k / n), lerp(p1, p2, k / n)] : [lerp(p0, p1, k / n), lerp(p3, p2, k / n)];
      furrows += line([lerp(a, b, 0.03), lerp(a, b, 0.97)]);
    }
    out.push(
      `<path d="${d}" fill="${dirt}"/><path d="${d}" fill="${crop}" opacity="0.5"/><path d="${furrows}" fill="none" stroke="#2f2412" stroke-width="5" opacity="0.28" ${round}/><path d="${d}" fill="none" stroke="#24401f" stroke-width="13" ${round}/><path d="${d}" fill="none" stroke="#4a7436" stroke-width="7" stroke-dasharray="22 5" ${round}/>`,
    );
  });

  // The sea: sand at its edge, shallows, and the foam of the water coming in.
  plan.water.forEach((w, i) => {
    const shore = w.slice(0, -2);
    const [f0, f1] = [w[w.length - 2], w[w.length - 1]];
    const m = shore[shore.length >> 1];
    const far: Pt = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
    const d = dist(m, far) || 1;
    const to: Pt = [(far[0] - m[0]) / d, (far[1] - m[1]) / d];
    defs += `<clipPath id="sea${i}"><path d="${line(w, true)}"/></clipPath>`;
    out.push(`<path d="${line(shore)}" fill="none" stroke="#d6c38e" stroke-width="${P(0.9)}" ${round}/>`);
    out.push(`<path d="${line(w, true)}" fill="${SEA}"/>`);
    let lap = '';
    [0.45, 1.0, 1.7].forEach(
      (off, k) =>
        (lap += `<path d="${line(shore.map(([x, y]) => [x + to[0] * off, y + to[1] * off] as Pt))}" fill="none" stroke="#ffffff" stroke-width="${[4, 3, 2.4][k]}" stroke-dasharray="${['90 22', '46 34', '20 46'][k]}" ${round} opacity="${[0.5, 0.34, 0.22][k]}"/>`),
    );
    out.push(
      `<g clip-path="url(#sea${i})"><path d="${line(shore)}" fill="none" stroke="#7fc0c2" stroke-width="${P(2.6)}" ${round} opacity="0.5" filter="url(#p-soft)"/><path d="${line(shore)}" fill="none" stroke="#ffffff" stroke-width="12" ${round} opacity="0.75"/>${lap}</g>`,
    );
  });
  // A river between its banks, lighter where it runs fastest.
  for (const r of plan.rivers) {
    const d = line(r.points);
    const w = P(r.width);
    out.push(
      `<path d="${d}" fill="none" stroke="#5d4c30" stroke-width="${w + 24}" ${round}/><path d="${d}" fill="none" stroke="#47798f" stroke-width="${w}" ${round}/><path d="${d}" fill="none" stroke="#7fb4c2" stroke-width="${R(w * 0.45)}" ${round} opacity="0.35"/>`,
    );
    out.push(
      `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="70 46" ${round} opacity="0.3" transform="translate(0 ${R(w * 0.2)})"/><path d="${d}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="34 80" stroke-dashoffset="50" ${round} opacity="0.26" transform="translate(0 ${-R(w * 0.2)})"/>`,
    );
  }

  // The wall and its towers, and the shadow they throw. The streets are drawn over it, which opens the gates.
  if (plan.wall) {
    const w = plan.wall;
    const d = line(w.points, w.closed);
    out.push(`<path d="${d}" fill="none" stroke="#000000" stroke-width="${P(w.width) + 4}" stroke-linejoin="round" opacity="0.4" filter="url(#p-shade)" transform="translate(11 14)"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${P(w.width)}" stroke-linejoin="round" stroke-linecap="butt"/>`);
    out.push(`<path d="${d}" fill="none" stroke="#a8a093" stroke-width="${Math.max(3, P(w.width) - 16)}" stroke-linejoin="round" stroke-linecap="butt" stroke-dasharray="${P(w.width * 1.1)} 8"/>`);
    out.push(shadow(w.towers.map(([x, y]) => `<circle cx="${P(x)}" cy="${P(y)}" r="${P(w.width * 1.1)}"/>`).join(''), 11, 14));
    for (const [x, y] of w.towers)
      out.push(
        `<circle cx="${P(x)}" cy="${P(y)}" r="${P(w.width * 1.05)}" fill="#b3ab9e" stroke="${INK}" stroke-width="9"/><circle cx="${P(x)}" cy="${P(y)}" r="${P(w.width * 1.05)}" fill="url(#t-ball)"/><circle cx="${P(x)}" cy="${P(y)}" r="${P(w.width * 0.6)}" fill="none" stroke="#6f695e" stroke-width="4" opacity="0.7"/>`,
      );
  }

  // Streets of trodden earth, worn pale along the middle, and squares of cobbles.
  const roads = [...plan.roads].sort((a, b) => a.width - b.width);
  let [edges, surface, worn] = ['', '', ''];
  for (const r of roads) {
    edges += `<path d="${line(r.points)}" fill="none" stroke="#33281a" stroke-width="${P(r.width) + 10}" ${round}/>`;
    surface += `<path d="${line(r.points)}" fill="none" stroke="${dirt}" stroke-width="${P(r.width)}" ${round}/>`;
    worn += `<path d="${line(r.points)}" fill="none" stroke="#f1dcb2" stroke-width="${R(P(r.width) * 0.42)}" ${round}/>`;
  }
  for (const s of plan.squares) {
    edges += `<path d="${line(s, true)}" fill="#33281a" stroke="#33281a" stroke-width="10" ${round}/>`;
    surface += `<path d="${line(s, true)}" fill="${paint.fill('stone')}"/>`;
  }
  out.push(`<g opacity="0.85">${edges}</g>`, surface, `<g opacity="0.16">${worn}</g>`);

  for (const r of plan.rifts ?? []) {
    if (land === 'adrift') {
      out.push(`<path d="${riftPath(r, seed)}" fill="${HAZE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
      out.push(mist(plan.w, plan.h, seed, (x, y) => fromLine([x + 0.5, y + 0.5], r.points) < r.width / 2 - 0.2));
    } else out.push(`<path d="${riftPath(r, seed)}" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`);
  }

  const wood = () => paint.fill('wood');
  for (const b of plan.bridges) {
    const [l, w] = [P(b.length), P(b.width)];
    let planks = '';
    for (let x = -l / 2 + 16; x < l / 2; x += 16) planks += `M${R(x)} ${-w / 2}V${w / 2}`;
    out.push(
      `<g transform="translate(${P(b.x)} ${P(b.y)}) rotate(${deg(b.angle)})"><rect x="${-l / 2}" y="${-w / 2}" width="${l}" height="${w}" fill="#000000" opacity="0.35" transform="translate(8 10)"/><rect x="${-l / 2}" y="${-w / 2}" width="${l}" height="${w}" fill="${wood()}"/><rect x="${-l / 2}" y="${-w / 2}" width="${l}" height="${w}" fill="#c9954f" opacity="0.4"/><path d="${planks}" stroke="${INK}" stroke-width="2" opacity="0.55"/>` +
        `<path d="M${-l / 2 - 10} ${-w / 2}H${l / 2 + 10}M${-l / 2 - 10} ${w / 2}H${l / 2 + 10}" stroke="#3b2a18" stroke-width="9" stroke-linecap="round"/></g>`,
    );
  }
  plan.piers.forEach((p, i) => {
    const [x2, y2] = [p.x + Math.cos(p.angle) * p.length, p.y + Math.sin(p.angle) * p.length];
    const d = `M${P(p.x)} ${P(p.y)}L${P(x2)} ${P(y2)}`;
    const wide = Math.max(22, R(U * (8 / plan.feet)));
    out.push(
      `<path d="${d}" stroke="#000000" stroke-width="${wide + 6}" opacity="0.3" transform="translate(7 9)"/><path d="${d}" stroke="${INK}" stroke-width="${wide + 9}" stroke-linecap="butt"/><path d="${d}" stroke="#a07a4a" stroke-width="${wide}" stroke-linecap="butt"/><path d="${d}" stroke="${INK}" stroke-width="${wide}" stroke-dasharray="2.5 14" opacity="0.7"/>`,
    );
    // A boat tied up alongside, at most of them.
    if (!dressed || noise(i, R(p.x), seed + 62) < 0.25) return;
    const [L, B] = [Math.max(46, P(1.6 * ten)), Math.max(18, P(0.6 * ten))];
    const side = i % 2 ? 1 : -1;
    const t = 0.55 + noise(i, R(p.y), seed + 63) * 0.3;
    const [bx, by] = [p.x + Math.cos(p.angle) * p.length * t, p.y + Math.sin(p.angle) * p.length * t];
    const off = (wide / 2 + B / 2 + 7) * side;
    const hull = (k: number) =>
      `M${R((-L / 2) * k)} 0Q${R((-L / 4) * k)} ${R((-B / 2) * k)} ${R((L / 4) * k)} ${R((-B / 2) * k)}Q${R((L / 2) * k)} ${R((-B / 4) * k)} ${R((L / 2) * k)} 0Q${R((L / 2) * k)} ${R((B / 4) * k)} ${R((L / 4) * k)} ${R((B / 2) * k)}Q${R((-L / 4) * k)} ${R((B / 2) * k)} ${R((-L / 2) * k)} 0Z`;
    out.push(
      `<g transform="translate(${P(bx)} ${P(by)}) rotate(${deg(p.angle)}) translate(0 ${R(off)})"><path d="${hull(1)}" fill="#8a6238" stroke="${INK}" stroke-width="3.5"/><path d="${hull(0.72)}" fill="#5c3f22"/><path d="M${R(-L * 0.12)} ${R(-B * 0.36)}V${R(B * 0.36)}M${R(L * 0.14)} ${R(-B * 0.36)}V${R(B * 0.36)}" stroke="#b08a56" stroke-width="4"/></g>`,
    );
  });
  // A gate's two towers, either side of the road.
  if (plan.wall)
    for (const g of plan.wall.gates) {
      const off = g.width / 2 + plan.wall.width * 0.85;
      const s = P(plan.wall.width * 1.5);
      for (const k of [-1, 1]) {
        const [x, y] = [g.x - Math.sin(g.angle) * off * k, g.y + Math.cos(g.angle) * off * k];
        const box = `rect x="${P(x) - s / 2}" y="${P(y) - s / 2}" width="${s}" height="${s}" transform="rotate(${deg(g.angle)} ${P(x)} ${P(y)})"`;
        out.push(`<${box} fill="#8f887c" stroke="${INK}" stroke-width="7"/><${box} fill="url(#t-sheen)"/>`);
      }
    }

  // Stalls in the square, under their awnings.
  if (dressed)
    for (const s of plan.squares) {
      if (s.length < 4) continue;
      const c = mid(s);
      s.forEach((corner, i) => {
        const next = s[(i + 1) % s.length];
        const [px, py] = lerp(corner, c, 0.3);
        const [sw, sh] = [Math.max(34, P(1.1 * ten)), Math.max(22, P(0.7 * ten))];
        const [main, stripe] = AWNINGS[(i + R(c[0])) % AWNINGS.length];
        let stripes = '';
        for (let k = 1; k < 6; k += 2) stripes += `<rect x="${R(-sw / 2 + (sw * k) / 6)}" y="${-sh / 2}" width="${R(sw / 6)}" height="${sh}" fill="${stripe}"/>`;
        out.push(
          `<g transform="translate(${P(px)} ${P(py)}) rotate(${deg(Math.atan2(next[1] - corner[1], next[0] - corner[0]))})"><rect x="${-sw / 2}" y="${-sh / 2}" width="${sw}" height="${sh}" fill="#000000" opacity="0.35" transform="translate(6 8)"/><rect x="${-sw / 2}" y="${-sh / 2}" width="${sw}" height="${sh}" fill="${main}"/>${stripes}<rect x="${-sw / 2}" y="${-sh / 2}" width="${sw}" height="${sh}" fill="url(#t-sheen)" stroke="${INK}" stroke-width="3"/></g>`,
        );
      });
    }

  // Houses: the shadow each throws, then its roof, lit from the north-west and shaded on the far side.
  const groups = [...ROOFS, SLATE].map(() => '');
  let [shades, lit, dark, tiles, ridges, flat, chimneys] = ['', '', '', '', '', '', ''];
  for (const b of plan.buildings) {
    const d = line(b.corners, true);
    shades += d;
    const c = mid(b.corners);
    groups[b.key ? ROOFS.length : (R(b.corners[0][0] * 7) + R(b.corners[0][1] * 13)) % ROOFS.length] += d;
    if (b.corners.length !== 4) {
      flat += d;
      continue;
    }
    const [p0, p1, p2, p3] = b.corners;
    const [a, cdist] = [dist(p0, p1), dist(p1, p2)];
    const longways = a >= cdist;
    const [m0, m1, k] = longways ? [lerp(p0, p3, 0.5), lerp(p1, p2, 0.5), cdist / 2 / (a || 1)] : [lerp(p0, p1, 0.5), lerp(p3, p2, 0.5), a / 2 / (cdist || 1)];
    const [e0, e1] = [lerp(m0, m1, Math.min(0.5, k)), lerp(m0, m1, 1 - Math.min(0.5, k))];
    // Its four slopes: the two long ones, and the hip at each end.
    const slopes: Pt[][] = longways
      ? [
          [p0, p1, e1, e0],
          [p3, p2, e1, e0],
          [p0, e0, p3],
          [p1, e1, p2],
        ]
      : [
          [p0, p3, e1, e0],
          [p1, p2, e1, e0],
          [p0, e0, p1],
          [p3, e1, p2],
        ];
    for (const s of slopes) {
      const m = mid(s);
      const [nx, ny] = [m[0] - c[0], m[1] - c[1]];
      const light = (nx * -0.6 + ny * -0.8) / (Math.hypot(nx, ny) || 1);
      if (light > 0.2) lit += line(s, true);
      else if (light < -0.2) dark += line(s, true);
      if (s.length === 4) for (const t of [0.34, 0.67]) tiles += line([lerp(s[0], s[3], t), lerp(s[1], s[2], t)]);
    }
    ridges += `${line([e0, e1])}${line([slopes[2][0], e0, slopes[2][2]])}${line([slopes[3][0], e1, slopes[3][2]])}`;
    if (dressed && !b.key && noise(R(p0[0] * 5), R(p0[1] * 5), seed + 64) < 0.55) {
      const [qx, qy] = lerp(e0, e1, 0.22);
      const s = Math.max(12, P(0.28 * ten));
      chimneys += `<rect x="${P(qx) - s / 2}" y="${P(qy) - s / 2}" width="${s}" height="${s}" transform="rotate(${deg(Math.atan2(e1[1] - e0[1], e1[0] - e0[0]))} ${P(qx)} ${P(qy)})"/>`;
    }
  }
  out.push(`<path d="${shades}" fill="#000000" opacity="0.42" filter="url(#p-shade)" transform="translate(${Math.max(8, P(0.16))} ${Math.max(10, P(0.2))})"/>`);
  groups.forEach((d, i) => d && out.push(`<path d="${d}" fill="${i === ROOFS.length ? SLATE : ROOFS[i]}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`));
  out.push(`<path d="${lit}" fill="#ffffff" opacity="0.17"/><path d="${dark}" fill="#000000" opacity="0.24"/>`);
  if (flat) out.push(`<path d="${flat}" fill="url(#t-sheen)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
  out.push(
    `<path d="${tiles}" fill="none" stroke="#000000" stroke-width="2" opacity="0.2"/><path d="${ridges}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" opacity="0.8"/>`,
  );
  if (chimneys) out.push(`<g fill="#000000" opacity="0.35" transform="translate(5 7)">${chimneys}</g><g fill="#5b5148" stroke="${INK}" stroke-width="2.5">${chimneys}</g>`);

  // Trees: a shadow on the ground, a crown of leaves, and the light on it.
  if (plan.trees.length) {
    let [shade, rims, lights] = ['', '', ''];
    const crowns = GREENS.map(() => '');
    for (const [x, y, s] of plan.trees) {
      const [cx, cy, r] = [P(x), P(y), P(s)];
      const turn = noise(R(x * 9), R(y * 9), seed + 65) * 6.3;
      let lobes = `<circle cx="${cx}" cy="${cy}" r="${R(r * 0.78)}"/>`;
      let rim = `<circle cx="${cx}" cy="${cy}" r="${R(r * 0.78) + 4}"/>`;
      for (let i = 0; i < 6; i++) {
        const a = turn + (i * Math.PI) / 3;
        const [lx, ly, lr] = [R(cx + Math.cos(a) * r * 0.5), R(cy + Math.sin(a) * r * 0.5), R(r * (0.44 + noise(i, R(x * 9), seed + 66) * 0.14))];
        lobes += `<circle cx="${lx}" cy="${ly}" r="${lr}"/>`;
        rim += `<circle cx="${lx}" cy="${ly}" r="${lr + 4}"/>`;
      }
      shade += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      rims += rim;
      crowns[Math.floor(noise(R(x * 9), R(y * 7), seed + 67) * GREENS.length)] += lobes;
      lights += `<circle cx="${R(cx - r * 0.24)}" cy="${R(cy - r * 0.28)}" r="${R(r * 0.46)}" opacity="0.32"/><circle cx="${R(cx - r * 0.34)}" cy="${R(cy - r * 0.4)}" r="${R(r * 0.22)}" opacity="0.4"/>`;
    }
    out.push(shadow(shade, 12, 16, 0.38), `<g fill="#1c3016">${rims}</g>`);
    crowns.forEach((d, i) => d && out.push(`<g fill="${GREENS[i]}">${d}</g>`));
    out.push(`<g fill="#a9d06f">${lights}</g>`);
  }

  // Great growths: a cap with its gills, seen from above.
  if (plan.growths?.length) {
    let [caps, gills] = ['', ''];
    for (const [x, y, s] of [...plan.growths].sort((a, b) => a[1] - b[1])) {
      const [cx, cy, rad] = [P(x), P(y), P(s / 2)];
      caps += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#b79bc4" stroke="${INK}" stroke-width="4.5"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#t-ball)"/><circle cx="${cx}" cy="${cy}" r="${Math.max(3, R(rad * 0.22))}" fill="#4a3a5c"/>`;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + noise(R(x * 5), R(y * 5), seed + 31) * 2;
        gills += `M${R(cx + Math.cos(a) * rad * 0.36)} ${R(cy + Math.sin(a) * rad * 0.36)}L${R(cx + Math.cos(a) * rad * 0.86)} ${R(cy + Math.sin(a) * rad * 0.86)}`;
      }
    }
    out.push(caps, `<path d="${gills}" fill="none" stroke="#4a3a5c" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`);
  }

  if (o.grid !== 'none') {
    let grid = '';
    for (let x = 1; x < plan.w; x++) grid += `M${x * U} 0V${plan.h * U}`;
    for (let y = 1; y < plan.h; y++) grid += `M0 ${y * U}H${plan.w * U}`;
    out.push(`<path d="${grid}" stroke="#17130f" stroke-width="2.5" fill="none" opacity="${night ? 0.4 : 0.24}"/>`);
  }

  // Districts: a broken line between one and the next, and each one's name written across it.
  if (plan.districts?.length) {
    const between = (plan.districtLines ?? []).map(([a, b]) => `M${P(a[0])} ${P(a[1])}L${P(b[0])} ${P(b[1])}`).join('');
    if (between) out.push(`<path d="${between}" fill="none" stroke="#ffffff" stroke-width="9" stroke-dasharray="46 30" stroke-linecap="round" opacity="0.6"/>`);
    for (const d of plan.districts)
      out.push(
        `<text x="${P(d.at[0])}" y="${P(d.at[1])}" font-size="78" font-style="italic" font-weight="700" letter-spacing="9" text-anchor="middle" dominant-baseline="central" fill="${INK}" stroke="#ffffff" stroke-width="20" stroke-linejoin="round" paint-order="stroke" opacity="0.9">${esc(d.name.toUpperCase())}</text>`,
      );
  }
  if (o.numbers)
    for (const a of plan.areas)
      out.push(
        keyMarks(a.n, P(a.x), P(a.y) + 12, o, '#ffffff') +
          `<circle cx="${P(a.x)}" cy="${P(a.y)}" r="44" fill="#ffffff" stroke="${INK}" stroke-width="6"/><text x="${P(a.x)}" y="${P(a.y)}" font-size="${a.n > 9 ? 44 : 50}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${INK}">${esc(String(a.n))}</text>`,
      );
  const pale = isle !== null && (land === 'aloft' || land === 'adrift');
  out.push(legend(plan, o, pale ? '#ffffff' : 'none', !pale));
  out[0] = `<defs>${paint.defs()}${THING_DEFS}<filter id="p-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="26"/></filter>${defs}</defs>`;
  return out.join('');
}
