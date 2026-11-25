import { Router, type Request } from 'express';
import type { AppContext } from '../context.js';
import { h, intParam } from './util.js';
import { activeCampaignId, playerCampaign, playerCampaigns, playerEntities, playerEntity, playerMaps, playerRealms, playerSearch, playerTypes } from '../player/projection.js';
import { playerFactionWeb } from '../repo/factionWeb.js';
import { HttpError, notFound } from '../lib/errors.js';
import { playerLive } from '../repo/handouts.js';
import { characterIdByCode, playerCharacterPage, updatePlayerCharacterPage } from '../repo/characterPages.js';
import { characterLog, logged } from '../repo/characterLog.js';
import { rulesView } from '../repo/rulesPacks.js';
import { itemByName } from '../repo/bookData.js';
import { modulesOn } from '../repo/modules.js';
import { removePortrait, savePortrait } from '../repo/portraits.js';
import { campaignByHandbookCode } from '../repo/handbookCodes.js';
import { streamChanges } from '../live/feed.js';
import { makeRoll } from '../repo/tableRolls.js';

const appName = (ctx: AppContext) => (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper';
/** Whether the table answers only campaign addresses (Settings, per library). */
export const addressesOnly = (ctx: AppContext) => (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'table_addresses_only'`).get() as { value: string } | undefined)?.value === 'on';

/** The campaign a request's handbook address names (set for /c/:code only). */
const codedCampaign = new WeakMap<Request, number>();

/**
 * Player API. Every response is built by player/projection.ts. These routes are the ONLY routes
 * mounted when the server runs in player mode (WORLDKEEPER_MODE=player).
 */
export function playerRoutes(ctx: AppContext) {
  const r = Router();
  // Each campaign's own handbook address (docs/LIBRARIES_PLAN.md §2.3): everything as that campaign knows it, and
  // nothing of any other campaign. An unknown code, or an archived campaign's, is not found.
  const coded = Router({ mergeParams: true });
  coded.use((req, _res, next) => {
    const id = campaignByHandbookCode(ctx.db, String((req.params as { handbook?: string }).handbook ?? ''));
    if (id == null) return next(notFound('Handbook'));
    codedCampaign.set(req, id);
    next();
  });
  mountPlayerRoutes(ctx, coded, (req) => codedCampaign.get(req)!, true);
  r.use('/c/:handbook', coded);
  // "Something changed": pages look again at once instead of asking every few seconds. It carries nothing else, so
  // it is the same at every address.
  r.get('/events', streamChanges(ctx));
  // Campaign addresses only (a setting): the table answers the plain address only with what a player needs to find
  // their own campaign's address: the app's name, their character's page (which names it), and pictures. The GM's own
  // preview (/player in the GM app) is never limited.
  r.use((req, res, next) => {
    if (ctx.mode !== 'player' || !addressesOnly(ctx)) return next();
    if (req.method === 'GET' && req.path === '/info') {
      res.json({ mode: ctx.mode, appName: appName(ctx), addressesOnly: true, modules: [], realms: [], types: [] });
      return;
    }
    if (req.path.startsWith('/me/') || req.path.startsWith('/uploads/')) return next();
    next(new HttpError(403, "This table opens each campaign at its own address: ask your GM for your campaign's code."));
  });
  // The plain address: the active campaign, as before campaigns had addresses of their own.
  mountPlayerRoutes(ctx, r, () => activeCampaignId(ctx.db), false);
  return r;
}

/**
 * The player routes, for one way of choosing the campaign: `campaignOf` gives the campaign whose knowledge the
 * request sees (what's revealed to everyone, and to that campaign). `only` keeps it to that campaign: its own
 * address lists no other campaign and opens no other campaign's character pages.
 */
function mountPlayerRoutes(ctx: AppContext, r: Router, campaignOf: (req: Request) => number | null, only: boolean) {
  const scope = (req: Request) => campaignOf(req);
  /** A character's page by its private code; on a campaign's own address, only that campaign's characters. */
  const characterOf = (req: Request) => {
    const id = characterIdByCode(ctx.db, String(req.params.code));
    if (only && (ctx.db.prepare('SELECT campaign_id FROM characters WHERE id = ?').get(id) as { campaign_id: number } | undefined)?.campaign_id !== campaignOf(req)) throw notFound('Character page');
    return id;
  };
  r.get(
    '/info',
    h((req) => {
      const cid = campaignOf(req);
      return {
        mode: ctx.mode,
        appName: (ctx.db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper',
        // The modules on for the table's campaign (Thinning, the Return's omens, fading, renown...).
        modules: [...(only ? modulesOn(ctx.db, cid) : modulesOn(ctx.db))],
        realms: playerRealms(ctx.db, scope(req)),
        types: playerTypes(ctx.db, scope(req)),
        // On a campaign's own address: which campaign this handbook is.
        ...(only && cid != null ? { campaign: { id: cid, title: (ctx.db.prepare('SELECT title FROM campaigns WHERE id = ?').get(cid) as { title: string }).title } } : {}),
      };
    }),
  );
  r.get(
    '/entities',
    h((req) =>
      playerEntities(ctx.db, scope(req)).map(({ id, name, type, typeLabel, realm, realmLabel, realms, bloom, summary }) => ({ id, name, type, typeLabel, realm, realmLabel, realms, bloom, summary })),
    ),
  );
  r.get(
    '/entities/:id',
    h((req) => {
      const e = playerEntity(ctx.db, String(req.params.id), scope(req));
      if (!e) throw notFound('Entry');
      return e;
    }),
  );
  r.get(
    '/search',
    h((req) => playerSearch(ctx.db, String(req.query.q ?? ''), scope(req)).map(({ id, name, typeLabel, realmLabel, summary }) => ({ id, name, typeLabel, realmLabel, summary }))),
  );
  r.get(
    '/maps',
    h((req) => playerMaps(ctx.db, scope(req))),
  );
  r.get(
    '/campaigns',
    h((req) => {
      if (!only) return playerCampaigns(ctx.db);
      const c = playerCampaign(ctx.db, campaignOf(req)!);
      return c ? [c] : [];
    }),
  );
  // The faction web as the party knows it.
  r.get(
    '/faction-web',
    h((req) => playerFactionWeb(ctx.db, campaignOf(req))),
  );
  // During a live session: the turn order of the running fight, and the newest handout.
  r.get(
    '/live',
    h((req) => (only ? playerLive(ctx.db, campaignOf(req)) : playerLive(ctx.db))),
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
    h((req) => {
      characterOf(req);
      return playerCharacterPage(ctx.db, String(req.params.code));
    }),
  );
  r.patch(
    '/me/:code',
    h((req) => {
      const id = characterOf(req);
      return logged(ctx.db, id, 'player', () => updatePlayerCharacterPage(ctx.db, String(req.params.code), req.body));
    }),
  );
  // A roll from the character's sheet: the server rolls it, and the whole table sees the result.
  r.post(
    '/me/:code/roll',
    h((req) => {
      const id = characterOf(req);
      const campaign = (ctx.db.prepare('SELECT campaign_id FROM characters WHERE id = ?').get(id) as { campaign_id: number }).campaign_id;
      return makeRoll(ctx.db, campaign, { ...(req.body as object), hidden: false }, { characterId: id });
    }),
  );
  // The character's change log (without the GM's own notes), and their portrait.
  r.get(
    '/me/:code/log',
    h((req) => characterLog(ctx.db, characterOf(req), true)),
  );
  r.post(
    '/me/:code/portrait',
    h((req) => {
      const id = characterOf(req);
      logged(ctx.db, id, 'player', () => savePortrait(ctx.db, ctx.paths.uploadsDir, id, req.body?.image));
      return playerCharacterPage(ctx.db, String(req.params.code));
    }),
  );
  r.delete(
    '/me/:code/portrait',
    h((req) => {
      const id = characterOf(req);
      logged(ctx.db, id, 'player', () => removePortrait(ctx.db, ctx.paths.uploadsDir, id));
      return playerCharacterPage(ctx.db, String(req.params.code));
    }),
  );
  r.get(
    '/campaigns/:id',
    h((req) => {
      const id = intParam(req.params.id);
      if (only && id !== campaignOf(req)) throw notFound('Campaign');
      const c = playerCampaign(ctx.db, id);
      if (!c) throw notFound('Campaign');
      return c;
    }),
  );
}
