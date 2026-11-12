import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Check, Download, RotateCcw, Upload, AlertTriangle, X, Pencil } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Confirm, EntityLink, ErrorBox, Field, Loading, PageHeader, Tabs, TypeBadge, useToast } from '../components/ui';
import { DiffView } from './EntityPage';
import { Dev, useDebug } from '../components/Dev';
import type { Entity } from '../lib/types';

// ------------------------------------------------------------------ Import & export
interface PreviewResp {
  token: string;
  summary: {
    sourceName: string;
    fileCount: number;
    filesByKind: Record<string, number>;
    entityCount: number;
    counts: { byType: Record<string, number>; byRealm: Record<string, number>; byAction: Record<string, number> };
    skipped: { id: string; file: string; line: number; reason: string }[];
    duplicates: { id: string; candidates: string[]; chosen: string; reason: string }[];
    brokenRefs: { from: string; ref: string }[];
    protectedDocs: { path: string; note: string }[];
    missingFromSource: string[];
    conflicts: { id: string; name: string; note: string }[];
    updates: { id: string; name: string }[];
    templates: number;
    timelineRows: number;
    warnings: string[];
  };
  entities: { id: string; name: string; type: string; realm: string; action: string; note?: string }[];
}

export function ImportExportPage() {
  const debug = useDebug();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, 'keep-local' | 'take-source'>>({});
  const [done, setDone] = useState<string | null>(null);
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const { reloadIndex, reloadMeta } = useAppState();
  const { data: runs, reload: reloadRuns } = useApi<{ id: number; source_name: string; status: string; started_at: string; backup_file: string | null }[]>('/api/import/runs');

  return (
    <div className="space-y-4">
      <PageHeader title="Import and Export" note="Imports are previewed, validated and confirmed before anything is written, and run in a single transaction after an automatic backup." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'import', label: 'Import' },
          { id: 'export', label: 'Export' },
        ]}
      />
      {err && <ErrorBox error={err} />}
      {done && <div className="panel border-ok/50 bg-ok/10 p-3 text-sm text-ok">{done}</div>}
      {tab === 'import' && (
        <div className="space-y-4">
          <AdditionsPanel onDone={(msg) => (setDone(msg), reloadIndex(), reloadMeta(), void reloadRuns())} />
          <div className="panel-pad flex flex-wrap items-end gap-3">
            <Field label="World archive (.zip of Markdown files)">
              <input type="file" accept=".zip,application/zip" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPreview(null), setDone(null))} />
            </Field>
            <button
              className="btn-primary"
              disabled={!file || busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  setPreview(await api.upload<PreviewResp>('/api/import/preview', 'archive', file!));
                } catch (x) {
                  setErr((x as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Upload size={14} /> {busy ? 'Reading…' : 'Preview import'}
            </button>
            <p className={`text-xs text-dim w-full ${debug ? '' : 'hidden'}`}>
              Also available from the command line: <code>npm run import -- path/to/archive.zip</code> (add <code>--dry-run</code> to preview only).
            </p>
          </div>
          {preview && <ImportPreview p={preview} resolutions={resolutions} setResolutions={setResolutions} />}
          {preview && (
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    const r = await api.post<{ result: { created: number; updated: number; unchanged: number; conflictsKept: number; conflictsReplaced: number; relationships: number }; backup: { file: string } | null }>(
                      '/api/import/commit',
                      { token: preview.token, resolutions },
                    );
                    setDone(
                      `Import complete: ${r.result.created} created, ${r.result.updated} updated, ${r.result.unchanged} unchanged, ${r.result.conflictsKept} conflicts kept local, ${r.result.conflictsReplaced} replaced from source. ${r.result.relationships} relationships.${r.backup ? ` Backup first: ${r.backup.file}.` : ''}`,
                    );
                    setPreview(null);
                    await reloadIndex();
                    await reloadMeta();
                    void reloadRuns();
                  } catch (x) {
                    setErr(`Import failed and was rolled back: ${(x as Error).message}`);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={14} /> Confirm import
              </button>
              <button className="btn" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          )}
          <div className="panel overflow-x-auto">
            <div className="px-4 py-2 border-b border-line section-title">Import history</div>
            <table className="table">
              <tbody>
                {runs?.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs">{new Date(r.started_at).toLocaleString()}</td>
                    <td>{r.source_name}</td>
                    <td className={r.status === 'failed' ? 'text-danger' : r.status === 'completed' ? 'text-ok' : ''}>{r.status}</td>
                    <td className="text-xs text-dim">{r.backup_file ? `backup: ${r.backup_file}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'export' && <ExportPanel />}
    </div>
  );
}

function ImportPreview({ p, resolutions, setResolutions }: { p: PreviewResp; resolutions: Record<string, 'keep-local' | 'take-source'>; setResolutions: (r: Record<string, 'keep-local' | 'take-source'>) => void }) {
  const debug = useDebug();
  const s = p.summary;
  const [show, setShow] = useState<'actions' | 'skipped' | 'duplicates' | 'broken' | 'files'>('actions');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Files" value={s.fileCount} sub={Object.entries(s.filesByKind).map(([k, v]) => `${k} ${v}`).join(' · ')} />
        <Stat label="Records" value={s.entityCount} sub={Object.entries(s.counts.byRealm).map(([k, v]) => `${k} ${v}`).join(' · ')} />
        <Stat label="Actions" value={Object.values(s.counts.byAction).reduce((a, b) => a + b, 0)} sub={Object.entries(s.counts.byAction).map(([k, v]) => `${k} ${v}`).join(' · ')} />
        <Stat label="Broken references" value={s.brokenRefs.length} sub={`${s.duplicates.length} duplicate IDs resolved · ${s.skipped.length} skipped blocks`} />
      </div>
      {s.warnings.map((w, i) => (
        <div key={i} className="text-sm text-amber-400 flex gap-1">
          <AlertTriangle size={14} /> {w}
        </div>
      ))}
      {s.protectedDocs.map((d) => (
        <div key={d.path} className="text-sm text-amber-400">
          Protected: {d.path}. {d.note}
        </div>
      ))}
      {s.missingFromSource.length > 0 && <div className="text-sm text-dim">{s.missingFromSource.length} imported records are not in this archive. They are kept, never deleted.</div>}
      {s.conflicts.length > 0 && (
        <div className="panel border-amber-500/50 p-3 space-y-1">
          <div className="text-amber-400 text-sm font-medium">Conflicts: you edited these records and the source also changed. Default keeps your version.</div>
          {s.conflicts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {c.name} <span className="text-xs text-dim">{debug ? `${c.id} · ` : ''}{c.note}</span>
              </span>
              <select className="input w-auto" value={resolutions[c.id] ?? 'keep-local'} onChange={(e) => setResolutions({ ...resolutions, [c.id]: e.target.value as 'keep-local' | 'take-source' })}>
                <option value="keep-local">Keep my version</option>
                <option value="take-source">Take source (mine kept in history)</option>
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        {(debug ? (['actions', 'skipped', 'duplicates', 'broken', 'files'] as const) : (['actions'] as const)).map((k) => (
          <button key={k} className={`chip ${show === k ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setShow(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="panel overflow-auto max-h-[50vh]">
        <table className="table">
          <tbody>
            {show === 'actions' &&
              p.entities
                .filter((e) => e.action !== 'unchanged')
                .map((e) => (
                  <tr key={e.id}>
                    {debug && <td className="text-xs">{e.id}</td>}
                    <td>{e.name}</td>
                    <td>
                      <TypeBadge type={e.type} />
                    </td>
                    <td className={e.action === 'conflict' ? 'text-amber-400' : e.action === 'create' ? 'text-ok' : ''}>{e.action}</td>
                  </tr>
                ))}
            {show === 'skipped' &&
              s.skipped.map((k, i) => (
                <tr key={i}>
                  <td className="text-xs">{k.id}</td>
                  <td className="text-xs">
                    {k.file}:{k.line}
                  </td>
                  <td className="text-sm">{k.reason}</td>
                </tr>
              ))}
            {show === 'duplicates' &&
              s.duplicates.map((d) => (
                <tr key={d.id}>
                  <td className="text-xs">{d.id}</td>
                  <td className="text-xs">{d.candidates.join(', ')}</td>
                  <td className="text-sm">
                    kept {d.chosen} ({d.reason})
                  </td>
                </tr>
              ))}
            {show === 'broken' &&
              s.brokenRefs.map((b, i) => (
                <tr key={i}>
                  <td>{b.from}</td>
                  <td className="text-danger">→ {b.ref}</td>
                </tr>
              ))}
            {show === 'files' &&
              Object.entries(s.filesByKind).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {show === 'actions' && p.entities.every((e) => e.action === 'unchanged') && <p className="p-3 text-sm text-dim">Every record is unchanged. Importing again changes nothing.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="panel p-3">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="text-2xl font-display text-gold">{value}</div>
      {sub && <div className="text-[11px] text-dim mt-1">{sub}</div>}
    </div>
  );
}

function ExportPanel() {
  const { data: campaigns } = useApi<{ id: number; title: string }[]>('/api/campaigns');
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const items: [string, string, string][] = [
    ['/api/export/full', 'Full world ZIP', 'Markdown library + complete JSON data + every original source file + map images.'],
    ['/api/export/markdown', 'Markdown library', 'One file per record in the library format. Re-importable into any installation.'],
    ['/api/export/json', 'JSON data export', 'Every table (records, history, campaigns, maps). Imports into an empty installation.'],
    ['/api/export/player', 'Player-safe export', 'Only revealed records, published maps, visible quests and published recaps. No secrets.'],
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map(([href, t, d]) => (
          <a key={href} href={href} className="panel p-4 hover:border-gold/60 block">
            <div className="flex items-center gap-2 text-gold font-display">
              <Download size={15} /> {t}
            </div>
            <p className="text-sm text-dim mt-1">{d}</p>
          </a>
        ))}
      </div>
      <div className="panel-pad">
        <div className="section-title mb-2">Campaign-only export</div>
        <div className="flex flex-wrap gap-2">
          {campaigns?.map((c) => (
            <a key={c.id} className="btn" href={`/api/export/campaign/${c.id}`}>
              <Download size={13} /> {c.title}
            </a>
          ))}
          {!campaigns?.length && <span className="text-sm text-dim">No campaigns.</span>}
        </div>
      </div>
      <div className="panel-pad">
        <div className="section-title mb-2">Load a JSON export</div>
        <p className="text-xs text-dim mb-2">A full JSON export loads into an empty installation only. A campaign export is added as a new campaign.</p>
        {jsonErr && <ErrorBox error={jsonErr} />}
        <input
          type="file"
          accept="application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              await api.upload('/api/import/json', 'file', f);
              location.reload();
            } catch (x) {
              setJsonErr((x as Error).message);
            }
          }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Canon review
interface Review {
  modified: { id: string; name: string; type: string; updated_at: string }[];
  proposed: { id: string; name: string; type: string; origin: string }[];
  conflicts: { id: string; name: string }[];
  missingSources: { id: string; name: string; origin: string }[];
  duplicates: { records: { id: string; name: string; type: string }[]; acknowledgedDualRole: boolean }[];
  broken: { references: { from: string; from_name: string; ref: string; where: string }[] };
  proposals: { id: number; kind: string; entity_id: string | null; entity_name: string | null; title: string; reason: string; status: string; payload: Record<string, unknown>; created_at: string }[];
  importDuplicates: { id: string; candidates: string[]; chosen: string; reason: string }[];
  importWarnings: string[];
}

export function ReviewPage() {
  const debug = useDebug();
  const { data, reload, error } = useApi<Review>('/api/review');
  const [tab, setTab] = useState<'proposals' | 'modified' | 'proposed' | 'duplicates' | 'conflicts' | 'sources'>('proposals');
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const { toast, node } = useToast();
  const { reloadIndex } = useAppState();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const decide = async (id: number, decision: string) => {
    const note = decision === 'approved' ? '' : prompt(decision === 'revise' ? 'What needs revising?' : 'Reason for rejecting (optional)') ?? '';
    await api.post(`/api/proposals/${id}`, { decision, note });
    toast(`Proposal ${decision}`);
    void reload();
    void reloadIndex();
  };
  return (
    <div className="space-y-4">
      {node}
      <PageHeader title="Canon Review" subtitle="Nothing becomes canon without your approval here." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'proposals', label: `Awaiting approval (${data.proposals.length})` },
          { id: 'modified', label: `Changed canon (${data.modified.length})` },
          { id: 'proposed', label: `Proposed records (${data.proposed.length})` },
          { id: 'duplicates', label: `Possible duplicates (${data.duplicates.length})` },
          { id: 'conflicts', label: `Conflicts (${data.conflicts.length})` },
          ...(debug ? [{ id: 'sources' as const, label: `Missing sources (${data.missingSources.length})` }] : []),
        ]}
      />
      {tab === 'proposals' && (
        <div className="space-y-2">
          {data.proposals.map((p) => (
            <div key={p.id} className="panel-pad flex flex-wrap gap-3 items-start">
              <div className="flex-1 min-w-60">
                <div className="text-xs text-dim">
                  {p.kind === 'new_entity' ? 'New record' : p.kind === 'campaign_promotion' ? 'From a campaign' : p.kind} · {new Date(p.created_at).toLocaleString()} {p.status === 'revise' && '· needs revision'}
                </div>
                <div className="font-medium">{p.title}</div>
                {p.entity_id && <EntityLink id={p.entity_id}>{p.entity_name ?? p.entity_id}</EntityLink>}
                {p.kind === 'campaign_promotion' && (
                  <div className="text-sm mt-1">
                    From campaign <strong>{String(p.payload.campaign)}</strong>: set <em>{String(p.payload.field)}</em> to <strong>{String(p.payload.value)}</strong> in the world record.
                  </div>
                )}
                {p.reason && <div className="text-xs text-dim mt-1">Reason: {p.reason}</div>}
              </div>
              <div className="flex gap-1">
                <button className="btn-primary" onClick={() => decide(p.id, 'approved')}>
                  <Check size={14} /> Approve
                </button>
                <button className="btn" onClick={() => decide(p.id, 'revise')}>
                  <Pencil size={14} /> Revise
                </button>
                <button className="btn-danger" onClick={() => decide(p.id, 'rejected')}>
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
          {!data.proposals.length && <p className="text-sm text-dim">Nothing awaiting approval.</p>}
        </div>
      )}
      {tab === 'modified' && (
        <div className="space-y-2">
          <p className="text-sm text-dim">Canon records that were edited. Approve the edit, or revert to the approved text.</p>
          {data.modified.map((m) => (
            <div key={m.id} className="panel-pad">
              <div className="flex flex-wrap items-center gap-2">
                <EntityLink id={m.id}>{m.name}</EntityLink>
                <span className="text-xs text-dim">
                  {debug ? `${m.id} · ` : ''}edited {new Date(m.updated_at).toLocaleString()}
                </span>
                <div className="ml-auto flex gap-1">
                  <button className="btn" onClick={() => setDiffFor(diffFor === m.id ? null : m.id)}>
                    Show changes
                  </button>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      await api.post(`/api/review/${m.id}`, { decision: 'approve', note: prompt('Approval note (optional)') ?? '' });
                      void reload();
                    }}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (!confirm('Revert to the last reviewed text? The edited version stays in history.')) return;
                      await api.post(`/api/review/${m.id}`, { decision: 'revert' });
                      void reload();
                    }}
                  >
                    <RotateCcw size={14} /> Revert
                  </button>
                </div>
              </div>
              {diffFor === m.id && <ModifiedDiff id={m.id} />}
            </div>
          ))}
          {!data.modified.length && <p className="text-sm text-dim">No canon records have unreviewed edits.</p>}
        </div>
      )}
      {tab === 'proposed' && <SimpleList rows={data.proposed.map((r) => ({ id: r.id, name: r.name, extra: r.origin }))} empty="No PROPOSED records." />}
      {tab === 'duplicates' && (
        <div className="space-y-2">
          <p className="text-sm text-dim">Records that share a name. Many are deliberate, such as a city and the faction of the same name; link them with “Same being as” instead of merging.</p>
          {data.duplicates.map((d, i) => (
            <div key={i} className="panel-pad text-sm flex flex-wrap gap-3">
              {d.records.map((r) => (
                <span key={r.id}>
                  <EntityLink id={r.id}>{r.name}</EntityLink> {debug && <span className="text-xs text-dim">{r.id}</span>} <TypeBadge type={r.type} />
                </span>
              ))}
              {d.acknowledgedDualRole && <span className="chip border-ok/50 text-ok">linked dual role</span>}
            </div>
          ))}
          {debug && data.importDuplicates.length > 0 && (
            <details className="panel p-3 text-sm">
              <summary className="cursor-pointer">Duplicate IDs resolved during the last import ({data.importDuplicates.length})</summary>
              {data.importDuplicates.map((d) => (
                <div key={d.id} className="text-xs mt-1">
                  {d.id}: kept {d.chosen} ({d.reason})
                </div>
              ))}
            </details>
          )}
        </div>
      )}
      {tab === 'conflicts' && (
        <div className="space-y-2">
          <SimpleList rows={data.conflicts.map((r) => ({ id: r.id, name: r.name }))} empty="No records are marked CONFLICT." />
          <p className="text-sm">
            See also the <EntityLink id="DEC-903">Canon Conflict Register</EntityLink> and <EntityLink id="DEC-904">Decisions Required</EntityLink>.
            {debug && (
              <>
                {' '}
                <Link to="/broken" className="text-arcane">
                  Broken references
                </Link>{' '}
                ({data.broken.references.length}).
              </>
            )}
          </p>
        </div>
      )}
      {tab === 'sources' && <SimpleList rows={data.missingSources.map((r) => ({ id: r.id, name: r.name, extra: r.origin }))} empty="Every record has a source reference." />}
    </div>
  );
}

function ModifiedDiff({ id }: { id: string }) {
  const { data } = useApi<{ entity: Entity; baseline: { revisionId: number } | null }>(`/api/entities/${id}`);
  const { data: rev } = useApi<{ snapshot: Entity }>(data?.baseline ? `/api/revisions/${data.baseline.revisionId}` : null);
  if (!data || !rev) return <Loading />;
  const fieldsChanged = JSON.stringify(rev.snapshot.fields) !== JSON.stringify(data.entity.fields) || rev.snapshot.name !== data.entity.name || rev.snapshot.canon_status !== data.entity.canon_status;
  return (
    <div className="mt-2 space-y-2">
      {fieldsChanged && (
        <div className="text-xs">
          Metadata changed: name “{rev.snapshot.name}” → “{data.entity.name}”, status {rev.snapshot.canon_status} → {data.entity.canon_status}, fields {JSON.stringify(rev.snapshot.fields)} → {JSON.stringify(data.entity.fields)}
        </div>
      )}
      <DiffView before={rev.snapshot.body} after={data.entity.body} />
    </div>
  );
}

function SimpleList({ rows, empty }: { rows: { id: string; name: string; extra?: string }[]; empty: string }) {
  const debug = useDebug();
  if (!rows.length) return <p className="text-sm text-dim">{empty}</p>;
  return (
    <div className="panel p-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-1 text-sm">
      {rows.map((r) => (
        <div key={r.id}>
          <EntityLink id={r.id}>{r.name}</EntityLink> {debug && <span className="text-xs text-dim">{r.id} {r.extra}</span>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Broken references
export function BrokenPage() {
  const { data } = useApi<{ references: { from: string; from_name: string; ref: string; where: string }[]; danglingRelationships: unknown[] }>('/api/broken');
  return (
    <div className="space-y-4">
      <PageHeader title="Broken References" note="@[Name] mentions, `Name [ID]` references and relationships that point at a record that does not exist." />
      {!data ? (
        <Loading />
      ) : !data.references.length && !data.danglingRelationships.length ? (
        <div className="panel p-6 text-ok flex items-center gap-2">
          <Check size={16} /> No broken references. Every cross-reference resolves.
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>Missing ID</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {data.references.map((r, i) => (
                <tr key={i}>
                  <td>
                    <EntityLink id={r.from}>{r.from_name}</EntityLink>
                  </td>
                  <td className="text-danger">{r.ref}</td>
                  <td className="text-xs text-dim">{r.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.danglingRelationships.length > 0 && <p className="p-3 text-sm text-danger">{data.danglingRelationships.length} relationships point to deleted records.</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ History
export function HistoryPage() {
  const [all, setAll] = useState(false);
  const { data } = useApi<{ id: number; entity_id: string; name: string | null; version: number; change_type: string; reason: string; created_at: string }[]>(`/api/history?limit=300${all ? '&all=1' : ''}`);
  return (
    <div className="space-y-4">
      <PageHeader title="Change History" subtitle="Every change to every record: what, when and why." />
      <label className="text-sm flex items-center gap-1">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include import events
      </label>
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Record</th>
              <th>Change</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td>
                  <EntityLink id={r.entity_id}>{r.name ?? r.entity_id}</EntityLink> <span className="text-xs text-dim">v{r.version}</span>
                </td>
                <td>{r.change_type}</td>
                <td className="text-sm">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <p className="p-4 text-sm text-dim">No edits yet.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Backups
export function BackupsPage() {
  const { data, reload } = useApi<{ file: string; size: number; created_at: string; reason: string }[]>('/api/backups');
  const [err, setErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { reloadIndex, reloadMeta } = useAppState();
  const afterRestore = async (r: { safetyBackup: string }) => {
    setMsg(`Restored. The state before restoring was saved as ${r.safetyBackup}.`);
    await reloadIndex();
    await reloadMeta();
    void reload();
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Backups"
        subtitle="A backup is made automatically every day, before every import and before every restore."
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              try {
                await api.post('/api/backups', { reason: 'manual' });
                void reload();
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            <Archive size={14} /> Back up now
          </button>
        }
      />
      {err && <ErrorBox error={err} />}
      {msg && <div className="panel border-ok/50 bg-ok/10 p-3 text-sm text-ok">{msg}</div>}
      <div className="panel-pad">
        <Field label="Restore from a backup file (.wkbackup.zip)">
          <input
            type="file"
            accept=".zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !confirm('Replace ALL current data with this backup? A safety backup of the current state is made first.')) return;
              try {
                await afterRestore(await api.upload('/api/backups/restore-upload', 'backup', f));
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          />
        </Field>
      </div>
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Backup</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.file}>
                <td>
                  <div className="text-sm">{b.file}</div>
                  <div className="text-xs text-dim">{new Date(b.created_at).toLocaleString()}</div>
                </td>
                <td className="text-xs">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                <td className="text-right whitespace-nowrap">
                  <a className="btn" href={`/api/backups/${encodeURIComponent(b.file)}`}>
                    <Download size={13} />
                  </a>{' '}
                  <button className="btn" onClick={() => setRestoring(b.file)}>
                    <RotateCcw size={13} /> Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <p className="p-4 text-sm text-dim">No backups yet.</p>}
      </div>
      {restoring && (
        <Confirm
          title="Restore backup?"
          danger
          confirmLabel="Restore"
          body={`All current data will be replaced by ${restoring}. A safety backup of the current state is made first, so this can be undone.`}
          onCancel={() => setRestoring(null)}
          onConfirm={async () => {
            const f = restoring;
            setRestoring(null);
            try {
              await afterRestore(await api.post(`/api/backups/${encodeURIComponent(f)}/restore`));
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Settings
export function SettingsPage() {
  const { data, reload } = useApi<Record<string, string>>('/api/settings');
  const { data: meta } = useApi<{ schemaVersion: number; dataDir: string; entities: number }>('/api/meta');
  const { theme, setTheme, reloadMeta } = useAppState();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm({ app_name: data.app_name ?? 'The Worldkeeper', world_date: data.world_date ?? '300 AB / Year 31 Unbound' });
  }, [data]);
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Settings" />
      <div className="panel-pad space-y-3">
        <Field label="Application name (working title)">
          <input className="input" value={form.app_name ?? ''} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
        </Field>
        <Field label="Default world date" hint="Campaigns keep their own current date.">
          <input className="input" value={form.world_date ?? ''} onChange={(e) => setForm({ ...form, world_date: e.target.value })} />
        </Field>
        <Field label="Theme">
          <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
          </select>
        </Field>
        <button
          className="btn-primary"
          onClick={async () => {
            await api.put('/api/settings', form);
            void reload();
            void reloadMeta();
          }}
        >
          Save settings
        </button>
      </div>
      <DebugToggle />
      <Dev>
      <div className="panel-pad text-sm space-y-1">
        <div className="section-title mb-1">Installation</div>
        <div>Data folder: <code>{meta?.dataDir}</code></div>
        <div>Database schema version: {meta?.schemaVersion}</div>
        <div>Records: {meta?.entities}</div>
        <div className="text-dim text-xs pt-2">
          Keyboard: Ctrl+K or / search · Alt+D DM screen · Ctrl+\ collapse sidebar. Player view: open <code>/player</code>, or run <code>npm run start:player</code> for a separate player-only server.
        </div>
      </div>
      </Dev>
    </div>
  );
}

function DebugToggle() {
  const { debug, debugForced, setDebug } = useAppState();
  return (
    <div className="panel-pad space-y-2">
      <div className="section-title">Technical details</div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={debug} disabled={debugForced} onChange={(e) => void setDebug(e.target.checked)} />
        <span>
          Show technical details
          <span className="block text-xs text-dim">
            Record IDs, source files and citations, tags, import reports and notes on how the app works. Leave off for normal play.
            {debugForced && ' Turned on by the WORLDKEEPER_DEBUG setting on this computer.'}
          </span>
        </span>
      </label>
    </div>
  );
}

/** Bring in the Worldkeeper additions: lore written for this world on top of the archive. */
function AdditionsPanel({ onDone }: { onDone: (msg: string) => void }) {
  const { data } = useApi<{ available: boolean; records: number }>('/api/additions');
  const [busy, setBusy] = useState(false);
  if (!data?.available) return null;
  return (
    <div className="panel-pad flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[16rem]">
        <div className="font-display text-gold">Worldkeeper additions</div>
        <p className="text-sm text-dim">
          New lore written for this world: {data.records} records (people, places, creatures), their links, the handbook's rumours, and the mysteries with their
          secrets and clues. Your archive records are never changed, and anything you've edited is kept. Safe to run again after an update.
        </p>
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.post<{ records: number; links: { added: number }; rumours: { total: number }; mysteries: { secrets: number } }>('/api/additions/apply', {});
            onDone(`Additions applied: ${r.records} records, ${r.links.added} new links, ${r.rumours.total} rumours and ${r.mysteries.secrets} secrets. A backup was taken first.`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Applying…' : 'Apply additions'}
      </button>
    </div>
  );
}
