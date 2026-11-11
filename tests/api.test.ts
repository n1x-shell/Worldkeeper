import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { updateEntity, listRevisions } from '../server/src/repo/entities.js';

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function seededApp() {
  const ctx = tempContext();
  const app = createApp(ctx);
  const prev = await request(app).post('/api/import/preview').attach('archive', zipOf(fixtureFiles()), 'fixture.zip');
  expect(prev.status).toBe(200);
  expect(prev.body.summary.entityCount).toBe(11);
  const commit = await request(app).post('/api/import/commit').send({ token: prev.body.token });
  expect(commit.status).toBe(200);
  return { ctx, app };
}

describe('HTTP API', () => {
  it('imports through preview + explicit commit; preview alone writes nothing', async () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    const prev = await request(app).post('/api/import/preview').attach('archive', zipOf(fixtureFiles()), 'fixture.zip');
    expect(prev.body.entities.length).toBe(11);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n).toBe(0);
    expect((await request(app).post('/api/import/commit').send({ token: 'bogus' })).status).toBe(400);
  });

  it('atlas: map image upload, markers default to DM-only, player sees only visible markers', async () => {
    const { app } = await seededApp();
    const map = (await request(app).post('/api/maps').send({ name: 'World' })).body;
    expect((await request(app).post(`/api/maps/${map.id}/image`).attach('image', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    const up = await request(app).post(`/api/maps/${map.id}/image`).attach('image', PNG, { filename: 'map.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.width).toBe(1);
    expect((await request(app).get(`/api/uploads/${up.body.image_file}`)).status).toBe(200);
    const hidden = (await request(app).post('/api/markers').send({ map_id: map.id, entity_id: 'SET-001', x: 10, y: 20 })).body;
    expect(hidden.hidden).toBe(true);
    await request(app).post('/api/markers').send({ map_id: map.id, entity_id: 'LOC-002', label: 'Tower', x: 5, y: 5, hidden: false });
    const unplaced = (await request(app).get('/api/maps/unplaced')).body as { id: string }[];
    expect(unplaced.map((u) => u.id)).not.toContain('SET-001');
    // Map not yet published to players
    expect((await request(app).get('/api/player/maps')).body).toEqual([]);
    expect((await request(app).get(`/api/player/uploads/${up.body.image_file}`)).status).toBe(404);
    await request(app).patch(`/api/maps/${map.id}`).send({ player_visible: true });
    const pm = (await request(app).get('/api/player/maps')).body;
    expect(pm[0].markers.length).toBe(1);
    expect(pm[0].markers[0].label).toBe('Tower');
    expect(pm[0].markers[0].entity_id).toBeNull(); // LOC-002 is not revealed
    expect((await request(app).get(`/api/player/uploads/${up.body.image_file}`)).status).toBe(200);
  });

  it('search, graph, dashboard and broken-reference endpoints respond', async () => {
    const { app } = await seededApp();
    expect((await request(app).get('/api/search?q=Keeper')).body[0].ref).toBe('NPC-001');
    expect((await request(app).get('/api/graph?focus=SET-001')).body.nodes.length).toBeGreaterThan(1);
    expect((await request(app).get('/api/dashboard')).body.counts.entities).toBe(10);
    expect((await request(app).get('/api/broken')).body.references).toContainEqual(expect.objectContaining({ from: 'FAC-001', ref: 'NPC-777' }));
    expect((await request(app).patch('/api/entities/LOC-002').send({ canon_status: 'NOT-A-STATUS' })).status).toBe(400);
  });

  it('coalesces autosave bursts into one revision', async () => {
    const { ctx } = await seededApp();
    for (const n of ['a', 'ab', 'abc']) updateEntity(ctx.db, 'LOC-002', { notes: n });
    const edits = (listRevisions(ctx.db, 'LOC-002') as { change_type: string }[]).filter((r) => r.change_type === 'edit');
    expect(edits.length).toBe(1);
    updateEntity(ctx.db, 'LOC-002', { notes: 'x', reason: 'different reason' });
    expect((listRevisions(ctx.db, 'LOC-002') as { change_type: string }[]).filter((r) => r.change_type === 'edit').length).toBe(2);
  });
});
