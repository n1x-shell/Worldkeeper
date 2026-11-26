/**
 * The app's files and a GM's data are often under a hidden folder: an AppImage runs from /tmp/.mount_…, and on Linux
 * the data folder is ~/.local/share/…. Express refuses to send a file whose full path has a hidden folder in it unless
 * it is told where the root is, so each place that sends a file by path is checked here (v0.9.18).
 */
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempDir } from './helpers.js';
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import { createApp } from '../server/src/app.js';

describe('under a hidden folder', () => {
  it('the app’s pages, a picture and a backup are all still sent', async () => {
    const hidden = path.join(tempDir(), '.local', 'share', 'app.worldkeeper.desktop');
    fs.mkdirSync(hidden, { recursive: true });
    const client = path.join(tempDir(), '.mount_Worldk1234', 'usr', 'lib', 'client');
    fs.mkdirSync(path.join(client, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(client, 'index.html'), '<!doctype html><title>The Worldkeeper</title>');
    fs.writeFileSync(path.join(client, 'assets', 'app.js'), 'console.log(1)');
    const ctx = new AppContext(resolvePaths(hidden));
    const gm = createApp(ctx, { staticDir: client });

    // Any address of the app (they all answer with its one page), and its scripts.
    for (const url of ['/', '/campaign', '/settings']) {
      const page = await request(gm).get(url);
      expect(page.status, url).toBe(200);
      expect(page.text).toContain('The Worldkeeper');
    }
    expect((await request(gm).get('/assets/app.js')).status).toBe(200);

    // A picture in the library's uploads.
    const png = Buffer.alloc(34);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-1.png'), png);
    const pic = await request(gm).get('/api/uploads/map-1.png');
    expect(pic.status).toBe(200);
    expect(pic.body).toHaveLength(34);

    // A backup, downloaded.
    const made = (await request(gm).post('/api/backups').send({ reason: 'manual' })).body as { file: string };
    const made2 = made as { file: string; size: number };
    const got = await request(gm)
      .get(`/api/backups/${encodeURIComponent(made.file)}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(got.status).toBe(200);
    expect(got.headers['content-disposition']).toContain(made.file);
    // The backup itself, whole: a ZIP of the right size (it used to be the eleven bytes of {"ok":true}).
    const body = got.body as Buffer;
    expect(body).toHaveLength(made2.size);
    expect(body.subarray(0, 2).toString()).toBe('PK');
    expect(new AdmZip(body).getEntries().map((e) => e.entryName)).toEqual(expect.arrayContaining(['manifest.json', 'worldkeeper.db']));
    // One that isn't there is said so, not answered with an empty success.
    expect((await request(gm).get('/api/backups/worldkeeper-nope.wkbackup.zip')).status).toBe(404);
  });
});
