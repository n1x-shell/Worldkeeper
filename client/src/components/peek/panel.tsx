/**
 * A page's own panel in the inspector (docs/DESIGN_OVERHAUL.md §4.4): e.g. the record page's links, mentions and
 * revisions. While the inspector is docked beside the page, the panel shows there (as "This page"); otherwise the
 * page shows it inline. On wide screens (1440px and up) the inspector opens by itself on such pages, unless the GM
 * closed it there before.
 *
 *   const inspector = useInspectorPanel('Record details');
 *   ...
 *   {inspector.render(<Details />)}            // portals into the inspector, or renders in place
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePeek } from './context';

const AUTO = 'wk.inspector.auto';
export const autoOpenOff = () => {
  try {
    return localStorage.getItem(AUTO) === 'off';
  } catch {
    return false;
  }
};
export const setAutoOpen = (on: boolean) => {
  try {
    localStorage.setItem(AUTO, on ? 'on' : 'off');
  } catch {
    /* preference only */
  }
};

export function useInspectorPanel(title: string | null) {
  const p = usePeek();
  const setTitle = p?.setPanelTitle;
  useEffect(() => {
    if (!setTitle || !title) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
  // Open on wide screens, showing this page's panel.
  const open = p?.setInspectorOpen;
  const setTab = p?.setTab;
  useEffect(() => {
    if (!title || !open || !setTab || autoOpenOff() || !window.matchMedia?.('(min-width: 1440px)').matches) return;
    open(true);
    setTab('page');
    // Only when the page first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);
  const target = p && p.inspectorOpen && p.docked && p.panel?.el ? p.panel.el : null;
  return {
    /** True while the panel shows in the inspector (so the page can drop its inline copy). */
    inInspector: !!target && p?.tab === 'page',
    render: (node: ReactNode) => (target ? createPortal(node, target) : node),
  };
}
