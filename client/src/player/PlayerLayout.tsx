import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  UserRound,
  Printer,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Flag,
  Gem,
  Gift,
  CalendarDays,
  Ghost,
  Globe2,
  Home,
  Landmark,
  ListChecks,
  Map as MapIcon,
  Moon,
  Mountain,
  Flame,
  ScrollText,
  Search,
  Skull,
  Sparkles,
  Sun,
  UserSquare2,
  Users,
  Feather,
  Scale,
  Library,
  Eclipse,
  Network,
  UserPlus,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { RealmIconOf, useRealms } from '../components/realms';
import { PLAYER_GROUPS, OTHER_GROUP, playerWorkspaceFor, type PlayerWorkspace } from './categories';
import { PlayerLiveCard } from './LivePlay';
import { ConfirmHost, ToastHost } from '../components/ui/overlays';
import { PlayerHoverCards } from './PlayerPeek';
import { SidebarSlotContext } from '../components/sidebarSlot';

const I = 16;
const GROUP_ICONS: Record<string, ReactNode> = {
  places: <Landmark size={I} />,
  people: <UserSquare2 size={I} />,
  factions: <Flag size={I} />,
  peoples: <Users size={I} />,
  gods: <Crown size={I} />,
  history: <ScrollText size={I} />,
  magic: <Sparkles size={I} />,
  rules: <Scale size={I} />,
  treasures: <Gem size={I} />,
  creatures: <Skull size={I} />,
  other: <Library size={I} />,
};

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

type Item = { to: string; label: string; icon: ReactNode; end?: boolean; depth?: number };
type Workspace = { id: PlayerWorkspace; label: string; icon: ReactNode; to: string; items: Item[] };

/**
 * The handbook's shell (docs/DESIGN_OVERHAUL.md §10): the GM app's look with simpler navigation, built only from what
 * players may see. A top bar with World, Records, Maps, Campaign and My Character, and a sidebar for the current one;
 * on phones a drawer with everything. Parchment by default, dark as a toggle, remembered on the device.
 */
export function PlayerLayout({ appName, publishedAt, campaign }: { appName: string; publishedAt?: string; campaign?: string }) {
  // On a campaign's own address, the handbook names the campaign.
  const subtitle = campaign ? `${campaign} · Handbook` : 'Player Handbook';
  const { base, source } = usePlayer();
  const { entities, campaigns, maps, factionWeb } = usePlayerIndex();
  const [collapsed, setCollapsed] = useState(read('wk.player.sidebar', '0') === '1');
  const [theme, setTheme] = useState<'dark' | 'light'>(read('wk.player.theme', 'light') === 'dark' ? 'dark' : 'light');
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const types = new Set((entities ?? []).map((e) => e.type));
  const realmsUsed = new Set((entities ?? []).flatMap((e) => [e.realm, ...(e.realms ?? [])]));
  const realms = useRealms();
  // The realms with entries, each nested under what holds it (Aetheris and Kaelmar under The World).
  const shownRealms = realms.list.filter((r) => !r.archived && realmsUsed.has(r.id));
  const realmDepth = (r: (typeof shownRealms)[number], n = 0): number => {
    const p = r.parent_id ? shownRealms.find((x) => x.id === r.parent_id) : undefined;
    return p && n < 8 ? 1 + realmDepth(p, n + 1) : 0;
  };
  const realmItems: Item[] = shownRealms.map((r) => ({ to: `${base}/realm/${r.id}`, label: r.name, icon: <RealmIconOf realm={r} size={I} />, depth: realmDepth(r) }));
  const groups = [...PLAYER_GROUPS, OTHER_GROUP].filter((g) =>
    g === OTHER_GROUP ? (entities ?? []).some((e) => !PLAYER_GROUPS.some((p) => p.types.includes(e.type))) : g.types.some((t) => types.has(t)),
  );
  const count = (f: (c: NonNullable<typeof campaigns>[number]) => number) => (campaigns ?? []).reduce((n, c) => n + f(c), 0);
  const quests = count((c) => c.quests.length);
  const recaps = count((c) => c.recaps.length);
  const standing = count((c) => c.standing?.length ?? 0);
  const treasure = count((c) => c.treasure?.length ?? 0);
  const handouts = count((c) => c.handouts?.length ?? 0);
  const calendar = (campaigns ?? []).some((c) => c.calendar);
  const regionsSeen = count((c) => c.regions?.length ?? 0);
  const omens = count((c) => c.omens?.length ?? 0);

  const workspaces: Workspace[] = [
    {
      id: 'world',
      label: 'World',
      icon: <Home size={I} />,
      to: base || '/',
      items: [{ to: base || '/', label: 'Home', icon: <Home size={I} />, end: true }, ...realmItems],
    },
    {
      id: 'records',
      label: 'Records',
      icon: <BookOpen size={I} />,
      to: `${base}/browse/all`,
      items: [
        { to: `${base}/browse/all`, label: 'All Lore', icon: <BookOpen size={I} /> },
        ...groups.map((g) => ({ to: `${base}/browse/${g.key}`, label: g.label, icon: GROUP_ICONS[g.key] })),
        ...(factionWeb?.length ? [{ to: `${base}/factions-web`, label: 'Faction Web', icon: <Network size={I} /> }] : []),
      ],
    },
    {
      id: 'maps',
      label: 'Maps',
      icon: <MapIcon size={I} />,
      to: `${base}/maps`,
      // The maps page has its own picker, so the Maps workspace needs no sidebar.
      items: [],
    },
    {
      id: 'campaign',
      label: 'Campaign',
      icon: <Feather size={I} />,
      to: quests ? `${base}/quests` : recaps ? `${base}/recaps` : `${base}/quests`,
      items: [
        ...(quests ? [{ to: `${base}/quests`, label: 'Quests', icon: <ListChecks size={I} /> }] : []),
        ...(recaps ? [{ to: `${base}/recaps`, label: 'Session Recaps', icon: <Feather size={I} /> }] : []),
        ...(standing ? [{ to: `${base}/standing`, label: 'Faction Standing', icon: <Scale size={I} /> }] : []),
        ...(treasure ? [{ to: `${base}/treasure`, label: 'Party Treasure', icon: <Gem size={I} /> }] : []),
        ...(handouts ? [{ to: `${base}/handouts`, label: 'Handouts', icon: <Gift size={I} /> }] : []),
        ...(calendar ? [{ to: `${base}/calendar`, label: 'Calendar', icon: <CalendarDays size={I} /> }] : []),
        ...(regionsSeen ? [{ to: `${base}/regions`, label: 'Around the World', icon: <Globe2 size={I} /> }] : []),
        ...(omens ? [{ to: `${base}/omens`, label: 'Signs and Omens', icon: <Eclipse size={I} /> }] : []),
      ],
    },
    {
      id: 'character',
      label: 'My Character',
      icon: <UserRound size={I} />,
      to: source.myPage ? `${base}/me` : `${base}/builder`,
      items: [
        ...(source.myPage ? [{ to: `${base}/me`, label: 'My Character', icon: <UserRound size={I} /> }] : []),
        { to: `${base}/builder`, label: 'Make a Character', icon: <UserPlus size={I} /> },
        { to: `${base}/print`, label: 'Print', icon: <Printer size={I} /> },
      ],
    },
  ];
  // A workspace shows when it has something: maps need a map, the campaign something published.
  const shown = workspaces.filter((w) => (w.id === 'maps' ? (maps ?? []).length > 0 : w.id === 'campaign' ? w.items.length > 0 : true));
  const ws = playerWorkspaceFor(loc.pathname);
  const current = shown.find((w) => w.id === ws) ?? shown[0];
  const sideItems = current && current.items.length > 1 ? current.items : [];
  // The maps fill the page under the top bar, like the GM's Atlas; the sidebar then holds the map's legend.
  const fullBleed = current?.id === 'maps';
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 768px)');
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const slot = fullBleed && wide && !collapsed ? slotEl : null;
  const collapseButton = (
    <button
      className="btn-ghost"
      onClick={() => {
        setCollapsed(!collapsed);
        write('wk.player.sidebar', collapsed ? '0' : '1');
      }}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={fullBleed ? "Collapse: the map's legend floats over it instead" : undefined}
    >
      {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
    </button>
  );

  const link = (it: Item, compact: boolean) => (
    <NavLink
      key={it.to}
      to={it.to}
      end={it.end}
      title={compact ? it.label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-2.5 mx-2 px-2 min-h-[36px] rounded-md text-[13px] transition-colors ${compact ? 'justify-center' : ''} ${
          isActive ? 'bg-gold/10 text-gold' : 'text-ink/80 hover:bg-raised hover:text-ink'
        }`
      }
      style={!compact && it.depth ? { paddingLeft: 8 + it.depth * 16 } : undefined}
    >
      <span className="shrink-0 opacity-90">{it.icon}</span>
      {!compact && <span className="truncate">{it.label}</span>}
    </NavLink>
  );
  const themeButton = (
    <button
      className="btn-ghost"
      onClick={() => {
        const t = theme === 'dark' ? 'light' : 'dark';
        setTheme(t);
        write('wk.player.theme', t);
      }}
      aria-label={theme === 'dark' ? 'Use Warm Parchment' : 'Use Dark Codex'}
      title={theme === 'dark' ? 'Warm Parchment' : 'Dark Codex'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
  const mark = (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="text-gold shrink-0">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 3v26M3 16h26" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="4" fill="currentColor" opacity=".5" />
    </svg>
  );

  return (
    <div className="flex flex-col h-full">
      <header className="h-[52px] shrink-0 flex items-center gap-1 border-b border-line bg-panel px-2 md:px-3 elev-1 relative z-[1500]">
        <button className="btn-ghost md:hidden min-h-[40px]" onClick={() => setDrawer(true)} aria-label="Open menu">
          <MenuIcon size={18} />
        </button>
        <NavLink to={base || '/'} end className="flex items-center gap-2 pr-3 mr-1 md:border-r border-line h-8" title="Home">
          {mark}
          <span className="hidden lg:flex flex-col leading-none">
            <span className="font-display text-gold text-[15px] whitespace-nowrap">{appName}</span>
            <span className="text-[9px] uppercase tracking-[0.22em] text-dim mt-0.5">{subtitle}</span>
          </span>
        </NavLink>
        <nav aria-label="Handbook sections" className="hidden md:flex items-stretch h-full">
          {shown.map((w) => (
            <NavLink
              key={w.id}
              to={w.to}
              className={() =>
                `flex items-center gap-1.5 px-3 font-display text-[13px] tracking-wider border-b-2 transition-colors ${
                  w.id === current?.id ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'
                }`
              }
              aria-current={w.id === current?.id ? 'page' : undefined}
            >
              {w.icon}
              <span className="whitespace-nowrap">{w.label}</span>
            </NavLink>
          ))}
        </nav>
        <form
          className="ml-auto flex-1 max-w-sm min-w-0 input flex items-center gap-2 py-1"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`${base}/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search size={14} className="text-dim shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Search what you know…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </form>
        {publishedAt && <span className="hidden xl:block text-xs text-dim whitespace-nowrap px-2">Updated {new Date(publishedAt).toLocaleDateString()}</span>}
        {themeButton}
      </header>
      <div className="flex-1 flex min-h-0">
        {fullBleed && (
          <aside className={`hidden md:flex flex-col shrink-0 bg-panel/70 border-r border-line transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-[272px]'}`} aria-label="Map legend">
            {!collapsed && <div ref={setSlotEl} className="flex-1 overflow-y-auto" />}
            {collapsed && <div className="flex-1" />}
            <div className={`border-t border-line p-2 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>{collapseButton}</div>
          </aside>
        )}
        {!fullBleed && sideItems.length > 0 && (
          <aside className={`hidden md:flex flex-col shrink-0 bg-panel/70 border-r border-line transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-56'}`} aria-label={current?.label}>
            {!collapsed && (
              <div className="px-4 pt-4 pb-2 flex items-center gap-2 font-display text-gold text-[13px] tracking-wider">
                {current?.icon}
                {current?.label}
              </div>
            )}
            <div className="flex-1 overflow-y-auto py-2 space-y-0.5">{sideItems.map((it) => link(it, collapsed))}</div>
            <div className={`border-t border-line p-2 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
              <button
                className="btn-ghost"
                onClick={() => {
                  setCollapsed(!collapsed);
                  write('wk.player.sidebar', collapsed ? '0' : '1');
                }}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              </button>
            </div>
          </aside>
        )}
        {drawer && (
          <div className="fixed inset-0 z-[1800] md:hidden bg-black/60" onClick={() => setDrawer(false)}>
            <aside className="w-72 max-w-[85vw] h-full bg-panel border-r border-line flex flex-col" onClick={(e) => e.stopPropagation()} aria-label="Menu">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-line">
                {mark}
                <div className="min-w-0 flex-1">
                  <div className="font-display text-gold text-[15px] truncate">{appName}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-dim truncate">{subtitle}</div>
                </div>
                <button className="btn-ghost min-h-[40px]" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-2" aria-label="Handbook">
                {shown.map((w) => (
                  <div key={w.id} className="mb-2">
                    <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim/80">{w.label}</div>
                    {(w.items.length ? w.items : [{ to: w.to, label: w.label, icon: w.icon }]).map((it) => link(it, false))}
                  </div>
                ))}
              </nav>
              <div className="border-t border-line p-2">{themeButton}</div>
            </aside>
          </div>
        )}
        {fullBleed ? (
          <main className="flex-1 relative overflow-hidden min-w-0" id="main">
            <SidebarSlotContext.Provider value={slot}>
              <Outlet />
            </SidebarSlotContext.Provider>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto min-w-0" id="main">
            <div className="mx-auto max-w-[1200px] p-4 md:p-6">
              <Outlet />
            </div>
          </main>
        )}
        <PlayerLiveCard />
      </div>
      <PlayerHoverCards />
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
