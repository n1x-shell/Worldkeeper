/** The GM app's page header (its how-it-works note shows only in debug mode). */
import type { ReactNode } from 'react';
import { useAppState } from '../../lib/store';

/** `note` is a how-it-works explanation, shown only in debug mode. */
export function PageHeader({ title, subtitle, note, actions, icon }: { title: ReactNode; subtitle?: ReactNode; note?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  const { debug } = useAppState();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl text-gold flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {subtitle && <div className="text-sm text-dim mt-1">{subtitle}</div>}
        {note && debug && <div className="text-xs text-dim mt-1 italic">{note}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
