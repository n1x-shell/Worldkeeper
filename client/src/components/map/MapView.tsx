import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polygon, Polyline, Popup, Rectangle, SVGOverlay, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { PACES, formatMiles, niceMiles, pathMiles, travelDays, type Pace } from '../../../../shared/travel';
import { ArrowLeft, Eye, EyeOff, Layers, NotebookPen, Plus, Ruler, Trash2, Undo2, X } from 'lucide-react';
import { groupByDistance } from './grouping';
import { Check, Segmented } from '../ui';

/**
 * The full-screen map view shared by the players' handbook and the GM's Atlas. The map fills the window; a legend
 * slides out on the left and a codex on the right. It knows nothing about where its data comes from: the handbook
 * passes only player-safe data, and the Atlas passes the GM's.
 *
 * Exploration (fog of war and the party's trail) is drawn only when `exploration` is given, which the handbook does
 * only while the active campaign has a live session.
 */

export type Kind = 'region' | 'settlement' | 'landmark' | 'fortress' | 'vault' | 'other';
export const kindOf = (type: string | undefined): Kind =>
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

const KINDS: { key: Kind | 'routes'; label: string }[] = [
  { key: 'region', label: 'Lands and regions' },
  { key: 'settlement', label: 'Towns and villages' },
  { key: 'landmark', label: 'Landmarks and ruins' },
  { key: 'fortress', label: 'Fortresses and halls' },
  { key: 'vault', label: 'Vaults' },
  { key: 'other', label: 'Other places' },
  { key: 'routes', label: 'Routes' },
];
/** How far past "whole map in view" you must zoom before a kind of pin appears. */
const SHOW_FROM: Record<Kind, number> = {
  region: -9,
  settlement: -9,
  landmark: -9,
  fortress: 0.5,
  vault: 0.5,
  other: -9,
};

export const GLYPH: Record<Kind | 'note' | 'party', string> = {
  region: '<path d="M12 3l6 9-6 9-6-9z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  settlement: '<path d="M5 20V11l7-6 7 6v9h-5v-5h-4v5z" fill="currentColor"/>',
  landmark: '<path d="M4 20l6-12 3 5 2-3 5 10z" fill="currentColor"/>',
  fortress: '<path d="M5 20V8h2v2h2V8h2v2h2V8h2v2h2V8h2v12z" fill="currentColor"/>',
  vault: '<path d="M6 20V11a6 6 0 0112 0v9zM10 20v-5a2 2 0 014 0v5" fill="currentColor"/>',
  other: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
  note: '<path d="M5 19l1-4L15 6l3 3-9 9zM14 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  party: '<path d="M7 21V4M7 4h11l-3 4 3 4H7" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** `peek`: the record behind the pin, so the GM app's Quick-Peek gives it a hover card (data-peek). */
const pinIcon = (kind: Kind | 'note' | 'party', extra = '', peek?: string | null) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="wk-pin wk-pin-k-${kind}${kind === 'region' ? ' wk-pin-region' : ''}${extra}"${peek ? ` data-peek="${attr(peek)}"` : ''}><svg viewBox="0 0 24 24" width="16" height="16">${GLYPH[kind]}</svg></div>`,
  });

/** The campaign on the map (GM only): each layer's things at a place, drawn as a small badge beside its pin. */
export type MapLayerId = 'quests' | 'adventures' | 'people' | 'encounters';
export interface MapLayerSpot {
  layer: MapLayerId;
  entity_id: string;
  place: string;
  x: number;
  y: number;
  items: { id: string; label: string; href: string; hint?: string }[];
}
export const LAYERS: { key: MapLayerId; label: string; glyph: string; anchor: [number, number] }[] = [
  {
    key: 'quests',
    label: 'Open quests',
    glyph: '<path d="M12 4v10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    anchor: [-5, 27],
  },
  { key: 'adventures', label: 'Adventure places', glyph: '<path d="M6 21V4h11l-2.5 4 2.5 4H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>', anchor: [27, 27] },
  {
    key: 'people',
    label: 'Who is here',
    glyph: '<circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 20c0-3.8 3.2-6 7-6s7 2.2 7 6" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    anchor: [-5, -5],
  },
  {
    key: 'encounters',
    label: 'Prepared encounters',
    glyph: '<path d="M5 19 19 5M15 5h4v4M19 19 5 5M5 9V5h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    anchor: [27, -5],
  },
];
const layerIcon = (l: (typeof LAYERS)[number], n: number) =>
  L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: l.anchor,
    html: `<div class="wk-badge wk-badge-${l.key}"><svg viewBox="0 0 24 24" width="12" height="12">${l.glyph}</svg>${n > 1 ? `<span>${n}</span>` : ''}</div>`,
  });

/** Point a pin's name card away from the nearest screen edge. */
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

export const readPref = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
export const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* preference only */
  }
};

export interface ViewPin {
  id: number;
  label: string;
  x: number;
  y: number;
  entity_id: string | null;
  child_map_id: number | null;
  kind: Kind;
  typeLabel?: string;
  /** GM only: hidden from players. */
  hidden?: boolean;
}
export interface ViewShape {
  id: number;
  kind: string;
  label: string;
  color: string;
  points: [number, number][];
  entity_id?: string | null;
}
export interface ViewExploration {
  discovered: Set<string>;
  trail: { x: number; y: number; label: string }[];
}
interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
}

/** Opens with the map covering the window, keeps it there, and reports how far the reader has zoomed in past that. */
function Viewport({ bounds, onZoom, focus }: { bounds: L.LatLngBoundsExpression; onZoom: (rel: number) => void; focus: { at: [number, number]; n: number } | null }) {
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

/** Hands the Leaflet map to the view, and reports its zoom as it changes. */
function MapGrab({ onMap, onZoom }: { onMap: (m: L.Map) => void; onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
    onZoom(map.getZoom());
  }, [map, onMap, onZoom]);
  // The map's box changes size when a record opens beside it or the inspector opens: redraw to fit.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

/** Pins this close together on screen (pixels) are drawn as one numbered group until the reader zooms in. */
const CLUSTER_PX = 34;
const clusterIcon = (n: number) =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="wk-cluster"><span>${n}</span></div>`,
  });

/** A compass rose for the corner of the map (decoration; the maps have north at the top). */
function Compass() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden className="wk-compass">
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="1" opacity=".55" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth=".6" opacity=".4" />
      <path d="M32 5 L36 32 L32 59 L28 32 Z" fill="currentColor" opacity=".9" />
      <path d="M5 32 L32 28 L59 32 L32 36 Z" fill="currentColor" opacity=".55" />
      <path d="M32 5 L36 32 L32 32 Z" fill="#0b0b10" opacity=".55" />
      <text x="32" y="4" textAnchor="middle" fontSize="7" fill="currentColor" fontFamily="Cinzel, serif" dy="2.5">
        N
      </text>
    </svg>
  );
}

/** A small overview of the whole map, with the part in view outlined; click it to move there. */
function Overview({ map, m }: { map: L.Map; m: { width: number; height: number; imageUrl: string | null } }) {
  const W = 180;
  const H = Math.round((W * m.height) / m.width);
  const [view, setView] = useState<L.LatLngBounds>(() => map.getBounds());
  useEffect(() => {
    const on = () => setView(map.getBounds());
    on();
    map.on('move zoom resize', on);
    return () => {
      map.off('move zoom resize', on);
    };
  }, [map]);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const left = clamp(view.getWest() / m.width, 0, 1) * W;
  const right = clamp(view.getEast() / m.width, 0, 1) * W;
  const top = (1 - clamp(view.getNorth() / m.height, 0, 1)) * H;
  const bottom = (1 - clamp(view.getSouth() / m.height, 0, 1)) * H;
  return (
    <button
      type="button"
      className="wk-overview pointer-events-auto"
      style={{ width: W, height: H, backgroundImage: m.imageUrl ? `url(${m.imageUrl})` : undefined }}
      aria-label="Overview of the whole map: click to move there"
      title="Overview: click to move there"
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / W) * m.width;
        const y = (1 - (e.clientY - r.top) / H) * m.height;
        map.panTo([y, x]);
      }}
    >
      <span
        className="wk-overview-view"
        style={{
          left: Math.min(left, (left + right) / 2 - 5),
          top: Math.min(top, (top + bottom) / 2 - 5),
          width: Math.max(10, right - left),
          height: Math.max(10, bottom - top),
        }}
      />
    </button>
  );
}

/** Reports how many screen pixels one unit of the map's image takes, as the reader zooms. */
function ScaleWatch({ onChange }: { onChange: (pxPerUnit: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const report = () => {
      const a = map.latLngToContainerPoint([0, 0]);
      const b = map.latLngToContainerPoint([0, 1000]);
      onChange((b.x - a.x) / 1000);
    };
    report();
    map.on('zoomend resize', report);
    return () => {
      map.off('zoomend resize', report);
    };
  }, [map, onChange]);
  return null;
}

function Clicks({ onClick }: { onClick: ((x: number, y: number) => void) | null }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = onClick ? 'crosshair' : '';
  }, [map, onClick]);
  useMapEvents({ click: (e) => onClick?.(e.latlng.lng, e.latlng.lat) });
  return null;
}

/** Darkness over everything the party hasn't seen, with clear patches around what it has. */
function Fog({ w, h, clear, strength }: { w: number; h: number; clear: { x: number; y: number }[]; strength: number }) {
  const r = Math.max(w, h) * 0.07;
  const id = useMemo(() => `wk-fog-${Math.random().toString(36).slice(2)}`, []);
  return (
    <SVGOverlay
      bounds={[
        [0, 0],
        [h, w],
      ]}
      attributes={{
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: 'none',
        class: 'wk-fog',
      }}
      interactive={false}
    >
      <defs>
        <filter id={`${id}-blur`} filterUnits="userSpaceOnUse" x={-r} y={-r} width={w + 2 * r} height={h + 2 * r}>
          <feGaussianBlur stdDeviation={r * 0.35} />
        </filter>
        <mask id={`${id}-mask`}>
          <rect x={0} y={0} width={w} height={h} fill="white" />
          <g filter={`url(#${id}-blur)`}>
            {clear.map((p, i) => (
              <circle key={i} cx={p.x} cy={h - p.y} r={r} fill="black" />
            ))}
          </g>
        </mask>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill={`rgba(8,8,14,${strength})`} mask={`url(#${id}-mask)`} />
    </SVGOverlay>
  );
}

export interface MapViewProps {
  map: {
    id: number;
    name: string;
    width: number;
    height: number;
    imageUrl: string | null;
  };
  maps: { id: number; name: string }[];
  mapHref: (id: number) => string;
  back: { href: string; label: string };
  pins: ViewPin[];
  shapes: ViewShape[];
  selected: string | null;
  onSelect: (entityId: string | null) => void;
  onChildMap: (id: number) => void;
  /** The codex panel's content for the selected place. */
  codex: ReactNode;
  /** Fog of war and the party's trail. Players see undiscovered places hidden; the GM sees them dimmed. */
  exploration?: ViewExploration | null;
  fog?: 'hide' | 'dim';
  /** Where this reader's own notes are kept (on this device only). */
  notesKey: string;
  /** GM: pins can be dragged, and the map can be clicked to place something. */
  draggable?: boolean;
  onMovePin?: (pin: ViewPin, x: number, y: number) => void;
  placing?: {
    prompt: string;
    onPlace: (x: number, y: number) => void;
    onCancel: () => void;
  } | null;
  /** Extra sections at the bottom of the legend (the GM's tools). */
  legendExtra?: ReactNode;
  /** A banner under the top bar (for example, "Live session: fog of war is on"). */
  banner?: ReactNode;
  /** GM: an outline being drawn or reshaped, drawn on the map. While it is open, pins and outlines stay still. */
  editor?: ReactNode;
  /** The saved outline being reshaped, left out while the editor shows it. */
  editingShapeId?: number | null;
  /** GM: show every outline, not only the hovered one. */
  showOutlines?: boolean;
  /** Fill the page's main view (the GM app, beside its sidebar and under its top bar) instead of the whole window. */
  contained?: boolean;
  /** GM: the campaign on the map (quests, adventure places, people, encounters), and how to open what they link to. */
  layers?: MapLayerSpot[] | null;
  onOpenLink?: (href: string) => void;
  /** How many miles the map is across (its width): a scale bar, a ruler and travel times on routes. */
  scaleMiles?: number | null;
  /** GM app: the app's sidebar, to hold the legend and the map switcher instead of the floating panel. While it is
   * collapsed (null), the floating legend comes back. */
  sidebarSlot?: HTMLElement | null;
  /** GM app: pins that are records get the Quick-Peek hover card (and middle-click or a long press to peek) instead
   * of the map's own name card. The handbook has no Quick-Peek, so it keeps the name cards. */
  peekPins?: boolean;
}

export function MapView(p: MapViewProps) {
  const { map: m } = p;
  const [rel, setRel] = useState(0);
  const [lmap, setLmap] = useState<L.Map | null>(null);
  // The view's own width (it narrows in split view and beside the inspector): where the banner fits beside the codex.
  const [boxW, setBoxW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    if (!lmap || typeof ResizeObserver === 'undefined') return;
    const el = lmap.getContainer();
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [lmap]);
  const [zoom, setZoom] = useState(0);
  const [query, setQuery] = useState('');
  // Display choices, kept on this device: the map panels dark (the chart's palette) or in the app's theme; the overview.
  const [panels, setPanels] = useState(readPref('wk.map.panels', 'dark'));
  const [overview, setOverview] = useState(readPref('wk.map.overview', '1') === '1');
  const [legend, setLegend] = useState(!p.contained && readPref('wk.map.legend', window.innerWidth >= 768 ? '1' : '0') === '1');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(readPref('wk.map.hidden', '').split(',').filter(Boolean)));
  const [focus, setFocus] = useState<{
    at: [number, number];
    n: number;
  } | null>(null);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  // Campaign layers switched off (people is off to start: there are a lot of them).
  const [layersOff, setLayersOff] = useState<Set<string>>(() => new Set(readPref('wk.map.layersOff', 'people').split(',').filter(Boolean)));
  const toggleLayer = (k: string) => {
    const n = new Set(layersOff);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setLayersOff(n);
    writePref('wk.map.layersOff', [...n].join(','));
  };
  const notesStore = `wk.notes.${p.notesKey}.${m.id}`;
  const [notes, setNotes] = useState<Note[]>(() => JSON.parse(readPref(notesStore, '[]')) as Note[]);
  const [addingNote, setAddingNote] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const saveNotes = (n: Note[]) => (setNotes(n), writePref(notesStore, JSON.stringify(n)));
  const ex = p.exploration ?? null;
  const editing = !!p.editor;
  const inSidebar = !!p.sidebarSlot;
  // The scale bar and the ruler, when the map has a scale.
  const milesPerUnit = p.scaleMiles && m.width ? p.scaleMiles / m.width : null;
  const [pxPerUnit, setPxPerUnit] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [ruler, setRuler] = useState<[number, number][]>([]);
  const rulerMiles = milesPerUnit ? (pathMiles(ruler, { width: m.width, scale_miles: p.scaleMiles }) ?? 0) : 0;
  const bar =
    milesPerUnit && pxPerUnit > 0
      ? (() => {
          const pxPerMile = pxPerUnit / milesPerUnit;
          const miles = niceMiles(110 / pxPerMile);
          return { miles, px: miles * pxPerMile };
        })()
      : null;
  // In the GM app, collapsing the sidebar is how to see just the map: the floating legend then starts closed.
  const wasInSidebar = useRef(inSidebar);
  useEffect(() => {
    if (p.contained && wasInSidebar.current && !inSidebar) setLegend(false);
    wasInSidebar.current = inSidebar;
  }, [inSidebar, p.contained]);
  const fogMode = p.fog ?? 'hide';
  const codexOpen = !!p.selected && !!p.codex && window.innerWidth >= 640;

  // Arriving with a place already chosen: fly to it.
  useEffect(() => {
    const pin = p.selected ? p.pins.find((x) => x.entity_id === p.selected) : null;
    if (pin) setFocus({ at: [pin.y, pin.x], n: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selected]);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || p.editor) return;
      if (measuring) setMeasuring(false);
      else if (p.placing) p.placing.onCancel();
      else if (addingNote) setAddingNote(false);
      else p.onSelect(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [p, addingNote, measuring]);

  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [m.height, m.width],
  ];
  const regionShapes = p.shapes.filter((s) => s.kind === 'region' && s.id !== p.editingShapeId);
  const routes = p.shapes.filter((s) => s.kind !== 'region');
  const known = (pin: ViewPin) => !ex || pin.kind === 'region' || (pin.entity_id != null && ex.discovered.has(pin.entity_id));
  const counts: Record<string, number> = { routes: routes.length };
  for (const pin of p.pins) if (fogMode === 'dim' || known(pin)) counts[pin.kind] = (counts[pin.kind] ?? 0) + 1;
  const gmOnlyCount = p.pins.filter((pin) => pin.hidden).length;
  const visible = p.pins.filter(
    (pin) => !hidden.has(pin.kind) && !(pin.hidden && hidden.has('gmonly')) && (rel >= SHOW_FROM[pin.kind] || pin.entity_id === p.selected || p.draggable) && (fogMode === 'dim' || known(pin)),
  );
  const discoverable = p.pins.filter((x) => x.kind !== 'region' && x.entity_id);
  // Grouped pins: places close together on screen at this zoom are one numbered group (not regions, the chosen
  // place, or while drawing an outline; never at the closest zoom).
  const groups = useMemo(() => {
    if (!lmap || editing || zoom >= lmap.getMaxZoom()) return null;
    const placed = visible.filter((pin) => pin.kind !== 'region' && pin.entity_id !== p.selected).map((pin) => ({ at: lmap.project([pin.y, pin.x], zoom), item: pin }));
    return groupByDistance(placed, CLUSTER_PX)
      .filter((g) => g.items.length > 1)
      .map((g) => ({ at: L.point(g.at.x, g.at.y), pins: g.items }));
  }, [lmap, zoom, visible, editing, p.selected]);
  const grouped = new Set((groups ?? []).flatMap((g) => g.pins.map((x) => x.id)));
  const drawn = visible.filter((pin) => !grouped.has(pin.id));
  // Find a place: the pins this reader can see, by name.
  const found = query.trim().length > 1 ? p.pins.filter((pin) => (fogMode === 'dim' || known(pin)) && pin.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const party = ex && ex.trail.length ? ex.trail[ex.trail.length - 1] : null;
  // Fog clears around discovered places and everywhere the party has been.
  const clear = ex ? [...p.pins.filter((x) => x.kind !== 'region' && x.entity_id && ex.discovered.has(x.entity_id)), ...ex.trail] : [];
  const toggle = (k: string) => {
    const n = new Set(hidden);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setHidden(n);
    writePref('wk.map.hidden', [...n].join(','));
  };
  const select = (entityId: string | null) => {
    p.onSelect(entityId);
    const pin = entityId ? p.pins.find((x) => x.entity_id === entityId) : null;
    if (pin) setFocus({ at: [pin.y, pin.x], n: Date.now() });
  };
  const mapClick = editing
    ? null
    : measuring
      ? (x: number, y: number) => setRuler((r) => [...r, [x, y]])
      : p.placing
        ? p.placing.onPlace
        : addingNote
          ? (x: number, y: number) => {
              const n: Note = {
                id: Math.random().toString(36).slice(2),
                x,
                y,
                text: '',
              };
              saveNotes([...notes, n]);
              setAddingNote(false);
              setOpenNote(n.id);
            }
          : null;

  // The legend's contents: in the app's sidebar (GM) or the floating panel (handbook, or the GM's collapsed sidebar).
  const legendInner = (
    <>
      <div className="font-display text-gold text-lg px-4 pt-3">{m.name}</div>
      <div className="px-3 pt-2 relative">
        <input
          className="input py-1 text-sm"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found[0]) {
              const f = found[0];
              if (f.entity_id) select(f.entity_id);
              else setFocus({ at: [f.y, f.x], n: Date.now() });
              setQuery('');
            }
          }}
          placeholder="Find a place on this map"
          aria-label="Find a place on this map"
        />
        {found.length > 0 && (
          <ul className="mt-1 rounded-md border border-line bg-raised text-sm overflow-hidden" role="listbox">
            {found.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 hover:bg-gold/10 hover:text-gold flex items-center gap-2"
                  onClick={() => {
                    if (f.entity_id) select(f.entity_id);
                    else setFocus({ at: [f.y, f.x], n: Date.now() });
                    setQuery('');
                  }}
                >
                  <span className="truncate flex-1">{f.label}</span>
                  {f.typeLabel && <span className="text-[10px] uppercase tracking-wider text-dim">{f.typeLabel}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length > 1 && !found.length && <p className="text-xs text-dim mt-1">No place by that name on this map.</p>}
      </div>
      <div className="text-xs text-dim px-4 pb-2">
        Click a place to read about it.
        {counts.fortress || counts.vault ? ' Zoom in for fortresses and vaults.' : ''}
        {regionShapes.length ? ' Hover a region to see its borders.' : ''}
      </div>
      {ex && (
        <div className="mx-3 mb-2 rounded-md border border-line px-3 py-2 text-xs space-y-1">
          <div>
            <span className="text-gold">Explored:</span> {discoverable.filter((x) => ex.discovered.has(x.entity_id!)).length} of {discoverable.length} places
          </div>
          {party && (
            <div>
              <span className="text-gold">The party:</span> {party.label || 'on the road'}
            </div>
          )}
        </div>
      )}
      <ul className="px-2 pb-2">
        {KINDS.filter((k) => counts[k.key]).map((k) => {
          const off = hidden.has(k.key);
          return (
            <li key={k.key}>
              <button type="button" onClick={() => toggle(k.key)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 ${off ? 'opacity-45' : ''}`}>
                {k.key === 'routes' ? (
                  <span className="w-6 h-0 border-t-2 border-dashed border-gold/80 shrink-0" />
                ) : (
                  <span
                    className={`wk-pin wk-pin-legend wk-pin-k-${k.key} shrink-0`}
                    dangerouslySetInnerHTML={{
                      __html: `<svg viewBox="0 0 24 24" width="14" height="14">${GLYPH[k.key as Kind]}</svg>`,
                    }}
                  />
                )}
                <span className="flex-1 text-left text-sm">{k.label}</span>
                <span className="text-xs text-dim">{counts[k.key]}</span>
                {off ? <EyeOff size={14} className="text-dim" /> : <Eye size={14} className="text-dim" />}
              </button>
            </li>
          );
        })}
        {p.draggable && gmOnlyCount > 0 && (
          <li>
            <button
              type="button"
              onClick={() => toggle('gmonly')}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 ${hidden.has('gmonly') ? 'opacity-45' : ''}`}
              title="Hide them to see the map as players do"
            >
              <span className="w-6 h-6 rounded-full border border-dashed border-danger/70 shrink-0" />
              <span className="flex-1 text-left text-sm">Hidden from players</span>
              <span className="text-xs text-dim">{gmOnlyCount}</span>
              {hidden.has('gmonly') ? <EyeOff size={14} className="text-dim" /> : <Eye size={14} className="text-dim" />}
            </button>
          </li>
        )}
      </ul>
      {p.layers && (
        <div className="border-t border-line px-2 py-2">
          <div className="px-2 pb-1 section-title text-[11px]">Campaign</div>
          <ul>
            {LAYERS.map((l) => {
              const n = p.layers!.filter((s) => s.layer === l.key).reduce((t, s) => t + s.items.length, 0);
              const off = layersOff.has(l.key);
              return (
                <li key={l.key}>
                  <button
                    type="button"
                    disabled={!n}
                    onClick={() => toggleLayer(l.key)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/5 disabled:opacity-35 ${off ? 'opacity-45' : ''}`}
                  >
                    <span className={`wk-badge wk-badge-${l.key} wk-badge-legend shrink-0`} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="12" height="12">${l.glyph}</svg>` }} />
                    <span className="flex-1 text-left text-sm">{l.label}</span>
                    <span className="text-xs text-dim">{n}</span>
                    {off ? <EyeOff size={14} className="text-dim" /> : <Eye size={14} className="text-dim" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {/* Your own notes, kept on this device. */}
      <div className="border-t border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <NotebookPen size={14} className="text-gold" />
          <span className="text-sm flex-1">Your notes</span>
          <button type="button" className="btn-ghost text-xs" onClick={() => (setAddingNote(true), p.placing?.onCancel())}>
            <Plus size={13} /> Add
          </button>
        </div>
        {notes.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {notes.map((n) => (
              <li key={n.id} className="flex items-center gap-1 text-xs">
                <button type="button" className="flex-1 text-left truncate hover:text-gold" onClick={() => (setFocus({ at: [n.y, n.x], n: Date.now() }), setOpenNote(n.id))}>
                  {n.text || 'Untitled note'}
                </button>
                <button type="button" className="text-dim hover:text-danger p-0.5" aria-label="Delete note" onClick={() => saveNotes(notes.filter((x) => x.id !== n.id))}>
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dim mt-1">Pin your own notes to the map. Only this device keeps them.</p>
        )}
      </div>
      {/* How the map looks, kept on this device. */}
      <div className="border-t border-line px-4 py-2 space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="flex-1">Panels</span>
          <Segmented
            size="sm"
            label="Map panels"
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'theme', label: 'App theme' },
            ]}
            value={panels}
            onChange={(k) => (setPanels(k), writePref('wk.map.panels', k))}
          />
        </div>
        <Check className="flex text-dim" checked={overview} onChange={(v) => (setOverview(v), writePref('wk.map.overview', v ? '1' : '0'))}>
          Overview when zoomed in
        </Check>
      </div>
      {p.legendExtra}
    </>
  );

  return (
    // The chart is always drawn on the dark palette, whatever the app's theme, so its panels stay readable on the map.
    <div
      className={`wk-explorer ${panels === 'theme' ? 'wk-explorer-themed' : 'dark'} ${editing ? 'wk-editing ' : ''}${p.contained ? 'absolute inset-0' : 'fixed inset-0 z-50'} bg-[#0b0b10] text-ink`}
    >
      <MapContainer
        key={m.id}
        crs={L.CRS.Simple}
        bounds={bounds}
        minZoom={-5}
        maxZoom={2}
        zoomSnap={0.25}
        zoomControl={false}
        style={{ position: 'absolute', inset: 0, background: '#0b0b10' }}
        attributionControl={false}
      >
        <Viewport bounds={bounds} onZoom={setRel} focus={focus} />
        <MapGrab onMap={setLmap} onZoom={setZoom} />
        <Clicks onClick={mapClick} />
        {m.imageUrl ? <ImageOverlay url={m.imageUrl} bounds={bounds} /> : <Rectangle bounds={bounds} pathOptions={{ color: '#c9a24a', weight: 1, fillOpacity: 0.3 }} />}
        {ex && <Fog w={m.width} h={m.height} clear={clear} strength={fogMode === 'hide' ? 0.72 : 0.4} />}
        {/* Region outlines: invisible until a region (or its pin) is hovered; clicking one opens its page. */}
        {regionShapes.map((s) => {
          const hovered = hoverRegion != null && (hoverRegion === s.entity_id || hoverRegion === `shape:${s.id}`);
          const on = hovered || (!!p.showOutlines && !editing);
          return (
            <Polygon
              key={`${s.id}-${!mapClick && !editing}`} // interactive is read only when the shape is made
              positions={s.points.map(([x, y]) => [y, x] as [number, number])}
              interactive={!mapClick && !editing}
              pathOptions={{
                color: '#e8edf5',
                weight: on ? 2.5 : 0,
                opacity: on ? (hovered ? 0.95 : 0.6) : 0,
                fillColor: '#e8edf5',
                fillOpacity: hovered ? 0.1 : 0,
                dashArray: '6 6',
              }}
              eventHandlers={{
                mouseover: () => setHoverRegion(s.entity_id ?? `shape:${s.id}`),
                mouseout: () => setHoverRegion(null),
                click: () => s.entity_id && select(s.entity_id),
              }}
            />
          );
        })}
        {!hidden.has('routes') &&
          routes.map((s) => (
            <Polyline key={s.id} positions={s.points.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: s.color, weight: 2, dashArray: '5 5' }}>
              {(s.label || milesPerUnit) && (
                <Tooltip sticky direction="bottom" offset={[0, 14]} className="wk-map-tip">
                  {s.label && <div className="text-[12px]">{s.label}</div>}
                  {milesPerUnit &&
                    (() => {
                      const mi = pathMiles(s.points, { width: m.width, scale_miles: p.scaleMiles }) ?? 0;
                      return (
                        <div className="text-[11px] opacity-80 num">
                          {formatMiles(mi)} · {travelDays(mi, 'normal')} days at a normal pace
                        </div>
                      );
                    })()}
                </Tooltip>
              )}
            </Polyline>
          ))}
        {/* The party's trail and where it is now. */}
        {ex && ex.trail.length > 1 && (
          <Polyline
            positions={ex.trail.map((t) => [t.y, t.x] as [number, number])}
            interactive={false}
            pathOptions={{
              color: '#f2e3b3',
              weight: 3,
              dashArray: '2 8',
              lineCap: 'round',
              opacity: 0.95,
            }}
          />
        )}
        {(groups ?? []).map((g) => {
          const ll = lmap!.unproject(g.at, zoom);
          return (
            <Marker
              key={`g:${g.pins.map((x) => x.id).join(',')}`}
              position={ll}
              icon={clusterIcon(g.pins.length)}
              zIndexOffset={500}
              eventHandlers={{
                click: () => {
                  // Zoom in just far enough to pull the places apart, not all the way.
                  const b = L.latLngBounds(g.pins.map((x) => [x.y, x.x] as [number, number])).pad(0.6);
                  lmap!.flyTo(b.getCenter(), Math.min(lmap!.getBoundsZoom(b), zoom + 1.5, lmap!.getMaxZoom()), { duration: 0.5 });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -14]} className="wk-map-tip">
                <div className="text-[10px] uppercase tracking-wider opacity-70">{g.pins.length} places here: click to zoom in</div>
                {g.pins.slice(0, 6).map((x) => (
                  <div key={x.id} className="text-[12px]">
                    {x.label}
                  </div>
                ))}
                {g.pins.length > 6 && <div className="text-[11px] opacity-70">and {g.pins.length - 6} more</div>}
              </Tooltip>
            </Marker>
          );
        })}
        {drawn.map((pin) => {
          const undiscovered = fogMode === 'dim' && !known(pin);
          // A record's pin peeks (its hover card) rather than showing the name card too.
          const peeks = !!p.peekPins && !!pin.entity_id && !editing;
          return (
            <Marker
              key={pin.id}
              position={[pin.y, pin.x]}
              draggable={!!p.draggable && !editing}
              icon={pinIcon(
                pin.kind,
                `${pin.entity_id === p.selected ? ' wk-pin-active' : ''}${undiscovered ? ' wk-pin-undiscovered' : ''}${pin.hidden ? ' wk-pin-gmonly' : ''}`,
                peeks ? pin.entity_id : null,
              )}
              zIndexOffset={pin.entity_id === p.selected ? 1000 : pin.kind === 'region' ? -100 : 0}
              eventHandlers={{
                click: () => {
                  if (pin.child_map_id) p.onChildMap(pin.child_map_id);
                  else if (pin.entity_id) select(pin.entity_id);
                },
                mouseover: (ev) => {
                  placeTip(ev.target as L.Marker);
                  // Any place with an outline lights it up.
                  if (pin.entity_id) setHoverRegion(pin.entity_id);
                },
                mouseout: () => setHoverRegion(null),
                dragend: (ev) => {
                  const ll = (ev.target as L.Marker).getLatLng();
                  p.onMovePin?.(pin, Math.round(ll.lng), Math.round(ll.lat));
                },
              }}
            >
              {!peeks && (
                <Tooltip direction="top" offset={[0, -12]} className="wk-map-tip">
                  <div className="font-display text-[13px]">{pin.label}</div>
                  {pin.typeLabel && (
                    <div className="text-[10px] uppercase tracking-wider opacity-70">
                      {pin.typeLabel}
                      {undiscovered ? ' · not yet discovered' : ''}
                      {pin.hidden ? ' · hidden from players' : ''}
                    </div>
                  )}
                </Tooltip>
              )}
            </Marker>
          );
        })}
        {p.layers &&
          (() => {
            const shown = new Set(drawn.map((v) => v.entity_id));
            return p.layers
              .filter((s) => !layersOff.has(s.layer) && shown.has(s.entity_id))
              .map((s) => {
                const l = LAYERS.find((x) => x.key === s.layer)!;
                return (
                  <Marker key={`${s.layer}:${s.entity_id}`} position={[s.y, s.x]} icon={layerIcon(l, s.items.length)} zIndexOffset={900}>
                    <Tooltip direction="top" offset={[0, -10]} className="wk-map-tip">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">
                        {l.label} · {s.place}
                      </div>
                      {s.items.slice(0, 4).map((i) => (
                        <div key={i.id} className="text-[12px]">
                          {i.label}
                        </div>
                      ))}
                      {s.items.length > 4 && <div className="text-[11px] opacity-70">and {s.items.length - 4} more</div>}
                    </Tooltip>
                    <Popup className="wk-note-popup" maxWidth={280} autoPanPaddingTopLeft={[300, 80]} autoPanPaddingBottomRight={[40, 40]}>
                      <div className="text-[10px] uppercase tracking-wider text-dim mb-1">
                        {l.label} · {s.place}
                      </div>
                      <ul className="space-y-1 max-h-60 overflow-y-auto">
                        {s.items.map((i) => (
                          <li key={i.id}>
                            <button type="button" className="text-left text-sm text-arcane hover:text-gold underline-offset-2 hover:underline" onClick={() => p.onOpenLink?.(i.href)}>
                              {i.label}
                            </button>
                            {i.hint && <span className="text-xs text-dim"> · {i.hint}</span>}
                          </li>
                        ))}
                      </ul>
                    </Popup>
                  </Marker>
                );
              });
          })()}
        {party && (
          <Marker
            position={[party.y, party.x]}
            icon={pinIcon('party')}
            zIndexOffset={2000}
            eventHandlers={{
              mouseover: (ev) => placeTip(ev.target as L.Marker),
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} className="wk-map-tip">
              <div className="font-display text-[13px]">The party</div>
              {party.label && <div className="text-[10px] uppercase tracking-wider opacity-70">At {party.label}</div>}
            </Tooltip>
          </Marker>
        )}
        {notes.map((n) => (
          <NoteMarker
            key={n.id}
            note={n}
            open={openNote === n.id}
            onOpen={() => setOpenNote(n.id)}
            onClose={() => setOpenNote((cur) => (cur === n.id ? null : cur))}
            onSave={(text) => saveNotes(notes.map((x) => (x.id === n.id ? { ...x, text } : x)))}
            onDelete={() => (saveNotes(notes.filter((x) => x.id !== n.id)), setOpenNote(null))}
          />
        ))}
        {milesPerUnit && <ScaleWatch onChange={setPxPerUnit} />}
        {ruler.length > 0 && (
          <>
            {/* A dark edge under a light line, readable on pale parchment and on dark seas. */}
            <Polyline positions={ruler.map(([x, y]) => [y, x] as [number, number])} interactive={false} pathOptions={{ color: '#0b0b10', weight: 6, opacity: 0.55 }} />
            <Polyline positions={ruler.map(([x, y]) => [y, x] as [number, number])} interactive={false} pathOptions={{ color: '#f2e3b3', weight: 2.5, dashArray: '8 6' }} />
            {ruler.map(([x, y], i) => (
              <CircleMarker key={i} center={[y, x]} radius={4} interactive={false} pathOptions={{ color: '#f2e3b3', fillColor: '#0b0b10', fillOpacity: 1, weight: 2 }} />
            ))}
          </>
        )}
        {p.editor}
      </MapContainer>

      {/* The compass, and the overview while zoomed in (bottom right). */}
      <div className="absolute right-3 bottom-3 z-[950] hidden sm:flex items-end gap-2 pointer-events-none">
        <Compass />
        {overview && lmap && rel > 0.6 && <Overview map={lmap} m={m} />}
      </div>

      {/* Scale bar and ruler (bottom left), when the map has a scale. */}
      {milesPerUnit && (
        <div className="absolute left-3 bottom-3 z-[1000] flex flex-col items-start gap-2 pointer-events-none">
          {measuring && (
            <div className="wk-map-btn pointer-events-auto flex-col items-start gap-1 text-sm max-w-xs" role="status">
              <div className="flex items-center gap-2 w-full">
                <Ruler size={14} className="text-gold" />
                <span className="font-medium num">{ruler.length > 1 ? formatMiles(rulerMiles) : 'Click the map to measure'}</span>
                <button type="button" className="ml-auto p-0.5 hover:text-gold" aria-label="Undo the last point" title="Undo" disabled={!ruler.length} onClick={() => setRuler((r) => r.slice(0, -1))}>
                  <Undo2 size={14} />
                </button>
                <button type="button" className="p-0.5 hover:text-gold" aria-label="Stop measuring" title="Done (Esc)" onClick={() => setMeasuring(false)}>
                  <X size={14} />
                </button>
              </div>
              {ruler.length > 1 && (
                <div className="text-xs opacity-80 num">
                  {(Object.keys(PACES) as Pace[]).map((k, i) => (
                    <span key={k}>
                      {i ? ' · ' : ''}
                      {PACES[k].label} {travelDays(rulerMiles, k)} {travelDays(rulerMiles, k) === 1 ? 'day' : 'days'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              className={`wk-map-btn pointer-events-auto ${measuring ? 'text-gold border-gold/60' : ''}`}
              onClick={() => (measuring ? setMeasuring(false) : (setRuler([]), setMeasuring(true)))}
              title="Measure a distance (click points on the map)"
            >
              <Ruler size={15} /> <span className="hidden sm:inline">Measure</span>
            </button>
            {bar && (
              <div className="wk-scale-bar pointer-events-none" aria-label={`Scale: ${bar.miles} miles`}>
                <div className="wk-scale-line" style={{ width: Math.round(bar.px) }} />
                <span className="num">{bar.miles.toLocaleString('en-GB')} mi</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar: back, the legend, the maps (in the GM app's sidebar instead, while it is open). */}
      {!inSidebar && (
        <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2 pointer-events-none">
          {!p.contained && (
            <Link to={p.back.href} className="wk-map-btn pointer-events-auto" title={`Back to the ${p.back.label.toLowerCase()}`}>
              <ArrowLeft size={16} /> <span className="hidden sm:inline">{p.back.label}</span>
            </Link>
          )}
          <button type="button" className={`wk-map-btn pointer-events-auto ${legend ? 'text-gold' : ''}`} onClick={() => (setLegend(!legend), writePref('wk.map.legend', legend ? '0' : '1'))}>
            <Layers size={16} /> <span className="hidden sm:inline">Legend</span>
          </button>
          <div className="flex gap-1.5 pointer-events-auto ml-auto">
            {p.maps.map((x) => (
              <Link key={x.id} to={p.mapHref(x.id)} className={`wk-map-btn ${x.id === m.id ? 'text-gold border-gold/60' : ''}`}>
                {x.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* Beside the open codex in a narrow view, only prompts (placing, a note) show; the live notice waits. */}
      {((p.banner && !(codexOpen && boxW < 900)) || p.placing || addingNote) && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 wk-map-btn pointer-events-auto text-center max-w-[90%] ${
            !codexOpen
              ? `${inSidebar ? 'top-3' : 'top-16'} z-[1000]`
              : boxW >= 900
                ? `${inSidebar ? 'top-3' : 'top-16'} z-[1000] left-[calc((100%-27rem)/2)] max-w-[calc(100%-29rem)]`
                : 'bottom-16 z-[1010]'
          }`}
        >
          {p.placing ? (
            <span>
              {p.placing.prompt}{' '}
              <button type="button" className="text-gold underline ml-2" onClick={p.placing.onCancel}>
                Cancel
              </button>
            </span>
          ) : addingNote ? (
            <span>
              Click the map where your note goes.{' '}
              <button type="button" className="text-gold underline ml-2" onClick={() => setAddingNote(false)}>
                Cancel
              </button>
            </span>
          ) : (
            p.banner
          )}
        </div>
      )}

      {/* Legend: slides out from the left, or sits in the app's sidebar. */}
      {inSidebar ? (
        createPortal(
          <div className="wk-map-sidebar">
            {p.maps.length > 1 && (
              <nav aria-label="Maps" className="px-2 pt-3 pb-1">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim">Maps</div>
                {p.maps.map((x) => (
                  <Link
                    key={x.id}
                    to={p.mapHref(x.id)}
                    aria-current={x.id === m.id ? 'page' : undefined}
                    className={`block mx-0 px-2 py-1.5 rounded-md text-[13px] ${x.id === m.id ? 'bg-gold/10 text-gold font-medium' : 'text-ink/80 hover:bg-raised hover:text-ink'}`}
                  >
                    {x.name}
                  </Link>
                ))}
              </nav>
            )}
            <div className="border-t border-line mt-1 pt-1">{legendInner}</div>
          </div>,
          p.sidebarSlot!,
        )
      ) : (
        <aside className={`wk-map-panel left-3 top-16 w-64 ${p.contained ? 'max-h-[calc(100%-5rem)]' : 'max-h-[calc(100vh-5rem)]'} overflow-y-auto ${legend ? '' : 'wk-map-panel-hidden-left'}`}>
          {legendInner}
        </aside>
      )}

      {/* Codex: slides out from the right when a place is chosen. */}
      <aside
        className={`wk-map-panel right-0 top-0 bottom-0 w-full sm:w-[min(420px,calc(100%-1.5rem))] sm:right-3 ${inSidebar ? 'sm:top-3' : 'sm:top-16'} sm:bottom-3 ${p.selected && p.codex ? '' : 'wk-map-panel-hidden-right'}`}
      >
        {p.selected && p.codex}
      </aside>
    </div>
  );
}

/** One of the reader's notes. Its editor opens when the note is chosen (or has just been placed). */
function NoteMarker(p: { note: Note; open: boolean; onOpen: () => void; onClose: () => void; onSave: (text: string) => void; onDelete: () => void }) {
  const ref = useRef<L.Marker>(null);
  useEffect(() => {
    if (p.open) ref.current?.openPopup();
  }, [p.open]);
  return (
    <Marker ref={ref} position={[p.note.y, p.note.x]} icon={pinIcon('note')} zIndexOffset={1500} eventHandlers={{ click: p.onOpen, popupclose: p.onClose }}>
      <Popup className="wk-note-popup" autoClose={false}>
        <NoteEditor note={p.note} onSave={p.onSave} onDelete={p.onDelete} />
      </Popup>
      {!p.open && p.note.text && (
        <Tooltip direction="top" offset={[0, -12]} className="wk-map-tip">
          <span className="text-[12px]">{p.note.text}</span>
        </Tooltip>
      )}
    </Marker>
  );
}

function NoteEditor({ note, onSave, onDelete }: { note: Note; onSave: (text: string) => void; onDelete: () => void }) {
  const [text, setText] = useState(note.text);
  return (
    <div className="w-56 space-y-2">
      <textarea autoFocus className="input text-sm min-h-[70px]" placeholder="Your note" value={text} onChange={(e) => (setText(e.target.value), onSave(e.target.value.trim()))} />
      <div className="flex justify-between">
        <button type="button" className="btn-ghost text-xs text-danger" onClick={onDelete}>
          <Trash2 size={12} /> Delete
        </button>
        <span className="text-[11px] text-dim self-center">Saved on this device</span>
      </div>
    </div>
  );
}
