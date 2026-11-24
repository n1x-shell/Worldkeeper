/** Each campaign's handbook address on the table server (docs/LIBRARIES_PLAN.md step A3). */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity, updateEntity } from '../server/src/repo/entities.js';
import { campaigns, setActiveCampaign } from '../server/src/repo/campaigns.js';
import { revealToCampaign } from '../server/src/repo/reveals.js';
import { exportCampaign } from '../server/src/backup/exporter.js';

function twoTables() {
  const ctx = tempContext();
  const rec = (id: string, name: string) =>
    createEntity(ctx.db, {
      id,
      name,
      type: 'settlement',
      realm: 'world',
      canon_status: 'CANON',
      aliases: [],
      tags: [],
      fields: [],
      body: `## A first look\n\n${name} by the river.`,
      notes: '',
    } as never);
  rec('SET-0001', 'Harrowgate');
  rec('SET-0002', 'Ashford');
  rec('SET-0003', 'Coldwater');
  updateEntity(ctx.db, 'SET-0001', { revealed: true, revealed_sections: ['A first look'] });
  const a = (campaigns.create(ctx.db, { title: 'Table A' }) as { id: number }).id;
  const b = (campaigns.create(ctx.db, { title: 'Table B' }) as { id: number }).id;
  revealToCampaign(ctx.db, a, 'SET-0002', { sections: ['A first look'] });
  revealToCampaign(ctx.db, b, 'SET-0003', { sections: ['A first look'] });
  const gm = createApp(ctx);
  const table = createApp(new AppContext(ctx.paths, 'player'));
  return { ctx, a, b, gm, table };
}

const names = (body: { name: string }[]) => body.map((e) => e.name).sort();

describe('each campaign’s handbook address', () => {
  it('serves two groups at once from one table server, each seeing only its own', async () => {
    const { ctx, a, b, gm, table } = twoTables();
    await request(gm).post('/api/quests').send({ campaign_id: a, title: 'Find the miller', status: 'active', player_visible: true });
    await request(gm).post('/api/quests').send({ campaign_id: b, title: 'Drain the lake', status: 'active', player_visible: true });
    const codeA = (await request(gm).get(`/api/campaigns/${a}/handbook`)).body.code as string;
    const hb = (await request(gm).get(`/api/campaigns/${b}/handbook`)).body;
    expect(codeA).toMatch(/^[A-Z2-9]{8}$/);
    expect(hb.port).toBe(4320);
    expect(Array.isArray(hb.addresses)).toBe(true);
    const A = `/api/player/c/${codeA}`;
    const B = `/api/player/c/${hb.code}`;
    // The active campaign is A, but B's address shows B's knowledge.
    setActiveCampaign(ctx.db, a);
    expect(names((await request(table).get(`${A}/entities`)).body)).toEqual(['Ashford', 'Harrowgate']);
    expect(names((await request(table).get(`${B}/entities`)).body)).toEqual(['Coldwater', 'Harrowgate']);
    expect((await request(table).get(`${B}/entities/SET-0002`)).status).toBe(404);
    expect(names((await request(table).get(`${B}/search?q=river`)).body)).toEqual(['Coldwater', 'Harrowgate']);
    expect((await request(table).get(`${B}/info`)).body.campaign).toEqual({ id: b, title: 'Table B' });
    // Its own campaign only: no list of the others, and no other campaign by id.
    const cs = (await request(table).get(`${B}/campaigns`)).body as { title: string; quests: { title: string }[] }[];
    expect(cs.map((c) => c.title)).toEqual(['Table B']);
    expect(JSON.stringify(cs)).toContain('Drain the lake');
    expect(JSON.stringify(cs)).not.toContain('miller');
    expect(JSON.stringify((await request(table).get(`${A}/campaigns`)).body)).toContain('Find the miller');
    expect((await request(table).get(`${B}/campaigns/${a}`)).status).toBe(404);
    expect((await request(table).get(`${B}/campaigns/${b}`)).status).toBe(200);
    // The plain address keeps showing the active campaign.
    expect(names((await request(table).get('/api/player/entities')).body)).toEqual(['Ashford', 'Harrowgate']);
    // An unknown code, or an archived campaign's, is not found; codes are case-insensitive.
    expect((await request(table).get('/api/player/c/NOPE2345/entities')).status).toBe(404);
    expect((await request(table).get(`/api/player/c/${hb.code.toLowerCase()}/entities`)).status).toBe(200);
    ctx.db.prepare(`UPDATE campaigns SET status = 'archived' WHERE id = ?`).run(b);
    expect((await request(table).get(`${B}/entities`)).status).toBe(404);
  });

  it('gives a new code (the old address stops working), keeps codes out of exports, and links character pages', async () => {
    const { ctx, a, b, gm, table } = twoTables();
    const old = (await request(gm).get(`/api/campaigns/${a}/handbook`)).body.code;
    const fresh = (await request(gm).post(`/api/campaigns/${a}/handbook/new-code`)).body.code;
    expect(fresh).not.toBe(old);
    expect((await request(table).get(`/api/player/c/${old}/entities`)).status).toBe(404);
    expect((await request(table).get(`/api/player/c/${fresh}/entities`)).status).toBe(200);

    // A campaign export never carries the table's address; the imported copy gets one of its own.
    const data = exportCampaign(ctx.db, a);
    expect(JSON.stringify(data)).not.toContain(fresh);
    await request(gm)
      .post('/api/import/json')
      .attach('file', Buffer.from(JSON.stringify(data)), 'a.json');
    const codes = ctx.db.prepare('SELECT handbook_code FROM campaigns').all() as { handbook_code: string }[];
    expect(new Set(codes.map((c) => c.handbook_code)).size).toBe(3);

    // A character's page names its own campaign's handbook, and opens only there.
    const ch = (await request(gm).post('/api/characters').send({ campaign_id: a, name: 'Wren', species: 'Human', class_name: 'Rogue', level: 3 })).body;
    const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body;
    expect((await request(table).get(`/api/player/me/${page.code}`)).body.handbook).toBe(fresh);
    expect((await request(table).get(`/api/player/c/${fresh}/me/${page.code}`)).status).toBe(200);
    const codeB = (await request(gm).get(`/api/campaigns/${b}/handbook`)).body.code;
    expect((await request(table).get(`/api/player/c/${codeB}/me/${page.code}`)).status).toBe(404);
  });

  it('gives every campaign a code at startup, including ones from before', () => {
    const { ctx } = twoTables();
    ctx.db.prepare('UPDATE campaigns SET handbook_code = NULL').run();
    const again = new AppContext(ctx.paths, 'player');
    expect((again.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE handbook_code IS NULL').get() as { n: number }).n).toBe(0);
  });

  it('answers only campaign addresses when the GM says so, on the table and never in the GM app', async () => {
    const { a, gm, table } = twoTables();
    const code = (await request(gm).get(`/api/campaigns/${a}/handbook`)).body.code;
    const ch = (await request(gm).post('/api/characters').send({ campaign_id: a, name: 'Wren', species: 'Human', class_name: 'Rogue', level: 3 })).body;
    const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body;
    expect((await request(table).get('/api/player/entities')).status).toBe(200);

    await request(gm).put('/api/settings').send({ table_addresses_only: 'on' });
    // The plain address: only what a player needs to find their own.
    expect((await request(table).get('/api/player/entities')).status).toBe(403);
    expect((await request(table).get('/api/player/campaigns')).status).toBe(403);
    expect((await request(table).get('/api/player/search?q=river')).status).toBe(403);
    const info = (await request(table).get('/api/player/info')).body;
    expect(info).toMatchObject({ addressesOnly: true, realms: [], types: [] });
    expect((await request(table).get(`/api/player/me/${page.code}`)).body.handbook).toBe(code);
    // Each campaign's address works as before.
    expect((await request(table).get(`/api/player/c/${code}/entities`)).status).toBe(200);
    expect((await request(table).get(`/api/player/c/${code}/info`)).body.addressesOnly).toBeUndefined();
    // The GM's own preview is never limited.
    expect((await request(gm).get('/api/player/entities')).status).toBe(200);

    await request(gm).put('/api/settings').send({ table_addresses_only: 'off' });
    expect((await request(table).get('/api/player/entities')).status).toBe(200);
  });
});
