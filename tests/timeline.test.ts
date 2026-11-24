/** The timeline (v0.7): sessions among the world's history, history revealed like records, and the players' timeline. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixtureFiles, tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { campaigns, sessions, setActiveCampaign } from '../server/src/repo/campaigns.js';
import { calendarEvents } from '../server/src/repo/calendar.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { exportCampaign, importCampaign } from '../server/src/backup/exporter.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { applyAdditions } from '../server/src/additions.js';
import { mergeByDate } from '../shared/timeline.js';

describe('placing dated things among the history', () => {
  it('puts each dated item after the last row on or before its date, and leaves undated rows where they are', () => {
    const rows = [
      { n: 'before time', year: null, day: null },
      { n: 'y1', year: 1, day: null },
      { n: 'undated note', year: null, day: null },
      { n: 'y5', year: 5, day: 10 },
    ];
    const items = [
      { n: 's: y3', year: 3, day: 1 },
      { n: 's: y5 d20', year: 5, day: 20 },
      { n: 's: y0', year: 0, day: 2 },
      { n: 's: y5 d10', year: 5, day: 10 },
      { n: 'no date', year: null, day: null },
    ];
    expect(mergeByDate(rows, items).map((x) => x.n)).toEqual(['before time', 's: y0', 'y1', 's: y3', 'undated note', 'y5', 's: y5 d10', 's: y5 d20']);
    expect(mergeByDate([], [{ n: 'a', year: 2, day: null }]).map((x) => x.n)).toEqual(['a']);
  });
});

function world() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const a = (campaigns.create(ctx.db, { title: 'Table A' }) as { id: number }).id;
  const b = (campaigns.create(ctx.db, { title: 'Table B' }) as { id: number }).id;
  return { ctx, gm, a, b, player: createApp(new AppContext(ctx.paths, 'player')) };
}
const add = async (gm: ReturnType<typeof createApp>, body: Record<string, unknown>) => {
  await request(gm).post('/api/timeline').send(body).expect(200);
  const rows = (await request(gm).get('/api/timeline')).body as { id: number; event: string }[];
  return rows.find((r) => r.event === body.event)!.id;
};

describe('the timeline', () => {
  it('reveals a history row to everyone or to one campaign, never a SECRET one', async () => {
    const { gm, a, b, player, ctx } = world();
    const founding = await add(gm, { year: 1, event: 'The founding', access: 'CANON' });
    const war = await add(gm, { year: 5, event: 'The war', access: 'CANON' });
    const secret = await add(gm, { year: 3, event: 'The pact nobody knows', access: 'SECRET' });
    await request(gm).post(`/api/timeline/${founding}/reveal`).send({ campaign_id: null, on: true }).expect(200);
    const r = await request(gm).post(`/api/timeline/${war}/reveal`).send({ campaign_id: a, on: true }).expect(200);
    expect(r.body).toMatchObject({ player_visible: false, campaigns: [a] });
    expect((await request(gm).post(`/api/timeline/${secret}/reveal`).send({ campaign_id: null, on: true })).status).toBe(400);
    // Even if one were set by hand, players never see a SECRET row.
    ctx.db.prepare('UPDATE timeline_rows SET player_visible = 1 WHERE id = ?').run(secret);

    const rows = (await request(gm).get('/api/timeline')).body as { id: number; player_visible: boolean; campaigns: number[] }[];
    expect(rows.find((x) => x.id === founding)).toMatchObject({ player_visible: true, campaigns: [] });
    expect((await request(gm).get('/api/timeline/reveal-choices')).body.choices.map((c: { id: number }) => c.id)).toEqual([a, b]);

    const history = (c: { timeline: { kind: string; text?: string }[] }) => c.timeline.filter((t) => t.kind === 'history').map((t) => t.text);
    setActiveCampaign(ctx.db, a);
    const all = (await request(player).get('/api/player/campaigns')).body as { id: number; timeline: { kind: string; text?: string }[] }[];
    expect(history(all.find((c) => c.id === a)!)).toEqual(['The founding', 'The war']);
    expect(history(all.find((c) => c.id === b)!)).toEqual(['The founding']);
    expect(JSON.stringify(all)).not.toContain('pact');
    // The published handbook shows history revealed to everyone only, as it does records.
    expect(history(playerSnapshot(ctx.db).campaigns.find((c) => c.id === a)!)).toEqual(['The founding']);

    // Taking it back.
    await request(gm).post(`/api/timeline/${war}/reveal`).send({ campaign_id: a, on: false }).expect(200);
    const again = (await request(player).get('/api/player/campaigns')).body as { id: number; timeline: { kind: string; text?: string }[] }[];
    expect(history(again.find((c) => c.id === a)!)).toEqual(['The founding']);
  });

  it('places the sessions played and the events shown, by in-world date; a title shows once its recap does', async () => {
    const { gm, a, player, ctx } = world();
    const founding = await add(gm, { year: 1, event: 'The founding' });
    const war = await add(gm, { year: 5, event: 'The war' });
    for (const id of [founding, war]) await request(gm).post(`/api/timeline/${id}/reveal`).send({ on: true }).expect(200);
    sessions.create(ctx.db, { campaign_id: a, number: 1, title: 'The ambush at the ford', status: 'completed', date_year: 3, date_day: 10 });
    sessions.create(ctx.db, { campaign_id: a, number: 2, title: 'Home again', status: 'completed', date_year: 6, date_day: 2, recap: 'We came home.', recap_player_visible: true });
    sessions.create(ctx.db, { campaign_id: a, number: 3, title: 'Not yet played', status: 'planned', date_year: 7, date_day: 1 });
    sessions.create(ctx.db, { campaign_id: a, number: 4, title: 'Undated', status: 'completed' });
    calendarEvents.create(ctx.db, { campaign_id: a, year: 4, day: 30, title: 'The comet', notes: 'GM note: it is a ship', player_visible: true });
    calendarEvents.create(ctx.db, { campaign_id: a, year: 4, day: 31, title: 'Hidden event', player_visible: false });

    const c = ((await request(player).get('/api/player/campaigns')).body as { id: number; timeline: Record<string, unknown>[] }[]).find((x) => x.id === a)!;
    expect(c.timeline.map((t) => (t.kind === 'history' ? t.text : t.kind === 'session' ? `S${t.number}${t.title ? `: ${t.title}` : ''}` : t.title))).toEqual([
      'The founding',
      'S1',
      'The comet',
      'The war',
      'S2: Home again',
    ]);
    expect(c.timeline.find((t) => t.number === 2)).toMatchObject({ recap: true });
    const text = JSON.stringify(c.timeline);
    for (const hidden of ['ambush', 'Not yet played', 'Undated', 'Hidden event', 'ship']) expect(text).not.toContain(hidden);
  });

  it('keeps what players were shown when the archive is imported again, and when additions are applied again', () => {
    const ctx = tempContext({ settingRealms: true });
    const files = fixtureFiles();
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'fixture'));
    const a = (campaigns.create(ctx.db, { title: 'Table A' }) as { id: number }).id;
    const row = (event: string) => (ctx.db.prepare('SELECT id FROM timeline_rows WHERE event LIKE ?').get(`${event}%`) as { id: number }).id;
    ctx.db.prepare('UPDATE timeline_rows SET player_visible = 1 WHERE id = ?').run(row('The tower falls'));
    ctx.db.prepare('INSERT INTO campaign_timeline_reveals (campaign_id, row_id) VALUES (?, ?)').run(a, row('Play begins'));
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'fixture again'));
    expect(ctx.db.prepare('SELECT player_visible FROM timeline_rows WHERE id = ?').get(row('The tower falls'))).toEqual({ player_visible: 1 });
    expect(ctx.db.prepare('SELECT campaign_id FROM campaign_timeline_reveals WHERE row_id = ?').all(row('Play begins'))).toEqual([{ campaign_id: a }]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-tl-add-'));
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ rows: [{ sort_order: 50, time_label: 'Year 9', event: 'The bridge opens', entity_ids: [] }] }));
    applyAdditions(ctx.db, dir);
    ctx.db.prepare('UPDATE timeline_rows SET player_visible = 1 WHERE id = ?').run(row('The bridge opens'));
    applyAdditions(ctx.db, dir);
    expect(ctx.db.prepare('SELECT player_visible FROM timeline_rows WHERE id = ?').get(row('The bridge opens'))).toEqual({ player_visible: 1 });
  });

  it('carries a campaign’s timeline reveals in its export, by the row’s time and event', async () => {
    const { gm, a, ctx } = world();
    const war = await add(gm, { year: 5, event: 'The war' });
    await request(gm).post(`/api/timeline/${war}/reveal`).send({ campaign_id: a, on: true }).expect(200);
    const file = exportCampaign(ctx.db, a);
    const other = tempContext();
    const gm2 = createApp(other);
    await add(gm2, { year: 2, event: 'Something else' });
    const war2 = await add(gm2, { year: 5, event: 'The war' });
    const cid = importCampaign(other.db, file);
    expect(other.db.prepare('SELECT row_id FROM campaign_timeline_reveals WHERE campaign_id = ?').all(cid)).toEqual([{ row_id: war2 }]);
  });
});
