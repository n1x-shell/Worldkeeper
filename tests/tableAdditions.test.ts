/** The shipped random tables: every encounter table is a full d12 tied to a region, hook tables aren't empty, they load once, and the GM's edits are kept. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { applyTables, parseTables } from '../server/src/tableAdditions';

const DIR = path.resolve(import.meta.dirname, '../packs/worldkeeper/tables');
const all = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .flatMap((f) => parseTables(fs.readFileSync(path.join(DIR, f), 'utf8')));

describe('random encounter tables', () => {
  it('are full d12 encounter tables, each tied to a region, and hook tables with entries, all with unique names', () => {
    const encounters = all.filter((t) => t.name.startsWith('Encounters: '));
    expect(encounters.length).toBeGreaterThan(30);
    for (const t of encounters) {
      expect(t.entries, t.name).toHaveLength(12);
      expect(t.region, t.name).toMatch(/^[A-Z]{2,5}-\d{3,4}$/);
    }
    for (const t of all.filter((x) => !x.name.startsWith('Encounters: '))) {
      expect(t.name, t.name).toMatch(/^Hooks from /);
      expect(t.entries.length, t.name).toBeGreaterThan(0);
    }
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length);
  });

  it('load once and never overwrite the GM edits', () => {
    const { db } = tempContext();
    const added = applyTables(db, DIR);
    expect(added).toHaveLength(all.length);
    const t = db.prepare(`SELECT id, die, entries, source FROM random_tables WHERE name = 'Encounters: The Hollow Marches, levels 1 to 4'`).get() as {
      id: number;
      die: string;
      entries: string;
      source: string;
    };
    expect(t.die).toBe('d12');
    expect(t.source).toBe('Worldkeeper additions (REG-001)');
    expect(JSON.parse(t.entries)[0].text).toContain('Forgotten Legionnaires');
    db.prepare(`UPDATE random_tables SET die = 'd20' WHERE id = ?`).run(t.id);
    expect(applyTables(db, DIR)).toEqual([]);
    expect((db.prepare('SELECT die FROM random_tables WHERE id = ?').get(t.id) as { die: string }).die).toBe('d20');
  });
});
