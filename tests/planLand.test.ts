/** The lie of the land, and ships (v0.9.28): what each kind of ground does to a plan, and a fifth kind of plan. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import {
  LANDS,
  LAND_LABELS,
  PASSAGE,
  PLAN_LABELS,
  addRoom,
  drawPlan,
  edgeKey,
  featureAt,
  madeNames,
  makePlan,
  districtPlan,
  pack,
  planKey,
  regionAt,
  regionOf,
  standsInWall,
  suggest,
  unpack,
  withShift,
  type GridPlan,
  type Land,
  type PlanSettings,
  type TownPlan,
} from '../shared/plan/index.js';
import { inRift } from '../shared/plan/land.js';

const base: PlanSettings = { kind: 'dungeon', seed: 7, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: true, use: 'tavern', town: 'town', water: 'river', walled: true, around: 'fields' };
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as number[]) : x instanceof Set ? [...x] : x));
const named = (s: PlanSettings): PlanSettings => ({ ...s, names: s.kind === 'building' || s.kind === 'ship' ? [] : madeNames(s, 'The Old Keep', s.kind === 'settlement' ? 0 : 7) });
const grid = (more: Partial<PlanSettings>) => makePlan(named({ ...base, ...more })) as GridPlan;
const town = (more: Partial<PlanSettings>) => makePlan(named({ ...base, kind: 'settlement', ...more })) as TownPlan;
const foot = (f: { x: number; y: number; w: number; h: number }): [number, number] => [Math.floor(f.x + f.w / 2), Math.floor(f.y + f.h / 2)];
function inside(p: [number, number], poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
/** A drawing a browser will show as a picture: no mark of it says the same thing twice. (An SVG that does is refused whole.) */
function wellFormed(svg: string, what: string) {
  for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map((m) => m[1]);
    expect(new Set(names).size, `${what}: ${tag.slice(0, 160)}`).toBe(names.length);
  }
  const opened = (svg.match(/<(g|svg|text|clipPath)\b/g) ?? []).length;
  const closed = (svg.match(/<\/(g|svg|text|clipPath)>/g) ?? []).length;
  expect(opened, `${what}: a mark left open`).toBe(closed);
}
/** Everything on a plan on squares is where it can be. */
function sound(p: GridPlan, what: string) {
  expect(p.openings.every((o) => standsInWall(p, o)), `${what}: a door in no wall`).toBe(true);
  expect(new Set(p.openings.map(edgeKey)).size, `${what}: two doors in one place`).toBe(p.openings.length);
  expect(p.features.every((f) => regionAt(p, ...foot(f)) !== 0), `${what}: a thing on no floor`).toBe(true);
  expect(p.areas.every((a) => regionAt(p, a.x, a.y) !== 0), `${what}: a number on no floor`).toBe(true);
}

describe('the lie of the land', () => {
  it('makes a sound plan of every kind on every kind of ground, the same every time, drawn whole', () => {
    for (const kind of ['dungeon', 'cave', 'building', 'ship', 'settlement'] as const)
      for (const land of LANDS)
        for (const seed of [3, 7, 19]) {
          const s = named({ ...base, kind, land, seed, town: seed === 19 ? 'city' : 'town', water: (['none', 'river', 'coast'] as const)[seed % 3] });
          const what = `${kind} ${land} ${seed}`;
          const p = makePlan(s);
          expect(plain(makePlan(s)), what).toBe(plain(p));
          expect(p.land, what).toBe(land === 'plain' ? undefined : land);
          const names = s.names;
          if (kind !== 'building' && kind !== 'ship') expect(p.areas.map((a) => a.n), what).toEqual(names.map((_, i) => i + 1));
          if (p.kind !== 'settlement') sound(p, what);
          for (const o of [{}, { gm: false, numbers: false }, { paper: 'clear' as const }, { fill: 'solid' as const, grid: 'all' as const }]) {
            const svg = drawPlan(p, o).svg;
            expect(svg, what).not.toMatch(/NaN|undefined|Infinity/);
            wellFormed(svg, what);
            expect(svg.length).toBeGreaterThan(500);
          }
          // Put away and brought back, it is the same plan and the same picture.
          const back = unpack(JSON.parse(JSON.stringify(pack(p))));
          expect(plain(back), what).toBe(plain(p));
          expect(drawPlan(back).svg).toBe(drawPlan(p).svg);
          // The key has a line for each place, whatever the ground.
          expect(planKey(p, names).filter((l) => l.onPlan).length).toBe(p.areas.length);
        }
  });

  it('is nothing at all on ordinary ground: a plan with no lie of the land is the plan it always was', () => {
    for (const kind of ['dungeon', 'cave', 'building', 'settlement'] as const) {
      const s = named({ ...base, kind });
      expect(plain(makePlan({ ...s, land: 'plain' })), kind).toBe(plain(makePlan(s)));
      expect(drawPlan(makePlan({ ...s, land: 'plain' })).svg).toBe(drawPlan(makePlan(s)).svg);
    }
  });

  it('overgrown: growth on free floor, thickest by the walls, and walls the roots have broken', () => {
    const bare = grid({});
    const p = grid({ land: 'overgrown' });
    const growth = p.features.filter((f) => f.kind === 'growth');
    expect(growth.length).toBeGreaterThan(8);
    const numbers = new Set(p.areas.map((a) => `${Math.floor(a.x)},${Math.floor(a.y)}`));
    for (const f of growth) {
      expect(regionAt(p, f.x, f.y)).not.toBe(0);
      expect(numbers.has(`${f.x},${f.y}`)).toBe(false);
    }
    // What stood there before still stands, and nothing grows on it.
    expect(p.features.filter((f) => f.kind !== 'growth')).toEqual(bare.features);
    for (const f of growth) expect(featureAt(bare, f.x, f.y)).toBe(-1);
    expect(p.rough.size).toBeGreaterThan(bare.rough.size);
    expect(plain({ ...p, features: [], rough: [], land: undefined })).toBe(plain({ ...bare, features: [], rough: [] }));
    // A town: houses given up to it, its fields gone to groves.
    const t = town({ land: 'overgrown' });
    const was = town({});
    expect(t.growths!.length).toBeGreaterThan(20);
    expect(t.fields).toEqual([]);
    expect(t.buildings.length).toBeLessThan(was.buildings.length);
    expect(t.buildings.filter((b) => b.key).length).toBe(was.buildings.filter((b) => b.key).length);
  });

  it('shattered: a rift from side to side, nothing left standing in it, a bridge where a passage crosses, numbers on firm ground', () => {
    for (const seed of [2, 7, 11, 23, 31]) {
      const p = grid({ land: 'shattered', seed });
      expect(p.rifts!.length).toBeGreaterThanOrEqual(1);
      const gone = (x: number, y: number) => inRift(p.rifts, x + 0.5, y + 0.5, 0.1);
      for (const f of p.features) {
        if (f.kind === 'bridge') expect(gone(...foot(f)), `seed ${seed}`).toBe(true);
        else if (f.kind !== 'stairs') expect(gone(...foot(f)), `seed ${seed}: a ${f.kind} in the rift`).toBe(false);
      }
      // Every square of passage in the rift is bridged.
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (regionAt(p, x, y) === PASSAGE && gone(x, y)) expect(featureAt(p, x, y), `seed ${seed}: ${x},${y}`).toBeGreaterThanOrEqual(0);
      for (const a of p.areas) {
        const region = regionOf(p, a);
        let firm = false;
        let crossed = false;
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (regionAt(p, x, y) === region) gone(x, y) ? (crossed = true) : featureAt(p, x, y) < 0 && (firm = true);
        if (firm) expect(gone(Math.floor(a.x), Math.floor(a.y)), `seed ${seed}: ${a.name}`).toBe(false);
        expect(a.exits.includes('the rift runs through it'), `seed ${seed}: ${a.name}`).toBe(crossed);
      }
    }
    // A town: no house on the rift, and a great road that meets it is bridged.
    let bridged = 0;
    for (const seed of [2, 7, 11, 23]) {
      const t = town({ land: 'shattered', seed, water: 'none' });
      const [r] = t.rifts!;
      for (const b of t.buildings) for (const c of b.corners) expect(inRift(t.rifts, c[0], c[1])).toBe(false);
      for (const b of t.bridges) expect(inRift([{ ...r, width: r.width + 1 }], b.x, b.y)).toBe(true);
      bridged += t.bridges.length;
    }
    expect(bridged).toBeGreaterThan(0);
  });

  it('adrift: a dungeon’s passages are gone, and the doors that opened on each are lettered alike', () => {
    for (const seed of [2, 7, 11, 23, 31]) {
      const bare = grid({ seed });
      const p = grid({ land: 'adrift', seed });
      const lettered = p.openings.filter((o) => o.to);
      expect(lettered.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      const by = new Map<string, number>();
      for (const o of lettered) by.set(o.to!, (by.get(o.to!) ?? 0) + 1);
      // No door is lettered alone: each opens on at least one other.
      for (const [letter, n] of by) expect(n, `seed ${seed}: ${letter}`).toBeGreaterThanOrEqual(2);
      const passage = (g: GridPlan) => g.cells.filter((v) => v === PASSAGE).length;
      expect(passage(p)).toBeLessThan(passage(bare));
      // Every room is still there, with its doors; and the way in still has its stairs.
      expect(p.areas.map((a) => a.name)).toEqual(bare.areas.map((a) => a.name));
      expect(p.cells.filter((v) => v > PASSAGE).length).toBe(bare.cells.filter((v) => v > PASSAGE).length);
      expect(p.features.some((f) => f.kind === 'stairs')).toBe(true);
      // The key says which doors are which, and the GM's copy shows the letters; the players' does not.
      expect(p.areas.some((a) => a.exits.some((e) => /, marked [A-Z]/.test(e)))).toBe(true);
      const letter = [...by.keys()][0];
      expect(drawPlan(p).svg).toContain(`font-style="italic" text-anchor="middle" dominant-baseline="central" fill="#a3261e" stroke="#ffffff" stroke-width="12" paint-order="stroke">${letter}<`);
      expect(drawPlan(p, { gm: false }).svg).not.toContain(`paint-order="stroke">${letter}<`);
    }
  });

  it('unearthly: no wall straight, and more ways round than were asked for', () => {
    const p = grid({ land: 'unearthly', ways: 'one' });
    const few = grid({ ways: 'one' });
    for (const v of new Set(Array.from(p.cells).filter(Boolean))) expect(p.rough.has(v)).toBe(true);
    expect(p.openings.length).toBeGreaterThan(few.openings.length);
    // A town turned about its middle: as many houses, none where it was.
    const [t, was] = [town({ land: 'unearthly' }), town({})];
    expect(t.buildings.length).toBe(was.buildings.length);
    expect(t.buildings.filter((b, i) => plain(b.corners) === plain(was.buildings[i].corners)).length).toBeLessThan(was.buildings.length * 0.1);
    for (const a of t.areas) expect(a.x > -2 && a.y > -2 && a.x < t.w + 2 && a.y < t.h + 2).toBe(true);
  });

  it('aloft, adrift and the void: a town on an island, with nothing beyond its edge and stages where its roads end', () => {
    for (const land of ['aloft', 'void', 'adrift'] as const)
      for (const seed of [2, 7, 11]) {
        const t = town({ land, seed, town: seed === 11 ? 'city' : 'town' });
        const what = `${land} ${seed}`;
        expect(t.island!.length, what).toBeGreaterThan(8);
        for (const b of t.buildings) for (const c of b.corners) expect(inside(c, t.island!), what).toBe(true);
        for (const a of t.areas) expect(inside([a.x, a.y], t.island!), `${what}: ${a.name}`).toBe(true);
        expect([t.rivers, t.water]).toEqual([[], []]);
        for (const r of t.roads) for (const q of r.points) expect(inside(q, t.island!), what).toBe(true);
        expect(t.piers.length, what).toBeGreaterThan(0);
        const svg = drawPlan(t).svg;
        // The void is a black sheet; on see-through paper there is no sheet to blacken.
        expect(svg.includes('fill="#0b0c11"'), what).toBe(land === 'void');
        expect(drawPlan(t, { paper: 'clear' }).svg).not.toContain('#0b0c11');
      }
    // A district cut from a town on an island is on the same ground: its edge comes with it, drawn closer.
    const city = town({ land: 'aloft', town: 'city', districts: true, seed: 11 });
    const cut = districtPlan(city, 0)!.plan;
    expect(cut.land).toBe('aloft');
    expect(cut.island!.length).toBe(city.island!.length);
    expect(drawPlan(cut).svg).not.toMatch(/NaN|undefined/);
    const rent = districtPlan(town({ land: 'shattered', town: 'city', districts: true, seed: 11 }), 0)!.plan;
    expect(rent.rifts![0].width).toBeGreaterThan(town({ land: 'shattered', town: 'city', seed: 11 }).rifts![0].width * 2.9);
    // A dungeon is the same dungeon, drawn as an island: its ground a square or two wide, and the sheet black in the void.
    const [bare, aloft, dark] = [grid({}), grid({ land: 'aloft' }), grid({ land: 'void' })];
    expect(plain({ ...aloft, land: undefined })).toBe(plain(bare));
    expect(drawPlan(dark).svg).toContain('fill="#0b0c11"');
    expect(drawPlan(aloft).svg).not.toBe(drawPlan(bare).svg);
  });

  it('keeps its ground, and its rifts in their place, through changes made by hand', () => {
    const p = grid({ land: 'shattered' });
    const [made, dx, dy] = withShift(() => addRoom(p, 0, 0, 2, 1, 8, 'Closet'));
    expect([dx, dy]).toEqual([2, 2]);
    expect(made!.land).toBe('shattered');
    expect(made!.rifts![0].points).toEqual(p.rifts![0].points.map(([x, y]) => [x + 2, y + 2]));
  });

  it('is called by plain names of the app’s own, and suggested from what a record is called and how it begins', () => {
    const words = Object.values(LAND_LABELS).map((l) => `${l.label} ${l.hint}`).join(' ');
    expect(words).not.toMatch(/spelljammer|far realm|astral plane|feywild|shadowfell|wildspace|ravenloft|eberron/i);
    expect(Object.keys(LAND_LABELS)).toEqual([...LANDS]);
    const facts = { id: 'X-1', type: 'dungeon', fields: [] as [string, string][], children: [], terrain: [], danger: 'risky' as const, wealth: 'modest' as const };
    const land = (name: string, body = '', realm?: string): Land | undefined => suggest({ ...facts, name, body, realm }).land;
    expect(land('Zepharyos, the Floating City')).toBe('aloft');
    expect(land('The Hollow Verge', 'A waystation.', 'The Ethereal Realm')).toBe('adrift');
    expect(land('The Nameless Asylum', 'A house of the lost.', 'The Hollow Verge. The Ethereal Realm')).toBe('adrift');
    expect(land('Zepharyos', 'The City of the Unbound, among the clouds. Capital of the Fractured Nexus.')).toBe('aloft');
    expect(land('The Weeping Caves', 'Fungus grows on every wall, and the spores drift.')).toBe('overgrown');
    expect(land('The Fractured Nexus')).toBe('shattered');
    expect(land('The Lantern', 'A voidship lost among the stars.')).toBe('void');
    expect(land('The Sunken Vault', 'Stairs go down under the fields.')).toBeUndefined();
    // A word three sentences down does not put a place on that ground.
    expect(land('Ashvale', 'A farming village. It is quiet. Travellers speak of the rift to the east.')).toBeUndefined();
  });
});

describe('a ship', () => {
  it('is a hull with its decks, each a little shorter than the one above, joined by ladders, with masts and a helm', () => {
    const sizes = { small: { decks: 2, masts: 1, length: 14 }, medium: { decks: 3, masts: 2, length: 22 }, large: { decks: 4, masts: 3, length: 30 } } as const;
    for (const size of ['small', 'medium', 'large'] as const)
      for (const seed of [1, 5, 9]) {
        const p = grid({ kind: 'ship', size, seed });
        const S = sizes[size];
        const what = `${size} ${seed}`;
        expect(p.kind).toBe('ship');
        expect(p.captions.length, what).toBe(S.decks);
        expect(p.features.filter((f) => f.kind === 'mast').length, what).toBe(S.masts);
        expect(p.features.filter((f) => f.kind === 'helm').length, what).toBe(1);
        // A ladder down from each deck but the last, and up to each but the first.
        expect(p.features.filter((f) => f.kind === 'stairs').length, what).toBe((S.decks - 1) * 2);
        expect(p.areas.filter((a) => a.exits.includes('ladder down')).length).toBe(S.decks - 1);
        expect(p.areas.filter((a) => a.exits.includes('ladder up')).length).toBe(S.decks - 1);
        expect(new Set(p.areas.map((a) => a.floor)).size).toBe(S.decks);
        expect(p.areas.map((a) => a.n)).toEqual(p.areas.map((_, i) => i + 1));
        expect(p.feet).toBe(5);
        // Nothing around it is rock: its hull is its outer wall.
        expect(p.rock.every((v) => v === 0)).toBe(true);
        // The top deck is as long as the ship; each deck is the same either side of its centre line.
        const rows = Array.from({ length: p.h }, (_, y) => Array.from({ length: p.w }, (_, x) => (regionAt(p, x, y) ? 1 : 0)));
        const widths = rows.map((r) => r.reduce((s: number, v) => s + v, 0));
        expect(Math.max(...widths), what).toBe(S.length);
        const decks: number[][] = [];
        rows.forEach((_, y) => (widths[y] ? (widths[y - 1] ? decks[decks.length - 1].push(y) : decks.push([y])) : null));
        expect(decks.length, what).toBe(S.decks);
        for (const d of decks) for (let k = 0; k < d.length >> 1; k++) expect(rows[d[k]].join(''), what).toBe(rows[d[d.length - 1 - k]].join(''));
        // A door in every bulkhead: every compartment of a deck can be walked to from the next.
        for (const a of p.areas) if (p.areas.filter((b) => b.floor === a.floor).length > 1) expect(a.exits.some((e) => /^(door|portcullis) /.test(e)), `${what}: ${a.name}`).toBe(true);
        sound(p, what);
      }
  });

  it('puts the compartments its record names on the decks their names suit, and always has an open deck and a hold', () => {
    const names = ['Captain’s cabin', 'Galley', 'Brig', 'Crew quarters', 'Powder store', 'Shrine of the Storm'];
    const p = makePlan({ ...base, kind: 'ship', names }) as GridPlan;
    const deck = (name: string) => p.areas.find((a) => a.name === name)!.floor;
    expect(p.areas.slice(0, 6).map((a) => a.name)).toEqual(names);
    expect(deck('Captain’s cabin')).toBe('Main deck');
    expect(deck('Brig')).toBe('Hold');
    expect(deck('Powder store')).toBe('Hold');
    expect(deck('Galley')).toBe('Lower deck');
    // The open deck it did not name is there all the same, numbered after the rest.
    expect(p.areas.map((a) => a.name)).toContain('Main deck');
    expect(p.areas.find((a) => a.name === 'Main deck')!.n).toBe(7);
    // A brig has bars.
    expect(p.areas.find((a) => a.name === 'Brig')!.exits.some((e) => e.startsWith('portcullis'))).toBe(true);
    sound(p, 'named');
    // The key gives each its deck.
    expect(planKey(p, p.areas.map((a) => a.name))[2].detail).toMatch(/^Hold, /);
  });

  it('sails the sea, the sky or the void, and is suggested for a record that is one', () => {
    const [sea, sky, dark] = [grid({ kind: 'ship' }), grid({ kind: 'ship', land: 'aloft' }), grid({ kind: 'ship', land: 'void' })];
    expect(plain({ ...sky, land: undefined })).toBe(plain(sea));
    const svgs = [sea, sky, dark].map((p) => drawPlan(p).svg);
    expect(new Set(svgs).size).toBe(3);
    expect(svgs[2]).toContain('#0b0c11');
    expect(svgs[0]).not.toContain('#0b0c11');
    expect(PLAN_LABELS.ship).toBe('Ship');
    const facts = { id: 'X-1', fields: [] as [string, string][], body: '', children: [], terrain: [], danger: 'risky' as const, wealth: 'modest' as const };
    expect(suggest({ ...facts, type: 'landmark', name: 'The Sea Wyrm, a galleon' })).toMatchObject({ kind: 'ship', size: 'large' });
    expect(suggest({ ...facts, type: 'landmark', name: 'The ferryman’s boat' })).toMatchObject({ kind: 'ship', size: 'small' });
    expect(suggest({ ...facts, type: 'building', name: 'The Starwind', fields: [['Used for', 'a skyship']] })).toMatchObject({ kind: 'ship', land: 'aloft' });
    // An inn called for a ship is an inn.
    expect(suggest({ ...facts, type: 'building', name: 'The Ship Inn' }).kind).toBe('building');
    expect(suggest({ ...facts, type: 'settlement', name: 'Shipwreck Bay' }).kind).toBe('settlement');
  });
});

describe('a plan on its ground, kept', () => {
  it('offers the ground of the realm a place is in, and of the realm that one is in', async () => {
    const gm = createApp(tempContext());
    const made = async (body: object) => (await request(gm).post('/api/realms').send(body)).body as { id: string };
    const realm = await made({ name: 'The Ethereal Realm', kind: 'realm' });
    const domain = await made({ name: 'The Hollow Verge', kind: 'domain', parent_id: realm.id });
    expect(domain.id).toBeTruthy();
    const place = (await request(gm).post('/api/entities').send({ realm: domain.id, name: 'The Nameless Asylum', type: 'landmark' })).body as { id: string };
    const got = (await request(gm).get(`/api/entities/${place.id}/plan`)).body as { suggested: PlanSettings };
    expect(got.suggested.land).toBe('adrift');
  });

  it('is kept by the server as it is chosen and as it is drawn, for every kind and every ground', async () => {
    const gm = createApp(tempContext());
    const place = (await request(gm).post('/api/entities').send({ realm: 'world', name: 'The Lantern', type: 'landmark' })).body as { id: string };
    const url = `/api/entities/${place.id}/plan`;
    for (const kind of ['dungeon', 'cave', 'building', 'ship', 'settlement'] as const)
      for (const land of LANDS) {
        const s = named({ ...base, kind, land, town: 'city', water: 'coast' });
        const what = `${kind} ${land}`;
        expect((await request(gm).put(url).send(s)).status, what).toBe(200);
        expect(plain(makePlan((await request(gm).get(url)).body.saved)), what).toBe(plain(makePlan(s)));
        const p = makePlan(s);
        const sent = await request(gm).put(url).send({ ...s, seed: 999, drawn: pack(p) });
        expect(sent.status, `${what}: ${JSON.stringify(sent.body).slice(0, 300)}`).toBe(200);
        expect(plain(makePlan((await request(gm).get(url)).body.saved)), what).toBe(plain(p));
      }
    // A district of a city on each ground, cut out and kept.
    for (const land of LANDS) {
      const s = named({ ...base, kind: 'settlement', land, town: 'city', districts: true, seed: 11 });
      const cut = districtPlan(makePlan(s) as TownPlan, 1)!.plan;
      const sent = await request(gm).put(url).send({ ...s, districts: false, names: cut.areas.map((a) => a.name), drawn: cut });
      expect(sent.status, `district ${land}: ${JSON.stringify(sent.body).slice(0, 300)}`).toBe(200);
    }
    expect((await request(gm).put(url).send({ ...named(base), land: 'underwater' })).status).toBe(400);
    expect((await request(gm).put(url).send({ ...named(base), kind: 'spaceship' })).status).toBe(400);
    // A ship's record is suggested a ship.
    const ship = (await request(gm).post('/api/entities').send({ realm: 'world', name: 'The Sea Wyrm, a galleon', type: 'landmark' })).body as { id: string };
    expect((await request(gm).get(`/api/entities/${ship.id}/plan`)).body.suggested).toMatchObject({ kind: 'ship', size: 'large' });
  });
});
