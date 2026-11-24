/**
 * Stand-ins (docs/WORLDBOOKS_PLAN.md §2a, safe mode): a worldbook shared in safe mode pairs each thing only a closed
 * book has with an open stand-in of the same kind ("Tabaxi" → "Human"). The library keeps the pairs; where the
 * original is missing from the GM's rules, the stand-in takes its name (rulesView, bookData), marked as standing in.
 * A GM who has the book gets the original.
 */
import type { DB } from '../db/connection.js';

export interface StandIn {
  kind: 'species' | 'class' | 'item' | 'creature';
  name: string;
  book: string;
  standIn: string;
}

const KEY = 'rules_stand_ins';

/** The stand-ins of every worldbook in this library. */
export function standIns(db: DB): (StandIn & { pack: string })[] {
  const raw = (db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined)?.value;
  try {
    return raw ? (JSON.parse(raw) as (StandIn & { pack: string })[]) : [];
  } catch {
    return [];
  }
}

export function setStandIns(db: DB, packId: string, list: StandIn[]) {
  const next = [...standIns(db).filter((s) => s.pack !== packId), ...list.map((s) => ({ ...s, pack: packId }))];
  if (next.length) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(next));
  else db.prepare('DELETE FROM settings WHERE key = ?').run(KEY);
}

/** A worldbook removed from the library takes its stand-ins with it. */
export const forgetStandIns = (db: DB, packId: string) => setStandIns(db, packId, []);

/** What a stand-in is labelled with: "Human, standing in for Tabaxi (Monsters of the Multiverse)". */
export const standInSource = (s: StandIn, standInSourceName: string) => `${standInSourceName}, standing in for ${s.name} (${s.book})`;
