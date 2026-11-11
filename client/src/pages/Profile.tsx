import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Plus, Trash2, Upload, BookOpen } from 'lucide-react';
import { INFLUENCE_LEVELS, type ProfileData, type ProfileField, type ProfileKind, type ProfileValue } from '@shared/profiles';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import { AutoTextarea, EntityLink, ErrorBox, Loading, SaveStatus } from '../components/ui';
import { EntityMultiPicker, EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';

export interface SourceValue {
  text: string;
  from: string;
  refs: string[];
}
export interface ProfileResponse {
  entityId: string;
  kind: ProfileKind;
  fields: ProfileField[];
  source: Record<string, SourceValue[]>;
  world: ProfileData;
  campaignId: number | null;
  campaign: ProfileData | null;
  lastLogged: { text: string; session_number: number; session_title: string; played_on: string; created_at: string } | null;
}

/** Best available value for compact displays: campaign → DM world value → source text. */
export function profileValue(p: ProfileResponse, key: string): { text: string; origin: 'campaign' | 'dm' | 'source' } | null {
  const show = (v: ProfileValue | undefined) => {
    if (v == null) return null;
    if (typeof v === 'string') return v || null;
    if (!v.length) return null;
    return v.map((x) => (typeof x === 'string' ? x : `${x.region}: ${x.level}`)).join(', ');
  };
  const c = show(p.campaign?.[key]);
  if (c) return { text: c, origin: 'campaign' };
  const w = show(p.world[key]);
  if (w) return { text: w, origin: 'dm' };
  const s = p.source[key]?.[0];
  if (s) return { text: s.text, origin: 'source' };
  return null;
}

export function ProfilePanel({ entityId, entityName }: { entityId: string; entityName: string }) {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<ProfileResponse>(`/api/profiles/${encodeURIComponent(entityId)}${activeCampaignId ? `?campaign=${activeCampaignId}` : ''}`);
  const { data: campaign } = useApi<{ title: string }>(activeCampaignId ? `/api/campaigns/${activeCampaignId}` : null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const world = data.fields.filter((f) => f.scope === 'world');
  const camp = data.fields.filter((f) => f.scope === 'campaign');
  return (
    <div className="space-y-6">
      <p className="text-sm text-dim">
        Left: what your source library says about {entityName} (read-only; edit the record text to change it). Right: your own notes. Fields the source does not cover show{' '}
        <strong>UNDEFINED</strong> until you fill them in. Nothing here changes the canon record.
      </p>
      <ScopeEditor key={`w-${entityId}`} title="World profile" subtitle="True in every campaign. Marked as DM additions, separate from source canon." fields={world} data={data} scope="world" campaignId={null} onSaved={reload} />
      {activeCampaignId ? (
        <ScopeEditor
          key={`c-${entityId}-${activeCampaignId}`}
          title={`This campaign: ${campaign?.title ?? '…'}`}
          subtitle="Stored only in the active campaign."
          fields={camp}
          data={data}
          scope="campaign"
          campaignId={activeCampaignId}
          onSaved={reload}
        />
      ) : (
        <p className="text-sm">
          <Link to="/campaigns" className="text-arcane">
            Choose an active campaign
          </Link>{' '}
          to record attitude, status, promises, debts and what the party knows.
        </p>
      )}
    </div>
  );
}

function ScopeEditor({
  title,
  subtitle,
  fields,
  data,
  scope,
  campaignId,
  onSaved,
}: {
  title: string;
  subtitle: string;
  fields: ProfileField[];
  data: ProfileResponse;
  scope: 'world' | 'campaign';
  campaignId: number | null;
  onSaved: () => void;
}) {
  const initial = (scope === 'world' ? data.world : data.campaign) ?? {};
  const [values, setValues] = useState<ProfileData>(initial);
  const [err, setErr] = useState<string | null>(null);
  const auto = useAutosave(async (v: ProfileData) => {
    // Send every field of this scope; empty values remove a key on the server.
    const patch: Record<string, ProfileValue> = {};
    for (const f of fields) if (f.type !== 'image') patch[f.key] = v[f.key] ?? (['refs', 'list', 'influence'].includes(f.type) ? [] : '');
    await api.put(`/api/profiles/${encodeURIComponent(data.entityId)}`, { scope, campaign_id: campaignId, data: patch });
  });
  useEffect(() => setValues(initial), [data.entityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key: string, v: ProfileValue) => {
    const next = { ...values, [key]: v };
    setValues(next);
    auto.schedule(next);
  };
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line">
        <div>
          <h2 className="section-title">{title}</h2>
          <div className="text-xs text-dim">{subtitle}</div>
        </div>
        <div className="ml-auto">
          <SaveStatus state={auto.state} error={auto.error} />
        </div>
      </div>
      {err && <ErrorBox error={err} />}
      <div className="divide-y divide-line/60">
        {fields.map((f) => (
          <div key={f.key} className="grid gap-3 p-4 lg:grid-cols-[180px_1fr_1fr]">
            <div>
              <div className="text-sm font-medium">{f.label}</div>
              {f.secret && (
                <div className="text-[11px] text-danger flex items-center gap-1 mt-0.5">
                  <Lock size={11} /> GM only
                </div>
              )}
              {f.hint && <div className="text-[11px] text-dim mt-0.5">{f.hint}</div>}
            </div>
            <SourceCell values={data.source[f.key] ?? []} scope={scope} />
            <div>
              <FieldEditor
                field={f}
                value={values[f.key]}
                onChange={(v) => set(f.key, v)}
                entityId={data.entityId}
                onUploaded={(file) => {
                  setValues({ ...values, portrait: file });
                  onSaved();
                }}
                onError={setErr}
              />
              {f.key === 'lastEncountered' && data.lastLogged && (
                <div className="text-xs text-dim mt-1">
                  From the session log: Session {data.lastLogged.session_number}
                  {data.lastLogged.played_on && ` (${data.lastLogged.played_on})`}: “{data.lastLogged.text}”
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceCell({ values, scope }: { values: SourceValue[]; scope: 'world' | 'campaign' }) {
  if (scope === 'campaign') return <div className="text-xs text-dim self-center">Campaign-specific: the source describes the default start only.</div>;
  if (!values.length) return <div className="text-xs text-dim self-center">UNDEFINED in source</div>;
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="parchment px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider opacity-60 flex items-center gap-1">
            <BookOpen size={10} /> {v.from}
          </div>
          <Markdown text={v.text.length > 900 ? v.text.slice(0, 900) + '…' : v.text} className="prose-lore text-[14px] text-parchink [&_p]:my-1 [&_a]:text-[#3b4a8f]" />
        </div>
      ))}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  entityId,
  onUploaded,
  onError,
}: {
  field: ProfileField;
  value: ProfileValue | undefined;
  onChange: (v: ProfileValue) => void;
  entityId: string;
  onUploaded: (file: string) => void;
  onError: (e: string) => void;
}) {
  const placeholder = 'Your note (leave empty if unknown)';
  switch (field.type) {
    case 'short':
      return <input className="input" value={(value as string) ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />;
    case 'text':
    case 'stats':
      return <AutoTextarea minRows={2} className="font-sans text-sm" value={(value as string) ?? ''} placeholder={`${placeholder}. Type [[ to link a record.`} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />;
    case 'ref':
      return <EntityPicker value={(value as string) || null} types={field.refTypes} onChange={(id) => onChange(id ?? '')} />;
    case 'refs':
      return <EntityMultiPicker value={(value as string[]) ?? []} types={field.refTypes} onChange={(ids) => onChange(ids)} />;
    case 'list': {
      const list = (value as string[]) ?? [];
      return (
        <div className="space-y-1">
          {list.map((item, i) => (
            <div key={i} className="flex gap-1">
              <input className="input" value={item} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${field.label} ${i + 1}`} />
              <button className="btn-ghost" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="btn-ghost text-xs" onClick={() => onChange([...list, ''])}>
            <Plus size={12} /> Add
          </button>
        </div>
      );
    }
    case 'influence': {
      const rows = (value as { region: string; level: string; note: string }[]) ?? [];
      const upd = (i: number, p: Partial<{ region: string; level: string; note: string }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
      return (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] gap-1 items-center">
              <EntityPicker value={r.region || null} types={['continent', 'realm', 'region', 'nation', 'settlement', 'landmark', 'ethereal_domain']} onChange={(id) => upd(i, { region: id ?? '' })} />
              <select className="input" value={r.level} onChange={(e) => upd(i, { level: e.target.value })} aria-label="Influence level">
                {INFLUENCE_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <input className="input" value={r.note} placeholder="Note" onChange={(e) => upd(i, { note: e.target.value })} />
              <button className="btn-ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove region">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="btn-ghost text-xs" onClick={() => onChange([...rows, { region: '', level: 'Present', note: '' }])}>
            <Plus size={12} /> Add region
          </button>
        </div>
      );
    }
    case 'image':
      return (
        <div className="flex items-center gap-3">
          {value ? <img src={`/api/uploads/${value as string}`} alt="Portrait" className="w-24 h-24 object-cover rounded-md border border-line" /> : <div className="text-xs text-dim">No portrait</div>}
          <label className="btn cursor-pointer">
            <Upload size={13} /> {value ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const r = await api.upload<{ world: ProfileData }>(`/api/profiles/${encodeURIComponent(entityId)}/portrait`, 'image', f);
                  onUploaded(r.world.portrait as string);
                } catch (x) {
                  onError((x as Error).message);
                }
              }}
            />
          </label>
        </div>
      );
  }
}

/** Compact read-only profile summary (used by NPC quick cards). */
export function ProfileSummary({ p, keys }: { p: ProfileResponse; keys: string[] }) {
  return (
    <>
      {keys.map((k) => {
        const f = p.fields.find((x) => x.key === k);
        if (!f) return null;
        const v = profileValue(p, k);
        const refs = v && (f.type === 'ref' || f.type === 'refs') ? v.text.split(/,\s*/).filter((x) => /^[A-Z]{2,4}-/.test(x)) : [];
        return (
          <div key={k} className={f.secret ? 'border border-danger/40 bg-danger/5 rounded p-1.5' : ''}>
            <span className={`text-[10px] uppercase tracking-wider ${f.secret ? 'text-danger' : 'text-dim'}`}>{f.label}: </span>
            {!v ? (
              <span className="text-dim">UNDEFINED</span>
            ) : refs.length ? (
              refs.map((id) => <EntityLink key={id} id={id} className="mr-1" />)
            ) : (
              <span>
                {v.text.replace(/\n+/g, ' ').slice(0, 240)}
                {v.origin !== 'source' && <span className="text-[10px] text-arcane ml-1">({v.origin === 'campaign' ? 'campaign' : 'DM'})</span>}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
