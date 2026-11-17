import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { activeCampaignId, playerCampaign, playerCampaigns, playerEntities, playerEntity, playerMaps, playerSearch } from '../player/projection.js';
import { playerFactionWeb } from '../repo/factionWeb.js';
import { notFound } from '../lib/errors.js';
import { playerLive } from '../repo/handouts.js';
import { characterIdByCode, playerCharacterPage, updatePlayerCharacterPage } from '../repo/characterPages.js';
import { characterLog, logged } from '../repo/characterLog.js';
import { rulesView } from '../repo/rulesPacks.js';
import { itemByName } from '../repo/bookData.js';
import { removePortrait, savePortrait } from '../repo/portraits.js';

/**
 * Player API. Every response is built by player/projection.ts. These routes are the ONLY routes
 * mounted when the server runs in player mode (WORLDKEEPER_MODE=player).
 */
export function playerRoutes(ctx: AppContext) {
  const r = Router();
  r.get(
    '/info',
    h(() => ({ mode: ctx.mode, appName: (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper' })),
  );
  r.get(
    '/entities',
    h(() => playerEntities(ctx.db).map(({ id, name, type, typeLabel, realm, realmLabel, realms, bloom, summary }) => ({ id, name, type, typeLabel, realm, realmLabel, realms, bloom, summary }))),
  );
  r.get(
    '/entities/:id',
    h((req) => {
      const e = playerEntity(ctx.db, String(req.params.id));
      if (!e) throw notFound('Entry');
      return e;
    }),
  );
  r.get(
    '/search',
    h((req) => playerSearch(ctx.db, String(req.query.q ?? '')).map(({ id, name, typeLabel, realmLabel, summary }) => ({ id, name, typeLabel, realmLabel, summary }))),
  );
  r.get(
    '/maps',
    h(() => playerMaps(ctx.db)),
  );
  r.get(
    '/campaigns',
    h(() => playerCampaigns(ctx.db)),
  );
  // The faction web as the party knows it.
  r.get(
    '/faction-web',
    h(() => playerFactionWeb(ctx.db, activeCampaignId(ctx.db))),
  );
  // During a live session: the turn order of the running fight, and the newest handout.
  r.get(
    '/live',
    h(() => playerLive(ctx.db)),
  );
  // The rules for character sheets: the SRD (unless the GM turned it off) and the GM's imported rules packs. Only on
  // the GM's own servers: never in the published handbook.
  r.get(
    '/rules',
    h(() => rulesView(ctx.db)),
  );
  // Items' rules from the GM's books, by the names on a sheet or in the party's treasure (one per line). Names only:
  // a player can look up what they carry, not browse the books.
  r.get(
    '/items',
    h((req) => {
      const names = String(req.query.names ?? '')
        .split('\n')
        .map((n) => n.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 80);
      return Object.fromEntries(names.map((n) => [n, itemByName(ctx.db, n)]));
    }),
  );
  // A character's own page, reached by its private code. The only thing a player can change: their own memories,
  // true name and notes (never Thinning, never another character's page).
  r.get(
    '/me/:code',
    h((req) => playerCharacterPage(ctx.db, String(req.params.code))),
  );
  r.patch(
    '/me/:code',
    h((req) => {
      const id = characterIdByCode(ctx.db, String(req.params.code));
      return logged(ctx.db, id, 'player', () => updatePlayerCharacterPage(ctx.db, String(req.params.code), req.body));
    }),
  );
  // The character's change log (without the GM's own notes), and their portrait.
  r.get(
    '/me/:code/log',
    h((req) => characterLog(ctx.db, characterIdByCode(ctx.db, String(req.params.code)), true)),
  );
  r.post(
    '/me/:code/portrait',
    h((req) => {
      const id = characterIdByCode(ctx.db, String(req.params.code));
      logged(ctx.db, id, 'player', () => savePortrait(ctx.db, ctx.paths.uploadsDir, id, req.body?.image));
      return playerCharacterPage(ctx.db, String(req.params.code));
    }),
  );
  r.delete(
    '/me/:code/portrait',
    h((req) => {
      const id = characterIdByCode(ctx.db, String(req.params.code));
      logged(ctx.db, id, 'player', () => removePortrait(ctx.db, ctx.paths.uploadsDir, id));
      return playerCharacterPage(ctx.db, String(req.params.code));
    }),
  );
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
