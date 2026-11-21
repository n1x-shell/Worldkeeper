/** The inspector's top-bar button, and its keys: `]` toggles it, Esc closes it. */
import { useEffect } from 'react';
import { PanelRight } from 'lucide-react';
import { usePeek } from './context';

export function InspectorButton() {
  const p = usePeek();
  if (!p) return null;
  return (
    <button
      className={`btn-ghost ${p.inspectorOpen ? 'text-gold' : ''}`}
      onClick={() => p.setInspectorOpen(!p.inspectorOpen)}
      aria-label={p.inspectorOpen ? 'Close the inspector' : 'Open the inspector'}
      aria-pressed={p.inspectorOpen}
      title="Inspector ( ] ): peeked records and pinned stat blocks"
    >
      <PanelRight size={16} />
      {p.pins.length > 0 && <span className="num text-[10px] text-gold">{p.pins.length}</span>}
    </button>
  );
}

export function PeekKeys() {
  const p = usePeek();
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = /input|textarea|select/i.test(el?.tagName ?? '') || el?.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ']') {
        e.preventDefault();
        p.setInspectorOpen(!p.inspectorOpen);
      } else if (e.key === 'Escape' && p.inspectorOpen && !document.querySelector('[data-overlay]') && !document.querySelector('.wk-hovercard')) p.setInspectorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);
  return null;
}
