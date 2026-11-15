import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Flag, MapPin, Trash2, X } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { displaySections } from '../lib/sections';
import { Markdown } from '../components/Markdown';
import { ErrorBox, Loading } from '../components/ui';
import { MapView, kindOf, type ViewPin } from '../components/map/MapView';
import { ENTITY_TYPE_LABELS, type Entity, type EntityType } from '../../../shared/domain';

/**
 * The GM's full-screen Atlas: the same map view as the players' handbook, plus the GM's tools. Drag pins to move
 * them, place unplaced locations, choose what players can see, and, for the active campaign, mark places discovered
 * and move the party. Players see fog of war and the party only while a session is live.
 */

interface MapRow {
  id: number;
  name: string;
  parent_map_id: number | null;
  entity_id: string | null;
  image_file: string | null;
  width: number;
  height: number;
}
interface MarkerRow {
  id: number;
  entity_id: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  label: string;
  x: number;
  y: number;
  hidden: boolean;
  child_map_id: number | null;
}
interface ShapeRow {
  id: number;
  kind: string;
  label: string;
  color: string;
  points: [number, number][];
  entity_id: string | null;
  hidden: boolean;
}
interface Detail {
  map: MapRow;
  markers: MarkerRow[];
  shapes: ShapeRow[];
}
interface Exploration {
  campaign_id: number;
  live: boolean;
  discovered: string[];
  trail: { id: number; entity_id: string | null; x: number; y: number; label: string }[];
}
interface Unplaced {
  id: string;
  name: string;
  type: string;
}

function GmCodex({ id, mapId, marker, exploration, onClose, onChange }: { id: string; mapId: number; marker?: MarkerRow; exploration: Exploration | null; onClose: () => void; onChange: (ex?: Exploration) => void }) {
  const { debug } = useAppState();
  const { data } = useApi<{ entity: Entity }>(`/api/entities/${encodeURIComponent(id)}`);
  const [err, setErr] = useState<string | null>(null);
  const e = data?.entity;
  const run = async (f: () => Promise<Exploration | unknown>, isEx = false) => {
    try {
      setErr(null);
      const r = await f();
      onChange(isEx ? (r as Exploration) : undefined);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  if (!e) return <Loading />;
  const discovered = exploration?.discovered.includes(id) ?? false;
  const sections = displaySections(e.body, debug);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-2 p-4 border-b border-line">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-dim">
            {ENTITY_TYPE_LABELS[e.type as EntityType] ?? e.type} · {e.revealed ? 'known to players' : 'GM only'}
          </div>
          <h2 className="font-display text-2xl text-gold leading-tight mt-0.5">{e.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="p-3 border-b border-line flex flex-wrap gap-2">
        {marker && (
          <button type="button" className="btn text-xs" onClick={() => run(() => api.patch(`/api/markers/${marker.id}`, { hidden: !marker.hidden }))}>
            {marker.hidden ? <EyeOff size={13} /> : <Eye size={13} />} {marker.hidden ? 'Hidden from players' : 'Shown to players'}
          </button>
        )}
        {exploration && marker && (
          <>
            <button
              type="button"
              className={`btn text-xs ${discovered ? 'border-gold/70 text-gold' : ''}`}
              onClick={() => run(() => api.post('/api/exploration/discover', { campaign_id: exploration.campaign_id, map_id: mapId, entity_id: id, discovered: !discovered }), true)}
            >
              {discovered ? 'Discovered by the party' : 'Not yet discovered'}
            </button>
            <button type="button" className="btn text-xs" onClick={() => run(() => api.post('/api/exploration/travel', { campaign_id: exploration.campaign_id, map_id: mapId, entity_id: id }), true)}>
              <Flag size={13} /> The party is here
            </button>
          </>
        )}
      </div>
      {err && <p className="text-danger text-xs px-4 pt-2">{err}</p>}
      <div className="flex-1 overflow-y-auto p-4">
        {e.player_summary && (
          <div className="mb-4">
            <div className="section-title mb-1">What players read</div>
            <Markdown text={e.player_summary} />
          </div>
        )}
        {sections.map((s, i) => (
          <div key={i}>
            {s.heading && <h3 className="font-display text-gold/90 mt-3 mb-1">{s.heading}</h3>}
            <Markdown text={s.content} />
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-line">
        <Link to={`/e/${encodeURIComponent(e.id)}`} className="text-sm text-arcane">
          Open its record
        </Link>
      </div>
    </div>
  );
}

export function AtlasExplorer() {
  const { mapId } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { data: mapList, error: listErr } = useApi<MapRow[]>('/api/maps');
  const current = mapId ? Number(mapId) : mapList?.find((m) => m.parent_map_id == null)?.id;
  const { data, reload, setData } = useApi<Detail>(current ? `/api/maps/${current}/detail` : null);
  const { data: status } = useApi<{ active_campaign_id: number | null; in_play: { campaignId: number; sessionId: number } | null }>('/api/exploration/status');
  const { data: ex, reload: reloadEx, setData: setEx } = useApi<Exploration>(current && status?.active_campaign_id ? `/api/exploration?map_id=${current}` : null);
  const { data: unplaced, reload: reloadUnplaced } = useApi<Unplaced[]>(data ? `/api/maps/unplaced${data.map.entity_id ? `?scope=${encodeURIComponent(data.map.entity_id)}` : ''}` : null);
  const [placing, setPlacing] = useState<{ prompt: string; onPlace: (x: number, y: number) => void } | null>(null);
  const [showFog, setShowFog] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const selected = sp.get('place');

  const pins: ViewPin[] = useMemo(
    () =>
      (data?.markers ?? []).map((mk) => ({
        id: mk.id,
        label: mk.label || mk.entity_name || '',
        x: mk.x,
        y: mk.y,
        entity_id: mk.entity_id,
        child_map_id: mk.child_map_id,
        kind: kindOf(mk.entity_type ?? undefined),
        typeLabel: mk.entity_type ? (ENTITY_TYPE_LABELS[mk.entity_type as EntityType] ?? mk.entity_type) : undefined,
        hidden: mk.hidden,
      })),
    [data],
  );
  const exploration = useMemo(() => (ex && showFog ? { discovered: new Set(ex.discovered.map(String)), trail: ex.trail } : null), [ex, showFog]);

  if (listErr) return <ErrorBox error={listErr} />;
  if (!mapList) return <Loading />;
  if (!mapList.length || !current) return <p className="text-dim p-6">There are no maps yet. Add one in the Atlas, or apply the Worldkeeper additions.</p>;
  if (!data) return <Loading />;
  const m = data.map;
  const select = (id: string | null) => {
    const next = new URLSearchParams(sp);
    if (id) next.set('place', id);
    else next.delete('place');
    setSp(next, { replace: true });
  };
  const act = async (f: () => Promise<unknown>) => {
    try {
      setErr(null);
      await f();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const travelTo = (x: number, y: number) =>
    act(async () => {
      const label = window.prompt('Where is the party? (a short name for this spot)', '') ?? '';
      setEx(await api.post<Exploration>('/api/exploration/travel', { map_id: m.id, x, y, label }));
      setPlacing(null);
    });
  const placePin = (u: Unplaced) =>
    setPlacing({
      prompt: `Click the map to place ${u.name}.`,
      onPlace: (x, y) =>
        act(async () => {
          await api.post('/api/markers', { map_id: m.id, entity_id: u.id, label: u.name, x, y, layer: 'Locations', category: 'location', hidden: true });
          setPlacing(null);
          await Promise.all([reload(), reloadUnplaced()]);
          select(u.id);
        }),
    });
  const marker = selected ? data.markers.find((mk) => mk.entity_id === selected) : undefined;
  const live = !!status?.in_play;

  const tools = (
    <div className="border-t border-line px-4 py-3 space-y-3 text-sm">
      <div className="section-title">GM tools</div>
      {err && <p className="text-danger text-xs">{err}</p>}
      {status?.active_campaign_id ? (
        <div className="space-y-2">
          <div className="text-xs text-dim">
            {live ? 'A session is live: players see fog of war and the party now.' : 'No session is live: players see the whole map until one starts.'}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={showFog} onChange={(e) => setShowFog(e.target.checked)} /> Show the party's fog here
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn text-xs" onClick={() => setPlacing({ prompt: 'Click the map where the party is.', onPlace: travelTo })}>
              <Flag size={13} /> Move the party to a point
            </button>
            {!!ex?.trail.length && (
              <button type="button" className="btn text-xs" onClick={() => window.confirm('Clear the whole trail on this map?') && act(async () => setEx(await api.del<Exploration>(`/api/exploration/trail?map_id=${m.id}`)))}>
                Clear the trail
              </button>
            )}
          </div>
          {!!ex?.trail.length && (
            <ol className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {ex.trail.map((t, i) => (
                <li key={t.id} className="flex items-center gap-1">
                  <span className="text-dim w-5">{i + 1}.</span>
                  <span className="flex-1 truncate">{t.label || 'A point on the map'}</span>
                  <button type="button" className="text-dim hover:text-danger p-0.5" aria-label="Remove stop" onClick={() => act(async () => setEx(await api.del<Exploration>(`/api/exploration/travel/${t.id}`)))}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p className="text-xs text-dim">
          Choose an active campaign to track what the party has discovered and where it has been. <Link to="/campaigns" className="text-arcane">Campaigns</Link>
        </p>
      )}
      <div>
        <div className="text-xs text-dim mb-1">Drag a pin to move it. Not on this map yet:</div>
        {unplaced?.length ? (
          <ul className="text-xs space-y-0.5 max-h-48 overflow-y-auto">
            {unplaced.map((u) => (
              <li key={u.id}>
                <button type="button" className="w-full text-left flex items-center gap-1.5 hover:text-gold" onClick={() => placePin(u)}>
                  <MapPin size={12} className="text-dim" /> {u.name} <span className="text-dim">({ENTITY_TYPE_LABELS[u.type as EntityType] ?? u.type})</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dim">Every place here has a pin.</p>
        )}
      </div>
    </div>
  );

  return (
    <MapView
      key={m.id}
      map={{ id: m.id, name: m.name, width: m.width, height: m.height, imageUrl: m.image_file ? `/api/uploads/${m.image_file}` : null }}
      maps={[...mapList].sort((a, b) => a.id - b.id).map((x) => ({ id: x.id, name: x.name }))}
      mapHref={(x) => `/atlas/explore/${x}`}
      back={{ href: `/atlas/${m.id}`, label: 'Atlas' }}
      pins={pins}
      shapes={data.shapes}
      selected={selected}
      onSelect={select}
      onChildMap={(x) => nav(`/atlas/explore/${x}`)}
      codex={
        selected ? (
          <GmCodex
            key={selected}
            id={selected}
            mapId={m.id}
            marker={marker}
            exploration={ex ?? null}
            onClose={() => select(null)}
            onChange={(next) => {
              if (next) setEx(next);
              else void reload();
              void reloadEx();
            }}
          />
        ) : null
      }
      exploration={exploration}
      fog="dim"
      notesKey="gm"
      draggable
      onMovePin={(pin, x, y) =>
        act(async () => {
          setData({ ...data, markers: data.markers.map((mk) => (mk.id === pin.id ? { ...mk, x, y } : mk)) });
          await api.patch(`/api/markers/${pin.id}`, { x, y });
        })
      }
      placing={placing ? { ...placing, onCancel: () => setPlacing(null) } : null}
      legendExtra={tools}
      banner={live ? <span>Live session: players see fog of war and the party.</span> : undefined}
    />
  );
}
