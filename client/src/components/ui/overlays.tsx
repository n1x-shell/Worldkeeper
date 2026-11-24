/** Overlays: dialogs, drawers, confirmations and toasts. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Esc closes, and focus starts on the first control and comes back to where it was. */
function useOverlay(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost overlay closes.
      const all = document.querySelectorAll('[data-overlay]');
      if (all[all.length - 1] === ref.current) (e.stopPropagation(), onClose());
    };
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('[data-autofocus],input,textarea,select,button:not([aria-label="Close"])')?.focus();
    return () => {
      window.removeEventListener('keydown', k);
      back?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useOverlay(onClose);
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} data-overlay role="dialog" aria-modal="true" aria-label={title} className={`panel elev-3 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[84vh] overflow-auto`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sticky top-0 bg-panel z-10">
          <h2 className="text-gold text-base">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3 sticky bottom-0 bg-panel">{footer}</div>}
      </div>
    </div>
  );
}

/** A panel that slides in from the side (the inspector's content on narrow screens, long side lists). */
export function Drawer({ title, onClose, children, side = 'right', width = 380 }: { title: ReactNode; onClose: () => void; children: ReactNode; side?: 'left' | 'right'; width?: number }) {
  const ref = useOverlay(onClose);
  return (
    <div className="fixed inset-0 z-[1900] bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        data-overlay
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`absolute top-0 bottom-0 ${side === 'right' ? 'right-0 border-l' : 'left-0 border-r'} border-line bg-panel elev-3 flex flex-col wk-drawer-${side}`}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-gold text-base truncate">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-sm space-y-4">
        <div>{body}</div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface AskOptions {
  title?: string;
  body: ReactNode;
  confirmLabel?: string;
  /** A red button, for things that can't be undone. */
  danger?: boolean;
}
export interface AskTextOptions {
  title: string;
  body?: ReactNode;
  /** The box's label. */
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
}
type Asking = (AskOptions & { kind: 'confirm'; resolve: (ok: boolean) => void }) | (AskTextOptions & { kind: 'text'; resolve: (v: string | null) => void });
let pushAsk: ((a: Asking) => void) | null = null;

/**
 * Ask the reader to confirm, in the app's own dialog: `if (!(await ask({ body: 'Delete it?', danger: true }))) return;`.
 * Needs a <ConfirmHost/> on the page (the GM and player layouts have one); without it, falls back to the browser's.
 */
export function ask(o: AskOptions | string): Promise<boolean> {
  const opts: AskOptions = typeof o === 'string' ? { body: o } : o;
  if (!pushAsk) return Promise.resolve(window.confirm(typeof opts.body === 'string' ? opts.body : (opts.title ?? 'Are you sure?')));
  return new Promise((resolve) => pushAsk!({ ...opts, kind: 'confirm', resolve }));
}

/**
 * Ask for a line of text, in the app's own dialog: `const why = await askText({ title: 'Why?' })`. Resolves to the
 * text (possibly empty) or null if cancelled.
 */
export function askText(o: AskTextOptions): Promise<string | null> {
  if (!pushAsk) return Promise.resolve(window.prompt(o.title, o.initial ?? ''));
  return new Promise((resolve) => pushAsk!({ ...o, kind: 'text', resolve }));
}

function TextDialog({ o, done }: { o: AskTextOptions; done: (v: string | null) => void }) {
  const [v, setV] = useState(o.initial ?? '');
  return (
    <Modal title={o.title} onClose={() => done(null)}>
      <form
        className="text-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          done(v);
        }}
      >
        {o.body && <div>{o.body}</div>}
        <label className="block">
          {o.label && <span className="label">{o.label}</span>}
          {o.multiline ? (
            <textarea className="input" rows={3} value={v} onChange={(e) => setV(e.target.value)} placeholder={o.placeholder} aria-label={o.label ?? o.title} data-autofocus />
          ) : (
            <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={o.placeholder} aria-label={o.label ?? o.title} data-autofocus />
          )}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {o.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Asking[]>([]);
  useEffect(() => {
    pushAsk = (a) => setQueue((q) => [...q, a]);
    return () => {
      pushAsk = null;
    };
  }, []);
  const cur = queue[0];
  if (!cur) return null;
  if (cur.kind === 'text')
    return (
      <TextDialog
        key={queue.length}
        o={cur}
        done={(v) => {
          cur.resolve(v);
          setQueue((q) => q.slice(1));
        }}
      />
    );
  const done = (ok: boolean) => {
    cur.resolve(ok);
    setQueue((q) => q.slice(1));
  };
  return (
    <Confirm
      title={cur.title ?? 'Are you sure?'}
      body={cur.body}
      confirmLabel={cur.confirmLabel ?? (cur.danger ? 'Delete' : 'OK')}
      danger={cur.danger}
      onConfirm={() => done(true)}
      onCancel={() => done(false)}
    />
  );
}

export function Toast({ message, onDone, tone = 'gold' }: { message: ReactNode; onDone: () => void; tone?: 'gold' | 'danger' | 'ok' }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  const edge = tone === 'danger' ? 'border-danger/60' : tone === 'ok' ? 'border-ok/60' : 'border-gold/50';
  return (
    <div className={`panel elev-2 px-4 py-2 text-sm ${edge} flex items-center gap-3`} role="status">
      <span>{message}</span>
      <button className="btn-ghost p-0.5" onClick={onDone} aria-label="Dismiss">
        <X size={13} />
      </button>
    </div>
  );
}

/** A toast owned by one page. Prefer `toast()` with the app's <ToastHost/>. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const done = useCallback(() => setMsg(null), []);
  return {
    toast: setMsg,
    node: msg ? (
      <div className="fixed bottom-4 right-4 z-[3000]">
        <Toast message={msg} onDone={done} />
      </div>
    ) : null,
  };
}

type Toasting = { id: number; message: ReactNode; tone?: 'gold' | 'danger' | 'ok' };
let pushToast: ((t: Toasting) => void) | null = null;
let nextToast = 1;
/** Show a short message in the corner. Needs a <ToastHost/> (the layouts have one). */
export function toast(message: ReactNode, tone?: 'gold' | 'danger' | 'ok') {
  pushToast?.({ id: nextToast++, message, tone });
}
export function ToastHost() {
  const [list, setList] = useState<Toasting[]>([]);
  useEffect(() => {
    pushToast = (t) => setList((l) => [...l.slice(-2), t]);
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[3000] flex flex-col items-end gap-2" aria-live="polite">
      {list.map((t) => (
        <Toast key={t.id} message={t.message} tone={t.tone} onDone={() => setList((l) => l.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
}
