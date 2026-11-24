/**
 * Timeline rows players know (v0.7): a row is revealed like a record, to everyone (its own player_visible) or to one
 * campaign (campaign_timeline_reveals). A row marked SECRET is never revealed.
 */
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { RevealScope } from './reveals.js';

export const isSecretRow = (access: string) => /SECRET/i.test(access);

/** Each row's campaigns (besides everyone): row id → campaign ids. */
export function timelineCampaignReveals(db: DB): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const r of db.prepare('SELECT row_id, campaign_id FROM campaign_timeline_reveals ORDER BY campaign_id').all() as { row_id: number; campaign_id: number }[])
    out.set(r.row_id, [...(out.get(r.row_id) ?? []), r.campaign_id]);
  return out;
}

/** Reveal a row to everyone (campaignId null) or to one campaign, or take it back. */
export function revealTimelineRow(db: DB, rowId: number, campaignId: RevealScope, on: boolean) {
  const row = db.prepare('SELECT access FROM timeline_rows WHERE id = ?').get(rowId) as { access: string } | undefined;
  if (!row) throw notFound('Timeline row');
  if (on && isSecretRow(row.access)) throw badRequest('This event is marked SECRET: it is for the GM only and can’t be revealed');
  if (campaignId == null) db.prepare('UPDATE timeline_rows SET player_visible = ? WHERE id = ?').run(on ? 1 : 0, rowId);
  else {
    if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
    if (on) db.prepare('INSERT OR IGNORE INTO campaign_timeline_reveals (campaign_id, row_id) VALUES (?, ?)').run(campaignId, rowId);
    else db.prepare('DELETE FROM campaign_timeline_reveals WHERE campaign_id = ? AND row_id = ?').run(campaignId, rowId);
  }
  return {
    id: rowId,
    player_visible: !!(db.prepare('SELECT player_visible FROM timeline_rows WHERE id = ?').get(rowId) as { player_visible: number }).player_visible,
    campaigns: timelineCampaignReveals(db).get(rowId) ?? [],
  };
}

/** The rows revealed in a scope (everyone's, plus the campaign's), in the timeline's order; never a SECRET one. */
export function revealedTimelineRows(db: DB, scope: RevealScope) {
  return (
    db
      .prepare(
        `SELECT id, sort_order, time_label, event, year, day, access FROM timeline_rows
         WHERE player_visible = 1 OR id IN (SELECT row_id FROM campaign_timeline_reveals WHERE campaign_id = ?)
         ORDER BY sort_order, id`,
      )
      .all(scope) as { id: number; sort_order: number; time_label: string; event: string; year: number | null; day: number | null; access: string }[]
  ).filter((r) => !isSecretRow(r.access));
}

/**
 * Keep reveals across a re-import (or Apply additions), which replaces that origin's rows: what was revealed, by the
 * row's time and event. Returns a function that puts them back on the new rows.
 */
export function keepTimelineReveals(db: DB, origin: 'import' | 'additions' = 'import') {
  const key = (t: string, e: string) => `${t}\u0000${e}`;
  const everyone = new Set(
    (db.prepare(`SELECT time_label, event FROM timeline_rows WHERE origin = ? AND player_visible = 1`).all(origin) as { time_label: string; event: string }[]).map((r) => key(r.time_label, r.event)),
  );
  const campaigns = db.prepare(`SELECT r.campaign_id, t.time_label, t.event FROM campaign_timeline_reveals r JOIN timeline_rows t ON t.id = r.row_id WHERE t.origin = ?`).all(origin) as {
    campaign_id: number;
    time_label: string;
    event: string;
  }[];
  return () => {
    // Never onto a row the new archive marks SECRET.
    const find = db.prepare(`SELECT id FROM timeline_rows WHERE origin = ? AND time_label = ? AND event = ? AND upper(access) NOT LIKE '%SECRET%'`);
    for (const k of everyone) {
      const [t, e] = k.split('\u0000');
      for (const r of find.all(origin, t, e) as { id: number }[]) db.prepare('UPDATE timeline_rows SET player_visible = 1 WHERE id = ?').run(r.id);
    }
    for (const c of campaigns)
      for (const r of find.all(origin, c.time_label, c.event) as { id: number }[])
        db.prepare('INSERT OR IGNORE INTO campaign_timeline_reveals (campaign_id, row_id) VALUES (?, ?)').run(c.campaign_id, r.id);
  };
}
