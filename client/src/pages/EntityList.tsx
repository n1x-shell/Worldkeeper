import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Star } from 'lucide-react';
import { CANON_STATUSES, REALMS, REALM_LABELS, ENTITY_TYPE_LABELS, TYPE_GROUPS, type EntityType } from '@shared/domain';
import { useApi, qs } from '../lib/api';
import { CanonFlags, Empty, ErrorBox, Loading, PageHeader, RealmBadge, TypeBadge, VisibilityBadge } from '../components/ui';
import type { EntitySummary } from '../lib/types';
import { useDebug } from '../components/Dev';

export const BROWSE_GROUPS: Record<string, { title: string; types?: EntityType[]; note?: string }> = {
  all: { title: 'All Lore' },
  regions: { title: 'Regions and Settlements', types: TYPE_GROUPS.regions },
  landmarks: { title: 'Landmarks and Buildings', types: TYPE_GROUPS.landmarks },
  places: { title: 'All Places', types: TYPE_GROUPS.places },
  npcs: { title: 'NPCs', types: ['npc'] },
  factions: { title: 'Factions and Cults', types: TYPE_GROUPS.factions },
  artifacts: { title: 'Shards and Artifacts', types: TYPE_GROUPS.artifacts },
  creatures: {
    title: 'Creatures',
    types: ['creature'],
    note: 'The source library describes creatures inside overview documents (see Source Documents) rather than as individual CRE records. Create creature records here when you need them.',
  },
  events: { title: 'Historical Events', types: ['event'] },
  cosmology: { title: 'Cosmology', types: ['cosmology'] },
  pantheon: { title: 'Pantheon', types: ['deity'] },
  cultures: { title: 'Cultures and Peoples', types: TYPE_GROUPS.cultures },
  magic: { title: 'Magic Systems', types: ['magic_system', 'system'] },
  rules: { title: 'Rules and Setting Mechanics', types: ['rule', 'system'] },
  hooks: { title: 'Adventure Hooks', types: ['adventure_hook'] },
  indexes: { title: 'Indexes and Registers', types: ['index', 'register'] },
};

export function EntityTable({ rows, showRealm = true }: { rows: EntitySummary[]; showRealm?: boolean }) {
  const nav = useNavigate();
  const debug = useDebug();
  return (
    <div className="panel overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            {debug && <th className="hidden sm:table-cell">ID</th>}
            <th>Type</th>
            {showRealm && <th className="hidden md:table-cell">Realm</th>}
            <th className="hidden lg:table-cell">Canon</th>
            <th className="hidden lg:table-cell">Players</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="cursor-pointer" onClick={() => nav(`/e/${encodeURIComponent(e.id)}`)}>
              <td>
                <Link to={`/e/${encodeURIComponent(e.id)}`} className="text-ink hover:text-gold" onClick={(ev) => ev.stopPropagation()}>
                  {e.favorite && <Star size={12} className="inline text-gold mr-1 -mt-0.5" fill="currentColor" />}
                  {e.name}
                </Link>
                {e.archived && <span className="text-xs text-dim ml-2">(archived)</span>}
              </td>
              {debug && <td className="hidden sm:table-cell text-dim text-xs whitespace-nowrap">{e.id}</td>}
              <td>
                <TypeBadge type={e.type} />
              </td>
              {showRealm && (
                <td className="hidden md:table-cell">
                  <RealmBadge realm={e.realm} />
                </td>
              )}
              <td className="hidden lg:table-cell">
                <CanonFlags status={e.canon_status} flags={e.canon_flags} />
              </td>
              <td className="hidden lg:table-cell">
                <VisibilityBadge revealed={e.revealed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityList({ group: groupProp, realm: fixedRealm }: { group?: string; realm?: string }) {
  const params = useParams();
  const group = groupProp ?? params.group ?? 'all';
  const def = BROWSE_GROUPS[group] ?? BROWSE_GROUPS.all;
  const debug = useDebug();
  const [realm, setRealm] = useState<string>(fixedRealm ?? '');
  const [canon, setCanon] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const url = `/api/entities${qs({ type: type ? [type] : def.types, realm: realm || undefined, canon: canon || undefined, archived: archived ? '1' : undefined })}`;
  const { data, error, loading, reload } = useApi<EntitySummary[]>(url);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((e) => !n || e.name.toLowerCase().includes(n) || e.id.toLowerCase().includes(n) || e.tags.some((t) => t.includes(n)));
  }, [data, q]);
  const typeChoices = def.types ?? (Object.keys(ENTITY_TYPE_LABELS) as EntityType[]);

  return (
    <div>
      <PageHeader
        title={def.title}
        subtitle={data ? `${rows.length} of ${data.length} records` : undefined}
        actions={
          <Link to={`/new${qs({ type: def.types?.[0], realm: realm || undefined })}`} className="btn-primary">
            <Plus size={14} /> New record
          </Link>
        }
      />
      {def.note && debug && <p className="text-sm text-dim mb-3">{def.note}</p>}
      <div className="flex flex-wrap gap-2 mb-4">
 <input className="input max-w-xs" placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
        {!fixedRealm && (
          <select className="input w-auto" value={realm} onChange={(e) => setRealm(e.target.value)} aria-label="Realm">
            <option value="">All realms</option>
            {REALMS.map((r) => (
              <option key={r} value={r}>
                {REALM_LABELS[r]}
              </option>
            ))}
          </select>
        )}
        {typeChoices.length > 1 && (
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {typeChoices.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        )}
        <select className="input w-auto" value={canon} onChange={(e) => setCanon(e.target.value)} aria-label="Canon status">
          <option value="">Any canon status</option>
          {[...CANON_STATUSES, 'HOMEBREW', 'UNVERIFIED'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-dim">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Include archived
        </label>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : rows.length ? <EntityTable rows={rows} showRealm={!fixedRealm} /> : <Empty title="No records match">Adjust the filters, or import your library.</Empty>}
    </div>
  );
}
