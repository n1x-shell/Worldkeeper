/**
 * The dashboard's Getting started card (docs/OWN_WORLD_PLAN.md §2.7): a checklist that follows what the GM does
 * (worked out by the server, or ticked by hand), and Remove the tutorial records once they're done with them.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Circle, Trash2, X } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Card, Confirm } from './ui';

interface State {
  show: boolean;
  items: { key: string; label: string; done: boolean; to: string }[];
  tutorial: number;
}

export function GettingStarted() {
  const { data, setData } = useApi<State>('/api/getting-started');
  const { reloadIndex } = useAppState();
  const [confirm, setConfirm] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);
  if (!data?.show) return null;
  const done = data.items.filter((i) => i.done).length;
  const update = async (body: Record<string, unknown>) => setData(await api.put<State>('/api/getting-started', body));
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Getting started{' '}
          <span className="num text-xs text-dim font-sans normal-case tracking-normal">
            {done} of {data.items.length}
          </span>
        </span>
      }
      actions={
        <button className="btn-ghost !px-1.5" aria-label="Hide Getting started" title="Hide this card" onClick={() => void update({ dismissed: true })}>
          <X size={14} />
        </button>
      }
    >
      <div className="h-1.5 rounded-full bg-raised overflow-hidden mb-3" aria-hidden>
        <div className="h-full bg-gold transition-[width]" style={{ width: `${(done / Math.max(1, data.items.length)) * 100}%` }} />
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.items.map((i) => (
          <li key={i.key} className="flex items-start gap-2">
            <button
              type="button"
              className={`mt-0.5 shrink-0 ${i.done ? 'text-good' : 'text-dim hover:text-gold'}`}
              aria-label={i.done ? `Done: ${i.label}` : `Mark done: ${i.label}`}
              aria-pressed={i.done}
              onClick={() => void update(i.done ? { untick: i.key } : { tick: i.key })}
            >
              {i.done ? <Check size={15} /> : <Circle size={15} />}
            </button>
            <Link to={i.to} className={i.done ? 'text-dim line-through decoration-dim/50' : 'text-ink hover:text-gold'}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
      {data.tutorial > 0 && (
        <div className="mt-4 border-t border-line pt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-dim">
            {data.tutorial} tutorial record{data.tutorial === 1 ? '' : 's'} in your library.
          </span>
          <button className="btn ml-auto" onClick={() => setConfirm(true)}>
            <Trash2 size={14} /> Remove the tutorial records
          </button>
        </div>
      )}
      {removed != null && (
        <p className="mt-3 text-sm text-dim" role="status">
          Removed {removed} tutorial record{removed === 1 ? '' : 's'}. A backup was made first.
        </p>
      )}
      {confirm && (
        <Confirm
          title="Remove the tutorial records?"
          body="Start Here and the records it links to (the inn, the NPC, the faction and the landmark) are deleted, with their links and pins. Your own records, your campaign and its town stay. A backup is made first."
          confirmLabel="Remove them"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            const r = await api.del<{ removed: number }>('/api/setup/tutorial');
            setRemoved(r.removed);
            await reloadIndex();
            setData(await api.get<State>('/api/getting-started'));
          }}
        />
      )}
    </Card>
  );
}
