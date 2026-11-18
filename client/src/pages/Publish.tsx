import { useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, Globe, KeyRound, Send, Check } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { Confirm, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { Dev } from '../components/Dev';

interface Summary {
  entries: number;
  maps: number;
  quests: number;
  recaps: number;
  files: number;
  bytes: number;
  generated_at: string;
}
interface Last {
  at: string;
  url: string;
  changed: boolean;
  uploaded: number;
  unchanged: number;
  pages: string;
  pagesNote: string | null;
  summary: Summary;
  repo?: string;
}
interface Status {
  config: { repo: string; branch: string } | null;
  tokenSaved: boolean;
  last: Last | null;
  available: boolean;
  preview: Summary | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function PublishPage() {
  const { data, error, reload, setData } = useApi<Status>('/api/publish');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('gh-pages');
  const [token, setToken] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Last | null>(null);
  useEffect(() => {
    if (data?.config) {
      setRepo(data.config.repo);
      setBranch(data.config.branch);
    }
  }, [data?.config]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const p = data.preview;
  const last = result ?? data.last;

  const save = async (tokenValue?: string) => {
    setErr(null);
    try {
      const s = await api.put<Status>('/api/publish/config', { repo, branch: branch || 'gh-pages', ...(tokenValue !== undefined ? { token: tokenValue } : {}) });
      setData(s);
      setToken('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const publish = async () => {
    setConfirming(false);
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.post<Last>('/api/publish/github', { confirm: true }));
      void reload();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = !!data.config && data.tokenSaved;
  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        icon={<Globe size={22} />}
        title="Publish for Players"
        subtitle="Put your Player Handbook online as a free GitHub Pages site your players can open on any device."
        note="A static site: the player view plus one data file from the player-safe projection and the images of published maps. Pushed with the GitHub Git Data API to a branch; Pages serves that branch."
      />
      {!data.available && <ErrorBox error="The Player Handbook isn't built yet. Run “npm run build” and restart." />}
      {err && <ErrorBox error={err} />}

      <section className="panel-pad space-y-2">
        <h2 className="section-title">What players will see</h2>
        {p ? (
          <>
            <p className="text-sm">
              {plural(p.entries, 'entry', 'entries')}, {plural(p.maps, 'map')}, {plural(p.quests, 'quest')} and {plural(p.recaps, 'session recap')}: only what you have revealed or published. Secrets
              and GM-only sections are never included.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="btn" href="/player" target="_blank" rel="noreferrer">
                <Eye size={14} /> Preview
              </a>
              <a className="btn" href="/api/publish/site.zip">
                <Download size={14} /> Download as ZIP
              </a>
            </div>
            <Dev>
              <p className="text-xs text-dim">
                {p.files} files, {(p.bytes / 1048576).toFixed(2)} MB.
              </p>
            </Dev>
          </>
        ) : (
          <Loading />
        )}
      </section>

      <MatchHandbook />

      <section className="panel-pad space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <KeyRound size={14} /> Connect GitHub
        </h2>
        <ol className="text-sm list-decimal pl-5 space-y-1 text-dim">
          <li>
            Create a{' '}
            <a className="text-arcane underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              fine-grained token <ExternalLink size={11} className="inline" />
            </a>{' '}
            with access to <strong className="text-ink">only this repository</strong>.
          </li>
          <li>
            Under <em>Repository permissions</em>, set <strong className="text-ink">Contents</strong> and <strong className="text-ink">Pages</strong> to <em>Read and write</em>.
          </li>
          <li>Paste the token below. It stays on this computer and is never included in backups or exports.</li>
        </ol>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Repository (owner/name)">
            <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="n1x-shell/Worldkeeper" />
          </Field>
          <Field label={data.tokenSaved ? 'Token (saved; paste a new one to replace it)' : 'Token'}>
            <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={data.tokenSaved ? '••••••••••••' : 'github_pat_…'} />
          </Field>
          <Dev>
            <Field label="Branch">
              <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </Field>
          </Dev>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" disabled={!repo.trim() || (!data.tokenSaved && !token.trim())} onClick={() => save(token.trim() || undefined)}>
            Save
          </button>
          {data.tokenSaved && (
            <button className="btn" onClick={() => save('')}>
              Forget token
            </button>
          )}
          {saved && (
            <span className="text-sm text-ok flex items-center gap-1">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </section>

      <section className="panel-pad space-y-3">
        <h2 className="section-title">Publish</h2>
        <p className="text-sm text-dim">Publish again after a session to update what your players see. Anyone with the link can read the handbook.</p>
        <button className="btn-primary" disabled={!ready || !data.available || busy} onClick={() => setConfirming(true)}>
          <Send size={14} /> {busy ? 'Publishing…' : 'Publish to GitHub Pages'}
        </button>
        {last && (
          <div className={`panel p-3 text-sm space-y-1 ${result ? 'border-ok/50' : ''}`}>
            <div>
              {result ? (result.changed ? 'Published.' : 'Already up to date: nothing had changed.') : 'Last published'} {new Date(last.at).toLocaleString()}
            </div>
            <a className="text-arcane underline inline-flex items-center gap-1" href={last.url} target="_blank" rel="noreferrer">
              {last.url} <ExternalLink size={12} />
            </a>
            {last.pagesNote && <div className="text-amber-400">{last.pagesNote}</div>}
            <Dev>
              <div className="text-xs text-dim">
                Uploaded {last.uploaded} changed files, {last.unchanged} unchanged · Pages: {last.pages}
              </div>
            </Dev>
          </div>
        )}
      </section>

      {confirming && p && (
        <Confirm
          title="Publish the Player Handbook?"
          confirmLabel="Publish"
          onCancel={() => setConfirming(false)}
          onConfirm={publish}
          body={
            <div className="space-y-2">
              <p>
                This puts {plural(p.entries, 'entry', 'entries')}, {plural(p.maps, 'map')}, {plural(p.quests, 'quest')} and {plural(p.recaps, 'session recap')} on a public website at GitHub (
                {data.config?.repo}).
              </p>
              <p className="text-dim">Only what you have revealed or published is included. Anyone with the link can read it.</p>
            </div>
          }
        />
      )}
    </div>
  );
}

interface RevealChange {
  id: string;
  name: string;
  newRecord: boolean;
  sections: string[];
  playerText: boolean;
}
interface RevealPlan {
  records: RevealChange[];
  newRecords: number;
  sections: number;
  playerText: number;
  pins: number;
}

/**
 * Reveal in this library what the published Player Handbook shows: the archive's player-tagged records (their safe
 * sections) and the setting's player text. Only ever adds; a backup is made first.
 */
function MatchHandbook() {
  const { data, error, reload } = useApi<RevealPlan>('/api/handbook-reveals');
  const [done, setDone] = useState<RevealPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      setDone(await api.post<RevealPlan>('/api/handbook-reveals'));
      await reload();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <section className="panel-pad space-y-2">
      <h2 className="section-title">Match the published handbook</h2>
      <p className="text-sm text-dim">
        The Player Handbook on GitHub Pages shows the records your archive tags for players, with only their safe sections, and the setting&apos;s player text. This reveals the same in this library,
        so the table server and the in-app player view show players what the handbook does. It only adds: nothing you&apos;ve revealed is hidden, and player text you&apos;ve written is kept. A backup
        is made first, and each change is in the record&apos;s history.
      </p>
      {error && <ErrorBox error={error} />}
      {done && (
        <p className="text-sm" aria-live="polite">
          <Check size={14} className="inline text-gold" /> Revealed {plural(done.newRecords, 'record')}, {plural(done.sections, 'section')}, player text for {plural(done.playerText, 'record')}, and{' '}
          {plural(done.pins, 'map pin')}.
        </p>
      )}
      {!data ? (
        !error && <Loading />
      ) : !data.records.length && !data.pins ? (
        <p className="text-sm">This library already shows players everything the handbook does.</p>
      ) : (
        <>
          <p className="text-sm">
            To match: {plural(data.newRecords, 'record')} to reveal, {plural(data.sections, 'more section')}, player text for {plural(data.playerText, 'record')}, and {plural(data.pins, 'map pin')} to
            show players.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-dim">See what changes</summary>
            <ul className="max-h-64 overflow-auto mt-1 space-y-0.5">
              {data.records.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.name}</span>{' '}
                  <span className="text-xs text-dim">
                    {[r.newRecord && 'newly revealed', r.sections.length && `sections: ${r.sections.join(', ')}`, r.playerText && 'player text'].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <button className="btn-primary" disabled={busy} onClick={() => setConfirm(true)}>
            <Eye size={14} /> Match the published handbook
          </button>
          {confirm && (
            <Confirm
              title="Match the published handbook?"
              body={`This reveals ${plural(data.newRecords, 'record')} and more sections to players in this library. Nothing is hidden, and a backup is made first.`}
              confirmLabel="Reveal"
              onConfirm={apply}
              onCancel={() => setConfirm(false)}
            />
          )}
        </>
      )}
    </section>
  );
}
