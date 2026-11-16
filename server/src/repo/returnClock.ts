/**
 * The Return (The Return [COS-032]): a seven-stage clock the GM moves by hand. Players never see the clock, only the
 * omens and rumours of each stage it has reached (assets/return/omens.json). Forming any Orb jumps it to stage 6.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';

const OMENS = path.resolve(import.meta.dirname, '../../../assets/return/omens.json');

export interface ReturnStage {
  stage: number;
  title: string;
  omen: string;
  rumours: string[];
}

export function returnStages(file = OMENS): ReturnStage[] {
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { stages: ReturnStage[] }).stages;
}

/** The GM's own description of each stage, from the Return's record. */
function stageNotes(db: DB) {
  const body = (db.prepare(`SELECT body FROM entities WHERE id = 'COS-032'`).get() as { body: string } | undefined)?.body ?? '';
  const notes: Record<number, string> = {};
  for (const m of body.matchAll(/^(\d)\.\s+\*\*([^*]+)\*\*\s*(.+)$/gm)) notes[Number(m[1])] = m[3].trim();
  return notes;
}

export function returnClock(db: DB, campaignId: number) {
  const row = db.prepare(`SELECT stage, held_until, updated_at FROM return_clock WHERE campaign_id = ?`).get(campaignId) as { stage: number; held_until: string; updated_at: string } | undefined;
  const notes = stageNotes(db);
  return {
    stage: row?.stage ?? 0,
    heldUntil: row?.held_until ?? '',
    stages: returnStages().map((s) => ({ ...s, gm: notes[s.stage] ?? '' })),
    log: db.prepare(`SELECT from_stage, to_stage, reason, created_at FROM return_log WHERE campaign_id = ? ORDER BY id DESC LIMIT 20`).all(campaignId) as {
      from_stage: number;
      to_stage: number;
      reason: string;
      created_at: string;
    }[],
  };
}

/** Move the clock (to a stage, or by the Orb), and note it in the live session's log if there is one. */
export function setReturnStage(db: DB, campaignId: number, input: { stage?: number; orb?: boolean; reason?: string; held_until?: string }) {
  const before = returnClock(db, campaignId).stage;
  let to = input.orb ? Math.max(before, 6) : Number(input.stage ?? before);
  if (!Number.isInteger(to) || to < 0 || to > 7) throw badRequest('The Return has stages 0 to 7');
  if (to < before && !input.reason) throw badRequest('Say why the clock goes back');
  const reason = input.orb ? `An Orb was formed${input.reason ? `: ${input.reason}` : ''}` : (input.reason ?? '');
  db.prepare(
    `INSERT INTO return_clock (campaign_id, stage, held_until, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(campaign_id) DO UPDATE SET stage = excluded.stage, held_until = excluded.held_until, updated_at = excluded.updated_at`,
  ).run(campaignId, to, input.held_until ?? '');
  if (to !== before) {
    db.prepare(`INSERT INTO return_log (campaign_id, from_stage, to_stage, reason) VALUES (?, ?, ?, ?)`).run(campaignId, before, to, reason);
    const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
    if (live)
      db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'change', ?)`).run(live.id, `The Return moved from stage ${before} to stage ${to}.${reason ? ` ${reason}.` : ''}`);
  }
  return returnClock(db, campaignId);
}

/** What players have seen of the Return: the omens and rumours of every stage reached. */
export function playerOmens(db: DB, campaignId: number) {
  const stage = (db.prepare(`SELECT stage FROM return_clock WHERE campaign_id = ?`).get(campaignId) as { stage: number } | undefined)?.stage ?? 0;
  return returnStages()
    .filter((s) => s.stage <= stage)
    .map((s) => ({ omen: s.omen, rumours: s.rumours }));
}
