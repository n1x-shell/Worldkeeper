/**
 * Hover cards by delegation (docs/DESIGN_OVERHAUL.md §8): any element with `data-peek="<ID>"` shows a card after 350ms
 * of hover or keyboard focus; the card stays while the pointer is over it. On touch, the first tap shows the card and a
 * second tap follows the link. With `peek`, middle-click and a long press call it (the GM app opens the inspector).
 * No app dependencies, so the player handbook uses it too.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface HoverTarget {
  id: string;
  el: HTMLElement;
  rect: DOMRect;
}

export function useHoverCards({ load, peek }: { load?: (id: string) => Promise<unknown>; peek?: (id: string) => void }) {
  const [card, setCard] = useState<HoverTarget | null>(null);
  const cardRef = useRef<HoverTarget | null>(null);
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
      void load?.(id).catch(() => undefined);
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
        peek?.(el.dataset.peek!);
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
      peek?.(el.dataset.peek!);
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
  const onCardEnter = useCallback(() => window.clearTimeout(timers.current.hide), []);
  const onCardLeave = useCallback(() => {
    window.clearTimeout(timers.current.hide);
    timers.current.hide = window.setTimeout(() => setCard(null), 220);
  }, []);
  return { card, setCard, onCardEnter, onCardLeave };


}
