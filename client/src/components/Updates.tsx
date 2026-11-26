/**
 * Is there a newer version? (v0.9.17.) The app asks GitHub's public list of this project's releases once a day; it
 * sends nothing about the GM or their world, and never downloads or installs anything. Settings holds the switch;
 * the top bar shows a small note when a newer version exists.
 */
import { useState } from 'react';
import { ArrowUpCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../lib/api';
import { Card, Check, toast } from './ui';

interface Status {
  enabled: boolean;
  current: string;
  latest: { version: string; name: string; url: string; published_at: string | null } | null;
  newer: boolean;
  checked_at: string | null;
  error: string | null;
  releases: string;
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

export function UpdatesPanel() {
  const { data, setData } = useApi<Status>('/api/update');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
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
          </p>
        ) : (
          <p className="text-sm">
            You have version <b>{data.current}</b>
            {data.latest ? ', the newest.' : '.'}
          </p>
        )}
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
          The check asks GitHub for this project’s list of releases, and nothing else. It sends nothing about you, this computer or your worlds, and it never downloads or installs anything: you get the new version yourself from the{' '}
          <a href={data.releases} target="_blank" rel="noreferrer" className="underline">
            releases page
          </a>
          . Apart from this, the app makes no network calls unless you publish a handbook or add content from Open5e.
        </p>
      </Card>
    </div>
  );
}
