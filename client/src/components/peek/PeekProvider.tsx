/**
 * Quick-Peek for the GM app (docs/DESIGN_OVERHAUL.md §8). Any element with `data-peek="<record ID>"` (record links
 * and @[Name] links do this) gets:
 * - a hover card after 350ms (or on keyboard focus), which stays while the pointer is over it;
 * - middle-click: peek, i.e. open the record in the inspector;
 * - on touch: the first tap shows the card and a second tap opens the record; a long press peeks.
 * It also holds the inspector's state, split view (`?beside=<ID>` in the address) and the pinned stat blocks, which
 * stay pinned until the live session ends.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Columns2, ExternalLink, PanelRight, Pin as PinIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { KeyValue, Skeleton } from '../ui';
import { Markdown } from '../Markdown';
import { PeekContext, type InspectorTab, type PeekApi, type PeekData, type Pin } from './context';
import { FactValue, PeekBadges } from './RecordPeek';
import { setAutoOpen } from './panel';

const PINS = 'wk.pins';
const readPins = (): Pin[] => {
  try {
    return JSON.parse(localStorage.getItem(PINS) ?? '[]') as Pin[];
  } catch {
    return [];
  }
};
const writePins = (p: Pin[]) => {
  try {
    localStorage.setItem(PINS, JSON.stringify(p));
  } catch {
    /* preference only */
  }
};

interface Card {
  id: string;
  el: HTMLElement;
  rect: DOMRect;
}

export function PeekProvider({ live, children }: { live: boolean; children: ReactNode }) {
  const cache = useRef(new Map<string, PeekData>());
  const pending = useRef(new Map<string, Promise<PeekData>>());
  const load = useCallback((id: string) => {
    const hit = cache.current.get(id);
    if (hit) return Promise.resolve(hit);
    let p = pending.current.get(id);
    if (!p) {
      p = api.get<PeekData>(`/api/entities/${encodeURIComponent(id)}/peek`).then((d) => {
        cache.current.set(id, d);
        if (d.id !== id) cache.current.set(d.id, d);
        return d;
      });
      p.finally(() => pending.current.delete(id));
      pending.current.set(id, p);
    }
    return p;
  }, []);
  const cached = useCallback((id: string) => cache.current.get(id), []);

  const [params, setParams] = useSearchParams();
  const beside = params.get('beside');
  const openBeside = useCallback(
    (id: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('beside', id);
        return n;
      }),
    [setParams],
  );
  const closeBeside = useCallback(
    () =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('beside');
        return n;
      }),
    [setParams],
  );

  const [inspectorOpen, setOpen] = useState(false);
  const [pins, setPins] = useState<Pin[]>(readPins);
  const pin = useCallback((x: Pin) => setPins((l) => (l.some((y) => y.id === x.id) ? l : [...l, x])), []);
  const unpin = useCallback((id: string) => setPins((l) => l.filter((y) => y.id !== id)), []);
  useEffect(() => writePins(pins), [pins]);
  // Pinned stat blocks last until the session ends.
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) setPins([]);
    wasLive.current = live;
  }, [live]);

  const [inspected, setInspected] = useState<string[]>([]);
  const [tab, setTab] = useState<InspectorTab>('record');
  const [panelTitle, setPanelTitle] = useState<string | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const [docked, setDocked] = useState(false);
  const panel = useMemo(() => (panelTitle ? { title: panelTitle, el: panelEl } : null), [panelTitle, panelEl]);
  const peek = useCallback((id: string) => {
    setInspected((l) => [...l.filter((x) => x !== id), id].slice(-20));
    setTab('record');
    setOpen(true);
  }, []);
  const back = useCallback(() => setInspected((l) => l.slice(0, -1)), []);
  useEffect(() => {
    if (!panelTitle && tab === 'page') setTab(pins.length && !inspected.length ? 'pinned' : 'record');
  }, [panelTitle, tab, pins.length, inspected.length]);
  // Opened by hand (the button or `]`): the pinned stat blocks when nothing has been peeked, or during play.
  const setInspectorOpen = useCallback(
    (open: boolean) => {
      if (open && pins.length && (inspected.length === 0 || /^\/(campaign\/live|tracker|dm)(\/|$)/.test(window.location.pathname))) setTab('pinned');
      else if (open && panelTitle && inspected.length === 0) setTab('page');
      // On a page with its own panel, remember whether the GM wants the inspector there.
      if (panelTitle) setAutoOpen(open);
      setOpen(open);
    },
    [pins.length, inspected.length, panelTitle],
  );
  const pinAndShow = useCallback(
    (x: Pin) => {
      pin(x);
      setTab('pinned');
      setOpen(true);
    },
    [pin],
  );

  // ---- Hover cards ----
  const [card, setCard] = useState<Card | null>(null);
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;
  const timers = useRef<{ show?: number; hide?: number; press?: number }>({});
  const pointer = useRef<string>('mouse');
  const suppressClick = useRef(false);

  useEffect(() => {
    const t = timers.current;
    const find = (n: EventTarget | null) => ((n as Element | null)?.closest?.('[data-peek]') as HTMLElement | null) ?? null;
    const show = (el: HTMLElement) => {
      const id = el.dataset.peek;
      if (!id || !el.isConnected) return;
      void load(id).catch(() => undefined);
      setCard({ id, el, rect: el.getBoundingClientRect() });
    };
    const hideSoon = () => {
      window.clearTimeout(t.hide);
      t.hide = window.setTimeout(() => setCard(null), 220);
    };
    const over = (e: PointerEvent) => {
      pointer.current = e.pointerType;
      if (e.pointerType === 'touch') return;
      const el = find(e.target);
      if (!el) return;
      window.clearTimeout(t.hide);
      if (cardRef.current?.el === el) return;
      window.clearTimeout(t.show);
      t.show = window.setTimeout(() => show(el), 350);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = find(e.target);
      if (!el || el.contains(e.relatedTarget as Node | null)) return;
      window.clearTimeout(t.show);
      if (cardRef.current) hideSoon();
    };
    const focusIn = (e: FocusEvent) => {
      const el = find(e.target);
      if (!el || pointer.current === 'touch') return;
      window.clearTimeout(t.show);
      t.show = window.setTimeout(() => show(el), 350);
    };
    const focusOut = (e: FocusEvent) => {
      if (find(e.target)) (window.clearTimeout(t.show), cardRef.current && hideSoon());
    };
    const down = (e: PointerEvent) => {
      pointer.current = e.pointerType;
      const el = find(e.target);
      // Middle button: no autoscroll on a peekable link.
      if (el && e.button === 1) e.preventDefault();
      if (!el || e.pointerType !== 'touch') return;
      window.clearTimeout(t.press);
      t.press = window.setTimeout(() => {
        suppressClick.current = true;
        setCard(null);
        peek(el.dataset.peek!);
      }, 550);
    };
    const cancelPress = () => window.clearTimeout(t.press);
    const click = (e: MouseEvent) => {
      const el = find(e.target);
      if (!el) return;
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (pointer.current !== 'touch') return setCard(null);
      // Touch: the first tap shows the card, the second opens the record.
      if (cardRef.current?.el !== el) {
        e.preventDefault();
        e.stopPropagation();
        show(el);
      } else setCard(null);
    };
    const aux = (e: MouseEvent) => {
      const el = find(e.target);
      if (!el || e.button !== 1) return;
      e.preventDefault();
      setCard(null);
      peek(el.dataset.peek!);
    };
    const away = (e: PointerEvent) => {
      if (!cardRef.current) return;
      const n = e.target as Node;
      if (document.querySelector('.wk-hovercard')?.contains(n) || find(e.target)) return;
      setCard(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cardRef.current && setCard(null);
    const gone = () => cardRef.current && setCard(null);
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('pointerup', cancelPress);
    document.addEventListener('pointercancel', cancelPress);
    document.addEventListener('pointermove', cancelPress, { passive: true });
    document.addEventListener('click', click, true);
    document.addEventListener('auxclick', aux, true);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', gone, true);
    window.addEventListener('resize', gone);
    return () => {
      window.clearTimeout(t.show);
      window.clearTimeout(t.hide);
      window.clearTimeout(t.press);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('pointerup', cancelPress);
      document.removeEventListener('pointercancel', cancelPress);
      document.removeEventListener('pointermove', cancelPress);
      document.removeEventListener('click', click, true);
      document.removeEventListener('auxclick', aux, true);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', gone, true);
      window.removeEventListener('resize', gone);
    };
  }, [load, peek]);

  const value = useMemo<PeekApi>(
    () => ({
      peek,
      openBeside,
      closeBeside,
      beside,
      inspectorOpen,
      setInspectorOpen,
      inspected,
      back,
      tab,
      setTab,
      panel,
      setPanelTitle,
      setPanelEl,
      docked,
      setDocked,
      pins,
      pin: pinAndShow,
      unpin,
      load,
      cached,
    }),
    [peek, openBeside, closeBeside, beside, inspectorOpen, setInspectorOpen, inspected, back, tab, panel, docked, pins, pinAndShow, unpin, load, cached],
  );
  return (
    <PeekContext.Provider value={value}>
      {children}
      {card &&
        createPortal(
          <HoverCard
            card={card}
            api={value}
            onEnter={() => window.clearTimeout(timers.current.hide)}
            onLeave={() => {
              window.clearTimeout(timers.current.hide);
              timers.current.hide = window.setTimeout(() => setCard(null), 220);
            }}
            onDone={() => setCard(null)}
          />,
          document.body,
        )}
    </PeekContext.Provider>
  );
}

const W = 340;
function HoverCard({ card, api: p, onEnter, onLeave, onDone }: { card: Card; api: PeekApi; onEnter: () => void; onLeave: () => void; onDone: () => void }) {
  const [d, setD] = useState<PeekData | undefined>(() => p.cached(card.id));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    p.load(card.id).then(
      (x) => on && setD(x),
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, [card.id, p]);
  const r = card.rect;
  const below = window.innerHeight - r.bottom > 260 || r.top < 260;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left));
  const style = below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 };
  const pinned = p.pins.some((x) => x.id === card.id);
  return (
    <div className="wk-hovercard panel elev-2 fixed z-[2500] p-3 text-sm" style={{ ...style, width: W }} role="dialog" aria-label={d?.name ?? 'Record'} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {failed ? (
        <p className="text-dim">This record can&apos;t be shown.</p>
      ) : !d ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : (
        <div className="space-y-2">
          <PeekBadges d={d} />
          <div className="font-display text-gold text-lg leading-tight">{d.name}</div>
          {d.summary && <Markdown text={d.summary} className="prose-peek text-[13px] leading-snug text-ink/90 line-clamp-5" />}
          {d.facts.length > 0 && <KeyValue className="text-xs" items={d.facts.map(([k, v]) => [k, <FactValue key={k} v={v.length > 90 && !v.includes('[') ? `${v.slice(0, 88)}…` : v} />])} />}
          <div className="flex flex-wrap gap-1 pt-1 border-t border-line">
            <button className="btn-ghost text-xs" onClick={() => (onDone(), p.peek(d.id))} title="Open in the inspector (middle-click a link does this too)">
              <PanelRight size={13} /> Peek
            </button>
            <button className="btn-ghost text-xs" onClick={() => (onDone(), p.openBeside(d.id))}>
              <Columns2 size={13} /> Open beside
            </button>
            {d.hasStatBlock && (
              <button className="btn-ghost text-xs" onClick={() => (pinned ? p.unpin(d.id) : p.pin({ id: d.id, name: d.name }))} aria-pressed={pinned}>
                <PinIcon size={13} /> {pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            <Link to={`/e/${encodeURIComponent(d.id)}`} className="btn-ghost text-xs ml-auto" onClick={onDone}>
              <ExternalLink size={13} /> Open
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
