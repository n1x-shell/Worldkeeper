import { Router } from 'express';
import { canonReview } from '../repo/entities.js';
import { finishSetup, gettingStarted, removeTutorial, setupState, skipSetup, updateGettingStarted } from '../repo/setup.js';
import { consistencyReport } from '../repo/consistency.js';
import { openQuestions } from '../repo/openQuestions.js';
import multer from 'multer';
import { libraryEntry } from '../libraries.js';
import { assessImport } from '../import/largeImport.js';
import { packForFiles } from '../import/importer.js';
import { rebuildAllDerivedRelationships } from '../repo/relationships.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { readZip, type SourceFile } from '../import/scan.js';
import { buildPlan, commitPlan, listImportRuns, summarisePlan, type ImportPlan } from '../import/importer.js';
import { backupPath, createBackup, listBackups, stageRestore } from '../backup/backup.js';
import { chosenBooks, importFivetools, scanFivetools } from '../repo/fivetools.js';
import { deletePack, importPack, listPacks, setPackEnabled, setPackPublished } from '../repo/rulesPacks.js';
import { booksOnly, checkBooksOnly, setBooksOnly } from '../repo/booksOnly.js';
import { exportCampaign, exportFullWorldZip, exportJson, exportMarkdownZip, exportPlayerZip, importCampaignWithReport, importFullWorldZip, importJson } from '../backup/exporter.js';
import { applySidecarRealms, applySidecarState, readSidecar, type Sidecar } from '../backup/sidecar.js';
import { badRequest, notFound } from '../lib/errors.js';
import { schemaVersion } from '../db/migrations.js';
import { listModules, setLibraryModules } from '../repo/modules.js';
import { importOpen5e, open5eDocuments } from '../repo/open5e.js';
import { isDesktop, openInBrowser } from '../lib/desktop.js';
import { handbookReveals } from '../player/handbookReveals.js';
import { findPack, installPack, listPacks as listSettingPacks, requirePack, roles, uninstallPack } from '../packs/registry.js';
import { updatePack } from '../packs/content.js';
import { addWorldbookFile, buildWorldbook } from '../packs/share.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024, files: 1 } });

interface Staged {
  files: SourceFile[];
  plan: ImportPlan;
  created: number;
  /** A Worldkeeper Markdown export's realms, templates, canon and reveals. */
  sidecar?: Sidecar | null;
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
      // A part of a large archive (v0.6.7) names the whole archive's root folder and which part it is.
      const root = typeof req.query.root === 'string' ? req.query.root.slice(0, 300) : undefined;
      const part = /^(\d+)\/(\d+)$/.exec(String(req.query.part ?? ''));
      try {
        files = readZip(req.file.buffer, root === undefined ? {} : { root });
      } catch (e) {
        throw badRequest(`Could not read archive: ${(e as Error).message}`);
      }
      if (!files.length) throw badRequest('No Markdown (.md) files were found in the archive');
      const source = req.file.originalname.replace(/[^\w. -]/g, '_') + (part ? ` (part ${part[1]} of ${part[2]})` : '');
      // A part names the setting the whole archive belongs to (the check found it), so every part reads the same way.
      const pack = typeof req.query.pack === 'string' && req.query.pack ? req.query.pack : undefined;
      if (pack && !findPack(pack)) throw badRequest('Unknown worldbook');
      const plan = buildPlan(ctx.db, files, source, pack ? { packId: pack } : {});
      const token = randomBytes(12).toString('hex');
      staging.set(token, { files, plan, created: Date.now(), sidecar: readSidecar(req.file.buffer) });
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
      // A large archive in parts: one backup, before its first part.
      const laterPart = Number(req.body?.part) > 1;
      const backup = hasData && !laterPart ? createBackup(ctx.db, ctx.paths, 'pre-import') : null;
      // A Worldkeeper Markdown export brings its realms (before the records) and its templates, canon and reveals (after).
      if (staged.sidecar) applySidecarRealms(ctx.db, staged.sidecar);
      const result = commitPlan(ctx.db, staged.files, staged.plan, { resolutions: req.body?.resolutions ?? {}, backupFile: backup?.file ?? null });
      const restored = staged.sidecar ? applySidecarState(ctx.db, staged.sidecar) : null;
      staging.delete(String(req.body.token));
      return { result, backup, ...(restored ? { restored } : {}) };
    }),
  );
  // Large imports: is this archive too big to import in one go here, and if so, how big should each part be?
  r.post(
    '/import/check',
    h((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const n = (k: string) => Math.max(0, Number(b[k]) || 0);
      const a = assessImport({ files: n('files'), textBytes: n('textBytes'), archiveBytes: n('archiveBytes'), largestFile: n('largestFile') });
      if (!a.large || !Array.isArray(b.paths)) return a;
      // In parts: which setting's archive it is (from its file names only), and the files every part needs (its locator).
      const root = typeof b.root === 'string' ? b.root : '';
      const paths = (b.paths as unknown[]).map(String).slice(0, 200000);
      const rel = (p: string) => (root && p.startsWith(root) ? p.slice(root.length) : p);
      const pack = packForFiles(paths.map((p) => ({ path: rel(p), content: '' })));
      const locator = pack?.importProfile?.locator ? new RegExp(pack.importProfile.locator, 'i') : null;
      return { ...a, pack: pack?.id ?? null, everyPart: locator ? paths.filter((p) => locator.test(rel(p))) : [] };
    }),
  );
  // After a large archive's last part: links between records in different parts, worked out again.
  r.post(
    '/import/relink',
    h(() => ({ records: rebuildAllDerivedRelationships(ctx.db) })),
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
      const zipped = req.file.buffer.subarray(0, 2).toString('latin1') === 'PK';
      const data = zipped ? null : JSON.parse(req.file.buffer.toString('utf8'));
      // A full-world ZIP (its JSON, maps and pictures) into an empty library.
      if (req.file.buffer.subarray(0, 2).toString('latin1') === 'PK') return { ok: true, ...importFullWorldZip(ctx.db, ctx.paths, req.file.buffer) };
      if (data?.app === 'worldkeeper-campaign') return importCampaignWithReport(ctx.db, data, ctx.paths.uploadsDir);
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
  // Books only (docs/WORLDBOOKS_PLAN.md §2a): this library sets the open rules aside, keeping them for what the books lack.
  r.get(
    '/rules/books-only',
    h(() => ({ ...booksOnly(ctx.db), check: checkBooksOnly(ctx.db) })),
  );
  r.put(
    '/rules/books-only',
    h((req) => {
      const on = !!req.body?.on;
      // Turning it on keeps the open rules for what the books don't cover, unless told otherwise.
      const keep = Array.isArray(req.body?.keep) ? (req.body.keep as unknown[]).map(String) : checkBooksOnly(ctx.db).gaps;
      return { ...setBooksOnly(ctx.db, on, keep), check: checkBooksOnly(ctx.db) };
    }),
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
  // Share the open library's own world as a .worldbook file (docs/WORLDBOOKS_PLAN.md, W3b).
  r.get(
    '/worldbooks/share',
    h((req, res) => {
      const q = (k: string) => {
        const v = req.query[k];
        return typeof v === 'string' ? v.slice(0, 2000) : undefined;
      };
      const { file, manifest } = buildWorldbook(ctx.db, ctx.paths.uploadsDir, {
        name: q('name') ?? '',
        description: q('description'),
        author: q('author'),
        licence: q('licence'),
        version: q('version'),
        leaveOutGmOnly: q('gmOnly') === 'leave-out',
      });
      const fileName = manifest.name.replace(/[^\w '-]/g, '').trim() || 'world';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.worldbook"`);
      res.send(file);
    }),
  );
  // Add a .worldbook to this computer's worldbooks; then it's added to a library like any other.
  r.post(
    '/worldbooks/add',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a .worldbook file');
      const manifest = addWorldbookFile(req.file.buffer);
      return { worldbook: { id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description, counts: manifest.shared?.counts ?? {} }, packs: listSettingPacks(ctx.db) };
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
      const allowed = ['app_name', 'world_date', 'default_realm', 'player_note', 'debug', 'canon_review', 'table_addresses_only'];
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
      dataDir: ctx.paths.rootDir,
      /** The open library: its own folder (docs/LIBRARIES_PLAN.md §3.1). */
      library: { id: ctx.paths.libraryId, name: libraryEntry(ctx.paths.rootDir, ctx.paths.libraryId).name, dir: ctx.paths.dataDir },
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
