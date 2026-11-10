import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { makeCrud, zId } from './crud.js';
import { parseJson } from '../lib/json.js';
import { TYPE_GROUPS } from '../../../shared/domain.js';

export const maps = makeCrud({
  table: 'maps',
  schema: z.object({
    name: z.string().trim().min(1).max(300),
    kind: z.enum(['image', 'abstract']).default('image'),
    parent_map_id: z.number().int().nullable().optional(),
    entity_id: zId,
    image_file: z.string().regex(/^[\w.-]+$/).max(200).nullable().optional(),
    width: z.number().int().min(100).max(30000).default(2000),
    height: z.number().int().min(100).max(30000).default(1400),
    layers: z.array(z.string().max(100)).max(50).default(['Locations', 'Regions', 'Routes']),
    player_visible: z.boolean().default(false),
  }),
  jsonColumns: ['layers'],
  boolColumns: ['player_visible'],
  orderBy: 'parent_map_id IS NOT NULL, name',
});

export const markers = makeCrud({
  table: 'map_markers',
  schema: z.object({
    map_id: z.number().int(),
    entity_id: zId,
    label: z.string().max(300).default(''),
    x: z.number().min(-100000).max(100000),
    y: z.number().min(-100000).max(100000),
    category: z.string().max(60).default('location'),
    layer: z.string().max(100).default('Locations'),
    hidden: z.boolean().default(true),
    child_map_id: z.number().int().nullable().optional(),
  }),
  boolColumns: ['hidden'],
});

export const shapes = makeCrud({
  table: 'map_shapes',
  schema: z.object({
    map_id: z.number().int(),
    kind: z.enum(['region', 'route']),
    label: z.string().max(300).default(''),
    points: z.array(z.tuple([z.number(), z.number()])).min(2).max(5000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#c9a24a'),
    entity_id: zId,
    layer: z.string().max(100).default('Regions'),
    hidden: z.boolean().default(true),
  }),
  jsonColumns: ['points'],
  boolColumns: ['hidden'],
});

export function mapDetail(db: DB, id: number) {
  const map = maps.get(db, id);
  const ms = db
    .prepare(`SELECT m.*, e.name AS entity_name, e.type AS entity_type FROM map_markers m LEFT JOIN entities e ON e.id = m.entity_id WHERE m.map_id = ?`)
    .all(id)
    .map((r) => ({ ...(r as Record<string, unknown>), hidden: !!(r as { hidden: number }).hidden }));
  const ss = shapes.list(db, { map_id: id });
  const children = maps.list(db, { parent_map_id: id });
  return { map, markers: ms, shapes: ss, children };
}

/**
 * Place-type records with no marker on any map. Scoped to descendants of the map's linked record when given.
 * Includes the source's written placement fields so the DM can position them by hand. No coordinates are invented.
 */
export function unplacedLocations(db: DB, scopeEntityId?: string | null) {
  const placeTypes = TYPE_GROUPS.places;
  const rows = db
    .prepare(
      `SELECT id, name, type, realm, parent_id, fields FROM entities WHERE archived = 0 AND type IN (${placeTypes.map(() => '?').join(',')})
       AND id NOT IN (SELECT entity_id FROM map_markers WHERE entity_id IS NOT NULL) ORDER BY id`,
    )
    .all(...placeTypes) as { id: string; name: string; type: string; realm: string; parent_id: string | null; fields: string }[];
  let allowed: Set<string> | null = null;
  if (scopeEntityId) {
    const scope = db.prepare('SELECT realm, type FROM entities WHERE id = ?').get(scopeEntityId) as { realm: string; type: string } | undefined;
    // Descendants through the parent hierarchy.
    const childrenOf = new Map<string, string[]>();
    for (const r of db.prepare('SELECT id, parent_id FROM entities WHERE parent_id IS NOT NULL').all() as { id: string; parent_id: string }[]) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r.id);
      childrenOf.set(r.parent_id, list);
    }
    allowed = new Set();
    const stack = [scopeEntityId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of childrenOf.get(cur) ?? []) if (!allowed.has(c)) (allowed.add(c), stack.push(c));
    }
    // Continents/realms: also include everything recorded in that realm.
    if (scope && (scope.type === 'continent' || scope.type === 'realm')) for (const r of rows) if (r.realm === scope.realm) allowed.add(r.id);
  }
  return rows
    .filter((r) => !allowed || allowed.has(r.id))
    .map((r) => {
      const fields = parseJson<[string, string][]>(r.fields, []);
      const placement = fields.filter(([k]) => /placement|compass|position|region|travel|location/i.test(k)).map(([k, v]) => `${k}: ${v}`);
      return { id: r.id, name: r.name, type: r.type, realm: r.realm, parent_id: r.parent_id, placement };
    });
}
