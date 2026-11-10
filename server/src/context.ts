import fs from 'node:fs';
import type { Paths } from './config.js';
import { openDatabase, type DB } from './db/connection.js';

/** Holds the live database handle so a restore can swap it without restarting the server. */
export class AppContext {
  db: DB;
  constructor(public paths: Paths, public mode: 'dm' | 'player' = 'dm') {
    this.db = openDatabase(paths.dbFile);
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
  }
}
