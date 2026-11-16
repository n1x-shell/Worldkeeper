/** The sheet's Log tab: every change, who made it (the player or the GM) and when, newest first. */
import { useEffect, useState } from 'react';

export interface LogEntry {
  id: number;
  at: string;
  by: 'player' | 'gm';
  field: string;
  label: string;
  summary: string;
}

export function LogTab({ load, refresh }: { load: () => Promise<LogEntry[]>; refresh: unknown }) {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [who, setWho] = useState<'all' | 'player' | 'gm'>('all');
  useEffect(() => {
    let live = true;
    void load()
      .then((l) => live && setLog(l))
      .catch(() => live && setLog([]));
    return () => {
      live = false;
    };
  }, [load, refresh]);
  if (!log) return <p className="text-sm text-dim">Loading…</p>;
  const shown = log.filter((e) => who === 'all' || e.by === who);
  const days = new Map<string, LogEntry[]>();
  for (const e of shown) {
    const d = new Date(e.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-dim">Show changes by</span>
        {(['all', 'player', 'gm'] as const).map((w) => (
          <button key={w} className={`chip ${who === w ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setWho(w)} aria-pressed={who === w}>
            {w === 'all' ? 'Everyone' : w === 'gm' ? 'The GM' : 'The player'}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-dim">No changes yet. Edits made in a burst of typing are grouped into one.</p>}
      {[...days].map(([day, entries]) => (
        <section key={day} className="space-y-1">
          <h3 className="ledger-rule">{day}</h3>
          <ol className="divide-y divide-line/40">
            {entries.map((e) => (
              <li key={e.id} className="grid grid-cols-[4.75rem_4.5rem_1fr] gap-2 py-1.5 text-sm items-baseline">
                <time className="text-dim tabular-nums" dateTime={e.at}>
                  {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className={`chip justify-center ${e.by === 'gm' ? 'border-arcane/60 text-arcane' : 'border-gold/60 text-gold'}`}>{e.by === 'gm' ? 'GM' : 'Player'}</span>
                <span>
                  <span className="font-medium">{e.label}</span> <span className="text-dim">{e.summary}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
