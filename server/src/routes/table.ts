import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h } from './util.js';
import { closeTable, openTable, tableStatus } from '../table.js';

/** Open or close the table (the player-only server on the network) from the GM app. GM only. */
export function tableRoutes(ctx: AppContext) {
  const r = Router();
  r.get(
    '/table',
    h(() => tableStatus()),
  );
  r.post(
    '/table',
    h((req) => (req.body?.open === false ? closeTable() : openTable(ctx))),
  );
  return r;
}
