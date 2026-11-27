/**
 * Part of a plan drawn again (v0.9.26): the rooms the GM has kept stay as they are while the rest is made afresh, and
 * one room can have what stands in it set down anew, to suit a name it has been given since.
 */
import { furnish, type KeptRoom } from './dungeon.js';
import { PASSAGE, regionAt, regionOf, roomBox } from './edit.js';
import { rng, type Feature, type FeatureKind, type GridPlan, type Opening } from './model.js';

const footOf = (f: Feature): [number, number] => [Math.floor(f.x + f.w / 2), Math.floor(f.y + f.h / 2)];

/** The rooms of a plan that are marked to be kept, as the dungeon maker takes them, and the doors between two of them. */
export function keptRooms(plan: GridPlan): { kept: KeptRoom[]; openings: Opening[] } {
  const regions = new Map<number, KeptRoom>();
  for (const a of plan.areas) {
    const region = regionOf(plan, a);
    if (!a.kept || region <= PASSAGE || regions.has(region)) continue;
    regions.set(region, { at: a.n - 1, squares: [], features: [], label: [Math.floor(a.x), Math.floor(a.y)] });
  }
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) regions.get(plan.cells[y * plan.w + x])?.squares.push([x, y]);
  for (const f of plan.features) regions.get(regionAt(plan, ...footOf(f)))?.features.push({ ...f });
  const openings = plan.openings.filter((o) => {
    const [a, b] = o.side === 'n' ? [regionAt(plan, o.x, o.y - 1), regionAt(plan, o.x, o.y)] : [regionAt(plan, o.x - 1, o.y), regionAt(plan, o.x, o.y)];
    return a !== b && regions.has(a) && regions.has(b);
  });
  return { kept: [...regions.values()], openings };
}

/** What a room's furnishings are not: the stairs and the traps stay where they are when it is furnished again. */
const STAYS = new Set<FeatureKind>(['stairs', 'trap']);

/**
 * A room's furnishings set down afresh, to suit `name`: its walls, its doors, its stairs and its number stay. Null if
 * the place is not a room (a cave's chamber, a number in a passage).
 */
export function furnishAgain(plan: GridPlan, n: number, name: string, seed: number, kinds?: FeatureKind[]): GridPlan | null {
  const area = plan.areas.find((a) => a.n === n);
  const region = area ? regionOf(plan, area) : 0;
  const box = region > PASSAGE && plan.kind !== 'cave' ? roomBox(plan, region) : null;
  if (!area || !box) return null;
  const inRoom = (f: Feature) => regionAt(plan, ...footOf(f)) === region;
  const features = plan.features.filter((f) => !inRoom(f) || STAYS.has(f.kind)).map((f) => ({ ...f }));
  // Kept clear: the squares by a door, what is not this room's, and what stays.
  const clear = new Set<string>();
  for (const o of plan.openings) for (const [x, y] of o.side === 'n' ? [[o.x, o.y - 1], [o.x, o.y]] : [[o.x - 1, o.y], [o.x, o.y]]) clear.add(`${x},${y}`);
  for (const f of features) if (inRoom(f)) for (let y = Math.floor(f.y); y < Math.ceil(f.y + f.h); y++) for (let x = Math.floor(f.x); x < Math.ceil(f.x + f.w); x++) clear.add(`${x},${y}`);
  const made: Feature[] = [];
  furnish(rng(seed), { id: region, name, x: box.x, y: box.y, w: box.w, h: box.h }, made, (x, y) => regionAt(plan, x, y) !== region || clear.has(`${x},${y}`), kinds);
  // Its number moves off anything now standing on it, to the free square nearest where it was.
  const all = [...features, ...made];
  const taken = (x: number, y: number) => all.some((f) => x + 0.85 > f.x && x + 0.15 < f.x + f.w && y + 0.85 > f.y && y + 0.15 < f.y + f.h);
  let [nx, ny] = [Math.floor(area.x), Math.floor(area.y)];
  if (taken(nx, ny)) {
    let d = Infinity;
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        const k = Math.hypot(x + 0.5 - area.x, y + 0.5 - area.y);
        if (regionAt(plan, x, y) === region && !taken(x, y) && k < d) [nx, ny, d] = [x, y, k];
      }
  }
  return { ...plan, features: all, areas: plan.areas.map((a) => (a.n === n ? { ...a, x: nx + 0.5, y: ny + 0.5 } : a)) };
}
