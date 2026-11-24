import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ensureLibraries, libraryDir, type LibraryEntry } from './libraries.js';
import { createBackup } from './backup/backup.js';

/**
 * Resolved filesystem locations. The data folder (WORLDKEEPER_DATA_DIR, or ./data) is the library root: it holds
 * libraries.json, each library's folder under libraries/, and what libraries share (installed packs, the publishing
 * token). `dataDir` and the rest are the open library's (docs/LIBRARIES_PLAN.md §3.1).
 */
export interface Paths {
  /** The data folder: the library root. */
  rootDir: string;
  /** The open library's id. */
  libraryId: string;
  /** The open library's own folder. */
  dataDir: string;
  dbFile: string;
  backupsDir: string;
  uploadsDir: string;
  stagingDir: string;
}

export const defaultRoot = () => process.env.WORLDKEEPER_DATA_DIR || path.resolve(process.cwd(), 'data');

/** A library's paths, its folders made. */
export function libraryPaths(rootDir: string, e: LibraryEntry): Paths {
  const dir = libraryDir(rootDir, e);
  const p: Paths = {
    rootDir,
    libraryId: e.id,
    dataDir: dir,
    dbFile: path.join(dir, 'worldkeeper.db'),
    backupsDir: path.join(dir, 'backups'),
    uploadsDir: path.join(dir, 'uploads'),
    stagingDir: path.join(dir, 'staging'),
  };
  for (const d of [p.dataDir, p.backupsDir, p.uploadsDir, p.stagingDir]) fs.mkdirSync(d, { recursive: true });
  return p;
}

/**
 * Before an old installation moves into its library: a normal backup (a .wkbackup.zip with the database and pictures)
 * of the database as it was, without migrating it. It goes into the old backups folder, which moves with the library.
 */
function backupOldInstallation(dbFile: string, backupsDir: string, uploadsDir: string) {
  const root = path.dirname(dbFile);
  const stagingDir = path.join(root, 'staging');
  fs.mkdirSync(stagingDir, { recursive: true });
  const db = new Database(dbFile, { fileMustExist: true });
  try {
    createBackup(db, { rootDir: root, libraryId: '', dataDir: root, dbFile, backupsDir, uploadsDir, stagingDir }, 'before-libraries');
  } finally {
    db.close();
  }
}

/** The open library's paths, after making sure the data folder holds libraries (an old installation moves in first). */
export function resolvePaths(rootDir = defaultRoot()): Paths {
  const idx = ensureLibraries(rootDir, backupOldInstallation);
  return libraryPaths(rootDir, idx.libraries.find((l) => l.id === idx.open)!);
}
