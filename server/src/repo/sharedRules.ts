/**
 * Your books' rules, shared by every library (docs/LIBRARIES_PLAN.md §3.3). The rules packs you import (5etools,
 * Open5e, your own) live in the data folder's shared/rules.db, attached to the open library's database as `shared`,
 * so they're imported once per installation. Each library keeps its own switches: whether it uses a pack and whether
 * it publishes it (rules_pack_switches). A pack it has no switch for is off: importing a pack switches it on in the
 * library that's open, and the others leave it off until the GM switches it on there (v0.6.8).
 *
 * Reads keep their old names: `rules_packs` and `rules_entries` are temporary views over the shared tables and this
 * library's switches. Writes go through the functions here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, type DB } from '../db/connection.js';
import { libraryDir, readIndex } from '../libraries.js';

/** Attach the shared rules to a library's connection, make their tables if new, and the views reads use. */
export function attachSharedRules(db: DB, file: string) {
  db.prepare('ATTACH DATABASE ? AS shared').run(file);
  db.pragma('shared.journal_mode = WAL');
  db.exec(`
CREATE TABLE IF NOT EXISTS shared.rules_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shared.rules_entries (
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  cls TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  PRIMARY KEY (pack_id, kind, cls, name)
);
CREATE TABLE IF NOT EXISTS shared.rules_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TEMP VIEW rules_packs AS
  SELECT p.id, p.name, p.source, COALESCE(s.enabled, 0) AS enabled, p.imported_at, COALESCE(s.publish, 0) AS publish
  FROM shared.rules_packs p LEFT JOIN main.rules_pack_switches s ON s.pack_id = p.id;
CREATE TEMP VIEW rules_entries AS SELECT pack_id, kind, name, cls, data FROM shared.rules_entries;
`);
}

export interface RuleRow {
  kind: string;
  name: string;
  cls: string;
  data: unknown;
}

/** Import (or replace) a pack for every library; this library uses it. */
export function saveRulesPack(db: DB, p: { id: string; name: string; source: string }, entries: RuleRow[], importedAt = new Date().toISOString()) {
  db.transaction(() => {
    db.prepare('DELETE FROM shared.rules_entries WHERE pack_id = ?').run(p.id);
    db.prepare(
      `INSERT INTO shared.rules_packs (id, name, source, imported_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, source = excluded.source, imported_at = excluded.imported_at`,
    ).run(p.id, p.name, p.source, importedAt);
    const ins = db.prepare('INSERT OR REPLACE INTO shared.rules_entries (pack_id, kind, name, cls, data) VALUES (?, ?, ?, ?, ?)');
    for (const e of entries) ins.run(p.id, e.kind, e.name, e.cls, typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
    setPackSwitch(db, p.id, { enabled: true });
  })();
}

export const sharedPackExists = (db: DB, id: string) => !!db.prepare('SELECT 1 FROM shared.rules_packs WHERE id = ?').get(id);

/** This library's switches for a pack. */
export function setPackSwitch(db: DB, id: string, s: { enabled?: boolean; publish?: boolean }) {
  db.prepare(`INSERT INTO main.rules_pack_switches (pack_id, enabled, publish) VALUES (?, 0, 0) ON CONFLICT(pack_id) DO NOTHING`).run(id);
  if (s.enabled !== undefined) db.prepare('UPDATE main.rules_pack_switches SET enabled = ? WHERE pack_id = ?').run(s.enabled ? 1 : 0, id);
  if (s.publish !== undefined) db.prepare('UPDATE main.rules_pack_switches SET publish = ? WHERE pack_id = ?').run(s.publish ? 1 : 0, id);
}

/** Remove a pack from every library (its rules are shared). */
export function removeRulesPack(db: DB, id: string): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM shared.rules_entries WHERE pack_id = ?').run(id);
    db.prepare('DELETE FROM main.rules_pack_switches WHERE pack_id = ?').run(id);
    return db.prepare('DELETE FROM shared.rules_packs WHERE id = ?').run(id).changes > 0;
  })();
}

/**
 * Rules a library kept in its own database (before v0.5.6, or from a backup made then) move to the shared rules, and
 * its switches stay with it. Where the shared rules already have the pack, the more recently imported copy is kept.
 */
export function adoptSharedRules(db: DB) {
  const old = db.prepare('SELECT id, name, source, enabled, imported_at, publish FROM main.rules_packs').all() as {
    id: string;
    name: string;
    source: string;
    enabled: number;
    imported_at: string;
    publish: number;
  }[];
  if (!old.length && !db.prepare('SELECT 1 FROM main.rules_entries LIMIT 1').get()) return;
  db.transaction(() => {
    for (const p of old) {
      const have = db.prepare('SELECT imported_at FROM shared.rules_packs WHERE id = ?').get(p.id) as { imported_at: string } | undefined;
      if (!have || have.imported_at < p.imported_at) {
        const rows = db.prepare('SELECT kind, name, cls, data FROM main.rules_entries WHERE pack_id = ?').all(p.id) as RuleRow[];
        saveRulesPack(db, p, rows, p.imported_at);
      }
      setPackSwitch(db, p.id, { enabled: !!p.enabled, publish: !!p.publish });
    }
    db.prepare('DELETE FROM main.rules_entries').run();
    db.prepare('DELETE FROM main.rules_packs').run();
  })();
}

/** Give a library from before v0.6.8 a switch, on, for every book it has none for: it used them all (migration 32). */
function keepOldDefaultsIn(db: DB) {
  if (!db.prepare('SELECT 1 FROM main.rules_switches_pending').get()) return;
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO main.rules_pack_switches (pack_id, enabled, publish) SELECT id, 1, 0 FROM shared.rules_packs`).run();
    db.prepare('DELETE FROM main.rules_switches_pending').run();
  })();
}

/**
 * Libraries keep the books they used before v0.6.8. The open library, whenever it's one from before (also a backup
 * from then, restored); and, the first time this version opens the data folder, every other library too, at once,
 * so a book imported later stays off in them as in any library that isn't open.
 */
export function keepOldDefaults(db: DB, rootDir: string, openId: string) {
  keepOldDefaultsIn(db);
  if (db.prepare(`SELECT 1 FROM shared.rules_meta WHERE key = 'switches_kept'`).get()) return;
  for (const e of readIndex(rootDir)?.libraries ?? []) {
    if (e.id === openId) continue;
    const file = path.join(libraryDir(rootDir, e), 'worldkeeper.db');
    if (!fs.existsSync(file)) continue;
    const other = openDatabase(file);
    try {
      attachSharedRules(other, db.prepare(`SELECT file FROM pragma_database_list WHERE name = 'shared'`).pluck().get() as string);
      keepOldDefaultsIn(other);
    } finally {
      other.close();
    }
  }
  db.prepare(`INSERT INTO shared.rules_meta (key, value) VALUES ('switches_kept', ?)`).run(new Date().toISOString());
}
