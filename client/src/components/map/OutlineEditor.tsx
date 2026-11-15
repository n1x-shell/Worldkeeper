import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';

/**
 * Drawing and reshaping a place's outline on the map (GM only). Points are map coordinates, [x, y] with y up.
 *
 * Drawing: click to drop a corner, or hold the mouse and drag to sketch; the two mix freely. Click the first corner
 * (or Finish) to close the shape. Editing: drag a corner to move it, click a small middle handle to add a corner
 * there, right-click a corner to remove it.
 */
export type Pt = [number, number];

const handle = (cls: string) =>
  L.divIcon({
    className: `wk-handle ${cls}`,
    iconSize: cls === 'wk-handle-mid' ? [10, 10] : [14, 14],
  });
const CORNER = handle('wk-handle-corner');
const FIRST = handle('wk-handle-corner wk-handle-first');
const MID = handle('wk-handle-mid');

/** Drop points that add nothing to the line's shape (Ramer–Douglas–Peucker). */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const n = Math.hypot(dx, dy) || 1;
  let max = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = dx === 0 && dy === 0 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n;
    if (d > max) {
      max = d;
      at = i;
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

export function OutlineEditor({ points, drawing, onChange, onClose }: { points: Pt[]; drawing: boolean; onChange: (pts: Pt[]) => void; onClose: () => void }) {
  const map = useMap();
  const [, setZoom] = useState(0);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const down = useRef<{ at: L.Point; moved: boolean; pts: Pt[] } | null>(null);
  const toPt = (ll: L.LatLng): Pt => [Math.round(ll.lng), Math.round(ll.lat)];
  const screen = (p: Pt) => map.latLngToContainerPoint([p[1], p[0]]);

  // Opening a saved outline: bring all of it into view.
  useEffect(() => {
    if (points.length >= 3) map.flyToBounds(L.latLngBounds(points.map(([x, y]) => [y, x] as [number, number])), { padding: [80, 80], duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While drawing, the mouse draws instead of moving the map.
  useEffect(() => {
    if (!drawing) return;
    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
    };
  }, [drawing, map]);

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    mousedown: (e) => {
      if (!drawing || e.originalEvent.button !== 0) return;
      down.current = {
        at: e.containerPoint,
        moved: false,
        pts: [toPt(e.latlng)],
      };
    },
    mousemove: (e) => {
      if (!drawing) return;
      setCursor(toPt(e.latlng));
      const d = down.current;
      if (!d) return;
      if (!d.moved && e.containerPoint.distanceTo(d.at) > 5) d.moved = true;
      if (!d.moved) return;
      const last = d.pts[d.pts.length - 1];
      if (screen(last).distanceTo(e.containerPoint) >= 4) {
        d.pts.push(toPt(e.latlng));
        setStroke([...d.pts]);
      }
    },
    mouseup: (e) => {
      const d = down.current;
      down.current = null;
      setStroke(null);
      if (!drawing || !d) return;
      if (!d.moved) {
        // A click: close the shape on its first corner, or add a corner.
        if (points.length >= 3 && screen(points[0]).distanceTo(e.containerPoint) < 12) onClose();
        else onChange([...points, toPt(e.latlng)]);
        return;
      }
      // A sketched stroke: keep its shape with as few corners as it needs (about 2.5 screen pixels of tolerance).
      onChange([...points, ...simplify(d.pts, 2.5 / Math.pow(2, map.getZoom()))]);
    },
  });

  const ll = (p: Pt) => [p[1], p[0]] as [number, number];
  if (drawing) {
    const line = [...points, ...(stroke ?? []), ...(cursor && !stroke ? [cursor] : [])];
    return (
      <>
        {line.length > 1 && (
          <>
            <Polyline positions={line.map(ll)} interactive={false} pathOptions={{ color: '#0b0b10', weight: 5, opacity: 0.55 }} />
            <Polyline positions={line.map(ll)} interactive={false} pathOptions={{ color: '#f2e3b3', weight: 2.5, dashArray: '6 5' }} />
          </>
        )}
        {points.map((p, i) => (
          <CircleMarker
            key={i}
            center={ll(p)}
            radius={i === 0 && points.length >= 3 ? 7 : 4}
            interactive={false}
            pathOptions={{
              color: '#f2e3b3',
              weight: 2,
              fillColor: i === 0 ? '#c9a24a' : '#0b0b10',
              fillOpacity: 1,
            }}
          />
        ))}
      </>
    );
  }

  // Editing: corners to drag, and a handle in the middle of each side (where the side is long enough to need one).
  const mids = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    const long = screen(p).distanceTo(screen(q)) > 28;
    return long ? ([Math.round((p[0] + q[0]) / 2), Math.round((p[1] + q[1]) / 2)] as Pt) : null;
  });
  const move = (i: number, at: L.LatLng) => onChange(points.map((p, j) => (j === i ? toPt(at) : p)));
  return (
    <>
      <Polygon positions={points.map(ll)} interactive={false} pathOptions={{ color: '#0b0b10', weight: 5, opacity: 0.55, fill: false }} />
      <Polygon positions={points.map(ll)} interactive={false} pathOptions={{ color: '#f2e3b3', weight: 2.5, fillColor: '#f2e3b3', fillOpacity: 0.15 }} />
      {mids.map(
        (m, i) =>
          m && (
            <Marker
              key={`m${i}-${m[0]}-${m[1]}`}
              position={ll(m)}
              icon={MID}
              draggable
              eventHandlers={{
                click: () => onChange([...points.slice(0, i + 1), m, ...points.slice(i + 1)]),
                dragend: (ev) => onChange([...points.slice(0, i + 1), toPt((ev.target as L.Marker).getLatLng()), ...points.slice(i + 1)]),
              }}
            />
          ),
      )}
      {points.map((p, i) => (
        <Marker
          key={`c${i}-${p[0]}-${p[1]}`}
          position={ll(p)}
          icon={i === 0 ? FIRST : CORNER}
          draggable
          zIndexOffset={100}
          eventHandlers={{
            dragend: (ev) => move(i, (ev.target as L.Marker).getLatLng()),
            contextmenu: (ev) => {
              L.DomEvent.preventDefault(ev.originalEvent);
              if (points.length > 3) onChange(points.filter((_, j) => j !== i));
            },
          }}
        />
      ))}
    </>
  );
}
