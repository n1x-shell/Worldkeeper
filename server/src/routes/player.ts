import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { playerCampaign, playerCampaigns, playerEntities, playerEntity, playerMaps, playerSearch } from '../player/projection.js';
import { notFound } from '../lib/errors.js';

/**
 * Player API. Every response is built by player/projection.ts. These routes are the ONLY routes
 * mounted when the server runs in player mode (WORLDKEEPER_MODE=player).
 */
export function playerRoutes(ctx: AppContext) {
  const r = Router();
  r.get('/info', h(() => ({ mode: ctx.mode, appName: (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper' })));
  r.get('/entities', h(() => playerEntities(ctx.db).map(({ id, name, type, typeLabel, realm, realmLabel, summary }) => ({ id, name, type, typeLabel, realm, realmLabel, summary }))));
  r.get(
    '/entities/:id',
    h((req) => {
      const e = playerEntity(ctx.db, String(req.params.id));
      if (!e) throw notFound('Entry');
      return e;
    }),
  );
  r.get('/search', h((req) => playerSearch(ctx.db, String(req.query.q ?? '')).map(({ id, name, typeLabel, realmLabel, summary }) => ({ id, name, typeLabel, realmLabel, summary }))));
  r.get('/maps', h(() => playerMaps(ctx.db)));
  r.get('/campaigns', h(() => playerCampaigns(ctx.db)));
  r.get(
    '/campaigns/:id',
    h((req) => {
      const c = playerCampaign(ctx.db, intParam(req.params.id));
      if (!c) throw notFound('Campaign');
      return c;
    }),
  );
  return r;
}
