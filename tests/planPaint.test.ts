/** A painted style for plans (v0.9.29): the same plan, with ground from photographs; ink is as it was. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ART_KINDS, LANDS, drawPlan, madeNames, makePlan, type PlanArt, type PlanKind, type PlanSettings } from '../shared/plan/index.js';
import { FEATURE_KINDS } from '../shared/plan/model.js';

const base: PlanSettings = { kind: 'dungeon', seed: 7, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: true, use: 'tavern', town: 'town', water: 'river', walled: true, around: 'fields' };
const named = (s: PlanSettings): PlanSettings => ({ ...s, names: s.kind === 'building' || s.kind === 'ship' ? [] : madeNames(s, 'The Old Keep', s.kind === 'settlement' ? 0 : 7) });
const KINDS: PlanKind[] = ['dungeon', 'cave', 'building', 'ship', 'settlement'];
const dir = path.resolve(__dirname, '../client/src/assets/plan');
const art = Object.fromEntries(ART_KINDS.map((k) => [k, `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, `${k}.jpg`)).toString('base64')}`])) as PlanArt;

/** A drawing a browser will show as a picture: nothing said twice in one mark, nothing left open. */
function wellFormed(svg: string, what: string) {
  for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map((m) => m[1]);
    expect(new Set(names).size, `${what}: ${tag.slice(0, 160)}`).toBe(names.length);
  }
  for (const t of ['g', 'svg', 'text', 'clipPath', 'defs', 'pattern', 'filter']) {
    const opened = (svg.match(new RegExp(`<${t}\\b[^>]*[^/]>|<${t}>`, 'g')) ?? []).length;
    const closed = (svg.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
    expect(opened, `${what}: <${t}> left open`).toBe(closed);
  }
  const used = new Set([...svg.matchAll(/url\(#([\w-]+)\)/g)].map((m) => m[1]));
  const made = new Set([...svg.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  for (const id of used) expect(made.has(id), `${what}: #${id} is used and never made`).toBe(true);
}

describe('the painted style', () => {
  it('ships six small pictures, and nothing else', () => {
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual([...ART_KINDS].map((k) => `${k}.jpg`).sort());
    const size = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
    expect(size).toBeLessThan(450_000);
  });

  it('draws every kind of plan on every ground as a picture a browser will show', () => {
    for (const kind of KINDS)
      for (const land of LANDS) {
        const plan = makePlan(named({ ...base, kind, land }));
        const d = drawPlan(plan, { style: 'painted', art, title: 'A place' });
        wellFormed(d.svg, `${kind} ${land}`);
        expect(d.svg, `${kind} ${land}`).toContain('<image');
        const ink = drawPlan(plan, { title: 'A place' });
        expect([d.width, d.height], `${kind} ${land}: the same sheet`).toEqual([ink.width, ink.height]);
      }
  });

  it('carries each picture once, however much ground it covers', () => {
    const d = drawPlan(makePlan(named({ ...base, kind: 'settlement', size: 'large' })), { style: 'painted', art });
    for (const k of ART_KINDS) expect(d.svg.split(art[k]).length - 1, k).toBeLessThanOrEqual(1);
  });

  it('keeps the players’ copy the players’: no numbers, secret doors or traps', () => {
    const plan = makePlan(named(base));
    const gm = drawPlan(plan, { style: 'painted', art, gm: true, numbers: true }).svg;
    const pl = drawPlan(plan, { style: 'painted', art, gm: false, numbers: false }).svg;
    expect(pl.length).toBeLessThan(gm.length);
    expect(pl).not.toMatch(/>S<\/text>/);
  });

  it('is drawn in flat colours without its pictures, and takes nothing that is not a picture', () => {
    for (const kind of KINDS) {
      const plan = makePlan(named({ ...base, kind }));
      const flat = drawPlan(plan, { style: 'painted' });
      wellFormed(flat.svg, `${kind} without pictures`);
      expect(flat.svg).not.toContain('<image');
      const bad = { stone: 'https://example.com/x.jpg', wood: 'javascript:alert(1)', earth: 'data:image/svg+xml;base64,AAAA', rock: 'data:text/html;base64,AAAA', grass: '" onload="x', dirt: '' };
      const refused = drawPlan(plan, { style: 'painted', art: bad });
      expect(refused.svg, kind).toBe(flat.svg);
    }
  });

  it('furnishes and dresses a place, and leaves the dressing off when asked', () => {
    const plan = makePlan(named({ ...base, names: ['Guard room', 'Barracks', 'Kitchen', 'Store room', 'Chapel', 'Great hall', 'Library', 'Well room'] }));
    const full = drawPlan(plan, { style: 'painted', art }).svg;
    const bare = drawPlan(plan, { style: 'painted', art, dressing: false }).svg;
    const empty = drawPlan(plan, { style: 'painted', art, furnishings: false }).svg;
    wellFormed(bare, 'without dressing');
    wellFormed(empty, 'without furnishings');
    // Torchlight is dressing; a shadow under a thing is furnishing.
    expect(full).toContain('url(#t-glow)');
    expect(full).toContain('url(#p-shade)');
    expect(bare.length).toBeLessThan(full.length);
    expect(empty.length).toBeLessThan(bare.length);
    // Dressing is drawing only: the plan is what it was, and the same plan is dressed the same way twice.
    const before = JSON.stringify(plan);
    expect(drawPlan(plan, { style: 'painted', art }).svg).toBe(full);
    expect(JSON.stringify(plan)).toBe(before);
    const town = makePlan(named({ ...base, kind: 'settlement', water: 'coast' }));
    const dressed = drawPlan(town, { style: 'painted', art }).svg;
    const plainTown = drawPlan(town, { style: 'painted', art, dressing: false }).svg;
    wellFormed(plainTown, 'a town without dressing');
    expect(plainTown.length).toBeLessThan(dressed.length);
  });

  it('paints every thing that can stand in a room', () => {
    const plan = makePlan(named(base));
    if (plan.kind === 'settlement') throw new Error('not a plan on squares');
    const a = plan.areas[0];
    const [x, y] = [Math.floor(a.x), Math.floor(a.y)];
    for (const kind of FEATURE_KINDS)
      for (const dir of [0, 1, 2, 3] as const) {
        const one = { ...plan, features: [{ kind, x, y, w: kind === 'bed' || kind === 'stairs' ? (dir % 2 ? 2 : 1) : 1, h: kind === 'bed' || kind === 'stairs' ? (dir % 2 ? 1 : 2) : 1, dir }] };
        const d = drawPlan(one, { style: 'painted', art, dressing: false });
        wellFormed(d.svg, `${kind} facing ${dir}`);
        // (Not in the photographs: letters that spell anything turn up in those by chance.)
        expect(d.svg.replace(/href="data:[^"]+"/g, ''), `${kind}: a number that is not one`).not.toMatch(/NaN|undefined|Infinity/);
      }
  });

  it('leaves ink as it was', () => {
    for (const kind of KINDS) {
      const plan = makePlan(named({ ...base, kind }));
      const ink = drawPlan(plan, {}).svg;
      expect(drawPlan(plan, { style: 'ink' }).svg).toBe(ink);
      expect(drawPlan(plan, { style: 'ink', art }).svg).toBe(ink);
      expect(ink).not.toContain('<image');
      expect(ink).not.toContain('<pattern id="p-');
    }
  });
});
