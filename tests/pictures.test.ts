/** Pictures on records (v0.9.3, docs/BETA_PLAN.md B1). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { readWorldbook } from '../server/src/packs/share.js';
import { buildPlayerSite } from '../server/src/publish/site.js';
import { peekEntity } from '../server/src/repo/peek.js';
import { migrate } from '../server/src/db/migrations.js';

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
/** Enough of a PNG for the app to know it's one. */
function png(tag = 0) {
  const b = Buffer.alloc(34);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(4, 16);
  b.writeUInt32BE(4, 20);
  b[33] = tag;
  return b;
}

async function world() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const table = createApp(new AppContext(ctx.paths, 'player'));
  const keep = (await request(gm).post('/api/entities').send({ name: 'Brennhold', type: 'settlement', realm: 'world', body: '## A first look\n\nA keep on a cliff.' })).body as { id: string };
  const up = async (tag: number) => (await request(gm).post(`/api/entities/${keep.id}/images`).attach('image', png(tag), { filename: 'p.png', contentType: 'image/png' })).body as { id: number; file: string };
  return { ctx, gm, table, keep, up };
}

describe('pictures on records', () => {
  it('are added, captioned, reordered and removed; the first is the record’s picture', async () => {
    const { ctx, gm, keep, up } = await world();
    const a = await up(1);
    const b = await up(2);
    expect(a.file).toMatch(/^record-[\w-]+-[a-f0-9]{12}\.png$/);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, a.file))).toBe(true);
    expect(peekEntity(ctx.db, keep.id).image).toBe(a.file);
    // A caption, and the second becomes the record's picture.
    let list = (await request(gm).patch(`/api/entity-images/${b.id}`).send({ caption: 'From the sea', main: true })).body as { id: number; caption: string }[];
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(list[0].caption).toBe('From the sea');
    expect(peekEntity(ctx.db, keep.id).image).toBe(b.file);
    // Removing one deletes its file.
    list = (await request(gm).delete(`/api/entity-images/${a.id}`)).body;
    expect(list.map((p) => p.id)).toEqual([b.id]);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, a.file))).toBe(false);
    // Not a picture, an unknown record: refused, nothing written.
    expect((await request(gm).post(`/api/entities/${keep.id}/images`).attach('image', Buffer.from('hello'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    const before = fs.readdirSync(ctx.paths.uploadsDir).length;
    expect((await request(gm).post('/api/entities/NOPE-0001/images').attach('image', png(), { filename: 'p.png', contentType: 'image/png' })).status).toBe(404);
    expect(fs.readdirSync(ctx.paths.uploadsDir).length).toBe(before);
    // A record archived for good takes its pictures' rows with it.
    ctx.db.prepare('DELETE FROM entities WHERE id = ?').run(keep.id);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM entity_images').get()).toEqual({ n: 0 });
  });

  it('reach players only when marked for them, on a record they can read', async () => {
    const { ctx, gm, table, keep, up } = await world();
    const secret = await up(1);
    const shown = await up(2);
    await request(gm).patch(`/api/entity-images/${shown.id}`).send({ player_visible: true, caption: 'The gate' });
    // The record isn't revealed: players get neither the record nor, usefully, its pictures' names.
    expect((await request(table).get(`/api/player/entities/${keep.id}`)).status).toBe(404);
    await request(gm).patch(`/api/entities/${keep.id}`).send({ revealed: true, reason: 'test' });
    const e = (await request(table).get(`/api/player/entities/${keep.id}`)).body;
    expect(e.images).toEqual([{ file: shown.file, caption: 'The gate' }]);
    expect(JSON.stringify(e)).not.toContain(secret.file);
    expect((await request(table).get(`/api/player/uploads/${shown.file}`)).status).toBe(200);
    expect((await request(table).get(`/api/player/uploads/${secret.file}`)).status).toBe(404);
    // The published handbook carries the shown picture, not the other.
    const site = buildPlayerSite(ctx.db, ctx.paths, null);
    const paths = site.files.map((f) => f.path);
    expect(paths).toContain(`uploads/${shown.file}`);
    expect(paths).not.toContain(`uploads/${secret.file}`);
  });

  it('travel in a shared worldbook, once; with players in mind, only the ones players see', async () => {
    const { gm, keep, up } = await world();
    const gmOnly = await up(1);
    const shown = await up(2);
    await request(gm).patch(`/api/entity-images/${shown.id}`).send({ player_visible: true, caption: 'The gate' });
    const forPlayers = readWorldbook((await request(gm).get('/api/worldbooks/share').query({ name: 'Ostmark', gmOnly: 'leave-out' }).buffer(true).parse(binary)).body as Buffer);
    expect(forPlayers.files.filter((f) => f.path.startsWith('pictures/')).map((f) => f.path)).toEqual([`pictures/${shown.file}`]);
    const file = (await request(gm).get('/api/worldbooks/share').query({ name: 'Ostmark' }).buffer(true).parse(binary)).body as Buffer;
    expect(readWorldbook(file).manifest.shared?.counts.pictures).toBe(2);

    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Ostmark.worldbook');
    const started = (await request(gmB).post('/api/libraries/from-worldbook/ostmark').send({})).body;
    expect(started.result.pictures).toBe(2);
    const list = (await request(gmB).get(`/api/entities/${keep.id}/images`)).body as { file: string; caption: string; player_visible: boolean }[];
    expect(list.map((p) => [p.caption, p.player_visible])).toEqual([
      ['', false],
      ['The gate', true],
    ]);
    // New file names here, and the files are there.
    expect(list.map((p) => p.file)).not.toContain(gmOnly.file);
    for (const p of list) expect(fs.existsSync(path.join(b.paths.uploadsDir, p.file))).toBe(true);
    // An update doesn't add them twice.
    expect((await request(gmB).post('/api/setting-packs/ostmark/update')).body.pictures).toBe(0);
    expect((await request(gmB).get(`/api/entities/${keep.id}/images`)).body).toHaveLength(2);
    // One the GM removed stays removed: its file goes, and an update doesn't bring it back.
    const gone = list[0] as { id?: number; file: string };
    const left = (await request(gmB).delete(`/api/entity-images/${gone.id}`)).body as { file: string }[];
    expect(left.map((p) => p.file)).toEqual([list[1].file]);
    expect(fs.existsSync(path.join(b.paths.uploadsDir, gone.file))).toBe(false);
    expect((await request(gmB).post('/api/setting-packs/ostmark/update')).body.pictures).toBe(0);
    expect((await request(gmB).get(`/api/entities/${keep.id}/images`)).body).toHaveLength(1);
    expect((await request(gmB).delete(`/api/entity-images/${gone.id}`)).status).toBe(404);
  });

  it('a profile’s portrait from before becomes the record’s picture on upgrade', async () => {
    const { ctx, keep } = await world();
    // As a library was before migration 34: no pictures table, a portrait in the NPC's profile.
    ctx.db.exec('DROP TABLE entity_images; DELETE FROM schema_migrations WHERE version = 34;');
    ctx.db.prepare(`INSERT INTO profiles (entity_id, campaign_id, data) VALUES (?, 0, ?)`).run(keep.id, JSON.stringify({ portrait: 'portrait-old-abc.png', role: 'A keep' }));
    expect(migrate(ctx.db)).toBe(1);
    expect(ctx.db.prepare('SELECT entity_id, file, player_visible FROM entity_images').all()).toEqual([{ entity_id: keep.id, file: 'portrait-old-abc.png', player_visible: 0 }]);
  });
});
