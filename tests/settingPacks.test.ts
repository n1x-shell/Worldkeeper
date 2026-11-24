/** Setting packs: install, update, uninstall, ID clashes, roles, and a library without the Worldkeeper pack. */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { forgetPacks, installPack, isInstalled, listPacks, role, roles, uninstallPack } from '../server/src/packs/registry.js';
import { updatePack } from '../server/src/packs/content.js';
import { createEntity } from '../server/src/repo/entities.js';
import type { AppContext } from '../server/src/context.js';

const record = (id: string, name: string, body: string) =>
  [
    `ID: ${id}`,
    `Name: ${name}`,
    'Alternate names: None',
    'Category: Beacon',
    'Parent: None',
    'Continent or realm: The Isle',
    'Canon status: CANON',
    'Source: Test pack',
    'Tags: vis/player',
    '',
    `# ${name}`,
    '',
    '## Overview',
    body,
    '',
  ].join('\n');

/** A small pack of its own, installed into the library's data folder (SYNTHETIC TEST DATA). */
function writeTestPack(ctx: AppContext) {
  const dir = path.join(ctx.paths.sharedDir, 'packs', 'testpack');
  fs.mkdirSync(path.join(dir, 'lore'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'pack.json'),
    JSON.stringify({
      id: 'testpack',
      name: 'Test pack',
      version: '1.0.0',
      description: 'A pack for the tests.',
      realms: [{ id: 'the-isle', name: 'The Isle', kind: 'continent', parent_id: 'world', color: 'teal', icon: 'map', sort_order: 1 }],
      types: [{ key: 'beacon', label: 'Beacon', plural: 'Beacons', prefix: 'BCN', icon: 'flame', pin: 'site', category: 'place', browse: [], handbook: 'places', traits: { place: true } }],
      roles: { 'world.overview': 'BCN-0001', 'rules.missing': 'BCN-0999' },
      modules: [],
    }),
  );
  fs.writeFileSync(path.join(dir, 'lore', 'BCN-0001_Lamp.md'), record('BCN-0001', 'The Lamp', 'A light on the cliff.'));
  fs.writeFileSync(path.join(dir, 'lore', 'BCN-0002_Tower.md'), record('BCN-0002', 'The Tower', 'Near [BCN-0001].'));
  fs.writeFileSync(path.join(dir, 'templates', 'beacon.md'), 'Template for: beacon\nName: Beacon\n\n## Overview\nWhat it lights.\n');
  forgetPacks();
  return dir;
}

describe('setting packs', () => {
  it('lists the bundled Worldkeeper pack, not installed in a fresh library', () => {
    const ctx = tempContext();
    const wk = listPacks(ctx.db).find((p) => p.id === 'worldkeeper');
    expect(wk).toMatchObject({ source: 'bundled', installed: null });
    expect(isInstalled(ctx.db, 'worldkeeper')).toBe(false);
    expect(roles(ctx.db)).toEqual({});
  });

  it('installs, updates and uninstalls a pack, marking only what it shipped', () => {
    const ctx = tempContext();
    writeTestPack(ctx);
    expect(listPacks(ctx.db).find((p) => p.id === 'testpack')?.source).toBe('installed');
    installPack(ctx.db, 'testpack');
    expect(ctx.db.prepare(`SELECT pack_id, parent_id FROM realms WHERE id = 'the-isle'`).get()).toEqual({ pack_id: 'testpack', parent_id: 'world' });
    expect(ctx.db.prepare(`SELECT pack_id FROM record_types WHERE key = 'beacon'`).get()).toEqual({ pack_id: 'testpack' });
    expect(ctx.db.prepare(`SELECT origin, pack_id FROM templates WHERE type = 'beacon'`).get()).toEqual({ origin: 'pack', pack_id: 'testpack' });

    // The GM's own record before the update: it stays, and the pack's update leaves it as it is.
    createEntity(ctx.db, { id: 'BCN-0100', name: 'My Harbour', type: 'beacon', realm: 'world', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: '## Overview\nMine.', notes: '' });
    const res = updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    expect(res.clashes).toEqual([]);
    const rows = ctx.db.prepare(`SELECT id, pack_id, realm FROM entities ORDER BY id`).all() as { id: string; pack_id: string | null; realm: string }[];
    expect(rows.filter((r) => r.pack_id === 'testpack').map((r) => r.id)).toEqual(['BCN-0001', 'BCN-0002']);
    expect(rows.find((r) => r.id === 'BCN-0001')?.realm).toBe('the-isle');
    expect(rows.filter((r) => r.pack_id === null)).toHaveLength(1);
    expect(listPacks(ctx.db).find((p) => p.id === 'testpack')).toMatchObject({ records: 2, installed: { version: '1.0.0' } });

    // Roles name the pack's records; a role whose record is missing is left out.
    expect(role(ctx.db, 'world.overview')).toBe('BCN-0001');
    expect(role(ctx.db, 'rules.missing')).toBeNull();
    expect(roles(ctx.db)).toEqual({ 'world.overview': 'BCN-0001' });

    // Uninstall: the pack's records, links and template go; the GM's record, and the type and realm it uses, stay.
    const mine = rows.find((r) => r.pack_id === null)!;
    ctx.db.prepare(`UPDATE entities SET realm = 'the-isle' WHERE id = ?`).run(mine.id);
    uninstallPack(ctx.db, 'testpack');
    expect(ctx.db.prepare('SELECT id FROM entities').all()).toEqual([{ id: mine.id }]);
    expect(ctx.db.prepare(`SELECT COUNT(*) n FROM templates WHERE pack_id = 'testpack'`).get()).toEqual({ n: 0 });
    expect(ctx.db.prepare(`SELECT pack_id FROM realms WHERE id = 'the-isle'`).get()).toEqual({ pack_id: null });
    expect(ctx.db.prepare(`SELECT pack_id FROM record_types WHERE key = 'beacon'`).get()).toEqual({ pack_id: 'testpack' });
    expect(isInstalled(ctx.db, 'testpack')).toBe(false);
    expect(roles(ctx.db)).toEqual({});
  });

  it('keeps a second pack beside the setting: each updates and uninstalls without touching the other or the GM’s records', () => {
    const ctx = tempContext();
    writeTestPack(ctx);
    updatePack(ctx.db, 'worldkeeper', ctx.paths.uploadsDir);
    updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    createEntity(ctx.db, { id: 'BCN-0100', name: 'My Harbour', type: 'beacon', realm: 'the-isle', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: '## Overview\nMine.', notes: '' });
    const count = (pack: string | null) => (ctx.db.prepare(`SELECT COUNT(*) n FROM entities WHERE pack_id ${pack ? '= ?' : 'IS NULL'}`).get(...(pack ? [pack] : [])) as { n: number }).n;
    const setting = count('worldkeeper');
    const snapshot = () => ctx.db.prepare(`SELECT id, name, body FROM entities WHERE pack_id = 'worldkeeper' ORDER BY id`).all();
    const before = snapshot();
    expect(setting).toBeGreaterThan(0);
    expect(count('testpack')).toBe(2);
    expect(count(null)).toBe(1);

    // Updating either leaves the other as it was.
    updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    expect(snapshot()).toEqual(before);
    updatePack(ctx.db, 'worldkeeper', ctx.paths.uploadsDir);
    expect(count('testpack')).toBe(2);
    expect(ctx.db.prepare(`SELECT realm FROM entities WHERE id = 'BCN-0001'`).get()).toEqual({ realm: 'the-isle' });

    // Uninstalling the second pack: the setting and the GM's record (with the realm and type it uses) stay.
    uninstallPack(ctx.db, 'testpack');
    expect(count('testpack')).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(count(null)).toBe(1);
    expect(isInstalled(ctx.db, 'worldkeeper')).toBe(true);
    expect(ctx.db.prepare(`SELECT 1 n FROM realms WHERE id = 'the-isle'`).get()).toEqual({ n: 1 });

    // And the other way round: uninstalling the setting leaves the GM's record.
    uninstallPack(ctx.db, 'worldkeeper');
    expect(count('worldkeeper')).toBe(0);
    expect(ctx.db.prepare(`SELECT name FROM entities WHERE id = 'BCN-0100'`).get()).toEqual({ name: 'My Harbour' });
  });

  it('gives a pack’s records the stat blocks it ships, while it is installed', async () => {
    const ctx = tempContext();
    const dir = writeTestPack(ctx);
    fs.mkdirSync(path.join(dir, 'statblocks'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'statblocks', 'keepers.json'),
      JSON.stringify({ statblocks: { 'BCN-0001': { id: 'BCN-0001', name: 'The Lamp’s Keeper', meta: 'Medium Humanoid', ac: 12, hpAvg: 22, cr: '1' } } }),
    );
    const gm = createApp(ctx);
    updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    expect((await request(gm).get('/api/statblocks/BCN-0001')).body).toMatchObject({ name: 'The Lamp’s Keeper', ac: 12, cr: '1' });
    expect((await request(gm).get('/api/statblocks')).body.some((s: { id: string }) => s.id === 'BCN-0001')).toBe(true);
    uninstallPack(ctx.db, 'testpack');
    expect((await request(gm).get('/api/statblocks')).body.some((s: { id: string }) => s.id === 'BCN-0001')).toBe(false);
  });

  it('reports an ID the GM already uses, and keeps the GM’s record', () => {
    const ctx = tempContext();
    writeTestPack(ctx);
    installPack(ctx.db, 'testpack');
    createEntity(ctx.db, { id: 'BCN-0002', name: 'My Own Tower', type: 'beacon', realm: 'world', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: '## Overview\nMine.', notes: '' });
    const res = updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    expect(res.clashes).toEqual([{ id: 'BCN-0002', name: 'The Tower' }]);
    expect(ctx.db.prepare(`SELECT name, pack_id FROM entities WHERE id = 'BCN-0002'`).get()).toEqual({ name: 'My Own Tower', pack_id: null });
  });

  it('removes unused pack realms and types on uninstall', () => {
    const ctx = tempContext();
    writeTestPack(ctx);
    updatePack(ctx.db, 'testpack', ctx.paths.uploadsDir);
    uninstallPack(ctx.db, 'testpack');
    expect(ctx.db.prepare(`SELECT 1 FROM realms WHERE id = 'the-isle'`).get()).toBeUndefined();
    expect(ctx.db.prepare(`SELECT 1 FROM record_types WHERE key = 'beacon'`).get()).toBeUndefined();
  });

  it('has routes to list, install, update and uninstall, each with a backup', async () => {
    const ctx = tempContext();
    writeTestPack(ctx);
    const app = createApp(ctx);
    const list = await request(app).get('/api/setting-packs');
    expect(list.body.packs.map((p: { id: string }) => p.id).sort()).toEqual(['testpack', 'worldkeeper']);
    const inst = await request(app).post('/api/setting-packs/testpack/install');
    expect(inst.status).toBe(200);
    expect(inst.body.backup).toBeTruthy();
    expect((await request(app).get('/api/setting-packs')).body.roles).toEqual({ 'world.overview': 'BCN-0001' });
    expect((await request(app).post('/api/setting-packs/testpack/update')).status).toBe(200);
    expect((await request(app).delete('/api/setting-packs/testpack')).status).toBe(200);
    expect((await request(app).delete('/api/setting-packs/testpack')).status).toBe(400);
    expect((await request(app).post('/api/setting-packs/nope/install')).status).toBe(404);
  });

  it('refuses the Worldkeeper pack’s own actions in a library without it', async () => {
    const app = createApp(tempContext());
    for (const [method, url] of [
      ['post', '/api/mysteries/sync'],
      ['post', '/api/rumours/sync'],
      ['get', '/api/handbook-reveals'],
      ['get', '/api/library/open-questions'],
    ] as const) {
      const res = await request(app)[method](url);
      expect(res.status, url).toBe(400);
      expect(res.body.error).toMatch(/worldbook/);
    }
    // The consistency checker still runs, without the pack's treasure checks.
    const report = await request(app).get('/api/library/consistency');
    expect(report.status).toBe(200);
    expect(report.body.problems.filter((p: { check: string }) => /Treasure/.test(p.check))).toEqual([]);
  });
});
