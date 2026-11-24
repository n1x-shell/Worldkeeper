/**
 * Open the table: the GM's server starts the player-only table server itself, on the network, so the desktop app (and
 * `npm start`) can serve players' phones without a second process (docs/DESKTOP.md). It shares the GM's open library:
 * the same database connection and paths, so a library switch or a restore is seen at once. Only the player routes
 * exist on it, as with `npm run start:player`. Closed at every start: the GM opens it when the table sits down.
 */
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import type { AppContext } from './context.js';
import { createApp } from './app.js';
import { HttpError } from './lib/errors.js';

let server: http.Server | null = null;
let openedAt: string | null = null;
let staticDir: string | undefined;

/** Where the client build is, for the table's pages (set once at start). */
export function configureTable(o: { staticDir?: string }) {
  staticDir = o.staticDir;
}

export const tablePort = () => Number(process.env.WORLDKEEPER_TABLE_PORT) || 4320;

/** This computer's network addresses (IPv4, not loopback): where players reach the table. */
export function networkAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

export function tableStatus() {
  const addr = server?.address();
  return {
    open: !!server,
    port: typeof addr === 'object' && addr ? addr.port : tablePort(),
    addresses: networkAddresses(),
    opened_at: openedAt,
  };
}

/**
 * Start listening for players. The table sees the GM's context through a player-mode view of it: `db` and `paths`
 * are read from the GM's context on every request, so it always serves the library that's open.
 */
export function openTable(ctx: AppContext, o: { port?: number; host?: string } = {}): Promise<ReturnType<typeof tableStatus>> {
  if (server) return Promise.resolve(tableStatus());
  const view = Object.create(ctx, { mode: { value: 'player' } }) as AppContext;
  const app = createApp(view, { staticDir });
  const port = o.port ?? tablePort();
  return new Promise((resolve, reject) => {
    const s = http.createServer(app);
    s.once('error', (e: NodeJS.ErrnoException) => {
      reject(new HttpError(409, e.code === 'EADDRINUSE' ? `Port ${port} is already in use: is the table server already running (npm run start:player)?` : `Couldn't open the table: ${e.message}`));
    });
    s.listen(port, o.host ?? '0.0.0.0', () => {
      server = s;
      openedAt = new Date().toISOString();
      console.log(`[worldkeeper] the table is open on port ${tableStatus().port}`);
      resolve(tableStatus());
    });
  });
}

export function closeTable(): Promise<ReturnType<typeof tableStatus>> {
  const s = server;
  if (!s) return Promise.resolve(tableStatus());
  server = null;
  openedAt = null;
  return new Promise((resolve) => {
    s.close(() => resolve(tableStatus()));
    s.closeAllConnections?.();
  });
}
