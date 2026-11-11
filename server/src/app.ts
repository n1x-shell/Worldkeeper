import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import type { AppContext } from './context.js';
import { HttpError } from './lib/errors.js';
import { VersionConflictError } from './repo/entities.js';
import { worldRoutes } from './routes/world.js';
import { campaignRoutes } from './routes/campaign.js';
import { libraryRoutes } from './routes/library.js';
import { atlasRoutes, uploadsHandler } from './routes/atlas.js';
import { playerRoutes } from './routes/player.js';

/**
 * Build the HTTP application.
 * mode 'dm'     → full DM API + player API.
 * mode 'player' → ONLY the player API (and the static client). DM routes do not exist in this process.
 */
export function createApp(ctx: AppContext, opts: { staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: ctx.mode }));

  const player = playerRoutes(ctx);
  // Player-visible map images only.
  player.get('/uploads/:file', (req, res, next) => {
    const ok = ctx.db.prepare('SELECT 1 FROM maps WHERE image_file = ? AND player_visible = 1').get(String(req.params.file));
    if (!ok) return next(new HttpError(404, 'File not found'));
    return uploadsHandler(ctx)(req, res, next);
  });
  app.use('/api/player', player);

  if (ctx.mode === 'dm') {
    app.use('/api', worldRoutes(ctx));
    app.use('/api', campaignRoutes(ctx));
    app.use('/api', libraryRoutes(ctx));
    app.use('/api', atlasRoutes(ctx));
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
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof VersionConflictError) return res.status(409).json({ error: err.message, current: err.current });
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid data', details: err.issues });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    const e = err as { type?: string; message?: string; code?: string };
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
    console.error(err);
    return res.status(500).json({ error: e?.message ?? 'Unexpected server error' });
  });
  return app;
}
