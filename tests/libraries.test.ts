/** The library root (docs/LIBRARIES_PLAN.md step B1): libraries in one data folder, the upgrade, opening and switching. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import { createApp } from '../server/src/app.js';
import { openDatabase } from '../server/src/db/connection.js';
import { syncBuiltinTypes } from '../server/src/repo/recordTypes.js';
import { createEntity } from '../server/src/repo/entities.js';
import { readIndex, writeIndex } from '../server/src/libraries.js';
import { createBackup, listBackups } from '../server/src/backup/backup.js';
import { exportFullWorldZip } from '../server/src/backup/exporter.js';
import { tempContext } from './helpers.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wk-test-'));
const rec = (name: string) => ({ name, type: 'settlement', realm: 'world', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: `## A first look\n\n${name}.`, notes: '' }) as never;

/** A data folder as v0.5 left it: the database, pictures and backups in the folder itself. */
function oldInstallation(appName = 'The Ashen Coast') {
  const root = tmp();
  const db = openDatabase(path.join(root, 'worldkeeper.db'));
  syncBuiltinTypes(db);
  createEntity(db, rec('Harrowgate'));
  createEntity(db, rec('Ashford'));
  db.prepare(`INSERT INTO settings (key, value) VALUES ('app_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(appName);
  db.close();
  fs.mkdirSync(path.join(root, 'uploads'));
  fs.writeFileSync(path.join(root, 'uploads', 'map.png'), 'png');
  fs.mkdirSync(path.join(root, 'backups'));
  fs.writeFileSync(path.join(root, 'backups', 'worldkeeper-2026-01-01T00-00-00Z-manual.wkbackup.zip'), 'old');
  fs.mkdirSync(path.join(root, 'packs'));
  fs.writeFileSync(path.join(root, 'secrets.json'), '{}');
  return root;
}

describe('libraries in one data folder', () => {
  it('starts a new data folder with one empty library', () => {
    const root = tmp();
    const p = resolvePaths(root);
    const idx = readIndex(root)!;
    expect(idx.libraries).toHaveLength(1);
    expect(idx.libraries[0]).toMatchObject({ name: 'My library', folder: idx.open });
    expect(p.dbFile).toBe(path.join(root, 'libraries', idx.open, 'worldkeeper.db'));
    expect(fs.existsSync(path.join(root, 'worldkeeper.db'))).toBe(false);
  });

  it('moves an existing installation into its first library, after a backup, unchanged', async () => {
    const root = oldInstallation();
    const ctx = new AppContext(resolvePaths(root));
    const idx = readIndex(root)!;
    expect(idx.libraries).toHaveLength(1);
    expect(idx.libraries[0].name).toBe('The Ashen Coast');
    expect(idx.moving).toBeUndefined();
    const dir = path.join(root, 'libraries', idx.open);
    // Its files moved; what libraries share went to shared/.
    for (const f of ['worldkeeper.db', 'uploads', 'backups', 'staging']) expect(fs.existsSync(path.join(root, f))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'uploads', 'map.png'), 'utf8')).toBe('png');
    expect(fs.existsSync(path.join(root, 'shared', 'packs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'shared', 'secrets.json'))).toBe(true);
    // Its records and settings, as they were.
    const gm = createApp(ctx);
    expect(((await request(gm).get('/api/entities')).body as { name: string }[]).map((e) => e.name).sort()).toEqual(['Ashford', 'Harrowgate']);
    expect((await request(gm).get('/api/meta')).body).toMatchObject({ appName: 'The Ashen Coast', library: { name: 'The Ashen Coast', id: idx.open } });
    // The old backups came along, with a new one of the database as it was before the move.
    const backups = listBackups(ctx.paths).map((b) => b.file);
    expect(backups).toContain('worldkeeper-2026-01-01T00-00-00Z-manual.wkbackup.zip');
    const before = backups.find((f) => f.includes('before-libraries'));
    expect(before).toBeDefined();
    const zip = new AdmZip(path.join(ctx.paths.backupsDir, before!));
    expect(zip.getEntry('worldkeeper.db')).toBeTruthy();
    expect(zip.getEntry('uploads/map.png')).toBeTruthy();
    // A second start changes nothing.
    ctx.db.close();
    expect(resolvePaths(root).libraryId).toBe(idx.open);
    expect(readIndex(root)!.libraries).toHaveLength(1);
  });

  it('finishes a move that a start was interrupted in', () => {
    const root = oldInstallation();
    // As if the first start had written the list and moved only the pictures before stopping.
    const id = 'lib-halfway';
    writeIndex(root, { format: 1, open: id, moving: id, libraries: [{ id, name: 'Halfway', folder: id, created_at: '2026-11-24T00:00:00Z', last_opened_at: null }] });
    fs.mkdirSync(path.join(root, 'libraries', id), { recursive: true });
    fs.renameSync(path.join(root, 'uploads'), path.join(root, 'libraries', id, 'uploads'));
    const ctx = new AppContext(resolvePaths(root));
    expect(readIndex(root)!.moving).toBeUndefined();
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM entities').get() as { n: number }).n).toBe(2);
    expect(fs.existsSync(path.join(root, 'libraries', id, 'uploads', 'map.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'worldkeeper.db'))).toBe(false);
  });

  it('opens a second library and back: records, settings, pictures and backups are each its own', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const first = ctx.paths.libraryId;
    await request(gm).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', body: '' });
    await request(gm).put('/api/settings').send({ app_name: 'First World' });
    fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'first.png'), 'x');
    createBackup(ctx.db, ctx.paths, 'manual');

    let r = (await request(gm).post('/api/libraries').send({ name: 'The Second World', open: true })).body;
    expect(r.open).toBe(r.library.id);
    expect(r.libraries.map((l: { name: string }) => l.name)).toEqual(['My library', 'The Second World']);
    // A new library is empty and asks to be set up.
    expect((await request(gm).get('/api/entities')).body).toEqual([]);
    expect((await request(gm).get('/api/setup')).body.needed).toBe(true);
    expect((await request(gm).get('/api/meta')).body.appName).toBe('The Worldkeeper');
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, 'first.png'))).toBe(false);
    expect(listBackups(ctx.paths)).toEqual([]);
    await request(gm).post('/api/entities').send({ name: 'Coldwater', type: 'settlement', realm: 'world', body: '' });

    // The table server follows the GM to the library they have open.
    const table = new AppContext(resolvePaths(ctx.paths.rootDir), 'player');
    expect(table.paths.libraryId).toBe(r.library.id);

    r = (await request(gm).post(`/api/libraries/${first}/open`)).body;
    expect(r.open).toBe(first);
    expect(((await request(gm).get('/api/entities')).body as { name: string }[]).map((e) => e.name)).toEqual(['Harrowgate']);
    expect((await request(gm).get('/api/meta')).body.appName).toBe('First World');
    expect(listBackups(ctx.paths)).toHaveLength(1);
    expect(table.syncOpenLibrary()).toBe(true);
    expect(table.paths.libraryId).toBe(first);
    expect(table.syncOpenLibrary()).toBe(false);

    // Rename; an unknown library, a blank name and an archived library are refused.
    r = (await request(gm).patch(`/api/libraries/${first}`).send({ name: 'Harrow' })).body;
    expect(r.libraries[0].name).toBe('Harrow');
    expect((await request(gm).post('/api/libraries/lib-nope/open')).status).toBe(404);
    expect((await request(gm).patch(`/api/libraries/${first}`).send({ name: ' ' })).status).toBe(400);
    const idx = readIndex(ctx.paths.rootDir)!;
    idx.libraries[1].archived = true;
    writeIndex(ctx.paths.rootDir, idx);
    expect((await request(gm).post(`/api/libraries/${idx.libraries[1].id}/open`)).status).toBe(400);
    expect((await request(gm).get('/api/libraries')).body.libraries).toHaveLength(1);
  });

  it('keeps library routes off the table server', async () => {
    const ctx = tempContext();
    const table = createApp(new AppContext(ctx.paths, 'player'));
    expect((await request(table).get('/api/libraries')).status).toBe(404);
  });

  it('duplicates, archives and restores libraries, and opens one from a full-world ZIP', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const first = ctx.paths.libraryId;
    await request(gm).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', body: '' });
    fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map.png'), 'png');
    const names = async () => ((await request(gm).get('/api/entities')).body as { name: string }[]).map((e) => e.name);

    // Duplicate the open library: its records and pictures, as a new library (not opened).
    let r = (await request(gm).post(`/api/libraries/${first}/duplicate`).send({})).body;
    const copy = r.library.id;
    expect(r.open).toBe(first);
    expect(r.libraries.find((l: { id: string }) => l.id === copy)).toMatchObject({ name: 'My library (copy)', records: 1 });
    await request(gm).post('/api/entities').send({ name: 'Ashford', type: 'settlement', realm: 'world', body: '' });
    await request(gm).post(`/api/libraries/${copy}/open`);
    expect(await names()).toEqual(['Harrowgate']);
    expect(fs.readFileSync(path.join(ctx.paths.uploadsDir, 'map.png'), 'utf8')).toBe('png');
    // And a library that isn't open.
    r = (await request(gm).post(`/api/libraries/${first}/duplicate`).send({ name: 'Second copy' })).body;
    expect(r.libraries.find((l: { name: string }) => l.name === 'Second copy').records).toBe(2);

    // Archive: not the open one; hidden from the list, files kept; restore brings it back.
    expect((await request(gm).post(`/api/libraries/${copy}/archive`).send({ archived: true })).status).toBe(400);
    await request(gm).post(`/api/libraries/${first}/open`);
    r = (await request(gm).post(`/api/libraries/${copy}/archive`).send({ archived: true })).body;
    expect(r.libraries.find((l: { id: string }) => l.id === copy).archived).toBe(true);
    expect(((await request(gm).get('/api/libraries')).body.libraries as { id: string }[]).some((l) => l.id === copy)).toBe(false);
    expect(fs.existsSync(path.join(ctx.paths.rootDir, 'libraries', copy, 'worldkeeper.db'))).toBe(true);
    expect((await request(gm).post(`/api/libraries/${copy}/open`)).status).toBe(400);
    await request(gm).post(`/api/libraries/${copy}/archive`).send({ archived: false });
    expect(((await request(gm).get('/api/libraries')).body.libraries as { id: string }[]).some((l) => l.id === copy)).toBe(true);

    // Open a library from a file: a full-world ZIP becomes a new library, opened, with its records and pictures.
    const zip = exportFullWorldZip(ctx.db, ctx.paths);
    r = (await request(gm).post('/api/libraries/import').field('name', 'From a friend').attach('file', zip, 'world.zip')).body;
    expect(r.open).toBe(r.library.id);
    expect((await names()).sort()).toEqual(['Ashford', 'Harrowgate']);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, 'map.png'))).toBe(true);
    expect((await request(gm).get('/api/setup')).body.needed).toBe(false);
    // A file that isn't one leaves things as they were, with no half-made library.
    const shape = (b: { open: string; libraries: { id: string; name: string }[] }) => ({ open: b.open, ids: b.libraries.map((l) => `${l.id}:${l.name}`) });
    const before = shape((await request(gm).get('/api/libraries')).body);
    expect((await request(gm).post('/api/libraries/import').attach('file', Buffer.from('PKnope'), 'bad.zip')).status).toBe(400);
    expect((await request(gm).post('/api/libraries/import').attach('file', Buffer.from('hello'), 'bad.zip')).status).toBe(400);
    expect(shape((await request(gm).get('/api/libraries')).body)).toEqual(before);
    expect(fs.readdirSync(path.join(ctx.paths.rootDir, 'libraries'))).toHaveLength(before.ids.length); // no folder left behind
    // Showing a folder is for the desktop app.
    expect((await request(gm).post(`/api/libraries/${first}/show`)).status).toBe(400);
  });

  it('restores a backup in one library without touching another', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const names = async () => ((await request(gm).get('/api/entities')).body as { name: string }[]).map((e) => e.name).sort();
    await request(gm).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', body: '' });
    const backup = createBackup(ctx.db, ctx.paths, 'manual').file;
    await request(gm).post('/api/entities').send({ name: 'Ashford', type: 'settlement', realm: 'world', body: '' });
    const first = ctx.paths.libraryId;
    await request(gm).post('/api/libraries').send({ name: 'Other', open: true });
    await request(gm).post('/api/entities').send({ name: 'Coldwater', type: 'settlement', realm: 'world', body: '' });
    await request(gm).post(`/api/libraries/${first}/open`);
    expect((await request(gm).post(`/api/backups/${backup}/restore`)).status).toBe(200);
    expect(await names()).toEqual(['Harrowgate']);
    const other = (await request(gm).get('/api/libraries')).body.libraries.find((l: { name: string }) => l.name === 'Other').id;
    await request(gm).post(`/api/libraries/${other}/open`);
    expect(await names()).toEqual(['Coldwater']);
  });
});
