/** Feedback: loading, empty, error and save states. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleDashed, Loader2 } from 'lucide-react';
import type { SaveState } from '../../lib/api';

/** A grey placeholder bar while something loads. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

/** Loading: the label beside a spinner, over a few placeholder lines (or just the line, `inline`). */
export function Loading({ label = 'Loading…', inline, lines = 3 }: { label?: string; inline?: boolean; lines?: number }) {
  if (inline)
    return (
      <span className="inline-flex items-center gap-2 text-dim text-sm" role="status">
        <Loader2 className="animate-spin" size={14} /> {label}
      </span>
    );
  return (
    <div className="p-6 space-y-3" role="status" aria-busy="true">
      <div className="flex items-center gap-2 text-dim text-sm">
        <Loader2 className="animate-spin" size={16} /> {label}
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${['w-full', 'w-11/12', 'w-3/4', 'w-5/6', 'w-2/3'][i % 5]}`} />
      ))}
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

/** Nothing here yet: a title, a line on why, and one clear next step (`action`). `compact` for inside a card. */
export function Empty({ title, children, action, icon, compact }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? 'py-3 text-center' : 'panel p-8 text-center'}>
      {icon && <div className="flex justify-center text-gold/60 mb-2">{icon}</div>}
      <p className={compact ? 'text-sm text-dim italic' : 'font-display text-gold/80'}>{title}</p>
      {children && <div className={`text-dim ${compact ? 'mt-1 text-xs' : 'mt-2 text-sm'}`}>{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function SaveStatus({ state, error }: { state: SaveState; error?: string | null }) {
  const map: Record<SaveState, [ReactNode, string, string]> = {
    idle: [<CircleDashed size={13} key="i" />, 'No changes', 'text-dim'],
    dirty: [<CircleDashed size={13} key="d" />, 'Unsaved changes…', 'text-warn'],
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
