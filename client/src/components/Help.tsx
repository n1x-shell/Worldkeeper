/**
 * When something goes wrong (v0.9.19, docs/BETA_PLAN.md A3). The app keeps a log on this computer; "Copy details"
 * gathers what someone fixing a bug needs (versions, sizes, what the log says) as text the GM can read first, and
 * pastes nowhere by itself. Nothing is sent by the app: the GM opens the bug report and pastes.
 */
import { useState, type ReactNode } from 'react';
import { Bug, ClipboardCopy, FolderOpen, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../lib/api';
import { bugReportDetails, copyText, reportScreenError } from '../lib/report';
import { Card, ErrorBoundary, toast } from './ui';

export const REPORT_A_BUG = 'https://github.com/n1x-shell/Worldkeeper/issues/new/choose';

/** The button, wherever something went wrong: copies the details (with this screen's error, if one is given). */
export function CopyDetails({ error, className = 'btn' }: { error?: Error | null; className?: string }) {
  const [busy, setBusy] = useState(false);
  // Said on the button as well as in the corner: where the whole app broke, there is no corner to say it in.
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      data-testid="copy-details"
      onClick={async () => {
        setBusy(true);
        try {
          const ok = await copyText(await bugReportDetails(error));
          toast(ok ? 'Copied. Paste it into your bug report.' : 'Couldn’t copy. Select the text under “See what is copied” in Settings → Help instead.', ok ? 'ok' : 'danger');
          setSaid(ok ? 'Copied: paste it into your bug report' : 'Couldn’t copy');
          setTimeout(() => setSaid(null), 5000);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ClipboardCopy size={14} /> <span aria-live="polite">{busy ? 'Copying…' : (said ?? 'Copy details for a bug report')}</span>
    </button>
  );
}

/** Beside "Try again" on a screen that broke. */
export const screenErrorActions = (error: Error) => <CopyDetails error={error} />;

const appErrorActions = (error: Error) => (
  <>
    <button type="button" className="btn" onClick={() => window.location.assign('/')}>
      Go to the start page
    </button>
    <CopyDetails error={error} />
    <a href={REPORT_A_BUG} target="_blank" rel="noreferrer" className="btn">
      <Bug size={14} /> Report a bug
    </a>
  </>
);

/**
 * Around the whole app: if something breaks outside any one screen (the frame, the menus), the window says so instead
 * of going blank, and the details can still be copied.
 */
export function AppSafetyNet({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary onError={reportScreenError} actions={appErrorActions}>
      {children}
    </ErrorBoundary>
  );
}

interface Diagnostics {
  text: string;
  logs: string;
  canOpen: boolean;
  report: string;
}

/** Settings → Help and bug reports. */
export function HelpPanel() {
  const { data, reload } = useApi<Diagnostics>('/api/diagnostics');
  const { data: session } = useApi<{ remote: boolean }>('/api/remote/session');
  return (
    <div id="help" data-testid="help">
      <Card title="Help and bug reports" className="space-y-3">
        <p className="text-sm">
          If something goes wrong, a bug report with the details below is the fastest way to get it fixed. The details say which version this is, what kind of computer it runs on, how big the library is, and what the app logged. They hold <b>nothing from your world</b>: no names, no
          text, no pictures.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CopyDetails />
          <a href={data?.report ?? REPORT_A_BUG} target="_blank" rel="noreferrer" className="btn">
            <Bug size={14} /> Report a bug
          </a>
          {data?.canOpen && session?.remote === false && (
            <button type="button" className="btn-ghost" onClick={() => void api.post('/api/diagnostics/open-logs').catch((x: Error) => toast(x.message, 'danger'))}>
              <FolderOpen size={14} /> Show the log files
            </button>
          )}
        </div>
        <details className="text-sm" onToggle={(e) => (e.currentTarget.open ? void reload() : undefined)}>
          <summary className="cursor-pointer text-arcane">See what is copied</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded border border-line bg-raised p-2 text-xs whitespace-pre-wrap break-all" data-testid="details-text" tabIndex={0}>
            {data?.text ?? 'Loading…'}
          </pre>
        </details>
        <p className="text-xs text-dim">
          Nothing is sent by the app: you paste the details into the report yourself, and can read or trim them first. The log is kept on this computer{data?.logs ? <> in <code>{data.logs}</code></> : null}, stays small, and is not part of any backup or export.
          Bug reports are public, so don’t attach a library or a backup to one.
        </p>
      </Card>
    </div>
  );
}

/**
 * After an update (v0.9.21): one line at the top of the app saying this version is new here, with the way to what
 * changed. It stays until the GM follows it or closes it; a first install never shows it.
 */
export function WhatsNewNote() {
  const { data, setData } = useApi<{ version?: string; updated?: { from: string | null; to: string } | null }>('/api/meta');
  if (!data?.updated) return null;
  const seen = () => {
    setData({ ...data, updated: null });
    void api.post('/api/meta/whats-new-seen').catch(() => undefined);
  };
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm bg-gold/10 border-b border-gold/30" role="status" data-testid="whats-new-note">
      <Sparkles size={15} className="text-gold shrink-0" />
      <span className="flex-1">
        The Worldkeeper was updated to version {data.updated.to}
        {data.updated.from ? ` (from ${data.updated.from})` : ''}.{' '}
        <Link to="/help/whats-new" onClick={seen} className="text-arcane underline">
          See what’s new
        </Link>
      </span>
      <button type="button" className="btn-ghost px-1.5!" aria-label="Close this note" onClick={seen}>
        <X size={14} />
      </button>
    </div>
  );
}
