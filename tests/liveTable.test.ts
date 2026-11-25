/** The live table (v0.9.7, docs/BETA_PLAN.md B4): the change feed, and sheet saves that send only what changed. */
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { ChangeFeed } from '../server/src/live/feed.js';
import { applySheetDiff, noChange, sheetDiff } from '../shared/sheetDiff.js';

describe('what changed on a sheet', () => {
  it('is the fields set and the fields removed, and nothing else', () => {
    const base = { hp: 12, maxHp: 12, notes: 'x', coins: { gp: 5 }, spells: [{ name: 'Light' }] };
    const next = { hp: 7, maxHp: 12, coins: { gp: 5 }, spells: [{ name: 'Light' }, { name: 'Shield' }], xp: 0 };
    const d = sheetDiff(base, next);
    expect(d).toEqual({ set: { hp: 7, spells: [{ name: 'Light' }, { name: 'Shield' }], xp: 0 }, unset: ['notes'] });
    expect(applySheetDiff(base, d)).toEqual(next);
    expect(noChange(sheetDiff(base, { ...base }))).toBe(true);
    // Laid onto a sheet someone else changed meanwhile, their fields stay.
    expect(applySheetDiff({ ...base, maxHp: 20, ac: 15 }, d)).toMatchObject({ hp: 7, maxHp: 20, ac: 15 });
  });
});

describe('the change feed', () => {
  it('speaks when this connection writes, when another does, and not otherwise', () => {
    const ctx = tempContext();
    const feed = new ChangeFeed(ctx, 60_000);
    const got: string[] = [];
    const stop = feed.listen((c) => got.push(c));
    expect(feed.check()).toBe(false);
    ctx.db.prepare(`INSERT INTO settings (key, value) VALUES ('x', '1')`).run();
    expect(feed.check()).toBe(true);
    expect(feed.check()).toBe(false);
    // Another connection to the same library (the table server as its own process sees the GM's writes this way).
    const other = new AppContext(ctx.paths, 'player');
    other.db.prepare(`UPDATE settings SET value = '2' WHERE key = 'x'`).run();
    expect(feed.check()).toBe(true);
    // Reading changes nothing.
    ctx.db.prepare('SELECT * FROM settings').all();
    expect(feed.check()).toBe(false);
    expect(got).toEqual(['event: change\ndata: {}\n\n', 'event: change\ndata: {}\n\n']);
    stop();
    expect(feed.listeners).toBe(0);
    other.db.close();
  });

  it('is an event stream on the table server and the GM’s, saying only that something changed', async () => {
    const ctx = tempContext();
    for (const [app, url] of [
      [createApp(new AppContext(ctx.paths, 'player')), '/api/player/events'],
      [createApp(ctx), '/api/events'],
    ] as const) {
      const server = http.createServer(app).listen(0);
      const port = (server.address() as { port: number }).port;
      const text = await new Promise<string>((resolve, reject) => {
        const req = http.get({ port, path: url }, (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          let buf = '';
          res.on('data', (c: Buffer) => {
            buf += c.toString();
            if (buf.includes('connected')) ctx.db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('y', ?)`).run(String(Math.random()));
            if (buf.includes('event: change')) {
              req.destroy();
              resolve(buf);
            }
          });
        });
        req.on('error', (e) => (String(e).includes('socket hang up') ? undefined : reject(e)));
      });
      expect(text).toContain('retry: 3000');
      expect(text).toContain('event: change\ndata: {}');
      await new Promise((r) => server.close(r));
    }
    // The GM's own routes aren't on the table server.
    expect((await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/events')).status).toBe(404);
  });
});

describe('two people, one sheet', () => {
  async function table() {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const camp = (await request(gm).post('/api/campaigns').send({ title: 'The Iron Crown' })).body as { id: number };
    const ch = (await request(gm).post('/api/characters').send({ campaign_id: camp.id, name: 'Ilse', class_name: 'Fighter', level: 2, sheet: { hp: 20, maxHp: 20, ac: 16, equipment: 'Rope' } })).body as { id: number };
    const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body as { code: string };
    const player = createApp(new AppContext(ctx.paths, 'player'));
    const get = async () => (await request(gm).get(`/api/characters/${ch.id}`)).body as { name: string; level: number; sheet: Record<string, unknown> };
    return { gm, player, ch, me: `/api/player/me/${page.code}`, get };
  }

  it('the GM’s change and the player’s both stay, whoever saves last', async () => {
    const { gm, player, ch, me, get } = await table();
    // Both have the sheet open. The GM deals damage; the player, on the sheet as it was, buys a torch.
    await request(gm).patch(`/api/characters/${ch.id}`).send({ sheet_patch: { set: { hp: 11 } } });
    const saved = (await request(player).patch(me).send({ character: { sheet_patch: { set: { equipment: 'Rope\nTorch' } } } })).body as { sheet: Record<string, unknown> };
    expect(saved.sheet).toMatchObject({ hp: 11, equipment: 'Rope\nTorch' });
    // The other way round: the player heals, then the GM (whose copy still says 11) changes the Armor Class.
    await request(player).patch(me).send({ character: { sheet_patch: { set: { hp: 18 }, unset: ['equipment'] } } });
    await request(gm).patch(`/api/characters/${ch.id}`).send({ sheet_patch: { set: { ac: 17 } } });
    const now = await get();
    expect(now.sheet).toMatchObject({ hp: 18, ac: 17, maxHp: 20 });
    expect(now.sheet).not.toHaveProperty('equipment');
  });

  it('a patch is still checked, and can’t reach what isn’t the player’s', async () => {
    const { gm, player, ch, me, get } = await table();
    await request(gm).patch(`/api/characters/${ch.id}`).send({ sheet_patch: { set: { shardscarred: 'GM only' } } });
    expect((await request(player).patch(me).send({ character: { sheet_patch: { set: { hp: 'lots' } } } })).status).toBe(400);
    // The level isn't theirs to send at all.
    expect((await request(player).patch(me).send({ character: { level: 9 } })).status).toBe(400);
    const res = await request(player).patch(me).send({ character: { sheet_patch: { set: { shardscarred: 'mine now', hp: 5 }, unset: ['shardscarred'] } } });
    expect(res.body.sheet).not.toHaveProperty('shardscarred');
    expect(await get()).toMatchObject({ level: 2, sheet: { hp: 5, shardscarred: 'GM only' } });
    expect((await request(gm).patch(`/api/characters/${ch.id}`).send({ sheet_patch: { set: { hp: 'lots' } } })).status).toBe(400);
    // A whole sheet still replaces it (the builder's "Send to my sheet").
    await request(gm).patch(`/api/characters/${ch.id}`).send({ sheet: { hp: 1 } });
    expect((await get()).sheet).toEqual({ hp: 1 });
  });
});
