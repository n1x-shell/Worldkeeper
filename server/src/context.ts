import fs from 'node:fs';
import type { Paths } from './config.js';
import { openDatabase, type DB } from './db/connection.js';
import { ensureEras } from './repo/eras.js';
import { syncBuiltinTypes } from './repo/recordTypes.js';
import { syncBuiltinTemplates } from './repo/templates.js';
import path from 'node:path';
import { setInstalledPacksDir } from './packs/paths.js';
import { syncInstalledPacks } from './packs/registry.js';

/** Holds the live database handle so a restore can swap it without restarting the server. */
export class AppContext {
  db: DB;
  constructor(public paths: Paths, public mode: 'dm' | 'player' = 'dm') {
    setInstalledPacksDir(path.join(paths.dataDir, 'packs'));
    this.db = openDatabase(paths.dbFile);
    syncBuiltinTypes(this.db);
    syncBuiltinTemplates(this.db);
    syncInstalledPacks(this.db);
    ensureEras(this.db);
  }

  /** Replace the live database with a verified staged copy. */
  replaceDatabase(stagedFile: string) {
    this.db.close();
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(this.paths.dbFile + suffix)) fs.unlinkSync(this.paths.dbFile + suffix);
    }
    fs.copyFileSync(stagedFile, this.paths.dbFile);
    fs.unlinkSync(stagedFile);
    this.db = openDatabase(this.paths.dbFile);
    syncBuiltinTypes(this.db);
    syncBuiltinTemplates(this.db);
    syncInstalledPacks(this.db);
    ensureEras(this.db);
  }
}
