import { useModules } from '../lib/modules';
import { ItemRulesList } from '../components/ItemRules';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Coins,
  Crown,
  Feather,
  Flag,
  Gem,
  Landmark,
  Library,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Scale,
  ScrollText,
  Search,
  Skull,
  Sparkles,
  UserSquare2,
  Users,
} from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { SpeciesBuilder } from './SpeciesBuilder';
import { OTHER_GROUP, PLAYER_GROUPS, groupOf, handbookTypesWith, linkedIds, previewText } from './categories';
import { Badge, RarityTag, RealmBadge, type Tone } from '../components/ui/badges';
import { realmStyle, useRealms } from '../components/realms';
import { REALM_KIND_LABELS } from '@shared/realms';
import { Card } from '../components/ui/surfaces';
import { DataTable, type Column } from '../components/ui/data';
import { Empty, Loading } from '../components/ui/feedback';

/** A link in players' Markdown: other revealed entries (/player/e/ID from the server) stay inside the handbook. */
function PlayerLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { base } = usePlayer();
  const entry = href ? /^\/player\/e\/([^/?#]+)/.exec(href)?.[1] : undefined;
  return href?.startsWith('/player/') ? (
    <Link to={`${base}${href.slice('/player'.length)}`} className="wk-ref" data-peek={entry ? decodeURIComponent(entry) : undefined}>
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-arcane underline">
      {children}
    </a>
  );
}
const MD_COMPONENTS: Components = { a: PlayerLink };
const MD_PLUGINS = [remarkGfm];

/** Markdown for players: links to other revealed entries stay inside the handbook. */
export function Md({ text, className = 'prose-lore' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={MD_PLUGINS} urlTransform={defaultUrlTransform} components={MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ------------------------------------------------------------------ Shared pieces

/**
 * A handbook page's title: a band with a small eyebrow, the title in Cinzel over a gilt rule, and a line about the
 * page. `featured` adds the gilt corners (the home page and entries); `children` sit under the subtitle.
 */
export function PlayerPageTitle({
  eyebrow,
  icon,
  title,
  subtitle,
  featured,
  illuminated,
  aside,
  children,
}: {
  eyebrow?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  featured?: boolean;
  illuminated?: boolean;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={`title-band elev-1 ${featured ? 'gilt-corners px-5 py-5 sm:px-7 sm:py-6' : 'px-5 py-4 sm:px-7 sm:py-5'}`}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[18rem]">
          {eyebrow && (
            <div className="section-title flex items-center gap-2">
              {icon}
              {eyebrow}
            </div>
          )}
          <h1 className={`mt-1.5 text-[26px] sm:text-[32px] text-ink leading-tight wrap-break-word ${illuminated ? 'illuminated' : ''}`}>{title}</h1>
          <div className="mt-2 h-0.5 w-24 bg-linear-to-r from-gold to-transparent" aria-hidden />
          {subtitle && <div className="mt-3 text-sm text-dim max-w-[72ch]">{subtitle}</div>}
          {children}
        </div>
        {aside && <div className="w-full sm:w-auto shrink-0">{aside}</div>}
      </div>
    </header>
  );
}

const GROUP_ICONS: Record<string, ReactNode> = {
  places: <Landmark size={18} />,
  people: <UserSquare2 size={18} />,
  factions: <Flag size={18} />,
  peoples: <Users size={18} />,
  gods: <Crown size={18} />,
  history: <ScrollText size={18} />,
  magic: <Sparkles size={18} />,
  rules: <Scale size={18} />,
  treasures: <Gem size={18} />,
  creatures: <Skull size={18} />,
  other: <Library size={18} />,
};

const entryHref = (base: string, id: string) => `${base}/e/${encodeURIComponent(id)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** A row of filter chips: one choice from a few. Big enough to tap on a phone. */
function FilterChips<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: ReactNode; n?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 min-h-[40px] sm:min-h-[30px] text-[13px] transition-colors ${
              on ? 'border-gold/70 bg-gold/15 text-gold' : 'border-line bg-panel text-dim hover:text-ink hover:border-gold/40'
            }`}
          >
            {o.label}
            {o.n != null && <span className={`num text-[11px] ${on ? 'text-gold/80' : 'text-dim/80'}`}>{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** One entry as a card: its name, kind and realm, and the first line of what the party knows. */
function EntryCard({ e, realm = true }: { e: PEntity; realm?: boolean }) {
  const { base } = usePlayer();
  const preview = previewText(e.summary || e.sections?.[0]?.content || '');
  return (
    <Link to={entryHref(base, e.id)} data-peek={e.id} className="group panel elev-1 flex flex-col gap-2 px-4 py-3.5 min-w-0 hover:border-gold/60 transition-colors">
      <span className="font-display text-[15px] leading-snug text-ink group-hover:text-gold wrap-break-word">{e.name}</span>
      <span className="flex flex-wrap gap-1">
        <Badge>{e.typeLabel}</Badge>
        {realm && <RealmBadge realm={e.realm} label={e.realmLabel} />}
      </span>
      {preview && <span className="text-[13px] leading-snug text-ink/80 line-clamp-2">{preview}</span>}
    </Link>
  );
}

/** Card grid of entries. */
function EntryGrid({ list, realm = true, empty }: { list: PEntity[]; realm?: boolean; empty?: ReactNode }) {
  if (!list.length) return <>{empty ?? <Empty title="Nothing here yet." />}</>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((e) => (
        <EntryCard key={e.id} e={e} realm={realm} />
      ))}
    </div>
  );
}

/** A quiet "filter these" box for long lists. */
function QuickFilter({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="input flex items-center gap-2 min-h-[40px] sm:min-h-[34px] w-full sm:w-64">
      <Search size={14} className="text-dim shrink-0" aria-hidden />
      <input className="bg-transparent outline-hidden flex-1 min-w-0" placeholder={label} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} type="search" />
    </label>
  );
}
const matches = (e: PEntity, q: string) => !q || `${e.name} ${e.typeLabel}`.toLowerCase().includes(q.trim().toLowerCase());

// Sort by name, ignoring leading quote marks, so "The Grey Raven" files under T rather than first.
const sortName = (n: string) => n.replace(/^["'“‘\s]+/, '');
const byName = (a: PEntity, b: PEntity) => sortName(a.name).localeCompare(sortName(b.name));

const QUEST_TONES: Record<string, Tone> = { open: 'gold', active: 'arcane', rumoured: 'warn', done: 'ok', completed: 'ok', complete: 'ok', failed: 'danger', abandoned: 'dim' };
const QuestStatus = ({ status }: { status: string }) => (
  <Badge tone={QUEST_TONES[status.toLowerCase()] ?? 'dim'} className="capitalize">
    {status}
  </Badge>
);
const OPEN_QUEST = ['open', 'active', 'rumoured'];

// ------------------------------------------------------------------ Home
export function PlayerHome() {
  const { base, source } = usePlayer();
  const nav = useNavigate();
  const { entities, campaigns, maps } = usePlayerIndex();
  const { data: info } = usePlayerData(() => source.info(), 'info');
  const realmList = useRealms();
  const [q, setQ] = useState('');
  if (!entities) return <Loading label="Opening the handbook…" />;
  if (!entities.length)
    return (
      <div className="max-w-2xl mx-auto mt-10 sm:mt-16">
        <div className="title-band gilt-corners elev-1 px-6 py-10 sm:px-10 text-center">
          <div className="section-title">Player Handbook</div>
          <h1 className="mt-3 text-2xl sm:text-3xl text-ink">The handbook is empty</h1>
          <div className="mx-auto mt-3 h-0.5 w-24 bg-linear-to-r from-transparent via-gold to-transparent" aria-hidden />
          <p className="prose-lore mx-auto mt-4 max-w-[52ch] text-[17px] text-ink/90">Your Dungeon Master hasn't revealed anything yet. You can still read up on the classes and make a character.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to={`${base}/browse/peoples?tab=classes`} className="btn min-h-10">
              Species and Classes
            </Link>
            <Link to={`${base}/builder`} className="btn-primary min-h-10">
              Make a character
            </Link>
          </div>
        </div>
      </div>
    );
  // A card for each realm, world and continent; a domain's entries count towards the realm that holds it.
  const realms = realmList.list
    .filter((r) => !r.archived && r.kind !== 'domain' && r.kind !== 'region_group')
    .map((r) => {
      const here = entities.filter((e) => inRealm(e, r.id));
      const intro = here.find((e) => e.realm === r.id && handbookTypesWith('intro').includes(e.type));
      return { realm: r, key: r.id, label: r.name, n: here.length, line: intro ? previewText(intro.summary || '') : '' };
    })
    .filter((r) => r.n);
  const kinds = [...PLAYER_GROUPS, OTHER_GROUP].map((g) => ({ g, n: entities.filter((e) => groupOf(e.type).key === g.key).length })).filter((x) => x.n);
  const quests = (campaigns ?? []).flatMap((c) => c.quests.filter((x) => OPEN_QUEST.includes(x.status)));
  const recaps = (campaigns ?? []).flatMap((c) => c.recaps).sort((a, b) => b.number - a.number);
  const latest = recaps[0];
  const overview = entities.find((e) => e.type === 'world');
  const date = (campaigns ?? []).find((c) => c.current_date)?.current_date;
  const search = (
    <form
      role="search"
      className="hidden sm:block w-full sm:w-88"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (q.trim()) void nav(`${base}/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="group flex w-full items-center gap-3 rounded-md border border-edge/60 bg-raised px-4 min-h-[48px] shadow-xs focus-within:border-gold/70 hover:border-gold/70 transition-colors">
        <Search size={18} className="text-gold shrink-0" aria-hidden />
        <input
          className="flex-1 min-w-0 bg-transparent outline-hidden text-[15px] placeholder:text-dim"
          placeholder="Search people, places, lore…"
          aria-label="Search the handbook"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
        />
      </label>
    </form>
  );

  const startHere = overview && (
    <Link to={entryHref(base, overview.id)} data-peek={overview.id} className="group block">
      <div className="section-title flex items-center gap-2">
        <BookOpen size={14} /> Start here
      </div>
      <div className="mt-2 font-display text-2xl text-ink group-hover:text-gold leading-tight">{overview.name}</div>
      {previewText(overview.summary) && <p className="prose-lore mt-2 text-[16px] leading-relaxed text-ink/90 line-clamp-4 max-w-[72ch]">{previewText(overview.summary)}</p>}
      <span className="mt-3 inline-flex items-center gap-1 text-sm text-arcane group-hover:text-gold">
        An overview of the world <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );

  return (
    <div className="space-y-7">
      <PlayerPageTitle
        featured
        eyebrow="Player Handbook"
        title={info?.appName ?? 'The Player Handbook'}
        subtitle={
          <div className="space-y-1.5">
            <p className="prose-lore text-[17px] text-ink/90 my-0">What your party knows about the world.</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {date && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-gold/80" aria-hidden /> <span className="text-ink">{date}</span>
                </span>
              )}
              <span className="num">{plural(entities.length, 'entry', 'entries')} known</span>
              {info?.publishedAt && <span>Updated {new Date(info.publishedAt).toLocaleDateString()}</span>}
            </p>
          </div>
        }
        aside={search}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card featured className="lg:col-span-2 px-5 py-5 sm:px-6">
          {latest ? (
            <Link to={`${base}/recaps`} className="group block">
              <div className="section-title flex items-center gap-2">
                <Feather size={14} /> Last time
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-2xl text-ink group-hover:text-gold leading-tight">
                  Session <span className="num">{latest.number}</span>
                  {latest.title ? `: ${latest.title}` : ''}
                </span>
                {latest.played_on && <span className="text-xs text-dim num">{latest.played_on}</span>}
              </div>
              <p className="prose-lore mt-2 text-[16px] leading-relaxed text-ink/90 line-clamp-5 max-w-[72ch]">{previewText(latest.recap) || 'No recap written yet.'}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm text-arcane group-hover:text-gold">
                Read the session recaps <ArrowRight size={14} />
              </span>
            </Link>
          ) : (
            (startHere ?? <Empty compact title="No session recaps yet." />)
          )}
          {latest && overview && (
            <Link to={entryHref(base, overview.id)} data-peek={overview.id} className="group mt-5 flex items-start gap-3 border-t border-line/70 pt-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/10 text-gold" aria-hidden>
                <BookOpen size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-ink group-hover:text-gold">New here? Start with {overview.name}</span>
                {previewText(overview.summary) && <span className="text-[13px] text-dim line-clamp-2 mt-0.5 max-w-[72ch]">{previewText(overview.summary)}</span>}
              </span>
            </Link>
          )}
        </Card>
        <Card
          title="Open quests"
          icon={<ListChecks size={15} />}
          aside={quests.length ? <span className="num">{quests.length}</span> : undefined}
          actions={
            quests.length ? (
              <Link to={`${base}/quests`} className="btn-ghost text-xs">
                All quests
              </Link>
            ) : undefined
          }
        >
          {quests.length ? (
            <ul className="space-y-1">
              {quests.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <Link to={`${base}/quests`} className="flex items-start gap-2 rounded-md -mx-2 px-2 py-2 hover:bg-raised group">
                    <ListChecks size={14} className="text-gold/70 shrink-0 mt-0.5" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink group-hover:text-gold">{x.title}</span>
                      {x.description && <span className="text-xs text-dim line-clamp-2 mt-0.5">{previewText(x.description)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty compact title="No quests shared yet." />
          )}
        </Card>
      </div>

      {realms.length > 0 && (
        <section aria-labelledby="home-realms">
          <h2 id="home-realms" className="title-rule text-lg mb-3">
            Worlds &amp; Realms
          </h2>
          <div className={`grid gap-4 sm:grid-cols-2 ${realms.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
            {realms.map((r) => {
              const s = realmStyle(r.realm);
              return (
                <Link
                  key={r.key}
                  to={`${base}/realm/${r.key}`}
                  className={`${s.cls} group panel elev-1 relative overflow-hidden flex flex-col bg-linear-to-b ${s.wash} to-transparent ${s.ring} transition-colors`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${s.rule}`} aria-hidden />
                  <div className="flex items-start gap-3 px-4 pt-5">
                    <span className={`mt-0.5 shrink-0 ${s.text}`} aria-hidden>
                      {s.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-lg leading-tight ${s.text}`}>{r.label}</h3>
                      <div className="text-xs text-dim mt-0.5">
                        <span className="num text-ink">{r.n}</span> {r.n === 1 ? 'entry' : 'entries'}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pt-2 pb-4">
                    <p className="prose-lore my-0 text-[15px] leading-snug text-ink/90 line-clamp-4">{r.line || 'What your party has learned of it.'}</p>
                  </div>
                  <span className={`mt-auto flex items-center gap-1 border-t border-line/70 px-4 py-2.5 text-xs ${s.text}`}>
                    Explore <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="home-kinds">
        <h2 id="home-kinds" className="title-rule text-lg mb-3">
          Browse by kind
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {kinds.map(({ g, n }) => (
            <Link key={g.key} to={`${base}/browse/${g.key}`} className="group panel elev-1 flex items-center gap-3 px-3.5 py-3 min-h-[56px] hover:border-gold/60 transition-colors">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/10 text-gold" aria-hidden>
                {GROUP_ICONS[g.key] ?? GROUP_ICONS.other}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-ink group-hover:text-gold leading-snug">{g.label}</span>
                <span className="block text-xs text-dim num">{n}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {!!maps?.length && (
        <section aria-labelledby="home-maps">
          <h2 id="home-maps" className="title-rule text-lg mb-3">
            Maps
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {maps.map((m) => (
              <Link key={m.id} to={`${base}/maps/${m.id}`} className="group panel elev-1 flex items-center gap-3 px-4 py-3.5 hover:border-gold/60 transition-colors">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/10 text-gold" aria-hidden>
                  <MapIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] text-ink group-hover:text-gold leading-snug">{m.name}</span>
                  <span className="block text-xs text-dim">
                    <span className="num">{m.markers.length}</span> {m.markers.length === 1 ? 'place' : 'places'} marked
                  </span>
                </span>
                <ArrowRight size={15} className="text-dim group-hover:text-gold shrink-0" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Whether an entry belongs to a realm: its own, or any continent it's found on (a people of both continents counts for each). */
const inRealm = (e: PEntity, realm: string) => e.realm === realm || !!e.realms?.includes(realm);

// ------------------------------------------------------------------ Browse by category
export function PlayerBrowse() {
  const { group = 'all' } = useParams();
  const { entities } = usePlayerIndex();
  // The realm filter belongs to the page it was picked on: switching to another group starts unfiltered, and a realm
  // that group has nothing in is ignored (otherwise a page could show nothing, with no button to clear the filter).
  const [pick, setPick] = useState({ group: '', realm: '' });
  const [q, setQ] = useState('');
  const setRealm = (realm: string) => setPick({ group, realm });
  const g = group === 'all' ? null : [...PLAYER_GROUPS, OTHER_GROUP].find((x) => x.key === group);
  const inGroup = useMemo(() => (entities ?? []).filter((e) => !g || groupOf(e.type).key === g.key), [entities, g]);
  const realmList = useRealms();
  const realmsHere = useMemo(
    () =>
      realmList.list
        .filter((r) => !r.archived)
        .map((r) => ({ key: r.id, label: r.name, n: inGroup.filter((e) => inRealm(e, r.id)).length }))
        .filter((r) => r.n),
    [inGroup, realmList],
  );
  const realm = pick.group === group && realmsHere.some((r) => r.key === pick.realm) ? pick.realm : '';
  const list = useMemo(() => inGroup.filter((e) => (!realm || inRealm(e, realm)) && matches(e, q)).sort(byName), [inGroup, realm, q]);
  if (!entities) return <Loading />;
  if (group === 'peoples') return <SpeciesBuilder entities={entities} />;
  const filtered = !!realm || !!q.trim();
  return (
    <div className="space-y-5">
      <PlayerPageTitle
        eyebrow="Records"
        icon={<BookOpen size={14} />}
        title={g?.label ?? 'All Lore'}
        subtitle={
          <span className="num">
            {filtered ? `${list.length.toLocaleString('en')} of ${plural(inGroup.length, 'entry', 'entries')}` : plural(inGroup.length, 'entry', 'entries')}
            {g ? '' : ' your party knows of'}
          </span>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        {realmsHere.length > 1 && (
          <FilterChips
            label="Realm"
            value={realm}
            onChange={setRealm}
            options={[{ value: '', label: 'Everywhere', n: inGroup.length }, ...realmsHere.map((r) => ({ value: r.key, label: r.label, n: r.n }))]}
          />
        )}
        {inGroup.length > 12 && (
          <div className="sm:ml-auto w-full sm:w-auto">
            <QuickFilter value={q} onChange={setQ} label={`Filter ${g ? g.label.toLowerCase() : 'entries'}`} />
          </div>
        )}
      </div>
      <EntryGrid
        list={list}
        empty={
          <Empty
            title={filtered ? 'Nothing matches.' : 'Nothing here yet.'}
            action={
              filtered ? (
                <button
                  className="btn"
                  onClick={() => {
                    setQ('');
                    setRealm('');
                  }}
                >
                  Clear the filters
                </button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ Realm page
export function PlayerRealm() {
  const { realm = '' } = useParams();
  const { entities } = usePlayerIndex();
  const { base } = usePlayer();
  const [kind, setKind] = useState({ realm: '', key: '' });
  const info = useRealms().get(realm);
  if (!entities) return <Loading />;
  const label = info.name;
  const here = entities.filter((e) => inRealm(e, realm));
  const intro = here.find((e) => handbookTypesWith('intro').includes(e.type));
  const groups = [...PLAYER_GROUPS, OTHER_GROUP].map((g) => ({ g, list: here.filter((e) => e !== intro && groupOf(e.type).key === g.key).sort(byName) })).filter((x) => x.list.length);
  const on = kind.realm === realm && groups.some((x) => x.g.key === kind.key) ? kind.key : '';
  const s = realmStyle(info);
  return (
    <div className="space-y-6">
      <PlayerPageTitle
        eyebrow={REALM_KIND_LABELS[info.kind]}
        icon={<span className={`${s.cls} ${s.text}`}>{s.icon}</span>}
        title={label}
        subtitle={<span className="num">{plural(here.length, 'entry', 'entries')} your party knows of</span>}
        featured
      />
      {intro && (
        <Card className={`${s.cls} relative overflow-hidden bg-linear-to-b ${s.wash} to-transparent px-5 py-5 sm:px-7`}>
          <span className={`absolute inset-x-0 top-0 h-1 ${s.rule}`} aria-hidden />
          <div className="max-w-[72ch]">{intro.summary ? <Md text={intro.summary} className="prose-lore text-[17px]" /> : intro.sections?.[0] && <Md text={intro.sections[0].content} />}</div>
          <Link to={entryHref(base, intro.id)} data-peek={intro.id} className="mt-3 inline-flex items-center gap-1 text-sm text-arcane hover:text-gold">
            Read more about {intro.name} <ArrowRight size={13} />
          </Link>
        </Card>
      )}
      {groups.length > 1 && (
        <FilterChips
          label="Kind"
          value={on}
          onChange={(key) => setKind({ realm, key })}
          options={[{ value: '', label: 'Everything', n: groups.reduce((n, x) => n + x.list.length, 0) }, ...groups.map(({ g, list }) => ({ value: g.key, label: g.label, n: list.length }))]}
        />
      )}
      {groups
        .filter((x) => !on || x.g.key === on)
        .map(({ g, list }) => (
          <section key={g.key} aria-labelledby={`realm-${g.key}`}>
            <h2 id={`realm-${g.key}`} className="title-rule text-lg mb-3 flex items-baseline gap-2">
              {g.label} <span className="text-xs text-dim font-sans num tracking-normal">{list.length}</span>
            </h2>
            <EntryGrid list={list} realm={false} />
          </section>
        ))}
      {!groups.length && !intro && <Empty title="Nothing known here yet." />}
    </div>
  );
}

// ------------------------------------------------------------------ Entry
const slug = (s: string) =>
  'sec-' +
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function PlayerEntry() {
  const { id = '' } = useParams();
  const { source, base } = usePlayer();
  const { byId, maps, entities } = usePlayerIndex();
  const { data, error } = usePlayerData<PEntity | null>(() => source.entity(id), id);
  const realmList = useRealms();
  if (error || data === null)
    return (
      <Empty
        title="This entry is not known to you."
        action={
          <Link to={base || '/'} className="btn">
            Back to the handbook
          </Link>
        }
      >
        Your Dungeon Master may not have revealed it yet.
      </Empty>
    );
  if (!data) return <Loading />;
  const text = [data.summary, ...(data.facts ?? []), ...(data.sections ?? []).map((s) => s.content)].join('\n');
  const mentioned = linkedIds(text)
    .filter((x) => x !== data.id)
    .map((x) => byId.get(x))
    .filter((x): x is PEntity => !!x);
  const needle = `](/player/e/${encodeURIComponent(data.id)})`;
  const mentionedIn = (entities ?? []).filter((e) => e.id !== data.id && !mentioned.includes(e) && (e.summary?.includes(needle) || e.summary?.includes(`](/player/e/${data.id})`))).slice(0, 8);
  const g = groupOf(data.type);
  const pinMap = maps?.find((mp) => mp.markers.some((mk) => mk.entity_id === data.id));
  const onMap = pinMap ? { map: pinMap.id, name: pinMap.name } : null;
  const realms = data.realms?.length ? data.realms : [data.realm];
  const realmLabel = (r: string) => (r === data.realm ? data.realmLabel : realmList.name(r));
  const sections = data.sections ?? [];
  const mapButton = onMap && (
    <Link to={`${base}/maps/${onMap.map}?place=${encodeURIComponent(data.id)}`} className="btn-primary min-h-[40px] justify-center">
      <MapPin size={15} /> Show on the map
    </Link>
  );
  const linkList = (list: PEntity[]) => (
    <ul className="space-y-0.5">
      {list.map((m) => (
        <li key={m.id}>
          <Link to={entryHref(base, m.id)} data-peek={m.id} className="group flex items-center gap-2 rounded-md -mx-2 px-2 py-1.5 min-h-[40px] sm:min-h-0 hover:bg-raised">
            <span className="min-w-0 flex-1 text-sm text-arcane group-hover:text-gold truncate">{m.name}</span>
            <span className="text-[11px] text-dim shrink-0">{m.typeLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-4">
      <header className="title-band gilt-corners elev-1 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-dim mb-1.5">
              <Link to={base || '/'} className="hover:text-gold">
                Handbook
              </Link>
              <ChevronRight size={12} aria-hidden className="opacity-60" />
              <Link to={`${base}/browse/${g.key}`} className="hover:text-gold">
                {g.label}
              </Link>
              <ChevronRight size={12} aria-hidden className="opacity-60" />
              <Link to={`${base}/realm/${data.realm}`} className="hover:text-gold">
                {data.realmLabel}
              </Link>
            </nav>
            <h1 className="illuminated font-display text-[26px] sm:text-[32px] leading-tight text-ink wrap-break-word">{data.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <Badge>{data.typeLabel}</Badge>
              {realms.map((r) => (
                <RealmBadge key={r} realm={r} label={realmLabel(r)} />
              ))}
            </div>
          </div>
          {mapButton && <div className="shrink-0 w-full sm:w-auto flex">{mapButton}</div>}
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <article className="panel elev-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8" aria-label="Lore">
          <div className="mx-auto max-w-[72ch]">
            {data.summary && <Md text={data.summary} className="prose-lore text-[18px] [&>p:first-child]:mt-0 [&>blockquote:first-child]:mt-0" />}
            {!!data.facts?.length && (
              <section id="learned" className="scroll-mt-4 mt-6">
                <h2 className="font-display text-[20px] text-gold mb-2">What you have learned</h2>
                <ul className="space-y-1.5">
                  {data.facts.map((f, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rotate-45 bg-gold/70" aria-hidden />
                      <Md text={f} className="prose-lore min-w-0 [&_p]:my-0" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {sections.map((s, i) => (
              <section key={s.heading} id={slug(s.heading)} className={`scroll-mt-4 ${i > 0 || data.summary || data.facts?.length ? 'mt-6' : ''}`}>
                <Md text={`## ${s.heading}\n\n${s.content}`} className="prose-lore [&>h2:first-child]:mt-0" />
              </section>
            ))}
            {!data.summary && !data.facts?.length && !sections.length && <p className="prose-lore text-dim italic my-0">You know of this, but little more.</p>}
          </div>
        </article>
        <aside className="space-y-4 min-w-0" aria-label="About this entry">
          <section className="parchment px-4 py-3.5 text-sm" aria-label="At a glance">
            <h2 className="font-display text-[11px] tracking-[0.2em] uppercase opacity-70 mb-2">At a glance</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wider opacity-60">Kind</dt>
                <dd className="font-serif text-[15px]">{data.typeLabel}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider opacity-60">Where</dt>
                <dd className="font-serif text-[15px]">{realms.map(realmLabel).join(', ')}</dd>
              </div>
              {onMap && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wider opacity-60">On the map</dt>
                  <dd className="font-serif text-[15px]">{onMap.name}</dd>
                </div>
              )}
            </dl>
            {(sections.length > 0 || !!data.facts?.length) && (
              <nav aria-label="On this page" className="mt-3 border-t border-gold/30 pt-2.5">
                <div className="text-[11px] uppercase tracking-wider opacity-60 mb-1">On this page</div>
                <ul className="font-serif text-[15px] space-y-0.5">
                  {[...(data.facts?.length ? [{ a: 'learned', h: 'What you have learned' }] : []), ...sections.map((s) => ({ a: slug(s.heading), h: s.heading }))].map((x) => (
                    <li key={x.a}>
                      <a
                        href={`#${x.a}`}
                        className="block py-1 sm:py-0.5 hover:underline"
                        onClick={(ev) => {
                          ev.preventDefault();
                          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                          document.getElementById(x.a)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
                        }}
                      >
                        {x.h}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </section>
          {mentioned.length > 0 && (
            <Card title="Connections" aside={<span className="num">{mentioned.length}</span>}>
              {linkList(mentioned)}
            </Card>
          )}
          {mentionedIn.length > 0 && <Card title="Mentioned in">{linkList(mentionedIn)}</Card>}
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Search
export function PlayerSearch() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const { source, base } = usePlayer();
  const { data } = usePlayerData<PEntity[]>(() => source.search(q), `q:${q}`);
  const [kind, setKind] = useState({ q: '', key: '' });
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data ?? []) m.set(groupOf(e.type).key, (m.get(groupOf(e.type).key) ?? 0) + 1);
    return [...PLAYER_GROUPS, OTHER_GROUP].filter((g) => m.has(g.key)).map((g) => ({ g, n: m.get(g.key)! }));
  }, [data]);
  const on = kind.q === q && groups.some((x) => x.g.key === kind.key) ? kind.key : '';
  const list = useMemo(() => [...(data ?? [])].filter((e) => !on || groupOf(e.type).key === on).sort(byName), [data, on]);
  return (
    <div className="space-y-5">
      <PlayerPageTitle eyebrow="Search" icon={<Search size={14} />} title={q ? `“${q}”` : 'Search'} subtitle={data ? <span className="num">{plural(data.length, 'result')}</span> : 'Searching…'} />
      {groups.length > 1 && (
        <FilterChips
          label="Kind"
          value={on}
          onChange={(key) => setKind({ q, key })}
          options={[{ value: '', label: 'Everything', n: data?.length }, ...groups.map(({ g, n }) => ({ value: g.key, label: g.label, n }))]}
        />
      )}
      {!data ? (
        <Loading label="Searching…" />
      ) : (
        <EntryGrid
          list={list}
          empty={
            <Empty
              icon={<Search size={22} />}
              title={q ? `Nothing you know matches “${q}”.` : 'Type in the search box to look through the handbook.'}
              action={
                <Link to={`${base}/browse/all`} className="btn">
                  <BookOpen size={14} /> Browse all lore
                </Link>
              }
            >
              Try a shorter word, or another spelling.
            </Empty>
          }
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Quests and recaps
export function PlayerQuests() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return <Loading />;
  const all = campaigns.flatMap((c) => c.quests.map((q) => ({ ...q, campaign: c.title })));
  const open = all.filter((q) => OPEN_QUEST.includes(q.status));
  const done = all.filter((q) => !OPEN_QUEST.includes(q.status));
  const quest = (q: (typeof all)[number]) => (
    <li key={`${q.campaign}-${q.id}`} className={`panel elev-1 px-5 py-4 ${OPEN_QUEST.includes(q.status) ? '' : 'bg-panel/60'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={`text-[17px] leading-snug ${OPEN_QUEST.includes(q.status) ? 'text-ink' : 'text-dim'}`}>{q.title}</h3>
        <QuestStatus status={q.status} />
        {campaigns.length > 1 && <span className="text-xs text-dim ml-auto">{q.campaign}</span>}
      </div>
      {q.description && (
        <div className="mt-1.5 max-w-[72ch]">
          <Md text={q.description} className="prose-lore text-[16px] [&_p]:my-1.5" />
        </div>
      )}
    </li>
  );
  return (
    <div className="space-y-6">
      <PlayerPageTitle
        eyebrow="Campaign"
        icon={<ListChecks size={14} />}
        title="Quests"
        subtitle={all.length ? <span className="num">{`${open.length} open · ${done.length} finished`}</span> : 'What your party has taken on.'}
      />
      {!all.length && <Empty icon={<ListChecks size={22} />} title="No quests shared yet." />}
      {open.length > 0 && (
        <section aria-labelledby="quests-open">
          <h2 id="quests-open" className="title-rule text-lg mb-3">
            Open
          </h2>
          <ul className="grid gap-3 xl:grid-cols-2">{open.map((q) => quest(q))}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="quests-done">
          <h2 id="quests-done" className="title-rule text-lg mb-3">
            Finished
          </h2>
          <ul className="grid gap-3 xl:grid-cols-2">{done.map((q) => quest(q))}</ul>
        </section>
      )}
    </div>
  );
}

// A handbook published before ladders came from setting packs (v0.4.3 and older) had the Worldkeeper setting's.
const OLD_LADDER = ['Hostile', 'Distrusted', 'Neutral', 'Initiate', 'Trusted', 'Exalted', 'Champion'];
/** A rank's colour by its step from neutral: below, danger; neutral, plain; above, gold. */
const rankTone = (step: number, found: boolean): Tone => (!found || step === 0 ? 'dim' : step < 0 ? 'danger' : 'gold');

/** The party's standing with each faction the GM shares: its rank, how far to the next, and what its ranks bring. */
export function PlayerStanding() {
  const { campaigns } = usePlayerIndex();
  const { base } = usePlayer();
  if (!campaigns) return <Loading />;
  const all = campaigns.flatMap((c) => (c.standing ?? []).map((f) => ({ ...f, campaign: c.title })));
  return (
    <div className="space-y-6">
      <PlayerPageTitle
        eyebrow="Campaign"
        icon={<Scale size={14} />}
        title="Faction Standing"
        subtitle="Your party's Renown with the factions you've dealt with. Each rank you reach brings something, and losing standing closes doors."
      />
      {!all.length && <Empty icon={<Scale size={22} />} title="Nobody has noticed you yet." />}
      <ul className="grid gap-4 xl:grid-cols-2">
        {all.map((f) => {
          const ladder = f.ladder ?? OLD_LADDER;
          const n = ladder.indexOf(f.neutral ?? 'Neutral');
          const at = ladder.indexOf(f.rank);
          return (
            <li key={`${f.campaign}-${f.faction_id}`} className="panel elev-1 px-5 py-4 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link to={entryHref(base, f.faction_id)} data-peek={f.faction_id} className="font-display text-lg text-ink hover:text-gold leading-snug">
                  {f.name}
                </Link>
                <Badge tone={rankTone(at - n, at >= 0)}>{f.rank}</Badge>
                <span className="ml-auto text-sm text-dim">
                  Renown <span className="num text-ink font-medium">{f.renown}</span>
                </span>
              </div>
              {campaigns.length > 1 && <div className="text-xs text-dim -mt-2">{f.campaign}</div>}
              <div>
                <div className="flex gap-1" role="img" aria-label={`${f.rank}, rank ${at + 1} of ${ladder.length}`}>
                  {ladder.map((r, i) => (
                    <span key={r} title={r} className={`h-2 flex-1 rounded-xs ${i === at ? (i < n ? 'bg-danger' : 'bg-gold') : i < at && i > n ? 'bg-gold/45' : 'bg-line'}`} />
                  ))}
                </div>
                <div className="hidden sm:flex gap-1 mt-1 text-[10px] uppercase tracking-wider text-dim" aria-hidden>
                  {ladder.map((r, i) => (
                    <span key={r} className={`flex-1 text-center truncate ${i === at ? 'text-gold font-medium' : ''}`}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              {f.next && (
                <div className="text-xs text-dim">
                  Next: <span className="text-ink">{f.next.name}</span> at Renown <span className="num">{f.next.at}</span>
                </div>
              )}
              {f.earned.length > 0 && (
                <div className="space-y-2 border-t border-line/70 pt-3">
                  {f.earned.map((e) => (
                    <div key={e.rank}>
                      <div className="section-title text-[11px]">{e.rank}</div>
                      <Md text={e.text} className="prose-lore text-[15px] [&_p]:my-1" />
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type TreasureRow = NonNullable<NonNullable<ReturnType<typeof usePlayerIndex>['campaigns']>[number]['treasure']>[number] & { campaign: string };

/** What the party carries or has stored, by who carries it. */
export function PlayerTreasure() {
  const { campaigns } = usePlayerIndex();
  const { base } = usePlayer();
  const mech = useModules();
  if (!campaigns) return <Loading />;
  const all: TreasureRow[] = campaigns.flatMap((c) => (c.treasure ?? []).map((t) => ({ ...t, campaign: c.title })));
  const groups = new Map<string, TreasureRow[]>();
  for (const t of all) groups.set(t.holder || 'The party', [...(groups.get(t.holder || 'The party') ?? []), t]);
  const worth = all.reduce((n, t) => n + t.value_gp, 0);
  const magic = all.filter((t) => t.rarity).length;
  const columns: Column<TreasureRow>[] = [
    {
      key: 'name',
      label: 'Item',
      sortValue: (t) => t.name,
      render: (t) => (
        <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {t.entity_id ? (
            <Link to={entryHref(base, t.entity_id)} data-peek={t.entity_id} className="wk-ref">
              {t.name}
            </Link>
          ) : (
            <span className="text-ink">{t.name}</span>
          )}
          {t.status === 'stored' && <Badge>stored</Badge>}
          {t.fades && mech.has('fading-salvage') && <span className="basis-full text-xs text-danger">Fading: learn its story to anchor it</span>}
        </span>
      ),
    },
    { key: 'quantity', label: 'Qty', num: true, sortValue: (t) => t.quantity, render: (t) => (t.kind === 'coins' ? '' : t.quantity), headClassName: 'w-14' },
    { key: 'rarity', label: 'Rarity', sortValue: (t) => t.rarity, render: (t) => (t.rarity ? <RarityTag rarity={t.rarity} /> : <span className="text-dim">—</span>) },
    { key: 'value', label: 'Value (gp)', num: true, sortValue: (t) => t.value_gp, render: (t) => (t.value_gp ? Math.round(t.value_gp).toLocaleString('en') : <span className="text-dim">—</span>) },
    {
      key: 'found',
      label: 'Found',
      sortValue: (t) => t.found_at,
      render: (t) => <span className="text-dim text-xs">{t.found_at}</span>,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
  ];
  return (
    <div className="space-y-6">
      <PlayerPageTitle
        eyebrow="Campaign"
        icon={<Gem size={14} />}
        title="Party Treasure"
        subtitle={all.length ? 'What your party carries, and what it has stored. Worth is before magic: nobody can price that.' : 'What your party carries, and what it has stored.'}
      >
        {all.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-2 max-w-md">
            {(
              [
                ['Items', all.filter((t) => t.kind !== 'coins').length],
                ['Magic', magic],
                ['Worth (gp)', Math.round(worth).toLocaleString('en')],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-raised/60 px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wider text-dim">{k}</dt>
                <dd className="num text-lg text-ink leading-tight">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </PlayerPageTitle>
      {!all.length && <Empty icon={<Coins size={22} />} title="Your packs are empty." />}
      {[...groups.entries()].map(([who, list]) => (
        <section key={who} className="space-y-3">
          <Card flush title={who} aside={<span className="num">{plural(list.length, 'item')}</span>}>
            <DataTable columns={columns} rows={list} rowKey={(t) => `${t.campaign}-${t.id}`} caption={`Carried by ${who}`} />
          </Card>
          <ItemRulesList names={list.filter((t) => t.kind !== 'coins' && !t.entity_id).map((t) => t.name)} title="What they do" />
        </section>
      ))}
    </div>
  );
}

export function PlayerRecaps() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return <Loading />;
  const all = campaigns.flatMap((c) => c.recaps.map((r) => ({ ...r, campaign: c.title, date: c.current_date }))).sort((a, b) => b.number - a.number);
  return (
    <div className="space-y-6">
      <PlayerPageTitle
        eyebrow="Campaign"
        icon={<Feather size={14} />}
        title="Session Recaps"
        subtitle={all.length ? <span className="num">{plural(all.length, 'session')}, newest first</span> : 'What happened at the table.'}
      />
      {!all.length && <Empty icon={<Feather size={22} />} title="No session recaps yet." />}
      <div className="space-y-4">
        {all.map((r, i) => (
          <Card key={`${r.campaign}-${r.id}`} featured={i === 0} className="px-5 py-5 sm:px-8 sm:py-6">
            <article className="max-w-[72ch] mx-auto">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="section-title">
                  Session <span className="num">{r.number}</span>
                  {i === 0 ? ' · latest' : ''}
                </div>
                <span className="text-xs text-dim num">
                  {r.played_on}
                  {campaigns.length > 1 ? ` · ${r.campaign}` : ''}
                </span>
              </div>
              {r.title && <h2 className="mt-1 text-[22px] text-ink leading-tight">{r.title}</h2>}
              <div className="mt-2 h-px w-16 bg-gold/60" aria-hidden />
              {r.recap ? <Md text={r.recap} className="prose-lore mt-2" /> : <p className="prose-lore text-dim italic">No recap written yet.</p>}
            </article>
          </Card>
        ))}
      </div>
    </div>
  );
}
