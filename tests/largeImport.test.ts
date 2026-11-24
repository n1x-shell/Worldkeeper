/** Large imports (v0.6.7): check an archive before uploading it, and import it in parts that come out as one import. */
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { assessImport } from '../server/src/import/largeImport.js';
import { buildPart, commonRoot, listZip, measure, planParts, type ZipSource } from '../shared/zipParts.js';
import { listBackups } from '../server/src/backup/backup.js';

const source = (buf: Buffer): ZipSource => ({ size: buf.length, read: async (o, l) => new Uint8Array(buf.subarray(o, o + l)) });
const partBuffer = async (src: ZipSource, files: Parameters<typeof buildPart>[1]) => Buffer.concat((await buildPart(src, files)).map((c) => Buffer.from(c)));

afterEach(() => {
  delete process.env.WORLDKEEPER_IMPORT_BUDGET_MB;
});

describe('large imports', () => {
  it('reads a ZIP’s listing without unpacking it, and builds parts that open with every file intact', async () => {
    const z = new AdmZip();
    const files = fixtureFiles();
    for (const f of files) z.addFile(f.path, Buffer.from(f.content, 'utf8'));
    z.addFile('Lib/maps/world.png', Buffer.alloc(5000, 7));
    z.getEntry('Lib/Manifest.md')!.header.method = 0; // one file stored, not deflated
    const buf = z.toBuffer();
    const entries = await listZip(source(buf));
    expect(entries.map((e) => e.name).sort()).toEqual([...files.map((f) => f.path), 'Lib/maps/world.png'].sort());
    const m = measure(entries, buf.length);
    expect(m.files).toBe(files.length);
    expect(m.textBytes).toBe(files.reduce((n, f) => n + Buffer.byteLength(f.content), 0));
    expect(commonRoot(entries)).toBe('Lib/');

    const parts = planParts(entries, { textBytes: 1200 });
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.flat().filter((e) => e.name.endsWith('.md')).length).toBe(files.length);
    for (const p of parts) {
      const back = new AdmZip(await partBuffer(source(buf), p));
      for (const e of back.getEntries()) expect(e.getData().toString('utf8')).toBe(files.find((f) => f.path === e.entryName)!.content);
      expect(back.getEntries().some((e) => e.entryName.endsWith('.png'))).toBe(false);
    }
  });

  it('says nothing about a normal archive, and offers parts only when the archive is big for this computer', () => {
    // The real archive is about 2.4 MB of text.
    expect(assessImport({ files: 475, textBytes: 2.4 * 1024 * 1024, archiveBytes: 1024 * 1024, largestFile: 200000 }).large).toBe(false);
    process.env.WORLDKEEPER_IMPORT_BUDGET_MB = '40';
    const a = assessImport({ files: 475, textBytes: 10 * 1024 * 1024, archiveBytes: 4 * 1024 * 1024, largestFile: 200000 });
    expect(a).toMatchObject({ large: true, possible: true });
    expect(a.parts).toBeGreaterThanOrEqual(2);
    expect(a.reason).toMatch(/needs more memory/);
    // Past the import's own limits, parts are needed whatever the memory.
    delete process.env.WORLDKEEPER_IMPORT_BUDGET_MB;
    expect(assessImport({ files: 30000, textBytes: 1024, archiveBytes: 1024, largestFile: 10 }).reason).toMatch(/more than 20000 files/);
    expect(assessImport({ files: 1, textBytes: 9 * 1024 * 1024, archiveBytes: 1024, largestFile: 9 * 1024 * 1024 }).possible).toBe(false);
  });

  it('imports an archive in parts and ends with the same library as importing it whole, links across parts included', async () => {
    const buf = zipOf(fixtureFiles());
    // Whole, as a reference.
    const whole = tempContext();
    const wholeApp = createApp(whole);
    const wp = (await request(wholeApp).post('/api/import/preview').attach('archive', buf, 'fixture.zip')).body;
    await request(wholeApp).post('/api/import/commit').send({ token: wp.token, resolutions: {} });

    // In parts, as the browser does it.
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).post('/api/entities').send({ name: 'Already here', type: 'settlement', realm: 'world', body: '' });
    const src = source(buf);
    const entries = await listZip(src);
    const root = commonRoot(entries);
    // As the browser does: check the listing (names and sizes only), then parts.
    process.env.WORLDKEEPER_IMPORT_BUDGET_MB = '0.01';
    const check = (
      await request(gm)
        .post('/api/import/check')
        .send({ ...measure(entries, buf.length), root, paths: entries.map((e) => e.name) })
    ).body;
    delete process.env.WORLDKEEPER_IMPORT_BUDGET_MB;
    expect(check).toMatchObject({ large: true, pack: 'worldkeeper' });
    const parts = planParts(entries, { textBytes: 1500, root, everyPart: check.everyPart });
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const [i, p] of parts.entries()) {
      const q = `root=${encodeURIComponent(root)}&part=${encodeURIComponent(`${i + 1}/${parts.length}`)}&pack=${check.pack}`;
      const prev = (
        await request(gm)
          .post(`/api/import/preview?${q}`)
          .attach('archive', await partBuffer(src, p), 'fixture.zip')
      ).body;
      expect(prev.token).toBeTruthy();
      expect(
        (
          await request(gm)
            .post('/api/import/commit')
            .send({ token: prev.token, resolutions: {}, part: i + 1 })
        ).status,
      ).toBe(200);
    }
    await request(gm).post('/api/import/relink');

    const shape = (db: typeof ctx.db) => db.prepare(`SELECT id, type, realm, name FROM entities WHERE name != 'Already here' ORDER BY id`).all();
    expect(shape(ctx.db)).toEqual(shape(whole.db));
    const links = (db: typeof ctx.db) => db.prepare(`SELECT source_id, target_id, type FROM relationships ORDER BY source_id, target_id, type`).all() as { source_id: string; target_id: string }[];
    expect(links(ctx.db)).toEqual(links(whole.db));
    expect(links(ctx.db).some((l) => l.source_id === 'SET-001' && l.target_id === 'NPC-001')).toBe(true);
    // One backup, before the first part; each part is its own import run.
    expect(listBackups(ctx.paths).filter((b) => b.reason.includes('pre-import'))).toHaveLength(1);
    const runs = (await request(gm).get('/api/import/runs')).body as { source_name: string }[];
    expect(runs.filter((r) => /\(part \d+ of \d+\)/.test(r.source_name))).toHaveLength(parts.length);
    fs.rmSync(ctx.paths.rootDir, { recursive: true, force: true });
  });

  it('checks an archive through the API', async () => {
    process.env.WORLDKEEPER_IMPORT_BUDGET_MB = '10';
    const gm = createApp(tempContext());
    const r = (
      await request(gm)
        .post('/api/import/check')
        .send({ files: 900, textBytes: 6 * 1024 * 1024, archiveBytes: 2 * 1024 * 1024, largestFile: 1000 })
    ).body;
    expect(r).toMatchObject({ large: true, possible: true });
    expect((await request(gm).post('/api/import/check').send({ files: 9, textBytes: 9000, archiveBytes: 4000, largestFile: 1000 })).body.large).toBe(false);
  });
});
