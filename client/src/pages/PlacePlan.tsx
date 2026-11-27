/**
 * The plan of a place (v0.9.24, docs/BETA_PLAN.md C8): a dungeon, a cave, a building or a settlement laid out from
 * what its record says, drawn in ink, with its key beside it. The GM changes what they like, draws another, keeps the
 * one they want, and takes it away as a picture with a grid of so many pixels to a square.
 *
 * The same maker serves a record (`/e/:id/plan`) and Generators, where a plan is drawn for no record yet.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookmarkPlus, Check as Tick, Download, FileText, ImagePlus, Map as MapIcon, RefreshCw, Undo2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { useRealms } from '../components/realms';
import { Card, Check, ErrorBox, Field, Loading, PageHeader, Segmented, ask, toast } from '../components/ui';
import {
  BUILDING_USES,
  DRAW_DEFAULTS,
  MAX_NAMES,
  PLAN_KINDS,
  PLAN_LABELS,
  TOWN_LABELS,
  drawPlan,
  drawnNames,
  fullKeyMarkdown,
  isKeyed,
  madeNames,
  makePlan,
  planKey,
  renamed,
  roomMarks,
  roomsFor,
  syncRooms,
  type DrawOptions,
  type KeyRoom,
  type PlanKind,
  type PlanSettings,
  type TownSize,
} from '@shared/plan/index';
import { PlanKey } from '../components/PlanKey';
import type { Entity } from '../lib/types';

export interface PlanInfo {
  entity: { id: string; name: string; type: string; version: number };
  place: boolean;
  saved: PlanSettings | null;
  suggested: PlanSettings;
  ownNames: boolean;
  map: { id: number; name: string } | null;
}

const NEW_PLAN: PlanSettings = { kind: 'dungeon', seed: 1, names: [], size: 'medium', rough: false, ways: 'some', secrets: true, traps: false, use: 'tavern', town: 'village', water: 'none', walled: false, around: 'fields' };
const newSeed = () => 1 + Math.floor(Math.random() * 2147483646);
/** A value written out the same way whatever order its parts were put together in, with nothing for what is not there. */
const written = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>)
            .filter(([, y]) => y !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : x,
  );
const same = (a: unknown, b: unknown) => written(a) === written(b);

/** How the plan is shown and exported: the GM's choice, remembered on this device. */
type View = Pick<DrawOptions, 'gm' | 'grid' | 'fill' | 'paper' | 'furnishings' | 'px'> & { titled: boolean };
const VIEW_KEY = 'wk.plan.view';
const NEW_VIEW: View = { gm: true, grid: 'floor', fill: 'hatch', paper: 'white', furnishings: true, px: 70, titled: true };
function readView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<View>;
    const one = <T,>(x: T | undefined, among: readonly T[], or: T) => (x !== undefined && among.includes(x) ? x : or);
    return {
      gm: v.gm !== false,
      grid: one(v.grid, ['floor', 'all', 'none'] as const, NEW_VIEW.grid),
      fill: one(v.fill, ['hatch', 'solid', 'none'] as const, NEW_VIEW.fill),
      paper: one(v.paper, ['white', 'parchment', 'clear'] as const, NEW_VIEW.paper),
      furnishings: v.furnishings !== false,
      px: one(v.px, PIXELS, NEW_VIEW.px),
      titled: v.titled !== false,
    };
  } catch {
    return NEW_VIEW;
  }
}
/** Pixels to a square: what the common virtual tabletops and mapping tools expect. */
const PIXELS = [50, 70, 100, 140, 200] as const;
/** The largest picture a browser will reliably make. */
const MOST_PIXELS = 16000;

/** Turn the drawing into a PNG of exactly so many pixels. */
async function toPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((done, fail) => {
      img.onload = () => done();
      img.onerror = () => fail(new Error('The plan could not be made into a picture'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [width, height];
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('This picture is too large for this device. Choose fewer pixels to a square.');
    pen.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('This picture is too large for this device. Choose fewer pixels to a square.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a file the page has made: it goes by way of the app's own address, which works in the desktop app too. */
async function saveFile(blob: Blob, name: string) {
  const form = new FormData();
  form.append('name', name);
  form.append('file', blob, name);
  const { token } = await api.post<{ token: string }>('/api/plan-files', form);
  const a = document.createElement('a');
  a.href = `/api/plan-files/${token}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const Select = <T extends string>({ label, value, onChange, options, hint }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][]; hint?: ReactNode }) => (
  <Field label={label} hint={hint}>
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  </Field>
);

/**
 * The maker. With `info` it is a record's plan: kept on the record, its key written into the record's text. Without,
 * it is a plan of nowhere yet, which can be kept as a new record.
 */
export function PlanMaker({ info, onInfo }: { info?: PlanInfo; onInfo?: (i: PlanInfo) => void }) {
  const nav = useNavigate();
  const { reloadIndex } = useAppState();
  const realms = useRealms();
  const [settings, setSettings] = useState<PlanSettings>(() => {
    const { key: _key, ...rest } = info?.saved ?? info?.suggested ?? { ...NEW_PLAN, seed: newSeed() };
    return rest;
  });
  const [view, setView] = useState<View>(readView);
  const [busy, setBusy] = useState('');
  // The whole plan on the screen at once, or as wide as the page allows.
  const [whole, setWhole] = useState(true);
  // For a plan with no record, or a record that names no places: what it is called, and how many rooms.
  const [called, setCalled] = useState('');
  const [count, setCount] = useState(() => (info && !info.ownNames ? (info.saved ?? info.suggested).names.length || 8 : 8));
  const own = !!info?.ownNames;
  const name = info?.entity.name ?? called.trim();
  const building = settings.kind === 'building';

  // The key. Until the GM changes anything in it, its places follow the record (or are made up to suit the kind of
  // place) and change with the choices above. From the first change on it is the GM's own, kept with the plan.
  const [keyed, setKeyed] = useState<KeyRoom[] | null>(() => info?.saved?.key ?? null);
  // A building whose rooms are still the usual ones for its use is drawn from that use, not from their names.
  const [usual, setUsual] = useState(() => !!info?.saved?.key && info.saved.kind === 'building' && info.saved.names.length === 0);
  // The place that is open in the key, and ringed on the plan. An address can name one to open (?room=3).
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(() => {
    const n = Number(params.get('room'));
    return Number.isInteger(n) && n >= 1 && n <= 40 ? n - 1 : null;
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* private browsing: the choice lasts as long as the page */
    }
  }, [view]);

  // What the plan is drawn from: the key's places once it is the GM's own; else the record's, or names made up.
  const givenNames = useMemo(() => (own ? settings.names : madeNames(settings, name, count)), [own, settings, name, count]);
  const drawnFrom = useMemo(() => (keyed ? (building && usual ? [] : drawnNames(keyed, building)) : givenNames), [keyed, building, usual, givenNames]);
  // The plan is made again only when what it is drawn from changes, not when a word of the key does.
  const made = useMemo(() => JSON.stringify({ ...settings, names: drawnFrom }), [settings, drawnFrom]);
  const plan = useMemo(() => makePlan(JSON.parse(made) as PlanSettings), [made]);
  const rooms = useMemo(() => keyed ?? roomsFor(plan, givenNames), [keyed, plan, givenNames]);
  const names = useMemo(() => rooms.map((r) => r.name), [rooms]);
  const full = useMemo<PlanSettings>(() => ({ ...settings, names: drawnFrom, ...(keyed ? { key: keyed } : {}) }), [settings, drawnFrom, keyed]);
  const options = useMemo<DrawOptions>(() => ({ ...DRAW_DEFAULTS, ...view, numbers: view.gm, title: view.titled ? name : '', marks: roomMarks(rooms) }), [view, name, rooms]);
  const drawing = useMemo(() => drawPlan(plan, options), [plan, options]);
  const key = useMemo(() => planKey(plan, names), [plan, names]);
  // On the page the place being worked on is ringed; a picture taken away never is.
  const shown = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(selected == null ? drawing.svg : drawPlan(plan, { ...options, numbers: true, ring: selected + 1 }).svg)}`, [drawing, plan, options, selected]);

  const set = (patch: Partial<PlanSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const saved = info?.saved ?? null;
  const changed = !!info && !same(full, saved);
  // The same plan as the one kept, whatever has changed in its key.
  const sameLayout = !!saved && same({ ...full, key: null }, { ...saved, key: null });
  const recordNames = info?.suggested.names ?? [];
  const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
  // The GM may leave the key and the text differing: said once for the text as it is, it is not said again.
  const leaveKey = `wk.plan.text.${info?.entity.id ?? ''}`;
  const [leftAt, setLeftAt] = useState(() => {
    try {
      return localStorage.getItem(leaveKey) ?? '';
    } catch {
      return '';
    }
  });
  const textNow = JSON.stringify(lower(recordNames));
  const textMoved = !!info && own && (keyed ? textNow !== JSON.stringify(lower(names)) && leftAt !== textNow : !!saved && !same(saved.names, recordNames) && same(settings.names, saved.names));
  const leaveIt = () => {
    setLeftAt(textNow);
    try {
      localStorage.setItem(leaveKey, textNow);
    } catch {
      /* it is asked again next time */
    }
  };
  const tooBig = Math.max(drawing.width, drawing.height) > MOST_PIXELS;
  const fileName = (what: string) => `${name || PLAN_LABELS[settings.kind]}${what}`;

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy('');
    }
  };
  const url = info ? `/api/entities/${encodeURIComponent(info.entity.id)}/plan` : '';
  const keep = async (quiet = false, what: PlanSettings = full) => {
    const next = await api.put<PlanInfo>(url, what);
    onInfo?.(next);
    if (!quiet) toast('The plan is kept with the record.', 'ok');
    return next;
  };

  // A kept plan's key is kept as it is written: a moment after the last change, without being asked.
  const [keySaved, setKeySaved] = useState<'saved' | 'saving' | 'failed'>('saved');
  const latest = useRef(full);
  latest.current = full;
  const keyText = useMemo(() => written(keyed), [keyed]);
  const savedKeyText = useMemo(() => written(saved?.key ?? null), [saved]);
  useEffect(() => {
    if (!info || !keyed || !sameLayout || keyText === savedKeyText) return;
    setKeySaved('saving');
    const t = window.setTimeout(() => {
      api
        .put<PlanInfo>(url, latest.current)
        .then((next) => {
          onInfo?.(next);
          setKeySaved('saved');
        })
        .catch(() => setKeySaved('failed'));
    }, 900);
    return () => window.clearTimeout(t);
    // Only the key's own words set this off; the rest is read as it is when the moment comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyText, savedKeyText, sameLayout]);

  /** The key as the GM has changed it. `redraw`: its list of places changed, so the plan is drawn from their names. */
  const changeRooms = (next: KeyRoom[], redraw: boolean) => {
    setKeyed(next);
    if (!keyed) setUsual(building && drawnFrom.length === 0);
    if (redraw) setUsual(false);
  };
  const another = () => {
    set({ seed: newSeed() });
    // A new plan is drawn for the names as they are now.
    if (keyed) setKeyed(keyed.map((r) => ({ ...r, drawnAs: r.name.trim() || r.drawnAs })));
    setSelected(null);
  };
  const redrawForNames = () => keyed && setKeyed(keyed.map((r) => ({ ...r, drawnAs: r.name.trim() || r.drawnAs })));
  const fromRecord = async () => {
    if (!keyed) return set({ names: recordNames });
    const { rooms: next, left } = syncRooms(keyed, recordNames);
    if (left.length && !(await ask({ title: 'Take the places from the record’s text?', body: `The text no longer names ${left.map((r) => r.name).join(', ')}. What is keyed to ${left.length === 1 ? 'it' : 'them'} here would be lost.`, confirmLabel: 'Take them from the text', danger: true }))) return;
    setKeyed(next);
    setUsual(false);
    setSelected(null);
  };
  const changeUse = (use: string) => {
    set({ use });
    // Another use has other rooms: what is keyed stays with its rooms, which are then drawn from their names.
    if (keyed && usual) {
      if (keyed.some(isKeyed)) setUsual(false);
      else setKeyed(null);
    }
  };

  /** The picture as it is on the page, or the players' copy of it. */
  const picture = (players: boolean) => {
    const d = players ? drawPlan(plan, { ...options, gm: false, numbers: false }) : drawing;
    return toPng(d.svg, d.width, d.height);
  };
  /** The key for the record's text: for the GM only once anything is keyed, or the place is not a settlement. */
  const keySection = () => ({ markdown: fullKeyMarkdown(rooms, key), gm: settings.kind !== 'settlement' || rooms.some(isKeyed) });
  /** The plan with its key made the GM's own, as it is once it has been written down anywhere. */
  const withKey = (): PlanSettings => ({ ...settings, names: drawnFrom, key: rooms });

  const keepAsRecord = () =>
    run('record', async () => {
      const realm = realms.list.find((r) => !r.archived)?.id ?? 'world';
      const title = called.trim() || `A ${PLAN_LABELS[settings.kind].toLowerCase()}`;
      const section = keySection();
      const e = await api.post<Entity>('/api/entities', {
        name: title,
        type: settings.kind === 'cave' ? 'dungeon' : settings.kind,
        realm,
        aliases: [],
        source_raw: 'DM entry (The Worldkeeper)',
        tags: [`realm/${realm}`, 'vis/gm'],
        fields: building ? [['Used for', BUILDING_USES[settings.use].label.toLowerCase()]] : [],
        body: `## Map key${section.gm ? ' (GM only)' : ''}\n\n${section.markdown}\n`,
        notes: '',
      });
      await api.put(`/api/entities/${encodeURIComponent(e.id)}/plan`, withKey());
      await reloadIndex();
      toast(`${title} is now a record, with this plan.`, 'ok');
      void nav(`/e/${e.id}/plan`);
    });

  const writeKey = () =>
    run('key', async () => {
      if (!info) return;
      const there = /^##\s+Map key\b/im.test((await api.get<{ entity: Entity }>(`/api/entities/${encodeURIComponent(info.entity.id)}?follow=0`)).entity.body);
      if (there && !(await ask({ title: 'Write the key again?', body: 'The record’s text has a map key already. This one takes its place; anything you changed in the text itself is lost. (Earlier versions of the record are kept under History.)', confirmLabel: 'Write it again' }))) return;
      await api.post(`${url}/key`, keySection());
      // The record now names these places itself, and the key is the GM's own: kept with the plan, as drawn.
      const mine = withKey();
      if (!keyed) changeRooms(rooms, false);
      await keep(true, mine);
      toast('The key is in the record’s text, under “Map key”.', 'ok');
    });

  const kindChoices = PLAN_KINDS.map((k) => [k, PLAN_LABELS[k]] as [PlanKind, string]);
  const sizeWord = settings.kind === 'building' ? 'How large it is' : 'How much room';

  return (
    <div className="grid gap-4 2xl:grid-cols-[300px_minmax(0,1fr)]" data-testid="plan-maker">
      {/* ---- What it is made from. On a narrow page this comes under the drawing; on a wide one, beside it. ---- */}
      <div className="order-3 grid content-start gap-4 md:grid-cols-2 2xl:order-none 2xl:row-span-3 2xl:grid-cols-1">
        <Card title="The place">
          <div className="space-y-3">
            {!info && (
              <Field label="What it is called" hint="For the title on the plan, and to suit the rooms to the place.">
                <input className="input" value={called} onChange={(e) => setCalled(e.target.value)} maxLength={80} placeholder="Tomb of the Last King" />
              </Field>
            )}
            <Select label="A plan of a" value={settings.kind} onChange={(kind) => set({ kind })} options={kindChoices} />
            {building && <Select label="What it is for" value={settings.use} onChange={changeUse} options={Object.entries(BUILDING_USES).map(([k, v]) => [k, v.label])} />}
            {settings.kind === 'settlement' ? (
              <>
                <Select label="How big it is" value={settings.town} onChange={(town) => set({ town })} options={Object.entries(TOWN_LABELS) as [TownSize, string][]} />
                <Select
                  label="Water"
                  value={settings.water}
                  onChange={(water) => set({ water })}
                  options={[
                    ['none', 'None'],
                    ['river', 'A river'],
                    ['coast', 'The sea, or a lake'],
                  ]}
                />
                <Select
                  label="Around it"
                  value={settings.around}
                  onChange={(around) => set({ around })}
                  options={[
                    ['fields', 'Fields'],
                    ['woods', 'Woods'],
                    ['open', 'Open ground'],
                  ]}
                />
                <Check checked={settings.walled} onChange={(walled) => set({ walled })} disabled={settings.town === 'hamlet'} hint={settings.town === 'hamlet' ? 'A hamlet has no wall.' : undefined}>
                  Walled
                </Check>
              </>
            ) : (
              <Select
                label={sizeWord}
                value={settings.size}
                onChange={(size) => set({ size })}
                options={
                  settings.kind === 'building'
                    ? [
                        ['small', 'Small'],
                        ['medium', 'As usual'],
                        ['large', 'Large'],
                      ]
                    : [
                        ['small', 'Cramped'],
                        ['medium', 'As usual'],
                        ['large', 'Grand'],
                      ]
                }
              />
            )}
            {(settings.kind === 'dungeon' || settings.kind === 'cave') && (
              <Select
                label="Ways through it"
                value={settings.ways}
                onChange={(ways) => set({ ways })}
                options={[
                  ['one', 'One way, with side rooms'],
                  ['some', 'A few ways round'],
                  ['many', 'Many ways round'],
                ]}
              />
            )}
            {settings.kind === 'dungeon' && (
              <div className="space-y-1.5">
                <Check checked={settings.rough} onChange={(rough) => set({ rough })} hint="As a mine or a burrow is.">
                  Roughly cut
                </Check>
                <Check checked={settings.secrets} onChange={(secrets) => set({ secrets })} hint="Only ever on a second way between rooms: nobody is shut out by missing one.">
                  Secret doors
                </Check>
                <Check checked={settings.traps} onChange={(traps) => set({ traps })} hint="Marked on your copy only.">
                  Traps
                </Check>
              </div>
            )}
            {!keyed && !own && (settings.kind === 'dungeon' || settings.kind === 'cave') && (
              <Field label={settings.kind === 'cave' ? 'Chambers' : 'Rooms'}>
                <input className="input w-24" type="number" min={1} max={MAX_NAMES} value={count} onChange={(e) => setCount(Math.max(1, Math.min(MAX_NAMES, Math.round(Number(e.target.value)) || 1)))} />
              </Field>
            )}
            <p className="text-xs text-dim" data-testid="plan-names-from">
              {keyed
                ? `Its ${names.length} numbered ${names.length === 1 ? 'place is' : 'places are'} the ones in the key below: add to them, rename them or take them away there.`
                : own
                  ? `Its ${names.length} numbered ${names.length === 1 ? 'place is' : 'places are'} the ones the record names: in its text, or as records kept under it.`
                  : building
                    ? 'It has the usual rooms of a building of this use. Change them in the key below.'
                    : 'The numbered places are made up to suit it. Change them in the key below, and they are yours.'}
            </p>
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <button type="button" className="btn-primary" onClick={another} data-testid="plan-another">
                <RefreshCw size={14} /> Draw another
              </button>
              <Field label="Plan number" hint="The same number and choices always give the same plan.">
                <input className="input w-36" type="number" min={1} max={2147483647} value={settings.seed} onChange={(e) => set({ seed: Math.max(1, Math.min(2147483647, Math.round(Number(e.target.value)) || 1)) })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="How it is drawn">
          <div className="space-y-3">
            <div>
              <span className="label">Whose copy</span>
              <Segmented
                label="Whose copy"
                size="sm"
                value={view.gm ? 'gm' : 'players'}
                onChange={(v) => setView((o) => ({ ...o, gm: v === 'gm' }))}
                options={[
                  { value: 'gm', label: 'Yours', title: 'Numbers, secret doors and traps' },
                  { value: 'players', label: 'The players’', title: 'No numbers, no secret doors, no traps' },
                ]}
              />
            </div>
            <Select
              label="Grid"
              value={view.grid}
              onChange={(grid) => setView((o) => ({ ...o, grid }))}
              options={[
                ['floor', settings.kind === 'settlement' ? 'Over the whole sheet' : 'On the floors'],
                ...(settings.kind === 'settlement' ? [] : ([['all', 'Over the whole sheet']] as ['all', string][])),
                ['none', 'None'],
              ]}
            />
            {settings.kind !== 'settlement' && (
              <Select
                label="Rock"
                value={view.fill}
                onChange={(fill) => setView((o) => ({ ...o, fill }))}
                options={[
                  ['hatch', 'Hatched'],
                  ['solid', 'Filled in'],
                  ['none', 'Left plain'],
                ]}
              />
            )}
            <Select
              label="Paper"
              value={view.paper}
              onChange={(paper) => setView((o) => ({ ...o, paper }))}
              options={[
                ['white', 'White'],
                ['parchment', 'Parchment'],
                ['clear', 'None (see-through)'],
              ]}
            />
            <div className="space-y-1.5">
              {settings.kind !== 'settlement' && (
                <Check checked={view.furnishings} onChange={(furnishings) => setView((o) => ({ ...o, furnishings }))} hint="Leave them off to dress the rooms yourself in a mapping tool.">
                  Furnishings
                </Check>
              )}
              <Check checked={view.titled} onChange={(titled) => setView((o) => ({ ...o, titled }))}>
                Its name on the sheet
              </Check>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- The drawing ---- */}
      <div className="order-1 min-w-0 space-y-2 2xl:order-none">
        {textMoved && (
          <div className="panel flex flex-wrap items-center gap-3 border-warn/60 bg-warn/10 p-3 text-sm" role="status">
            <span className="min-w-0 flex-1">{keyed ? 'The key here and the record’s text name different places.' : 'The record’s text names different places now than when this plan was kept.'}</span>
            <button type="button" className="btn" onClick={() => void fromRecord()}>
              <RefreshCw size={14} /> {keyed ? 'Take the places from the text' : 'Draw it for the text as it is now'}
            </button>
            {keyed && (
              <button type="button" className="btn-ghost" onClick={leaveIt}>
                Leave them as they are
              </button>
            )}
          </div>
        )}
        {keyed && renamed(keyed) && (
          <div className="panel flex flex-wrap items-center gap-3 p-3 text-sm" role="status">
            <span className="min-w-0 flex-1">Some rooms have new names. The plan is still drawn for the old ones.</span>
            <button type="button" className="btn" onClick={redrawForNames}>
              <RefreshCw size={14} /> Draw it to suit the names
            </button>
          </div>
        )}
        <div className="panel elev-1 overflow-auto p-2">
          {/* The picture, and over each number on it a button that opens that place in the key. */}
          <div className="relative mx-auto w-fit">
            <img
              src={shown}
              width={drawing.width}
              height={drawing.height}
              className={`block h-auto w-auto max-w-full rounded-sm ${whole ? 'max-h-[62vh]' : ''}`}
              style={{ background: view.paper === 'clear' ? 'repeating-conic-gradient(#e9e6df 0% 25%, #ffffff 0% 50%) 50% / 20px 20px' : undefined }}
              alt={`${name ? `Plan of ${name}` : 'The plan'}: a ${PLAN_LABELS[settings.kind].toLowerCase()} with ${key.length} numbered ${key.length === 1 ? 'place' : 'places'}, listed in the key below.`}
              data-testid="plan-drawing"
            />
            {plan.areas.map((a) => (
              <button
                key={a.n}
                type="button"
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full hover:ring-2 hover:ring-gold focus-visible:ring-2 focus-visible:ring-gold"
                style={{ left: `${(a.x / plan.w) * 100}%`, top: `${(a.y / plan.h) * 100}%` }}
                aria-label={`${a.n}. ${names[a.n - 1] ?? a.name}: open it in the key`}
                aria-pressed={selected === a.n - 1}
                title={`${a.n}. ${names[a.n - 1] ?? a.name}`}
                onClick={() => setSelected(selected === a.n - 1 ? null : a.n - 1)}
                data-testid="plan-room"
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-dim">
          <span>
            {plan.w} × {plan.h} squares, {plan.feet} ft to a square ({plan.w * plan.feet} × {plan.h * plan.feet} ft).
          </span>
          <button type="button" className="btn-ghost ml-auto text-xs" aria-pressed={!whole} onClick={() => setWhole((w) => !w)}>
            {whole ? 'Show it larger' : 'Fit it on the screen'}
          </button>
        </div>
      </div>

      {/* ---- Its key: straight under the drawing, where a place chosen on it opens ---- */}
      <div className="order-2 min-w-0 2xl:order-none 2xl:col-start-2">
        <Card title="Key" aside={`${key.length} ${key.length === 1 ? 'place' : 'places'}. Open one to say what is in it.`}>
          <PlanKey kind={settings.kind} lines={key} rooms={rooms} selected={selected} onSelect={setSelected} onRooms={changeRooms} entityId={info?.entity.id} />
        </Card>
      </div>

      {/* ---- What to do with it ---- */}
      <div className="order-4 min-w-0 space-y-4 2xl:order-none 2xl:col-start-2">
        <Card title="Take it away">
          <div className="space-y-3">
            {info && (
              <div className="flex flex-wrap items-center gap-2" data-testid="plan-keep">
                <button type="button" className="btn-primary" disabled={!changed || !!busy} onClick={() => void run('keep', async () => void (await keep()))}>
                  <Tick size={14} /> {saved ? (changed ? 'Keep this one instead' : 'Kept') : 'Keep this plan'}
                </button>
                {saved && changed && !sameLayout && (
                  <button
                    type="button"
                    className="btn"
                    disabled={!!busy}
                    onClick={() => {
                      const { key: theirs, ...rest } = saved;
                      setSettings(rest);
                      setKeyed(theirs ?? null);
                      setUsual(!!theirs && saved.kind === 'building' && saved.names.length === 0);
                      setSelected(null);
                    }}
                  >
                    <Undo2 size={14} /> Back to the one kept
                  </button>
                )}
                <span className="text-xs text-dim" role="status">
                  {!saved
                    ? 'Nothing is kept until you say so, the key included.'
                    : !changed
                      ? 'This is the plan kept with the record: it will be here, the same, next time.'
                      : sameLayout
                        ? keySaved === 'failed'
                          ? 'The key could not be saved just now. Keep the plan to try again.'
                          : 'Saving the key…'
                        : 'This is not the plan kept with the record. What you change in the key is not kept until you keep this plan.'}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Pixels to a square">
                <select className="input w-28" value={view.px} onChange={(e) => setView((o) => ({ ...o, px: Number(e.target.value) }))}>
                  {PIXELS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="button" className="btn" disabled={!!busy || tooBig} onClick={() => void run('png', async () => saveFile(await picture(false), fileName(view.gm ? '.png' : ' (players).png')))} data-testid="plan-png">
                <Download size={14} /> Picture (PNG)
              </button>
              <button type="button" className="btn" disabled={!!busy} onClick={() => void run('svg', () => saveFile(new Blob([drawing.svg], { type: 'image/svg+xml' }), fileName(view.gm ? '.svg' : ' (players).svg')))} data-testid="plan-svg">
                <Download size={14} /> Drawing (SVG)
              </button>
            </div>
            <p className="text-xs text-dim">
              {tooBig ? (
                <span className="text-danger">At {view.px} pixels to a square this plan is larger than a picture can be. Choose fewer.</span>
              ) : (
                <>
                  The picture is {drawing.width} × {drawing.height} pixels, as it is shown above ({view.gm ? 'your copy' : 'the players’ copy'}). In a mapping tool or a virtual tabletop, set the grid to {view.px} pixels and it lines up with this one.
                </>
              )}
            </p>
            {info ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy || tooBig}
                  onClick={() =>
                    void run('picture', async () => {
                      const form = new FormData();
                      form.append('image', new File([await picture(false)], 'plan.png', { type: 'image/png' }));
                      form.append('caption', view.gm ? 'Plan' : 'Plan (players’ copy)');
                      await api.post(`/api/entities/${encodeURIComponent(info.entity.id)}/images`, form);
                      toast('Added to the record’s pictures, for you only. Open the record to show it to the players.', 'ok');
                    })
                  }
                >
                  <ImagePlus size={14} /> Add to the record’s pictures
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy || tooBig}
                  onClick={() =>
                    void run('map', async () => {
                      if (changed) await keep(true);
                      const form = new FormData();
                      form.append('plan', JSON.stringify({ squares: plan.w, feet: plan.feet, areas: plan.areas.map((a) => ({ n: a.n, name: names[a.n - 1] ?? a.name, x: a.x, y: a.y })) }));
                      form.append('image', new File([await picture(true)], 'plan.png', { type: 'image/png' }));
                      const made = await api.post<{ map: { id: number; name: string }; updated: boolean }>(`${url}/map`, form);
                      onInfo?.(await api.get<PlanInfo>(url));
                      toast(made.updated ? 'The map in the Atlas is drawn again from this plan.' : 'It is a map in the Atlas now: the players’ copy, with a hidden pin on each numbered place.', 'ok');
                    })
                  }
                >
                  <MapIcon size={14} /> {info.map ? 'Draw the Atlas map again' : 'Make it a map in the Atlas'}
                </button>
                <button type="button" className="btn" disabled={!!busy} onClick={writeKey}>
                  <FileText size={14} /> Write the key into the record
                </button>
                {info.map && (
                  <Link className="btn-ghost" to={`/atlas/${info.map.id}`}>
                    Open the map
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button type="button" className="btn" disabled={!!busy} onClick={keepAsRecord} data-testid="plan-record">
                  <BookmarkPlus size={14} /> Keep it as a record
                </button>
                <span className="text-xs text-dim">A record for you only, with this plan and its key. Nothing is kept until you say so.</span>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}

/** A record's plan: `/e/:id/plan`. */
export function PlacePlanPage() {
  const { id = '' } = useParams();
  const { data, error, reload, setData } = useApi<PlanInfo>(`/api/entities/${encodeURIComponent(id)}/plan`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader
        title={`Plan of ${data.entity.name}`}
        subtitle={
          data.place
            ? 'Laid out from what the record says. Change what you like, draw another, and keep the one you want.'
            : 'This record is not a single place (a town, a building, a dungeon), so there is little to go on: the plan is whatever you choose here.'
        }
        actions={
          <Link className="btn" to={`/e/${data.entity.id}`}>
            <ArrowLeft size={14} /> The record
          </Link>
        }
      />
      {/* A new record starts a new maker: its choices are that record's. */}
      <PlanMaker key={data.entity.id} info={data} onInfo={setData} />
    </div>
  );
}

/** On a place's record: its plan, small, if one is kept; or the way to draw one. */
export function PlanPanel({ entityId, name }: { entityId: string; name: string }) {
  const { data } = useApi<PlanInfo>(`/api/entities/${encodeURIComponent(entityId)}/plan`);
  // Drawn after the page has shown itself: a city's plan takes a moment.
  const [small, setSmall] = useState('');
  const saved = data?.saved;
  useEffect(() => {
    setSmall('');
    if (!saved) return;
    const t = window.setTimeout(() => setSmall(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawPlan(makePlan(saved), { px: 12, numbers: false, title: '', gm: false }).svg)}`), 30);
    return () => window.clearTimeout(t);
  }, [saved]);
  if (!data?.place) return null;
  return (
    <section className="panel elev-1 p-4" aria-label="Plan" data-testid="plan-panel">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="section-title flex items-center gap-2">
          <MapIcon size={15} /> Plan
        </h2>
      </div>
      {saved ? (
        <Link to={`/e/${entityId}/plan`} className="block">
          {small ? <img src={small} alt={`The plan kept for ${name}. Open it.`} className="h-auto max-h-56 w-full rounded-sm border border-line bg-white object-contain" /> : <div className="h-32 rounded-sm border border-line bg-raised/40" />}
          <span className="mt-2 block text-sm">Open the plan</span>
        </Link>
      ) : (
        <>
          <p className="mb-2 text-sm text-dim">A {PLAN_LABELS[data.suggested.kind].toLowerCase()} laid out from what this record says, drawn in ink with a grid.</p>
          <Link className="btn" to={`/e/${entityId}/plan`}>
            <MapIcon size={14} /> Draw a plan
          </Link>
        </>
      )}
    </section>
  );
}
