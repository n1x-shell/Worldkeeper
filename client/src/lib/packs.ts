/**
 * The setting packs this library has, and the roles they give (docs/OWN_WORLD_PLAN.md §2.10): a pack's own actions
 * (its update, its handbook match, its rumours and mysteries...) show only with that pack, and pages find the records
 * that play a part ("rules.calendar", "world.overview") by role, never by ID.
 */
import { useEffect, useState } from 'react';
import type { PackInfo } from '../../../shared/packs';

export interface PacksState {
  packs: PackInfo[];
  /** Which record plays which part, from the installed packs. A role whose record is missing is absent. */
  roles: Record<string, string>;
}

const EMPTY: PacksState = { packs: [], roles: {} };
let loader: () => Promise<PacksState | undefined> = () =>
  fetch('/api/setting-packs')
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<PacksState>) : undefined))
    .catch(() => undefined);
let current: Promise<PacksState> | null = null;
let known: PacksState | null = null;
const listeners = new Set<(p: PacksState) => void>();

/** For the player app: where the roles come from (the table server, or the published snapshot). */
export function setPacksLoader(load: () => Promise<PacksState | undefined>) {
  loader = load;
  current = null;
}
const load = () => (current ??= loader().then((p) => (known = p ?? EMPTY)));

/** After a pack is installed, updated or removed. */
export async function packsChanged() {
  current = null;
  const p = await load();
  for (const f of listeners) f(p);
}

/** The packs and roles; until they load, the last known ones (or none). */
export function usePacks(): PacksState & { loaded: boolean; has: (id: string) => boolean } {
  const [p, setP] = useState<PacksState | null>(known);
  useEffect(() => {
    let live = true;
    void load().then((x) => live && setP(x));
    const f = (x: PacksState) => setP(x);
    listeners.add(f);
    return () => {
      live = false;
      listeners.delete(f);
    };
  }, []);
  const s = p ?? EMPTY;
  return { ...s, loaded: !!p, has: (id) => s.packs.some((x) => x.id === id && x.installed) };
}

/** The record that plays a part, if an installed pack gives it one. */
export const useRole = (key: string): string | null => usePacks().roles[key] ?? null;
