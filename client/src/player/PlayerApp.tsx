import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, Rectangle, Tooltip } from 'react-leaflet';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Map as MapIcon, ScrollText, Search } from 'lucide-react';
import { apiSource, usePlayerData, type PCampaign, type PEntity, type PMap, type PlayerSource } from './source';

/**
 * PLAYER VIEW. It only reads from a PlayerSource: the live player API or a published snapshot, both of which
 * contain nothing but the server's player-safe projection. It never imports DM components or DM API routes.
 *
 * `base` is the route prefix: '/player' inside the app, '' in the static handbook.
 */
const Ctx = createContext<{ source: PlayerSource; base: string }>({ source: apiSource, base: '/player' });
const usePlayer = () => useContext(Ctx);

function Md({ text }: { text: string }) {
  const { base } = usePlayer();
  return (
    <div className="prose-lore">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={defaultUrlTransform}
        components={{
          // Links to other revealed entries (written as /player/e/ID by the server) stay inside the handbook.
          a: ({ href, children }) =>
            href?.startsWith('/player/') ? (
              <Link to={`${base}${href.slice('/player'.length)}`} className="underline decoration-dotted underline-offset-2">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="underline">
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

export function PlayerApp({ source = apiSource, base = '/player' }: { source?: PlayerSource; base?: string }) {
  const [info, setInfo] = useState<{ appName: string; publishedAt?: string }>({ appName: 'The Worldkeeper' });
  useEffect(() => {
    document.documentElement.classList.add('dark');
    void source.info().then((i) => {
      setInfo(i);
      document.title = `${i.appName} · Player Handbook`;
    });
  }, [source]);
  const home = base || '/';
  return (
    <Ctx.Provider value={{ source, base }}>
      <div className="min-h-full">
        <header className="border-b border-line bg-panel/70 px-4 py-3 flex flex-wrap items-center gap-4">
          <Link to={home} className="font-display text-gold text-lg">
            {info.appName} <span className="text-dim text-sm">· Player Handbook</span>
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link to={home} className="hover:text-gold flex items-center gap-1">
              <BookOpen size={14} /> Lore
            </Link>
            <Link to={`${base}/maps`} className="hover:text-gold flex items-center gap-1">
              <MapIcon size={14} /> Maps
            </Link>
            <Link to={`${base}/journal`} className="hover:text-gold flex items-center gap-1">
              <ScrollText size={14} /> Journal
            </Link>
          </nav>
          {info.publishedAt && <span className="ml-auto text-xs text-dim">Updated {new Date(info.publishedAt).toLocaleDateString()}</span>}
        </header>
        <main className="max-w-5xl mx-auto p-4 md:p-6">
          <Routes>
            <Route index element={<PlayerLore />} />
            <Route path="e/:id" element={<PlayerEntry />} />
            <Route path="maps" element={<PlayerMaps />} />
            <Route path="maps/:id" element={<PlayerMaps />} />
            <Route path="journal" element={<PlayerJournal />} />
            <Route path="*" element={<PlayerLore />} />
          </Routes>
        </main>
      </div>
    </Ctx.Provider>
  );
}

function PlayerLore() {
  const { source, base } = usePlayer();
  const { data } = usePlayerData<PEntity[]>(() => source.entities(), 'all');
  const [q, setQ] = useState('');
  const { data: hits } = usePlayerData<PEntity[]>(() => (q.trim() ? source.search(q) : Promise.resolve([])), `q:${q}`);
  const groups = useMemo(() => {
    const m = new Map<string, PEntity[]>();
    for (const e of q.trim() ? (hits ?? []) : (data ?? [])) m.set(e.realmLabel, [...(m.get(e.realmLabel) ?? []), e]);
    return [...m.entries()];
  }, [data, hits, q]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 input max-w-lg">
        <Search size={14} className="text-dim" />
        <input className="bg-transparent outline-none flex-1" placeholder="Search what you know…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      {data && !data.length && <p className="text-dim">Your Dungeon Master has not revealed any lore yet.</p>}
      {groups.map(([realm, list]) => (
        <section key={realm}>
          <h2 className="section-title mb-2">{realm}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((e) => (
              <Link key={e.id} to={`${base}/e/${encodeURIComponent(e.id)}`} className="panel p-3 hover:border-gold/60">
                <div className="font-display text-gold">{e.name}</div>
                <div className="text-xs text-dim">{e.typeLabel}</div>
                {e.summary && <p className="text-sm mt-1 line-clamp-2">{e.summary.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')}</p>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PlayerEntry() {
  const { id = '' } = useParams();
  const { source } = usePlayer();
  const { data, error } = usePlayerData<PEntity | null>(() => source.entity(id), id);
  if (error || data === null) return <p className="text-dim">This entry is not known to you.</p>;
  if (!data) return null;
  return (
    <article className="parchment p-6">
      <h1 className="text-2xl">{data.name}</h1>
      <div className="text-sm opacity-70 mb-3">
        {data.typeLabel} · {data.realmLabel}
      </div>
      {data.summary && <Md text={data.summary} />}
      {!!data.facts?.length && (
        <>
          <h2 className="text-lg mt-4">What you have learned</h2>
          <ul className="list-disc pl-6 font-serif">
            {data.facts.map((f, i) => (
              <li key={i}>
                <Md text={f} />
              </li>
            ))}
          </ul>
        </>
      )}
      {data.sections?.map((s) => <Md key={s.heading} text={`## ${s.heading}\n\n${s.content}`} />)}
    </article>
  );
}

function PlayerMaps() {
  const { id } = useParams();
  const { source, base } = usePlayer();
  const nav = useNavigate();
  const { data } = usePlayerData<PMap[]>(() => source.maps(), 'maps');
  if (!data) return null;
  if (!data.length) return <p className="text-dim">No maps have been shared yet.</p>;
  const m = data.find((x) => String(x.id) === id) ?? data.find((x) => x.parent_map_id == null) ?? data[0];
  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [m.height, m.width],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {data.map((x) => (
          <Link key={x.id} to={`${base}/maps/${x.id}`} className={`chip ${x.id === m.id ? 'border-gold text-gold' : 'border-line text-dim'}`}>
            {x.name}
          </Link>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <MapContainer key={m.id} crs={L.CRS.Simple} bounds={bounds} minZoom={-5} maxZoom={4} style={{ height: '70vh' }} attributionControl={false}>
          {m.image_file ? <ImageOverlay url={source.imageUrl(m.image_file)} bounds={bounds} /> : <Rectangle bounds={bounds} pathOptions={{ color: '#c9a24a', weight: 1, fillOpacity: 0.3 }} />}
          {m.shapes.map((s) =>
            s.kind === 'region' ? (
              <Polygon key={s.id} positions={s.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: s.color, fillOpacity: 0.12 }}>
                {s.label && <Tooltip sticky>{s.label}</Tooltip>}
              </Polygon>
            ) : (
              <Polyline key={s.id} positions={s.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: s.color }} />
            ),
          )}
          {m.markers.map((mk) => (
            <Marker
              key={mk.id}
              position={[mk.y, mk.x]}
              icon={L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="wk-marker" style="width:14px;height:14px;background:#c9a24a"></div>' })}
              eventHandlers={{
                click: () => {
                  if (mk.child_map_id) nav(`${base}/maps/${mk.child_map_id}`);
                  else if (mk.entity_id) nav(`${base}/e/${encodeURIComponent(mk.entity_id)}`);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {mk.label}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function PlayerJournal() {
  const { source } = usePlayer();
  const { data } = usePlayerData<PCampaign[]>(() => source.campaigns(), 'campaigns');
  if (!data) return null;
  if (!data.length) return <p className="text-dim">No campaign journal yet.</p>;
  return (
    <div className="space-y-6">
      {data.map((c) => (
        <section key={c.id} className="space-y-3">
          <h1 className="text-2xl text-gold">{c.title}</h1>
          <div className="text-sm text-dim">Date: {c.current_date}</div>
          <div className="panel-pad">
            <h2 className="section-title mb-2">Quest journal</h2>
            {c.quests.length ? (
              <ul className="space-y-2">
                {c.quests.map((q) => (
                  <li key={q.id}>
                    <strong>{q.title}</strong> <span className="text-xs text-dim">({q.status})</span>
                    {q.description && <Md text={q.description} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No quests shared.</p>
            )}
          </div>
          {c.recaps.map((r) => (
            <article key={r.id} className="panel p-5">
              <div className="text-xs text-dim">{r.played_on}</div>
              <Md text={r.recap} />
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
