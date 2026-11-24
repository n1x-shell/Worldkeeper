/**
 * The inspector (docs/DESIGN_OVERHAUL.md §4.4): a 360px panel on the right with whatever was peeked, and the stat
 * blocks pinned for the session. `]` toggles it and Esc closes it. Below 1280px wide it overlays the page.
 */
import { useEffect } from 'react';
import { ArrowLeft, PanelRightClose, Pin as PinIcon, PinOff } from 'lucide-react';
import { StatBlockById } from '../StatBlock';
import { Empty, Segmented } from '../ui';
import { usePeek } from './context';
import { RecordPeek } from './RecordPeek';

export function Inspector({ overlay }: { overlay: boolean }) {
  const p = usePeek();
  const docked = !!p?.inspectorOpen && !overlay;
  const setDocked = p?.setDocked;
  useEffect(() => {
    document.documentElement.classList.toggle('wk-inspector-docked', docked);
    setDocked?.(docked);
    return () => {
      document.documentElement.classList.remove('wk-inspector-docked');
      setDocked?.(false);
    };
  }, [docked, setDocked]);
  if (!p || !p.inspectorOpen) return null;
  const current = p.inspected[p.inspected.length - 1] ?? null;
  return (
    <aside
      className={`wk-inspector flex flex-col bg-panel border-l border-line ${overlay ? 'fixed right-0 top-[52px] bottom-0 z-1700 elev-3' : 'shrink-0 relative'}`}
      style={{ width: 'min(360px, 100vw)' }}
      aria-label="Inspector"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Segmented
          size="sm"
          label="Inspector shows"
          value={p.tab}
          onChange={p.setTab}
          options={[
            ...(p.panel ? [{ value: 'page' as const, label: 'This page' }] : []),
            { value: 'record', label: 'Peek' },
            { value: 'pinned', label: <span className="inline-flex items-center gap-1">Pinned{p.pins.length ? <span className="num">({p.pins.length})</span> : null}</span> },
          ]}
        />
        {p.tab === 'record' && p.inspected.length > 1 && (
          <button className="btn-ghost text-xs" onClick={p.back} title="Back to the record before">
            <ArrowLeft size={13} /> Back
          </button>
        )}
        <button className="btn-ghost ml-auto" onClick={() => p.setInspectorOpen(false)} aria-label="Close the inspector" title="Close ( ] or Esc )">
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* A page's own panel is portalled here (see panel.tsx); kept mounted so the page can reach it. */}
        <div ref={p.setPanelEl} className={p.tab === 'page' && p.panel ? '' : 'hidden'} aria-label={p.panel?.title} />
        {p.tab === 'page' && p.panel ? null : p.tab === 'record' ? (
          current ? (
            <RecordPeek key={current} id={current} mode="inspector" />
          ) : (
            <Empty compact title="Nothing peeked yet.">
              Hover a record link and choose Peek, or middle-click it, to read it here without leaving the page.
            </Empty>
          )
        ) : p.pins.length === 0 ? (
          <Empty compact title="No stat blocks pinned." icon={<PinIcon size={18} />}>
            Pin a stat block from a hover card, a record or the encounter tracker. Pins last until the live session ends.
          </Empty>
        ) : (
          <div className="space-y-3">
            {p.pins.map((x) => (
              <details key={x.id} open className="panel">
                <summary className="flex items-center gap-2 cursor-pointer px-3 py-2">
                  <span className="font-display text-gold flex-1 min-w-0 truncate">{x.name}</span>
                  <button
                    className="btn-ghost p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      p.unpin(x.id);
                    }}
                    aria-label={`Unpin ${x.name}`}
                    title="Unpin"
                  >
                    <PinOff size={13} />
                  </button>
                </summary>
                <div className="px-3 pb-3">
                  <StatBlockById id={x.id} />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
