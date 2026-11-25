/**
 * The GM app from another device (v0.9.14, docs/BETA_PLAN.md B8): a tablet at the table, a laptop in another room.
 * The GM's own listener answers only on the computer it runs on and needs no password. This is a second listener, on
 * the network, serving the same GM app behind a password the GM sets:
 *
 * - closed at every start, like the table: the GM opens it when wanted;
 * - nothing of the library is answered without a signed-in session (a random token in an HttpOnly cookie, kept in
 *   memory only, so closing it or restarting signs everyone out);
 * - wrong passwords are slowed down, then locked out for a growing while;
 * - the password, opening and closing are changed only on the computer itself.
 *
 * It is plain HTTP: meant for the GM's own network, not for public Wi-Fi or the internet.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import express, { type Request, type RequestHandler } from 'express';
import type { AppContext } from './context.js';
import type { Paths } from './config.js';
import { createApp } from './app.js';
import { HttpError, badRequest } from './lib/errors.js';
import { getSecret, setSecret } from './publish/secrets.js';
import { networkAddresses } from './table.js';

const SECRET = 'gm_remote_password';
const COOKIE = 'wk_gm';
const SESSION_MS = 12 * 3600 * 1000;
export const MIN_PASSWORD = 8;

let server: http.Server | null = null;
let openedAt: string | null = null;
let staticDir: string | undefined;
/** Signed-in sessions: the hash of each cookie's token, and when it runs out. */
const sessions = new Map<string, number>();
let failures = 0;
let lockedUntil = 0;

export function configureRemote(o: { staticDir?: string }) {
  staticDir = o.staticDir;
}
export const remotePort = () => Number(process.env.WORLDKEEPER_REMOTE_PORT) || 4330;

// ---- The password ----------------------------------------------------------------------------------------------------

const scrypt = (password: string, salt: Buffer) => crypto.scryptSync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });

export const hasPassword = (paths: Paths) => !!getSecret(paths, SECRET);

/** Set the password (kept only as a salted scrypt hash, outside the library), or take it away with null. Signs everyone out. */
export function setPassword(paths: Paths, password: string | null) {
  if (password === null || password === '') {
    setSecret(paths, SECRET, null);
  } else {
    if (password.length < MIN_PASSWORD) throw badRequest(`Use at least ${MIN_PASSWORD} characters`);
    if (password.length > 200) throw badRequest('That password is too long');
    const salt = crypto.randomBytes(16);
    setSecret(paths, SECRET, `scrypt$${salt.toString('base64')}$${scrypt(password, salt).toString('base64')}`);
  }
  sessions.clear();
  failures = 0;
  lockedUntil = 0;
}

function passwordMatches(paths: Paths, password: string): boolean {
  const [kind, salt, hash] = (getSecret(paths, SECRET) ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = scrypt(password, Buffer.from(salt, 'base64'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ---- Sessions --------------------------------------------------------------------------------------------------------

const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
function cookieToken(req: Request): string | null {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=') || null;
  }
  return null;
}
function signedIn(req: Request): boolean {
  const token = cookieToken(req);
  if (!token) return false;
  const key = digest(token);
  const until = sessions.get(key);
  if (!until) return false;
  if (until < Date.now()) {
    sessions.delete(key);
    return false;
  }
  // Used: it lasts another while.
  sessions.set(key, Date.now() + SESSION_MS);
  return true;
}
const cookie = (token: string, maxAge: number) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

/** Try a password. Returns a session token, or throws: 401 for a wrong one, 429 while locked out. */
export function signIn(paths: Paths, password: unknown): string {
  const now = Date.now();
  if (lockedUntil > now) throw new HttpError(429, `Too many wrong passwords. Try again in ${Math.ceil((lockedUntil - now) / 1000)} seconds.`);
  if (typeof password !== 'string' || !passwordMatches(paths, password)) {
    failures++;
    // Five tries, then 30 seconds, a minute, two… up to a quarter of an hour.
    if (failures >= 5) lockedUntil = now + Math.min(15 * 60_000, 30_000 * 2 ** (failures - 5));
    throw new HttpError(401, 'That isn’t the password');
  }
  failures = 0;
  lockedUntil = 0;
  for (const [k, until] of sessions) if (until < now) sessions.delete(k);
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(digest(token), now + SESSION_MS);
  return token;
}

export function signEveryoneOut() {
  sessions.clear();
}

/**
 * What stands in front of the GM app on the network listener. The app's own pages and scripts hold nothing of the
 * library, so they load for the sign-in page; everything under /api waits for a session.
 */
export function remoteGate(ctx: AppContext): RequestHandler {
  const smallBody: RequestHandler = express.json({ limit: '4kb' });
  return (req, res, next) => {
    // As the router reads it: /API/… is /api/… to Express, so it is here too.
    const p = req.path.toLowerCase().replace(/\/+$/, '');
    if (!(p === '/api' || p.startsWith('/api/')) || p === '/api/health') return next();
    try {
      if (p === '/api/remote/session') return void res.json({ remote: true, signedIn: signedIn(req) });
      if (p === '/api/remote/login' && req.method === 'POST') {
        // The one thing read from someone not signed in: a password, and nothing bigger.
        smallBody(req, res, (err?: unknown) => {
          try {
            if (err) throw badRequest('Give the password');
            const token = signIn(ctx.paths, (req.body as { password?: unknown } | undefined)?.password);
            res.setHeader('Set-Cookie', cookie(token, SESSION_MS / 1000));
            res.json({ remote: true, signedIn: true });
          } catch (e) {
            next(e);
          }
        });
        return;
      }
      if (p === '/api/remote/logout' && req.method === 'POST') {
        const token = cookieToken(req);
        if (token) sessions.delete(digest(token));
        res.setHeader('Set-Cookie', cookie('', 0));
        return void res.json({ remote: true, signedIn: false });
      }
      if (!signedIn(req)) return void res.status(401).json({ error: 'Sign in to the GM app', signIn: true });
      // The password, and opening and closing this door, are for the computer itself.
      if (p === '/api/remote' || p.startsWith('/api/remote/')) return void res.status(403).json({ error: 'Change this on the computer the app runs on' });
      // A change must come from this app's own pages, not from another site open in the same browser.
      const origin = req.headers.origin;
      if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch {
          host = '';
        }
        if (host !== req.headers.host) return void res.status(403).json({ error: 'That request didn’t come from the GM app' });
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

// ---- The listener ----------------------------------------------------------------------------------------------------

export function remoteStatus(ctx: AppContext) {
  const addr = server?.address();
  const now = Date.now();
  return {
    open: !!server,
    port: typeof addr === 'object' && addr ? addr.port : remotePort(),
    addresses: networkAddresses(),
    opened_at: openedAt,
    hasPassword: hasPassword(ctx.paths),
    /** Devices signed in now. */
    sessions: [...sessions.values()].filter((until) => until > now).length,
  };
}

export function openRemote(ctx: AppContext, o: { port?: number; host?: string } = {}): Promise<ReturnType<typeof remoteStatus>> {
  if (server) return Promise.resolve(remoteStatus(ctx));
  if (!hasPassword(ctx.paths)) return Promise.reject(badRequest('Set a password first'));
  const app = createApp(ctx, { staticDir, gate: remoteGate(ctx) });
  const port = o.port ?? remotePort();
  return new Promise((resolve, reject) => {
    const s = http.createServer(app);
    s.once('error', (e: NodeJS.ErrnoException) => {
      reject(new HttpError(409, e.code === 'EADDRINUSE' ? `Port ${port} is already in use on this computer` : `Couldn't open the GM app to the network: ${e.message}`));
    });
    s.listen(port, o.host ?? '0.0.0.0', () => {
      server = s;
      openedAt = new Date().toISOString();
      console.log(`[worldkeeper] the GM app is open to the network on port ${remoteStatus(ctx).port} (password needed)`);
      resolve(remoteStatus(ctx));
    });
  });
}

export function closeRemote(ctx?: AppContext): Promise<ReturnType<typeof remoteStatus> | null> {
  const s = server;
  sessions.clear();
  if (!s) return Promise.resolve(ctx ? remoteStatus(ctx) : null);
  server = null;
  openedAt = null;
  return new Promise((resolve) => {
    s.close(() => resolve(ctx ? remoteStatus(ctx) : null));
    s.closeAllConnections?.();
  });
}
