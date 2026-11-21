/**
 * Where every page sits (docs/DESIGN_OVERHAUL.md, section 5): the five workspaces and their sidebar groups, and the
 * Library menu. URLs are unchanged; tests/navigation.test.ts checks that no page lost its link.
 */
import type { Mechanics } from '../../../shared/mechanics';
import {
  Archive,
  Atom,
  BookMarked,
  BookOpen,
  CalendarDays,
  Castle,
  CircleHelp,
  Clock,
  Compass,
  Crown,
  Dice5,
  Drama,
  Eclipse,
  Eye,
  Feather,
  FileWarning,
  Flag,
  Flame,
  Gavel,
  Gem,
  Ghost,
  Gift,
  Globe2,
  HeartPulse,
  History,
  Home,
  KeyRound,
  Landmark,
  Library,
  LibraryBig,
  ListChecks,
  Map as MapIcon,
  MapPinned,
  MessageCircleQuestion,
  Mountain,
  Network,
  NotebookPen,
  Palette,
  Printer,
  Scale,
  ScrollText,
  Search,
  Settings,
  Shield,
  Signature,
  Skull,
  Sparkles,
  Swords,
  Table2,
  Upload,
  UserPlus,
  UserSquare2,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export type Item = { to: string; label: string; icon: LucideIcon; /** Opens in a new tab (outside the GM shell). */ external?: boolean };
export type Group = { title: string; items: Item[] };
export type WorkspaceId = 'codex' | 'campaign' | 'characters' | 'atlas' | 'live';
export type Workspace = { id: WorkspaceId; label: string; icon: LucideIcon; home: string; groups: Group[] };

export const WORKSPACES: Workspace[] = [
  {
    id: 'codex',
    label: 'Codex',
    icon: BookOpen,
    home: '/',
    groups: [
      {
        title: 'World',
        items: [
          { to: '/', label: 'World Dashboard', icon: Home },
          { to: '/world', label: 'World Overview', icon: Globe2 },
          { to: '/timeline', label: 'World Timeline', icon: Clock },
          { to: '/browse/cosmology', label: 'Cosmology', icon: Atom },
          { to: '/browse/pantheon', label: 'Pantheon', icon: Crown },
          { to: '/browse/cultures', label: 'Cultures and Peoples', icon: Users },
          { to: '/browse/magic', label: 'Magic Systems', icon: Sparkles },
        ],
      },
      {
        title: 'Realms',
        items: [
          { to: '/realm/aetheris', label: 'Aetheris', icon: Mountain },
          { to: '/realm/kaelmar', label: 'Kaelmar', icon: Flame },
          { to: '/realm/ethereal', label: 'Ethereal Realm', icon: Ghost },
        ],
      },
      {
        title: 'Records',
        items: [
          { to: '/browse/all', label: 'All Lore', icon: Library },
          { to: '/browse/regions', label: 'Regions and Settlements', icon: Castle },
          { to: '/browse/landmarks', label: 'Landmarks and Buildings', icon: Landmark },
          { to: '/browse/npcs', label: 'NPCs', icon: UserSquare2 },
          { to: '/browse/factions', label: 'Factions and Cults', icon: Flag },
          { to: '/browse/artifacts', label: 'Shards and Artifacts', icon: Gem },
          { to: '/browse/creatures', label: 'Creatures', icon: Skull },
          { to: '/browse/events', label: 'Historical Events', icon: ScrollText },
        ],
      },
      {
        title: 'Secrets and links',
        items: [
          { to: '/mysteries', label: 'Mysteries and Secrets', icon: Eye },
          { to: '/graph', label: 'Relationships', icon: Network },
        ],
      },
    ],
  },
  {
    id: 'campaign',
    label: 'Campaign',
    icon: Compass,
    home: '/campaign',
    groups: [
      {
        title: 'Campaign',
        items: [
          { to: '/campaign', label: 'Overview', icon: Compass },
          { to: '/campaigns', label: 'All Campaigns', icon: BookMarked },
          { to: '/campaign/sessions', label: 'Sessions', icon: BookOpen },
          { to: '/campaign/journal', label: 'Session Journal', icon: Feather },
          { to: '/campaign/calendar', label: 'Calendar', icon: CalendarDays },
        ],
      },
      {
        title: 'Story',
        items: [
          { to: '/campaign/adventures', label: 'Adventures', icon: MapPinned },
          { to: '/campaign/arcs', label: 'Story Arcs', icon: Waypoints },
          { to: '/campaign/quests', label: 'Quests', icon: ListChecks },
          { to: '/campaign/handouts', label: 'Handouts', icon: Gift },
        ],
      },
      {
        title: 'Prep',
        items: [
          { to: '/campaign/encounters', label: 'Encounters', icon: Swords },
          { to: '/agendas', label: 'Faction Agendas', icon: Flag },
          { to: '/rumours', label: 'Rumours', icon: MessageCircleQuestion },
          { to: '/world-events', label: 'World Events', icon: Sparkles },
        ],
      },
      {
        title: 'World state',
        items: [
          { to: '/campaign/standing', label: 'Faction Standing', icon: Scale },
          { to: '/campaign/faction-web', label: 'Faction Web', icon: Network },
          { to: '/campaign/regions', label: 'State of the World', icon: Globe2 },
          { to: '/campaign/return', label: 'The Return', icon: Eclipse },
          { to: '/campaign/treasure', label: 'Treasure', icon: Gem },
          { to: '/campaign/bastions', label: 'Bastions and Downtime', icon: Castle },
        ],
      },
      {
        title: 'For players',
        items: [{ to: '/campaign/party-export', label: 'What the Party Knows', icon: Printer }],
      },
    ],
  },
  {
    id: 'characters',
    label: 'Characters',
    icon: Shield,
    home: '/campaign/party',
    groups: [
      {
        title: 'Party',
        items: [
          { to: '/campaign/party', label: 'Party and Characters', icon: Shield },
          { to: '/player/builder', label: 'Make a Character', icon: UserPlus, external: true },
        ],
      },
      {
        title: 'Reference',
        items: [
          { to: '/npc-ref', label: 'NPC Quick Reference', icon: UserSquare2 },
          { to: '/books', label: 'Your Books', icon: LibraryBig },
          { to: '/names', label: 'Name Generator', icon: Signature },
        ],
      },
    ],
  },
  {
    id: 'atlas',
    label: 'Atlas',
    icon: MapIcon,
    // The full map view is the Atlas's home. The sidebar lists each map (added by the shell) and, on the map
    // itself, holds its legend; Manage maps is where maps are added and pins are listed.
    home: '/atlas/explore',
    groups: [
      {
        title: 'Manage',
        items: [{ to: '/atlas', label: 'Manage maps', icon: MapIcon }],
      },
    ],
  },
  {
    id: 'live',
    label: 'Live',
    icon: Swords,
    home: '/campaign/live',
    groups: [
      {
        title: 'Session',
        items: [
          { to: '/campaign/live', label: 'Live Session', icon: Swords },
          { to: '/dm', label: 'DM Screen', icon: Drama },
          { to: '/notes', label: 'Notes and Scratchpad', icon: NotebookPen },
        ],
      },
      {
        title: 'Combat',
        items: [
          { to: '/tracker', label: 'Encounter Tracker', icon: Swords },
          { to: '/tracker/quick', label: 'Initiative', icon: HeartPulse },
          { to: '/conditions', label: 'Combat Conditions', icon: Scale },
          { to: '/dice', label: 'Dice Roller', icon: Dice5 },
        ],
      },
      {
        title: 'Reference',
        items: [
          { to: '/rules', label: 'Rules Reference', icon: Gavel },
          { to: '/quick-reference', label: 'Quick Reference', icon: ScrollText },
          { to: '/tables', label: 'Random Tables', icon: Table2 },
        ],
      },
    ],
  },
];

/** The Library menu (gear, top right): looking after the library itself. */
export const LIBRARY: Group = {
  title: 'Library',
  items: [
    { to: '/search', label: 'Search', icon: Search },
    { to: '/publish', label: 'Publish for Players', icon: Globe2 },
    { to: '/import', label: 'Import and Export', icon: Upload },
    { to: '/review', label: 'Canon Review', icon: KeyRound },
    { to: '/consistency', label: 'Consistency Check', icon: ListChecks },
    { to: '/open-questions', label: 'Open Questions', icon: CircleHelp },
    { to: '/history', label: 'Change History', icon: History },
    { to: '/backups', label: 'Backups', icon: Archive },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/broken', label: 'Broken References', icon: FileWarning },
    { to: '/documents', label: 'Source Documents', icon: BookOpen },
    { to: '/style-guide', label: 'Style Guide', icon: Palette },
  ],
};

/** Pages for developers (the source files themselves, the style guide); shown in debug mode only. */
export const DEBUG_ONLY = new Set(['/documents', '/broken', '/style-guide']);
/** Menu items for the setting's own mechanics, shown only while they're switched on (Settings, Campaign mechanics). */
export const NEEDS: Record<string, keyof Mechanics> = {
  '/realm/aetheris': 'setting',
  '/realm/kaelmar': 'setting',
  '/realm/ethereal': 'setting',
  '/quick-reference': 'setting',
  '/campaign/return': 'theReturn',
};
/** Pages with no menu item of their own, by the workspace they belong to. */
const FALLBACK: [RegExp, WorkspaceId | 'library'][] = [
  [/^\/(e|new|aetheris|kaelmar|ethereal|realm|browse)(\/|$)/, 'codex'],
  [/^\/(adventure|session)\//, 'campaign'],
  [/^\/campaign\/live(\/|$)/, 'live'],
  [/^\/tracker(\/|$)/, 'live'],
  [/^\/atlas(\/|$)/, 'atlas'],
  [/^\/campaigns?(\/|$)/, 'campaign'],
];
export const matches = (path: string, to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'));

/** Which workspace a path belongs to ('library' for the Library menu's pages). */
export function workspaceFor(path: string): WorkspaceId | 'library' {
  let best: { ws: WorkspaceId | 'library'; len: number } | null = null;
  const consider = (ws: WorkspaceId | 'library', to: string) => {
    if (matches(path, to) && (!best || to.length > best.len)) best = { ws, len: to.length };
  };
  for (const w of WORKSPACES) for (const g of w.groups) for (const it of g.items) if (!it.external) consider(w.id, it.to);
  for (const it of LIBRARY.items) consider('library', it.to);
  if (best) return (best as { ws: WorkspaceId | 'library' }).ws;
  return FALLBACK.find(([re]) => re.test(path))?.[1] ?? 'codex';
}

/** Pages that fill the main view edge to edge, with no page margins (the map explorer). */
export const FULL_BLEED = /^\/atlas\/explore(\/|$)/;
