import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CircleDashed, Loader2, X, EyeOff, Eye } from 'lucide-react';
import { ENTITY_TYPE_LABELS, REALM_LABELS, type EntityType, type Realm } from '@shared/domain';
import type { SaveState } from '../lib/api';
import { useAppState } from '../lib/store';
import { useLinkSuggest } from './LinkSuggest';

const CANON_STYLES: Record<string, string> = {
  CANON: 'border-gold/50 text-gold bg-gold/10',
  PROPOSED: 'border-arcane/60 text-arcane bg-arcane/10',
  CONFLICT: 'border-danger/60 text-danger bg-danger/10',
  UNDEFINED: 'border-line text-dim',
  RUMOR: 'border-amber-500/50 text-amber-400 bg-amber-500/10',
  BELIEF: 'border-teal-500/50 text-teal-400 bg-teal-500/10',
  SECRET: 'border-danger/60 text-danger bg-danger/10',
  HOMEBREW: 'border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-500/10',
  UNVERIFIED: 'border-orange-500/50 text-orange-400 bg-orange-500/10',
  OFFICIAL: 'border-ok/60 text-ok bg-ok/10',
  'OUTSIDE 2024 CORE': 'border-orange-500/50 text-orange-300',
};

export function CanonBadge({ status }: { status: string }) {
  return <span className={`chip ${CANON_STYLES[status] ?? 'border-line text-dim'}`}>{status}</span>;
}

export function CanonFlags({ status, flags }: { status: string; flags: string[] }) {
  const all = [status, ...flags.filter((f) => f !== status)];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {all.map((f) => (
        <CanonBadge key={f} status={f} />
      ))}
    </span>
  );
}

const REALM_STYLES: Record<string, string> = {
  aetheris: 'border-amber-600/50 text-amber-300',
  kaelmar: 'border-emerald-600/50 text-emerald-300',
  ethereal: 'border-violet-500/50 text-violet-300',
  world: 'border-sky-600/50 text-sky-300',
};
export function RealmBadge({ realm }: { realm: string }) {
  return <span className={`chip ${REALM_STYLES[realm] ?? 'border-line text-dim'}`}>{REALM_LABELS[realm as Realm] ?? realm}</span>;
}
export function TypeBadge({ type }: { type: string }) {
  return <span className="chip border-line text-dim">{ENTITY_TYPE_LABELS[type as EntityType] ?? type}</span>;
}
export function VisibilityBadge({ revealed }: { revealed: boolean }) {
  return revealed ? (
    <span className="chip border-ok/50 text-ok" title="Revealed to players">
      <Eye size={11} /> Revealed
    </span>
  ) : (
    <span className="chip border-line text-dim" title="DM only">
      <EyeOff size={11} /> DM only
    </span>
  );
}

/** Link to a record by stable ID; shows the record name when known, flags broken links. */
export function EntityLink({ id, children, className = '' }: { id: string; children?: ReactNode; className?: string }) {
  const { index, indexLoaded } = useAppState();
  const e = index.get(id);
  const { debug } = useAppState();
  if (indexLoaded && !e) return <span className="text-danger underline decoration-wavy" title={debug ? `No record with ID ${id}` : 'This record no longer exists'}>{children ?? (debug ? id : 'missing record')}</span>;
  return (
    <Link to={`/e/${encodeURIComponent(id)}`} className={`text-arcane hover:text-gold ${className}`} title={debug && e ? `${e.name} · ${id}` : undefined}>
      {children ?? e?.name ?? id}
    </Link>
  );
}

export function SaveStatus({ state, error }: { state: SaveState; error?: string | null }) {
  const map: Record<SaveState, [ReactNode, string, string]> = {
    idle: [<CircleDashed size={13} key="i" />, 'No changes', 'text-dim'],
    dirty: [<CircleDashed size={13} key="d" />, 'Unsaved changes…', 'text-amber-400'],
    saving: [<Loader2 size={13} className="animate-spin" key="s" />, 'Saving…', 'text-dim'],
    saved: [<Check size={13} key="ok" />, 'All changes saved', 'text-ok'],
    error: [<AlertTriangle size={13} key="e" />, `Save failed${error ? `: ${error}` : ''}`, 'text-danger'],
  };
  const [icon, text, cls] = map[state];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`} role="status" aria-live="polite">
      {icon}
      {text}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
            value === t.id ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`panel w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[84vh] overflow-auto shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sticky top-0 bg-panel z-10">
          <h2 className="text-gold text-base">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-dim p-6">
      <Loader2 className="animate-spin" size={16} /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="panel border-danger/50 bg-danger/5 p-4 text-sm text-danger flex items-start gap-2" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">{typeof error === 'string' ? error : error.message}</div>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel p-8 text-center">
      <p className="font-display text-gold/80">{title}</p>
      {children && <div className="mt-2 text-sm text-dim">{children}</div>}
    </div>
  );
}

/** `note` is a how-it-works explanation, shown only in debug mode. */
export function PageHeader({ title, subtitle, note, actions, icon }: { title: ReactNode; subtitle?: ReactNode; note?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  const { debug } = useAppState();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl text-gold flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {subtitle && <div className="text-sm text-dim mt-1">{subtitle}</div>}
        {note && debug && <div className="text-xs text-dim/80 mt-1 italic">{note}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-dim mt-1">{hint}</span>}
    </label>
  );
}

/**
 * Text area that grows with its content. Typing `[[` offers record-link suggestions
 * (inserts `Name [ID]`); pass `links={false}` to turn that off.
 */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; links?: boolean }) {
  const { minRows = 3, className = '', links = true, onKeyDown, onChange, onBlur, onClick, onKeyUp, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const suggest = useLinkSuggest(ref, links);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 22)}px`;
  }, [props.value, minRows]);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={minRows}
        className={`input font-mono text-[13px] leading-relaxed resize-y ${className}`}
        {...rest}
        onChange={(e) => {
          onChange?.(e);
          suggest.update();
        }}
        onKeyDown={(e) => {
          if (suggest.onKeyDown(e)) return;
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) suggest.update();
          onKeyUp?.(e);
        }}
        onClick={(e) => {
          suggest.update();
          onClick?.(e);
        }}
        onBlur={(e) => {
          setTimeout(suggest.close, 150);
          onBlur?.(e);
        }}
        aria-autocomplete={links ? 'list' : undefined}
        aria-expanded={links ? suggest.open : undefined}
      />
      {suggest.popup}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-4 right-4 z-[3000] panel px-4 py-2 text-sm shadow-xl border-gold/50" role="status">
      {message}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { toast: setMsg, node: msg ? <Toast message={msg} onDone={() => setMsg(null)} /> : null };
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (this.state.error)
      return (
        <div className="p-6 space-y-3">
          <ErrorBox error={`This screen hit an error: ${this.state.error.message}. Your saved data is safe.`} />
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    return this.props.children;
  }
}

export function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-sm space-y-4">
        <div>{body}</div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
