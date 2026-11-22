/**
 * Each world's calendar (shared/calendar.ts): a setting pack's (written at every start for the worlds it names), one of
 * the presets, or the GM's own. A campaign uses its world's calendar; a world with none uses twelve months of thirty
 * days. Campaign dates are kept as a year and a day (campaigns.date_year/date_day, start_year/start_day).
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { CALENDAR_PRESETS, TWELVE_THIRTY, formatDate, isValidDate, parseDate, type CalendarDef, type WDate } from '../../../shared/calendar.js';

const monthSchema = z.object({ name: z.string().trim().min(1).max(60), days: z.number().int().min(1).max(400), season: z.string().trim().max(40).optional() });
export const calendarSchema = z.object({
  name: z.string().trim().min(1).max(100),
  about: z.string().max(2000).optional(),
  months: z.array(monthSchema).min(1).max(40),
  extraDays: z.array(z.object({ name: z.string().trim().min(1).max(60), after: z.number().int().min(-1).max(40), season: z.string().max(40).optional() })).max(40).optional(),
  weekdays: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  moons: z.array(z.object({ name: z.string().trim().min(1).max(60), cycle: z.number().min(1).max(10000), offset: z.number().min(0).max(10000), look: z.string().max(200).optional() })).max(10).optional(),
  eras: z
    .array(z.object({ format: z.string().trim().min(1).max(60).refine((f) => f.includes('{y}'), 'Write {y} where the year goes'), offset: z.number().int().optional() }))
    .min(1)
    .max(5),
  festivals: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        month: z.string().max(60).optional(),
        day: z.number().int().min(1).max(400).optional(),
        extra: z.string().max(60).optional(),
        god: z.string().max(100).optional(),
        where: z.string().max(100).optional(),
        what: z.string().max(2000).default(''),
      }),
    )
    .max(200)
    .optional(),
  startYear: z.number().int().optional(),
});

interface Row {
  id: string;
  name: string;
  def: string;
  pack_id: string | null;
}

const readDef = (r: Row | undefined): CalendarDef | null => (r ? parseJson<CalendarDef | null>(r.def, null) : null);

/** The world a campaign is set in ('world' when it names none). */
export function campaignWorld(db: DB, campaignId: number): string {
  const c = db.prepare('SELECT world_id FROM campaigns WHERE id = ?').get(campaignId) as { world_id: string | null } | undefined;
  if (!c) throw notFound('Campaign');
  return c.world_id ?? 'world';
}

/** A world's calendar: its own, else the nearest realm above it with one, else twelve months of thirty days. */
export function worldCalendar(db: DB, worldId = 'world'): { id: string | null; def: CalendarDef; pack_id: string | null } {
  let realm: string | null = worldId;
  for (let guard = 0; realm && guard < 10; guard++) {
    const r = db.prepare('SELECT calendar_id, parent_id FROM realms WHERE id = ?').get(realm) as { calendar_id: string | null; parent_id: string | null } | undefined;
    if (!r) break;
    if (r.calendar_id) {
      const row = db.prepare('SELECT * FROM calendars WHERE id = ?').get(r.calendar_id) as Row | undefined;
      const def = readDef(row);
      if (def) return { id: row!.id, def, pack_id: row!.pack_id };
    }
    realm = r.parent_id;
  }
  return { id: null, def: TWELVE_THIRTY, pack_id: null };
}

export const campaignCalendar = (db: DB, campaignId: number) => worldCalendar(db, campaignWorld(db, campaignId)).def;

/** Write a setting pack's calendar, and give it to the worlds it names that have none yet. */
export function syncPackCalendar(db: DB, packId: string, def: CalendarDef, worlds: string[]) {
  const id = `pack:${packId}`;
  db.prepare(
    `INSERT INTO calendars (id, name, def, pack_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, def = excluded.def, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(id, def.name, JSON.stringify(def), packId);
  for (const w of worlds) db.prepare('UPDATE realms SET calendar_id = ? WHERE id = ? AND calendar_id IS NULL').run(id, w);
}

/** Every world with its calendar, the presets, and the packs' calendars (for Calendar → the world's calendar). */
export function listCalendars(db: DB) {
  const worlds = db.prepare(`SELECT id, name FROM realms WHERE kind = 'world' AND archived = 0 ORDER BY sort_order, name`).all() as { id: string; name: string }[];
  return {
    worlds: worlds.map((w) => ({ ...w, calendar: worldCalendar(db, w.id) })),
    presets: CALENDAR_PRESETS,
    packs: (db.prepare('SELECT id, name, pack_id FROM calendars WHERE pack_id IS NOT NULL ORDER BY name').all() as Omit<Row, 'def'>[]).map((r) => ({ id: r.id, name: r.name, pack_id: r.pack_id })),
  };
}

/**
 * Give a world a calendar: a preset, a pack's (by id), or one written out. A world's own calendar is kept under its
 * own id, so a pack's update never changes it. Campaign dates stay on the same year and day.
 */
export function setWorldCalendar(db: DB, worldId: string, body: unknown) {
  const realm = db.prepare('SELECT id FROM realms WHERE id = ?').get(worldId);
  if (!realm) throw notFound('World');
  const b = z.object({ preset: z.string().optional(), calendar_id: z.string().optional(), def: z.unknown().optional() }).parse(body ?? {});
  if (b.calendar_id) {
    if (!db.prepare('SELECT 1 FROM calendars WHERE id = ?').get(b.calendar_id)) throw notFound('Calendar');
    db.prepare('UPDATE realms SET calendar_id = ? WHERE id = ?').run(b.calendar_id, worldId);
    return worldCalendar(db, worldId);
  }
  const def = b.preset ? CALENDAR_PRESETS.find((p) => p.key === b.preset)?.def : b.def ? (calendarSchema.parse(b.def) as CalendarDef) : undefined;
  if (!def) throw badRequest('Choose a preset or write the calendar');
  const id = `world:${worldId}`;
  db.prepare(
    `INSERT INTO calendars (id, name, def) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, def = excluded.def, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(id, def.name, JSON.stringify(def));
  db.prepare('UPDATE realms SET calendar_id = ? WHERE id = ?').run(id, worldId);
  return worldCalendar(db, worldId);
}

// ---------------------------------------------------------------- campaign dates

/** The campaign's date (and where it started), as a year and a day. */
export function campaignDates(db: DB, campaignId: number): { date: WDate; start: WDate } {
  const c = db.prepare('SELECT date_year, date_day, start_year, start_day FROM campaigns WHERE id = ?').get(campaignId) as
    | { date_year: number | null; date_day: number | null; start_year: number | null; start_day: number | null }
    | undefined;
  if (!c) throw notFound('Campaign');
  const def = campaignCalendar(db, campaignId);
  const first = { year: def.startYear ?? 1, day: 1 };
  const date = c.date_year != null ? { year: c.date_year, day: c.date_day ?? 1 } : first;
  const start = c.start_year != null ? { year: c.start_year, day: c.start_day ?? 1 } : date;
  return { date, start };
}

/** Write a campaign's date (and keep its text in step, for exports and older readers). */
export function writeCampaignDate(db: DB, campaignId: number, which: 'date' | 'start', d: WDate) {
  const def = campaignCalendar(db, campaignId);
  if (!isValidDate(def, d)) throw badRequest('Not a date in this calendar');
  const text = formatDate(def, d);
  if (which === 'date') db.prepare(`UPDATE campaigns SET date_year = ?, date_day = ?, "current_date" = ? WHERE id = ?`).run(d.year, d.day, text, campaignId);
  else db.prepare(`UPDATE campaigns SET start_year = ?, start_day = ?, starting_date = ? WHERE id = ?`).run(d.year, d.day, text, campaignId);
  return text;
}

/**
 * Campaigns from before structured dates (or made by an older import): read their text dates through their world's
 * calendar. A date the calendar can't read starts at its first year.
 */
export function adoptCampaignDates(db: DB) {
  let rows: { id: number; current_date: string; starting_date: string; date_year: number | null; start_year: number | null }[];
  try {
    rows = db.prepare(`SELECT id, "current_date", starting_date, date_year, start_year FROM campaigns WHERE date_year IS NULL OR start_year IS NULL`).all() as typeof rows;
  } catch {
    return; // a library from before migration 24
  }
  for (const r of rows) {
    const def = campaignCalendar(db, r.id);
    const first = { year: def.startYear ?? 1, day: 1 };
    const cur = parseDate(def, r.current_date ?? '') ?? first;
    const start = parseDate(def, r.starting_date ?? '') ?? cur;
    if (r.date_year == null) db.prepare('UPDATE campaigns SET date_year = ?, date_day = ? WHERE id = ?').run(cur.year, cur.day, r.id);
    if (r.start_year == null) db.prepare('UPDATE campaigns SET start_year = ?, start_day = ? WHERE id = ?').run(start.year, start.day, r.id);
  }
}

/**
 * After a campaign is saved: a text date that differs from what its year and day read as (typed in, or imported)
 * is read through the calendar; a blank or unreadable one is written out from the year and day.
 */
export function syncCampaignDateText(db: DB, campaignId: number) {
  const c = db.prepare(`SELECT "current_date", starting_date, date_year, start_year FROM campaigns WHERE id = ?`).get(campaignId) as
    | { current_date: string; starting_date: string; date_year: number | null; start_year: number | null }
    | undefined;
  if (!c) return;
  const def = campaignCalendar(db, campaignId);
  const { date, start } = campaignDates(db, campaignId);
  const typedStart = c.starting_date && c.starting_date !== formatDate(def, start) ? parseDate(def, c.starting_date) : null;
  const typedNow = c.current_date && c.current_date !== formatDate(def, date) ? parseDate(def, c.current_date) : null;
  const newStart = typedStart ?? start;
  // A new campaign with only a starting date starts on it.
  const newNow = typedNow ?? (c.date_year == null && typedStart ? typedStart : date);
  if (isValidDate(def, newStart)) writeCampaignDate(db, campaignId, 'start', newStart);
  if (isValidDate(def, newNow)) writeCampaignDate(db, campaignId, 'date', newNow);
}
