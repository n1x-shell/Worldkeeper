/**
 * Rolls the whole table sees (v0.9.8, docs/BETA_PLAN.md B4). A player rolls from their sheet, the GM from their
 * tools; the server rolls the dice (so a result can't be made up) and keeps it in the campaign's roll log, which
 * everyone at the table reads. The GM's own rolls are behind the screen unless they say otherwise.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { rollDice } from '../../../shared/play.js';

/** How many rolls a campaign keeps: the log is for the table tonight, not a record. */
const KEEP = 200;

const rollSchema = z.object({
  /** What the roll is for: "Stealth", "Longsword attack". */
  label: z.string().trim().max(80).default(''),
  /** Dice as the roller reads them: "1d20+5", "2d6 + 3". */
  expression: z.string().trim().min(1, 'Say what to roll').max(60),
  /** Advantage or Disadvantage on the d20. */
  mode: z.enum(['normal', 'adv', 'dis']).default('normal'),
  /** The GM only: keep it behind the screen. */
  hidden: z.boolean().default(false),
});

export interface TableRoll {
  id: number;
  who: string;
  character_id: number | null;
  label: string;
  expression: string;
  mode: 'normal' | 'adv' | 'dis';
  total: number;
  detail: string;
  hidden: boolean;
  created_at: string;
}
type Row = Omit<TableRoll, 'hidden'> & { hidden: number };
const out = (r: Row): TableRoll => ({ ...r, hidden: !!r.hidden });
const COLS = 'id, who, character_id, label, expression, mode, total, detail, hidden, created_at';

/** Roll, and put the result in the campaign's log. `by` is who rolls: one of the campaign's characters, or the GM. */
export function makeRoll(db: DB, campaignId: number, body: unknown, by: { characterId: number } | { gm: true }): TableRoll {
  const b = rollSchema.parse(body ?? {});
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  let who = 'The GM';
  let characterId: number | null = null;
  if ('characterId' in by) {
    const c = db.prepare('SELECT name FROM characters WHERE id = ? AND campaign_id = ?').get(by.characterId, campaignId) as { name: string } | undefined;
    if (!c) throw badRequest('That character isn’t in this campaign');
    who = c.name;
    characterId = by.characterId;
  }
  let result;
  try {
    result = rollDice(b.mode === 'normal' ? b.expression : `${b.expression} ${b.mode}`);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  // A player's roll is always seen; only the GM can roll behind the screen.
  const hidden = 'gm' in by && b.hidden ? 1 : 0;
  const id = Number(
    db
      .prepare('INSERT INTO table_rolls (campaign_id, character_id, who, label, expression, mode, total, detail, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(campaignId, characterId, who, b.label, b.expression, b.mode, result.total, result.detail, hidden).lastInsertRowid,
  );
  db.prepare('DELETE FROM table_rolls WHERE campaign_id = ? AND id <= ?').run(campaignId, id - KEEP);
  return out(db.prepare(`SELECT ${COLS} FROM table_rolls WHERE id = ?`).get(id) as Row);
}

/** The newest rolls first. Players never get the ones behind the GM's screen. */
export function recentRolls(db: DB, campaignId: number | null, o: { hidden?: boolean; limit?: number } = {}): TableRoll[] {
  if (campaignId == null) return [];
  try {
    const rows = db
      .prepare(`SELECT ${COLS} FROM table_rolls WHERE campaign_id = ? ${o.hidden ? '' : 'AND hidden = 0'} ORDER BY id DESC LIMIT ?`)
      .all(campaignId, Math.min(100, o.limit ?? 30)) as Row[];
    return rows.map(out);
  } catch {
    return []; // a library from before migration 37
  }
}

/** Show the table a roll made behind the screen (or take it back behind). */
export function revealRoll(db: DB, campaignId: number, id: number, hidden: boolean): TableRoll {
  if (!db.prepare('UPDATE table_rolls SET hidden = ? WHERE id = ? AND campaign_id = ?').run(hidden ? 1 : 0, id, campaignId).changes) throw notFound('Roll');
  return out(db.prepare(`SELECT ${COLS} FROM table_rolls WHERE id = ?`).get(id) as Row);
}

export function clearRolls(db: DB, campaignId: number) {
  db.prepare('DELETE FROM table_rolls WHERE campaign_id = ?').run(campaignId);
}
