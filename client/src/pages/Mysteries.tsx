import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, qs, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import type { EntitySummary } from '../lib/types';
import { AutoTextarea, EntityLink, ErrorBox, Field, Loading, PageHeader, useToast } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { EntityTable } from './EntityList';

type SecretState = 'unknown' | 'suspected' | 'known';
type ClueKind = 'rumour' | 'npc' | 'place' | 'item' | 'text';
interface Clue {
  id: number;
  kind: ClueKind;
  note: string;
  entity_id: string | null;
  rumours: { id: number; text: string; source_id: string | null }[];
  origin: string;
  found: boolean;
}
interface Secret {
  id: number;
  mystery_id: number | null;
  title: string;
  truth: string;
  gm_note: string;
  source_id: string | null;
  about: string[];
  origin: string;
  state: SecretState;
  clues: Clue[];
}
interface Mystery {
  id: number;
  title: string;
  question: string;
  summary: string;
  secrets: Secret[];
}

const STATE_LABEL: Record<SecretState, string> = { unknown: 'Unknown', suspected: 'Suspected', known: 'Known' };
const STATE_STYLE: Record<SecretState, string> = { unknown: 'border-line text-dim', suspected: 'border-gold/60 text-gold', known: 'border-emerald-500/50 text-emerald-300' };
const KIND_LABEL: Record<ClueKind, string> = { rumour: 'Rumour', npc: 'Who knows', place: 'Where', item: 'Item', text: 'Clue' };

function StatePicker({ value, disabled, onChange }: { value: SecretState; disabled: boolean; onChange: (s: SecretState) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="What the party knows">
      {(['unknown', 'suspected', 'known'] as SecretState[]).map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={value === s}
          disabled={disabled}
          className={`chip ${value === s ? STATE_STYLE[s] + ' bg-white/5' : 'border-line/50 text-dim/70'} disabled:opacity-50`}
          onClick={() => onChange(s)}
        >
          {STATE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function ClueRow({ c, campaignId, onChange }: { c: Clue; campaignId: number | null; onChange: () => void }) {
  const [found, setFound] = useState(c.found);
  return (
    <li className="flex items-start gap-2 py-1">
      <input
        type="checkbox"
        className="mt-1"
        checked={found}
        disabled={!campaignId}
        aria-label="The party has found this clue"
        title={campaignId ? 'Found by the party' : 'Choose a campaign to track clues'}
        onChange={async (e) => {
          const next = e.target.checked;
          setFound(next);
          await api.post(`/api/clues/${c.id}/found`, { campaign_id: campaignId, found: next });
          onChange();
        }}
      />
      <span className="text-[11px] uppercase tracking-wider text-dim w-20 shrink-0 pt-1">{KIND_LABEL[c.kind]}</span>
      <div className="flex-1 text-sm">
        {c.rumours.map((r) => (
          <div key={r.id}>
            <Markdown text={`“${r.text}”`} className="prose-lore text-[14px] inline [&_p]:inline [&_p]:my-0" />
            {r.source_id && (
              <span className="text-xs text-dim">
                {' '}
                (<EntityLink id={r.source_id} />)
              </span>
            )}
          </div>
        ))}
        {c.entity_id && <EntityLink id={c.entity_id} className="mr-1" />}
        {c.note && <span className="text-ink/80">{c.kind === 'rumour' ? ` ${c.note}` : c.note}</span>}
      </div>
      <button
        className="btn-ghost"
        aria-label="Remove clue"
        onClick={async () => {
          await api.del(`/api/clues/${c.id}`);
          onChange();
        }}
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function AddClue({ secretId, onAdded }: { secretId: number; onAdded: () => void }) {
  const [kind, setKind] = useState<ClueKind>('npc');
  const [entity, setEntity] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [rumourQ, setRumourQ] = useState('');
  const { data: rumours } = useApi<{ id: number; text: string }[]>(kind === 'rumour' && rumourQ.trim().length > 2 ? `/api/rumours${qs({ q: rumourQ })}` : null);
  const [rumourId, setRumourId] = useState<number | null>(null);
  return (
    <div className="grid gap-2 md:grid-cols-[130px_1fr_1fr_auto] items-end mt-2">
      <Field label="Clue">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ClueKind)}>
          {(Object.keys(KIND_LABEL) as ClueKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {kind === 'rumour' ? (
        <Field label="Rumour">
          <input className="input" value={rumourQ} onChange={(e) => setRumourQ(e.target.value)} placeholder="Find a rumour by its words" list={`rumours-${secretId}`} />
          <select className="input mt-1" value={rumourId ?? ''} onChange={(e) => setRumourId(Number(e.target.value) || null)}>
            <option value="">Choose…</option>
            {(rumours ?? []).slice(0, 30).map((r) => (
              <option key={r.id} value={r.id}>
                {r.text.slice(0, 90)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label={kind === 'text' ? 'About (optional)' : 'Record'}>
          <EntityPicker value={entity} onChange={setEntity} />
        </Field>
      )}
      <Field label="Note">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="How it points to the secret" />
      </Field>
      <button
        className="btn"
        disabled={(kind === 'rumour' && !rumourId) || (kind !== 'rumour' && kind !== 'text' && !entity) || (kind === 'text' && !note.trim())}
        onClick={async () => {
          await api.post('/api/clues', { secret_id: secretId, kind, note, entity_id: kind === 'rumour' ? null : entity, rumour_ids: rumourId ? [rumourId] : [] });
          setNote('');
          setEntity(null);
          setRumourId(null);
          setRumourQ('');
          onAdded();
        }}
      >
        <Plus size={14} /> Add clue
      </button>
    </div>
  );
}

function SecretCard({ s, campaignId, onChange, compact }: { s: Secret; campaignId: number | null; onChange: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [truth, setTruth] = useState(s.truth);
  const [adding, setAdding] = useState(false);
  const found = s.clues.filter((c) => c.found).length;
  return (
    <div className="border border-line/70 rounded-md p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="flex items-center gap-1 font-display text-gold text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {s.title}
        </button>
        {s.source_id && <EntityLink id={s.source_id} className="text-xs" />}
        <span className="text-xs text-dim">
          {found}/{s.clues.length} clues found
        </span>
        <span className="flex-1" />
        <StatePicker
          value={s.state}
          disabled={!campaignId}
          onChange={async (state) => {
            await api.post(`/api/secrets/${s.id}/state`, { campaign_id: campaignId, state });
            onChange();
          }}
        />
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <AutoTextarea
            className="input text-sm"
            value={truth}
            minRows={2}
            onChange={(e) => setTruth(e.target.value)}
            onBlur={() => truth !== s.truth && void api.patch(`/api/secrets/${s.id}`, { truth }).then(onChange)}
            aria-label="The truth"
          />
          <ul className="divide-y divide-line/40">
            {s.clues.map((c) => (
              <ClueRow key={c.id} c={c} campaignId={campaignId} onChange={onChange} />
            ))}
          </ul>
          {adding ? (
            <AddClue secretId={s.id} onAdded={onChange} />
          ) : (
            <button className="btn-ghost text-xs" onClick={() => setAdding(true)}>
              <Plus size={12} /> Add a clue
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MysteryCard({ m, campaignId, onChange }: { m: Mystery; campaignId: number | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const known = m.secrets.filter((s) => s.state === 'known').length;
  const suspected = m.secrets.filter((s) => s.state === 'suspected').length;
  return (
    <div className="panel-pad">
      <button className="w-full text-left flex items-start gap-2" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pt-1">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="flex-1">
          <span className="font-display text-xl text-gold block">{m.title}</span>
          {m.question && <span className="text-ink/90 italic">{m.question}</span>}
        </span>
        <span className="text-xs text-dim text-right shrink-0">
          {m.secrets.length} secrets
          {campaignId ? (
            <>
              <br />
              {known} known, {suspected} suspected
            </>
          ) : null}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {m.summary && <p className="text-sm text-ink/80">{m.summary}</p>}
          {m.secrets.map((s) => (
            <SecretCard key={s.id} s={s} campaignId={campaignId} onChange={onChange} compact />
          ))}
          {m.id > 0 && (
            <div className="flex gap-2 items-end">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New secret in this mystery" />
              <button
                className="btn"
                disabled={!title.trim()}
                onClick={async () => {
                  await api.post('/api/secrets', { title, mystery_id: m.id });
                  setTitle('');
                  onChange();
                }}
              >
                <Plus size={14} /> Add secret
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MysteriesPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<Mystery[]>(`/api/mysteries${qs({ campaign_id: activeCampaignId ?? undefined })}`);
  const { data: flagged } = useApi<EntitySummary[]>('/api/entities?canon=SECRET');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const { toast, node } = useToast();
  return (
    <div className="space-y-4">
      {node}
      <PageHeader
        title="Mysteries and Secrets"
        subtitle="The campaign's big questions, the secrets that answer them, and the clues that lead there."
        note="None of this is ever visible to players. Clues can be rumours, people who know, places, items or anything you write."
        actions={
          <button
            className="btn"
            onClick={async () => {
              const r = await api.post<{ mysteries: { secrets: number; clues: number; unmatched: string[] } }>('/api/mysteries/sync', {});
              toast(`Updated: ${r.mysteries.secrets} secrets, ${r.mysteries.clues} clues${r.mysteries.unmatched.length ? `, ${r.mysteries.unmatched.length} rumour clues not found` : ''}.`);
              void reload();
            }}
          >
            <RefreshCw size={14} /> Update from drafts
          </button>
        }
      />
      {!activeCampaignId && (
        <p className="text-sm text-dim">
          To track what the party knows and which clues they have found, <Link to="/campaigns" className="text-arcane">choose a campaign</Link>.
        </p>
      )}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data?.map((m) => <MysteryCard key={m.id} m={m} campaignId={activeCampaignId} onChange={reload} />)}
      {data && !data.length && <p className="text-sm text-dim">No mysteries yet. Press "Update from drafts", or add your own below.</p>}
      <div className="panel-pad grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
        <Field label="New mystery">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </Field>
        <Field label="The question">
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What will the party be trying to find out?" />
        </Field>
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            await api.post('/api/mysteries', { title, question });
            setTitle('');
            setQuestion('');
            void reload();
          }}
        >
          <Plus size={14} /> Add mystery
        </button>
      </div>
      <div className="panel-pad">
        <div className="section-title mb-2">Records with secret material</div>
        {flagged ? <EntityTable rows={flagged} /> : <Loading />}
      </div>
    </div>
  );
}

/** Secrets that involve one record, for its page. */
export function SecretsPanel({ entityId }: { entityId: string }) {
  const { activeCampaignId } = useAppState();
  const { data, reload } = useApi<Mystery[]>(`/api/mysteries${qs({ entity: entityId, campaign_id: activeCampaignId ?? undefined })}`);
  if (!data?.length) return null;
  return (
    <div className="panel p-4 space-y-2">
      <div className="section-title flex items-center justify-between">
        <span>Secrets</span>
        <Link to="/mysteries" className="text-xs text-arcane normal-case tracking-normal">
          All mysteries
        </Link>
      </div>
      {data.map((m) => (
        <div key={m.id}>
          <div className="text-xs text-dim">{m.title}</div>
          {m.secrets.map((s) => (
            <SecretCard key={s.id} s={s} campaignId={activeCampaignId} onChange={reload} compact />
          ))}
        </div>
      ))}
    </div>
  );
}
