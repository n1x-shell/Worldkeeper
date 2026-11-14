import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, Rectangle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Eye, EyeOff, Layers, X } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import type { PEntity, PMap } from './source';

/**
 * The full-screen map explorer: the map fills the window; a legend slides out on the left and a codex page on the
 * right. Pins show more detail as you zoom in. Only player-safe data reaches it (the same projection as the rest of
 * the handbook).
 */

type Kind = 'region' | 'settlement' | 'landmark' | 'fortress' | 'vault' | 'other';
const KINDS: { key: Kind | 'routes'; label: string }[] = [
  { key: 'region', label: 'Lands and regions' },
  { key: 'settlement', label: 'Towns and villages' },
  { key: 'landmark', label: 'Landmarks and ruins' },
  { key: 'fortress', label: 'Fortresses and halls' },
  { key: 'vault', label: 'Vaults' },
  { key: 'other', label: 'Other places' },
  { key: 'routes', label: 'Routes' },
];
const kindOf = (type: string | undefined): Kind =>
  type === 'continent' || type === 'realm' || type === 'region' || type === 'world' || type === 'ethereal_domain'
    ? 'region'
    : type === 'settlement'
      ? 'settlement'
      : type === 'landmark'
        ? 'landmark'
        : type === 'building'
          ? 'fortress'
          : type === 'vault'
            ? 'vault'
            : 'other';
/** How far past "whole map in view" you must zoom before a kind of pin appears. */
const SHOW_FROM: Record<Kind, number> = { region: -9, settlement: -9, landmark: -9, fortress: 0.5, vault: 0.5, other: -9 };

const GLYPH: Record<Kind, string> = {
  region: '<path d="M12 3l6 9-6 9-6-9z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  settlement: '<path d="M5 20V11l7-6 7 6v9h-5v-5h-4v5z" fill="currentColor"/>',
  landmark: '<path d="M4 20l6-12 3 5 2-3 5 10z" fill="currentColor"/>',
  fortress: '<path d="M5 20V8h2v2h2V8h2v2h2V8h2v2h2V8h2v12z" fill="currentColor"/>',
  vault: '<path d="M6 20V11a6 6 0 0112 0v9zM10 20v-5a2 2 0 014 0v5" fill="currentColor"/>',
  other: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
};
const icon = (kind: Kind, active: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="wk-pin wk-pin-k-${kind}${active ? ' wk-pin-active' : ''}${kind === 'region' ? ' wk-pin-region' : ''}"><svg viewBox="0 0 24 24" width="16" height="16">${GLYPH[kind]}</svg></div>`,
  });

/** Point a pin's name card away from the nearest screen edge (top by default; below near the top; sideways near the sides). */
function placeTip(marker: L.Marker) {
  const tip = marker.getTooltip();
  const map = (marker as unknown as { _map?: L.Map })._map;
  if (!tip || !map) return;
  const pt = map.latLngToContainerPoint(marker.getLatLng());
  const size = map.getSize();
  const dir = pt.y < 110 ? 'bottom' : pt.x < 140 ? 'right' : pt.x > size.x - 140 ? 'left' : 'top';
  tip.options.direction = dir;
  tip.options.offset = L.point(dir === 'top' ? [0, -12] : dir === 'bottom' ? [0, 12] : dir === 'left' ? [-12, 0] : [12, 0]);
}

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* preference only */
  }
};

/** Opens with the map covering the whole window, keeps it there, and reports how far the reader has zoomed in past that. */
function Viewport({ bounds, onZoom, focus }: { bounds: L.LatLngBoundsExpression; onZoom: (rel: number) => void; focus: { at: [number, number]; n: number; map: number } | null }) {
  const map = useMap();
  const fit = useRef(0);
  useEffect(() => {
    const b = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
    const cover = () => {
      const z = map.getBoundsZoom(b, true);
      fit.current = z;
      map.setMinZoom(z);
      return z;
    };
    map.setMaxBounds(b);
    map.options.maxBoundsViscosity = 1;
    map.setView(b.getCenter(), cover(), { animate: false });
    onZoom(0);
    const r = () => {
      map.invalidateSize();
      cover();
      onZoom(map.getZoom() - fit.current);
    };
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useEffect(() => {
    if (!focus) return;
    const z = Math.min(Math.max(map.getZoom(), fit.current + 1), map.getMaxZoom());
    // With the codex open beside it on a wide screen, centre the place in the space left of the panel.
    const shift = window.innerWidth >= 640 ? 220 : 0;
    const target = map.unproject(map.project(focus.at, z).add([shift, 0]), z);
    map.flyTo(target, z, { duration: 0.6 });
  }, [focus, map]);
  useMapEvents({ zoomend: () => onZoom(map.getZoom() - fit.current) });
  return null;
}

/** A place's page, inside the codex panel. Links to places on this map move the map; other links open the handbook. */
function Codex({ e, onClose, onPlace, pinned }: { e: PEntity; onClose: () => void; onPlace: (id: string) => void; pinned: Set<string> }) {
  const { base } = usePlayer();
  const md = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={defaultUrlTransform}
      components={{
        a: ({ href, children }) => {
          const id = href?.startsWith('/player/e/') ? decodeURIComponent(href.slice('/player/e/'.length)) : null;
          if (id && pinned.has(id))
            return (
              <button type="button" className="wk-ref" onClick={() => onPlace(id)}>
                {children}
              </button>
            );
          return href?.startsWith('/player/') ? (
            <Link to={`${base}${href.slice('/player'.length)}`} className="wk-ref">
              {children}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-arcane underline">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-2 p-4 border-b border-line">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-dim">
            {e.typeLabel} · {e.realmLabel}
          </div>
          <h2 className="font-display text-2xl text-gold leading-tight mt-0.5">{e.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 prose-lore wk-codex">
        {e.summary ? md(e.summary) : <p className="text-dim">You know of this, but little more.</p>}
        {e.sections?.map((s) => (
          <div key={s.heading}>{md(`## ${s.heading}\n\n${s.content}`)}</div>
        ))}
      </div>
      <div className="p-3 border-t border-line">
        <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="text-sm text-arcane inline-flex items-center gap-1.5">
          <BookOpen size={14} /> Open its page in the handbook
        </Link>
      </div>
    </div>
  );
}

export function MapExplorer() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { source, base } = usePlayer();
  const { maps, byId } = usePlayerIndex();
  const nav = useNavigate();
  const [rel, setRel] = useState(0);
  const [legend, setLegend] = useState(read('wk.map.legend', window.innerWidth >= 768 ? '1' : '0') === '1');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(read('wk.map.hidden', '').split(',').filter(Boolean)));
  const [focus, setFocus] = useState<{ at: [number, number]; n: number; map: number } | null>(null);
  const selected = sp.get('place');
  const m: PMap | undefined = maps && (maps.find((x) => String(x.id) === id) ?? maps.find((x) => x.parent_map_id == null) ?? maps[0]);

  const pins = useMemo(
    () => (m ? m.markers.map((mk) => ({ ...mk, kind: kindOf(mk.entity_id ? byId.get(mk.entity_id)?.type : undefined) })) : []),
    [m, byId],
  );
  const pinned = useMemo(() => new Set(pins.map((p) => p.entity_id).filter((x): x is string => !!x)), [pins]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { routes: m?.shapes.filter((s) => s.kind === 'route').length ?? 0 };
    for (const p of pins) c[p.kind] = (c[p.kind] ?? 0) + 1;
    return c;
  }, [pins, m]);

  const select = useCallback(
    (entityId: string | null) => {
      const next = new URLSearchParams(sp);
      if (entityId) next.set('place', entityId);
      else next.delete('place');
      setSp(next, { replace: true });
      const p = entityId ? pins.find((x) => x.entity_id === entityId) : null;
      if (p && m) setFocus({ at: [p.y, p.x], n: Date.now(), map: m.id });
    },
    [sp, setSp, pins, m],
  );
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && select(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [select]);
  useEffect(() => {
    if (selected) {
      const p = pins.find((x) => x.entity_id === selected);
      if (p && m) setFocus({ at: [p.y, p.x], n: Date.now(), map: m.id });
    }
    // Only when arriving with a place already chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  if (!maps) return null;
  if (!m) return <p className="text-dim p-6">No maps have been shared yet.</p>;
  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [m.height, m.width],
  ];
  const toggle = (k: string) => {
    const n = new Set(hidden);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setHidden(n);
    write('wk.map.hidden', [...n].join(','));
  };
  const entity = selected ? byId.get(selected) : undefined;
  const visible = pins.filter((p) => !hidden.has(p.kind) && (rel >= SHOW_FROM[p.kind] || p.entity_id === selected));

  return (
    <div className="wk-explorer fixed inset-0 z-50 bg-[#0b0b10] text-ink">
      <MapContainer
        key={m.id}
        crs={L.CRS.Simple}
        bounds={bounds}
        minZoom={-5}
        maxZoom={0.5}
        zoomSnap={0.25}
        zoomControl={false}
        style={{ position: 'absolute', inset: 0, background: '#0b0b10' }}
        attributionControl={false}
      >
        <Viewport bounds={bounds} onZoom={setRel} focus={focus && focus.map === m.id ? focus : null} />
        {m.image_file ? <ImageOverlay url={source.imageUrl(m.image_file)} bounds={bounds} /> : <Rectangle bounds={bounds} pathOptions={{ color: '#c9a24a', weight: 1, fillOpacity: 0.3 }} />}
        {m.shapes.map((s) =>
          s.kind === 'region' ? (
            <Polygon key={s.id} positions={s.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: s.color, fillOpacity: 0.12 }}>
              {s.label && (
                <Tooltip sticky direction="bottom" offset={[0, 14]} className="wk-map-tip">
                  <span className="text-[12px]">{s.label}</span>
                </Tooltip>
              )}
            </Polygon>
          ) : hidden.has('routes') ? null : (
            <Polyline key={s.id} positions={s.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: s.color, weight: 2, dashArray: '5 5' }}>
              {s.label && (
                <Tooltip sticky direction="bottom" offset={[0, 14]} className="wk-map-tip">
                  <span className="text-[12px]">{s.label}</span>
                </Tooltip>
              )}
            </Polyline>
          ),
        )}
        {visible.map((mk) => (
          <Marker
            key={mk.id}
            position={[mk.y, mk.x]}
            icon={icon(mk.kind, mk.entity_id === selected)}
            zIndexOffset={mk.entity_id === selected ? 1000 : mk.kind === 'region' ? -100 : 0}
            eventHandlers={{
              click: () => {
                if (mk.child_map_id) nav(`${base}/maps/${mk.child_map_id}`);
                else if (mk.entity_id) select(mk.entity_id);
              },
              // Open the name card on whichever side of the pin has room, so it never runs off the screen.
              mouseover: (ev) => placeTip(ev.target as L.Marker),
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} className="wk-map-tip">
              <div className="font-display text-[13px]">{mk.label}</div>
              {mk.entity_id && byId.get(mk.entity_id) && <div className="text-[10px] uppercase tracking-wider opacity-70">{byId.get(mk.entity_id)!.typeLabel}</div>}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Top bar: back to the handbook, the maps, the legend. */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2 pointer-events-none">
        <Link to={base || '/'} className="wk-map-btn pointer-events-auto" title="Back to the handbook">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Handbook</span>
        </Link>
        <button type="button" className={`wk-map-btn pointer-events-auto ${legend ? 'text-gold' : ''}`} onClick={() => (setLegend(!legend), write('wk.map.legend', legend ? '0' : '1'))}>
          <Layers size={16} /> <span className="hidden sm:inline">Legend</span>
        </button>
        <div className="flex gap-1.5 pointer-events-auto ml-auto">
          {maps.map((x) => (
            <Link key={x.id} to={`${base}/maps/${x.id}`} className={`wk-map-btn ${x.id === m.id ? 'text-gold border-gold/60' : ''}`}>
              {x.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Legend: slides out from the left. */}
      <aside className={`wk-map-panel left-3 top-16 w-64 ${legend ? '' : 'wk-map-panel-hidden-left'}`}>
        <div className="font-display text-gold text-lg px-4 pt-3">{m.name}</div>
        <div className="text-xs text-dim px-4 pb-2">Click a place to read about it.{counts.fortress || counts.vault ? ' Zoom in for fortresses and vaults.' : ''}</div>
        <ul className="px-2 pb-3">
          {KINDS.filter((k) => counts[k.key]).map((k) => {
            const off = hidden.has(k.key);
            return (
              <li key={k.key}>
                <button type="button" onClick={() => toggle(k.key)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 ${off ? 'opacity-45' : ''}`}>
                  {k.key === 'routes' ? (
                    <span className="w-6 h-0 border-t-2 border-dashed border-gold/80 shrink-0" />
                  ) : (
                    <span className={`wk-pin wk-pin-legend wk-pin-k-${k.key} shrink-0`} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="14" height="14">${GLYPH[k.key as Kind]}</svg>` }} />
                  )}
                  <span className="flex-1 text-left text-sm">{k.label}</span>
                  <span className="text-xs text-dim">{counts[k.key]}</span>
                  {off ? <EyeOff size={14} className="text-dim" /> : <Eye size={14} className="text-dim" />}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Codex: slides out from the right when a place is chosen. */}
      <aside className={`wk-map-panel right-0 top-0 bottom-0 w-full sm:w-[420px] sm:right-3 sm:top-16 sm:bottom-3 ${entity ? '' : 'wk-map-panel-hidden-right'}`}>
        {entity && <Codex e={entity} onClose={() => select(null)} onPlace={select} pinned={pinned} />}
      </aside>
    </div>
  );
}
