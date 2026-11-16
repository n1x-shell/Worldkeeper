/** Character pages: the GM edits everything; a player, with their private code, edits only their own memories and names. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { exportCampaign, importCampaign } from '../server/src/backup/exporter.js';
import { playerSnapshot } from '../server/src/player/projection.js';

async function setup() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const camp = (await request(gm).post('/api/campaigns').send({ title: 'Test campaign' })).body;
  const ch = (await request(gm).post('/api/characters').send({ campaign_id: camp.id, name: 'Wren', species: 'Human', class_name: 'Rogue', level: 3 })).body;
  const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body;
  const table = createApp(new AppContext(ctx.paths, 'player'));
  return { ctx, gm, table, camp, ch, page };
}

describe('character pages', () => {
  it('are made on first look, with a private code, and the table server shows a page only by its code', async () => {
    const { table, page } = await setup();
    expect(page.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(page.thinning).toBe(0);
    const mine = await request(table).get(`/api/player/me/${page.code}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ name: 'Wren', class_name: 'Rogue', level: 3, thinning: 0 });
    expect(mine.body.code).toBeUndefined();
    expect(mine.body.character_id).toBeUndefined();
    expect((await request(table).get('/api/player/me/WRONGCOD')).status).toBe(404);
    // Codes are case-insensitive, for reading aloud.
    expect((await request(table).get(`/api/player/me/${page.code.toLowerCase()}`)).status).toBe(200);
    // The GM routes don't exist on the table server.
    expect((await request(table).get('/api/characters/1/page')).status).toBe(404);
  });

  it('let the player add, reword and strike memories, but not unstrike them or change Thinning', async () => {
    const { gm, table, ch, page } = await setup();
    const me = `/api/player/me/${page.code}`;
    let r = await request(table)
      .patch(me)
      .send({ true_name: 'Wrenna Ashby', known_by: ['Mara Venn'], memories: [{ text: "My mother's laugh" }, { text: 'The smell of rain on slate' }] });
    expect(r.status).toBe(200);
    expect(r.body.memories.map((m: { id: number }) => m.id)).toEqual([1, 2]);
    // Player tries to set Thinning: refused, nothing changes.
    expect((await request(table).patch(me).send({ thinning: 3 })).status).toBe(400);
    // GM sets Thinning after a failed save; the player strikes a memory.
    await request(gm).patch(`/api/characters/${ch.id}/page`).send({ thinning: 1 });
    r = await request(table)
      .patch(me)
      .send({
        memories: [
          { id: 1, text: "My mother's laugh", struck: true },
          { id: 2, text: 'The smell of rain on slate' },
        ],
      });
    expect(r.body.thinning).toBe(1);
    expect(r.body.memories[0].struck).toBe(true);
    // Unstriking, rewording or removing a struck memory: refused.
    expect(
      (
        await request(table)
          .patch(me)
          .send({
            memories: [
              { id: 1, text: "My mother's laugh", struck: false },
              { id: 2, text: 'The smell of rain on slate' },
            ],
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(table)
          .patch(me)
          .send({ memories: [{ id: 1, text: 'Something else', struck: true }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(table)
          .patch(me)
          .send({ memories: [{ id: 2, text: 'The smell of rain on slate' }] })
      ).status,
    ).toBe(400);
    // The GM can restore a memory, if the table agrees.
    const g = await request(gm)
      .patch(`/api/characters/${ch.id}/page`)
      .send({ memories: [{ id: 1, text: "My mother's laugh", struck: false }] });
    expect(g.body.memories).toEqual([{ id: 1, text: "My mother's laugh", struck: false }]);
    expect((await request(gm).patch(`/api/characters/${ch.id}/page`).send({ thinning: 7 })).status).toBe(400);
  });

  it('can get a new code, which stops the old link working', async () => {
    const { gm, table, ch, page } = await setup();
    const renewed = (await request(gm).post(`/api/characters/${ch.id}/page/new-code`)).body;
    expect(renewed.code).not.toBe(page.code);
    expect((await request(table).get(`/api/player/me/${page.code}`)).status).toBe(404);
    expect((await request(table).get(`/api/player/me/${renewed.code}`)).status).toBe(200);
  });

  it('travel with a campaign export, with a fresh code, and never appear in the published handbook', async () => {
    const { ctx, gm, camp, ch } = await setup();
    await request(gm)
      .patch(`/api/characters/${ch.id}/page`)
      .send({ true_name: 'Wrenna Ashby', memories: [{ text: 'A secret memory' }] });
    const data = exportCampaign(ctx.db, camp.id);
    expect(data.character_pages).toHaveLength(1);
    const cid = importCampaign(ctx.db, data);
    const copy = ctx.db.prepare('SELECT p.* FROM character_pages p JOIN characters c ON c.id = p.character_id WHERE c.campaign_id = ?').get(cid) as { code: string; true_name: string };
    expect(copy.true_name).toBe('Wrenna Ashby');
    expect(copy.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('A secret memory');
  });
});
