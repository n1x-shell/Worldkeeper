import type { ReactNode } from 'react';
import { useAppState } from '../lib/store';

/** Technical details (IDs, file names, sources, how-it-works notes) render only in debug mode. */
export function Dev({ children }: { children: ReactNode }) {
  const { debug } = useAppState();
  return debug ? <>{children}</> : null;
}

export function useDebug() {
  return useAppState().debug;
}
