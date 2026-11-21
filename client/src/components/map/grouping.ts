/**
 * Grouped pins: places drawn closer together on screen than `px` pixels become one group, placed at their centre.
 * Greedy, in the order given: each place joins the first group whose centre is within reach, or starts its own.
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

export function groupByDistance<T>(items: { at: ScreenPoint; item: T }[], px: number): { at: ScreenPoint; items: T[] }[] {
  const out: { at: ScreenPoint; items: T[] }[] = [];
  for (const { at, item } of items) {
    const g = out.find((c) => Math.hypot(c.at.x - at.x, c.at.y - at.y) < px);
    if (!g) {
      out.push({ at: { ...at }, items: [item] });
      continue;
    }
    g.items.push(item);
    const n = g.items.length;
    g.at = { x: (g.at.x * (n - 1) + at.x) / n, y: (g.at.y * (n - 1) + at.y) / n };
  }
  return out;
}
