/** Plans of places (v0.9.24, docs/BETA_PLAN.md C8): the laying out, the drawing, reading a record, and what is kept. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { exportJson, importJson } from '../server/src/backup/exporter.js';
import {
  BUILDING_USES,
  KEY_KINDS,
  drawPlan,
  drawnNames,
  edgeKey,
  fullKeyMarkdown,
  ideaFor,
  itemLine,
  keyMarkdown,
  keyedNames,
  madeNames,
  makePlan,
  newItem,
  planKey,
  readNumber,
  rng,
  roomMarks,
  roomsFor,
  suggest,
  syncRooms,
  trapNumbers,
  type GridPlan,
  type KeyRoom,
  type PlaceFacts,
  type PlanSettings,
  type TownPlan,
} from '../shared/plan/index.js';
import { playerSnapshot } from '../server/src/player/projection.js';

const base: PlanSettings = { kind: 'dungeon', seed: 7, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: true, use: 'house', town: 'village', water: 'none', walled: false, around: 'fields' };
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as number[]) : x instanceof Set ? [...x] : x));

/** How many separate pieces a plan's floor is in, walking through doors but not through walls or windows. */
function pieces(p: GridPlan): number {
  const open = new Set(p.openings.filter((o) => o.kind !== 'window').map(edgeKey));
  const seen = new Uint8Array(p.w * p.h);
  let n = 0;
  for (let i = 0; i < p.w * p.h; i++) {
    if (!p.cells[i] || seen[i]) continue;
    n++;
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const c = q.pop()!;
      const [x, y] = [c % p.w, Math.floor(c / p.w)];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
        const m = ny * p.w + nx;
        if (!p.cells[m] || seen[m]) continue;
        const key = dx === 0 ? `${x},${Math.max(y, ny)},n` : `${Math.max(x, nx)},${y},w`;
        if (p.cells[m] === p.cells[c] || open.has(key)) {
          seen[m] = 1;
          q.push(m);
        }
      }
    }
  }
  return n;
}

describe('laying out a place', () => {
  it('gives the same plan for the same settings, and another for another seed', () => {
    for (const kind of ['dungeon', 'cave', 'building', 'settlement'] as const) {
      const s = { ...base, kind, names: madeNames({ ...base, kind }, 'The Old Keep', 9) };
      expect(plain(makePlan(s)), kind).toBe(plain(makePlan(s)));
      expect(plain(makePlan({ ...s, seed: 8 })), kind).not.toBe(plain(makePlan(s)));
      expect(drawPlan(makePlan(s)).svg, kind).toBe(drawPlan(makePlan(s)).svg);
    }
  });

  it('makes a dungeon whose every room can be walked to, with a number for every room named', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s: PlanSettings = { ...base, seed, size: (['small', 'medium', 'large'] as const)[seed % 3], rough: seed % 4 === 0, ways: (['one', 'some', 'many'] as const)[seed % 3] };
      s.names = madeNames(s, 'Tomb of the Last King', 2 + (seed % 20));
      const p = makePlan(s) as GridPlan;
      expect(pieces(p), `seed ${seed}`).toBe(1);
      expect(p.areas.map((a) => a.n), `seed ${seed}`).toEqual(s.names.map((_, i) => i + 1));
      // Each number is on the floor of its own room, and no two rooms share a number's square.
      const spots = p.areas.map((a) => Math.floor(a.y) * p.w + Math.floor(a.x));
      expect(spots.every((c) => p.cells[c] >= 2)).toBe(true);
      expect(new Set(spots.map((c) => p.cells[c])).size).toBe(p.areas.length);
      // Every door stands in a wall: between two different rooms, or a room and a passage.
      for (const o of p.openings) {
        const [a, b] = o.side === 'n' ? [p.cells[(o.y - 1) * p.w + o.x], p.cells[o.y * p.w + o.x]] : [p.cells[o.y * p.w + o.x - 1], p.cells[o.y * p.w + o.x]];
        expect(a && b && a !== b, `seed ${seed}: a door in no wall`).toBeTruthy();
      }
      expect(p.features.some((f) => f.kind === 'stairs')).toBe(true);
      expect(p.w).toBeLessThanOrEqual(110);
    }
  });

  it('keeps a dungeon in one piece without its secret doors when it has one way round only', () => {
    // Secret doors are only ever on a second way between rooms: nobody is shut out by not finding one.
    for (let seed = 1; seed <= 40; seed++) {
      const s: PlanSettings = { ...base, seed, ways: 'many', names: madeNames({ ...base, seed }, 'x', 12) };
      const p = makePlan(s) as GridPlan;
      const without: GridPlan = { ...p, openings: p.openings.filter((o) => o.kind !== 'secret') };
      expect(pieces(without), `seed ${seed}`).toBe(1);
    }
  });

  it('makes a cave that is one cave, open to the edge of the sheet', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s: PlanSettings = { ...base, kind: 'cave', seed, size: (['small', 'medium', 'large'] as const)[seed % 3] };
      s.names = madeNames(s, 'x', 2 + (seed % 14));
      const p = makePlan(s) as GridPlan;
      expect(pieces(p), `seed ${seed}`).toBe(1);
      expect(p.areas).toHaveLength(s.names.length);
      expect(p.openings.filter((o) => o.kind === 'open'), `seed ${seed}`).toHaveLength(1);
      expect(p.areas.every((a) => p.cells[Math.floor(a.y) * p.w + Math.floor(a.x)] !== 0)).toBe(true);
    }
  });

  it('makes a building of every use, each storey all of a piece, with a way in and stairs between storeys', () => {
    for (const use of Object.keys(BUILDING_USES))
      for (let seed = 1; seed <= 12; seed++) {
        const p = makePlan({ ...base, kind: 'building', use, seed, size: (['small', 'medium', 'large'] as const)[seed % 3] }) as GridPlan;
        const storeys = p.captions.length || 1;
        expect(pieces(p), `${use} ${seed}`).toBe(storeys);
        expect(storeys).toBe(BUILDING_USES[use].floors.length);
        expect(p.features.filter((f) => f.kind === 'stairs')).toHaveLength(storeys > 1 ? storeys : 0);
        expect(p.areas.some((a) => a.exits.some((e) => e.startsWith('the way in'))), `${use} ${seed}`).toBe(true);
        expect(p.areas.every((a) => a.exits.length > 0), `${use} ${seed}: a room with no way out`).toBe(true);
      }
  });

  it('gives a building the rooms its record names, upstairs and below where their names say', () => {
    const names = ['Taproom', 'Kitchen', 'Snug', 'Guest room', 'Guest room', 'Loft', 'Beer cellar'];
    const p = makePlan({ ...base, kind: 'building', use: 'tavern', names }) as GridPlan;
    expect(p.areas.map((a) => a.name)).toEqual(names);
    expect(p.areas.find((a) => a.name === 'Taproom')!.floor).toBe('Ground floor');
    expect(p.areas.find((a) => a.name === 'Loft')!.floor).toBe('Upper floor');
    expect(p.areas.find((a) => a.name === 'Beer cellar')!.floor).toBe('Cellar');
    expect(pieces(p)).toBe(3);
  });

  it('makes a settlement of each size, with its named places numbered and no house on a road or in the water', () => {
    const count: Record<string, number> = {};
    for (const town of ['hamlet', 'village', 'town', 'city'] as const)
      for (const water of ['none', 'river', 'coast'] as const) {
        const s: PlanSettings = { ...base, kind: 'settlement', town, water, walled: town !== 'hamlet', around: 'fields', seed: 31 };
        s.names = madeNames(s, 'x', 0);
        const p = makePlan(s) as TownPlan;
        count[town] = Math.max(count[town] ?? 0, p.buildings.length);
        expect(p.areas.length, `${town} ${water}`).toBeGreaterThanOrEqual(s.names.length - 2);
        expect(p.roads.length).toBeGreaterThanOrEqual(2);
        if (water === 'river') expect(p.bridges.length, `${town}: no bridge`).toBeGreaterThan(0);
        if (water === 'coast') expect(p.piers.length, `${town}: no jetty`).toBeGreaterThan(0);
        if (town !== 'hamlet') expect(p.wall?.gates.length, `${town} ${water}: a wall without a gate`).toBeGreaterThan(0);
        // Every corner of every building is on the sheet.
        expect(p.buildings.every((b) => b.corners.every(([x, y]) => x >= 0 && y >= 0 && x <= p.w && y <= p.h))).toBe(true);
      }
    expect(count.hamlet).toBeLessThan(count.village);
    expect(count.village).toBeLessThan(count.town);
    expect(count.town).toBeLessThan(count.city);
  });
});

describe('drawing a plan', () => {
  it('is a whole SVG of so many pixels to a square, with nothing unfinished in it', () => {
    for (const kind of ['dungeon', 'cave', 'building', 'settlement'] as const) {
      const s = { ...base, kind, names: madeNames({ ...base, kind }, 'x', 8) };
      const plan = makePlan(s);
      for (const fill of ['hatch', 'solid', 'none'] as const) {
        const d = drawPlan(plan, { px: 70, title: 'Fish & <Chips>', fill, paper: 'parchment' });
        expect(d.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(d.svg.endsWith('</svg>')).toBe(true);
        expect(d.svg).not.toMatch(/NaN|undefined|Infinity/);
        expect(d.svg).toContain('Fish &amp; &lt;Chips&gt;');
        expect([d.width, d.height]).toEqual([plan.w * 70, plan.h * 70]);
        // Every tag that opens closes.
        const opened = (d.svg.match(/<(?!\/)[a-zA-Z]+/g) ?? []).length;
        const closed = (d.svg.match(/<\/[a-zA-Z]+>/g) ?? []).length + (d.svg.match(/\/>/g) ?? []).length;
        expect(opened, `${kind} ${fill}`).toBe(closed);
      }
    }
  });

  it('leaves secret doors, traps and numbers off the players’ copy', () => {
    let secret: GridPlan | null = null;
    for (let seed = 1; seed < 80 && !secret; seed++) {
      const s = { ...base, seed, ways: 'many' as const, names: madeNames({ ...base, seed }, 'x', 12) };
      const p = makePlan(s) as GridPlan;
      if (p.openings.some((o) => o.kind === 'secret') && p.features.some((f) => f.kind === 'trap')) secret = p;
    }
    expect(secret).not.toBeNull();
    const gm = drawPlan(secret!, { gm: true, numbers: true }).svg;
    const players = drawPlan(secret!, { gm: false, numbers: false }).svg;
    expect(gm).toContain('>S</text>');
    expect(gm).toContain('>T</text>');
    expect(players).not.toContain('>S</text>');
    expect(players).not.toContain('>T</text>');
    expect(players).not.toMatch(/font-weight="700"[^>]*>\d+<\/text>/);
    expect(gm).toMatch(/font-weight="700"[^>]*>1<\/text>/);
  });
});

describe('reading a record for its plan', () => {
  const place = (o: Partial<PlaceFacts>): PlaceFacts => ({ id: 'DUN-0001', type: 'dungeon', name: 'The Sunken Vault', fields: [], body: '', children: [], terrain: [], danger: 'risky', wealth: 'modest', ...o });

  it('takes the rooms from the key in the text: numbered lines, bold beginnings, or smaller headings', () => {
    expect(keyedNames('## A first look\n\nDark.\n\n## Rooms\n\n1. **Entry hall**: a long stair.\n2. The well room. Wet.\n3. Crypt of @[Saint Oda] [NPC-004]\n\n## Secrets (GM only)\n\n1. Not a room')).toEqual(['Entry hall', 'The well room', 'Crypt of Saint Oda']);
    expect(keyedNames('## Inside\n\n- **Taproom**: loud.\n- **Kitchen** (hot)\n- a line that names nothing\n')).toEqual(['Taproom', 'Kitchen']);
    expect(keyedNames('## Places in town\n\n### The Gilded Eel\n\nAn inn.\n\n### Market square\n')).toEqual(['The Gilded Eel', 'Market square']);
    expect(keyedNames('## 1. Gatehouse\n\ntext\n\n## 2: The yard\n\n### Area 3 - Cells\n')).toEqual(['Gatehouse', 'The yard', 'Cells']);
    expect(keyedNames('## Overview\n\nNothing keyed here.\n\n1. A list that is not a key')).toEqual([]);
  });

  it('writes a key that reads back as the same places in the same order', () => {
    const names = ['Entry hall', 'Guard room', 'Shrine', 'The vault'];
    const plan = makePlan({ ...base, names });
    const key = planKey(plan, names);
    expect(key.map((k) => k.name)).toEqual(names);
    expect(key[0].detail).toMatch(/^\d+ × \d+ ft\. .*stairs up to the outside/i);
    expect(keyedNames(`## Map key (GM only)\n\n${keyMarkdown(plan, names)}\n`)).toEqual(names);
  });

  it('reads numbers as people write them', () => {
    expect(readNumber('about 400')).toBe(400);
    expect(readNumber('40,000')).toBe(40000);
    expect(readNumber('250–400')).toBe(250);
    expect(readNumber('2k')).toBe(2000);
    expect(readNumber('five')).toBe(5);
    expect(readNumber('UNDEFINED')).toBeNull();
  });

  it('chooses the kind of plan, and its particulars, from what the record says', () => {
    expect(suggest(place({})).kind).toBe('dungeon');
    expect(suggest(place({ fields: [['Rooms', 'five']] })).names).toHaveLength(5);
    expect(suggest(place({ name: 'The Weeping Caves' })).kind).toBe('cave');
    const mine = suggest(place({ name: 'Old Garran Mine' }));
    expect([mine.kind, mine.rough]).toEqual(['dungeon', true]);
    expect(suggest(place({ danger: 'deadly' })).traps).toBe(true);
    expect(suggest(place({ danger: 'safe' })).secrets).toBe(false);

    const inn = suggest(place({ id: 'BLD-0001', type: 'building', name: 'The Gilded Eel', fields: [['Used for', 'an inn for river traders']], wealth: 'rich' }));
    expect([inn.kind, inn.use, inn.size]).toEqual(['building', 'tavern', 'large']);
    expect(suggest(place({ type: 'landmark', name: 'The Anvil of Dominion', fields: [['Used for', 'war-forges']] })).use).toBe('smithy');

    const port = suggest(place({ id: 'SET-0001', type: 'settlement', name: 'Saltmere', fields: [['Population', 'about 3,000']], terrain: ['coastal'], body: '## Places in town\n\n- **Harbour**\n- **The Drowned Rat**: an inn.', children: ['Temple of Tides', 'The Drowned Rat'] }));
    expect([port.kind, port.town, port.water, port.walled]).toEqual(['settlement', 'town', 'coast', true]);
    // The text's places first, then the places kept as records, each once.
    expect(port.names).toEqual(['Harbour', 'The Drowned Rat', 'Temple of Tides']);
    expect(suggest(place({ type: 'settlement', name: 'Oakhollow', fields: [['Population', '80']], terrain: ['forest'], danger: 'safe' }))).toMatchObject({ town: 'hamlet', around: 'woods', walled: false, water: 'none' });
    // The same record is always offered the same plan to start from.
    expect(suggest(place({})).seed).toBe(suggest(place({})).seed);
    expect(suggest(place({ id: 'DUN-0002' })).seed).not.toBe(suggest(place({})).seed);
  });
});

describe('the key to a plan', () => {
  const names = ['Entry stair', 'Guard room', 'St. Oda’s chapel', 'Treasury'];
  const keyed = (): KeyRoom[] => {
    const rooms = roomsFor(makePlan({ ...base, names }), names);
    rooms[1].aloud = 'Two benches.\nThe fire is warm.';
    rooms[1].items = [
      newItem('encounter', { title: 'The night watch', creatures: [{ name: 'Skeleton', count: 3, id: 'srd:skeleton' }, { name: 'Ghoul', count: 1 }], text: 'They rise when the door opens' }),
      newItem('trap', { title: 'Needle in the lock', dc: 13, damage: '2d10 poison', text: 'On the chest.' }),
    ];
    rooms[3].items = [newItem('loot', { coins: '120 gp', things: [{ name: 'Potion of Healing', count: 2 }, { name: 'Silver ewer (25 gp)', count: 1 }] }), newItem('note', { text: 'Dust everywhere' })];
    return rooms;
  };

  it('has a place for each numbered place, named as the plan has them, and a building’s on their storeys', () => {
    const rooms = roomsFor(makePlan({ ...base, names }), names);
    expect(rooms.map((r) => [r.name, r.drawnAs, r.items.length])).toEqual(names.map((n) => [n, n, 0]));
    expect(new Set(rooms.map((r) => r.id)).size).toBe(4);
    const inn = makePlan({ ...base, kind: 'building', use: 'tavern' });
    const innRooms = roomsFor(inn, []);
    expect(innRooms.find((r) => r.name === 'Common room')!.floor).toBe('ground');
    expect(innRooms.find((r) => r.name === 'Keeper’s room')!.floor).toBe('upper');
    expect(innRooms.find((r) => r.name === 'Cellar')!.floor).toBe('under');
    // Drawn from those names and storeys, the keeper's room stays upstairs (its name alone would not put it there).
    const again = makePlan({ ...base, kind: 'building', use: 'tavern', names: drawnNames(innRooms, true) }) as GridPlan;
    expect(again.areas.map((a) => a.name)).toEqual(innRooms.map((r) => r.name));
    expect(again.areas.find((a) => a.name === 'Keeper’s room')!.floor).toBe('Upper floor');
    expect(again.areas.find((a) => a.name === 'Cold store')!.floor).toBe('Cellar');
    expect(drawnNames(innRooms, false)[0]).toBe('Common room');
  });

  it('says each entry in a line', () => {
    const [enc, trap] = keyed()[1].items;
    expect(itemLine(enc)).toEqual({ label: 'Encounter', text: 'The night watch. 3 × Skeleton, Ghoul. They rise when the door opens.' });
    expect(itemLine(trap)).toEqual({ label: 'Trap (DC 13, 2d10 poison)', text: 'Needle in the lock. On the chest.' });
    expect(itemLine(keyed()[3].items[0])).toEqual({ label: 'Loot', text: '120 gp; 2 × Potion of Healing; Silver ewer (25 gp).' });
    expect(itemLine(newItem('puzzle', { dc: 15 }))).toEqual({ label: 'Puzzle (DC 15)', text: '' });
  });

  it('is written as Markdown that reads back as the same places, whatever their names', () => {
    const rooms = keyed();
    rooms[1].name = 'Guard post';
    const plan = makePlan({ ...base, names });
    const md = fullKeyMarkdown(rooms, planKey(plan, rooms.map((r) => r.name)));
    expect(md).toContain('### 2. Guard post\n\n*');
    expect(md).toContain('> Two benches.\n> The fire is warm.\n\n- **Encounter:** The night watch.');
    expect(md).toContain('- **Trap (DC 13, 2d10 poison):** Needle in the lock. On the chest.');
    expect(md).toContain('### 4. Treasury');
    expect(keyedNames(`## A first look\n\nDark.\n\n## Map key (GM only)\n\n${md}\n\n## Afterwards\n\n### Not a room\n`)).toEqual(['Entry stair', 'Guard post', 'St. Oda’s chapel', 'Treasury']);
  });

  it('marks what is keyed on the GM’s copy only, and rings a place only when asked', () => {
    const rooms = keyed();
    expect(roomMarks(rooms)).toEqual({ 2: 'ET', 4: 'L' });
    const plan = makePlan({ ...base, names });
    const gm = drawPlan(plan, { marks: roomMarks(rooms) }).svg;
    expect(gm).toMatch(/letter-spacing="3"[^>]*>ET<\/text>/);
    expect(drawPlan(plan, { marks: roomMarks(rooms), gm: false, numbers: false }).svg).not.toContain('>ET</text>');
    expect(gm).not.toContain('stroke-dasharray="20 12"');
    expect(drawPlan(plan, { ring: 2 }).svg).toContain('stroke-dasharray="20 12"');
  });

  it('follows the record’s text when asked: the same names keep what is keyed to them', () => {
    const rooms = keyed();
    const { rooms: next, left } = syncRooms(rooms, ['Treasury', 'guard room', 'Well room']);
    expect(next.map((r) => r.name)).toEqual(['Treasury', 'Guard room', 'Well room']);
    expect(next[0].id).toBe(rooms[3].id);
    expect(next[1].items).toHaveLength(2);
    expect(next[2].items).toEqual([]);
    // What was dropped with nothing keyed to it is not worth a warning; nothing keyed was dropped here.
    expect(left).toEqual([]);
    expect(syncRooms(rooms, ['Entry stair']).left.map((r) => r.name)).toEqual(['Guard room', 'Treasury']);
  });

  it('suggests traps, puzzles and hazards with numbers that fit the party and the place', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = rng(seed);
      const low = trapNumbers(1, 'safe', rnd);
      expect(low.dc).toBeGreaterThanOrEqual(10);
      expect(low.dc).toBeLessThanOrEqual(11);
      expect(low.dice).toBe('1d10');
      const high = trapNumbers(17, 'deadly', rnd);
      expect(high.dc).toBeGreaterThanOrEqual(16);
      expect(high.dice).toBe('24d10');
      for (const kind of ['trap', 'puzzle', 'hazard'] as const) {
        const it = ideaFor(kind, 5, 'risky', rnd);
        expect(it.kind).toBe(kind);
        expect(it.title).not.toBe('');
        expect(it.text.length).toBeGreaterThan(20);
        expect(it.dc).toBeGreaterThanOrEqual(12);
        if (kind === 'puzzle') expect(it.damage).toBeUndefined();
        else expect(it.damage === '' || /^4d10 \w+$/.test(it.damage ?? '')).toBe(true);
      }
    }
    expect(KEY_KINDS).toContain('encounter');
  });
});

/** Enough of a PNG for the app to know it's one, of a given size. */
function png(width: number, height: number) {
  const b = Buffer.alloc(34);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('a record’s plan, kept', () => {
  async function world() {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const make = async (o: Record<string, unknown>) => (await request(gm).post('/api/entities').send({ realm: 'world', ...o })).body as { id: string; version: number };
    return { ctx, gm, make };
  }

  it('is suggested from the record, kept as the GM settles it, and forgotten when asked', async () => {
    const { gm, make } = await world();
    const town = await make({ name: 'Saltmere', type: 'settlement', fields: [['Population', '900'], ['Terrain', 'coastal']], body: '## Places in town\n\n- **Harbour**\n' });
    await make({ name: 'Temple of Tides', type: 'building', parent_id: town.id });
    await make({ name: 'Old Hob', type: 'npc', parent_id: town.id });
    let info = (await request(gm).get(`/api/entities/${town.id}/plan`)).body;
    expect(info.place).toBe(true);
    expect(info.saved).toBeNull();
    expect(info.ownNames).toBe(true);
    expect(info.suggested).toMatchObject({ kind: 'settlement', town: 'village', water: 'coast', names: ['Harbour', 'Temple of Tides'] });
    // A country is not a single place to draw.
    const realm = await make({ name: 'The Marches', type: 'region' });
    expect((await request(gm).get(`/api/entities/${realm.id}/plan`)).body.place).toBe(false);

    const settled = { ...info.suggested, seed: 4242, walled: true };
    info = (await request(gm).put(`/api/entities/${town.id}/plan`).send(settled)).body;
    expect(info.saved).toEqual(settled);
    expect((await request(gm).get(`/api/entities/${town.id}/plan`)).body.saved).toEqual(settled);
    // Not a plan: refused, and the one kept is untouched.
    expect((await request(gm).put(`/api/entities/${town.id}/plan`).send({ ...settled, use: 'spaceport' })).status).toBe(400);
    expect((await request(gm).put(`/api/entities/${town.id}/plan`).send({ ...settled, names: Array(60).fill('x') })).status).toBe(400);
    expect((await request(gm).put('/api/entities/NOPE-1/plan').send(settled)).status).toBe(404);
    expect((await request(gm).get(`/api/entities/${town.id}/plan`)).body.saved.seed).toBe(4242);

    expect((await request(gm).delete(`/api/entities/${town.id}/plan`)).body.saved).toBeNull();
  });

  it('writes its key into the record’s text, once, and reads its places back from it', async () => {
    const { gm, make } = await world();
    const vault = await make({ name: 'The Sunken Vault', type: 'dungeon', body: '## A first look\n\nStairs go down.\n\n## Secrets (GM only)\n\nIt is older than it looks.' });
    const info = (await request(gm).get(`/api/entities/${vault.id}/plan`)).body;
    expect(info.ownNames).toBe(false);
    const names = info.suggested.names as string[];
    expect(names.length).toBe(8);
    const plan = makePlan(info.suggested);
    let e = (await request(gm).post(`/api/entities/${vault.id}/plan/key`).send({ markdown: keyMarkdown(plan, names) })).body;
    expect(e.body).toContain('## Secrets (GM only)\n\nIt is older than it looks.\n\n## Map key (GM only)\n\n### 1. ');
    // Now the record names its own rooms: the same ones.
    const after = (await request(gm).get(`/api/entities/${vault.id}/plan`)).body;
    expect(after.ownNames).toBe(true);
    expect(after.suggested.names).toEqual(names);
    // Written again (after a room is renamed), it takes the place of the key that was there; what follows it stays.
    await request(gm).patch(`/api/entities/${vault.id}`).send({ body: `${e.body}\n## Afterwards\n\nThe way out.\n` });
    e = (await request(gm).post(`/api/entities/${vault.id}/plan/key`).send({ markdown: '1. **Only room** 10 × 10 ft.', gm: false })).body;
    expect(e.body.match(/## Map key/g)).toHaveLength(1);
    expect(e.body).toContain('## Map key\n\n1. **Only room** 10 × 10 ft.\n\n## Afterwards\n\nThe way out.');
    expect((await request(gm).get(`/api/entities/${vault.id}/plan`)).body.suggested.names).toEqual(['Only room']);
    // Somebody else changed the record meanwhile: the key is not written over their change.
    expect((await request(gm).post(`/api/entities/${vault.id}/plan/key`).send({ markdown: 'x', expected_version: 1 })).status).toBe(409);
  });

  it('becomes a map in the Atlas, with a hidden pin for each numbered place, and is drawn again on the same map', async () => {
    const { ctx, gm, make } = await world();
    const vault = await make({ name: 'The Sunken Vault', type: 'dungeon' });
    const info = (await request(gm).get(`/api/entities/${vault.id}/plan`)).body;
    const plan = makePlan(info.suggested);
    const send = (w: number, h: number, areas = plan.areas) =>
      request(gm)
        .post(`/api/entities/${vault.id}/plan/map`)
        .field('plan', JSON.stringify({ squares: plan.w, feet: plan.feet, areas: areas.map((a) => ({ n: a.n, name: a.name, x: a.x, y: a.y })) }))
        .attach('image', png(w, h), { filename: 'plan.png', contentType: 'image/png' });
    // The plan has to be kept first: a map is made from the plan the record has.
    expect((await send(plan.w * 70, plan.h * 70)).status).toBe(400);
    await request(gm).put(`/api/entities/${vault.id}/plan`).send(info.suggested);
    // One of its rooms is a record of its own, kept under it: that room's pin leads to the record.
    const room = await make({ name: plan.areas[1].name.toUpperCase(), type: 'landmark', parent_id: vault.id });
    const first = (await send(plan.w * 70, plan.h * 70)).body as { map: { id: number; name: string }; updated: boolean };
    expect(first).toMatchObject({ map: { name: 'The Sunken Vault: plan' }, updated: false });
    const detail = (await request(gm).get(`/api/maps/${first.map.id}/detail`)).body as { map: Record<string, unknown>; markers: { label: string; x: number; y: number; hidden: boolean; category: string; entity_id: string | null }[] };
    expect(detail.map).toMatchObject({ entity_id: vault.id, width: plan.w * 70, height: plan.h * 70, player_visible: false });
    expect(detail.map.scale_miles).toBeCloseTo((plan.w * 5) / 5280, 6);
    expect(detail.markers).toHaveLength(plan.areas.length);
    expect(detail.markers.map((m) => m.entity_id)).toEqual(plan.areas.map((_, i) => (i === 1 ? room.id : null)));
    expect(detail.markers[0]).toMatchObject({ label: `1. ${plan.areas[0].name}`, x: Math.round(plan.areas[0].x * 70), y: Math.round(plan.h * 70 - plan.areas[0].y * 70), hidden: true, category: 'plan' });
    const file = String(detail.map.image_file);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, file))).toBe(true);
    expect((await request(gm).get(`/api/entities/${vault.id}/plan`)).body.map).toEqual(first.map);

    // A pin of the GM's own on that map; then the plan drawn again, larger, with fewer places.
    await request(gm).post('/api/markers').send({ map_id: first.map.id, label: 'Where the party camped', x: 10, y: 10 });
    const again = (await send(plan.w * 100, plan.h * 100, plan.areas.slice(0, 2))).body;
    expect(again).toMatchObject({ map: { id: first.map.id }, updated: true });
    const second = (await request(gm).get(`/api/maps/${first.map.id}/detail`)).body;
    expect(second.map.width).toBe(plan.w * 100);
    expect(second.markers.map((m: { label: string }) => m.label).sort()).toEqual([`1. ${plan.areas[0].name}`, `2. ${plan.areas[1].name}`, 'Where the party camped'].sort());
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, file))).toBe(false);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, String(second.map.image_file)))).toBe(true);
    // Not a picture: refused, and the map is as it was.
    expect((await request(gm).post(`/api/entities/${vault.id}/plan/map`).field('plan', '{}').attach('image', Buffer.from('nope'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    // The GM deletes the map: the plan is still kept, and the next map is a new one.
    await request(gm).delete(`/api/maps/${first.map.id}`);
    expect((await request(gm).get(`/api/entities/${vault.id}/plan`)).body).toMatchObject({ map: null, saved: info.suggested });
    expect((await send(plan.w * 70, plan.h * 70)).body.updated).toBe(false);
  });

  it('keeps the key with the plan, refuses what is not a key, and never shows it to players', async () => {
    const { ctx, gm, make } = await world();
    const vault = await make({ name: 'The Sunken Vault', type: 'dungeon', body: '## A first look\n\nStairs go down.\n' });
    const info = (await request(gm).get(`/api/entities/${vault.id}/plan`)).body;
    const plan = makePlan(info.suggested);
    const rooms = roomsFor(plan, info.suggested.names);
    rooms[0].aloud = 'Cold air rises from below.';
    rooms[0].items = [newItem('trap', { title: 'Needle in the lock', dc: 13, damage: '2d10 poison', text: 'A secret the players must not read.' }), newItem('encounter', { creatures: [{ name: 'Skeleton', count: 3, id: 'srd:skeleton' }] })];
    const kept = (await request(gm).put(`/api/entities/${vault.id}/plan`).send({ ...info.suggested, key: rooms })).body;
    expect(kept.saved.key).toEqual(rooms);
    expect((await request(gm).get(`/api/entities/${vault.id}/plan`)).body.saved.key[0].items[0]).toMatchObject({ kind: 'trap', dc: 13, damage: '2d10 poison' });
    // Not a key: an entry of no known kind, a room with no name, too many rooms.
    const bad = (key: unknown) => request(gm).put(`/api/entities/${vault.id}/plan`).send({ ...info.suggested, key });
    expect((await bad([{ ...rooms[0], items: [{ ...rooms[0].items[0], kind: 'bomb' }] }])).status).toBe(400);
    expect((await bad([{ ...rooms[0], name: '  ' }])).status).toBe(400);
    expect((await bad(Array(41).fill(rooms[1]))).status).toBe(400);
    expect((await request(gm).get(`/api/entities/${vault.id}/plan`)).body.saved.key).toEqual(rooms);

    // Written into the record and the record shown to the players: the first look is theirs, the key is not.
    const lines = planKey(plan, rooms.map((r) => r.name));
    const e = (await request(gm).post(`/api/entities/${vault.id}/plan/key`).send({ markdown: fullKeyMarkdown(rooms, lines), gm: true })).body;
    expect(e.body).toContain('## Map key (GM only)\n\n### 1. ');
    expect(e.body).toContain('- **Trap (DC 13, 2d10 poison):** Needle in the lock. A secret the players must not read.');
    await request(gm).patch(`/api/entities/${vault.id}`).send({ revealed: true, revealed_sections: ['A first look', 'Map key (GM only)'] });
    const theirs = JSON.stringify(playerSnapshot(ctx.db));
    expect(theirs).toContain('Stairs go down.');
    expect(theirs).not.toContain('A secret the players must not read');
    expect(theirs).not.toContain('Needle in the lock');
    expect(theirs).not.toContain('Cold air rises');
  });

  it('suggests something to key: from its own ideas, and from the books for the party and the place', async () => {
    const { gm, make } = await world();
    const vault = await make({ name: 'The Sunken Vault', type: 'dungeon', fields: [['Danger', 'deadly'], ['Wealth', 'rich']] });
    const ask = async (body: Record<string, unknown>) => (await request(gm).post('/api/plan/suggest').send({ entity: vault.id, ...body })).body as { item: KeyRoom['items'][number]; level: number };
    const trap = await ask({ kind: 'trap' });
    expect(trap.level).toBe(1);
    expect(trap.item).toMatchObject({ kind: 'trap' });
    // A deadly place: the hardest numbers for a party of this level.
    expect(trap.item.dc).toBeGreaterThanOrEqual(16);
    expect(trap.item.damage === '' || trap.item.damage!.startsWith('4d10 ')).toBe(true);
    expect((await ask({ kind: 'puzzle', level: 12 })).item.title).not.toBe('');
    expect((await ask({ kind: 'hazard' })).item.kind).toBe('hazard');
    // From the open rules that come with the app: creatures with stat blocks, within the party's budget.
    const fight = await ask({ kind: 'encounter', level: 5 });
    expect(fight.item.kind).toBe('encounter');
    expect(fight.item.creatures!.length).toBeGreaterThan(0);
    expect(fight.item.creatures!.every((c) => c.count >= 1 && !!c.id && !!c.name)).toBe(true);
    const hoard = await ask({ kind: 'loot', level: 5, hoard: true });
    expect(hoard.item.kind).toBe('loot');
    expect(hoard.item.coins).toMatch(/^[\d,]+ [a-z]p$/);
    // With no record: the danger and wealth asked for.
    expect((await request(gm).post('/api/plan/suggest').send({ kind: 'trap', danger: 'safe' })).body.item.dc).toBeLessThanOrEqual(11);
    expect((await request(gm).post('/api/plan/suggest').send({ kind: 'dragon' })).status).toBe(400);
  });

  it('hands a plan’s picture back as a file to save, under a safe name, and nothing else', async () => {
    const { gm } = await world();
    const svg = drawPlan(makePlan({ ...base, names: ['Entry hall', 'Vault'] })).svg;
    const held = (await request(gm).post('/api/plan-files').field('name', '../The Sunken Vault: players’ copy.svg').attach('file', Buffer.from(svg), { filename: 'x.svg', contentType: 'image/svg+xml' })).body as { token: string };
    const back = await request(gm).get(`/api/plan-files/${held.token}`);
    expect(back.status).toBe(200);
    expect(back.headers['content-disposition']).toBe('attachment; filename="The Sunken Vault players copy.svg"');
    expect(back.headers['content-type']).toBe('image/svg+xml');
    expect(back.headers['content-security-policy']).toContain('sandbox');
    expect(back.body.toString()).toBe(svg);
    const picture = (await request(gm).post('/api/plan-files').field('name', 'Plan').attach('file', png(70, 70), { filename: 'x.png', contentType: 'image/png' })).body as { token: string };
    expect((await request(gm).get(`/api/plan-files/${picture.token}`)).headers['content-disposition']).toBe('attachment; filename="Plan.png"');
    // A web page, or anything else that is not a plan's picture: refused.
    expect((await request(gm).post('/api/plan-files').attach('file', Buffer.from('<html><script>1</script></html>'), { filename: 'x.svg', contentType: 'image/svg+xml' })).status).toBe(400);
    expect((await request(gm).post('/api/plan-files').attach('file', Buffer.from('MZ...'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    expect((await request(gm).get('/api/plan-files/nope')).status).toBe(404);
  });

  it('goes with the record: into a backup and out again, and away when the record is deleted', async () => {
    const { ctx, gm, make } = await world();
    const vault = await make({ name: 'The Sunken Vault', type: 'dungeon' });
    const info = (await request(gm).get(`/api/entities/${vault.id}/plan`)).body;
    await request(gm).put(`/api/entities/${vault.id}/plan`).send({ ...info.suggested, seed: 99 });
    const data = exportJson(ctx.db);
    expect(data.tables.place_plans).toHaveLength(1);
    const other = tempContext();
    importJson(other.db, data);
    expect((await request(createApp(other)).get(`/api/entities/${vault.id}/plan`)).body.saved.seed).toBe(99);
    ctx.db.prepare('DELETE FROM entities WHERE id = ?').run(vault.id);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM place_plans').get()).toEqual({ n: 0 });
  });
});
