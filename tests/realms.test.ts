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
import { normalizeRealm, SETTING_REALMS } from '../server/src/import/normalize.js';
import { loreFiles } from '../server/src/additions.js';

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
    db.prepare(
      `INSERT INTO entities (id, name, type, realm) VALUES ('CON-001', 'Aetheris', 'continent', 'aetheris'), ('ETH-001', 'A Domain', 'ethereal_domain', 'ethereal'), ('NPC-371', 'Keeper Lantern', 'npc', 'ethereal'), ('CRE-530', 'The Horizon Leviathan', 'creature', 'ethereal'), ('COS-030', 'The Elder Gods', 'cosmology', 'ethereal')`,
    ).run();
    db.prepare(`INSERT INTO maps (name) VALUES ('The Ethereal Realm'), ('The World Map')`).run();
    db.prepare(`INSERT INTO timeline_rows (sort_order, time_label, event, realm_label) VALUES (1, 'Year 1', 'A', 'Aetheris'), (2, 'Year 2', 'B', 'Both'), (3, 'Year 3', 'C', 'World')`).run();
    migrate(db);
    // No Kaelmar records, so no Kaelmar. The World sits in the realm of Evershroud; the Ethereal Realm is a realm beside it.
    expect(sortRealms(listRealms(db)).map((r) => r.id)).toEqual([
      'evershroud',
      'world',
      'aetheris',
      'ethereal',
      'hollow-verge',
      'fields-of-lost-realities',
      'ossuary-of-kings',
      'silent-archive',
      'loom-of-eternity',
      'citadel-of-the-hidden',
      'black-horizon',
    ]);
    // The Hollow Verge is a domain of the Ethereal Realm; the six deeper domains sit beneath it.
    expect(listRealms(db).find((r) => r.id === 'hollow-verge')).toMatchObject({ kind: 'domain', parent_id: 'ethereal' });
    expect(
      listRealms(db)
        .filter((r) => r.parent_id === 'hollow-verge')
        .map((r) => r.kind),
    ).toEqual(Array(6).fill('domain'));
    // Records that sit in a domain move into it (and stay in the Ethereal Realm); realm-wide ones stay where they are.
    const where = (id: string) => db.prepare('SELECT realm, realms FROM entities WHERE id = ?').get(id) as { realm: string; realms: string };
    expect(where('NPC-371')).toEqual({ realm: 'hollow-verge', realms: '["hollow-verge","ethereal"]' });
    expect(where('CRE-530').realm).toBe('black-horizon');
    expect(where('COS-030').realm).toBe('ethereal');
    expect(listRealms(db).find((r) => r.id === 'world')).toMatchObject({ kind: 'world', parent_id: 'evershroud' });
    expect(listRealms(db).find((r) => r.id === 'ethereal')).toMatchObject({ kind: 'realm', parent_id: null });
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
    // An edit changes only what it names.
    expect(listRealms(ctx.db, { includeArchived: true }).find((r) => r.id === 'sunken-isles')).toMatchObject({ archived: true, color: 'teal', icon: 'waves', kind: 'continent' });
    expect((await request(app).get('/api/realms')).body.map((r: { id: string }) => r.id)).not.toContain('sunken-isles');
    expect((await request(app).get('/api/realms?archived=1')).body.map((r: { id: string }) => r.id)).toContain('sunken-isles');
    expect((await request(app).delete(`/api/realms/${reef.id}`)).status).toBe(200);
  });

  it('nest as realm, world, continent, region group, and a realm can hold several worlds', async () => {
    const app = createApp(tempContext());
    const post = (b: object) => request(app).post('/api/realms').send(b);
    expect((await post({ name: 'The Astral Sea', kind: 'realm' })).status).toBe(200);
    expect((await post({ name: 'Second Sun', kind: 'world', parent_id: 'astral-sea' })).status).toBe(200);
    expect((await request(app).patch('/api/realms/world').send({ parent_id: 'astral-sea' })).status).toBe(200);
    const worlds = ((await request(app).get('/api/realms')).body as { id: string; kind: string; parent_id: string }[]).filter((r) => r.parent_id === 'astral-sea');
    expect(worlds.map((r) => r.kind)).toEqual(['world', 'world']);
    // A realm still holding worlds can't be deleted.
    expect((await request(app).delete('/api/realms/astral-sea')).status).toBe(400);
    // A continent needs a world; a realm is always top level; a world can't go inside a continent.
    expect((await post({ name: 'Floating', kind: 'continent' })).status).toBe(400);
    expect((await post({ name: 'Floating', kind: 'continent', parent_id: 'astral-sea' })).status).toBe(400);
    expect((await post({ name: 'Inner', kind: 'realm', parent_id: 'astral-sea' })).status).toBe(400);
    expect((await post({ name: 'Ostmark', kind: 'continent', parent_id: 'world' })).status).toBe(200);
    expect((await post({ name: 'Pocket', kind: 'world', parent_id: 'ostmark' })).status).toBe(400);
    expect((await post({ name: 'The Marches', kind: 'region_group', parent_id: 'ostmark' })).status).toBe(200);
    // A domain sits in a realm or another domain, never in a world.
    expect((await post({ name: 'The Drowned Court', kind: 'domain', parent_id: 'astral-sea' })).status).toBe(200);
    expect((await post({ name: 'The Deep Court', kind: 'domain', parent_id: 'drowned-court' })).status).toBe(200);
    expect((await post({ name: 'Misplaced', kind: 'domain', parent_id: 'world' })).status).toBe(400);
    // Making Ostmark a world of its own would strand The Marches (a region group) inside a world.
    const res = await request(app).patch('/api/realms/ostmark').send({ kind: 'world', parent_id: 'astral-sea' });
    expect(res.status).toBe(400);
    expect(res.body.error ?? res.text).toMatch(/The Marches/);
  });

  it("put the Ethereal Realm's records in their domains: named first in the realm field, or by their domain's record", () => {
    expect(normalizeRealm('The Hollow Verge (Ethereal Realm)')).toEqual({ realm: 'hollow-verge', realms: ['hollow-verge', 'ethereal'] });
    expect(normalizeRealm('Ethereal Realm, beyond the Black Horizon').realm).toBe('ethereal'); // beyond it is not in it
    const head = (id: string, name: string, category: string, parent: string) =>
      `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: ${parent}\nContinent or realm: Ethereal Realm\nCanon status: CANON\nSource: Test\nTags: realm/ethereal\n\n# ${name}\n\n## Overview\nText.\n`;
    const { db } = importFiles([
      ...fixtureFiles(),
      { path: 'Lib/03_Ethereal/ETH-503_Ossuary.md', content: head('ETH-503', 'The Ossuary of Kings', 'Ethereal domain', 'The Ethereal Realm [CON-501]') },
      { path: 'Lib/03_Ethereal/LOC-503_Throne.md', content: head('LOC-503', 'The Fractured Throne', 'Landmark', 'The Ossuary of Kings [ETH-503]') },
      { path: 'Lib/03_Ethereal/FAC-501_Breakers.md', content: head('FAC-501', 'Cycle Breakers', 'Faction', 'The Ethereal Realm [CON-501]') },
    ]);
    const realmOf = (id: string) => (db.prepare('SELECT realm FROM entities WHERE id = ?').get(id) as { realm: string }).realm;
    expect([realmOf('ETH-503'), realmOf('LOC-503'), realmOf('FAC-501')]).toEqual(['ossuary-of-kings', 'ossuary-of-kings', 'ethereal']);
    expect(listRealms(db).find((r) => r.id === 'ossuary-of-kings')).toMatchObject({ parent_id: 'hollow-verge' });
  });

  it("are named correctly in the setting's own records: a domain first, then the Ethereal Realm", () => {
    const domains = Object.values(SETTING_REALMS)
      .filter((r) => r.kind === 'domain')
      .map((r) => r.name);
    const fields = loreFiles().flatMap((f) => [...f.content.matchAll(/^Continent or realm: (.+)$/gm)].map((m) => m[1]));
    const inDomain = fields.filter((v) => v.endsWith('(Ethereal Realm)'));
    expect(inDomain.length).toBeGreaterThan(60);
    for (const v of inDomain)
      expect(
        domains.some((d) => v.startsWith(d)),
        v,
      ).toBe(true);
  });

  it('reach the handbook by name, and a people of a world is found on its continents', () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    return (async () => {
      await request(app).post('/api/realms').send({ name: 'Ostmark', kind: 'continent', parent_id: 'world', color: 'red', icon: 'castle' });
      createEntity(ctx.db, rec('PPL-001', 'Fenfolk', 'people', 'world'));
      createEntity(ctx.db, rec('SET-001', 'Grimhold', 'settlement', 'ostmark'));
      ctx.db.prepare(`UPDATE entities SET revealed = 1`).run();
      // A realm with nothing revealed in it stays unnamed to players: not listed, and no people is found there.
      await request(app).post('/api/realms').send({ name: 'The Hidden Isle', kind: 'continent', parent_id: 'world' });
      createEntity(ctx.db, rec('SET-002', 'Secret Port', 'settlement', 'hidden-isle'));
      const info = (await request(app).get('/api/player/info')).body as { realms: { id: string; name: string }[] };
      expect(info.realms.map((r) => r.name)).toEqual(['The World', 'Ostmark']);
      const snap = playerSnapshot(ctx.db);
      expect(snap.entities.find((e) => e.id === 'SET-001')).toMatchObject({ realm: 'ostmark', realmLabel: 'Ostmark' });
      expect(snap.entities.find((e) => e.id === 'PPL-001')?.realms).toContain('ostmark');
      expect(snap.entities.find((e) => e.id === 'PPL-001')?.realms).not.toContain('hidden-isle');
      expect(JSON.stringify(snap)).not.toMatch(/Hidden Isle|hidden-isle/);
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
