/**
 * The app shell (docs/DESIGN_OVERHAUL.md, sections 4 and 5): a top bar with the five workspaces (Codex, Campaign,
 * Characters, Atlas, Live), search, the active campaign, Player View, the theme and the Library menu; a sidebar with
 * the current workspace's pages, collapsible to an icon rail; and the page itself. URLs are unchanged: this only
 * decides where each link sits.
 */
import { useMechanics } from '../lib/mechanics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookMarked, Check, ChevronDown, ChevronsLeft, ChevronsRight, Compass, Eye, Map as MapIcon, MapPinned, Menu, Moon, Search, Settings, Sun, X } from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import { SearchPalette } from './SearchPalette';
import { SidebarSlotContext } from './sidebarSlot';
import { DEBUG_ONLY, FULL_BLEED, LIBRARY, NEEDS, WORKSPACES, matches, workspaceFor, type Group, type Item } from './navigation';
import { ConfirmHost, ToastHost } from './ui';
import { PeekProvider } from './peek/PeekProvider';
import { Inspector } from './peek/Inspector';
import { SplitView } from './peek/Beside';
import { InspectorButton, PeekKeys } from './peek/controls';

const I = 16;

/** A small menu that opens under its button and closes on a click outside or Escape. */
function Dropdown({ button, label, children, align = 'right', active }: { button: ReactNode; label: string; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className={`btn-ghost ${active || open ? 'text-gold bg-gold/10' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {button}
      </button>
      {open && (
        <div role="menu" className={`absolute top-full mt-1 z-[1900] min-w-[220px] panel elev-2 py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const menuItem = 'flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink hover:bg-raised hover:text-gold w-full text-left';

export function Layout() {
  const { sidebarCollapsed: collapsed, setSidebarCollapsed, theme, setTheme, appName, debug, activeCampaignId, setActiveCampaignId } = useAppState();
  const mech = useMechanics();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const ws = workspaceFor(loc.pathname);
  // Below 1280px the sidebar is the icon rail unless the GM opens it (for this visit).
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1279px)').matches);
  const [openNarrow, setOpenNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 1279px)');
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const compact = narrow ? !openNarrow : collapsed;
  // Phones have no sidebar (the menu drawer instead), so pages keep their own controls there.
  // Split view needs room: 1024px and up (narrower, the record opens as a drawer).
  const [splitOk, setSplitOk] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px)');
    if (!mq) return;
    const on = () => setSplitOk(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 768px)');
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // On a full-view page (the map), the open sidebar is handed to the page for its own controls.
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const fullBleed = FULL_BLEED.test(loc.pathname);
  const slot = fullBleed && wide && !compact ? slotEl : null;
  const toggleSidebar = () => (narrow ? setOpenNarrow(!openNarrow) : setSidebarCollapsed(!collapsed));

  const visible = (it: Item) => (debug || !DEBUG_ONLY.has(it.to)) && (!NEEDS[it.to] || !mech || mech[NEEDS[it.to]]);

  // Campaigns, for the switcher; maps, for the Atlas sidebar; whether a session is live, for the Live tab.
  const [campaigns, setCampaigns] = useState<{ id: number; title: string }[]>([]);
  const [maps, setMaps] = useState<{ id: number; name: string }[]>([]);
  const [live, setLive] = useState(false);
  useEffect(() => {
    void api
      .get<{ id: number; title: string }[]>('/api/campaigns')
      .then(setCampaigns)
      .catch(() => undefined);
  }, [activeCampaignId]);
  useEffect(() => {
    if (ws !== 'atlas') return;
    void api
      .get<{ id: number; name: string }[]>('/api/maps')
      .then(setMaps)
      .catch(() => undefined);
  }, [ws]);
  useEffect(() => {
    const check = () =>
      void api
        .get<{ live: boolean }>('/api/player/live')
        .then((r) => setLive(!!r.live))
        .catch(() => undefined);
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [loc.pathname]);

  // The app opens on the active campaign's overview when there is one (the app mark still goes to the dashboard).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || activeCampaignId == null) return;
    opened.current = true;
    if (loc.pathname === '/' && !sessionStorageFlag()) nav('/campaign', { replace: true });
  }, [activeCampaignId, loc.pathname, nav]);

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
      else if (((e.ctrlKey || e.metaKey) && e.key === '\\') || (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '[')) toggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = WORKSPACES.find((w) => w.id === ws);
  const groups: Group[] = useMemo(() => {
    if (ws === 'library') return [LIBRARY];
    const gs = current?.groups ?? [];
    if (ws !== 'atlas' || !maps.length) return gs;
    return [{ title: 'Maps', items: maps.map((m) => ({ to: `/atlas/explore/${m.id}`, label: m.name, icon: MapPinned })) }, ...gs];
  }, [ws, current, maps]);

  const link = (it: Item, compact: boolean) =>
    it.external ? (
      <a
        key={it.to}
        href={it.to}
        target="_blank"
        rel="noreferrer"
        title={compact ? it.label : undefined}
        className={`flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-[13px] text-ink/80 hover:bg-raised hover:text-ink ${compact ? 'justify-center' : ''}`}
      >
        <span className="shrink-0 opacity-90">
          <it.icon size={I} />
        </span>
        {!compact && <span className="truncate">{it.label}</span>}
      </a>
    ) : (
      <NavLink
        key={it.to}
        to={it.to}
        end={it.to === '/' || it.to === '/campaign' || it.to === '/tracker' || it.to === '/atlas' || it.to === '/atlas/explore'}
        title={compact ? it.label : undefined}
        className={({ isActive }) =>
          `flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${compact ? 'justify-center' : ''} ${isActive ? 'bg-gold/10 text-gold font-medium' : 'text-ink/80 hover:bg-raised hover:text-ink'}`
        }
      >
        <span className="shrink-0 opacity-90">
          <it.icon size={I} />
        </span>
        {!compact && <span className="truncate">{it.label}</span>}
      </NavLink>
    );

  const sidebar = (compact: boolean, all = false) => (
    <nav aria-label={all ? 'All pages' : `${current?.label ?? 'Library'} pages`} className="flex flex-col h-full">
      {!compact && !all && (
        <div className="px-4 pt-4 pb-2 flex items-center gap-2 text-gold">
          {current ? <current.icon size={I} /> : <Settings size={I} />}
          <span className="font-display text-[15px] tracking-wide">{current?.label ?? 'Library'}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2">
        {(all ? [...WORKSPACES.map((w) => ({ title: w.label, items: w.groups.flatMap((g) => g.items) })), LIBRARY] : groups).map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-2">
              {!compact ? <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim">{g.title}</div> : <div className="mx-3 my-1.5 border-t border-line" />}
              {items.map((it) => link(it, compact))}
            </div>
          );
        })}
      </div>
      {!all && (
        <div className={`border-t border-line p-2 flex ${compact ? 'justify-center' : 'justify-end'}`}>
          <button className="btn-ghost" onClick={toggleSidebar} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title="Collapse or expand ( [ )">
            {compact ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      )}
    </nav>
  );

  const activeTitle = campaigns.find((c) => c.id === activeCampaignId)?.title;

  return (
    <PeekProvider live={live}>
      <PeekKeys />
      <div className="flex flex-col h-full">
        <header className="h-[52px] shrink-0 flex items-center gap-1 border-b border-line bg-panel px-2 md:px-3 elev-1 relative z-[1500]">
          <button className="btn-ghost md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <NavLink to="/" onClick={() => markDashboardVisited()} className="flex items-center gap-2 pr-3 mr-1 md:border-r border-line h-8" title="World Dashboard">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="text-gold shrink-0">
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M16 3v26M3 16h26" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="16" cy="16" r="4" fill="currentColor" opacity=".5" />
            </svg>
            <span className="hidden xl:inline font-display text-gold text-[15px] whitespace-nowrap">{appName}</span>
          </NavLink>
          <nav aria-label="Workspaces" className="hidden md:flex items-stretch h-full">
            {WORKSPACES.map((w) => {
              const on = ws === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => nav(w.home)}
                  aria-current={on ? 'page' : undefined}
                  title={w.label}
                  className={`relative flex items-center gap-1.5 px-2 lg:px-3 text-sm font-display tracking-wide whitespace-nowrap transition-colors ${on ? 'text-gold' : 'text-ink/75 hover:text-ink'}`}
                >
                  <w.icon size={I} />
                  <span className="hidden lg:inline">{w.label}</span>
                  {w.id === 'live' && live && <span className="ml-0.5 h-2 w-2 rounded-full bg-danger animate-pulse" title="A session is live" />}
                  {on && <span className="absolute left-2 right-2 bottom-0 h-[2px] bg-gold rounded-full" />}
                </button>
              );
            })}
          </nav>
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto md:ml-3 flex items-center gap-2 rounded-md border border-line bg-raised px-2.5 h-8 text-sm text-dim hover:border-gold/60 min-w-0 shrink-0 lg:w-48 xl:w-72"
            aria-label="Search"
            title="Search (Ctrl K)"
          >
            <Search size={14} className="shrink-0" /> <span className="hidden lg:inline truncate">Search…</span>
            <kbd className="ml-auto hidden xl:inline whitespace-nowrap text-[10px] border border-line rounded px-1">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Dropdown
              label="Active campaign"
              align="right"
              button={
                <span className="flex items-center gap-1.5 max-w-[160px]">
                  <Compass size={15} className="shrink-0" />
                  <span className="hidden xl:inline truncate text-sm">{activeTitle ?? 'No campaign'}</span>
                  <ChevronDown size={13} className="shrink-0" />
                </span>
              }
            >
              {(close) => (
                <>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim">Active campaign</div>
                  {campaigns.map((c) => (
                    <button
                      key={c.id}
                      role="menuitemradio"
                      aria-checked={c.id === activeCampaignId}
                      className={menuItem}
                      onClick={async () => {
                        close();
                        await setActiveCampaignId(c.id);
                      }}
                    >
                      <span className="w-4 shrink-0">{c.id === activeCampaignId && <Check size={14} className="text-gold" />}</span>
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                  {!campaigns.length && <div className="px-3 py-1.5 text-sm text-dim">No campaigns yet.</div>}
                  <div className="my-1 border-t border-line" />
                  <button
                    className={menuItem}
                    onClick={() => {
                      close();
                      nav('/campaigns');
                    }}
                  >
                    <BookMarked size={14} /> All campaigns
                  </button>
                </>
              )}
            </Dropdown>
            <a href="/player" target="_blank" rel="noreferrer" className="btn-ghost" title="Open the player view in a new tab" aria-label="Player View">
              <Eye size={16} /> <span className="hidden 2xl:inline whitespace-nowrap">Player View</span>
            </a>
            <InspectorButton />
            <button
              className="btn-ghost"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Use Warm Parchment' : 'Use Dark Codex'}
              title={theme === 'dark' ? 'Warm Parchment' : 'Dark Codex'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Dropdown label="Library" align="right" active={ws === 'library'} button={<Settings size={16} />}>
              {(close) => (
                <>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim">Library</div>
                  {LIBRARY.items.filter(visible).map((it) => (
                    <button
                      key={it.to}
                      role="menuitem"
                      className={`${menuItem} ${matches(loc.pathname, it.to) ? 'text-gold' : ''}`}
                      onClick={() => {
                        close();
                        nav(it.to);
                      }}
                    >
                      <it.icon size={I} /> {it.label}
                    </button>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
        </header>
        <div className="flex-1 flex min-h-0">
          <aside className={`hidden md:block shrink-0 bg-panel/70 border-r border-line transition-[width] duration-150 ${compact ? 'w-14' : fullBleed ? 'w-[272px]' : 'w-[248px]'}`}>
            {fullBleed && !compact ? (
              <div className="flex flex-col h-full">
                <div ref={setSlotEl} className="flex-1 overflow-y-auto" />
                <div className="border-t border-line p-2 flex items-center">
                  <NavLink to="/atlas" className="btn-ghost text-xs" title="Add maps and list their pins">
                    <MapIcon size={14} /> Manage maps
                  </NavLink>
                  <button className="btn-ghost ml-auto" onClick={toggleSidebar} aria-label="Collapse sidebar" title="Collapse ( [ ): the map's legend floats over it instead">
                    <ChevronsLeft size={16} />
                  </button>
                </div>
              </div>
            ) : (
              sidebar(compact)
            )}
          </aside>
          {mobileNav && (
            <div className="fixed inset-0 z-[1800] md:hidden bg-black/50" onClick={() => setMobileNav(false)}>
              <aside className="w-72 h-full bg-panel border-r border-line flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-line">
                  <span className="font-display text-gold">{appName}</span>
                  <button className="btn-ghost" onClick={() => setMobileNav(false)} aria-label="Close navigation">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 min-h-0">{sidebar(false, true)}</div>
              </aside>
            </div>
          )}
          {fullBleed ? (
            <main className="flex-1 relative overflow-hidden min-w-0" id="main">
              <SplitView enabled={splitOk}>
                <SidebarSlotContext.Provider value={slot}>
                  <Outlet />
                </SidebarSlotContext.Provider>
              </SplitView>
            </main>
          ) : (
            <main className="flex-1 overflow-hidden min-w-0" id="main">
              <SplitView enabled={splitOk}>
                <div className="h-full overflow-y-auto" id="main-scroll">
                  <div className="mx-auto max-w-[1500px] p-4 md:p-6">
                    <Outlet />
                  </div>
                </div>
              </SplitView>
            </main>
          )}
          {!narrow && <Inspector overlay={false} />}
        </div>
        {narrow && <Inspector overlay />}
        {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
        <ConfirmHost />
        <ToastHost />
      </div>
    </PeekProvider>
  );
}

// Once the GM has chosen the dashboard in this visit, a reload doesn't send them back to the campaign.
const FLAG = 'wk.dashboardVisited';
function sessionStorageFlag() {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
function markDashboardVisited() {
  try {
    sessionStorage.setItem(FLAG, '1');
  } catch {
    /* preference only */
  }
}
