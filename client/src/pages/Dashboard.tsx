import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CircleHelp,
  Compass,
  Eye,
  Flag,
  Ghost,
  Globe2,
  History,
  Hourglass,
  ListChecks,
  MapPinned,
  Mountain,
  NotebookPen,
  Play,
  Search,
  Star,
  Trees,
  Unlink,
  Upload,
  Users,
} from 'lucide-react';
import { useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { useMechanics } from '../lib/mechanics';
import { Badge, Card, Empty, ErrorBox, Loading, TypeBadge, EntityLink } from '../components/ui';
import { Markdown } from '../components/Markdown';
import type { EntitySummary } from '../lib/types';

interface Row {
  id: string;
  name: string;
  type: string;
  realm: string;
}
interface SessionRow {
  id: number;
  number: number;
  title: string;
  status?: string;
}
interface Dash {
  worldDate: string | null;
  counts: { entities: number; relationships: number; documents: number; campaigns: number; pendingReview: number };
  byRealm: { realm: string; n: number }[];
  branches: { id: string; name: string; realm: string; excerpt: string; count: number }[];
  active: null | {
    campaign: { id: number; title: string; current_date: string; status: string; premise?: string };
    lastSession: SessionRow | null;
    liveSession: SessionRow | null;
    nextSession: SessionRow | null;
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
interface Overview {
  characters: { id: number; name: string; kind: string; level: number }[];
}
interface ReturnClock {
  stage: number;
  stages: { stage: number; title: string }[];
}

/** The realms' colours and art, as literal class names (so Tailwind keeps them). */
const REALM_STYLE: Record<string, { text: string; rule: string; wash: string; ring: string; icon: ReactNode }> = {
  aetheris: { text: 'text-realm-aetheris', rule: 'bg-realm-aetheris', wash: 'from-realm-aetheris/[0.14]', ring: 'hover:border-realm-aetheris/60', icon: <Mountain size={18} /> },
  kaelmar: { text: 'text-realm-kaelmar', rule: 'bg-realm-kaelmar', wash: 'from-realm-kaelmar/[0.14]', ring: 'hover:border-realm-kaelmar/60', icon: <Trees size={18} /> },
  ethereal: { text: 'text-realm-ethereal', rule: 'bg-realm-ethereal', wash: 'from-realm-ethereal/[0.14]', ring: 'hover:border-realm-ethereal/60', icon: <Ghost size={18} /> },
  world: { text: 'text-realm-world', rule: 'bg-realm-world', wash: 'from-realm-world/[0.14]', ring: 'hover:border-realm-world/60', icon: <Globe2 size={18} /> },
};
const REALM_DOT: Record<string, string> = {
  aetheris: 'bg-realm-aetheris',
  kaelmar: 'bg-realm-kaelmar',
  ethereal: 'bg-realm-ethereal',
  world: 'bg-realm-world',
};

/** Opens the search palette (the layout listens for Ctrl K). */
const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

/** Record links, each peekable (hover for the card, middle-click for the inspector). */
function RecordList({ rows, empty, limit }: { rows: Row[]; empty: string; limit?: number }) {
  if (!rows.length) return <Empty compact title={empty} />;
  return (
    <ul className="-mx-1.5">
      {rows.slice(0, limit).map((r) => (
        <li key={r.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-raised/70">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${REALM_DOT[r.realm] ?? 'bg-line'}`} aria-hidden />
          <EntityLink id={r.id} className="min-w-0 truncate">
            {r.name}
          </EntityLink>
          <span className="ml-auto shrink-0">
            <TypeBadge type={r.type} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One figure in the campaign card. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line/70 bg-raised/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-0.5 text-sm text-ink truncate">{children}</div>
    </div>
  );
}

/** A tile in the "state of the world" strip. */
function StateTile({
  to,
  icon,
  label,
  value,
  hint,
  tone = 'ink',
  children,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  tone?: 'ink' | 'warn' | 'danger' | 'ok';
  children?: ReactNode;
}) {
  const toneClass = { ink: 'text-ink', warn: 'text-warn', danger: 'text-danger', ok: 'text-ok' }[tone];
  return (
    <Link to={to} className="group panel elev-1 flex flex-col gap-1 p-4 hover:border-gold/60 transition-colors min-w-0">
      <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-dim">
        <span className="text-gold/80">{icon}</span>
        {label}
        <ArrowRight size={13} className="ml-auto opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-gold" aria-hidden />
      </span>
      <span className={`num text-2xl leading-tight ${toneClass}`}>{value}</span>
      {children}
      <span className="text-xs text-dim">{hint}</span>
    </Link>
  );
}

function partyLevel(chars: Overview['characters'] | undefined) {
  const pcs = (chars ?? []).filter((c) => c.kind !== 'npc');
  if (!chars) return { level: '…', who: '' };
  if (!pcs.length) return { level: 'No characters yet', who: '' };
  const lv = pcs.map((c) => c.level || 1);
  const lo = Math.min(...lv);
  const hi = Math.max(...lv);
  return { level: lo === hi ? `Level ${lo}` : `Levels ${lo}–${hi}`, who: pcs.length === 1 ? pcs[0].name : `${pcs.length} characters` };
}

export function Dashboard() {
  const { appName, debug } = useAppState();
  const mech = useMechanics();
  const { data, error, loading, reload } = useApi<Dash>('/api/dashboard');
  const a = data?.active ?? null;
  const cid = a?.campaign.id;
  const { data: overview } = useApi<Overview>(cid ? `/api/campaigns/${cid}/overview` : null);
  const { data: clock } = useApi<ReturnClock>(cid && mech?.theReturn ? `/api/return?campaign_id=${cid}` : null);
  const hasRecords = !!data && data.counts.entities > 0;
  const { data: questions } = useApi<{ counts: { kept: number; filled: number; todo: number } }>(hasRecords ? '/api/library/open-questions' : null);
  const { data: broken } = useApi<{ references: unknown[]; danglingRelationships: unknown[] }>(hasRecords && debug ? '/api/broken' : null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  if (data.counts.entities === 0)
    return (
      <div className="max-w-2xl mx-auto mt-10 sm:mt-16">
        <div className="title-band gilt-corners px-6 py-10 sm:px-10 text-center elev-1">
          <div className="section-title">World Dashboard</div>
          <h1 className="mt-3 text-2xl sm:text-3xl text-ink">Your world is waiting</h1>
          <div className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-gold to-transparent" aria-hidden />
          <p className="prose-lore mx-auto mt-4 max-w-[52ch] text-[17px] text-ink/90">
            The library is empty. Import your world archive (a ZIP of the Markdown encyclopedia) to populate the encyclopedia, timeline and branches. Nothing is invented: only your source files are
            used.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/import" className="btn-primary text-base px-4 py-2">
              <Upload size={16} /> Import world archive
            </Link>
            <Link to="/campaigns" className="btn text-base px-4 py-2">
              <Compass size={16} /> Campaigns
            </Link>
          </div>
          <ol className="mt-8 grid gap-3 text-left sm:grid-cols-3 text-sm">
            {[
              ['Import', 'Choose the archive and preview what it holds, broken references included.'],
              ['Confirm', 'The records, links and source files go into this library.'],
              ['Explore', 'Realms, the atlas, the timeline and every record, ready to peek.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-md border border-line bg-raised/60 p-3">
                <div className="font-display text-gold">
                  <span className="num">{i + 1}</span>. {t}
                </div>
                <div className="text-dim mt-1 text-xs">{d}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );

  const party = partyLevel(overview?.characters);
  const date = a?.campaign.current_date || data.worldDate || 'UNDEFINED';
  const realmCount = (r: string) => data.byRealm?.find((x) => x.realm === r)?.n ?? 0;
  const realms = [
    ...data.branches.map((b) => ({ key: b.realm, name: b.name, to: `/realm/${b.realm}`, count: b.count, excerpt: b.excerpt })),
    ...(realmCount('world')
      ? [{ key: 'world', name: 'The world', to: '/world', count: realmCount('world'), excerpt: 'What spans every realm: the cosmology, the pantheon, the peoples, magic, and the timeline.' }]
      : []),
  ];
  const openQ = questions?.counts.todo;
  const brokenN = broken ? broken.references.length + broken.danglingRelationships.length : undefined;
  const stage = clock ? clock.stages.find((s) => s.stage === clock.stage) : undefined;
  const premise = a?.campaign.premise?.split(/\n\s*\n/)[0] ?? '';

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Hero: the world's name, its date, and the way in (search). */}
      <header className="title-band gilt-corners elev-1 px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1 basis-[22rem]">
            <div className="section-title">World Dashboard</div>
            <h1 className="mt-1.5 text-3xl sm:text-4xl text-ink leading-tight">{appName}</h1>
            <div className="mt-2 h-0.5 w-28 bg-gradient-to-r from-gold to-transparent" aria-hidden />
            <p className="mt-3 flex items-start gap-2 text-sm text-dim">
              <CalendarDays size={15} className="text-gold/80 shrink-0 mt-0.5" aria-hidden />
              <span>
                {a ? 'Campaign date' : 'World date'}: <strong className="text-ink font-medium">{date}</strong>
              </span>
              {debug && (
                <span className="num text-xs">
                  · {data.counts.entities} records · {data.counts.relationships} links · {data.counts.documents} source files
                </span>
              )}
            </p>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[20rem] sm:flex-1 sm:max-w-lg">
            <button
              type="button"
              onClick={openSearch}
              className="group flex w-full items-center gap-3 rounded-md border border-edge/60 bg-raised px-4 py-3 text-left shadow-sm hover:border-gold/70 transition-colors"
              aria-label="Search the world (Ctrl K)"
            >
              <Search size={18} className="text-gold shrink-0" aria-hidden />
              <span className="flex-1 min-w-0 truncate text-[15px] text-dim group-hover:text-ink">Search people, places, lore…</span>
              <kbd className="hidden sm:inline-block rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] text-dim font-sans">Ctrl K</kbd>
            </button>
          </div>
        </div>
      </header>

      {/* The active campaign, and where the GM left off. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          featured
          className="lg:col-span-2 px-5 py-5"
          title="Active campaign"
          icon={<Compass size={15} />}
          actions={
            <Link to="/campaigns" className="btn-ghost text-xs">
              All campaigns
            </Link>
          }
        >
          {a ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/campaign" className="font-display text-2xl text-ink hover:text-gold leading-tight">
                    {a.campaign.title}
                  </Link>
                  {a.liveSession ? (
                    <Badge tone="danger" icon={<span className="h-1.5 w-1.5 rounded-full bg-danger motion-safe:animate-pulse" />}>
                      Live
                    </Badge>
                  ) : (
                    <Badge className="capitalize">{a.campaign.status}</Badge>
                  )}
                </div>
                {premise && (
                  <div className="mt-2 max-w-[72ch] text-ink/90">
                    <Markdown text={premise} className="prose-lore text-[15px] leading-relaxed [&_p]:my-0 [&_p]:line-clamp-3" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <Fact label={a.liveSession ? 'Live now' : 'Next session'}>
                  {a.liveSession ? (
                    <Link className="text-arcane hover:text-gold" to="/campaign/live">
                      <span className="num">#{a.liveSession.number}</span> {a.liveSession.title}
                    </Link>
                  ) : a.nextSession ? (
                    <Link className="text-arcane hover:text-gold" to={`/session/${a.nextSession.id}`} title={a.nextSession.title}>
                      <span className="num">#{a.nextSession.number}</span> {a.nextSession.title}
                    </Link>
                  ) : (
                    <span className="text-dim">None planned</span>
                  )}
                </Fact>
                <Fact label="Latest session">
                  {a.lastSession ? (
                    <Link className="text-arcane hover:text-gold" to={`/session/${a.lastSession.id}`} title={a.lastSession.title}>
                      <span className="num">#{a.lastSession.number}</span> {a.lastSession.title}
                    </Link>
                  ) : (
                    <span className="text-dim">None yet</span>
                  )}
                </Fact>
                <Fact label="Party">
                  <span className="num">{party.level}</span>
                  {party.who && <span className="text-dim"> · {party.who}</span>}
                </Fact>
                <Fact label="Open quests">
                  <span className="num">
                    {a.openQuests.length}
                    {a.openQuests.length >= 8 ? '+' : ''}
                  </span>
                </Fact>
              </div>
              {a.openQuests.length > 0 && (
                <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-sm">
                  {a.openQuests.slice(0, 6).map((q) => (
                    <li key={q.id} className="flex items-center gap-2 min-w-0">
                      <ListChecks size={13} className="text-gold/70 shrink-0" aria-hidden />
                      <Link className="truncate hover:text-gold" to={`/campaign/quests?quest=${q.id}`} title={q.title}>
                        {q.title}
                      </Link>
                      <span className="text-dim text-xs shrink-0">{q.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
                {a.nextSession && (
                  <Link to={`/session/${a.nextSession.id}`} className={a.liveSession ? 'btn' : 'btn-primary'}>
                    <NotebookPen size={14} /> Prep the next session
                  </Link>
                )}
                {a.liveSession ? (
                  <Link to="/campaign/live" className="btn-primary">
                    <Play size={14} /> Continue live session {a.liveSession.number}
                  </Link>
                ) : (
                  <Link to="/campaign/live" className="btn">
                    <Play size={14} /> Go live
                  </Link>
                )}
                <Link to="/campaign/party" className="btn">
                  <Users size={14} /> Party
                </Link>
                <Link to="/campaign" className="btn-ghost ml-auto">
                  Campaign overview <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ) : (
            <Empty
              compact
              title="No active campaign"
              action={
                <Link className="btn" to="/campaigns">
                  Create or choose one
                </Link>
              }
            >
              No campaign events are shown until sessions are recorded.
            </Empty>
          )}
        </Card>
        <div className="grid gap-4 content-start">
          <Card title="Pick up where you left off" icon={<History size={15} />}>
            <RecordList rows={data.recentViews} limit={6} empty="Open a record and it will appear here." />
          </Card>
          <Card title="Favorites" icon={<Star size={15} />}>
            <RecordList rows={data.favorites} limit={6} empty="Star a record to pin it here." />
          </Card>
        </div>
      </div>

      {/* The realms. */}
      <section aria-labelledby="dash-realms">
        <h2 id="dash-realms" className="title-rule text-lg mb-3">
          Realms
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {realms.map((r) => {
            const s = REALM_STYLE[r.key] ?? REALM_STYLE.world;
            return (
              <Link key={r.key} to={r.to} className={`group panel elev-1 relative overflow-hidden flex flex-col bg-gradient-to-b ${s.wash} to-transparent ${s.ring} transition-colors`}>
                <span className={`absolute inset-x-0 top-0 h-1 ${s.rule}`} aria-hidden />
                <div className="flex items-start gap-3 px-4 pt-5">
                  <span className={`mt-0.5 shrink-0 ${s.text}`} aria-hidden>
                    {s.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-lg leading-tight ${s.text}`}>{r.name}</h3>
                    <div className="text-xs text-dim mt-0.5">
                      <span className="num text-ink">{r.count}</span> records
                    </div>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-4 text-ink/90">
                  <Markdown text={r.excerpt} className="prose-lore text-[15px] leading-snug [&_p]:my-0 [&_p]:line-clamp-4" />
                </div>
                <span className={`mt-auto flex items-center gap-1 border-t border-line/70 px-4 py-2 text-xs ${s.text}`}>
                  Explore <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* The state of the world: what needs the GM's attention. */}
      <section aria-labelledby="dash-state">
        <h2 id="dash-state" className="title-rule text-lg mb-3">
          State of the world
        </h2>
        <div className={`grid gap-4 grid-cols-2 ${['lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4'][(clock ? 1 : 0) + (debug ? 1 : 0)]}`}>
          {clock && (
            <StateTile
              to="/campaign/return"
              icon={<Hourglass size={14} />}
              label="The Return"
              value={clock.stage ? `Stage ${clock.stage}` : 'Not begun'}
              hint={stage?.title ?? `${clock.stages.length} stages`}
              tone={clock.stage >= 5 ? 'danger' : clock.stage >= 3 ? 'warn' : 'ink'}
            >
              <span className="flex gap-0.5 my-1" aria-label={`Stage ${clock.stage} of ${clock.stages.length}`}>
                {clock.stages.map((s) => (
                  <span key={s.stage} className={`h-1.5 flex-1 rounded-sm ${s.stage <= clock.stage ? 'bg-danger/80' : 'bg-line'}`} />
                ))}
              </span>
            </StateTile>
          )}
          <StateTile
            to="/open-questions"
            icon={<CircleHelp size={14} />}
            label="Open questions"
            value={openQ ?? '…'}
            tone={openQ ? 'warn' : 'ink'}
            hint={questions ? `${questions.counts.filled + questions.counts.kept} answered or kept open` : 'Gaps in the lore to decide'}
          />
          <StateTile
            to="/review"
            icon={<BadgeCheck size={14} />}
            label="Canon review"
            value={data.counts.pendingReview}
            tone={data.counts.pendingReview ? 'warn' : 'ink'}
            hint={data.counts.pendingReview ? 'Proposals awaiting canon review' : 'Nothing waiting'}
          />
          {/* A technical check: only in debug mode, like the Broken References page itself. */}
          {debug && (
            <StateTile
              to="/broken"
              icon={<Unlink size={14} />}
              label="Broken references"
              value={brokenN ?? '…'}
              tone={brokenN ? 'danger' : 'ok'}
              hint={brokenN ? 'Links to records that do not exist' : broken ? 'Every link resolves' : 'Checking the links…'}
            />
          )}
        </div>
      </section>

      {/* The rest of the ledger. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          title="Faction agendas"
          icon={<Flag size={15} />}
          actions={
            <Link to="/agendas" className="btn-ghost text-xs">
              Manage
            </Link>
          }
        >
          {a?.plans.length ? (
            <ul className="space-y-2.5 text-sm">
              {a.plans.map((p) => (
                <li key={p.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate" title={p.title}>
                      {p.title}
                    </span>
                    <span className="text-dim text-xs shrink-0">{p.faction_name}</span>
                  </div>
                  <div className="mt-1 flex gap-0.5" aria-label={`${p.progress} of ${p.segments}`}>
                    {Array.from({ length: p.segments }, (_, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < p.progress ? 'bg-gold/80' : 'bg-line'}`} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="No active faction plans.">
              Plans are optional campaign tools you create; none are generated automatically.
            </Empty>
          )}
        </Card>
        <Card title="Campaign world events" icon={<BookOpen size={15} />}>
          {a?.recentChanges.length ? (
            <ul className="space-y-1.5 text-sm">
              {a.recentChanges.map((c) => (
                <li key={c.id} className="leading-snug">
                  {c.entity_id ? <EntityLink id={c.entity_id}>{c.entity_name ?? c.entity_id}</EntityLink> : 'World'}
                  <span className="text-dim">: {c.field} → </span>
                  <span className="text-ink font-medium">{c.value}</span>
                  {c.status === 'proposed' && <span className="text-xs text-warn"> (proposed)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="No campaign changes recorded yet." />
          )}
        </Card>
        <Card
          title="Mysteries and secrets"
          icon={<Eye size={15} />}
          actions={
            <Link to="/mysteries" className="btn-ghost text-xs">
              All
            </Link>
          }
        >
          <RecordList rows={data.mysteries} empty="None imported." />
        </Card>
        <Card title="Key places" icon={<MapPinned size={15} />}>
          <RecordList rows={data.keyPlaces} limit={8} empty="—" />
        </Card>
        <Card title="Key people" icon={<Users size={15} />}>
          <RecordList rows={data.keyPeople} limit={8} empty="—" />
        </Card>
        <Card title="Recently edited lore" icon={<History size={15} />}>
          {data.recentEdits.length ? (
            <ul className="-mx-1.5">
              {data.recentEdits.map((r, i) => (
                <li key={i} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-raised/70">
                  <EntityLink id={r.entity_id} className="min-w-0 truncate">
                    {r.name}
                  </EntityLink>
                  <span className="ml-auto shrink-0 text-xs text-dim">{r.change_type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="No edits since import." />
          )}
        </Card>
      </div>
    </div>
  );
}
