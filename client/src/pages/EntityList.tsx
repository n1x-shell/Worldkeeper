import { useRecordTypes } from '../components/recordTypes';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ListChecks, Plus, Star } from 'lucide-react';
import { CANON_STATUSES } from '@shared/domain';
import { BulkBar } from './BulkTools';
import { useApi, qs } from '../lib/api';
import { Card, CanonFlags, Check, DataTable, Empty, ErrorBox, Loading, PageHeader, RealmBadge, TypeBadge, VisibilityBadge, type Column } from '../components/ui';
import type { EntitySummary } from '../lib/types';
import { useDebug } from '../components/Dev';
import { useRealms } from '../components/realms';

/** The Codex's browse pages: a browse group of the type registry (`browse`), or a few types by name. */
export const BROWSE_GROUPS: Record<string, { title: string; browse?: string; types?: string[]; note?: string }> = {
  all: { title: 'All Lore' },
  regions: { title: 'Regions and Settlements', browse: 'regions' },
  landmarks: { title: 'Landmarks and Buildings', browse: 'landmarks' },
  places: { title: 'All Places', browse: 'places' },
  npcs: { title: 'NPCs', browse: 'npcs' },
  factions: { title: 'Factions and Cults', browse: 'factions' },
  artifacts: { title: 'Shards and Artifacts', browse: 'artifacts' },
  creatures: {
    title: 'Creatures',
    browse: 'creatures',
    note: 'The source library describes creatures inside overview documents (see Source Documents) rather than as individual CRE records. Create creature records here when you need them.',
  },
  events: { title: 'Historical Events', browse: 'events' },
  cosmology: { title: 'Cosmology', types: ['cosmology'] },
  pantheon: { title: 'Pantheon', browse: 'pantheon' },
  cultures: { title: 'Cultures and Peoples', browse: 'cultures' },
  magic: { title: 'Magic Systems', types: ['magic_system', 'system'] },
  rules: { title: 'Rules and Setting Mechanics', browse: 'rules' },
  hooks: { title: 'Adventure Hooks', browse: 'hooks' },
  indexes: { title: 'Indexes and Registers', types: ['index', 'register'] },
};

/** `pick`: the list is in Select mode: a tick box on each row, and a click on a row ticks it. */
export function EntityTable({ rows, showRealm = true, pick }: { rows: EntitySummary[]; showRealm?: boolean; pick?: { picked: Set<string>; toggle: (id: string) => void; all: (on: boolean) => void } }) {
  const recordTypes = useRecordTypes();
  const nav = useNavigate();
  const debug = useDebug();
  const columns: Column<EntitySummary>[] = [
    ...(pick
      ? [
          {
            key: 'pick',
            label: <input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => pick.picked.has(r.id))} onChange={(ev) => pick.all(ev.target.checked)} />,
            headClassName: 'w-8',
            render: (e: EntitySummary) => <input type="checkbox" aria-label={`Select ${e.name}`} checked={pick.picked.has(e.id)} onChange={() => pick.toggle(e.id)} onClick={(ev) => ev.stopPropagation()} />,
          },
        ]
      : []),
    {
      key: 'name',
      label: 'Name',
      sortValue: (e) => e.name,
      render: (e) => (
        <>
          <Link to={`/e/${encodeURIComponent(e.id)}`} className="text-ink hover:text-gold" onClick={(ev) => ev.stopPropagation()}>
            {e.favorite && <Star size={12} className="inline text-gold mr-1 -mt-0.5" fill="currentColor" />}
            {e.name}
          </Link>
          {e.archived && <span className="text-xs text-dim ml-2">(archived)</span>}
        </>
      ),
    },
    ...(debug ? [{ key: 'id', label: 'ID', sortable: true, headClassName: 'hidden sm:table-cell', className: 'hidden sm:table-cell text-dim text-xs whitespace-nowrap' }] : []),
    { key: 'type', label: 'Type', sortValue: (e) => recordTypes.label(e.type), render: (e) => <TypeBadge type={e.type} /> },
    ...(showRealm
      ? [
          {
            key: 'realm',
            label: 'Realm',
            sortValue: (e: EntitySummary) => e.realm,
            headClassName: 'hidden md:table-cell',
            className: 'hidden md:table-cell',
            render: (e: EntitySummary) => <RealmBadge realm={e.realm} />,
          },
        ]
      : []),
    {
      key: 'canon',
      label: 'Canon',
      sortValue: (e) => e.canon_status,
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      render: (e) => <CanonFlags status={e.canon_status} flags={e.canon_flags} />,
    },
    {
      key: 'players',
      label: 'Players',
      sortValue: (e) => (e.revealed ? 1 : 0),
      headClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
      render: (e) => <VisibilityBadge revealed={e.revealed} />,
    },
  ];
  return (
    <Card flush>
      <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={(e) => (pick ? pick.toggle(e.id) : nav(`/e/${encodeURIComponent(e.id)}`))} rowClassName={pick ? (e) => (pick.picked.has(e.id) ? 'bg-gold/10' : '') : undefined} />
    </Card>
  );
}

export function EntityList({ group: groupProp, realm: fixedRealm }: { group?: string; realm?: string }) {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const params = useParams();
  const group = groupProp ?? params.group ?? 'all';
  const group0 = BROWSE_GROUPS[group] ?? BROWSE_GROUPS.all;
  const def = { ...group0, types: group0.types ?? (group0.browse ? recordTypes.browse(group0.browse) : undefined) };
  const debug = useDebug();
  const [realm, setRealm] = useState<string>(fixedRealm ?? '');
  const [canon, setCanon] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  // Select mode (v0.9.13): tick records, then change them all at once with the bar below the list.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const url = `/api/entities${qs({ type: type ? [type] : def.types, realm: realm || undefined, canon: canon || undefined, archived: archived ? '1' : undefined })}`;
  const { data, error, loading, reload } = useApi<EntitySummary[]>(url);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((e) => !n || e.name.toLowerCase().includes(n) || e.id.toLowerCase().includes(n) || e.tags.some((t) => t.includes(n)));
  }, [data, q]);
  const typeChoices = def.types ?? recordTypes.list.filter((t) => !t.traits.meta).map((t) => t.key);

  return (
    <div>
      <PageHeader
        title={def.title}
        subtitle={data ? `${rows.length} of ${data.length} records` : undefined}
        actions={
          <>
            <button type="button" className="btn" aria-pressed={selecting} onClick={() => (setSelecting((v) => !v), setPicked(new Set()))}>
              <ListChecks size={14} /> {selecting ? 'Done selecting' : 'Select'}
            </button>
            <Link to={`/new${qs({ type: def.types?.[0], realm: realm || undefined })}`} className="btn-primary">
              <Plus size={14} /> New record
            </Link>
          </>
        }
      />
      {def.note && debug && <p className="text-sm text-dim mb-3">{def.note}</p>}
      <div className="flex flex-wrap gap-2 mb-4">
 <input className="input max-w-xs" placeholder="Filter by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
        {!fixedRealm && (
          <select className="input w-auto" value={realm} onChange={(e) => setRealm(e.target.value)} aria-label="Realm">
            <option value="">All realms</option>
            {realms.list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        {typeChoices.length > 1 && (
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {typeChoices.map((t) => (
              <option key={t} value={t}>
                {recordTypes.label(t)}
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
        <Check checked={archived} onChange={setArchived} className="self-center text-dim">
          Include archived
        </Check>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : rows.length ? (
        <EntityTable
          rows={rows}
          showRealm={!fixedRealm}
          pick={
            selecting
              ? {
                  picked,
                  toggle: (id) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id]))),
                  // "All" is all that the filters show now.
                  all: (on) => setPicked(on ? new Set(rows.map((r) => r.id)) : new Set()),
                }
              : undefined
          }
        />
      ) : (
        <Empty title="No records match">Adjust the filters, or import your library.</Empty>
      )}
      {selecting && picked.size > 0 && <BulkBar ids={[...picked]} onDone={() => (setPicked(new Set()), void reload())} onClear={() => setPicked(new Set())} />}
      {selecting && picked.size === 0 && <p className="mt-3 text-sm text-dim">Tick the records to change, or the box at the top for all {rows.length} shown.</p>}
    </div>
  );
}
