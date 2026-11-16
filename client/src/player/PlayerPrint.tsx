import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { Md } from './PlayerPages';
import { OTHER_GROUP, PLAYER_GROUPS, groupOf } from './categories';
import type { PEntity } from './source';

/** The table cards: one page each, in this order, found by name. */
export const CARD_NAMES = ['Session Zero', 'Hollow Refuge in One Page', 'Ashvale in One Page', 'The Nameless Asylum in One Page', 'House Rules', 'Safety Tools'];

type Choice = 'cards' | 'all' | string;
const byName = (a: PEntity, b: PEntity) => a.name.localeCompare(b.name);

/**
 * PRINT VIEW. Lays out the table cards, one section of the handbook, or all of it, one entry to a sheet, for printing
 * or "Save as PDF" from the browser. Only what the player already sees: it reads the same player source.
 */
export function PlayerPrint() {
  const { source } = usePlayer();
  const { entities } = usePlayerIndex();
  const [choice, setChoice] = useState<Choice>('cards');
  const [pages, setPages] = useState<PEntity[] | null>(null);
  const [progress, setProgress] = useState(0);

  const groups = useMemo(() => [...PLAYER_GROUPS, OTHER_GROUP].map((g) => ({ g, list: (entities ?? []).filter((e) => groupOf(e.type).key === g.key) })).filter((x) => x.list.length), [entities]);
  const chosen = useMemo(() => {
    const all = entities ?? [];
    if (choice === 'cards') return CARD_NAMES.map((n) => all.find((e) => e.name === n)).filter((e): e is PEntity => !!e);
    if (choice === 'all') return [...groups.flatMap((x) => [...x.list].sort(byName))];
    return [...(groups.find((x) => x.g.key === choice)?.list ?? [])].sort(byName);
  }, [choice, entities, groups]);

  // Fetch each chosen entry in full (the index holds only summaries), a few at a time.
  useEffect(() => {
    let live = true;
    setPages(null);
    setProgress(0);
    void (async () => {
      const out: PEntity[] = new Array(chosen.length);
      let done = 0;
      const queue = chosen.map((e, i) => ({ e, i }));
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          out[job.i] = (await source.entity(job.e.id)) ?? job.e;
          done++;
          if (live && done % 10 === 0) setProgress(done);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      if (live) setPages(out);
    })();
    return () => {
      live = false;
    };
  }, [chosen, source]);

  if (!entities) return null;
  return (
    <div className="space-y-4">
      <div className="wk-print-controls space-y-3">
        <h1 className="text-3xl text-gold">Print</h1>
        <p className="text-sm text-dim">Choose what to print. Each entry starts on a new sheet. Use your browser&apos;s print, or &ldquo;Save as PDF&rdquo;, to make a file.</p>
        <div className="flex flex-wrap gap-1.5">
          <button className={`chip ${choice === 'cards' ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setChoice('cards')}>
            Table cards
          </button>
          {groups.map(({ g, list }) => (
            <button key={g.key} className={`chip ${choice === g.key ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setChoice(g.key)}>
              {g.label} ({list.length})
            </button>
          ))}
          <button className={`chip ${choice === 'all' ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setChoice('all')}>
            The whole handbook ({entities.length})
          </button>
        </div>
        <p className="text-xs text-dim">
          {choice === 'cards' ? 'The table cards: Session Zero, a one-page primer for each starting place, the House Rules and the Safety Tools.' : `${chosen.length} entries.`}
        </p>
        <button className="btn-primary inline-flex items-center gap-2" disabled={!pages} onClick={() => window.print()}>
          <Printer size={15} /> {pages ? 'Print or save as PDF' : `Getting ready… ${progress} of ${chosen.length}`}
        </button>
      </div>
      {pages && (
        <div className="wk-print wk-print-pages space-y-6">
          {pages.map((e) => (
            <article key={e.id} className="wk-print-page panel p-5">
              <h1 className="text-2xl text-gold">{e.name}</h1>
              <div className="text-xs text-dim mb-3">
                {e.typeLabel} · {e.realmLabel}
              </div>
              {e.summary && <Md text={e.summary} />}
              {e.sections?.map((s) => (
                <Md key={s.heading} text={`## ${s.heading}\n\n${s.content}`} />
              ))}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
