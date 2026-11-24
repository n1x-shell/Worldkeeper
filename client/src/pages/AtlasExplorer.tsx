import { useRecordTypes } from '../components/recordTypes';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Columns2, ExternalLink, Eye, EyeOff, Flag, MapPin, PanelRight, PenLine, Trash2, X } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { CampaignChips, useMapReveals } from '../components/MapReveals';
import { useAppState } from '../lib/store';
import { displaySections } from '../lib/sections';
import { useCleaners } from '../lib/packs';
import { Markdown } from '../components/Markdown';
import { Badge, Empty, ErrorBox, GmOnly, Loading, RealmBadge, Section, Toggle, TypeBadge, VisibilityBadge, ask } from '../components/ui';
import { usePeek } from '../components/peek/context';
import { MapView, kindOf, type ViewPin } from '../components/map/MapView';
import { OutlineEditor, type Pt } from '../components/map/OutlineEditor';
import { SECRET_HEADING_RE, type Entity } from '../../../shared/domain';
import { RegionPanel } from '../components/map/RegionPanel';
import { useSidebarSlot } from '../components/sidebarSlot';
import { JourneyDialog, type JourneyTarget } from '../components/map/JourneyDialog';
import type { MapLayerSpot } from '../components/map/MapView';

/** Kinds of record that get the region panel (terrain, campaign state, places, encounter tables). */

/**
 * The GM's full-screen Atlas: the same map view as the players' handbook, plus the GM's tools. Drag pins to move
 * them, place unplaced locations, choose what players can see, and, for the active campaign, mark places discovered
 * and move the party. Players see fog of war and the party only while a session is live.
 */

interface MapRow {
  id: number;
  name: string;
  parent_map_id: number | null;
  entity_id: string | null;
  image_file: string | null;
  width: number;
  height: number;
  /** Miles across (the image's width), for distances and travel times. */
  scale_miles?: number | null;
}
interface MarkerRow {
  id: number;
  entity_id: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  label: string;
  x: number;
  y: number;
  hidden: boolean;
  child_map_id: number | null;
}
interface ShapeRow {
  id: number;
  kind: string;
  label: string;
  color: string;
  points: [number, number][];
  entity_id: string | null;
  hidden: boolean;
}
interface Detail {
  map: MapRow;
  markers: MarkerRow[];
  shapes: ShapeRow[];
}
interface Exploration {
  campaign_id: number;
  live: boolean;
  discovered: string[];
  trail: {
    id: number;
    entity_id: string | null;
    x: number;
    y: number;
    label: string;
  }[];
}
/** An outline being drawn or reshaped. */
interface Outline {
  entityId: string;
  label: string;
  shapeId: number | null;
  points: Pt[];
  drawing: boolean;
  history: Pt[][];
}
interface Unplaced {
  id: string;
  name: string;
  type: string;
}

function GmCodex({
  id,
  mapId,
  marker,
  outline,
  exploration,
  onClose,
  onChange,
  onOutline,
  onPick,
  onTravel,
}: {
  onPick: (id: string) => void;
  /** Travel to this place (the journey dialog). */
  onTravel: (to: JourneyTarget) => void;
  id: string;
  mapId: number;
  marker?: MarkerRow;
  outline?: ShapeRow;
  exploration: Exploration | null;
  onClose: () => void;
  onChange: (ex?: Exploration) => void;
  onOutline: (how: 'draw' | 'edit', name: string) => void;
}) {
  const recordTypes = useRecordTypes();
  const { debug } = useAppState();
  const cleanerFor = useCleaners();
  const peek = usePeek();
  const { data } = useApi<{ entity: Entity }>(`/api/entities/${encodeURIComponent(id)}`);
  const { data: reveals, reload: reloadReveals } = useMapReveals(mapId);
  const many = (reveals?.choices.length ?? 0) >= 2;
  const [err, setErr] = useState<string | null>(null);
  const e = data?.entity;
  const run = async (f: () => Promise<Exploration | unknown>, isEx = false) => {
    try {
      setErr(null);
      const r = await f();
      onChange(isEx ? (r as Exploration) : undefined);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  if (!e) return <Loading />;
  const discovered = exploration?.discovered.includes(id) ?? false;
  const sections = displaySections(e.body, debug, cleanerFor(e.pack_id));
  return (
    <div className="flex flex-col h-full" aria-label={e.name}>
      {/* The same header as the inspector's: badges, the name, then Open, Peek and Open beside. */}
      <header className="space-y-2 px-4 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
            <TypeBadge type={e.type} />
            <RealmBadge realm={e.realm} />
            <VisibilityBadge revealed={e.revealed} />
            {marker?.hidden && (
              <Badge tone="danger" icon={<EyeOff size={11} />} title="This pin is hidden from players">
                Pin hidden
              </Badge>
            )}
            {exploration && marker && discovered && <Badge tone="gold">Discovered</Badge>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5 -mr-1.5 -mt-1" aria-label="Close" title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
        <h2 className="font-display text-2xl text-gold leading-tight">{e.name}</h2>
        <div className="flex flex-wrap gap-1.5">
          <Link to={`/e/${encodeURIComponent(e.id)}`} className="btn text-xs">
            <ExternalLink size={13} /> Open
          </Link>
          {peek && (
            <>
              <button type="button" className="btn text-xs" onClick={() => peek.peek(e.id)} title="Read it in the inspector, beside the map">
                <PanelRight size={13} /> Peek
              </button>
              <button type="button" className="btn text-xs" onClick={() => peek.openBeside(e.id)} title="Open its record in split view, beside the map">
                <Columns2 size={13} /> Open beside
              </button>
            </>
          )}
        </div>
      </header>
      {/* The GM's tools for this place on this map. */}
      <div className="px-4 py-3 border-b border-line bg-raised/40">
        <div className="section-title text-[11px] mb-2">On this map</div>
        <div className="flex flex-wrap gap-1.5">
          {marker && (
            <button
              type="button"
              className="btn text-xs"
              aria-pressed={!marker.hidden}
              onClick={() =>
                run(() =>
                  api.patch(`/api/markers/${marker.id}`, {
                    hidden: !marker.hidden,
                  }),
                )
              }
            >
              {marker.hidden ? <EyeOff size={13} /> : <Eye size={13} />} {marker.hidden ? (many ? 'Not shown to everyone' : 'Hidden from players') : many ? 'Shown to everyone' : 'Shown to players'}
            </button>
          )}
          {marker && <CampaignChips reveals={reveals} kind="marker" refId={marker.id} everyone={!marker.hidden} onChange={() => void reloadReveals()} />}
          {outline ? (
            <>
              <button type="button" className="btn text-xs" onClick={() => onOutline('edit', e.name)}>
                <PenLine size={13} /> Reshape its outline
              </button>
              <button type="button" className="btn text-xs" onClick={() => onOutline('draw', e.name)}>
                Redraw it
              </button>
              <button
                type="button"
                className="btn text-xs"
                onClick={async () => {
                  if (await ask({ body: `Remove the outline of ${e.name}?`, danger: true, confirmLabel: 'Remove' })) void run(() => api.del(`/api/shapes/${outline.id}`));
                }}
              >
                <Trash2 size={13} /> Remove outline
              </button>
            </>
          ) : (
            <button type="button" className="btn text-xs" onClick={() => onOutline('draw', e.name)}>
              <PenLine size={13} /> Draw its outline
            </button>
          )}
          {exploration && marker && (
            <>
              <button
                type="button"
                className={`btn text-xs ${discovered ? 'border-gold/70 text-gold' : ''}`}
                aria-pressed={discovered}
                onClick={() =>
                  run(
                    () =>
                      api.post('/api/exploration/discover', {
                        campaign_id: exploration.campaign_id,
                        map_id: mapId,
                        entity_id: id,
                        discovered: !discovered,
                      }),
                    true,
                  )
                }
              >
                {discovered ? 'Discovered by the party' : 'Not yet discovered'}
              </button>
              <button type="button" className="btn text-xs" onClick={() => onTravel({ entity_id: id, x: marker.x, y: marker.y, label: e.name })}>
                <Flag size={13} /> Travel here
              </button>
            </>
          )}
        </div>
        {err && <p className="text-danger text-xs mt-2">{err}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {recordTypes.get(e.type)?.traits.regionLike && <RegionPanel id={e.id} onPick={onPick} />}
        {e.player_summary && (
          <Section title="What players read">
            <Markdown text={e.player_summary} className="prose-lore prose-peek" />
          </Section>
        )}
        {sections.map((s, i) => {
          const inner = (
            <section>
              {s.heading && <h3 className="section-title mb-1">{s.heading}</h3>}
              <Markdown text={s.content} className="prose-lore prose-peek" />
            </section>
          );
          return s.secret || SECRET_HEADING_RE.test(s.heading) ? (
            <GmOnly key={i} label={/\b(gm|dm) only\b/i.test(s.heading) ? null : undefined}>
              {inner}
            </GmOnly>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-line flex items-center gap-2">
        <Link to={`/e/${encodeURIComponent(e.id)}`} className="text-sm text-arcane hover:text-gold inline-flex items-center gap-1">
          Open its record <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

export function AtlasExplorer() {
  const recordTypes = useRecordTypes();
  const { mapId } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { data: mapList, error: listErr } = useApi<MapRow[]>('/api/maps');
  const current = mapId ? Number(mapId) : mapList?.find((m) => m.parent_map_id == null)?.id;
  const { data, reload, setData } = useApi<Detail>(current ? `/api/maps/${current}/detail` : null);
  const { data: status } = useApi<{
    active_campaign_id: number | null;
    in_play: { campaignId: number; sessionId: number } | null;
  }>('/api/exploration/status');
  const { data: ex, reload: reloadEx, setData: setEx } = useApi<Exploration>(current && status?.active_campaign_id ? `/api/exploration?map_id=${current}` : null);
  // The app's sidebar, to hold the legend while it is open.
  const sidebarSlot = useSidebarSlot();
  // The campaign on the map: quests, adventure places, people, prepared encounters.
  const { data: layers } = useApi<MapLayerSpot[]>(current && status?.active_campaign_id ? `/api/map-layers?map_id=${current}` : null);
  const { data: unplaced, reload: reloadUnplaced } = useApi<Unplaced[]>(data ? `/api/maps/unplaced${data.map.entity_id ? `?scope=${encodeURIComponent(data.map.entity_id)}` : ''}` : null);
  const [placing, setPlacing] = useState<{
    prompt: string;
    onPlace: (x: number, y: number) => void;
  } | null>(null);
  const [showFog, setShowFog] = useState(true);
  const [showOutlines, setShowOutlines] = useState(false);
  const [journeyTo, setJourneyTo] = useState<JourneyTarget | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const selected = sp.get('place');

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
    [data, recordTypes],
  );
  const exploration = useMemo(() => (ex && showFog ? { discovered: new Set(ex.discovered.map(String)), trail: ex.trail } : null), [ex, showFog]);

  // While an outline is open: Ctrl+Z undoes, Enter finishes or saves, Escape cancels.
  useEffect(() => {
    if (!outline) return;
    const k = (ev: KeyboardEvent) => {
      // Not while a dialog (such as "Throw away the changes?") is open over the map.
      if (document.querySelector('[data-overlay]')) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        undoOutline();
      } else if (ev.key === 'Escape') void cancelOutline();
      else if (ev.key === 'Enter' && !(ev.target instanceof HTMLTextAreaElement)) {
        if (outline.drawing) finishDrawing();
        else void saveOutline();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (listErr) return <ErrorBox error={listErr} />;
  if (!mapList) return <Loading />;
  if (!mapList.length || !current)
    return (
      <div className="p-6">
        <Empty
          title="There are no maps yet."
          action={
            <Link to="/atlas" className="btn-primary">
              Open the Atlas
            </Link>
          }
        >
          Add one in the Atlas, or apply the Worldkeeper additions.
        </Empty>
      </div>
    );
  if (!data) return <Loading />;
  const m = data.map;
  const select = (id: string | null) => {
    const next = new URLSearchParams(sp);
    if (id) next.set('place', id);
    else next.delete('place');
    setSp(next, { replace: true });
  };
  const act = async (f: () => Promise<unknown>) => {
    try {
      setErr(null);
      await f();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const travelTo = (x: number, y: number) => {
    setPlacing(null);
    setJourneyTo({ x: Math.round(x), y: Math.round(y), label: '' });
  };
  const saveScale = (v: string) =>
    act(async () => {
      const n = v.trim() === '' ? null : Number(v);
      if (n != null && !(n > 0)) throw new Error('The scale is a number of miles, more than 0.');
      await api.patch(`/api/maps/${m.id}`, { scale_miles: n });
      await reload();
    });
  const placePin = (u: Unplaced) =>
    setPlacing({
      prompt: `Click the map to place ${u.name}.`,
      onPlace: (x, y) =>
        void act(async () => {
          await api.post('/api/markers', {
            map_id: m.id,
            entity_id: u.id,
            label: u.name,
            x,
            y,
            layer: 'Locations',
            category: 'location',
            hidden: true,
          });
          setPlacing(null);
          await Promise.all([reload(), reloadUnplaced()]);
          select(u.id);
        }),
    });
  const marker = selected ? data.markers.find((mk) => mk.entity_id === selected) : undefined;
  const outlineOf = (id: string) => data.shapes.find((sh) => sh.kind === 'region' && sh.entity_id === id);

  function startOutline(how: 'draw' | 'edit', name: string) {
    if (!selected) return;
    const sh = outlineOf(selected);
    setPlacing(null);
    setOutline({
      entityId: selected,
      label: name,
      shapeId: sh?.id ?? null,
      points: how === 'edit' && sh ? sh.points : [],
      drawing: how === 'draw',
      history: [],
    });
  }
  function changeOutline(points: Pt[]) {
    setOutline((o) => (o ? { ...o, points, history: [...o.history, o.points].slice(-200) } : o));
  }
  function undoOutline() {
    setOutline((o) =>
      o && o.history.length
        ? {
            ...o,
            points: o.history[o.history.length - 1],
            history: o.history.slice(0, -1),
          }
        : o,
    );
  }
  function finishDrawing() {
    setOutline((o) => (o && o.points.length >= 3 ? { ...o, drawing: false } : o));
  }
  async function cancelOutline() {
    if (outline?.history.length && !(await ask({ body: 'Throw away the changes to this outline?', danger: true, confirmLabel: 'Throw away' }))) return;
    setOutline(null);
  }
  async function saveOutline() {
    const o = outline;
    if (!o) return;
    if (o.points.length < 3) return setErr('An outline needs at least three corners.');
    await act(async () => {
      if (o.shapeId) await api.patch(`/api/shapes/${o.shapeId}`, { points: o.points });
      else
        await api.post('/api/shapes', {
          map_id: m.id,
          kind: 'region',
          label: o.label,
          color: '#e8edf5',
          entity_id: o.entityId,
          points: o.points,
          layer: 'Regions',
          hidden: false,
        });
      await reload();
      setOutline(null);
    });
  }
  const outlineBanner = outline && (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>
        {outline.drawing ? (
          <>
            Drawing <b className="text-gold">{outline.label}</b>: click to drop corners, or hold and drag to sketch. Click the first corner to close it.
          </>
        ) : (
          <>
            Reshaping <b className="text-gold">{outline.label}</b>: drag a corner to move it, click a small handle to add one, right-click a corner to remove it.
          </>
        )}
      </span>
      <span className="flex gap-2">
        <button type="button" className="text-gold underline disabled:opacity-40 disabled:no-underline" disabled={!outline.history.length} onClick={undoOutline}>
          Undo
        </button>
        {outline.drawing ? (
          <button type="button" className="text-gold underline disabled:opacity-40 disabled:no-underline" disabled={outline.points.length < 3} onClick={finishDrawing}>
            Finish
          </button>
        ) : (
          <>
            <button
              type="button"
              className="text-gold underline"
              onClick={() =>
                setOutline((o) =>
                  o
                    ? {
                        ...o,
                        points: [],
                        drawing: true,
                        history: [...o.history, o.points],
                      }
                    : o,
                )
              }
            >
              Start again
            </button>
            <button type="button" className="text-gold underline font-semibold" onClick={() => void saveOutline()}>
              Save
            </button>
          </>
        )}
        <button type="button" className="text-gold underline" onClick={() => void cancelOutline()}>
          Cancel
        </button>
      </span>
    </span>
  );
  const live = !!status?.in_play;

  const tools = (
    <div className="border-t border-line px-4 py-3 space-y-3 text-sm">
      <div className="section-title">GM tools</div>
      {err && <p className="text-danger text-xs">{err}</p>}
      <label className="flex items-center gap-2 text-xs" title="How far it is from the map's left edge to its right edge. Distances, the ruler and travel times use it.">
        <span>Scale</span>
        <input
          key={`${m.id}-${m.scale_miles ?? ''}`}
          className="input w-24 py-1 num"
          type="number"
          min={1}
          defaultValue={m.scale_miles ?? ''}
          placeholder="miles"
          onBlur={(e) => e.target.value !== String(m.scale_miles ?? '') && saveScale(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-dim">miles across</span>
      </label>
      {status?.active_campaign_id ? (
        <div className="space-y-2">
          <div className="text-xs text-dim">{live ? 'A session is live: players see fog of war and the party now.' : 'No session is live: players see the whole map until one starts.'}</div>
          <Toggle checked={showFog} onChange={setShowFog}>
            Show the party&apos;s fog here
          </Toggle>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn text-xs"
              onClick={() =>
                setPlacing({
                  prompt: 'Click the map where the party is.',
                  onPlace: travelTo,
                })
              }
            >
              <Flag size={13} /> Travel to a point
            </button>
            {!!ex?.trail.length && (
              <button
                type="button"
                className="btn text-xs"
                onClick={async () => {
                  if (await ask({ body: 'Clear the whole trail on this map?', danger: true, confirmLabel: 'Clear' }))
                    void act(async () => setEx(await api.del<Exploration>(`/api/exploration/trail?map_id=${m.id}`)));
                }}
              >
                Clear the trail
              </button>
            )}
          </div>
          {!!ex?.trail.length && (
            <ol className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {ex.trail.map((t, i) => (
                <li key={t.id} className="flex items-center gap-1">
                  <span className="text-dim w-5">{i + 1}.</span>
                  <span className="flex-1 truncate">{t.label || 'A point on the map'}</span>
                  <button
                    type="button"
                    className="text-dim hover:text-danger p-0.5"
                    aria-label="Remove stop"
                    onClick={() => act(async () => setEx(await api.del<Exploration>(`/api/exploration/travel/${t.id}`)))}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p className="text-xs text-dim">
          Choose an active campaign to track what the party has discovered and where it has been.{' '}
          <Link to="/campaigns" className="text-arcane">
            Campaigns
          </Link>
        </p>
      )}
      <div className="space-y-1">
        <Toggle checked={showOutlines} onChange={setShowOutlines}>
          Show every outline
        </Toggle>
        <p className="text-xs text-dim">To draw a place's outline, open it and choose Draw its outline.</p>
      </div>
      <div>
        <div className="text-xs text-dim mb-1">Drag a pin to move it. Not on this map yet:</div>
        {unplaced?.length ? (
          <ul className="text-xs space-y-0.5 max-h-48 overflow-y-auto">
            {unplaced.map((u) => (
              <li key={u.id}>
                <button type="button" className="w-full text-left flex items-center gap-1.5 hover:text-gold" onClick={() => placePin(u)}>
                  <MapPin size={12} className="text-dim" /> {u.name} <span className="text-dim">({recordTypes.label(u.type)})</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dim">Every place here has a pin.</p>
        )}
      </div>
    </div>
  );

  const lastStop = ex?.trail.at(-1) ?? null;
  return (
    <>
      {journeyTo && status?.active_campaign_id && (
        <JourneyDialog
          campaignId={status.active_campaign_id}
          map={m}
          from={lastStop ? { x: lastStop.x, y: lastStop.y, label: lastStop.label } : null}
          to={journeyTo}
          onClose={() => setJourneyTo(null)}
          onDone={(next) => (setEx(next as Exploration), void reloadEx())}
        />
      )}
      <MapView
        key={m.id}
        map={{
          id: m.id,
          name: m.name,
          width: m.width,
          height: m.height,
          imageUrl: m.image_file ? `/api/uploads/${m.image_file}` : null,
        }}
        maps={[...mapList].sort((a, b) => a.id - b.id).map((x) => ({ id: x.id, name: x.name }))}
        mapHref={(x) => `/atlas/explore/${x}`}
        contained
        back={{ href: `/atlas/${m.id}`, label: 'Atlas' }}
        pins={pins}
        shapes={data.shapes}
        selected={selected}
        onSelect={select}
        onChildMap={(x) => nav(`/atlas/explore/${x}`)}
        codex={
          selected && !outline ? (
            <GmCodex
              key={selected}
              id={selected}
              mapId={m.id}
              marker={marker}
              outline={outlineOf(selected)}
              onOutline={startOutline}
              exploration={ex ?? null}
              onClose={() => select(null)}
              onPick={(pid) => select(pid)}
              onTravel={setJourneyTo}
              onChange={(next) => {
                if (next) setEx(next);
                else void reload();
                void reloadEx();
              }}
            />
          ) : null
        }
        exploration={exploration}
        layers={layers ?? null}
        scaleMiles={m.scale_miles ?? null}
        sidebarSlot={sidebarSlot}
        peekPins
        onOpenLink={(href) => nav(href)}
        fog="dim"
        notesKey="gm"
        draggable
        onMovePin={(pin, x, y) =>
          act(async () => {
            setData({
              ...data,
              markers: data.markers.map((mk) => (mk.id === pin.id ? { ...mk, x, y } : mk)),
            });
            await api.patch(`/api/markers/${pin.id}`, { x, y });
          })
        }
        placing={placing ? { ...placing, onCancel: () => setPlacing(null) } : null}
        legendExtra={tools}
        banner={outlineBanner || (live ? <span>Live session: players see fog of war and the party.</span> : undefined)}
        editor={outline ? <OutlineEditor points={outline.points} drawing={outline.drawing || outline.points.length < 3} onChange={changeOutline} onClose={finishDrawing} /> : undefined}
        editingShapeId={outline?.shapeId}
        showOutlines={showOutlines}
      />
    </>
  );
}
