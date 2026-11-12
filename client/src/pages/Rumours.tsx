import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, qs, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { EntityLink, ErrorBox, Field, Loading, PageHeader, useToast } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';

export type Truth = 'true' | 'false' | 'partly' | 'unknown';
export interface Rumour {
  id: number;
  text: string;
  truth: Truth;
  gm_note: string;
  source_id: string | null;
  source_name: string | null;
  about: string[];
  origin: 'handbook' | 'user';
  stale: boolean;
  heard: boolean;
  heard_at: string | null;
}

export const TRUTH_LABELS: Record<Truth, string> = { true: 'True', false: 'False', partly: 'Partly true', unknown: 'Not decided' };
const TRUTH_STYLE: Record<Truth, string> = {
  true: 'border-emerald-500/50 text-emerald-300',
  false: 'border-danger/60 text-danger',
  partly: 'border-gold/60 text-gold',
  unknown: 'border-line text-dim',
};

/** Truth picker: four small buttons, so a GM can sweep through rumours quickly. */
export function TruthPicker({ value, onChange }: { value: Truth; onChange: (t: Truth) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Is it true?">
      {(['true', 'partly', 'false', 'unknown'] as Truth[]).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={value === t}
          className={`chip ${value === t ? TRUTH_STYLE[t] + ' bg-white/5' : 'border-line/50 text-dim/70'}`}
          onClick={() => onChange(t)}
        >
          {TRUTH_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

export function RumourRow({ r, campaignId, onChange, showSource = true }: { r: Rumour; campaignId: number | null; onChange: () => void; showSource?: boolean }) {
  const [note, setNote] = useState(r.gm_note);
  const patch = async (body: Partial<Rumour>) => {
    await api.patch(`/api/rumours/${r.id}`, body);
    onChange();
  };
  return (
    <div className={`border-b border-line/60 py-2.5 ${r.stale ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex items-center gap-1.5 text-xs text-dim pt-0.5 shrink-0" title={campaignId ? 'Heard by the party in this campaign' : 'Choose a campaign to track what the party has heard'}>
          <input
            type="checkbox"
            checked={r.heard}
            disabled={!campaignId}
            onChange={async (e) => {
              await api.post(`/api/rumours/${r.id}/heard`, { campaign_id: campaignId, heard: e.target.checked });
              onChange();
            }}
          />
          Heard
        </label>
        <div className="flex-1 min-w-[16rem]">
          <Markdown text={r.text} className="prose-lore text-[15px] [&_p]:my-0" />
          <div className="text-xs text-dim mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {showSource && r.source_id && (
              <span>
                From <EntityLink id={r.source_id}>{r.source_name ?? r.source_id}</EntityLink>
              </span>
            )}
            {r.about.filter((a) => a !== r.source_id).length > 0 && (
              <span>
                About{' '}
                {r.about
                  .filter((a) => a !== r.source_id)
                  .map((a, i) => (
                    <span key={a}>
                      {i > 0 && ', '}
                      <EntityLink id={a} />
                    </span>
                  ))}
              </span>
            )}
            {r.origin === 'user' && <span>Your rumour</span>}
            {r.stale && <span>No longer in the handbook text</span>}
          </div>
        </div>
        <TruthPicker value={r.truth} onChange={(truth) => void patch({ truth })} />
        {(r.origin === 'user' || r.stale) && (
          <button
            className="btn-ghost"
            aria-label="Delete rumour"
            onClick={async () => {
              await api.del(`/api/rumours/${r.id}`);
              onChange();
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <input
        className="input mt-1.5 text-sm"
        placeholder="GM note: what's really going on"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== r.gm_note && void patch({ gm_note: note })}
      />
    </div>
  );
}

export function RumoursPage() {
  const { activeCampaignId } = useAppState();
  const [truth, setTruth] = useState<'' | Truth>('');
  const [heard, setHeard] = useState<'' | 'heard' | 'unheard'>('');
  const [about, setAbout] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [newAbout, setNewAbout] = useState<string | null>(null);
  const { toast, node: toastNode } = useToast();
  const url = `/api/rumours${qs({ truth: truth || undefined, heard: heard || undefined, entity: about ?? undefined, q: q || undefined, campaign_id: activeCampaignId ?? undefined })}`;
  const { data, error, reload } = useApi<Rumour[]>(url);
  const counts = useMemo(() => {
    const c = { true: 0, false: 0, partly: 0, unknown: 0 } as Record<Truth, number>;
    for (const r of data ?? []) c[r.truth]++;
    return c;
  }, [data]);
  return (
    <div className="space-y-4">
      {toastNode}
      <PageHeader
        title="Rumours"
        subtitle="Everything people say, from the handbook and your own. Decide what's true, and track what the party has heard."
        note="Players only ever see rumours as rumours on handbook pages. Whether a rumour is true never leaves this page."
        actions={
          <button
            className="btn"
            onClick={async () => {
              const r = await api.post<{ found: number; added: number }>('/api/rumours/sync', {});
              toast(`Handbook rumours updated: ${r.found} found, ${r.added} new.`);
              void reload();
            }}
          >
            <RefreshCw size={14} /> Update from handbook
          </button>
        }
      />
      {!activeCampaignId && (
        <p className="text-sm text-dim">
          To track what the party has heard, <Link to="/campaigns" className="text-arcane">choose a campaign</Link>.
        </p>
      )}
      <div className="panel-pad grid gap-2 md:grid-cols-[1fr_200px_180px_240px] items-end">
        <Field label="Search">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in the rumour or your note" />
        </Field>
        <Field label="Truth">
          <select className="input" value={truth} onChange={(e) => setTruth(e.target.value as '' | Truth)}>
            <option value="">Any</option>
            <option value="unknown">Not decided ({counts.unknown})</option>
            <option value="true">True ({counts.true})</option>
            <option value="partly">Partly true ({counts.partly})</option>
            <option value="false">False ({counts.false})</option>
          </select>
        </Field>
        <Field label="Party">
          <select className="input" value={heard} onChange={(e) => setHeard(e.target.value as '' | 'heard' | 'unheard')} disabled={!activeCampaignId}>
            <option value="">Heard or not</option>
            <option value="heard">Heard</option>
            <option value="unheard">Not heard yet</option>
          </select>
        </Field>
        <Field label="About">
          <EntityPicker value={about} onChange={setAbout} />
        </Field>
      </div>
      <div className="panel-pad grid gap-2 md:grid-cols-[1fr_240px_auto] items-end">
        <Field label="New rumour">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="What are people saying? Use @[Name] to link." />
        </Field>
        <Field label="About">
          <EntityPicker value={newAbout} onChange={setNewAbout} />
        </Field>
        <button
          className="btn-primary"
          disabled={!text.trim()}
          onClick={async () => {
            await api.post('/api/rumours', { text, source_id: newAbout, about: newAbout ? [newAbout] : [] });
            setText('');
            void reload();
          }}
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="panel-pad">
          <div className="text-xs text-dim mb-1">{data.length} rumours</div>
          {data.map((r) => (
            <RumourRow key={`${r.id}-${r.truth}-${r.heard}`} r={r} campaignId={activeCampaignId} onChange={reload} />
          ))}
          {!data.length && <p className="text-sm text-dim">No rumours match. Press "Update from handbook" to bring in the handbook's rumours.</p>}
        </div>
      )}
    </div>
  );
}

/** Rumours about one record, for its page. */
export function RumoursPanel({ entityId }: { entityId: string }) {
  const { activeCampaignId } = useAppState();
  const { data, reload } = useApi<Rumour[]>(`/api/rumours${qs({ entity: entityId, campaign_id: activeCampaignId ?? undefined })}`);
  if (!data?.length) return null;
  return (
    <div className="panel p-4">
      <div className="section-title mb-1 flex items-center justify-between">
        <span>Rumours</span>
        <Link to="/rumours" className="text-xs text-arcane normal-case tracking-normal">All rumours</Link>
      </div>
      {data.map((r) => (
        <RumourRow key={`${r.id}-${r.truth}-${r.heard}`} r={r} campaignId={activeCampaignId} onChange={reload} showSource={r.source_id !== entityId} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Faction stances matrix
interface Stances {
  groups: { id: string; name: string; type: string; realm: string }[];
  links: { source_id: string; target_id: string; type: string; label: string; description: string }[];
}
const STANCE_STYLE: Record<string, string> = {
  Allied: 'bg-emerald-500/40',
  Friendly: 'bg-emerald-500/20',
  Uneasy: 'bg-white/5',
  Rival: 'bg-gold/30',
  'At war': 'bg-danger/50',
};
const REALM_NAMES: Record<string, string> = { aetheris: 'Aetheris', kaelmar: 'Kaelmar', ethereal: 'The Ethereal Realm', world: 'The World' };

/** How factions and cults feel about each other, one grid per realm. */
export function StanceMatrix() {
  const { data } = useApi<Stances>('/api/faction-stances');
  const [pick, setPick] = useState<{ a: string; b: string; label: string; description: string } | null>(null);
  if (!data) return null;
  const stance = new Map<string, { label: string; description: string }>();
  for (const l of data.links) {
    const v = { label: l.label || (l.type === 'opposes' ? 'Rival' : l.type === 'allied_with' ? 'Allied' : 'Uneasy'), description: l.description };
    stance.set(`${l.source_id}|${l.target_id}`, v);
    stance.set(`${l.target_id}|${l.source_id}`, v);
  }
  const realms = [...new Set(data.groups.map((g) => g.realm))];
  const name = (id: string) => data.groups.find((g) => g.id === id)?.name ?? id;
  return (
    <div className="panel-pad space-y-4">
      <div>
        <div className="section-title">How factions feel about each other</div>
        <div className="flex flex-wrap gap-3 text-xs text-dim mt-1">
          {Object.entries(STANCE_STYLE).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded-sm ${c}`} /> {k}
            </span>
          ))}
          <span>Choose a square to read why. Edit a stance from either faction's Relationships tab.</span>
        </div>
      </div>
      {realms.map((realm) => {
        const gs = data.groups.filter((g) => g.realm === realm && data.links.some((l) => l.source_id === g.id || l.target_id === g.id));
        if (gs.length < 2) return null;
        return (
          <div key={realm} className="overflow-x-auto">
            <div className="text-sm font-display text-gold mb-1">{REALM_NAMES[realm] ?? realm}</div>
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th />
                  {gs.map((g) => (
                    <th key={g.id} className="px-0.5 align-bottom">
                      <div className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-dim font-normal py-1">{g.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gs.map((a) => (
                  <tr key={a.id}>
                    <th className="text-right pr-2 font-normal text-dim whitespace-nowrap">{a.name}</th>
                    {gs.map((b) => {
                      const s = a.id === b.id ? null : stance.get(`${a.id}|${b.id}`);
                      return (
                        <td key={b.id} className="p-0.5">
                          {a.id === b.id ? (
                            <span className="block w-5 h-5" />
                          ) : (
                            <button
                              className={`block w-5 h-5 rounded-sm border border-line/40 ${s ? STANCE_STYLE[s.label] ?? 'bg-white/5' : ''}`}
                              title={s ? `${a.name} and ${b.name}: ${s.label}. ${s.description}` : `${a.name} and ${b.name}: not set`}
                              aria-label={s ? `${a.name} and ${b.name}: ${s.label}` : `${a.name} and ${b.name}: not set`}
                              onClick={() => s && setPick({ a: a.id, b: b.id, ...s })}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {pick && (
        <p className="text-sm">
          <EntityLink id={pick.a} /> and <EntityLink id={pick.b} />: <strong>{pick.label}</strong>. {pick.description}{' '}
          <span className="text-dim">(Changes here would go in {name(pick.a)}'s Relationships tab.)</span>
        </p>
      )}
    </div>
  );
}
