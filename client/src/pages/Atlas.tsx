import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, Rectangle, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { Eye, EyeOff, Layers, Plus, Trash2, Upload, MapPin, Spline, Hexagon, X, ArrowUpLeft } from 'lucide-react';
import { api, qs, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Empty, EntityLink, ErrorBox, Field, Loading, Modal, PageHeader, TypeBadge } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { displaySections } from '../lib/sections';
import { useDebug } from '../components/Dev';
import type { Entity } from '../lib/types';

interface MapRow {
  id: number;
  name: string;
  kind: 'image' | 'abstract';
  parent_map_id: number | null;
  entity_id: string | null;
  image_file: string | null;
  width: number;
  height: number;
  layers: string[];
  player_visible: boolean;
}
interface MarkerRow {
  id: number;
  map_id: number;
  entity_id: string | null;
  entity_name?: string | null;
  label: string;
  x: number;
  y: number;
  category: string;
  layer: string;
  hidden: boolean;
  child_map_id: number | null;
}
interface ShapeRow {
  id: number;
  kind: 'region' | 'route';
  label: string;
  points: [number, number][];
  color: string;
  entity_id: string | null;
  layer: string;
  hidden: boolean;
}
interface Detail {
  map: MapRow;
  markers: MarkerRow[];
  shapes: ShapeRow[];
  children: MapRow[];
}

const CATEGORY_COLORS: Record<string, string> = {
  location: '#c9a24a',
  settlement: '#e0c27a',
  landmark: '#d08a4a',
  vault: '#5fb38a',
  dungeon: '#c0504d',
  portal: '#9a7ce0',
  faction: '#d06a9a',
  label: '#9aa0aa',
};
const CATEGORIES = Object.keys(CATEGORY_COLORS);

function markerIcon(m: MarkerRow, selected: boolean) {
  const color = CATEGORY_COLORS[m.category] ?? '#c9a24a';
  const size = selected ? 18 : 14;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="wk-marker" style="width:${size}px;height:${size}px;background:${color};opacity:${m.hidden ? 0.55 : 1};${selected ? 'box-shadow:0 0 0 3px #fff8;' : ''}${m.hidden ? 'border-style:dashed;' : ''}"></div>`,
  });
}

function ClickHandler({ onClick }: { onClick: (x: number, y: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lng, e.latlng.lat) });
  return null;
}
function FitBounds({ w, h }: { w: number; h: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds([
      [0, 0],
      [h, w],
    ]);
  }, [map, w, h]);
  return null;
}

type Mode = { kind: 'view' } | { kind: 'place'; entityId: string | null; label: string } | { kind: 'draw'; shape: 'region' | 'route'; points: [number, number][] };

export function AtlasPage() {
  const { mapId } = useParams();
  const nav = useNavigate();
  const { data: mapList, reload: reloadMaps, error: listErr } = useApi<MapRow[]>('/api/maps');
  const current = mapId ? Number(mapId) : mapList?.find((m) => m.parent_map_id == null)?.id;
  const { data, reload, error } = useApi<Detail>(current ? `/api/maps/${current}/detail` : null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<MarkerRow | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { reloadIndex } = useAppState();
  useEffect(() => {
    setSelected(null);
    setMode({ kind: 'view' });
  }, [current]);

  if (listErr) return <ErrorBox error={listErr} />;
  if (!mapList) return <Loading />;

  const placeAt = async (x: number, y: number) => {
    if (!data) return;
    try {
      if (mode.kind === 'place') {
        await api.post('/api/markers', { map_id: data.map.id, entity_id: mode.entityId, label: mode.label, x, y, layer: 'Locations', category: 'location', hidden: true });
        setMode({ kind: 'view' });
        void reload();
      } else if (mode.kind === 'draw') setMode({ ...mode, points: [...mode.points, [x, y]] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const ancestors: MapRow[] = [];
  if (data) {
    let p = data.map.parent_map_id;
    while (p) {
      const m = mapList.find((x) => x.id === p);
      if (!m) break;
      ancestors.unshift(m);
      p = m.parent_map_id;
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="World Atlas"
        subtitle="Upload your maps and place locations on them." note="The source gives positions in words, so no coordinates are invented."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New map
          </button>
        }
      />
      {(err || error) && <ErrorBox error={(err ?? error?.message)!} />}
      {!mapList.length ? (
        <Empty title="No maps yet">Create a world map (upload an image) or an abstract diagram, then place locations from the unplaced list. Maps can nest: World → Continent → Region → Settlement → Building.</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[240px_1fr_300px]">
          <MapTree maps={mapList} current={current} onPick={(id) => nav(`/atlas/${id}`)} />
          <div className="panel overflow-hidden min-h-[60vh] relative">
            {!data ? (
              <Loading />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 p-2 border-b border-line text-sm">
                  {ancestors.map((a) => (
                    <Link key={a.id} to={`/atlas/${a.id}`} className="text-dim hover:text-gold">
                      {a.name} ›
                    </Link>
                  ))}
                  <span className="text-gold font-display">{data.map.name}</span>
                  {data.map.entity_id && <EntityLink id={data.map.entity_id} className="text-xs" />}
                  <span className="ml-auto flex gap-1">
                    <button className={mode.kind === 'draw' && mode.shape === 'region' ? 'btn-primary' : 'btn'} onClick={() => setMode({ kind: 'draw', shape: 'region', points: [] })} title="Draw region boundary">
                      <Hexagon size={14} />
                    </button>
                    <button className={mode.kind === 'draw' && mode.shape === 'route' ? 'btn-primary' : 'btn'} onClick={() => setMode({ kind: 'draw', shape: 'route', points: [] })} title="Draw route">
                      <Spline size={14} />
                    </button>
                    <button className={mode.kind === 'place' && !mode.entityId ? 'btn-primary' : 'btn'} onClick={() => setMode({ kind: 'place', entityId: null, label: 'Label' })} title="Add a free label marker">
                      <MapPin size={14} />
                    </button>
                  </span>
                </div>
                {mode.kind !== 'view' && (
                  <div className="absolute z-[1000] top-14 left-1/2 -translate-x-1/2 panel px-3 py-2 text-sm shadow-xl flex items-center gap-2">
                    {mode.kind === 'place' ? `Click the map to place ${mode.label}` : `Click to add points (${mode.points.length})`}
                    {mode.kind === 'draw' && mode.points.length >= 2 && (
                      <ShapeSave
                        mode={mode}
                        mapId={data.map.id}
                        onSaved={() => {
                          setMode({ kind: 'view' });
                          void reload();
                        }}
                      />
                    )}
                    <button className="btn-ghost" onClick={() => setMode({ kind: 'view' })} aria-label="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                )}
                <MapCanvas
                  detail={data}
                  selected={selected}
                  hiddenLayers={hiddenLayers}
                  mode={mode}
                  onClickMap={placeAt}
                  onSelect={setSelected}
                  onMoved={async (m, x, y) => {
                    await api.patch(`/api/markers/${m.id}`, { x, y });
                    void reload();
                  }}
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            {data && (
              <MapSettings
                detail={data}
                hiddenLayers={hiddenLayers}
                setHiddenLayers={setHiddenLayers}
                onChange={() => {
                  void reload();
                  void reloadMaps();
                }}
                onDeleted={() => {
                  void reloadMaps();
                  nav('/atlas');
                }}
                onDeleteShape={async (id) => {
                  await api.del(`/api/shapes/${id}`);
                  void reload();
                }}
              />
            )}
            {selected && data && (
              <MarkerPanel
                marker={selected}
                maps={mapList}
                onClose={() => setSelected(null)}
                onChange={async () => {
                  await reload();
                  setSelected(null);
                }}
              />
            )}
            {data && <Unplaced scope={data.map.entity_id} onPlace={(id, label) => setMode({ kind: 'place', entityId: id, label })} key={data.markers.length} />}
          </div>
        </div>
      )}
      {creating && (
        <NewMapModal
          maps={mapList}
          parent={current ?? null}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void reloadMaps();
            void reloadIndex();
            nav(`/atlas/${id}`);
          }}
        />
      )}
    </div>
  );
}

function MapCanvas({
  detail,
  selected,
  hiddenLayers,
  mode,
  onClickMap,
  onSelect,
  onMoved,
}: {
  detail: Detail;
  selected: MarkerRow | null;
  hiddenLayers: string[];
  mode: Mode;
  onClickMap: (x: number, y: number) => void;
  onSelect: (m: MarkerRow) => void;
  onMoved: (m: MarkerRow, x: number, y: number) => void;
}) {
  const { map } = detail;
  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [map.height, map.width],
  ];
  const nav = useNavigate();
  return (
    <MapContainer key={map.id} crs={L.CRS.Simple} bounds={bounds} minZoom={-5} maxZoom={4} zoomSnap={0.25} style={{ height: '70vh', width: '100%' }} attributionControl={false}>
      <FitBounds w={map.width} h={map.height} />
      {map.image_file ? (
        <ImageOverlay url={`/api/uploads/${map.image_file}`} bounds={bounds} />
      ) : (
        <Rectangle bounds={bounds} pathOptions={{ color: '#c9a24a', weight: 1, fillColor: '#2a2620', fillOpacity: 0.6 }} />
      )}
      <ClickHandler onClick={(x, y) => mode.kind !== 'view' && onClickMap(x, y)} />
      {detail.shapes
        .filter((s) => !hiddenLayers.includes(s.layer))
        .map((s) => {
          const pts = s.points.map(([x, y]) => [y, x] as [number, number]);
          const opts = { color: s.color, weight: 2, dashArray: s.hidden ? '6 6' : undefined, fillOpacity: 0.12 };
          return s.kind === 'region' ? (
            <Polygon key={s.id} positions={pts} pathOptions={opts} eventHandlers={{ click: () => s.entity_id && nav(`/e/${s.entity_id}`) }}>
              {s.label && <Tooltip sticky>{s.label}</Tooltip>}
            </Polygon>
          ) : (
            <Polyline key={s.id} positions={pts} pathOptions={opts}>
              {s.label && <Tooltip sticky>{s.label}</Tooltip>}
            </Polyline>
          );
        })}
      {mode.kind === 'draw' && mode.points.length > 0 && <Polyline positions={mode.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: '#fff', dashArray: '4 4' }} />}
      {detail.markers
        .filter((m) => !hiddenLayers.includes(m.layer))
        .map((m) => (
          <Marker
            key={m.id}
            position={[m.y, m.x]}
            icon={markerIcon(m, selected?.id === m.id)}
            draggable
            eventHandlers={{
              click: () => onSelect(m),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onMoved(m, ll.lng, ll.lat);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent={map.kind === 'abstract'}>
              {m.label || m.entity_name || m.entity_id || 'Marker'}
            </Tooltip>
          </Marker>
        ))}
    </MapContainer>
  );
}

function ShapeSave({ mode, mapId, onSaved }: { mode: Extract<Mode, { kind: 'draw' }>; mapId: number; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  return (
    <>
      <input className="input w-36 py-0.5" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <button
        className="btn-primary"
        onClick={async () => {
          await api.post('/api/shapes', { map_id: mapId, kind: mode.shape, points: mode.points, label, layer: mode.shape === 'region' ? 'Regions' : 'Routes', hidden: true });
          onSaved();
        }}
      >
        Save {mode.shape}
      </button>
    </>
  );
}

function MapTree({ maps, current, onPick }: { maps: MapRow[]; current?: number; onPick: (id: number) => void }) {
  const render = (parent: number | null, depth: number): React.ReactNode =>
    maps
      .filter((m) => m.parent_map_id === parent)
      .map((m) => (
        <div key={m.id}>
          <button onClick={() => onPick(m.id)} className={`w-full text-left px-2 py-1 rounded text-sm hover:bg-raised ${current === m.id ? 'text-gold bg-gold/10' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
            {m.name}
            {!m.player_visible && <EyeOff size={11} className="inline ml-1 text-dim" />}
          </button>
          {render(m.id, depth + 1)}
        </div>
      ));
  return (
    <div className="panel p-2">
      <div className="section-title px-2 py-1">Maps</div>
      {render(null, 0)}
    </div>
  );
}

function MapSettings({
  detail,
  hiddenLayers,
  setHiddenLayers,
  onChange,
  onDeleted,
  onDeleteShape,
}: {
  detail: Detail;
  hiddenLayers: string[];
  setHiddenLayers: (l: string[]) => void;
  onChange: () => void;
  onDeleted: () => void;
  onDeleteShape: (id: number) => void;
}) {
  const m = detail.map;
  const layers = [...new Set([...m.layers, ...detail.markers.map((x) => x.layer), ...detail.shapes.map((s) => s.layer)])];
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="panel-pad space-y-3 text-sm">
      {err && <ErrorBox error={err} />}
      <label className="btn w-full justify-center cursor-pointer">
        <Upload size={14} /> {m.image_file ? 'Replace image' : 'Upload map image'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              await api.upload(`/api/maps/${m.id}/image`, 'image', f);
              onChange();
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={m.player_visible}
          onChange={async (e) => {
            await api.patch(`/api/maps/${m.id}`, { player_visible: e.target.checked });
            onChange();
          }}
        />
        Visible in player view
      </label>
      <div>
        <div className="label flex items-center gap-1">
          <Layers size={12} /> Layers
        </div>
        {layers.map((l) => (
          <label key={l} className="flex items-center gap-2">
            <input type="checkbox" checked={!hiddenLayers.includes(l)} onChange={(e) => setHiddenLayers(e.target.checked ? hiddenLayers.filter((x) => x !== l) : [...hiddenLayers, l])} />
            {l}
          </label>
        ))}
      </div>
      {detail.children.length > 0 && (
        <div>
          <div className="label">Local maps</div>
          {detail.children.map((c) => (
            <Link key={c.id} to={`/atlas/${c.id}`} className="block text-arcane">
              {c.name}
            </Link>
          ))}
        </div>
      )}
      {detail.shapes.length > 0 && (
        <div>
          <div className="label">Regions and routes</div>
          {detail.shapes.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1 truncate">
                {s.label || s.kind} {s.hidden && <span className="text-dim text-xs">(DM)</span>}
              </span>
              <button
                className="btn-ghost"
                title={s.hidden ? 'Show to players' : 'Hide from players'}
                onClick={async () => {
                  await api.patch(`/api/shapes/${s.id}`, { hidden: !s.hidden });
                  onChange();
                }}
              >
                {s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button className="btn-ghost" onClick={() => onDeleteShape(s.id)} aria-label="Delete shape">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        className="btn-danger w-full justify-center"
        onClick={async () => {
          if (!confirm(`Delete map "${m.name}" and its markers? Encyclopedia records are not affected.`)) return;
          await api.del(`/api/maps/${m.id}`);
          onDeleted();
        }}
      >
        <Trash2 size={14} /> Delete map
      </button>
    </div>
  );
}

function MarkerPanel({ marker, maps, onClose, onChange }: { marker: MarkerRow; maps: MapRow[]; onClose: () => void; onChange: () => void }) {
  const { data } = useApi<{ entity: Entity }>(marker.entity_id ? `/api/entities/${encodeURIComponent(marker.entity_id)}` : null);
  const [label, setLabel] = useState(marker.label);
  const nav = useNavigate();
  const save = (p: Partial<MarkerRow>) => api.patch(`/api/markers/${marker.id}`, p).then(onChange);
  const debug = useDebug();
  const overview = data ? displaySections(data.entity.body, debug).find((s) => s.content && !s.secret) : null;
  return (
    <div className="panel-pad space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="section-title">Marker</div>
        <button className="btn-ghost" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      {data && (
        <div>
          <Link to={`/e/${data.entity.id}`} className="text-lg font-display text-gold">
            {data.entity.name}
          </Link>
          <div className="flex gap-1 my-1">
            <TypeBadge type={data.entity.type} />
          </div>
          {overview && <Markdown text={overview.content.slice(0, 600)} className="prose-lore text-[14px]" />}
        </div>
      )}
      <Field label="Label">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== marker.label && save({ label })} />
      </Field>
      <Field label="Linked record">
        <EntityPicker value={marker.entity_id} onChange={(id) => save({ entity_id: id })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select className="input" value={marker.category} onChange={(e) => save({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Layer">
          <input className="input" defaultValue={marker.layer} onBlur={(e) => e.target.value !== marker.layer && save({ layer: e.target.value || 'Locations' })} />
        </Field>
      </div>
      <Field label="Local map (drill-down)">
        <select className="input" value={marker.child_map_id ?? ''} onChange={(e) => save({ child_map_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">None</option>
          {maps
            .filter((m) => m.id !== marker.map_id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        {marker.child_map_id && (
          <button className="btn-primary" onClick={() => nav(`/atlas/${marker.child_map_id}`)}>
            <ArrowUpLeft size={14} /> Open local map
          </button>
        )}
        <button className="btn" onClick={() => save({ hidden: !marker.hidden })}>
          {marker.hidden ? (
            <>
              <EyeOff size={14} /> DM only
            </>
          ) : (
            <>
              <Eye size={14} /> Visible to players
            </>
          )}
        </button>
        <button
          className="btn-danger"
          onClick={async () => {
            await api.del(`/api/markers/${marker.id}`);
            onChange();
          }}
        >
          <Trash2 size={14} /> Remove
        </button>
      </div>
    </div>
  );
}

function Unplaced({ scope, onPlace }: { scope: string | null; onPlace: (id: string, label: string) => void }) {
  const [all, setAll] = useState(!scope);
  const { data } = useApi<{ id: string; name: string; type: string; placement: string[] }[]>(`/api/maps/unplaced${qs({ scope: all ? undefined : scope })}`);
  const [q, setQ] = useState('');
  const rows = useMemo(() => (data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <div className="panel-pad text-sm">
      <div className="section-title mb-1">Unplaced locations ({data?.length ?? '…'})</div>
      <p className="text-xs text-dim mb-2">Where each place is described to be, to help you place it.</p>
      {scope && (
        <label className="flex items-center gap-1 text-xs mb-1">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all realms
        </label>
      )}
      <input className="input mb-2" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-[45vh] overflow-auto space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line/40 pb-1">
            <div className="flex items-center gap-1">
              <EntityLink id={r.id}>{r.name}</EntityLink>
              <button className="btn-ghost ml-auto text-xs" onClick={() => onPlace(r.id, r.name)}>
                <MapPin size={12} /> Place
              </button>
            </div>
            {r.placement.map((p, i) => (
              <div key={i} className="text-[11px] text-dim">
                {p}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewMapModal({ maps, parent, onClose, onCreated }: { maps: MapRow[]; parent: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState({ name: '', kind: 'image', parent_map_id: parent, entity_id: null as string | null });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="New map" onClose={onClose}>
      <div className="space-y-3">
        {err && <ErrorBox error={err} />}
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="image">Geographic map (image)</option>
            <option value="abstract">Abstract diagram (e.g. Ethereal Realm)</option>
          </select>
        </Field>
        <Field label="Parent map">
          <select className="input" value={form.parent_map_id ?? ''} onChange={(e) => setForm({ ...form, parent_map_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None (top level)</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked record (continent, region, settlement…)">
          <EntityPicker value={form.entity_id} onChange={(id) => setForm({ ...form, entity_id: id })} />
        </Field>
        {form.kind === 'image' && (
          <Field label="Image (PNG, JPEG, WEBP, GIF)">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
        <div className="flex justify-end">
          <button
            className="btn-primary"
            disabled={!form.name.trim()}
            onClick={async () => {
              try {
                const m = await api.post<MapRow>('/api/maps', form);
                if (file) await api.upload(`/api/maps/${m.id}/image`, 'image', file);
                onCreated(m.id);
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            Create map
          </button>
        </div>
      </div>
    </Modal>
  );
}
