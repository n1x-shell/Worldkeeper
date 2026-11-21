import { useMechanics } from '../lib/mechanics';
import { BriefingPanel, briefingFill } from './Briefing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, type Connection, type Edge, type Node, type NodeChange, applyNodeChanges } from '@xyflow/react';
import { Check, Copy, Download, Play, Plus, Trash2, Upload, Wand2, ArrowUp, ArrowDown, Swords } from 'lucide-react';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Campaign, Session, StateRow } from '../lib/types';
import { ask, askText, AutoTextarea, Badge, Card, Check as CheckBox, DataTable, Empty, EntityLink, ErrorBox, Field, GmOnly, KeyValue, Loading, Modal, PageHeader, SaveStatus, Section, Tabs, Toggle, useToast } from '../components/ui';
import { EntityMultiPicker, EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { FullSheet } from '../player/sheet/FullSheet';
import { ThinningTab } from '../player/sheet/ThinningTab';
import type { LogEntry } from '../player/sheet/LogTab';
import type { Sheet } from '@shared/sheet';

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
                    nav('/campaign');
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
          <StateTable rows={data.state} onChange={reload} />
        </div>
      </div>
    </div>
  );
}

export function StateTable({ rows, onChange, title = 'Campaign-specific world changes' }: { rows: StateRow[]; onChange: () => void; title?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title={title} className="text-sm">
      <p className="text-xs text-dim mb-2">Only true in this campaign.</p>
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
export function PartyPage() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  // "?character=" opens that character (the builder's "Save to Party and Characters" comes here).
  const [sp] = useSearchParams();
  const [sel, setSel] = useState<number | null>(Number(sp.get('character')) || null);
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
        <Empty title="No characters yet">Use Add character to start the party.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <Card flush className="p-2">
            {data.characters.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={`w-full text-left px-2 py-1.5 rounded text-sm ${ch?.id === c.id ? 'bg-gold/10 text-gold' : 'hover:bg-raised'}`}>
                {c.name}
                <div className="text-[11px] text-dim">
                  {c.player || 'no player'} · <span className="num">L{c.level}</span> {c.class_name}
                </div>
              </button>
            ))}
          </Card>
          {ch && <CharacterSheet key={ch.id} ch={ch} onDeleted={reload} />}
        </div>
      )}
    </div>
  );
}

function CharacterSheet({ ch: initial, onDeleted }: { ch: Character; onDeleted: () => void }) {
  const mech = useMechanics();
  const [ch, setCh] = useState(initial);
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Player">
          <input className="input" value={ch.player} onChange={(e) => set({ player: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={ch.kind} onChange={(e) => set({ kind: e.target.value })}>
            {['pc', 'companion', 'retired', 'dead'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <SaveStatus state={auto.state === 'idle' ? page.state : auto.state} error={auto.error ?? page.error} />
        <button
          className="btn-danger ml-auto"
          onClick={async () => {
            if (!(await ask({ body: `Delete ${ch.name}?`, danger: true, confirmLabel: 'Delete' }))) return;
            await api.del(`/api/characters/${ch.id}`);
            onDeleted();
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <FullSheet
        value={{ name: ch.name, species: ch.species, class_name: ch.class_name, level: ch.level, sheet: sh as Sheet }}
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
          ...(page.data && mech?.thinning !== false ? [{ id: 'thinning', label: 'Thinning', content: <ThinningTab gm page={page.data} onChange={(t, now) => page.set(t, now)} /> }] : []),
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
    </div>
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
          <EntityPicker value={hometown} onChange={(v) => onChange({ hometown: v })} types={['settlement', 'region', 'landmark', 'building', 'continent']} />
        </Field>
      </div>
      {ties.length > 0 && (
        <ul className="divide-y divide-line/50">
          {ties.map((t, i) => (
            <li key={`${t.entity_id}-${i}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <Badge>{t.kind}</Badge>
              <EntityLink id={t.entity_id} />
              <input
                className="input flex-1 min-w-[12rem] text-sm"
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
          <EntityPicker value={q.giver_id} types={['npc', 'faction', 'cult']} onChange={(id) => set({ giver_id: id })} />
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
              nav(`/session/${s.id}`);
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
          <BriefingPanel
            sessionId={s.id}
            onFill={(b) => {
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
            }}
          />
          {PREP_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <AutoTextarea minRows={3} value={(s.prep[k] as string) ?? ''} onChange={(e) => setPrep(k, e.target.value)} />
            </Field>
          ))}
          <Card>
            <EntityMultiPicker label="Relevant NPCs and locations (shown in live mode)" value={s.prep.relevantIds ?? []} onChange={(ids) => setPrep('relevantIds', ids)} />
          </Card>
          <Card>
            <span className="label">Adventures in play</span>
            <div className="flex flex-col gap-1">
              {advs?.map((a) => (
                <CheckBox
                  key={a.id}
                  checked={(s.prep.adventureIds ?? []).includes(a.id)}
                  onChange={(on) => setPrep('adventureIds', on ? [...(s.prep.adventureIds ?? []), a.id] : (s.prep.adventureIds ?? []).filter((x) => x !== a.id))}
                >
                  {a.title}
                </CheckBox>
              ))}
            </div>
            {!advs?.length && <Empty compact title="No adventures in this campaign yet." />}
          </Card>
        </div>
      )}
      {tab === 'log' && (
        <Card flush>
          <DataTable
            rows={log ?? []}
            rowKey={(l) => l.id}
            empty={
              <Empty compact title="Nothing recorded.">
                Use live mode to log events as they happen.
              </Empty>
            }
            columns={[
              { key: 'created_at', label: 'Time', sortable: true, className: 'text-xs text-dim whitespace-nowrap', render: (l) => new Date(l.created_at).toLocaleTimeString() },
              { key: 'kind', label: 'Kind', sortable: true, className: 'text-xs' },
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
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
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
            <Card>
              <Markdown text={s.recap || '_No recap yet._'} />
            </Card>
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
            nav(`/tracker/${e.id}`);
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
            <AutoTextarea minRows={2} value={s.body} onChange={(e) => set({ body: e.target.value })} />
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
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((n) => applyNodeChanges(ch, n)), []);
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
          colorMode="dark"
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
