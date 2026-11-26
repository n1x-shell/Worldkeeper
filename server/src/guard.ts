/**
 * Who may speak to the app's servers (v0.9.23, docs/BETA_PLAN.md A7).
 *
 * The GM's server answers only on the GM's own computer and asks for no password: the computer is the lock. But a web
 * browser on that computer will carry requests from any page it has open, and until now the server could not tell its
 * own pages from a stranger's. A page on another site could:
 *
 * - post to the server without asking (browsers allow plain forms and file uploads to any address): open the table to
 *   the network, restore a backup of the attacker's making over the GM's world;
 * - read everything, by pointing a name it controls at 127.0.0.1 after the page has loaded ("DNS rebinding"): to the
 *   browser the app is then that site's own.
 *
 * Two checks close both, on every listener (the GM's, the table's, the GM app on the network):
 *
 * 1. **The address asked for must be one a stranger's name can't be.** A request says which host it was sent to. An IP
 *    address, `localhost`, a bare name on the home network (`gm-laptop`) or one ending in `.local` and its kind is
 *    fine; a name with a dot in it that the public name service could answer for is refused. Someone who puts the app
 *    behind a name of their own lists it in `WORLDKEEPER_ALLOWED_HOSTS`.
 * 2. **A request that changes something must come from the app's own pages.** A browser says where a request comes
 *    from (`Origin`, and `Sec-Fetch-Site`); if that is another site, it is refused. A request that says neither is not
 *    from a browser (a script on the computer, which could read the files anyway) and passes.
 *
 * Pictures and answers are also marked as not for other sites to embed (`Cross-Origin-Resource-Policy`).
 */
import net from 'node:net';
import type { RequestHandler } from 'express';

/** Endings a name can only have on a home or office network: nobody outside can answer for them. */
const LOCAL_ENDINGS = ['.local', '.localhost', '.lan', '.home', '.internal', '.home.arpa', '.localdomain'];

/** The host without its port ("[::1]:4310" → "::1"). */
export function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']') < 0 ? undefined : h.indexOf(']'));
  const colon = h.lastIndexOf(':');
  // One colon: a port. More: an IPv6 address written without brackets.
  return colon > 0 && h.indexOf(':') === colon ? h.slice(0, colon) : h;
}

export function allowedHosts(env = process.env.WORLDKEEPER_ALLOWED_HOSTS): string[] {
  return (env ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Is this an address the app can be asked for by, which a stranger's name can't be? */
export function hostAllowed(host: string | undefined, extra: string[] = allowedHosts()): boolean {
  if (!host) return false;
  const name = hostName(host).replace(/\.$/, '');
  if (!name) return false;
  if (net.isIP(name)) return true;
  if (name === 'localhost' || !name.includes('.')) return true;
  if (LOCAL_ENDINGS.some((e) => name.endsWith(e))) return true;
  return extra.includes(name) || extra.includes(host.trim().toLowerCase());
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Does a request that changes something come from the app's own pages (or from no browser at all)? */
export function fromOwnPages(headers: { host?: string; origin?: string; 'sec-fetch-site'?: string | string[] }): boolean {
  const origin = headers.origin;
  if (origin !== undefined) {
    // "null" is what a browser says for a page with no address of its own (a file, a sandboxed frame): not ours.
    try {
      return new URL(origin).host.toLowerCase() === (headers.host ?? '').trim().toLowerCase();
    } catch {
      return false;
    }
  }
  const site = headers['sec-fetch-site'];
  if (typeof site === 'string') return site === 'same-origin' || site === 'none';
  return true;
}

export function guard(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!hostAllowed(req.headers.host)) {
      return void res
        .status(403)
        .json({ error: `This address (${String(req.headers.host ?? 'none given').slice(0, 80)}) isn't one the app answers to. Open it by its own address, or name this one in WORLDKEEPER_ALLOWED_HOSTS.` });
    }
    if (!SAFE.has(req.method) && !fromOwnPages(req.headers)) {
      return void res.status(403).json({ error: 'That request didn’t come from the app’s own pages.' });
    }
    next();
  };
}
