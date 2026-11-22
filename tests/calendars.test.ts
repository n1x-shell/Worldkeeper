/** Calendars per world: a pack's, a preset or the GM's own; old text dates read through them; exports keep them. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { adoptCampaignDates, campaignDates, worldCalendar } from '../server/src/repo/calendars.js';
import { uninstallPack } from '../server/src/packs/registry.js';
import { exportJson, importJson } from '../server/src/backup/exporter.js';

describe('calendars', () => {
  it('reads a library’s old text dates through its world’s calendar', () => {
    const ctx = tempContext({ settingRealms: true });
    expect(worldCalendar(ctx.db, 'world')).toMatchObject({ id: 'pack:worldkeeper', pack_id: 'worldkeeper' });
    const id = Number(ctx.db.prepare(`INSERT INTO campaigns (title, starting_date, "current_date") VALUES ('Old', '300 AB / Year 31 Unbound', 'Old Winds 25, 300 AB')`).run().lastInsertRowid);
    adoptCampaignDates(ctx.db);
    // Old Winds is the ninth month: 1 + 8 × 30 + 25 + the Autumn Equinox.
    expect(campaignDates(ctx.db, id)).toEqual({ date: { year: 300, day: 267 }, start: { year: 300, day: 1 } });
    // Without its pack, the world goes back to the default calendar; the year and day stay.
    uninstallPack(ctx.db, 'worldkeeper');
    expect(worldCalendar(ctx.db, 'world')).toMatchObject({ id: null, def: { name: 'Twelve months of thirty days' } });
    expect(campaignDates(ctx.db, id).date).toEqual({ year: 300, day: 267 });
  });

  it('lets the GM choose a calendar, sets dates with it, and keeps it in a JSON export', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const camp = (await request(gm).post('/api/campaigns').send({ title: 'Mine' })).body;
    expect(camp.current_date).toBe('First Month 1, Year 1');
    const list = (await request(gm).get('/api/calendars')).body;
    expect(list.presets.map((p: { key: string }) => p.key)).toEqual(['twelve-thirty', 'like-ours']);
    expect((await request(gm).put('/api/calendars/world').send({ preset: 'like-ours' })).status).toBe(200);
    expect(
      (
        await request(gm)
          .put('/api/calendar/start')
          .send({ campaign_id: camp.id, date: { year: 1247, day: 32 } })
      ).body.text,
    ).toBe('February 1, Year 1247');
    expect(
      (
        await request(gm)
          .post('/api/calendar/date')
          .send({ campaign_id: camp.id, date: { year: 1247, day: 400 } })
      ).status,
    ).toBe(400);
    const cal = (await request(gm).get(`/api/calendar?campaign_id=${camp.id}`)).body;
    expect(cal.def.name).toBe('Like ours');
    expect(cal.start).toEqual({ year: 1247, day: 32 });
    // The players' calendar reads the same way.
    const other = tempContext();
    importJson(other.db, exportJson(ctx.db));
    expect(worldCalendar(other.db, 'world').def.name).toBe('Like ours');
    expect(campaignDates(other.db, camp.id).start).toEqual({ year: 1247, day: 32 });
  });
});
