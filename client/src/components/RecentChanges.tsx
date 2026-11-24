/**
 * Recent changes to faction plans and campaign state, each with Undo (v0.6.6). One GM action is one step: undoing it
 * puts back everything it changed. A step something later changed again can't be undone until that one is.
 */
import { useEffect } from 'react';
import { Undo2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { toast } from './ui';

interface Action {
  id: number;
  label: string;
  created_at: string;
  can_undo: boolean;
  why_not: string | null;
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** `watch`: anything that changes when the page's data does, so the list follows it. */
export function RecentChanges({ campaignId, watch, onUndone, limit = 5 }: { campaignId: number; watch?: unknown; onUndone: () => void; limit?: number }) {
  const { data, reload } = useApi<Action[]>(`/api/undo?campaign_id=${campaignId}`);
  useEffect(() => {
    void reload();
  }, [watch, reload]);
  if (!data?.length) return null;
  return (
    <div className="text-xs space-y-1" aria-label="Recent changes">
      <div className="label">Recent changes</div>
      <ul className="space-y-0.5">
        {data.slice(0, limit).map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate" title={a.label}>
              {a.label} <span className="text-dim">· {ago(a.created_at)}</span>
            </span>
            <button
              className="btn-ghost text-xs shrink-0"
              disabled={!a.can_undo}
              title={a.can_undo ? `Undo: ${a.label}` : (a.why_not ?? '')}
              onClick={async () => {
                try {
                  await api.post(`/api/undo/${a.id}`, {});
                  toast(`Undone: ${a.label}`, 'ok');
                  onUndone();
                  void reload();
                } catch (x) {
                  toast((x as Error).message, 'danger');
                }
              }}
            >
              <Undo2 size={12} /> Undo
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
