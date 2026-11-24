/**
 * Undo for faction plans and campaign changes (v0.6.6). One GM action (record a change, accept one, advance a plan,
 * edit or delete one) is one undo step, however many rows it touches: recording a value also supersedes the old one.
 *
 * Triggers on the tables record each row's before and after (as JSON of every column) while an action runs; they're
 * made when the library opens, from the tables' columns as they are. Undoing puts every row the action touched back as
 * it was before, and refuses if any of them has changed since (undo the later change first).
 */
import type { DB } from '../db/connection.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';

export const UNDO_TABLES = ['faction_plans', 'campaign_state'] as const;
type UndoTable = (typeof UNDO_TABLES)[number];
const KEEP = 200; // actions kept per library

const columns = (db: DB, t: string) => (db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as { name: string }[]).map((c) => c.name);

/** (Re)make the recording triggers from the tables' current columns. */
export function ensureUndoTriggers(db: DB) {
  for (const t of UNDO_TABLES) {
    const cols = columns(db, t);
    const json = (row: 'NEW' | 'OLD') => `json_object(${cols.map((c) => `'${c}', ${row}."${c}"`).join(', ')})`;
    const when = `WHEN (SELECT recording FROM undo_recording WHERE singleton = 1) = 1`;
    db.exec(`
DROP TRIGGER IF EXISTS undo_${t}_insert;
DROP TRIGGER IF EXISTS undo_${t}_update;
DROP TRIGGER IF EXISTS undo_${t}_delete;
CREATE TRIGGER undo_${t}_insert AFTER INSERT ON ${t} ${when} BEGIN
  INSERT INTO undo_rows (action_id, table_name, row_id, op, before, after) VALUES (NULL, '${t}', NEW.id, 'insert', NULL, ${json('NEW')});
END;
CREATE TRIGGER undo_${t}_update AFTER UPDATE ON ${t} ${when} BEGIN
  INSERT INTO undo_rows (action_id, table_name, row_id, op, before, after) VALUES (NULL, '${t}', NEW.id, 'update', ${json('OLD')}, ${json('NEW')});
END;
CREATE TRIGGER undo_${t}_delete AFTER DELETE ON ${t} ${when} BEGIN
  INSERT INTO undo_rows (action_id, table_name, row_id, op, before, after) VALUES (NULL, '${t}', OLD.id, 'delete', ${json('OLD')}, NULL);
END;`);
  }
}

/**
 * Run a GM action as one undo step. Synchronous, in one transaction: the rows the triggers record while it runs are
 * this action's. An action that changed nothing leaves no step.
 */
export function undoable<T>(db: DB, label: string, campaignId: number | null | undefined, fn: () => T): T {
  return db.transaction(() => {
    db.prepare('DELETE FROM undo_rows WHERE action_id IS NULL').run();
    db.prepare('UPDATE undo_recording SET recording = 1 WHERE singleton = 1').run();
    let out: T;
    try {
      out = fn();
    } finally {
      db.prepare('UPDATE undo_recording SET recording = 0 WHERE singleton = 1').run();
    }
    const n = (db.prepare('SELECT COUNT(*) AS n FROM undo_rows WHERE action_id IS NULL').get() as { n: number }).n;
    if (n) {
      // Typing in a plan autosaves often: the same edit again within two minutes joins the step before (its rows keep
      // their order, so undoing it goes back to before the first).
      const last = db
        .prepare(`SELECT id FROM undo_actions WHERE undone_at IS NULL AND label = ? AND campaign_id IS ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-120 seconds') ORDER BY id DESC LIMIT 1`)
        .get(label.slice(0, 300), campaignId ?? null) as { id: number } | undefined;
      const newest = (db.prepare('SELECT MAX(id) AS id FROM undo_actions').get() as { id: number | null }).id;
      const id = last && last.id === newest ? last.id : Number(db.prepare('INSERT INTO undo_actions (label, campaign_id) VALUES (?, ?)').run(label.slice(0, 300), campaignId ?? null).lastInsertRowid);
      db.prepare('UPDATE undo_rows SET action_id = ? WHERE action_id IS NULL').run(id);
      db.prepare(`DELETE FROM undo_actions WHERE id NOT IN (SELECT id FROM undo_actions ORDER BY id DESC LIMIT ${KEEP})`).run();
    }
    return out;
  })();
}

interface Step {
  table: UndoTable;
  rowId: number;
  /** The row before the action (null: it didn't exist), and after it (null: deleted). */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** An action's rows: for each row it touched, how it was before the action and after it. */
function steps(db: DB, actionId: number): Step[] {
  const rows = db.prepare('SELECT table_name, row_id, before, after FROM undo_rows WHERE action_id = ? ORDER BY id').all(actionId) as {
    table_name: UndoTable;
    row_id: number;
    before: string | null;
    after: string | null;
  }[];
  const byRow = new Map<string, Step>();
  for (const r of rows) {
    const key = `${r.table_name}:${r.row_id}`;
    const s = byRow.get(key);
    if (!s) byRow.set(key, { table: r.table_name, rowId: r.row_id, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null });
    else s.after = r.after ? JSON.parse(r.after) : null;
  }
  return [...byRow.values()];
}

const current = (db: DB, t: UndoTable, id: number) => db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
const same = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | null) => (!a ? !b : !!b && Object.keys(b).every((k) => (a[k] ?? null) === (b[k] ?? null)));

/** Whether an action can still be undone: not undone yet, and nothing it touched has changed since. */
function check(db: DB, actionId: number): string | null {
  for (const s of steps(db, actionId)) if (!same(current(db, s.table, s.rowId), s.after)) return 'Something it changed has changed again since: undo the later change first.';
  return null;
}

export function recentActions(db: DB, campaignId: number | null, limit = 12) {
  const rows = db
    .prepare(`SELECT id, label, campaign_id, created_at FROM undo_actions WHERE undone_at IS NULL AND (? IS NULL OR campaign_id = ? OR campaign_id IS NULL) ORDER BY id DESC LIMIT ?`)
    .all(campaignId, campaignId, limit) as { id: number; label: string; campaign_id: number | null; created_at: string }[];
  return rows.map((r) => {
    const why = check(db, r.id);
    return { ...r, can_undo: !why, why_not: why };
  });
}

/** Undo an action: every row it touched goes back to how it was before it. */
export function undoAction(db: DB, actionId: number) {
  return db.transaction(() => {
    const a = db.prepare('SELECT id, label, undone_at FROM undo_actions WHERE id = ?').get(actionId) as { id: number; label: string; undone_at: string | null } | undefined;
    if (!a) throw notFound('Change');
    if (a.undone_at) throw badRequest('That change was already undone');
    const why = check(db, actionId);
    if (why) throw new HttpError(409, why);
    for (const s of steps(db, actionId).reverse()) {
      if (!s.before) {
        db.prepare(`DELETE FROM ${s.table} WHERE id = ?`).run(s.rowId);
        continue;
      }
      const cols = columns(db, s.table).filter((c) => c in s.before!);
      const vals = cols.map((c) => s.before![c] as never);
      if (current(db, s.table, s.rowId)) db.prepare(`UPDATE ${s.table} SET ${cols.map((c) => `"${c}" = ?`).join(', ')} WHERE id = ?`).run(...vals, s.rowId);
      else db.prepare(`INSERT INTO ${s.table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
    }
    db.prepare(`UPDATE undo_actions SET undone_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(actionId);
    return { undone: a.label };
  })();
}
