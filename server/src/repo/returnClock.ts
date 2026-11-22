/**
 * The clock module (the Worldkeeper setting's is the Return): a clock the GM moves by hand, whose name, stages and
 * jump (an event that moves it straight to a stage) come from a setting pack's return/omens.json. Players never see
 * the clock, only the omens and rumours of each stage it has reached.
 */
import { role } from '../packs/registry.js';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { findPack, installedPacks } from '../packs/registry.js';

export interface ReturnStage {
  stage: number;
  title: string;
  omen: string;
  rumours: string[];
}

export interface ClockDef {
  name: string;
  stages: ReturnStage[];
  /** An event that moves the clock straight to a stage (the setting's: an Orb formed, to stage 6). */
  jump: { label: string; to: number; hint?: string } | null;
}

/** The clock an installed setting pack defines (its return/omens.json), or an empty one. */
export function clockDef(db: DB): ClockDef {
  for (const p of installedPacks(db)) {
    const dir = findPack(p.id)?.dir;
    const file = dir && path.join(dir, 'return', 'omens.json');
    if (!file || !fs.existsSync(file)) continue;
    const d = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ClockDef>;
    return { name: d.name ?? 'The clock', stages: d.stages ?? [], jump: d.jump ?? null };
  }
  return { name: 'The clock', stages: [], jump: null };
}
export const returnStages = (db: DB) => clockDef(db).stages;

/** The GM's own description of each stage, from the Return's record. */
function stageNotes(db: DB) {
  const id = role(db, 'clock.stages');
  const body = id ? ((db.prepare(`SELECT body FROM entities WHERE id = ?`).get(id) as { body: string } | undefined)?.body ?? '') : '';
  const notes: Record<number, string> = {};
  for (const m of body.matchAll(/^(\d)\.\s+\*\*([^*]+)\*\*\s*(.+)$/gm)) notes[Number(m[1])] = m[3].trim();
  return notes;
}

export function returnClock(db: DB, campaignId: number) {
  const row = db.prepare(`SELECT stage, held_until, updated_at FROM return_clock WHERE campaign_id = ?`).get(campaignId) as { stage: number; held_until: string; updated_at: string } | undefined;
  const notes = stageNotes(db);
  const def = clockDef(db);
  return {
    name: def.name,
    jump: def.jump,
    stage: row?.stage ?? 0,
    heldUntil: row?.held_until ?? '',
    stages: def.stages.map((s) => ({ ...s, gm: notes[s.stage] ?? '' })),
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
  const clock = returnClock(db, campaignId);
  const before = clock.stage;
  const max = Math.max(0, ...clock.stages.map((s) => s.stage));
  if (input.orb && !clock.jump) throw badRequest(`${clock.name} has no jump`);
  const to = input.orb ? Math.max(before, clock.jump!.to) : Number(input.stage ?? before);
  if (!Number.isInteger(to) || to < 0 || to > max) throw badRequest(`${clock.name} has stages 0 to ${max}`);
  if (to < before && !input.reason) throw badRequest('Say why the clock goes back');
  const reason = input.orb ? `${clock.jump!.label}${input.reason ? `: ${input.reason}` : ''}` : (input.reason ?? '');
  db.prepare(
    `INSERT INTO return_clock (campaign_id, stage, held_until, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(campaign_id) DO UPDATE SET stage = excluded.stage, held_until = excluded.held_until, updated_at = excluded.updated_at`,
  ).run(campaignId, to, input.held_until ?? '');
  if (to !== before) {
    db.prepare(`INSERT INTO return_log (campaign_id, from_stage, to_stage, reason) VALUES (?, ?, ?, ?)`).run(campaignId, before, to, reason);
    const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
    if (live)
      db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'change', ?)`).run(live.id, `${clock.name} moved from stage ${before} to stage ${to}.${reason ? ` ${reason}.` : ''}`);
  }
  return returnClock(db, campaignId);
}

/** What players have seen of the Return: the omens and rumours of every stage reached. */
export function playerOmens(db: DB, campaignId: number) {
  const stage = (db.prepare(`SELECT stage FROM return_clock WHERE campaign_id = ?`).get(campaignId) as { stage: number } | undefined)?.stage ?? 0;
  return returnStages(db)
    .filter((s) => s.stage <= stage)
    .map((s) => ({ omen: s.omen, rumours: s.rumours }));
}
