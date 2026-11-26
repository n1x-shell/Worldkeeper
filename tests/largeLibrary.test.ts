/**
 * A large library (v0.9.20, docs/BETA_PLAN.md A4): ten thousand records, linked to each other, about ten times the
 * bundled world. Nothing had ever been tried at that size. Each thing a GM does all the time has a limit here that is
 * several times what it takes on an ordinary computer: generous enough for a slow build machine, tight enough that
 * something which grows with the square of the library (a lookup inside a loop over every record) fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';

const RECORDS = 10_000;
const TYPES = ['npc', 'settlement', 'landmark', 'faction', 'item', 'event'] as const;
const WORDS = ['ash', 'river', 'crown', 'hollow', 'iron', 'ember', 'salt', 'thorn', 'glass', 'winter', 'marsh', 'candle', 'raven', 'tide', 'stone', 'oath'];
const word = (n: number) => WORDS[n % WORDS.length];
const nameOf = (i: number) => `${word(i)[0].toUpperCase()}${word(i).slice(1)} ${word(i * 7 + 3)} ${i}`;

let ctx: AppContext;
let gm: ReturnType<typeof createApp>;
let table: ReturnType<typeof createApp>;
const ids: string[] = [];
let built = 0;
const took: Record<string, number> = {};

/** Do it, note how long it took, and hold it to its limit. */
async function timed<T>(what: string, limitMs: number, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const out = await fn();
  took[what] = Math.round(performance.now() - t);
  expect(took[what], `${what} took ${took[what]} ms (limit ${limitMs})`).toBeLessThan(limitMs);
  return out;
}

beforeAll(async () => {
  ctx = tempContext();
  const t = performance.now();
  // As a GM would have written them: each with a few paragraphs, tags, and links to records made before it.
  ctx.db.transaction(() => {
    for (let i = 0; i < RECORDS; i++) {
      const links = i > 3 ? [ids[i - 1], ids[Math.floor(i / 2)], ids[(i * 31) % i]] : [];
      const e = createEntity(ctx.db, {
        type: TYPES[i % TYPES.length],
        realm: 'world',
        name: nameOf(i),
        summary: `The ${word(i + 5)} of the ${word(i * 3)} ${word(i + 9)}.`,
        body: `## A first look\n\nBy the ${word(i)} ${word(i + 1)}, where the ${word(i * 5)} meets the ${word(i + 2)}. ${links.map((id, n) => `See ${nameOf(n === 0 ? i - 1 : n === 1 ? Math.floor(i / 2) : (i * 31) % i)} [${id}].`).join(' ')}\n\n## Under the surface\n\nOnly the ${word(i * 11)} know of the ${word(i + 4)} ${word(i * 13)}.`,
        tags: [`place/${word(i)}`, `theme/${word(i * 3 + 1)}`],
        parent_id: i > 10 ? ids[Math.floor(i / 10)] : null,
      } as never);
      ids.push(e.id);
    }
    // A third of the world is known to the players.
    ctx.db.prepare(`UPDATE entities SET revealed = 1, revealed_sections = '["A first look"]' WHERE rowid % 3 = 0`).run();
  })();
  built = Math.round(performance.now() - t);
  gm = createApp(ctx);
  table = createApp(new AppContext(ctx.paths, 'player'));
  // Ten thousand saves in one unbroken run leave Node a backlog of clean-up that a server, which answers between
  // saves, never builds up. Let it clear, so the first thing timed isn't charged for it.
  await new Promise((r) => setTimeout(r, 50));
}, 300_000);

describe(`a library of ${RECORDS.toLocaleString('en')} records`, () => {
  it('is made in reasonable time, with its links found', () => {
    expect(ids).toHaveLength(RECORDS);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n).toBe(RECORDS);
    // The links written in the text became relationships: about three for each record.
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n).toBeGreaterThan(RECORDS * 2);
    took['making the library'] = built;
    // (Before v0.9.20 this took more than ten minutes: each save read every other record's name.)
    expect(built, `making ${RECORDS} records took ${built} ms`).toBeLessThan(120_000);
  });

  it('opens: what the app loads at the start', async () => {
    const all = await timed('the list of every record', 4000, () => request(gm).get('/api/entities').expect(200));
    expect(all.body).toHaveLength(RECORDS);
    await timed('the dashboard', 3000, () => request(gm).get('/api/dashboard').expect(200));
    await timed('the app’s start (meta, realms, types, tags)', 3000, async () => {
      for (const url of ['/api/meta', '/api/realms', '/api/record-types', '/api/tags']) await request(gm).get(url).expect(200);
    });
  });

  it('finds things', async () => {
    const found = await timed('a search', 2000, () => request(gm).get('/api/search?q=ember+crown').expect(200));
    expect(JSON.stringify(found.body)).toContain('mber');
    const one = await timed('a search for one name', 2000, () => request(gm).get(`/api/search?q=${encodeURIComponent(nameOf(7777))}`).expect(200));
    expect(JSON.stringify(one.body)).toContain(ids[7777]);
    await timed('one kind of record', 2000, () => request(gm).get('/api/entities?type=npc').expect(200));
    await timed('find in every record’s text', 4000, () => request(gm).post('/api/find').send({ find: 'marsh' }).expect(200));
    await timed('names like a new one', 2000, () => request(gm).get(`/api/entities/similar?name=${encodeURIComponent('Ember crown')}`).expect(200));
  });

  it('opens and saves a record, even one half the world points at', async () => {
    // An early record: thousands of later ones link to it or sit inside it.
    const busy = ids[5];
    const page = await timed('a record’s page', 2000, () => request(gm).get(`/api/entities/${busy}`).expect(200));
    expect(JSON.stringify(page.body)).toContain(nameOf(5));
    await timed('a record’s peek card', 1000, () => request(gm).get(`/api/entities/${ids[9000]}/peek`).expect(200));
    const e = (await request(gm).get(`/api/entities/${ids[9000]}`)).body.entity ?? (await request(gm).get(`/api/entities/${ids[9000]}`)).body;
    await timed('saving an edit', 2000, () =>
      request(gm)
        .patch(`/api/entities/${ids[9000]}`)
        .send({ expected_version: e.version, body: `${e.body}\n\nAnd a line more, about ${nameOf(42)} [${ids[42]}].` })
        .expect(200),
    );
    await timed('a new record', 2000, () => request(gm).post('/api/entities').send({ type: 'npc', realm: 'world', name: 'A late arrival', body: `Knows ${nameOf(1)} [${ids[1]}].` }).expect(200));
  });

  it('looks across the whole world', async () => {
    // Around a record half the world points at, two steps out.
    await timed('the relationship graph', 8000, () => request(gm).get(`/api/graph?focus=${ids[5]}&depth=2`).expect(200));
    await timed('broken references', 5000, () => request(gm).get('/api/broken').expect(200));
    await timed('the consistency check', 15_000, () => request(gm).get('/api/library/consistency').expect(200));
    await timed('the timeline', 4000, () => request(gm).get('/api/timeline').expect(200));
  });

  it('keeps it safe: a backup and an export', async () => {
    const b = await timed('a backup', 15_000, () => request(gm).post('/api/backups').send({ reason: 'large' }).expect(200));
    expect(fs.statSync(path.join(ctx.paths.backupsDir, b.body.file)).size).toBeGreaterThan(100_000);
    const x = await timed('an export of everything as JSON', 15_000, () => request(gm).get('/api/export/json').expect(200));
    expect(Number(x.headers['content-length'] ?? x.text.length)).toBeGreaterThan(1_000_000);
  });

  it('serves the players: a third of it revealed', async () => {
    const info = await timed('the handbook’s start', 3000, () => request(table).get('/api/player/info').expect(200));
    expect(info.body).toBeTruthy();
    const list = await timed('the players’ list of records', 5000, () => request(table).get('/api/player/entities').expect(200));
    const n = (Array.isArray(list.body) ? list.body : (list.body.entities ?? [])).length;
    expect(n).toBeGreaterThan(RECORDS / 4);
    expect(n).toBeLessThan(RECORDS / 2);
    // The unrevealed section of a revealed record is not in what players get.
    const revealed = ctx.db.prepare('SELECT id FROM entities WHERE revealed = 1 ORDER BY rowid DESC LIMIT 1').get() as { id: string };
    const one = await timed('a record in the handbook', 2000, () => request(table).get(`/api/player/entities/${revealed.id}`).expect(200));
    expect(JSON.stringify(one.body)).toContain('A first look');
    expect(JSON.stringify(one.body)).not.toContain('Under the surface');
  });

  it('says how long each thing took', () => {
    console.log(
      `A library of ${RECORDS} records:\n` +
        Object.entries(took)
          .map(([k, ms]) => `  ${String(ms).padStart(6)} ms  ${k}`)
          .join('\n'),
    );
    expect(Object.keys(took).length).toBeGreaterThan(15);
  });
});
