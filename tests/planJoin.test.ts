/** Joined plans (v0.9.27): ways on between plans, places that are records of their own, levels below, and districts. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import {
  DISTRICTS,
  KEY_KIND_INFO,
  addRoom,
  districtPlan,
  drawPlan,
  featureAt,
  fullKeyMarkdown,
  isKeyed,
  itemLine,
  keyedNames,
  madeNames,
  makePlan,
  newItem,
  newRoom,
  pack,
  planKey,
  regionAt,
  regionOf,
  roomMarks,
  stairsDown,
  suggest,
  type GridPlan,
  type PlanSettings,
  type TownPlan,
} from '../shared/plan/index.js';
import { inside } from '../shared/plan/districts.js';

const base: PlanSettings = { kind: 'dungeon', seed: 7, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: true, use: 'house', town: 'village', water: 'none', walled: false, around: 'fields' };
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as number[]) : x instanceof Set ? [...x] : x));
const town = (more: Partial<PlanSettings>) => {
  const s: PlanSettings = { ...base, kind: 'settlement', ...more };
  return makePlan({ ...s, names: madeNames(s, 'x', 0) }) as TownPlan;
};
const mid = (cs: [number, number][]): [number, number] => [cs.reduce((a, c) => a + c[0], 0) / cs.length, cs.reduce((a, c) => a + c[1], 0) / cs.length];

describe('a town or a city in districts', () => {
  it('shares its houses out among named districts, the same every time, and leaves a plan without them as it was', () => {
    for (const size of ['town', 'city'] as const)
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const more = { town: size, seed, water: (['none', 'river', 'coast'] as const)[seed % 3], walled: seed % 2 === 0 };
        const t = town({ ...more, districts: true });
        const ds = t.districts!;
        expect(ds.length, `${size} ${seed}`).toBeGreaterThanOrEqual(2);
        expect(ds.length).toBeLessThanOrEqual(DISTRICTS[size]);
        expect(new Set(ds.map((d) => d.name)).size, `${size} ${seed}: ${ds.map((d) => d.name).join(', ')}`).toBe(ds.length);
        for (const d of ds) {
          expect(d.outline.length).toBeGreaterThanOrEqual(3);
          expect(d.name.trim()).not.toBe('');
          // Its name is written on its own ground.
          expect(inside(d.at, d.outline), `${size} ${seed}: ${d.name}`).toBe(true);
        }
        // Every house stands in one district, and one only (its middle; a house on a line is in neither).
        const homes = t.buildings.map((b) => ds.filter((d) => inside(mid(b.corners), d.outline)).length);
        expect(homes.filter((n) => n > 1)).toEqual([]);
        expect(homes.filter((n) => n === 1).length).toBeGreaterThan(t.buildings.length * 0.97);
        // A line between each pair of neighbours, and none of no length.
        expect(t.districtLines!.length).toBeGreaterThanOrEqual(ds.length - 1);
        for (const [a, b] of t.districtLines!) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.05);
        expect(plain(town({ ...more, districts: true }))).toBe(plain(t));
        // Without them it is the plan it always was: the districts are laid over it, and move nothing.
        const bare = town(more);
        expect(bare.districts).toBeUndefined();
        expect(plain({ ...t, districts: undefined, districtLines: undefined })).toBe(plain(bare));
      }
    // A hamlet or a village is one place.
    expect(town({ town: 'village', districts: true }).districts).toBeUndefined();
    expect(town({ town: 'hamlet', districts: true }).districts).toBeUndefined();
  });

  it('names a district for what stands in it, writes the names on the plan, and says in the key which each place is in', () => {
    const s: PlanSettings = { ...base, kind: 'settlement', town: 'city', seed: 11, water: 'river', walled: true, districts: true };
    const names = madeNames(s, 'x', 0);
    const t = makePlan({ ...s, names }) as TownPlan;
    const market = t.areas.find((a) => /market/i.test(a.name))!;
    const ward = t.districts!.find((d) => inside([market.x, market.y], d.outline))!;
    expect(ward.name).toBe('Market Ward');
    const svg = drawPlan(t).svg;
    for (const d of t.districts!) expect(svg).toContain(d.name.toUpperCase().replace(/’/g, '’'));
    expect(drawPlan(town({ town: 'city', seed: 11 })).svg).not.toContain('MARKET WARD');
    expect(planKey(t, names).find((l) => l.n === market.n)!.detail).toMatch(/^Market Ward\b/);
    const sized = t.areas.find((a) => a.feet && t.districts!.some((d) => inside([a.x, a.y], d.outline)))!;
    expect(planKey(t, names).find((l) => l.n === sized.n)!.detail).toMatch(/^[A-Z][^,.]+, \d+ × \d+ ft\. /);
    // What the GM calls them is used wherever they are named, and is drawn as words whatever it is.
    const mine = makePlan({ ...s, names, wards: [{ name: '<b>The Shambles</b>' }, { name: '  ' }] }) as TownPlan;
    expect(mine.districts![0].name).toBe('<b>The Shambles</b>');
    expect(mine.districts![1].name).toBe(t.districts![1].name);
    expect(drawPlan(mine).svg).toContain('&lt;B&gt;THE SHAMBLES&lt;/B&gt;');
    expect(drawPlan(mine).svg).not.toContain('<b>');
    // A town or a city is suggested in districts; a village is not.
    const facts = { id: 'SET-1', type: 'settlement', name: 'Marrow Ford', body: '', children: [], terrain: [], danger: 'safe' as const, wealth: 'modest' as const };
    expect(suggest({ ...facts, fields: [['Population', '5200']] }).districts).toBe(true);
    expect(suggest({ ...facts, fields: [['Population', '400']] }).districts).toBeUndefined();
  });

  it('draws a district closer as a plan of its own: the same houses, the same size in feet, its places numbered afresh', () => {
    for (const [size, seed] of [['city', 11], ['city', 3], ['town', 5], ['town', 8]] as const) {
      const t = town({ town: size, seed, water: 'river', walled: true, districts: true });
      t.districts!.forEach((d, i) => {
        const cut = districtPlan(t, i)!;
        const p = cut.plan;
        expect(p.feet).toBe(10);
        expect(p.w).toBeGreaterThan(10);
        expect(p.w).toBeLessThanOrEqual(280);
        expect(p.h).toBeLessThanOrEqual(280);
        // Every house of the district is on it, as large in feet as it was.
        const here = t.buildings.filter((b) => inside(mid(b.corners), d.outline));
        expect(p.buildings.length, `${size} ${seed} ${d.name}`).toBeGreaterThanOrEqual(here.length);
        const span = (cs: [number, number][], feet: number) => Math.round((Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0]))) * feet);
        const widths = new Set(t.buildings.map((b) => span(b.corners, t.feet)));
        for (const b of p.buildings.slice(0, 12)) expect(widths.has(span(b.corners, p.feet)) || [...widths].some((w) => Math.abs(w - span(b.corners, p.feet)) <= 1)).toBe(true);
        // Its numbered places are those that stand on its sheet, in order, each with its building.
        expect(p.areas.map((a) => a.n)).toEqual(p.areas.map((_, k) => k + 1));
        expect(p.areas.map((a) => a.name)).toEqual(cut.from.map((n) => t.areas.find((a) => a.n === n)!.name));
        for (const a of p.areas) expect(a.x >= 0 && a.y >= 0 && a.x <= p.w && a.y <= p.h).toBe(true);
        for (const b of p.buildings) if (b.key) expect(p.areas.some((a) => a.n === b.key)).toBe(true);
        expect(drawPlan(p).svg).not.toMatch(/NaN|undefined|Infinity/);
      });
    }
    expect(districtPlan(town({ town: 'village' }), 0)).toBeNull();
  });
});

describe('ways on, and places that are records', () => {
  it('writes a way on with where it leads, marks it on the GM’s copy, and counts a place tied to a record as keyed', () => {
    const way = newItem('way', { title: 'Stairs down', entity: 'DUN-0002', text: 'Forty steps, the last ten under water.' });
    const called = (id: string) => (id === 'DUN-0002' ? 'The Lower Halls' : id === 'BLD-0009' ? 'The Gilded Flagon' : undefined);
    expect(itemLine(way, called)).toEqual({ label: 'Way on', text: 'Stairs down. To @[The Lower Halls|DUN-0002]. Forty steps, the last ten under water.' });
    // A record that is gone is left out; with no names to hand the words stand alone.
    expect(itemLine({ ...way, entity: 'GONE-1' }, called).text).toBe('Stairs down. Forty steps, the last ten under water.');
    expect(itemLine(way).text).toBe('Stairs down. Forty steps, the last ten under water.');
    expect(KEY_KIND_INFO.way.mark).toBe('W');
    const rooms = [{ ...newRoom('Cellar'), items: [way] }, { ...newRoom('Inn'), record: 'BLD-0009' }, newRoom('Yard')];
    expect(roomMarks(rooms)).toEqual({ 1: 'W' });
    expect(rooms.map(isKeyed)).toEqual([true, true, false]);
    const md = fullKeyMarkdown(rooms, [], called);
    expect(md).toContain('- **Way on:** Stairs down. To @[The Lower Halls|DUN-0002].');
    expect(md).toContain('A record of its own: @[The Gilded Flagon|BLD-0009].');
    // Read back, it is the same three places.
    expect(keyedNames(`## Map key\n\n${md}\n`)).toEqual(['Cellar', 'Inn', 'Yard']);
  });

  it('says where a place under another is entered from, and nothing else of it changes', () => {
    const names = madeNames(base, 'x', 6);
    const alone = makePlan({ ...base, names }) as GridPlan;
    const under = makePlan({ ...base, names, from: 'the cellar of the Gilded Flagon' }) as GridPlan;
    expect(alone.areas[0].exits.some((e) => e.startsWith('stairs up to the outside, '))).toBe(true);
    expect(under.areas[0].exits.some((e) => e.startsWith('stairs up to the cellar of the Gilded Flagon, '))).toBe(true);
    const bare = (p: GridPlan) => plain({ ...p, areas: p.areas.map((a) => ({ ...a, exits: [] })) });
    expect(bare(under)).toBe(bare(alone));
    const cave = makePlan({ ...base, kind: 'cave', names, from: 'the Crypt of the Old Keep' }) as GridPlan;
    expect(cave.areas[0].exits[0]).toMatch(/^the way up to the Crypt of the Old Keep, /);
  });

  it('sets stairs down in a place: on its own floor, off its number and its doorsteps, and in its ways out', () => {
    const d = makePlan({ ...base, names: madeNames(base, 'x', 8) }) as GridPlan;
    let done = 0;
    for (const a of d.areas) {
      const next = stairsDown(d, a.n, 'The Lower Halls');
      if (!next) continue;
      done++;
      const f = next.features[next.features.length - 1];
      expect(f.kind).toBe('stairs');
      const region = regionOf(d, a);
      const squares: [number, number][] = f.w > f.h ? [[f.x, f.y], [f.x + 1, f.y]] : [[f.x, f.y], [f.x, f.y + 1]];
      for (const [x, y] of squares) {
        expect(regionAt(d, x, y), a.name).toBe(region);
        expect(featureAt(d, x, y)).toBe(-1);
        expect(Math.floor(a.x) === x && Math.floor(a.y) === y).toBe(false);
        // Not on a doorstep.
        expect(d.openings.some((o) => (o.side === 'n' ? (o.x === x && (o.y === y || o.y - 1 === y)) : (o.y === y && (o.x === x || o.x - 1 === x))))).toBe(false);
      }
      expect(next.areas[a.n - 1].exits).toContain('stairs down to The Lower Halls');
      expect(next.areas[a.n - 1].exits.filter((e) => !e.startsWith('stairs down'))).toEqual(a.exits);
      // Set down again, they say it once.
      const again = stairsDown(next, a.n, 'The Deeps');
      if (again) expect(again.areas[a.n - 1].exits.filter((e) => e.startsWith('stairs down'))).toEqual(['stairs down to The Deeps']);
    }
    expect(done).toBeGreaterThanOrEqual(6);
    // No room for them in a closet of one square.
    const blank: GridPlan = { kind: 'dungeon', w: 12, h: 12, feet: 5, cells: new Int16Array(144), rough: new Set(), rock: new Uint8Array(144).fill(1), openings: [], features: [], areas: [], captions: [] };
    const closet = addRoom(blank, 5, 5, 5, 5, 1, 'Closet')!;
    expect(stairsDown(closet, 1)).toBeNull();
    expect(stairsDown(d, 99)).toBeNull();
  });
});

describe('joined plans, kept', () => {
  async function world() {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const make = async (o: Record<string, unknown>) => (await request(gm).post('/api/entities').send({ realm: 'world', ...o })).body as { id: string; name: string };
    const info = async (id: string) => (await request(gm).get(`/api/entities/${id}/plan`)).body;
    const keep = async (id: string, s: unknown) => request(gm).put(`/api/entities/${id}/plan`).send(s as object);
    return { ctx, gm, make, info, keep };
  }

  it('tells each plan the place it is in, its number there, what is kept under it, and what leads to it', async () => {
    const { ctx, make, info, keep } = await world();
    const ford = await make({ name: 'Marrow Ford', type: 'settlement', fields: [['Population', '5200']] });
    const inn = await make({ name: 'The Gilded Flagon', type: 'building', parent_id: ford.id });
    const temple = await make({ name: 'Temple', type: 'building', parent_id: ford.id });
    const ward = await make({ name: 'Bridge Ward', type: 'settlement', parent_id: ford.id });
    const run = await make({ name: 'The Smugglers’ Run', type: 'dungeon', parent_id: inn.id });
    const npc = await make({ name: 'Old Hob', type: 'npc', parent_id: ford.id });

    // Nothing kept yet: the town knows what is under it; the inn knows where it is, with no number.
    let town = await info(ford.id);
    expect(town.joined).toEqual({ within: null, under: [ward, inn, temple].map((e) => ({ id: e.id, name: e.name, type: expect.any(String), plan: false })).sort((a, b) => a.name.localeCompare(b.name)), from: [] });
    expect(town.joined.under.some((u: { id: string }) => u.id === npc.id)).toBe(false);
    expect((await info(inn.id)).joined.within).toEqual({ id: ford.id, name: 'Marrow Ford', plan: false, n: null, ward: null });

    // The town's key: place 2 tied to the inn; place 3 is the temple by its name; the second district is the ward.
    const s = town.suggested as PlanSettings;
    expect(s.names).toContain('Temple');
    const key = s.names.map((n) => newRoom(n));
    // (The town's places are the records kept under it, by name. A tie made in the key comes before a name: the inn
    // is tied to the place called for the ward, and is that number, not the one that has its own name.)
    expect(s.names).toEqual(['Bridge Ward', 'Temple', 'The Gilded Flagon']);
    const tiedAt = s.names.indexOf(ward.name);
    key[tiedAt] = { ...key[tiedAt], record: inn.id };
    const at = s.names.indexOf('Temple');
    expect((await keep(ford.id, { ...s, key, wards: [{ name: 'Old Town' }, { name: 'Bridge Ward', record: ward.id }] })).status).toBe(200);
    expect((await info(inn.id)).joined.within).toEqual({ id: ford.id, name: 'Marrow Ford', plan: true, n: tiedAt + 1, ward: null });
    expect((await info(temple.id)).joined.within).toMatchObject({ n: at + 1 });
    expect((await info(ward.id)).joined.within).toMatchObject({ n: null, ward: 'Bridge Ward' });

    // The inn's cellar leads down to the run: the run is told so, and so is the inn's own list of what is under it.
    const mine = (await info(inn.id)).suggested as PlanSettings;
    const rooms = [newRoom('Common room'), { ...newRoom('Cellar'), items: [newItem('way', { title: 'Stairs down', entity: run.id }), newItem('person', { entity: run.id })] }];
    expect((await keep(inn.id, { ...mine, key: rooms })).status).toBe(200);
    expect((await keep(run.id, { ...(await info(run.id)).suggested, from: 'the Cellar of The Gilded Flagon' })).status).toBe(200);
    const below = await info(run.id);
    expect(below.joined.from).toEqual([{ id: inn.id, name: 'The Gilded Flagon', n: 2, room: 'Cellar', how: 'Stairs down' }]);
    expect(below.joined.within).toMatchObject({ id: inn.id, n: null });
    expect(below.saved.from).toBe('the Cellar of The Gilded Flagon');
    expect((makePlan(below.saved) as GridPlan).areas[0].exits.join()).toContain('stairs up to the Cellar of The Gilded Flagon');
    expect((await info(inn.id)).joined.under).toEqual([{ id: run.id, name: 'The Smugglers’ Run', type: 'dungeon', plan: true }]);
    // A way that leads to another place is not told to this one.
    expect((await info(temple.id)).joined.from).toEqual([]);
    // The players are sent none of it, whatever is revealed.
    const theirs = JSON.stringify(playerSnapshot(ctx.db));
    expect(theirs).not.toContain('"joined"');
    expect(theirs).not.toContain('Stairs down');
  });

  it('keeps a district’s own plan, a long way in, and ties a pin on the Atlas map to the place’s record', async () => {
    const { gm, make, info, keep } = await world();
    const ford = await make({ name: 'Marrow Ford', type: 'settlement', fields: [['Population', '9000']] });
    const s = (await info(ford.id)).suggested as PlanSettings;
    expect(s.town).toBe('city');
    const t = makePlan(s) as TownPlan;
    // Every district of a city can be kept as a plan of its own.
    const ward = await make({ name: 'A ward', type: 'settlement', parent_id: ford.id });
    for (let i = 0; i < t.districts!.length; i++) {
      const cut = districtPlan(t, i)!;
      const sent = await keep(ward.id, { ...s, districts: false, names: cut.plan.areas.map((a) => a.name), drawn: cut.plan });
      expect(sent.status, `${t.districts![i].name}: ${JSON.stringify(sent.body).slice(0, 300)}`).toBe(200);
      expect(plain(makePlan((await info(ward.id)).saved))).toBe(plain(cut.plan));
    }
    // A town in districts changed by hand keeps its districts with its drawing.
    expect((await keep(ford.id, { ...s, drawn: pack(t), wards: t.districts!.map((d) => ({ name: d.name })) })).status).toBe(200);
    expect((makePlan((await info(ford.id)).saved) as TownPlan).districts!.map((d) => d.name)).toEqual(t.districts!.map((d) => d.name));
    // What is not a district is refused.
    expect((await keep(ford.id, { ...s, wards: Array.from({ length: 20 }, () => ({ name: 'x' })) })).status).toBe(400);
    expect((await keep(ford.id, { ...s, from: 'x'.repeat(400) })).status).toBe(400);

    // A level below with a long way in, changed by hand: its ways out are kept as they are written.
    const deep = await make({ name: 'The Deeps', type: 'dungeon' });
    const ds: PlanSettings = { ...base, names: madeNames(base, 'x', 5), from: 'the Collapsed Reliquary of Saint Aurelian the Twice-Buried, beneath the Old Keep' };
    const d = stairsDown(makePlan(ds) as GridPlan, 3, 'A Level With A Long Name That Goes On And On')!;
    expect((await keep(deep.id, { ...ds, drawn: pack(d) })).status).toBe(200);

    // The Atlas map: a pin for a place tied to a record leads to that record; one tied to nothing that exists does not.
    const inn = await make({ name: 'The Gilded Flagon', type: 'building' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const made = await request(gm)
      .post(`/api/entities/${ford.id}/plan/map`)
      .field('plan', JSON.stringify({ squares: t.w, feet: t.feet, areas: [{ n: 1, name: 'Market square', x: 3, y: 3 }, { n: 2, name: 'Inn', x: 5, y: 5, entity: inn.id }, { n: 3, name: 'Temple', x: 7, y: 7, entity: 'NOPE-1' }] }))
      .attach('image', png, { filename: 'plan.png', contentType: 'image/png' });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const pins = (await request(gm).get(`/api/maps/${made.body.map.id}/detail`)).body.markers as { label: string; entity_id: string | null }[];
    expect(pins.map((m) => [m.label, m.entity_id])).toEqual([['1. Market square', null], ['2. Inn', inn.id], ['3. Temple', null]]);
  });
});
