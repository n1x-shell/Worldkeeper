import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { useApi } from '../lib/api';
import { Loading, PageHeader } from '../components/ui';

/**
 * The name generator: new names in a people's style, made from the common names on its page. A first name or a
 * surname that anyone in the world already has is never offered.
 */
export function NamesPage() {
  const { data: peoples } = useApi<{ id: string; name: string; seeds: number }[]>('/api/names/peoples');
  const [people, setPeople] = useState('');
  const [seed, setSeed] = useState(() => Date.now());
  const chosen = people || peoples?.find((p) => p.name === 'Humans')?.id || peoples?.[0]?.id || '';
  const { data } = useApi<{ people: string; names: string[] }>(chosen ? `/api/names?people=${encodeURIComponent(chosen)}&count=16&seed=${seed}` : null);
  const [copied, setCopied] = useState('');
  const copy = (n: string) => {
    void navigator.clipboard?.writeText(n);
    setCopied(n);
  };
  if (!peoples) return <Loading />;
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Name Generator" subtitle="New names in a people's style. Nobody in the world already has any of these first names or surnames." />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-xs" value={chosen} onChange={(e) => setPeople(e.target.value)} aria-label="People">
          {peoples.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setSeed(Date.now())}>
          <RefreshCw size={14} /> More names
        </button>
      </div>
      {data ? (
        data.names.length ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.names.map((n) => (
              <li key={n}>
                <button className="w-full text-left panel px-3 py-2 flex items-center gap-2 hover:border-gold/60" onClick={() => copy(n)} title="Copy">
                  <span className="flex-1 font-display">{n}</span>
                  <Copy size={13} className={copied === n ? 'text-gold' : 'text-dim'} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-dim text-sm">No new names left in this style. Try another people.</p>
        )
      ) : (
        <Loading />
      )}
      {copied && <p className="text-xs text-dim">Copied {copied}.</p>}
    </div>
  );
}
