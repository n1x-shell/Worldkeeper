/**
 * Hover cards for players (docs/DESIGN_OVERHAUL.md §8, §10): the same cards as the GM app, from the player projection
 * only (`source.entity`), so they never show more than the handbook does. No inspector or pins here: the card's one
 * action is Open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useHoverCards, type HoverTarget } from '../components/peek/hover';
import { usePlayer } from './context';
import type { PEntity } from './source';
import { Md } from './PlayerPages';

const W = 320;

export function PlayerHoverCards() {
  const { source } = usePlayer();
  const cache = useRef(new Map<string, Promise<PEntity | null>>());
  const load = useCallback(
    (id: string) => {
      let p = cache.current.get(id);
      if (!p) {
        p = source.entity(id).catch(() => null);
        cache.current.set(id, p);
      }
      return p;
    },
    [source],
  );
  const { card, setCard, onCardEnter, onCardLeave } = useHoverCards({ load });
  if (!card) return null;
  return createPortal(<Card target={card} load={load} onEnter={onCardEnter} onLeave={onCardLeave} onDone={() => setCard(null)} />, document.body);
}

function Card({ target, load, onEnter, onLeave, onDone }: { target: HoverTarget; load: (id: string) => Promise<PEntity | null>; onEnter: () => void; onLeave: () => void; onDone: () => void }) {
  const { base } = usePlayer();
  const [e, setE] = useState<PEntity | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void load(target.id).then((x) => on && setE(x));
    return () => {
      on = false;
    };
  }, [target.id, load]);
  const r = target.rect;
  const below = window.innerHeight - r.bottom > 240 || r.top < 240;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left));
  const style = below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 };
  return (
    <div className="wk-hovercard panel elev-2 fixed z-2500 p-3 text-sm" style={{ ...style, width: W }} role="dialog" aria-label={e?.name ?? 'Entry'} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {e === undefined ? (
        <div className="space-y-2" aria-busy="true">
          <span className="skeleton block h-3 w-1/3" />
          <span className="skeleton block h-5 w-2/3" />
          <span className="skeleton block h-3 w-full" />
        </div>
      ) : !e ? (
        <p className="text-dim">Nothing more is known about this yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <span className="chip border-line text-dim">{e.typeLabel}</span>
            {e.realmLabel && <span className="chip border-line text-dim">{e.realmLabel}</span>}
          </div>
          <div className="font-display text-gold text-lg leading-tight">{e.name}</div>
          {e.summary && <Md text={e.summary} className="prose-peek text-[13px] leading-snug text-ink/90 line-clamp-5" />}
          {e.facts && e.facts.length > 0 && (
            <ul className="text-xs text-dim space-y-0.5">
              {e.facts.slice(0, 3).map((f, i) => (
                <li key={i} className="line-clamp-2">
                  {f}
                </li>
              ))}
            </ul>
          )}
          <div className="flex pt-1 border-t border-line">
            <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="btn-ghost text-xs ml-auto" onClick={onDone}>
              <ExternalLink size={13} /> Open
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
