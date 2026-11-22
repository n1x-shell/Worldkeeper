import { Router } from 'express';
import { canonReview } from '../repo/entities.js';
import { finishSetup, gettingStarted, removeTutorial, setupState, skipSetup, updateGettingStarted } from '../repo/setup.js';
import { consistencyReport } from '../repo/consistency.js';
import { openQuestions } from '../repo/openQuestions.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { readZip, type SourceFile } from '../import/scan.js';
import { buildPlan, commitPlan, listImportRuns, summarisePlan, type ImportPlan } from '../import/importer.js';
import { backupPath, createBackup, listBackups, stageRestore } from '../backup/backup.js';
import { DEFAULT_ADDITIONS_DIR, loreFiles } from '../additions.js';
import { chosenBooks, importFivetools, scanFivetools } from '../repo/fivetools.js';
import { deletePack, importPack, listPacks, setPackEnabled, setPackPublished } from '../repo/rulesPacks.js';
import { exportCampaign, exportFullWorldZip, exportJson, exportMarkdownZip, exportPlayerZip, importCampaign, importJson } from '../backup/exporter.js';
import { badRequest, notFound } from '../lib/errors.js';
import { schemaVersion } from '../db/migrations.js';
import { listModules, setLibraryModules } from '../repo/modules.js';
import { importOpen5e, open5eDocuments } from '../repo/open5e.js';
import { isDesktop, openInBrowser } from '../lib/desktop.js';
import { handbookReveals } from '../player/handbookReveals.js';
import { installPack, isInstalled, listPacks as listSettingPacks, requirePack, roles, uninstallPack } from '../packs/registry.js';
import { updatePack } from '../packs/content.js';

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
  // The consistency checker: a report of things that don't agree. Changes nothing.
  r.get('/library/consistency', h(() => consistencyReport(ctx.db)));
  // Open questions: every UNDEFINED in the library, and whether it's kept open, filled by an addition or still to do.
  r.get(
    '/library/open-questions',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      return openQuestions(ctx.db);
    }),
  );
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
      return {
        token,
        summary: summarisePlan(plan),
        entities: plan.entities.map((e) => ({ id: e.draft.id, name: e.draft.name, type: e.draft.type, realm: e.draft.realm, action: e.action, note: e.note })),
        files: plan.files,
      };
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
  r.get(
    '/import/runs',
    h(() => listImportRuns(ctx.db)),
  );

  // ---- Exports ----
  const sendFile = (res: import('express').Response, name: string, type: string, data: Buffer | string) => {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(data);
  };
  const day = () => new Date().toISOString().slice(0, 10);
  r.get(
    '/export/json',
    h((_req, res) => sendFile(res, `worldkeeper-${day()}.json`, 'application/json', JSON.stringify(exportJson(ctx.db)))),
  );
  r.get(
    '/export/markdown',
    h((_req, res) => sendFile(res, `worldkeeper-markdown-${day()}.zip`, 'application/zip', exportMarkdownZip(ctx.db))),
  );
  r.get(
    '/export/full',
    h((_req, res) => sendFile(res, `worldkeeper-world-${day()}.zip`, 'application/zip', exportFullWorldZip(ctx.db, ctx.paths))),
  );
  r.get(
    '/export/player',
    h((_req, res) => sendFile(res, `worldkeeper-player-${day()}.zip`, 'application/zip', exportPlayerZip(ctx.db))),
  );
  r.get(
    '/export/campaign/:id',
    h((req, res) => sendFile(res, `worldkeeper-campaign-${req.params.id}-${day()}.json`, 'application/json', JSON.stringify(exportCampaign(ctx.db, intParam(req.params.id), ctx.paths.uploadsDir)))),
  );
  r.post(
    '/import/json',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a JSON export');
      const data = JSON.parse(req.file.buffer.toString('utf8'));
      if (data?.app === 'worldkeeper-campaign') return { campaignId: importCampaign(ctx.db, data, ctx.paths.uploadsDir) };
      importJson(ctx.db, data);
      return { ok: true };
    }),
  );

  // ---- Modules (shared/modules.ts): which are on, for the library and for a campaign ----
  r.get(
    '/modules',
    h((req) => listModules(ctx.db, req.query.campaign_id ? Number(req.query.campaign_id) : undefined)),
  );
  r.put(
    '/modules',
    h((req) => setLibraryModules(ctx.db, req.body)),
  );

  // ---- Rules packs (the GM's own books or homebrew, for the character sheet; never published or exported) ----
  r.get(
    '/rules/packs',
    h(() => listPacks(ctx.db)),
  );
  r.post(
    '/rules/packs',
    upload.single('pack'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a rules pack (.zip)');
      return importPack(ctx.db, req.file.buffer);
    }),
  );
  // The GM's own copy of the 5etools data. First the upload is read and kept for a short while, and the books in it
  // listed; then the GM chooses which books to import. The copy is deleted after the import (or after an hour).
  r.post(
    '/rules/5etools/scan',
    upload.single('data'),
    h((req) => {
      if (!req.file) throw badRequest('Choose your 5etools zip');
      const books = scanFivetools(req.file.buffer);
      const token = randomBytes(12).toString('hex');
      for (const f of fs.readdirSync(ctx.paths.stagingDir))
        if (f.startsWith('5etools-') && Date.now() - fs.statSync(path.join(ctx.paths.stagingDir, f)).mtimeMs > 3600_000) fs.rmSync(path.join(ctx.paths.stagingDir, f), { force: true });
      fs.writeFileSync(path.join(ctx.paths.stagingDir, `5etools-${token}.zip`), req.file.buffer);
      return { token, books, chosen: chosenBooks(ctx.db) };
    }),
  );
  // Open content from Open5e: the sources it offers, with their licences; then import the chosen ones.
  r.get(
    '/rules/open5e/documents',
    h(() => open5eDocuments()),
  );
  r.post(
    '/rules/open5e/import',
    h((req) => {
      const keys = Array.isArray(req.body?.documents) ? (req.body.documents as unknown[]).map(String).filter((k) => /^[\w-]{1,60}$/.test(k)) : [];
      return importOpen5e(ctx.db, keys);
    }),
  );
  r.post(
    '/rules/5etools/import',
    h((req) => {
      const token = String(req.body?.token ?? '');
      if (!/^[a-f0-9]{24}$/.test(token)) throw badRequest('Upload your 5etools zip again.');
      const file = path.join(ctx.paths.stagingDir, `5etools-${token}.zip`);
      if (!fs.existsSync(file)) throw badRequest('That upload has expired: upload your 5etools zip again.');
      const books = Array.isArray(req.body?.books) ? (req.body.books as unknown[]).map(String).filter((b) => /^[\w-]{1,40}$/.test(b)) : [];
      try {
        return importFivetools(ctx.db, fs.readFileSync(file), books);
      } finally {
        fs.rmSync(file, { force: true });
      }
    }),
  );
  r.patch(
    '/rules/packs/:id',
    h((req) =>
      req.body?.publish !== undefined ? setPackPublished(ctx.db, String(req.params.id), !!req.body.publish) : setPackEnabled(ctx.db, String(req.params.id), !!req.body?.enabled),
    ),
  );
  r.delete(
    '/rules/packs/:id',
    h((req) => deletePack(ctx.db, String(req.params.id))),
  );

  // ---- Backups ----
  r.get(
    '/backups',
    h(() => listBackups(ctx.paths)),
  );
  // Setting packs (packs/<id>): the ones the app can install, and this library's. Each change takes a backup first.
  r.get(
    '/setting-packs',
    h(() => ({ packs: listSettingPacks(ctx.db), roles: roles(ctx.db) })),
  );
  r.post(
    '/setting-packs/:id/install',
    h((req) => {
      const id = String(req.params.id);
      const backup = createBackup(ctx.db, ctx.paths, `pre-install-${id}`);
      installPack(ctx.db, id);
      return { backup: backup.file, ...updatePack(ctx.db, id, ctx.paths.uploadsDir) };
    }),
  );
  r.post(
    '/setting-packs/:id/update',
    h((req) => {
      const id = String(req.params.id);
      requirePack(ctx.db, id);
      const backup = createBackup(ctx.db, ctx.paths, `pre-update-${id}`);
      return { backup: backup.file, ...updatePack(ctx.db, id, ctx.paths.uploadsDir) };
    }),
  );
  r.delete(
    '/setting-packs/:id',
    h((req) => {
      const id = String(req.params.id);
      requirePack(ctx.db, id);
      const backup = createBackup(ctx.db, ctx.paths, `pre-uninstall-${id}`);
      return { backup: backup.file, removed: uninstallPack(ctx.db, id) };
    }),
  );
  // The Worldkeeper pack's update, as "Apply additions" (only in a library that has the pack).
  r.get(
    '/additions',
    h(() => ({ available: fs.existsSync(DEFAULT_ADDITIONS_DIR), installed: isInstalled(ctx.db, 'worldkeeper'), records: loreFiles().length })),
  );
  r.post(
    '/additions/apply',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      const backup = createBackup(ctx.db, ctx.paths, 'pre-additions');
      return { backup: backup.file, ...updatePack(ctx.db, 'worldkeeper', ctx.paths.uploadsDir) };
    }),
  );
  r.post(
    '/backups',
    h((req) => createBackup(ctx.db, ctx.paths, String(req.body?.reason ?? 'manual'))),
  );
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

  // ---- The first run (docs/OWN_WORLD_PLAN.md §2.6, §2.7) ----
  r.get(
    '/setup',
    h(() => setupState(ctx.db)),
  );
  r.post(
    '/setup/skip',
    h(() => skipSetup(ctx.db)),
  );
  r.post(
    '/setup/finish',
    h((req) => finishSetup(ctx.db, req.body)),
  );
  r.delete(
    '/setup/tutorial',
    h(() => {
      const backup = createBackup(ctx.db, ctx.paths, 'pre-remove-tutorial');
      return { ...removeTutorial(ctx.db), backup: backup.file };
    }),
  );
  r.get(
    '/getting-started',
    h(() => gettingStarted(ctx.db)),
  );
  r.put(
    '/getting-started',
    h((req) => updateGettingStarted(ctx.db, req.body)),
  );

  // ---- Settings & meta ----
  r.get(
    '/settings',
    h(() => Object.fromEntries((ctx.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((s) => [s.key, s.value]))),
  );
  r.put(
    '/settings',
    h((req) => {
      const allowed = ['app_name', 'world_date', 'default_realm', 'player_note', 'debug', 'canon_review'];
      const body = (req.body ?? {}) as Record<string, unknown>;
      const up = ctx.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(body)) {
        if (!allowed.includes(k)) continue;
        // Canon Review: on, off, or anything else to go back to what the library's origin says.
        if (k === 'canon_review' && v !== 'on' && v !== 'off') {
          ctx.db.prepare(`DELETE FROM settings WHERE key = 'canon_review'`).run();
          continue;
        }
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
      /** New records go through Canon Review (Settings → Canon); otherwise they are Canon at once. */
      canonReview: canonReview(ctx.db),
      /** Running inside the desktop app: links meant for a new tab open in the system browser (see lib/desktop.ts). */
      desktop: isDesktop(),
    })),
  );
  // Match the published Player Handbook: reveal what it shows (preview with GET, apply with POST). Only ever adds.
  r.get(
    '/handbook-reveals',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      return handbookReveals(ctx.db, { mode: 'match', apply: false });
    }),
  );
  r.post(
    '/handbook-reveals',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      createBackup(ctx.db, ctx.paths, 'pre-handbook-match');
      return handbookReveals(ctx.db, { mode: 'match', apply: true });
    }),
  );
  r.post(
    '/desktop/open',
    h((req) => {
      if (!isDesktop()) throw badRequest('Only the desktop app opens links this way');
      return openInBrowser(String(req.body?.url ?? ''));
    }),
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
