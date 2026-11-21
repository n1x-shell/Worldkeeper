/** Quick-Peek state (docs/DESIGN_OVERHAUL.md §8): the inspector, split view and pinned stat blocks. */
import { createContext, useContext } from 'react';
import type { EntityType, Realm } from '@shared/domain';

export interface PeekData {
  id: string;
  name: string;
  type: EntityType;
  realm: Realm;
  canon_status: string;
  canon_flags: string[];
  revealed: boolean;
  archived: boolean;
  summary: string;
  facts: [string, string][];
  sections: { heading: string; content: string; secret: boolean }[];
  links: { id: string; name: string; label: string }[];
  hasStatBlock: boolean;
}

export interface Pin {
  /** A stat block id: a record's ID, or a book creature ("book:…"). */
  id: string;
  name: string;
}

export type InspectorTab = 'page' | 'record' | 'pinned';

export interface PeekApi {
  /** Open a record in the inspector. */
  peek: (id: string) => void;
  /** Open a record beside the current page (split view). */
  openBeside: (id: string) => void;
  closeBeside: () => void;
  beside: string | null;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  /** What the inspector shows: the peeked records (newest last), or the pinned stat blocks. */
  inspected: string[];
  back: () => void;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  /** A page's own panel in the inspector ("This page"): its title, and where to portal it while the inspector is docked. */
  panel: { title: string; el: HTMLElement | null } | null;
  setPanelTitle: (title: string | null) => void;
  setPanelEl: (el: HTMLElement | null) => void;
  /** Whether the inspector is docked beside the page (wide screens), rather than overlaying it. */
  docked: boolean;
  setDocked: (d: boolean) => void;
  pins: Pin[];
  pin: (p: Pin) => void;
  unpin: (id: string) => void;
  /** A record's peek, cached for the visit. */
  load: (id: string) => Promise<PeekData>;
  cached: (id: string) => PeekData | undefined;
}

export const PeekContext = createContext<PeekApi | null>(null);

/** Quick-Peek, when the page is inside the GM layout (null elsewhere, e.g. the player view). */
export function usePeek() {
  return useContext(PeekContext);
}
