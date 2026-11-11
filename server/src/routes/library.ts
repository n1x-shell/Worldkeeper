import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { readZip, type SourceFile } from '../import/scan.js';
import { buildPlan, commitPlan, listImportRuns, summarisePlan, type ImportPlan } from '../import/importer.js';
import { backupPath, createBackup, listBackups, stageRestore } from '../backup/backup.js';
import { exportCampaign, exportFullWorldZip, exportJson, exportMarkdownZip, exportPlayerZip, importCampaign, importJson } from '../backup/exporter.js';
import { badRequest, notFound } from '../lib/errors.js';
import { schemaVersion } from '../db/migrations.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024, files: 1 } });

interface Staged {
  files: SourceFile[];
  plan: ImportPlan;
  created: number;
}

export function debugEnabled(ctx: AppContext): boolean {
  if (process.env.WORLDKEEPER_DEBUG === '1' || process.env.WORLDKEEPER_DEBUG === 'true') return true;
  const row = ctx.db.prepare(`SELECT value FROM settings WHERE key = 'debug'`).get() as { value: string } | undefined;
  return row?.value === 'true';
}

export function libraryRoutes(ctx: AppContext) {
  const r = Router();
  const staging = new Map<string, Staged>();
  const sweep = () => {
    for (const [k, v] of staging) if (Date.now() - v.created > 60 * 60 * 1000) staging.delete(k);
  };

  // ---- Import (preview → explicit confirmation → transactional commit) ----
  r.post(
    '/import/preview',
    upload.single('archive'),
    h((req) => {
      sweep();
      if (!req.file) throw badRequest('Choose a ZIP archive of Markdown files');
      let files: SourceFile[];
      try {
        files = readZip(req.file.buffer);
      } catch (e) {
        throw badRequest(`Could not read archive: ${(e as Error).message}`);
      }
      if (!files.length) throw badRequest('No Markdown (.md) files were found in the archive');
      const plan = buildPlan(ctx.db, files, req.file.originalname.replace(/[^\w. -]/g, '_'));
      const token = randomBytes(12).toString('hex');
      staging.set(token, { files, plan, created: Date.now() });
      return { token, summary: summarisePlan(plan), entities: plan.entities.map((e) => ({ id: e.draft.id, name: e.draft.name, type: e.draft.type, realm: e.draft.realm, action: e.action, note: e.note })), files: plan.files };
    }),
  );
  r.post(
    '/import/commit',
    h((req) => {
      const staged = staging.get(String(req.body?.token ?? ''));
      if (!staged) throw badRequest('Import preview expired. Upload the archive again.');
      const hasData = (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n > 0;
      const backup = hasData ? createBackup(ctx.db, ctx.paths, 'pre-import') : null;
      const result = commitPlan(ctx.db, staged.files, staged.plan, { resolutions: req.body?.resolutions ?? {}, backupFile: backup?.file ?? null });
      staging.delete(String(req.body.token));
      return { result, backup };
    }),
  );
  r.get('/import/runs', h(() => listImportRuns(ctx.db)));

  // ---- Exports ----
  const sendFile = (res: import('express').Response, name: string, type: string, data: Buffer | string) => {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(data);
  };
  const day = () => new Date().toISOString().slice(0, 10);
  r.get('/export/json', h((_req, res) => sendFile(res, `worldkeeper-${day()}.json`, 'application/json', JSON.stringify(exportJson(ctx.db)))));
  r.get('/export/markdown', h((_req, res) => sendFile(res, `worldkeeper-markdown-${day()}.zip`, 'application/zip', exportMarkdownZip(ctx.db))));
  r.get('/export/full', h((_req, res) => sendFile(res, `worldkeeper-world-${day()}.zip`, 'application/zip', exportFullWorldZip(ctx.db, ctx.paths))));
  r.get('/export/player', h((_req, res) => sendFile(res, `worldkeeper-player-${day()}.zip`, 'application/zip', exportPlayerZip(ctx.db))));
  r.get(
    '/export/campaign/:id',
    h((req, res) => sendFile(res, `worldkeeper-campaign-${req.params.id}-${day()}.json`, 'application/json', JSON.stringify(exportCampaign(ctx.db, intParam(req.params.id))))),
  );
  r.post(
    '/import/json',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a JSON export');
      const data = JSON.parse(req.file.buffer.toString('utf8'));
      if (data?.app === 'worldkeeper-campaign') return { campaignId: importCampaign(ctx.db, data) };
      importJson(ctx.db, data);
      return { ok: true };
    }),
  );

  // ---- Backups ----
  r.get('/backups', h(() => listBackups(ctx.paths)));
  r.post('/backups', h((req) => createBackup(ctx.db, ctx.paths, String(req.body?.reason ?? 'manual'))));
  r.get(
    '/backups/:file',
    h((req, res) => {
      let full: string;
      try {
        full = backupPath(ctx.paths, String(req.params.file));
      } catch {
        throw notFound('Backup');
      }
      res.download(full);
    }),
  );
  const restore = (buf: Buffer) => {
    const staged = stageRestore(ctx.paths, buf);
    const safety = createBackup(ctx.db, ctx.paths, 'pre-restore');
    ctx.replaceDatabase(staged.dbFile);
    for (const u of staged.uploads) fs.writeFileSync(path.join(ctx.paths.uploadsDir, u.name), u.data);
    return { ok: true, safetyBackup: safety.file, manifest: staged.manifest };
  };
  r.post(
    '/backups/restore-upload',
    upload.single('backup'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a .wkbackup.zip file');
      try {
        return restore(req.file.buffer);
      } catch (e) {
        throw badRequest((e as Error).message);
      }
    }),
  );
  r.post(
    '/backups/:file/restore',
    h((req) => {
      let full: string;
      try {
        full = backupPath(ctx.paths, String(req.params.file));
      } catch {
        throw notFound('Backup');
      }
      return restore(fs.readFileSync(full));
    }),
  );

  // ---- Settings & meta ----
  r.get('/settings', h(() => Object.fromEntries((ctx.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((s) => [s.key, s.value]))));
  r.put(
    '/settings',
    h((req) => {
      const allowed = ['app_name', 'world_date', 'default_realm', 'player_note', 'debug'];
      const body = (req.body ?? {}) as Record<string, unknown>;
      const up = ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(body)) {
        if (!allowed.includes(k)) continue;
        up.run(k, String(v).slice(0, 2000));
      }
      return Object.fromEntries((ctx.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((s) => [s.key, s.value]));
    }),
  );
  r.get(
    '/meta',
    h(() => ({
      mode: ctx.mode,
      schemaVersion: schemaVersion(ctx.db),
      dataDir: ctx.paths.dataDir,
      entities: (ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n,
      appName: (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper',
      /** Technical details (IDs, files, sources, how-it-works notes) are shown only in debug mode. */
      debug: debugEnabled(ctx),
      debugForced: process.env.WORLDKEEPER_DEBUG === '1' || process.env.WORLDKEEPER_DEBUG === 'true',
    })),
  );
  r.get(
    '/history',
    h((req) => {
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      return ctx.db
        .prepare(
          `SELECT r.id, r.entity_id, r.version, r.change_type, r.reason, r.created_at, e.name FROM entity_revisions r LEFT JOIN entities e ON e.id = r.entity_id
           ${req.query.all === '1' ? '' : "WHERE r.change_type != 'import'"} ORDER BY r.id DESC LIMIT ?`,
        )
        .all(limit);
    }),
  );
  return r;
}
