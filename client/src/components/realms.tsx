/**
 * The library's realms (docs/OWN_WORLD_PLAN.md §2.1), for the GM app and the handbook alike: no app dependencies, so
 * it is safe in the player bundle. The GM app provides them from /api/realms, the handbook from the player info.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Compass } from 'lucide-react';
import { REALM_ICON_COMPONENTS } from './realmIcons';

export { REALM_ICON_COMPONENTS };
import { DEFAULT_REALM, sortRealms, type RealmInfo } from '@shared/realms';

export interface Realms {
  /** Every realm, in reading order (archived ones only when asked for). */
  list: RealmInfo[];
  /** A realm by id; an id the library doesn't hold yet gets a plain stand-in, so nothing breaks. */
  get: (id: string | null | undefined) => RealmInfo;
  name: (id: string | null | undefined) => string;
  loaded: boolean;
}

const fallback = (id: string): RealmInfo => ({
  id,
  name: id ? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'The World',
  kind: 'continent',
  parent_id: null,
  color: 'slate',
  icon: 'compass',
  description: '',
  sort_order: 999,
  archived: false,
});

export function makeRealms(list: RealmInfo[] | undefined): Realms {
  const sorted = sortRealms(list ?? []);
  const byId = new Map(sorted.map((r) => [r.id, r]));
  const get = (id: string | null | undefined) => byId.get(id || DEFAULT_REALM) ?? fallback(id || DEFAULT_REALM);
  return { list: sorted, get, name: (id) => get(id).name, loaded: !!list };
}

const Ctx = createContext<Realms>(makeRealms(undefined));

export function RealmsProvider({ realms, children }: { realms: RealmInfo[] | undefined; children: ReactNode }) {
  const value = useMemo(() => makeRealms(realms), [realms]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRealms = () => useContext(Ctx);

/** The class that gives an element its realm's colour: inside it, use text-realm, border-realm/50, bg-realm/10. */
export const realmClass = (r: Pick<RealmInfo, 'color'>) => `rc-${r.color}`;

export function RealmIconOf({ realm, size = 16, className }: { realm: Pick<RealmInfo, 'icon'>; size?: number; className?: string }) {
  const I = REALM_ICON_COMPONENTS[realm.icon] ?? Compass;
  return <I size={size} className={className} aria-hidden />;
}

/** The classes for a realm card or banner: put `cls` on the container, the rest inside it. */
export function realmStyle(r: RealmInfo, iconSize = 18) {
  return {
    cls: realmClass(r),
    text: 'text-realm',
    rule: 'bg-realm',
    wash: 'from-realm/[0.14]',
    ring: 'hover:border-realm/60',
    icon: <RealmIconOf realm={r} size={iconSize} />,
  };
}
