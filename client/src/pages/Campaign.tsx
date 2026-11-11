import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, type Connection, type Edge, type Node, type NodeChange, applyNodeChanges } from '@xyflow/react';
import { Check, Copy, Download, Play, Plus, Trash2, Upload, Wand2, ArrowUp, ArrowDown, Swords } from 'lucide-react';
import { proficiencyBonus, abilityModifier } from '@shared/play';
import { CONDITIONS_2024 } from '@shared/domain';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Campaign, Session, StateRow } from '../lib/types';
import { AutoTextarea, Empty, EntityLink, ErrorBox, Field, Loading, Modal, PageHeader, SaveStatus, Tabs, useToast } from '../components/ui';
import { EntityMultiPicker, EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';

// ------------------------------------------------------------------ shared helpers
export interface Overview {
  campaign: Campaign;
  characters: Character[];
  quests: Quest[];
  sessions: Session[];
  adventures: Adventure[];
  plans: unknown[];
  state: StateRow[];
  encounters: { id: number; title: string; status: string; session_id: number | null; round: number }[];
}
export interface Character {
  id: number;
  campaign_id: number;
  name: string;
  player: string;
  kind: string;
  species: string;
  class_name: string;
  level: number;
  sheet: Record<string, unknown> & {
    abilities?: Record<string, number>;
    ac?: number;
    maxHp?: number;
    hp?: number;
    initiativeBonus?: number;
    saves?: string[];
    skills?: string[];
    spellSlots?: Record<string, { max: number; used: number }>;
    concentration?: string | null;
    conditions?: string[];
    exhaustion?: number;
    equipment?: string;
    lastRest?: string;
    speed?: string;
    shardscarred?: string;
  };
  notes: string;
}
export interface Quest {
  id: number;
  campaign_id: number;
  title: string;
  status: string;
  description: string;
  giver_id: string | null;
  location_id: string | null;
  player_visible: boolean;
  notes: string;
}
export interface Adventure {
  id: number;
  campaign_id: number | null;
  title: string;
  status: string;
  arc: string;
  source_hook_id: string | null;
  data: Record<string, string> & { clues: { text: string; found: boolean }[] };
  linked_ids: string[];
}

export function useActiveOverview() {
  const { activeCampaignId } = useAppState();
  const res = useApi<Overview>(activeCampaignId ? `/api/campaigns/${activeCampaignId}/overview` : null);
  return { activeCampaignId, ...res };
}

export function NeedCampaign() {
  return (
    <Empty title="No active campaign">
      <Link to="/campaigns" className="text-arcane">
        Create or choose a campaign
      </Link>{' '}
      first. Campaigns never change the world encyclopedia directly.
    </Empty>
  );
}

// ------------------------------------------------------------------ campaigns list
export function CampaignsPage() {
  const { data, reload, error } = useApi<Campaign[]>('/api/campaigns');
  const { activeCampaignId, setActiveCampaignId } = useAppState();
  const [form, setForm] = useState({ title: '', premise: '', starting_location_id: null as string | null, starting_date: '300 AB / Year 31 Unbound' });
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        title="All Campaigns"
        subtitle="Several campaigns can run in the same world, each with its own history." note="Each keeps its own state; promote developments to canon only through Canon Review."
        actions={
          <label className="btn cursor-pointer">
            <Upload size={14} /> Import campaign
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  await api.upload('/api/import/json', 'file', f);
                  void reload();
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            />
          </label>
        }
      />
      {(err || error) && <ErrorBox error={(err ?? error?.message)!} />}
      <div className="panel-pad grid gap-2 md:grid-cols-[1fr_1fr_220px_180px_auto] items-end">
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Premise">
          <input className="input" value={form.premise} onChange={(e) => setForm({ ...form, premise: e.target.value })} />
        </Field>
        <Field label="Starting location">
          <EntityPicker value={form.starting_location_id} onChange={(id) => setForm({ ...form, starting_location_id: id })} />
        </Field>
        <Field label="Starting date">
          <input className="input" value={form.starting_date} onChange={(e) => setForm({ ...form, starting_date: e.target.value })} />
        </Field>
        <button
          className="btn-primary"
          disabled={!form.title.trim()}
          onClick={async () => {
            try {
              const c = await api.post<Campaign>('/api/campaigns', { ...form, current_date: form.starting_date });
              await setActiveCampaignId(c.id);
              nav('/campaign');
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <Plus size={14} /> Create
        </button>
      </div>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty title="No campaigns yet" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <div key={c.id} className={`panel p-4 ${c.id === activeCampaignId ? 'border-gold' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-gold text-lg">{c.title}</div>
                  <div className="text-xs text-dim">
                    {c.status} · {c.current_date}
                  </div>
                </div>
                {c.id === activeCampaignId ? (
                  <span className="chip border-gold text-gold">Active</span>
                ) : (
                  <button className="btn" onClick={() => setActiveCampaignId(c.id)}>
                    Make active
                  </button>
                )}
              </div>
              <p className="text-sm mt-2 line-clamp-3">{c.premise || <span className="text-dim">No premise yet.</span>}</p>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn"
                  onClick={async () => {
                    await setActiveCampaignId(c.id);
                    nav('/campaign');
                  }}
                >
                  Open
                </button>
                <a className="btn" href={`/api/export/campaign/${c.id}`}>
                  <Download size={14} /> Export
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ active campaign overview
export function ActiveCampaign() {
  const { data, error, reload, activeCampaignId } = useActiveOverview();
  const auto = useAutosave((c: Partial<Campaign>) => api.patch(`/api/campaigns/${activeCampaignId}`, c));
  const [c, setC] = useState<Campaign | null>(null);
  useEffect(() => {
    if (data) setC(data.campaign);
  }, [data]);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !c) return <Loading />;
  const set = (p: Partial<Campaign>) => {
    const n = { ...c, ...p };
    setC(n);
    auto.schedule({ title: n.title, premise: n.premise, starting_location_id: n.starting_location_id, starting_date: n.starting_date, current_date: n.current_date, status: n.status, players: n.players, active_factions: n.active_factions, notes: n.notes });
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title={c.title}
        subtitle={<SaveStatus state={auto.state} error={auto.error} />}
        actions={
          <>
            <Link to="/campaign/live" className="btn-primary">
              <Play size={14} /> Live session
            </Link>
            <Link to="/campaign/sessions" className="btn">
              Sessions ({data.sessions.length})
            </Link>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="panel-pad space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title">
              <input className="input" value={c.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={c.status} onChange={(e) => set({ status: e.target.value })}>
                {['planning', 'active', 'paused', 'completed', 'archived'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Starting date">
              <input className="input" value={c.starting_date} onChange={(e) => set({ starting_date: e.target.value })} />
            </Field>
            <Field label="Current in-world date">
              <input className="input" value={c.current_date} onChange={(e) => set({ current_date: e.target.value })} />
            </Field>
            <Field label="Starting location">
              <EntityPicker value={c.starting_location_id} onChange={(id) => set({ starting_location_id: id })} />
            </Field>
          </div>
          <Field label="Premise">
            <AutoTextarea minRows={3} value={c.premise} onChange={(e) => set({ premise: e.target.value })} className="font-sans" />
          </Field>
          <EntityMultiPicker label="Active factions" value={c.active_factions} types={['faction', 'cult', 'family']} onChange={(ids) => set({ active_factions: ids })} />
          <div>
            <span className="label">Players</span>
            {c.players.map((p, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input className="input" value={p.name} placeholder="Player name" onChange={(e) => set({ players: c.players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="input" value={p.contact} placeholder="Contact / notes" onChange={(e) => set({ players: c.players.map((x, j) => (j === i ? { ...x, contact: e.target.value } : x)) })} />
                <button className="btn-ghost" onClick={() => set({ players: c.players.filter((_, j) => j !== i) })} aria-label="Remove player">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => set({ players: [...c.players, { name: '', contact: '' }] })}>
              <Plus size={14} /> Add player
            </button>
          </div>
          <Field label="Campaign notes">
            <AutoTextarea minRows={4} value={c.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
        <div className="space-y-3">
          <div className="panel-pad text-sm space-y-1">
            <div className="section-title mb-1">At a glance</div>
            <Link to="/campaign/party" className="block hover:text-gold">Characters: {data.characters.length}</Link>
            <Link to="/campaign/quests" className="block hover:text-gold">Open quests: {data.quests.filter((q) => ['open', 'active'].includes(q.status)).length}</Link>
            <Link to="/campaign/adventures" className="block hover:text-gold">Adventures: {data.adventures.length}</Link>
            <Link to="/campaign/encounters" className="block hover:text-gold">Encounters: {data.encounters.length}</Link>
            <Link to="/agendas" className="block hover:text-gold">Faction plans: {data.plans.length}</Link>
          </div>
          <StateTable rows={data.state} onChange={reload} />
        </div>
      </div>
    </div>
  );
}

export function StateTable({ rows, onChange, title = 'Campaign-specific world changes' }: { rows: StateRow[]; onChange: () => void; title?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="panel-pad text-sm">
      <div className="section-title mb-1">{title}</div>
      <p className="text-xs text-dim mb-2">Only true in this campaign.</p>
      {msg && <div className="text-ok text-xs mb-1">{msg}</div>}
      <ul className="space-y-1.5 max-h-96 overflow-auto">
        {rows
          .filter((r) => r.status !== 'superseded')
          .map((r) => (
            <li key={r.id} className="border-b border-line/40 pb-1">
              {r.entity_id ? <EntityLink id={r.entity_id}>{r.entity_name ?? r.entity_id}</EntityLink> : <span>World</span>}: {r.field} → <strong>{r.value}</strong>
              <span className="text-xs text-dim"> ({r.status})</span>
              <div className="flex gap-1 mt-0.5">
                {r.status === 'proposed' && (
                  <>
                    <button className="btn-ghost text-xs" onClick={async () => (await api.post(`/api/campaign-state/${r.id}/decide`, { accept: true }), onChange())}>
                      Accept
                    </button>
                    <button className="btn-ghost text-xs" onClick={async () => (await api.post(`/api/campaign-state/${r.id}/decide`, { accept: false }), onChange())}>
                      Reject
                    </button>
                  </>
                )}
                {r.status === 'active' && r.entity_id && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={async () => {
                      await api.post(`/api/campaign-state/${r.id}/promote`, { reason: 'Proposed from campaign' });
                      setMsg('Sent to Canon Review.');
                    }}
                  >
                    Propose as world canon
                  </button>
                )}
              </div>
            </li>
          ))}
        {!rows.length && <li className="text-dim">Nothing recorded yet.</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ party
const ABILS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export function PartyPage() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  const [sel, setSel] = useState<number | null>(null);
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  const ch = data.characters.find((c) => c.id === sel) ?? data.characters[0];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Party and Characters"
        note="D&D 2024 basics. Modifiers and proficiency bonus are calculated; everything else is what you enter."
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              const c = await api.post<Character>('/api/characters', { campaign_id: activeCampaignId, name: 'New character', sheet: { abilities: Object.fromEntries(ABILS.map((a) => [a, 10])) } });
              await reload();
              setSel(c.id);
            }}
          >
            <Plus size={14} /> Add character
          </button>
        }
      />
      {!data.characters.length ? (
        <Empty title="No characters yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="panel p-2">
            {data.characters.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={`w-full text-left px-2 py-1.5 rounded text-sm ${ch?.id === c.id ? 'bg-gold/10 text-gold' : 'hover:bg-raised'}`}>
                {c.name}
                <div className="text-[11px] text-dim">
                  {c.player || 'no player'} · L{c.level} {c.class_name}
                </div>
              </button>
            ))}
          </div>
          {ch && <CharacterSheet key={ch.id} ch={ch} onDeleted={reload} />}
        </div>
      )}
    </div>
  );
}

function CharacterSheet({ ch: initial, onDeleted }: { ch: Character; onDeleted: () => void }) {
  const [ch, setCh] = useState(initial);
  const auto = useAutosave((c: Character) => api.patch(`/api/characters/${c.id}`, { name: c.name, player: c.player, kind: c.kind, species: c.species, class_name: c.class_name, level: c.level, sheet: c.sheet, notes: c.notes }));
  const set = (p: Partial<Character>) => {
    const n = { ...ch, ...p };
    setCh(n);
    auto.schedule(n);
  };
  const sh = ch.sheet;
  const setSheet = (p: Partial<Character['sheet']>) => set({ sheet: { ...sh, ...p } });
  const pb = proficiencyBonus(ch.level);
  const abil = sh.abilities ?? {};
  return (
    <div className="panel-pad space-y-4">
      <div className="flex justify-between">
        <SaveStatus state={auto.state} error={auto.error} />
        <button
          className="btn-danger"
          onClick={async () => {
            if (!confirm(`Delete ${ch.name}?`)) return;
            await api.del(`/api/characters/${ch.id}`);
            onDeleted();
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Name">
          <input className="input" value={ch.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Player">
          <input className="input" value={ch.player} onChange={(e) => set({ player: e.target.value })} />
        </Field>
        <Field label="Species">
          <input className="input" value={ch.species} onChange={(e) => set({ species: e.target.value })} />
        </Field>
        <Field label="Class">
          <input className="input" value={ch.class_name} onChange={(e) => set({ class_name: e.target.value })} />
        </Field>
        <Field label="Level">
          <input type="number" min={1} max={20} className="input" value={ch.level} onChange={(e) => set({ level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Status">
          <select className="input" value={ch.kind} onChange={(e) => set({ kind: e.target.value })}>
            {['pc', 'companion', 'retired', 'dead'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ABILS.map((a) => (
          <div key={a} className="parchment p-2 text-center">
            <div className="text-[11px] font-display tracking-widest">{a}</div>
            <input type="number" className="w-full bg-transparent text-center text-xl font-serif outline-none" value={abil[a] ?? 10} onChange={(e) => setSheet({ abilities: { ...abil, [a]: Number(e.target.value) || 0 } })} aria-label={`${a} score`} />
            <div className="text-sm">{((m) => (m >= 0 ? `+${m}` : m))(abilityModifier(abil[a] ?? 10))}</div>
            <label className="text-[10px] flex items-center justify-center gap-1">
              <input type="checkbox" checked={sh.saves?.includes(a) ?? false} onChange={(e) => setSheet({ saves: e.target.checked ? [...(sh.saves ?? []), a] : (sh.saves ?? []).filter((x) => x !== a) })} /> save
            </label>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Proficiency">
          <div className="input">+{pb}</div>
        </Field>
        <Field label="Armor Class">
          <input type="number" className="input" value={sh.ac ?? ''} onChange={(e) => setSheet({ ac: Number(e.target.value) })} />
        </Field>
        <Field label="HP / Max">
          <div className="flex gap-1">
            <input type="number" className="input" value={sh.hp ?? ''} onChange={(e) => setSheet({ hp: Number(e.target.value) })} />
            <input type="number" className="input" value={sh.maxHp ?? ''} onChange={(e) => setSheet({ maxHp: Number(e.target.value) })} />
          </div>
        </Field>
        <Field label="Initiative bonus">
          <input type="number" className="input" value={sh.initiativeBonus ?? abilityModifier(abil.DEX ?? 10)} onChange={(e) => setSheet({ initiativeBonus: Number(e.target.value) })} />
        </Field>
        <Field label="Exhaustion">
          <input type="number" min={0} max={6} className="input" value={sh.exhaustion ?? 0} onChange={(e) => setSheet({ exhaustion: Number(e.target.value) })} />
        </Field>
        <Field label="Last rest">
          <input className="input" value={sh.lastRest ?? ''} onChange={(e) => setSheet({ lastRest: e.target.value })} placeholder="Long rest, day 3" />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Concentrating on">
          <input className="input" value={sh.concentration ?? ''} onChange={(e) => setSheet({ concentration: e.target.value || null })} />
        </Field>
        <Field label="Skills (proficient, comma separated)">
          <input className="input" value={(sh.skills ?? []).join(', ')} onChange={(e) => setSheet({ skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
      </div>
      <div>
        <span className="label">Conditions</span>
        <div className="flex flex-wrap gap-1">
          {CONDITIONS_2024.map((c) => {
            const on = sh.conditions?.includes(c);
            return (
              <button key={c} className={`chip ${on ? 'border-danger text-danger' : 'border-line text-dim'}`} onClick={() => setSheet({ conditions: on ? (sh.conditions ?? []).filter((x) => x !== c) : [...(sh.conditions ?? []), c] })}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className="label">Spell slots</span>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => {
            const s = sh.spellSlots?.[lvl] ?? { max: 0, used: 0 };
            const upd = (p: Partial<typeof s>) => setSheet({ spellSlots: { ...(sh.spellSlots ?? {}), [lvl]: { ...s, ...p } } });
            return (
              <div key={lvl} className="panel p-1.5 text-center text-xs w-20">
                <div className="text-dim">Level {lvl}</div>
                <div className="flex items-center justify-center gap-1">
                  <input type="number" min={0} className="w-8 bg-transparent text-center" value={s.max - s.used} onChange={(e) => upd({ used: Math.max(0, s.max - Number(e.target.value)) })} aria-label={`Level ${lvl} remaining`} />/
                  <input type="number" min={0} className="w-8 bg-transparent text-center" value={s.max} onChange={(e) => upd({ max: Number(e.target.value) })} aria-label={`Level ${lvl} max`} />
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn-ghost text-xs mt-1" onClick={() => setSheet({ spellSlots: Object.fromEntries(Object.entries(sh.spellSlots ?? {}).map(([k, v]) => [k, { ...v, used: 0 }])), lastRest: `Long rest (${new Date().toLocaleDateString()})` })}>
          Long rest: restore slots
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Equipment">
          <AutoTextarea minRows={3} value={sh.equipment ?? ''} onChange={(e) => setSheet({ equipment: e.target.value })} />
        </Field>
        <Field label="Shardscarred / setting mechanics (HOMEBREW)">
          <AutoTextarea minRows={3} value={sh.shardscarred ?? ''} onChange={(e) => setSheet({ shardscarred: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <AutoTextarea minRows={3} value={ch.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ quests
export function QuestsPage() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  const [sp] = useSearchParams();
  const [title, setTitle] = useState('');
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader title="Quests" subtitle="Tick “Players see” to include a quest in the player journal." />
      <div className="flex gap-2">
        <input className="input max-w-md" placeholder="New quest title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            await api.post('/api/quests', { campaign_id: activeCampaignId, title });
            setTitle('');
            void reload();
          }}
        >
          <Plus size={14} /> Add quest
        </button>
      </div>
      <div className="space-y-3">
        {data.quests.map((q) => (
          <QuestCard key={q.id} q={q} highlight={sp.get('quest') === String(q.id)} onChange={reload} />
        ))}
        {!data.quests.length && <Empty title="No quests yet" />}
      </div>
    </div>
  );
}

function QuestCard({ q: initial, onChange, highlight }: { q: Quest; onChange: () => void; highlight?: boolean }) {
  const [q, setQ] = useState(initial);
  const auto = useAutosave((x: Quest) => api.patch(`/api/quests/${x.id}`, { title: x.title, status: x.status, description: x.description, giver_id: x.giver_id, location_id: x.location_id, player_visible: x.player_visible, notes: x.notes }));
  const set = (p: Partial<Quest>) => {
    const n = { ...q, ...p };
    setQ(n);
    auto.schedule(n);
  };
  return (
    <div className={`panel-pad space-y-2 ${highlight ? 'border-gold' : ''}`}>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input flex-1 font-display" value={q.title} onChange={(e) => set({ title: e.target.value })} />
        <select className="input w-auto" value={q.status} onChange={(e) => set({ status: e.target.value })}>
          {['open', 'active', 'completed', 'failed', 'abandoned', 'rumoured'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={q.player_visible} onChange={(e) => set({ player_visible: e.target.checked })} /> Players see
        </label>
        <SaveStatus state={auto.state} />
        <button
          className="btn-ghost"
          onClick={async () => {
            if (!confirm('Delete this quest?')) return;
            await api.del(`/api/quests/${q.id}`);
            onChange();
          }}
          aria-label="Delete quest"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Quest giver">
          <EntityPicker value={q.giver_id} types={['npc', 'faction', 'cult']} onChange={(id) => set({ giver_id: id })} />
        </Field>
        <Field label="Location">
          <EntityPicker value={q.location_id} onChange={(id) => set({ location_id: id })} />
        </Field>
      </div>
      <Field label="Description (players may see this)">
        <AutoTextarea minRows={2} value={q.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="DM notes">
        <AutoTextarea minRows={2} value={q.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ sessions
export function SessionsPage() {
  const { data, activeCampaignId } = useActiveOverview();
  const nav = useNavigate();
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessions"
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              const s = await api.post<Session>('/api/sessions/next', { campaignId: activeCampaignId });
              nav(`/session/${s.id}`);
            }}
          >
            <Plus size={14} /> Prepare next session
          </button>
        }
      />
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Status</th>
              <th>Played</th>
              <th>In-world</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => nav(`/session/${s.id}`)}>
                <td>{s.number}</td>
                <td>{s.title || <span className="text-dim">Untitled</span>}</td>
                <td>{s.status}</td>
                <td>{s.played_on}</td>
                <td>{s.in_world_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.sessions.length && <p className="p-4 text-dim text-sm">No sessions yet.</p>}
      </div>
    </div>
  );
}

const PREP_FIELDS: [string, string][] = [
  ['recap', 'Previous session recap'],
  ['partyLocation', 'Current party location'],
  ['goals', 'Goals and stakes'],
  ['scenes', 'Planned scenes'],
  ['npcNotes', 'NPC notes'],
  ['readAloud', 'Read-aloud descriptions'],
  ['clues', 'Clues'],
  ['encounters', 'Encounter references'],
  ['treasure', 'Treasure'],
  ['consequences', 'Possible consequences'],
  ['questions', 'Open questions'],
];

export function SessionPage() {
  const { id } = useParams();
  const { data, reload } = useApi<Session>(`/api/sessions/${id}`);
  const { data: log, reload: reloadLog } = useApi<{ id: number; kind: string; text: string; entity_id: string | null; created_at: string }[]>(`/api/session-log?session_id=${id}`);
  const { data: changes, reload: reloadChanges } = useApi<StateRow[]>(`/api/campaign-state?session_id=${id}`);
  const { data: advs } = useApi<Adventure[]>(data ? `/api/adventures?campaign_id=${data.campaign_id}` : null);
  const [s, setS] = useState<Session | null>(null);
  const [tab, setTab] = useState<'prep' | 'log' | 'recap' | 'review'>('prep');
  const nav = useNavigate();
  const { toast, node } = useToast();
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  const auto = useAutosave((x: Session) => api.patch(`/api/sessions/${x.id}`, { title: x.title, played_on: x.played_on, in_world_date: x.in_world_date, prep: x.prep, recap: x.recap, recap_player_visible: x.recap_player_visible }));
  useEffect(() => {
    if (data?.status === 'completed') setTab('recap');
  }, [data?.status]);
  if (!s) return <Loading />;
  const set = (p: Partial<Session>) => {
    const n = { ...s, ...p };
    setS(n);
    auto.schedule(n);
  };
  const setPrep = (k: string, v: unknown) => set({ prep: { ...s.prep, [k]: v } as Session['prep'] });
  const proposed = (changes ?? []).filter((c) => c.status === 'proposed');
  return (
    <div className="space-y-4">
      {node}
      <PageHeader
        title={`Session ${s.number}`}
        subtitle={
          <span className="flex gap-3 items-center">
            {s.status} <SaveStatus state={auto.state} error={auto.error} />
          </span>
        }
        actions={
          <>
            {s.status !== 'live' ? (
              <button
                className="btn-primary"
                onClick={async () => {
                  await auto.flush();
                  await api.post(`/api/sessions/${s.id}/start`);
                  nav('/campaign/live');
                }}
              >
                <Play size={14} /> {s.status === 'completed' ? 'Reopen live' : 'Start live session'}
              </button>
            ) : (
              <Link to="/campaign/live" className="btn-primary">
                <Play size={14} /> Return to live mode
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Title">
          <input className="input" value={s.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Played on">
          <input className="input" value={s.played_on} onChange={(e) => set({ played_on: e.target.value })} placeholder="YYYY-MM-DD" />
        </Field>
        <Field label="In-world date">
          <input className="input" value={s.in_world_date} onChange={(e) => set({ in_world_date: e.target.value })} />
        </Field>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'prep', label: 'Preparation' },
          { id: 'log', label: `Recorded log (${log?.length ?? 0})` },
          { id: 'recap', label: 'Recap' },
          { id: 'review', label: `Review changes (${proposed.length})` },
        ]}
      />
      {tab === 'prep' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {PREP_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <AutoTextarea minRows={3} value={(s.prep[k] as string) ?? ''} onChange={(e) => setPrep(k, e.target.value)} />
            </Field>
          ))}
          <div className="panel-pad">
            <EntityMultiPicker label="Relevant NPCs and locations (shown in live mode)" value={s.prep.relevantIds ?? []} onChange={(ids) => setPrep('relevantIds', ids)} />
          </div>
          <div className="panel-pad">
            <span className="label">Adventures in play</span>
            {advs?.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(s.prep.adventureIds ?? []).includes(a.id)}
                  onChange={(e) => setPrep('adventureIds', e.target.checked ? [...(s.prep.adventureIds ?? []), a.id] : (s.prep.adventureIds ?? []).filter((x) => x !== a.id))}
                />
                {a.title}
              </label>
            ))}
            {!advs?.length && <p className="text-xs text-dim">No adventures in this campaign yet.</p>}
          </div>
        </div>
      )}
      {tab === 'log' && (
        <div className="panel overflow-x-auto">
          <table className="table">
            <tbody>
              {log?.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs text-dim whitespace-nowrap">{new Date(l.created_at).toLocaleTimeString()}</td>
                  <td className="text-xs">{l.kind}</td>
                  <td>
                    {l.text} {l.entity_id && <EntityLink id={l.entity_id} className="text-xs" />}
                  </td>
                  <td>
                    <button
                      className="btn-ghost"
                      onClick={async () => {
                        await api.del(`/api/session-log/${l.id}`);
                        void reloadLog();
                      }}
                      aria-label="Delete entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!log?.length && <p className="p-4 text-sm text-dim">Nothing recorded. Use live mode to log events as they happen.</p>}
        </div>
      )}
      {tab === 'recap' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className="btn"
              onClick={async () => {
                const { draft } = await api.post<{ draft: string }>(`/api/sessions/${s.id}/recap-draft`);
                if (s.recap.trim() && !confirm('Replace the current recap with a new draft generated from the log?')) return;
                set({ recap: draft });
                toast('Draft generated from recorded entries only. Edit freely.');
              }}
            >
              <Wand2 size={14} /> Generate draft from recorded log
            </button>
            <label className="text-sm flex items-center gap-1">
              <input type="checkbox" checked={s.recap_player_visible} onChange={(e) => set({ recap_player_visible: e.target.checked })} /> Publish recap to player view
            </label>
            {s.status === 'live' && (
              <button
                className="btn-primary"
                onClick={async () => {
                  await auto.flush();
                  await api.post(`/api/sessions/${s.id}/end`);
                  void reload();
                }}
              >
                <Check size={14} /> Mark session completed
              </button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <AutoTextarea minRows={16} value={s.recap} onChange={(e) => set({ recap: e.target.value })} />
            <div className="panel p-4">
              <Markdown text={s.recap || '_No recap yet._'} />
            </div>
          </div>
        </div>
      )}
      {tab === 'review' && (
        <div className="space-y-3">
          <p className="text-sm text-dim">Changes recorded during play. Accept the ones that happened; they apply to this campaign only.</p>
          <StateTable
            title="Changes recorded in this session"
            rows={changes ?? []}
            onChange={() => {
              void reloadChanges();
            }}
          />
        </div>
      )}
    </div>
  );
}

export function JournalPage() {
  const { data, activeCampaignId } = useActiveOverview();
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  const done = [...data.sessions].filter((s) => s.recap.trim() || s.status === 'completed').sort((a, b) => a.number - b.number);
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Session Journal" subtitle={data.campaign.title} />
      {done.map((s) => (
        <article key={s.id} className="panel p-5">
          <div className="flex justify-between items-baseline">
            <Link to={`/session/${s.id}`} className="font-display text-gold text-lg">
              Session {s.number}
              {s.title ? `: ${s.title}` : ''}
            </Link>
            <span className="text-xs text-dim">
              {s.played_on} {s.in_world_date && `· ${s.in_world_date}`} {s.recap_player_visible && '· published'}
            </span>
          </div>
          <Markdown text={s.recap || '_No recap written._'} />
        </article>
      ))}
      {!done.length && <Empty title="No recaps yet" />}
    </div>
  );
}

// ------------------------------------------------------------------ encounters list
export function EncountersPage() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  const [title, setTitle] = useState('');
  const nav = useNavigate();
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader title="Encounters" />
      <div className="flex gap-2">
        <input className="input max-w-md" placeholder="Encounter title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            const e = await api.post<{ id: number }>('/api/encounters', { campaign_id: activeCampaignId, title });
            nav(`/tracker/${e.id}`);
          }}
        >
          <Plus size={14} /> Prepare encounter
        </button>
      </div>
      <div className="panel overflow-x-auto">
        <table className="table">
          <tbody>
            {data.encounters.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link className="hover:text-gold" to={`/tracker/${e.id}`}>
                    <Swords size={13} className="inline mr-1" />
                    {e.title}
                  </Link>
                </td>
                <td>{e.status}</td>
                <td>round {e.round}</td>
                <td className="text-right">
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      if (!confirm('Delete this encounter?')) return;
                      await api.del(`/api/encounters/${e.id}`);
                      void reload();
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.encounters.length && <p className="p-4 text-sm text-dim">No encounters prepared.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ adventures
export function AdventuresPage({ byArc = false }: { byArc?: boolean }) {
  const { activeCampaignId } = useAppState();
  const { data } = useApi<Adventure[]>(activeCampaignId ? `/api/adventures?campaign_id=${activeCampaignId}` : "/api/adventures");
  const [title, setTitle] = useState('');
  const [hook, setHook] = useState<string | null>(null);
  const nav = useNavigate();
  const groups = useMemo(() => {
    const g = new Map<string, Adventure[]>();
    for (const a of data ?? []) g.set(a.arc || 'No arc', [...(g.get(a.arc || 'No arc') ?? []), a]);
    return [...g.entries()];
  }, [data]);
  return (
    <div className="space-y-4">
      <PageHeader title={byArc ? 'Story Arcs' : 'Adventures'} subtitle={byArc ? 'Adventures grouped by story arc.' : undefined} note={byArc ? undefined : 'Starting from a source hook links it; no content is invented.'} />
      <div className="panel-pad grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] items-end">
        <Field label="Blank adventure">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </Field>
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            const a = await api.post<Adventure>('/api/adventures', { title, campaign_id: activeCampaignId });
            nav(`/adventure/${a.id}`);
          }}
        >
          <Plus size={14} /> Create
        </button>
        <Field label="…or start from a source hook">
          <EntityPicker value={hook} types={['adventure_hook']} onChange={setHook} />
        </Field>
        <button
          className="btn"
          disabled={!hook}
          onClick={async () => {
            const a = await api.post<Adventure>('/api/adventures/from-hook', { hookId: hook, campaignId: activeCampaignId });
            nav(`/adventure/${a.id}`);
          }}
        >
          From hook
        </button>
      </div>
      {!data ? (
        <Loading />
      ) : (
        groups.map(([arc, list]) => (
          <div key={arc}>
            {byArc && <div className="section-title mb-2">{arc}</div>}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mb-4">
              {list.map((a) => (
                <Link key={a.id} to={`/adventure/${a.id}`} className="panel p-4 hover:border-gold/60">
                  <div className="font-display text-gold">{a.title}</div>
                  <div className="text-xs text-dim">
                    {a.status} {a.arc && `· ${a.arc}`}
                  </div>
                  <p className="text-sm line-clamp-2 mt-1">{a.data.premise}</p>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
      {data && !data.length && <Empty title="No adventures yet" />}
    </div>
  );
}
export const ArcsPage = () => <AdventuresPage byArc />;

interface Scene {
  id: number;
  adventure_id: number;
  title: string;
  kind: string;
  body: string;
  read_aloud: string;
  linked_ids: string[];
  sort_order: number;
  x: number;
  y: number;
}
interface SceneLink {
  id: number;
  from_scene: number;
  to_scene: number;
  label: string;
}

const ADV_FIELDS: [string, string][] = [
  ['premise', 'Premise'],
  ['hook', 'Starting hook'],
  ['stakes', 'Stakes'],
  ['opposition', 'Opposition'],
  ['obstacles', 'Obstacles'],
  ['encounters', 'Encounter options'],
  ['rewards', 'Rewards'],
  ['approaches', 'Possible approaches'],
  ['consequences', 'Branching consequences'],
  ['ifIgnored', 'If the players ignore it'],
];

export function AdventurePage() {
  const { id } = useParams();
  const advId = Number(id);
  const { data } = useApi<Adventure>(`/api/adventures/${advId}`);
  const [a, setA] = useState<Adventure | null>(null);
  const [tab, setTab] = useState<'plan' | 'scenes' | 'flow'>('plan');
  useEffect(() => {
    if (data) setA(data);
  }, [data]);
  const auto = useAutosave((x: Adventure) => api.patch(`/api/adventures/${x.id}`, { title: x.title, status: x.status, arc: x.arc, data: x.data, linked_ids: x.linked_ids }));
  if (!a) return <Loading />;
  const set = (p: Partial<Adventure>) => {
    const n = { ...a, ...p };
    setA(n);
    auto.schedule(n);
  };
  const setData = (k: string, v: unknown) => set({ data: { ...a.data, [k]: v } as Adventure['data'] });
  return (
    <div className="space-y-4">
      <PageHeader title={a.title} subtitle={<SaveStatus state={auto.state} error={auto.error} />} />
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Title">
          <input className="input" value={a.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={a.status} onChange={(e) => set({ status: e.target.value })}>
            {['draft', 'ready', 'running', 'completed', 'shelved'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Story arc">
          <input className="input" value={a.arc} onChange={(e) => set({ arc: e.target.value })} />
        </Field>
        <Field label="Source hook">{a.source_hook_id ? <EntityLink id={a.source_hook_id} /> : <span className="text-dim text-sm">none</span>}</Field>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'plan', label: 'Plan' },
          { id: 'scenes', label: 'Scenes' },
          { id: 'flow', label: 'Flow diagram' },
        ]}
      />
      {tab === 'plan' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {ADV_FIELDS.map(([k, l]) => (
            <Field key={k} label={l}>
              <AutoTextarea minRows={3} value={a.data[k] ?? ''} onChange={(e) => setData(k, e.target.value)} />
            </Field>
          ))}
          <div className="panel-pad">
            <span className="label">Clues</span>
            {(a.data.clues ?? []).map((c, i) => (
              <div key={i} className="flex gap-2 items-center mb-1">
                <input type="checkbox" checked={c.found} onChange={(e) => setData('clues', a.data.clues.map((x, j) => (j === i ? { ...x, found: e.target.checked } : x)))} aria-label="Found" />
                <input className="input" value={c.text} onChange={(e) => setData('clues', a.data.clues.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn-ghost" onClick={() => setData('clues', a.data.clues.filter((_, j) => j !== i))} aria-label="Remove clue">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setData('clues', [...(a.data.clues ?? []), { text: '', found: false }])}>
              <Plus size={13} /> Add clue
            </button>
          </div>
          <div className="panel-pad">
            <EntityMultiPicker label="Linked world records (locations, NPCs, factions…)" value={a.linked_ids} onChange={(ids) => set({ linked_ids: ids })} />
          </div>
        </div>
      )}
      {tab === 'scenes' && <ScenesEditor adventureId={advId} />}
      {tab === 'flow' && <SceneFlow adventureId={advId} />}
    </div>
  );
}

function ScenesEditor({ adventureId }: { adventureId: number }) {
  const { data, reload } = useApi<Scene[]>(`/api/scenes?adventure_id=${adventureId}`);
  const { data: allAdv } = useApi<Adventure[]>('/api/adventures');
  const [copying, setCopying] = useState<Scene | null>(null);
  const move = async (s: Scene, dir: -1 | 1) => {
    if (!data) return;
    const sorted = [...data];
    const i = sorted.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    await Promise.all(sorted.map((x, k) => api.patch(`/api/scenes/${x.id}`, { sort_order: k })));
    void reload();
  };
  return (
    <div className="space-y-3">
      <button
        className="btn-primary"
        onClick={async () => {
          await api.post('/api/scenes', { adventure_id: adventureId, title: 'New scene', sort_order: data?.length ?? 0, x: (data?.length ?? 0) * 220, y: 0 });
          void reload();
        }}
      >
        <Plus size={14} /> Add scene
      </button>
      {data?.map((s) => (
        <SceneCard key={s.id} s={s} onMove={(d) => move(s, d)} onCopy={() => setCopying(s)} onDelete={async () => (confirm('Delete scene?') && (await api.del(`/api/scenes/${s.id}`)), reload())} />
      ))}
      {copying && (
        <Modal title={`Copy “${copying.title}” to…`} onClose={() => setCopying(null)}>
          <ul className="space-y-1">
            {allAdv?.map((a) => (
              <li key={a.id}>
                <button
                  className="btn w-full justify-start"
                  onClick={async () => {
                    await api.post(`/api/scenes/${copying.id}/copy`, { adventureId: a.id });
                    setCopying(null);
                    void reload();
                  }}
                >
                  <Copy size={13} /> {a.title}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function SceneCard({ s: init, onMove, onCopy, onDelete }: { s: Scene; onMove: (d: -1 | 1) => void; onCopy: () => void; onDelete: () => void }) {
  const [s, setS] = useState(init);
  const auto = useAutosave((x: Scene) => api.patch(`/api/scenes/${x.id}`, { title: x.title, kind: x.kind, body: x.body, read_aloud: x.read_aloud, linked_ids: x.linked_ids }));
  const set = (p: Partial<Scene>) => {
    const n = { ...s, ...p };
    setS(n);
    auto.schedule(n);
  };
  return (
    <div className="panel-pad space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input className="input flex-1 font-display" value={s.title} onChange={(e) => set({ title: e.target.value })} />
        <select className="input w-auto" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
          {['scene', 'location', 'encounter', 'clue', 'social', 'travel', 'climax', 'branch'].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <SaveStatus state={auto.state} />
        <button className="btn-ghost" onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp size={13} />
        </button>
        <button className="btn-ghost" onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown size={13} />
        </button>
        <button className="btn-ghost" onClick={onCopy} title="Copy to another adventure">
          <Copy size={13} />
        </button>
        <button className="btn-ghost" onClick={onDelete} aria-label="Delete scene">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <Field label="Read-aloud">
          <AutoTextarea minRows={2} value={s.read_aloud} onChange={(e) => set({ read_aloud: e.target.value })} />
        </Field>
        <Field label="DM notes">
          <AutoTextarea minRows={2} value={s.body} onChange={(e) => set({ body: e.target.value })} />
        </Field>
      </div>
      <EntityMultiPicker value={s.linked_ids} onChange={(ids) => set({ linked_ids: ids })} />
    </div>
  );
}

function SceneFlow({ adventureId }: { adventureId: number }) {
  const { data: scenes, reload } = useApi<Scene[]>(`/api/scenes?adventure_id=${adventureId}`);
  const { data: links, reload: reloadLinks } = useApi<SceneLink[]>(`/api/scene-links?adventure_id=${adventureId}`);
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    if (scenes)
      setNodes(
        scenes.map((s) => ({
          id: String(s.id),
          position: { x: s.x, y: s.y },
          data: { label: `${s.title} (${s.kind})` },
          style: { background: '#1d1f25', color: '#e4dfd2', border: '1.5px solid #c9a24a', borderRadius: 8, width: 180 },
        })),
      );
  }, [scenes]);
  const edges: Edge[] = (links ?? []).map((l) => ({ id: String(l.id), source: String(l.from_scene), target: String(l.to_scene), label: l.label, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#c9a24a' }, labelStyle: { fill: '#e4dfd2' }, labelBgStyle: { fill: '#18191f' } }));
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((n) => applyNodeChanges(ch, n)), []);
  return (
    <div className="space-y-2">
      <p className="text-sm text-dim">Drag scenes to arrange them. Drag from one scene's edge to another to connect them; click a connection to remove it.</p>
      <div className="panel h-[65vh]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, n) => void api.patch(`/api/scenes/${n.id}`, { x: Math.round(n.position.x), y: Math.round(n.position.y) })}
          onConnect={async (c: Connection) => {
            const label = prompt('Label for this branch (optional)') ?? '';
            await api.post('/api/scene-links', { adventure_id: adventureId, from_scene: Number(c.source), to_scene: Number(c.target), label });
            void reloadLinks();
          }}
          onEdgeClick={async (_, e) => {
            if (!confirm('Delete this connection?')) return;
            await api.del(`/api/scene-links/${e.id}`);
            void reloadLinks();
          }}
          fitView
          colorMode="dark"
        >
          <Background gap={20} color="#333" />
          <Controls />
        </ReactFlow>
      </div>
      <button className="btn" onClick={() => (void reload(), void reloadLinks())}>
        Refresh
      </button>
    </div>
  );
}
