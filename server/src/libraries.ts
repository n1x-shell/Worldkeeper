/**
 * Libraries (docs/LIBRARIES_PLAN.md §3): one installation holds several libraries, each a complete world (or set of
 * worlds) with its own database, uploads, backups and staging. The data folder (the library root) holds:
 *
 *   libraries.json        the libraries, and which one is open
 *   libraries/<id>/       each library's worldkeeper.db, uploads/, backups/, staging/
 *   shared/               what every library shares: the books' rules (rules.db), installed setting packs
 *                         (packs/) and the publishing token (secrets.json)
 *
 * One library is open at a time. An installation from before libraries (worldkeeper.db in the data folder itself)
 * becomes the first library on the first start, after a backup (§3.4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import Database from 'better-sqlite3';
import { badRequest, notFound } from './lib/errors.js';

export interface LibraryEntry {
  id: string;
  name: string;
  /** Its folder under libraries/. */
  folder: string;
  created_at: string;
  last_opened_at: string | null;
  /** Hidden from the list, its files kept (§5, answer 8). */
  archived?: boolean;
}

export interface LibraryIndex {
  format: 1;
  /** The open library's id. */
  open: string;
  libraries: LibraryEntry[];
  /** Set while an old installation's files are being moved into its library, so an interrupted start finishes it. */
  moving?: string;
}

/** What each library keeps in its own folder; an old installation keeps them in the data folder itself. */
export const LIBRARY_ITEMS = ['worldkeeper.db', 'worldkeeper.db-wal', 'worldkeeper.db-shm', 'uploads', 'backups', 'staging'] as const;

const INDEX = 'libraries.json';
const now = () => new Date().toISOString();
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const newId = () => 'lib-' + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export const indexFile = (root: string) => path.join(root, INDEX);
export const libraryDir = (root: string, e: Pick<LibraryEntry, 'folder'>) => path.join(root, 'libraries', e.folder);

export function readIndex(root: string): LibraryIndex | null {
  const f = indexFile(root);
  if (!fs.existsSync(f)) return null;
  const idx = JSON.parse(fs.readFileSync(f, 'utf8')) as LibraryIndex;
  if (idx.format !== 1 || !Array.isArray(idx.libraries)) throw new Error(`${f} is not a Worldkeeper library list`);
  return idx;
}

/** Write the index whole, through a temporary file, so it is never half-written. */
export function writeIndex(root: string, idx: LibraryIndex) {
  const f = indexFile(root);
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

function makeFolders(root: string, e: LibraryEntry) {
  const dir = libraryDir(root, e);
  for (const d of [dir, path.join(dir, 'uploads'), path.join(dir, 'backups'), path.join(dir, 'staging')]) fs.mkdirSync(d, { recursive: true });
}

function freshEntry(idx: LibraryIndex | null, name: string): LibraryEntry {
  let id = newId();
  while (idx?.libraries.some((l) => l.id === id)) id = newId();
  return { id, name: name.trim().slice(0, 120) || 'My library', folder: id, created_at: now(), last_opened_at: null };
}

/** The name an old installation's library takes: its app name if the GM set one, else its world's, else "My library". */
function nameOfOldLibrary(dbFile: string): string {
  try {
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    try {
      const get = (sql: string) => {
        try {
          return (db.prepare(sql).get() as { v: string } | undefined)?.v?.trim() || '';
        } catch {
          return '';
        }
      };
      const app = get(`SELECT value AS v FROM settings WHERE key = 'app_name'`);
      if (app && app !== 'The Worldkeeper') return app;
      const world = get(`SELECT name AS v FROM realms WHERE kind = 'world' AND archived = 0 ORDER BY sort_order LIMIT 1`);
      if (world && world !== 'The World') return world;
      return app || 'My library';
    } finally {
      db.close();
    }
  } catch {
    return 'My library';
  }
}

/** A backup of an old installation's database and pictures, untouched, before anything moves. */
function backupOldInstallation(root: string, backup: (dbFile: string, backupsDir: string, uploadsDir: string) => void) {
  const dbFile = path.join(root, 'worldkeeper.db');
  if (!fs.existsSync(dbFile)) return;
  const backupsDir = path.join(root, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  backup(dbFile, backupsDir, path.join(root, 'uploads'));
}

/** Move whatever of an old installation is still in the data folder into its library's folder. Safe to repeat. */
function moveIntoLibrary(root: string, e: LibraryEntry) {
  const dir = libraryDir(root, e);
  fs.mkdirSync(dir, { recursive: true });
  for (const item of LIBRARY_ITEMS) {
    const from = path.join(root, item);
    const to = path.join(dir, item);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      // A folder made empty by an earlier, interrupted start: replace it. Anything else is left for the GM to see.
      const empty = fs.statSync(to).isDirectory() && fs.readdirSync(to).length === 0;
      if (!empty) throw new Error(`Can't move ${from} into ${dir}: ${item} is already there`);
      fs.rmdirSync(to);
    }
    fs.renameSync(from, to);
  }
}

/**
 * Make sure the data folder holds libraries, and return the index. A new data folder gets its first, empty library;
 * an old installation becomes its first library, after a backup; an interrupted move is finished.
 */
export function ensureLibraries(root: string, backup: (dbFile: string, backupsDir: string, uploadsDir: string) => void): LibraryIndex {
  fs.mkdirSync(root, { recursive: true });
  let idx = readIndex(root);
  if (!idx) {
    const old = fs.existsSync(path.join(root, 'worldkeeper.db'));
    const e = freshEntry(null, old ? nameOfOldLibrary(path.join(root, 'worldkeeper.db')) : 'My library');
    if (old) backupOldInstallation(root, backup);
    idx = { format: 1, open: e.id, libraries: [e], ...(old ? { moving: e.id } : {}) };
    // Written before anything moves: from here on, a restart knows where the files are going.
    writeIndex(root, idx);
  }
  if (idx.moving) {
    const e = idx.libraries.find((l) => l.id === idx!.moving);
    if (e) moveIntoLibrary(root, e);
    delete idx.moving;
    writeIndex(root, idx);
  }
  if (!idx.libraries.some((l) => l.id === idx!.open && !l.archived)) {
    const first = idx.libraries.find((l) => !l.archived);
    if (!first) throw new Error('No library to open: every library is archived');
    idx.open = first.id;
    writeIndex(root, idx);
  }
  for (const e of idx.libraries.filter((l) => !l.archived)) makeFolders(root, e);
  moveIntoShared(root);
  return idx;
}

/**
 * What every library shares goes in shared/ (docs/LIBRARIES_PLAN.md §3.3): installed setting packs and the publishing
 * token, from where v0.5.5 and earlier kept them. Safe to repeat; never overwrites.
 */
function moveIntoShared(root: string) {
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared, { recursive: true });
  for (const item of ['packs', 'secrets.json']) {
    const from = path.join(root, item);
    const to = path.join(shared, item);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      const empty = fs.statSync(to).isDirectory() && fs.readdirSync(to).length === 0;
      if (!empty) continue;
      fs.rmdirSync(to);
    }
    fs.renameSync(from, to);
  }
}

export function libraryEntry(root: string, id: string): LibraryEntry {
  const e = readIndex(root)?.libraries.find((l) => l.id === id);
  if (!e) throw notFound('Library');
  return e;
}

/** A new, empty library (opened separately). */
export function createLibrary(root: string, name: string): LibraryEntry {
  const idx = readIndex(root);
  if (!idx) throw new Error('No library list in this data folder');
  const e = freshEntry(idx, name);
  makeFolders(root, e);
  idx.libraries.push(e);
  writeIndex(root, idx);
  return e;
}

export function renameLibrary(root: string, id: string, name: string): LibraryEntry {
  const idx = readIndex(root)!;
  const e = idx.libraries.find((l) => l.id === id);
  if (!e) throw notFound('Library');
  const n = name.trim().slice(0, 120);
  if (!n) throw badRequest('A library needs a name');
  e.name = n;
  writeIndex(root, idx);
  return e;
}

/** Record which library is open, and when it was opened. */
export function markOpen(root: string, id: string) {
  const idx = readIndex(root)!;
  const e = idx.libraries.find((l) => l.id === id);
  if (!e || e.archived) throw notFound('Library');
  idx.open = id;
  e.last_opened_at = now();
  writeIndex(root, idx);
}
