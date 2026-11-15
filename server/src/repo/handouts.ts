/**
 * Handouts: letters, read-aloud passages, maps and pictures the GM pushes to players during play. A handout is the
 * GM's until it's pushed; once pushed, players see it on their phones and keep it in their handbook.
 *
 * Also the players' live feed: while the active campaign has a live session, the turn order of the running encounter
 * (no monster numbers), and the newest pushed handout.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { makeCrud, zText } from './crud.js';
import { inPlay } from './exploration.js';
import { sortByInitiative, type Combatant } from '../../../shared/play.js';

export const handouts = makeCrud({
  table: 'handouts',
  schema: z.object({
    campaign_id: z.number().int(),
    title: z.string().trim().min(1).max(300),
    body: zText().default(''),
    image_file: z
      .string()
      .regex(/^[\w.-]+$/)
      .max(200)
      .nullable()
      .optional(),
  }),
  orderBy: 'pushed_at IS NULL DESC, pushed_at DESC, id DESC',
});

export function pushHandout(db: DB, id: number, pushed: boolean) {
  const h = db.prepare('SELECT id, campaign_id, title FROM handouts WHERE id = ?').get(id) as { id: number; campaign_id: number; title: string } | undefined;
  if (!h) throw notFound('Handout');
  const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(h.campaign_id) as { id: number } | undefined;
  db.transaction(() => {
    db.prepare(`UPDATE handouts SET pushed_at = ${pushed ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'NULL'}, session_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(
      pushed ? (live?.id ?? null) : null,
      id,
    );
    if (pushed && live) db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'handout', ?)`).run(live.id, `Handout given to the players: ${h.title}.`);
  })();
  return handouts.get(db, id);
}

/** Pushed handouts, newest first: what players have been given. */
export function playerHandouts(db: DB, campaignId: number) {
  return db.prepare('SELECT id, title, body, image_file, pushed_at FROM handouts WHERE campaign_id = ? AND pushed_at IS NOT NULL ORDER BY pushed_at DESC').all(campaignId) as {
    id: number;
    title: string;
    body: string;
    image_file: string | null;
    pushed_at: string;
  }[];
}

/**
 * The players' live feed. Nothing unless the active campaign has a live session. The running encounter's turn order
 * shows names as the GM set them for players, hides hidden and defeated combatants, and gives hit points for PCs only.
 */
export function playerLive(db: DB) {
  const play = inPlay(db);
  if (!play) return { live: false as const };
  const enc = db.prepare(`SELECT id, title, round, turn_index, combatants FROM encounters WHERE session_id = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1`).get(play.sessionId) as
    | { id: number; title: string; round: number; turn_index: number; combatants: string }
    | undefined;
  let fight = null;
  if (enc) {
    const list = parseJson<Combatant[]>(enc.combatants, []);
    const current = list[enc.turn_index];
    fight = {
      round: enc.round,
      order: sortByInitiative(list)
        .filter((c) => !c.hidden && !c.defeated)
        .map((c) => ({
          name: c.isPC ? c.name : (c as Combatant & { playerName?: string }).playerName || c.name,
          pc: c.isPC,
          current: !!current && c.id === current.id,
          hp: c.isPC ? { hp: c.hp, max: c.maxHp } : null,
        })),
    };
  }
  const latest = db.prepare('SELECT id, title FROM handouts WHERE campaign_id = ? AND pushed_at IS NOT NULL ORDER BY pushed_at DESC LIMIT 1').get(play.campaignId) as
    | { id: number; title: string }
    | undefined;
  return { live: true as const, fight, latest_handout: latest ?? null };
}
