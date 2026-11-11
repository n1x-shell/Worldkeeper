import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Flag,
  Gem,
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
} from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { PLAYER_GROUPS, PLAYER_REALMS, OTHER_GROUP } from './categories';

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
const REALM_ICONS: Record<string, ReactNode> = {
  aetheris: <Mountain size={I} />,
  kaelmar: <Flame size={I} />,
  ethereal: <Ghost size={I} />,
  world: <Globe2 size={I} />,
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

/** Same shell as the DM app (sidebar, top search, phone drawer), built only from what players may see. */
export function PlayerLayout({ appName, publishedAt }: { appName: string; publishedAt?: string }) {
  const { base } = usePlayer();
  const { entities, campaigns, maps } = usePlayerIndex();
  const [collapsed, setCollapsed] = useState(read('wk.player.sidebar', '0') === '1');
  const [theme, setTheme] = useState<'dark' | 'light'>(read('wk.player.theme', 'dark') === 'light' ? 'light' : 'dark');
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
  const realms = new Set((entities ?? []).map((e) => e.realm));
  const groups = [...PLAYER_GROUPS, OTHER_GROUP].filter((g) => (g === OTHER_GROUP ? (entities ?? []).some((e) => !PLAYER_GROUPS.some((p) => p.types.includes(e.type))) : g.types.some((t) => types.has(t))));
  const quests = (campaigns ?? []).reduce((n, c) => n + c.quests.length, 0);
  const recaps = (campaigns ?? []).reduce((n, c) => n + c.recaps.length, 0);
  const sections: { title: string; items: { to: string; label: string; icon: ReactNode; end?: boolean }[] }[] = [
    { title: 'World', items: [{ to: base || '/', label: 'Home', icon: <Home size={I} />, end: true }, ...PLAYER_REALMS.filter((r) => realms.has(r.key)).map((r) => ({ to: `${base}/realm/${r.key}`, label: r.label, icon: REALM_ICONS[r.key] }))] },
    { title: 'Encyclopedia', items: [{ to: `${base}/browse/all`, label: 'All Lore', icon: <BookOpen size={I} /> }, ...groups.map((g) => ({ to: `${base}/browse/${g.key}`, label: g.label, icon: GROUP_ICONS[g.key] }))] },
    {
      title: 'Campaign',
      items: [
        ...((maps ?? []).length ? [{ to: `${base}/maps`, label: 'Maps', icon: <MapIcon size={I} /> }] : []),
        ...(quests ? [{ to: `${base}/quests`, label: 'Quests', icon: <ListChecks size={I} /> }] : []),
        ...(recaps ? [{ to: `${base}/recaps`, label: 'Session Recaps', icon: <Feather size={I} /> }] : []),
      ],
    },
  ].filter((s) => s.items.length);

  const sidebar = (
    <nav aria-label="Handbook" className="flex flex-col h-full">
      <div className={`flex items-center gap-2 px-3 py-3 border-b border-line ${collapsed ? 'justify-center' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="text-gold shrink-0">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 3v26M3 16h26" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="16" cy="16" r="4" fill="currentColor" opacity=".5" />
        </svg>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display text-gold text-[15px] truncate">{appName}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-dim">Player Handbook</div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sections.map((s) => (
          <div key={s.title} className="mb-2">
            {!collapsed && <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim/80">{s.title}</div>}
            {s.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                title={collapsed ? it.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${collapsed ? 'justify-center' : ''} ${
                    isActive ? 'bg-gold/10 text-gold' : 'text-ink/80 hover:bg-raised hover:text-ink'
                  }`
                }
              >
                <span className="shrink-0 opacity-90">{it.icon}</span>
                {!collapsed && <span className="truncate">{it.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className={`border-t border-line p-2 flex ${collapsed ? 'flex-col' : ''} gap-1`}>
        <button
          className="btn-ghost"
          onClick={() => {
            const t = theme === 'dark' ? 'light' : 'dark';
            setTheme(t);
            write('wk.player.theme', t);
          }}
          aria-label="Toggle light/dark theme"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="btn-ghost hidden md:inline-flex"
          onClick={() => {
            setCollapsed(!collapsed);
            write('wk.player.sidebar', collapsed ? '0' : '1');
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className={`hidden md:block shrink-0 bg-panel/80 border-r border-line transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-60'}`}>{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-[1800] md:hidden bg-black/60" onClick={() => setDrawer(false)}>
          <aside className="w-64 h-full bg-panel border-r border-line" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
          <button className="btn-ghost md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            ☰
          </button>
          <form
            className="flex-1 max-w-xl input flex items-center gap-2"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) nav(`${base}/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={14} className="text-dim" />
            <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Search what you know…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </form>
          {publishedAt && <span className="ml-auto hidden sm:block text-xs text-dim whitespace-nowrap">Updated {new Date(publishedAt).toLocaleDateString()}</span>}
        </header>
        <main className="flex-1 overflow-y-auto" id="main">
          <div className="mx-auto max-w-[1200px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
