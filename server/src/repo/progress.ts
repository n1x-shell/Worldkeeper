/**
 * Party progression (v0.9.6, docs/BETA_PLAN.md B3): experience and milestone awards with their log, and who was at
 * each session. An award is one row for each character it went to, so a campaign export carries it like the rest.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { logged } from './characterLog.js';

const awardSchema = z
  .object({
    kind: z.enum(['xp', 'milestone']),
    character_ids: z.array(z.number().int()).min(1, 'Choose who it goes to').max(60),
    /** Experience for each character, or a total to share out evenly (rounded down). */
    each: z.number().int().min(1).max(1_000_000).optional(),
    total: z.number().int().min(1).max(10_000_000).optional(),
    session_id: z.number().int().nullable().optional(),
    reason: z.string().trim().max(300).default(''),
  })
  .refine((b) => b.kind === 'milestone' || b.each !== undefined || b.total !== undefined, 'Say how much experience');

export interface Award {
  batch: string;
  kind: 'xp' | 'milestone';
  amount: number;
  reason: string;
  session_id: number | null;
  session_number: number | null;
  created_at: string;
  characters: { id: number; name: string }[];
}

const sheetOf = (db: DB, id: number) => {
  const r = db.prepare('SELECT level, sheet FROM characters WHERE id = ?').get(id) as { level: number; sheet: string } | undefined;
  return r ? { level: r.level, sheet: parseJson<Record<string, unknown>>(r.sheet, {}) } : null;
};
const saveSheet = (db: DB, id: number, sheet: Record<string, unknown>, level?: number) =>
  db
    .prepare(`UPDATE characters SET sheet = ?, level = COALESCE(?, level), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .run(JSON.stringify(sheet), level ?? null, id);

/**
 * Give experience, or a level, to some of a campaign's characters. A level given marks the sheet with the level it was
 * built to, so the sheet offers what the new level gives. Each change is in the character's own log, as the GM's.
 */
export function giveAward(db: DB, campaignId: number, body: unknown): Award[] {
  const b = awardSchema.parse(body ?? {});
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  const ids = [...new Set(b.character_ids)];
  const own = db.prepare('SELECT id FROM characters WHERE campaign_id = ? AND id = ?');
  if (ids.some((id) => !own.get(campaignId, id))) throw badRequest('Those characters aren’t all in this campaign');
  if (b.session_id != null && !db.prepare('SELECT 1 FROM sessions WHERE id = ? AND campaign_id = ?').get(b.session_id, campaignId)) throw badRequest('That session isn’t in this campaign');
  const each = b.kind === 'milestone' ? 1 : (b.each ?? Math.floor(b.total! / ids.length));
  if (each < 1) throw badRequest('That is less than 1 XP each');
  const batch = randomBytes(6).toString('hex');
  const row = db.prepare('INSERT INTO progress_awards (campaign_id, session_id, character_id, kind, amount, reason, batch) VALUES (?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const id of ids) {
      const c = sheetOf(db, id)!;
      if (b.kind === 'milestone' && c.level >= 20) continue;
      logged(db, id, 'gm', () =>
        b.kind === 'xp'
          ? saveSheet(db, id, { ...c.sheet, xp: Math.min(1_000_000, (typeof c.sheet.xp === 'number' ? c.sheet.xp : 0) + each) })
          : saveSheet(db, id, { ...c.sheet, builtLevel: typeof c.sheet.builtLevel === 'number' ? Math.min(c.sheet.builtLevel, c.level) : c.level }, c.level + 1),
      );
      row.run(campaignId, b.session_id ?? null, id, b.kind, each, b.reason, batch);
    }
  })();
  return listAwards(db, campaignId);
}

/** A campaign's awards, newest first, each with who it went to. */
export function listAwards(db: DB, campaignId: number): Award[] {
  const rows = db
    .prepare(
      `SELECT a.batch, a.kind, a.amount, a.reason, a.session_id, s.number AS session_number, a.created_at, a.character_id, c.name
       FROM progress_awards a LEFT JOIN characters c ON c.id = a.character_id LEFT JOIN sessions s ON s.id = a.session_id
       WHERE a.campaign_id = ? ORDER BY a.id DESC`,
    )
    .all(campaignId) as (Omit<Award, 'characters'> & { character_id: number; name: string | null })[];
  const out = new Map<string, Award>();
  for (const { character_id, name, ...a } of rows) {
    const award = out.get(a.batch) ?? { ...a, characters: [] };
    if (name) award.characters.push({ id: character_id, name });
    out.set(a.batch, award);
  }
  return [...out.values()];
}

/**
 * Take an award back. Experience is taken off again. A milestone's level is not: what the sheet took at that level
 * (hit points, features, choices) can't be un-taken for the player, so the GM lowers the level by hand if they mean to.
 */
export function removeAward(db: DB, campaignId: number, batch: string): Award[] {
  const rows = db.prepare('SELECT id, character_id, kind, amount FROM progress_awards WHERE campaign_id = ? AND batch = ?').all(campaignId, batch) as {
    id: number;
    character_id: number;
    kind: string;
    amount: number;
  }[];
  if (!rows.length) throw notFound('Award');
  db.transaction(() => {
    for (const r of rows) {
      const c = sheetOf(db, r.character_id);
      if (c && r.kind === 'xp') logged(db, r.character_id, 'gm', () => saveSheet(db, r.character_id, { ...c.sheet, xp: Math.max(0, (typeof c.sheet.xp === 'number' ? c.sheet.xp : 0) - r.amount) }));
      db.prepare('DELETE FROM progress_awards WHERE id = ?').run(r.id);
    }
  })();
  return listAwards(db, campaignId);
}

/** Who was at a session: null until the GM says. */
export function attendance(db: DB, sessionId: number): number[] | null {
  const s = db.prepare('SELECT attendance_taken FROM sessions WHERE id = ?').get(sessionId) as { attendance_taken: number } | undefined;
  if (!s) throw notFound('Session');
  if (!s.attendance_taken) return null;
  return (db.prepare('SELECT character_id FROM session_attendance WHERE session_id = ? ORDER BY character_id').all(sessionId) as { character_id: number }[]).map((r) => r.character_id);
}

export function setAttendance(db: DB, sessionId: number, body: unknown): number[] {
  const { character_ids } = z.object({ character_ids: z.array(z.number().int()).max(60) }).parse(body ?? {});
  const s = db.prepare('SELECT campaign_id FROM sessions WHERE id = ?').get(sessionId) as { campaign_id: number } | undefined;
  if (!s) throw notFound('Session');
  const own = db.prepare('SELECT 1 FROM characters WHERE campaign_id = ? AND id = ?');
  const ids = [...new Set(character_ids)].filter((id) => own.get(s.campaign_id, id));
  db.transaction(() => {
    db.prepare('DELETE FROM session_attendance WHERE session_id = ?').run(sessionId);
    const ins = db.prepare('INSERT INTO session_attendance (session_id, character_id) VALUES (?, ?)');
    for (const id of ids) ins.run(sessionId, id);
    db.prepare('UPDATE sessions SET attendance_taken = 1 WHERE id = ?').run(sessionId);
  })();
  return attendance(db, sessionId)!;
}

/** How many sessions each of a campaign's characters was at, of those where the GM took attendance. */
export function attendanceCounts(db: DB, campaignId: number): { taken: number; by: Record<number, number> } {
  const taken = (db.prepare('SELECT COUNT(*) n FROM sessions WHERE campaign_id = ? AND attendance_taken = 1').get(campaignId) as { n: number }).n;
  const rows = db
    .prepare('SELECT a.character_id, COUNT(*) n FROM session_attendance a JOIN sessions s ON s.id = a.session_id WHERE s.campaign_id = ? GROUP BY a.character_id')
    .all(campaignId) as { character_id: number; n: number }[];
  return { taken, by: Object.fromEntries(rows.map((r) => [r.character_id, r.n])) };
}
