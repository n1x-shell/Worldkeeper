import type { Request, Response, NextFunction, Router } from 'express';
import type { AppContext } from '../context.js';
import type { makeCrud } from '../repo/crud.js';
import { badRequest } from '../lib/errors.js';

export type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

/** Wrap a handler: sync or async results are sent as JSON; thrown errors go to the error middleware. */
export const h =
  (fn: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      next(e);
    }
  };

export const intParam = (v: unknown, name = 'id'): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw badRequest(`Invalid ${name}`);
  return n;
};

export const listParam = (v: unknown): string[] | undefined => {
  if (v == null || v === '') return undefined;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

type Crud = ReturnType<typeof makeCrud>;

/** Standard REST endpoints for a CRUD table. `filters` are query params allowed as equality filters. */
export function mountCrud(router: Router, ctx: AppContext, path: string, crud: Crud, filters: string[] = []) {
  router.get(
    path,
    h((req) => {
      const where: Record<string, string | number | null> = {};
      for (const f of filters) {
        const v = req.query[f];
        if (v === undefined) continue;
        where[f] = v === 'null' ? null : /^-?\d+$/.test(String(v)) ? Number(v) : String(v);
      }
      return crud.list(ctx.db, where);
    }),
  );
  router.get(`${path}/:id`, h((req) => crud.get(ctx.db, intParam(req.params.id))));
  router.post(path, h((req) => crud.create(ctx.db, req.body)));
  router.patch(`${path}/:id`, h((req) => crud.update(ctx.db, intParam(req.params.id), req.body)));
  router.delete(
    `${path}/:id`,
    h((req) => {
      crud.remove(ctx.db, intParam(req.params.id));
      return { ok: true };
    }),
  );
}
