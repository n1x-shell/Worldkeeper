/**
 * "What's new" after an update (v0.9.21). The installation remembers which version last ran in it
 * (`shared/app.json`); when a newer one starts, the app says so once, with a way to the list of what changed, until
 * the GM has seen it. A first install says nothing: there is nothing it was updated from.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Paths } from './config.js';
import { APP_VERSION } from '../../shared/version.js';
import { isNewer } from './updateCheck.js';

interface Stored {
  version: string;
  /** The version before this one, if it is known. */
  from: string | null;
  /** The GM hasn't been told yet. */
  pending: boolean;
}
const file = (paths: Paths) => path.join(paths.sharedDir, 'app.json');
function write(paths: Paths, s: Stored) {
  fs.mkdirSync(paths.sharedDir, { recursive: true });
  const tmp = `${file(paths)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file(paths));
}

/**
 * Note that this version runs here, and say whether the GM should be told it is new to them.
 * `hasWorld`: the installation already holds something (asked only when nothing was noted before: versions before
 * 0.9.21 kept no note, so a library with a world in it means an update, and an empty one a first install).
 */
export function updatedNote(paths: Paths, hasWorld: () => boolean): { from: string | null; to: string } | null {
  let s: Stored | null = null;
  try {
    const raw = JSON.parse(fs.readFileSync(file(paths), 'utf8')) as Partial<Stored>;
    if (typeof raw.version === 'string') s = { version: raw.version, from: typeof raw.from === 'string' ? raw.from : null, pending: raw.pending === true };
  } catch {
    s = null;
  }
  if (!s) {
    s = { version: APP_VERSION, from: null, pending: hasWorld() };
    write(paths, s);
  } else if (s.version !== APP_VERSION) {
    // Going back to an older version is not news.
    s = { version: APP_VERSION, from: s.version, pending: isNewer(APP_VERSION, s.version) };
    write(paths, s);
  }
  return s.pending ? { from: s.from, to: APP_VERSION } : null;
}

/** The GM has seen it. */
export function updatedNoteSeen(paths: Paths) {
  if (updatedNote(paths, () => false)) write(paths, { version: APP_VERSION, from: null, pending: false });
}
