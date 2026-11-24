import { useState } from 'react';
import { CalendarDays, Eye, EyeOff, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { askText, Card, Check, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Toggle } from '../components/ui';
import { CalendarView, TodayCard } from '../components/CalendarView';
import { NeedCampaign } from './Campaign';
import { dayName, formatDate, formatYear, yearDays, type CalendarDef, type WDate } from '../../../shared/calendar';
import { DatePicker } from '../components/DatePicker';
import { WorldCalendar } from './WorldCalendar';

/** The campaign calendar: today's date, time passing, festivals, moons and the GM's own events. */
interface Coming {
  kind: 'festival' | 'event';
  title: string;
  notes: string;
  where: string | null;
  inDays: number;
  date: WDate;
}
interface Ev {
  id: number;
  year: number | null;
  day: number;
  title: string;
  notes: string;
  yearly: boolean;
  player_visible: boolean;
}

export function CalendarPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<{ def: CalendarDef; date: WDate; coming: Coming[] }>(activeCampaignId ? `/api/calendar?campaign_id=${activeCampaignId}&days=30` : null);
  const { data: events, reload: reloadEvents } = useApi<Ev[]>(activeCampaignId ? `/api/calendar-events?campaign_id=${activeCampaignId}` : null);
  const [adding, setAdding] = useState<number | null>(null);
  const [setting, setSetting] = useState(false);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !events) return <Loading />;
  const move = async (days: number) => {
    const reason = days >= 7 ? await askText({ title: 'Why does the time pass? (for the session log; optional)', confirmLabel: 'Pass the time' }) : '';
    if (reason === null) return;
    await api.post('/api/calendar/date', { campaign_id: activeCampaignId, days, reason });
    void reload();
  };
  const refresh = () => (reload(), reloadEvents());
  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" subtitle="The campaign's date, the festivals and your own events." note={`${data.def.name}: ${yearDays(data.def)} days a year. Click a day to add an event.`} />
      <Card featured className="space-y-3">
        <TodayCard def={data.def} date={data.date} />
        <div className="flex flex-wrap gap-1.5">
          {[1, 7, 30].map((d) => (
            <button key={d} className="btn text-sm" onClick={() => move(d)}>
              +{d} day{d === 1 ? '' : 's'}
            </button>
          ))}
          <button className="btn-ghost text-sm" onClick={() => move(-1)}>
            Back a day
          </button>
          <button className="btn-ghost text-sm" onClick={() => setSetting(true)}>
            <CalendarDays size={14} /> Set the date
          </button>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CalendarView def={data.def} date={data.date} events={events.map((e) => ({ day: e.day, year: e.yearly ? null : e.year, title: e.title, kind: 'event' }))} onDay={setAdding} />
        <div className="space-y-3">
          <Card title="The next 30 days">
            {data.coming.length ? (
              <ul className="text-sm space-y-2">
                {data.coming.map((c, i) => (
                  <li key={i}>
                    <div className="flex items-baseline gap-2">
                      <span className={`font-medium ${c.kind === 'festival' ? 'text-gold' : 'text-arcane'}`}>{c.title}</span>
                      <span className="text-xs text-dim ml-auto">{c.inDays === 0 ? 'today' : c.inDays === 1 ? 'tomorrow' : `in ${c.inDays} days`}</span>
                    </div>
                    <div className="text-xs text-dim">
                      {formatDate(data.def, c.date, 'short')}
                      {c.where ? `, ${c.where}` : ''}
                    </div>
                    {c.notes && <div className="text-xs">{c.notes}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty compact title="Nothing in the next month." />
            )}
          </Card>
          <Card title="Your events">
            {events.length ? (
              <ul className="text-sm space-y-1">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      {e.title}{' '}
                      <span className="text-xs text-dim">
                        {dayName(data.def, e.day)}, {e.yearly ? 'every year' : formatYear(data.def, e.year ?? data.date.year)}
                      </span>
                    </span>
                    <button
                      className="btn-ghost p-0.5"
                      title={e.player_visible ? 'Players see it' : 'Hidden from players'}
                      onClick={async () => (await api.patch(`/api/calendar-events/${e.id}`, { player_visible: !e.player_visible }), reloadEvents())}
                    >
                      {e.player_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button className="btn-ghost p-0.5 hover:text-danger" onClick={async () => (await api.del(`/api/calendar-events/${e.id}`), refresh())} aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty compact title="No events yet.">
                Click a day in the calendar to add one.
              </Empty>
            )}
          </Card>
        </div>
      </div>
      <WorldCalendar onChanged={refresh} />
      {adding != null && <AddEvent def={data.def} day={adding} year={data.date.year} campaignId={activeCampaignId} onClose={() => setAdding(null)} onAdded={refresh} />}
      {setting && <SetDate def={data.def} date={data.date} campaignId={activeCampaignId} onClose={() => setSetting(false)} onSet={refresh} />}
    </div>
  );
}

function AddEvent({ def, day, year, campaignId, onClose, onAdded }: { def: CalendarDef; day: number; year: number; campaignId: number; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ title: '', notes: '', yearly: false, player_visible: false, year });
  return (
    <Modal title={`Add an event: ${dayName(def, day)}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          await api.post('/api/calendar-events', { campaign_id: campaignId, day, ...f, year: f.yearly ? null : f.year });
          onAdded();
          onClose();
        }}
      >
        <Field label="What">
          <input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="The wedding at the castle" />
        </Field>
        <Field label="Notes (GM only)">
          <textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <Check checked={f.yearly} onChange={(v) => setF({ ...f, yearly: v })}>
            Every year
          </Check>
          {!f.yearly && (
            <label className="flex items-center gap-2">
              Year <input className="input w-24 py-0.5" type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) || year })} />{' '}
              <span className="text-dim">{formatYear(def, f.year)}</span>
            </label>
          )}
          <Toggle checked={f.player_visible} onChange={(v) => setF({ ...f, player_visible: v })}>
            Players see it
          </Toggle>
        </div>
        <button className="btn-primary" type="submit" disabled={!f.title.trim()}>
          Add
        </button>
      </form>
    </Modal>
  );
}

function SetDate({ def, date, campaignId, onClose, onSet }: { def: CalendarDef; date: WDate; campaignId: number; onClose: () => void; onSet: () => void }) {
  const [d, setD] = useState(date);
  return (
    <Modal title="Set the campaign's date" onClose={onClose}>
      <div className="space-y-3">
        <DatePicker def={def} value={d} onChange={setD} />
        <button
          className="btn-primary"
          onClick={async () => {
            await api.post('/api/calendar/date', { campaign_id: campaignId, date: d });
            onSet();
            onClose();
          }}
        >
          Set it
        </button>
      </div>
    </Modal>
  );
}
