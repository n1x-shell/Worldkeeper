import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { EntitySummary } from './types';
import { MentionIndex } from '@shared/mentions';
import type { RealmInfo } from '@shared/realms';
import { RealmsProvider } from '../components/realms';
import { RecordTypesProvider, type ClientRecordType } from '../components/recordTypes';

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
  /** The library's realms (archived ones too; most lists hide them). */
  realms: RealmInfo[];
  reloadRealms: () => Promise<void>;
  /** The library's record types (archived ones too), with how many records each has. */
  recordTypes: ClientRecordType[];
  reloadTypes: () => Promise<void>;
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
  const [theme, setThemeState] = useState<'dark' | 'light'>(read('wk.theme', 'light') === 'dark' ? 'dark' : 'light'); // Warm Parchment is the default
  const [sidebarCollapsed, setCollapsed] = useState(read('wk.sidebar', '0') === '1');
  const [activeCampaignId, setActive] = useState<number | null>(null);
  const [index, setIndex] = useState<Map<string, EntitySummary>>(new Map());
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [appName, setAppName] = useState('The Worldkeeper');
  const [entityCount, setEntityCount] = useState(0);
  const [debug, setDebugState] = useState(false);
  const [debugForced, setDebugForced] = useState(false);
  const [realms, setRealms] = useState<RealmInfo[] | undefined>(undefined);
  const [recordTypes, setRecordTypes] = useState<ClientRecordType[] | undefined>(undefined);
  const mentions = useMemo(() => new MentionIndex([...index.values()].map((e) => ({ id: e.id, name: e.name, type: e.type, aliases: e.aliases, redirect_to: e.redirect_to }))), [index]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    // "Reduce texture" (Style guide): no paper grain on the parchment background.
    document.documentElement.classList.toggle('no-texture', read('wk.texture', 'on') === 'off');
  }, [theme]);

  const reloadIndex = useCallback(async () => {
    const list = await api.get<EntitySummary[]>('/api/entities?meta=1&archived=1');
    setIndex(new Map(list.map((e) => [e.id, e])));
    setIndexLoaded(true);
  }, []);
  const reloadMeta = useCallback(async () => {
    const m = await api.get<{ appName: string; entities: number; debug: boolean; debugForced: boolean; desktop?: boolean }>('/api/meta');
    // In the desktop app, links meant for a new tab (Player View, GitHub) open in the system browser.
    if (m.desktop) openNewTabsInBrowser();
    setAppName(m.appName);
    setDebugState(!!m.debug);
    setDebugForced(!!m.debugForced);
    setEntityCount(m.entities);
    document.title = m.appName;
    const a = await api.get<{ id: number | null }>('/api/campaigns/active');
    setActive(a.id);
  }, []);

  const reloadRealms = useCallback(async () => {
    setRealms(await api.get<RealmInfo[]>('/api/realms?archived=1'));
  }, []);

  const reloadTypes = useCallback(async () => {
    setRecordTypes(await api.get<ClientRecordType[]>('/api/record-types?archived=1'));
  }, []);

  useEffect(() => {
    void reloadTypes().catch(() => setRecordTypes([]));
    void reloadRealms().catch(() => setRealms([]));
    void reloadIndex().catch(() => setIndexLoaded(true));
    void reloadMeta().catch(() => undefined);
  }, [reloadIndex, reloadMeta, reloadRealms, reloadTypes]);

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
      realms: realms ?? [],
      reloadRealms,
      recordTypes: recordTypes ?? [],
      reloadTypes,
    }),
    [appName, theme, sidebarCollapsed, activeCampaignId, index, indexLoaded, reloadIndex, reloadMeta, entityCount, debug, debugForced, mentions, realms, reloadRealms, recordTypes, reloadTypes],
  );
  return (
    <Ctx.Provider value={value}>
      <RealmsProvider realms={realms}>
        <RecordTypesProvider types={recordTypes}>{children}</RecordTypesProvider>
      </RealmsProvider>
    </Ctx.Provider>
  );
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}

let browserLinks = false;
/** The desktop app's window ignores links meant for a new tab: send them to the system browser instead. */
function openNewTabsInBrowser() {
  if (browserLinks) return;
  browserLinks = true;
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!a?.href || e.defaultPrevented) return;
      e.preventDefault();
      void api.post('/api/desktop/open', { url: a.href }).catch(() => undefined);
    },
    true,
  );
}
