/** The table display (v0.9.9, docs/BETA_PLAN.md B4): what the GM puts on the screen at the table. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';

/** Enough of a PNG for the app to know it's one. */
function png() {
  const b = Buffer.alloc(34);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(4, 16);
  b.writeUInt32BE(4, 20);
  return b;
}

async function table() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const camp = (await request(gm).post('/api/campaigns').send({ title: 'The Iron Crown' })).body as { id: number };
  await request(gm).put('/api/campaigns/active').send({ id: camp.id });
  const player = createApp(new AppContext(ctx.paths, 'player'));
  const shown = async () => (await request(player).get('/api/player/display')).body as { kind: string; [k: string]: unknown };
  const put = (body: object) => request(gm).put(`/api/campaigns/${camp.id}/display`).send(body);
  return { ctx, gm, player, camp, shown, put };
}

describe('the table display', () => {
  it('shows the title card until the GM chooses', async () => {
    const { gm, camp, shown } = await table();
    expect(await shown()).toMatchObject({ kind: 'title', title: 'The Iron Crown' });
    expect((await request(gm).get(`/api/campaigns/${camp.id}/display`)).body).toMatchObject({ display: { kind: 'title' }, maps: [], handouts: [] });
  });

  it('a handout shown is a handout given; taken back, the title card returns', async () => {
    const { gm, camp, shown, put } = await table();
    const h = (await request(gm).post('/api/handouts').send({ campaign_id: camp.id, title: 'A sealed letter', body: 'Come at once.' })).body as { id: number };
    expect((await request(gm).get(`/api/campaigns/${camp.id}/display`)).body.handouts).toMatchObject([{ id: h.id, title: 'A sealed letter', pushed_at: null }]);
    expect((await put({ kind: 'handout', handout_id: h.id })).status).toBe(200);
    expect(await shown()).toEqual({ kind: 'handout', title: 'A sealed letter', body: 'Come at once.', image_file: null });
    // Players have it on their phones too.
    expect(((await request(gm).get(`/api/handouts/${h.id}`)).body as { pushed_at: string | null }).pushed_at).toBeTruthy();
    await request(gm).post(`/api/handouts/${h.id}/push`).send({ pushed: false });
    expect((await shown()).kind).toBe('title');
    expect((await put({ kind: 'handout', handout_id: 9999 })).status).toBe(404);
  });

  it('shows a map only once players can see it, and stops when they no longer can', async () => {
    const { gm, camp, shown, put } = await table();
    const map = (await request(gm).post('/api/maps').send({ name: 'The Vale' })).body as { id: number };
    expect((await put({ kind: 'map', map_id: map.id })).status).toBe(400);
    await request(gm).patch(`/api/maps/${map.id}`).send({ player_visible: true });
    expect((await request(gm).get(`/api/campaigns/${camp.id}/display`)).body.maps).toEqual([{ id: map.id, name: 'The Vale' }]);
    expect((await put({ kind: 'map', map_id: map.id })).status).toBe(200);
    expect(await shown()).toEqual({ kind: 'map', map_id: map.id, title: 'The Vale' });
    await request(gm).patch(`/api/maps/${map.id}`).send({ player_visible: false });
    expect((await shown()).kind).toBe('title');
  });

  it('shows a record’s picture only if it is for players, on a record they know', async () => {
    const { gm, shown, put } = await table();
    const keep = (await request(gm).post('/api/entities').send({ name: 'Brennhold', type: 'settlement', realm: 'world', body: '## A first look\n\nA keep on a cliff.' })).body as { id: string };
    const pic = (await request(gm).post(`/api/entities/${keep.id}/images`).attach('image', png(), { filename: 'p.png', contentType: 'image/png' })).body as { id: number; file: string };
    // GM only, then for players but on a record they don't know: refused both times.
    expect((await put({ kind: 'picture', image_id: pic.id })).status).toBe(400);
    await request(gm).patch(`/api/entity-images/${pic.id}`).send({ player_visible: true, caption: 'From the sea' });
    expect((await put({ kind: 'picture', image_id: pic.id })).status).toBe(400);
    await request(gm).patch(`/api/entities/${keep.id}`).send({ revealed: true, reason: 'test' });
    expect((await put({ kind: 'picture', image_id: pic.id })).status).toBe(200);
    expect(await shown()).toEqual({ kind: 'picture', title: 'Brennhold', caption: 'From the sea', file: pic.file });
    // Unticked again: the display lets go of it.
    await request(gm).patch(`/api/entity-images/${pic.id}`).send({ player_visible: false });
    expect((await shown()).kind).toBe('title');
  });

  it('is each campaign’s own, and the GM’s routes aren’t on the table server', async () => {
    const { ctx, gm, player, camp, put } = await table();
    const other = (await request(gm).post('/api/campaigns').send({ title: 'Elsewhere' })).body as { id: number };
    const h = (await request(gm).post('/api/handouts').send({ campaign_id: other.id, title: 'Theirs' })).body as { id: number };
    // Another campaign's handout can't be put on this one's display.
    expect((await put({ kind: 'handout', handout_id: h.id })).status).toBe(404);
    await request(gm).put(`/api/campaigns/${other.id}/display`).send({ kind: 'handout', handout_id: h.id });
    await request(gm).get(`/api/campaigns/${other.id}/overview`);
    const code = (ctx.db.prepare('SELECT handbook_code c FROM campaigns WHERE id = ?').get(other.id) as { c: string | null }).c;
    if (code) expect((await request(player).get(`/api/player/c/${code}/display`)).body).toMatchObject({ kind: 'handout', title: 'Theirs' });
    expect((await request(player).get('/api/player/display')).body).toMatchObject({ kind: 'title', title: 'The Iron Crown' });
    expect((await request(player).put(`/api/campaigns/${camp.id}/display`).send({ kind: 'title' })).status).toBe(404);
    expect((await put({ kind: 'nonsense' })).status).toBe(400);
  });
});
