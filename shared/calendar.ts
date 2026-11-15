/**
 * The world's calendar (Calendar [SYS-901]): one 363-day year on both continents, twelve 30-day months in four
 * seasons, three festival days outside the months, and seven-day weeks. Kaelmar counts After Bloom (AB); Aetheris
 * counts Unbound years from the broken Cycle (Unbound = AB − 269). Holy days are from Faith in Practice.
 *
 * A date is { year (AB), day (1 to 363) }. Day 1 is the Spring Equinox, New Year's Day.
 */
export const MONTHS = ['Spring Dawn', 'First Seed', 'Monsoon', 'Midnight Sun', 'Dry Wind', 'Harvest', 'Fall', 'Last Seed', 'Old Winds', 'Snowfall', 'Evernight', "Winter's Dusk"];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const YEAR_DAYS = 363;
export const UNBOUND_OFFSET = 269;

/** The three days outside the months, by their day of the year. */
export const EXTRA_DAYS: { day: number; name: string }[] = [
  { day: 1, name: 'Spring Equinox' },
  { day: 182, name: 'Autumn Equinox' },
  { day: 333, name: 'Evernight Festival' },
];

export interface WDate {
  year: number;
  day: number;
}

/** Day of the year for a month (0-11) and day of the month (1-30). */
export function dayOfYear(month: number, dom: number): number {
  // Spring Equinox before month 0; Autumn Equinox before month 6 (Fall); Evernight Festival after month 10 (Evernight).
  return 1 + month * 30 + dom + (month >= 6 ? 1 : 0) + (month >= 11 ? 1 : 0);
}

/** Month (0-11) and day of the month, or the festival day's name. */
export function monthDay(day: number): { month: number; dom: number } | { festival: string } {
  const extra = EXTRA_DAYS.find((e) => e.day === day);
  if (extra) return { festival: extra.name };
  let d = day - 1;
  if (day > 182) d -= 1;
  if (day > 333) d -= 1;
  return { month: Math.floor((d - 1) / 30), dom: ((d - 1) % 30) + 1 };
}

export function formatDate(d: WDate, style: 'ab' | 'both' = 'both'): string {
  const md = monthDay(d.day);
  const head = 'festival' in md ? md.festival : `${MONTHS[md.month]} ${md.dom}`;
  return style === 'ab' ? `${head}, ${d.year} AB` : `${head}, ${d.year} AB (Year ${d.year - UNBOUND_OFFSET} Unbound)`;
}

export function seasonOf(day: number): string {
  const md = monthDay(day);
  if ('festival' in md) return md.festival === 'Spring Equinox' ? 'Spring' : md.festival === 'Autumn Equinox' ? 'Autumn' : 'Winter';
  return SEASONS[Math.floor(md.month / 3)];
}

/** Day of the week, 0 to 6, counting from the Spring Equinox of 1 AB. */
export function weekday(d: WDate): number {
  return ((d.year - 1) * YEAR_DAYS + (d.day - 1)) % 7;
}
export const WEEKDAYS = ['First-day', 'Second-day', 'Third-day', 'Fourth-day', 'Fifth-day', 'Sixth-day', 'Rest-day'];

/**
 * Read a date written the usual ways: "Midnight Sun 15, 300 AB", "Evernight Festival, 300 AB", "Year 31 Unbound",
 * "300 AB / Year 31 Unbound". A year with no month means its first day.
 */
export function parseDate(text: string): WDate | null {
  const t = text.trim();
  let year: number | null = null;
  const ab = /(\d+)\s*AB/i.exec(t);
  const ub = /Year\s+(\d+)\s+Unbound/i.exec(t);
  if (ab) year = Number(ab[1]);
  else if (ub) year = Number(ub[1]) + UNBOUND_OFFSET;
  if (year == null) return null;
  for (const e of EXTRA_DAYS) if (t.toLowerCase().includes(e.name.toLowerCase())) return { year, day: e.day };
  // Longest month names first ("Evernight" must not match inside "Evernight Festival", handled above).
  const months = MONTHS.map((m, i) => ({ m, i })).sort((a, b) => b.m.length - a.m.length);
  for (const { m, i } of months) {
    const re = new RegExp(`${m.replace(/'/g, "'?")}\\s+(\\d{1,2})`, 'i');
    const hit = re.exec(t);
    if (hit) return { year, day: dayOfYear(i, Math.min(30, Math.max(1, Number(hit[1])))) };
  }
  return { year, day: 1 };
}

export function addDays(d: WDate, n: number): WDate {
  let total = (d.year - 1) * YEAR_DAYS + (d.day - 1) + n;
  if (total < 0) total = 0;
  return { year: Math.floor(total / YEAR_DAYS) + 1, day: (total % YEAR_DAYS) + 1 };
}

/** Days from a to b (negative if b is earlier). */
export function daysBetween(a: WDate, b: WDate): number {
  return (b.year - a.year) * YEAR_DAYS + (b.day - a.day);
}

export interface Festival {
  day: number;
  name: string;
  god?: string;
  where?: string;
  what: string;
}

/** The holy days and festivals of Faith in Practice. */
export const FESTIVALS: Festival[] = [
  { day: 1, name: 'First Light', god: 'Solenne', what: "New Year's Day. Lamps are put out the night before and relit at dawn from a neighbour's. Feuds are supposed to end." },
  { day: 1, name: 'Bloom Eve', where: 'Kaelmar', what: 'The night before, Kaelmar remembers the Shrouding. Families sit up with the doors shut, and open them together at dawn.' },
  { day: 2, name: 'First Morning', where: 'Aetheris', what: 'Nobody sleeps the night before. At dawn, people go outside to check the world is still there.' },
  { day: dayOfYear(1, 1), name: 'Seedwake', god: 'Orrowen', what: 'The first seed is sung into the ground.' },
  { day: dayOfYear(2, 1), name: 'The Sundering', god: 'Maruun', what: "The Drowned Saints mourn the sea's god at the docks. Everyone else stays home." },
  { day: dayOfYear(3, 15), name: 'Midsummer and the Red Games', god: 'Karrath', what: "Bonfires everywhere; the great tournament in Varkhaal's Great Arena." },
  { day: dayOfYear(4, 20), name: 'The Long Watch', god: 'Ithiel', what: 'A night of counting stars. Children learn to steer by them.' },
  { day: dayOfYear(5, 30), name: 'Harvest Home', god: 'Orrowen', what: 'The last sheaf is left in the field.' },
  { day: 182, name: 'Naming Day', god: 'Sephane', what: "The year's dead are named and carved on the Name Stones." },
  { day: dayOfYear(8, 30), name: 'Masking Night', god: 'Ellun', what: 'Masks in the street, and nothing done behind one counts. A week long in Noctis.' },
  { day: 333, name: 'Evernight', what: 'The longest night. Every household keeps a light burning till dawn, and nobody travels. In Ashvale, the keeping song is sung at the stones all night.' },
];

/** What falls in the next n days (today included). */
export function upcoming<T extends { day: number }>(today: WDate, n: number, items: T[]): (T & { inDays: number; date: WDate })[] {
  const out: (T & { inDays: number; date: WDate })[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today, i);
    for (const it of items) if (it.day === d.day) out.push({ ...it, inDays: i, date: d });
  }
  return out;
}

/**
 * The moons (The Moons [COS-035]). Phases follow a fixed cycle counted from
 * the Spring Equinox of 1 AB.
 */
export const MOONS = [
  { name: 'The Lamp', cycle: 30, offset: 0, look: 'large and white' },
  { name: 'The Wanderer', cycle: 49, offset: 11, look: 'small and red' },
];
const PHASES = ['New', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

export function moonPhase(d: WDate, moon: (typeof MOONS)[number]): { phase: string; index: number; full: boolean; dark: boolean } {
  const abs = (d.year - 1) * YEAR_DAYS + (d.day - 1) + moon.offset;
  const into = abs % moon.cycle;
  const index = Math.round((into / moon.cycle) * 8) % 8;
  // Full and new are single nights: the day nearest the exact point.
  const full = Math.abs(into - moon.cycle / 2) < 0.5 || (moon.cycle % 2 === 1 && into === Math.floor(moon.cycle / 2));
  const dark = into === 0;
  return { phase: full ? 'Full' : dark ? 'New' : PHASES[index], index: full ? 4 : dark ? 0 : index, full, dark };
}
