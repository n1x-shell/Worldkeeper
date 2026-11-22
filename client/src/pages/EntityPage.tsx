import { useRecordTypes } from '../components/recordTypes';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Copy, Download, Network, Pencil, Star, AlertTriangle, ChevronRight, Undo2, Plus, Trash2, MoreHorizontal, Lock, History } from 'lucide-react';
import {
  CANON_STATUSES,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TYPES,
  relationshipLabel,
  type EntityType,
  type RelationshipType,
} from '@shared/domain';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Entity, EntitySummary, RelationshipView, StateRow } from '../lib/types';
import { displaySections, splitSections, type Section } from '../lib/sections';
import { AS_WRITTEN, type Cleaner } from '@shared/loreText';
import { useCleaners } from '../lib/packs';
import { RumoursPanel } from './Rumours';
import { SecretsPanel } from './Mysteries';
import { PartyTiesPanel } from './Campaign';
import { TreasurePanel } from './Treasure';
import { StatBlockPanel } from '../components/StatBlock';
import { Dev, useDebug } from '../components/Dev';
import { useRealms } from '../components/realms';
import {
  AutoTextarea,
  Badge,
  CanonFlags,
  Card,
  Check,
  Confirm,
  DataTable,
  Empty,
  EntityLink,
  ErrorBox,
  Field,
  GmOnly,
  Loading,
  Modal,
  RealmBadge,
  SaveStatus,
  Tabs,
  Toggle,
  TypeBadge,
  VisibilityBadge,
  useToast,
} from '../components/ui';
import { Markdown } from '../components/Markdown';
import { EntityPicker } from '../components/EntityPicker';
import { useInspectorPanel } from '../components/peek/panel';
import { ProfilePanel } from './Profile';
import { profileKindFor } from '@shared/profiles';

interface Detail {
  entity: Entity;
  redirectedFrom: string | null;
  relationships: RelationshipView[];
  children: EntitySummary[];
  parent: EntitySummary | null;
  campaignState: StateRow[];
  activeCampaignId: number | null;
  sections: { heading: string; secret: boolean }[];
  baseline: { revisionId: number; created_at: string } | null;
}

interface Revision {
  id: number;
  version: number;
  change_type: string;
  reason: string;
  created_at: string;
}

type Tab = 'record' | 'profile' | 'edit' | 'relationships' | 'player' | 'campaign' | 'history';

/** The GM-only label, the same on every part of this page. */
const gmLabel = (extra?: string) => (
  <span className="inline-flex items-center gap-1">
    <Lock size={10} aria-hidden /> GM only{extra ? ` · ${extra}` : ''}
  </span>
);

export function EntityPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { reloadIndex, debug } = useAppState();
  const cleanerFor = useCleaners();
  const { data, error, loading, reload, setData } = useApi<Detail>(`/api/entities/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<Tab>('record');
  const { toast, node: toastNode } = useToast();
  const [confirmArchive, setConfirmArchive] = useState(false);
  // The record's details (links, mentions, revisions) go to the inspector while it is docked beside the page.
  const inspector = useInspectorPanel('Record details');
  const entityId = data?.entity.id ?? null;
  const revisions = useApi<Revision[]>(entityId ? `/api/entities/${encodeURIComponent(entityId)}/revisions` : null);
  const reloadRevisions = revisions.reload;
  const version = data?.entity.version;
  const seenVersion = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Refresh the list after an edit (the first load comes with the record).
    if (seenVersion.current !== undefined && version !== seenVersion.current) void reloadRevisions();
    seenVersion.current = version;
  }, [version, reloadRevisions]);

  useEffect(() => setTab('record'), [id]);
  useEffect(() => {
    if (data?.redirectedFrom) nav(`/e/${encodeURIComponent(data.entity.id)}`, { replace: true });
  }, [data, nav]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const e = data.entity;

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      const updated = await api.patch<Entity>(`/api/entities/${encodeURIComponent(e.id)}`, body);
      setData({ ...data, entity: updated });
      if (msg) toast(msg);
      void reloadIndex();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  // Outside debug mode, a pack's fields its source left undefined are not facts about the world, so they are not shown.
  const clean = cleanerFor(e.pack_id);
  const fieldMap = debug || clean === AS_WRITTEN ? e.fields : e.fields.filter(([, v]) => !/^\s*UNDEFINED\b/i.test(v)).map(([k, v]) => [k, clean.text(v)] as [string, string]);
  const profileKind = profileKindFor(e.type);
  const details = <RecordDetails data={data} revisions={revisions.data} inInspector={inspector.inInspector} onTab={setTab} />;
  return (
    <div className="space-y-4">
      {toastNode}
      {data.redirectedFrom && debug && <div className="text-sm text-dim">Redirected from legacy ID {data.redirectedFrom}.</div>}
      <header className="title-band gilt-corners elev-1 !px-4 !py-4 sm:!px-6 sm:!py-5">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-dim mb-1.5">
              <Link to="/browse/all" className="hover:text-gold">
                All lore
              </Link>
              {data.parent ? (
                <>
                  <ChevronRight size={12} aria-hidden className="opacity-60" />
                  <EntityLink id={data.parent.id}>{data.parent.name}</EntityLink>
                </>
              ) : e.parent_raw && debug ? (
                <>
                  <ChevronRight size={12} aria-hidden className="opacity-60" />
                  <span>{e.parent_raw}</span>
                </>
              ) : null}
              <Dev>
                <span className="ml-2 font-mono">{e.id}</span>
              </Dev>
            </nav>
            <h1 className="illuminated font-display text-[26px] sm:text-[32px] leading-tight text-ink break-words">{e.name}</h1>
            {e.aliases.length > 0 && (
              <p className="font-serif italic text-[16px] text-dim mt-1">
                Also known as {e.aliases.join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <TypeBadge type={e.type} />
              <RealmBadge realm={e.realm} />
              <CanonFlags status={e.canon_status} flags={e.canon_flags} />
              <VisibilityBadge revealed={e.revealed} />
              {e.modified_since_import && (
                <Link to="/review" title="Open Canon Review">
                  <Badge tone="warn" icon={<AlertTriangle size={11} />}>
                    Edited, not yet reviewed
                  </Badge>
                </Link>
              )}
              {e.archived && <Badge tone="danger">Archived</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={`btn ${e.favorite ? 'border-gold/60' : ''}`}
              onClick={() => patch({ favorite: !e.favorite })}
              aria-pressed={e.favorite}
              aria-label="Favorite"
              title={e.favorite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Star size={15} fill={e.favorite ? 'currentColor' : 'none'} className={e.favorite ? 'text-gold' : ''} />
            </button>
            <button className="btn-primary" onClick={() => setTab('edit')}>
              <Pencil size={14} /> Edit
            </button>
            <MoreMenu
              items={[
                { label: 'Graph', icon: <Network size={14} />, to: `/graph?focus=${encodeURIComponent(e.id)}`, hint: 'See its links on the relationship graph' },
                {
                  label: 'Duplicate as draft',
                  icon: <Copy size={14} />,
                  hint: 'A PROPOSED copy; the original is unchanged',
                  onSelect: async () => {
                    const d = await api.post<Entity>(`/api/entities/${encodeURIComponent(e.id)}/duplicate`);
                    await reloadIndex();
                    nav(`/e/${d.id}`);
                  },
                },
                { label: 'Export', icon: <Download size={14} />, href: `/api/entities/${encodeURIComponent(e.id)}/export.md`, hint: 'Download as Markdown' },
                e.archived
                  ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onSelect: () => patch({ archived: false }, 'Restored from archive'), divider: true }
                  : { label: 'Archive', icon: <Archive size={14} />, onSelect: () => setConfirmArchive(true), hint: 'Hide from lists; nothing is deleted', divider: true },
              ]}
            />
          </div>
        </div>
      </header>
      {confirmArchive && (
        <Confirm
          title="Archive record?"
          body="Archived records are hidden from lists but keep their ID, links and history. You can unarchive at any time. Nothing is deleted."
          confirmLabel="Archive"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false);
            void patch({ archived: true, reason: 'Archived' }, 'Archived');
          }}
        />
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'record', label: 'Record' },
          ...(profileKind ? [{ id: 'profile' as Tab, label: profileKind === 'npc' ? 'NPC profile' : 'Faction profile' }] : []),
          { id: 'edit', label: 'Edit' },
          { id: 'relationships', label: `Relationships (${data.relationships.length})` },
          { id: 'player', label: 'Player view' },
          { id: 'campaign', label: `Campaign (${data.campaignState.length})` },
          { id: 'history', label: 'History' },
        ]}
      />

      {/* In the inspector while it is docked; otherwise in the record tab's side column. */}
      {inspector.inInspector && inspector.render(details)}
      {tab === 'record' && <RecordTab data={data} debug={debug} fieldMap={fieldMap} details={inspector.inInspector ? null : details} onEdit={() => setTab('edit')} />}
      {tab === 'edit' && (
        <EntityEditor
          key={e.id}
          entity={e}
          onSaved={(updated) => {
            setData({ ...data, entity: updated });
            void reloadIndex();
          }}
          onDone={() => {
            setTab('record');
            void reload();
          }}
        />
      )}
      {tab === 'profile' && <ProfilePanel entityId={e.id} entityName={e.name} />}
      {tab === 'relationships' && <RelationshipsTab entityId={e.id} rels={data.relationships} onChange={reload} />}
      {tab === 'player' && <PlayerTab entity={e} sections={data.sections} onPatch={patch} />}
      {tab === 'campaign' && <CampaignTab entity={e} rows={data.campaignState} activeCampaignId={data.activeCampaignId} onChange={reload} />}
      {tab === 'history' && (
        <HistoryTab
          entity={e}
          onRestored={() => {
            void reload();
            void reloadRevisions();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ "More" actions
interface MenuItem {
  label: string;
  icon: ReactNode;
  hint?: string;
  to?: string;
  href?: string;
  onSelect?: () => void | Promise<void>;
  divider?: boolean;
}

/** The record's secondary actions, in a small menu: arrow keys move, Escape closes, a click outside closes. */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    (menu.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    const onDown = (ev: MouseEvent) => !box.current?.contains(ev.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const keys = (ev: ReactKeyboardEvent) => {
    const all = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      ev.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (ev.key === 'ArrowDown') go(i + 1);
    else if (ev.key === 'ArrowUp') go(i - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(all.length - 1);
    else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    } else if (ev.key === 'Tab') close(false);
  };
  const cls = 'flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-raised hover:text-gold focus:bg-raised focus:text-gold focus:outline-none';
  const body = (it: MenuItem) => (
    <>
      <span className="mt-0.5 text-dim">{it.icon}</span>
      <span className="min-w-0">
        <span className="block">{it.label}</span>
        {it.hint && <span className="block text-xs text-dim" aria-hidden>{it.hint}</span>}
      </span>
    </>
  );
  return (
    <div ref={box} className="relative">
      <button ref={button} className={`btn ${open ? 'border-gold/60 text-gold' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label="More actions" title="More actions" onClick={() => setOpen(!open)}>
        <MoreHorizontal size={15} /> <span className="hidden sm:inline">More</span>
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label="More actions" className="absolute right-0 top-full z-50 mt-1 w-64 panel elev-2 py-1" onKeyDown={keys}>
          {items.map((it) => (
            <div key={it.label} className={it.divider ? 'mt-1 border-t border-line pt-1' : ''}>
              {it.to ? (
                <Link role="menuitem" tabIndex={-1} to={it.to} className={cls} aria-label={it.label} onClick={() => setOpen(false)}>
                  {body(it)}
                </Link>
              ) : it.href ? (
                <a role="menuitem" tabIndex={-1} href={it.href} className={cls} aria-label={it.label} onClick={() => setOpen(false)}>
                  {body(it)}
                </a>
              ) : (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  className={cls}
                  aria-label={it.label}
                  onClick={() => {
                    setOpen(false);
                    void it.onSelect?.();
                  }}
                >
                  {body(it)}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Record tab
/** The width of an element, kept up to date (the record's columns follow the room the page has, not the window). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

/** Sections as read on the page: the title the text repeats is dropped, and the GM-only note leaves the heading (the label says it). */
function readingSections(body: string, debug: boolean, name: string, clean: Cleaner): (Section & { anchor: string })[] {
  const list = displaySections(body, debug, clean).map((s, i) => {
    let content = s.content;
    if (i === 0 && !s.heading) {
      const m = /^\s*#\s+(.+?)\s*(\n|$)/.exec(content);
      if (m && m[1].trim().toLowerCase() === name.trim().toLowerCase()) content = content.slice(m[0].length).trim();
    }
    const heading = debug || !s.secret ? s.heading : s.heading.replace(/\s*[([][^)\]]*\b(gm|dm)[- ]?only\b[^)\]]*[)\]]/i, '').trim() || s.heading;
    return { ...s, heading, content, anchor: s.heading ? `s-${i}-${slug(s.heading)}` : '' };
  });
  return list.filter((s) => s.heading || s.content.trim());
}

function RecordTab({
  data,
  debug,
  fieldMap,
  details,
  onEdit,
}: {
  data: Detail;
  debug: boolean;
  fieldMap: [string, string][];
  details: ReactNode;
  onEdit: () => void;
}) {
  const e = data.entity;
  const [ref, w] = useWidth<HTMLDivElement>();
  const clean = useCleaners()(e.pack_id);
  const sections = useMemo(() => readingSections(e.body, debug, e.name, clean), [e.body, debug, e.name, clean]);
  const toc = sections.filter((s) => s.heading);
  const withNotes = !!e.notes.trim();
  const layout = w >= 1120 && toc.length >= 3 ? 'three' : w >= 840 ? 'two' : 'one';
  const active = useActiveSection(
    layout === 'three' ? toc.map((s) => s.anchor).concat(withNotes ? ['dm-notes'] : []) : [],
  );
  const cols = layout === 'three' ? 'grid-cols-[168px_minmax(0,1fr)_300px]' : layout === 'two' ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1';
  const glance = <AtAGlance entity={e} debug={debug} fieldMap={fieldMap} wide={layout === 'one'} />;
  return (
    <div ref={ref} className={`grid gap-4 xl:gap-6 ${cols}`}>
      {layout === 'three' && (
        <nav aria-label="On this page" className="sticky top-2 self-start pt-2 text-[13px]">
          <div className="section-title !text-[11px] mb-2 text-dim">On this page</div>
          <ul className="border-l border-line">
            {toc.map((s) => (
              <TocLink key={s.anchor} anchor={s.anchor} active={active === s.anchor} secret={s.secret}>
                {s.heading.replace(/\s*\[[A-Z]{2,5}-[\w-]+\]/g, '')}
              </TocLink>
            ))}
            {withNotes && (
              <TocLink anchor="dm-notes" active={active === 'dm-notes'} secret>
                DM notes
              </TocLink>
            )}
          </ul>
        </nav>
      )}
      {layout === 'one' && (fieldMap.length > 0 || debug) && glance}
      <article className="panel elev-1 min-w-0 self-start px-5 py-6 sm:px-8 sm:py-8" aria-label="Lore">
        <div className="mx-auto max-w-[72ch]">
          {sections.length === 0 && (
            <Empty
              compact
              title="Nothing written yet."
              action={
                <button className="btn" onClick={onEdit}>
                  <Pencil size={14} /> Write the description
                </button>
              }
            />
          )}
          {sections.map((s, i) => {
            const md = <Markdown text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} className={`prose-lore ${i === 0 && !s.heading ? 'text-[18px] [&>p:first-child]:mt-0' : ''} [&>h2:first-child]:mt-0`} />;
            return (
              <section key={s.anchor || i} id={s.anchor || undefined} className={`scroll-mt-4 ${i > 0 ? 'mt-6' : ''}`}>
                {s.secret ? <GmOnly label={gmLabel()}>{md}</GmOnly> : md}
              </section>
            );
          })}
          {withNotes && (
            <section id="dm-notes" className="scroll-mt-4 mt-8">
              <GmOnly label={gmLabel('DM notes')}>
                <Markdown text={e.notes} />
              </GmOnly>
            </section>
          )}
        </div>
      </article>
      <aside className="space-y-4 min-w-0" aria-label="Record facts">
        {layout !== 'one' && glance}
        {(e.type === 'creature' || e.type === 'npc') && <StatBlockPanel entityId={e.id} />}
        {details && <section className="panel elev-1 p-4" aria-label="Record details">{details}</section>}
        <TreasurePanel entityId={e.id} type={e.type} />
        <PartyTiesPanel entityId={e.id} />
        <SecretsPanel entityId={e.id} />
        <RumoursPanel entityId={e.id} />
      </aside>
    </div>
  );
}

function TocLink({ anchor, active, secret, children }: { anchor: string; active: boolean; secret?: boolean; children: ReactNode }) {
  return (
    <li>
      <a
        href={`#${anchor}`}
        aria-current={active ? 'location' : undefined}
        onClick={(ev) => {
          ev.preventDefault();
          const el = document.getElementById(anchor);
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        }}
        className={`-ml-px flex items-start gap-1.5 border-l-2 py-1 pl-3 pr-1 leading-snug transition-colors ${active ? 'border-gold text-gold' : 'border-transparent text-dim hover:border-gold/50 hover:text-ink'}`}
      >
        <span className="min-w-0">{children}</span>
        {secret && <Lock size={11} className="mt-[3px] shrink-0 text-danger/80" aria-label="GM only" />}
      </a>
    </li>
  );
}

/** Which of the anchored sections is being read (the last one whose top has passed the upper third of the screen). */
function useActiveSection(anchors: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = anchors.join('|');
  useEffect(() => {
    if (!anchors.length || typeof IntersectionObserver === 'undefined') return;
    const els = anchors.map((a) => document.getElementById(a)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      () => {
        const above = els.filter((el) => el.getBoundingClientRect().top < window.innerHeight * 0.33);
        setActive(above.length ? above[above.length - 1].id : (els[0]?.id ?? null));
      },
      { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

function AtAGlance({ entity: e, debug, fieldMap, wide }: { entity: Entity; debug: boolean; fieldMap: [string, string][]; wide: boolean }) {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const facts: [string, string][] = [
    ...(debug ? ([['Category', e.category_raw ?? recordTypes.label(e.type)], ['Realm', e.realm_raw ?? realms.name(e.realm)], ['Canon status', e.canon_raw ?? e.canon_status]] as [string, string][]) : []),
    ...fieldMap,
    ...(debug ? ([['Source', e.source_raw ?? 'UNDEFINED']] as [string, string][]) : []),
  ];
  return (
    <section className="parchment px-4 py-3.5 text-sm" aria-label="At a glance">
      <h2 className="font-display text-[11px] tracking-[0.2em] uppercase opacity-70 mb-2">At a glance</h2>
      {facts.length ? (
        <dl className={`grid gap-x-6 gap-y-2.5 ${wide ? 'sm:grid-cols-2' : ''}`}>
          {facts.map(([k, v], i) => (
            <Fact key={`${k}-${i}`} k={k} v={v} />
          ))}
        </dl>
      ) : (
        <p className="font-serif text-[15px] opacity-70">No further details recorded.</p>
      )}
      {debug && e.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-3">
          {e.tags.map((t) => (
            <Link key={t} to={`/search?tag=${encodeURIComponent(t)}`} className="chip border-parchink/30 text-parchink/80">
              {t}
            </Link>
          ))}
        </div>
      )}
      {debug && e.source_file && <div className="text-xs opacity-70 pt-2 break-all">File: {e.source_file}</div>}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider opacity-60">{k}</dt>
      <dd className="font-serif text-[15px] leading-snug break-words">
        <Markdown text={v} className="[&_p]:my-0 [&_a]:!text-parchlink" />
      </dd>
    </div>
  );
}

// ------------------------------------------------------------------ Record details (inspector)
const when = (iso: string) => {
  const t = new Date(iso).getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const CHANGE_LABELS: Record<string, string> = { import: 'Imported', edit: 'Edited', revert: 'Restored', create: 'Created', archive: 'Archived', review: 'Reviewed' };
/** Reasons that name source files are technical details, shown only in debug mode. */
const technical = (reason: string) => /[\\/]|\.(md|json|zip)\b/.test(reason);

function DetailGroup({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="section-title !text-[12px]">{title}</h2>
        {count != null && <span className="num text-xs text-dim">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function RecordDetails({ data, revisions, inInspector, onTab }: { data: Detail; revisions: Revision[] | undefined; inInspector: boolean; onTab: (t: Tab) => void }) {
  const recordTypes = useRecordTypes();
  const e = data.entity;
  const debug = useDebug();
  const [allChildren, setAllChildren] = useState(false);
  const [allMentions, setAllMentions] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const { groups, mentionedIn } = useMemo(() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    const mentioned = new Map<string, { id: string; name: string; type: string }>();
    const childIds = new Set(data.children.map((c) => c.id));
    for (const r of data.relationships) {
      const out = r.source_id === e.id;
      const other = out ? r.target_id : r.source_id;
      if (other === e.id) continue;
      if (r.type === 'references') {
        if (!out) mentioned.set(other, { id: other, name: r.source_name ?? other, type: r.source_type ? recordTypes.label(r.source_type) : '' });
        continue;
      }
      // The parent and the children are listed on their own.
      if (other === data.parent?.id || childIds.has(other)) continue;
      const label = relationshipLabel(r.type as RelationshipType, out);
      const list = groups.get(label) ?? [];
      if (!list.some((x) => x.id === other)) list.push({ id: other, name: (out ? r.target_name : r.source_name) ?? other });
      groups.set(label, list);
    }
    return { groups: [...groups.entries()], mentionedIn: [...mentioned.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }, [data.relationships, data.children, data.parent, e.id]);
  const kids = allChildren ? data.children : data.children.slice(0, 8);
  const mentions = allMentions ? mentionedIn : mentionedIn.slice(0, 8);
  const more = (n: number, open: boolean, set: (v: boolean) => void) =>
    n > 8 && (
      <button className="btn-ghost !px-1 text-xs mt-1" onClick={() => set(!open)} aria-expanded={open}>
        {open ? 'Show fewer' : <>Show all <span className="num">{n}</span></>}
      </button>
    );
  const label = 'text-[11px] uppercase tracking-wider text-dim';
  const connections = groups.length + (data.parent ? 1 : 0) + (data.children.length ? 1 : 0);
  return (
    <div className="text-sm">
      {inInspector && (
        <div className="mb-4">
          <div className="font-display text-gold text-base leading-tight">{e.name}</div>
          <div className="text-xs text-dim">Links, mentions and changes</div>
        </div>
      )}
      <DetailGroup
        title="Connections"
        action={
          <button className="btn-ghost !px-1.5 text-xs" onClick={() => onTab('relationships')}>
            All <span className="num">{data.relationships.length}</span>
          </button>
        }
      >
        {!connections ? (
          <p className="text-xs text-dim">No connections yet.</p>
        ) : (
          <dl className="space-y-2.5">
            {data.parent && (
              <div>
                <dt className={label}>Part of</dt>
                <dd>
                  <EntityLink id={data.parent.id}>{data.parent.name}</EntityLink>
                </dd>
              </div>
            )}
            {groups.map(([l, list]) => (
              <div key={l}>
                <dt className={label}>{l}</dt>
                <dd className="leading-relaxed">
                  {(openGroups.has(l) ? list : list.slice(0, 6)).map((x, i) => (
                    <span key={x.id}>
                      {i > 0 && <span className="text-dim">, </span>}
                      <EntityLink id={x.id}>{x.name}</EntityLink>
                    </span>
                  ))}
                  {list.length > 6 && (
                    <button className="btn-ghost !inline !px-1 !py-0 text-xs" aria-expanded={openGroups.has(l)} onClick={() => setOpenGroups((g) => new Set(g.has(l) ? [...g].filter((x) => x !== l) : [...g, l]))}>
                      {openGroups.has(l) ? 'fewer' : <>+<span className="num">{list.length - 6}</span> more</>}
                    </button>
                  )}
                </dd>
              </div>
            ))}
            {data.children.length > 0 && (
              <div>
                <dt className={label}>
                  Contains <span className="num">({data.children.length})</span>
                </dt>
                <dd>
                  <ul className="space-y-0.5">
                    {kids.map((c) => (
                      <li key={c.id} className="flex items-baseline gap-2">
                        <EntityLink id={c.id} className="min-w-0 truncate">
                          {c.name}
                        </EntityLink>
                        <span className="ml-auto shrink-0 text-[11px] text-dim">{recordTypes.label(c.type)}</span>
                      </li>
                    ))}
                  </ul>
                  {more(data.children.length, allChildren, setAllChildren)}
                </dd>
              </div>
            )}
          </dl>
        )}
      </DetailGroup>
      <DetailGroup title="Mentioned in" count={mentionedIn.length || undefined}>
        {!mentionedIn.length ? (
          <p className="text-xs text-dim">No other record mentions this one.</p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {mentions.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2">
                  <EntityLink id={m.id} className="min-w-0 truncate">
                    {m.name}
                  </EntityLink>
                  <span className="ml-auto shrink-0 text-[11px] text-dim">{m.type}</span>
                </li>
              ))}
            </ul>
            {more(mentionedIn.length, allMentions, setAllMentions)}
          </>
        )}
      </DetailGroup>
      <DetailGroup
        title="Latest changes"
        action={
          <button className="btn-ghost !px-1.5 text-xs" onClick={() => onTab('history')}>
            <History size={12} /> History
          </button>
        }
      >
        {!revisions ? (
          <p className="text-xs text-dim">Loading…</p>
        ) : !revisions.length ? (
          <p className="text-xs text-dim">No earlier versions.</p>
        ) : (
          <ol className="space-y-2">
            {revisions.slice(0, 4).map((r) => (
              <li key={r.id} className="grid grid-cols-[auto_1fr] gap-x-2">
                <span className="num text-[11px] text-dim mt-px">v{r.version}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span>{CHANGE_LABELS[r.change_type] ?? r.change_type}</span>
                    <time className="ml-auto shrink-0 text-[11px] text-dim" dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>
                      {when(r.created_at)}
                    </time>
                  </div>
                  {r.reason && (debug || !technical(r.reason)) && <div className="text-xs text-dim line-clamp-2">{r.reason}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </DetailGroup>
    </div>
  );
}


// ------------------------------------------------------------------ Editor
export function EntityEditor({ entity, onSaved, onDone }: { entity: Entity; onSaved: (e: Entity) => void; onDone: () => void }) {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const [draft, setDraft] = useState(entity);
  const [reason, setReason] = useState('');
  const version = useRef(entity.version);
  const [conflict, setConflict] = useState<string | null>(null);
  const save = useCallback(
    async (d: Entity) => {
      try {
        const updated = await api.patch<Entity>(`/api/entities/${encodeURIComponent(d.id)}`, {
          name: d.name,
          aliases: d.aliases,
          category_raw: d.category_raw,
          type: d.type,
          parent_id: d.parent_id,
          parent_raw: d.parent_raw,
          realm: d.realm,
          canon_status: d.canon_status,
          canon_flags: d.canon_flags,
          source_raw: d.source_raw,
          tags: d.tags,
          fields: d.fields,
          body: d.body,
          notes: d.notes,
          reason,
          expected_version: version.current,
        });
        version.current = updated.version;
        onSaved(updated);
      } catch (e) {
        if ((e as { status?: number }).status === 409) setConflict('This record was changed in another window. Reload to see the latest version before editing again.');
        throw e;
      }
    },
    [reason, onSaved],
  );
  const auto = useAutosave(save, 1000);
  const debug = useDebug();
  const update = (p: Partial<Entity>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    auto.schedule(next);
  };
  const isCanonImport = entity.origin === 'import' && entity.canon_status === 'CANON';

  return (
    <div className="space-y-4">
      {conflict && <ErrorBox error={conflict} />}
      {isCanonImport && (
        <div className="flex gap-2 rounded-md border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-warn shrink-0 mt-0.5" />
          <div>
            This is canon lore. Your changes are kept in its history and wait in Canon Review until you approve them.
            <Dev>
              {' '}Source file: {entity.source_file}. The original source file is never modified.
            </Dev>
          </div>
        </div>
      )}
      <div className="panel elev-2 sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <SaveStatus state={auto.state} error={auto.error} />
        <input className="input min-w-0 flex-1 basis-56 max-w-md" placeholder="Reason for change (recorded in history)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <button
            className="btn-primary"
            onClick={async () => {
              await auto.flush();
              onDone();
            }}
          >
            Done
          </button>
        </div>
      </div>
      <Card title="Identity">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Name">
            <input className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          {debug && (
            <Field label="Stable ID" hint="IDs never change.">
              <input className="input opacity-70" value={draft.id} readOnly />
            </Field>
          )}
          <Field label="Type">
            <select className="input" value={draft.type} onChange={(e) => update({ type: e.target.value as Entity['type'] })}>
              {[...recordTypes.offered.map((t) => t.key), ...(recordTypes.offered.some((t) => t.key === draft.type) ? [] : [draft.type])].map((t) => (
                <option key={t} value={t}>
                  {recordTypes.label(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Realm">
            <select className="input" value={draft.realm} onChange={(e) => update({ realm: e.target.value as Entity['realm'] })}>
              {realms.list
                .filter((r) => !r.archived || r.id === draft.realm)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Canon status">
            <select
              className="input"
              value={draft.canon_status}
              onChange={(e) => {
                const s = e.target.value as Entity['canon_status'];
                update({ canon_status: s, canon_flags: [s, ...draft.canon_flags.filter((f) => !CANON_STATUSES.includes(f as never) || f === 'SECRET')].filter((v, i, a) => a.indexOf(v) === i) });
              }}
            >
              {CANON_STATUSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Parent record">
            <EntityPicker value={draft.parent_id} onChange={(pid) => update({ parent_id: pid })} />
          </Field>
          <Field label="Aliases (one per line)">
            <textarea className="input" rows={2} value={draft.aliases.join('\n')} onChange={(e) => update({ aliases: e.target.value.split('\n').filter((s) => s.trim()) })} />
          </Field>
          <div className="sm:col-span-2">
            <span className="label">Labels</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs pt-1">
              {['SECRET', 'HOMEBREW', 'UNVERIFIED', 'OFFICIAL', 'OUTSIDE 2024 CORE'].map((f) => (
                <Check key={f} className="text-xs" checked={draft.canon_flags.includes(f)} onChange={(on) => update({ canon_flags: on ? [...draft.canon_flags, f] : draft.canon_flags.filter((x) => x !== f) })}>
                  {f}
                </Check>
              ))}
            </div>
          </div>
        </div>
        {debug && (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <Field label="Source references">
              <input className="input" value={draft.source_raw ?? ''} onChange={(e) => update({ source_raw: e.target.value })} placeholder="e.g. Kaelmar_Setting_Bible.md: Factions; or DM decision" />
            </Field>
            <Field label="Tags (comma separated)">
              <input className="input" value={draft.tags.join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })} />
            </Field>
          </div>
        )}
      </Card>
      <Card title="At a glance" aside="Short facts shown beside the lore">
        <div className="space-y-1.5">
          {draft.fields.map(([k, v], i) => (
            <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input className="input sm:w-48" value={k} onChange={(e) => update({ fields: draft.fields.map((f, j) => (j === i ? [e.target.value, f[1]] : f)) })} aria-label="Field name" />
              <input className="input flex-1 min-w-0" value={v} onChange={(e) => update({ fields: draft.fields.map((f, j) => (j === i ? [f[0], e.target.value] : f)) })} aria-label="Field value" />
              <button className="btn-ghost" onClick={() => update({ fields: draft.fields.filter((_, j) => j !== i) })} aria-label="Remove field">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => update({ fields: [...draft.fields, ['New field', 'UNDEFINED']] })}>
            <Plus size={14} /> Add field
          </button>
        </div>
      </Card>
      <Card title="Description">
        <AutoTextarea full minRows={16} aria-label="Description" value={draft.body} onChange={(e) => update({ body: e.target.value })} onBlur={() => void auto.flush()} />
        <p className="text-xs text-dim mt-1.5">Type @ to link another record. Sections headed “GM only” or “Secret” are never shown to players.</p>
      </Card>
      <GmOnly label={gmLabel('Never shown to players')}>
        <Field label="DM notes">
          <AutoTextarea minRows={4} aria-label="DM notes" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => void auto.flush()} />
        </Field>
      </GmOnly>
    </div>
  );
}

// ------------------------------------------------------------------ Relationships
function RelationshipsTab({ entityId, rels, onChange }: { entityId: string; rels: RelationshipView[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ target: null as string | null, type: 'related_to', direction: 'out', label: '', description: '', canon_status: 'PROPOSED' });
  const groups = useMemo(() => {
    const g: Record<string, RelationshipView[]> = { user: [], 'import-parent': [], 'import-field': [], 'import-reference': [] };
    for (const r of rels) (g[r.origin] ??= []).push(r);
    return g;
  }, [rels]);
  const titles: Record<string, string> = {
    user: 'Relationships',
    'import-parent': 'Part of',
    'import-field': 'Connections',
    'import-reference': 'Mentioned in the text',
  };
  return (
    <div className="space-y-4">
      {err && <ErrorBox error={err} />}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-dim mr-auto max-w-[60ch]">How this record ties into the world. Links you add are curated; the rest come from the lore and can be turned into curated ones by choosing a type.</p>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add relationship
        </button>
        <Link className="btn" to={`/graph?focus=${entityId}`}>
          <Network size={14} /> Open in graph
        </Link>
      </div>
      {!rels.length && (
        <Card>
          <Empty compact title="No relationships yet." />
        </Card>
      )}
      {Object.entries(groups).map(([origin, list]) =>
        list.length ? (
          <Card
            key={origin}
            flush
            className="overflow-x-auto"
            title={titles[origin] ?? origin}
            aside={<span className="num">{list.length}</span>}
          >
            <table className="table data-table border-t border-line">
              <tbody>
                {list.map((r) => {
                  const out = r.source_id === entityId;
                  const other = out ? r.target_id : r.source_id;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap w-48">
                        <select
                          className="input py-0.5 text-xs"
                          value={r.type}
                          onChange={async (e) => {
                            try {
                              await api.patch(`/api/relationships/${r.id}`, { type: e.target.value });
                              onChange();
                            } catch (x) {
                              setErr((x as Error).message);
                            }
                          }}
                          title={origin === 'user' ? 'Change type' : 'Choosing a type creates a curated relationship'}
                        >
                          {RELATIONSHIP_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {relationshipLabel(t, out)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <EntityLink id={other}>{(out ? r.target_name : r.source_name) ?? other}</EntityLink>
                        {r.label && <span className="text-xs text-dim ml-2">{r.label}</span>}
                        {r.description && <div className="text-xs text-dim">{r.description}</div>}
                        {origin === 'import-reference' && r.source_context && <Markdown text={r.source_context} className="text-xs text-dim italic line-clamp-2 [&_p]:my-0" />}
                      </td>
                      <td className="w-24 text-right">
                        {origin === 'user' && (
                          <button
                            className="btn-ghost"
                            onClick={async () => {
                              await api.del(`/api/relationships/${r.id}`);
                              onChange();
                            }}
                            aria-label="Delete relationship"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : null,
      )}
      {adding && (
        <Modal title="Add relationship" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <Field label="Direction">
              <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="out">This record → other</option>
                <option value="in">Other → this record</option>
              </select>
            </Field>
            <Field label="Relationship">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {RELATIONSHIP_TYPES.filter((t) => t !== 'references').map((t) => (
                  <option key={t} value={t}>
                    {RELATIONSHIP_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Other record">
              <EntityPicker value={form.target} onChange={(t) => setForm({ ...form, target: t })} />
            </Field>
            <Field label="Label (optional)">
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Canon status">
              <select className="input" value={form.canon_status} onChange={(e) => setForm({ ...form, canon_status: e.target.value })}>
                {CANON_STATUSES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end">
              <button
                className="btn-primary"
                disabled={!form.target}
                onClick={async () => {
                  try {
                    const [s, t] = form.direction === 'out' ? [entityId, form.target] : [form.target, entityId];
                    await api.post('/api/relationships', { source_id: s, target_id: t, type: form.type, label: form.label, description: form.description, canon_status: form.canon_status });
                    setAdding(false);
                    onChange();
                  } catch (x) {
                    setErr((x as Error).message);
                  }
                }}
              >
                Save relationship
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Player view
/** Lore on the parchment card stays dark-on-paper in both themes. */
const ON_PAPER = '[&_h2]:!text-parchink [&_h2]:!border-parchink/20 [&_strong]:!text-parchink [&_a]:!text-parchlink [&_blockquote]:!text-parchink/80 [&_table]:!border-parchink/25 [&_th]:!border-parchink/25 [&_td]:!border-parchink/25 [&_th]:!bg-parchink/10 [&_th]:!text-parchink';
function PlayerTab({ entity, sections, onPatch }: { entity: Entity; sections: { heading: string; secret: boolean }[]; onPatch: (b: Record<string, unknown>, m?: string) => Promise<void> }) {
  const debug = useDebug();
  const clean = useCleaners()(entity.pack_id);
  const [summary, setSummary] = useState(entity.player_summary);
  const [fact, setFact] = useState('');
  const { data: preview, reload } = useApi<{ name: string; summary: string; facts: string[]; sections: { heading: string; content: string }[] } | null>(
    entity.revealed ? `/api/player/entities/${encodeURIComponent(entity.id)}` : null,
  );
  useEffect(() => {
    void reload();
  }, [entity.version, reload]);
  const secretRecord = entity.canon_flags.includes('SECRET');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="space-y-3">
          <Toggle checked={entity.revealed} onChange={(on) => onPatch({ revealed: on, reason: on ? 'Revealed to players' : 'Hidden from players' }, on ? 'Revealed to players' : 'Hidden from players')}>
            <span className="font-medium">Players know this record exists</span>
          </Toggle>
          <p className="text-xs text-dim">
            Players see only the name, your summary, the facts you reveal and the sections you tick. GM-only sections can't be shown; write a fact instead.
          </p>
          {secretRecord && (
            <div className="text-xs text-warn flex gap-1">
              <AlertTriangle size={13} /> This record is marked SECRET. Read each section before revealing it: secrets may appear outside GM-only headings.
            </div>
          )}
        </Card>
        <Card className="space-y-2">
          <Field label="Player summary (what the party knows)">
            <AutoTextarea full minRows={4} aria-label="Player summary" value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== entity.player_summary && onPatch({ player_summary: summary }, 'Player summary saved')} />
          </Field>
        </Card>
        <Card>
          <div className="label">Reveal sections</div>
          <ul className="space-y-1 text-sm">
            {sections
              .filter((s) => s.heading && (debug || !clean.editorial(s.heading)))
              .map((s) => (
                <li key={s.heading}>
                  <Check
                    disabled={s.secret}
                    checked={entity.revealed_sections.includes(s.heading)}
                    onChange={(on) => onPatch({ revealed_sections: on ? [...entity.revealed_sections, s.heading] : entity.revealed_sections.filter((h) => h !== s.heading) })}
                  >
                    {s.heading} {s.secret && <Badge tone="danger">GM only</Badge>}
                  </Check>
                </li>
              ))}
          </ul>
        </Card>
        <Card className="space-y-2">
          <div className="label">Revealed facts (written for players)</div>
          <ul className="text-sm space-y-1">
            {entity.revealed_facts.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-1">• {f}</span>
                <button className="btn-ghost" onClick={() => onPatch({ revealed_facts: entity.revealed_facts.filter((_, j) => j !== i) })} aria-label="Remove fact">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="input" value={fact} onChange={(e) => setFact(e.target.value)} placeholder="e.g. The party learned the inn has a locked room." />
            <button
              className="btn"
              disabled={!fact.trim()}
              onClick={() => {
                void onPatch({ revealed_facts: [...entity.revealed_facts, fact.trim()], reason: 'Fact revealed' }, 'Fact revealed');
                setFact('');
              }}
            >
              Reveal
            </button>
          </div>
        </Card>
      </div>
      <Card title="Exactly what players see">
        {!entity.revealed ? (
          <Empty compact title="Hidden. This record does not exist for players." />
        ) : preview ? (
          <div className={`parchment p-4 ${ON_PAPER}`}>
            <h2 className="text-xl">{preview.name}</h2>
            {preview.summary && <Markdown text={preview.summary} className="prose-lore text-parchink" />}
            {preview.facts.length > 0 && (
              <ul className="list-disc pl-5 font-serif">
                {preview.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            {preview.sections.map((s) => (
              <Markdown key={s.heading} text={`## ${s.heading}\n\n${s.content}`} className="prose-lore text-parchink" />
            ))}
          </div>
        ) : (
          <Loading />
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Campaign overlay
function CampaignTab({ entity, rows, activeCampaignId, onChange }: { entity: Entity; rows: StateRow[]; activeCampaignId: number | null; onChange: () => void }) {
  const [field, setField] = useState(entity.type === 'vault' ? 'Vault state' : entity.type === 'npc' ? 'Attitude toward the party' : 'Status');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-dim">
        What has changed for this record in your campaigns. Use <strong>Propose as canon</strong> to make a change permanent in the world.
      </p>
      {err && <ErrorBox error={err} />}
      {msg && <div className="text-sm text-ok">{msg}</div>}
      {activeCampaignId ? (
        <Card className="grid gap-2 md:grid-cols-[200px_1fr_1fr_auto] items-end">
          <Field label="Field">
            <input className="input" value={field} onChange={(e) => setField(e.target.value)} />
          </Field>
          <Field label="New value in this campaign">
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button
            className="btn-primary"
            disabled={!value.trim() || !field.trim()}
            onClick={async () => {
              try {
                await api.post('/api/campaign-state', { campaign_id: activeCampaignId, entity_id: entity.id, field, value, note });
                setValue('');
                setNote('');
                onChange();
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            Record
          </button>
        </Card>
      ) : (
        <Card>
          <Empty
            compact
            title="No active campaign"
            action={
              <Link className="btn" to="/campaigns">
                Choose an active campaign
              </Link>
            }
          >
            Choose one to record campaign-specific changes.
          </Empty>
        </Card>
      )}
      <Card flush>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="No campaign has changed this record."
          columns={[
            { key: 'campaign_title', label: 'Campaign', sortable: true },
            { key: 'field', label: 'Field', sortable: true },
            {
              key: 'value',
              label: 'Value',
              render: (r) => (
                <>
                  {r.value}
                  {r.note && <div className="text-xs text-dim">{r.note}</div>}
                </>
              ),
            },
            { key: 'status', label: 'Status', sortable: true },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (r) =>
                r.status === 'active' && (
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        await api.post(`/api/campaign-state/${r.id}/promote`, { reason: 'Proposed from record page' });
                        setMsg('Sent to Canon Review. The world record changes only if you approve it there.');
                      } catch (x) {
                        setErr((x as Error).message);
                      }
                    }}
                  >
                    Propose as canon
                  </button>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ History
function HistoryTab({ entity, onRestored }: { entity: Entity; onRestored: () => void }) {
  const { data, reload } = useApi<{ id: number; version: number; change_type: string; reason: string; created_at: string }[]>(`/api/entities/${encodeURIComponent(entity.id)}/revisions`);
  const [view, setView] = useState<{ id: number; snapshot: Entity } | null>(null);
  const debug = useDebug();
  useEffect(() => {
    void reload();
  }, [entity.version, reload]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-dim">Earlier versions of this record. Restoring one keeps the current version in history too.</p>
      <Card flush>
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created_at', label: 'When', sortValue: (r) => r.created_at, className: 'whitespace-nowrap text-xs', render: (r) => new Date(r.created_at).toLocaleString() },
              { key: 'version', label: 'Version', num: true, sortValue: (r) => r.version, render: (r) => `v${r.version}` },
              { key: 'change_type', label: 'Change', sortable: true, render: (r) => CHANGE_LABELS[r.change_type] ?? r.change_type },
              { key: 'reason', label: 'Reason', className: 'text-sm', render: (r) => (debug || !technical(r.reason) ? r.reason : r.change_type === 'import' ? 'From the source library' : '') },
              {
                key: 'view',
                label: '',
                align: 'right',
                className: 'whitespace-nowrap',
                render: (r) => (
                  <button className="btn-ghost" onClick={async () => setView(await api.get(`/api/revisions/${r.id}`))}>
                    View
                  </button>
                ),
              },
            ]}
          />
        )}
      </Card>
      {view && (
        <Modal title={`Version ${view.snapshot.version} of ${view.snapshot.name}`} onClose={() => setView(null)} wide>
          <div className="space-y-3">
            <DiffView before={view.snapshot.body} after={entity.body} />
            <div className="flex justify-end gap-2">
              <button
                className="btn-primary"
                onClick={async () => {
                  await api.post(`/api/entities/${encodeURIComponent(entity.id)}/revert`, { revisionId: view.id, reason: `Restored version ${view.snapshot.version}` });
                  setView(null);
                  onRestored();
                }}
              >
                <Undo2 size={14} /> Restore this version
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Simple line diff (LCS) between two texts. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => {
    const a = before.split('\n');
    const b = after.split('\n');
    if (a.length * b.length > 4_000_000) return [{ t: '=', s: 'Text too large to diff.' }];
    const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out: { t: string; s: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) (out.push({ t: '=', s: a[i] }), i++, j++);
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: a[i++] });
      else out.push({ t: '+', s: b[j++] });
    }
    while (i < a.length) out.push({ t: '-', s: a[i++] });
    while (j < b.length) out.push({ t: '+', s: b[j++] });
    return out;
  }, [before, after]);
  const changed = lines.some((l) => l.t !== '=');
  return (
    <div>
      <div className="text-xs text-dim mb-1">Red = only in that version · Green = only in the current record{!changed && ' · (no text differences)'}</div>
      <pre className="text-xs font-mono whitespace-pre-wrap max-h-[55vh] overflow-auto panel p-2">
        {lines.map((l, k) => (
          <div key={k} className={l.t === '-' ? 'bg-danger/15 text-danger' : l.t === '+' ? 'bg-ok/15 text-ok' : 'text-dim'}>
            {l.t === '=' ? '  ' : l.t + ' '}
            {l.s}
          </div>
        ))}
      </pre>
    </div>
  );
}
