import { useRealms } from '../components/realms';
import { useModules } from '../lib/modules';
import { briefingFill, type Briefing } from './Briefing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, type Connection, type Edge, type Node, type NodeChangeset } from '@xyflow/react';
import { BookOpen, CalendarDays, Check, Compass, Copy, Dices, Download, Eye, FileText, Flag, Hourglass, MapPin, Play, Plus, ScrollText, Search, Shield as ShieldIcon, Sun, Swords, Trash2, Upload, UserPlus, Users, Wand2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Campaign, Session, StateRow } from '../lib/types';
import { ask, askText, AutoTextarea, Badge, Card, Check as CheckBox, DataTable, Empty, EntityLink, ErrorBox, Field, GmOnly, HpBar, KeyValue, Loading, Modal, PageHeader, SaveStatus, Section, Skeleton, Tabs, Toggle, useToast, type Tone } from '../components/ui';
import { DatePicker } from '../components/DatePicker';
import { GettingStarted } from '../components/GettingStarted';
import { HandbookAddress } from '../components/HandbookAddress';
import { RecentChanges } from '../components/RecentChanges';
import { formatDate, type CalendarDef, type WDate } from '../../../shared/calendar';
import { EntityMultiPicker, EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { FullSheet } from '../player/sheet/FullSheet';
import { NotesTab, ThinningTab } from '../player/sheet/ThinningTab';
import type { LogEntry } from '../player/sheet/LogTab';
import { passive, type Sheet } from '@shared/sheet';

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
    hometown?: string | null;
    ties?: { entity_id: string; kind: string; note: string }[];
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
  const [form, setForm] = useState({ title: '', premise: '', starting_location_id: null as string | null });
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
      <Card className="grid gap-2 md:grid-cols-[1fr_1fr_220px_180px_auto] items-end">
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Premise">
          <input className="input" value={form.premise} onChange={(e) => setForm({ ...form, premise: e.target.value })} />
        </Field>
        <Field label="Starting location">
          <EntityPicker value={form.starting_location_id} onChange={(id) => setForm({ ...form, starting_location_id: id })} />
        </Field>
        <button
          className="btn-primary"
          disabled={!form.title.trim()}
          onClick={async () => {
            try {
              // It starts on the first day of its world's starting year; set the date on the campaign's page.
              const c = await api.post<Campaign>('/api/campaigns', form);
              await setActiveCampaignId(c.id);
              void nav('/campaign');
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <Plus size={14} /> Create
        </button>
      </Card>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty title="No campaigns yet">Give your first campaign a title above and press Create.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Card key={c.id} className={c.id === activeCampaignId ? 'border-gold' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-gold text-lg">{c.title}</div>
                  <div className="text-xs text-dim">
                    {c.status} · {c.current_date}
                  </div>
                </div>
                {c.id === activeCampaignId ? (
                  <Badge tone="gold">Active</Badge>
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
                    void nav('/campaign');
                  }}
                >
                  Open
                </button>
                <a className="btn" href={`/api/export/campaign/${c.id}`}>
                  <Download size={14} /> Export
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ active campaign overview
export function ActiveCampaign() {
  const realms = useRealms();
  const { data, error, reload, activeCampaignId } = useActiveOverview();
  const auto = useAutosave((c: Partial<Campaign>) => api.patch(`/api/campaigns/${activeCampaignId}`, c));
  const [c, setC] = useState<Campaign | null>(null);
  useEffect(() => {
    if (data) setC(data.campaign);
  }, [data]);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !c) return <Loading />;
  const worlds = realms.list.filter((r) => r.kind === 'world' && (!r.archived || r.id === c.world_id));
  const set = (p: Partial<Campaign>) => {
    const n = { ...c, ...p };
    setC(n);
    auto.schedule({ title: n.title, world_id: n.world_id, premise: n.premise, starting_location_id: n.starting_location_id, status: n.status, players: n.players, active_factions: n.active_factions, notes: n.notes });
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
      {/* The first-run checklist, here too: the app opens on the campaign once there is one. */}
      <GettingStarted />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="space-y-3">
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
            <CampaignDates campaignId={c.id} />
            <Field label="Starting location">
              <EntityPicker value={c.starting_location_id} onChange={(id) => set({ starting_location_id: id })} />
            </Field>
            {worlds.length > 1 && (
              <Field label="World" hint="The world this campaign is set in.">
                <select className="input" value={c.world_id ?? ''} onChange={(e) => set({ world_id: e.target.value || null })}>
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field label="Premise">
            <AutoTextarea minRows={3} value={c.premise} onChange={(e) => set({ premise: e.target.value })} className="font-sans" />
          </Field>
          <EntityMultiPicker label="Active factions" value={c.active_factions} types={['@group']} onChange={(ids) => set({ active_factions: ids })} />
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
        </Card>
        <div className="space-y-3">
          <Card title="At a glance" featured>
            <KeyValue
              items={[
                [<Link key="c" to="/campaign/party" className="hover:text-gold">Characters</Link>, data.characters.length],
                [<Link key="q" to="/campaign/quests" className="hover:text-gold">Open quests</Link>, data.quests.filter((q) => ['open', 'active'].includes(q.status)).length],
                [<Link key="a" to="/campaign/adventures" className="hover:text-gold">Adventures</Link>, data.adventures.length],
                [<Link key="e" to="/campaign/encounters" className="hover:text-gold">Encounters</Link>, data.encounters.length],
                [<Link key="p" to="/agendas" className="hover:text-gold">Faction plans</Link>, data.plans.length],
              ]}
            />
          </Card>
          <HandbookAddress campaignId={c.id} title={c.title} />
          <StateTable rows={data.state} onChange={reload} campaignId={c.id} />
        </div>
      </div>
    </div>
  );
}

export function StateTable({ rows, onChange, title = 'Campaign-specific world changes', campaignId }: { rows: StateRow[]; onChange: () => void; title?: string; campaignId?: number }) {
  const cid = campaignId ?? rows[0]?.campaign_id;
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title={title} className="text-sm">
      <p className="text-xs text-dim mb-2">Only true in this campaign.</p>
      {cid != null && (
        <div className="mb-2">
          <RecentChanges campaignId={cid} watch={rows} onUndone={onChange} limit={3} />
        </div>
      )}
      {msg && <div className="text-ok text-xs mb-1">{msg}</div>}
      <ul className="space-y-1.5 max-h-96 overflow-auto">
        {rows
          .filter((r) => r.status !== 'superseded')
          .map((r) => (
            <li key={r.id} className="border-b border-line/40 pb-1">
              {r.entity_id ? <EntityLink id={r.entity_id}>{r.entity_name ?? r.entity_id}</EntityLink> : <span>World</span>}: {r.field} → <strong>{r.value}</strong>
              {' '}
              <Badge tone={r.status === 'proposed' ? 'arcane' : r.status === 'active' || r.status === 'promoted' ? 'ok' : 'dim'}>{r.status}</Badge>
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
      </ul>
      {!rows.length && <Empty compact title="Nothing recorded yet." />}
    </Card>
  );
}

// ------------------------------------------------------------------ party
const ABILS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const KIND_LABEL: Record<string, string> = { pc: 'PC', companion: 'Companion', retired: 'Retired', dead: 'Dead' };
const KIND_TONE: Record<string, Tone> = { pc: 'gold', companion: 'arcane', retired: 'dim', dead: 'danger' };

/** The numbers the roster and the summary strip show, where the sheet has them. */
function vitals(c: Character) {
  const sh = c.sheet as Sheet;
  const has = (k: string) => (c.sheet as Record<string, unknown>)[k] != null;
  return {
    ac: has('ac') ? (sh.ac ?? null) : null,
    hp: has('hp') ? (sh.hp ?? 0) : null,
    maxHp: has('maxHp') ? (sh.maxHp ?? 0) : null,
    tempHp: (sh as { tempHp?: number }).tempHp ?? 0,
    perception: sh.abilities ? passive(sh, c.level || 1, 'Perception') : null,
    portrait: sh.portrait ? `/api/uploads/${encodeURIComponent(sh.portrait)}` : null,
  };
}

function Medallion({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  return (
    <span className="shrink-0 rounded-full border border-gold/60 bg-gold/10 p-0.5 elev-1" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full border border-gold/30 font-display text-gold" style={{ fontSize: size * 0.42 }} aria-hidden>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  );
}

function PartySummary({ chars }: { chars: Character[] }) {
  const active = chars.filter((c) => c.kind !== 'retired' && c.kind !== 'dead');
  const list = active.length ? active : chars;
  const levels = list.map((c) => c.level || 1);
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const v = list.map((c) => ({ c, ...vitals(c) }));
  const withHp = v.filter((x) => x.maxHp);
  const hp = withHp.reduce((n, x) => n + (x.hp ?? 0), 0);
  const maxHp = withHp.reduce((n, x) => n + (x.maxHp ?? 0), 0);
  const acs = v.filter((x) => x.ac != null).map((x) => x.ac!);
  const pps = v.filter((x) => x.perception != null).sort((a, b) => b.perception! - a.perception!);
  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode, wide = false) => (
    <div className={`min-w-0 bg-panel px-4 py-3 ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <div className="text-[11px] uppercase tracking-wider text-dim truncate">{label}</div>
      <div className="num text-xl text-ink leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-xs text-dim truncate">{sub}</div>}
    </div>
  );
  const others = chars.length - active.length;
  return (
    <section aria-label="Party summary" className="panel elev-1 overflow-hidden grid grid-cols-2 md:grid-cols-5 gap-px bg-line">
      {stat('Party', list.length, others > 0 && active.length ? `and ${others} retired or fallen` : list.length === 1 ? 'adventurer' : 'adventurers')}
      {stat('Level', lo === hi ? lo : `${lo}–${hi}`, lo === hi ? (list.length > 1 ? 'everyone' : undefined) : `average ${(levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1)}`)}
      {stat(
        'Hit points',
        maxHp ? (
          <>
            {hp}
            <span className="text-dim text-base"> / {maxHp}</span>
          </>
        ) : (
          '—'
        ),
        maxHp ? <HpBar hp={hp} max={maxHp} className="mt-1.5 max-w-40" /> : 'not on the sheets yet',
      )}
      {stat('Armour Class', acs.length ? (Math.min(...acs) === Math.max(...acs) ? acs[0] : `${Math.min(...acs)}–${Math.max(...acs)}`) : '—', acs.length > 1 ? 'lowest to highest' : undefined)}
      {stat('Passive Perception', pps.length ? pps[0].perception : '—', pps.length > 1 ? `best: ${pps[0].c.name}` : pps.length ? pps[0].c.name : undefined, true)}
    </section>
  );
}

function RosterCard({ c, selected, onSelect }: { c: Character; selected: boolean; onSelect: () => void }) {
  const v = vitals(c);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`panel elev-1 w-full p-3 text-left transition-colors focus-visible:outline-gold ${selected ? 'border-gold bg-gold/10 ring-1 ring-gold/40' : 'hover:border-gold/50 hover:bg-raised'}`}
    >
      <div className="flex items-start gap-3">
        <Medallion name={c.name} url={v.portrait} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className={`font-display text-base leading-tight truncate ${selected ? 'text-gold' : 'text-ink'}`}>{c.name || 'Unnamed'}</div>
            <Badge tone={KIND_TONE[c.kind] ?? 'dim'}>{KIND_LABEL[c.kind] ?? c.kind}</Badge>
          </div>
          <div className="text-xs text-ink/80 truncate mt-0.5">
            {c.class_name || 'No class'} <span className="num">{c.level}</span>
            {c.species && <span className="text-dim"> · {c.species}</span>}
          </div>
          <div className="text-xs text-dim truncate">{c.player ? `Played by ${c.player}` : 'No player yet'}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-end gap-3">
        {v.maxHp ? <HpBar hp={v.hp ?? 0} max={v.maxHp} temp={v.tempHp} label /> : <span className="text-xs text-dim">No hit points yet</span>}
        <span className="flex items-center gap-1 text-sm num" title="Armour Class">
          <ShieldIcon size={13} className="text-dim" aria-hidden />
          <span className="sr-only">Armour Class</span>
          {v.ac ?? '—'}
        </span>
        <span className="flex items-center gap-1 text-sm num" title="Passive Perception">
          <Eye size={13} className="text-dim" aria-hidden />
          <span className="sr-only">Passive Perception</span>
          {v.perception ?? '—'}
        </span>
      </div>
    </button>
  );
}

export function PartyPage() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  // "?character=" opens that character (the builder's "Save to Party and Characters" comes here).
  const [sp, setSp] = useSearchParams();
  const [sel, setSelState] = useState<number | null>(Number(sp.get('character')) || null);
  // Edits made on the sheet, so the roster and the summary follow them before the next reload.
  const [edited, setEdited] = useState<Record<number, Character>>({});
  const [adding, setAdding] = useState(false);
  const setSel = (id: number) => {
    setSelState(id);
    setSp(
      (cur) => {
        const n = new URLSearchParams(cur);
        n.set('character', String(id));
        return n;
      },
      { replace: true },
    );
  };
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  const chars = data.characters.map((c) => edited[c.id] ?? c);
  const ch = chars.find((c) => c.id === sel) ?? chars[0];
  const add = async () => {
    setAdding(true);
    try {
      const c = await api.post<Character>('/api/characters', { campaign_id: activeCampaignId, name: 'New character', sheet: { abilities: Object.fromEntries(ABILS.map((a) => [a, 10])) } });
      await reload();
      setSel(c.id);
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Party and Characters"
        subtitle={data.campaign.title}
        note="D&D 2024 basics. Modifiers and proficiency bonus are calculated; everything else is what you enter."
        actions={
          <>
            <Link to="/campaign/party-export" className="btn">
              <FileText size={14} /> Party summary
            </Link>
            {chars.length > 0 && (
              <button className="btn-primary" onClick={() => void add()} disabled={adding}>
                <Plus size={14} /> Add character
              </button>
            )}
          </>
        }
      />
      {!chars.length ? (
        <Empty
          icon={<Users size={28} />}
          title="No characters yet"
          action={
            <>
              <button className="btn-primary" onClick={() => void add()} disabled={adding}>
                <Plus size={14} /> Add character
              </button>
              <a className="btn" href="/player/builder" target="_blank" rel="noreferrer">
                <UserPlus size={14} /> Make a Character
              </a>
            </>
          }
        >
          Add a blank sheet and fill it in here, or build one step by step in Make a Character and save it to the party.
        </Empty>
      ) : (
        <>
          <PartySummary chars={chars} />
          <section aria-label="The party">
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
              {chars.map((c) => (
                <RosterCard key={c.id} c={c} selected={ch?.id === c.id} onSelect={() => setSel(c.id)} />
              ))}
            </div>
          </section>
          {ch && (
            <CharacterSheet
              key={ch.id}
              ch={ch}
              onEdited={(c) => setEdited((m) => ({ ...m, [c.id]: c }))}
              onDeleted={() => {
                setSelState(null);
                void reload();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function CharacterSheet({ ch: initial, onDeleted, onEdited }: { ch: Character; onDeleted: () => void; onEdited: (c: Character) => void }) {
  const mech = useModules();
  const [ch, setChState] = useState(initial);
  const setCh = (f: Character | ((c: Character) => Character)) =>
    setChState((cur) => {
      const n = typeof f === 'function' ? f(cur) : f;
      onEdited(n);
      return n;
    });
  const auto = useAutosave((c: Character) => api.patch(`/api/characters/${c.id}`, { name: c.name, player: c.player, kind: c.kind, species: c.species, class_name: c.class_name, level: c.level, sheet: c.sheet, notes: c.notes }));
  const set = (p: Partial<Character>) => {
    const n = { ...ch, ...p };
    setCh(n);
    auto.schedule(n);
  };
  const sh = ch.sheet;
  const setSheet = (p: Partial<Character['sheet']>) => set({ sheet: { ...sh, ...p } });
  const page = useCharacterPage(ch.id);
  const loadLog = useCallback(() => api.get<LogEntry[]>(`/api/characters/${ch.id}/log`), [ch.id]);
  const portrait = (sh as Sheet).portrait;
  return (
    <section className="space-y-3" aria-label={`${ch.name}'s sheet`}>
      <div className="title-band flex flex-wrap items-end gap-x-4 gap-y-3 py-3!">
        <div className="min-w-0 basis-full sm:basis-auto sm:mr-2 self-center">
          {/* The sheet's own header names the character; this band holds the GM's settings for it. */}
          <h2 className="text-[11px] uppercase tracking-wider text-dim">
            For the GM<span className="sr-only">: {ch.name || 'Unnamed'}</span>
          </h2>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Player">
            <input className="input" value={ch.player} onChange={(e) => set({ player: e.target.value })} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Status">
            <select className="input" value={ch.kind} onChange={(e) => set({ kind: e.target.value })}>
              {['pc', 'companion', 'retired', 'dead'].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="pb-2">
          <SaveStatus state={auto.state === 'idle' ? page.state : auto.state} error={auto.error ?? page.error} />
        </div>
        <button
          className="btn-danger ml-auto"
          aria-label={`Delete ${ch.name}`}
          onClick={async () => {
            if (!(await ask({ body: `Delete ${ch.name}?`, danger: true, confirmLabel: 'Delete' }))) return;
            await api.del(`/api/characters/${ch.id}`);
            onDeleted();
          }}
        >
          <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
      <FullSheet
        value={{ name: ch.name, species: ch.species, class_name: ch.class_name, level: ch.level, sheet: sh }}
        onChange={(next) => set({ name: next.name, species: next.species, class_name: next.class_name, level: next.level, sheet: next.sheet as Character['sheet'] })}
        storeKey="wk.gm.sheet.tab"
        portraitUrl={portrait ? `/api/uploads/${encodeURIComponent(portrait)}` : null}
        onPortrait={async (image) => {
          const saved = image ? await api.post<Character>(`/api/characters/${ch.id}/portrait`, { image }) : await api.del<Character>(`/api/characters/${ch.id}/portrait`);
          setCh((cur) => {
            const sheet = { ...cur.sheet } as Sheet;
            const p = (saved.sheet as Sheet).portrait;
            if (p) sheet.portrait = p;
            else delete sheet.portrait;
            return { ...cur, sheet: sheet as Character['sheet'] };
          });
        }}
        loadLog={loadLog}
        extraTabs={[
          ...(page.data && mech.has('thinning') ? [{ id: 'thinning', label: 'Thinning', content: <ThinningTab gm page={page.data} onChange={(t, now) => page.set(t, now)} /> }] : []),
          ...(page.data ? [{ id: 'notes', label: 'Player notes', content: <NotesTab gm notes={page.data.notes} onChange={(notes) => page.set({ ...page.data!, notes })} /> }] : []),
          {
            id: 'gm',
            label: 'GM only',
            content: (
              <GmOnly className="space-y-6">
                {page.data && <PlayerLink characterId={ch.id} code={page.data.code} updatedAt={page.data.updated_at} onNewCode={page.reload} />}
                <Field label="Setting mechanics (GM only, HOMEBREW)">
                  <AutoTextarea minRows={2} value={sh.shardscarred ?? ''} onChange={(e) => setSheet({ shardscarred: e.target.value })} />
                </Field>
                <WorldTies hometown={sh.hometown ?? null} ties={sh.ties ?? []} onChange={(p) => setSheet(p)} />
                <Field label="Notes (GM only)">
                  <AutoTextarea minRows={3} value={ch.notes} onChange={(e) => set({ notes: e.target.value })} />
                </Field>
                <p className="text-xs text-dim">Nothing on this tab is shown to the player, on their sheet or in its log.</p>
              </GmOnly>
            ),
          },
        ]}
      />
    </section>
  );
}

interface CharacterPageData {
  code: string;
  true_name: string;
  memories: { id?: number; text: string; struck: boolean }[];
  known_by: string[];
  thinning: number;
  shardscarred: boolean;
  notes: string;
  updated_at: string;
}

/** The character's page (memories, true name, Thinning), saved as the GM edits it. */
function useCharacterPage(characterId: number) {
  const { data, reload } = useApi<CharacterPageData>(`/api/characters/${characterId}/page`);
  const [page, setPage] = useState<CharacterPageData | null>(null);
  useEffect(() => setPage(data ?? null), [data]);
  const auto = useAutosave((p: CharacterPageData) =>
    api.patch(`/api/characters/${characterId}/page`, { true_name: p.true_name, memories: p.memories, known_by: p.known_by, thinning: p.thinning, shardscarred: p.shardscarred, notes: p.notes }),
  );
  return {
    data: page,
    reload,
    state: auto.state,
    error: auto.error,
    set: (p: Partial<CharacterPageData>, now = false) => {
      if (!page) return;
      const n = { ...page, ...p };
      setPage(n);
      auto.schedule(n);
      if (now) void auto.flush?.();
    },
  };
}

/** The player's private code and link to their sheet on the table server. */
function PlayerLink({ characterId, code, updatedAt, onNewCode }: { characterId: number; code: string; updatedAt: string; onNewCode: () => void }) {
  const link = `/player/me/${code}`;
  return (
    <Section title="The player's link" className="space-y-2">
      <p className="text-sm text-dim">
        The player keeps this sheet on the table server: code <b className="text-gold tracking-widest">{code}</b>, or the link {link} on the table server&apos;s address. Only they and you can see it.
        Updated {new Date(updatedAt).toLocaleString()}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn text-xs" onClick={() => void navigator.clipboard?.writeText(link)}>
          <Copy size={12} /> Copy link
        </button>
        <button
          className="btn text-xs"
          onClick={async () => {
            if (!(await ask({ body: 'Give this sheet a new code? The old link stops working.', danger: true, confirmLabel: 'New code' }))) return;
            await api.post(`/api/characters/${characterId}/page/new-code`, {});
            onNewCode();
          }}
        >
          New code
        </button>
      </div>
    </Section>
  );
}

export const TIE_KINDS = ['Faction', 'Family', 'Friend', 'Rival', 'Enemy', 'Patron', 'Mentor', 'Owes them', 'Owed by them', 'Secret', 'Other'];

/** A character's ties to the world: where they come from, and the people, factions and places in their story. */
function WorldTies({
  hometown,
  ties,
  onChange,
}: {
  hometown: string | null;
  ties: { entity_id: string; kind: string; note: string }[];
  onChange: (p: { hometown?: string | null; ties?: { entity_id: string; kind: string; note: string }[] }) => void;
}) {
  const [entity, setEntity] = useState<string | null>(null);
  const [kind, setKind] = useState('Friend');
  const [note, setNote] = useState('');
  return (
    <Section title="Ties to the world" className="space-y-2">
      <div className="grid gap-2 md:grid-cols-[1fr_2fr] items-end">
        <Field label="Hometown">
          <EntityPicker value={hometown} onChange={(v) => onChange({ hometown: v })} types={['@place']} />
        </Field>
      </div>
      {ties.length > 0 && (
        <ul className="divide-y divide-line/50">
          {ties.map((t, i) => (
            <li key={`${t.entity_id}-${i}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <Badge>{t.kind}</Badge>
              <EntityLink id={t.entity_id} />
              <input
                className="input flex-1 min-w-48 text-sm"
                value={t.note}
                placeholder="What's between them"
                onChange={(e) => onChange({ ties: ties.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })}
              />
              <button className="btn-ghost" aria-label="Remove tie" onClick={() => onChange({ ties: ties.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto] items-end">
        <Field label="Tie">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {TIE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="To">
          <EntityPicker value={entity} onChange={setEntity} />
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <button
          className="btn"
          disabled={!entity}
          onClick={() => {
            if (!entity) return;
            onChange({ ties: [...ties, { entity_id: entity, kind, note }] });
            setEntity(null);
            setNote('');
          }}
        >
          <Plus size={14} /> Add tie
        </button>
      </div>
    </Section>
  );
}

/** Party members tied to a record, for its page. */
export function PartyTiesPanel({ entityId }: { entityId: string }) {
  const { activeCampaignId } = useAppState();
  const { data } = useApi<{ character_id: number; name: string; tie: string; note: string }[]>(
    activeCampaignId ? `/api/party-ties?entity=${encodeURIComponent(entityId)}&campaign_id=${activeCampaignId}` : null,
  );
  if (!data?.length) return null;
  return (
    <Card title="The party">
      <ul className="text-sm space-y-1">
        {data.map((t, i) => (
          <li key={i}>
            <Link to="/campaign/party" className="text-arcane">
              {t.name}
            </Link>{' '}
            <span className="text-dim">· {t.tie}</span>
            {t.note && <span className="text-ink/80"> · {t.note}</span>}
          </li>
        ))}
      </ul>
    </Card>
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
        {!data.quests.length && <Empty title="No quests yet">Type a title above and press Add quest.</Empty>}
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
    <Card className={`space-y-2 ${highlight ? 'border-gold' : ''}`}>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input flex-1 font-display" value={q.title} onChange={(e) => set({ title: e.target.value })} />
        <select className="input w-auto" value={q.status} onChange={(e) => set({ status: e.target.value })}>
          {['open', 'active', 'completed', 'failed', 'abandoned', 'rumoured'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Toggle checked={q.player_visible} onChange={(v) => set({ player_visible: v })}>
          Players see
        </Toggle>
        <SaveStatus state={auto.state} />
        <button
          className="btn-ghost"
          onClick={async () => {
            if (!(await ask({ body: 'Delete this quest?', danger: true, confirmLabel: 'Delete' }))) return;
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
          <EntityPicker value={q.giver_id} types={['@person', '@group']} onChange={(id) => set({ giver_id: id })} />
        </Field>
        <Field label="Location">
          <EntityPicker value={q.location_id} onChange={(id) => set({ location_id: id })} />
        </Field>
      </div>
      <Field label="Description (players may see this)">
        <AutoTextarea minRows={2} value={q.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <GmOnly inline>
        <Field label="DM notes">
          <AutoTextarea minRows={2} value={q.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </GmOnly>
    </Card>
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
              void nav(`/session/${s.id}`);
            }}
          >
            <Plus size={14} /> Prepare next session
          </button>
        }
      />
      <Card flush>
        <DataTable
          rows={data.sessions}
          rowKey={(s) => s.id}
          onRowClick={(s) => nav(`/session/${s.id}`)}
          empty={<Empty compact title="No sessions yet." />}
          columns={[
            { key: 'number', label: '#', num: true, align: 'left', sortable: true },
            { key: 'title', label: 'Title', sortable: true, render: (s) => s.title || <span className="text-dim">Untitled</span> },
            { key: 'status', label: 'Status', sortable: true },
            { key: 'played_on', label: 'Played', sortable: true },
            { key: 'in_world_date', label: 'In-world' },
          ]}
        />
      </Card>
    </div>
  );
}

const PREP_FIELDS: [string, string][] = [
  ['goals', 'Goals and stakes'],
  ['scenes', 'Planned scenes'],
  ['recap', 'Previous session recap'],
  ['partyLocation', 'Current party location'],
  ['npcNotes', 'NPC notes'],
  ['readAloud', 'Read-aloud descriptions'],
  ['clues', 'Clues'],
  ['encounters', 'Encounter references'],
  ['treasure', 'Treasure'],
  ['consequences', 'Possible consequences'],
  ['questions', 'Open questions'],
];

const QUEST_ORDER: Record<string, number> = { active: 0, open: 1, rumoured: 2 };
const SESSION_TONE: Record<string, Tone> = { planned: 'arcane', live: 'danger', completed: 'ok' };
const SESSION_LABEL: Record<string, string> = { planned: 'Planned', live: 'Live now', completed: 'Played' };

/** Up to `n` items, then "and N more". */
function Capped<T>({ items, n, render, className = 'space-y-1.5' }: { items: T[]; n: number; render: (x: T, i: number) => React.ReactNode; className?: string }) {
  return (
    <ul className={className}>
      {items.slice(0, n).map(render)}
      {items.length > n && <li className="text-xs text-dim italic">and {items.length - n} more</li>}
    </ul>
  );
}

/** One card on the prep board: a title with its count, the list, and a quiet link to the full page. */
function BoardCard({ title, icon, count, more, className = '', children }: { title: string; icon: React.ReactNode; count?: number; more?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Card
      className={`flex min-w-0 flex-col text-sm ${className}`}
      icon={<span className="text-gold/80">{icon}</span>}
      title={
        <>
          {title}
          {count != null && <span className="num ml-1 rounded-sm border border-line px-1.5 text-[11px] tracking-normal text-dim">{count}</span>}
        </>
      }
    >
      <div className="flex-1">{children}</div>
      {more && <div className="mt-3 border-t border-line/60 pt-2 text-xs">{more}</div>}
    </Card>
  );
}

function EncounterRow({ e, note }: { e: Overview['encounters'][number] & { combatants?: unknown[] }; note?: string }) {
  const foes = e.combatants?.length;
  return (
    <li className="flex items-center gap-2">
      <Swords size={13} className="shrink-0 text-dim" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link to={`/tracker/${e.id}`} className="block truncate hover:text-gold">
          {e.title}
        </Link>
        <div className="text-xs text-dim">
          {e.status}
          {foes ? (
            <>
              {' '}
              · <span className="num">{foes}</span> {foes === 1 ? 'combatant' : 'combatants'}
            </>
          ) : null}
          {note && ` · ${note}`}
        </div>
      </div>
      <Link to={`/tracker/${e.id}`} className="btn text-xs px-2! py-1!" aria-label={`Run ${e.title}`}>
        <Play size={12} /> Run
      </Link>
    </li>
  );
}

/** An adventure the session has in play, with its scenes. */
function AdventureInPlay({ a, current, onRemove }: { a: Adventure; current: number | null; onRemove: () => void }) {
  const { data: scenes } = useApi<Scene[]>(`/api/scenes?adventure_id=${a.id}`);
  return (
    <li className="rounded-md border border-line bg-raised/40 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/adventure/${a.id}`} className="font-display text-ink hover:text-gold">
            {a.title}
          </Link>
          <div className="text-xs text-dim">
            {a.status}
            {a.arc && ` · ${a.arc}`}
            {scenes && (
              <>
                {' '}
                · <span className="num">{scenes.length}</span> {scenes.length === 1 ? 'scene' : 'scenes'}
              </>
            )}
          </div>
        </div>
        <button type="button" className="btn-ghost p-1!" onClick={onRemove} aria-label={`Take ${a.title} out of play`} title="Take out of play">
          <X size={14} />
        </button>
      </div>
      {scenes?.length ? (
        <Capped
          items={scenes}
          n={5}
          className="mt-2 space-y-1"
          render={(sc, i) => (
            <li key={sc.id} className={`flex items-baseline gap-2 ${sc.id === current ? 'text-gold' : ''}`}>
              <span className="num w-5 shrink-0 text-right text-xs text-dim">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{sc.title}</span>
              <span className="text-[11px] text-dim">{sc.id === current ? 'current' : sc.kind}</span>
            </li>
          )}
        />
      ) : scenes ? (
        <p className="mt-2 text-xs text-dim italic">No scenes yet.</p>
      ) : null}
    </li>
  );
}

function PrepBoard({ s, b, overview, advs, setPrep }: { s: Session; b: Briefing | null; overview: Overview | null; advs: Adventure[] | null; setPrep: (k: string, v: unknown) => void }) {
  const { index } = useAppState();
  const sk = (n = 3) => (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
  // Quests: the campaign's active, open and rumoured ones (the briefing's list when the campaign isn't loaded yet).
  const quests: { id: number; title: string; status: string; giver_id: string | null; location_id: string | null }[] = overview
    ? overview.quests
        .filter((q) => QUEST_ORDER[q.status] != null)
        .sort((x, y) => QUEST_ORDER[x.status] - QUEST_ORDER[y.status])
    : (b?.quests ?? []).map((q) => ({ ...q, giver_id: null, location_id: null }));
  // People: those who live here and those met in play, then any picked NPCs not already listed.
  const metIds = new Set(b?.met.map((m) => m.id) ?? []);
  const people: { id: string; met?: boolean; picked?: boolean }[] = [];
  const seen = new Set<string>();
  for (const id of (s.prep.relevantIds ?? []).filter((id) => index.get(id)?.type === 'npc')) (seen.add(id), people.push({ id, picked: true, met: metIds.has(id) }));
  for (const p of [...(b?.locals ?? []), ...(b?.met ?? [])]) if (!seen.has(p.id)) (seen.add(p.id), people.push({ id: p.id, met: metIds.has(p.id) }));
  // Encounters: this session's first, then prepared ones not yet run.
  const encs = overview?.encounters ?? [];
  const mine = encs.filter((e) => e.session_id === s.id);
  const other = encs.filter((e) => e.session_id !== s.id && e.status === 'prepared');
  const sessionNo = (id: number | null) => overview?.sessions.find((x) => x.id === id)?.number;
  const inPlay = (s.prep.adventureIds ?? []).map((id) => advs?.find((a) => a.id === id)).filter((a): a is Adventure => !!a);
  const notInPlay = (advs ?? []).filter((a) => !(s.prep.adventureIds ?? []).includes(a.id));
  const moving = b ? b.agendas.length + b.coming.length + b.standing.filter((x) => x.close && x.next).length : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <BoardCard
        title="Where the party is"
        icon={<MapPin size={15} />}
        more={
          <Link to="/atlas" className="text-arcane hover:text-gold">
            Open the Atlas
          </Link>
        }
      >
        {!b ? (
          sk(2)
        ) : b.location ? (
          <>
            <p className="font-display text-base">{b.location.id ? <EntityLink id={b.location.id} /> : b.location.name}</p>
            {b.chain.length > 0 && <p className="text-xs text-dim">{b.chain.map((c) => c.name).join(' · ')}</p>}
            {b.terrain?.length ? <p className="text-xs text-dim mt-1 capitalize">{b.terrain.join(', ')}</p> : null}
            {b.nearby.length > 0 && (
              <>
                <div className="label mt-3">Nearby</div>
                <Capped
                  items={b.nearby}
                  n={8}
                  className="flex flex-wrap gap-x-3 gap-y-1"
                  render={(n) => (
                    <li key={n.id}>
                      <EntityLink id={n.id} />
                    </li>
                  )}
                />
              </>
            )}
          </>
        ) : (
          <Empty compact title="Unknown.">Move the party on the map, or set the campaign's starting place.</Empty>
        )}
      </BoardCard>

      <BoardCard
        title="Quests in play"
        icon={<Flag size={15} />}
        count={quests.length}
        more={
          <Link to="/campaign/quests" className="text-arcane hover:text-gold">
            All quests
          </Link>
        }
      >
        {!overview && !b ? (
          sk()
        ) : quests.length ? (
          <Capped
            items={quests}
            n={6}
            render={(q) => (
              <li key={q.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link to={`/campaign/quests?quest=${q.id}`} className="hover:text-gold">
                    {q.title}
                  </Link>
                  {(q.giver_id || q.location_id) && (
                    <div className="text-xs text-dim truncate">
                      {q.giver_id && (
                        <>
                          from <EntityLink id={q.giver_id} />
                        </>
                      )}
                      {q.giver_id && q.location_id && ' · '}
                      {q.location_id && (
                        <>
                          at <EntityLink id={q.location_id} />
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Badge tone={q.status === 'active' ? 'gold' : q.status === 'rumoured' ? 'warn' : 'ok'}>{q.status}</Badge>
              </li>
            )}
          />
        ) : (
          <Empty compact title="No open quests." />
        )}
      </BoardCard>

      <BoardCard
        title="Likely NPCs"
        icon={<Users size={15} />}
        count={people.length}
        more={
          <Link to="/npc-ref" className="text-arcane hover:text-gold">
            NPC Quick Reference
          </Link>
        }
      >
        {!b ? (
          sk()
        ) : people.length ? (
          <Capped
            items={people}
            n={12}
            className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"
            render={(p) => (
              <li key={p.id} className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">
                  <EntityLink id={p.id} />
                </span>
                {p.met && <span className="text-[10px] uppercase tracking-wider text-ok">met</span>}
                {p.picked && !p.met && <span className="text-[10px] uppercase tracking-wider text-gold">picked</span>}
              </li>
            )}
          />
        ) : (
          <Empty compact title="Nobody yet." />
        )}
      </BoardCard>

      <BoardCard
        title="Clues to find"
        icon={<Search size={15} />}
        count={b?.clues.length}
        more={
          <Link to="/mysteries" className="text-arcane hover:text-gold">
            Mysteries
          </Link>
        }
      >
        {!b ? (
          sk()
        ) : b.clues.length ? (
          <Capped
            items={b.clues}
            n={6}
            className="space-y-2"
            render={(c) => (
              <li key={c.id} className="leading-snug">
                {c.mystery && <div className="text-[11px] uppercase tracking-wider text-dim">{c.mystery}</div>}
                {c.note || c.secret}
                {c.entity_id && (
                  <>
                    {' '}
                    <span className="text-xs">
                      (<EntityLink id={c.entity_id} />)
                    </span>
                  </>
                )}
              </li>
            )}
          />
        ) : (
          <Empty compact title="No unfound clues point here." />
        )}
      </BoardCard>

      <BoardCard
        title="Encounters"
        icon={<Swords size={15} />}
        count={mine.length || other.length}
        more={
          <Link to="/campaign/encounters" className="text-arcane hover:text-gold">
            Prepare an encounter
          </Link>
        }
      >
        {!overview ? (
          sk()
        ) : mine.length ? (
          <Capped items={mine} n={5} className="space-y-2" render={(e) => <EncounterRow key={e.id} e={e} />} />
        ) : other.length ? (
          <>
            <p className="mb-2 text-xs text-dim">None for this session yet. Prepared and not yet run:</p>
            <Capped
              items={other}
              n={5}
              className="space-y-2"
              render={(e) => <EncounterRow key={e.id} e={e} note={e.session_id ? `for session ${sessionNo(e.session_id) ?? '?'}` : undefined} />}
            />
          </>
        ) : (
          <Empty compact title="No encounters prepared." />
        )}
      </BoardCard>

      <BoardCard
        title="Moving soon"
        icon={<Hourglass size={15} />}
        count={b ? moving : undefined}
        more={
          <Link to="/agendas" className="text-arcane hover:text-gold">
            Faction Agendas
          </Link>
        }
      >
        {!b ? (
          sk()
        ) : moving ? (
          <Capped
            items={[
              ...b.agendas.map((a) => (
                <li key={`a${a.id}`} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1">
                    {a.faction_id ? <EntityLink id={a.faction_id}>{a.faction ?? 'A faction'}</EntityLink> : (a.faction ?? 'A faction')}: {a.title}
                  </span>
                  <span className="num text-xs text-dim">
                    {a.progress}/{a.segments}
                  </span>
                </li>
              )),
              ...b.coming.map((c, i) => (
                <li key={`c${i}`} className="flex items-baseline gap-2">
                  <span className={`min-w-0 flex-1 ${c.kind === 'festival' ? 'text-gold' : ''}`}>{c.title}</span>
                  <span className="text-xs text-dim">{c.inDays === 0 ? 'today' : c.inDays === 1 ? 'tomorrow' : `in ${c.inDays} days`}</span>
                </li>
              )),
              ...b.standing
                .filter((x) => x.close && x.next)
                .map((x) => (
                  <li key={`s${x.faction_id}`}>
                    <EntityLink id={x.faction_id}>{x.name}</EntityLink>: {x.rank}, <span className="num">{x.next!.at - x.renown}</span> Renown from {x.next!.name}
                  </li>
                )),
            ]}
            n={6}
            render={(x) => x}
          />
        ) : (
          <Empty compact title="No agenda or standing is about to tip." />
        )}
      </BoardCard>

      <BoardCard
        title="Adventures in play"
        icon={<BookOpen size={15} />}
        count={inPlay.length}
        className="xl:col-span-2"
        more={
          notInPlay.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="text-dim whitespace-nowrap">Put in play</span>
              <select
                className="input w-auto! max-w-full py-1! text-xs"
                value=""
                aria-label="Put an adventure in play"
                onChange={(e) => e.target.value && setPrep('adventureIds', [...(s.prep.adventureIds ?? []), Number(e.target.value)])}
              >
                <option value="">Choose an adventure…</option>
                {notInPlay.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.status})
                  </option>
                ))}
              </select>
            </label>
          )
        }
      >
        {!advs ? (
          sk()
        ) : inPlay.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {inPlay.map((a) => (
              <AdventureInPlay key={a.id} a={a} current={s.current_scene_id} onRemove={() => setPrep('adventureIds', (s.prep.adventureIds ?? []).filter((x) => x !== a.id))} />
            ))}
          </ul>
        ) : advs.length ? (
          <Empty compact title="No adventure in play yet.">Choose one below; its scenes show here and in live mode.</Empty>
        ) : (
          <Empty compact title="No adventures in this campaign yet.">
            <Link to="/campaign/adventures" className="text-arcane">
              Adventures
            </Link>
          </Empty>
        )}
      </BoardCard>

      <BoardCard title="Tables for here" icon={<Dices size={15} />} count={b ? b.tables.length + (b.treasure ? 1 : 0) : undefined}>
        {!b ? (
          sk(2)
        ) : b.tables.length || b.treasure ? (
          <Capped
            items={[
              ...b.tables.map((t) => (
                <li key={t.id}>
                  <Link to={`/tables?t=${t.id}`} className="text-arcane hover:text-gold">
                    {t.name}
                  </Link>
                </li>
              )),
              ...(b.treasure
                ? [
                    <li key="treasure">
                      <Link to="/campaign/treasure" className="text-arcane hover:text-gold">
                        Treasure: {b.treasure.label}, levels {b.treasure.tier}
                      </Link>
                    </li>,
                  ]
                : []),
            ]}
            n={6}
            render={(x) => x}
          />
        ) : (
          <Empty compact title="No tables for this place yet." />
        )}
      </BoardCard>
    </div>
  );
}

type LogRow = { id: number; kind: string; text: string; entity_id: string | null; created_at: string };

export function SessionPage() {
  const { id } = useParams();
  const { data, reload } = useApi<Session>(`/api/sessions/${id}`);
  const { data: log, reload: reloadLog } = useApi<LogRow[]>(`/api/session-log?session_id=${id}`);
  const { data: changes, reload: reloadChanges } = useApi<StateRow[]>(`/api/campaign-state?session_id=${id}`);
  const { data: advs } = useApi<Adventure[]>(data ? `/api/adventures?campaign_id=${data.campaign_id}` : null);
  const { data: overview } = useApi<Overview>(data ? `/api/campaigns/${data.campaign_id}/overview` : null);
  const { data: briefing } = useApi<Briefing>(`/api/sessions/${id}/briefing`);
  const [s, setS] = useState<Session | null>(null);
  const [tab, setTab] = useState<'prep' | 'log' | 'recap' | 'review'>('prep');
  const nav = useNavigate();
  const { toast, node } = useToast();
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  const auto = useAutosave((x: Session) =>
    api.patch(`/api/sessions/${x.id}`, {
      title: x.title,
      played_on: x.played_on,
      in_world_date: x.in_world_date,
      date_year: x.date_year ?? null,
      date_day: x.date_day ?? null,
      prep: x.prep,
      recap: x.recap,
      recap_player_visible: x.recap_player_visible,
    }),
  );
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
  const fillFromWorld = (b: Briefing) => {
    // Only fields that are still empty: nothing you've written is changed.
    const fill = briefingFill(b);
    const prep = { ...s.prep } as Record<string, unknown>;
    let n = 0;
    for (const [k, v] of Object.entries(fill)) {
      const cur = prep[k];
      if (Array.isArray(cur) ? cur.length : typeof cur === 'string' && cur.trim()) continue;
      prep[k] = v;
      n++;
    }
    set({ prep: prep as Session['prep'] });
    toast(n ? `Filled ${n} empty field${n === 1 ? '' : 's'}.` : 'Every field already has something in it.');
  };
  const filled = PREP_FIELDS.filter(([k]) => (s.prep[k] ?? '').trim()).length;
  return (
    <div className="space-y-5">
      {node}
      <header className="title-band gilt-corners elev-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
              <span className="uppercase tracking-[0.18em]">{overview?.campaign.title ?? 'Session'}</span>
            </div>
            <h1 className="text-2xl text-gold leading-tight mt-1">
              Session <span className="num">{s.number}</span>
              {s.title && <span className="text-ink"> · {s.title}</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
              <Badge tone={SESSION_TONE[s.status] ?? 'dim'}>{SESSION_LABEL[s.status] ?? s.status}</Badge>
              <span className="flex items-center gap-1">
                <CalendarDays size={13} aria-hidden /> {s.played_on ? <span className="num text-ink/90">{s.played_on}</span> : 'Not played yet'}
              </span>
              {s.in_world_date && (
                <span className="flex items-center gap-1">
                  <Sun size={13} aria-hidden /> <span className="text-ink/90">{s.in_world_date}</span>
                </span>
              )}
              <SaveStatus state={auto.state} error={auto.error} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.status !== 'live' ? (
              <button
                className="btn-primary"
                onClick={async () => {
                  await auto.flush();
                  await api.post(`/api/sessions/${s.id}/start`);
                  void nav('/campaign/live');
                }}
              >
                <Play size={14} /> {s.status === 'completed' ? 'Reopen live' : 'Start live session'}
              </button>
            ) : (
              <Link to="/campaign/live" className="btn-primary">
                <Play size={14} /> Return to live mode
              </Link>
            )}
          </div>
        </div>
        <div className="grid gap-3 border-t border-line/70 pt-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Title">
            <input className="input" value={s.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Played on">
            <input className="input num" value={s.played_on} onChange={(e) => set({ played_on: e.target.value })} placeholder="YYYY-MM-DD" />
          </Field>
          <SessionDate campaignId={s.campaign_id} session={s} onChange={set} />
        </div>
      </header>
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
        <div className="space-y-4">
          <Card
            featured
            icon={<ScrollText size={16} className="text-gold" />}
            title="Your prep"
            aside={
              <span className="hidden sm:inline">
                <span className="num">{filled}</span> of <span className="num">{PREP_FIELDS.length}</span> written
                {briefing && (
                  <>
                    {' '}
                    · party level <span className="num">{briefing.level}</span>
                  </>
                )}
              </span>
            }
            actions={
              <button type="button" className="btn text-xs" disabled={!briefing} onClick={() => briefing && fillFromWorld(briefing)} title="Copies what the world knows into prep fields that are still empty. Nothing you've written is changed.">
                <Wand2 size={13} /> Fill the empty prep fields
              </button>
            }
          >
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {PREP_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <AutoTextarea minRows={2} value={s.prep[k] ?? ''} onChange={(e) => setPrep(k, e.target.value)} />
                </Field>
              ))}
            </div>
            <div className="mt-4 border-t border-line/60 pt-3">
              <EntityMultiPicker label="Relevant NPCs and locations (shown in live mode)" value={s.prep.relevantIds ?? []} onChange={(ids) => setPrep('relevantIds', ids)} />
            </div>
          </Card>
          <div className="flex items-center gap-3">
            <h2 className="section-title flex items-center gap-2">
              <Compass size={15} className="text-gold" /> From the world
            </h2>
            <span className="h-px flex-1 bg-linear-to-r from-gold/50 to-transparent" aria-hidden />
            <span className="text-xs text-dim hidden sm:inline">Built from the campaign as it stands now</span>
          </div>
          <PrepBoard s={s} b={briefing ?? null} overview={overview ?? null} advs={advs ?? null} setPrep={setPrep} />
        </div>
      )}
      {tab === 'log' && (
        <Card
          flush
          title="Recorded log"
          aside={log?.length ? `${log.length} ${log.length === 1 ? 'entry' : 'entries'}, oldest first` : undefined}
          actions={
            <Link to="/campaign/live" className="btn-ghost text-xs">
              <Play size={12} /> Live mode
            </Link>
          }
        >
          <DataTable
            rows={log ?? []}
            rowKey={(l) => l.id}
            empty={
              <Empty compact title="Nothing recorded.">
                Use live mode to log events as they happen.
              </Empty>
            }
            columns={[
              { key: 'created_at', label: 'Time', sortable: true, className: 'text-xs text-dim whitespace-nowrap num', render: (l) => new Date(l.created_at).toLocaleTimeString() },
              { key: 'kind', label: 'Kind', sortable: true, render: (l) => <Badge>{l.kind}</Badge> },
              {
                key: 'text',
                label: 'Entry',
                render: (l) => (
                  <>
                    {l.text} {l.entity_id && <EntityLink id={l.entity_id} className="text-xs" />}
                  </>
                ),
              },
              {
                key: 'del',
                label: <span className="sr-only">Delete</span>,
                align: 'right',
                render: (l) => (
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
                ),
              },
            ]}
          />
        </Card>
      )}
      {tab === 'recap' && (
        <div className="space-y-4">
          <Card flush className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              className="btn"
              onClick={async () => {
                const { draft } = await api.post<{ draft: string }>(`/api/sessions/${s.id}/recap-draft`);
                if (s.recap.trim() && !(await ask({ body: 'Replace the current recap with a new draft generated from the log?', confirmLabel: 'Replace' }))) return;
                set({ recap: draft });
                toast('Draft generated from recorded entries only. Edit freely.');
              }}
            >
              <Wand2 size={14} /> Generate draft from recorded log
            </button>
            <Toggle checked={s.recap_player_visible} onChange={(v) => set({ recap_player_visible: v })}>
              Publish recap to player view
            </Toggle>
            {s.status === 'live' && (
              <button
                className="btn-primary sm:ml-auto"
                onClick={async () => {
                  await auto.flush();
                  await api.post(`/api/sessions/${s.id}/end`);
                  void reload();
                }}
              >
                <Check size={14} /> Mark session completed
              </button>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Write" aside="Markdown">
              <AutoTextarea full minRows={16} value={s.recap} onChange={(e) => set({ recap: e.target.value })} aria-label="Recap" />
            </Card>
            <Card featured title="As players read it" aside={s.recap_player_visible ? 'published' : 'not published'}>
              <div className="prose-lore max-w-[72ch]">
                <Markdown text={s.recap || '_No recap yet._'} />
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === 'review' && (
        <div className="space-y-3">
          <p className="text-sm text-dim max-w-[72ch]">Changes recorded during play. Accept the ones that happened; they apply to this campaign only. Accepted changes can then be proposed as world canon.</p>
          <StateTable
            title={`Changes recorded in this session (${changes?.filter((c) => c.status !== 'superseded').length ?? 0})`}
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
        <Card key={s.id} className="p-5">
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
        </Card>
      ))}
      {!done.length && <Empty title="No recaps yet">Recaps appear here once a session has one, or is completed.</Empty>}
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
            void nav(`/tracker/${e.id}`);
          }}
        >
          <Plus size={14} /> Prepare encounter
        </button>
      </div>
      <Card flush>
        <DataTable
          rows={data.encounters}
          rowKey={(e) => e.id}
          empty={<Empty compact title="No encounters prepared." />}
          columns={[
            {
              key: 'title',
              label: 'Encounter',
              sortable: true,
              render: (e) => (
                <Link className="hover:text-gold" to={`/tracker/${e.id}`}>
                  <Swords size={13} className="inline mr-1" />
                  {e.title}
                </Link>
              ),
            },
            { key: 'status', label: 'Status', sortable: true },
            { key: 'round', label: 'Round', num: true, sortable: true, render: (e) => `round ${e.round}` },
            {
              key: 'del',
              label: <span className="sr-only">Delete</span>,
              align: 'right',
              render: (e) => (
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    if (!(await ask({ body: 'Delete this encounter?', danger: true, confirmLabel: 'Delete' }))) return;
                    await api.del(`/api/encounters/${e.id}`);
                    void reload();
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              ),
            },
          ]}
        />
      </Card>
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
      <Card className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] items-end">
        <Field label="Blank adventure">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </Field>
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            const a = await api.post<Adventure>('/api/adventures', { title, campaign_id: activeCampaignId });
            void nav(`/adventure/${a.id}`);
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
            void nav(`/adventure/${a.id}`);
          }}
        >
          From hook
        </button>
      </Card>
      {!data ? (
        <Loading />
      ) : (
        groups.map(([arc, list]) => {
          const grid = (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mb-4">
              {list.map((a) => (
                <Link key={a.id} to={`/adventure/${a.id}`} className="block">
                  <Card className="h-full hover:border-gold/60">
                    <div className="font-display text-gold">{a.title}</div>
                    <div className="text-xs text-dim">
                      {a.status} {a.arc && `· ${a.arc}`}
                    </div>
                    <p className="text-sm line-clamp-2 mt-1">{a.data.premise}</p>
                  </Card>
                </Link>
              ))}
            </div>
          );
          return byArc ? (
            <Section key={arc} title={arc}>
              {grid}
            </Section>
          ) : (
            <div key={arc}>{grid}</div>
          );
        })
      )}
      {data && !data.length && <Empty title="No adventures yet">Give a blank adventure a title above, or start from a source hook.</Empty>}
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
  ['levels', 'Levels'],
  ['scaling', 'Scaling by level'],
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
          <Card>
            <span className="label">Clues</span>
            {(a.data.clues ?? []).map((c, i) => (
              <div key={i} className="flex gap-2 items-center mb-1">
                <CheckBox checked={c.found} onChange={(v) => setData('clues', a.data.clues.map((x, j) => (j === i ? { ...x, found: v } : x)))} label="Found" />
                <input className="input" value={c.text} onChange={(e) => setData('clues', a.data.clues.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn-ghost" onClick={() => setData('clues', a.data.clues.filter((_, j) => j !== i))} aria-label="Remove clue">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setData('clues', [...(a.data.clues ?? []), { text: '', found: false }])}>
              <Plus size={13} /> Add clue
            </button>
          </Card>
          <Card>
            <EntityMultiPicker label="Linked world records (locations, NPCs, factions…)" value={a.linked_ids} onChange={(ids) => set({ linked_ids: ids })} />
          </Card>
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
        <SceneCard key={s.id} s={s} onMove={(d) => move(s, d)} onCopy={() => setCopying(s)} onDelete={async () => {
            if (await ask({ body: 'Delete scene?', danger: true, confirmLabel: 'Delete' })) await api.del(`/api/scenes/${s.id}`);
            void reload();
          }}
        />
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
    <Card className="space-y-2">
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
        <GmOnly inline>
          <Field label="DM notes">
            <AutoTextarea full minRows={4} aria-label="Scene" value={s.body} onChange={(e) => set({ body: e.target.value })} />
          </Field>
        </GmOnly>
      </div>
      <EntityMultiPicker value={s.linked_ids} onChange={(ids) => set({ linked_ids: ids })} />
    </Card>
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
          style: { background: 'rgb(var(--raised))', color: 'rgb(var(--ink))', border: '1.5px solid rgb(var(--gold))', borderRadius: 6, width: 180 },
        })),
      );
  }, [scenes]);
  const edges: Edge[] = (links ?? []).map((l) => ({ id: String(l.id), source: String(l.from_scene), target: String(l.to_scene), label: l.label, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'rgb(var(--gold))' }, labelStyle: { fill: 'rgb(var(--ink))' }, labelBgStyle: { fill: 'rgb(var(--panel))' } }));
  const onNodesChange = useCallback((ch: NodeChangeset) => setNodes((n) => ch.applyTo(n)), []);
  return (
    <div className="space-y-2">
      <p className="text-sm text-dim">Drag scenes to arrange them. Drag from one scene's edge to another to connect them; click a connection to remove it.</p>
      <Card flush className="h-[65vh]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, n) => void api.patch(`/api/scenes/${n.id}`, { x: Math.round(n.position.x), y: Math.round(n.position.y) })}
          onConnect={async (c: Connection) => {
            const label = (await askText({ title: 'Label for this branch (optional)', confirmLabel: 'Connect' })) ?? '';
            await api.post('/api/scene-links', { adventure_id: adventureId, from_scene: Number(c.source), to_scene: Number(c.target), label });
            void reloadLinks();
          }}
          onEdgeClick={async (_, e) => {
            if (!(await ask({ body: 'Delete this connection?', danger: true, confirmLabel: 'Delete' }))) return;
            await api.del(`/api/scene-links/${e.id}`);
            void reloadLinks();
          }}
          fitView
          forceColorMode="dark"
        >
          <Background gap={20} color="rgb(var(--line))" />
          <Controls />
        </ReactFlow>
      </Card>
      <button className="btn" onClick={() => (void reload(), void reloadLinks())}>
        Refresh
      </button>
    </div>
  );
}

/**
 * A session's in-world date: written in words, or picked with the calendar's own months. Words the calendar can read
 * become a date on the server; others are kept as written.
 */
function SessionDate({ campaignId, session, onChange }: { campaignId: number; session: Session; onChange: (p: Partial<Session>) => void }) {
  const { data } = useApi<{ def: CalendarDef; date: WDate }>(`/api/calendar?campaign_id=${campaignId}&days=1`);
  const [value, setValue] = useState<WDate | null>(null);
  const dated = session.date_year != null ? { year: session.date_year, day: session.date_day ?? 1 } : null;
  return (
    <Field label="In-world date">
      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          value={session.in_world_date}
          aria-label="In-world date"
          placeholder={data ? `e.g. ${formatDate(data.def, data.date)}` : ''}
          // Typed words replace the picked date; the server reads them through the calendar.
          onChange={(e) => onChange({ in_world_date: e.target.value, date_year: null, date_day: null })}
        />
        {data && (
          <button className="btn" type="button" onClick={() => setValue(dated ?? data.date)}>
            Pick
          </button>
        )}
      </div>
      {data && value && (
        <Modal title="The session's in-world date" onClose={() => setValue(null)}>
          <div className="space-y-3">
            <DatePicker def={data.def} value={value} onChange={setValue} />
            <div className="flex gap-2">
              <button
                className="btn-primary"
                onClick={() => {
                  onChange({ in_world_date: formatDate(data.def, value), date_year: value.year, date_day: value.day });
                  setValue(null);
                }}
              >
                Set it
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  onChange({ in_world_date: '', date_year: null, date_day: null });
                  setValue(null);
                }}
              >
                No date
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Field>
  );
}

/** Where the campaign started and where it is now, in its world's calendar (set with the calendar's own months). */
function CampaignDates({ campaignId }: { campaignId: number }) {
  const { data, reload } = useApi<{ def: CalendarDef; date: WDate; start: WDate }>(`/api/calendar?campaign_id=${campaignId}&days=1`);
  const [editing, setEditing] = useState<'start' | 'date' | null>(null);
  const [value, setValue] = useState<WDate | null>(null);
  if (!data) return null;
  const row = (which: 'start' | 'date', label: string) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className="input flex-1 truncate">{formatDate(data.def, data[which])}</span>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setValue(data[which]);
            setEditing(which);
          }}
        >
          Change
        </button>
      </div>
    </Field>
  );
  return (
    <>
      {row('start', 'Starting date')}
      {row('date', 'Current in-world date')}
      {editing && value && (
        <Modal title={editing === 'start' ? 'Where the campaign started' : "The campaign's date"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <DatePicker def={data.def} value={value} onChange={setValue} />
            <button
              className="btn-primary"
              onClick={async () => {
                if (editing === 'start') await api.put('/api/calendar/start', { campaign_id: campaignId, date: value });
                else await api.post('/api/calendar/date', { campaign_id: campaignId, date: value });
                setEditing(null);
                void reload();
              }}
            >
              Set it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
