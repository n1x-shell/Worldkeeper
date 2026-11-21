/**
 * Split view (docs/DESIGN_OVERHAUL.md §4.3): a record open beside the page, from `?beside=<ID>`. The divider drags
 * (its width is kept on this device) and the pane closes with its ✕.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePeek } from './context';
import { RecordPeek } from './RecordPeek';
import { Drawer } from '../ui';

const KEY = 'wk.beside.width';
const readW = () => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 0.25 && v <= 0.7 ? v : 0.42;
  } catch {
    return 0.42;
  }
};

export function SplitView({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const p = usePeek();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(readW);
  const id = p?.beside ?? null;
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(w));
    } catch {
      /* preference only */
    }
  }, [w]);
  // While split, pages laid out for the full width (the record page) stack their columns: see .wk-split in the CSS.
  useEffect(() => {
    document.documentElement.classList.toggle('wk-split', !!id && enabled);
    return () => document.documentElement.classList.remove('wk-split');
  }, [id, enabled]);
  if (!id || !p) return <>{children}</>;
  // No room to split: the record opens in a drawer over the page.
  if (!enabled)
    return (
      <>
        {children}
        <Drawer title="Open beside" onClose={p.closeBeside} width={480}>
          <RecordPeek key={id} id={id} mode="beside" />
        </Drawer>
      </>
    );
  const drag = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => setW(Math.min(0.7, Math.max(0.25, (r.right - ev.clientX) / r.width)));
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div ref={box} className="flex h-full min-h-0 w-full">
      <div className="min-w-0 h-full relative" style={{ flex: `1 1 ${(1 - w) * 100}%` }}>
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the split"
        tabIndex={0}
        className="wk-split-handle"
        onPointerDown={drag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setW((x) => Math.min(0.7, x + 0.03));
          if (e.key === 'ArrowRight') setW((x) => Math.max(0.25, x - 0.03));
        }}
      />
      <section className="min-w-0 h-full overflow-y-auto bg-panel/60 border-l border-line p-4 md:p-6" style={{ flex: `0 0 ${w * 100}%` }} aria-label="Open beside">
        <RecordPeek key={id} id={id} mode="beside" onClose={p.closeBeside} />
      </section>
    </div>
  );
}
