import { Link } from 'react-router-dom';
import { CalendarDays, Compass, Eye, Flag, History, ListChecks, Play, Upload, Star, MapPinned, Users } from 'lucide-react';
import { useApi } from '../lib/api';
import { ErrorBox, Loading, PageHeader, RealmBadge, TypeBadge, EntityLink } from '../components/ui';
import { Markdown } from '../components/Markdown';
import type { EntitySummary } from '../lib/types';

interface Row {
  id: string;
  name: string;
  type: string;
  realm: string;
}
interface Dash {
  worldDate: string | null;
  counts: { entities: number; relationships: number; documents: number; campaigns: number; pendingReview: number };
  branches: { id: string; name: string; realm: string; excerpt: string; count: number }[];
  active: null | {
    campaign: { id: number; title: string; current_date: string; status: string };
    lastSession: { id: number; number: number; title: string; status: string } | null;
    liveSession: { id: number; number: number; title: string } | null;
    nextSession: { id: number; number: number; title: string } | null;
    openQuests: { id: number; title: string; status: string }[];
    plans: { id: number; title: string; faction_name: string; faction_id: string; progress: number; segments: number; deadline: string }[];
    recentChanges: { id: number; entity_id: string | null; entity_name: string | null; field: string; value: string; status: string }[];
  };
  recentViews: EntitySummary[];
  recentEdits: { entity_id: string; name: string; change_type: string; reason: string; created_at: string }[];
  favorites: EntitySummary[];
  mysteries: Row[];
  keyPlaces: Row[];
  keyPeople: Row[];
  factions: Row[];
}

function Card({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel-pad">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RowList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-dim">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-2 text-sm">
          <EntityLink id={r.id}>{r.name}</EntityLink>
          <span className="ml-auto flex gap-1">
            <TypeBadge type={r.type} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const BRANCH_ART: Record<string, string> = { aetheris: 'from-amber-700/25', kaelmar: 'from-emerald-700/25', ethereal: 'from-violet-700/25' };

export function Dashboard() {
  const { data, error, loading, reload } = useApi<Dash>('/api/dashboard');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  if (data.counts.entities === 0)
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
        <h1 className="text-3xl text-gold">Your world is waiting</h1>
        <p className="text-dim">The library is empty. Import your world archive (a ZIP of the Markdown encyclopedia) to populate the encyclopedia, timeline and branches. Nothing is invented: only your source files are used.</p>
        <Link to="/import" className="btn-primary text-base">
          <Upload size={16} /> Import world archive
        </Link>
      </div>
    );

  const a = data.active;
  return (
    <div className="space-y-5">
      <PageHeader
        title="World Dashboard"
        subtitle={
          <span className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={14} /> World date: <strong className="text-ink">{a?.campaign.current_date ?? data.worldDate ?? 'UNDEFINED'}</strong>
              {a && <span className="text-dim">(campaign date)</span>}
            </span>
            <span>{data.counts.entities} records · {data.counts.relationships} links · {data.counts.documents} source files</span>
          </span>
        }
        actions={
          <>
            {a?.liveSession ? (
              <Link to="/campaign/live" className="btn-primary">
                <Play size={14} /> Continue live session {a.liveSession.number}
              </Link>
            ) : a?.lastSession ? (
              <Link to={`/session/${a.lastSession.id}`} className="btn-primary">
                <Play size={14} /> Continue last session (#{a.lastSession.number})
              </Link>
            ) : null}
            {data.counts.pendingReview > 0 && (
              <Link to="/review" className="btn">
                {data.counts.pendingReview} awaiting canon review
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {data.branches.map((b) => (
          <Link key={b.id} to={`/realm/${b.realm}`} className={`panel p-4 bg-gradient-to-br ${BRANCH_ART[b.realm] ?? ''} to-transparent hover:border-gold/60 transition-colors block`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-gold">{b.name}</h2>
              <RealmBadge realm={b.realm} />
            </div>
            <div className="text-sm text-dim mt-1 mb-2">{b.count} records</div>
            <div className="text-sm line-clamp-4 opacity-90">
              <Markdown text={b.excerpt} className="prose-lore text-[15px] leading-snug" />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Active campaign" icon={<Compass size={15} />} action={<Link to="/campaigns" className="btn-ghost text-xs">All campaigns</Link>}>
          {a ? (
            <div className="space-y-2 text-sm">
              <Link to="/campaign" className="text-lg text-ink hover:text-gold font-display">
                {a.campaign.title}
              </Link>
              <div className="text-dim">Status: {a.campaign.status}</div>
              <div>
                Last session: {a.lastSession ? <Link className="text-arcane" to={`/session/${a.lastSession.id}`}>#{a.lastSession.number} {a.lastSession.title}</Link> : <span className="text-dim">none yet</span>}
              </div>
              <div>
                Next prep: {a.nextSession ? <Link className="text-arcane" to={`/session/${a.nextSession.id}`}>#{a.nextSession.number} {a.nextSession.title}</Link> : <span className="text-dim">no planned session</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-dim">
              No active campaign. <Link className="text-arcane" to="/campaigns">Create or choose one</Link>. No campaign events are shown until sessions are recorded.
            </p>
          )}
        </Card>
        <Card title="Open quests" icon={<ListChecks size={15} />}>
          {a?.openQuests.length ? (
            <ul className="space-y-1 text-sm">
              {a.openQuests.map((q) => (
                <li key={q.id}>
                  <Link className="hover:text-gold" to={`/campaign/quests?quest=${q.id}`}>{q.title}</Link> <span className="text-dim text-xs">({q.status})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">No open quests recorded.</p>
          )}
        </Card>
        <Card title="Faction agendas" icon={<Flag size={15} />} action={<Link to="/agendas" className="btn-ghost text-xs">Manage</Link>}>
          {a?.plans.length ? (
            <ul className="space-y-2 text-sm">
              {a.plans.map((p) => (
                <li key={p.id}>
                  <div className="flex justify-between">
                    <span>{p.title}</span>
                    <span className="text-dim text-xs">{p.faction_name}</span>
                  </div>
                  <div className="h-1.5 bg-raised rounded mt-1">
                    <div className="h-full bg-gold/70 rounded" style={{ width: `${(p.progress / p.segments) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">No active faction plans. Plans are optional campaign tools you create; none are generated automatically.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Campaign world events" icon={<History size={15} />}>
          {a?.recentChanges.length ? (
            <ul className="space-y-1 text-sm">
              {a.recentChanges.map((c) => (
                <li key={c.id}>
                  {c.entity_id ? <EntityLink id={c.entity_id}>{c.entity_name ?? c.entity_id}</EntityLink> : 'World'}: {c.field} → <strong>{c.value}</strong>
                  {c.status === 'proposed' && <span className="text-xs text-amber-400"> (proposed)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">No campaign changes recorded yet.</p>
          )}
        </Card>
        <Card title="Mysteries and secrets" icon={<Eye size={15} />} action={<Link to="/mysteries" className="btn-ghost text-xs">All</Link>}>
          <RowList rows={data.mysteries} empty="None imported." />
        </Card>
        <Card title="Recently viewed" icon={<History size={15} />}>
          <RowList rows={data.recentViews} empty="Open a record and it will appear here." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Favorites" icon={<Star size={15} />}>
          <RowList rows={data.favorites} empty="Star a record to pin it here." />
        </Card>
        <Card title="Key places" icon={<MapPinned size={15} />}>
          <RowList rows={data.keyPlaces} empty="—" />
        </Card>
        <Card title="Key people" icon={<Users size={15} />}>
          <RowList rows={data.keyPeople} empty="—" />
        </Card>
        <Card title="Recently edited lore" icon={<History size={15} />}>
          {data.recentEdits.length ? (
            <ul className="space-y-1 text-sm">
              {data.recentEdits.map((r, i) => (
                <li key={i}>
                  <EntityLink id={r.entity_id}>{r.name}</EntityLink> <span className="text-xs text-dim">{r.change_type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">No edits since import.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
