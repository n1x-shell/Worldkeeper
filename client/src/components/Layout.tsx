import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircleQuestion,
  Atom,
  BookOpen,
  BookMarked,
  Castle,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Compass,
  Crown,
  Dice5,
  Eye,
  FileWarning,
  Flag,
  Gem,
  Globe2,
  History,
  Home,
  Landmark,
  Library,
  ListChecks,
  Map as MapIcon,
  MapPinned,
  Moon,
  Network,
  NotebookPen,
  Scale,
  ScrollText,
  Search,
  Settings,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Swords,
  Table2,
  Users,
  UserSquare2,
  Archive,
  Upload,
  Drama,
  Flame,
  Mountain,
  Waypoints,
  HeartPulse,
  Gavel,
  Feather,
  KeyRound,
  Ghost,
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { SearchPalette } from './SearchPalette';

type Item = { to: string; label: string; icon: ReactNode };
const I = 16;
const NAV: { title: string; items: Item[] }[] = [
  {
    title: 'World',
    items: [
      { to: '/', label: 'World Dashboard', icon: <Home size={I} /> },
      { to: '/world', label: 'World Overview', icon: <Globe2 size={I} /> },
      { to: '/atlas', label: 'World Atlas', icon: <MapIcon size={I} /> },
      { to: '/realm/aetheris', label: 'Aetheris', icon: <Mountain size={I} /> },
      { to: '/realm/kaelmar', label: 'Kaelmar', icon: <Flame size={I} /> },
      { to: '/realm/ethereal', label: 'Ethereal Realm', icon: <Ghost size={I} /> },
      { to: '/timeline', label: 'World Timeline', icon: <Clock size={I} /> },
      { to: '/browse/cosmology', label: 'Cosmology', icon: <Atom size={I} /> },
      { to: '/browse/pantheon', label: 'Pantheon', icon: <Crown size={I} /> },
      { to: '/browse/cultures', label: 'Cultures and Peoples', icon: <Users size={I} /> },
      { to: '/browse/magic', label: 'Magic Systems', icon: <Sparkles size={I} /> },
    ],
  },
  {
    title: 'Encyclopedia',
    items: [
      { to: '/browse/all', label: 'All Lore', icon: <Library size={I} /> },
      { to: '/browse/regions', label: 'Regions and Settlements', icon: <Castle size={I} /> },
      { to: '/browse/landmarks', label: 'Landmarks and Buildings', icon: <Landmark size={I} /> },
      { to: '/browse/npcs', label: 'NPCs', icon: <UserSquare2 size={I} /> },
      { to: '/browse/factions', label: 'Factions and Cults', icon: <Flag size={I} /> },
      { to: '/browse/artifacts', label: 'Shards and Artifacts', icon: <Gem size={I} /> },
      { to: '/browse/creatures', label: 'Creatures', icon: <Skull size={I} /> },
      { to: '/browse/events', label: 'Historical Events', icon: <ScrollText size={I} /> },
      { to: '/mysteries', label: 'Mysteries and Secrets', icon: <Eye size={I} /> },
      { to: '/graph', label: 'Relationships', icon: <Network size={I} /> },
    ],
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/campaigns', label: 'All Campaigns', icon: <BookMarked size={I} /> },
      { to: '/campaign', label: 'Active Campaign', icon: <Compass size={I} /> },
      { to: '/campaign/adventures', label: 'Adventures', icon: <MapPinned size={I} /> },
      { to: '/campaign/arcs', label: 'Story Arcs', icon: <Waypoints size={I} /> },
      { to: '/campaign/quests', label: 'Quests', icon: <ListChecks size={I} /> },
      { to: '/campaign/sessions', label: 'Sessions', icon: <BookOpen size={I} /> },
      { to: '/campaign/encounters', label: 'Encounters', icon: <Swords size={I} /> },
      { to: '/campaign/party', label: 'Party and Characters', icon: <Shield size={I} /> },
      { to: '/campaign/journal', label: 'Session Journal', icon: <Feather size={I} /> },
    ],
  },
  {
    title: 'Dungeon Master Tools',
    items: [
      { to: '/dm', label: 'DM Screen', icon: <Drama size={I} /> },
      { to: '/tracker', label: 'Encounter Tracker', icon: <Swords size={I} /> },
      { to: '/tracker/quick', label: 'Initiative', icon: <HeartPulse size={I} /> },
      { to: '/conditions', label: 'Combat Conditions', icon: <Scale size={I} /> },
      { to: '/npc-ref', label: 'NPC Quick Reference', icon: <UserSquare2 size={I} /> },
      { to: '/agendas', label: 'Faction Agendas', icon: <Flag size={I} /> },
      { to: '/rumours', label: 'Rumours', icon: <MessageCircleQuestion size={I} /> },
      { to: '/world-events', label: 'World Events', icon: <Sparkles size={I} /> },
      { to: '/tables', label: 'Random Tables', icon: <Table2 size={I} /> },
      { to: '/dice', label: 'Dice Roller', icon: <Dice5 size={I} /> },
      { to: '/rules', label: 'Rules Reference', icon: <Gavel size={I} /> },
      { to: '/notes', label: 'Notes and Scratchpad', icon: <NotebookPen size={I} /> },
    ],
  },
  {
    title: 'Library Management',
    items: [
      { to: '/search', label: 'Search', icon: <Search size={I} /> },
      { to: '/publish', label: 'Publish for Players', icon: <Globe2 size={I} /> },
      { to: '/import', label: 'Import and Export', icon: <Upload size={I} /> },
      { to: '/review', label: 'Canon Review', icon: <KeyRound size={I} /> },
      { to: '/broken', label: 'Broken References', icon: <FileWarning size={I} /> },
      { to: '/history', label: 'Change History', icon: <History size={I} /> },
      { to: '/documents', label: 'Source Documents', icon: <BookOpen size={I} /> },
      { to: '/backups', label: 'Backups', icon: <Archive size={I} /> },
      { to: '/settings', label: 'Settings', icon: <Settings size={I} /> },
    ],
  },
];

/** Maintenance pages about the source files themselves; available in debug mode. */
const DEBUG_ONLY = new Set(['/documents', '/broken']);

export function Layout() {
  const { sidebarCollapsed: collapsed, setSidebarCollapsed, theme, setTheme, appName, debug } = useAppState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setMobileNav(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!typing && e.altKey && e.key === 'd') nav('/dm');
      else if ((e.ctrlKey || e.metaKey) && e.key === '\\') setSidebarCollapsed(!collapsed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, setSidebarCollapsed, nav]);

  const sidebar = (
    <nav aria-label="Main" className="flex flex-col h-full">
      <div className={`flex items-center gap-2 px-3 py-3 border-b border-line ${collapsed ? 'justify-center' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="text-gold shrink-0">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 3v26M3 16h26" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="16" cy="16" r="4" fill="currentColor" opacity=".5" />
        </svg>
        {!collapsed && <span className="font-display text-gold text-[15px] truncate">{appName}</span>}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map((g) => (
          <div key={g.title} className="mb-2">
            {!collapsed && <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim/80">{g.title}</div>}
            {g.items.filter((it) => debug || !DEBUG_ONLY.has(it.to)).map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/' || it.to === '/campaign' || it.to === '/tracker'}
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
        <button className="btn-ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light/dark theme" title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="btn-ghost" onClick={() => setSidebarCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title="Collapse (Ctrl+\)">
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className={`hidden md:block shrink-0 bg-panel/80 border-r border-line transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-60'}`}>{sidebar}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-[1800] md:hidden bg-black/60" onClick={() => setMobileNav(false)}>
          <aside className="w-64 h-full bg-panel border-r border-line" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 border-b border-line bg-panel/60 px-3 py-2">
          <button className="btn-ghost md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            ☰
          </button>
          <button onClick={() => setSearchOpen(true)} className="flex-1 max-w-xl input flex items-center gap-2 text-dim text-left">
            <Search size={14} /> Search names and lore… <kbd className="ml-auto text-[10px] border border-line rounded px-1">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/campaign/live" className="btn">
              <Swords size={14} /> <span className="hidden sm:inline">Live Session</span>
            </NavLink>
            <a href="/player" target="_blank" rel="noreferrer" className="btn" title="Open the player view in a new tab">
              <Eye size={14} /> <span className="hidden sm:inline">Player View</span>
            </a>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto" id="main">
          <div className="mx-auto max-w-[1500px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
