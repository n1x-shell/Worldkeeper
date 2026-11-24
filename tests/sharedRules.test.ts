/** Your books' rules and installed packs, shared by every library (docs/LIBRARIES_PLAN.md step B2). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { resolvePaths } from '../server/src/config.js';
import Database from 'better-sqlite3';
import { libraryDir, readIndex, writeIndex } from '../server/src/libraries.js';
import { adoptSharedRules } from '../server/src/repo/sharedRules.js';

function pack(name: string, source: string, spell: string) {
  const zip = new AdmZip();
  zip.addFile('pack.md', Buffer.from(`Pack: ${name}\nSource: ${source}\n`));
  zip.addFile(
    'spells/s.md',
    Buffer.from(`Kind: spell\nName: ${spell}\nLevel: 1\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action\nRange: 60 feet\nComponents: V\nDuration: Instantaneous\n\nZap.`),
  );
  return zip.toBuffer();
}

type Pack = { id: string; enabled: boolean; publish?: boolean };
const packs = async (gm: ReturnType<typeof createApp>) => ((await request(gm).get('/api/rules/packs')).body as Pack[]).filter((p) => p.id !== 'srd' && p.id !== 'worldkeeper');
const spells = async (app: ReturnType<typeof createApp>) => ((await request(app).get('/api/player/rules')).body.spells as { name: string }[]).map((s) => s.name);

describe('rules shared by every library', () => {
  it('imports books once for every library; each library keeps its own switches', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const first = ctx.paths.libraryId;
    expect(
      (
        await request(gm)
          .post('/api/rules/packs')
          .attach('pack', pack('Open Book', 'Homebrew, CC BY 4.0', 'Glimmer Bolt'), 'p.zip')
      ).status,
    ).toBe(200);
    expect(fs.existsSync(path.join(ctx.paths.sharedDir, 'rules.db'))).toBe(true);
    // The library's own database no longer holds the rules.
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM main.rules_entries').get() as { n: number }).n).toBe(0);
    await request(gm).patch('/api/rules/packs/open-book').send({ publish: true });

    // A second library has the book at once, but off, and not published, until it says so.
    const second = (await request(gm).post('/api/libraries').send({ name: 'Second', open: true })).body.open;
    expect(await packs(gm)).toMatchObject([{ id: 'open-book', enabled: false, publish: false }]);
    expect(await spells(gm)).not.toContain('Glimmer Bolt');
    await request(gm).patch('/api/rules/packs/open-book').send({ enabled: true });
    expect(await spells(gm)).toContain('Glimmer Bolt');
    // Its switches are its own.
    await request(gm).patch('/api/rules/packs/open-book').send({ enabled: false });
    await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
    expect(await spells(gm)).toEqual([]);

    await request(gm).post(`/api/libraries/${first}/open`);
    expect(await packs(gm)).toMatchObject([{ id: 'open-book', enabled: true, publish: true }]);
    expect(await spells(gm)).toEqual(expect.arrayContaining(['Glimmer Bolt', 'Magic Missile']));
    // The table server, in either library, reads the same shared rules.
    const table = createApp(new AppContext(ctx.paths, 'player'));
    expect(await spells(table)).toContain('Glimmer Bolt');

    // Importing again (a newer copy) updates it for every library; removing it removes it from every library.
    await request(gm)
      .post('/api/rules/packs')
      .attach('pack', pack('Open Book', 'Homebrew, CC BY 4.0', 'Glimmer Bolt II'), 'p.zip');
    await request(gm).post(`/api/libraries/${second}/open`);
    await request(gm).patch('/api/rules/packs/open-book').send({ enabled: true });
    expect(await spells(gm)).toEqual(['Glimmer Bolt II']);
    expect((await request(gm).delete('/api/rules/packs/open-book')).status).toBe(200);
    await request(gm).post(`/api/libraries/${first}/open`);
    expect(await packs(gm)).toEqual([]);
  });

  it('a book is on only in the library it was imported in; libraries from before v0.6.8 keep the books they used', async () => {
    const ctx = tempContext();
    const root = ctx.paths.rootDir;
    let gm = createApp(ctx);
    const first = ctx.paths.libraryId;
    const second = (await request(gm).post('/api/libraries').send({ name: 'Second' })).body.library.id as string;
    await request(gm)
      .post('/api/rules/packs')
      .attach('pack', pack('Old Book', 'Homebrew, CC BY 4.0', 'Old Bolt'), 'p.zip');
    await request(gm).post(`/api/libraries/${second}/open`);
    await request(gm).post(`/api/libraries/${first}/open`);
    ctx.db.close();

    // Make the folder as v0.6.7 left it: no switches (every book was in use), no migration 32, no mark in the rules.
    const file = (id: string) => path.join(libraryDir(root, readIndex(root)!.libraries.find((l) => l.id === id)!), 'worldkeeper.db');
    const asBefore = (id: string) => {
      const db = new Database(file(id));
      db.exec('DELETE FROM rules_pack_switches; DROP TABLE rules_switches_pending; DELETE FROM schema_migrations WHERE version = 32;');
      db.close();
    };
    asBefore(first);
    asBefore(second);
    const rules = new Database(path.join(ctx.paths.sharedDir, 'rules.db'));
    rules.exec('DROP TABLE rules_meta');
    rules.close();

    // The new version opens it: both libraries keep the book, the one not open as well.
    const after = new AppContext(resolvePaths(root));
    gm = createApp(after);
    expect(await packs(gm)).toMatchObject([{ id: 'old-book', enabled: true, publish: false }]);
    // A book imported now is on here, and off in the other library.
    await request(gm)
      .post('/api/rules/packs')
      .attach('pack', pack('New Book', 'Homebrew, CC BY 4.0', 'New Bolt'), 'p.zip');
    expect(await packs(gm)).toMatchObject([
      { id: 'old-book', enabled: true },
      { id: 'new-book', enabled: true },
    ]);
    await request(gm).post(`/api/libraries/${second}/open`);
    expect(await packs(gm)).toMatchObject([
      { id: 'old-book', enabled: true },
      { id: 'new-book', enabled: false },
    ]);
    expect(await spells(gm)).toContain('Old Bolt');
    expect(await spells(gm)).not.toContain('New Bolt');

    // A library from before v0.6.8 that arrives later (a backup restored) keeps the books, as it used them all.
    await request(gm).post(`/api/libraries/${first}/open`);
    after.db.close();
    asBefore(second);
    const again = new AppContext(resolvePaths(root));
    again.openLibrary(second);
    expect(await packs(createApp(again))).toMatchObject([
      { id: 'old-book', enabled: true },
      { id: 'new-book', enabled: true },
    ]);
    again.db.close();
  });

  it('moves the rules a library kept itself into the shared rules, with its switches', () => {
    const ctx = tempContext();
    // As a library from v0.5.5 or earlier (or a backup made then) has them: in its own database.
    const old = (id: string, at: string, spell: string, enabled: number, publish: number) => {
      ctx.db.prepare('INSERT INTO main.rules_packs (id, name, source, enabled, imported_at, publish) VALUES (?, ?, ?, ?, ?, ?)').run(id, id, 'CC BY 4.0', enabled, at, publish);
      ctx.db.prepare(`INSERT INTO main.rules_entries (pack_id, kind, name, cls, data) VALUES (?, 'spell', ?, '', '{}')`).run(id, spell);
    };
    old('kept', '2026-01-01T00:00:00Z', 'Old Spell', 0, 1);
    adoptSharedRules(ctx.db);
    expect(ctx.db.prepare('SELECT id, enabled, publish FROM rules_packs').all()).toEqual([{ id: 'kept', enabled: 0, publish: 1 }]);
    expect(ctx.db.prepare('SELECT name FROM rules_entries').all()).toEqual([{ name: 'Old Spell' }]);
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM main.rules_packs').get() as { n: number }).n).toBe(0);
    // An older copy than the shared one doesn't replace it; a newer one does.
    old('kept', '2025-01-01T00:00:00Z', 'Older Spell', 1, 0);
    adoptSharedRules(ctx.db);
    expect(ctx.db.prepare('SELECT name FROM rules_entries').all()).toEqual([{ name: 'Old Spell' }]);
    old('kept', '2027-01-01T00:00:00Z', 'Newer Spell', 1, 0);
    adoptSharedRules(ctx.db);
    expect(ctx.db.prepare('SELECT name FROM rules_entries').all()).toEqual([{ name: 'Newer Spell' }]);
    expect(ctx.db.prepare('SELECT enabled, publish FROM rules_packs').get()).toEqual({ enabled: 1, publish: 0 });
  });

  it('moves installed packs and the publishing token into shared/', () => {
    // A data folder as v0.5.5 left it: libraries, with packs and the token beside them.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-test-'));
    const id = 'lib-aaaaaa';
    writeIndex(root, { format: 1, open: id, libraries: [{ id, name: 'One', folder: id, created_at: '2026-11-24T00:00:00Z', last_opened_at: null }] });
    fs.mkdirSync(path.join(root, 'packs', 'the-isle'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packs', 'the-isle', 'pack.json'), '{}');
    fs.writeFileSync(path.join(root, 'secrets.json'), '{"github_token":"x"}');
    const p = resolvePaths(root);
    expect(p.sharedDir).toBe(path.join(root, 'shared'));
    expect(fs.existsSync(path.join(root, 'shared', 'packs', 'the-isle', 'pack.json'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'shared', 'secrets.json'), 'utf8')).toContain('github_token');
    expect(fs.existsSync(path.join(root, 'packs'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'secrets.json'))).toBe(false);
  });
});
