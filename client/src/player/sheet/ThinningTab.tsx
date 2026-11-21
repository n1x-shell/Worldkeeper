/**
 * The world's own page for a character: Thinning, their true name and who knows it, and their named memories. The
 * player edits everything but Thinning, and a struck memory stays struck. The GM edits all of it: sets Thinning and
 * Shardscarred, and can restore or remove a memory if the table agrees.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LABEL, Rule } from './parts';
import { Badge } from '../../components/ui/badges';
import { Toggle } from '../../components/ui/inputs';
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
                className={`num h-10 w-10 rounded-md border text-base font-semibold transition-colors ${n === page.thinning ? 'border-gold bg-gold/25 text-gold' : n && n <= page.thinning ? 'border-gold/50 bg-gold/10 text-gold' : 'border-line bg-raised/40 text-dim hover:text-ink'}`}
                onClick={() => set({ thinning: n }, true)}
              >
                {n}
              </button>
            ) : (
              <span
                key={n}
                className={`num flex h-10 w-10 items-center justify-center rounded-md border text-base font-semibold ${n <= page.thinning ? 'border-gold bg-gold/25 text-gold' : 'border-line bg-raised/40 text-dim'}`}
              >
                {n}
              </span>
            ),
          )}
          {page.shardscarred && !gm && (
            <Badge tone="gold" className="ml-2">
              Shardscarred
            </Badge>
          )}
        </div>
        <p className="max-w-[72ch] text-sm leading-relaxed">
          Thinning save: Charisma, <b className="num">DC {12 + page.thinning}</b>. Hearing your true name from someone who knows it gives Advantage. At 3, you stop answering to your name without effort. At 6, you
          join the harmony.
        </p>
        {gm ? (
          <Toggle checked={page.shardscarred} onChange={(v) => set({ shardscarred: v }, true)} hint="Advantage on saves against memory changes and rewriting">
            Shardscarred
          </Toggle>
        ) : (
          <p className="text-xs text-dim">Your GM changes this after a failed save, or when a month among people who use your name brings you back a step.</p>
        )}
      </section>

      <section className="space-y-2">
        <Rule>True name</Rule>
        <input className="input font-serif text-[16px] max-sm:min-h-10" value={page.true_name} placeholder="The name that pulls you back" onChange={(e) => set({ true_name: e.target.value })} aria-label="True name" />
        <div className={`pt-1 ${LABEL}`}>Who knows it</div>
        <ul className="flex flex-wrap gap-1.5">
          {page.known_by.map((n) => (
            <li key={n} className="tag border-line bg-raised/50 text-ink">
              {n}
              <button className="relative ml-0.5 text-dim hover:text-danger after:absolute after:-inset-3 after:content-['']" aria-label={`Remove ${n}`} onClick={() => set({ known_by: page.known_by.filter((x) => x !== n) }, true)}>
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
            className="input flex-1 max-sm:min-h-10"
            value={newName}
            placeholder="Someone who knows the true name"
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Add someone who knows your true name"
          />
          <button className="btn justify-center max-sm:min-h-10 max-sm:min-w-10" aria-label="Add">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <Rule>Named memories</Rule>
        {toStrike && (
          <p className="rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn" role="status">
            {gm ? 'Thinning is above the struck memories: the player strikes one.' : 'Your Thinning has gone up. Strike one memory, for good.'}
          </p>
        )}
        <ul className="space-y-1.5">
          {kept.map((m) => (
            <li key={m.id ?? m.text} className="flex gap-2 items-center">
              <input
                className="input flex-1 font-serif text-[16px] max-sm:min-h-10"
                value={m.text}
                aria-label="Memory"
                onChange={(e) => set({ memories: page.memories.map((x) => (x === m ? { ...x, text: e.target.value } : x)) })}
              />
              <button
                className="btn-ghost text-sm max-sm:min-h-10"
                onClick={async () => {
                  if (await ask({ title: 'Strike this memory?', body: `Strike "${m.text}" for good? Lost memories don't come back.`, danger: true, confirmLabel: 'Strike it' }))
                    set({ memories: page.memories.map((x) => (x === m ? { ...x, struck: true } : x)) }, true);
                }}
              >
                Strike
              </button>
              {gm && (
                <button className="btn-ghost text-sm max-sm:min-h-10" aria-label={`Remove ${m.text}`} onClick={() => set({ memories: page.memories.filter((x) => x !== m) }, true)}>
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
          {struck.map((m) => (
            <li key={m.id ?? m.text} className="flex items-center gap-2 px-3">
              <span className="flex-1 font-serif text-[16px] text-dim line-through decoration-danger/60">{m.text}</span>
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
          <input className="input flex-1 max-sm:min-h-10" value={newMemory} placeholder="A mother's laugh, the smell of rain on slate…" onChange={(e) => setNewMemory(e.target.value)} aria-label="Add a memory" />
          <button className="btn justify-center max-sm:min-h-10 max-sm:min-w-10" aria-label="Add memory">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <Rule>{gm ? "The player's notes" : 'Notes'}</Rule>
        <textarea className="input min-h-[120px] font-serif text-[16px] leading-relaxed" value={page.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Notes" />
      </section>
    </div>
  );
}
