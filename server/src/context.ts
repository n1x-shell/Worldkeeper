import fs from 'node:fs';
import { libraryPaths, type Paths } from './config.js';
import { libraryEntry, markOpen, readIndex, indexFile } from './libraries.js';
import { badRequest } from './lib/errors.js';
import { openDatabase, type DB } from './db/connection.js';
import { createBackup } from './backup/backup.js';
import { ensureEras } from './repo/eras.js';
import { syncBuiltinTypes } from './repo/recordTypes.js';
import { syncBuiltinTemplates } from './repo/templates.js';
import path from 'node:path';
import { setInstalledPacksDir } from './packs/paths.js';
import { syncInstalledPacks } from './packs/registry.js';
import { adoptCampaignDates, adoptSessionDates, adoptTimelineDates } from './repo/calendars.js';
import { adoptTableBands } from './repo/tables.js';
import { adoptHandbookCodes } from './repo/handbookCodes.js';
import { adoptSharedRules, attachSharedRules, keepOldDefaults } from './repo/sharedRules.js';
import { ensureUndoTriggers } from './repo/undo.js';
import { schemaVersion } from './db/migrations.js';
import { logError, logInfo } from './log.js';

/** Holds the live database handle so a restore can swap it without restarting the server. */
export class AppContext {
  db: DB;
  constructor(
    public paths: Paths,
    public mode: 'dm' | 'player' = 'dm',
  ) {
    // Installed setting packs are shared by every library in the data folder.
    setInstalledPacksDir(path.join(paths.sharedDir, 'packs'));
    this.db = this.open();
  }

  /** Open the library's database and bring it up to date (types, templates, packs, and what older versions lacked). */
  private open(): DB {
    // A library made by an earlier version is backed up before this version changes anything in it (the database
    // only: an update doesn't touch the pictures).
    let upgraded: { from: number; to: number; backup: string | null } | null = null;
    const paths = this.paths;
    const db = openDatabase(paths.dbFile, {
      beforeUpgrade: (old, from, to) => {
        const backup = createBackup(old, paths, `pre-update-step-${from}`, { uploads: false }).file;
        upgraded = { from, to, backup };
        return backup;
      },
    });
    try {
      this.finishOpening(db, upgraded);
    } catch (e) {
      db.close();
      throw e;
    }
    const up = upgraded as { from: number; to: number; backup: string | null } | null;
    logInfo(`library ${paths.libraryId} is open, schema ${schemaVersion(db)}${up ? ` (updated from ${up.from}; the copy from before is ${up.backup ?? 'none'})` : ''}`);
    return db;
  }

  private finishOpening(db: DB, upgraded: { from: number; to: number; backup: string | null } | null) {
    // The books' rules every library shares; rules this library kept itself (from before) move there.
    attachSharedRules(db, path.join(this.paths.sharedDir, 'rules.db'));
    adoptSharedRules(db);
    keepOldDefaults(db, this.paths.rootDir, this.paths.libraryId);
    ensureUndoTriggers(db);
    syncBuiltinTypes(db);
    syncBuiltinTemplates(db);
    syncInstalledPacks(db);
    adoptCampaignDates(db);
    adoptSessionDates(db);
    adoptTimelineDates(db);
    adoptTableBands(db);
    adoptHandbookCodes(db);
    ensureEras(db);
    // Said once in the app: this library was updated, and where the copy from before is.
    if (upgraded) db.prepare(`INSERT INTO settings (key, value) VALUES ('upgrade_notice', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify({ ...upgraded, at: new Date().toISOString() }));
  }

  /**
   * Close this library and open another (docs/LIBRARIES_PLAN.md §3.1). The GM's server records the choice in
   * libraries.json; the table server only follows it (`remember` false).
   */
  openLibrary(id: string, remember = this.mode === 'dm') {
    const e = libraryEntry(this.paths.rootDir, id);
    if (e.archived) throw badRequest('That library is archived');
    if (id === this.paths.libraryId) {
      if (remember) markOpen(this.paths.rootDir, id);
      return;
    }
    // The other library is opened before this one is let go: if it can't be opened (an update that failed, a library
    // from a newer version), the GM stays where they were.
    const before = { db: this.db, paths: this.paths };
    this.paths = libraryPaths(this.paths.rootDir, e);
    try {
      this.db = this.open();
    } catch (err) {
      this.paths = before.paths;
      throw err;
    }
    before.db.close();
    if (remember) markOpen(this.paths.rootDir, id);
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
        logError('the table server could not follow the open library', e);
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
