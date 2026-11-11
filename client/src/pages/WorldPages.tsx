import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Gem, KeyRound, Ghost, Plus, Map as MapIcon, Network } from 'lucide-react';
import { CANON_STATUSES, ENTITY_TYPES, ENTITY_TYPE_LABELS, REALMS, REALM_LABELS, type EntityType, type Realm } from '@shared/domain';
import { api, qs, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Entity, EntitySummary } from '../lib/types';
import { CanonBadge, Empty, EntityLink, ErrorBox, Field, Loading, PageHeader, RealmBadge, TypeBadge } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { EntityPicker } from '../components/EntityPicker';
import { Snippet, hitPath, type Hit } from '../components/SearchPalette';
import { EntityTable } from './EntityList';
import { splitSections } from '../lib/sections';

/** Show a record's non-secret sections inline (used by overview pages). */
function RecordExcerpt({ id, maxSections = 99 }: { id: string; maxSections?: number }) {
  const { data, error } = useApi<{ entity: Entity }>(`/api/entities/${id}`);
  if (error) return <p className="text-sm text-dim">Record {id} is not in the library yet.</p>;
  if (!data) return <Loading />;
  const secs = splitSections(data.entity.body).filter((s) => !s.secret).slice(0, maxSections);
  return (
    <div>
      {secs.map((s, i) => (
        <Markdown key={i} text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} />
      ))}
      <Link className="text-sm text-arcane" to={`/e/${id}`}>
        Open full record (including GM sections) →
      </Link>
    </div>
  );
}

export function WorldOverview() {
  return (
    <div className="space-y-5">
      <PageHeader title="World Overview" subtitle="One world, three branches: from your imported encyclopedia." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-5">
          <RecordExcerpt id="WLD-901" />
        </div>
        <div className="panel p-5">
          <RecordExcerpt id="WLD-906" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['CON-001', 'aetheris'],
          ['CON-301', 'kaelmar'],
          ['CON-501', 'ethereal'],
        ].map(([id, realm]) => (
          <div key={id} className="panel p-4">
            <RealmBadge realm={realm} />
            <RecordExcerpt id={id} maxSections={2} />
          </div>
        ))}
      </div>
    </div>
  );
}

const REALM_ROOT: Record<string, string> = { aetheris: 'CON-001', kaelmar: 'CON-301', ethereal: 'CON-501' };

export function RealmPage() {
  const { realm = 'aetheris' } = useParams();
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
  const root = REALM_ROOT[realm];
  return (
    <div className="space-y-5">
      <PageHeader
        title={REALM_LABELS[realm as Realm] ?? realm}
        subtitle={list ? `${list.length} records` : undefined}
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
      <div className="grid gap-3 md:grid-cols-3">
        {(tools[realm] ?? []).map((t) => (
          <Link key={t.to} to={t.to} className="panel p-4 hover:border-gold/60 block">
            <div className="flex items-center gap-2 text-gold font-display">
              {t.icon} {t.label}
            </div>
            <p className="text-sm text-dim mt-1">{t.text}</p>
          </Link>
        ))}
      </div>
      {root && (
        <details className="panel p-4" open>
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
            {ENTITY_TYPE_LABELS[t as EntityType] ?? t} ({arr.length})
          </button>
        ))}
      </div>
      {list && <EntityTable rows={list.filter((e) => !type || e.type === type)} showRealm={false} />}
    </div>
  );
}

export function NewEntity() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { reloadIndex } = useAppState();
  const { data: templates } = useApi<{ id: string; name: string; type: string; fields: string[]; sections: string[] }[]>('/api/templates');
  const [form, setForm] = useState({
    name: '',
    type: (sp.get('type') as EntityType) || 'custom',
    realm: (sp.get('realm') as Realm) || 'world',
    canon_status: 'PROPOSED',
    parent_id: null as string | null,
    source_raw: 'DM entry (The Worldkeeper)',
  });
  const [similar, setSimilar] = useState<EntitySummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (form.name.trim().length < 3) return setSimilar([]);
    const t = setTimeout(async () => setSimilar(await api.get(`/api/entities/similar${qs({ name: form.name })}`)), 250);
    return () => clearTimeout(t);
  }, [form.name]);
  const template = templates?.find((t) => t.type === form.type);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="New record" subtitle="New records start as PROPOSED and go to Canon Review. Missing facts stay UNDEFINED." />
      {err && <ErrorBox error={err} />}
      <div className="panel-pad grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Template type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EntityType })}>
            {ENTITY_TYPES.filter((t) => t !== 'redirect').map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Realm">
          <select className="input" value={form.realm} onChange={(e) => setForm({ ...form, realm: e.target.value as Realm })}>
            {REALMS.map((r) => (
              <option key={r} value={r}>
                {REALM_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Canon status">
          <select className="input" value={form.canon_status} onChange={(e) => setForm({ ...form, canon_status: e.target.value })}>
            {CANON_STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Parent">
          <EntityPicker value={form.parent_id} onChange={(p) => setForm({ ...form, parent_id: p })} />
        </Field>
        <Field label="Source">
          <input className="input" value={form.source_raw} onChange={(e) => setForm({ ...form, source_raw: e.target.value })} />
        </Field>
      </div>
      {template && (
        <p className="text-sm text-dim">
          Using the library template <strong>{template.name}</strong>: {template.fields.length} fields and {template.sections.length} sections will be added, all marked UNDEFINED.
        </p>
      )}
      {similar.length > 0 && (
        <div className="panel border-amber-500/50 p-3 text-sm">
          <div className="text-amber-400 mb-1">Possible existing records. Link to them instead of creating a duplicate:</div>
          <ul>
            {similar.slice(0, 8).map((s) => (
              <li key={s.id}>
                <EntityLink id={s.id}>{s.name}</EntityLink> <span className="text-xs text-dim">{s.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        className="btn-primary"
        disabled={!form.name.trim()}
        onClick={async () => {
          try {
            const std = new Set(['id', 'name', 'alternate names', 'category', 'parent', 'continent or realm', 'canon status', 'source', 'tags']);
            const fields = (template?.fields ?? []).filter((f) => !std.has(f.toLowerCase())).map((f) => [f, 'UNDEFINED']);
            const body = `# ${form.name}\n\n${(template?.sections ?? ['Overview']).map((s) => `## ${s}\n\nUNDEFINED`).join('\n\n')}\n`;
            const e = await api.post<Entity>('/api/entities', {
              ...form,
              category_raw: ENTITY_TYPE_LABELS[form.type],
              aliases: [],
              tags: [`realm/${form.realm}`, `status/${form.canon_status.toLowerCase()}`, 'vis/gm'],
              fields,
              body,
              notes: '',
            });
            await reloadIndex();
            nav(`/e/${e.id}`);
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      >
        <Plus size={14} /> Create record
      </button>
    </div>
  );
}

interface TimelineRow {
  id: number;
  time_label: string;
  event: string;
  realm_label: string;
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
  const [form, setForm] = useState({ time_label: '', event: '', realm_label: '', access: 'PROPOSED' });
  const eraName = (k: string | null) => (k ? eras?.find((e) => e.key === k)?.name ?? k : 'No era assigned');
  const rows = (data ?? []).filter(
    (r) => (!realm || r.realm_label.toLowerCase().includes(realm)) && (!eraFilter.length || eraFilter.includes(r.era ?? '__none')),
  );
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
        subtitle="Imported from the World Timeline index. 300 AB = Year 31 Unbound. Dates the source does not give are not invented. The 927 AB events are a possible future, not history. Eras come from your library's era tags; rows take the era of the records they link to, and you can assign the rest."
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
        <div className="panel-pad grid gap-2 md:grid-cols-[160px_1fr_160px_140px_auto] items-end">
          <Field label="Time">
            <input className="input" value={form.time_label} onChange={(e) => setForm({ ...form, time_label: e.target.value })} />
          </Field>
          <Field label="Event">
            <input className="input" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} />
          </Field>
          <Field label="Realm">
            <input className="input" value={form.realm_label} onChange={(e) => setForm({ ...form, realm_label: e.target.value })} />
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
              await api.post('/api/timeline', form);
              setAdding(false);
              void reload();
            }}
          >
            Save
          </button>
        </div>
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
          {['', 'aetheris', 'kaelmar', 'world', 'both'].map((r) => (
            <button key={r} className={`chip ${realm === r ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setParam('realm', r)}>
              {r || 'All'}
            </button>
          ))}
          <label className="ml-3 text-sm text-dim flex items-center gap-1">
            <input type="checkbox" checked={grouped} onChange={(e) => setParam('group', e.target.checked ? '1' : '')} /> Group by era
          </label>
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
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-gold bg-bg" />
                  <div className="panel p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-gold text-sm">{r.time_label}</span>
                      <span className="chip border-line text-dim">{r.realm_label}</span>
                      {/SECRET/i.test(r.access) && <CanonBadge status="SECRET" />}
                      {r.origin === 'user' && <CanonBadge status="PROPOSED" />}
                      <select
                        className="input w-auto py-0.5 text-xs ml-auto"
                        value={r.era ?? ''}
                        onChange={(e) => setRowEra(r, e.target.value)}
                        aria-label={`Era for ${r.time_label}`}
                        title={r.era_origin === 'user' ? 'Assigned by you' : r.era_origin === 'derived' ? 'From the era tag of a linked record' : 'Not assigned'}
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
                    <div className="text-xs text-dim">
                      {r.access} · {r.source}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      <div className="panel p-4">
        <div className="section-title mb-2">Event records{eraFilter.length ? ' in the selected eras' : ''}</div>
        <EventList eras={eraFilter} />
      </div>
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
    <div className="panel-pad space-y-2">
      <div className="section-title">Eras</div>
      <p className="text-xs text-dim">Imported from the library's era tags (the two continents keep parallel chronologies, so order is for display only). Rename, reorder or add your own.</p>
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
          <span className="text-xs text-dim">era/{e.key}</span>
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
    </div>
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
  return rows.length ? <EntityTable rows={rows} /> : <p className="text-sm text-dim">No event records carry these era tags.</p>;
}

export function MysteriesPage() {
  const { data } = useApi<EntitySummary[]>('/api/entities?canon=SECRET');
  return (
    <div className="space-y-4">
      <PageHeader title="Mysteries and Secrets" subtitle="Records that contain SECRET material. None of this is visible to players unless you reveal it." />
      <div className="grid gap-4 md:grid-cols-3">
        {['WLD-907', 'WLD-908', 'DEC-901'].map((id) => (
          <Link key={id} to={`/e/${id}`} className="panel p-4 hover:border-gold/60">
            <EntityLink id={id} />
            <div className="text-xs text-dim mt-1">{id}</div>
          </Link>
        ))}
      </div>
      {data ? <EntityTable rows={data} /> : <Loading />}
    </div>
  );
}

export function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? sp.get('tag') ?? '');
  const [realm, setRealm] = useState('');
  const [type, setType] = useState('');
  const [canon, setCanon] = useState('');
  const [kind, setKind] = useState('');
  const { data, loading } = useApi<Hit[]>(q.trim() ? `/api/search${qs({ q, realms: realm, types: type, canon, kinds: kind, limit: 100 })}` : null);
  return (
    <div className="space-y-4">
      <PageHeader title="Search" subtitle="Titles, aliases, stable IDs, tags, full text, source documents, sessions, quests and notes." />
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
          <option value="doc">Source documents</option>
          <option value="session">Sessions</option>
          <option value="quest">Quests</option>
          <option value="note">Notes</option>
          <option value="adventure">Adventures</option>
        </select>
        <select className="input w-auto" value={realm} onChange={(e) => setRealm(e.target.value)} aria-label="Realm">
          <option value="">All realms</option>
          {REALMS.map((r) => (
            <option key={r} value={r}>
              {REALM_LABELS[r]}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ENTITY_TYPE_LABELS[t]}
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
            <li key={h.kind + h.ref} className="panel p-3">
              <Link to={hitPath(h)} className="flex flex-wrap items-center gap-2">
                <span className="text-ink hover:text-gold font-medium">{h.title}</span>
                {h.kind === 'entity' ? (
                  <>
                    <span className="text-xs text-dim">{h.ref}</span>
                    {h.type && <TypeBadge type={h.type} />}
                    {h.realm && <RealmBadge realm={h.realm} />}
                    {h.canon_status && <CanonBadge status={h.canon_status} />}
                  </>
                ) : (
                  <span className="chip border-line text-dim">{h.kind}</span>
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
      <PageHeader title="Source Documents" subtitle="Every imported file, stored verbatim. Setting bibles and references are protected and never overwritten." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="panel p-2 max-h-[80vh] overflow-auto">
          <input className="input mb-2" placeholder="Filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="text-sm">
            {docs
              ?.filter((d) => !filter || d.path.toLowerCase().includes(filter.toLowerCase()))
              .map((d) => (
                <li key={d.path}>
                  <button className={`w-full text-left px-2 py-1 rounded hover:bg-raised ${d.path === path ? 'text-gold' : ''}`} onClick={() => setSp({ path: d.path })}>
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
        </div>
        <div className="panel p-5 min-w-0">
          {!path ? (
            <p className="text-dim">Choose a document.</p>
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
        </div>
      </div>
    </div>
  );
}
