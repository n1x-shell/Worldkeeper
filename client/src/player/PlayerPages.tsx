import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, BookOpen, Feather, ListChecks, Map as MapIcon } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { OTHER_GROUP, PLAYER_GROUPS, PLAYER_REALMS, groupOf, linkedIds, previewText } from './categories';

/** Markdown for players: links to other revealed entries (/player/e/ID from the server) stay inside the handbook. */
export function Md({ text, className = 'prose-lore' }: { text: string; className?: string }) {
  const { base } = usePlayer();
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={defaultUrlTransform}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('/player/') ? (
              <Link to={`${base}${href.slice('/player'.length)}`} className="wk-ref">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="text-arcane underline">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl text-gold">{title}</h1>
      {subtitle && <div className="text-sm text-dim mt-1">{subtitle}</div>}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="chip border-line text-dim">{children}</span>;
}

/** Card grid of entries. */
function EntryGrid({ list }: { list: PEntity[] }) {
  const { base } = usePlayer();
  if (!list.length) return <p className="text-sm text-dim">Nothing here yet.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((e) => (
        <Link key={e.id} to={`${base}/e/${encodeURIComponent(e.id)}`} className="panel p-3 hover:border-gold/60 transition-colors">
          <div className="font-display text-gold">{e.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <Chip>{e.typeLabel}</Chip>
            <Chip>{e.realmLabel}</Chip>
          </div>
          {(() => {
            const preview = previewText(e.summary || e.sections?.[0]?.content || '');
            return preview && <p className="text-sm mt-2 line-clamp-2 text-ink/90">{preview}</p>;
          })()}
        </Link>
      ))}
    </div>
  );
}

// Sort by name, ignoring leading quote marks, so "The Grey Raven" files under T rather than first.
const sortName = (n: string) => n.replace(/^["'“‘\s]+/, '');
const byName = (a: PEntity, b: PEntity) => sortName(a.name).localeCompare(sortName(b.name));

// ------------------------------------------------------------------ Home
export function PlayerHome() {
  const { base } = usePlayer();
  const { entities, campaigns, maps } = usePlayerIndex();
  if (!entities) return null;
  if (!entities.length)
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <h1 className="text-2xl text-gold mb-2">The handbook is empty</h1>
        <p className="text-dim">Your Dungeon Master hasn't revealed anything yet.</p>
      </div>
    );
  const realmCounts = PLAYER_REALMS.map((r) => ({ ...r, n: entities.filter((e) => inRealm(e, r.key)).length })).filter((r) => r.n);
  const quests = (campaigns ?? []).flatMap((c) => c.quests.filter((q) => ['open', 'active'].includes(q.status)));
  const recaps = (campaigns ?? []).flatMap((c) => c.recaps).sort((a, b) => b.number - a.number);
  const overview = entities.find((e) => e.type === 'world');
  return (
    <div className="space-y-6">
      <Header title="Player Handbook" subtitle="What your party knows about the world." />
      {overview && (
        <Link to={`${base}/e/${encodeURIComponent(overview.id)}`} className="panel p-4 block hover:border-gold/60">
          <div className="section-title mb-1">{overview.name}</div>
          <div className="text-sm text-dim flex items-center gap-1">
            Start here: an overview of the world <ArrowRight size={13} />
          </div>
        </Link>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {realmCounts.map((r) => (
          <Link key={r.key} to={`${base}/realm/${r.key}`} className="panel p-4 hover:border-gold/60 transition-colors">
            <div className="font-display text-lg text-gold">{r.label}</div>
            <div className="text-sm text-dim">{r.n} entries</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel-pad">
          <h2 className="section-title flex items-center gap-2 mb-2">
            <BookOpen size={14} /> Browse
          </h2>
          <ul className="space-y-1 text-sm">
            {[...PLAYER_GROUPS, OTHER_GROUP]
              .map((g) => ({ g, n: entities.filter((e) => groupOf(e.type).key === g.key).length }))
              .filter((x) => x.n)
              .map(({ g, n }) => (
                <li key={g.key}>
                  <Link to={`${base}/browse/${g.key}`} className="hover:text-gold">
                    {g.label}
                  </Link>{' '}
                  <span className="text-dim text-xs">{n}</span>
                </li>
              ))}
          </ul>
        </section>
        <section className="panel-pad">
          <h2 className="section-title flex items-center gap-2 mb-2">
            <ListChecks size={14} /> Open quests
          </h2>
          {quests.length ? (
            <ul className="space-y-1 text-sm">
              {quests.slice(0, 8).map((q) => (
                <li key={q.id}>
                  <Link to={`${base}/quests`} className="hover:text-gold">
                    {q.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dim">No quests shared yet.</p>
          )}
        </section>
        <section className="panel-pad">
          <h2 className="section-title flex items-center gap-2 mb-2">
            <Feather size={14} /> Latest session
          </h2>
          {recaps[0] ? (
            <Link to={`${base}/recaps`} className="block text-sm hover:text-gold">
              Session {recaps[0].number}
              {recaps[0].title ? `: ${recaps[0].title}` : ''}
            </Link>
          ) : (
            <p className="text-sm text-dim">No session recaps yet.</p>
          )}
          {!!(maps ?? []).length && (
            <Link to={`${base}/maps`} className="mt-3 btn">
              <MapIcon size={14} /> Maps
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

/** Whether an entry belongs to a realm: its own, or any continent it's found on (a people of both continents counts for each). */
const inRealm = (e: PEntity, realm: string) => e.realm === realm || !!e.realms?.includes(realm);

// ------------------------------------------------------------------ Browse by category
export function PlayerBrowse() {
  const { group = 'all' } = useParams();
  const { entities } = usePlayerIndex();
  const [realm, setRealm] = useState('');
  const g = group === 'all' ? null : [...PLAYER_GROUPS, OTHER_GROUP].find((x) => x.key === group);
  const list = useMemo(() => (entities ?? []).filter((e) => (!g || groupOf(e.type).key === g.key) && (!realm || inRealm(e, realm))).sort(byName), [entities, g, realm]);
  if (!entities) return null;
  const realmsHere = PLAYER_REALMS.filter((r) => (entities ?? []).some((e) => inRealm(e, r.key) && (!g || groupOf(e.type).key === g.key)));
  return (
    <div>
      <Header title={g?.label ?? 'All Lore'} subtitle={`${list.length} ${list.length === 1 ? 'entry' : 'entries'}`} />
      {realmsHere.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button className={`chip ${!realm ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setRealm('')}>
            Everywhere
          </button>
          {realmsHere.map((r) => (
            <button key={r.key} className={`chip ${realm === r.key ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setRealm(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <EntryGrid list={list} />
    </div>
  );
}

// ------------------------------------------------------------------ Realm page
export function PlayerRealm() {
  const { realm = '' } = useParams();
  const { entities } = usePlayerIndex();
  const { base } = usePlayer();
  if (!entities) return null;
  const label = PLAYER_REALMS.find((r) => r.key === realm)?.label ?? realm;
  const here = entities.filter((e) => inRealm(e, realm));
  const intro = here.find((e) => e.type === 'continent' || e.type === 'realm' || e.type === 'world');
  const groups = [...PLAYER_GROUPS, OTHER_GROUP].map((g) => ({ g, list: here.filter((e) => e !== intro && groupOf(e.type).key === g.key).sort(byName) })).filter((x) => x.list.length);
  return (
    <div className="space-y-6">
      <Header title={label} subtitle={`${here.length} entries`} />
      {intro && (
        <div className="panel p-5">
          {intro.summary ? <Md text={intro.summary} /> : intro.sections?.[0] && <Md text={intro.sections[0].content} />}
          <Link to={`${base}/e/${encodeURIComponent(intro.id)}`} className="text-sm text-arcane inline-flex items-center gap-1 mt-2">
            Read more about {intro.name} <ArrowRight size={13} />
          </Link>
        </div>
      )}
      {groups.map(({ g, list }) => (
        <section key={g.key}>
          <h2 className="section-title mb-2">{g.label}</h2>
          <EntryGrid list={list} />
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Entry
export function PlayerEntry() {
  const { id = '' } = useParams();
  const { source, base } = usePlayer();
  const { byId, maps } = usePlayerIndex();
  const { data, error } = usePlayerData<PEntity | null>(() => source.entity(id), id);
  if (error || data === null) return <p className="text-dim">This entry is not known to you.</p>;
  if (!data) return null;
  const text = [data.summary, ...(data.facts ?? []), ...(data.sections ?? []).map((s) => s.content)].join('\n');
  const mentioned = linkedIds(text)
    .filter((x) => x !== data.id)
    .map((x) => byId.get(x))
    .filter((x): x is PEntity => !!x);
  const g = groupOf(data.type);
  const pinMap = maps?.find((mp) => mp.markers.some((mk) => mk.entity_id === data.id));
  const onMap = pinMap ? { map: pinMap.id } : null;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-dim mb-1 flex items-center gap-1">
          <Link to={`${base}/browse/${g.key}`} className="hover:text-gold">
            {g.label}
          </Link>
          <ArrowRight size={11} />
          <Link to={`${base}/realm/${data.realm}`} className="hover:text-gold">
            {data.realmLabel}
          </Link>
        </div>
        <h1 className="text-3xl text-gold">{data.name}</h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip>{data.typeLabel}</Chip>
          <Chip>{data.realmLabel}</Chip>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <article className="panel p-5 min-w-0">
          {data.summary && <Md text={data.summary} />}
          {!!data.facts?.length && (
            <>
              <h2 className="text-lg text-gold/90 mt-4 mb-2 font-display">What you have learned</h2>
              <ul className="list-disc pl-6 font-serif text-[17px]">
                {data.facts.map((f, i) => (
                  <li key={i}>
                    <Md text={f} className="prose-lore [&_p]:my-0" />
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.sections?.map((s) => (
            <Md key={s.heading} text={`## ${s.heading}\n\n${s.content}`} />
          ))}
          {!data.summary && !data.facts?.length && !data.sections?.length && <p className="text-dim">You know of this, but little more.</p>}
        </article>
        <aside className="space-y-3">
          <div className="parchment p-4 text-sm space-y-2">
            <div className="font-display text-xs tracking-widest uppercase opacity-70">At a glance</div>
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-60">Kind</div>
              <div className="font-serif text-[15px]">{data.typeLabel}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-60">Where</div>
              <div className="font-serif text-[15px]">{data.realmLabel}</div>
            </div>
            {!!data.sections?.length && (
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-60">On this page</div>
                <ul className="font-serif text-[15px]">
                  {data.sections.map((s) => (
                    <li key={s.heading}>{s.heading}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {onMap && (
            <Link to={`${base}/maps/${onMap.map}?place=${encodeURIComponent(data.id)}`} className="btn w-full justify-center">
              <MapIcon size={15} /> Show on the map
            </Link>
          )}
          {mentioned.length > 0 && (
            <div className="panel-pad">
              <div className="section-title mb-2">Connections</div>
              <ul className="text-sm space-y-1">
                {mentioned.map((m) => (
                  <li key={m.id}>
                    <Link to={`${base}/e/${encodeURIComponent(m.id)}`} className="text-arcane hover:text-gold">
                      {m.name}
                    </Link>{' '}
                    <span className="text-xs text-dim">{m.typeLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Search
export function PlayerSearch() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const { source } = usePlayer();
  const { data } = usePlayerData<PEntity[]>(() => source.search(q), `q:${q}`);
  return (
    <div>
      <Header title={`Search: ${q}`} subtitle={data ? `${data.length} ${data.length === 1 ? 'result' : 'results'}` : undefined} />
      {data && <EntryGrid list={[...data].sort(byName)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Quests and recaps
export function PlayerQuests() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => c.quests.map((q) => ({ ...q, campaign: c.title })));
  const open = all.filter((q) => ['open', 'active', 'rumoured'].includes(q.status));
  const done = all.filter((q) => !['open', 'active', 'rumoured'].includes(q.status));
  const Quest = ({ q }: { q: (typeof all)[number] }) => (
    <li className="panel p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-gold">{q.title}</span>
        <Chip>{q.status}</Chip>
        {campaigns.length > 1 && <span className="text-xs text-dim">{q.campaign}</span>}
      </div>
      {q.description && <Md text={q.description} />}
    </li>
  );
  return (
    <div className="space-y-5">
      <Header title="Quests" />
      {!all.length && <p className="text-dim">No quests shared yet.</p>}
      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((q) => (
            <Quest key={q.id} q={q} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <h2 className="section-title">Finished</h2>
          <ul className="space-y-2 opacity-80">
            {done.map((q) => (
              <Quest key={q.id} q={q} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const RANK_ORDER = ['Hostile', 'Distrusted', 'Neutral', 'Initiate', 'Trusted', 'Exalted', 'Champion'];

/** The party's standing with each faction the GM shares: its rank, how far to the next, and what its ranks bring. */
export function PlayerStanding() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => (c.standing ?? []).map((f) => ({ ...f, campaign: c.title })));
  return (
    <div className="space-y-5">
      <Header title="Faction Standing" />
      <p className="text-sm text-dim max-w-prose">Your party's Renown with the factions you've dealt with. Each rank you reach brings something, and losing standing closes doors.</p>
      {!all.length && <p className="text-dim">Nobody has noticed you yet.</p>}
      <ul className="space-y-3">
        {all.map((f) => {
          const at = RANK_ORDER.indexOf(f.rank);
          return (
            <li key={`${f.campaign}-${f.faction_id}`} className="panel p-4 space-y-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-gold text-lg">{f.name}</span>
                <Chip>{f.rank}</Chip>
                <span className="text-sm text-dim">Renown {f.renown}</span>
                {campaigns.length > 1 && <span className="text-xs text-dim">{f.campaign}</span>}
              </div>
              <div className="flex gap-1" aria-hidden>
                {RANK_ORDER.map((r, i) => (
                  <span key={r} title={r} className={`h-1.5 flex-1 rounded-full ${i === at ? (i < 2 ? 'bg-danger' : 'bg-gold') : i < at && i > 2 ? 'bg-gold/50' : 'bg-line'}`} />
                ))}
              </div>
              {f.next && (
                <div className="text-xs text-dim">
                  {f.next.name} at Renown {f.next.at}
                </div>
              )}
              {f.earned.map((e) => (
                <div key={e.rank}>
                  <div className="text-xs uppercase tracking-widest text-dim mt-1">{e.rank}</div>
                  <Md text={e.text} />
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What the party carries or has stored, by who carries it. */
export function PlayerTreasure() {
  const { campaigns } = usePlayerIndex();
  const { base } = usePlayer();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => (c.treasure ?? []).map((t) => ({ ...t, campaign: c.title })));
  const groups = new Map<string, typeof all>();
  for (const t of all) groups.set(t.holder || 'The party', [...(groups.get(t.holder || 'The party') ?? []), t]);
  const worth = all.reduce((n, t) => n + t.value_gp, 0);
  return (
    <div className="space-y-5">
      <Header title="Party Treasure" />
      {!all.length && <p className="text-dim">Your packs are empty.</p>}
      {all.length > 0 && <p className="text-sm text-dim">Worth about {Math.round(worth).toLocaleString('en')} gp, before magic.</p>}
      {[...groups.entries()].map(([who, list]) => (
        <section key={who} className="space-y-2">
          <h2 className="section-title">{who}</h2>
          <ul className="panel divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className="px-4 py-2 flex flex-wrap items-baseline gap-2">
                {t.quantity > 1 && t.kind !== 'coins' && <span className="text-dim">{t.quantity} ×</span>}
                {t.entity_id ? (
                  <Link to={`${base}/e/${encodeURIComponent(t.entity_id)}`} className="wk-ref">
                    {t.name}
                  </Link>
                ) : (
                  <span>{t.name}</span>
                )}
                {t.rarity && <Chip>{t.rarity}</Chip>}
                {t.status === 'stored' && <span className="text-xs text-dim">stored</span>}
                {t.fades && <span className="text-xs text-danger">fading: learn its story to anchor it</span>}
                {t.found_at && <span className="text-xs text-dim ml-auto">{t.found_at}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PlayerRecaps() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => c.recaps.map((r) => ({ ...r, campaign: c.title, date: c.current_date }))).sort((a, b) => b.number - a.number);
  return (
    <div className="space-y-4 max-w-3xl">
      <Header title="Session Recaps" />
      {!all.length && <p className="text-dim">No session recaps yet.</p>}
      {all.map((r) => (
        <article key={`${r.campaign}-${r.id}`} className="panel p-5">
          <div className="flex justify-between gap-2 items-baseline">
            <h2 className="font-display text-gold text-lg">
              Session {r.number}
              {r.title ? `: ${r.title}` : ''}
            </h2>
            <span className="text-xs text-dim">{r.played_on}</span>
          </div>
          <Md text={r.recap} />
        </article>
      ))}
    </div>
  );
}
