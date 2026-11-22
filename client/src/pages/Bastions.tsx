import { useState } from 'react';
import { Castle, Hourglass, Plus, Trash2 } from 'lucide-react';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import { ask, AutoTextarea, Badge, Card, DataTable, Empty, EntityLink, ErrorBox, Field, Loading, PageHeader, SaveStatus, Section } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { NeedCampaign } from './Campaign';
import { BASIC_FACILITIES, ORDERS, SPACES, SPECIAL_FACILITIES, specialSlots } from '../../../shared/bastions';

/**
 * Bastions and downtime (Dungeon Master's Guide, 2024). The app keeps track; the book has the rules. A Bastion in a
 * faction's camp needs Trusted standing with that faction.
 */
interface Facility {
  id: string;
  name: string;
  kind: 'special' | 'basic';
  space: string;
  hirelings: number;
  order: string;
  notes: string;
}
interface Bastion {
  id: number;
  name: string;
  owner: string;
  location_id: string | null;
  host_faction_id: string | null;
  gold: number;
  defenders: number;
  facilities: Facility[];
  notes: string;
}
interface Turn {
  id: number;
  number: number;
  orders: { facility: string; order: string }[];
  event: string;
  notes: string;
  created_at: string;
}
interface Downtime {
  id: number;
  character: string;
  activity: string;
  days: number;
  cost_gp: number;
  result: string;
}

export function BastionsPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<Bastion[]>(activeCampaignId ? `/api/bastions?campaign_id=${activeCampaignId}` : null);
  const { data: chars } = useApi<{ name: string; level: number; kind: string }[]>(activeCampaignId ? `/api/characters?campaign_id=${activeCampaignId}` : null);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const pcs = (chars ?? []).filter((c) => c.kind === 'pc');
  const level = pcs.length ? Math.round(pcs.reduce((n, c) => n + c.level, 0) / pcs.length) : 1;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bastions and Downtime"
        subtitle={`The party's strongholds, and what they do between adventures. Party level ${level}.`}
        note="Tracks Bastions as the Dungeon Master's Guide (2024) describes them; the rules are in the book. Bastions start at level 5. One in a faction's camp needs Trusted standing with it."
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              await api.post('/api/bastions', {
                campaign_id: activeCampaignId,
                name: 'A new Bastion',
                facilities: BASIC_FACILITIES.slice(0, 2).map((name, i) => ({ id: `b${i}`, name, kind: 'basic', space: 'Roomy' })),
              });
              reload();
            }}
          >
            <Plus size={14} /> New Bastion
          </button>
        }
      />
      {level < 5 && <p className="text-sm text-dim">The party gains a Bastion at level 5. You can set one up ahead of time.</p>}
      {!data.length && <Empty title="No Bastions yet.">Use New Bastion to set up the party's stronghold.</Empty>}
      {data.map((b) => (
        <BastionCard key={b.id} b={b} level={level} onDelete={reload} />
      ))}
      <DowntimeLog campaignId={activeCampaignId} characters={pcs.map((c) => c.name)} />
    </div>
  );
}

function BastionCard({ b: init, level, onDelete }: { b: Bastion; level: number; onDelete: () => void }) {
  const [b, setB] = useState(init);
  const auto = useAutosave((x: Bastion) =>
    api.patch(`/api/bastions/${x.id}`, {
      name: x.name,
      owner: x.owner,
      location_id: x.location_id,
      host_faction_id: x.host_faction_id,
      gold: x.gold,
      defenders: x.defenders,
      facilities: x.facilities,
      notes: x.notes,
    }),
  );
  const { data: host, reload: reloadHost } = useApi<{ name: string; rank: string; renown: number; welcome: boolean } | null>(`/api/bastions/${b.id}/host`);
  const { data: turns, reload: reloadTurns } = useApi<Turn[]>(`/api/bastions/${b.id}/turns`);
  const [event, setEvent] = useState('');
  const set = (p: Partial<Bastion>) => {
    const n = { ...b, ...p };
    setB(n);
    auto.schedule(n);
  };
  const setF = (id: string, p: Partial<Facility>) => set({ facilities: b.facilities.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const specials = b.facilities.filter((f) => f.kind === 'special');
  const slots = specialSlots(level);
  const available = SPECIAL_FACILITIES.filter((f) => f.level <= level && !b.facilities.some((x) => x.name === f.name));
  const addFacility = (name: string, kind: 'special' | 'basic') =>
    set({ facilities: [...b.facilities, { id: Math.random().toString(36).slice(2, 10), name, kind, space: 'Roomy', hirelings: kind === 'special' ? 1 : 0, order: '', notes: '' }] });
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Castle size={18} className="text-gold" />
        <input className="input font-display text-lg text-gold flex-1 min-w-[12rem]" value={b.name} onChange={(e) => set({ name: e.target.value })} aria-label="Bastion name" />
        <SaveStatus state={auto.state} error={auto.error} />
        <button
          className="btn-ghost hover:text-danger"
          onClick={async () => {
            if (!(await ask({ body: `Delete ${b.name} and its turns?`, danger: true, confirmLabel: 'Delete' }))) return;
            await api.del(`/api/bastions/${b.id}`);
            onDelete();
          }}
          aria-label="Delete Bastion"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <Field label="Whose">
          <input className="input" value={b.owner} onChange={(e) => set({ owner: e.target.value })} placeholder="The party" />
        </Field>
        <Field label="Where">
          <EntityPicker value={b.location_id} types={['@place']} onChange={(id) => set({ location_id: id })} />
        </Field>
        <Field
          label="In whose camp"
          hint={
            host ? (
              <span className={host.welcome ? 'text-gold' : 'text-danger'}>
                {host.welcome ? `${host.rank} with ${host.name}: welcome.` : `${host.rank} with ${host.name}: they want Trusted (10).`}
              </span>
            ) : undefined
          }
        >
          <EntityPicker
            value={b.host_faction_id}
            types={['faction']}
            onChange={(id) => {
              set({ host_faction_id: id });
              window.setTimeout(reloadHost, 1200);
            }}
          />
        </Field>
        <Field label="Gold (gp)">
          <input className="input" type="number" value={b.gold} onChange={(e) => set({ gold: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Defenders">
          <input className="input" type="number" min={0} value={b.defenders} onChange={(e) => set({ defenders: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <table className="table data-table">
          <thead>
            <tr>
              <th scope="col">Facility</th>
              <th scope="col">Space</th>
              <th scope="col">Hirelings</th>
              <th scope="col">Order this turn</th>
              <th scope="col">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {b.facilities.map((f) => (
              <tr key={f.id} className="align-top">
                <td className="whitespace-nowrap">
                  {f.name} <Badge tone={f.kind === 'special' ? 'gold' : 'dim'}>{f.kind}</Badge>
                </td>
                <td>
                  <select className="input py-0.5 text-sm" value={f.space} onChange={(e) => setF(f.id, { space: e.target.value })}>
                    {SPACES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input py-0.5 w-16 num" type="number" min={0} value={f.hirelings} onChange={(e) => setF(f.id, { hirelings: Math.max(0, Number(e.target.value) || 0) })} />
                </td>
                <td>
                  {f.kind === 'special' ? (
                    <select className="input py-0.5 text-sm" value={f.order} onChange={(e) => setF(f.id, { order: e.target.value })}>
                      <option value="">No order</option>
                      {ORDERS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-dim text-xs">—</span>
                  )}
                </td>
                <td className="min-w-[12rem]">
                  <input className="input py-0.5 text-sm" value={f.notes} onChange={(e) => setF(f.id, { notes: e.target.value })} placeholder="What it makes, who runs it…" />
                </td>
                <td>
                  <button className="btn-ghost p-1 hover:text-danger" onClick={() => set({ facilities: b.facilities.filter((x) => x.id !== f.id) })} aria-label={`Remove ${f.name}`}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-dim">
          Special facilities: <span className="num">{specials.length}</span> of <span className="num">{slots}</span> at level <span className="num">{level}</span>.
        </span>
        <select className="input w-auto py-1 text-sm" value="" disabled={specials.length >= slots || !available.length} onChange={(e) => e.target.value && addFacility(e.target.value, 'special')}>
          <option value="">Add a special facility…</option>
          {available.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} (level {f.level})
            </option>
          ))}
        </select>
        <select className="input w-auto py-1 text-sm" value="" onChange={(e) => e.target.value && addFacility(e.target.value, 'basic')}>
          <option value="">Add a basic facility…</option>
          {BASIC_FACILITIES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Section title="Take a Bastion turn" className="space-y-2">
          <p className="text-xs text-dim">Records each facility's order, then clears them for next time. During a live session it goes in the session log.</p>
          <AutoTextarea minRows={2} value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Any Bastion event this turn (roll on the book's table)…" />
          <button
            className="btn"
            onClick={async () => {
              await api.post(`/api/bastions/${b.id}/turn`, { event });
              setEvent('');
              setB({ ...b, facilities: b.facilities.map((f) => ({ ...f, order: '' })) });
              reloadTurns();
            }}
          >
            <Hourglass size={14} /> Take the turn
          </button>
          <Field label="Notes">
            <AutoTextarea minRows={2} value={b.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </Section>
        <Section title="Turns">
          {turns?.length ? (
            <ul className="text-sm space-y-2 max-h-72 overflow-y-auto">
              {turns.map((t) => (
                <li key={t.id} className="border-l-2 border-gold/40 pl-2">
                  <div className="text-xs text-dim">
                    Turn {t.number} · {new Date(t.created_at).toLocaleDateString()}
                  </div>
                  {t.orders.length ? <div>{t.orders.map((o) => `${o.facility}: ${o.order}`).join('; ')}</div> : <div className="text-dim">No orders.</div>}
                  {t.event && <div className="italic">{t.event}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="No turns yet." />
          )}
          {b.location_id && (
            <p className="text-xs text-dim mt-2">
              At <EntityLink id={b.location_id} />
            </p>
          )}
        </Section>
      </div>
    </Card>
  );
}

const ACTIVITIES = [
  'Buying a magic item',
  'Carousing',
  'Crafting',
  'Gambling',
  'Pit fighting',
  'Recuperating',
  'Religious service',
  'Research',
  'Scribing a scroll',
  'Selling a magic item',
  'Training',
  'Work',
];

function DowntimeLog({ campaignId, characters }: { campaignId: number; characters: string[] }) {
  const { data, reload } = useApi<Downtime[]>(`/api/downtime?campaign_id=${campaignId}`);
  const [draft, setDraft] = useState({ character: '', activity: '', days: 5, cost_gp: 0, result: '' });
  return (
    <Card className="space-y-3" icon={<Hourglass size={16} className="text-gold" />} title="Downtime" aside="What each character does between adventures.">
      <form
        className="grid gap-2 md:grid-cols-[1fr_1fr_80px_100px_2fr_auto] items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.character.trim() || !draft.activity.trim()) return;
          await api.post('/api/downtime', { campaign_id: campaignId, ...draft });
          setDraft({ ...draft, activity: '', result: '' });
          reload();
        }}
      >
        <Field label="Who">
          <input className="input" list="wk-downtime-chars" value={draft.character} onChange={(e) => setDraft({ ...draft, character: e.target.value })} />
          <datalist id="wk-downtime-chars">
            {characters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Doing">
          <input className="input" list="wk-downtime-acts" value={draft.activity} onChange={(e) => setDraft({ ...draft, activity: e.target.value })} />
          <datalist id="wk-downtime-acts">
            {ACTIVITIES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Days">
          <input className="input" type="number" min={0} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Cost (gp)">
          <input className="input" type="number" min={0} value={draft.cost_gp} onChange={(e) => setDraft({ ...draft, cost_gp: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="What came of it">
          <input className="input" value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} />
        </Field>
        <button className="btn h-[38px]" type="submit">
          <Plus size={14} /> Add
        </button>
      </form>
      {data?.length ? (
        <DataTable
          rows={data}
          rowKey={(d) => d.id}
          columns={[
            { key: 'character', label: 'Who', sortable: true, className: 'font-medium' },
            { key: 'activity', label: 'Doing', sortable: true },
            { key: 'days', label: 'Days', num: true, sortable: true },
            { key: 'cost_gp', label: 'Cost (gp)', num: true, sortable: true, render: (d) => (d.cost_gp ? d.cost_gp : '') },
            { key: 'result', label: 'What came of it' },
            {
              key: 'del',
              label: <span className="sr-only">Delete</span>,
              render: (d) => (
                <button className="btn-ghost p-1 hover:text-danger" onClick={async () => (await api.del(`/api/downtime/${d.id}`), reload())} aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              ),
            },
          ]}
        />
      ) : (
        <Empty compact title="Nothing yet." />
      )}
    </Card>
  );
}
