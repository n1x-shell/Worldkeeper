/** The sheet's Log tab: every change, who made it (the player or the GM) and when, newest first. */
import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/badges';
import { Segmented } from '../../components/ui/inputs';
import { Empty, Loading } from '../../components/ui/feedback';

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
  if (!log) return <Loading inline label="Loading the log…" />;
  const shown = log.filter((e) => who === 'all' || e.by === who);
  const days = new Map<string, LogEntry[]>();
  for (const e of shown) {
    const d = new Date(e.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm max-sm:[&_button]:min-h-10">
        <span className="text-dim">Show changes by</span>
        <Segmented
          label="Show changes by"
          value={who}
          onChange={setWho}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'player', label: 'The player' },
            { value: 'gm', label: 'The GM' },
          ]}
        />
      </div>
      {shown.length === 0 && <Empty compact title="No changes yet.">Edits made in a burst of typing are grouped into one.</Empty>}
      {[...days].map(([day, entries]) => (
        <section key={day} className="space-y-1">
          <h3 className="ledger-rule">{day}</h3>
          <ol className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 py-2 text-sm sm:grid-cols-[4.75rem_4.5rem_minmax(0,1fr)]">
                <time className="num text-dim" dateTime={e.at}>
                  {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </time>
                <Badge tone={e.by === 'gm' ? 'arcane' : 'gold'} className="justify-self-start sm:justify-self-stretch sm:justify-center">
                  {e.by === 'gm' ? 'GM' : 'Player'}
                </Badge>
                <span className="col-start-2 sm:col-start-auto">
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
