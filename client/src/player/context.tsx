import { createContext, useContext, type ReactNode } from 'react';
import { apiSource, usePlayerData, type PCampaign, type PEntity, type PMap, type PlayerSource } from './source';

/** Player data source + route prefix ('/player' inside the app, '' in the static handbook). */
const Ctx = createContext<{ source: PlayerSource; base: string }>({ source: apiSource, base: '/player' });
export const usePlayer = () => useContext(Ctx);

interface PlayerIndex {
  entities: PEntity[] | undefined;
  maps: PMap[] | undefined;
  campaigns: PCampaign[] | undefined;
  byId: Map<string, PEntity>;
}
const IndexCtx = createContext<PlayerIndex>({ entities: undefined, maps: undefined, campaigns: undefined, byId: new Map() });
export const usePlayerIndex = () => useContext(IndexCtx);

export function PlayerProvider({ source, base, children }: { source: PlayerSource; base: string; children: ReactNode }) {
  const { data: entities } = usePlayerData(() => source.entities(), 'entities');
  const { data: maps } = usePlayerData(() => source.maps(), 'maps');
  const { data: campaigns } = usePlayerData(() => source.campaigns(), 'campaigns');
  const byId = new Map((entities ?? []).map((e) => [e.id, e]));
  return (
    <Ctx.Provider value={{ source, base }}>
      <IndexCtx.Provider value={{ entities, maps, campaigns, byId }}>{children}</IndexCtx.Provider>
    </Ctx.Provider>
  );
}
