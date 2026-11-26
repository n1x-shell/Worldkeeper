import { dayOfYear, extraDay, festivalsOf, formatDate, moonPhase, seasonOf, weekday, type CalendarDef, type WDate } from '../../../shared/calendar';

/**
 * The world's year at a glance, through its calendar (shared/calendar.ts): its months and the days outside them, with
 * today marked, festivals and events on their days, and the first moon's full and new nights. Used by the GM's
 * calendar and the players' handbook.
 */
export interface CalEvent {
  day: number;
  year: number | null;
  title: string;
  kind: 'festival' | 'event';
}

const MOON_GLYPH = ['●', '◔', '◑', '◕', '○', '◕', '◐', '◔'];

export function TodayCard({ def, date }: { def: CalendarDef; date: WDate }) {
  const season = seasonOf(def, date.day);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <div className="font-display text-2xl text-gold">{formatDate(def, date)}</div>
      <div className="text-sm text-dim">{[def.weekdays[weekday(def, date)], season].filter(Boolean).join(', ')}</div>
      <div className="text-sm text-dim flex gap-3">
        {(def.moons ?? []).map((m) => {
          const p = moonPhase(def, date, m);
          return (
            <span key={m.name} title={m.look ? `${m.name} (${m.look})` : m.name}>
              {MOON_GLYPH[p.index]} {m.name}: {p.phase.toLowerCase()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarView({ def, date, events, onDay }: { def: CalendarDef; date: WDate; events: CalEvent[]; onDay?: (day: number) => void }) {
  const festivals = festivalsOf(def);
  const moon = def.moons?.[0];
  const on = (day: number) => [
    ...festivals.filter((f) => f.day === day).map((f) => ({ title: f.name, kind: 'festival' as const })),
    ...events.filter((e) => e.day === day && (e.year == null || e.year === date.year)),
  ];
  // Render functions, not components: a component made here would be new on every render and lose its state.
  const cell = (day: number, label: string) => {
    const items = on(day);
    const today = day === date.day;
    const phase = moon ? moonPhase(def, { year: date.year, day }, moon) : null;
    return (
      <button
        key={label}
        type="button"
        onClick={onDay ? () => onDay(day) : undefined}
        disabled={!onDay}
        title={[label, ...items.map((i) => i.title)].join('\n')}
        className={`relative h-9 rounded-sm text-[11px] text-left px-1 border ${today ? 'border-gold bg-gold/10 text-gold' : items.length ? 'border-arcane/50 bg-arcane/10' : 'border-transparent hover:border-line'} ${onDay ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="num">{label}</span>
        {phase && (phase.full || phase.dark) && <span className="absolute right-0.5 top-0 text-[9px] opacity-70">{phase.full ? '○' : '●'}</span>}
        {items.length > 0 && <span className="absolute left-1 bottom-0.5 right-1 truncate text-[9px] leading-tight text-arcane">{items[0].title}</span>}
      </button>
    );
  };
  const extra = (name: string) => {
    const day = extraDay(def, name)!;
    return (
      <div key={name} className="col-span-full">
        <div className={`rounded-sm border px-2 py-1 text-xs ${day === date.day ? 'border-gold bg-gold/10 text-gold' : 'border-gold/30'}`}>{cell(day, name)}</div>
      </div>
    );
  };
  const extrasAfter = (i: number) => (def.extraDays ?? []).filter((e) => e.after === i);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {def.months.map((m, mi) => (
        <div key={`${m.name}-${mi}`} className="rounded-md border border-line p-2">
          {mi === 0 && extrasAfter(-1).map((e) => extra(e.name))}
          <div className="text-xs uppercase tracking-widest text-dim my-1">{m.name}</div>
          <div className="grid grid-cols-6 gap-0.5">{Array.from({ length: m.days }, (_, i) => cell(dayOfYear(def, mi, i + 1), String(i + 1)))}</div>
          {extrasAfter(mi).map((e) => extra(e.name))}
        </div>
      ))}
    </div>
  );
}
