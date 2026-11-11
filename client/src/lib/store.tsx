import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { EntitySummary } from './types';
import { MentionIndex } from '@shared/mentions';

interface AppState {
  appName: string;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  activeCampaignId: number | null;
  setActiveCampaignId: (id: number | null) => Promise<void>;
  /** Lightweight index of every record (id → summary) for links, pickers and broken-link detection. */
  index: Map<string, EntitySummary>;
  indexLoaded: boolean;
  reloadIndex: () => Promise<void>;
  reloadMeta: () => Promise<void>;
  entityCount: number;
  /** Show technical details (IDs, files, sources, how-it-works notes). Off for normal DM/player use. */
  debug: boolean;
  debugForced: boolean;
  setDebug: (v: boolean) => Promise<void>;
  /** Resolves @[Name] mentions and `[ID]` references to records. */
  mentions: MentionIndex;
}

const Ctx = createContext<AppState | null>(null);

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* preference only */
  }
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<'dark' | 'light'>(read('wk.theme', 'dark') === 'light' ? 'light' : 'dark');
  const [sidebarCollapsed, setCollapsed] = useState(read('wk.sidebar', '0') === '1');
  const [activeCampaignId, setActive] = useState<number | null>(null);
  const [index, setIndex] = useState<Map<string, EntitySummary>>(new Map());
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [appName, setAppName] = useState('The Worldkeeper');
  const [entityCount, setEntityCount] = useState(0);
  const [debug, setDebugState] = useState(false);
  const [debugForced, setDebugForced] = useState(false);
  const mentions = useMemo(() => new MentionIndex([...index.values()].map((e) => ({ id: e.id, name: e.name, type: e.type, aliases: e.aliases, redirect_to: e.redirect_to }))), [index]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const reloadIndex = useCallback(async () => {
    const list = await api.get<EntitySummary[]>('/api/entities?meta=1&archived=1');
    setIndex(new Map(list.map((e) => [e.id, e])));
    setIndexLoaded(true);
  }, []);
  const reloadMeta = useCallback(async () => {
    const m = await api.get<{ appName: string; entities: number; debug: boolean; debugForced: boolean }>('/api/meta');
    setAppName(m.appName);
    setDebugState(!!m.debug);
    setDebugForced(!!m.debugForced);
    setEntityCount(m.entities);
    document.title = m.appName;
    const a = await api.get<{ id: number | null }>('/api/campaigns/active');
    setActive(a.id);
  }, []);

  useEffect(() => {
    void reloadIndex().catch(() => setIndexLoaded(true));
    void reloadMeta().catch(() => undefined);
  }, [reloadIndex, reloadMeta]);

  const value = useMemo<AppState>(
    () => ({
      appName,
      theme,
      setTheme: (t) => {
        setThemeState(t);
        write('wk.theme', t);
      },
      sidebarCollapsed,
      setSidebarCollapsed: (v) => {
        setCollapsed(v);
        write('wk.sidebar', v ? '1' : '0');
      },
      activeCampaignId,
      setActiveCampaignId: async (id) => {
        const r = await api.put<{ id: number | null }>('/api/campaigns/active', { id });
        setActive(r.id);
      },
      index,
      indexLoaded,
      reloadIndex,
      reloadMeta,
      entityCount,
      debug,
      debugForced,
      setDebug: async (v: boolean) => {
        await api.put('/api/settings', { debug: v ? 'true' : 'false' });
        setDebugState(v || debugForced);
      },
      mentions,
    }),
    [appName, theme, sidebarCollapsed, activeCampaignId, index, indexLoaded, reloadIndex, reloadMeta, entityCount, debug, debugForced, mentions],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}
