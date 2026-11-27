/** Plans changed by hand (v0.9.26): the drawing put away and brought back, and every change that can be made to it. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { exportJson, importJson } from '../server/src/backup/exporter.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import {
  PASSAGE,
  PIECES,
  addBuilding,
  addNumber,
  addRoom,
  areaIn,
  buildingAt,
  closeUp,
  drawPlan,
  edgeKey,
  edgeToward,
  featureAt,
  fit,
  keep,
  madeNames,
  makePlan,
  moveBuilding,
  moveNumber,
  moveRoom,
  nearestEdge,
  numberBuilding,
  openingAt,
  pack,
  paint,
  pieceSize,
  putThing,
  regionAt,
  redrawRest,
  refurnish,
  regionOf,
  removeBuilding,
  removeRoom,
  rename,
  renumber,
  resizeRoom,
  roomBox,
  rubOut,
  scaleBuilding,
  setDown,
  setOpening,
  standsInWall,
  takeThing,
  turnBuilding,
  turnThing,
  unnumber,
  unpack,
  withShift,
  type GridPlan,
  type PlanSettings,
  type TownPlan,
} from '../shared/plan/index.js';

const base: PlanSettings = { kind: 'dungeon', seed: 7, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: true, use: 'house', town: 'village', water: 'none', walled: false, around: 'fields' };
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as number[]) : x instanceof Set ? [...x] : x));
const dungeon = (seed = 7, n = 8) => makePlan({ ...base, seed, names: madeNames({ ...base, seed }, 'The Old Keep', n) }) as GridPlan;
/** A bare sheet of rock, to draw on. */
const blank = (w = 20, h = 20): GridPlan => ({ kind: 'dungeon', w, h, feet: 5, cells: new Int16Array(w * h), rough: new Set(), rock: new Uint8Array(w * h).fill(1), openings: [], features: [], areas: [], captions: [] });
/** Whether everything on a plan is where it can be: doors in walls, things and numbers on floors, margins as they should be. */
function sound(p: GridPlan) {
  expect(p.openings.every((o) => standsInWall(p, o)), 'a door in no wall').toBe(true);
  expect(p.features.every((f) => regionAt(p, f.x + f.w / 2, f.y + f.h / 2) !== 0), 'a thing on no floor').toBe(true);
  expect(p.areas.every((a) => regionAt(p, a.x, a.y) !== 0), 'a number on no floor').toBe(true);
  expect(p.areas.map((a) => a.n), 'numbers out of order').toEqual([...p.areas.map((a) => a.n)].sort((a, b) => a - b));
  expect(new Set(p.openings.map(edgeKey)).size, 'two openings in one place').toBe(p.openings.length);
  let [x0, y0, x1, y1] = [p.w, p.h, -1, -1];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.cells[y * p.w + x]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  if (x1 >= 0 && !p.openings.some((o) => o.kind === 'open')) expect([x0, y0, p.w - 1 - x1, p.h - 1 - y1], 'the margins').toEqual([2, p.captions.length ? 3 : 2, 2, 3]);
}

describe('a plan put away and brought back', () => {
  it('is the same plan, and the same drawing, for every kind', () => {
    for (const kind of ['dungeon', 'cave', 'building', 'settlement'] as const) {
      const s = { ...base, kind, names: madeNames({ ...base, kind }, 'x', 7) };
      const plan = makePlan(s);
      const back = unpack(JSON.parse(JSON.stringify(pack(plan))));
      expect(plain(back), kind).toBe(plain(plan));
      expect(drawPlan(back).svg, kind).toBe(drawPlan(plan).svg);
      // Kept with the plan's settings, it is the plan, whatever the seed says.
      expect(plain(makePlan({ ...s, seed: 999, drawn: pack(plan) })), kind).toBe(plain(plan));
    }
  });

  it('is far smaller put away than its squares one by one', () => {
    const plan = dungeon(11, 16);
    const packed = pack(plan);
    if (packed.kind === 'settlement') throw new Error('not a grid');
    expect(packed.cells.length).toBeLessThan(plan.cells.length / 2);
    expect(JSON.stringify(packed).length).toBeLessThan(40000);
  });
});

describe('a dungeon changed by hand', () => {
  it('gets a new room where the GM drags one, numbered and sized, and the sheet grows to hold it', () => {
    const p = addRoom(blank(), 5, 5, 9, 7, 1, 'Guard room')!;
    sound(p);
    expect(p.areas).toMatchObject([{ n: 1, name: 'Guard room', feet: [25, 15], exits: [] }]);
    const region = regionOf(p, p.areas[0]);
    expect(roomBox(p, region)).toMatchObject({ w: 5, h: 3, whole: true, squares: 15 });
    expect([p.w, p.h]).toEqual([9, 8]);
    // A second, overlapping the first: it takes only what is free.
    const q = addRoom(p, 4, 2, 9, 5, 2, 'Store')!;
    sound(q);
    expect(roomBox(q, regionOf(q, q.areas[0]))!.squares).toBe(15);
    expect(roomBox(q, regionOf(q, q.areas[1]))!.whole).toBe(false);
    // Wholly on another room: nothing to make a room of.
    expect(addRoom(p, 3, 3, 4, 3, 2, 'Nothing')).toBeNull();
    // The plan it was made from is as it was.
    expect(p.areas).toHaveLength(1);
  });

  it('has passages cut and squares rubbed out, with doors and things that lose their place taken away', () => {
    let p = addRoom(blank(), 4, 4, 6, 6, 1, 'A')!;
    // A second room drawn in the margin, a square clear of the first: the sheet grows to give it its own margin.
    p = addRoom(p, p.w - 1, 2, p.w - 1, 4, 2, 'B')!;
    // Two rooms with a gap; a passage between them.
    const [a, b] = p.areas;
    const [ra, rb] = [roomBox(p, regionOf(p, a))!, roomBox(p, regionOf(p, b))!];
    const y = ra.y + 1;
    const gap: [number, number][] = [];
    for (let x = ra.x + ra.w; x < rb.x; x++) gap.push([x, y]);
    expect(gap.length).toBeGreaterThan(0);
    p = paint(p, gap, PASSAGE);
    sound(p);
    expect(gap.every(([x, gy]) => regionAt(p, x, gy) === PASSAGE)).toBe(true);
    // A door at each end, and the rooms say so.
    const [ra2, rb2] = [roomBox(p, regionOf(p, p.areas[0]))!, roomBox(p, regionOf(p, p.areas[1]))!];
    p = setOpening(p, ra2.x + ra2.w, ra2.y + 1, 'w', 'door')!;
    p = setOpening(p, rb2.x, ra2.y + 1, 'w', 'secret')!;
    sound(p);
    expect(p.areas[0].exits).toEqual(['door east']);
    expect(p.areas[1].exits).toEqual(['secret door west']);
    // No wall, no door: in the middle of a room, or in solid rock.
    expect(setOpening(p, ra2.x + 1, ra2.y + 1, 'w', 'door')).toBeNull();
    expect(setOpening(p, 0, 0, 'n', 'door')).toBeNull();
    // Changed to another kind, then taken out.
    p = setOpening(p, ra2.x + ra2.w, ra2.y + 1, 'w', 'arch')!;
    expect(openingAt(p, ra2.x + ra2.w, ra2.y + 1, 'w')?.kind).toBe('arch');
    expect(p.areas[0].exits).toEqual(['archway east']);
    // A thing in the passage; the passage rubbed out: the thing and both doors go, the rooms stay.
    const mid = gap[gap.length >> 1];
    p = putThing(p, 'trap', mid[0], mid[1])!;
    expect(featureAt(p, mid[0], mid[1])).toBeGreaterThanOrEqual(0);
    const cut = rubOut(p, p.cells.reduce<[number, number][]>((out, v, i) => (v === PASSAGE ? [...out, [i % p.w, Math.floor(i / p.w)]] : out), []));
    sound(cut);
    expect(cut.openings).toEqual([]);
    expect(cut.features).toEqual([]);
    expect(cut.areas.map((k) => k.exits)).toEqual([[], []]);
    // Painting a room's own squares on: the room grows, and is no longer an oblong.
    const grown = paint(cut, [[roomBox(cut, regionOf(cut, cut.areas[0]))!.x - 1, roomBox(cut, regionOf(cut, cut.areas[0]))!.y]], regionOf(cut, cut.areas[0]));
    sound(grown);
    expect(roomBox(grown, regionOf(grown, grown.areas[0]))).toMatchObject({ w: 4, whole: false, squares: 10 });
  });

  it('moves a room with what is in it, keeps the doors that still stand in a wall, and refuses to put it on another', () => {
    const p = dungeon(7, 6);
    sound(p);
    for (const a of p.areas) {
      const region = regionOf(p, a);
      const box = roomBox(p, region)!;
      const things = p.features.filter((f) => regionAt(p, f.x + f.w / 2, f.y + f.h / 2) === region).length;
      for (const [dx, dy] of [
        [1, 0],
        [0, -1],
        [-2, 0],
        [0, 3],
      ]) {
        const q = moveRoom(p, region, dx, dy);
        if (!q) continue;
        sound(q);
        const moved = q.areas.find((k) => k.n === a.n)!;
        const now = regionOf(q, moved);
        expect(roomBox(q, now)).toMatchObject({ w: box.w, h: box.h, squares: box.squares });
        // (Moved over a passage, it takes in whatever stood there too.)
        expect(q.features.filter((f) => regionAt(q, f.x + f.w / 2, f.y + f.h / 2) === now).length, `room ${a.n}: its things`).toBeGreaterThanOrEqual(things);
        expect(q.areas).toHaveLength(p.areas.length);
      }
    }
    // Onto another room: refused, and nothing is changed.
    const [first, second] = p.areas;
    const [b1, b2] = [roomBox(p, regionOf(p, first))!, roomBox(p, regionOf(p, second))!];
    expect(moveRoom(p, regionOf(p, first), b2.x - b1.x, b2.y - b1.y)).toBeNull();
    expect(moveRoom(p, PASSAGE, 1, 0)).toBeNull();
    expect(moveRoom(p, regionOf(p, first), 0, 0)).toBeNull();
  });

  it('resizes an oblong room, keeps its number inside it, and takes a room away with its number', () => {
    let p = addRoom(blank(), 5, 5, 9, 8, 1, 'Hall')!;
    p = putThing(p, 'pillar', 6, 5)!;
    const region = regionOf(p, p.areas[0]);
    const box = roomBox(p, region)!;
    const small = resizeRoom(p, region, box.x, box.y, 2, 2)!;
    sound(small);
    expect(small.areas[0].feet).toEqual([10, 10]);
    expect(roomBox(small, regionOf(small, small.areas[0]))).toMatchObject({ w: 2, h: 2 });
    // The pillar was in the part given up.
    expect(small.features).toEqual([]);
    const wide = resizeRoom(p, region, box.x, box.y, box.w + 2, box.h)!;
    sound(wide);
    expect(wide.areas[0].feet).toEqual([(box.w + 2) * 5, box.h * 5]);
    // Past the edge of the sheet, the sheet grows to take it; and a room dragged off the edge takes the sheet with it.
    const wider = resizeRoom(p, region, box.x - 4, box.y, box.w + 9, box.h)!;
    sound(wider);
    expect(wider.areas[0].feet).toEqual([(box.w + 9) * 5, box.h * 5]);
    const off = moveRoom(p, region, -6, 7)!;
    sound(off);
    expect([off.w, off.h]).toEqual([p.w, p.h]);
    expect(off.features).toHaveLength(1);
    expect(wide.features).toHaveLength(1);
    // Not an oblong any more: it cannot be resized as one.
    const odd = paint(p, [[box.x - 1, box.y]], region);
    expect(resizeRoom(odd, regionOf(odd, odd.areas[0]), 3, 3, 4, 4)).toBeNull();

    const d = dungeon(3, 6);
    const gap = removeRoom(d, 3);
    sound(gap);
    // The numbers are left as they were, so that the key can be put in the same order; then they close up.
    expect(gap.areas.map((a) => a.n)).toEqual([1, 2, 4, 5, 6]);
    const { plan: gone, order } = closeUp(gap);
    expect(order).toEqual([1, 2, 4, 5, 6]);
    expect(closeUp(gone).plan).toBe(gone);
    expect(gone.areas.map((a) => a.n)).toEqual([1, 2, 3, 4, 5]);
    expect(gone.areas.map((a) => a.name)).toEqual(d.areas.filter((a) => a.n !== 3).map((a) => a.name));
    expect(gone.cells.filter((v) => v > PASSAGE).length).toBeLessThan(d.cells.filter((v) => v > PASSAGE).length);
  });

  it('sets things down, turns them and takes them away; moves a number; puts one on a cave floor', () => {
    let p = addRoom(blank(), 5, 5, 10, 9, 1, 'Hall')!;
    const { x, y } = roomBox(p, regionOf(p, p.areas[0]))!;
    p = putThing(p, 'bed', x, y, 0)!;
    expect(p.features[0]).toMatchObject({ kind: 'bed', w: 0.76, h: 1.76, dir: 0 });
    p = turnThing(p, x, y)!;
    expect(p.features[0]).toMatchObject({ kind: 'bed', w: 1.76, h: 0.76, dir: 1 });
    // Another thing on the same square takes its place.
    p = putThing(p, 'chest', x, y)!;
    expect(p.features.map((f) => f.kind)).toEqual(['chest']);
    expect(takeThing(p, x, y)!.features).toEqual([]);
    expect(takeThing(p, x + 3, y + 3)).toBeNull();
    expect(putThing(p, 'altar', 0, 0)).toBeNull();
    const there = moveNumber(p, 1, x + 4, y + 3)!;
    expect([there.areas[0].x, there.areas[0].y]).toEqual([x + 4.5, y + 3.5]);
    expect(moveNumber(p, 1, 0, 0)).toBeNull();

    const cave = makePlan({ ...base, kind: 'cave', names: ['Cave mouth', 'Den'] }) as GridPlan;
    const floor = cave.cells.findIndex((v, i) => v !== 0 && !cave.areas.some((a) => Math.floor(a.y) * cave.w + Math.floor(a.x) === i));
    const more = addNumber(cave, floor % cave.w, Math.floor(floor / cave.w), 3, 'Pool')!;
    expect(more.areas.map((a) => a.name)).toEqual(['Cave mouth', 'Den', 'Pool']);
    expect(addNumber(cave, 0, 0, 3, 'Rock')).toBeNull();
    // A cave is all one floor: taking a place out of it takes its number, not the cave.
    const less = closeUp(removeRoom(more, 2)).plan;
    expect(less.areas.map((a) => a.name)).toEqual(['Cave mouth', 'Pool']);
    expect(less.cells.filter(Boolean).length).toBe(more.cells.filter(Boolean).length);
    expect(areaIn(cave, 2)).toBeUndefined();
  });

  it('renumbers, renames and marks places kept', () => {
    const d = dungeon(5, 4);
    const turned = renumber(d, [3, 1, 4, 2]);
    expect(turned.areas.map((a) => [a.n, a.name])).toEqual([
      [1, d.areas[2].name],
      [2, d.areas[0].name],
      [3, d.areas[3].name],
      [4, d.areas[1].name],
    ]);
    expect(rename(d, 2, 'Kennels').areas[1].name).toBe('Kennels');
    expect(keep(d, 2, true).areas.map((a) => !!a.kept)).toEqual([false, true, false, false]);
    expect(keep(keep(d, 2, true), 2, false).areas[1].kept).toBeUndefined();
  });

  it('says how far a change has moved what was drawn, so that a cursor can stay where it was on the drawing', () => {
    const d = dungeon(5, 6);
    // A room in the top corner of the sheet, which is margin: the sheet grows two squares at the left and at the top.
    const [made, dx, dy] = withShift(() => addRoom(d, 0, 0, 2, 1, 7, 'Closet'));
    expect([dx, dy]).toEqual([2, 2]);
    expect(regionAt(made!, 0 + dx, 0 + dy)).toBe(regionOf(made!, made!.areas[6]));
    d.areas.forEach((a, i) => expect([made!.areas[i].x - a.x, made!.areas[i].y - a.y]).toEqual([2, 2]));
    // A change that moves nothing says so; and so does one made after one that did.
    expect(withShift(() => putThing(d, 'pillar', Math.floor(d.areas[0].x), Math.floor(d.areas[0].y))).slice(1)).toEqual([0, 0]);
    // Rubbing the new room out again brings the sheet back in.
    const [back, bx, by] = withShift(() => rubOut(made!, [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]]));
    expect([bx, by]).toEqual([-2, -2]);
    expect([back.w, back.h]).toEqual([d.w, d.h]);
  });

  it('finds the wall nearest a point in a square, and the one crossed in stepping from it', () => {
    expect(nearestEdge(4, 6, 0.5, 0.1)).toEqual({ x: 4, y: 6, side: 'n' });
    expect(nearestEdge(4, 6, 0.9, 0.5)).toEqual({ x: 5, y: 6, side: 'w' });
    expect(nearestEdge(4, 6, 0.5, 0.95)).toEqual({ x: 4, y: 7, side: 'n' });
    expect(nearestEdge(4, 6, 0.05, 0.5)).toEqual({ x: 4, y: 6, side: 'w' });
    expect([0, 1, 2, 3].map((d) => edgeToward(4, 6, d))).toEqual([
      { x: 4, y: 6, side: 'n' },
      { x: 5, y: 6, side: 'w' },
      { x: 4, y: 7, side: 'n' },
      { x: 4, y: 6, side: 'w' },
    ]);
  });

  it('stays sound through a long run of changes made at random', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
    let p = dungeon(9, 7);
    for (let step = 0; step < 300; step++) {
      const [x, y] = [Math.floor(rnd() * p.w), Math.floor(rnd() * p.h)];
      const pickRoom = () => (p.areas.length ? regionOf(p, p.areas[Math.floor(rnd() * p.areas.length)]) : 0);
      const kind = Math.floor(rnd() * 9);
      const next =
        kind === 0
          ? addRoom(p, x, y, x + 1 + Math.floor(rnd() * 4), y + 1 + Math.floor(rnd() * 4), p.areas.length + 1, `Room ${step}`)
          : kind === 1
            ? paint(p, [[x, y], [x + 1, y], [x + 2, y]], rnd() < 0.5 ? PASSAGE : pickRoom() || PASSAGE)
            : kind === 2
              ? rubOut(p, [[x, y], [x, y + 1]])
              : kind === 3
                ? moveRoom(p, pickRoom(), Math.floor(rnd() * 5) - 2, Math.floor(rnd() * 5) - 2)
                : kind === 4
                  ? setOpening(p, x, y, rnd() < 0.5 ? 'n' : 'w', (['door', 'arch', 'secret', 'bars', null] as const)[Math.floor(rnd() * 5)])
                  : kind === 5
                    ? putThing(p, (['pillar', 'bed', 'stairs', 'pool', 'trap'] as const)[Math.floor(rnd() * 5)], x, y, Math.floor(rnd() * 4) as 0 | 1 | 2 | 3)
                    : kind === 6
                      ? p.areas.length > 2
                        ? removeRoom(p, 1 + Math.floor(rnd() * p.areas.length))
                        : null
                      : kind === 7
                        ? (() => {
                            const box = roomBox(p, pickRoom());
                            return box?.whole ? resizeRoom(p, regionAt(p, box.x, box.y), box.x, box.y, Math.max(1, box.w + Math.floor(rnd() * 3) - 1), Math.max(1, box.h + Math.floor(rnd() * 3) - 1)) : null;
                          })()
                        : setDown(p, PIECES[Math.floor(rnd() * PIECES.length)], x, y, Math.floor(rnd() * 4), p.areas.length + 1)?.plan;
      if (!next) continue;
      p = closeUp(next).plan;
      sound(p);
      expect(p.areas.map((a) => a.n)).toEqual(p.areas.map((_, i) => i + 1));
      // It can always be put away and brought back, and drawn.
      if (step % 25 === 0) {
        expect(plain(unpack(JSON.parse(JSON.stringify(pack(p)))))).toBe(plain(p));
        expect(drawPlan(p).svg).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
    expect(p.areas.length).toBeGreaterThan(0);
  });
});

describe('part of a plan drawn again', () => {
  /** A room's squares, as they lie to one another: the same wherever the sheet has put it. */
  const shape = (p: GridPlan, n: number) => {
    const region = regionOf(p, p.areas.find((a) => a.n === n)!);
    const box = roomBox(p, region)!;
    const squares: string[] = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.cells[y * p.w + x] === region) squares.push(`${x - box.x},${y - box.y}`);
    const things = p.features.filter((f) => regionAt(p, f.x + f.w / 2, f.y + f.h / 2) === region).map((f) => `${f.kind}@${(f.x - box.x).toFixed(2)},${(f.y - box.y).toFixed(2)}`);
    return { squares, things: things.sort(), box };
  };

  it('keeps the rooms marked to be kept, where they are to one another, with what is in them', () => {
    const names = madeNames(base, 'The Old Keep', 9);
    let p = makePlan({ ...base, names }) as GridPlan;
    // One of them made an odd shape by hand first: kept rooms need not be oblongs.
    const three = roomBox(p, regionOf(p, p.areas[2]))!;
    p = paint(p, [[three.x - 1, three.y]], regionOf(p, p.areas[2]));
    for (const n of [3, 4, 7]) p = keep(p, n, true);
    const before = [3, 4, 7].map((n) => shape(p, n));
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const next = redrawRest(p, base, names, seed)!;
      sound(next);
      expect(next.areas.map((a) => a.n), `seed ${seed}`).toEqual(names.map((_, i) => i + 1));
      expect(next.areas.map((a) => a.name)).toEqual(names);
      expect(next.areas.filter((a) => a.kept).map((a) => a.n)).toEqual([3, 4, 7]);
      const after = [3, 4, 7].map((n) => shape(next, n));
      after.forEach((a, i) => {
        expect(a.squares, `seed ${seed}`).toEqual(before[i].squares);
        expect(a.things).toEqual(before[i].things);
      });
      // They lie as they did to one another.
      expect([after[1].box.x - after[0].box.x, after[1].box.y - after[0].box.y, after[2].box.x - after[0].box.x, after[2].box.y - after[0].box.y]).toEqual([before[1].box.x - before[0].box.x, before[1].box.y - before[0].box.y, before[2].box.x - before[0].box.x, before[2].box.y - before[0].box.y]);
      // The rest is drawn afresh: not the plan it was.
      expect(plain(next)).not.toBe(plain(p));
      // Every room can be walked to from the first.
      const seen = new Set<number>([regionOf(next, next.areas[0])]);
      const doorways = next.openings.map((o) => (o.side === 'n' ? [regionAt(next, o.x, o.y - 1), regionAt(next, o.x, o.y)] : [regionAt(next, o.x - 1, o.y), regionAt(next, o.x, o.y)]));
      for (let grew = true; grew; ) {
        grew = false;
        for (const [a, b] of doorways) if (seen.has(a) !== seen.has(b)) (seen.add(a), seen.add(b), (grew = true));
      }
      for (const a of next.areas) expect(seen.has(regionOf(next, a)), `seed ${seed}: ${a.name} cut off`).toBe(true);
    }
    // The same number gives the same plan again; with nothing kept it is a dungeon like any other.
    expect(plain(redrawRest(p, base, names, 11))).toBe(plain(redrawRest(p, base, names, 11)));
    expect(redrawRest(makePlan({ ...base, kind: 'cave', names }), base, names, 3)).toBeNull();
  });

  it('keeps a door between two kept rooms that share a wall', () => {
    let p = addRoom(blank(30, 30), 6, 6, 10, 10, 1, 'Hall')!;
    const first = roomBox(p, regionOf(p, p.areas[0]))!;
    // Drawn off the edge of the sheet, which grows to take it.
    p = addRoom(p, first.x + first.w, first.y, first.x + first.w + 3, first.y + 4, 2, 'Vault')!;
    const [hall, vault] = p.areas.map((a) => roomBox(p, regionOf(p, a))!);
    expect([vault.x, vault.w, vault.h]).toEqual([hall.x + hall.w, 4, 5]);
    p = setOpening(p, vault.x, vault.y + 1, 'w', 'secret')!;
    p = keep(keep(p, 1, true), 2, true);
    const next = redrawRest(p, base, ['Hall', 'Vault', 'Guard room', 'Cells'], 5)!;
    sound(next);
    const [h2, v2] = [roomBox(next, regionOf(next, next.areas[0]))!, roomBox(next, regionOf(next, next.areas[1]))!];
    expect(v2.x).toBe(h2.x + h2.w);
    // The secret door is where it was, and it is the only way between the two.
    const between = next.openings.filter((o) => o.side === 'w' && o.x === v2.x && o.y >= v2.y && o.y < v2.y + v2.h);
    expect(between).toEqual([{ x: v2.x, y: v2.y + 1, side: 'w', kind: 'secret' }]);
    expect(next.areas).toHaveLength(4);
  });

  it('furnishes one room again to suit its name, leaving its walls, doors, stairs and number', () => {
    const d = dungeon(4, 8);
    const n = 2;
    const again = refurnish(d, base, n, 'Chapel', 77)!;
    sound(again);
    expect(plain({ ...again, features: [] })).toBe(plain({ ...d, features: [] }));
    const region = regionOf(d, d.areas[n - 1]);
    const inside = (p: GridPlan) => p.features.filter((f) => regionAt(p, f.x + f.w / 2, f.y + f.h / 2) === region);
    expect(inside(again).some((f) => f.kind === 'altar')).toBe(true);
    // Nothing outside the room is touched, and nothing stands on its number.
    const outside = (p: GridPlan) => plain(p.features.filter((f) => regionAt(p, f.x + f.w / 2, f.y + f.h / 2) !== region));
    expect(outside(again)).toBe(outside(d));
    const a = again.areas[n - 1];
    expect(inside(again).some((f) => a.x > f.x && a.x < f.x + f.w && a.y > f.y && a.y < f.y + f.h)).toBe(false);
    expect(refurnish(makePlan({ ...base, kind: 'cave', names: ['Den'] }), base, 1, 'Den', 1)).toBeNull();
    // A building's room takes what a building of its use has.
    const inn = makePlan({ ...base, kind: 'building', use: 'tavern' }) as GridPlan;
    const tap = refurnish(inn, { ...base, use: 'tavern' }, 1, 'Taproom', 3)!;
    sound(tap);
    expect(tap.features.some((f) => f.kind === 'counter')).toBe(true);
  });
});

describe('ready-made pieces', () => {
  it('each lie on a bare sheet as drawn, any way up: rooms numbered and named, doors in walls, things on floors', () => {
    expect(PIECES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PIECES.map((p) => p.key)).size).toBe(PIECES.length);
    for (const piece of PIECES)
      for (let turns = 0; turns < 4; turns++) {
        const made = setDown(blank(30, 30), piece, 8, 8, turns, 1);
        expect(made, `${piece.key} turned ${turns}`).not.toBeNull();
        const { plan, names } = made!;
        sound(plan);
        expect(names).toEqual(piece.rooms.map((r) => r.name));
        expect(plan.areas.map((a) => a.n)).toEqual(piece.rooms.map((_, i) => i + 1));
        // Every door and every thing the piece has is there: none fell off in the turning.
        expect(plan.openings, `${piece.key} turned ${turns}: its doors`).toHaveLength(piece.openings?.length ?? 0);
        expect(plan.features, `${piece.key} turned ${turns}: its things`).toHaveLength(piece.things?.length ?? 0);
        // Its floor is as many squares as it was drawn with, in a box of its turned size.
        const squares = new Set([...piece.rooms.flatMap((r) => r.boxes), ...(piece.passages ?? [])].flatMap(([bx, by, bw, bh]) => Array.from({ length: bw * bh }, (_, i) => `${bx + (i % bw)},${by + Math.floor(i / bw)}`))).size;
        expect(plan.cells.filter(Boolean).length).toBe(squares);
        const [w, h] = pieceSize(piece, turns);
        expect([plan.w, plan.h]).toEqual([w + 4, h + 5]);
        // No two rooms of a piece share a square, and every room is one room.
        expect(new Set(plan.areas.map((a) => regionOf(plan, a))).size).toBe(piece.rooms.length);
      }
  });

  it('are not set down on a room that is there or in a cave; set down off the sheet, the sheet grows', () => {
    const d = dungeon(7, 6);
    const box = roomBox(d, regionOf(d, d.areas[0]))!;
    expect(setDown(d, PIECES[0], box.x, box.y, 0, 7)).toBeNull();
    const off = setDown(blank(10, 10), PIECES[0], 8, 8, 0, 1)!;
    sound(off.plan);
    expect([off.plan.w, off.plan.h]).toEqual([PIECES[0].w + 4, PIECES[0].h + 5]);
    const far = setDown(d, PIECES[0], -6, -7, 1, 7)!;
    sound(far.plan);
    expect(far.plan.areas).toHaveLength(7);
    expect(setDown({ ...blank(30, 30), kind: 'cave' }, PIECES[0], 8, 8, 0, 1)).toBeNull();
    // Beside what is there, it joins on: a piece's passage runs into a passage already cut.
    const beside = setDown(d, PIECES.find((p) => p.key === 'guard-post')!, 0, 0, 0, 7);
    if (beside) sound(beside.plan);
  });
});

describe('a settlement changed by hand', () => {
  const town = () => makePlan({ ...base, kind: 'settlement', town: 'village', names: madeNames({ ...base, kind: 'settlement' }, 'x', 0) }) as TownPlan;

  it('has a building found under a point, moved, turned, made larger, and kept on the sheet', () => {
    const t = town();
    const i = t.buildings.findIndex((b) => !b.key);
    const b = t.buildings[i];
    const [cx, cy] = [b.corners.reduce((s, c) => s + c[0], 0) / b.corners.length, b.corners.reduce((s, c) => s + c[1], 0) / b.corners.length];
    expect(buildingAt(t, cx, cy)).toBe(i);
    expect(buildingAt(t, -5, -5)).toBe(-1);
    const moved = moveBuilding(t, i, 1.5, -0.5)!;
    expect(moved.buildings[i].corners[0]).toEqual([Math.round((b.corners[0][0] + 1.5) * 100) / 100, Math.round((b.corners[0][1] - 0.5) * 100) / 100]);
    expect(t.buildings[i].corners[0]).toEqual(b.corners[0]);
    expect(moveBuilding(t, i, 1000, 0)).toBeNull();
    const turned = turnBuilding(t, i, 90)!;
    const centre = (cs: [number, number][]) => [cs.reduce((s, c) => s + c[0], 0) / cs.length, cs.reduce((s, c) => s + c[1], 0) / cs.length];
    expect(centre(turned.buildings[i].corners)[0]).toBeCloseTo(cx, 1);
    expect(centre(turned.buildings[i].corners)[1]).toBeCloseTo(cy, 1);
    expect(turned.buildings[i].corners[0]).not.toEqual(b.corners[0]);
    const big = scaleBuilding(t, i, 1.5)!;
    const span = (cs: [number, number][]) => Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0]));
    expect(span(big.buildings[i].corners)).toBeCloseTo(span(b.corners) * 1.5, 1);
    expect(scaleBuilding(t, i, 100)).toBeNull();
  });

  it('carries a numbered building’s number with it, and closes the numbers up when one goes', () => {
    const t = town();
    const i = t.buildings.findIndex((b) => b.key === 2);
    const before = t.areas.find((a) => a.n === 2)!;
    const moved = moveBuilding(t, i, 2, 1)!;
    const after = moved.areas.find((a) => a.n === 2)!;
    expect([after.x - before.x, after.y - before.y].map((v) => Math.round(v * 10) / 10)).toEqual([2, 1]);
    const names = t.areas.map((a) => a.name);
    const gone = closeUp(removeBuilding(t, i)).plan;
    expect(gone.buildings).toHaveLength(t.buildings.length - 1);
    expect(gone.areas.map((a) => a.name)).toEqual(names.filter((_, k) => k !== 1));
    expect(gone.areas.map((a) => a.n)).toEqual(gone.areas.map((_, k) => k + 1));
    // Every numbered building still has its place in the key, and every place that was a building still has its building.
    for (const b of gone.buildings) if (b.key) expect(gone.areas.some((a) => a.n === b.key)).toBe(true);
    expect(gone.buildings.filter((b) => b.key).length).toBe(t.buildings.filter((b) => b.key).length - 1);
    // Taken out of the key only: the building stays, a house like any other.
    const plainHouse = closeUp(unnumber(t, 2)).plan;
    expect(plainHouse.buildings).toHaveLength(t.buildings.length);
    expect(plainHouse.buildings[i].key).toBeUndefined();
    expect(plainHouse.areas.map((a) => a.n)).toEqual(plainHouse.areas.map((_, k) => k + 1));
  });

  it('gets a new house where the GM clicks, and a number for a house that had none', () => {
    const t = town();
    const more = addBuilding(t, 5, 5)!;
    expect(more.buildings).toHaveLength(t.buildings.length + 1);
    expect(buildingAt(more, 5, 5)).toBe(more.buildings.length - 1);
    expect(addBuilding(t, -3, 5)).toBeNull();
    const n = more.areas.length + 1;
    const keyed = numberBuilding(more, more.buildings.length - 1, n, 'The Gilded Eel')!;
    expect(keyed.areas[keyed.areas.length - 1]).toMatchObject({ n, name: 'The Gilded Eel', x: 5, y: 5, feet: [30, 25] });
    expect(numberBuilding(keyed, keyed.buildings.length - 1, n + 1, 'Twice')).toBeNull();
    const order = keyed.areas.map((a) => a.n).reverse();
    const turned = renumber(keyed, order);
    expect(turned.areas[0].name).toBe('The Gilded Eel');
    expect(turned.buildings[turned.buildings.length - 1].key).toBe(1);
    expect(drawPlan(turned).svg).not.toMatch(/NaN|undefined/);
    expect(plain(unpack(JSON.parse(JSON.stringify(pack(turned)))))).toBe(plain(turned));
  });
});

describe('the sheet', () => {
  it('is cut and grown to its margins, and left alone on the side a cave opens to', () => {
    const p = addRoom(blank(40, 40), 20, 20, 22, 22, 1, 'Cell')!;
    expect([p.w, p.h]).toEqual([7, 8]);
    expect(fit(p)).toBe(p);
    const cave = makePlan({ ...base, kind: 'cave', names: ['Cave mouth', 'Den', 'Pool'] }) as GridPlan;
    expect(fit(cave)).toBe(cave);
    const open = cave.openings.find((o) => o.kind === 'open')!;
    // Painted and rubbed out elsewhere, the way out is still at the sheet's edge.
    const floor = cave.cells.findIndex((v, i) => v !== 0 && i % cave.w > 3 && i % cave.w < cave.w - 4 && Math.floor(i / cave.w) > 3 && Math.floor(i / cave.w) < cave.h - 4);
    const q = rubOut(cave, [[floor % cave.w, Math.floor(floor / cave.w)]]);
    const still = q.openings.find((o) => o.kind === 'open');
    expect(still).toBeDefined();
    expect(standsInWall(q, still!)).toBe(true);
    expect(still!.side).toBe(open.side);
  });
});

describe('a plan changed by hand, kept with its record', () => {
  it('is kept as it is drawn for every kind of place, and comes back the same', async () => {
    const gm = createApp(tempContext());
    const place = (await request(gm).post('/api/entities').send({ realm: 'world', name: 'Marrow Ford', type: 'settlement' })).body as { id: string };
    const url = `/api/entities/${place.id}/plan`;
    const kinds: Partial<PlanSettings>[] = [
      { kind: 'dungeon' },
      { kind: 'dungeon', rough: true },
      { kind: 'cave' },
      { kind: 'building', use: 'tavern' },
      { kind: 'building', use: 'keep' },
      { kind: 'settlement', town: 'hamlet', water: 'river' },
      { kind: 'settlement', town: 'village', water: 'coast' },
      { kind: 'settlement', town: 'town', water: 'river', walled: true, around: 'woods' },
      { kind: 'settlement', town: 'city', water: 'coast', walled: true },
    ];
    for (const k of kinds) {
      const s: PlanSettings = { ...base, ...k };
      s.names = s.kind === 'building' ? [] : madeNames(s, 'x', 7);
      const plan = makePlan(s);
      const sent = await request(gm).put(url).send({ ...s, seed: 999, drawn: pack(plan) });
      expect(sent.status, `${s.kind} ${s.town} ${s.water}: ${JSON.stringify(sent.body).slice(0, 300)}`).toBe(200);
      const back = (await request(gm).get(url)).body.saved as PlanSettings;
      expect(plain(makePlan(back)), `${s.kind} ${s.town}`).toBe(plain(plan));
    }
  });

  it('keeps what the editor does, refuses what is not a drawing, and travels in a backup', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const vault = (await request(gm).post('/api/entities').send({ realm: 'world', name: 'The Sunken Vault', type: 'dungeon' })).body as { id: string };
    const url = `/api/entities/${vault.id}/plan`;
    const s = { ...base, names: madeNames(base, 'The Sunken Vault', 6) };
    let p = makePlan(s) as GridPlan;
    p = keep(p, 2, true);
    p = setDown(p, PIECES[1], -3, -4, 1, 7)!.plan;
    p = putThing(p, 'trap', Math.floor(p.areas[0].x), Math.floor(p.areas[0].y))!;
    expect((await request(gm).put(url).send({ ...s, drawn: pack(p) })).status).toBe(200);
    const back = makePlan((await request(gm).get(url)).body.saved as PlanSettings) as GridPlan;
    expect(plain(back)).toBe(plain(p));
    expect(back.areas[1].kept).toBe(true);

    const drawn = pack(p) as unknown as Record<string, unknown>;
    const bad = async (patch: Record<string, unknown>) => (await request(gm).put(url).send({ ...s, drawn: { ...drawn, ...patch } })).status;
    // Squares that do not fill the sheet, a thing of no kind, a sheet too large, a plan of no kind.
    expect(await bad({ cells: [0, 5] })).toBe(400);
    expect(await bad({ features: [{ kind: 'dragon', x: 1, y: 1, w: 1, h: 1 }] })).toBe(400);
    expect(await bad({ w: 5000 })).toBe(400);
    expect(await bad({ kind: 'spaceship' })).toBe(400);
    expect(plain(makePlan((await request(gm).get(url)).body.saved as PlanSettings))).toBe(plain(p));

    // Words that come with a drawing (a building's storeys) are drawn as words, whatever they are.
    const inn = makePlan({ ...base, kind: 'building', use: 'tavern' }) as GridPlan;
    const sly = unpack({ ...pack(inn), captions: [{ text: '<script>alert(1)</script>', x: 4, y: 1 }] } as ReturnType<typeof pack>);
    expect(drawPlan(sly).svg).not.toContain('<script');
    expect(drawPlan(sly).svg).toContain('&lt;script&gt;');

    // In a backup, and brought back from one.
    const other = tempContext();
    importJson(other.db, exportJson(ctx.db));
    const there = (await request(createApp(other)).get(url)).body.saved as PlanSettings;
    expect(plain(makePlan(there))).toBe(plain(p));
    // The players are shown none of it.
    await request(gm).patch(`/api/entities/${vault.id}`).send({ revealed: true });
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('"drawn"');
  });
});
