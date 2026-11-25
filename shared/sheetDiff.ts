/**
 * What changed on a sheet (v0.9.7): the fields set and the fields removed between two copies, field by field at the
 * sheet's top level. A save sends only this, so two people editing one sheet (a player and the GM) don't write over
 * each other's fields: the server lays each change onto the sheet as it is then.
 */
export interface SheetDiff {
  set: Record<string, unknown>;
  unset: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function sheetDiff(base: Record<string, unknown>, next: Record<string, unknown>): SheetDiff {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const k of Object.keys(next)) if (next[k] !== undefined && !same(base[k], next[k])) set[k] = next[k];
  for (const k of Object.keys(base)) if (base[k] !== undefined && next[k] === undefined) unset.push(k);
  return { set, unset };
}

export const noChange = (d: SheetDiff) => !Object.keys(d.set).length && !d.unset.length;

export function applySheetDiff<T extends Record<string, unknown>>(sheet: T, d: SheetDiff): T {
  const out: Record<string, unknown> = { ...sheet, ...d.set };
  for (const k of d.unset) delete out[k];
  return out as T;
}
