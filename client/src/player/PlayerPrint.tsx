import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { Md, PlayerPageTitle } from './PlayerPages';
import { OTHER_GROUP, PLAYER_GROUPS, groupOf } from './categories';
import type { PEntity } from './source';
import type { ReactNode } from 'react';
import { Card } from '../components/ui/surfaces';

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
    if (choice === 'all') return groups.flatMap((x) => [...x.list].sort(byName));
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
      <div className="wk-print-controls space-y-4">
        <PlayerPageTitle
          eyebrow="Handbook"
          icon={<Printer size={14} />}
          title="Print"
          subtitle="Choose what to print. Each entry starts on a new sheet. Use your browser's print, or “Save as PDF”, to make a file."
        />
        <Card title="What to print">
          <div className="flex flex-wrap gap-2" role="group" aria-label="What to print">
            <Choice on={choice === 'cards'} onClick={() => setChoice('cards')}>
              Table cards
            </Choice>
            {groups.map(({ g, list }) => (
              <Choice key={g.key} on={choice === g.key} onClick={() => setChoice(g.key)} count={list.length}>
                {g.label}
              </Choice>
            ))}
            <Choice on={choice === 'all'} onClick={() => setChoice('all')} count={entities.length}>
              The whole handbook
            </Choice>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4">
            <p className="min-w-0 flex-1 basis-[16rem] text-sm text-dim">
              {choice === 'cards' ? (
                'The table cards: Session Zero, a one-page primer for each starting place, the House Rules and the Safety Tools.'
              ) : (
                <span className="num">{chosen.length} entries, one to a sheet.</span>
              )}
            </p>
            <button className="btn-primary min-h-10 justify-center px-4 max-sm:w-full" disabled={!pages} onClick={() => window.print()}>
              <Printer size={15} />{' '}
              {pages ? (
                'Print or save as PDF'
              ) : (
                <span className="num">
                  Getting ready… {progress} of {chosen.length}
                </span>
              )}
            </button>
          </div>
        </Card>
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

/** One choice of what to print: a tag-like toggle, finger-sized on a phone. */
function Choice({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors sm:min-h-8 ${on ? 'border-gold/70 bg-gold/10 font-medium text-gold' : 'border-line bg-raised/50 text-ink/85 hover:border-gold/50 hover:text-ink'}`}
    >
      {children}
      {count !== undefined && <span className={`num text-xs ${on ? 'text-gold' : 'text-dim'}`}>{count}</span>}
    </button>
  );
}
