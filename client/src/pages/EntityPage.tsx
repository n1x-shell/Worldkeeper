import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, Copy, Download, Network, Pencil, Star, Eye, AlertTriangle, ArrowRight, Undo2, Plus, Trash2 } from 'lucide-react';
import {
  CANON_STATUSES,
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  REALMS,
  REALM_LABELS,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from '@shared/domain';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Entity, EntitySummary, RelationshipView, StateRow } from '../lib/types';
import { splitSections } from '../lib/sections';
import {
  AutoTextarea,
  CanonFlags,
  Confirm,
  EntityLink,
  ErrorBox,
  Field,
  Loading,
  Modal,
  RealmBadge,
  SaveStatus,
  Tabs,
  TypeBadge,
  VisibilityBadge,
  useToast,
} from '../components/ui';
import { Markdown } from '../components/Markdown';
import { EntityPicker } from '../components/EntityPicker';
import { ProfilePanel } from './Profile';
import { profileKindFor } from '@shared/profiles';

interface Detail {
  entity: Entity;
  redirectedFrom: string | null;
  relationships: RelationshipView[];
  children: EntitySummary[];
  parent: EntitySummary | null;
  campaignState: StateRow[];
  activeCampaignId: number | null;
  sections: { heading: string; secret: boolean }[];
  baseline: { revisionId: number; created_at: string } | null;
}

type Tab = 'record' | 'profile' | 'edit' | 'relationships' | 'player' | 'campaign' | 'history';

export function EntityPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { reloadIndex } = useAppState();
  const { data, error, loading, reload, setData } = useApi<Detail>(`/api/entities/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<Tab>('record');
  const { toast, node: toastNode } = useToast();
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => setTab('record'), [id]);
  useEffect(() => {
    if (data?.redirectedFrom) nav(`/e/${encodeURIComponent(data.entity.id)}`, { replace: true });
  }, [data, nav]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const e = data.entity;

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      const updated = await api.patch<Entity>(`/api/entities/${encodeURIComponent(e.id)}`, body);
      setData({ ...data, entity: updated });
      if (msg) toast(msg);
      void reloadIndex();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const fieldMap = e.fields;
  return (
    <div className="space-y-4">
      {toastNode}
      {data.redirectedFrom && (
        <div className="text-sm text-dim">
          Redirected from legacy ID {data.redirectedFrom}.
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-dim flex items-center gap-1 flex-wrap mb-1">
            {data.parent ? (
              <>
                <EntityLink id={data.parent.id}>{data.parent.name}</EntityLink> <ArrowRight size={11} />
              </>
            ) : e.parent_raw ? (
              <span>{e.parent_raw} ›</span>
            ) : null}
            <span>{e.id}</span>
          </div>
          <h1 className="text-3xl text-gold">{e.name}</h1>
          {e.aliases.length > 0 && <div className="text-sm text-dim mt-1">Also: {e.aliases.join('; ')}</div>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <TypeBadge type={e.type} />
            <RealmBadge realm={e.realm} />
            <CanonFlags status={e.canon_status} flags={e.canon_flags} />
            <VisibilityBadge revealed={e.revealed} />
            {e.modified_since_import && (
              <Link to="/review" className="chip border-amber-500/60 text-amber-400">
                <AlertTriangle size={11} /> Edited since import
              </Link>
            )}
            {e.archived && <span className="chip border-danger/50 text-danger">Archived</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn" onClick={() => patch({ favorite: !e.favorite })} aria-pressed={e.favorite} title="Favorite">
            <Star size={14} fill={e.favorite ? 'currentColor' : 'none'} className={e.favorite ? 'text-gold' : ''} />
          </button>
          <button className="btn" onClick={() => setTab('edit')}>
            <Pencil size={14} /> Edit
          </button>
          <Link className="btn" to={`/graph?focus=${encodeURIComponent(e.id)}`}>
            <Network size={14} /> Graph
          </Link>
          <button
            className="btn"
            onClick={async () => {
              const d = await api.post<Entity>(`/api/entities/${encodeURIComponent(e.id)}/duplicate`);
              await reloadIndex();
              nav(`/e/${d.id}`);
            }}
            title="Create a PROPOSED copy; the original is unchanged"
          >
            <Copy size={14} /> Duplicate as draft
          </button>
          <a className="btn" href={`/api/entities/${encodeURIComponent(e.id)}/export.md`}>
            <Download size={14} /> .md
          </a>
          <button className="btn" onClick={() => (e.archived ? patch({ archived: false }, 'Restored from archive') : setConfirmArchive(true))}>
            <Archive size={14} /> {e.archived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      </div>
      {confirmArchive && (
        <Confirm
          title="Archive record?"
          body="Archived records are hidden from lists but keep their ID, links and history. You can unarchive at any time. Nothing is deleted."
          confirmLabel="Archive"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false);
            void patch({ archived: true, reason: 'Archived' }, 'Archived');
          }}
        />
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'record', label: 'Record' },
          ...(profileKindFor(e.type) ? [{ id: 'profile' as Tab, label: profileKindFor(e.type) === 'npc' ? 'NPC profile' : 'Faction profile' }] : []),
          { id: 'edit', label: 'Edit' },
          { id: 'relationships', label: `Relationships (${data.relationships.length})` },
          { id: 'player', label: 'Player view' },
          { id: 'campaign', label: `Campaign (${data.campaignState.length})` },
          { id: 'history', label: 'History' },
        ]}
      />

      {tab === 'record' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <article className="panel p-5 min-w-0">
            {splitSections(e.body).map((s, i) =>
              s.secret ? (
                <div key={i} className="wk-secret border border-danger/40 bg-danger/5 rounded-md px-4 py-2 my-3">
                  <div className="text-[10px] uppercase tracking-widest text-danger mb-1">GM only · never shown to players</div>
                  <Markdown text={`## ${s.heading}\n\n${s.content}`} />
                </div>
              ) : (
                <Markdown key={i} text={s.heading ? `## ${s.heading}\n\n${s.content}` : s.content} />
              ),
            )}
            {e.notes && (
              <div className="mt-6 border-t border-line pt-3">
                <div className="section-title mb-1">DM notes</div>
                <Markdown text={e.notes} />
              </div>
            )}
          </article>
          <aside className="space-y-3">
            <div className="parchment p-4 text-sm space-y-2">
              <div className="font-display text-xs tracking-widest uppercase opacity-70">Key facts</div>
              <Fact k="Category" v={e.category_raw ?? ENTITY_TYPE_LABELS[e.type]} />
              <Fact k="Realm" v={e.realm_raw ?? REALM_LABELS[e.realm]} />
              <Fact k="Canon status" v={e.canon_raw ?? e.canon_status} />
              {fieldMap.map(([k, v]) => (
                <Fact key={k} k={k} v={v} />
              ))}
              <Fact k="Source" v={e.source_raw ?? 'UNDEFINED'} />
              {e.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {e.tags.map((t) => (
                    <Link key={t} to={`/search?tag=${encodeURIComponent(t)}`} className="chip border-parchink/30 text-parchink/80">
                      {t}
                    </Link>
                  ))}
                </div>
              )}
              {e.source_file && <div className="text-xs opacity-70 pt-1">File: {e.source_file}</div>}
            </div>
            {data.children.length > 0 && (
              <div className="panel-pad">
                <div className="section-title mb-2">Contains ({data.children.length})</div>
                <ul className="text-sm space-y-1 max-h-72 overflow-auto">
                  {data.children.map((c) => (
                    <li key={c.id}>
                      <EntityLink id={c.id}>{c.name}</EntityLink> <span className="text-xs text-dim">{ENTITY_TYPE_LABELS[c.type]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <RelationshipSummary rels={data.relationships} selfId={e.id} onMore={() => setTab('relationships')} />
          </aside>
        </div>
      )}
      {tab === 'edit' && (
        <EntityEditor
          key={e.id}
          entity={e}
          onSaved={(updated) => {
            setData({ ...data, entity: updated });
            void reloadIndex();
          }}
          onDone={() => {
            setTab('record');
            void reload();
          }}
        />
      )}
      {tab === 'profile' && <ProfilePanel entityId={e.id} entityName={e.name} />}
      {tab === 'relationships' && <RelationshipsTab entityId={e.id} rels={data.relationships} onChange={reload} />}
      {tab === 'player' && <PlayerTab entity={e} sections={data.sections} onPatch={patch} />}
      {tab === 'campaign' && <CampaignTab entity={e} rows={data.campaignState} activeCampaignId={data.activeCampaignId} onChange={reload} />}
      {tab === 'history' && <HistoryTab entity={e} onRestored={reload} />}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider opacity-60">{k}</div>
      <div className="font-serif text-[15px] leading-snug">
        <Markdown text={v} className="[&_p]:my-0 [&_a]:text-[#3b4a8f]" />
      </div>
    </div>
  );
}

function RelationshipSummary({ rels, selfId, onMore }: { rels: RelationshipView[]; selfId: string; onMore: () => void }) {
  const curated = rels.filter((r) => r.type !== 'references');
  const show = (curated.length ? curated : rels).slice(0, 12);
  return (
    <div className="panel-pad">
      <div className="flex justify-between items-center mb-2">
        <div className="section-title">Connections</div>
        <button className="btn-ghost text-xs" onClick={onMore}>
          All {rels.length}
        </button>
      </div>
      {!rels.length && <p className="text-sm text-dim">No relationships yet.</p>}
      <ul className="text-sm space-y-1">
        {show.map((r) => {
          const out = r.source_id === selfId;
          const other = out ? r.target_id : r.source_id;
          return (
            <li key={r.id}>
              <span className="text-dim text-xs">{out ? RELATIONSHIP_LABELS[r.type as RelationshipType] ?? r.type : `← ${RELATIONSHIP_LABELS[r.type as RelationshipType] ?? r.type}`}</span>{' '}
              <EntityLink id={other}>{(out ? r.target_name : r.source_name) ?? other}</EntityLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Editor
export function EntityEditor({ entity, onSaved, onDone }: { entity: Entity; onSaved: (e: Entity) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(entity);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(false);
  const version = useRef(entity.version);
  const [conflict, setConflict] = useState<string | null>(null);
  const save = useCallback(
    async (d: Entity) => {
      try {
        const updated = await api.patch<Entity>(`/api/entities/${encodeURIComponent(d.id)}`, {
          name: d.name,
          aliases: d.aliases,
          category_raw: d.category_raw,
          type: d.type,
          parent_id: d.parent_id,
          parent_raw: d.parent_raw,
          realm: d.realm,
          canon_status: d.canon_status,
          canon_flags: d.canon_flags,
          source_raw: d.source_raw,
          tags: d.tags,
          fields: d.fields,
          body: d.body,
          notes: d.notes,
          reason,
          expected_version: version.current,
        });
        version.current = updated.version;
        onSaved(updated);
      } catch (e) {
        if ((e as { status?: number }).status === 409) setConflict('This record was changed in another window. Reload to see the latest version before editing again.');
        throw e;
      }
    },
    [reason, onSaved],
  );
  const auto = useAutosave(save, 1000);
  const update = (p: Partial<Entity>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    auto.schedule(next);
  };
  const isCanonImport = entity.origin === 'import' && entity.canon_status === 'CANON';

  return (
    <div className="space-y-4">
      {conflict && <ErrorBox error={conflict} />}
      {isCanonImport && (
        <div className="panel border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            You are editing an imported <strong>CANON</strong> record ({entity.source_file}). Every change is saved as a revision and listed in Canon Review until you approve or revert it. The original source
            file is never modified.
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 sticky top-0 z-10 bg-bg/90 backdrop-blur py-2">
        <SaveStatus state={auto.state} error={auto.error} />
        <input className="input max-w-md" placeholder="Reason for change (recorded in history)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => setPreview((p) => !p)}>
            <Eye size={14} /> {preview ? 'Hide preview' : 'Preview'}
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              await auto.flush();
              onDone();
            }}
          >
            Done
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Name">
          <input className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Stable ID" hint="IDs never change.">
          <input className="input opacity-70" value={draft.id} readOnly />
        </Field>
        <Field label="Template type">
          <select className="input" value={draft.type} onChange={(e) => update({ type: e.target.value as Entity['type'] })}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Realm">
          <select className="input" value={draft.realm} onChange={(e) => update({ realm: e.target.value as Entity['realm'] })}>
            {REALMS.map((r) => (
              <option key={r} value={r}>
                {REALM_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Canon status">
          <select
            className="input"
            value={draft.canon_status}
            onChange={(e) => {
              const s = e.target.value as Entity['canon_status'];
              update({ canon_status: s, canon_flags: [s, ...draft.canon_flags.filter((f) => !CANON_STATUSES.includes(f as never) || f === 'SECRET')].filter((v, i, a) => a.indexOf(v) === i) });
            }}
          >
            {CANON_STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Labels" hint="SECRET, HOMEBREW, UNVERIFIED, OFFICIAL, OUTSIDE 2024 CORE">
          <div className="flex flex-wrap gap-2 text-xs">
            {['SECRET', 'HOMEBREW', 'UNVERIFIED', 'OFFICIAL', 'OUTSIDE 2024 CORE'].map((f) => (
              <label key={f} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.canon_flags.includes(f)}
                  onChange={(e) => update({ canon_flags: e.target.checked ? [...draft.canon_flags, f] : draft.canon_flags.filter((x) => x !== f) })}
                />
                {f}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Parent record">
          <EntityPicker value={draft.parent_id} onChange={(pid) => update({ parent_id: pid })} />
        </Field>
        <Field label="Aliases (one per line)">
          <textarea className="input" rows={2} value={draft.aliases.join('\n')} onChange={(e) => update({ aliases: e.target.value.split('\n').filter((s) => s.trim()) })} />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Source references">
          <input className="input" value={draft.source_raw ?? ''} onChange={(e) => update({ source_raw: e.target.value })} placeholder="e.g. Kaelmar_Setting_Bible.md: Factions; or DM decision" />
        </Field>
        <Field label="Tags (comma separated)">
          <input className="input" value={draft.tags.join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })} />
        </Field>
      </div>
      <div>
        <span className="label">Template fields</span>
        <div className="space-y-1.5">
          {draft.fields.map(([k, v], i) => (
            <div key={i} className="flex gap-2">
              <input className="input w-48" value={k} onChange={(e) => update({ fields: draft.fields.map((f, j) => (j === i ? [e.target.value, f[1]] : f)) })} aria-label="Field name" />
              <input className="input flex-1" value={v} onChange={(e) => update({ fields: draft.fields.map((f, j) => (j === i ? [f[0], e.target.value] : f)) })} aria-label="Field value" />
              <button className="btn-ghost" onClick={() => update({ fields: draft.fields.filter((_, j) => j !== i) })} aria-label="Remove field">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => update({ fields: [...draft.fields, ['New field', 'UNDEFINED']] })}>
            <Plus size={14} /> Add field
          </button>
        </div>
      </div>
      <div className={`grid gap-3 ${preview ? 'lg:grid-cols-2' : ''}`}>
        <Field label="Description (Markdown). Link records with Name [ID]. Headings containing “GM only” or “Secret” are never published to players.">
          <AutoTextarea minRows={16} value={draft.body} onChange={(e) => update({ body: e.target.value })} onBlur={() => void auto.flush()} />
        </Field>
        {preview && (
          <div className="panel p-4 overflow-auto max-h-[80vh]">
            <Markdown text={draft.body} />
          </div>
        )}
      </div>
      <Field label="DM notes (not part of the source text)">
        <AutoTextarea minRows={4} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => void auto.flush()} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ Relationships
function RelationshipsTab({ entityId, rels, onChange }: { entityId: string; rels: RelationshipView[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ target: null as string | null, type: 'related_to', direction: 'out', label: '', description: '', canon_status: 'PROPOSED' });
  const groups = useMemo(() => {
    const g: Record<string, RelationshipView[]> = { user: [], 'import-parent': [], 'import-field': [], 'import-reference': [] };
    for (const r of rels) (g[r.origin] ??= []).push(r);
    return g;
  }, [rels]);
  const titles: Record<string, string> = {
    user: 'Curated relationships',
    'import-parent': 'Hierarchy (from Parent field)',
    'import-field': 'From record fields',
    'import-reference': 'Cross-references in the text',
  };
  return (
    <div className="space-y-4">
      {err && <ErrorBox error={err} />}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add relationship
        </button>
        <Link className="btn" to={`/graph?focus=${entityId}`}>
          <Network size={14} /> Open in graph
        </Link>
      </div>
      {Object.entries(groups).map(([origin, list]) =>
        list.length ? (
          <section key={origin} className="panel overflow-x-auto">
            <div className="px-4 py-2 border-b border-line section-title">
              {titles[origin] ?? origin} ({list.length})
            </div>
            <table className="table">
              <tbody>
                {list.map((r) => {
                  const out = r.source_id === entityId;
                  const other = out ? r.target_id : r.source_id;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap w-48">
                        <select
                          className="input py-0.5 text-xs"
                          value={r.type}
                          onChange={async (e) => {
                            try {
                              await api.patch(`/api/relationships/${r.id}`, { type: e.target.value });
                              onChange();
                            } catch (x) {
                              setErr((x as Error).message);
                            }
                          }}
                          title={origin === 'user' ? 'Change type' : 'Choosing a type creates a curated relationship'}
                        >
                          {RELATIONSHIP_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {out ? '' : '← '}
                              {RELATIONSHIP_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <EntityLink id={other}>{(out ? r.target_name : r.source_name) ?? other}</EntityLink>
                        {r.label && <span className="text-xs text-dim ml-2">{r.label}</span>}
                        {r.description && <div className="text-xs text-dim">{r.description}</div>}
                        {origin === 'import-reference' && r.source_context && <div className="text-xs text-dim italic line-clamp-2">“{r.source_context}”</div>}
                      </td>
                      <td className="w-24 text-right">
                        {origin === 'user' && (
                          <button
                            className="btn-ghost"
                            onClick={async () => {
                              await api.del(`/api/relationships/${r.id}`);
                              onChange();
                            }}
                            aria-label="Delete relationship"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null,
      )}
      {adding && (
        <Modal title="Add relationship" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <Field label="Direction">
              <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="out">This record → other</option>
                <option value="in">Other → this record</option>
              </select>
            </Field>
            <Field label="Relationship">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {RELATIONSHIP_TYPES.filter((t) => t !== 'references').map((t) => (
                  <option key={t} value={t}>
                    {RELATIONSHIP_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Other record">
              <EntityPicker value={form.target} onChange={(t) => setForm({ ...form, target: t })} />
            </Field>
            <Field label="Label (optional)">
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Canon status">
              <select className="input" value={form.canon_status} onChange={(e) => setForm({ ...form, canon_status: e.target.value })}>
                {CANON_STATUSES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end">
              <button
                className="btn-primary"
                disabled={!form.target}
                onClick={async () => {
                  try {
                    const [s, t] = form.direction === 'out' ? [entityId, form.target] : [form.target, entityId];
                    await api.post('/api/relationships', { source_id: s, target_id: t, type: form.type, label: form.label, description: form.description, canon_status: form.canon_status });
                    setAdding(false);
                    onChange();
                  } catch (x) {
                    setErr((x as Error).message);
                  }
                }}
              >
                Save relationship
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Player view
function PlayerTab({ entity, sections, onPatch }: { entity: Entity; sections: { heading: string; secret: boolean }[]; onPatch: (b: Record<string, unknown>, m?: string) => Promise<void> }) {
  const [summary, setSummary] = useState(entity.player_summary);
  const [fact, setFact] = useState('');
  const { data: preview, reload } = useApi<{ name: string; summary: string; facts: string[]; sections: { heading: string; content: string }[] } | null>(
    entity.revealed ? `/api/player/entities/${encodeURIComponent(entity.id)}` : null,
  );
  useEffect(() => {
    void reload();
  }, [entity.version, reload]);
  const secretRecord = entity.canon_flags.includes('SECRET');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="panel-pad space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={entity.revealed} onChange={(e) => onPatch({ revealed: e.target.checked, reason: e.target.checked ? 'Revealed to players' : 'Hidden from players' }, e.target.checked ? 'Revealed to players' : 'Hidden from players')} />
            <span className="font-medium">Players know this record exists</span>
          </label>
          <p className="text-xs text-dim">
            Players only ever receive the name, your player summary, revealed facts and the sections you tick below. Sections with GM-only/secret headings can never be published; write a revealed fact instead.
          </p>
          {secretRecord && (
            <div className="text-xs text-amber-400 flex gap-1">
              <AlertTriangle size={13} /> This record is marked SECRET. Read each section before revealing it: secrets may appear outside GM-only headings.
            </div>
          )}
        </div>
        <div className="panel-pad space-y-2">
          <Field label="Player summary (what the party knows)">
            <textarea className="input" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== entity.player_summary && onPatch({ player_summary: summary }, 'Player summary saved')} />
          </Field>
        </div>
        <div className="panel-pad">
          <div className="label">Reveal sections</div>
          <ul className="space-y-1 text-sm">
            {sections
              .filter((s) => s.heading)
              .map((s) => (
                <li key={s.heading}>
                  <label className={`flex items-center gap-2 ${s.secret ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={s.secret}
                      checked={entity.revealed_sections.includes(s.heading)}
                      onChange={(e) =>
                        onPatch({ revealed_sections: e.target.checked ? [...entity.revealed_sections, s.heading] : entity.revealed_sections.filter((h) => h !== s.heading) })
                      }
                    />
                    {s.heading} {s.secret && <span className="text-xs text-danger">GM only</span>}
                  </label>
                </li>
              ))}
          </ul>
        </div>
        <div className="panel-pad space-y-2">
          <div className="label">Revealed facts (written for players)</div>
          <ul className="text-sm space-y-1">
            {entity.revealed_facts.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-1">• {f}</span>
                <button className="btn-ghost" onClick={() => onPatch({ revealed_facts: entity.revealed_facts.filter((_, j) => j !== i) })} aria-label="Remove fact">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="input" value={fact} onChange={(e) => setFact(e.target.value)} placeholder="e.g. The party learned the inn has a locked room." />
            <button
              className="btn"
              disabled={!fact.trim()}
              onClick={() => {
                void onPatch({ revealed_facts: [...entity.revealed_facts, fact.trim()], reason: 'Fact revealed' }, 'Fact revealed');
                setFact('');
              }}
            >
              Reveal
            </button>
          </div>
        </div>
      </div>
      <div className="panel p-4">
        <div className="section-title mb-2">Exactly what players see</div>
        {!entity.revealed ? (
          <p className="text-sm text-dim">Hidden. This record does not exist for players.</p>
        ) : preview ? (
          <div className="parchment p-4">
            <h2 className="text-xl">{preview.name}</h2>
            {preview.summary && <Markdown text={preview.summary} className="prose-lore text-parchink" />}
            {preview.facts.length > 0 && (
              <ul className="list-disc pl-5 font-serif">
                {preview.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            {preview.sections.map((s) => (
              <Markdown key={s.heading} text={`## ${s.heading}\n\n${s.content}`} className="prose-lore text-parchink" />
            ))}
          </div>
        ) : (
          <Loading />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Campaign overlay
function CampaignTab({ entity, rows, activeCampaignId, onChange }: { entity: Entity; rows: StateRow[]; activeCampaignId: number | null; onChange: () => void }) {
  const [field, setField] = useState(entity.type === 'vault' ? 'Vault state' : entity.type === 'npc' ? 'Attitude toward the party' : 'Status');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-dim">
        Campaign changes are stored separately from the encyclopedia. The world record above is never overwritten. Use <strong>Propose as canon</strong> to send a change to Canon Review.
      </p>
      {err && <ErrorBox error={err} />}
      {msg && <div className="text-sm text-ok">{msg}</div>}
      {activeCampaignId ? (
        <div className="panel-pad grid gap-2 md:grid-cols-[200px_1fr_1fr_auto] items-end">
          <Field label="Field">
            <input className="input" value={field} onChange={(e) => setField(e.target.value)} />
          </Field>
          <Field label="New value in this campaign">
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button
            className="btn-primary"
            disabled={!value.trim() || !field.trim()}
            onClick={async () => {
              try {
                await api.post('/api/campaign-state', { campaign_id: activeCampaignId, entity_id: entity.id, field, value, note });
                setValue('');
                setNote('');
                onChange();
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            Record
          </button>
        </div>
      ) : (
        <p className="text-sm">
          <Link className="text-arcane" to="/campaigns">Choose an active campaign</Link> to record campaign-specific changes.
        </p>
      )}
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Field</th>
              <th>Value</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.campaign_title}</td>
                <td>{r.field}</td>
                <td>
                  {r.value}
                  {r.note && <div className="text-xs text-dim">{r.note}</div>}
                </td>
                <td>{r.status}</td>
                <td className="text-right">
                  {r.status === 'active' && (
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          await api.post(`/api/campaign-state/${r.id}/promote`, { reason: 'Proposed from record page' });
                          setMsg('Sent to Canon Review. The world record changes only if you approve it there.');
                        } catch (x) {
                          setErr((x as Error).message);
                        }
                      }}
                    >
                      Propose as canon
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="text-dim">
                  No campaign has changed this record.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ History
function HistoryTab({ entity, onRestored }: { entity: Entity; onRestored: () => void }) {
  const { data, reload } = useApi<{ id: number; version: number; change_type: string; reason: string; created_at: string }[]>(`/api/entities/${encodeURIComponent(entity.id)}/revisions`);
  const [view, setView] = useState<{ id: number; snapshot: Entity } | null>(null);
  useEffect(() => {
    void reload();
  }, [entity.version, reload]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-dim">Each row is the record as it was before a change (or right after an import). Restoring creates a new version; nothing in history is deleted.</p>
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Version</th>
              <th>Change</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td>v{r.version}</td>
                <td>{r.change_type}</td>
                <td className="text-sm">{r.reason}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn-ghost" onClick={async () => setView(await api.get(`/api/revisions/${r.id}`))}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal title={`Version ${view.snapshot.version} of ${view.snapshot.name}`} onClose={() => setView(null)} wide>
          <div className="space-y-3">
            <DiffView before={view.snapshot.body} after={entity.body} />
            <div className="flex justify-end gap-2">
              <button
                className="btn-primary"
                onClick={async () => {
                  await api.post(`/api/entities/${encodeURIComponent(entity.id)}/revert`, { revisionId: view.id, reason: `Restored version ${view.snapshot.version}` });
                  setView(null);
                  onRestored();
                }}
              >
                <Undo2 size={14} /> Restore this version
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Simple line diff (LCS) between two texts. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => {
    const a = before.split('\n');
    const b = after.split('\n');
    if (a.length * b.length > 4_000_000) return [{ t: '=', s: 'Text too large to diff.' }];
    const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out: { t: string; s: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) (out.push({ t: '=', s: a[i] }), i++, j++);
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: a[i++] });
      else out.push({ t: '+', s: b[j++] });
    }
    while (i < a.length) out.push({ t: '-', s: a[i++] });
    while (j < b.length) out.push({ t: '+', s: b[j++] });
    return out;
  }, [before, after]);
  const changed = lines.some((l) => l.t !== '=');
  return (
    <div>
      <div className="text-xs text-dim mb-1">Red = only in that version · Green = only in the current record{!changed && ' · (no text differences)'}</div>
      <pre className="text-xs font-mono whitespace-pre-wrap max-h-[55vh] overflow-auto panel p-2">
        {lines.map((l, k) => (
          <div key={k} className={l.t === '-' ? 'bg-danger/15 text-danger' : l.t === '+' ? 'bg-ok/15 text-ok' : 'text-dim'}>
            {l.t === '=' ? '  ' : l.t + ' '}
            {l.s}
          </div>
        ))}
      </pre>
    </div>
  );
}
