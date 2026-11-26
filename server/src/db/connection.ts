import Database from 'better-sqlite3';
import { migrate } from './migrations.js';

export type DB = Database.Database;

/** Open (or create) the world database and bring its schema up to date. */
export function openDatabase(file: string, o: { /** Before a library from an earlier version is changed: back it up, and return the backup's name. */ beforeUpgrade?: (db: DB, from: number, to: number) => string | null } = {}): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  try {
    migrate(db, { beforeUpgrade: o.beforeUpgrade ? (from, to) => o.beforeUpgrade!(db, from, to) : undefined });
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}
