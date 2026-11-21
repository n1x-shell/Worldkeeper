import { useState } from 'react';
import { CalendarDays, Eye, EyeOff, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { askText, Card, Check, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Toggle } from '../components/ui';
import { CalendarView, TodayCard } from '../components/CalendarView';
import { NeedCampaign } from './Campaign';
import { EXTRA_DAYS, MONTHS, dayOfYear, formatDate, monthDay, type WDate } from '../../../shared/calendar';

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
  const { data, error, reload } = useApi<{ date: WDate; coming: Coming[] }>(activeCampaignId ? `/api/calendar?campaign_id=${activeCampaignId}&days=30` : null);
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
    reload();
  };
  const refresh = () => (reload(), reloadEvents());
  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" subtitle="The campaign's date, the festivals and your own events." note="One 363-day year on both continents (Calendar [SYS-901]). Click a day to add an event." />
      <Card featured className="space-y-3">
        <TodayCard date={data.date} />
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
        <CalendarView date={data.date} events={events.map((e) => ({ day: e.day, year: e.yearly ? null : e.year, title: e.title, kind: 'event' }))} onDay={setAdding} />
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
                      {formatDate(c.date, 'ab')}
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
                      <span className="text-xs text-dim">{formatDate({ year: e.year ?? data.date.year, day: e.day }, 'ab').replace(/, \d+ AB$/, e.yearly ? ', every year' : `, ${e.year} AB`)}</span>
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
      {adding != null && <AddEvent day={adding} year={data.date.year} campaignId={activeCampaignId} onClose={() => setAdding(null)} onAdded={refresh} />}
      {setting && <SetDate date={data.date} campaignId={activeCampaignId} onClose={() => setSetting(false)} onSet={refresh} />}
    </div>
  );
}

function AddEvent({ day, year, campaignId, onClose, onAdded }: { day: number; year: number; campaignId: number; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ title: '', notes: '', yearly: false, player_visible: false, year });
  return (
    <Modal title={`Add an event: ${formatDate({ year, day }, 'ab').replace(/, \d+ AB$/, '')}`} onClose={onClose}>
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
          <input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="The wedding at Varkhaal" />
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
              Year <input className="input w-24 py-0.5" type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) || year })} /> AB
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

function SetDate({ date, campaignId, onClose, onSet }: { date: WDate; campaignId: number; onClose: () => void; onSet: () => void }) {
  const md = monthDay(date.day);
  const [year, setYear] = useState(date.year);
  const [month, setMonth] = useState<string>('festival' in md ? `f:${md.festival}` : String(md.month));
  const [dom, setDom] = useState('festival' in md ? 1 : md.dom);
  const day = month.startsWith('f:') ? EXTRA_DAYS.find((e) => `f:${e.name}` === month)!.day : dayOfYear(Number(month), dom);
  return (
    <Modal title="Set the campaign's date" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="Month">
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
              {EXTRA_DAYS.map((e) => (
                <option key={e.name} value={`f:${e.name}`}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          {!month.startsWith('f:') && (
            <Field label="Day">
              <input className="input w-20" type="number" min={1} max={30} value={dom} onChange={(e) => setDom(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
            </Field>
          )}
          <Field label="Year (AB)">
            <input className="input w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || date.year)} />
          </Field>
        </div>
        <p className="text-sm text-dim">{formatDate({ year, day })}</p>
        <button
          className="btn-primary"
          onClick={async () => {
            await api.post('/api/calendar/date', { campaign_id: campaignId, date: { year, day } });
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
