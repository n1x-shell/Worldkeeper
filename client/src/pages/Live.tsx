import { useRecordTypes } from '../components/recordTypes';
import { LiveTools, ToolSection } from './LiveTools';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, Check, Dices, Eye, Flag, Globe2, Map as MapIcon, MapPin, Pin, Plus, ScrollText, Square, Swords } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Campaign, Session, StateRow } from '../lib/types';
import { ask, askText, AutoTextarea, Badge, Empty, EntityLink, Field, Loading, ErrorBox, Segmented } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { DiceRoller, EncounterTracker, type CombatStatus } from './DmTools';
import { NeedCampaign, useActiveOverview, type Quest } from './Campaign';
import { Markdown } from '../components/Markdown';
import { useDebug } from '../components/Dev';
import { useCleaners } from '../lib/packs';
import { usePeek } from '../components/peek/context';
import { RecordPeek } from '../components/peek/RecordPeek';
import { MapView, kindOf, type MapLayerSpot, type ViewPin } from '../components/map/MapView';

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
const KIND_LABEL: Record<string, string> = { ...Object.fromEntries(KINDS), roll: 'Roll', reveal: 'Reveal' };

/** Small device-only preferences (which pane, where the divider is). */
const pref = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* preference only */
    }
  },
};

/** A record's name without its "[ID]" references, as prep text has them. */
const plain = (s: string) => s.replace(/\s*\[[A-Z]+-\d+\]/g, '').trim();

/** Live Session Mode (docs/DESIGN_OVERHAUL.md §9.4): the fight and the log on the left, the scene, the map or a record on the right. */
export function LiveSession() {
  const { data, reload, activeCampaignId } = useActiveOverview();
  const nav = useNavigate();
  if (!activeCampaignId) return <NeedCampaign />;
  if (!data) return <Loading />;
  const live = data.sessions.find((s) => s.status === 'live');
  if (!live) {
    const planned = data.sessions.filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
    return (
      <div className="mx-auto mt-10 max-w-xl panel elev-1 gilt-corners p-8 text-center space-y-4">
        <Swords size={28} className="mx-auto text-gold" aria-hidden />
        <div>
          <h1 className="title-rule inline-block text-2xl text-gold">No live session</h1>
          <p className="mt-2 text-sm text-dim">
            {planned ? (
              <>
                Session {planned.number}
                {planned.title ? `: ${planned.title}` : ''} is prepared and ready to run.
              </>
            ) : (
              'Start a new session now; you can prepare it as you go.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            className="btn-primary h-10"
            onClick={async () => {
              const s = planned ?? (await api.post<Session>('/api/sessions/next', { campaignId: activeCampaignId }));
              await api.post(`/api/sessions/${s.id}/start`);
              void reload();
            }}
          >
            Start session {planned ? `#${planned.number}` : '(new)'}
          </button>
          {planned && (
            <Link className="btn h-10" to={`/session/${planned.id}`}>
              Open its prep
            </Link>
          )}
        </div>
      </div>
    );
  }
  return <LiveView session={live} campaign={data.campaign} quests={data.quests} onEnd={() => nav(`/session/${live.id}`)} />;
}

/** The element's width, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type PaneTab = 'scene' | 'map' | 'record';

function LiveView({ session, campaign, quests, onEnd }: { session: Session; campaign: Campaign; quests: Quest[]; onEnd: () => void }) {
  const { activeCampaignId } = useAppState();
  const peek = usePeek();
  const { data: log, reload: reloadLog } = useApi<LogEntry[]>(`/api/session-log?session_id=${session.id}`);
  const { data: encs, reload: reloadEncs } = useApi<{ id: number; title: string; status: string }[]>(`/api/encounters?session_id=${session.id}`);
  const advIds = session.prep.adventureIds ?? [];
  const { data: scenes } = useApi<Scene[]>(advIds.length ? `/api/scenes?adventure_id=${advIds[0]}` : null);
  const [sceneId, setSceneId] = useState<number | null>(session.current_scene_id);
  const [encId, setEncId] = useState<number | null>(null);
  const [combat, setCombat] = useState<CombatStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTabState] = useState<PaneTab>(() => (['scene', 'map', 'record'].includes(pref.get('wk.live.pane') ?? '') ? (pref.get('wk.live.pane') as PaneTab) : 'scene'));
  const setTab = (t: PaneTab) => (setTabState(t), pref.set('wk.live.pane', t));
  const [recordId, setRecordId] = useState<string | null>(null);
  useEffect(() => {
    if (encs && !encId) setEncId(encs.find((e) => e.status !== 'finished')?.id ?? null);
  }, [encs, encId]);
  useEffect(() => setCombat(null), [encId]);
  const scene = scenes?.find((s) => s.id === sceneId);

  const addLog = useCallback(
    async (k: string, t: string, eid: string | null = null) => {
      try {
        await api.post('/api/session-log', { session_id: session.id, kind: k, text: t, entity_id: eid });
        void reloadLog();
      } catch (x) {
        setErr((x as Error).message);
      }
    },
    [session.id, reloadLog],
  );
  const showRecord = (id: string) => {
    setRecordId(id);
    setTab('record');
  };

  // Two panes side by side when the canvas has room for both (it shrinks when the inspector is docked); stacked otherwise.
  const [paneBox, width] = useWidth<HTMLDivElement>();
  const split = width >= 940;
  const [ratio, setRatioState] = useState(() => {
    const r = Number(pref.get('wk.live.split'));
    return r >= 0.4 && r <= 0.75 ? r : 0.6;
  });
  const setRatio = (r: number) => {
    const v = Math.min(0.75, Math.max(0.4, r));
    setRatioState(v);
    pref.set('wk.live.split', v.toFixed(3));
  };

  const date = session.in_world_date || campaign.current_date;
  const where = session.prep.partyLocation ? plain(session.prep.partyLocation) : '';
  const pinCount = peek?.pins.length ?? 0;

  const left = (
    <div className="space-y-4 min-w-0">
      {/* The fight */}
      <section className="panel elev-1 p-3 sm:p-4 space-y-3" aria-label="Encounter">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="section-title flex items-center gap-2 mr-1">
            <Swords size={15} /> Encounter
          </h2>
          <select className="input h-10 w-auto min-w-[10rem] flex-1" value={encId ?? ''} onChange={(e) => setEncId(e.target.value ? Number(e.target.value) : null)} aria-label="Encounter">
            <option value="">No encounter</option>
            {encs?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.status})
              </option>
            ))}
          </select>
          <button
            className="btn h-10"
            onClick={async () => {
              const title = await askText({ title: 'Encounter name', initial: `Encounter ${(encs?.length ?? 0) + 1}`, confirmLabel: 'Create encounter' });
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
        {encId ? (
          <EncounterTracker key={encId} encounterId={encId} compact onLog={(t) => void addLog('combat', t)} onStatus={setCombat} />
        ) : (
          <Empty compact title="No encounter running.">
            Start one with New encounter when initiative is rolled.
          </Empty>
        )}
      </section>

      {/* Recording */}
      <LogEntryForm onSave={(k, t, e) => void addLog(k, t, e)} />
      <section className="panel elev-1" aria-label="Session log">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line/70">
          <h2 className="section-title flex items-center gap-2">
            <ScrollText size={15} /> Session log
          </h2>
          {log && log.length > 0 && <span className="text-xs text-dim num">{log.length} entries</span>}
        </div>
        {log?.length ? (
          <ol className="max-h-[26rem] overflow-y-auto divide-y divide-line/50 text-sm">
            {[...log].reverse().map((l) => (
              <li key={l.id} className="grid grid-cols-[3.25rem_4.5rem_minmax(0,1fr)] items-baseline gap-2 px-4 py-2">
                <time className="num text-[11px] text-dim" dateTime={l.created_at}>
                  {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className="text-[10px] uppercase tracking-wider text-dim truncate">{KIND_LABEL[l.kind] ?? l.kind}</span>
                <span className="min-w-0 break-words">
                  {l.text} {l.entity_id && <EntityLink id={l.entity_id} className="text-xs" />}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty compact title="Nothing recorded yet." />
        )}
      </section>
    </div>
  );

  const right = (
    <div className="space-y-4 min-w-0">
      <section className="panel elev-1 flex flex-col overflow-hidden" aria-label="Beside the fight">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2 [&_.segmented_button]:min-h-10 [&_.segmented_button]:px-4">
          <Segmented<PaneTab>
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'scene', label: 'Scene' },
              { value: 'map', label: 'Map' },
              { value: 'record', label: 'Record' },
            ]}
          />
        </div>
        <div className={`relative ${split ? 'h-[clamp(26rem,calc(100vh-15rem),56rem)]' : tab === 'map' ? 'h-[min(70vh,34rem)]' : 'max-h-[70vh]'} ${tab === 'map' ? '' : 'overflow-y-auto'}`}>
          {tab === 'scene' && (
            <ScenePane
              session={session}
              scenes={scenes ?? null}
              scene={scene ?? null}
              onScene={async (id) => {
                setSceneId(id);
                await api.patch(`/api/sessions/${session.id}`, { current_scene_id: id });
                const sc = scenes?.find((s) => s.id === id);
                if (sc) void addLog('scene', `Scene: ${sc.title}`);
              }}
              onRecord={showRecord}
            />
          )}
          {tab === 'map' && <LiveMap />}
          {tab === 'record' && <RecordPane id={recordId} onPick={setRecordId} suggestions={[...new Set([...(scene?.linked_ids ?? []), ...(session.prep.relevantIds ?? [])])]} />}
        </div>
      </section>

      {/* The secondary tools, folded so the panes keep the room. */}
      <section className="panel elev-1 overflow-hidden" aria-label="Table tools">
        <QuestUpdates quests={quests} campaignId={activeCampaignId} onLog={addLog} />
        <ToolSection id="reveal" title="Reveal to players" icon={<Eye size={15} />} defaultOpen>
          <RevealPanel sessionId={session.id} onRevealed={() => void reloadLog()} />
        </ToolSection>
        <WorldChange sessionId={session.id} campaignId={activeCampaignId} />
        <ToolSection id="dice" title="Dice" icon={<Dices size={15} />}>
          <DiceRoller compact />
        </ToolSection>
        {activeCampaignId && <LiveTools sessionId={session.id} campaignId={activeCampaignId} onLogged={() => void reloadLog()} />}
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* The session's header: which session, when and where, how the fight stands, and the session's actions. */}
      <header className="panel elev-1 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <div className="flex items-start gap-2 min-w-0">
            <span className="relative mt-2 flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
            </span>
            <h1 className="font-display text-xl text-gold leading-tight min-w-0 break-words">{`Live · Session ${session.number}${session.title ? `: ${session.title}` : ''}`}</h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
            {date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} aria-hidden /> {date}
              </span>
            )}
            {where && (
              <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full" title={where}>
                <MapPin size={13} aria-hidden className="shrink-0" /> <span className="truncate">{where}</span>
              </span>
            )}
            {combat && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-2.5 py-0.5 text-gold" aria-live="polite" title={combat.title}>
                <Swords size={12} aria-hidden />
                <span className="num font-semibold whitespace-nowrap">Round {combat.round}</span>
                {combat.turn && <span className="max-w-[12rem] truncate text-ink">· {combat.turn}&rsquo;s turn</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {peek && (
            <button
              className={`btn h-10 ${pinCount ? 'border-gold/60 text-gold' : ''}`}
              onClick={() => {
                peek.setInspectorOpen(true);
                peek.setTab('pinned');
              }}
              title={pinCount ? 'Show the pinned stat blocks in the inspector ( ] )' : 'Pin a combatant’s stat block from the tracker to keep it in the inspector ( ] )'}
            >
              <Pin size={14} /> Pinned <span className="num">({pinCount})</span>
            </button>
          )}
          <Link className="btn h-10" to={`/session/${session.id}`}>
            <BookOpen size={14} /> Prep notes
          </Link>
          <button
            className="btn-danger h-10"
            onClick={async () => {
              if (!(await ask({ title: 'End the session?', body: 'End the session? You will be taken to the recap and change review.', confirmLabel: 'End session' }))) return;
              await api.post(`/api/sessions/${session.id}/end`);
              onEnd();
            }}
          >
            <Square size={14} /> End session
          </button>
        </div>
      </header>
      {err && <ErrorBox error={err} />}
      <div ref={paneBox}>
        {split ? (
          <div className="grid items-start" style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) 1.25rem minmax(0, ${1 - ratio}fr)` }}>
            {left}
            <Divider ratio={ratio} onRatio={setRatio} box={paneBox} />
            {right}
          </div>
        ) : (
          <div className="space-y-4">
            {left}
            {right}
          </div>
        )}
      </div>
    </div>
  );
}

/** The draggable line between the panes. Arrow keys move it too. */
function Divider({ ratio, onRatio, box }: { ratio: number; onRatio: (r: number) => void; box: React.RefObject<HTMLDivElement | null> }) {
  const [drag, setDrag] = useState(false);
  const move = (e: ReactPointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!drag || !r) return;
    onRatio((e.clientX - r.left) / r.width);
  };
  const keys = (e: ReactKeyboardEvent) => {
    const d = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
    if (!d) return;
    e.preventDefault();
    onRatio(ratio + d);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the panes"
      aria-valuemin={40}
      aria-valuemax={75}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className="group sticky top-0 flex h-[min(100%,calc(100vh-10rem))] cursor-col-resize touch-none justify-center self-stretch outline-none"
      onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setDrag(true))}
      onPointerMove={move}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onDoubleClick={() => onRatio(0.6)}
      onKeyDown={keys}
      title="Drag to resize; double-click to reset"
    >
      <span className={`my-2 w-px rounded-full transition-colors motion-reduce:transition-none ${drag ? 'bg-gold w-0.5' : 'bg-line group-hover:bg-gold/70 group-focus-visible:bg-gold group-focus-visible:w-0.5'}`} />
    </div>
  );
}

/** Quick log entry: what happened, as what kind of entry, about which record. */
function LogEntryForm({ onSave }: { onSave: (kind: string, text: string, entity: string | null) => void }) {
  const [kind, setKind] = useState('note');
  const [text, setText] = useState('');
  const [entity, setEntity] = useState<string | null>(null);
  const save = () => {
    if (!text.trim()) return;
    onSave(kind, text.trim(), entity);
    setText('');
    setEntity(null);
  };
  return (
    <section className="panel elev-1 p-3 sm:p-4 space-y-2" aria-label="Record what happened">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="section-title flex items-center gap-2 mr-auto">
          <ScrollText size={15} /> Record
        </h2>
        <div className="max-w-full overflow-x-auto [&_.segmented_button]:min-h-10 [&_.segmented_button]:px-2.5">
          <Segmented size="sm" label="Kind of entry" value={kind} onChange={setKind} options={KINDS.map(([value, label]) => ({ value, label }))} />
        </div>
      </div>
      <AutoTextarea
        minRows={2}
        className="font-sans text-sm min-h-10"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
            e.preventDefault();
            onSave(kind, text.trim(), entity);
            setText('');
          }
        }}
        placeholder="What happened? (Ctrl+Enter to save)"
      />
      <div className="flex flex-wrap items-center gap-2 [&_.input]:min-h-10">
        <div className="min-w-[12rem] flex-1">
          <EntityPicker value={entity} onChange={setEntity} placeholder="Link a record (optional)" />
        </div>
        <button className="btn-primary h-10 justify-center px-4" disabled={!text.trim()} onClick={save}>
          <Check size={14} /> Save to log
        </button>
      </div>
    </section>
  );
}

/** The current scene: pick it, read it aloud, and open what it links to. */
function ScenePane({
  session,
  scenes,
  scene,
  onScene,
  onRecord,
}: {
  session: Session;
  scenes: Scene[] | null;
  scene: Scene | null;
  onScene: (id: number | null) => void;
  onRecord: (id: string) => void;
}) {
  const prepScenes = session.prep.scenes?.trim();
  return (
    <div className="p-4 space-y-4">
      {scenes?.length ? (
        <select className="input h-10" value={scene?.id ?? ''} onChange={(e) => onScene(e.target.value ? Number(e.target.value) : null)} aria-label="Current scene">
          <option value="">Choose a scene…</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      ) : null}
      {scene ? (
        <article className="space-y-3">
          <h2 className="title-rule text-xl">{scene.title}</h2>
          {scene.read_aloud && <ReadAloud text={scene.read_aloud} />}
          <Markdown text={scene.body} className="prose-lore max-w-[72ch]" />
          {scene.linked_ids.length > 0 && <RecordChips ids={scene.linked_ids} onPick={onRecord} label="In this scene" />}
        </article>
      ) : (
        <>
          {session.prep.readAloud && <ReadAloud text={session.prep.readAloud} />}
          {prepScenes ? (
            <div>
              <h3 className="section-title mb-1">Scenes from prep</h3>
              <Markdown text={prepScenes} className="prose-lore max-w-[72ch]" />
            </div>
          ) : (
            !session.prep.readAloud && (
              <Empty compact title={scenes?.length ? 'No scene chosen yet.' : 'No scenes to pick.'}>
                {scenes?.length ? 'Choose the scene the party is in.' : 'Select adventures in session prep to pick scenes here.'}
              </Empty>
            )
          )}
          {(session.prep.relevantIds ?? []).length > 0 && <RecordChips ids={session.prep.relevantIds} onPick={onRecord} label="Relevant records" />}
        </>
      )}
    </div>
  );
}

function ReadAloud({ text }: { text: string }) {
  return (
    <figure className="parchment p-4">
      <figcaption className="mb-1 text-[10px] font-sans uppercase tracking-[0.2em] opacity-70">Read aloud</figcaption>
      <div className="font-serif text-[17px] leading-relaxed whitespace-pre-wrap max-w-[68ch]">{text}</div>
    </figure>
  );
}

/** Records as buttons that open them in the Record pane. */
function RecordChips({ ids, onPick, label, active }: { ids: string[]; onPick: (id: string) => void; label: string; active?: string | null }) {
  const recordTypes = useRecordTypes();
  const { index } = useAppState();
  return (
    <div>
      <h3 className="section-title mb-1.5">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const e = index.get(id);
          return (
            <button
              key={id}
              type="button"
              data-peek={id}
              aria-pressed={active === id}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${active === id ? 'border-gold/70 bg-gold/15 text-gold' : 'border-line bg-raised text-ink hover:border-gold/60 hover:text-gold'}`}
              onClick={() => onPick(id)}
            >
              {e?.name ?? id}
              {e && <span className="text-[10px] uppercase tracking-wider text-dim">{recordTypes.label(e.type)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Any record, read right here (the same view as split view). */
function RecordPane({ id, onPick, suggestions }: { id: string | null; onPick: (id: string | null) => void; suggestions: string[] }) {
  return (
    <div className="p-4 space-y-4">
      <div className="[&_.input]:min-h-10">
        <EntityPicker value={null} onChange={(v) => v && onPick(v)} placeholder="Open a record…" />
      </div>
      {suggestions.length > 0 && <RecordChips ids={suggestions.slice(0, 16)} onPick={onPick} label="From the prep and the scene" active={id} />}
      {id ? (
        <div className="border-t border-line/70 pt-4">
          <RecordPeek key={id} id={id} mode="beside" onClose={() => onPick(null)} />
        </div>
      ) : (
        <Empty compact title="No record open.">
          Search for any record above to read it beside the fight.
        </Empty>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the party's map
interface MapRow {
  id: number;
  name: string;
  parent_map_id: number | null;
  image_file: string | null;
  width: number;
  height: number;
  scale_miles?: number | null;
}
interface MapDetail {
  map: MapRow;
  markers: { id: number; entity_id: string | null; entity_name?: string | null; entity_type?: string | null; label: string; x: number; y: number; hidden: boolean; child_map_id: number | null }[];
  shapes: { id: number; kind: string; label: string; color: string; points: [number, number][]; entity_id: string | null }[];
}
interface Exploration {
  discovered: string[];
  trail: { x: number; y: number; label: string }[];
}

/** The party's map, read-only: where the party is, the campaign's layers, and a peek at any pin. */
function LiveMap() {
  const recordTypes = useRecordTypes();
  const peek = usePeek();
  const nav = useNavigate();
  const { data: maps, error } = useApi<MapRow[]>('/api/maps');
  const ordered = useMemo(() => [...(maps ?? [])].sort((a, b) => Number(a.parent_map_id != null) - Number(b.parent_map_id != null) || a.id - b.id), [maps]);
  const [chosen, setChosenState] = useState<number | null>(() => Number(pref.get('wk.live.map')) || null);
  const setChosen = (id: number) => (setChosenState(id), pref.set('wk.live.map', String(id)));
  // Where the party is: the first map with a trail on it.
  const [partyMap, setPartyMap] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!ordered.length) return;
    let on = true;
    void (async () => {
      for (const m of ordered.slice(0, 12)) {
        const ex = await api.get<Exploration>(`/api/exploration?map_id=${m.id}`).catch(() => null);
        if (ex?.trail.length) return on && setPartyMap(m.id);
      }
      if (on) setPartyMap(null);
    })();
    return () => {
      on = false;
    };
  }, [ordered]);
  const current = chosen && ordered.some((m) => m.id === chosen) ? chosen : partyMap === undefined ? null : (partyMap ?? ordered[0]?.id ?? null);
  const { data } = useApi<MapDetail>(current ? `/api/maps/${current}/detail` : null);
  const { data: ex } = useApi<Exploration>(current ? `/api/exploration?map_id=${current}` : null);
  const { data: layers } = useApi<MapLayerSpot[]>(current ? `/api/map-layers?map_id=${current}` : null);
  const [selected, setSelected] = useState<string | null>(null);
  const pins: ViewPin[] = useMemo(
    () =>
      (data?.markers ?? []).map((mk) => ({
        id: mk.id,
        label: mk.label || mk.entity_name || '',
        x: mk.x,
        y: mk.y,
        entity_id: mk.entity_id,
        child_map_id: mk.child_map_id,
        kind: kindOf(mk.entity_type ?? undefined, recordTypes),
        typeLabel: mk.entity_type ? recordTypes.label(mk.entity_type) : undefined,
        hidden: mk.hidden,
      })),
    [data],
  );
  const exploration = useMemo(() => (ex ? { discovered: new Set(ex.discovered.map(String)), trail: ex.trail } : null), [ex]);
  if (error) return <ErrorBox error={error} />;
  if (maps && !maps.length)
    return (
      <div className="p-4">
        <Empty compact title="No maps yet." action={<Link to="/atlas">Open the Atlas</Link>} />
      </div>
    );
  const m = data?.map;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2 text-xs">
        <MapIcon size={14} className="text-gold" aria-hidden />
        <select className="input h-10 w-auto min-w-0 max-w-[14rem] text-sm" value={current ?? ''} onChange={(e) => setChosen(Number(e.target.value))} aria-label="Map">
          {ordered.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.id === partyMap ? ' (the party)' : ''}
            </option>
          ))}
        </select>
        <span className="min-w-0 flex-1 truncate text-dim">{ex?.trail.length ? `The party: ${ex.trail[ex.trail.length - 1].label || 'on the road'}` : 'The party isn’t on this map.'}</span>
        {current && (
          <Link className="btn h-10 text-xs" to={`/atlas/explore/${current}`} title="Open this map in the Atlas">
            <Globe2 size={13} /> Atlas
          </Link>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        {m ? (
          <MapView
            key={m.id}
            map={{ id: m.id, name: m.name, width: m.width, height: m.height, imageUrl: m.image_file ? `/api/uploads/${m.image_file}` : null }}
            maps={[]}
            mapHref={(x) => `/atlas/explore/${x}`}
            back={{ href: `/atlas/explore/${m.id}`, label: 'Atlas' }}
            contained
            pins={pins}
            shapes={data.shapes}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              if (id) peek?.peek(id);
            }}
            onChildMap={setChosen}
            codex={null}
            exploration={exploration}
            fog="dim"
            notesKey="gm"
            layers={layers ?? null}
            scaleMiles={m.scale_miles ?? null}
            onOpenLink={(href) => nav(href)}
          />
        ) : (
          <Loading label="Opening the map…" />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the folded tools
function QuestUpdates({ quests, campaignId, onLog }: { quests: Quest[]; campaignId: number | null; onLog: (k: string, t: string) => Promise<void> }) {
  const open = quests.filter((q) => ['open', 'active'].includes(q.status));
  const [status, setStatus] = useState<Record<number, string>>({});
  return (
    <ToolSection
      id="quests"
      title="Quest updates"
      icon={<Flag size={15} />}
      aside={`${open.length} open`}
      defaultOpen
      actions={
        <button
          className="btn-ghost h-10 text-xs"
          onClick={async () => {
            const t = await askText({ title: 'New quest title', confirmLabel: 'Create quest' });
            if (!t) return;
            await api.post('/api/quests', { campaign_id: campaignId, title: t, status: 'active' });
            void onLog('quest', `New quest: ${t}`);
          }}
        >
          <Plus size={12} /> New quest
        </button>
      }
    >
      {open.length ? (
        <ul className="space-y-1">
          {open.map((q) => {
            const now = status[q.id] ?? q.status;
            return (
              <li key={q.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="min-w-0 flex-1 truncate" title={q.title}>
                  {q.title}
                </span>
                <div className="flex gap-1">
                  {(
                    [
                      ['active', 'active', 'border-arcane/60 bg-arcane/10 text-arcane'],
                      ['completed', 'completed', 'border-ok/60 bg-ok/10 text-ok'],
                      ['failed', 'failed', 'border-danger/60 bg-danger/10 text-danger'],
                    ] as const
                  ).map(([s, label, tone]) => (
                    <button
                      key={s}
                      aria-pressed={now === s}
                      className={`h-10 rounded-md border px-2 text-[11px] transition-colors ${now === s ? tone : 'border-line text-dim hover:border-gold/60 hover:text-gold'}`}
                      onClick={async () => {
                        await api.patch(`/api/quests/${q.id}`, { status: s });
                        setStatus((x) => ({ ...x, [q.id]: s }));
                        void onLog('quest', `Quest “${q.title}” is now ${s}.`);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-dim">No open quests.</p>
      )}
    </ToolSection>
  );
}

function WorldChange({ sessionId, campaignId }: { sessionId: number; campaignId: number | null }) {
  const [chg, setChg] = useState({ entity: null as string | null, field: 'Status', value: '' });
  const { data: changes, reload } = useApi<StateRow[]>(`/api/campaign-state?session_id=${sessionId}`);
  return (
    <ToolSection id="change" title="World change (for review)" icon={<Globe2 size={15} />} aside={changes?.length ? `${changes.length} recorded` : undefined}>
      <div className="space-y-2 [&_.input]:min-h-10">
        <EntityPicker value={chg.entity} onChange={(id) => setChg({ ...chg, entity: id })} placeholder="Which record changed?" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Field">
            <input className="input" value={chg.field} onChange={(e) => setChg({ ...chg, field: e.target.value })} />
          </Field>
          <Field label="New value">
            <input className="input" value={chg.value} onChange={(e) => setChg({ ...chg, value: e.target.value })} />
          </Field>
        </div>
        <button
          className="btn h-10 w-full justify-center"
          disabled={!chg.value.trim()}
          onClick={async () => {
            await api.post('/api/campaign-state', { campaign_id: campaignId, entity_id: chg.entity, field: chg.field, value: chg.value, session_id: sessionId, status: 'proposed' });
            setChg({ ...chg, value: '' });
            void reload();
          }}
        >
          Record proposed change
        </button>
        {changes && changes.length > 0 && (
          <ul className="text-xs space-y-1">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1">
                {c.entity_id ? <EntityLink id={c.entity_id} /> : 'World'}: {c.field} → {c.value}{' '}
                <Badge tone={c.status === 'proposed' ? 'arcane' : c.status === 'active' || c.status === 'promoted' ? 'ok' : 'dim'}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ToolSection>
  );
}

interface RevealEntity {
  id: string;
  name: string;
  revealed: boolean;
  revealed_sections: string[];
  revealed_facts: string[];
  canon_flags: string[];
  pack_id: string | null;
}

/** Reveal information to players without leaving live mode. Every reveal is logged to the session. */
function RevealPanel({ sessionId, onRevealed }: { sessionId: number; onRevealed: () => void }) {
  const debug = useDebug();
  const [id, setId] = useState<string | null>(null);
  const cleanerFor = useCleaners();
  const { data, reload } = useApi<{ entity: RevealEntity; sections: { heading: string; secret: boolean }[] }>(id ? `/api/entities/${encodeURIComponent(id)}` : null);
  const [fact, setFact] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reveal = async (body: Record<string, unknown>, done: string) => {
    if (!id) return;
    try {
      await api.post(`/api/entities/${encodeURIComponent(id)}/reveal`, { ...body, session_id: sessionId });
      setMsg(done);
      setErr(null);
      await reload();
      onRevealed();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const e = data?.entity;
  return (
    <div className="space-y-2 [&_.input]:min-h-10">
      <EntityPicker value={id} onChange={(v) => (setId(v), setMsg(null), setErr(null))} placeholder="What did they learn about?" />
      {err && <div className="text-xs text-danger">{err}</div>}
      {msg && (
        <div className="text-xs text-ok" role="status">
          {msg}
        </div>
      )}
      {e && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={e.revealed ? 'ok' : 'dim'}>{e.revealed ? 'Known to players' : 'Unknown to players'}</Badge>
            {!e.revealed && (
              <button className="btn h-10 text-xs ml-auto" onClick={() => reveal({ revealed: true }, `${e.name} is now known to players.`)}>
                Reveal that it exists
              </button>
            )}
          </div>
          {e.canon_flags.includes('SECRET') && <div className="text-[11px] text-warn">Contains secrets: check a section before revealing it.</div>}
          <div className="flex flex-wrap gap-1.5">
            {data!.sections
              .filter((s) => s.heading && (debug || !cleanerFor(e.pack_id).editorial(s.heading)))
              .map((s) => {
                const shown = e.revealed_sections.includes(s.heading);
                return (
                  <button
                    key={s.heading}
                    disabled={s.secret || shown}
                    title={s.secret ? 'GM-only sections cannot be published; write a fact instead' : shown ? 'Already revealed' : 'Reveal this section'}
                    className={`chip min-h-8 px-2.5 ${shown ? 'border-ok/60 text-ok' : s.secret ? 'border-line text-dim opacity-50' : 'border-line text-ink hover:border-gold'}`}
                    onClick={() => reveal({ section: s.heading }, `Revealed “${s.heading}”.`)}
                  >
                    {shown ? '✓ ' : ''}
                    {s.heading}
                  </button>
                );
              })}
          </div>
          <div className="flex gap-1.5">
            <input className="input" value={fact} onChange={(ev) => setFact(ev.target.value)} placeholder="A fact they learned, in your words" onKeyDown={(ev) => ev.key === 'Enter' && fact.trim() && (reveal({ fact: fact.trim() }, 'Fact revealed.'), setFact(''))} />
            <button
              className="btn-primary h-10"
              disabled={!fact.trim()}
              onClick={() => {
                void reveal({ fact: fact.trim() }, 'Fact revealed.');
                setFact('');
              }}
            >
              Reveal
            </button>
          </div>
          {e.revealed_facts.length > 0 && (
            <ul className="text-xs text-dim list-disc pl-4">
              {e.revealed_facts.slice(-4).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
