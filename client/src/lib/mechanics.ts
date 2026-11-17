/**
 * Which of the setting's mechanics are switched on (shared/mechanics.ts), for any page in the GM app, the table server
 * or the published handbook. The GM app asks its server; the player app tells this module where to look.
 */
import { useEffect, useState } from 'react';
import { SETTING_PRESET, withDefaults, type Mechanics } from '../../../shared/mechanics';

let loader: () => Promise<Partial<Mechanics> | undefined> = () =>
  fetch('/api/mechanics')
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<Mechanics>) : undefined))
    .catch(() => undefined);
let current: Promise<Mechanics> | null = null;
let known: Mechanics | null = null;
const listeners = new Set<(m: Mechanics) => void>();

/** For the player app: where its mechanics come from (the table server's info, or the published snapshot). */
export function setMechanicsLoader(load: () => Promise<Partial<Mechanics> | undefined>) {
  loader = load;
  current = null;
}
// An older handbook or library that never chose keeps the setting's mechanics, as it always had them.
const load = () => (current ??= loader().then((m) => (known = withDefaults(m, SETTING_PRESET))));

/** After the GM changes them in Settings. */
export function mechanicsChanged(m: Mechanics) {
  known = m;
  current = Promise.resolve(m);
  for (const f of listeners) f(m);
}

/** The switches; until they load, the last known ones (or none on). */
export function useMechanics(): Mechanics | null {
  const [m, setM] = useState<Mechanics | null>(known);
  useEffect(() => {
    let live = true;
    void load().then((x) => live && setM(x));
    const f = (x: Mechanics) => setM(x);
    listeners.add(f);
    return () => {
      live = false;
      listeners.delete(f);
    };
  }, []);
  return m;
}
