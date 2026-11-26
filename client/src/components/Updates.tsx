/**
 * Is there a newer version? (v0.9.17.) The app asks GitHub's public list of this project's releases once a day; it
 * sends nothing about the GM or their world, and never downloads or installs anything. Settings holds the switch;
 * the top bar shows a small note when a newer version exists.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../lib/api';
import { Card, Check, ask, toast } from './ui';

interface Status {
  enabled: boolean;
  current: string;
  latest: { version: string; name: string; url: string; published_at: string | null; installable?: boolean } | null;
  newer: boolean;
  checked_at: string | null;
  error: string | null;
  releases: string;
  /** The desktop app, where it can replace itself. */
  canInstall?: boolean;
  install?: { state: 'checking' | 'downloading' | 'installing' | 'failed'; tag: string; error: string | null } | null;
}

/** In the top bar, only when a newer version exists. */
export function UpdateIndicator() {
  const { data } = useApi<Status>('/api/update');
  if (!data?.newer || !data.latest) return null;
  return (
    <Link to="/settings#updates" className="btn-ghost text-gold" title={`Version ${data.latest.version} is out (you have ${data.current})`} aria-label={`Version ${data.latest.version} is out`} data-testid="update-indicator">
      <ArrowUpCircle size={16} /> <span className="hidden 2xl:inline whitespace-nowrap">Update</span>
    </Link>
  );
}

const STEPS: Record<string, string> = {
  checking: 'Looking for the update…',
  downloading: 'Downloading the new version…',
  installing: 'Installing. The app will close and open again by itself.',
};

/**
 * "Update and restart", in the desktop app. The page goes to an address only the app's own shell understands; the
 * shell keeps the page where it is, downloads the release, checks its signature and installs it. What it is doing
 * comes back through the server, until the server is stopped for the install.
 */
function InstallUpdate({ status, onStatus }: { status: Status; onStatus: (s: Status) => void }) {
  const [going, setGoing] = useState(!!status.install && status.install.state !== 'failed');
  const [gone, setGone] = useState(false);
  const cb = useRef(onStatus);
  cb.current = onStatus;
  useEffect(() => {
    if (!going) return;
    let live = true;
    let misses = 0;
    const t = setInterval(() => {
      api
        .get<Status>('/api/update')
        .then((s) => {
          if (!live) return;
          misses = 0;
          cb.current(s);
          if (s.install?.state === 'failed') setGoing(false);
          // The new version is running: show it.
          else if (!s.newer) window.location.reload();
        })
        .catch(() => {
          // The server has been stopped for the install: the app is about to restart.
          if (live && ++misses >= 2) setGone(true);
        });
    }, 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [going]);
  const latest = status.latest!;
  const failed = status.install?.state === 'failed' ? status.install : null;
  if (going)
    return (
      <p className="rounded border border-gold/60 bg-gold/10 px-3 py-2 text-sm" role="status" data-testid="update-progress">
        <b>Updating to version {latest.version}.</b> {gone ? 'Restarting…' : (STEPS[status.install?.state ?? 'checking'] ?? STEPS.checking)} Leave the app open.
      </p>
    );
  return (
    <div className="space-y-2">
      {failed && (
        <p className="rounded border border-danger/50 bg-danger/10 px-3 py-2 text-sm" role="alert">
          The update didn’t go through: {failed.error ?? 'no reason was given'}. Nothing was changed. You can try again, or{' '}
          <a href={latest.url} target="_blank" rel="noreferrer" className="underline">
            download version {latest.version}
          </a>{' '}
          and install it over this one.{' '}
          <button type="button" className="underline" onClick={async () => onStatus(await api.post<Status>('/api/update/dismiss'))}>
            Dismiss
          </button>
        </p>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={async () => {
          if (
            !(await ask({
              title: `Update to version ${latest.version}?`,
              body: 'The app downloads the new version from this project’s releases on GitHub, checks that it is the real one, installs it and opens again. It takes a minute or two. Your libraries are backed up before the new version changes anything in them. If the table is open, your players are cut off until it is back.',
              confirmLabel: 'Update and restart',
            }))
          )
            return;
          setGoing(true);
          // Not a page: the app's shell sees this address and does the update.
          window.location.assign(`/__shell/update?tag=${encodeURIComponent(`v${latest.version}`)}`);
        }}
      >
        <Download size={14} /> Update and restart
      </button>
    </div>
  );
}

export function UpdatesPanel() {
  const { data, setData } = useApi<Status>('/api/update');
  // From another device (a tablet), the app on the computer can't be told to replace itself.
  const { data: session } = useApi<{ remote: boolean }>('/api/remote/session');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const oneClick = data.newer && !!data.latest?.installable && !!data.canInstall && session?.remote === false;
  const when = data.checked_at ? new Date(data.checked_at).toLocaleString() : null;
  return (
    <div id="updates" data-testid="updates">
      <Card title="Updates" icon={<ArrowUpCircle size={16} />} className="space-y-3">
        {data.newer && data.latest ? (
          <p className="rounded border border-gold/60 bg-gold/10 px-3 py-2 text-sm">
            <b>Version {data.latest.version} is out.</b> You have {data.current}.{' '}
            <a href={data.latest.url} target="_blank" rel="noreferrer" className="text-arcane underline">
              See what’s new and download it
            </a>
            . Your libraries are backed up before a new version changes anything in them.
            {!oneClick && ' Install it over this one: you don’t need to remove anything first, and your worlds stay as they are.'}
          </p>
        ) : (
          <p className="text-sm">
            You have version <b>{data.current}</b>
            {data.latest ? ', the newest.' : '.'}
          </p>
        )}
        {oneClick && <InstallUpdate status={data} onStatus={setData} />}
        <Check
          checked={data.enabled}
          onChange={async (enabled) => {
            setData({ ...data, enabled });
            try {
              setData(await api.put<Status>('/api/update', { enabled }));
            } catch (x) {
              setData(data);
              toast((x as Error).message, 'danger');
            }
          }}
        >
          Check for a newer version once a day
        </Check>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const s = await api.post<Status>('/api/update/check');
                setData(s);
                if (s.error) toast(`Couldn’t check: ${s.error}`, 'danger');
                else toast(s.newer && s.latest ? `Version ${s.latest.version} is out.` : 'You have the newest version.', 'ok');
              } catch (x) {
                toast((x as Error).message, 'danger');
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={14} /> {busy ? 'Checking…' : 'Check now'}
          </button>
          <span className="text-xs text-dim">
            {when ? `Last checked ${when}` : 'Not checked yet'}
            {data.error ? ` (no answer: ${data.error})` : ''}
          </span>
        </div>
        <p className="text-xs text-dim">
          The check asks GitHub for this project’s list of releases, and nothing else. It sends nothing about you, this computer or your worlds. Nothing is downloaded unless you choose Update and restart (in the desktop app) or get the new version yourself from the{' '}
          <a href={data.releases} target="_blank" rel="noreferrer" className="underline">
            releases page
          </a>
          . Apart from this, the app makes no network calls unless you publish a handbook or add content from Open5e.
        </p>
      </Card>
    </div>
  );
}
