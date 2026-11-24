import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h } from './util.js';
import { badRequest } from '../lib/errors.js';
import { createLibrary, readIndex, renameLibrary } from '../libraries.js';

/** The libraries in this data folder: list, make, open and rename (docs/LIBRARIES_PLAN.md §3). GM only. */
export function librariesRoutes(ctx: AppContext) {
  const r = Router();
  const list = () => {
    const idx = readIndex(ctx.paths.rootDir)!;
    return { open: ctx.paths.libraryId, libraries: idx.libraries.filter((l) => !l.archived) };
  };
  r.get(
    '/libraries',
    h(() => list()),
  );
  // A new, empty library; `open` opens it at once (it then starts with "Start your world").
  r.post(
    '/libraries',
    h((req) => {
      const name = String(req.body?.name ?? '').trim();
      if (!name) throw badRequest('A library needs a name');
      const e = createLibrary(ctx.paths.rootDir, name);
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
      renameLibrary(ctx.paths.rootDir, String(req.params.id), String(req.body?.name ?? ''));
      return list();
    }),
  );
  return r;
}
