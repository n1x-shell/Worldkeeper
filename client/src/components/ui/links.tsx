/** Links to records. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../lib/store';

/** Link to a record by stable ID; shows the record name when known, flags broken links. */
export function EntityLink({ id, children, className = '' }: { id: string; children?: ReactNode; className?: string }) {
  const { index, indexLoaded } = useAppState();
  const e = index.get(id);
  const { debug } = useAppState();
  if (indexLoaded && !e)
    return (
      <span className="text-danger underline decoration-wavy" title={debug ? `No record with ID ${id}` : 'This record no longer exists'}>
        {children ?? (debug ? id : 'missing record')}
      </span>
    );
  return (
    <Link to={`/e/${encodeURIComponent(id)}`} className={`text-arcane hover:text-gold ${className}`} title={debug && e ? `${e.name} · ${id}` : undefined}>
      {children ?? e?.name ?? id}
    </Link>
  );
}
