import Database from 'better-sqlite3';
import { migrate } from './migrations.js';

export type DB = Database.Database;

/** Open (or create) the world database and bring its schema up to date. */
export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}
