/** Sharing a world as a .worldbook and adding one (docs/WORLDBOOKS_PLAN.md, W3b). */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { maps, markers, shapes } from '../server/src/repo/maps.js';
import { adventures, randomTables, scenes } from '../server/src/repo/campaigns.js';
import { leaveOutGmOnly, readWorldbook } from '../server/src/packs/share.js';

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/** Enough of a PNG for the app to read its size. */
function png(width: number, height: number) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const zipOf = (files: Record<string, string>) => {
  const z = new AdmZip();
  for (const [p, t] of Object.entries(files)) z.addFile(p, Buffer.from(t));
  return z.toBuffer();
};

describe('worldbooks shared between GMs', () => {
  it('share a world, add it on another computer, and start a library with it', async () => {
    // GM A builds Ostmark: its shape and calendar, records, a link, a timeline row and a map.
    const a = tempContext();
    const gmA = createApp(a);
    await request(gmA)
      .post('/api/setup/finish')
      .send({
        path: 'own',
        world: { name: 'Ostmark', pitch: 'A cold world of iron kings.' },
        calendar: { preset: 'twelve-thirty', year: 1247, era: 'AR' },
        realms: [{ key: 'c1', name: 'Vael', kind: 'continent', parent: 'world' }],
        modules: { thinning: true },
        campaign: { title: 'The Iron Crown', town: 'Harrowgate', party: ['Ash'] },
        tutorial: false,
      })
      .expect(200);
    const town = (await request(gmA).get('/api/entities')).body.find((e: { name: string }) => e.name === 'Harrowgate');
    const keep = (
      await request(gmA)
        .post('/api/entities')
        .send({ name: 'Brennhold', type: 'settlement', realm: 'vael', body: '## A first look\n\nA keep on a cliff.\n\n## The truth (GM only)\n\nThe lord is dead.\n' })
    ).body;
    await request(gmA).post('/api/relationships').send({ source_id: keep.id, target_id: town.id, type: 'allied_with', label: 'old friends' }).expect(200);
    await request(gmA).post('/api/timeline').send({ time_label: '1200 AR', event: 'Brennhold is built', entity_ids: [keep.id] });
    fs.writeFileSync(path.join(a.paths.uploadsDir, 'ostmark.png'), png(400, 300));
    const m = maps.create(a.db, { name: 'Ostmark', kind: 'image', image_file: 'ostmark.png', width: 400, height: 300, realm_id: 'world' }) as { id: number };
    markers.create(a.db, { map_id: m.id, entity_id: keep.id, label: 'Brennhold', x: 100, y: 200, category: 'settlement' });
    markers.create(a.db, { map_id: m.id, label: 'Here be dragons', x: 10, y: 10, hidden: false });
    // An adventure with its scenes, and a weighted table.
    const adv = adventures.create(a.db, {
      title: 'The Cliff Road',
      status: 'draft',
      arc: 'Salt and smoke',
      linked_ids: [keep.id],
      data: { premise: 'Someone lights fires on the cliff road.', clues: [{ text: 'Soot on the gate', found: true }], levels: '1 to 3' },
    }) as { id: number };
    scenes.create(a.db, { adventure_id: adv.id, title: 'The gate', kind: 'location', body: 'The guards are tired.', read_aloud: 'Salt wind.\nA cold gate.', linked_ids: [keep.id], sort_order: 0 });
    scenes.create(a.db, { adventure_id: adv.id, title: 'The fire', kind: 'climax', body: 'It was the lord all along.', read_aloud: '', linked_ids: [], sort_order: 1 });
    randomTables.create(a.db, {
      name: 'Cliff road',
      die: 'd3',
      entries: [
        { weight: 2, text: 'Gulls, screaming' },
        { weight: 1, text: 'A smuggler with a lantern' },
      ],
      source: 'user',
      kind: 'encounter',
      level_min: 1,
      level_max: 4,
    });
    shapes.create(a.db, { map_id: m.id, kind: 'route', label: 'The cliff road', color: '#c9a24a', points: [[100, 200], [150, 250]] });

    // Shared with players in mind: GM-only sections and adventures are left out.
    const forPlayers = readWorldbook(
      (await request(gmA).get('/api/worldbooks/share').query({ name: 'Ostmark', gmOnly: 'leave-out' }).buffer(true).parse(binary)).body as Buffer,
    );
    expect(forPlayers.manifest.shared).toMatchObject({ gm_only_left_out: true, counts: { records: 2, adventures: 0 } });
    const playerLore = forPlayers.files.filter((f) => f.path.startsWith('lore/') && f.path.endsWith('.md')).map((f) => f.data.toString('utf8'));
    expect(playerLore.join('\n')).toContain('A keep on a cliff.');
    expect(playerLore.join('\n')).not.toContain('The lord is dead');
    expect(forPlayers.files.some((f) => f.path.startsWith('adventures/'))).toBe(false);

    // Shared whole.
    const res = await request(gmA).get('/api/worldbooks/share').query({ name: 'Ostmark', description: 'Iron kings.', author: 'GM A' }).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Ostmark.worldbook');
    const file = res.body as Buffer;
    const { manifest, files } = readWorldbook(file);
    expect(manifest).toMatchObject({ id: 'ostmark', name: 'Ostmark', description: 'Iron kings.', author: 'GM A', modules: expect.arrayContaining(['thinning']), calendar: { file: 'calendar.json', worlds: ['world'] } });
    expect(manifest.realms.map((r) => r.id)).toEqual(expect.arrayContaining(['world', 'vael']));
    expect(manifest.shared).toMatchObject({ format: 1, gm_only_left_out: false, counts: { records: 2, links: 1, timeline: 1, maps: 1 } });
    const lore = files.filter((f) => f.path.startsWith('lore/') && f.path.endsWith('.md')).map((f) => f.data.toString('utf8'));
    expect(lore.join('\n')).toContain('A keep on a cliff.');
    expect(lore.join('\n')).toContain('The lord is dead');
    // Never campaigns, characters or sessions.
    expect(files.map((f) => f.path).join('\n')).not.toMatch(/campaign|character|session/i);
    const pins = JSON.parse(files.find((f) => f.path === 'maps/ostmark.pins.json')!.data.toString('utf8'));
    // Only pins of records travel; positions from the top-left.
    expect(pins).toMatchObject({
      name: 'Ostmark',
      image: 'ostmark.png',
      pins: [
        { id: keep.id, label: 'Brennhold', x: 100, y: 100 },
        { label: 'Here be dragons', x: 10, y: 290, hidden: false },
      ],
    });
    expect(manifest.shared?.counts).toMatchObject({ adventures: 1, tables: 1 });

    // Added back to the computer it came from, it isn't offered to the library it was made from.
    await request(gmA).post('/api/worldbooks/add').attach('file', file, 'Ostmark.worldbook');
    expect((await request(gmA).get('/api/setting-packs')).body.packs.find((p: { id: string }) => p.id === 'ostmark')).toMatchObject({ madeHere: true, installed: null });

    // GM B, on another computer, adds it and starts a library with it.
    const b = tempContext();
    const gmB = createApp(b);
    const added = (await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Ostmark.worldbook')).body;
    expect(added.worldbook).toMatchObject({ id: 'ostmark', name: 'Ostmark', counts: { records: 2 } });
    expect(added.packs.find((p: { id: string }) => p.id === 'ostmark')).toMatchObject({ source: 'installed', installed: null });
    const started = (await request(gmB).post('/api/libraries/from-worldbook/ostmark').send({})).body;
    expect(started.library.name).toBe('Ostmark');
    expect(started.result.imported).toMatchObject({ created: 2 });
    // The new library is open, named after the world, with its shape, records, link, timeline, calendar and map.
    const realms = (await request(gmB).get('/api/realms')).body as { id: string; name: string }[];
    expect(realms.find((r) => r.id === 'world')?.name).toBe('Ostmark');
    expect(realms.find((r) => r.id === 'vael')).toBeTruthy();
    const recs = (await request(gmB).get('/api/entities')).body as { id: string; name: string }[];
    expect(recs.map((r) => r.name).sort()).toEqual(['Brennhold', 'Harrowgate']);
    const rels = b.db.prepare(`SELECT * FROM relationships WHERE source_id = ? AND target_id = ? AND type = 'allied_with'`).all(keep.id, town.id);
    expect(rels).toHaveLength(1);
    expect(b.db.prepare(`SELECT event FROM timeline_rows`).all()).toEqual([{ event: 'Brennhold is built' }]);
    const bMaps = (await request(gmB).get('/api/maps')).body as { id: number; name: string }[];
    expect(bMaps.map((x) => x.name)).toEqual(['Ostmark']);
    expect(b.db.prepare('SELECT entity_id, label, x, y, hidden FROM map_markers ORDER BY id').all()).toEqual([
      // A record's pin stays hidden until the record is revealed; a label keeps what it was.
      { entity_id: keep.id, label: 'Brennhold', x: 100, y: 200, hidden: 1 },
      { entity_id: null, label: 'Here be dragons', x: 10, y: 10, hidden: 0 },
    ]);
    // The adventure, its scenes in order with their read-aloud text, and the table with its weights.
    const bAdv = b.db.prepare('SELECT id, title, arc, linked_ids, data, pack_id FROM adventures').all() as { id: number; title: string; arc: string; linked_ids: string; data: string; pack_id: string }[];
    expect(bAdv).toHaveLength(1);
    expect(bAdv[0]).toMatchObject({ title: 'The Cliff Road', arc: 'Salt and smoke', pack_id: 'ostmark' });
    expect(JSON.parse(bAdv[0].linked_ids)).toEqual([keep.id]);
    expect(JSON.parse(bAdv[0].data)).toMatchObject({ premise: 'Someone lights fires on the cliff road.', clues: [{ text: 'Soot on the gate', found: false }], levels: '1 to 3' });
    expect(b.db.prepare('SELECT title, kind, read_aloud, body FROM scenes WHERE adventure_id = ? ORDER BY sort_order').all(bAdv[0].id)).toEqual([
      { title: 'The gate', kind: 'location', read_aloud: 'Salt wind.\nA cold gate.', body: 'The guards are tired.' },
      { title: 'The fire', kind: 'climax', read_aloud: '', body: 'It was the lord all along.' },
    ]);
    const bTable = b.db.prepare(`SELECT name, die, entries, kind, level_min, level_max, source, pack_id FROM random_tables`).get() as Record<string, unknown>;
    expect(bTable).toMatchObject({ name: 'Cliff road', die: 'd3', kind: 'encounter', level_min: 1, level_max: 4, source: 'Ostmark', pack_id: 'ostmark' });
    expect(JSON.parse(bTable.entries as string)).toEqual([
      { weight: 2, text: 'Gulls, screaming' },
      { weight: 1, text: 'A smuggler with a lantern' },
    ]);
    expect(b.db.prepare(`SELECT label FROM map_shapes WHERE kind = 'route'`).all()).toEqual([{ label: 'The cliff road' }]);
    expect((await request(gmB).get('/api/calendars')).status).toBe(200);
    // No campaign came with it.
    expect((await request(gmB).get('/api/campaigns')).body).toEqual([]);
    // It is the library's worldbook: it can be removed like any other, taking its records with it.
    expect((await request(gmB).delete('/api/setting-packs/ostmark')).status).toBe(200);
    expect((await request(gmB).get('/api/entities')).body).toEqual([]);
  });

  it('is removed from the computer only once no library has it', async () => {
    const a = tempContext();
    const gmA = createApp(a);
    await request(gmA).post('/api/entities').send({ name: 'Brennhold', type: 'settlement', realm: 'world', body: '' });
    const file = (await request(gmA).get('/api/worldbooks/share').query({ name: 'The Isle' }).buffer(true).parse(binary)).body as Buffer;
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'The Isle.worldbook');
    // A library that has it: refused, naming the library.
    const started = (await request(gmB).post('/api/libraries/from-worldbook/the-isle').send({})).body;
    const refused = await request(gmB).delete('/api/worldbooks/the-isle');
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain(`is in a library: ${started.library.name}`);
    // Removed from that library, it can go; the library keeps nothing of it and nothing else changes.
    await request(gmB).delete('/api/setting-packs/the-isle').expect(200);
    const gone = await request(gmB).delete('/api/worldbooks/the-isle');
    expect(gone.status).toBe(200);
    expect(gone.body.packs.map((p: { id: string }) => p.id)).not.toContain('the-isle');
    expect((await request(gmB).post('/api/setting-packs/the-isle/install')).status).toBe(404);
    // The app's own worldbooks can't be removed from the computer.
    expect((await request(gmB).delete('/api/worldbooks/worldkeeper')).body.error).toMatch(/comes with the app/);
    expect((await request(gmB).delete('/api/worldbooks/nothing-here')).status).toBe(400);
  });

  it('refuses a file that is not a worldbook, or one that reaches outside its folder', () => {
    const pack = JSON.stringify({ id: 'isle', name: 'The Isle', version: '1', realms: [], types: [], roles: {}, modules: [] });
    expect(() => readWorldbook(Buffer.from('not a zip'))).toThrow(/isn’t a ZIP/);
    expect(() => readWorldbook(zipOf({ 'lore/a.md': 'x' }))).toThrow(/no pack.json/);
    expect(() => readWorldbook(zipOf({ 'pack.json': pack, 'lore/../../evil.md': 'x' }))).toThrow(/That worldbook has a file/);
    expect(() => readWorldbook(zipOf({ 'pack.json': pack, 'server/index.js': 'x' }))).toThrow(/doesn't hold/);
    expect(() => readWorldbook(zipOf({ 'pack.json': pack, 'lore/run.sh': 'x' }))).toThrow(/kind of file/);
    expect(() => readWorldbook(zipOf({ 'pack.json': pack.replace('"isle"', '"worldkeeper"') }))).toThrow(/comes with the app/);
    expect(() => readWorldbook(zipOf({ 'pack.json': pack.replace('"isle"', '"../x"') }))).toThrow(/id/);
    // Zipped with its folder is fine; patterns the app would run are dropped.
    const ok = readWorldbook(zipOf({ 'The Isle/pack.json': pack.replace('"modules":[]', '"modules":[],"cleaning":{"citation":{"pattern":"(a+)+$"}}'), 'The Isle/lore/a.md': 'x' }));
    expect(ok.files.map((f) => f.path).sort()).toEqual(['lore/a.md', 'pack.json']);
    expect(ok.manifest.cleaning).toBeUndefined();
  });

  it('leaves out GM-only sections, keeping the rest', () => {
    expect(leaveOutGmOnly('Intro.\n\n## Seen\n\nYes.\n\n## Secret (GM only)\n\nNo.\n\n### Deeper (DM-only)\n\nNo.\n\n## Also seen\n\nYes.')).toBe('Intro.\n\n## Seen\n\nYes.\n\n## Also seen\n\nYes.');
  });
});
