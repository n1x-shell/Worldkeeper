/** Session and timeline dates through the world's calendar (v0.5.1). */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { TWELVE_THIRTY, parseWhen } from '../shared/calendar.js';
import { adoptSessionDates, adoptTimelineDates } from '../server/src/repo/calendars.js';

describe('dates through the calendar', () => {
  it('reads whether a day was named', () => {
    expect(parseWhen(TWELVE_THIRTY, 'Year 22')).toEqual({ year: 22, day: null });
    expect(parseWhen(TWELVE_THIRTY, 'Third Month 5, Year 22')).toEqual({ year: 22, day: 65 });
    expect(parseWhen(TWELVE_THIRTY, 'Before the Cycle')).toBeNull();
  });

  it('dates a session: on the campaign’s date when made, by picking or typing, and keeps words it can’t read', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const c = (await request(gm).post('/api/campaigns').send({ title: 'A', starting_date: 'Second Month 10, Year 7' })).body;
    const s = (await request(gm).post('/api/sessions/next').send({ campaignId: c.id })).body;
    expect(s).toMatchObject({ date_year: 7, date_day: 40, in_world_date: 'Second Month 10, Year 7' });

    // Typed words the calendar can read become the date.
    let r = (await request(gm).patch(`/api/sessions/${s.id}`).send({ in_world_date: 'Fourth Month 1, Year 7', date_year: null, date_day: null })).body;
    expect(r).toMatchObject({ date_year: 7, date_day: 91 });
    // Words it can't read are kept, undated.
    r = (await request(gm).patch(`/api/sessions/${s.id}`).send({ in_world_date: 'the morning after', date_year: null, date_day: null })).body;
    expect(r).toMatchObject({ in_world_date: 'the morning after', date_year: null, date_day: null });
    // A picked date with no words is written out.
    r = (await request(gm).patch(`/api/sessions/${s.id}`).send({ in_world_date: '', date_year: 8, date_day: 1 })).body;
    expect(r).toMatchObject({ in_world_date: 'First Month 1, Year 8', date_year: 8, date_day: 1 });

    // A session from before dates were kept is read at start.
    ctx.db.prepare(`UPDATE sessions SET date_year = NULL, date_day = NULL, in_world_date = 'Twelfth Month 30, Year 9' WHERE id = ?`).run(s.id);
    adoptSessionDates(ctx.db);
    expect(ctx.db.prepare('SELECT date_year, date_day FROM sessions WHERE id = ?').get(s.id)).toEqual({ date_year: 9, date_day: 360 });
  });

  it('dates timeline rows: by year in order, written out when no words are given, read from old labels', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).post('/api/timeline').send({ time_label: 'Year 10', event: 'The founding' });
    await request(gm).post('/api/timeline').send({ time_label: 'Year 50', event: 'The flood' });
    await request(gm).post('/api/timeline').send({ time_label: 'Before the Cycle', event: 'Something undated' });
    // A year with no words: written out, and placed between the founding and the flood.
    expect((await request(gm).post('/api/timeline').send({ year: 20, event: 'The first king' })).status).toBe(200);
    const rows = (await request(gm).get('/api/timeline')).body as { time_label: string; event: string; year: number | null; day: number | null }[];
    expect(rows.map((r) => r.event)).toEqual(['The founding', 'The first king', 'The flood', 'Something undated']);
    expect(rows[1]).toMatchObject({ time_label: 'Year 20', year: 20, day: null });
    expect(rows[0].year).toBe(10);
    expect(rows[3].year).toBeNull();
    expect((await request(gm).post('/api/timeline').send({ event: 'No time at all' })).status).toBe(400);

    ctx.db
      .prepare(
        `INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, realm_ids, source, access, entity_ids, origin) VALUES (99, 'Sixth Month 2, Year 300', 'Old row', '', '[]', '', '', '[]', 'import')`,
      )
      .run();
    adoptTimelineDates(ctx.db);
    expect(ctx.db.prepare(`SELECT year, day FROM timeline_rows WHERE event = 'Old row'`).get()).toEqual({ year: 300, day: 152 });
  });
});
