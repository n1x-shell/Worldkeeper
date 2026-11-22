import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Check, Download, RotateCcw, Upload, AlertTriangle, X, Pencil } from 'lucide-react';
import { packsChanged, usePacks } from '../lib/packs';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Badge, Card, Check as CheckBox, DataTable, Empty, EntityLink, ErrorBox, Field, KeyValue, Loading, PageHeader, Segmented, Tabs, Toggle, TypeBadge, ask, askText, useToast, type Tone } from '../components/ui';
import { DiffView } from './EntityPage';
import { Dev, useDebug } from '../components/Dev';
import type { Entity } from '../lib/types';
import { RulesPacksPanel } from './RulesPacks';
import { ModulesPanel } from './ModulesPanel';

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
      {done && <Card className="border-ok/50 bg-ok/10 text-sm text-ok">{done}</Card>}
      {tab === 'import' && (
        <div className="space-y-4">
          <AdditionsPanel onDone={(msg) => (setDone(msg), reloadIndex(), reloadMeta(), void reloadRuns())} />
          <Card className="flex flex-wrap items-end gap-3">
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
          </Card>
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
                    const r = await api.post<{
                      result: { created: number; updated: number; unchanged: number; conflictsKept: number; conflictsReplaced: number; relationships: number };
                      backup: { file: string } | null;
                    }>('/api/import/commit', { token: preview.token, resolutions });
                    setDone(
                      `Import complete: ${r.result.created} created, ${r.result.updated} updated, ${r.result.unchanged} unchanged, ${r.result.conflictsKept} conflicts kept local, ${r.result.conflictsReplaced} replaced from source. ${r.result.relationships} relationships.${r.backup ? ` Backup first: ${r.backup.file}.` : ''}`,
                    );
                    setPreview(null);
                    await reloadIndex();
                    await reloadMeta();
                    // A setting's archive installs its pack (its realms, types and tools).
                    await packsChanged();
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
          <Card title="Import history" flush>
            {!runs ? (
              <Loading inline />
            ) : (
              <DataTable
                rows={runs}
                rowKey={(r) => r.id}
                empty="No imports yet."
                columns={[
                  { key: 'started_at', label: 'When', sortable: true, className: 'text-xs whitespace-nowrap', render: (r) => new Date(r.started_at).toLocaleString() },
                  { key: 'source_name', label: 'Source', sortable: true },
                  {
                    key: 'status',
                    label: 'Status',
                    sortable: true,
                    render: (r) => <span className={r.status === 'failed' ? 'text-danger' : r.status === 'completed' ? 'text-ok' : ''}>{r.status}</span>,
                  },
                  { key: 'backup_file', label: 'Backup', className: 'text-xs text-dim', render: (r) => r.backup_file ?? '' },
                ]}
              />
            )}
          </Card>
        </div>
      )}
      {tab === 'export' && <ExportPanel />}
    </div>
  );
}

function ImportPreview({
  p,
  resolutions,
  setResolutions,
}: {
  p: PreviewResp;
  resolutions: Record<string, 'keep-local' | 'take-source'>;
  setResolutions: (r: Record<string, 'keep-local' | 'take-source'>) => void;
}) {
  const debug = useDebug();
  const s = p.summary;
  const [show, setShow] = useState<'actions' | 'skipped' | 'duplicates' | 'broken' | 'files'>('actions');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Files"
          value={s.fileCount}
          sub={Object.entries(s.filesByKind)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        />
        <Stat
          label="Records"
          value={s.entityCount}
          sub={Object.entries(s.counts.byRealm)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        />
        <Stat
          label="Actions"
          value={Object.values(s.counts.byAction).reduce((a, b) => a + b, 0)}
          sub={Object.entries(s.counts.byAction)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        />
        <Stat label="Broken references" value={s.brokenRefs.length} sub={`${s.duplicates.length} duplicate IDs resolved · ${s.skipped.length} skipped blocks`} />
      </div>
      {s.warnings.map((w, i) => (
        <div key={i} className="text-sm text-warn flex gap-1">
          <AlertTriangle size={14} /> {w}
        </div>
      ))}
      {s.protectedDocs.map((d) => (
        <div key={d.path} className="text-sm text-warn">
          Protected: {d.path}. {d.note}
        </div>
      ))}
      {s.missingFromSource.length > 0 && <div className="text-sm text-dim">{s.missingFromSource.length} imported records are not in this archive. They are kept, never deleted.</div>}
      {s.conflicts.length > 0 && (
        <Card className="border-warn/50 space-y-1">
          <div className="text-warn text-sm font-medium">Conflicts: you edited these records and the source also changed. Default keeps your version.</div>
          {s.conflicts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {c.name}{' '}
                <span className="text-xs text-dim">
                  {debug ? `${c.id} · ` : ''}
                  {c.note}
                </span>
              </span>
              <select className="input w-auto" value={resolutions[c.id] ?? 'keep-local'} onChange={(e) => setResolutions({ ...resolutions, [c.id]: e.target.value as 'keep-local' | 'take-source' })}>
                <option value="keep-local">Keep my version</option>
                <option value="take-source">Take source (mine kept in history)</option>
              </select>
            </div>
          ))}
        </Card>
      )}
      <Segmented
        size="sm"
        label="Show"
        value={show}
        onChange={setShow}
        options={(debug ? (['actions', 'skipped', 'duplicates', 'broken', 'files'] as const) : (['actions'] as const)).map((k) => ({ value: k, label: k }))}
      />
      <Card flush>
        {show === 'actions' && (
          <DataTable
            maxHeight="50vh"
            rows={p.entities.filter((e) => e.action !== 'unchanged')}
            rowKey={(e) => e.id}
            empty="Every record is unchanged. Importing again changes nothing."
            columns={[
              ...(debug ? [{ key: 'id', label: 'ID', sortable: true, className: 'text-xs' }] : []),
              { key: 'name', label: 'Name', sortable: true },
              { key: 'type', label: 'Type', sortable: true, render: (e) => <TypeBadge type={e.type} /> },
              { key: 'action', label: 'Action', sortable: true, render: (e) => <span className={e.action === 'conflict' ? 'text-warn' : e.action === 'create' ? 'text-ok' : ''}>{e.action}</span> },
            ]}
          />
        )}
        {show === 'skipped' && (
          <DataTable
            maxHeight="50vh"
            rows={s.skipped}
            rowKey={(_, i) => i}
            columns={[
              { key: 'id', label: 'ID', sortable: true, className: 'text-xs' },
              { key: 'file', label: 'Where', sortable: true, className: 'text-xs', render: (k) => `${k.file}:${k.line}` },
              { key: 'reason', label: 'Reason', className: 'text-sm' },
            ]}
          />
        )}
        {show === 'duplicates' && (
          <DataTable
            maxHeight="50vh"
            rows={s.duplicates}
            rowKey={(d) => d.id}
            columns={[
              { key: 'id', label: 'ID', sortable: true, className: 'text-xs' },
              { key: 'candidates', label: 'Candidates', className: 'text-xs', render: (d) => d.candidates.join(', ') },
              { key: 'chosen', label: 'Kept', className: 'text-sm', render: (d) => `kept ${d.chosen} (${d.reason})` },
            ]}
          />
        )}
        {show === 'broken' && (
          <DataTable
            maxHeight="50vh"
            rows={s.brokenRefs}
            rowKey={(_, i) => i}
            columns={[
              { key: 'from', label: 'From', sortable: true },
              { key: 'ref', label: 'Missing', sortable: true, className: 'text-danger', render: (b) => `→ ${b.ref}` },
            ]}
          />
        )}
        {show === 'files' && (
          <DataTable
            maxHeight="50vh"
            rows={Object.entries(s.filesByKind).map(([kind, count]) => ({ kind, count }))}
            rowKey={(f) => f.kind}
            columns={[
              { key: 'kind', label: 'Kind', sortable: true },
              { key: 'count', label: 'Files', sortable: true, num: true },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="text-2xl font-display text-gold num">{value}</div>
      {sub && <div className="text-[11px] text-dim mt-1">{sub}</div>}
    </Card>
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
      <Card title="Campaign-only export">
        <div className="flex flex-wrap gap-2">
          {campaigns?.map((c) => (
            <a key={c.id} className="btn" href={`/api/export/campaign/${c.id}`}>
              <Download size={13} /> {c.title}
            </a>
          ))}
          {campaigns && !campaigns.length && <Empty compact title="No campaigns." />}
        </div>
      </Card>
      <Card title="Load a JSON export">
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
      </Card>
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
  const { roles } = usePacks();
  const { data, reload, error } = useApi<Review>('/api/review');
  const [tab, setTab] = useState<'proposals' | 'modified' | 'proposed' | 'duplicates' | 'conflicts' | 'sources'>('proposals');
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const { toast, node } = useToast();
  const { reloadIndex } = useAppState();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const decide = async (id: number, decision: string) => {
    const note = decision === 'approved' ? '' : ((await askText({ title: decision === 'revise' ? 'What needs revising?' : 'Reason for rejecting (optional)', multiline: true })) ?? '');
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
            <Card key={p.id} className="flex flex-wrap gap-3 items-start">
              <div className="flex-1 min-w-60">
                <div className="text-xs text-dim">
                  {p.kind === 'new_entity' ? 'New record' : p.kind === 'campaign_promotion' ? 'From a campaign' : p.kind} · {new Date(p.created_at).toLocaleString()}{' '}
                  {p.status === 'revise' && '· needs revision'}
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
            </Card>
          ))}
          {!data.proposals.length && <Empty title="Nothing awaiting approval." />}
        </div>
      )}
      {tab === 'modified' && (
        <div className="space-y-2">
          <p className="text-sm text-dim">Canon records that were edited. Approve the edit, or revert to the approved text.</p>
          {data.modified.map((m) => (
            <Card key={m.id}>
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
                      await api.post(`/api/review/${m.id}`, { decision: 'approve', note: (await askText({ title: 'Approval note (optional)', multiline: true })) ?? '' });
                      void reload();
                    }}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (!(await ask({ body: 'Revert to the last reviewed text? The edited version stays in history.', danger: true, confirmLabel: 'Revert' }))) return;
                      await api.post(`/api/review/${m.id}`, { decision: 'revert' });
                      void reload();
                    }}
                  >
                    <RotateCcw size={14} /> Revert
                  </button>
                </div>
              </div>
              {diffFor === m.id && <ModifiedDiff id={m.id} />}
            </Card>
          ))}
          {!data.modified.length && <Empty title="No canon records have unreviewed edits." />}
        </div>
      )}
      {tab === 'proposed' && <SimpleList rows={data.proposed.map((r) => ({ id: r.id, name: r.name, extra: r.origin }))} empty="No PROPOSED records." />}
      {tab === 'duplicates' && (
        <div className="space-y-2">
          <p className="text-sm text-dim">Records that share a name. Many are deliberate, such as a city and the faction of the same name; link them with “Same being as” instead of merging.</p>
          {data.duplicates.map((d, i) => (
            <Card key={i} className="text-sm flex flex-wrap gap-3">
              {d.records.map((r) => (
                <span key={r.id}>
                  <EntityLink id={r.id}>{r.name}</EntityLink> {debug && <span className="text-xs text-dim">{r.id}</span>} <TypeBadge type={r.type} />
                </span>
              ))}
              {d.acknowledgedDualRole && <Badge tone="ok">linked dual role</Badge>}
            </Card>
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
            {roles['register.conflicts'] && (
              <>
                See also <EntityLink id={roles['register.conflicts']} />
                {roles['register.decisions-required'] && (
                  <>
                    {' '}
                    and <EntityLink id={roles['register.decisions-required']} />
                  </>
                )}
                .
              </>
            )}
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
          Metadata changed: name “{rev.snapshot.name}” → “{data.entity.name}”, status {rev.snapshot.canon_status} → {data.entity.canon_status}, fields {JSON.stringify(rev.snapshot.fields)} →{' '}
          {JSON.stringify(data.entity.fields)}
        </div>
      )}
      <DiffView before={rev.snapshot.body} after={data.entity.body} />
    </div>
  );
}

function SimpleList({ rows, empty }: { rows: { id: string; name: string; extra?: string }[]; empty: string }) {
  const debug = useDebug();
  if (!rows.length) return <Empty title={empty} />;
  return (
    <Card className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1 text-sm">
      {rows.map((r) => (
        <div key={r.id}>
          <EntityLink id={r.id}>{r.name}</EntityLink>{' '}
          {debug && (
            <span className="text-xs text-dim">
              {r.id} {r.extra}
            </span>
          )}
        </div>
      ))}
    </Card>
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
        <Empty icon={<Check size={20} className="text-ok" />} title="No broken references.">
          Every cross-reference resolves.
        </Empty>
      ) : (
        <Card flush>
          <DataTable
            rows={data.references}
            rowKey={(_, i) => i}
            columns={[
              { key: 'from', label: 'From', sortValue: (r) => r.from_name, render: (r) => <EntityLink id={r.from}>{r.from_name}</EntityLink> },
              { key: 'ref', label: 'Missing ID', sortable: true, className: 'text-danger' },
              { key: 'where', label: 'Where', sortable: true, className: 'text-xs text-dim' },
            ]}
          />
          {data.danglingRelationships.length > 0 && <p className="p-3 text-sm text-danger">{data.danglingRelationships.length} relationships point to deleted records.</p>}
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Consistency
interface Problem {
  check: string;
  severity: 'error' | 'warning';
  message: string;
  ids: string[];
}

/** Things in the library that don't agree with each other. A report only: fix each by hand from its links. */
export function ConsistencyPage() {
  const { data, reload, loading } = useApi<{ checked: number; problems: Problem[] }>('/api/library/consistency');
  const groups = new Map<string, Problem[]>();
  for (const p of data?.problems ?? []) groups.set(p.check, [...(groups.get(p.check) ?? []), p]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Consistency Check"
        subtitle="Things in the library that don't agree with each other."
        note="A report only: nothing is changed. Missing records, broken links, people with two homes, duplicate names, campaign tools pointing at records that are gone, and revealed pages players would see as empty."
        actions={
          <button className="btn" onClick={reload} disabled={loading}>
            Check again
          </button>
        }
      />
      {!data ? (
        <Loading />
      ) : !data.problems.length ? (
        <Empty icon={<Check size={20} className="text-ok" />} title={`All ${data.checked} records agree with each other.`} />
      ) : (
        <>
          <p className="text-sm text-dim">
            {data.checked} records checked. {data.problems.filter((p) => p.severity === 'error').length} problems and {data.problems.filter((p) => p.severity === 'warning').length} things to look at.
          </p>
          {[...groups.entries()].map(([check, list]) => (
            <details key={check} className="panel" open={list.length <= 8}>
              <summary className="px-4 py-2 cursor-pointer flex items-center gap-2">
                <span className={list[0].severity === 'error' ? 'text-danger' : 'text-gold'}>{check}</span>
                <span className="text-xs text-dim">{list.length}</span>
              </summary>
              <ul className="divide-y divide-line text-sm">
                {list.map((p, i) => (
                  <li key={i} className="px-4 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="flex-1 min-w-[16rem]">{p.message}</span>
                    {p.ids.map((id) => (
                      <EntityLink key={id} id={id} className="text-xs" />
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Open questions
type QuestionStatus = 'kept' | 'filled' | 'todo';
interface OpenQuestion {
  id: string;
  name: string;
  type: string;
  section: string;
  text: string;
  status: QuestionStatus;
  by: string[];
  note?: string;
}
const QUESTION_LABEL: Record<QuestionStatus, string> = { todo: 'Still to do', filled: 'Filled by an addition', kept: 'Open on purpose' };
const QUESTION_TONE: Record<QuestionStatus, Tone> = { todo: 'gold', filled: 'ok', kept: 'arcane' };

export function OpenQuestionsPage() {
  const { data } = useApi<{ questions: OpenQuestion[]; counts: Record<QuestionStatus, number> }>('/api/library/open-questions');
  const [tab, setTab] = useState<QuestionStatus | 'all'>('todo');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = (data?.questions ?? []).filter(
    (x) => (tab === 'all' || x.status === tab) && (!needle || `${x.name} ${x.section} ${x.text} ${x.note ?? ''}`.toLowerCase().includes(needle)),
  );
  const groups = new Map<string, OpenQuestion[]>();
  for (const x of list) groups.set(x.type, [...(groups.get(x.type) ?? []), x]);
  const total = data ? data.questions.length : 0;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Open Questions"
        subtitle="Everything the library leaves undefined, and where each one stands."
        note="A report only: nothing is changed. Some questions are open on purpose (the world's mysteries). Some have been answered by Worldkeeper's additions, linked here. The rest are still to do. The Undefined Lore Register lists the subjects the archive left open deliberately."
      />
      {!data ? (
        <Loading />
      ) : (
        <>
          <p className="text-sm text-dim">
            {total} open questions: {data.counts.todo} still to do, {data.counts.filled} filled by an addition, {data.counts.kept} open on purpose.
          </p>
          <Tabs
            tabs={[
              { id: 'todo', label: `Still to do (${data.counts.todo})` },
              { id: 'filled', label: `Filled (${data.counts.filled})` },
              { id: 'kept', label: `Open on purpose (${data.counts.kept})` },
              { id: 'all', label: `All (${total})` },
            ]}
            value={tab}
            onChange={setTab}
          />
          <input className="input w-full max-w-md" placeholder="Search the questions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the questions" />
          {!list.length ? (
            <Empty title="Nothing here." />
          ) : (
            [...groups.entries()].map(([type, items]) => (
              <details key={type} className="panel" open={items.length <= 12}>
                <summary className="px-4 py-2 cursor-pointer flex items-center gap-2">
                  <TypeBadge type={type} />
                  <span className="text-xs text-dim">{items.length}</span>
                </summary>
                <ul className="divide-y divide-line text-sm">
                  {items.map((x, i) => (
                    <li key={`${x.id}-${i}`} className="px-4 py-2 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <EntityLink id={x.id} className="font-medium" />
                        <span className="text-xs text-dim">{x.section}</span>
                        <Badge tone={QUESTION_TONE[x.status]}>{QUESTION_LABEL[x.status]}</Badge>
                      </div>
                      {x.text && <p className="text-dim">{x.text}</p>}
                      {(x.note || x.by.length > 0) && (
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          {x.note && <span>{x.note}</span>}
                          {x.by.length > 0 && (
                            <span className="text-xs text-dim">
                              {x.status === 'todo' ? 'Partly filled by' : 'Filled by'}{' '}
                              {x.by.map((id, j) => (
                                <span key={id}>
                                  {j > 0 && ', '}
                                  <EntityLink id={id} />
                                </span>
                              ))}
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ History
export function HistoryPage() {
  const [all, setAll] = useState(false);
  const { data } = useApi<{ id: number; entity_id: string; name: string | null; version: number; change_type: string; reason: string; created_at: string }[]>(
    `/api/history?limit=300${all ? '&all=1' : ''}`,
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Change History" subtitle="Every change to every record: what, when and why." />
      <CheckBox checked={all} onChange={setAll}>
        Include import events
      </CheckBox>
      <Card flush>
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data}
            rowKey={(r) => r.id}
            empty="No edits yet."
            columns={[
              { key: 'created_at', label: 'When', sortable: true, className: 'text-xs whitespace-nowrap', render: (r) => new Date(r.created_at).toLocaleString() },
              {
                key: 'name',
                label: 'Record',
                sortValue: (r) => r.name ?? r.entity_id,
                render: (r) => (
                  <>
                    <EntityLink id={r.entity_id}>{r.name ?? r.entity_id}</EntityLink> <span className="text-xs text-dim num">v{r.version}</span>
                  </>
                ),
              },
              { key: 'change_type', label: 'Change', sortable: true },
              { key: 'reason', label: 'Reason', className: 'text-sm' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Backups
export function BackupsPage() {
  const { data, reload } = useApi<{ file: string; size: number; created_at: string; reason: string }[]>('/api/backups');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { reloadIndex, reloadMeta } = useAppState();
  const afterRestore = async (r: { safetyBackup: string }) => {
    setMsg(`Restored. The state before restoring was saved as ${r.safetyBackup}.`);
    await reloadIndex();
    await reloadMeta();
    void reload();
  };
  const restore = async (f: string) => {
    if (
      !(await ask({
        title: 'Restore backup?',
        body: `All current data will be replaced by ${f}. A safety backup of the current state is made first, so this can be undone.`,
        danger: true,
        confirmLabel: 'Restore',
      }))
    )
      return;
    try {
      await afterRestore(await api.post(`/api/backups/${encodeURIComponent(f)}/restore`));
    } catch (x) {
      setErr((x as Error).message);
    }
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
      {msg && <Card className="border-ok/50 bg-ok/10 text-sm text-ok">{msg}</Card>}
      <Card>
        <Field label="Restore from a backup file (.wkbackup.zip)">
          <input
            type="file"
            accept=".zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f || !(await ask({ title: 'Restore backup?', body: 'Replace ALL current data with this backup? A safety backup of the current state is made first.', danger: true, confirmLabel: 'Replace' }))) return;
              try {
                await afterRestore(await api.upload('/api/backups/restore-upload', 'backup', f));
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          />
        </Field>
      </Card>
      <Card flush>
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data}
            rowKey={(b) => b.file}
            empty="No backups yet."
            columns={[
              {
                key: 'file',
                label: 'Backup',
                sortValue: (b) => b.created_at,
                render: (b) => (
                  <>
                    <div className="text-sm">{b.file}</div>
                    <div className="text-xs text-dim">{new Date(b.created_at).toLocaleString()}</div>
                  </>
                ),
              },
              { key: 'size', label: 'Size', sortable: true, num: true, className: 'text-xs', render: (b) => `${(b.size / 1024 / 1024).toFixed(2)} MB` },
              {
                key: 'actions',
                label: <span className="sr-only">Actions</span>,
                align: 'right',
                className: 'whitespace-nowrap',
                render: (b) => (
                  <>
                    <a className="btn" href={`/api/backups/${encodeURIComponent(b.file)}`} aria-label={`Download ${b.file}`}>
                      <Download size={13} />
                    </a>{' '}
                    <button className="btn" onClick={() => void restore(b.file)}>
                      <RotateCcw size={13} /> Restore
                    </button>
                  </>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Settings
export function SettingsPage() {
  const { data, reload } = useApi<Record<string, string>>('/api/settings');
  const { data: meta } = useApi<{ schemaVersion: number; dataDir: string; entities: number }>('/api/meta');
  const { theme, setTheme, reloadMeta } = useAppState();
  const [form, setForm] = useState<Record<string, string>>({});
  const [texture, setTexture] = useState(() => {
    try {
      return localStorage.getItem('wk.texture') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleTexture = (on: boolean) => {
    setTexture(on);
    try {
      localStorage.setItem('wk.texture', on ? 'on' : 'off');
    } catch {
      /* preference only */
    }
    document.documentElement.classList.toggle('no-texture', !on);
  };
  useEffect(() => {
    if (data) setForm({ app_name: data.app_name ?? 'The Worldkeeper' });
  }, [data]);
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Settings" />
      <Card className="space-y-3">
        <Field label="Application name (working title)">
          <input className="input" value={form.app_name ?? ''} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
        </Field>
        <div>
          <span className="label">Theme</span>
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Warm Parchment (default)' },
              { value: 'dark', label: 'Dark Codex' },
            ]}
          />
        </div>
        {theme === 'light' && (
          <div>
            <Toggle checked={!texture} onChange={(v) => toggleTexture(!v)}>
              Reduce texture <span className="text-dim">(no paper grain on the background)</span>
            </Toggle>
          </div>
        )}
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
      </Card>
      <CanonPanel settings={data} onChange={async () => (await reload(), await reloadMeta())} />
      <ModulesPanel />
      <RulesPacksPanel />
      <DebugToggle />
      <Dev>
        <Card title="Installation" className="text-sm space-y-1">
          <KeyValue
            items={[
              ['Data folder', <code key="d">{meta?.dataDir}</code>],
              ['Database schema version', meta?.schemaVersion],
              ['Records', meta?.entities],
            ]}
          />
          <div className="text-dim text-xs pt-2">
            Keyboard: Ctrl+K or / search · Alt+D DM screen · Ctrl+\ collapse sidebar. Player view: open <code>/player</code>, or run <code>npm run start:player</code> for a separate player-only
            server.
          </div>
        </Card>
      </Dev>
    </div>
  );
}

/**
 * Settings → Canon (docs/OWN_WORLD_PLAN.md §2.5): whether new records go through Canon Review. Off for your own world,
 * where new records are Canon at once; on for a library built from an imported archive, which protects the source.
 */
function CanonPanel({ settings, onChange }: { settings: Record<string, string> | undefined; onChange: () => Promise<unknown> }) {
  const { canonReview } = useAppState();
  const chosen = settings?.canon_review === 'on' || settings?.canon_review === 'off';
  return (
    <Card title="Canon" className="space-y-2">
      <Toggle
        className="flex"
        checked={canonReview}
        onChange={async (v) => {
          await api.put('/api/settings', { canon_review: v ? 'on' : 'off' });
          await onChange();
        }}
      >
        Approve new records in Canon Review
      </Toggle>
      <p className="text-xs text-dim">
        {canonReview
          ? 'New records start as Proposed, and wait for you in Canon Review. This protects an imported archive from changes you have not approved.'
          : 'New records are Canon at once. You can still make one Proposed, for an idea you are not sure of yet.'}
        {!chosen && ' This follows where your library came from (an imported archive, or a world of your own) until you choose.'}
      </p>
      {chosen && (
        <button
          className="btn-ghost text-xs"
          onClick={async () => {
            await api.put('/api/settings', { canon_review: 'auto' });
            await onChange();
          }}
        >
          Follow where the library came from
        </button>
      )}
    </Card>
  );
}

function DebugToggle() {
  const { debug, debugForced, setDebug } = useAppState();
  return (
    <Card title="Technical details" className="space-y-2">
      <Toggle
        className="flex"
        checked={debug}
        disabled={debugForced}
        onChange={(v) => void setDebug(v)}
        hint={
          <>
            Record IDs, source files and citations, tags, import reports and notes on how the app works. Leave off for normal play.
            {debugForced && ' Turned on by the WORLDKEEPER_DEBUG setting on this computer.'}
          </>
        }
      >
        Show technical details
      </Toggle>
    </Card>
  );
}

/** Bring in the Worldkeeper additions: lore written for this world on top of the archive. */
function AdditionsPanel({ onDone }: { onDone: (msg: string) => void }) {
  const { data } = useApi<{ available: boolean; installed: boolean; records: number }>('/api/additions');
  const [busy, setBusy] = useState(false);
  // Only in a library with the Worldkeeper pack (Library → Setting packs installs it).
  if (!data?.available || !data.installed) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[16rem]">
        <div className="font-display text-gold">Worldkeeper additions</div>
        <p className="text-sm text-dim">
          New lore written for this world: {data.records} records (people, places, peoples, families, history, creatures), their links, the years on the World Timeline, the handbook's rumours, the
          mysteries with their secrets and clues, the maps, ready-to-run adventures and random encounter tables. Your archive records are never changed, and anything you've edited is kept. Safe to run
          again after an update.
        </p>
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.post<{ records: number; links: { added: number }; rumours: { total: number }; mysteries: { secrets: number }; adventures?: string[]; tables?: string[]; maps?: { name: string; moved?: number }[] }>(
              '/api/additions/apply',
              {},
            );
            onDone(
              `Additions applied: ${r.records} records, ${r.links.added} new links, ${r.rumours.total} rumours and ${r.mysteries.secrets} secrets${r.adventures?.length ? `, ${r.adventures.length} new adventures` : ''}${r.tables?.length ? `, ${r.tables.length} new random tables` : ''}${
                (r.maps ?? []).some((m) => m.moved) ? `; on the maps, ${(r.maps ?? []).reduce((n, m) => n + (m.moved ?? 0), 0)} pins, routes and outlines updated to the map's scale` : ''
              }. A backup was taken first.`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Applying…' : 'Apply additions'}
      </button>
    </Card>
  );
}
