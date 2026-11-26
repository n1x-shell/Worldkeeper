import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import { ZodError } from 'zod';
import type { AppContext } from './context.js';
import { HttpError } from './lib/errors.js';
import { NewerLibraryError, UpgradeError } from './db/migrations.js';
import { VersionConflictError } from './repo/entities.js';
import { worldRoutes } from './routes/world.js';
import { campaignRoutes } from './routes/campaign.js';
import { moduleForRoute } from '../../shared/modules.js';
import { requireModule } from './repo/modules.js';
import { librariesRoutes } from './routes/libraries.js';
import { tableRoutes } from './routes/table.js';
import { libraryRoutes } from './routes/library.js';
import { atlasRoutes, uploadsHandler } from './routes/atlas.js';
import { isCharacterPortrait } from './repo/portraits.js';
import { isPlayerRecordPicture } from './repo/entityImages.js';
import { playerRoutes } from './routes/player.js';
import { publishRoutes } from './routes/publish.js';

/**
 * Build the HTTP application.
 * mode 'dm'     → full DM API + player API.
 * mode 'player' → ONLY the player API (and the static client). DM routes do not exist in this process.
 */
export function createApp(ctx: AppContext, opts: { staticDir?: string; /** Stands in front of everything (the network listener's sign-in, server/src/remote.ts). */ gate?: express.RequestHandler } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Before anything is read: without a session, the network listener takes in no more than a password.
  if (opts.gate) app.use(opts.gate);
  app.use(express.json({ limit: '25mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: ctx.mode }));

  const player = playerRoutes(ctx);
  // Player-visible map images and given handouts only.
  player.get('/uploads/:file', (req, res, next) => {
    const f = String(req.params.file);
    const ok =
      ctx.db.prepare(`SELECT 1 FROM maps WHERE image_file = ? AND (player_visible = 1 OR id IN (SELECT ref_id FROM campaign_map_reveals WHERE kind = 'map'))`).get(f) ||
      // Handout pictures, once given to the players.
      ctx.db.prepare('SELECT 1 FROM handouts WHERE image_file = ? AND pushed_at IS NOT NULL').get(f) ||
      // Character portraits (their file names are random, and only given out with the character).
      isCharacterPortrait(ctx.db, f) ||
      // A record's pictures the GM marked for players.
      isPlayerRecordPicture(ctx.db, f);
    if (!ok) return next(new HttpError(404, 'File not found'));
    return uploadsHandler(ctx)(req, res, next);
  });
  app.use('/api/player', player);

  if (ctx.mode === 'dm') {
    // A module's routes answer only while it's on (for the campaign asked about, else the active one).
    app.use('/api', (req, _res, next) => {
      const m = moduleForRoute(req.path);
      if (!m) return next();
      const raw = req.query.campaign_id ?? req.query.campaign ?? (req.body as { campaign_id?: unknown } | undefined)?.campaign_id;
      const cid = raw !== undefined && raw !== null && raw !== '' ? Number(raw) : undefined;
      try {
        requireModule(ctx.db, m.key, Number.isFinite(cid) ? cid : undefined);
        next();
      } catch (e) {
        next(e);
      }
    });
    app.use('/api', worldRoutes(ctx));
    app.use('/api', campaignRoutes(ctx));
    app.use('/api', libraryRoutes(ctx));
    app.use('/api', librariesRoutes(ctx));
    app.use('/api', tableRoutes(ctx));
    app.use('/api', atlasRoutes(ctx));
    app.use('/api', publishRoutes(ctx));
    app.get('/api/uploads/:file', uploadsHandler(ctx));
  }
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    // Strict CSP for the built client: no inline or remote scripts, so lore text can never execute code.
    app.use((_req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      next();
    });
    app.use(express.static(opts.staticDir, { index: false }));
    // Sent by its name inside the folder, not by its full path: a file whose path has a hidden folder in it is refused
    // otherwise, and the app's own folder often is under one (an AppImage runs from /tmp/.mount_…).
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile('index.html', { root: opts.staticDir! }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof VersionConflictError) return res.status(409).json({ error: err.message, current: err.current });
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid data', details: err.issues });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    // Another library that can't be opened by this version (the GM stays in the one that's open).
    if (err instanceof UpgradeError || err instanceof NewerLibraryError) return res.status(409).json({ error: err.message, upgrade: err.info });
    const e = err as { type?: string; message?: string; code?: string };
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
    console.error(err);
    return res.status(500).json({ error: e?.message ?? 'Unexpected server error' });
  });
  return app;
}
