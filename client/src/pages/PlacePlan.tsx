/**
 * The plan of a place (v0.9.24, docs/BETA_PLAN.md C8): a dungeon, a cave, a building or a settlement laid out from
 * what its record says, drawn in ink, with its key beside it. The GM changes what they like, draws another, keeps the
 * one they want, and takes it away as a picture with a grid of so many pixels to a square.
 *
 * The same maker serves a record (`/e/:id/plan`) and Generators, where a plan is drawn for no record yet.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  keyMarkdown,
  madeNames,
  makePlan,
  planKey,
  type DrawOptions,
  type PlanKind,
  type PlanSettings,
  type TownSize,
} from '@shared/plan/index';
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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
  const [settings, setSettings] = useState<PlanSettings>(() => info?.saved ?? info?.suggested ?? { ...NEW_PLAN, seed: newSeed() });
  const [view, setView] = useState<View>(readView);
  const [busy, setBusy] = useState('');
  // The whole plan on the screen at once, or as wide as the page allows.
  const [whole, setWhole] = useState(true);
  // For a plan with no record, or a record that names no places: what it is called, and how many rooms.
  const [called, setCalled] = useState('');
  const [count, setCount] = useState(() => (info && !info.ownNames ? (info.saved ?? info.suggested).names.length || 8 : 8));
  const own = !!info?.ownNames;
  const name = info?.entity.name ?? called.trim();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* private browsing: the choice lasts as long as the page */
    }
  }, [view]);

  // The numbered places: the record's own, or made up to suit the kind of place (and made again when that changes).
  const names = useMemo(() => (own ? settings.names : madeNames(settings, name, count)), [own, settings, name, count]);
  const full = useMemo<PlanSettings>(() => ({ ...settings, names }), [settings, names]);
  const plan = useMemo(() => makePlan(full), [full]);
  const options = useMemo<Partial<DrawOptions>>(() => ({ ...DRAW_DEFAULTS, ...view, numbers: view.gm, title: view.titled ? name : '' }), [view, name]);
  const drawing = useMemo(() => drawPlan(plan, options), [plan, options]);
  const key = useMemo(() => planKey(plan, names), [plan, names]);
  const shown = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}`, [drawing]);

  const set = (patch: Partial<PlanSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const saved = info?.saved ?? null;
  const changed = !!info && !same(full, saved);
  const textMoved = !!info && own && !!saved && !same(saved.names, info.suggested.names) && same(settings.names, saved.names);
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
  const keep = async (quiet = false) => {
    const next = await api.put<PlanInfo>(url, full);
    onInfo?.(next);
    if (!quiet) toast('The plan is kept with the record.', 'ok');
    return next;
  };
  /** The picture as it is on the page, or the players' copy of it. */
  const picture = (players: boolean) => {
    const d = players ? drawPlan(plan, { ...options, gm: false, numbers: false }) : drawing;
    return toPng(d.svg, d.width, d.height);
  };

  const keepAsRecord = () =>
    run('record', async () => {
      const realm = realms.list.find((r) => !r.archived)?.id ?? 'world';
      const title = called.trim() || `A ${PLAN_LABELS[settings.kind].toLowerCase()}`;
      const e = await api.post<Entity>('/api/entities', {
        name: title,
        type: settings.kind === 'cave' ? 'dungeon' : settings.kind,
        realm,
        aliases: [],
        source_raw: 'DM entry (The Worldkeeper)',
        tags: [`realm/${realm}`, 'vis/gm'],
        fields: settings.kind === 'building' ? [['Used for', BUILDING_USES[settings.use].label.toLowerCase()]] : [],
        body: `## Map key${settings.kind === 'settlement' ? '' : ' (GM only)'}\n\n${keyMarkdown(plan, names)}\n`,
        notes: '',
      });
      await api.put(`/api/entities/${encodeURIComponent(e.id)}/plan`, { ...full, names: key.map((k) => k.name) });
      await reloadIndex();
      toast(`${title} is now a record, with this plan.`, 'ok');
      void nav(`/e/${e.id}/plan`);
    });

  const writeKey = () =>
    run('key', async () => {
      if (!info) return;
      const there = /^##\s+Map key\b/im.test((await api.get<{ entity: Entity }>(`/api/entities/${encodeURIComponent(info.entity.id)}?follow=0`)).entity.body);
      if (there && !(await ask({ title: 'Write the key again?', body: 'The record’s text has a map key already. This one takes its place; anything you added to its lines is lost. (Earlier versions of the record are kept under History.)', confirmLabel: 'Write it again' }))) return;
      await api.post(`${url}/key`, { markdown: keyMarkdown(plan, names), gm: settings.kind !== 'settlement' });
      // The record now names these places itself: the plan is kept as drawn for them.
      const next = await api.put<PlanInfo>(url, { ...full, names: key.map((k) => k.name) });
      onInfo?.(next);
      setSettings(next.saved ?? full);
      toast('The key is in the record’s text, under “Map key”.', 'ok');
    });

  const kindChoices = PLAN_KINDS.map((k) => [k, PLAN_LABELS[k]] as [PlanKind, string]);
  const sizeWord = settings.kind === 'building' ? 'How large it is' : 'How much room';

  return (
    <div className="grid gap-4 2xl:grid-cols-[300px_minmax(0,1fr)]" data-testid="plan-maker">
      {/* ---- What it is made from. On a narrow page this comes under the drawing; on a wide one, beside it. ---- */}
      <div className="order-2 grid content-start gap-4 md:grid-cols-2 2xl:order-none 2xl:row-span-2 2xl:grid-cols-1">
        <Card title="The place">
          <div className="space-y-3">
            {!info && (
              <Field label="What it is called" hint="For the title on the plan, and to suit the rooms to the place.">
                <input className="input" value={called} onChange={(e) => setCalled(e.target.value)} maxLength={80} placeholder="Tomb of the Last King" />
              </Field>
            )}
            <Select label="A plan of a" value={settings.kind} onChange={(kind) => set({ kind })} options={kindChoices} />
            {settings.kind === 'building' && <Select label="What it is for" value={settings.use} onChange={(use) => set({ use })} options={Object.entries(BUILDING_USES).map(([k, v]) => [k, v.label])} />}
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
            {!own && (settings.kind === 'dungeon' || settings.kind === 'cave') && (
              <Field label={settings.kind === 'cave' ? 'Chambers' : 'Rooms'}>
                <input className="input w-24" type="number" min={1} max={MAX_NAMES} value={count} onChange={(e) => setCount(Math.max(1, Math.min(MAX_NAMES, Math.round(Number(e.target.value)) || 1)))} />
              </Field>
            )}
            <p className="text-xs text-dim" data-testid="plan-names-from">
              {own
                ? `Its ${names.length} numbered ${names.length === 1 ? 'place is' : 'places are'} the ones the record names: in its text, or as records kept under it.`
                : settings.kind === 'building'
                  ? 'It has the usual rooms of a building of this use. Name its rooms in the record’s text (under “Inside”) and the plan has those.'
                  : info
                    ? 'The record names no places of its own, so these are made up to suit it. Write the key into the record and they are its own, to rename as you like.'
                    : 'The numbered places are made up to suit it.'}
            </p>
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <button type="button" className="btn-primary" onClick={() => set({ seed: newSeed() })} data-testid="plan-another">
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
            <span className="min-w-0 flex-1">The record’s text names different places now than when this plan was kept.</span>
            <button type="button" className="btn" onClick={() => set({ names: info?.suggested.names ?? settings.names })}>
              <RefreshCw size={14} /> Draw it for the text as it is now
            </button>
          </div>
        )}
        <div className="panel elev-1 overflow-auto p-2">
          <img
            src={shown}
            width={drawing.width}
            height={drawing.height}
            className={`mx-auto block h-auto w-auto max-w-full rounded-sm ${whole ? 'max-h-[62vh]' : ''}`}
            style={{ background: view.paper === 'clear' ? 'repeating-conic-gradient(#e9e6df 0% 25%, #ffffff 0% 50%) 50% / 20px 20px' : undefined }}
            alt={`${name ? `Plan of ${name}` : 'The plan'}: a ${PLAN_LABELS[settings.kind].toLowerCase()} with ${key.length} numbered ${key.length === 1 ? 'place' : 'places'}, listed in the key below.`}
            data-testid="plan-drawing"
          />
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

      {/* ---- What to do with it, and its key ---- */}
      <div className="order-3 min-w-0 space-y-4 2xl:order-none 2xl:col-start-2">
        <Card title="Take it away">
          <div className="space-y-3">
            {info && (
              <div className="flex flex-wrap items-center gap-2" data-testid="plan-keep">
                <button type="button" className="btn-primary" disabled={!changed || !!busy} onClick={() => void run('keep', async () => void (await keep()))}>
                  <Tick size={14} /> {saved ? (changed ? 'Keep this one instead' : 'Kept') : 'Keep this plan'}
                </button>
                {saved && changed && (
                  <button type="button" className="btn" disabled={!!busy} onClick={() => setSettings(saved)}>
                    <Undo2 size={14} /> Back to the one kept
                  </button>
                )}
                <span className="text-xs text-dim">{saved ? (changed ? 'This is not the plan kept with the record.' : 'This is the plan kept with the record: it will be here, the same, next time.') : 'Nothing is kept until you say so.'}</span>
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
                      form.append('plan', JSON.stringify({ squares: plan.w, feet: plan.feet, areas: plan.areas.map((a) => ({ n: a.n, name: a.name, x: a.x, y: a.y })) }));
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

        <Card title="Key" aside={`${key.length} ${key.length === 1 ? 'place' : 'places'}`}>
          {/* In two columns on a wide page, read down the first and then the second. */}
          <ol className="gap-x-6 text-sm md:columns-2" data-testid="plan-key">
            {key.map((k) => (
              <li key={k.n} className="mb-1.5 flex break-inside-avoid gap-2">
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{k.n}.</span>
                <span className="min-w-0">
                  <span className="font-medium">{k.name}</span>
                  {k.onPlan ? k.detail && <span className="text-dim"> {k.detail}</span> : <span className="text-danger"> No room for it on this plan: draw another, or give it more room.</span>}
                </span>
              </li>
            ))}
          </ol>
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
