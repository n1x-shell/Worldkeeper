/**
 * The world's own page for a character: Thinning, their true name and who knows it, and their named memories. The
 * player edits everything but Thinning, and a struck memory stays struck. The GM edits all of it: sets Thinning and
 * Shardscarred, and can restore or remove a memory if the table agrees.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Rule } from './parts';
import { ask } from '../../components/ui/overlays';

export interface ThinningPage {
  true_name: string;
  memories: { id?: number; text: string; struck: boolean }[];
  known_by: string[];
  thinning: number;
  shardscarred: boolean;
  notes: string;
}

export function ThinningTab({ page, onChange, gm = false }: { page: ThinningPage; onChange: (next: ThinningPage, now?: boolean) => void; gm?: boolean }) {
  const [newMemory, setNewMemory] = useState('');
  const [newName, setNewName] = useState('');
  const kept = page.memories.filter((m) => !m.struck);
  const struck = page.memories.filter((m) => m.struck);
  const toStrike = page.thinning > struck.length && kept.length > 0;
  const set = (p: Partial<ThinningPage>, now = false) => onChange({ ...page, ...p }, now);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Rule>Thinning</Rule>
        <div className="flex flex-wrap items-center gap-1.5" role={gm ? 'radiogroup' : undefined} aria-label={`Thinning ${page.thinning} of 6`}>
          {(gm ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]).map((n) =>
            gm ? (
              <button
                key={n}
                role="radio"
                aria-checked={n === page.thinning}
                aria-label={`Thinning ${n}`}
                className={`h-9 w-9 rounded border text-sm ${n === page.thinning ? 'bg-gold/30 border-gold text-gold' : n && n <= page.thinning ? 'bg-gold/10 border-gold/50 text-gold' : 'border-line text-dim'}`}
                onClick={() => set({ thinning: n }, true)}
              >
                {n}
              </button>
            ) : (
              <span key={n} className={`flex h-9 w-9 items-center justify-center rounded border text-sm ${n <= page.thinning ? 'bg-gold/30 border-gold text-gold' : 'border-line text-dim'}`}>
                {n}
              </span>
            ),
          )}
          {page.shardscarred && !gm && <span className="chip border-gold/50 text-gold ml-2">Shardscarred</span>}
        </div>
        <p className="text-sm">
          Thinning save: Charisma, <b>DC {12 + page.thinning}</b>. Hearing your true name from someone who knows it gives Advantage. At 3, you stop answering to your name without effort. At 6, you
          join the harmony.
        </p>
        {gm ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={page.shardscarred} onChange={(e) => set({ shardscarred: e.target.checked }, true)} /> Shardscarred: Advantage on saves against memory changes and rewriting
          </label>
        ) : (
          <p className="text-xs text-dim">Your GM changes this after a failed save, or when a month among people who use your name brings you back a step.</p>
        )}
      </section>

      <section className="space-y-2">
        <Rule>True name</Rule>
        <input className="input font-serif text-[16px]" value={page.true_name} placeholder="The name that pulls you back" onChange={(e) => set({ true_name: e.target.value })} aria-label="True name" />
        <div className="text-[10px] uppercase tracking-[0.16em] text-dim pt-1">Who knows it</div>
        <ul className="flex flex-wrap gap-1.5">
          {page.known_by.map((n) => (
            <li key={n} className="chip border-line">
              {n}
              <button className="ml-1 text-dim hover:text-danger" aria-label={`Remove ${n}`} onClick={() => set({ known_by: page.known_by.filter((x) => x !== n) }, true)}>
                <X size={12} />
              </button>
            </li>
          ))}
          {!page.known_by.length && <li className="text-sm text-dim">Nobody yet.</li>}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newName.trim();
            if (n && !page.known_by.includes(n)) set({ known_by: [...page.known_by, n] }, true);
            setNewName('');
          }}
        >
          <input
            className="input flex-1"
            value={newName}
            placeholder="Someone who knows the true name"
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Add someone who knows your true name"
          />
          <button className="btn" aria-label="Add">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <Rule>Named memories</Rule>
        {toStrike && (
          <p className="rounded border border-gold/60 p-2 text-sm text-gold">
            {gm ? 'Thinning is above the struck memories: the player strikes one.' : 'Your Thinning has gone up. Strike one memory, for good.'}
          </p>
        )}
        <ul className="space-y-1.5">
          {kept.map((m) => (
            <li key={m.id ?? m.text} className="flex gap-2 items-center">
              <input
                className="input flex-1 font-serif text-[15px]"
                value={m.text}
                aria-label="Memory"
                onChange={(e) => set({ memories: page.memories.map((x) => (x === m ? { ...x, text: e.target.value } : x)) })}
              />
              <button
                className="btn-ghost text-sm"
                onClick={async () => {
                  if (await ask({ title: 'Strike this memory?', body: `Strike "${m.text}" for good? Lost memories don't come back.`, danger: true, confirmLabel: 'Strike it' })) set({ memories: page.memories.map((x) => (x === m ? { ...x, struck: true } : x)) }, true);
                }}
              >
                Strike
              </button>
              {gm && (
                <button className="btn-ghost text-sm" aria-label={`Remove ${m.text}`} onClick={() => set({ memories: page.memories.filter((x) => x !== m) }, true)}>
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
          {struck.map((m) => (
            <li key={m.id ?? m.text} className="flex items-center gap-2 px-3">
              <span className="flex-1 text-dim line-through font-serif">{m.text}</span>
              {gm && (
                <button
                  className="btn-ghost text-xs"
                  title="Only if the table agrees: lost memories don't normally come back"
                  onClick={() => set({ memories: page.memories.map((x) => (x === m ? { ...x, struck: false } : x)) }, true)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = newMemory.trim();
            if (t) set({ memories: [...page.memories, { text: t, struck: false }] }, true);
            setNewMemory('');
          }}
        >
          <input className="input flex-1" value={newMemory} placeholder="A mother's laugh, the smell of rain on slate…" onChange={(e) => setNewMemory(e.target.value)} aria-label="Add a memory" />
          <button className="btn" aria-label="Add memory">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <Rule>{gm ? "The player's notes" : 'Notes'}</Rule>
        <textarea className="input min-h-[120px]" value={page.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Notes" />
      </section>
    </div>
  );
}
