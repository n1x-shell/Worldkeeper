import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { MentionIndex } from '../../../shared/mentions.js';
import type { TypeRegistry } from '../../../shared/recordTypes.js';
import { NameStore, type NameIndex, type NameRow } from './nameMatch.js';
import { types as typeRegistry } from './recordTypes.js';

interface Row extends NameRow {
  redirect_to: string | null;
}
const COLUMNS = 'id, name, type, aliases, redirect_to, archived';
const target = (r: Row) => ({ id: r.id, name: r.name, type: r.type, aliases: parseJson<string[]>(r.aliases, []), redirect_to: r.redirect_to });

/** Both indexes of names, built from every record and kept by nothing: what the kept ones must always agree with. */
export function buildIndexes(db: DB): { mentions: MentionIndex; names: NameStore } {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM entities`).all() as Row[];
  return { mentions: new MentionIndex(rows.map(target)), names: new NameStore(typeRegistry(db), rows) };
}

/**
 * The indexes of every record's name are kept between calls (v0.9.20). They used to be built from every record each
 * time one was saved, so a save took longer the bigger the library was: in a library of 3,000 records, nine tenths of
 * saving one was reading the names of the other 2,999.
 *
 * Now they are built once for a database connection and then only brought up to date:
 *
 * - SQLite itself notes which records changed in a way that matters here (temporary triggers on the records table
 *   write their IDs down), so no way of changing a record can be forgotten, whatever code made the change;
 * - a change made through another connection (the separate players' server) shows in SQLite's data_version, and the
 *   indexes are built afresh;
 * - a change that was rolled back is un-done here too. What was brought up to date inside a transaction is marked
 *   in a temporary table, which a rollback empties with everything else; a missing mark says what to look at again.
 */
interface Kept {
  dataVersion: number;
  reg: TypeRegistry;
  mentions: MentionIndex;
  names: NameStore;
  /** Marks for what was done inside a transaction, newest last. `ids` null: the whole of both indexes was built then. */
  marks: { seq: number; ids: string[] | null }[];
  seq: number;
}
const kept = new WeakMap<DB, Kept>();
/** More changed records than this since the last look, and building afresh is the quicker way. */
const REBUILD_OVER = 2000;

function watch(db: DB) {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS wk_names_changed (id TEXT NOT NULL);
    CREATE TEMP TABLE IF NOT EXISTS wk_names_marks (seq INTEGER PRIMARY KEY);
    CREATE TEMP TRIGGER IF NOT EXISTS wk_names_ins AFTER INSERT ON main.entities BEGIN INSERT INTO wk_names_changed VALUES (NEW.id); END;
    CREATE TEMP TRIGGER IF NOT EXISTS wk_names_del AFTER DELETE ON main.entities BEGIN INSERT INTO wk_names_changed VALUES (OLD.id); END;
    CREATE TEMP TRIGGER IF NOT EXISTS wk_names_upd AFTER UPDATE OF name, aliases, type, redirect_to, archived ON main.entities
      BEGIN INSERT INTO wk_names_changed VALUES (NEW.id); END;
  `);
}

function build(db: DB, dataVersion: number, reg: TypeRegistry): Kept {
  watch(db);
  db.exec('DELETE FROM temp.wk_names_changed; DELETE FROM temp.wk_names_marks;');
  const k: Kept = { dataVersion, reg, ...buildIndexes(db), marks: [], seq: 0 };
  // Built inside a transaction: if it is rolled back, everything here (the triggers too) goes with it.
  if (db.inTransaction) mark(db, k, null);
  kept.set(db, k);
  return k;
}

function mark(db: DB, k: Kept, ids: string[] | null) {
  k.seq++;
  db.prepare('INSERT INTO temp.wk_names_marks VALUES (?)').run(k.seq);
  k.marks.push({ seq: k.seq, ids });
}

function current(db: DB): Kept {
  const dataVersion = db.pragma('data_version', { simple: true }) as number;
  const reg = typeRegistry(db);
  const k = kept.get(db);
  if (!k || k.dataVersion !== dataVersion || k.reg !== reg) return build(db, dataVersion, reg);

  // What a rolled-back transaction took with it: the marks made during it are gone.
  let lastMark: number;
  let pending: string[];
  try {
    lastMark = (db.prepare('SELECT COALESCE(MAX(seq), 0) n FROM temp.wk_names_marks').get() as { n: number }).n;
    pending = (db.prepare('SELECT DISTINCT id FROM temp.wk_names_changed').all() as { id: string }[]).map((r) => r.id);
  } catch {
    // The tables themselves were made in a transaction that was rolled back.
    return build(db, dataVersion, reg);
  }
  const again = new Set<string>();
  while (k.marks.length && k.marks[k.marks.length - 1].seq > lastMark) {
    const undone = k.marks.pop()!;
    if (!undone.ids) return build(db, dataVersion, reg);
    for (const id of undone.ids) again.add(id);
  }
  k.seq = lastMark;
  if (pending.length > REBUILD_OVER) return build(db, dataVersion, reg);

  const ids = [...new Set([...again, ...pending])];
  if (ids.length) {
    if (pending.length) db.exec('DELETE FROM temp.wk_names_changed');
    const one = db.prepare(`SELECT ${COLUMNS} FROM entities WHERE id = ?`);
    for (const id of ids) {
      const row = one.get(id) as Row | undefined;
      if (row) {
        k.mentions.add(target(row));
        k.names.set(row);
      } else {
        k.mentions.remove(id);
        k.names.delete(id);
      }
    }
    if (db.inTransaction) mark(db, k, ids);
  }
  // Outside any transaction, everything so far is settled: the marks have done their work.
  if (!db.inTransaction && k.marks.length) {
    db.exec('DELETE FROM temp.wk_names_marks');
    k.marks = [];
    k.seq = 0;
  }
  return k;
}

/** Name/alias index of every record, for resolving @[Name] mentions. The same object each time, kept current. */
export const loadMentionIndex = (db: DB): MentionIndex => current(db).mentions;

/** Every record's plain names, for names written without a link ("Leaders: Highlord Theos"). Kept current likewise. */
export const loadNameIndex = (db: DB): NameIndex => current(db).names;
