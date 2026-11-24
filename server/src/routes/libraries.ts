import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import type { AppContext } from '../context.js';
import { h } from './util.js';
import { badRequest, notFound } from '../lib/errors.js';
import { findPack, installPack } from '../packs/registry.js';
import { updatePack } from '../packs/content.js';
import { adoptWorldbookRealms } from '../packs/share.js';
import { createLibrary, discardNewLibrary, libraryDir, libraryEntry, readIndex, recordCount, renameLibrary, setArchived } from '../libraries.js';
import { importFullWorldZip } from '../backup/exporter.js';
import { exportInstallation, importInstallation } from '../backup/installation.js';
import { isDesktop, openFolder } from '../lib/desktop.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024, files: 1 } });

/**
 * The libraries in this data folder (docs/LIBRARIES_PLAN.md §3.2): list, make, open, rename, duplicate, archive and
 * restore, open one from a file, and show one's folder. GM only.
 */
export function librariesRoutes(ctx: AppContext) {
  const r = Router();
  const root = () => ctx.paths.rootDir;
  const list = (all = false) => {
    const idx = readIndex(root())!;
    return {
      open: ctx.paths.libraryId,
      libraries: idx.libraries
        .filter((l) => all || !l.archived)
        .map((l) => ({ ...l, archived: !!l.archived, dir: libraryDir(root(), l), records: l.id === ctx.paths.libraryId ? openCount() : recordCount(root(), l) })),
    };
  };
  const openCount = () => (ctx.db.prepare('SELECT COUNT(*) AS n FROM entities WHERE archived = 0').get() as { n: number }).n;
  const name = (v: unknown) => {
    const n = String(v ?? '').trim();
    if (!n) throw badRequest('A library needs a name');
    return n;
  };

  r.get(
    '/libraries',
    h((req) => list(req.query.all === '1')),
  );
  // A new, empty library; `open` opens it at once (it then starts with "Start your world").
  r.post(
    '/libraries',
    h((req) => {
      const e = createLibrary(root(), name(req.body?.name));
      if (req.body?.open) ctx.openLibrary(e.id);
      return { library: e, ...list() };
    }),
  );
  r.post(
    '/libraries/:id/open',
    h((req) => {
      ctx.openLibrary(String(req.params.id));
      return list();
    }),
  );
  r.patch(
    '/libraries/:id',
    h((req) => {
      renameLibrary(root(), String(req.params.id), String(req.body?.name ?? ''));
      return list(true);
    }),
  );
  // A copy to try something risky in: its database and pictures (not its backups), as a new library.
  r.post(
    '/libraries/:id/duplicate',
    h((req) => {
      const src = libraryEntry(root(), String(req.params.id));
      if (src.archived) throw badRequest('Restore that library before copying it');
      const e = createLibrary(root(), String(req.body?.name ?? '').trim() || `${src.name} (copy)`);
      const from = libraryDir(root(), src);
      const to = libraryDir(root(), e);
      try {
        const target = path.join(to, 'worldkeeper.db');
        if (src.id === ctx.paths.libraryId) ctx.db.prepare('VACUUM main INTO ?').run(target);
        else if (fs.existsSync(path.join(from, 'worldkeeper.db'))) {
          const db = new Database(path.join(from, 'worldkeeper.db'), { readonly: true, fileMustExist: true });
          try {
            db.prepare('VACUUM INTO ?').run(target);
          } finally {
            db.close();
          }
        }
        if (fs.existsSync(path.join(from, 'uploads'))) fs.cpSync(path.join(from, 'uploads'), path.join(to, 'uploads'), { recursive: true });
      } catch (err) {
        discardNewLibrary(root(), e.id);
        throw err;
      }
      return { library: e, ...list() };
    }),
  );
  // Archive: hidden from the list, its files kept; restore brings it back.
  r.post(
    '/libraries/:id/archive',
    h((req) => {
      setArchived(root(), String(req.params.id), req.body?.archived !== false);
      return list(true);
    }),
  );
  // Open a library from a file: a full-world ZIP (from Add and Share) becomes a new library, opened.
  r.post(
    '/libraries/import',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a full-world ZIP');
      if (req.file.buffer.subarray(0, 2).toString('latin1') !== 'PK') throw badRequest('Not a ZIP file: choose a full-world ZIP from Add and Share');
      const fallback = (req.file.originalname || 'Imported library').replace(/\.zip$/i, '').replace(/[-_]+/g, ' ');
      const e = createLibrary(root(), String(req.body?.name ?? req.query.name ?? '').trim() || fallback);
      const before = ctx.paths.libraryId;
      ctx.openLibrary(e.id);
      try {
        const result = importFullWorldZip(ctx.db, ctx.paths, req.file.buffer);
        return { library: e, result, ...list() };
      } catch (err) {
        ctx.openLibrary(before);
        discardNewLibrary(root(), e.id);
        throw err;
      }
    }),
  );
  // Start a library with a worldbook (docs/WORLDBOOKS_PLAN.md: adding a shared worldbook starts a new library by default).
  r.post(
    '/libraries/from-worldbook/:id',
    h((req) => {
      const found = findPack(String(req.params.id));
      if (!found) throw notFound('Worldbook');
      const e = createLibrary(root(), String(req.body?.name ?? '').trim().slice(0, 120) || found.manifest.name);
      const before = ctx.paths.libraryId;
      ctx.openLibrary(e.id);
      try {
        installPack(ctx.db, found.manifest.id);
        adoptWorldbookRealms(ctx.db, found.manifest);
        const result = updatePack(ctx.db, found.manifest.id, ctx.paths.uploadsDir);
        return { library: e, result, ...list() };
      } catch (err) {
        ctx.openLibrary(before);
        discardNewLibrary(root(), e.id);
        throw err;
      }
    }),
  );
  // Back up everything: every library and what they share, in one file (not the publishing token).
  r.get(
    '/libraries/everything',
    h((_req, res) => {
      const day = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="worldkeeper-everything-${day}.zip"`);
      res.send(exportInstallation(ctx));
    }),
  );
  // Open everything from such a file: its libraries are added as new ones; books' rules and packs merged.
  r.post(
    '/libraries/everything',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Choose a "back up everything" file');
      const result = importInstallation(ctx, req.file.buffer);
      return { result, ...list(true) };
    }),
  );
  // In the desktop app: show the library's folder in the file manager.
  r.post(
    '/libraries/:id/show',
    h((req) => {
      if (!isDesktop()) throw badRequest('Only the desktop app opens folders');
      return openFolder(libraryDir(root(), libraryEntry(root(), String(req.params.id))));
    }),
  );
  return r;
}
