/**
 * The upgrade promise (1.0.0, docs/BETA_PLAN.md A1): libraries made by older versions of the app itself, kept here as
 * they were left, are opened by this one with everything in them. Each was made by running that version's own server
 * and adding three records; nothing in them was written by today's code.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempDir } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { resolvePaths } from '../server/src/config.js';
import { AppContext } from '../server/src/context.js';
import { LATEST_SCHEMA } from '../server/src/db/migrations.js';
import { listBackups } from '../server/src/backup/backup.js';
import { APP_VERSION } from '../shared/version.js';

const dir = path.resolve(__dirname, 'fixtures/old-libraries');
/** Each version, and the step its libraries were at. v0.5.0 is from before libraries: one database in the data folder. */
const MADE: [string, number][] = [
  ['0.5.0', 26],
  ['0.6.0', 30],
  ['0.9.0', 33],
  ['0.9.14', 37],
];

function unpacked(version: string): string {
  const to = tempDir();
  new AdmZip(path.join(dir, `made-by-${version}.zip`)).extractAllTo(to, true);
  return to;
}

describe('libraries made by older versions', () => {
  it('are all here', () => {
    expect(fs.readdirSync(dir).sort()).toEqual(MADE.map(([v]) => `made-by-${v}.zip`).sort());
  });

  for (const [version, step] of MADE)
    it(`one made by v${version} opens with everything in it, after a copy is made`, async () => {
      expect(step).toBeLessThan(LATEST_SCHEMA());
      const ctx = new AppContext(resolvePaths(unpacked(version)));
      const gm = createApp(ctx);
      const meta = (await request(gm).get('/api/meta')).body;
      expect(meta).toMatchObject({ version: APP_VERSION, schemaVersion: LATEST_SCHEMA() });
      expect(meta.upgrade).toMatchObject({ from: step, to: LATEST_SCHEMA() });

      // What was in it is in it.
      const list = (await request(gm).get('/api/entities')).body as { id: string; name: string }[];
      expect(list.map((e) => e.name).sort()).toEqual(['Captain Ilse', 'Marrow Ford', 'Old Keep']);
      const keep = (await request(gm).get(`/api/entities/${list.find((e) => e.name === 'Old Keep')!.id}`)).body.entity as { id: string; body: string; version: number };
      expect(keep.body).toContain('Made by v');

      // A copy of it as it was is in its backups, at the step it was left at.
      const copies = listBackups(ctx.paths).filter((b) => b.file.includes('pre-update'));
      expect(copies.length).toBeGreaterThanOrEqual(1);
      const manifest = JSON.parse(new AdmZip(path.join(ctx.paths.backupsDir, copies[copies.length - 1].file)).readAsText('manifest.json'));
      expect(manifest.counts.entities).toBe(3);

      // And it is a library like any other: it takes a new record, a change to an old one, and a plan.
      const made = await request(gm).post('/api/entities').send({ name: 'The New Wing', type: 'landmark', realm: 'world' });
      expect(made.status).toBe(200);
      const changed = await request(gm).patch(`/api/entities/${keep.id}`).send({ body: 'Changed by this version.', version: keep.version });
      expect(changed.status).toBe(200);
      expect((await request(gm).get(`/api/entities/${keep.id}/plan`)).status).toBe(200);
      expect((await request(gm).get('/api/library/consistency')).status).toBe(200);
    });
});
