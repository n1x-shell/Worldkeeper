/** The first run (docs/OWN_WORLD_PLAN.md §2.6, §2.7): a fresh install both ways, the records that teach, Getting started. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';

describe('the first-run wizard', () => {
  it('builds your own world: Next, Next, Finish', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    expect((await request(gm).get('/api/setup')).body).toMatchObject({ needed: true, done: false });

    const res = await request(gm)
      .post('/api/setup/finish')
      .send({
        path: 'own',
        appName: 'Ostmark Tables',
        world: { name: 'Ostmark', pitch: 'A cold world of iron kings.' },
        calendar: { preset: 'twelve-thirty', year: 1247, era: 'AR' },
        realms: [
          { key: 'c1', name: 'Vael', kind: 'continent', parent: 'world' },
          { key: 'c2', name: 'Durn', kind: 'continent', parent: 'world' },
          { key: 'p1', name: 'The Feywild', kind: 'realm', parent: null },
        ],
        modules: { thinning: true },
        campaign: { title: 'The Iron Crown', town: 'Harrowgate', party: ['Ash', 'Bree', ''] },
        tutorial: true,
      });
    expect(res.status).toBe(200);
    const made = res.body;
    expect(made.realms).toEqual(['vael', 'durn', 'feywild']);
    expect(made.characters).toBe(2);
    expect(made.state).toMatchObject({ needed: false, done: true });

    // The world, its shape and calendar.
    const realms = (await request(gm).get('/api/realms')).body as { id: string; name: string; kind: string; parent_id: string | null; description: string }[];
    expect(realms.find((r) => r.id === 'world')).toMatchObject({ name: 'Ostmark', description: 'A cold world of iron kings.' });
    expect(realms.find((r) => r.id === 'vael')).toMatchObject({ kind: 'continent', parent_id: 'world' });
    expect(realms.find((r) => r.id === 'feywild')).toMatchObject({ kind: 'realm', parent_id: null });
    expect((await request(gm).get('/api/meta')).body).toMatchObject({ appName: 'Ostmark Tables', canonReview: false });
    const cal = (await request(gm).get(`/api/calendar?campaign_id=${made.campaignId}`)).body;
    expect(cal.date.year).toBe(1247);
    expect(cal.def).toMatchObject({ eras: [{ format: '{y} AR' }], startYear: 1247 });
    expect((await request(gm).get('/api/modules')).body.modules.filter((m: { on: boolean }) => m.on).map((m: { key: string }) => m.key)).toEqual(['thinning']);

    // The first campaign, active, starting in its new town, with the party.
    const camp = (await request(gm).get(`/api/campaigns/${made.campaignId}`)).body;
    expect(camp).toMatchObject({ title: 'The Iron Crown', starting_location_id: made.town, status: 'active' });
    expect((await request(gm).get('/api/campaigns/active')).body.id).toBe(made.campaignId);
    const town = (await request(gm).get(`/api/entities/${made.town}`)).body.entity;
    expect(town).toMatchObject({ name: 'Harrowgate', type: 'settlement', realm: 'vael', canon_status: 'CANON' });
    expect(town.tags).not.toContain('tutorial');
    expect(town.body).toContain('<!-- To write:');
    expect((await request(gm).get(`/api/characters?campaign_id=${made.campaignId}`)).body.map((c: { name: string }) => c.name).sort()).toEqual(['Ash', 'Bree']);

    // The records that teach: linked, set in the GM's world, never shown to players.
    expect(made.tutorial).toHaveLength(5);
    type Ent = { id: string; name: string; parent_id: string | null; body: string; fields: [string, string][]; tags: string[] };
    const all: Ent[] = await Promise.all(made.tutorial.map(async (id: string) => (await request(gm).get(`/api/entities/${id}`)).body.entity));
    const byName: Record<string, Ent> = Object.fromEntries(all.map((e) => [e.name, e]));
    expect(Object.keys(byName).sort()).toEqual(['Edda Vane', 'Start Here', 'The Lamplighters', 'The Lantern Inn', 'The Old Watchtower']);
    expect(byName['The Lantern Inn'].parent_id).toBe(made.town);
    expect(byName['Edda Vane'].body).toContain('## Secrets (GM only)');
    expect(byName['Edda Vane'].fields).toContainEqual(['Home', 'Harrowgate']);
    expect(byName['Start Here'].body).toContain('Vael');
    for (const e of all) expect(e.tags).toContain('tutorial');
    expect(all.every((e) => /-TUT\d$/.test(e.id))).toBe(true);
    const rels = (await request(gm).get(`/api/entities/${byName['Edda Vane'].id}`)).body.relationships as { type: string; source_id: string; target_id: string }[];
    expect(rels.some((r) => r.type === 'allied_with' && r.source_id === byName['The Lamplighters'].id)).toBe(true);
    const player = createApp(new AppContext(ctx.paths, 'player'));
    expect((await request(player).get(`/api/player/entities/${byName['Edda Vane'].id}`)).status).toBe(404);

    // Getting started follows what the GM does.
    let gs = (await request(gm).get('/api/getting-started')).body;
    expect(gs.show).toBe(true);
    expect(gs.tutorial).toBe(5);
    expect(gs.items.map((i: { key: string }) => i.key)).toEqual(['start', 'town', 'peek', 'new', 'reveal', 'map', 'session']);
    expect(gs.items[1].label).toBe('Write Harrowgate: fill in a section or two');
    // Start Here was opened above (to read it); nothing else is done yet.
    expect(gs.items.filter((i: { done: boolean }) => i.done).map((i: { key: string }) => i.key)).toEqual(['start']);
    await request(gm).get(`/api/entities/${byName['Start Here'].id}`);
    await request(gm).post('/api/entities').send({ name: 'Mara', type: 'npc', realm: 'vael' });
    await request(gm)
      .patch(`/api/entities/${made.town}`)
      .send({ revealed: true, revealed_sections: ['A first look'] });
    gs = (await request(gm).put('/api/getting-started').send({ tick: 'peek' })).body;
    expect(Object.fromEntries(gs.items.map((i: { key: string; done: boolean }) => [i.key, i.done]))).toEqual({
      start: true,
      town: false,
      peek: true,
      new: true,
      reveal: true,
      map: false,
      session: false,
    });
    // Writing a section of the town ticks it off.
    const body = (await request(gm).get(`/api/entities/${made.town}`)).body.entity.body as string;
    await request(gm)
      .patch(`/api/entities/${made.town}`)
      .send({ body: body.replace(/(## A first look\n\n)<!--[^>]*-->/, '$1Mill wheels and slate roofs.') });
    gs = (await request(gm).get('/api/getting-started')).body;
    expect(gs.items.find((i: { key: string }) => i.key === 'town').done).toBe(true);

    // Remove the tutorial records: they go, links and all; the GM's own town and records stay.
    const removed = (await request(gm).delete('/api/setup/tutorial')).body;
    expect(removed.removed).toBe(5);
    expect(removed.backup).toMatch(/pre-remove-tutorial/);
    for (const id of made.tutorial) expect((await request(gm).get(`/api/entities/${id}`)).status).toBe(404);
    expect((await request(gm).get(`/api/entities/${made.town}`)).status).toBe(200);
    expect((await request(gm).get(`/api/campaigns/${made.campaignId}`)).body.starting_location_id).toBe(made.town);
    expect((await request(gm).get('/api/getting-started')).body.tutorial).toBe(0);
    expect((ctx.db.prepare(`SELECT COUNT(*) n FROM relationships WHERE source_id LIKE '%-TUT%' OR target_id LIKE '%-TUT%'`).get() as { n: number }).n).toBe(0);
    gs = (await request(gm).put('/api/getting-started').send({ dismissed: true })).body;
    expect(gs.show).toBe(false);
  });

  it('plays in the Worldkeeper setting: install, then the same last steps', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    expect((await request(gm).post('/api/setup/finish').send({ path: 'setting' })).status).toBe(400);
    expect((await request(gm).post('/api/setting-packs/worldkeeper/install')).status).toBe(200);
    const made = (
      await request(gm)
        .post('/api/setup/finish')
        .send({ path: 'setting', modules: { 'the-return': false }, campaign: { title: 'The Loose Thread', startId: null, party: ['Kit'] } })
    ).body;
    expect(made.state).toMatchObject({ done: true, settingInstalled: true });
    expect(made.tutorial).toEqual([]);
    // The setting keeps Canon Review, and its modules (but the one unticked).
    expect((await request(gm).get('/api/meta')).body.canonReview).toBe(true);
    const on = (await request(gm).get('/api/modules')).body.modules.filter((m: { on: boolean }) => m.on).map((m: { key: string }) => m.key);
    expect(on).toContain('thinning');
    expect(on).not.toContain('the-return');
    expect((await request(gm).get('/api/realms')).body.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['world', 'aetheris', 'kaelmar']));
    expect((await request(gm).get(`/api/campaigns/${made.campaignId}`)).body.title).toBe('The Loose Thread');
  });

  it('is not offered to a library that has anything in it, and can be skipped', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    createEntity(ctx.db, { name: 'Somewhere', type: 'settlement', realm: 'world' } as never);
    expect((await request(gm).get('/api/setup')).body.needed).toBe(false);
    const fresh = createApp(tempContext());
    expect((await request(fresh).post('/api/setup/skip')).body).toMatchObject({ needed: false, done: true });
    expect((await request(fresh).get('/api/getting-started')).body.show).toBe(false);
    // A plan that names a realm inside one that isn't there is refused, and nothing is made.
    const other = tempContext();
    const res = await request(createApp(other))
      .post('/api/setup/finish')
      .send({ path: 'own', realms: [{ key: 'a', name: 'Lost', kind: 'continent', parent: 'nowhere' }] });
    expect(res.status).toBe(400);
    expect((other.db.prepare(`SELECT COUNT(*) n FROM realms`).get() as { n: number }).n).toBe(1);
  });
});
