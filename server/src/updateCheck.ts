/**
 * Is there a newer version? (v0.9.17, docs/BETA_PLAN.md A2.) Until now the app made no network calls at all, so a GM
 * never learned that a fix existed. Once a day it asks GitHub's public list of this project's releases for the newest
 * one. That is the only request it makes, and it carries nothing about the GM, their computer or their world: no
 * identifier, no library name, no counts, only the app's name and version as the client's name (GitHub's API asks for
 * one). It is on unless the GM turns it off in Settings, and nothing is ever downloaded or installed by it: it only
 * says that a newer version exists and where its page is.
 *
 * The answer is kept for the whole installation (`shared/update.json`), not per library.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Paths } from './config.js';
import { APP_VERSION } from '../../shared/version.js';

// The list, not ".../releases/latest": that address leaves out releases marked "pre-release" on GitHub, which every
// release of this project has been so far, and answers "not found".
export const RELEASES_API = 'https://api.github.com/repos/n1x-shell/Worldkeeper/releases?per_page=20';
export const RELEASES_PAGE = 'https://github.com/n1x-shell/Worldkeeper/releases';
const DAY = 24 * 3600 * 1000;

interface Stored {
  enabled: boolean;
  checked_at: string | null;
  /** `installable`: the release carries what the desktop app needs to update itself (its latest.json). */
  latest: { version: string; name: string; url: string; published_at: string | null; installable?: boolean } | null;
  /** Why the last check didn't get an answer, if it didn't. */
  error: string | null;
}

const file = (paths: Paths) => path.join(paths.sharedDir, 'update.json');
function read(paths: Paths): Stored {
  try {
    const s = JSON.parse(fs.readFileSync(file(paths), 'utf8')) as Partial<Stored>;
    return { enabled: s.enabled !== false, checked_at: s.checked_at ?? null, latest: s.latest ?? null, error: s.error ?? null };
  } catch {
    return { enabled: true, checked_at: null, latest: null, error: null };
  }
}
function write(paths: Paths, s: Stored) {
  fs.mkdirSync(paths.sharedDir, { recursive: true });
  const tmp = `${file(paths)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file(paths));
}

/** "v0.10.2" or "0.10.2-beta.1" as numbers to compare; null if it isn't a version. */
export function parseVersion(v: string): { parts: number[]; pre: string } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  return m ? { parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' } : null;
}
/** True when `a` is a later version than `b`. A pre-release comes before the release of the same number. */
export function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i];
  if (x.pre === y.pre) return false;
  if (!x.pre) return true;
  if (!y.pre) return false;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true }) > 0;
}

/**
 * "Update and restart" in the desktop app (v0.9.18): the app's shell does the update and writes what it is doing to
 * `update-status.json` in the data folder; this is that, for the page. An update that has finished (this is the
 * version it was updating to) is cleared; one that stopped half-way is reported as failed.
 */
export interface InstallStatus {
  state: 'checking' | 'downloading' | 'installing' | 'failed';
  tag: string;
  error: string | null;
}
const installFile = (paths: Paths) => path.join(paths.rootDir, 'update-status.json');
export function installStatus(paths: Paths, now = Date.now()): InstallStatus | null {
  let raw: Partial<InstallStatus>;
  let age: number;
  try {
    raw = JSON.parse(fs.readFileSync(installFile(paths), 'utf8')) as Partial<InstallStatus>;
    age = now - fs.statSync(installFile(paths)).mtimeMs;
  } catch {
    return null;
  }
  const tag = typeof raw.tag === 'string' ? raw.tag : '';
  const state = raw.state;
  if (state !== 'checking' && state !== 'downloading' && state !== 'installing' && state !== 'failed') return null;
  if (state !== 'failed' && tag.replace(/^v/, '') === APP_VERSION) {
    // This is the version it was updating to: done.
    clearInstallStatus(paths);
    return null;
  }
  // Left half-way (the app was closed, the computer slept): not still "downloading" an hour later.
  if (state !== 'failed' && age > 30 * 60_000) return { state: 'failed', tag, error: 'The update didn’t finish. Try again, or install the new version from the releases page.' };
  return { state, tag, error: typeof raw.error === 'string' ? raw.error.slice(0, 500) : null };
}
export function clearInstallStatus(paths: Paths) {
  try {
    fs.unlinkSync(installFile(paths));
  } catch {
    /* nothing to clear */
  }
}

export function updateStatus(paths: Paths) {
  const s = read(paths);
  return {
    enabled: s.enabled,
    current: APP_VERSION,
    latest: s.latest,
    newer: !!s.latest && isNewer(s.latest.version, APP_VERSION),
    checked_at: s.checked_at,
    error: s.error,
    releases: RELEASES_PAGE,
    /** This is the desktop app, and it can replace itself (set by the app's shell; never for a copy run from source). */
    canInstall: process.env.WORLDKEEPER_SHELL_UPDATER === '1',
    install: installStatus(paths),
  };
}

export function setUpdateCheck(paths: Paths, enabled: boolean) {
  write(paths, { ...read(paths), enabled });
  return updateStatus(paths);
}

interface Release {
  tag_name: string;
  name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  assets?: unknown;
}
type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Ask now. `force` asks even when switched off or asked within the day (the GM pressed "Check now").
 * Never throws: a computer that is offline simply learns nothing.
 */
export async function checkForUpdate(paths: Paths, o: { force?: boolean; fetch?: Fetch; now?: number } = {}) {
  const s = read(paths);
  const now = o.now ?? Date.now();
  if (!o.force && (!s.enabled || (s.checked_at && now - new Date(s.checked_at).getTime() < DAY))) return updateStatus(paths);
  const ask: Fetch = o.fetch ?? fetch;
  const stamp = new Date(now).toISOString();
  try {
    const res = await ask(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `The-Worldkeeper/${APP_VERSION}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('GitHub’s answer wasn’t a list of releases');
    // The highest version among the published releases (drafts aren't public; the list's order is by date).
    const published = (list as Partial<Release & { draft: unknown }>[]).filter((x): x is Release => !!x && x.draft !== true && typeof x.tag_name === 'string' && !!parseVersion(x.tag_name));
    const r = published.reduce<Release | undefined>((best, x) => (!best || isNewer(x.tag_name, best.tag_name) ? x : best), undefined);
    if (!r) throw new Error('No release has been published yet');
    const tag = r.tag_name;
    // Only ever a page on this project's own releases: an answer naming anywhere else is not followed.
    const url = typeof r.html_url === 'string' && r.html_url.startsWith(`${RELEASES_PAGE}/`) ? r.html_url : RELEASES_PAGE;
    write(paths, {
      ...s,
      checked_at: stamp,
      error: null,
      latest: {
        version: tag.replace(/^v/, ''),
        name: typeof r.name === 'string' ? r.name.slice(0, 200) : '',
        url,
        published_at: typeof r.published_at === 'string' ? r.published_at : null,
        installable: Array.isArray(r.assets) && r.assets.some((a) => (a as { name?: unknown } | null)?.name === 'latest.json'),
      },
    });
  } catch (e) {
    // What was known before is kept; the next try is tomorrow (or "Check now").
    write(paths, { ...s, checked_at: stamp, error: (e as Error).name === 'TimeoutError' ? 'No answer (is this computer online?)' : (e as Error).message });
  }
  return updateStatus(paths);
}

/** Check a little after the start, then once a day while the app runs. */
export function scheduleUpdateChecks(paths: () => Paths | null) {
  const run = () => {
    const p = paths();
    if (p) void checkForUpdate(p);
  };
  setTimeout(run, 20_000).unref();
  setInterval(run, 6 * 3600 * 1000).unref();
}
