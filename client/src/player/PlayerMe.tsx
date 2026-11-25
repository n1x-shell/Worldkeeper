import { useModules } from '../lib/modules';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, KeyRound, Printer, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Loading, SaveStatus } from '../components/ui/feedback';
import { usePlayer } from './context';
import type { PCharacterPage } from './source';
import { FullSheet } from './sheet/FullSheet';
import { NotesTab, ThinningTab, type ThinningPage } from './sheet/ThinningTab';
import { PrintSheet } from './sheet/PrintSheet';
import { onServerChange } from './changes';
import { applySheetDiff, noChange, sheetDiff } from '@shared/sheetDiff';

const KEY = 'wk.player.me';
const remember = (code: string) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private window */
  }
  // The live card learns whose device this is ("You rolled", "Your turn") without waiting for a reload.
  window.dispatchEvent(new Event('wk-player-me'));
};
const remembered = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * MY CHARACTER. A character's own sheet on the table server, opened with its private code: the full D&D 2024 sheet,
 * a portrait, the world's own page (Thinning, true name, named memories) and a log of every change. The player edits
 * everything but their level and Thinning, which the GM sets. Not in the published handbook, which can't save anything.
 */
export function PlayerMe() {
  const { code = '' } = useParams();
  const { source, base } = usePlayer();
  const navigate = useNavigate();
  const [entered, setEntered] = useState('');
  if (!source.myPage) {
    return (
      <Welcome title="My Character">
        <p className="text-sm text-ink/85">Your character page lives on the table server, where you can keep it up to date. Ask your GM for your link.</p>
      </Welcome>
    );
  }
  if (!code) {
    const last = remembered();
    if (last) return <Navigate to={`${base}/me/${last}`} replace />;
    return (
      <Welcome title="My Character">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (entered.trim()) void navigate(`${base}/me/${entered.trim().toUpperCase()}`);
          }}
        >
          <p className="text-sm text-ink/85">Your sheet, your portrait and your story, kept up to date at the table. Enter the code your GM gave you for your character.</p>
          <label className="block space-y-1.5">
            <span className="label">Character code</span>
            <span className="relative block">
              <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input
                className="input num h-12 pl-10 text-lg uppercase tracking-[0.3em] placeholder:tracking-[0.3em]"
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                placeholder="ABCD2345"
                aria-label="Character code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </span>
          </label>
          <button className="btn-primary h-11 w-full justify-center text-[15px]" disabled={!entered.trim()}>
            Open my page
          </button>
          <p className="text-center text-xs text-dim">This device remembers it, so next time your page opens by itself.</p>
        </form>
      </Welcome>
    );
  }
  return <MyPage key={code} code={code} />;
}

function MyPage({ code }: { code: string }) {
  const { source, base } = usePlayer();
  const navigate = useNavigate();
  const [page, setPage] = useState<PCharacterPage | null | undefined>(undefined);
  const [status, setStatus] = useState('');
  const timer = useRef<number | undefined>(undefined);
  // The page as the server last gave it (edits are sent as what changed since), and whether an edit is on its way.
  const known = useRef<PCharacterPage | null>(null);
  const waiting = useRef(false);
  const flying = useRef(0);
  const busy = () => waiting.current || flying.current > 0;

  useEffect(() => {
    void source.myPage!(code).then((p) => {
      setPage(p);
      known.current = p;
      if (p) remember(code);
    });
  }, [code, source]);
  // What the GM changes (damage dealt, experience awarded, a level given) shows at once, without a reload: the server
  // says when something changed. Not while an edit of the player's is on its way: its answer brings the rest.
  useEffect(() => {
    const look = () => {
      if (document.hidden || busy()) return;
      void source.myPage!(code).then((p) => {
        if (!p || busy() || p.sheet_at === known.current?.sheet_at) return;
        known.current = p;
        setPage(p);
      });
    };
    if (source.changes) return onServerChange(source.changes, look);
    const every = window.setInterval(look, 20000);
    return () => window.clearInterval(every);
  }, [code, source]);

  const save = async (next: PCharacterPage, now = false) => {
    setPage(next);
    window.clearTimeout(timer.current);
    waiting.current = true;
    const go = async () => {
      waiting.current = false;
      flying.current++;
      setStatus('Saving…');
      try {
        // Only what changed since the server's copy: the GM's own changes to other fields stay as they are.
        const from = known.current ?? next;
        const d = sheetDiff(from.sheet as Record<string, unknown>, next.sheet as Record<string, unknown>);
        const character = {
          ...(next.name !== from.name ? { name: next.name } : {}),
          ...(next.species !== from.species ? { species: next.species } : {}),
          ...(next.class_name !== from.class_name ? { class_name: next.class_name } : {}),
          ...(noChange(d) ? {} : { sheet_patch: d }),
        };
        const saved = await source.saveMyPage!(code, {
          true_name: next.true_name,
          memories: next.memories,
          known_by: next.known_by,
          notes: next.notes,
          ...(Object.keys(character).length ? { character } : {}),
        });
        known.current = saved;
        // The server's answer has everyone's changes. Anything typed since this was sent is laid back on top.
        setPage((cur) =>
          !cur || cur === next
            ? saved
            : {
                ...cur,
                level: saved.level,
                sheet_at: saved.sheet_at,
                sheet: applySheetDiff(saved.sheet as Record<string, unknown>, sheetDiff(next.sheet as Record<string, unknown>, cur.sheet as Record<string, unknown>)) as PCharacterPage['sheet'],
              },
        );
        setStatus('Saved');
      } catch (e) {
        setStatus((e as Error).message);
      } finally {
        flying.current--;
      }
    };
    if (now) await go();
    else timer.current = window.setTimeout(go, 800);
  };
  const loadLog = useCallback(() => source.myLog!(code), [source, code]);
  const mech = useModules();

  if (page === undefined) return <Loading label="Opening your character…" />;
  if (page === null)
    return (
      <Welcome title="My Character">
        <p className="text-sm text-ink/85">
          No character has the code <span className="num font-semibold tracking-[0.15em] text-ink">{code}</span>. Check it with your GM.
        </p>
        <button
          className="btn h-11 w-full justify-center"
          onClick={() => {
            remember('');
            void navigate(`${base}/me`);
          }}
        >
          Try another code
        </button>
      </Welcome>
    );

  const thinning: ThinningPage = page;
  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 print:hidden">
        <h1 className="section-title">My Character</h1>
        {/* Their own campaign's handbook (what their group has learned), unless they're already reading it. */}
        {page.handbook && !base.startsWith(`/player/c/${page.handbook}`) && (
          <Link className="btn-ghost text-sm max-sm:min-h-10" to={`/player/c/${page.handbook}`}>
            <BookOpen size={14} /> My campaign’s handbook
          </Link>
        )}
        {status && <SaveStatus state={status === 'Saving…' ? 'saving' : status === 'Saved' ? 'saved' : 'error'} error={status} />}
        <button className="btn ml-auto max-sm:min-h-10" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>
      <div className="hidden print:block">
        <PrintSheet
          value={{ name: page.name, species: page.species, class_name: page.class_name, level: page.level, sheet: page.sheet ?? {} }}
          portraitUrl={page.sheet.portrait && source.imageUrl ? source.imageUrl(page.sheet.portrait) : null}
        />
      </div>
      <div className="print:hidden">
        <FullSheet
          value={{ name: page.name, species: page.species, class_name: page.class_name, level: page.level, sheet: page.sheet ?? {} }}
          onChange={(next) => void save({ ...page, name: next.name, species: next.species, class_name: next.class_name, sheet: next.sheet })}
          levelLocked
          onRoll={source.rollMine ? (ask) => source.rollMine!(code, ask) : undefined}
          storeKey="wk.player.me.tab"
          portraitUrl={page.sheet.portrait && source.imageUrl ? source.imageUrl(page.sheet.portrait) : null}
          onPortrait={
            source.myPortrait
              ? async (img) => {
                  window.clearTimeout(timer.current);
                  const saved = await source.myPortrait!(code, img);
                  known.current = saved;
                  setPage((cur) => {
                    if (!cur) return saved;
                    const sheet = { ...cur.sheet };
                    if (saved.sheet.portrait) sheet.portrait = saved.sheet.portrait;
                    else delete sheet.portrait;
                    return { ...cur, sheet };
                  });
                }
              : undefined
          }
          loadLog={source.myLog ? loadLog : undefined}
          extraTabs={[
            ...(mech.has('thinning') ? [{ id: 'thinning', label: 'Thinning', content: <ThinningTab page={thinning} onChange={(t, now) => void save({ ...page, ...t }, now)} /> }] : []),
            { id: 'notes', label: 'Notes', content: <NotesTab notes={thinning.notes} onChange={(notes) => void save({ ...page, ...thinning, notes })} /> },
          ]}
        />
      </div>
    </div>
  );
}

/** A welcoming card for the way in: the code to enter, or why there's nothing here. */
function Welcome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-12">
      <section className="panel elev-2 gilt-corners space-y-5 px-6 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold" aria-hidden>
            <UserRound size={26} />
          </span>
          <h1 className="title-rule text-[28px] text-gold">{title}</h1>
        </div>
        {children}
      </section>
    </div>
  );
}
