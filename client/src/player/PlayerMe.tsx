import { useMechanics } from '../lib/mechanics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { usePlayer } from './context';
import type { PCharacterPage } from './source';
import { FullSheet } from './sheet/FullSheet';
import { ThinningTab, type ThinningPage } from './sheet/ThinningTab';
import { PrintSheet } from './sheet/PrintSheet';

const KEY = 'wk.player.me';
const remember = (code: string) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private window */
  }
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
      <div className="panel p-6 max-w-xl space-y-2">
        <h1 className="text-2xl text-gold">My Character</h1>
        <p>Your character page lives on the table server, where you can keep it up to date. Ask your GM for your link.</p>
      </div>
    );
  }
  if (!code) {
    const last = remembered();
    if (last) return <Navigate to={`${base}/me/${last}`} replace />;
    return (
      <form
        className="panel p-6 max-w-md space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (entered.trim()) navigate(`${base}/me/${entered.trim().toUpperCase()}`);
        }}
      >
        <h1 className="text-2xl text-gold">My Character</h1>
        <p className="text-sm text-dim">Enter the code your GM gave you for your character.</p>
        <input className="input w-full tracking-widest uppercase" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="ABCD2345" aria-label="Character code" />
        <button className="btn-primary">Open my page</button>
      </form>
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

  useEffect(() => {
    void source.myPage!(code).then((p) => {
      setPage(p);
      if (p) remember(code);
    });
  }, [code, source]);

  const save = async (next: PCharacterPage, now = false) => {
    setPage(next);
    window.clearTimeout(timer.current);
    const go = async () => {
      setStatus('Saving…');
      try {
        const saved = await source.saveMyPage!(code, {
          true_name: next.true_name,
          memories: next.memories,
          known_by: next.known_by,
          notes: next.notes,
          character: { name: next.name, species: next.species, class_name: next.class_name, sheet: next.sheet },
        });
        setPage((cur) => (cur ? { ...saved, sheet: { ...next.sheet, portrait: saved.sheet.portrait } } : saved));
        setStatus('Saved');
      } catch (e) {
        setStatus((e as Error).message);
      }
    };
    if (now) await go();
    else timer.current = window.setTimeout(go, 800);
  };
  const loadLog = useCallback(() => source.myLog!(code), [source, code]);
  const mech = useMechanics();

  if (page === undefined) return <p className="text-dim text-sm">Loading…</p>;
  if (page === null)
    return (
      <div className="panel p-6 max-w-md space-y-3">
        <h1 className="text-2xl text-gold">My Character</h1>
        <p>No character has the code {code}. Check it with your GM.</p>
        <button
          className="btn"
          onClick={() => {
            remember('');
            navigate(`${base}/me`);
          }}
        >
          Try another code
        </button>
      </div>
    );

  const thinning: ThinningPage = page;
  return (
    <div className="space-y-3 max-w-6xl">
      <div className="flex items-center gap-2 print:hidden">
        <h1 className="text-sm uppercase tracking-[0.2em] text-dim font-display">My Character</h1>
        <span className="text-xs text-dim" aria-live="polite">
          {status}
        </span>
        <button className="btn-ghost ml-auto text-sm" onClick={() => window.print()}>
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
          storeKey="wk.player.me.tab"
          portraitUrl={page.sheet.portrait && source.imageUrl ? source.imageUrl(page.sheet.portrait) : null}
          onPortrait={
            source.myPortrait
              ? async (img) => {
                  window.clearTimeout(timer.current);
                  const saved = await source.myPortrait!(code, img);
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
          extraTabs={mech?.thinning === false ? [] : [{ id: 'thinning', label: 'Thinning', content: <ThinningTab page={thinning} onChange={(t, now) => void save({ ...page, ...t }, now)} /> }]}
        />
      </div>
    </div>
  );
}
