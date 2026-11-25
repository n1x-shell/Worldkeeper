import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiSource, usePlayerData, type PCampaign, type PEntity, type PLive, type PMap, type PlayerSource, type PTie } from './source';
import { onServerChange } from './changes';

/** Player data source + route prefix ('/player' inside the app, '' in the static handbook). */
const Ctx = createContext<{ source: PlayerSource; base: string }>({ source: apiSource, base: '/player' });
export const usePlayer = () => useContext(Ctx);

interface PlayerIndex {
  entities: PEntity[] | undefined;
  maps: PMap[] | undefined;
  campaigns: PCampaign[] | undefined;
  factionWeb: PTie[] | undefined;
  byId: Map<string, PEntity>;
  /** The live session feed (the app only), refreshed every few seconds. */
  live: PLive | null;
}
const IndexCtx = createContext<PlayerIndex>({ entities: undefined, maps: undefined, campaigns: undefined, factionWeb: undefined, byId: new Map(), live: null });
export const usePlayerIndex = () => useContext(IndexCtx);

export function PlayerProvider({ source, base, children }: { source: PlayerSource; base: string; children: ReactNode }) {
  const { data: entities } = usePlayerData(() => source.entities(), 'entities');
  const { data: maps } = usePlayerData(() => source.maps(), 'maps');
  // A new handout reloads the campaign data, so it shows up straight away.
  const [stamp, setStamp] = useState(0);
  const { data: campaigns } = usePlayerData(() => source.campaigns(), `campaigns:${stamp}`);
  const { data: factionWeb } = usePlayerData(() => source.factionWeb(), `web:${stamp}`);
  const [live, setLive] = useState<PLive | null>(null);
  const lastHandout = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!source.live) return;
    let on = true;
    const poll = async () => {
      try {
        const l = await source.live!();
        if (!on) return;
        setLive(l);
        const id = l.latest_handout?.id ?? null;
        if (lastHandout.current !== undefined && id !== lastHandout.current) setStamp((n) => n + 1);
        lastHandout.current = id;
      } catch {
        /* offline for a moment; try again */
      }
    };
    void poll();
    // Told at once when something changes (the turn moves, a handout is given); asking every few seconds is only for
    // a server from before v0.9.7, or a browser without event streams.
    const stop = source.changes && typeof EventSource !== 'undefined' ? onServerChange(source.changes, () => void poll()) : null;
    const t = stop ? undefined : window.setInterval(poll, 4000);
    return () => {
      on = false;
      stop?.();
      window.clearInterval(t);
    };
  }, [source]);
  const byId = new Map((entities ?? []).map((e) => [e.id, e]));
  return (
    <Ctx.Provider value={{ source, base }}>
      <IndexCtx.Provider value={{ entities, maps, campaigns, factionWeb, byId, live }}>{children}</IndexCtx.Provider>
    </Ctx.Provider>
  );
}
