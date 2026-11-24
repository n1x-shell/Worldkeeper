/** Undo for faction plans and campaign changes (v0.6.6): one GM action is one step, however many rows it touched. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';

async function setup() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const f = (await request(gm).post('/api/entities').send({ name: 'The Grey Hand', type: 'faction', realm: 'world', body: '' })).body;
  const n = (await request(gm).post('/api/entities').send({ name: 'Mara Venn', type: 'npc', realm: 'world', body: '' })).body;
  const c = (await request(gm).post('/api/campaigns').send({ title: 'The Loose Thread' })).body;
  await request(gm).put('/api/campaigns/active').send({ id: c.id });
  const undoList = async () => (await request(gm).get('/api/undo')).body as { id: number; label: string; can_undo: boolean; why_not: string | null }[];
  const state = async () => (await request(gm).get(`/api/campaign-state?campaign_id=${c.id}`)).body as { id: number; field: string; value: string; status: string }[];
  return { ctx, gm, f, n, c, undoList, state };
}

describe('undo', () => {
  it('undoes recording a change, and the old value it superseded comes back', async () => {
    const { gm, n, c, undoList, state } = await setup();
    await request(gm).post('/api/campaign-state').send({ campaign_id: c.id, entity_id: n.id, field: 'Attitude', value: 'friendly' });
    await request(gm).post('/api/campaign-state').send({ campaign_id: c.id, entity_id: n.id, field: 'Attitude', value: 'hostile' });
    expect((await state()).map((s) => `${s.value}:${s.status}`)).toEqual(['hostile:active', 'friendly:superseded']);
    const [last] = await undoList();
    expect(last).toMatchObject({ label: 'Recorded Attitude → hostile', can_undo: true });
    expect((await request(gm).post(`/api/undo/${last.id}`)).body.undone).toBe('Recorded Attitude → hostile');
    expect((await state()).map((s) => `${s.value}:${s.status}`)).toEqual(['friendly:active']);
    // Undone once; not again.
    expect((await request(gm).post(`/api/undo/${last.id}`)).status).toBe(400);
    expect((await undoList()).map((a) => a.label)).toEqual(['Recorded Attitude → friendly']);
  });

  it('undoes advancing a plan (the plan and the change it logged), editing and deleting one', async () => {
    const { gm, f, c, undoList, state } = await setup();
    const plan = (await request(gm).post('/api/faction-plans').send({ campaign_id: c.id, faction_id: f.id, title: 'Seize the docks', segments: 6 })).body;
    await request(gm).post(`/api/faction-plans/${plan.id}/advance`).send({ delta: 2, reason: 'the harbourmaster bribed' });
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body.progress).toBe(2);
    expect((await state()).length).toBe(1);
    let [a] = await undoList();
    expect(a.label).toBe('Advanced “Seize the docks” by 2');
    await request(gm).post(`/api/undo/${a.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body.progress).toBe(0);
    expect(await state()).toEqual([]);

    await request(gm).patch(`/api/faction-plans/${plan.id}`).send({ title: 'Seize the harbour', notes: 'bigger' });
    [a] = await undoList();
    await request(gm).post(`/api/undo/${a.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body).toMatchObject({ title: 'Seize the docks', notes: '' });

    await request(gm).delete(`/api/faction-plans/${plan.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).status).toBe(404);
    [a] = await undoList();
    expect(a.label).toBe('Deleted the plan “Seize the docks”');
    await request(gm).post(`/api/undo/${a.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body).toMatchObject({ id: plan.id, title: 'Seize the docks' });

    // Undoing adding it removes it.
    const added = (await undoList()).find((x) => x.label === 'Added the plan “Seize the docks”')!;
    expect(added.can_undo).toBe(true);
    await request(gm).post(`/api/undo/${added.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).status).toBe(404);
  });

  it('refuses to undo over a later change, until that one is undone; accepting and rejecting undo too', async () => {
    const { gm, f, n, c, undoList, state } = await setup();
    const plan = (await request(gm).post('/api/faction-plans').send({ campaign_id: c.id, faction_id: f.id, title: 'Seize the docks' })).body;
    await request(gm).patch(`/api/faction-plans/${plan.id}`).send({ progress: 1 });
    await request(gm).post(`/api/faction-plans/${plan.id}/advance`).send({ delta: 2 });
    const [later, earlier] = await undoList();
    expect(later.label).toBe('Advanced “Seize the docks” by 2');
    expect(earlier.label).toBe('Edited the plan “Seize the docks”');
    expect(earlier.can_undo).toBe(false);
    expect(earlier.why_not).toMatch(/undo the later change first/);
    expect((await request(gm).post(`/api/undo/${earlier.id}`)).status).toBe(409);
    await request(gm).post(`/api/undo/${later.id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body.progress).toBe(1);
    expect((await request(gm).post(`/api/undo/${earlier.id}`)).status).toBe(200);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body.progress).toBe(0);

    const proposed = (await request(gm).post('/api/campaign-state').send({ campaign_id: c.id, entity_id: n.id, field: 'Rank', value: 'captain', status: 'proposed' })).body;
    await request(gm).post(`/api/campaign-state/${proposed.id}/decide`).send({ accept: true });
    expect((await state())[0].status).toBe('active');
    const [acc] = await undoList();
    expect(acc.label).toBe('Accepted Rank → captain');
    await request(gm).post(`/api/undo/${acc.id}`);
    expect((await state())[0].status).toBe('proposed');
  });

  it('records nothing for other writes, and keeps undo off the table server', async () => {
    const { ctx, gm, f, c } = await setup();
    // A write outside an undoable action (an import, a restore) leaves no step.
    ctx.db.prepare(`INSERT INTO faction_plans (campaign_id, faction_id, title) VALUES (?, ?, 'Imported plan')`).run(c.id, f.id);
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM undo_rows').get() as { n: number }).n).toBe(0);
    expect((await request(gm).get('/api/undo')).body).toEqual([]);
    const table = createApp(new AppContext(ctx.paths, 'player'));
    expect((await request(table).get('/api/undo')).status).toBe(404);
  });

  it('joins the same edit made again within two minutes (autosave while typing) into one step', async () => {
    const { gm, f, c, undoList } = await setup();
    const plan = (await request(gm).post('/api/faction-plans').send({ campaign_id: c.id, faction_id: f.id, title: 'Seize the docks' })).body;
    for (const notes of ['T', 'Th', 'The harbourmaster']) await request(gm).patch(`/api/faction-plans/${plan.id}`).send({ notes });
    const list = await undoList();
    expect(list.map((a) => a.label)).toEqual(['Edited the plan “Seize the docks”', 'Added the plan “Seize the docks”']);
    await request(gm).post(`/api/undo/${list[0].id}`);
    expect((await request(gm).get(`/api/faction-plans/${plan.id}`)).body.notes).toBe('');
  });
});
