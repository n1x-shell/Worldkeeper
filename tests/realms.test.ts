/** Realms as data (docs/OWN_WORLD_PLAN.md §2.1, step 1): the library's worlds, continents and planes. */
import Database from 'better-sqlite3';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { MIGRATIONS, migrate } from '../server/src/db/migrations.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createApp } from '../server/src/app.js';
import { createEntity } from '../server/src/repo/entities.js';
import { listRealms } from '../server/src/repo/realms.js';
import { exportJson, importJson } from '../server/src/backup/exporter.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { realmKey, sortRealms } from '../shared/realms.js';

const rec = (id: string, name: string, type: string, realm: string, body = '## Overview\nText.') =>
  ({ id, name, type, realm, canon_status: 'CANON', aliases: [], tags: [], fields: [], body, notes: '' }) as never;

function importFiles(files = fixtureFiles()) {
  const ctx = tempContext();
  const zip = readZip(zipOf(files));
  commitPlan(ctx.db, zip, buildPlan(ctx.db, zip, 'fixture.zip'));
  return ctx;
}

describe('realms', () => {
  it('start with just The World in an empty library', () => {
    const { db } = tempContext();
    expect(listRealms(db).map((r) => [r.id, r.name, r.kind])).toEqual([['world', 'The World', 'world']]);
  });

  it('become rows for the setting where an older library already uses them, with the same ids', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // A library as it was before migration 19.
    db.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    for (const m of MIGRATIONS.filter((x) => x.version < 19)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    }
    db.prepare(`INSERT INTO entities (id, name, type, realm) VALUES ('CON-001', 'Aetheris', 'continent', 'aetheris'), ('ETH-001', 'A Domain', 'ethereal_domain', 'ethereal')`).run();
    db.prepare(`INSERT INTO maps (name) VALUES ('The Ethereal Realm'), ('The World Map')`).run();
    db.prepare(`INSERT INTO timeline_rows (sort_order, time_label, event, realm_label) VALUES (1, 'Year 1', 'A', 'Aetheris'), (2, 'Year 2', 'B', 'Both'), (3, 'Year 3', 'C', 'World')`).run();
    migrate(db);
    expect(sortRealms(listRealms(db)).map((r) => r.id)).toEqual(['world', 'aetheris', 'ethereal']); // no Kaelmar records, so no Kaelmar
    expect(listRealms(db).find((r) => r.id === 'aetheris')).toMatchObject({ name: 'Aetheris', kind: 'continent', parent_id: 'world', color: 'amber' });
    expect((db.prepare('SELECT name, realm_id FROM maps ORDER BY id').all() as { realm_id: string }[]).map((m) => m.realm_id)).toEqual(['ethereal', 'world']);
    const rows = db.prepare('SELECT realm_ids FROM timeline_rows ORDER BY sort_order').all() as { realm_ids: string }[];
    expect(rows.map((r) => JSON.parse(r.realm_ids))).toEqual([['aetheris'], ['aetheris'], ['world']]);
  });

  it('are created by an import that names one the library lacks', () => {
    const files = fixtureFiles();
    files.push({
      path: 'Lib/02_Isles/SET-777_Port.md',
      content: `ID: SET-777\nName: Brine Port\nAlternate names: None\nCategory: Settlement\nParent: None\nContinent or realm: The Sunken Isles\nCanon status: CANON\nSource: Test\nTags: none\n\n# Brine Port\n\n## Overview\nA port.\n`,
    });
    const { db } = importFiles(files);
    const isles = listRealms(db).find((r) => r.id === realmKey('The Sunken Isles'));
    expect(isles).toMatchObject({ id: 'sunken-isles', kind: 'continent', parent_id: 'world' });
    expect((db.prepare(`SELECT realm FROM entities WHERE id = 'SET-777'`).get() as { realm: string }).realm).toBe('sunken-isles');
    // The setting's own realm keeps its id and look.
    expect(listRealms(db).find((r) => r.id === 'aetheris')).toMatchObject({ name: 'Aetheris', color: 'amber' });
  });

  it('can be added, renamed, nested, ordered, archived and (when empty) deleted, and records must name one', async () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    const made = await request(app).post('/api/realms').send({ name: 'The Sunken Isles', kind: 'continent', parent_id: 'world', color: 'teal', icon: 'waves' });
    expect(made.status).toBe(200);
    expect(made.body.id).toBe('sunken-isles');
    const reef = (await request(app).post('/api/realms').send({ name: 'The Reef', kind: 'region_group', parent_id: 'sunken-isles' })).body;
    // No cycles.
    expect((await request(app).patch('/api/realms/sunken-isles').send({ parent_id: reef.id })).status).toBe(400);
    expect((await request(app).patch('/api/realms/sunken-isles').send({ name: 'The Drowned Isles' })).body.name).toBe('The Drowned Isles');
    // Order among siblings: a second continent moved ahead of the first.
    await request(app).post('/api/realms').send({ name: 'Ostmark', parent_id: 'world' });
    await request(app)
      .post('/api/realms/order')
      .send({ ids: ['world', 'ostmark', 'sunken-isles', reef.id] });
    expect(sortRealms(listRealms(ctx.db)).map((r) => r.id)).toEqual(['world', 'ostmark', 'sunken-isles', reef.id]);

    expect(() => createEntity(ctx.db, rec('SET-001', 'Nowhere', 'settlement', 'atlantis'))).toThrow(/no realm/i);
    createEntity(ctx.db, rec('SET-002', 'Brine Port', 'settlement', 'sunken-isles'));
    const counted = (await request(app).get('/api/realms')).body as { id: string; records: number }[];
    expect(counted.find((r) => r.id === 'sunken-isles')?.records).toBe(1);

    // In use, or The World: archive, don't delete.
    expect((await request(app).delete('/api/realms/sunken-isles')).status).toBe(400);
    expect((await request(app).delete('/api/realms/world')).status).toBe(400);
    await request(app).patch('/api/realms/sunken-isles').send({ archived: true });
    expect((await request(app).get('/api/realms')).body.map((r: { id: string }) => r.id)).not.toContain('sunken-isles');
    expect((await request(app).get('/api/realms?archived=1')).body.map((r: { id: string }) => r.id)).toContain('sunken-isles');
    expect((await request(app).delete(`/api/realms/${reef.id}`)).status).toBe(200);
  });

  it('reach the handbook by name, and a people of a world is found on its continents', () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    return (async () => {
      await request(app).post('/api/realms').send({ name: 'Ostmark', kind: 'continent', parent_id: 'world', color: 'red', icon: 'castle' });
      createEntity(ctx.db, rec('PPL-001', 'Fenfolk', 'people', 'world'));
      createEntity(ctx.db, rec('SET-001', 'Grimhold', 'settlement', 'ostmark'));
      ctx.db.prepare(`UPDATE entities SET revealed = 1`).run();
      const info = (await request(app).get('/api/player/info')).body as { realms: { id: string; name: string }[] };
      expect(info.realms.map((r) => r.name)).toEqual(['The World', 'Ostmark']);
      const snap = playerSnapshot(ctx.db);
      expect(snap.entities.find((e) => e.id === 'SET-001')).toMatchObject({ realm: 'ostmark', realmLabel: 'Ostmark' });
      expect(snap.entities.find((e) => e.id === 'PPL-001')?.realms).toContain('ostmark');
    })();
  });

  it('travel with a JSON export, and an export from before them gets its realms back', () => {
    const src = importFiles();
    const data = exportJson(src.db);
    expect((data.tables.realms as { id: string }[]).map((r) => r.id)).toContain('aetheris');
    const dst = tempContext();
    importJson(dst.db, data);
    expect(listRealms(dst.db).find((r) => r.id === 'aetheris')).toMatchObject({ color: 'amber' });

    const old = { ...data, tables: { ...data.tables, realms: [] } };
    const dst2 = tempContext();
    importJson(dst2.db, old);
    expect(listRealms(dst2.db).map((r) => r.id)).toEqual(expect.arrayContaining(['world', 'aetheris']));
  });
});
