/**
 * The world's maps, shipped with the Worldkeeper additions: each <name>.pins.json in the maps folder is an image and
 * its pins, with optional <name>.routes.json (travel routes) and <name>.regions.json (region outlines). Positions are
 * pixels from the image's top-left; the atlas measures y from the bottom.
 *
 * Used by the handbook build (a fresh library: only revealed places, all shown) and by "Apply additions" in the GM's
 * own app (an existing library: maps it already has are only topped up, never overwritten).
 *
 * A map can carry its scale (scale_miles, in <name>.pins.json), set on a library's copy that has none. When shipped
 * pins, routes or outlines move, <name>.moves.json lists where they were: a library's copy that is still exactly there
 * (the GM hasn't moved it) is brought up to date; anything the GM moved or redrew is left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/connection.js';
import { maps, markers, shapes } from './repo/maps.js';
import { imageSize } from './routes/atlas.js';

interface PinsSpec {
  name: string;
  image: string;
  /** Miles across (the image's width), when the map is drawn to scale. */
  scale_miles?: number;
  pins: { id: string; label: string; x: number; y: number; category: string }[];
}

export interface MapApplyResult {
  name: string;
  created: boolean;
  pins: number;
  routes: number;
  regions: number;
  /** Pins, routes and outlines brought up to date (they hadn't been moved in the library). */
  moved?: number;
}

interface MovesSpec {
  pins?: Record<string, [number, number]>;
  routes?: { label: string; was_label: string; was_points: [number, number][] }[];
  regions?: Record<string, [number, number][]>;
}
const same = (a: number, b: number) => Math.abs(a - b) < 1;
const samePoints = (a: [number, number][], b: [number, number][]) => a.length === b.length && a.every(([x, y], i) => same(x, b[i][0]) && same(y, b[i][1]));

/** The map files, world map first. */
export function mapSpecs(mapsDir: string) {
  if (!fs.existsSync(mapsDir)) return [];
  return fs
    .readdirSync(mapsDir)
    .filter((f) => f.endsWith('.pins.json'))
    .sort((a, b) => Number(b.startsWith('world')) - Number(a.startsWith('world')) || a.localeCompare(b))
    .map((f) => f.replace(/\.pins\.json$/, ''));
}

export function applyMaps(db: DB, uploadsDir: string, mapsDir: string, opts: { onlyRevealed: boolean }): MapApplyResult[] {
  const out: MapApplyResult[] = [];
  const entity = db.prepare('SELECT revealed FROM entities WHERE id = ?');
  const regionName = db.prepare('SELECT name FROM entities WHERE id = ?');
  for (const base of mapSpecs(mapsDir)) {
    const spec = JSON.parse(fs.readFileSync(path.join(mapsDir, `${base}.pins.json`), 'utf8')) as PinsSpec;
    const img = fs.readFileSync(path.join(mapsDir, spec.image));
    const size = imageSize(img);
    if (!size) throw new Error(`Could not read the size of ${spec.image}`);
    const routesFile = path.join(mapsDir, `${base}.routes.json`);
    const regionsFile = path.join(mapsDir, `${base}.regions.json`);
    let mapId: number;
    let created = false;
    const existing = db.prepare('SELECT id, width, height FROM maps WHERE name = ? ORDER BY id LIMIT 1').get(spec.name) as { id: number; width: number; height: number } | undefined;
    if (existing && (existing.width !== size.width || existing.height !== size.height)) {
      // The GM's copy is a different size (an older image): leave it alone rather than misplace everything.
      out.push({
        name: spec.name,
        created: false,
        pins: 0,
        routes: 0,
        regions: 0,
      });
      continue;
    }
    if (existing) mapId = existing.id;
    else {
      const file = `map-${base}-${img.length.toString(16)}${path.extname(spec.image)}`;
      fs.writeFileSync(path.join(uploadsDir, file), img);
      const layers = ['Locations', ...(fs.existsSync(routesFile) ? ['Routes'] : []), ...(fs.existsSync(regionsFile) ? ['Regions'] : [])];
      mapId = (
        maps.create(db, {
          name: spec.name,
          kind: 'image',
          image_file: file,
          width: size.width,
          height: size.height,
          player_visible: true,
          layers,
          scale_miles: spec.scale_miles ?? null,
        }) as { id: number }
      ).id;
      created = true;
    }
    const onMap = new Set((db.prepare('SELECT entity_id FROM map_markers WHERE map_id = ? AND entity_id IS NOT NULL').all(mapId) as { entity_id: string }[]).map((r) => r.entity_id));
    let pins = 0;
    for (const p of spec.pins) {
      const e = entity.get(p.id) as { revealed: number } | undefined;
      if (!e || onMap.has(p.id)) continue;
      if (opts.onlyRevealed && !e.revealed) continue;
      markers.create(db, {
        map_id: mapId,
        entity_id: p.id,
        label: p.label,
        x: p.x,
        y: size.height - p.y,
        category: p.category,
        layer: 'Locations',
        hidden: !e.revealed,
      });
      pins++;
    }
    const hasKind = (kind: string) => !!db.prepare('SELECT 1 FROM map_shapes WHERE map_id = ? AND kind = ?').get(mapId, kind);
    let routes = 0;
    if (fs.existsSync(routesFile) && !hasKind('route')) {
      const r = JSON.parse(fs.readFileSync(routesFile, 'utf8')) as {
        routes: { label: string; color: string; points: [number, number][] }[];
      };
      for (const route of r.routes) {
        shapes.create(db, {
          map_id: mapId,
          kind: 'route',
          label: route.label,
          color: route.color,
          points: route.points.map(([x, y]) => [x, size.height - y]),
          layer: 'Routes',
          hidden: false,
        });
        routes++;
      }
    }
    let regions = 0;
    if (fs.existsSync(regionsFile) && !hasKind('region')) {
      const r = JSON.parse(fs.readFileSync(regionsFile, 'utf8')) as {
        regions: { entity_id: string; points: [number, number][] }[];
      };
      for (const reg of r.regions) {
        const e = entity.get(reg.entity_id) as { revealed: number } | undefined;
        if (!e || (opts.onlyRevealed && !e.revealed)) continue;
        const label = (regionName.get(reg.entity_id) as { name: string }).name;
        shapes.create(db, {
          map_id: mapId,
          kind: 'region',
          label,
          color: '#e8edf5',
          entity_id: reg.entity_id,
          points: reg.points.map(([x, y]) => [x, size.height - y]),
          layer: 'Regions',
          hidden: false,
        }); // shown to players once the region is revealed
        regions++;
      }
    }
    const moved = created ? 0 : bringUpToDate(db, mapId, size.height, spec, path.join(mapsDir, `${base}.moves.json`), routesFile, regionsFile);
    out.push({ name: spec.name, created, pins, routes, regions, moved });
  }
  return out;
}

/** A library's copy of a shipped map: its scale if it has none, and whatever moved since, where the GM hasn't moved it. */
function bringUpToDate(db: DB, mapId: number, height: number, spec: PinsSpec, movesFile: string, routesFile: string, regionsFile: string): number {
  if (spec.scale_miles) db.prepare('UPDATE maps SET scale_miles = ? WHERE id = ? AND scale_miles IS NULL').run(spec.scale_miles, mapId);
  if (!fs.existsSync(movesFile)) return 0;
  const mv = JSON.parse(fs.readFileSync(movesFile, 'utf8')) as MovesSpec;
  const flip = (pts: [number, number][]) => pts.map(([x, y]) => [x, height - y] as [number, number]);
  let n = 0;
  db.transaction(() => {
    const now = new Map(spec.pins.map((p) => [p.id, p]));
    for (const [id, [ox, oy]] of Object.entries(mv.pins ?? {})) {
      const to = now.get(id);
      if (!to) continue;
      const r = db.prepare('UPDATE map_markers SET x = ?, y = ? WHERE map_id = ? AND entity_id = ? AND abs(x - ?) < 1 AND abs(y - ?) < 1').run(to.x, height - to.y, mapId, id, ox, height - oy);
      n += r.changes;
    }
    if (mv.routes?.length && fs.existsSync(routesFile)) {
      const routes = (JSON.parse(fs.readFileSync(routesFile, 'utf8')) as { routes: { label: string; points: [number, number][] }[] }).routes;
      const shapes = db.prepare(`SELECT id, label, points FROM map_shapes WHERE map_id = ? AND kind = 'route'`).all(mapId) as { id: number; label: string; points: string }[];
      for (const m of mv.routes) {
        const to = routes.find((r) => r.label === m.label);
        const was = flip(m.was_points);
        const s = shapes.find((x) => x.label === m.was_label && samePoints(JSON.parse(x.points) as [number, number][], was));
        if (!to || !s) continue;
        db.prepare('UPDATE map_shapes SET label = ?, points = ? WHERE id = ?').run(to.label, JSON.stringify(flip(to.points)), s.id);
        n++;
      }
    }
    if (mv.regions && fs.existsSync(regionsFile)) {
      const regions = (JSON.parse(fs.readFileSync(regionsFile, 'utf8')) as { regions: { entity_id: string; points: [number, number][] }[] }).regions;
      for (const [id, old] of Object.entries(mv.regions)) {
        const to = regions.find((r) => r.entity_id === id);
        const s = db.prepare(`SELECT id, points FROM map_shapes WHERE map_id = ? AND kind = 'region' AND entity_id = ?`).get(mapId, id) as { id: number; points: string } | undefined;
        if (!to || !s || !samePoints(JSON.parse(s.points) as [number, number][], flip(old))) continue;
        db.prepare('UPDATE map_shapes SET points = ? WHERE id = ?').run(JSON.stringify(flip(to.points)), s.id);
        n++;
      }
    }
  })();
  return n;
}
