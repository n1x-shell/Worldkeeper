/**
 * Calendars as data (docs/OWN_WORLD_PLAN.md §2.10, step 5). Each world has a calendar definition: its months (names
 * and lengths, and their seasons), days outside the months, weekdays, moons, how years are written, and its yearly
 * festivals. A setting pack brings its own (the Worldkeeper setting's: packs/worldkeeper/calendar.json); a new world
 * picks a preset or writes its own. Everything here takes the definition: nothing assumes any one world's year.
 *
 * A date is { year, day }: the year as the calendar's first way of writing it counts, and the day of that year (1 is
 * the first day of the year).
 */

export interface CalendarMonth {
  name: string;
  days: number;
  season?: string;
}

/** A day outside the months (an equinox, a festival day), after the month at this index (-1: before the first). */
export interface CalendarExtraDay {
  name: string;
  after: number;
  season?: string;
}

export interface CalendarMoon {
  name: string;
  /** Days from one new moon to the next. */
  cycle: number;
  /** Days into its cycle on the first day of year 1. */
  offset: number;
  look?: string;
}

/** A way of writing years: "{y} AB", "Year {y} Unbound". The year shown is the date's year minus the offset. */
export interface CalendarEra {
  format: string;
  offset?: number;
}

export interface FestivalSpec {
  name: string;
  /** When: a month (by name) and its day, a day outside the months (by name), or a day of the year. */
  month?: string;
  day?: number;
  extra?: string;
  god?: string;
  where?: string;
  what: string;
}

export interface CalendarDef {
  name: string;
  about?: string;
  months: CalendarMonth[];
  extraDays?: CalendarExtraDay[];
  weekdays: string[];
  moons?: CalendarMoon[];
  /** The first is how dates are written; the others are shown alongside ("both") and read too. */
  eras: CalendarEra[];
  festivals?: FestivalSpec[];
  /** The year a new campaign starts in. */
  startYear?: number;
}

export interface WDate {
  year: number;
  day: number;
}

export interface Festival {
  day: number;
  name: string;
  god?: string;
  where?: string;
  what: string;
}

// ---------------------------------------------------------------- presets

const plainMonths = (names: string[], days: number[], seasons: string[]): CalendarMonth[] => names.map((name, i) => ({ name, days: days[i], season: seasons[i] }));
const QUARTERS = ['Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter', 'Winter', 'Winter'];

/** Twelve months of thirty days, seven-day weeks, one moon. */
export const TWELVE_THIRTY: CalendarDef = {
  name: 'Twelve months of thirty days',
  months: plainMonths(
    ['First Month', 'Second Month', 'Third Month', 'Fourth Month', 'Fifth Month', 'Sixth Month', 'Seventh Month', 'Eighth Month', 'Ninth Month', 'Tenth Month', 'Eleventh Month', 'Twelfth Month'],
    Array(12).fill(30),
    QUARTERS,
  ),
  weekdays: ['First-day', 'Second-day', 'Third-day', 'Fourth-day', 'Fifth-day', 'Sixth-day', 'Rest-day'],
  moons: [{ name: 'The Moon', cycle: 30, offset: 0 }],
  eras: [{ format: 'Year {y}' }],
  startYear: 1,
};

/** Like ours: January to December (no leap years), Monday to Sunday, one moon. */
export const LIKE_OURS: CalendarDef = {
  name: 'Like ours',
  months: plainMonths(
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'],
  ),
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  moons: [{ name: 'The Moon', cycle: 29.53, offset: 0 }],
  eras: [{ format: 'Year {y}' }],
  startYear: 1,
};

export const CALENDAR_PRESETS: { key: string; def: CalendarDef }[] = [
  { key: 'twelve-thirty', def: TWELVE_THIRTY },
  { key: 'like-ours', def: LIKE_OURS },
];

// ---------------------------------------------------------------- the year

/** The year's days in order: each a month day or a day outside the months. */
interface Slot {
  month: number;
  dom: number;
  extra?: string;
  season?: string;
}
const slotCache = new WeakMap<CalendarDef, Slot[]>();
function slots(def: CalendarDef): Slot[] {
  let s = slotCache.get(def);
  if (s) return s;
  s = [];
  const extrasAfter = (i: number) => (def.extraDays ?? []).filter((e) => e.after === i);
  for (const e of extrasAfter(-1)) s.push({ month: -1, dom: 0, extra: e.name, season: e.season });
  def.months.forEach((m, i) => {
    for (let d = 1; d <= m.days; d++) s!.push({ month: i, dom: d, season: m.season });
    for (const e of extrasAfter(i)) s!.push({ month: i, dom: 0, extra: e.name, season: e.season ?? m.season });
  });
  slotCache.set(def, s);
  return s;
}

export const yearDays = (def: CalendarDef) => Math.max(1, slots(def).length);

/** Day of the year for a month (0-based) and its day (1-based). */
export function dayOfYear(def: CalendarDef, month: number, dom: number): number {
  const i = slots(def).findIndex((s) => !s.extra && s.month === month && s.dom === dom);
  return i < 0 ? 1 : i + 1;
}

/** The day of a day outside the months, by name. */
export const extraDay = (def: CalendarDef, name: string) => {
  const i = slots(def).findIndex((s) => s.extra?.toLowerCase() === name.toLowerCase());
  return i < 0 ? null : i + 1;
};

/** Month (0-based) and day of the month, or the name of a day outside the months. */
export function monthDay(def: CalendarDef, day: number): { month: number; dom: number } | { festival: string } {
  const s = slots(def)[Math.min(Math.max(day, 1), yearDays(def)) - 1];
  if (!s) return { month: 0, dom: 1 };
  return s.extra ? { festival: s.extra } : { month: s.month, dom: s.dom };
}

export function seasonOf(def: CalendarDef, day: number): string {
  return slots(def)[Math.min(Math.max(day, 1), yearDays(def)) - 1]?.season ?? '';
}

/** The seasons, in the order the year meets them. */
export const seasonsOf = (def: CalendarDef) => [...new Set(def.months.map((m) => m.season).filter((s): s is string => !!s))];

// ---------------------------------------------------------------- years

const yearIn = (era: CalendarEra, year: number) => era.format.replace('{y}', String(year - (era.offset ?? 0)));

export function formatYear(def: CalendarDef, year: number, style: 'short' | 'both' = 'short'): string {
  const [first, ...rest] = def.eras.length ? def.eras : [{ format: 'Year {y}' }];
  const main = yearIn(first, year);
  return style === 'both' && rest.length ? `${main} (${rest.map((e) => yearIn(e, year)).join(', ')})` : main;
}

/** "Midsummer 15, 300 AB (Year 31 Unbound)"; 'short' leaves out the other ways of writing the year. */
export function formatDate(def: CalendarDef, d: WDate, style: 'short' | 'both' = 'both'): string {
  return `${dayName(def, d.day)}, ${formatYear(def, d.year, style)}`;
}

/** The day without its year: "Midsummer 15", or a festival day's name. */
export function dayName(def: CalendarDef, day: number): string {
  const md = monthDay(def, day);
  return 'festival' in md ? md.festival : `${def.months[md.month]?.name ?? ''} ${md.dom}`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Read a date written the calendar's ways: "Midsummer 15, 300 AB", "Evernight Festival, 300 AB", "Year 31 Unbound",
 * "300 AB / Year 31 Unbound". A year with no month means its first day.
 */
export function parseDate(def: CalendarDef, text: string): WDate | null {
  const t = text.trim();
  let year: number | null = null;
  for (const era of def.eras) {
    const pattern = escape(era.format).replace('\\{y\\}', '(-?\\d+)');
    // A format that is only the year ("{y}") reads a number at the end.
    const re = new RegExp(era.format.trim() === '{y}' ? '(-?\\d+)\\s*$' : pattern, 'i');
    const m = re.exec(t);
    if (m) {
      year = Number(m[1]) + (era.offset ?? 0);
      break;
    }
  }
  if (year == null) return null;
  for (const e of def.extraDays ?? []) if (t.toLowerCase().includes(e.name.toLowerCase())) return { year, day: extraDay(def, e.name)! };
  // Longest month names first, so "Evernight" doesn't match inside a longer name.
  const months = def.months.map((m, i) => ({ m: m.name, i })).sort((a, b) => b.m.length - a.m.length);
  for (const { m, i } of months) {
    const hit = new RegExp(`${escape(m).replace(/'/g, "'?")}\\s+(\\d{1,3})`, 'i').exec(t);
    if (hit) return { year, day: dayOfYear(def, i, Math.min(def.months[i].days, Math.max(1, Number(hit[1])))) };
  }
  return { year, day: 1 };
}

// ---------------------------------------------------------------- counting days

/** Days since the first day of year 1 (negative before it). */
const absolute = (def: CalendarDef, d: WDate) => (d.year - 1) * yearDays(def) + (d.day - 1);

export function addDays(def: CalendarDef, d: WDate, n: number): WDate {
  const yd = yearDays(def);
  const total = absolute(def, d) + n;
  return { year: Math.floor(total / yd) + 1, day: (((total % yd) + yd) % yd) + 1 };
}

/** Days from a to b (negative if b is earlier). */
export const daysBetween = (def: CalendarDef, a: WDate, b: WDate) => absolute(def, b) - absolute(def, a);

/** Day of the week, 0-based, counting from the first day of year 1. */
export function weekday(def: CalendarDef, d: WDate): number {
  const n = Math.max(1, def.weekdays.length);
  return ((absolute(def, d) % n) + n) % n;
}

export const isValidDate = (def: CalendarDef, d: WDate | null | undefined): d is WDate => !!d && Number.isInteger(d.year) && Number.isInteger(d.day) && d.day >= 1 && d.day <= yearDays(def);

// ---------------------------------------------------------------- festivals and moons

/** The calendar's festivals, each on its day of the year. */
export function festivalsOf(def: CalendarDef): Festival[] {
  return (def.festivals ?? []).flatMap((f) => {
    let day: number | null = null;
    if (f.extra) day = extraDay(def, f.extra);
    else if (f.month) {
      const i = def.months.findIndex((m) => m.name.toLowerCase() === f.month!.toLowerCase());
      if (i >= 0) day = dayOfYear(def, i, Math.min(def.months[i].days, f.day ?? 1));
    } else if (f.day) day = f.day;
    return day ? [{ day, name: f.name, god: f.god, where: f.where, what: f.what }] : [];
  });
}

/** What falls in the next n days (today included). */
export function upcoming<T extends { day: number }>(def: CalendarDef, today: WDate, n: number, items: T[]): (T & { inDays: number; date: WDate })[] {
  const out: (T & { inDays: number; date: WDate })[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(def, today, i);
    for (const it of items) if (it.day === d.day) out.push({ ...it, inDays: i, date: d });
  }
  return out;
}

const PHASES = ['New', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

export function moonPhase(def: CalendarDef, d: WDate, moon: CalendarMoon): { phase: string; index: number; full: boolean; dark: boolean } {
  const abs = absolute(def, d) + moon.offset;
  const into = ((abs % moon.cycle) + moon.cycle) % moon.cycle;
  const index = Math.round((into / moon.cycle) * 8) % 8;
  // Full and new are single nights: the day nearest the exact point.
  const full = Math.abs(into - moon.cycle / 2) < 0.5 || (moon.cycle % 2 === 1 && into === Math.floor(moon.cycle / 2));
  const dark = into < 1;
  return { phase: full ? 'Full' : dark ? 'New' : PHASES[index], index: full ? 4 : dark ? 0 : index, full, dark };
}
