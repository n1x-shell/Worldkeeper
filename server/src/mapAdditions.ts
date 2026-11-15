/**
 * The world's maps, shipped with the Worldkeeper additions: each <name>.pins.json in the maps folder is an image and
 * its pins, with optional <name>.routes.json (travel routes) and <name>.regions.json (region outlines). Positions are
 * pixels from the image's top-left; the atlas measures y from the bottom.
 *
 * Used by the handbook build (a fresh library: only revealed places, all shown) and by "Apply additions" in the GM's
 * own app (an existing library: maps it already has are only topped up, never overwritten).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/connection.js';
import { maps, markers, shapes } from './repo/maps.js';
import { imageSize } from './routes/atlas.js';

interface PinsSpec {
  name: string;
  image: string;
  pins: { id: string; label: string; x: number; y: number; category: string }[];
}

export interface MapApplyResult {
  name: string;
  created: boolean;
  pins: number;
  routes: number;
  regions: number;
}

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
    out.push({ name: spec.name, created, pins, routes, regions });
  }
  return out;
}
