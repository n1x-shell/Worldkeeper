import { useRecordTypes } from '../components/recordTypes';
import { RealmIconOf, realmClass, useRealms } from '../components/realms';
import { REALM_KIND_LABELS } from '@shared/realms';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Gem, KeyRound, Ghost, Plus, Map as MapIcon, Network } from 'lucide-react';
import { CANON_STATUSES } from '@shared/domain';
import { api, qs, useApi } from '../lib/api';
import type { Entity, EntitySummary } from '../lib/types';
import { Badge, CanonBadge, Card, Empty, ErrorBox, Field, Loading, PageHeader, RealmBadge, Segmented, Toggle, TypeBadge } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { Snippet, hitPath, type Hit } from '../components/SearchPalette';
import { EntityTable } from './EntityList';
import { Dev, useDebug } from '../components/Dev';
import { displaySections } from '../lib/sections';
import { useCleaners } from '../lib/packs';
import { useModules } from '../lib/modules';
import { moduleForPage } from '@shared/modules';

/** Show a record's non-secret sections inline (used by overview pages). */
function RecordExcerpt({ id, maxSections = 99 }: { id: string; maxSections?: number }) {
  const debug = useDebug();
  const cleanerFor = useCleaners();
  const { data, error } = useApi<{ entity: Entity }>(`/api/entities/${id}`);
  if (error) return <Empty compact title="Not in the library yet." />;
  if (!data) return <Loading />;
  const secs = displaySections(data.entity.body, debug, cleanerFor(data.entity.pack_id)).filter((s) => !s.secret).slice(0, maxSections);
  return (
    <div>
      {secs.map((s, i) => (
        <Markdown key={i} text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} />
      ))}
      <Link className="text-sm text-arcane" to={`/e/${id}`}>
        Open full record →
      </Link>
    </div>
  );
}

/**
 * Every world with its continents, then the realms beside them, each introduced by its own record. Built from the
 * library's realms, so it fits any world (the Worldkeeper setting's or your own).
 */
/** The kind of record that introduces each kind of realm. */
const INTRO_TYPE: Record<string, string> = { realm: 'realm', world: 'world', continent: 'continent', domain: 'ethereal_domain', region_group: 'region' };

export function WorldOverview() {
  const realms = useRealms();
  const live = realms.list.filter((r) => !r.archived);
  const worlds = live.filter((r) => r.kind === 'world');
  const inside = (id: string) => live.filter((r) => r.parent_id === id && r.kind === 'continent');
  // Realms that aren't just a frame around the worlds: ones with an introducing record of their own.
  const others = live.filter((r) => r.kind === 'realm' && r.intro_id);
  const card = (r: (typeof live)[number], featured = false) => (
    <Card key={r.id} featured={featured} className={realmClass(r)}>
      <RealmBadge realm={r.id} />
      {r.intro_id ? (
        <RecordExcerpt id={r.intro_id} maxSections={featured ? undefined : 2} />
      ) : (
        <p className="text-sm text-dim mt-2">
          {r.description || 'No record introduces it yet.'}{' '}
          <Link className="text-arcane hover:text-gold" to={`/new${qs({ type: INTRO_TYPE[r.kind], realm: r.id })}`}>
            Write its record
          </Link>
        </p>
      )}
    </Card>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="World Overview" subtitle={[...worlds, ...others].map((r) => r.name).join(', ') || undefined} />
      {worlds.map((w) => (
        <div key={w.id} className="space-y-4">
          {card(w, true)}
          {inside(w.id).length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{inside(w.id).map((c) => card(c))}</div>}
        </div>
      ))}
      {others.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{others.map((r) => card(r))}</div>}
    </div>
  );
}

export function RealmPage() {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const mods = useModules();
  const { realm = 'world' } = useParams();
  const { data: list, error } = useApi<EntitySummary[]>(`/api/entities${qs({ realm })}`);
  const groups = useMemo(() => {
    const g = new Map<string, EntitySummary[]>();
    for (const e of list ?? []) {
      const arr = g.get(e.type) ?? [];
      arr.push(e);
      g.set(e.type, arr);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [list]);
  const [type, setType] = useState<string | null>(null);
  useEffect(() => setType(null), [realm]);
  const tools: Record<string, { to: string; label: string; icon: React.ReactNode; text: string }[]> = {
    aetheris: [
      { to: '/aetheris/shards', label: 'Crystal Shards', icon: <Gem size={16} />, text: 'Twelve shards and the thirteenth anomaly: owners, locations, campaign state.' },
      { to: '/aetheris/dominions', label: 'Dominions and Enclaves', icon: <Network size={16} />, text: 'The five dominions, ruling factions, rival enclaves, cults and the Hollow Marches.' },
    ],
    kaelmar: [
      { to: '/kaelmar/vaults', label: 'The Thirteen Vaults', icon: <KeyRound size={16} />, text: 'Keys, conditions, state per campaign, guardians, clues and consequences.' },
      { to: '/browse/magic?realm=kaelmar', label: 'Bloom and Glyph-work', icon: <Network size={16} />, text: 'The Bloom, glyph-work, the Glass and the double grammar.' },
    ],
    ethereal: [{ to: '/ethereal/explorer', label: 'Realm Explorer', icon: <Ghost size={16} />, text: 'Border and deep domains, access, crossings, inhabitants and hazards.' }],
  };
  const info = realms.get(realm);
  const root = info.intro_id ?? undefined;
  const inside = realms.list.filter((r) => r.parent_id === info.id && !r.archived);
  const parent = info.parent_id ? realms.get(info.parent_id) : null;
  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className={`${realmClass(info)} inline-flex items-center gap-2`}>
            <RealmIconOf realm={info} size={22} className="text-realm" /> {info.name}
          </span>
        }
        subtitle={[REALM_KIND_LABELS[info.kind], parent ? `in ${parent.name}` : '', list ? `${list.length} records` : ''].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Link className="btn" to="/atlas">
              <MapIcon size={14} /> Atlas
            </Link>
            {root && (
              <Link className="btn" to={`/graph?focus=${root}`}>
                <Network size={14} /> Graph
              </Link>
            )}
          </>
        }
      />
      {error && <ErrorBox error={error} />}
      {info.description && <p className="prose-lore max-w-[72ch] text-[16px] text-ink/90">{info.description}</p>}
      {inside.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-dim mr-1">Within</span>
          {inside.map((r) => (
            <Link key={r.id} to={`/realm/${r.id}`} className={`${realmClass(r)} chip border-realm/50 text-realm hover:bg-realm/10`}>
              <RealmIconOf realm={r} size={11} /> {r.name}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {(tools[realm] ?? []).filter((t) => !moduleForPage(t.to) || mods.has(moduleForPage(t.to)!.key)).map((t) => (
          <Link key={t.to} to={t.to} className="panel elev-1 p-4 hover:border-gold/60 block">
            <div className="flex items-center gap-2 text-gold font-display">
              {t.icon} {t.label}
            </div>
            <p className="text-sm text-dim mt-1">{t.text}</p>
          </Link>
        ))}
      </div>
      {root && (
        <details className="panel elev-1 p-4" open>
          <summary className="cursor-pointer section-title">Overview</summary>
          <RecordExcerpt id={root} maxSections={3} />
        </details>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className={`chip ${!type ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setType(null)}>
          All
        </button>
        {groups.map(([t, arr]) => (
          <button key={t} className={`chip ${type === t ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setType(t)}>
            {recordTypes.label(t)} (<span className="num">{arr.length}</span>)
          </button>
        ))}
      </div>
      {list && <EntityTable rows={list.filter((e) => !type || e.type === type)} showRealm={false} />}
    </div>
  );
}

interface TimelineRow {
  id: number;
  time_label: string;
  event: string;
  realm_label: string;
  /** The realms it belongs to (the library's ids). */
  realm_ids: string[];
  source: string;
  access: string;
  entity_ids: string[];
  origin: string;
  era: string | null;
  era_origin: string | null;
}
interface Era {
  key: string;
  name: string;
  sort_order: number;
  description: string;
  origin: string;
}

export function TimelinePage() {
  const realms = useRealms();
  const { data, error, reload } = useApi<TimelineRow[]>('/api/timeline');
  const { data: eras, reload: reloadEras } = useApi<Era[]>('/api/eras');
  const [sp, setSp] = useSearchParams();
  const realm = sp.get('realm') ?? '';
  const eraFilter = (sp.get('era') ?? '').split(',').filter(Boolean);
  const grouped = sp.get('group') === '1';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
  };
  const toggleEra = (k: string) => setParam('era', (eraFilter.includes(k) ? eraFilter.filter((x) => x !== k) : [...eraFilter, k]).join(','));
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [form, setForm] = useState({ time_label: '', year: '', event: '', realm_id: '', access: 'PROPOSED' });
  const eraName = (k: string | null) => (k ? eras?.find((e) => e.key === k)?.name ?? k : 'No era assigned');
  const rows = (data ?? []).filter(
    (r) => (!realm || r.realm_ids.includes(realm)) && (!eraFilter.length || eraFilter.includes(r.era ?? '__none')),
  );
  // The realms the timeline uses, for the filter.
  const timelineRealms = realms.list.filter((x) => (data ?? []).some((r) => r.realm_ids.includes(x.id)));
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.era ?? '__none', (counts.get(r.era ?? '__none') ?? 0) + 1);
  const groups: [string | null, TimelineRow[]][] = grouped
    ? ([...(eras ?? []).map((e) => [e.key, rows.filter((r) => r.era === e.key)]), [null, rows.filter((r) => !r.era)]] as [string | null, TimelineRow[]][]).filter((g) => g[1].length > 0)
    : [[null, rows]];

  const setRowEra = async (row: TimelineRow, era: string) => {
    await api.patch(`/api/timeline/${row.id}/era`, { era });
    void reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="World Timeline"
        subtitle="The world's history, as your records tell it." note="Imported from the World Timeline index. Dates the source does not give are not invented. Eras come from your library's era tags; rows take the era of the records they link to, and you can assign the rest."
        actions={
          <>
            <button className="btn" onClick={() => setManaging(!managing)}>
              Eras
            </button>
            <button className="btn" onClick={() => setAdding(!adding)}>
              <Plus size={14} /> Add event
            </button>
          </>
        }
      />
      {error && <ErrorBox error={error} />}
      {managing && eras && <EraManager eras={eras} onChange={() => (void reloadEras(), void reload())} />}
      {adding && (
        <Card className="grid gap-2 md:grid-cols-[110px_160px_1fr_160px_140px_auto] items-end">
          <Field label="Year">
            <input
              className="input num"
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              aria-label="Year"
              title="The year in the world's calendar: the event goes in order, and its time is written out if you leave Time empty"
            />
          </Field>
          <Field label="Time">
            <input className="input" value={form.time_label} placeholder={form.year ? 'Written from the year' : 'e.g. Before the Cycle'} onChange={(e) => setForm({ ...form, time_label: e.target.value })} />
          </Field>
          <Field label="Event">
            <input className="input" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} />
          </Field>
          <Field label="Realm">
            <select className="input" value={form.realm_id} onChange={(e) => setForm({ ...form, realm_id: e.target.value })}>
              <option value="">Everywhere</option>
              {realms.list
                .filter((r) => !r.archived)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}>
              {CANON_STATUSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <button
            className="btn-primary"
            onClick={async () => {
              await api.post('/api/timeline', {
                time_label: form.time_label,
                ...(form.year.trim() && Number.isInteger(Number(form.year)) ? { year: Number(form.year) } : {}),
                event: form.event,
                access: form.access,
                realm_ids: form.realm_id ? [form.realm_id] : [],
              });
              setAdding(false);
              void reload();
            }}
          >
            Save
          </button>
        </Card>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by era">
          <span className="text-xs uppercase tracking-wider text-dim mr-1">Era</span>
          <button className={`chip ${!eraFilter.length ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setParam('era', '')}>
            All
          </button>
          {eras?.map((e) => (
            <button key={e.key} aria-pressed={eraFilter.includes(e.key)} className={`chip ${eraFilter.includes(e.key) ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => toggleEra(e.key)}>
              {e.name} ({counts.get(e.key) ?? 0})
            </button>
          ))}
          <button aria-pressed={eraFilter.includes('__none')} className={`chip ${eraFilter.includes('__none') ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => toggleEra('__none')}>
            Unassigned ({counts.get('__none') ?? 0})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-dim mr-1">Realm</span>
          <Segmented
            size="sm"
            label="Filter by realm"
            value={realm}
            onChange={(r) => setParam('realm', r)}
            options={[{ value: '', label: 'All' }, ...timelineRealms.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <Toggle checked={grouped} onChange={(v) => setParam('group', v ? '1' : '')} className="ml-3 text-dim">
            Group by era
          </Toggle>
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : !rows.length ? (
        <Empty title="No timeline rows match">Import the archive, or change the filters.</Empty>
      ) : (
        groups.map(([era, list]) => (
          <section key={era ?? 'none'}>
            {grouped && <h2 className="section-title mb-2">{eraName(era)}</h2>}
            <ol className="relative border-l border-gold/40 ml-3 space-y-4 mb-6">
              {list.map((r) => (
                <li key={r.id} className="ml-5">
                  <span className="absolute left-[-7px] mt-1.5 h-3 w-3 rounded-full border-2 border-gold bg-bg" />
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-gold text-sm">{r.time_label}</span>
                      {r.realm_ids.length ? r.realm_ids.map((id) => <RealmBadge key={id} realm={id} />) : r.realm_label && <Badge>{r.realm_label}</Badge>}
                      {/SECRET/i.test(r.access) && <CanonBadge status="SECRET" />}
                      {r.origin === 'user' && <CanonBadge status="PROPOSED" />}
                      <select
                        className="input w-auto py-0.5 text-xs ml-auto"
                        value={r.era ?? ''}
                        onChange={(e) => setRowEra(r, e.target.value)}
                        aria-label={`Era for ${r.time_label}`}
                        title={r.era_origin === 'user' ? 'Assigned by you' : r.era_origin === 'derived' ? 'From the linked record' : 'Not assigned'}
                      >
                        <option value="">No era</option>
                        {eras?.map((e) => (
                          <option key={e.key} value={e.key}>
                            {e.name}
                            {r.era === e.key && r.era_origin === 'derived' ? ' (from record)' : ''}
                          </option>
                        ))}
                        {r.era_origin === 'user' && <option value="auto">↺ Use linked record's era</option>}
                      </select>
                    </div>
                    <Markdown text={r.event} className="prose-lore text-[16px]" />
                    <Dev>
                      <div className="text-xs text-dim">
                        {r.access} · {r.source}
                      </div>
                    </Dev>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      <Card title={`Event records${eraFilter.length ? ' in the selected eras' : ''}`}>
        <EventList eras={eraFilter} />
      </Card>
    </div>
  );
}

function EraManager({ eras, onChange }: { eras: Era[]; onChange: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= eras.length) return;
    await api.patch(`/api/eras/${eras[i].key}`, { sort_order: eras[j].sort_order });
    await api.patch(`/api/eras/${eras[j].key}`, { sort_order: eras[i].sort_order });
    onChange();
  };
  return (
    <Card title="Eras" className="space-y-2">
      <p className="text-xs text-dim">Rename, reorder or add eras. Realms can keep their own chronologies, so the order is only for display.</p>
      {err && <ErrorBox error={err} />}
      {eras.map((e, i) => (
        <div key={e.key} className="flex items-center gap-2">
          <input
            className="input max-w-xs"
            defaultValue={e.name}
            onBlur={async (ev) => {
              if (ev.target.value.trim() && ev.target.value !== e.name) {
                await api.patch(`/api/eras/${e.key}`, { name: ev.target.value.trim() });
                onChange();
              }
            }}
            aria-label={`Name of era ${e.key}`}
          />
          <Dev>
            <span className="text-xs text-dim">era/{e.key}</span>
          </Dev>
          {e.origin === 'user' && <CanonBadge status="PROPOSED" />}
          <button className="btn-ghost" onClick={() => move(i, -1)} aria-label="Move earlier">
            ↑
          </button>
          <button className="btn-ghost" onClick={() => move(i, 1)} aria-label="Move later">
            ↓
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="New era name" />
        <button
          className="btn"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              const key = name
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
              await api.post('/api/eras', { key, name: name.trim() });
              setName('');
              onChange();
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <Plus size={13} /> Add era
        </button>
      </div>
    </Card>
  );
}

function EventList({ eras = [] }: { eras?: string[] }) {
  const { data } = useApi<EntitySummary[]>('/api/entities?type=event');
  if (!data) return <Loading />;
  const rows = eras.length
    ? data.filter((e) => {
        const tagged = e.tags.filter((t) => t.startsWith('era/')).map((t) => t.slice(4));
        return tagged.length ? tagged.some((t) => eras.includes(t)) : eras.includes('__none');
      })
    : data;
  return rows.length ? <EntityTable rows={rows} /> : <Empty compact title="No event records carry these era tags." />;
}

export function SearchPage() {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? sp.get('tag') ?? '');
  const [realm, setRealm] = useState('');
  const [type, setType] = useState('');
  const [canon, setCanon] = useState('');
  const [kind, setKind] = useState('');
  const debugSearch = useDebug();
  const { data, loading } = useApi<Hit[]>(q.trim() ? `/api/search${qs({ q, realms: realm, types: type, canon, kinds: kind || (debugSearch ? undefined : 'entity,session,quest,note,adventure,profile'), limit: 100 })}` : null);
  return (
    <div className="space-y-4">
      <PageHeader title="Search" subtitle="Names, other names, full text, sessions, quests and notes." />
      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-lg"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSp({ q: e.target.value }, { replace: true });
          }}
          placeholder="Search…"
          autoFocus
          aria-label="Search"
        />
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="">Everything</option>
          <option value="entity">Records</option>
          {debugSearch && <option value="doc">Source documents</option>}
          <option value="session">Sessions</option>
          <option value="quest">Quests</option>
          <option value="note">Notes</option>
          <option value="adventure">Adventures</option>
        </select>
        <select className="input w-auto" value={realm} onChange={(e) => setRealm(e.target.value)} aria-label="Realm">
          <option value="">All realms</option>
          {realms.list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {recordTypes.list
            .filter((x) => !x.traits.meta)
            .map((x) => x.key)
            .map((t) => (
            <option key={t} value={t}>
              {recordTypes.label(t)}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={canon} onChange={(e) => setCanon(e.target.value)} aria-label="Canon">
          <option value="">Any status</option>
          {CANON_STATUSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {loading && <Loading />}
      {data && (
        <ul className="space-y-2">
          {data.map((h) => (
            <li key={h.kind + h.ref} className="panel elev-1 p-3">
              <Link to={hitPath(h)} className="flex flex-wrap items-center gap-2">
                <span className="text-ink hover:text-gold font-medium">{h.title}</span>
                {h.kind === 'entity' ? (
                  <>
                    <Dev>
                      <span className="text-xs text-dim">{h.ref}</span>
                    </Dev>
                    {h.type && <TypeBadge type={h.type} />}
                    {h.realm && <RealmBadge realm={h.realm} />}
                    {h.canon_status && <CanonBadge status={h.canon_status} />}
                  </>
                ) : (
                  <Badge>{h.kind}</Badge>
                )}
              </Link>
              <div className="text-sm text-dim mt-1">
                <Snippet text={h.snippet} />
              </div>
            </li>
          ))}
          {!data.length && <Empty title="No results" />}
        </ul>
      )}
    </div>
  );
}

/** Show `Key: value` metadata headers as a code block so they stay readable (the text itself is unchanged). */
function fenceMetadata(content: string): string {
  return content.replace(/(^|\n\n|\n---\n\n)((?:[A-Z][A-Za-z ,/()'-]{0,60}: .*\n?){3,})/g, (_m, pre: string, block: string) => `${pre}\n\`\`\`text\n${block.trimEnd()}\n\`\`\`\n`);
}

export function DocumentsPage() {
  const [sp, setSp] = useSearchParams();
  const path = sp.get('path');
  const { data: docs } = useApi<{ path: string; title: string; kind: string; doc_id: string | null; immutable: number; size: number }[]>('/api/documents');
  const { data: doc } = useApi<{ path: string; title: string; content: string; kind: string; immutable: number; imported_at: string }>(path ? `/api/documents/content${qs({ path })}` : null);
  const [filter, setFilter] = useState('');
  return (
    <div className="space-y-4">
      <PageHeader title="Source Documents" note="Every imported file, stored verbatim. Setting bibles and references are protected and never overwritten." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card flush className="p-2 max-h-[80vh] overflow-auto">
          <input className="input mb-2" placeholder="Filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="text-sm">
            {docs
              ?.filter((d) => !filter || d.path.toLowerCase().includes(filter.toLowerCase()))
              .map((d) => (
                <li key={d.path}>
                  <button className={`w-full text-left px-2 py-1 rounded-sm hover:bg-raised ${d.path === path ? 'text-gold' : ''}`} onClick={() => setSp({ path: d.path })}>
                    <div className="truncate">{d.path}</div>
                    <div className="text-[11px] text-dim">
                      {d.kind}
                      {d.immutable ? ' · protected' : ''}
                      {d.doc_id ? ` · ${d.doc_id}` : ''}
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        </Card>
        <Card className="min-w-0">
          {!path ? (
            <Empty compact title="Choose a document." />
          ) : !doc ? (
            <Loading />
          ) : (
            <>
              <div className="text-xs text-dim mb-2">
                {doc.path} · {doc.kind}
                {doc.immutable ? ' · protected source (read-only)' : ''}
              </div>
              <Markdown text={fenceMetadata(doc.content)} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
