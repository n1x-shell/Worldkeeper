/** The GM's own magic items and spells (v0.9.5, docs/BETA_PLAN.md B2). */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { readWorldbook } from '../server/src/packs/share.js';
import { bookTreasure } from '../server/src/repo/bookData.js';
import { publishedRuleEntries } from '../server/src/repo/rulesPacks.js';
import { TABLES } from '../server/src/backup/exporter.js';

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const LANTERN = { kind: 'item', name: 'Lantern of the Drowned', data: { type: 'Wondrous Item', rarity: 'rare', attunement: 'requires attunement', weight: 2, text: 'While lit, the lantern shows the drowned dead within 30 feet.' } };
const STEP = {
  kind: 'spell',
  name: 'Ashen Step',
  data: { level: 2, school: 'Conjuration', classes: ['Wizard', 'Sorcerer'], time: 'Bonus Action', range: 'Self', components: 'V, M (a pinch of ash)', duration: 'Concentration, up to 1 minute', text: 'You step through ash.' },
};

function world() {
  const ctx = tempContext();
  return { ctx, gm: createApp(ctx), table: createApp(new AppContext(ctx.paths, 'player')) };
}

describe('the GM’s own items and spells', () => {
  it('an item joins the books’: Your Books, a name on a sheet, the treasure the tool rolls', async () => {
    const { ctx, gm, table } = world();
    const made = (await request(gm).post('/api/homebrew').send(LANTERN)).body;
    expect(made).toMatchObject({ kind: 'item', name: 'Lantern of the Drowned', pack_id: null, data: { rarity: 'rare', magic: true, value: null, weight: 2 } });
    const inBooks = ((await request(gm).get('/api/books/items').query({ q: 'drowned' })).body as { name: string; source: string; rarity: string }[])[0];
    expect(inBooks).toMatchObject({ name: 'Lantern of the Drowned', source: 'Your own', rarity: 'rare' });
    // Players' sheets find it by name, on the table server too.
    const onSheet = (await request(table).get('/api/player/items').query({ names: 'lantern of the drowned' })).body;
    expect(onSheet['lantern of the drowned']).toMatchObject({ name: 'Lantern of the Drowned', attunement: 'requires attunement' });
    expect(bookTreasure(ctx.db).magic).toContainEqual({ name: 'Lantern of the Drowned', rarity: 'rare' });
    // It wins over a book's item of the same name.
    await request(gm).post('/api/homebrew').send({ kind: 'item', name: 'Bag of Holding', data: { rarity: 'common', text: 'Mine holds less.' } });
    expect(((await request(gm).get('/api/books/items').query({ q: 'bag of holding' })).body as { text: string }[])[0].text).toBe('Mine holds less.');
    // Changed, then removed: the lists follow at once.
    const changed = (await request(gm).put(`/api/homebrew/${made.id}`).send({ ...LANTERN, name: 'Drowned Lantern', data: { ...LANTERN.data, rarity: '' } })).body;
    expect(changed).toMatchObject({ id: made.id, name: 'Drowned Lantern', data: { magic: false } });
    expect((await request(gm).get('/api/books/items').query({ q: 'lantern of the drowned' })).body).toHaveLength(0);
    await request(gm).delete(`/api/homebrew/${made.id}`);
    expect((await request(gm).get('/api/books/items').query({ q: 'drowned' })).body).toHaveLength(0);
    expect((await request(gm).delete(`/api/homebrew/${made.id}`)).status).toBe(404);
  });

  it('a spell joins the spell lists, for the GM, the table and the published handbook', async () => {
    const { ctx, gm, table } = world();
    await request(gm).post('/api/homebrew').send(STEP);
    for (const app of [gm, table]) {
      const spell = ((await request(app).get('/api/player/rules')).body.spells as { name: string }[]).find((s) => s.name === 'Ashen Step');
      expect(spell).toMatchObject({ level: 2, school: 'Conjuration', classes: ['Wizard', 'Sorcerer'], concentration: true, material: true, ritual: false, source: 'Your own' });
    }
    expect(publishedRuleEntries(ctx.db).find((e) => e.name === 'Ashen Step')).toMatchObject({ kind: 'spell', source: 'Your own' });
    // The GM's version of a book's spell replaces it, not doubles it.
    await request(gm).post('/api/homebrew').send({ ...STEP, name: 'Fireball', data: { ...STEP.data, level: 3, school: 'Evocation' } });
    const fireballs = ((await request(gm).get('/api/player/rules')).body.spells as { name: string; source: string }[]).filter((s) => s.name === 'Fireball');
    expect(fireballs.map((s) => s.source)).toEqual(['Your own']);
  });

  it('refuses what isn’t one', async () => {
    const { gm } = world();
    const post = async (body: object) => (await request(gm).post('/api/homebrew').send(body)).status;
    expect(await post({ ...LANTERN, data: { ...LANTERN.data, text: '' } })).toBe(400);
    expect(await post({ ...LANTERN, name: ' ' })).toBe(400);
    expect(await post({ ...LANTERN, data: { ...LANTERN.data, rarity: 'shiny' } })).toBe(400);
    expect(await post({ ...STEP, data: { ...STEP.data, level: 10 } })).toBe(400);
    expect(await post({ ...STEP, data: { ...STEP.data, school: 'Chronomancy' } })).toBe(400);
    expect(await post({ kind: 'feat', name: 'X', data: {} })).toBe(400);
    expect(await post(LANTERN)).toBe(200);
    // One name, once for each kind; an item can't turn into a spell.
    expect(await post({ ...LANTERN, name: 'lantern of the drowned' })).toBe(400);
    expect(await post({ ...STEP, name: 'Lantern of the Drowned' })).toBe(200);
    const id = ((await request(gm).get('/api/homebrew').query({ kind: 'item' })).body as { id: number }[])[0].id;
    expect((await request(gm).put(`/api/homebrew/${id}`).send({ ...STEP, name: 'Other' })).status).toBe(400);
  });

  it('gives an item record rules of its own, which go by the record’s name', async () => {
    const { gm } = world();
    const blade = (await request(gm).post('/api/entities').send({ name: 'The Ost Blade', type: 'item', realm: 'world', body: '## A first look\n\nA plain sword.' })).body as { id: string };
    expect((await request(gm).get(`/api/homebrew/record/${blade.id}`)).body).toEqual({ rules: null });
    const body = { kind: 'item', name: 'The Ost Blade', entity_id: blade.id, data: { type: 'Weapon (Longsword)', rarity: 'very rare', text: 'You have a +2 bonus to attack and damage rolls made with it.' } };
    expect((await request(gm).post('/api/homebrew').send(body)).status).toBe(200);
    expect((await request(gm).post('/api/homebrew').send({ ...body, name: 'Another' })).status).toBe(400);
    expect((await request(gm).post('/api/homebrew').send({ ...body, name: 'Elsewhere', entity_id: 'NOPE-1' })).status).toBe(404);
    await request(gm).patch(`/api/entities/${blade.id}`).send({ name: 'Ostblade', reason: 'test' });
    expect((await request(gm).get(`/api/homebrew/record/${blade.id}`)).body.rules).toMatchObject({ name: 'Ostblade', entity_id: blade.id });
    expect(((await request(gm).get('/api/books/items').query({ q: 'ostblade' })).body as { name: string }[])[0].name).toBe('Ostblade');
  });

  it('travels in a shared worldbook, once, and leaves with it', async () => {
    const { gm } = world();
    const blade = (await request(gm).post('/api/entities').send({ name: 'The Ost Blade', type: 'item', realm: 'world', body: '## A first look\n\nA plain sword.' })).body as { id: string };
    await request(gm).post('/api/homebrew').send({ ...LANTERN, name: 'The Ost Blade', entity_id: blade.id });
    await request(gm).post('/api/homebrew').send(LANTERN);
    await request(gm).post('/api/homebrew').send(STEP);
    // With players in mind: the spells, which players read; not the items, which the GM hands out.
    const forPlayers = readWorldbook((await request(gm).get('/api/worldbooks/share').query({ name: 'Ostmark', gmOnly: 'leave-out' }).buffer(true).parse(binary)).body as Buffer);
    const carried = JSON.parse(forPlayers.files.find((f) => f.path === 'homebrew/homebrew.json')!.data.toString('utf8')).homebrew as { kind: string; name: string }[];
    expect(carried.map((h) => h.name)).toEqual(['Ashen Step']);
    const file = (await request(gm).get('/api/worldbooks/share').query({ name: 'Ostmark' }).buffer(true).parse(binary)).body as Buffer;
    expect(readWorldbook(file).manifest.shared?.counts).toMatchObject({ items: 2, spells: 1 });

    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Ostmark.worldbook');
    const started = (await request(gmB).post('/api/libraries/from-worldbook/ostmark').send({})).body;
    expect(started.result.homebrew).toBe(3);
    let list = (await request(gmB).get('/api/homebrew')).body as { id: number; kind: string; name: string; pack_id: string | null; entity_id: string | null }[];
    expect(list.map((h) => [h.kind, h.name, h.pack_id])).toEqual([
      ['item', 'Lantern of the Drowned', 'ostmark'],
      ['item', 'The Ost Blade', 'ostmark'],
      ['spell', 'Ashen Step', 'ostmark'],
    ]);
    expect(list[1].entity_id).toBe(blade.id);
    // An update adds nothing twice; one the GM changed becomes theirs.
    expect((await request(gmB).post('/api/setting-packs/ostmark/update')).body.homebrew).toBe(0);
    await request(gmB).put(`/api/homebrew/${list[0].id}`).send({ ...LANTERN, data: { ...LANTERN.data, rarity: 'uncommon' } });
    // Removed from the library, the worldbook takes its own with it; the GM's stays.
    await request(gmB).delete('/api/setting-packs/ostmark');
    list = (await request(gmB).get('/api/homebrew')).body;
    expect(list.map((h) => [h.name, h.pack_id])).toEqual([['Lantern of the Drowned', null]]);
  });

  it('is in backups', () => {
    expect(TABLES).toContain('homebrew');
  });
});
