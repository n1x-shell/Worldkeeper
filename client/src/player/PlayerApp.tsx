import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import L from 'leaflet';
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, Rectangle, Tooltip } from 'react-leaflet';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Map as MapIcon, ScrollText, Search } from 'lucide-react';
import { api, useApi } from '../lib/api';

/**
 * PLAYER VIEW. This tree only ever calls /api/player/* endpoints, whose responses are built from an
 * allow-list on the server. It never imports DM components or DM API routes.
 */
interface PEntity {
  id: string;
  name: string;
  typeLabel: string;
  realmLabel: string;
  summary: string;
  facts?: string[];
  sections?: { heading: string; content: string }[];
}
interface PMap {
  id: number;
  name: string;
  image_file: string | null;
  width: number;
  height: number;
  parent_map_id: number | null;
  markers: { id: number; label: string; x: number; y: number; entity_id: string | null; child_map_id: number | null }[];
  shapes: { id: number; kind: string; label: string; color: string; points: [number, number][] }[];
}
interface PCampaign {
  id: number;
  title: string;
  current_date: string;
  quests: { id: number; title: string; status: string; description: string }[];
  recaps: { id: number; number: number; title: string; played_on: string; recap: string }[];
}

function Md({ text }: { text: string }) {
  return (
    <div className="prose-lore">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={defaultUrlTransform}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function PlayerApp() {
  const [appName, setAppName] = useState('The Worldkeeper');
  useEffect(() => {
    document.documentElement.classList.add('dark');
    void api.get<{ appName: string }>('/api/player/info').then((i) => {
      setAppName(i.appName);
      document.title = `${i.appName} · Player`;
    });
  }, []);
  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-panel/70 px-4 py-3 flex flex-wrap items-center gap-4">
        <Link to="/player" className="font-display text-gold text-lg">
          {appName} <span className="text-dim text-sm">· Player Handbook</span>
        </Link>
        <nav className="flex gap-3 text-sm">
          <Link to="/player" className="hover:text-gold flex items-center gap-1">
            <BookOpen size={14} /> Lore
          </Link>
          <Link to="/player/maps" className="hover:text-gold flex items-center gap-1">
            <MapIcon size={14} /> Maps
          </Link>
          <Link to="/player/journal" className="hover:text-gold flex items-center gap-1">
            <ScrollText size={14} /> Journal
          </Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-6">
        <Routes>
          <Route index element={<PlayerLore />} />
          <Route path="e/:id" element={<PlayerEntry />} />
          <Route path="maps" element={<PlayerMaps />} />
          <Route path="maps/:id" element={<PlayerMaps />} />
          <Route path="journal" element={<PlayerJournal />} />
        </Routes>
      </main>
    </div>
  );
}

function PlayerLore() {
  const { data } = useApi<PEntity[]>('/api/player/entities');
  const [q, setQ] = useState('');
  const { data: hits } = useApi<PEntity[]>(q.trim() ? `/api/player/search?q=${encodeURIComponent(q)}` : null);
  const groups = useMemo(() => {
    const m = new Map<string, PEntity[]>();
    for (const e of hits ?? data ?? []) m.set(e.realmLabel, [...(m.get(e.realmLabel) ?? []), e]);
    return [...m.entries()];
  }, [data, hits]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 input max-w-lg">
        <Search size={14} className="text-dim" />
        <input className="bg-transparent outline-none flex-1" placeholder="Search what you know…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data && !data.length && <p className="text-dim">Your Dungeon Master has not revealed any lore yet.</p>}
      {groups.map(([realm, list]) => (
        <section key={realm}>
          <h2 className="section-title mb-2">{realm}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {list.map((e) => (
              <Link key={e.id} to={`/player/e/${encodeURIComponent(e.id)}`} className="panel p-3 hover:border-gold/60">
                <div className="font-display text-gold">{e.name}</div>
                <div className="text-xs text-dim">{e.typeLabel}</div>
                {e.summary && <p className="text-sm mt-1 line-clamp-2">{e.summary}</p>}
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
  const { data, error } = useApi<PEntity>(`/api/player/entities/${encodeURIComponent(id)}`);
  if (error) return <p className="text-dim">This entry is not known to you.</p>;
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
              <li key={i}>{f}</li>
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
  const { data } = useApi<PMap[]>('/api/player/maps');
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
          <Link key={x.id} to={`/player/maps/${x.id}`} className={`chip ${x.id === m.id ? 'border-gold text-gold' : 'border-line text-dim'}`}>
            {x.name}
          </Link>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <MapContainer key={m.id} crs={L.CRS.Simple} bounds={bounds} minZoom={-5} maxZoom={4} style={{ height: '70vh' }} attributionControl={false}>
          {m.image_file ? <ImageOverlay url={`/api/player/uploads/${m.image_file}`} bounds={bounds} /> : <Rectangle bounds={bounds} pathOptions={{ color: '#c9a24a', weight: 1, fillOpacity: 0.3 }} />}
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
                  if (mk.child_map_id) location.assign(`/player/maps/${mk.child_map_id}`);
                  else if (mk.entity_id) location.assign(`/player/e/${encodeURIComponent(mk.entity_id)}`);
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
  const { data } = useApi<PCampaign[]>('/api/player/campaigns');
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
