/** Safe upgrades (v0.9.15, docs/BETA_PLAN.md A1): a library made by an earlier version, opened by this one. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext, tempDir } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { openDatabase } from '../server/src/db/connection.js';
import { LATEST_SCHEMA, MIGRATIONS, NewerLibraryError, UpgradeError, schemaVersion } from '../server/src/db/migrations.js';
import { createLibrary, readIndex } from '../server/src/libraries.js';
import { listBackups } from '../server/src/backup/backup.js';
import { describeFailure, recoveryApp } from '../server/src/recovery.js';
import { APP_VERSION } from '../shared/version.js';
import lock from './migrations.lock.json';

const root = path.resolve(__dirname, '..');

/** A library's database as the app left it at step `n`, with a little in it. */
function libraryAt(n: number): string {
  const file = path.join(tempDir(), 'worldkeeper.db');
  const db = new Database(file);
  db.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  for (const m of MIGRATIONS.filter((x) => x.version <= n)) {
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
  }
  db.prepare(`INSERT INTO entities (id, name, type, body) VALUES ('LOC-001', 'The Old Keep', 'landmark', 'Stone, and older than the town.')`).run();
  db.prepare(`INSERT INTO entities (id, name, type, parent_id) VALUES ('NPC-001', 'Mara Venn', 'npc', 'LOC-001')`).run();
  db.close();
  return file;
}

describe('the steps already shipped', () => {
  it('are never edited: each one’s checksum is on record', () => {
    const sums = Object.fromEntries(MIGRATIONS.map((m) => [String(m.version), createHash('sha256').update(`${m.name}\n${m.sql}\n${m.onUpgrade ?? ''}`).digest('hex').slice(0, 24)]));
    // A new step is added to tests/migrations.lock.json when it ships; a shipped one must not change, because
    // libraries already took it. If this fails for an old step, put the step back and write a new one instead.
    expect(sums).toEqual(lock);
    // In order, with none missing.
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });

  it('the version is written the same everywhere', () => {
    const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
    expect(JSON.parse(read('package.json')).version).toBe(APP_VERSION);
    expect(JSON.parse(read('package-lock.json')).version).toBe(APP_VERSION);
    expect(JSON.parse(read('src-tauri/tauri.conf.json')).version).toBe(APP_VERSION);
    expect(JSON.parse(read('packs/worldkeeper/pack.json')).version).toBe(APP_VERSION);
    expect(read('src-tauri/Cargo.toml')).toContain(`version = "${APP_VERSION}"`);
    expect(read('src-tauri/Cargo.lock')).toContain(`name = "worldkeeper"\nversion = "${APP_VERSION}"`);
  });
});

describe('opening a library an earlier version made', () => {
  const latest = LATEST_SCHEMA();

  it.each([1, 4, 9, 15, 22, 30, latest - 1])('from step %i: backed up first, brought up to date, nothing lost', (n) => {
    const file = libraryAt(n);
    const calls: [number, number][] = [];
    const db = openDatabase(file, {
      beforeUpgrade: (old, from, to) => {
        // Called before anything changes: the library is still as the earlier version left it.
        expect(schemaVersion(old)).toBe(n);
        calls.push([from, to]);
        return 'a-backup';
      },
    });
    expect(calls).toEqual([[n, latest]]);
    expect(schemaVersion(db)).toBe(latest);
    expect(db.prepare('SELECT id, name, parent_id FROM entities ORDER BY id').all()).toEqual([
      { id: 'LOC-001', name: 'The Old Keep', parent_id: null },
      { id: 'NPC-001', name: 'Mara Venn', parent_id: 'LOC-001' },
    ]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
    // Opened again, it is already up to date: no second backup.
    const again = openDatabase(file, { beforeUpgrade: () => (calls.push([0, 0]), null) });
    expect(calls).toHaveLength(1);
    again.close();
  });

  it('a new library is not "updated", and needs no backup', () => {
    let called = false;
    const db = openDatabase(path.join(tempDir(), 'new.db'), { beforeUpgrade: () => ((called = true), null) });
    expect(called).toBe(false);
    expect(schemaVersion(db)).toBe(latest);
    db.close();
  });

  it('an update that fails changes nothing at all', () => {
    const file = libraryAt(latest);
    MIGRATIONS.push({ version: latest + 1, name: 'a good step', sql: 'CREATE TABLE zz_good (x); INSERT INTO entities (id, name, type) VALUES (\'ZZ-1\', \'Half done\', \'npc\');' }, { version: latest + 2, name: 'a broken step', sql: 'CREATE TABLE zz_bad (x); INSERT INTO no_such_table VALUES (1);' });
    try {
      let err: unknown;
      try {
        openDatabase(file, { beforeUpgrade: () => 'the-backup.wkbackup.zip' });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UpgradeError);
      expect((err as UpgradeError).info).toMatchObject({ from: latest, to: latest + 2, backup: 'the-backup.wkbackup.zip' });
      expect((err as UpgradeError).info.cause).toMatch(/^step \d+ \(a broken step\): no such table/);
      expect((err as UpgradeError).message).toContain('Nothing has been changed');
    } finally {
      MIGRATIONS.splice(-2, 2);
    }
    // Not the good step either: the library is as the version before left it, and that version still opens it.
    const db = new Database(file);
    expect(schemaVersion(db)).toBe(latest);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name LIKE 'zz_%'`).all()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) n FROM entities').get()).toEqual({ n: 2 });
    db.close();
    // And this version, without the broken step, opens it as ever.
    const ok = openDatabase(file);
    expect(ok.prepare('SELECT COUNT(*) n FROM entities').get()).toEqual({ n: 2 });
    ok.close();
  });

  it('a library from a newer version is refused, untouched', () => {
    const file = libraryAt(latest);
    const db0 = new Database(file);
    db0.exec('CREATE TABLE from_the_future (x)');
    db0.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(latest + 5, 'something this version has never heard of');
    db0.close();
    let called = false;
    expect(() => openDatabase(file, { beforeUpgrade: () => ((called = true), null) })).toThrow(NewerLibraryError);
    expect(() => openDatabase(file)).toThrow(/newer version of The Worldkeeper.*Nothing has been changed/s);
    expect(called).toBe(false);
    const db = new Database(file, { readonly: true });
    expect(schemaVersion(db)).toBe(latest + 5);
    db.close();
  });
});

describe('in the app', () => {
  /** Put an open library back a step, as the version before left it. */
  function setBack(ctx: AppContext): { paths: AppContext['paths']; step: number } {
    const paths = ctx.paths;
    const last = MIGRATIONS[MIGRATIONS.length - 1];
    ctx.db.exec('DROP TABLE table_rolls');
    ctx.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(last.version);
    ctx.db.close();
    return { paths, step: last.version - 1 };
  }

  it('backs the library up before updating it, says so once, and keeps the copy', async () => {
    const first = tempContext();
    await request(createApp(first)).post('/api/entities').send({ name: 'The Old Keep', type: 'landmark', realm: 'world' });
    fs.writeFileSync(path.join(first.paths.uploadsDir, 'map.png'), 'not really a picture');
    const { paths, step } = setBack(first);

    const ctx = new AppContext(paths);
    const gm = createApp(ctx);
    const backups = listBackups(paths).filter((b) => b.file.includes('pre-update'));
    expect(backups).toHaveLength(1);
    expect(backups[0].file).toMatch(new RegExp(`-pre-update-step-${step}\\.wkbackup\\.zip$`));
    // The copy is the library as it was (a step behind, the record in it), without the pictures.
    const zip = new AdmZip(path.join(paths.backupsDir, backups[0].file));
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect(manifest).toMatchObject({ schemaVersion: step, uploads: false, counts: { entities: 1 } });
    expect(zip.getEntries().map((e) => e.entryName).sort()).toEqual(['manifest.json', 'worldkeeper.db']);
    // It restores like any backup, and the pictures stay.
    const meta = (await request(gm).get('/api/meta')).body;
    expect(meta.version).toBe(APP_VERSION);
    expect(meta.upgrade).toMatchObject({ from: step, to: step + 1, backup: backups[0].file });
    await request(gm).post('/api/meta/upgrade-seen');
    expect((await request(gm).get('/api/meta')).body.upgrade).toBeNull();
    expect((await request(gm).post(`/api/backups/${encodeURIComponent(backups[0].file)}/restore`)).status).toBe(200);
    expect((await request(gm).get('/api/entities')).body.map((e: { name: string }) => e.name)).toEqual(['The Old Keep']);
    expect(fs.existsSync(path.join(paths.uploadsDir, 'map.png'))).toBe(true);
    expect((await request(gm).get('/api/meta')).body.schemaVersion).toBe(step + 1);
  });

  it('stays in the open library when another can’t be opened', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).post('/api/entities').send({ name: 'Here', type: 'landmark', realm: 'world' });
    const here = ctx.paths.libraryId;
    const other = createLibrary(ctx.paths.rootDir, 'From the future');
    // Make the other library, then mark it as a newer version's.
    ctx.openLibrary(other.id);
    ctx.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (9999, ?)').run('unknown');
    ctx.openLibrary(here);

    const res = await request(gm).post(`/api/libraries/${other.id}/open`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/newer version/);
    // Still here, still working, and still the library the next start opens.
    expect(ctx.paths.libraryId).toBe(here);
    expect((await request(gm).get('/api/entities')).body.map((e: { name: string }) => e.name)).toEqual(['Here']);
    expect(readIndex(ctx.paths.rootDir)!.open).toBe(here);
  });
});

describe('when the library can’t be opened at the start', () => {
  it('says what happened in plain words, for each way it can go wrong', () => {
    const up = describeFailure(new UpgradeError('x', { from: 30, to: 37, backup: 'b.wkbackup.zip', cause: 'step 33 (names): no such column' }));
    expect(up).toMatchObject({ title: 'This library could not be updated', backup: 'b.wkbackup.zip', detail: 'step 33 (names): no such column' });
    expect(up.what).toContain('Nothing has been changed');
    expect(describeFailure(new NewerLibraryError({ library: 50, app: 37 })).title).toBe('This library needs a newer version');
    expect(describeFailure(Object.assign(new Error('database disk image is malformed'), { code: 'SQLITE_CORRUPT' }))).toMatchObject({ title: 'This library could not be opened', detail: 'SQLITE_CORRUPT: database disk image is malformed' });
  });

  it('answers with a page, not silence, and lets the GM try again or open another library', async () => {
    const ctx = tempContext();
    const rootDir = ctx.paths.rootDir;
    const other = createLibrary(rootDir, 'The <b>Other</b> World');
    const tried: (string | undefined)[] = [];
    const app = recoveryApp(
      () => ({
        error: new UpgradeError('x', { from: 30, to: 37, backup: 'worldkeeper-pre-update-step-30.wkbackup.zip', cause: 'step 33 (names): no such column' }),
        rootDir,
        library: { id: ctx.paths.libraryId, name: 'My <World>', dir: ctx.paths.dataDir, backupsDir: ctx.paths.backupsDir },
        version: '9.9.9',
      }),
      (id) => (tried.push(id), false),
    );
    const page = await request(app).get('/campaign/anything');
    expect(page.status).toBe(503);
    expect(page.headers['content-type']).toMatch(/html/);
    expect(page.text).toContain('This library could not be updated');
    expect(page.text).toContain('Nothing has been changed');
    expect(page.text).toContain('worldkeeper-pre-update-step-30.wkbackup.zip');
    expect(page.text).toContain('step 33 (names): no such column');
    expect(page.text).toContain('The Worldkeeper 9.9.9');
    // Names are text, never markup.
    expect(page.text).toContain('My &lt;World&gt;');
    expect(page.text).toContain('The &lt;b&gt;Other&lt;/b&gt; World');
    expect(page.text).not.toContain('<b>Other</b>');
    expect((await request(app).get('/api/entities')).status).toBe(503);
    expect((await request(app).get('/api/health')).body).toMatchObject({ ok: false, recovery: true });

    expect((await request(app).post('/recover').type('form').send({})).status).toBe(303);
    expect((await request(app).post('/recover').type('form').send({ library: other.id })).status).toBe(303);
    // Only a library this installation lists.
    await request(app).post('/recover').type('form').send({ library: '../../etc' });
    expect(tried).toEqual([undefined, other.id, undefined]);
  });
});
