/**
 * Placing dated things among the world's history (v0.7): a campaign's sessions on the GM's timeline, and the players'
 * timeline. History rows keep their own order (a row without a date stays where the timeline has it); each dated item
 * goes after the last dated row on or before its date, or before the first one after it.
 */
export interface WhenAt {
  year: number | null;
  day: number | null;
}

/** Compare two dates (a year without a day counts as its first day). */
export const compareWhen = (a: { year: number; day: number | null }, b: { year: number; day: number | null }) => a.year - b.year || (a.day ?? 0) - (b.day ?? 0);

const dated = <T extends WhenAt>(x: T): x is T & { year: number } => x.year != null;

/** History rows in their own order, with the dated items put among them. Items without a date are left out. */
export function mergeByDate<R extends WhenAt, X extends WhenAt>(rows: R[], items: X[]): (R | X)[] {
  const out: (R | X)[] = [...rows];
  const todo = items.filter(dated).sort(compareWhen);
  for (const x of todo) {
    let at = -1;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (dated(o) && compareWhen(o, x) <= 0) at = i;
    }
    if (at >= 0) {
      out.splice(at + 1, 0, x);
      continue;
    }
    const next = out.findIndex((o) => dated(o) && compareWhen(o, x) > 0);
    if (next >= 0) out.splice(next, 0, x);
    else out.push(x);
  }
  return out;
}
