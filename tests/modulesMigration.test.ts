/** Migration 23: a library from v0.4.3 keeps its Thinning, fading and mechanics, as module data and switches. */
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../server/src/db/migrations.js';
import { characterPage } from '../server/src/repo/characterPages.js';
import { librarySwitches } from '../server/src/repo/modules.js';
import { partyTreasure } from '../server/src/repo/treasure.js';

function libraryAt22() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  for (const m of MIGRATIONS.filter((x) => x.version <= 22)) {
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
  }
  return db;
}

describe('migration 23 (modules)', () => {
  it('moves Thinning and fading into module data, and mechanics into module switches', () => {
    const db = libraryAt22();
    const c = Number(db.prepare(`INSERT INTO campaigns (title) VALUES ('T')`).run().lastInsertRowid);
    const ch = Number(db.prepare(`INSERT INTO characters (campaign_id, name) VALUES (?, 'Wren')`).run(c).lastInsertRowid);
    const quiet = Number(db.prepare(`INSERT INTO characters (campaign_id, name) VALUES (?, 'Quiet')`).run(c).lastInsertRowid);
    db.prepare(`INSERT INTO character_pages (character_id, code, true_name, memories, known_by, thinning, shardscarred, notes) VALUES (?, 'AAAA2222', 'Wrenna', ?, '["Mara"]', 2, 1, 'My notes')`).run(
      ch,
      JSON.stringify([{ id: 1, text: 'Rain on slate', struck: true }]),
    );
    db.prepare(`INSERT INTO character_pages (character_id, code) VALUES (?, 'BBBB3333')`).run(quiet);
    const t = Number(db.prepare(`INSERT INTO party_treasure (campaign_id, name, fades, anchored) VALUES (?, 'Glass bead', 1, 0)`).run(c).lastInsertRowid);
    db.prepare(`INSERT INTO party_treasure (campaign_id, name) VALUES (?, 'Rope')`).run(c);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('mechanics', ?)`).run(JSON.stringify({ setting: false, thinning: true, theReturn: false, fading: true, worldTreasure: false }));

    expect(migrate(db)).toBeGreaterThan(0);

    expect(characterPage(db, ch)).toMatchObject({
      code: 'AAAA2222',
      true_name: 'Wrenna',
      known_by: ['Mara'],
      thinning: 2,
      shardscarred: true,
      notes: 'My notes',
      memories: [{ id: 1, text: 'Rain on slate', struck: true }],
    });
    expect(characterPage(db, quiet)).toMatchObject({ true_name: '', thinning: 0, memories: [] });
    expect((db.prepare(`SELECT name FROM pragma_table_info('character_pages')`).all() as { name: string }[]).map((r) => r.name)).toEqual(['character_id', 'code', 'notes', 'updated_at']);
    expect(partyTreasure.get(db, t)).toMatchObject({ fades: true, anchored: false });
    expect((db.prepare(`SELECT COUNT(*) n FROM module_data`).get() as { n: number }).n).toBe(2);
    expect(librarySwitches(db)).toEqual({
      thinning: true,
      'the-return': false,
      'fading-salvage': true,
      'setting-treasure': false,
      vaults: false,
      shards: false,
      'depths-explorer': false,
      'quick-reference': false,
      renown: true,
    });
    // Module data goes with its character or treasure.
    db.prepare('DELETE FROM characters WHERE id = ?').run(ch);
    db.prepare('DELETE FROM party_treasure WHERE id = ?').run(t);
    expect((db.prepare(`SELECT COUNT(*) n FROM module_data`).get() as { n: number }).n).toBe(0);
  });

  it('gives a fresh library no switches at all (its packs decide)', () => {
    const db = libraryAt22();
    migrate(db);
    expect(librarySwitches(db)).toEqual({});
  });
});
