/**
 * Which modules (shared/modules.ts) are on, for any page in the GM app, the table server or the published handbook.
 * The GM app asks its server (for the active campaign); the player app tells this module where to look.
 */
import { useEffect, useState } from 'react';
import { MODULE_KEYS, isModuleKey, modulesFromMechanics, type ModuleKey } from '../../../shared/modules';

let loader: () => Promise<ModuleKey[] | undefined> = () =>
  fetch('/api/modules')
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<{ modules: { key: ModuleKey; on: boolean }[] }>) : undefined))
    .then((d) => d?.modules.filter((m) => m.on).map((m) => m.key))
    .catch(() => undefined);
let current: Promise<Set<ModuleKey>> | null = null;
let known: Set<ModuleKey> | null = null;
const listeners = new Set<(m: Set<ModuleKey>) => void>();

/** For the player app: where its modules come from (the table server's info, or the published snapshot). */
export function setModulesLoader(load: () => Promise<ModuleKey[] | undefined>) {
  loader = load;
  current = null;
}
const load = () => (current ??= loader().then((m) => (known = new Set(m ?? []))));

/** After the GM changes them, or switches campaign. */
export async function reloadModules() {
  current = null;
  const m = await load();
  for (const f of listeners) f(m);
}

/**
 * The modules a handbook's source lists: `modules` (v0.4.4 on), or the "campaign mechanics" it had before, or, for a
 * handbook older than either, the Worldkeeper setting's (the only setting a handbook was published from then).
 */
export function modulesFromInfo(i: { modules?: string[]; mechanics?: Record<string, boolean> } | undefined): ModuleKey[] {
  if (i?.modules) return i.modules.filter(isModuleKey);
  if (i?.mechanics) {
    const m = modulesFromMechanics(i.mechanics);
    return MODULE_KEYS.filter((k) => m[k] ?? k === 'renown');
  }
  return [...MODULE_KEYS];
}

export interface Modules {
  loaded: boolean;
  has: (key: ModuleKey) => boolean;
}

/** The modules on; until they load, the last known (or none). */
export function useModules(): Modules {
  const [m, setM] = useState<Set<ModuleKey> | null>(known);
  useEffect(() => {
    let live = true;
    void load().then((x) => live && setM(x));
    const f = (x: Set<ModuleKey>) => setM(x);
    listeners.add(f);
    return () => {
      live = false;
      listeners.delete(f);
    };
  }, []);
  return { loaded: !!m, has: (k) => !!m?.has(k) };
}
