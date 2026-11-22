/**
 * The campaign's calendar: its date, time passing, and the GM's own events (one-off or every year). The calendar
 * itself (months, festivals, moons) is the campaign's world's (calendars.ts).
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { makeCrud } from './crud.js';
import { addDays, festivalsOf, upcoming, yearDays, type CalendarDef, type WDate } from '../../../shared/calendar.js';
import { campaignCalendar, campaignDates, writeCampaignDate } from './calendars.js';

export const calendarEvents = makeCrud({
  table: 'calendar_events',
  schema: z.object({
    campaign_id: z.number().int(),
    year: z.number().int().min(1).max(100000).nullable().optional(),
    day: z.number().int().min(1).max(1000),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(5000).default(''),
    yearly: z.boolean().default(false),
    player_visible: z.boolean().default(false),
  }),
  boolColumns: ['yearly', 'player_visible'],
  orderBy: 'year, day',
  onChange: (db, row) => {
    if ((row.day as number) > yearDays(campaignCalendar(db, row.campaign_id as number))) throw badRequest('Not a day in this calendar');
  },
});

export const campaignDate = (db: DB, campaignId: number): WDate => campaignDates(db, campaignId).date;

/** Set the campaign's date, or move it on by some days. Notes it in the live session's log. */
export function setCampaignDate(db: DB, campaignId: number, opts: { date?: WDate; days?: number; reason?: string }) {
  const def = campaignCalendar(db, campaignId);
  const from = campaignDate(db, campaignId);
  const to = opts.date ?? addDays(def, from, opts.days ?? 0);
  const text = writeCampaignDate(db, campaignId, 'date', to);
  db.prepare(`UPDATE campaigns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(campaignId);
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
  const def: CalendarDef = campaignCalendar(db, campaignId);
  const today = campaignDate(db, campaignId);
  const events = (calendarEvents.list(db, { campaign_id: campaignId }) as unknown as EventRow[]).filter((e) => !forPlayers || e.player_visible);
  const items = [
    ...festivalsOf(def).map((f) => ({ kind: 'festival' as const, day: f.day, title: f.name, notes: f.what, where: f.where ?? null, year: null as number | null })),
    ...events.map((e) => ({ kind: 'event' as const, day: e.day, title: e.title, notes: forPlayers ? '' : e.notes, where: null, year: e.yearly ? null : e.year, id: e.id })),
  ];
  return upcoming(def, today, n, items).filter((x) => x.year == null || x.year === x.date.year);
}
