/** The GM's own stat blocks (v0.9.4, docs/BETA_PLAN.md B2): a whole block, a book block with changes, or a hazard. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { readWorldbook } from '../server/src/packs/share.js';
import { CHALLENGE_RATINGS, abilityMod, crPb, hitPoints } from '../shared/statblock.js';

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function world() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const add = async (name: string, type: string) => (await request(gm).post('/api/entities').send({ name, type, realm: 'world', body: '## A first look\n\nSeen once.' })).body as { id: string };
  return { ctx, gm, add };
}

const WARDEN = {
  kind: 'creature',
  meta: 'Large Construct, Unaligned',
  ac: 17,
  hp: '9d10+27',
  speed: '30 ft.',
  ab: [18, 14, 16, 6, 12, 5],
  cr: '5',
  saves: 'Con +6',
  skills: '',
  imm: 'Poison',
  senses: 'Darkvision 60 ft., Passive Perception 11',
  traits: [{ name: 'Bound to the Gate', text: 'The warden can’t leave the gatehouse.' }],
  actions: [
    { name: 'Multiattack', text: 'The warden makes two Slam attacks.' },
    { name: 'Slam', text: 'Melee Attack Roll: +7, reach 10 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.' },
    { name: '', text: '' },
  ],
  legendary: [],
  tactics: 'Holds the door.',
};

describe('the arithmetic of a stat block', () => {
  it('writes Hit Points as the books do', () => {
    expect(hitPoints('7d8+7')).toEqual({ hp: '38 (7d8 + 7)', avg: 38 });
    expect(hitPoints('2d6')).toEqual({ hp: '7 (2d6)', avg: 7 });
    expect(hitPoints('3d4 - 3')).toEqual({ hp: '4 (3d4 - 3)', avg: 4 });
    expect(hitPoints('52 (8d8 + 16)')).toEqual({ hp: '52 (8d8 + 16)', avg: 52 });
    expect(hitPoints('40')).toEqual({ hp: '40', avg: 40 });
    expect(hitPoints('plenty')).toBeNull();
  });
  it('knows every Challenge Rating, its Proficiency Bonus, and an ability’s modifier', () => {
    expect(CHALLENGE_RATINGS.slice(0, 5)).toEqual(['0', '1/8', '1/4', '1/2', '1']);
    expect(CHALLENGE_RATINGS).toHaveLength(34);
    expect([crPb('1/4'), crPb('4'), crPb('5'), crPb('17'), crPb('30')]).toEqual([2, 2, 3, 6, 9]);
    expect([abilityMod(1), abilityMod(9), abilityMod(10), abilityMod(18)]).toEqual([-5, -1, 0, 4]);
  });
});

describe('the GM’s own stat blocks', () => {
  it('keeps a whole stat block and fills in what follows from it', async () => {
    const { gm, add } = await world();
    const warden = await add('The Gate Warden', 'creature');
    const saved = (await request(gm).put(`/api/statblocks/${warden.id}`).send(WARDEN)).body;
    expect(saved).toMatchObject({ own: true, name: 'The Gate Warden', kind: 'creature', ac: 17, hp: '76 (9d10 + 27)', hpAvg: 76, init: 2, cr: '5', xp: 1800, pb: 3, imm: 'Poison' });
    // Nothing typed is nothing kept; an empty entry is dropped.
    expect(saved).not.toHaveProperty('skills');
    expect(saved).not.toHaveProperty('legendary');
    expect(saved).not.toHaveProperty('base');
    expect(saved.actions.map((a: { name: string }) => a.name)).toEqual(['Multiattack', 'Slam']);
    // The tracker's list has its numbers.
    const index = (await request(gm).get('/api/statblocks')).body as { id: string; ac: number; hp: number; init: number; cr: string }[];
    expect(index.find((s) => s.id === warden.id)).toMatchObject({ ac: 17, hp: 76, init: 2, cr: '5' });
    // A renamed record's block goes by the new name.
    await request(gm).patch(`/api/entities/${warden.id}`).send({ name: 'The Old Warden', reason: 'test' });
    expect((await request(gm).get(`/api/statblocks/${warden.id}`)).body.name).toBe('The Old Warden');
    // An initiative of its own is kept.
    expect((await request(gm).put(`/api/statblocks/${warden.id}`).send({ ...WARDEN, init: 5 })).body.init).toBe(5);
    await request(gm).delete(`/api/statblocks/${warden.id}`);
    expect((await request(gm).get(`/api/statblocks/${warden.id}`)).body.name).toBeUndefined();
  });

  it('refuses what isn’t a stat block', async () => {
    const { gm, add } = await world();
    const e = await add('Nobody', 'npc');
    const put = async (body: object) => (await request(gm).put(`/api/statblocks/${e.id}`).send(body)).status;
    expect(await put({})).toBe(400);
    expect(await put({ ...WARDEN, cr: '31' })).toBe(400);
    expect(await put({ ...WARDEN, hp: 'plenty' })).toBe(400);
    expect(await put({ ...WARDEN, ab: [18, 14, 16] })).toBe(400);
    expect(await put({ kind: 'hazard' })).toBe(400);
    expect((await request(gm).put('/api/statblocks/NOPE-1').send(WARDEN)).status).toBe(404);
  });

  it('gives a short card the numbers of the book block it names', async () => {
    const { gm, add } = await world();
    const captain = await add('Captain Ilse', 'npc');
    const saved = (await request(gm).put(`/api/statblocks/${captain.id}`).send({ base: 'Bandit Captain', changes: 'Fights with a halberd.', ab: [10, 10, 10, 10, 10, 10], hp: '5d8' })).body;
    // A card keeps only what a card has.
    expect(saved).toMatchObject({ base: 'Bandit Captain', meta: 'Uses the Bandit Captain stat block', changes: 'Fights with a halberd.' });
    expect(saved).not.toHaveProperty('ab');
    expect(saved).not.toHaveProperty('hp');
    const shown = (await request(gm).get(`/api/statblocks/${captain.id}`)).body;
    expect(shown).toMatchObject({ ac: 15, hp: '52 (8d8 + 16)', hpAvg: 52, init: 3, cr: '2' });
    expect(shown.baseBlock.name).toBe('Bandit Captain');
  });

  it('keeps a hazard, on any kind of record', async () => {
    const { gm, add } = await world();
    const hall = await add('The Hall of Blades', 'landmark');
    const saved = (await request(gm).put(`/api/statblocks/${hall.id}`).send({ kind: 'hazard', meta: 'Trap (levels 5 to 10)', trigger: 'A creature crosses the hall.', effect: '22 (4d10) Slashing damage.', ac: 12, actions: [{ name: 'Slam', text: 'x' }] })).body;
    expect(saved).toMatchObject({ kind: 'hazard', meta: 'Trap (levels 5 to 10)', trigger: 'A creature crosses the hall.', effect: '22 (4d10) Slashing damage.' });
    expect(saved).not.toHaveProperty('ac');
    expect(saved).not.toHaveProperty('actions');
  });

  it('travels whole in a shared worldbook', async () => {
    const { gm, add } = await world();
    const warden = await add('The Gate Warden', 'creature');
    await request(gm).put(`/api/statblocks/${warden.id}`).send(WARDEN);
    const file = (await request(gm).get('/api/worldbooks/share').query({ name: 'Ostmark' }).buffer(true).parse(binary)).body as Buffer;
    const block = JSON.parse(readWorldbook(file).files.find((f) => f.path === 'statblocks/statblocks.json')!.data.toString('utf8')).statblocks[warden.id];
    expect(block).toMatchObject({ ac: 17, hp: '76 (9d10 + 27)', cr: '5', xp: 1800 });
    expect(block.actions).toHaveLength(2);
    // On another computer it reads as the worldbook's own.
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Ostmark.worldbook');
    await request(gmB).post('/api/libraries/from-worldbook/ostmark').send({});
    const there = (await request(gmB).get(`/api/statblocks/${warden.id}`)).body;
    expect(there).toMatchObject({ name: 'The Gate Warden', ac: 17, hpAvg: 76 });
    expect(there.own).toBeUndefined();
  });
});
