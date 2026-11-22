/**
 * A date in a world's calendar (shared/calendar.ts): its month (or a day outside the months), the day of the month and
 * the year, written the calendar's first way. Used to set a campaign's date and where it started.
 */
import { useState } from 'react';
import { dayOfYear, extraDay, formatDate, monthDay, type CalendarDef, type WDate } from '../../../shared/calendar';
import { Field } from './ui';

export function DatePicker({ def, value, onChange }: { def: CalendarDef; value: WDate; onChange: (d: WDate) => void }) {
  const md = monthDay(def, value.day);
  const [month, setMonth] = useState<string>('festival' in md ? `x:${md.festival}` : String(md.month));
  const [dom, setDom] = useState('festival' in md ? 1 : md.dom);
  const [year, setYear] = useState(value.year);
  const days = month.startsWith('x:') ? 0 : (def.months[Number(month)]?.days ?? 1);
  const emit = (m: string, d: number, y: number) =>
    onChange({ year: y, day: m.startsWith('x:') ? (extraDay(def, m.slice(2)) ?? 1) : dayOfYear(def, Number(m), Math.min(d, def.months[Number(m)]?.days ?? 1)) });
  const yearLabel = (def.eras[0]?.format ?? 'Year {y}').replace('{y}', '…');
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Month">
          <select
            className="input"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              emit(e.target.value, dom, year);
            }}
          >
            {def.months.map((m, i) => (
              <option key={`${m.name}-${i}`} value={i}>
                {m.name}
              </option>
            ))}
            {(def.extraDays ?? []).map((e) => (
              <option key={e.name} value={`x:${e.name}`}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        {!month.startsWith('x:') && (
          <Field label="Day">
            <input
              className="input w-20"
              type="number"
              min={1}
              max={days}
              value={dom}
              onChange={(e) => {
                const d = Math.min(days, Math.max(1, Number(e.target.value) || 1));
                setDom(d);
                emit(month, d, year);
              }}
            />
          </Field>
        )}
        <Field label={`Year (${yearLabel})`}>
          <input
            className="input w-28"
            type="number"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value) || value.year;
              setYear(y);
              emit(month, dom, y);
            }}
          />
        </Field>
      </div>
      <p className="text-sm text-dim">{formatDate(def, value)}</p>
    </div>
  );
}
