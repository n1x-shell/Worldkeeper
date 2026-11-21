/**
 * A page can fill the app's sidebar with its own controls (the map's legend and map switcher): the shell gives it the
 * sidebar's container here while the sidebar is open, and null while it is collapsed or hidden.
 */
import { createContext, useContext } from 'react';

export const SidebarSlotContext = createContext<HTMLElement | null>(null);
export const useSidebarSlot = () => useContext(SidebarSlotContext);
