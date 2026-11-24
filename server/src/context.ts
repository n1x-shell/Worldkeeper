import fs from 'node:fs';
import { libraryPaths, type Paths } from './config.js';
import { libraryEntry, markOpen, readIndex, indexFile } from './libraries.js';
import { badRequest } from './lib/errors.js';
import { openDatabase, type DB } from './db/connection.js';
import { ensureEras } from './repo/eras.js';
import { syncBuiltinTypes } from './repo/recordTypes.js';
import { syncBuiltinTemplates } from './repo/templates.js';
import path from 'node:path';
import { setInstalledPacksDir } from './packs/paths.js';
import { syncInstalledPacks } from './packs/registry.js';
import { adoptCampaignDates, adoptSessionDates, adoptTimelineDates } from './repo/calendars.js';
import { adoptTableBands } from './repo/tables.js';
import { adoptHandbookCodes } from './repo/handbookCodes.js';

/** Holds the live database handle so a restore can swap it without restarting the server. */
export class AppContext {
  db: DB;
  constructor(
    public paths: Paths,
    public mode: 'dm' | 'player' = 'dm',
  ) {
    // Installed setting packs are shared by every library in the data folder.
    setInstalledPacksDir(path.join(paths.rootDir, 'packs'));
    this.db = this.open();
  }

  /** Open the library's database and bring it up to date (types, templates, packs, and what older versions lacked). */
  private open(): DB {
    const db = openDatabase(this.paths.dbFile);
    syncBuiltinTypes(db);
    syncBuiltinTemplates(db);
    syncInstalledPacks(db);
    adoptCampaignDates(db);
    adoptSessionDates(db);
    adoptTimelineDates(db);
    adoptTableBands(db);
    adoptHandbookCodes(db);
    ensureEras(db);
    return db;
  }

  /**
   * Close this library and open another (docs/LIBRARIES_PLAN.md §3.1). The GM's server records the choice in
   * libraries.json; the table server only follows it (`remember` false).
   */
  openLibrary(id: string, remember = this.mode === 'dm') {
    const e = libraryEntry(this.paths.rootDir, id);
    if (e.archived) throw badRequest('That library is archived');
    if (remember) markOpen(this.paths.rootDir, id);
    if (id === this.paths.libraryId) return;
    const next = libraryPaths(this.paths.rootDir, e);
    this.db.close();
    this.paths = next;
    this.db = this.open();
  }

  /** On the table server: switch to the library the GM has open, if it changed. True when it switched. */
  syncOpenLibrary(): boolean {
    const open = readIndex(this.paths.rootDir)?.open;
    if (!open || open === this.paths.libraryId) return false;
    this.openLibrary(open, false);
    return true;
  }

  /** On the table server: serve whichever library the GM has open, switching when they switch. */
  followOpenLibrary(everyMs = 2000) {
    const f = indexFile(this.paths.rootDir);
    let seen = 0;
    const check = () => {
      try {
        const t = fs.statSync(f).mtimeMs;
        if (t === seen) return;
        seen = t;
        if (this.syncOpenLibrary()) console.log(`[worldkeeper] now serving library ${this.paths.libraryId}`);
      } catch (e) {
        console.error('[worldkeeper] could not follow the open library', e);
      }
    };
    check();
    return setInterval(check, everyMs).unref();
  }

  /** Replace the live database with a verified staged copy. */
  replaceDatabase(stagedFile: string) {
    this.db.close();
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(this.paths.dbFile + suffix)) fs.unlinkSync(this.paths.dbFile + suffix);
    }
    fs.copyFileSync(stagedFile, this.paths.dbFile);
    fs.unlinkSync(stagedFile);
    this.db = this.open();
  }
}
