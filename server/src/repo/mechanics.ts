/**
 * Which of the setting's mechanics this library uses (shared/mechanics.ts). Until the GM chooses, a library holding
 * the Worldkeeper setting uses them all, and any other library uses none, so it runs as standard D&D.
 */
import type Database from 'better-sqlite3';
import { MECHANICS, SETTING_PRESET, STANDARD_PRESET, withDefaults, type Mechanics } from '../../../shared/mechanics.js';

type DB = Database.Database;

/** Whether the library holds the Worldkeeper setting (its Thinning rule or its first region). */
const hasSetting = (db: DB) => !!db.prepare(`SELECT 1 FROM entities WHERE id IN ('SYS-907', 'REG-001') LIMIT 1`).get();

export function getMechanics(db: DB): Mechanics {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'mechanics'`).get() as { value: string } | undefined;
  let saved: Partial<Mechanics> | null = null;
  try {
    saved = row ? (JSON.parse(row.value) as Partial<Mechanics>) : null;
  } catch {
    saved = null;
  }
  return withDefaults(saved, hasSetting(db) ? SETTING_PRESET : STANDARD_PRESET);
}

export function setMechanics(db: DB, patch: Partial<Record<string, unknown>>): Mechanics {
  const next = getMechanics(db);
  for (const { key } of MECHANICS) if (typeof patch[key] === 'boolean') next[key] = patch[key] as boolean;
  db.prepare(`INSERT INTO settings (key, value) VALUES ('mechanics', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(next));
  return next;
}
