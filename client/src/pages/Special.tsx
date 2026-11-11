import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Gem, Ghost, Lock, Unlock, AlertTriangle, Plus } from 'lucide-react';
import { VAULT_STATES } from '@shared/domain';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { CanonFlags, EntityLink, ErrorBox, Loading, PageHeader, TypeBadge } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { Dev, useDebug } from '../components/Dev';
import { displaySections, splitSections } from '../lib/sections';
import type { Entity, EntitySummary, StateRow } from '../lib/types';

interface SpecialRow {
  id: string;
  name: string;
  canon_status: string;
  canon_flags?: string[];
  fields: [string, string][];
  body: string;
  campaignState: StateRow[];
  related: { id: string; name: string; type: string }[];
}

const field = (r: SpecialRow, k: string) => r.fields.find(([f]) => f.toLowerCase() === k.toLowerCase())?.[1] ?? 'UNDEFINED';
const section = (body: string, re: RegExp) => splitSections(body).find((s) => re.test(s.heading));
const latest = (rows: StateRow[], f: string) => rows.find((r) => r.field === f && r.status === 'active');

/** Add campaign-only observations (state, clues, holders). Never edits the canon record. */
function OverlayControls({ entityId, rows, fields, onChange }: { entityId: string; rows: StateRow[]; fields: { name: string; options?: readonly string[] }[]; onChange: () => void }) {
  const { activeCampaignId } = useAppState();
  const [f, setF] = useState(fields[0].name);
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!activeCampaignId)
    return (
      <p className="text-xs text-dim">
        <Link to="/campaigns" className="text-arcane">
          Choose an active campaign
        </Link>{' '}
        to track what changes in play.
      </p>
    );
  const opts = fields.find((x) => x.name === f)?.options;
  return (
    <div className="space-y-2">
      {err && <ErrorBox error={err} />}
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={f} onChange={(e) => (setF(e.target.value), setV(''))}>
          {fields.map((x) => (
            <option key={x.name}>{x.name}</option>
          ))}
        </select>
        {opts ? (
          <select className="input w-auto" value={v} onChange={(e) => setV(e.target.value)}>
            <option value="">Choose…</option>
            {opts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input className="input flex-1 min-w-40" value={v} onChange={(e) => setV(e.target.value)} placeholder="Value for this campaign" />
        )}
        <button
          className="btn-primary"
          disabled={!v.trim()}
          onClick={async () => {
            try {
              await api.post('/api/campaign-state', { campaign_id: activeCampaignId, entity_id: entityId, field: f, value: v });
              setV('');
              onChange();
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        >
          <Plus size={14} /> Record
        </button>
      </div>
      {rows.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="text-dim">{r.field}:</span> {r.value} {r.status === 'proposed' && <span className="text-amber-400">(proposed)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VaultsPage() {
  const debug = useDebug();
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<SpecialRow[]>(`/api/special/vaults${activeCampaignId ? `?campaign=${activeCampaignId}` : ''}`);
  const [sel, setSel] = useState<string | null>(null);
  const v = data?.find((x) => x.id === sel) ?? data?.[0];
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<KeyRound size={22} />}
        title="The Thirteen Vaults"
        subtitle="All thirteen are sealed at 300 AB; the Seventh Ward and the Root Core sleep." note="Changes below are campaign-only. The events of 927 AB are a possible future, not an outcome."
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {data.map((x) => {
          const st = latest(x.campaignState, 'Vault state')?.value ?? 'Sealed';
          const sealed = st === 'Sealed';
          return (
            <button key={x.id} onClick={() => setSel(x.id)} className={`panel p-3 text-left hover:border-gold/60 ${v?.id === x.id ? 'border-gold' : ''}`}>
              <div className="flex items-center gap-1.5 text-sm font-display text-gold">
                {sealed ? <Lock size={13} /> : <Unlock size={13} className="text-amber-400" />} {x.name}
              </div>
              <Dev>
                <div className="text-[11px] text-dim">{x.id}</div>
              </Dev>
              <div className={`text-xs mt-1 ${sealed ? 'text-dim' : 'text-amber-400'}`}>{st}</div>
            </button>
          );
        })}
      </div>
      {v && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-2">
              <Link to={`/e/${v.id}`} className="text-2xl font-display text-gold">
                {v.name}
              </Link>
              <CanonFlags status={v.canon_status} flags={[]} />
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
              {[
                ['Location', field(v, 'Region')],
                ['Purpose (strand of the work)', field(v, 'Strand of the work')],
                ['Key', field(v, 'Key')],
                ['Canon state', field(v, 'State')],
                ['Novel code', field(v, 'Novel code')],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wider text-dim">{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            {displaySections(v.body, debug).map((s, i) => (
              <div key={i} className={s.secret ? 'wk-secret border border-danger/40 bg-danger/5 rounded px-3 my-2' : ''}>
                <Markdown text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} />
              </div>
            ))}
          </div>
          <aside className="space-y-3">
            <div className="panel-pad">
              <div className="section-title mb-2">This campaign</div>
              <OverlayControls
                entityId={v.id}
                rows={v.campaignState}
                fields={[{ name: 'Vault state', options: VAULT_STATES }, { name: 'Clue discovered' }, { name: 'Known guardian' }, { name: 'Consequence observed' }, { name: 'Related adventure' }]}
                onChange={reload}
              />
            </div>
            <div className="panel-pad">
              <div className="section-title mb-2">Associated records</div>
              <ul className="text-sm space-y-1">
                {v.related.map((r) => (
                  <li key={r.id}>
                    <EntityLink id={r.id}>{r.name}</EntityLink> <TypeBadge type={r.type} />
                  </li>
                ))}
                {!v.related.length && <li className="text-dim">None linked.</li>}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export function ShardsPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<SpecialRow[]>(`/api/special/shards${activeCampaignId ? `?campaign=${activeCampaignId}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader icon={<Gem size={22} />} title="Crystal Shards" subtitle="Where each shard lies is GM-only." note="Campaign holders and locations are tracked per campaign. The Aetherfall Cycle is broken at the start; nothing here resets the world." />
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Shard</th>
              <th>Lore power</th>
              <th>Canon location (GM)</th>
              <th>Closest interested party</th>
              <th>Campaign</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <Fragment key={s.id}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <td>
                    <EntityLink id={s.id}>{s.name}</EntityLink>
                    <Dev>
                      <div className="text-xs text-dim">{s.id}</div>
                    </Dev>
                    <CanonFlags status={s.canon_status} flags={s.canon_flags ?? []} />
                  </td>
                  <td className="text-sm">
                    <Markdown text={section(s.body, /lore power|power/i)?.content ?? 'UNDEFINED'} className="prose-lore text-[14px]" />
                  </td>
                  <td className="text-sm text-danger/90">
                    <Markdown text={section(s.body, /location/i)?.content ?? 'UNDEFINED'} className="prose-lore text-[14px]" />
                  </td>
                  <td className="text-sm">
                    <Markdown text={section(s.body, /interested/i)?.content ?? 'UNDEFINED'} className="prose-lore text-[14px]" />
                  </td>
                  <td className="text-sm">
                    {latest(s.campaignState, 'Holder')?.value && <div>Holder: {latest(s.campaignState, 'Holder')!.value}</div>}
                    {latest(s.campaignState, 'Location')?.value && <div>At: {latest(s.campaignState, 'Location')!.value}</div>}
                    {!s.campaignState.length && <span className="text-dim">—</span>}
                  </td>
                </tr>
                {open === s.id && (
                  <tr>
                    <td colSpan={5} className="bg-raised/40">
                      <OverlayControls entityId={s.id} rows={s.campaignState} fields={[{ name: 'Holder' }, { name: 'Location' }, { name: 'Shardscarred bearer' }, { name: 'Cult activity' }, { name: 'Clue discovered' }]} onChange={reload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DominionsPage() {
  const { data: regions } = useApi<EntitySummary[]>('/api/entities?realm=aetheris&type=region');
  const { data: factions } = useApi<EntitySummary[]>('/api/entities?realm=aetheris&type=faction,cult');
  return (
    <div className="space-y-4">
      <PageHeader title="Dominions, Factions and Enclaves" subtitle="Aetheris after the Cycle: the five dominions side by side, the Hollow Marches between them." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{regions?.map((r) => <RegionCard key={r.id} id={r.id} />) ?? <Loading />}</div>
      <div className="panel-pad">
        <div className="section-title mb-2">Factions, cults and hidden powers</div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {factions?.map((f) => (
            <div key={f.id}>
              <EntityLink id={f.id}>{f.name}</EntityLink> <TypeBadge type={f.type} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RegionCard({ id }: { id: string }) {
  const { data } = useApi<{ entity: Entity }>(`/api/entities/${id}`);
  if (!data) return <div className="panel p-4"><Loading /></div>;
  const e = data.entity;
  const first = splitSections(e.body).find((s) => s.content && !s.secret);
  return (
    <div className="panel p-4">
      <Link to={`/e/${id}`} className="font-display text-gold text-lg">
        {e.name}
      </Link>
      <div className="text-xs text-dim space-y-0.5 my-1">
        {e.fields.map(([k, v]) => (
          <div key={k}>
            <span className="uppercase tracking-wider">{k}:</span> {v}
          </div>
        ))}
      </div>
      {first && <Markdown text={first.content.slice(0, 500)} className="prose-lore text-[14px]" />}
    </div>
  );
}

export function EtherealExplorer() {
  const { data: domains } = useApi<EntitySummary[]>('/api/entities?type=ethereal_domain');
  const { data: realm } = useApi<{ entity: Entity }>('/api/entities/CON-501');
  const [sel, setSel] = useState<string | null>(null);
  const layers = useMemo(() => {
    const border: EntitySummary[] = [];
    const deep: EntitySummary[] = [];
    for (const d of domains ?? []) (/border/i.test(d.category_raw ?? '') ? border : deep).push(d);
    return { border, deep };
  }, [domains]);
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Ghost size={22} />}
        title="Ethereal Realm Explorer"
        subtitle="A shared realm reachable from both continents. Access to the deep domains is never granted automatically: check each domain's stated requirements."
      />
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ['ETH-591', 'Ways in and out'],
          ['ETH-592', 'Dangers and death'],
          ['ETH-590', 'People and groups'],
          ['ETH-593', 'Navigation and map plan'],
          ['SYS-906', 'Travel between realms'],
          ['SYS-907', 'Thinning and Unmaking'],
        ].map(([id, l]) => (
          <Link key={id} to={`/e/${id}`} className="btn">
            {l}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="space-y-3">
          <div className="panel p-3 border-sky-700/40">
            <div className="section-title mb-2">Continents</div>
            <div className="flex gap-2 text-sm">
              <EntityLink id="CON-001">Aetheris</EntityLink> · <EntityLink id="CON-301">Kaelmar</EntityLink> · <EntityLink id="LOC-901">The Rift</EntityLink>
            </div>
          </div>
          <div className="text-center text-dim text-xs">▼ crossing ▼</div>
          <div className="panel p-3 border-violet-500/40">
            <div className="section-title mb-2">Border layer</div>
            {layers.border.length ? <DomainButtons list={layers.border} sel={sel} setSel={setSel} /> : <DomainButtons list={(domains ?? []).filter((d) => d.id === 'ETH-501')} sel={sel} setSel={setSel} />}
          </div>
          <div className="text-center text-dim text-xs flex items-center justify-center gap-1">
            <AlertTriangle size={12} /> deeper access requires conditions ▼
          </div>
          <div className="panel p-3 border-violet-700/50 bg-violet-900/10">
            <div className="section-title mb-2">Deep domains</div>
            <DomainButtons list={(domains ?? []).filter((d) => d.id !== 'ETH-501' && !layers.border.includes(d))} sel={sel} setSel={setSel} />
          </div>
        </div>
        <div className="panel p-5 min-w-0">{sel ? <DomainDetail id={sel} /> : realm ? <Markdown text={splitSections(realm.entity.body).filter((s) => !s.secret).map((s) => (s.heading ? `## ${s.heading}\n\n${s.content}` : s.content)).join('\n\n')} /> : <Loading />}</div>
      </div>
    </div>
  );
}

function DomainButtons({ list, sel, setSel }: { list: EntitySummary[]; sel: string | null; setSel: (id: string) => void }) {
  return (
    <div className="grid gap-1.5">
      {list.map((d) => (
        <button key={d.id} onClick={() => setSel(d.id)} className={`text-left px-3 py-2 rounded-md border ${sel === d.id ? 'border-gold text-gold bg-gold/10' : 'border-line hover:border-violet-400/60'}`}>
          <div className="font-display text-sm">{d.name}</div>
          <Dev>
            <div className="text-[11px] text-dim">{d.id}</div>
          </Dev>
        </button>
      ))}
    </div>
  );
}

function DomainDetail({ id }: { id: string }) {
  const debug = useDebug();
  const { data } = useApi<{ entity: Entity; relationships: { source_id: string; target_id: string; source_name: string; target_name: string; source_type: string; target_type: string }[] }>(`/api/entities/${id}`);
  if (!data) return <Loading />;
  const e = data.entity;
  const linked = data.relationships.map((r) => (r.source_id === id ? { id: r.target_id, name: r.target_name, type: r.target_type } : { id: r.source_id, name: r.source_name, type: r.source_type }));
  const uniq = [...new Map(linked.map((l) => [l.id, l])).values()];
  return (
    <div>
      <Link to={`/e/${id}`} className="text-2xl font-display text-gold">
        {e.name}
      </Link>
      <div className="text-xs text-dim mb-2">{/deep/i.test(e.parent_raw ?? '') ? 'Deep domain' : /border/i.test(e.parent_raw ?? '') ? 'Border layer' : null}</div>
      {displaySections(e.body, debug).map((s, i) => (
        <div key={i} className={s.secret || /access/i.test(s.heading) ? 'border border-violet-500/30 rounded px-3 my-2 bg-violet-900/10' : ''}>
          <Markdown text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} />
        </div>
      ))}
      <div className="section-title mt-4 mb-1">Inhabitants, sites and links</div>
      <div className="flex flex-wrap gap-2 text-sm">
        {uniq.map((l) => (
          <span key={l.id}>
            <EntityLink id={l.id}>{l.name}</EntityLink> <span className="text-[10px] text-dim">{l.type}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
