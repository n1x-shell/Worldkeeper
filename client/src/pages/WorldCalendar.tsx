/**
 * Calendar → each world's calendar (shared/calendar.ts): its setting pack's, a preset (twelve months of thirty days,
 * or like ours), or one of the GM's own, written out line by line. Changing a calendar keeps every campaign on the
 * same year and day; only how the date reads changes.
 */
import { useState } from 'react';
import { CalendarCog } from 'lucide-react';
import { yearDays, type CalendarDef } from '../../../shared/calendar';
import { api, useApi } from '../lib/api';
import { Badge, Card, ErrorBox, Field, Modal, ask } from '../components/ui';

interface Listing {
  worlds: { id: string; name: string; calendar: { id: string | null; def: CalendarDef; pack_id: string | null } }[];
  presets: { key: string; def: CalendarDef }[];
  packs: { id: string; name: string; pack_id: string }[];
}

export function WorldCalendar({ onChanged }: { onChanged: () => void }) {
  const { data, reload } = useApi<Listing>('/api/calendars');
  const [editing, setEditing] = useState<{ world: string; def: CalendarDef } | null>(null);
  if (!data) return null;
  const choose = async (world: string, body: object) => {
    if (!(await ask({ title: 'Change this world’s calendar?', body: 'Campaigns keep the same year and day; their dates are read the new way.', confirmLabel: 'Change it' }))) return;
    await api.put(`/api/calendars/${world}`, body);
    await reload();
    onChanged();
  };
  return (
    <Card title="The world's calendar" icon={<CalendarCog size={14} />} className="space-y-3">
      {data.worlds.map((w) => {
        const c = w.calendar;
        const source = c.pack_id ? 'From your worldbook' : c.id ? 'Your own' : 'The default';
        return (
          <div key={w.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{w.name}:</span> <span>{c.def.name}</span> <Badge tone={c.pack_id ? 'arcane' : 'dim'}>{source}</Badge>
              <span className="text-xs text-dim">
                {c.def.months.length} months, {yearDays(c.def)} days a year, {c.def.weekdays.length}-day weeks
              </span>
            </div>
            {c.def.about && <p className="text-xs text-dim">{c.def.about}</p>}
            <div className="flex flex-wrap gap-1.5">
              {data.packs
                .filter((p) => p.id !== c.id)
                .map((p) => (
                  <button key={p.id} className="btn text-sm" onClick={() => void choose(w.id, { calendar_id: p.id })}>
                    Use {p.name}
                  </button>
                ))}
              {data.presets.map((p) => (
                <button key={p.key} className="btn text-sm" onClick={() => void choose(w.id, { preset: p.key })}>
                  {p.def.name}
                </button>
              ))}
              <button className="btn-ghost text-sm" onClick={() => setEditing({ world: w.id, def: c.def })}>
                Edit as your own…
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <CalendarEditor
          def={editing.def}
          onClose={() => setEditing(null)}
          onSave={async (def) => {
            await api.put(`/api/calendars/${editing.world}`, { def });
            setEditing(null);
            await reload();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// ---- The editor: each part of the calendar as lines of text ----

const lines = (t: string) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const parts = (l: string, sep = ',') => l.split(sep).map((p) => p.trim());

function toText(def: CalendarDef) {
  return {
    name: def.name,
    months: def.months.map((m) => [m.name, m.days, m.season].filter((x) => x !== undefined && x !== '').join(', ')).join('\n'),
    extra: (def.extraDays ?? []).map((e) => [e.name, e.after < 0 ? 'start' : (def.months[e.after]?.name ?? e.after), e.season ?? ''].filter(Boolean).join(', ')).join('\n'),
    weekdays: def.weekdays.join(', '),
    eras: def.eras.map((e) => (e.offset ? `${e.format}, ${e.offset}` : e.format)).join('\n'),
    moons: (def.moons ?? []).map((m) => [m.name, m.cycle, m.offset, m.look ?? ''].filter((x) => x !== '').join(', ')).join('\n'),
    festivals: (def.festivals ?? []).map((f) => [f.name, f.extra ?? (f.month ? `${f.month} ${f.day ?? 1}` : `day ${f.day ?? 1}`), f.what].join(' | ')).join('\n'),
    startYear: String(def.startYear ?? 1),
  };
}

function fromText(t: ReturnType<typeof toText>, base: CalendarDef): CalendarDef {
  const months = lines(t.months).map((l) => {
    const [name, days, season] = parts(l);
    return { name, days: Number(days) || 30, ...(season ? { season } : {}) };
  });
  const monthIndex = (s: string) => (s === 'start' ? -1 : months.findIndex((m) => m.name.toLowerCase() === s.toLowerCase()));
  const extras = lines(t.extra).map((l) => {
    const [name, after, season] = parts(l);
    return { name, after: monthIndex(after ?? 'start'), ...(season ? { season } : {}) };
  });
  return {
    ...base,
    name: t.name.trim() || 'My calendar',
    months,
    extraDays: extras,
    weekdays: parts(t.weekdays).filter(Boolean),
    eras: lines(t.eras).map((l) => {
      const [format, offset] = parts(l);
      return { format, ...(Number(offset) ? { offset: Number(offset) } : {}) };
    }),
    moons: lines(t.moons).map((l) => {
      const [name, cycle, offset, look] = parts(l);
      return { name, cycle: Number(cycle) || 30, offset: Number(offset) || 0, ...(look ? { look } : {}) };
    }),
    festivals: lines(t.festivals).map((l) => {
      const [name, when = '', what = ''] = parts(l, '|');
      const extra = extras.find((e) => e.name.toLowerCase() === when.toLowerCase());
      const m = /^(.*?)\s+(\d+)$/.exec(when);
      const day = /^day\s+(\d+)$/i.exec(when);
      return extra ? { name, extra: extra.name, what } : day ? { name, day: Number(day[1]), what } : m ? { name, month: m[1], day: Number(m[2]), what } : { name, month: when, day: 1, what };
    }),
    startYear: Number(t.startYear) || 1,
  };
}

function CalendarEditor({ def, onClose, onSave }: { def: CalendarDef; onClose: () => void; onSave: (def: CalendarDef) => Promise<void> }) {
  const [t, setT] = useState(() => toText(def));
  const [err, setErr] = useState<string | null>(null);
  const area = (key: keyof typeof t, label: string, hint: string, rows = 4) => (
    <Field label={label} hint={hint}>
      <textarea className="input font-mono text-xs" rows={rows} value={t[key]} onChange={(e) => setT({ ...t, [key]: e.target.value })} />
    </Field>
  );
  return (
    <Modal title="Your own calendar" onClose={onClose} wide>
      <div className="space-y-3">
        {err && <ErrorBox error={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          </Field>
          <Field label="A new campaign starts in year" hint="As the first way of writing years counts.">
            <input className="input" type="number" value={t.startYear} onChange={(e) => setT({ ...t, startYear: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {area('months', 'Months', 'One a line: name, days, season.', 8)}
          {area('extra', 'Days outside the months', 'One a line: name, the month it follows (or "start"), season.', 8)}
        </div>
        <Field label="Weekdays" hint="In order, with commas.">
          <input className="input" value={t.weekdays} onChange={(e) => setT({ ...t, weekdays: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {area('eras', 'How years are written', 'One a line: the format with {y} for the year ("{y} AR"), and how many years it counts behind the first (optional). The first is the main one.', 3)}
          {area('moons', 'Moons', 'One a line: name, days from new moon to new moon, days into its cycle on the first day of year 1, how it looks.', 3)}
        </div>
        {area('festivals', 'Festivals', 'One a line: name | when ("Harvest 30", a day outside the months, or "day 12") | what happens.', 6)}
        <button
          className="btn-primary"
          onClick={async () => {
            try {
              setErr(null);
              await onSave(fromText(t, def));
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          Save the calendar
        </button>
      </div>
    </Modal>
  );
}
