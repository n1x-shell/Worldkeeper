/**
 * A plan changed by hand (v0.9.26): the tools, and the surface over the picture that they work on. Rooms are drawn,
 * moved, resized and taken away; passages cut; squares rubbed out; doors put in walls; things set down; ready-made
 * pieces set down whole; a settlement's buildings moved, turned, added and removed.
 *
 * Everything can be done with a pointer or with the keyboard: the arrow keys move a cursor over the squares, and Enter
 * uses the tool where the cursor is. Each change is told to the maker, which keeps the drawing and its key in step.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Armchair, Check as Tick, DoorOpen, Eraser, Hash, House, Lock, LockOpen, Minus, MousePointer2, Paintbrush, Plus, Puzzle, Redo2, RefreshCw, RotateCcw, RotateCw, Sofa, Square, Trash2, Undo2 } from 'lucide-react';
import {
  DIRS,
  MAX_NAMES,
  OPENINGS,
  PASSAGE,
  PIECES,
  THINGS,
  addBuilding,
  addNumber,
  addRoom,
  areaIn,
  buildingAt,
  edgeToward,
  featureAt,
  keep,
  moveBuilding,
  moveNumber,
  moveRoom,
  nearestEdge,
  numberBuilding,
  openingAt,
  pack,
  paint,
  pieceSize,
  pieceSquares,
  putThing,
  redrawRest,
  refurnish,
  regionAt,
  regionOf,
  removeBuilding,
  removeRoom,
  resizeRoom,
  roomBox,
  rubOut,
  scaleBuilding,
  setDown,
  setOpening,
  takeThing,
  turnBuilding,
  turnThing,
  unnumber,
  withShift,
  type FeatureKind,
  type GridPlan,
  type OpeningKind,
  type Plan,
  type PlanSettings,
  type Pt,
  type TownPlan,
} from '@shared/plan/index';

type Tool = 'select' | 'room' | 'floor' | 'rub' | 'door' | 'thing' | 'number' | 'piece' | 'house';
const TOOL_INFO: Record<Tool, { label: string; icon: typeof Square; hint: string }> = {
  select: { label: 'Choose', icon: MousePointer2, hint: 'Choose a room to move it (drag it, or Alt and the arrow keys), to change its size (drag an edge, or Shift and the arrow keys), or to take it away (Delete).' },
  room: { label: 'Room', icon: Square, hint: 'Drag from one corner of the new room to the other. With the keyboard: Enter at one corner, then Enter at the other.' },
  floor: { label: 'Floor', icon: Paintbrush, hint: 'Drag to cut floor. Begun in a room, it adds to that room; begun anywhere else, it cuts a passage.' },
  rub: { label: 'Rub out', icon: Eraser, hint: 'Click a thing or a door to take it away. Drag over floor to fill it in again.' },
  door: { label: 'Door', icon: DoorOpen, hint: 'Click a wall to put one in it; click it again to take it out. With the keyboard: Shift and an arrow key, for the wall on that side.' },
  thing: { label: 'Thing', icon: Armchair, hint: 'Click a square of floor to set it down. Click it again to turn it.' },
  number: { label: 'Number', icon: Hash, hint: 'Click a floor to give it a number and a place in the key. In a room that has one, its number moves there.' },
  piece: { label: 'Piece', icon: Puzzle, hint: 'Click to set a ready-made piece down. Where its passage ends, cut floor to join it up.' },
  house: { label: 'House', icon: House, hint: 'Click to set down a house.' },
};
const TOWN_HINT = 'Choose a building to move it (drag it, or Alt and the arrow keys), turn it, resize it or take it away. Streets, walls and water stay as drawn.';
const CAVE_FLOOR_HINT = 'Drag to open up more of the cave.';
const TOOLS: Record<Plan['kind'], Tool[]> = {
  dungeon: ['select', 'room', 'floor', 'rub', 'door', 'thing', 'number', 'piece'],
  building: ['select', 'room', 'floor', 'rub', 'door', 'thing', 'number', 'piece'],
  ship: ['select', 'room', 'floor', 'rub', 'door', 'thing', 'number'],
  cave: ['select', 'floor', 'rub', 'thing', 'number'],
  settlement: ['select', 'house'],
};

/** What is in hand between pressing and letting go (or, with the keyboard, between one Enter and the next). */
type Held =
  | { kind: 'room'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'paint'; rub: boolean; region: number; squares: Pt[]; fx: number; fy: number }
  | { kind: 'move'; region: number; n: number; fx: number; fy: number; dx: number; dy: number; ok: boolean }
  | { kind: 'number'; n: number; x: number; y: number; from: Pt }
  | { kind: 'size'; region: number; n: number; side: number; x: number; y: number; w: number; h: number; from: { x: number; y: number; w: number; h: number } }
  | { kind: 'click'; x: number; y: number; fx: number; fy: number }
  | { kind: 'house'; i: number; fx: number; fy: number; dx: number; dy: number };

const EDIT = '#1f6feb';
const BAD = '#d1242f';
const KEPT = '#b7791f';
const newSeed = () => 1 + Math.floor(Math.random() * 2147483646);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The squares on the way from one square to another, both included. */
function line(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let [x, y] = a;
  const [dx, dy] = [Math.abs(b[0] - x), Math.abs(b[1] - y)];
  const [sx, sy] = [x < b[0] ? 1 : -1, y < b[1] ? 1 : -1];
  for (let err = dx - dy, guard = 0; guard < 1000; guard++) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) break;
    // One step at a time, never cornerwise: a passage a square wide has no gaps in it.
    if (2 * err > -dy) ((err -= dy), (x += sx));
    else ((err += dx), (y += sy));
  }
  return out;
}
const unchanged = (a: Plan, b: Plan) => JSON.stringify(pack(a)) === JSON.stringify(pack(b));
const THING_LABEL = new Map(THINGS);

export function PlanEditor({
  plan,
  names,
  settings,
  selected,
  onSelect,
  onChange,
  mayRemove,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDone,
  children,
}: {
  plan: Plan;
  /** What the key calls each numbered place, in order. */
  names: string[];
  settings: PlanSettings;
  selected: number | null;
  onSelect: (i: number | null) => void;
  /** The plan as changed, and what to say of the change. */
  onChange: (next: Plan, said: string) => void;
  /** Asked before a place is taken away: says no if the GM thinks better of it. */
  mayRemove: (n: number) => Promise<boolean>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDone: () => void;
  /** The picture the surface lies over. */
  children: ReactNode;
}) {
  const grid: GridPlan | null = plan.kind === 'settlement' ? null : plan;
  const town: TownPlan | null = plan.kind === 'settlement' ? plan : null;
  const tools = TOOLS[plan.kind];
  const [tool, setTool] = useState<Tool>('select');
  const [doorKind, setDoorKind] = useState<OpeningKind>('door');
  const [thing, setThing] = useState<FeatureKind>('table');
  const [dir, setDir] = useState<0 | 1 | 2 | 3>(0);
  const [pieceKey, setPieceKey] = useState(PIECES[0].key);
  const [turns, setTurns] = useState(0);
  const [cursorAt, setCursor] = useState<Pt>(() => [plan.w >> 1, plan.h >> 1]);
  const [focused, setFocused] = useState(false);
  // The cursor is shown while the keyboard is in use, not for a pointer.
  const [keys, setKeys] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const [said, setSaid] = useState('');
  const [houseAt, setHouse] = useState<number | null>(null);
  // What is in hand is read when the pointer is let go, which may be before the page has drawn it: so it is kept twice.
  const heldRef = useRef<Held | null>(null);
  const [held, setHeldState] = useState<Held | null>(null);
  const setHeld = (h: Held | null) => {
    heldRef.current = h;
    setHeldState(h);
  };
  const surface = useRef<HTMLDivElement>(null);

  const cursor: Pt = [clamp(cursorAt[0], 0, plan.w - 1), clamp(cursorAt[1], 0, plan.h - 1)];
  const count = plan.areas.length;
  const nameOf = (n: number) => names[n - 1] ?? plan.areas.find((a) => a.n === n)?.name ?? `Place ${n}`;
  const piece = PIECES.find((p) => p.key === pieceKey) ?? PIECES[0];

  // The place chosen, and if it is a room, its squares.
  const area = selected != null ? plan.areas.find((a) => a.n === selected + 1) : undefined;
  const chosen = useMemo(() => {
    if (!grid || !area) return null;
    const region = regionOf(grid, area);
    const isRoom = grid.kind !== 'cave' && region > PASSAGE;
    return { region, isRoom, box: isRoom ? roomBox(grid, region) : null };
  }, [grid, area]);
  const keptBoxes = useMemo(() => (grid ? grid.areas.filter((a) => a.kept).flatMap((a) => roomBox(grid, regionOf(grid, a)) ?? []) : []), [grid]);
  const keptCount = plan.areas.filter((a) => a.kept).length;
  const keyHouse = town && selected != null ? town.buildings.findIndex((b) => b.key === selected + 1) : -1;
  const house = town ? (houseAt != null && town.buildings[houseAt] ? houseAt : keyHouse) : -1;

  /** A change made, or not: what is said either way. */
  const done = (make: () => Plan | null | undefined, did: string, failed = 'That can’t be done there.'): boolean => {
    const [next, dx, dy] = withShift(make);
    if (!next) {
      setSaid(failed);
      return false;
    }
    if (unchanged(next, plan)) {
      setSaid('Nothing to change there.');
      return false;
    }
    onChange(next, did);
    setSaid(did);
    // The sheet may have grown at its left or its top: the cursor stays on the same spot of the drawing.
    if (dx || dy) setCursor(([x, y]) => [x + dx, y + dy]);
    return true;
  };
  const full = () => {
    if (count < MAX_NAMES) return false;
    setSaid(`A plan has at most ${MAX_NAMES} numbered places.`);
    return true;
  };

  // ---- What each tool does at a square ---------------------------------------------------------------------------------
  const putDoor = (g: GridPlan, e: { x: number; y: number; side: 'n' | 'w' }) => {
    const there = openingAt(g, e.x, e.y, e.side);
    if (there?.kind === doorKind) return done(() => setOpening(g, e.x, e.y, e.side, null), 'The door is taken out.');
    const label = OPENINGS.find(([k]) => k === doorKind)?.[1] ?? 'Door';
    return done(() => setOpening(g, e.x, e.y, e.side, doorKind), `${label} put in.`, 'There is no wall there to put it in: a door goes between two rooms, or a room and a passage.');
  };
  const pieceCorner = (x: number, y: number): Pt => {
    const [pw, ph] = pieceSize(piece, turns);
    return [x - (pw >> 1), y - (ph >> 1)];
  };
  const applyAt = (g: GridPlan, x: number, y: number, fx: number, fy: number) => {
    if (tool === 'door') return putDoor(g, nearestEdge(x, y, fx - x, fy - y));
    if (tool === 'thing') {
      const there = featureAt(g, x, y);
      if (there >= 0 && g.features[there].kind === thing) return done(() => turnThing(g, x, y), 'Turned.', 'There is no room to turn it there.');
      return done(() => putThing(g, thing, x, y, dir), `${THING_LABEL.get(thing) ?? 'It'} set down.`, 'It needs floor under all of it.');
    }
    if (tool === 'number') {
      const region = regionAt(g, x, y);
      if (region === 0) return setSaid('A number goes on a floor.');
      const has = areaIn(g, region);
      if (has) return done(() => moveNumber(g, has.n, x, y), `The number of ${nameOf(has.n)} moved.`);
      if (full()) return;
      return done(() => addNumber(g, x, y, count + 1, 'A new place'), `Numbered ${count + 1}. Name it in the key.`);
    }
    if (tool === 'piece') {
      if (count + piece.rooms.length > MAX_NAMES) return void full();
      const [px, py] = pieceCorner(x, y);
      return done(() => setDown(g, piece, px, py, turns, count + 1)?.plan, `${piece.label} set down.`, 'A room is in the way there.');
    }
  };
  /** What was in hand, let go of. */
  const finish = (h: Held) => {
    if (h.kind === 'house') {
      if (town && (h.dx || h.dy)) done(() => moveBuilding(town, h.i, h.dx, h.dy), 'Building moved.', 'It would be off the sheet there.');
      return;
    }
    if (!grid) return;
    if (h.kind === 'room') {
      if (h.ax === h.bx && h.ay === h.by) return setSaid('Drag from one corner of the room to the other.');
      if (full()) return;
      done(() => addRoom(grid, h.ax, h.ay, h.bx, h.by, count + 1, 'A new room'), `A new room, numbered ${count + 1}. Name it in the key.`, 'There is no free ground there for a room.');
    } else if (h.kind === 'paint' && !h.rub) done(() => paint(grid, h.squares, h.region), 'Floor cut.');
    else if (h.kind === 'paint') {
      const [x, y] = h.squares[0];
      if (h.squares.length === 1) {
        // One square: the thing on it first, then a door in the wall beside the pointer, then the floor itself.
        if (featureAt(grid, x, y) >= 0) return void done(() => takeThing(grid, x, y), 'Taken away.');
        const e = nearestEdge(x, y, h.fx - x, h.fy - y);
        const near = Math.min(h.fx - x, h.fy - y, 1 - (h.fx - x), 1 - (h.fy - y)) < 0.25;
        if (near && openingAt(grid, e.x, e.y, e.side)) return void done(() => setOpening(grid, e.x, e.y, e.side, null), 'The door is taken out.');
      }
      done(() => rubOut(grid, h.squares), 'Filled in.');
    } else if (h.kind === 'move') {
      if (h.dx || h.dy) done(() => moveRoom(grid, h.region, h.dx, h.dy), `${nameOf(h.n)} moved.`, 'It can’t go there: another room is in the way.');
    } else if (h.kind === 'number') {
      if (h.x !== h.from[0] || h.y !== h.from[1]) done(() => moveNumber(grid, h.n, h.x, h.y), `The number of ${nameOf(h.n)} moved.`, 'A number stays on its own floor.');
    } else if (h.kind === 'size') {
      if (h.x !== h.from.x || h.y !== h.from.y || h.w !== h.from.w || h.h !== h.from.h) done(() => resizeRoom(grid, h.region, h.x, h.y, h.w, h.h), `${nameOf(h.n)} is now ${h.w * grid.feet} × ${h.h * grid.feet} ft.`, 'It can’t be that size: another room is in the way.');
    } else applyAt(grid, h.x, h.y, h.fx, h.fy);
  };

  // ---- The pointer -----------------------------------------------------------------------------------------------------
  const at = (e: { clientX: number; clientY: number }) => {
    const r = surface.current?.getBoundingClientRect();
    if (!r?.width) return { fx: 0, fy: 0, x: 0, y: 0 };
    const fx = clamp(((e.clientX - r.left) / r.width) * plan.w, -40, plan.w + 40);
    const fy = clamp(((e.clientY - r.top) / r.height) * plan.h, -40, plan.h + 40);
    return { fx, fy, x: Math.floor(fx), y: Math.floor(fy) };
  };
  /** The middle of each side of a room's oblong, in the order north, east, south, west. */
  const handles = (b: { x: number; y: number; w: number; h: number }): Pt[] => [
    [b.x + b.w / 2, b.y],
    [b.x + b.w, b.y + b.h / 2],
    [b.x + b.w / 2, b.y + b.h],
    [b.x, b.y + b.h / 2],
  ];
  const placeAt = (g: GridPlan, fx: number, fy: number) => g.areas.find((a) => Math.hypot(a.x - fx, a.y - fy) < 0.7) ?? areaIn(g, regionAt(g, fx, fy));

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setKeys(false);
    setCursor([p.x, p.y]);
    setHover(null);
    if (town) {
      if (tool === 'house') return setHeld({ kind: 'click', ...p });
      const i = buildingAt(town, p.fx, p.fy);
      setHouse(i >= 0 ? i : null);
      onSelect(i >= 0 && town.buildings[i].key ? town.buildings[i].key - 1 : null);
      if (i >= 0) setHeld({ kind: 'house', i, fx: p.fx, fy: p.fy, dx: 0, dy: 0 });
      return;
    }
    if (!grid) return;
    if (tool === 'select') {
      if (chosen?.box?.whole && area) {
        const side = handles(chosen.box).findIndex(([hx, hy]) => Math.hypot(hx - p.fx, hy - p.fy) < 0.55);
        if (side >= 0) return setHeld({ kind: 'size', region: chosen.region, n: area.n, side, ...chosen.box, from: chosen.box });
      }
      const place = placeAt(grid, p.fx, p.fy);
      if (!place) return onSelect(null);
      onSelect(place.n - 1);
      const region = regionOf(grid, place);
      if (grid.kind !== 'cave' && region > PASSAGE && regionAt(grid, p.x, p.y) === region) setHeld({ kind: 'move', region, n: place.n, fx: p.fx, fy: p.fy, dx: 0, dy: 0, ok: true });
      else setHeld({ kind: 'number', n: place.n, x: Math.floor(place.x), y: Math.floor(place.y), from: [Math.floor(place.x), Math.floor(place.y)] });
    } else if (tool === 'room') setHeld({ kind: 'room', ax: p.x, ay: p.y, bx: p.x, by: p.y });
    else if (tool === 'floor') setHeld({ kind: 'paint', rub: false, region: regionAt(grid, p.x, p.y) || (grid.kind === 'cave' ? (grid.cells.find((v) => v !== 0) ?? 2) : PASSAGE), squares: [[p.x, p.y]], fx: p.fx, fy: p.fy });
    else if (tool === 'rub') setHeld({ kind: 'paint', rub: true, region: 0, squares: [[p.x, p.y]], fx: p.fx, fy: p.fy });
    else setHeld({ kind: 'click', ...p });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = at(e);
    const h = heldRef.current;
    if (!h) {
      // Only when it matters: a door follows the pointer within a square, the rest from square to square.
      if (!hover || hover.x !== p.x || hover.y !== p.y || tool === 'door') setHover(p);
      return;
    }
    if (h.kind === 'room') {
      if (p.x !== h.bx || p.y !== h.by) setHeld({ ...h, bx: p.x, by: p.y });
    } else if (h.kind === 'paint') {
      const last = h.squares[h.squares.length - 1];
      if (last[0] !== p.x || last[1] !== p.y) setHeld({ ...h, squares: [...h.squares, ...line(last, [p.x, p.y]).slice(1)] });
    } else if (h.kind === 'move' && grid) {
      const [dx, dy] = [Math.round(p.fx - h.fx), Math.round(p.fy - h.fy)];
      if (dx !== h.dx || dy !== h.dy) setHeld({ ...h, dx, dy, ok: (!dx && !dy) || !!moveRoom(grid, h.region, dx, dy) });
    } else if (h.kind === 'number') {
      if (p.x !== h.x || p.y !== h.y) setHeld({ ...h, x: p.x, y: p.y });
    } else if (h.kind === 'size') {
      const f = h.from;
      const [rx, ry] = [Math.round(p.fx), Math.round(p.fy)];
      const next =
        h.side === 0
          ? { ...h, y: Math.min(ry, f.y + f.h - 1), h: f.y + f.h - Math.min(ry, f.y + f.h - 1) }
          : h.side === 2
            ? { ...h, h: Math.max(1, ry - f.y) }
            : h.side === 3
              ? { ...h, x: Math.min(rx, f.x + f.w - 1), w: f.x + f.w - Math.min(rx, f.x + f.w - 1) }
              : { ...h, w: Math.max(1, rx - f.x) };
      if (next.x !== h.x || next.y !== h.y || next.w !== h.w || next.h !== h.h) setHeld(next);
    } else if (h.kind === 'house') {
      const [dx, dy] = [Math.round((p.fx - h.fx) * 4) / 4, Math.round((p.fy - h.fy) * 4) / 4];
      if (dx !== h.dx || dy !== h.dy) setHeld({ ...h, dx, dy });
    }
  };
  const up = () => {
    const h = heldRef.current;
    setHeld(null);
    if (!h) return;
    if (town && h.kind === 'click') {
      const made = addBuilding(town, Math.round(h.fx * 2) / 2, Math.round(h.fy * 2) / 2);
      if (done(() => made, 'A house set down.', 'It would be off the sheet there.')) setHouse(town.buildings.length);
      return;
    }
    finish(h);
  };

  // ---- The keyboard ----------------------------------------------------------------------------------------------------
  const describe = ([x, y]: Pt): string => {
    if (town) {
      const i = buildingAt(town, x + 0.5, y + 0.5);
      return `Square ${x + 1}, ${y + 1}: ${i < 0 ? 'no building' : town.buildings[i].key ? `${nameOf(town.buildings[i].key)} (${town.buildings[i].key})` : 'a house'}`;
    }
    if (!grid) return '';
    const region = regionAt(grid, x, y);
    const place = region ? grid.areas.find((a) => Math.floor(a.x) === x && Math.floor(a.y) === y) ?? areaIn(grid, region) : undefined;
    const what = region === 0 ? (grid.rock[y * grid.w + x] ? 'solid rock' : 'open ground') : place ? `${nameOf(place.n)} (${place.n})` : grid.kind === 'cave' ? 'cave floor' : region === PASSAGE ? 'passage' : 'a room with no number';
    const f = featureAt(grid, x, y);
    return `Square ${x + 1}, ${y + 1}: ${what}${f >= 0 ? `, ${(THING_LABEL.get(grid.features[f].kind) ?? grid.features[f].kind).toLowerCase()}` : ''}`;
  };
  const removeChosen = async () => {
    if (town) {
      if (house < 0) return;
      const n = town.buildings[house].key;
      if (n && !(await mayRemove(n))) return;
      if (done(() => removeBuilding(town, house), 'Building taken away.')) setHouse(null);
      return;
    }
    if (!grid || !area || !(await mayRemove(area.n))) return;
    done(() => removeRoom(grid, area.n), `${nameOf(area.n)} is taken away.`);
  };
  const turn = () => {
    if (tool === 'piece') setTurns((t) => (t + 1) % 4);
    else setDir((d) => ((d + 1) % 4) as 0 | 1 | 2 | 3);
  };
  const press = () => {
    const [x, y] = cursor;
    const h = heldRef.current;
    if (town) {
      if (tool === 'house') {
        if (done(() => addBuilding(town, x + 0.5, y + 0.5), 'A house set down.', 'It would be off the sheet there.')) setHouse(town.buildings.length);
        return;
      }
      const i = buildingAt(town, x + 0.5, y + 0.5);
      setHouse(i >= 0 ? i : null);
      onSelect(i >= 0 && town.buildings[i].key ? town.buildings[i].key - 1 : null);
      return setSaid(i >= 0 ? 'Building chosen.' : 'No building there.');
    }
    if (!grid) return;
    if (tool === 'select') {
      const place = placeAt(grid, x + 0.5, y + 0.5);
      onSelect(place ? place.n - 1 : null);
      return setSaid(place ? `${nameOf(place.n)} chosen.` : 'Nothing to choose there.');
    }
    if (tool === 'door') return setSaid('Hold Shift and press an arrow key to put it in the wall on that side.');
    if (tool === 'room' || tool === 'floor' || tool === 'rub') {
      if (h) {
        setHeld(null);
        return finish(h);
      }
      if (tool === 'room') {
        setHeld({ kind: 'room', ax: x, ay: y, bx: x, by: y });
        return setSaid('One corner set. Move to the opposite corner and press Enter.');
      }
      setHeld({ kind: 'paint', rub: tool === 'rub', region: tool === 'rub' ? 0 : regionAt(grid, x, y) || (grid.kind === 'cave' ? (grid.cells.find((v) => v !== 0) ?? 2) : PASSAGE), squares: [[x, y]], fx: x + 0.5, fy: y + 0.5 });
      return setSaid(tool === 'rub' ? 'Rubbing out. Move over what is to go, then press Enter.' : 'Cutting floor. Move along the way to cut, then press Enter.');
    }
    applyAt(grid, x, y, x + 0.5, y + 0.5);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k !== 'Tab' && k !== 'Shift') setKeys(true);
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z' || k === 'y' || k === 'Y')) {
      e.preventDefault();
      if (k === 'y' || k === 'Y' || e.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const arrow = k === 'ArrowUp' ? 0 : k === 'ArrowRight' ? 1 : k === 'ArrowDown' ? 2 : k === 'ArrowLeft' ? 3 : -1;
    if (arrow >= 0) {
      e.preventDefault();
      const [dx, dy] = DIRS[arrow];
      if (town) {
        if (e.altKey && house >= 0) return void done(() => moveBuilding(town, house, dx / 2, dy / 2), 'Building moved.', 'It would be off the sheet there.');
      } else if (grid) {
        if (tool === 'select' && e.altKey && chosen?.isRoom && area) return void done(() => moveRoom(grid, chosen.region, dx, dy), `${nameOf(area.n)} moved.`, 'It can’t go there: another room is in the way.');
        if (tool === 'select' && e.shiftKey && chosen?.box?.whole && area) {
          const b = chosen.box;
          return void done(() => resizeRoom(grid, chosen.region, b.x, b.y, b.w + dx, b.h + dy), `${nameOf(area.n)} is now ${(b.w + dx) * grid.feet} × ${(b.h + dy) * grid.feet} ft.`, 'It can’t be that size.');
        }
        if (tool === 'door' && e.shiftKey) return void putDoor(grid, edgeToward(cursor[0], cursor[1], arrow));
      }
      const next: Pt = [clamp(cursor[0] + dx, 0, plan.w - 1), clamp(cursor[1] + dy, 0, plan.h - 1)];
      setCursor(next);
      const h = heldRef.current;
      if (h?.kind === 'room') setHeld({ ...h, bx: next[0], by: next[1] });
      else if (h?.kind === 'paint') setHeld({ ...h, squares: [...h.squares, next] });
      return setSaid(describe(next));
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      press();
    } else if (k === 'Escape') {
      if (heldRef.current) {
        setHeld(null);
        setSaid('Let go.');
      } else {
        onSelect(null);
        setHouse(null);
      }
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      void removeChosen();
    } else if (k === 'r' || k === 'R') turn();
  };

  // ---- What is drawn over the picture -----------------------------------------------------------------------------------
  const thin = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 2, fill: 'none' };
  const squares = (list: Pt[], colour: string) => list.map(([x, y], i) => <rect key={`${x},${y},${i}`} x={x} y={y} width={1} height={1} fill={colour} fillOpacity={0.3} />);
  const spot = hover ?? (focused && keys ? { x: cursor[0], y: cursor[1], fx: cursor[0] + 0.5, fy: cursor[1] + 0.5 } : null);
  const overlay = () => {
    const out: ReactNode[] = [];
    if (grid) {
      keptBoxes.forEach((b, i) => out.push(<rect key={`kept${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={KEPT} fillOpacity={0.16} stroke={KEPT} vectorEffect="non-scaling-stroke" strokeWidth={2} />));
      if (chosen?.box && held?.kind !== 'size') {
        const b = chosen.box;
        out.push(<rect key="chosen" x={b.x} y={b.y} width={b.w} height={b.h} stroke={EDIT} strokeDasharray="6 4" {...thin} />);
        if (tool === 'select' && b.whole) handles(b).forEach(([hx, hy], i) => out.push(<rect key={`handle${i}`} x={hx - 0.16} y={hy - 0.16} width={0.32} height={0.32} fill="#ffffff" stroke={EDIT} vectorEffect="non-scaling-stroke" strokeWidth={2} />));
      }
      if (held?.kind === 'room') out.push(<rect key="room" x={Math.min(held.ax, held.bx)} y={Math.min(held.ay, held.by)} width={Math.abs(held.ax - held.bx) + 1} height={Math.abs(held.ay - held.by) + 1} fill={EDIT} fillOpacity={0.2} stroke={EDIT} vectorEffect="non-scaling-stroke" strokeWidth={2} />);
      if (held?.kind === 'paint') out.push(...squares(held.squares, held.rub ? BAD : EDIT));
      if (held?.kind === 'move' && chosen?.box) out.push(<rect key="move" x={chosen.box.x + held.dx} y={chosen.box.y + held.dy} width={chosen.box.w} height={chosen.box.h} fill={held.ok ? EDIT : BAD} fillOpacity={0.2} stroke={held.ok ? EDIT : BAD} vectorEffect="non-scaling-stroke" strokeWidth={2} />);
      if (held?.kind === 'size') out.push(<rect key="size" x={held.x} y={held.y} width={held.w} height={held.h} fill={EDIT} fillOpacity={0.2} stroke={EDIT} vectorEffect="non-scaling-stroke" strokeWidth={2} />);
      if (held?.kind === 'number') out.push(<circle key="number" cx={held.x + 0.5} cy={held.y + 0.5} r={0.4} stroke={EDIT} {...thin} />);
      if (spot && !held) {
        if (tool === 'piece') {
          const [px, py] = pieceCorner(spot.x, spot.y);
          out.push(...squares(pieceSquares(piece, px, py, turns), setDown(grid, piece, px, py, turns, count + 1) ? EDIT : BAD));
        } else if (tool === 'door' && hover) {
          const e = nearestEdge(spot.x, spot.y, spot.fx - spot.x, spot.fy - spot.y);
          out.push(<line key="edge" x1={e.x} y1={e.y} x2={e.side === 'n' ? e.x + 1 : e.x} y2={e.side === 'n' ? e.y : e.y + 1} stroke={EDIT} vectorEffect="non-scaling-stroke" strokeWidth={5} strokeLinecap="round" />);
        }
      }
    }
    if (town) {
      const b = house >= 0 ? town.buildings[house] : null;
      const [dx, dy] = held?.kind === 'house' ? [held.dx, held.dy] : [0, 0];
      if (b) out.push(<polygon key="house" points={b.corners.map(([x, y]) => `${x + dx},${y + dy}`).join(' ')} fill={EDIT} fillOpacity={0.2} stroke={EDIT} vectorEffect="non-scaling-stroke" strokeWidth={2} />);
    }
    if (focused && keys) out.push(<rect key="cursor" x={cursor[0]} y={cursor[1]} width={1} height={1} stroke="#111111" strokeDasharray="3 3" {...thin} />);
    return out;
  };

  const hint = town && tool === 'select' ? TOWN_HINT : plan.kind === 'cave' && tool === 'floor' ? CAVE_FLOOR_HINT : TOOL_INFO[tool].hint;
  const chosenBuilding = town && house >= 0 ? town.buildings[house] : null;

  return (
    <div className="space-y-2" data-testid="plan-editor">
      <div className="panel flex flex-wrap items-center gap-1.5 p-2" role="toolbar" aria-label="Tools for changing the plan by hand">
        {tools.map((t) => {
          const Icon = TOOL_INFO[t].icon;
          return (
            <button
              key={t}
              type="button"
              className={`btn-ghost ${tool === t ? 'bg-raised text-gold' : ''}`}
              aria-pressed={tool === t}
              title={t === 'select' && town ? TOWN_HINT : TOOL_INFO[t].hint}
              onClick={() => {
                setTool(t);
                setHeld(null);
                setSaid('');
              }}
              data-testid={`plan-tool-${t}`}
            >
              <Icon size={14} /> {TOOL_INFO[t].label}
            </button>
          );
        })}
        {tool === 'door' && (
          <select className="input w-auto" aria-label="Kind of door" value={doorKind} onChange={(e) => setDoorKind(e.target.value as OpeningKind)}>
            {OPENINGS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
        {tool === 'thing' && (
          <select className="input w-auto" aria-label="What to set down" value={thing} onChange={(e) => setThing(e.target.value as FeatureKind)}>
            {THINGS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
        {tool === 'piece' && (
          <select className="input w-auto" aria-label="Which piece" value={pieceKey} onChange={(e) => setPieceKey(e.target.value)} title={piece.about}>
            {PIECES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {(tool === 'thing' || tool === 'piece') && (
          <button type="button" className="btn-ghost" onClick={turn} title="Turn it a quarter turn (R)">
            <RotateCw size={14} /> Turn
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-ghost" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)" data-testid="plan-undo">
            <Undo2 size={14} /> Undo
          </button>
          <button type="button" className="btn-ghost" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} /> Redo
          </button>
          {plan.kind === 'dungeon' && (
            <button
              type="button"
              className="btn"
              disabled={!keptCount}
              title={keptCount ? 'The rooms you have kept stay where they are, with what is in them. Every other room is set down afresh, and the passages and doors are cut anew.' : 'Keep a room first: choose it, then press Keep.'}
              onClick={() => done(() => redrawRest(plan, settings, names, newSeed()), `Drawn again around the ${keptCount === 1 ? 'room' : `${keptCount} rooms`} kept.`)}
              data-testid="plan-redraw-rest"
            >
              <RefreshCw size={14} /> Redraw the rest
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onDone} data-testid="plan-edit-done">
            <Tick size={14} /> Done
          </button>
        </span>
      </div>
      <p className="text-xs text-dim" id="plan-editor-help">
        {hint}
        {tool === 'piece' && <> {piece.about}</>}
      </p>

      <div className="panel elev-1 overflow-auto p-2">
        <div className="relative mx-auto w-fit">
          {children}
          <div
            ref={surface}
            tabIndex={0}
            role="application"
            aria-label="The plan, to change by hand. The arrow keys move over it a square at a time; Enter uses the tool where you are; Escape lets go."
            aria-describedby="plan-editor-help"
            className={`absolute inset-0 touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gold ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setHeld(null)}
            onPointerLeave={() => setHover(null)}
            onKeyDown={key}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            data-testid="plan-surface"
          >
            <svg viewBox={`0 0 ${plan.w} ${plan.h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {overlay()}
            </svg>
          </div>
        </div>
      </div>
      <p className="min-h-5 text-sm" role="status" data-testid="plan-said">
        {said}
      </p>

      {/* ---- The place chosen: what can be done with all of it ---- */}
      {grid && area && chosen && (
        <div className="panel flex flex-wrap items-center gap-2 p-2 text-sm" data-testid="plan-chosen">
          <span className="font-medium">
            {area.n}. {nameOf(area.n)}
          </span>
          {chosen.box && (
            <span className="text-dim">
              {chosen.box.w * grid.feet} × {chosen.box.h * grid.feet} ft
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-1.5">
            {plan.kind === 'dungeon' && chosen.isRoom && (
              <button
                type="button"
                className="btn"
                aria-pressed={!!area.kept}
                title="A kept room stays as it is when the rest is drawn again."
                onClick={() => done(() => keep(grid, area.n, !area.kept), area.kept ? `${nameOf(area.n)} is no longer kept.` : `${nameOf(area.n)} is kept: it stays when the rest is drawn again.`)}
                data-testid="plan-keep-room"
              >
                {area.kept ? <Lock size={14} /> : <LockOpen size={14} />} {area.kept ? 'Kept' : 'Keep'}
              </button>
            )}
            {chosen.isRoom && (
              <button type="button" className="btn" title="What stands in it is set down afresh, to suit the name it has now. Its walls, doors and stairs stay." onClick={() => done(() => refurnish(grid, settings, area.n, nameOf(area.n), newSeed()), `${nameOf(area.n)} furnished again.`, 'Only a room can be furnished.')} data-testid="plan-refurnish">
                <Sofa size={14} /> Furnish it again
              </button>
            )}
            <button type="button" className="btn" onClick={() => void removeChosen()} data-testid="plan-remove-room">
              <Trash2 size={14} /> Take it away
            </button>
          </span>
        </div>
      )}
      {town && chosenBuilding && (
        <div className="panel flex flex-wrap items-center gap-2 p-2 text-sm" data-testid="plan-chosen">
          <span className="font-medium">{chosenBuilding.key ? `${chosenBuilding.key}. ${nameOf(chosenBuilding.key)}` : 'A house'}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <button type="button" className="btn" onClick={() => done(() => turnBuilding(town, house, -15), 'Turned.', 'It would be off the sheet.')} data-testid="plan-turn-left">
              <RotateCcw size={14} /> Turn left
            </button>
            <button type="button" className="btn" onClick={() => done(() => turnBuilding(town, house, 15), 'Turned.', 'It would be off the sheet.')} data-testid="plan-turn-right">
              <RotateCw size={14} /> Turn right
            </button>
            <button type="button" className="btn" onClick={() => done(() => scaleBuilding(town, house, 1.15), 'Made larger.', 'It can’t be larger than that.')}>
              <Plus size={14} /> Larger
            </button>
            <button type="button" className="btn" onClick={() => done(() => scaleBuilding(town, house, 1 / 1.15), 'Made smaller.', 'It can’t be smaller than that.')}>
              <Minus size={14} /> Smaller
            </button>
            {chosenBuilding.key ? (
              <button
                type="button"
                className="btn"
                title="It comes out of the key, and stays on the plan as a house like any other."
                onClick={async () => {
                  const n = chosenBuilding.key!;
                  if (await mayRemove(n)) done(() => unnumber(town, n), 'Its number is taken away.');
                }}
              >
                <Hash size={14} /> Take its number away
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => !full() && done(() => numberBuilding(town, house, count + 1, 'A new place'), `Numbered ${count + 1}. Name it in the key.`)} data-testid="plan-number-house">
                <Hash size={14} /> Give it a number
              </button>
            )}
            <button type="button" className="btn" onClick={() => void removeChosen()} data-testid="plan-remove-room">
              <Trash2 size={14} /> Take it away
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
