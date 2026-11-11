import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Plus, Square, Swords } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Session, StateRow } from '../lib/types';
import { EntityLink, Field, Loading, PageHeader, ErrorBox } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { DiceRoller, EncounterTracker, NpcCard } from './DmTools';
import { NeedCampaign, useActiveOverview, type Quest } from './Campaign';
import { Markdown } from '../components/Markdown';

interface LogEntry {
  id: number;
  kind: string;
  text: string;
  entity_id: string | null;
  created_at: string;
}
interface Scene {
  id: number;
  adventure_id: number;
  title: string;
  read_aloud: string;
  body: string;
  linked_ids: string[];
}

const KINDS: [string, string][] = [
  ['note', 'Event'],
  ['npc', 'NPC'],
  ['location', 'Place'],
  ['quest', 'Quest'],
  ['loot', 'Loot'],
  ['combat', 'Combat'],
  ['scene', 'Scene'],
];

/** Simplified Live Session Mode: scene, initiative, quick log, quest updates and world changes, without leaving the page. */
export function LiveSession() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  const nav = useNavigate();
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  const live = data.sessions.find((s) => s.status === 'live');
  if (!live) {
    const planned = data.sessions.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
    return (
      <div className="max-w-xl mx-auto mt-10 panel p-6 space-y-3 text-center">
        <h1 className="text-xl text-gold">No live session</h1>
        <p className="text-sm text-dim">Start a prepared session, or create one now.</p>
        <button
          className="btn-primary"
          onClick={async () => {
            const s = planned ?? (await api.post<Session>('/api/sessions/next', { campaignId: activeCampaignId }));
            await api.post(`/api/sessions/${s.id}/start`);
            void reload();
          }}
        >
          Start session {planned ? `#${planned.number}` : '(new)'}
        </button>
      </div>
    );
  }
  return <LiveView session={live} quests={data.quests} onEnd={() => nav(`/session/${live.id}`)} />;
}

function LiveView({ session, quests, onEnd }: { session: Session; quests: Quest[]; onEnd: () => void }) {
  const { activeCampaignId } = useAppState();
  const { data: log, reload: reloadLog } = useApi<LogEntry[]>(`/api/session-log?session_id=${session.id}`);
  const { data: encs, reload: reloadEncs } = useApi<{ id: number; title: string; status: string }[]>(`/api/encounters?session_id=${session.id}`);
  const advIds = session.prep.adventureIds ?? [];
  const { data: scenes } = useApi<Scene[]>(advIds.length ? `/api/scenes?adventure_id=${advIds[0]}` : null);
  const [sceneId, setSceneId] = useState<number | null>(session.current_scene_id);
  const [encId, setEncId] = useState<number | null>(null);
  const [kind, setKind] = useState('note');
  const [text, setText] = useState('');
  const [entity, setEntity] = useState<string | null>(null);
  const [chg, setChg] = useState({ entity: null as string | null, field: 'Status', value: '' });
  const [err, setErr] = useState<string | null>(null);
  const { data: changes, reload: reloadChanges } = useApi<StateRow[]>(`/api/campaign-state?session_id=${session.id}`);
  useEffect(() => {
    if (encs && !encId) setEncId(encs.find((e) => e.status !== 'finished')?.id ?? null);
  }, [encs, encId]);
  const scene = scenes?.find((s) => s.id === sceneId);

  const addLog = async (k: string, t: string, eid: string | null = null) => {
    try {
      await api.post('/api/session-log', { session_id: session.id, kind: k, text: t, entity_id: eid });
      void reloadLog();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Live · Session ${session.number}${session.title ? `: ${session.title}` : ''}`}
        subtitle="Everything you record here feeds the recap draft and the change review."
        actions={
          <>
            <Link className="btn" to={`/session/${session.id}`}>
              Prep notes
            </Link>
            <button
              className="btn-danger"
              onClick={async () => {
                if (!confirm('End the session? You will be taken to the recap and change review.')) return;
                await api.post(`/api/sessions/${session.id}/end`);
                onEnd();
              }}
            >
              <Square size={14} /> End session
            </button>
          </>
        }
      />
      {err && <ErrorBox error={err} />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3 min-w-0">
        {/* Scene and references */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel-pad">
            <div className="section-title mb-2">Current scene</div>
            {scenes?.length ? (
              <select
                className="input mb-2"
                value={sceneId ?? ''}
                onChange={async (e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setSceneId(id);
                  await api.patch(`/api/sessions/${session.id}`, { current_scene_id: id });
                  const sc = scenes.find((s) => s.id === id);
                  if (sc) void addLog('scene', `Scene: ${sc.title}`);
                }}
              >
                <option value="">Choose a scene…</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-dim mb-2">Select adventures in session prep to pick scenes here.</p>
            )}
            {scene && (
              <>
                {scene.read_aloud && <div className="parchment p-3 font-serif text-[15px] mb-2 whitespace-pre-wrap">{scene.read_aloud}</div>}
                <Markdown text={scene.body} className="prose-lore text-[14px]" />
                <div className="flex flex-wrap gap-1 mt-1">
                  {scene.linked_ids.map((id) => (
                    <EntityLink key={id} id={id} className="text-xs" />
                  ))}
                </div>
              </>
            )}
            {session.prep.readAloud && !scene && <div className="parchment p-3 font-serif text-[15px] whitespace-pre-wrap">{session.prep.readAloud}</div>}
          </div>
          <div className="panel-pad">
            <div className="section-title mb-2">Relevant records</div>
            <div className="space-y-2">
              {(session.prep.relevantIds ?? []).map((id) => (
                <NpcCard key={id} id={id} />
              ))}
              {!(session.prep.relevantIds ?? []).length && <p className="text-xs text-dim">Add relevant NPCs and places in session prep.</p>}
            </div>
          </div>
        </div>

        {/* Combat */}
        <div className="space-y-3 min-w-0">
          <div className="panel-pad">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Swords size={15} className="text-gold" />
              <select className="input w-auto" value={encId ?? ''} onChange={(e) => setEncId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">No encounter</option>
                {encs?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.status})
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={async () => {
                  const title = prompt('Encounter name', `Encounter ${(encs?.length ?? 0) + 1}`);
                  if (!title) return;
                  const e = await api.post<{ id: number }>('/api/encounters', { title, campaign_id: activeCampaignId, session_id: session.id });
                  await reloadEncs();
                  setEncId(e.id);
                  void addLog('combat', `Combat begins: ${title}`);
                }}
              >
                <Plus size={14} /> New encounter
              </button>
            </div>
            {encId ? <EncounterTracker key={encId} encounterId={encId} compact onLog={(t) => void addLog('combat', t)} /> : <p className="text-sm text-dim">No encounter running.</p>}
          </div>
          <div className="panel-pad">
            <div className="section-title mb-2">Session log</div>
            <ul className="text-sm space-y-1 max-h-72 overflow-auto">
              {[...(log ?? [])].reverse().map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="text-[11px] text-dim w-14 shrink-0">{new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-[11px] text-dim w-14 shrink-0">{l.kind}</span>
                  <span>
                    {l.text} {l.entity_id && <EntityLink id={l.entity_id} className="text-xs" />}
                  </span>
                </li>
              ))}
              {!log?.length && <li className="text-dim">Nothing recorded yet.</li>}
            </ul>
          </div>
        </div>

        </div>
        {/* Right: recording */}
        <div className="space-y-3">
          <div className="panel-pad space-y-2">
            <div className="section-title">Record</div>
            <div className="flex flex-wrap gap-1">
              {KINDS.map(([k, l]) => (
                <button key={k} className={`chip ${kind === k ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setKind(k)}>
                  {l}
                </button>
              ))}
            </div>
            <textarea
              className="input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
                  void addLog(kind, text.trim(), entity);
                  setText('');
                }
              }}
              placeholder="What happened? (Ctrl+Enter to save)"
            />
            <EntityPicker value={entity} onChange={setEntity} placeholder="Link a record (optional)" />
            <button
              className="btn-primary w-full justify-center"
              disabled={!text.trim()}
              onClick={() => {
                void addLog(kind, text.trim(), entity);
                setText('');
                setEntity(null);
              }}
            >
              <Check size={14} /> Save to log
            </button>
          </div>
          <div className="panel-pad space-y-2">
            <div className="section-title">Quest updates</div>
            {quests
              .filter((q) => ['open', 'active'].includes(q.status))
              .map((q) => (
                <div key={q.id} className="flex items-center gap-1 text-sm">
                  <span className="flex-1 truncate">{q.title}</span>
                  {['active', 'completed', 'failed'].map((s) => (
                    <button
                      key={s}
                      className="btn-ghost text-[11px] px-1"
                      onClick={async () => {
                        await api.patch(`/api/quests/${q.id}`, { status: s });
                        void addLog('quest', `Quest “${q.title}” is now ${s}.`);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ))}
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                const t = prompt('New quest title');
                if (!t) return;
                await api.post('/api/quests', { campaign_id: activeCampaignId, title: t, status: 'active' });
                void addLog('quest', `New quest: ${t}`);
              }}
            >
              <Plus size={12} /> New quest
            </button>
          </div>
          <div className="panel-pad space-y-2">
            <div className="section-title">World change (for review)</div>
            <EntityPicker value={chg.entity} onChange={(id) => setChg({ ...chg, entity: id })} placeholder="Which record changed?" />
            <div className="grid grid-cols-2 gap-1">
              <Field label="Field">
                <input className="input" value={chg.field} onChange={(e) => setChg({ ...chg, field: e.target.value })} />
              </Field>
              <Field label="New value">
                <input className="input" value={chg.value} onChange={(e) => setChg({ ...chg, value: e.target.value })} />
              </Field>
            </div>
            <button
              className="btn w-full justify-center"
              disabled={!chg.value.trim()}
              onClick={async () => {
                await api.post('/api/campaign-state', { campaign_id: activeCampaignId, entity_id: chg.entity, field: chg.field, value: chg.value, session_id: session.id, status: 'proposed' });
                setChg({ ...chg, value: '' });
                void reloadChanges();
              }}
            >
              Record proposed change
            </button>
            <ul className="text-xs space-y-0.5">
              {changes?.map((c) => (
                <li key={c.id}>
                  {c.entity_id ? <EntityLink id={c.entity_id} /> : 'World'}: {c.field} → {c.value} <span className="text-dim">({c.status})</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel-pad">
            <div className="section-title mb-2">Dice</div>
            <DiceRoller compact />
          </div>
        </div>
      </div>
    </div>
  );
}
