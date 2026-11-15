/**
 * The campaign's calendar: its date, time passing, and the GM's own events (one-off or every year). Festivals and
 * moons come from shared/calendar.ts.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { makeCrud } from './crud.js';
import { FESTIVALS, addDays, formatDate, parseDate, upcoming, type WDate } from '../../../shared/calendar.js';

export const calendarEvents = makeCrud({
  table: 'calendar_events',
  schema: z.object({
    campaign_id: z.number().int(),
    year: z.number().int().min(1).max(100000).nullable().optional(),
    day: z.number().int().min(1).max(363),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(5000).default(''),
    yearly: z.boolean().default(false),
    player_visible: z.boolean().default(false),
  }),
  boolColumns: ['yearly', 'player_visible'],
  orderBy: 'year, day',
});

export function campaignDate(db: DB, campaignId: number): WDate {
  // "current_date" is quoted: unquoted, SQLite reads it as today's real date.
  const c = db.prepare('SELECT "current_date" FROM campaigns WHERE id = ?').get(campaignId) as { current_date: string } | undefined;
  if (!c) throw notFound('Campaign');
  return parseDate(c.current_date) ?? { year: 300, day: 1 };
}

/** Set the campaign's date, or move it on by some days. Notes it in the live session's log. */
export function setCampaignDate(db: DB, campaignId: number, opts: { date?: WDate; days?: number; reason?: string }) {
  const from = campaignDate(db, campaignId);
  const to = opts.date ?? addDays(from, opts.days ?? 0);
  if (to.day < 1 || to.day > 363 || to.year < 1) throw badRequest('Not a date in this calendar');
  const text = formatDate(to);
  db.prepare(`UPDATE campaigns SET "current_date" = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(text, campaignId);
  const live = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
  if (live && (opts.days ?? 0) !== 0)
    db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'note', ?)`).run(
      live.id,
      `${opts.days} day${opts.days === 1 ? '' : 's'} pass${opts.reason ? ` (${opts.reason})` : ''}. It is now ${text}.`,
    );
  return { date: to, text };
}

interface EventRow {
  id: number;
  year: number | null;
  day: number;
  title: string;
  notes: string;
  yearly: boolean;
  player_visible: boolean;
}

/** Festivals and the campaign's events in the next n days. Players get only the events shared with them. */
export function comingUp(db: DB, campaignId: number, n = 30, forPlayers = false) {
  const today = campaignDate(db, campaignId);
  const events = (calendarEvents.list(db, { campaign_id: campaignId }) as unknown as EventRow[]).filter((e) => !forPlayers || e.player_visible);
  const items = [
    ...FESTIVALS.map((f) => ({ kind: 'festival' as const, day: f.day, title: f.name, notes: f.what, where: f.where ?? null, year: null as number | null })),
    ...events.map((e) => ({ kind: 'event' as const, day: e.day, title: e.title, notes: forPlayers ? '' : e.notes, where: null, year: e.yearly ? null : e.year, id: e.id })),
  ];
  return upcoming(today, n, items).filter((x) => x.year == null || x.year === x.date.year);
}
