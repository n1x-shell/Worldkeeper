import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { usePlayer } from './context';
import type { PCharacterPage } from './source';

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

type Edit = Pick<PCharacterPage, 'true_name' | 'memories' | 'known_by' | 'notes'>;

/**
 * MY CHARACTER. A character's own page on the table server, opened with its private code: their named memories,
 * true name and who knows it, and the Thinning track the GM keeps. The player edits everything but Thinning, and a
 * struck memory stays struck. Not in the published handbook, which can't save anything.
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
  const [newMemory, setNewMemory] = useState('');
  const [newName, setNewName] = useState('');
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
        const edit: Edit = { true_name: next.true_name, memories: next.memories, known_by: next.known_by, notes: next.notes };
        const saved = await source.saveMyPage!(code, edit);
        setPage(saved);
        setStatus('Saved');
      } catch (e) {
        setStatus((e as Error).message);
      }
    };
    if (now) await go();
    else timer.current = window.setTimeout(go, 800);
  };

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

  const kept = page.memories.filter((m) => !m.struck);
  const struck = page.memories.filter((m) => m.struck);
  const toStrike = page.thinning > struck.length && kept.length > 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-3xl text-gold">{page.name}</h1>
        <div className="text-sm text-dim">
          {[page.species, page.class_name, `level ${page.level}`].filter(Boolean).join(' · ')}
          {page.shardscarred && <span className="chip border-gold/50 text-gold ml-2">Shardscarred</span>}
        </div>
        <div className="text-xs text-dim mt-1" aria-live="polite">
          {status}
        </div>
      </div>

      <section className="panel p-4 space-y-2">
        <h2 className="font-display text-lg text-gold">Thinning</h2>
        <div className="flex gap-1.5" aria-label={`Thinning ${page.thinning} of 6`}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className={`w-8 h-8 rounded border flex items-center justify-center text-sm ${n <= page.thinning ? 'bg-gold/30 border-gold text-gold' : 'border-line text-dim'}`}>
              {n}
            </span>
          ))}
        </div>
        <p className="text-sm">
          Your Thinning save: Charisma, <b>DC {12 + page.thinning}</b>. Hearing your true name from someone who knows it gives Advantage. At 3, you stop answering to your name without effort. At 6,
          you join the harmony.
        </p>
        <p className="text-xs text-dim">Your GM changes this after a failed save, or when a month among people who use your name brings you back a step.</p>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="font-display text-lg text-gold">Your true name</h2>
        <input className="input w-full" value={page.true_name} placeholder="The name that pulls you back" onChange={(e) => void save({ ...page, true_name: e.target.value })} aria-label="True name" />
        <div className="text-sm text-dim">Who knows it</div>
        <ul className="flex flex-wrap gap-1.5">
          {page.known_by.map((n) => (
            <li key={n} className="chip border-line">
              {n}
              <button className="ml-1 text-dim hover:text-danger" aria-label={`Remove ${n}`} onClick={() => void save({ ...page, known_by: page.known_by.filter((x) => x !== n) }, true)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newName.trim();
            if (n && !page.known_by.includes(n)) void save({ ...page, known_by: [...page.known_by, n] }, true);
            setNewName('');
          }}
        >
          <input
            className="input flex-1"
            value={newName}
            placeholder="Someone who knows your true name"
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Add someone who knows your true name"
          />
          <button className="btn" aria-label="Add">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="font-display text-lg text-gold">Named memories</h2>
        {toStrike && <p className="rounded border border-gold/60 p-2 text-sm text-gold">Your Thinning has gone up. Strike one memory, for good.</p>}
        <ul className="space-y-1.5">
          {kept.map((m) => (
            <li key={m.id ?? m.text} className="flex gap-2 items-center">
              <input
                className="input flex-1"
                value={m.text}
                aria-label="Memory"
                onChange={(e) => void save({ ...page, memories: page.memories.map((x) => (x === m ? { ...x, text: e.target.value } : x)) })}
              />
              <button
                className="btn-ghost text-sm"
                onClick={() => {
                  if (confirm(`Strike "${m.text}" for good? Lost memories don't come back.`)) void save({ ...page, memories: page.memories.map((x) => (x === m ? { ...x, struck: true } : x)) }, true);
                }}
              >
                Strike
              </button>
            </li>
          ))}
          {struck.map((m) => (
            <li key={m.id} className="text-dim line-through px-3">
              {m.text}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = newMemory.trim();
            if (t) void save({ ...page, memories: [...page.memories, { text: t, struck: false }] }, true);
            setNewMemory('');
          }}
        >
          <input className="input flex-1" value={newMemory} placeholder="A mother's laugh, the smell of rain on slate…" onChange={(e) => setNewMemory(e.target.value)} aria-label="Add a memory" />
          <button className="btn" aria-label="Add memory">
            <Plus size={14} />
          </button>
        </form>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="font-display text-lg text-gold">Notes</h2>
        <textarea className="input w-full min-h-[120px]" value={page.notes} onChange={(e) => void save({ ...page, notes: e.target.value })} aria-label="Notes" />
      </section>
    </div>
  );
}
