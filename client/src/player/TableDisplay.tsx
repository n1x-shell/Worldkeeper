/**
 * The table display (v0.9.9): a page for a television or second screen at the table, at the campaign's address
 * followed by /table. It shows what the GM chose (the title card, a map with the party's trail, a handout or a
 * record's picture), with the turn order and the table's rolls beside it while there are any. Nothing on it can be
 * clicked through to the handbook: it is for looking at from across the room, and it follows the GM by itself.
 */
import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dices, Maximize, Shield, Swords } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { onServerChange } from './changes';
import type { PDisplay, PMap, PRoll } from './source';

/** How long a roll stays on the display. */
const ROLL_SHOWN_MS = 5 * 60 * 1000;

export function TableDisplay() {
  const { source } = usePlayer();
  const { live } = usePlayerIndex();
  const [d, setD] = useState<PDisplay | null>(null);
  const [map, setMap] = useState<PMap | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The display is dark whatever theme the browser was left in: it sits beside the table, often in a dim room.
  useEffect(() => {
    const root = document.documentElement;
    const was = root.classList.contains('dark');
    root.classList.add('dark');
    root.classList.remove('light');
    return () => {
      if (!was) {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    };
  }, []);

  useEffect(() => {
    if (!source.display) return;
    let on = true;
    const look = async () => {
      try {
        const next = await source.display!();
        if (!on) return;
        setD(next);
        setNow(Date.now());
        // The map is read afresh each time: the party's trail and what it has found move during play.
        if (next.kind === 'map') {
          const maps = await source.maps();
          if (on) setMap(maps.find((m) => m.id === next.map_id) ?? null);
        }
      } catch {
        /* the server is away for a moment; the next look tries again */
      }
    };
    void look();
    const stop = source.changes ? onServerChange(source.changes, () => void look()) : null;
    const every = stop ? undefined : window.setInterval(look, 4000);
    return () => {
      on = false;
      stop?.();
      window.clearInterval(every);
    };
  }, [source]);

  const fight = live?.fight ?? null;
  const rolls = (live?.rolls ?? []).filter((r) => now - Date.parse(r.created_at) < ROLL_SHOWN_MS).slice(0, 6);
  const side = !!fight || rolls.length > 0;

  if (!source.display)
    return <div className="fixed inset-0 z-5000 flex items-center justify-center bg-bg p-8 text-center text-dim">The table display works on the GM’s table server, not in the published handbook.</div>;

  return (
    <div className="fixed inset-0 z-5000 flex bg-bg text-ink" data-testid="table-display">
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {!d || d.kind === 'title' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="font-display text-[clamp(2.5rem,7vw,7rem)] leading-tight text-gold">{d?.title ?? ''}</div>
            {d?.kind === 'title' && d.date && <div className="text-[clamp(1.1rem,2.2vw,2.2rem)] text-dim">{d.date}</div>}
          </div>
        ) : d.kind === 'map' ? (
          map ? <DisplayMap m={map} imageUrl={map.image_file ? source.imageUrl(map.image_file) : null} /> : null
        ) : d.kind === 'picture' ? (
          <figure className="flex h-full flex-col">
            <img src={source.imageUrl(d.file)} alt={d.caption || d.title} className="min-h-0 w-full flex-1 object-contain" />
            <figcaption className="border-t border-line bg-panel px-8 py-4 text-center">
              <span className="font-display text-[clamp(1.4rem,2.6vw,2.6rem)] text-gold">{d.title}</span>
              {d.caption && <span className="ml-4 text-[clamp(1rem,1.8vw,1.8rem)] text-dim">{d.caption}</span>}
            </figcaption>
          </figure>
        ) : (
          <article className="flex h-full flex-col gap-4 p-8">
            <h1 className="font-display text-[clamp(1.8rem,3.4vw,3.4rem)] leading-tight text-gold">{d.title}</h1>
            <div className="flex min-h-0 flex-1 gap-6">
              {d.image_file && <img src={source.imageUrl(d.image_file)} alt={d.title} className={`min-h-0 min-w-0 rounded-md object-contain ${d.body ? 'max-w-[55%]' : 'flex-1'}`} />}
              {d.body && (
                <div className="parchment prose-lore min-w-0 flex-1 overflow-hidden rounded-md px-8 py-6" style={{ fontSize: 'clamp(1.1rem, 1.9vw, 2rem)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.body}</ReactMarkdown>
                </div>
              )}
            </div>
          </article>
        )}
        <FullScreenButton />
      </main>
      {side && (
        <aside className="flex w-[clamp(18rem,24vw,30rem)] shrink-0 flex-col border-l border-line bg-panel" aria-label="The fight and the table’s rolls">
          {fight && <TurnOrder fight={fight} />}
          {rolls.length > 0 && <Rolls rolls={rolls} grow={!fight} />}
        </aside>
      )}
    </div>
  );
}

type Fight = NonNullable<NonNullable<ReturnType<typeof usePlayerIndex>['live']>['fight']>;

function TurnOrder({ fight }: { fight: Fight }) {
  const current = fight.order.find((c) => c.current);
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Turn order" aria-live="polite">
      <header className="border-b border-line bg-gold/10 px-6 py-4">
        <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-dim">
          <Swords size={16} className="text-gold" /> <span className="num">Round {fight.round || 1}</span>
        </div>
        <div className="mt-1 truncate font-display text-[clamp(1.5rem,2.4vw,2.6rem)] leading-tight text-gold">{current ? `${current.name}’s turn` : 'Combat'}</div>
      </header>
      <ol className="min-h-0 flex-1 overflow-hidden py-2">
        {fight.order.map((c, i) => (
          <li key={i} aria-current={c.current ? 'step' : undefined} className={`relative flex items-center gap-3 px-6 py-2 text-[clamp(1rem,1.4vw,1.5rem)] ${c.current ? 'bg-gold/15 font-semibold' : 'text-ink/85'}`}>
            {c.current && <span className="absolute inset-y-1 left-0 w-1.5 rounded-r bg-gold" aria-hidden />}
            {c.pc ? <Shield size={18} className="shrink-0 text-arcane" aria-label="Player character" /> : <Swords size={18} className="shrink-0 text-dim" aria-label="Foe or other" />}
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.hp && (
              <span className="num shrink-0 text-[0.8em] text-dim">
                {c.hp.hp}/{c.hp.max}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Rolls({ rolls, grow }: { rolls: PRoll[]; grow: boolean }) {
  return (
    <section className={`border-t border-line ${grow ? 'flex-1' : ''}`} aria-label="The table’s rolls" aria-live="polite">
      <h2 className="flex items-center gap-2 px-6 pt-4 text-sm font-medium uppercase tracking-[0.14em] text-dim">
        <Dices size={16} className="text-gold" /> Rolls
      </h2>
      <ol className="py-2">
        {rolls.map((r, i) => (
          <li key={r.id} className={`flex items-baseline gap-3 px-6 py-1.5 ${i === 0 ? 'text-ink' : 'text-ink/70'}`}>
            <span className={`num w-[2.2em] shrink-0 text-right font-display text-gold ${i === 0 ? 'text-[clamp(2rem,3vw,3.4rem)]' : 'text-[clamp(1.2rem,1.7vw,1.9rem)]'}`}>{r.total}</span>
            <span className="min-w-0 flex-1 truncate text-[clamp(0.95rem,1.25vw,1.4rem)]">
              <b className="font-semibold">{r.who}</b>
              {r.label && <span className="text-dim"> · {r.label}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A map as the players know it, whole on the screen: its pins by name, the party's trail and where it is now, and
 * darkness over what it hasn't found (while a session is running, as on the players' own maps).
 */
function DisplayMap({ m, imageUrl }: { m: PMap; imageUrl: string | null }) {
  const id = `wk-display-${useId().replace(/[^\w-]/g, '')}`;
  const ex = m.exploration ?? null;
  const found = ex ? new Set(ex.discovered) : null;
  // A pin with no record is a label; a record's pin shows once the party has found it.
  const pins = m.markers.filter((p) => !found || !p.entity_id || found.has(p.entity_id));
  const trail = ex?.trail ?? [];
  const party = trail.length ? trail[trail.length - 1] : null;
  const clear = ex ? [...m.markers.filter((p) => p.entity_id && found!.has(p.entity_id)), ...trail] : [];
  const big = Math.max(m.width, m.height);
  const r = big * 0.07;
  // Sizes follow the map, so they read the same on any screen. A map's own y runs up from its bottom edge.
  const dot = big / 160;
  const text = big / 55;
  const y = (v: number) => m.height - v;
  return (
    <svg viewBox={`0 0 ${m.width} ${m.height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label={m.name}>
      {imageUrl ? <image href={imageUrl} x={0} y={0} width={m.width} height={m.height} /> : <rect width={m.width} height={m.height} fill="rgb(var(--raised))" />}
      {ex && (
        <>
          <defs>
            <filter id={`${id}-blur`} filterUnits="userSpaceOnUse" x={-r} y={-r} width={m.width + 2 * r} height={m.height + 2 * r}>
              <feGaussianBlur stdDeviation={r * 0.35} />
            </filter>
            <mask id={`${id}-mask`}>
              <rect width={m.width} height={m.height} fill="white" />
              <g filter={`url(#${id}-blur)`}>
                {clear.map((p, i) => (
                  <circle key={i} cx={p.x} cy={y(p.y)} r={r} fill="black" />
                ))}
              </g>
            </mask>
          </defs>
          <rect width={m.width} height={m.height} fill="rgba(8,8,14,0.82)" mask={`url(#${id}-mask)`} />
        </>
      )}
      {trail.length > 1 && <polyline points={trail.map((t) => `${t.x},${y(t.y)}`).join(' ')} fill="none" stroke="#f2e3b3" strokeWidth={dot * 0.6} strokeDasharray={`${dot * 1.6} ${dot * 1.2}`} strokeLinecap="round" opacity={0.9} />}
      {pins.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={y(p.y)} r={dot} fill="#0b0b10" stroke="#f2e3b3" strokeWidth={dot * 0.35} />
          <text x={p.x} y={y(p.y) - dot * 1.8} textAnchor="middle" fontSize={text} fill="#fff6dc" stroke="#0b0b10" strokeWidth={text * 0.18} paintOrder="stroke" style={{ fontFamily: 'var(--font-display, serif)' }}>
            {p.label}
          </text>
        </g>
      ))}
      {party && (
        <g>
          <circle cx={party.x} cy={y(party.y)} r={dot * 2.4} fill="rgb(var(--gold))" opacity={0.35} />
          <circle cx={party.x} cy={y(party.y)} r={dot * 1.3} fill="rgb(var(--gold))" stroke="#0b0b10" strokeWidth={dot * 0.3} />
        </g>
      )}
    </svg>
  );
}

/** Fill the screen (a television shows browser bars otherwise). Hidden once it has. */
function FullScreenButton() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  if (full || !document.documentElement.requestFullscreen) return null;
  return (
    <button
      type="button"
      className="btn absolute bottom-4 right-4 opacity-60 hover:opacity-100 focus-visible:opacity-100"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
      title="Fill the screen (Esc leaves)"
    >
      <Maximize size={15} /> Full screen
    </button>
  );
}
