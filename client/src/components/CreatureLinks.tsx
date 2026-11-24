/** Book creatures named somewhere (a table roll, an encounter idea), each opening its stat block. GM only. */
import { useState } from 'react';
import { Swords } from 'lucide-react';
import { StatBlockById } from './StatBlock';

export function CreatureLinks({ creatures, label = 'Stat blocks' }: { creatures: { id: string; name: string; count?: number }[]; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!creatures.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-dim flex items-center gap-1">
          <Swords size={12} /> {label}:
        </span>
        {creatures.map((c) => (
          <button key={c.id} className={`chip ${open === c.id ? 'border-gold text-gold' : 'border-line'}`} aria-pressed={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.count && c.count > 1 ? `${c.count} × ` : ''}
            {c.name}
          </button>
        ))}
      </div>
      {open && (
        <div className="rounded-sm border border-line p-3 bg-panel/40">
          <StatBlockById id={open} />
        </div>
      )}
    </div>
  );
}
