import { EXTRA_DAYS, FESTIVALS, MONTHS, MOONS, WEEKDAYS, dayOfYear, formatDate, moonPhase, seasonOf, weekday, type WDate } from '../../../shared/calendar';

/**
 * The world's year at a glance: twelve 30-day months and the three festival days, with today marked, festivals and
 * events on their days, and the Lamp's full and new moons. Used by the GM's calendar and the players' handbook.
 */
export interface CalEvent {
  day: number;
  year: number | null;
  title: string;
  kind: 'festival' | 'event';
}

const MOON_GLYPH = ['●', '◔', '◑', '◕', '○', '◕', '◐', '◔'];

export function TodayCard({ date }: { date: WDate }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <div className="font-display text-2xl text-gold">{formatDate(date)}</div>
      <div className="text-sm text-dim">
        {WEEKDAYS[weekday(date)]}, {seasonOf(date.day)}
      </div>
      <div className="text-sm text-dim flex gap-3">
        {MOONS.map((m) => {
          const p = moonPhase(date, m);
          return (
            <span key={m.name} title={`${m.name} (${m.look})`}>
              {MOON_GLYPH[p.index]} {m.name}: {p.phase.toLowerCase()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarView({ date, events, onDay }: { date: WDate; events: CalEvent[]; onDay?: (day: number) => void }) {
  const on = (day: number) => [
    ...FESTIVALS.filter((f) => f.day === day).map((f) => ({ title: f.name, kind: 'festival' as const })),
    ...events.filter((e) => e.day === day && (e.year == null || e.year === date.year)),
  ];
  const Cell = ({ day, label }: { day: number; label: string }) => {
    const items = on(day);
    const today = day === date.day;
    const lamp = moonPhase({ year: date.year, day }, MOONS[0]);
    return (
      <button
        type="button"
        onClick={onDay ? () => onDay(day) : undefined}
        disabled={!onDay}
        title={[label, ...items.map((i) => i.title)].join('\n')}
        className={`relative h-9 rounded text-[11px] text-left px-1 border ${today ? 'border-gold bg-gold/20 text-gold' : items.length ? 'border-arcane/50 bg-arcane/10' : 'border-transparent hover:border-line'} ${onDay ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="num">{label}</span>
        {(lamp.full || lamp.dark) && <span className="absolute right-0.5 top-0 text-[9px] opacity-70">{lamp.full ? '○' : '●'}</span>}
        {items.length > 0 && <span className="absolute left-1 bottom-0.5 right-1 truncate text-[9px] leading-tight text-arcane">{items[0].title}</span>}
      </button>
    );
  };
  const Festival = ({ day, name }: { day: number; name: string }) => (
    <div className="col-span-full">
      <div className={`rounded border px-2 py-1 text-xs ${day === date.day ? 'border-gold bg-gold/20 text-gold' : 'border-gold/30'}`}>
        <Cell day={day} label={name} />
      </div>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {MONTHS.map((m, mi) => (
        <div key={m} className="rounded-md border border-line p-2">
          {mi === 0 && <Festival day={EXTRA_DAYS[0].day} name={EXTRA_DAYS[0].name} />}
          {mi === 6 && <Festival day={EXTRA_DAYS[1].day} name={EXTRA_DAYS[1].name} />}
          <div className="text-xs uppercase tracking-widest text-dim my-1">{m}</div>
          <div className="grid grid-cols-6 gap-0.5">
            {Array.from({ length: 30 }, (_, i) => (
              <Cell key={i} day={dayOfYear(mi, i + 1)} label={String(i + 1)} />
            ))}
          </div>
          {mi === 10 && <Festival day={EXTRA_DAYS[2].day} name={EXTRA_DAYS[2].name} />}
        </div>
      ))}
    </div>
  );
}
