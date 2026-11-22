/** The record-type registry (docs/OWN_WORLD_PLAN.md §2.10, step 2): types by trait, per-type IDs, and an export that reads back. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createEntity, getEntity, updateEntity } from '../server/src/repo/entities.js';
import { createRecordType, listRecordTypes, types } from '../server/src/repo/recordTypes.js';
import { exportMarkdownZip } from '../server/src/backup/exporter.js';
import { createRealm } from '../server/src/repo/realms.js';
import { BUILTIN_TYPES, makeTypeRegistry } from '../shared/recordTypes.js';
import { BARE_ID_RE } from '../shared/domain.js';

const rec = (name: string, type: string, realm = 'world') => ({ name, type, realm, canon_status: 'PROPOSED', aliases: [], tags: [], fields: [], body: '## Overview\nText.', notes: '' }) as never;

function importZip(ctx: ReturnType<typeof tempContext>, zip: Buffer) {
  const files = readZip(zip);
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'x.zip'));
}

describe('the record-type registry', () => {
  it('has one built-in type per key and prefix, and answers by trait', () => {
    expect(new Set(BUILTIN_TYPES.map((t) => t.key)).size).toBe(BUILTIN_TYPES.length);
    expect(new Set(BUILTIN_TYPES.map((t) => t.prefix)).size).toBe(BUILTIN_TYPES.length);
    const reg = makeTypeRegistry();
    expect(reg.with('group')).toEqual(['faction', 'cult', 'family']);
    expect(reg.with('place')).toContain('settlement');
    expect(reg.with('place')).not.toContain('npc');
    expect(reg.fromCategory('Town')).toBe('settlement');
    expect(reg.fromCategory('Settlement (village)')).toBe('settlement');
    expect(reg.fromCategory('Magic Item')).toBe('item');
  });

  it('is written into every library, and a GM can add a type of their own', async () => {
    const ctx = tempContext();
    expect(listRecordTypes(ctx.db).length).toBe(BUILTIN_TYPES.length);
    const app = createApp(ctx);
    const made = await request(app)
      .post('/api/record-types')
      .send({ label: 'Tavern', prefix: 'TAV', icon: 'home', pin: 'site', category: 'place', browse: ['places', 'landmarks'], handbook: 'places', traits: { place: true } });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ key: 'tavern', prefix: 'TAV', builtin: false });
    expect((await request(app).post('/api/record-types').send({ label: 'Inn', prefix: 'TAV' })).status).toBe(400); // prefix taken
    expect(types(ctx.db).with('place')).toContain('tavern');
    // Records of it get its prefix, and link like any other.
    const e = createEntity(ctx.db, rec('The Laughing Stoat', 'tavern'));
    expect(e.id).toBe('TAV-0001');
    expect(BARE_ID_RE.test(e.id)).toBe(true);
    expect(() => createEntity(ctx.db, rec('Nowhere', 'spaceship'))).toThrow(/no record type/i);
    // Used: archive it, don't delete it.
    expect((await request(app).delete('/api/record-types/tavern')).status).toBe(400);
    expect((await request(app).delete('/api/record-types/settlement')).status).toBe(400);
  });

  it("gives new records their type's prefix with four digits, which an archive's three-digit IDs never take", () => {
    const ctx = tempContext();
    importZip(ctx, zipOf(fixtureFiles()));
    const town = createEntity(ctx.db, rec('Brine Port', 'settlement', 'aetheris'));
    expect(town.id).toBe('SET-0001');
    expect(createEntity(ctx.db, rec('Second Port', 'settlement', 'aetheris')).id).toBe('SET-0002');
    expect(createEntity(ctx.db, rec('Old Mags', 'npc', 'aetheris')).id).toBe('NPC-0001');
  });

  it("re-imports a Markdown export with every record's type and realm, including the GM's own and changed ones", () => {
    const src = tempContext();
    importZip(src, zipOf(fixtureFiles()));
    createRealm(src.db, { name: 'The Sunken Isles', kind: 'continent', parent_id: 'world' });
    createRecordType(src.db, { label: 'Tavern', prefix: 'TAV', traits: { place: true } });
    const tavern = createEntity(src.db, rec('The Laughing Stoat', 'tavern', 'sunken-isles'));
    const port = createEntity(src.db, rec('Brine Port', 'settlement', 'sunken-isles'));
    // An archive record whose type and realm the GM changed.
    updateEntity(src.db, 'LOC-002', { type: 'dungeon', realm: 'sunken-isles' } as never);

    const dst = tempContext();
    // The GM's own type travels with a JSON export; a Markdown export needs it defined in the library it goes to.
    createRecordType(dst.db, { label: 'Tavern', prefix: 'TAV', traits: { place: true } });
    importZip(dst, exportMarkdownZip(src.db));
    const got = (id: string) => getEntity(dst.db, id);
    expect([got(tavern.id).type, got(tavern.id).realm]).toEqual(['tavern', 'sunken-isles']);
    expect([got(port.id).type, got(port.id).realm]).toEqual(['settlement', 'sunken-isles']);
    expect([got('LOC-002').type, got('LOC-002').realm]).toEqual(['dungeon', 'sunken-isles']);
    expect([got('SET-001').type, got('SET-001').realm]).toEqual(['settlement', 'aetheris']);
  });

  it("is the only place type names are listed: the app's code asks by trait", () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files = execSync('git ls-files client/src server/src shared', { cwd: root, encoding: 'utf8' })
      .split('\n')
      // The registry itself, and realm kinds (realm, world, continent...), which are not record types.
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('shared/recordTypes.ts') && !f.endsWith('shared/realms.ts'));
    // A list of two or more different built-in type names, written out in code.
    const names =
      'world|continent|realm|region|nation|settlement|landmark|building|dungeon|vault|ethereal_domain|adventure_location|faction|cult|family|people|culture|species|calling|shard|artifact|item|vault_key';
    const list = new RegExp(`\\[\\s*'(${names})'\\s*,\\s*'(?!\\1')(${names})'`);
    const offenders = files.filter((f) => list.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
