/**
 * Start your world (docs/OWN_WORLD_PLAN.md §2.6): the first run, both ways on one path.
 *
 * - **Build my own world:** your world's name and pitch (and the app's), the calendar or "decide later", its shape
 *   (continents and planes, renamed or added as you like), then the shared steps.
 * - **Play in the Worldkeeper setting:** install the setting's pack, with your copy of the archive if you have it,
 *   see what was installed, then the shared steps.
 * - The shared steps: rules and modules, a first campaign (its starting place, a town made for you, the party), an
 *   optional map, and Finish, which shows what will be made (with the records that teach, ticked by default for your
 *   own world) and makes it all at once. Each step can be skipped, and everything can be changed later.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Compass, Globe2, History, Map as MapIcon, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { CALENDAR_PRESETS, formatDate } from '@shared/calendar';
import { MODULES } from '@shared/modules';
import { api } from '../lib/api';
import { useAppState } from '../lib/store';
import { reloadModules } from '../lib/modules';
import { packsChanged } from '../lib/packs';
import { Badge, Card, ErrorBox, Field, Segmented, Toggle } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { useRecordTypes } from '../components/recordTypes';

type Path = 'own' | 'setting';
type Step = 'welcome' | 'world' | 'shape' | 'setting' | 'rules' | 'campaign' | 'map' | 'finish';
const STEPS: Record<Path, Step[]> = {
  own: ['welcome', 'world', 'shape', 'rules', 'campaign', 'map', 'finish'],
  setting: ['welcome', 'setting', 'rules', 'campaign', 'map', 'finish'],
};
const STEP_LABEL: Record<Step, string> = {
  welcome: 'Welcome',
  world: 'Your world',
  shape: 'Its shape',
  setting: 'The setting',
  rules: 'Rules',
  campaign: 'A first campaign',
  map: 'A map',
  finish: 'Finish',
};

interface Row {
  key: string;
  name: string;
  kind: 'continent' | 'realm';
  parent: string | null;
}
type Shape = 'one' | 'several' | 'plane' | 'empty';
const SHAPES: { key: Shape; label: string; about: string; rows: Row[] }[] = [
  { key: 'one', label: 'One continent', about: 'A world with one continent.', rows: [{ key: 'c1', name: 'The Mainland', kind: 'continent', parent: 'world' }] },
  {
    key: 'several',
    label: 'Several continents',
    about: 'A world with two or three continents.',
    rows: [
      { key: 'c1', name: 'The Western Continent', kind: 'continent', parent: 'world' },
      { key: 'c2', name: 'The Eastern Continent', kind: 'continent', parent: 'world' },
    ],
  },
  {
    key: 'plane',
    label: 'A world and another plane',
    about: 'A world, and a plane beside it such as a fey realm or an underworld.',
    rows: [
      { key: 'c1', name: 'The Mainland', kind: 'continent', parent: 'world' },
      { key: 'p1', name: 'The Underworld', kind: 'realm', parent: null },
    ],
  },
  { key: 'empty', label: 'Start empty', about: 'No continents or planes yet: add them when you need them.', rows: [] },
];

interface ModuleRow {
  key: string;
  label: string;
  about: string;
  on: boolean;
  pack?: string | null;
}

export function StartWorld() {
  const nav = useNavigate();
  const { reloadIndex, reloadMeta, reloadRealms, reloadTypes, index } = useAppState();
  const recordTypes = useRecordTypes();
  const [path, setPath] = useState<Path | null>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Your world.
  const [world, setWorld] = useState({ name: '', pitch: '', appName: 'The Worldkeeper' });
  const [calendar, setCalendar] = useState({ later: true, preset: 'twelve-thirty', year: '1', era: '' });
  // Its shape.
  const [shape, setShape] = useState<Shape>('one');
  const [rows, setRows] = useState<Row[]>(SHAPES[0].rows);
  // The setting.
  const [archive, setArchive] = useState<File | null>(null);
  const [installed, setInstalled] = useState<{ records: number; realms: string[]; imported: number | null } | null>(null);
  // Rules and modules.
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [settingRules, setSettingRules] = useState(true);
  // A first campaign.
  const [campaign, setCampaign] = useState({ skip: false, title: '', start: 'town' as 'none' | 'town' | 'pick', town: '', startId: null as string | null, party: '' });
  // A map.
  const [map, setMap] = useState<File | null>(null);
  // Finish.
  const [tutorial, setTutorial] = useState(true);

  const steps = path ? STEPS[path] : (['welcome'] as Step[]);
  const at = steps.indexOf(step);
  const go = (d: number) => {
    setErr(null);
    setStep(steps[Math.max(0, Math.min(steps.length - 1, at + d))]);
  };

  // The modules, as the packs installed so far set them (own world: all off unless switched on).
  const loadModules = async () => {
    const m = await api.get<{ modules: ModuleRow[] }>('/api/modules');
    setModules(m.modules.map((x) => ({ key: x.key, label: x.label, about: x.about, on: x.on })));
  };
  useEffect(() => {
    if (step === 'rules' && !modules.length) void loadModules();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Path) => {
    setPath(p);
    setTutorial(p === 'own');
    setStep(STEPS[p][1]);
  };

  const skip = async () => {
    await api.post('/api/setup/skip');
    nav('/', { replace: true });
  };

  const install = async () => {
    setErr(null);
    setBusy(true);
    try {
      let imported: number | null = null;
      if (archive) {
        const preview = await api.upload<{ token: string; summary: { entityCount: number } }>('/api/import/preview', 'archive', archive);
        await api.post('/api/import/commit', { token: preview.token });
        imported = preview.summary.entityCount;
      }
      await api.post('/api/setting-packs/worldkeeper/install');
      await Promise.all([reloadIndex(), reloadRealms(), reloadTypes(), reloadMeta(), packsChanged(), reloadModules()]);
      const meta = await api.get<{ entities: number }>('/api/meta');
      const realms = await api.get<{ name: string }[]>('/api/realms');
      setInstalled({ records: meta.entities, realms: realms.map((r) => r.name), imported });
      setModules([]);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const party = campaign.party
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const worldName = world.name.trim() || 'Your world';
  const calendarPreview = useMemo(() => {
    const preset = CALENDAR_PRESETS.find((p) => p.key === calendar.preset);
    if (!preset) return '';
    const def = { ...preset.def, ...(calendar.era.trim() ? { eras: [{ format: `{y} ${calendar.era.trim()}` }] } : {}) };
    return formatDate(def, { year: Number(calendar.year) || 1, day: 1 });
  }, [calendar]);

  const finish = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (path === 'setting' && !settingRules) await api.patch('/api/rules/packs/worldkeeper', { enabled: false });
      const made = await api.post<{ campaignId: number | null; tutorial: string[] }>('/api/setup/finish', {
        path,
        ...(path === 'own'
          ? {
              appName: world.appName.trim() || undefined,
              world: { name: worldName, pitch: world.pitch },
              calendar: calendar.later ? null : { preset: calendar.preset, year: Number(calendar.year) || 1, era: calendar.era.trim() || undefined },
              realms: rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() })),
            }
          : {}),
        modules: Object.fromEntries(modules.map((m) => [m.key, m.on])),
        campaign: campaign.skip
          ? null
          : {
              title: campaign.title.trim() || `${path === 'own' ? worldName : 'The Worldkeeper setting'}: the first campaign`,
              startId: campaign.start === 'pick' ? campaign.startId : null,
              town: campaign.start === 'town' ? campaign.town.trim() || 'Millbrook' : null,
              party,
            },
        tutorial: path === 'own' && tutorial,
      });
      if (map) {
        const m = await api.post<{ id: number }>('/api/maps', { name: `${worldName}: the world`, kind: 'image', realm_id: 'world' });
        const up = await api.upload<{ width: number; height: number }>(`/api/maps/${m.id}/image`, 'image', map);
        // The landmark that teaches, pinned in the middle for the GM to move.
        const tower = made.tutorial.find((id) => id === `${recordTypes.get('landmark')?.prefix}-TUT1`);
        if (tower) await api.post('/api/markers', { map_id: m.id, entity_id: tower, label: 'The Old Watchtower', x: Math.round((up.width ?? 2000) / 2), y: Math.round((up.height ?? 1400) / 2) });
      }
      await Promise.all([reloadIndex(), reloadRealms(), reloadTypes(), reloadMeta(), packsChanged(), reloadModules()]);
      nav('/', { replace: true });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const places = useMemo(() => {
    const place = new Set(recordTypes.with('place'));
    return [...index.values()].filter((e) => place.has(e.type)).length;
  }, [index, recordTypes]);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="title-band gilt-corners elev-1 px-6 py-6">
        <div className="section-title">Start your world</div>
        <h1 className="mt-1.5 text-2xl sm:text-3xl text-ink">{step === 'welcome' ? 'How would you like to start?' : STEP_LABEL[step]}</h1>
        {path && (
          <ol className="mt-4 flex flex-wrap gap-1 text-xs" aria-label="Steps">
            {steps.slice(1).map((s, i) => (
              <li
                key={s}
                aria-current={s === step ? 'step' : undefined}
                className={`rounded-full border px-2.5 py-0.5 ${s === step ? 'border-gold bg-gold/15 text-gold' : i + 1 < at ? 'border-line text-ink' : 'border-line text-dim'}`}
              >
                {i + 1}. {STEP_LABEL[s]}
              </li>
            ))}
          </ol>
        )}
      </header>
      {err && <ErrorBox error={err} />}

      {step === 'welcome' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="panel elev-1 p-5 text-left hover:border-gold/60" onClick={() => choose('own')}>
              <Globe2 className="text-gold" size={22} />
              <div className="mt-2 font-display text-lg text-ink">Build my own world</div>
              <p className="mt-1 text-sm text-dim">Name it, give it a shape and a calendar, and start a campaign in it. A few records that teach come with it, to remove when you're done.</p>
            </button>
            <button type="button" className="panel elev-1 p-5 text-left hover:border-gold/60" onClick={() => choose('setting')}>
              <Sparkles className="text-gold" size={22} />
              <div className="mt-2 font-display text-lg text-ink">Play in the Worldkeeper setting</div>
              <p className="mt-1 text-sm text-dim">
                A shattered world of two continents and a realm between. Installs the setting's realms, records, rules and modules, with your copy of its archive if you have one.
              </p>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link to="/backups" className="btn">
              <History size={14} /> Restore a backup
            </Link>
            <button type="button" className="btn-ghost text-dim" onClick={() => void skip()}>
              Skip: I'll set things up myself
            </button>
          </div>
        </div>
      )}

      {step === 'world' && (
        <Card className="space-y-4">
          <Field label="Your world's name">
            <input className="input" value={world.name} onChange={(e) => setWorld({ ...world, name: e.target.value })} placeholder="e.g. Ostmark" aria-label="World name" autoFocus />
          </Field>
          <Field label="In one line" hint="What it's like, for you and anyone you show it to. You can change it later.">
            <input
              className="input"
              value={world.pitch}
              onChange={(e) => setWorld({ ...world, pitch: e.target.value })}
              placeholder="e.g. A cold world of iron kings and drowned gods."
              aria-label="Pitch"
            />
          </Field>
          <Field label="The name the app goes by" hint="Shown in the top bar and on the player view.">
            <input className="input" value={world.appName} onChange={(e) => setWorld({ ...world, appName: e.target.value })} aria-label="App name" />
          </Field>
          <div>
            <span className="label">The calendar</span>
            <Segmented
              label="Calendar"
              value={calendar.later ? 'later' : 'now'}
              onChange={(v) => setCalendar({ ...calendar, later: v === 'later' })}
              options={[
                { value: 'later', label: "I'll decide later" },
                { value: 'now', label: 'Set it now' },
              ]}
            />
            {!calendar.later && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Months">
                  <select className="input" value={calendar.preset} onChange={(e) => setCalendar({ ...calendar, preset: e.target.value })} aria-label="Calendar preset">
                    {CALENDAR_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.def.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="The year it starts">
                  <input className="input" type="number" value={calendar.year} onChange={(e) => setCalendar({ ...calendar, year: e.target.value })} aria-label="Starting year" />
                </Field>
                <Field label="The year's name" hint='"AR" for 1247 AR'>
                  <input className="input" value={calendar.era} onChange={(e) => setCalendar({ ...calendar, era: e.target.value })} placeholder="e.g. AR" aria-label="Year name" />
                </Field>
                <p className="sm:col-span-3 text-sm text-dim">
                  The first day: <span className="text-ink">{calendarPreview}</span>. Months, weekdays, moons and festivals can be written in full on the Calendar page.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 'shape' && (
        <>
          <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Shape">
            {SHAPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={shape === s.key}
                className={`panel p-3 text-left text-sm ${shape === s.key ? 'border-gold bg-gold/10' : 'hover:border-gold/50'}`}
                onClick={() => {
                  setShape(s.key);
                  setRows(s.rows.map((r) => ({ ...r })));
                }}
              >
                <div className="font-medium text-ink">{s.label}</div>
                <div className="text-dim text-xs mt-0.5">{s.about}</div>
              </button>
            ))}
          </div>
          <Card title="Rename them, or add more" className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Globe2 size={15} className="text-gold" /> <span className="font-medium">{worldName}</span> <span className="text-dim text-xs">the world</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className={`flex items-center gap-2 ${r.parent === 'world' ? 'pl-6' : ''}`}>
                <input
                  className="input"
                  value={r.name}
                  aria-label={`${r.kind === 'continent' ? 'Continent' : 'Plane'} ${i + 1}`}
                  onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                />
                <span className="text-xs text-dim w-20 shrink-0">{r.kind === 'continent' ? 'continent' : 'plane'}</span>
                <button type="button" className="btn-ghost" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn" onClick={() => setRows([...rows, { key: `c${Date.now()}`, name: 'A new continent', kind: 'continent', parent: 'world' }])}>
                <Plus size={14} /> Add a continent
              </button>
              <button type="button" className="btn" onClick={() => setRows([...rows, { key: `p${Date.now()}`, name: 'A new plane', kind: 'realm', parent: null }])}>
                <Plus size={14} /> Add a plane
              </button>
            </div>
            <p className="text-xs text-dim">These are a start, not a commitment: Manage worlds & realms changes them at any time.</p>
          </Card>
        </>
      )}

      {step === 'setting' && (
        <Card className="space-y-4">
          <p className="text-sm">
            The setting's pack brings its realms (the world, Aetheris, Kaelmar and the Ethereal Realm), record types, templates, its own content and rules, and its systems as modules you can switch
            off. If you have your copy of the setting's archive (a ZIP of Markdown files), add it too.
          </p>
          <Field label="Your copy of the archive (optional)">
            <input type="file" accept=".zip" className="input" aria-label="Archive" disabled={!!installed} onChange={(e) => setArchive(e.target.files?.[0] ?? null)} />
          </Field>
          {!installed ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void install()}>
              <Upload size={14} /> {busy ? 'Installing…' : 'Install the Worldkeeper setting'}
            </button>
          ) : (
            <div className="rounded-md border border-good/40 bg-good/10 p-3 text-sm space-y-1" role="status">
              <div className="flex items-center gap-2 font-medium text-ink">
                <Check size={15} className="text-good" /> Installed
              </div>
              <div>
                {installed.records.toLocaleString()} records{installed.imported != null ? `, ${installed.imported.toLocaleString()} of them from your archive` : ''}.
              </div>
              <div>Realms: {installed.realms.join(', ')}.</div>
            </div>
          )}
        </Card>
      )}

      {step === 'rules' && (
        <>
          <Card title="Rules" className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Check size={15} className="text-good" /> D&D 2024, from the <b>SRD 5.2.1</b> <Badge>always on</Badge>
            </div>
            {path === 'setting' && (
              <Toggle checked={settingRules} onChange={setSettingRules}>
                The setting's rules: its creatures, hazards and items
              </Toggle>
            )}
            <p className="text-dim">
              Have the books? <b>Import your books</b> (5etools) or <b>add open content</b> (Open5e) now, in{' '}
              <a href="/settings" target="_blank" rel="noreferrer" className="text-arcane underline">
                Settings
              </a>{' '}
              (it opens in a new tab), or later at any time. Encounters, treasure, stat blocks and character options all use what's on.
            </p>
          </Card>
          <Card title="Modules" className="space-y-2 text-sm">
            <p className="text-dim">
              Optional systems. {path === 'setting' ? "The setting's are on: untick any you won't use." : 'All off for a world of your own: switch on any you want.'} Change them in Settings at any
              time.
            </p>
            {modules.map((m) => (
              <Toggle key={m.key} className="flex" checked={m.on} onChange={(v) => setModules(modules.map((x) => (x.key === m.key ? { ...x, on: v } : x)))}>
                <span>
                  <span className="font-medium">{m.label}</span> <span className="text-dim">{m.about}</span>
                </span>
              </Toggle>
            ))}
            {!modules.length && <p className="text-dim">{MODULES.length} modules…</p>}
          </Card>
        </>
      )}

      {step === 'campaign' && (
        <Card className="space-y-4">
          <Toggle checked={campaign.skip} onChange={(v) => setCampaign({ ...campaign, skip: v })}>
            No campaign yet
          </Toggle>
          {!campaign.skip && (
            <>
              <Field label="The campaign's name">
                <input
                  className="input"
                  value={campaign.title}
                  onChange={(e) => setCampaign({ ...campaign, title: e.target.value })}
                  placeholder={path === 'own' ? `e.g. ${worldName}: the first campaign` : 'e.g. The Loose Thread'}
                  aria-label="Campaign name"
                />
              </Field>
              <div>
                <span className="label">Where it starts</span>
                <Segmented
                  label="Starting place"
                  value={campaign.start}
                  onChange={(v) => setCampaign({ ...campaign, start: v })}
                  options={[{ value: 'town', label: 'Make a town for me' }, ...(places > 0 ? [{ value: 'pick' as const, label: 'Pick a place' }] : []), { value: 'none', label: 'Decide later' }]}
                />
                {campaign.start === 'town' && (
                  <div className="mt-2">
                    <input
                      className="input"
                      value={campaign.town}
                      onChange={(e) => setCampaign({ ...campaign, town: e.target.value })}
                      placeholder="The town's name, e.g. Harrowgate"
                      aria-label="Town name"
                    />
                    <p className="text-xs text-dim mt-1">It's made from the Settlement template, with each section's guidance waiting for you to write.</p>
                  </div>
                )}
                {campaign.start === 'pick' && (
                  <div className="mt-2">
                    <EntityPicker value={campaign.startId} onChange={(id) => setCampaign({ ...campaign, startId: id })} types={['@place']} placeholder="Search the places in your library…" />
                  </div>
                )}
              </div>
              <Field label="The party (optional)" hint="One name per line. Each becomes a blank character, ready for the builder.">
                <textarea className="input" rows={4} value={campaign.party} onChange={(e) => setCampaign({ ...campaign, party: e.target.value })} aria-label="Party" />
              </Field>
            </>
          )}
        </Card>
      )}

      {step === 'map' && (
        <Card className="space-y-3">
          <p className="text-sm">
            An image of your world, if you have one (PNG, JPEG, WEBP or GIF). You can place pins on it later in the Atlas
            {path === 'own' && tutorial ? ', and the Old Watchtower is pinned in the middle for you to move' : ''}.
          </p>
          <Field label="Map image (optional)">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="input" aria-label="Map image" onChange={(e) => setMap(e.target.files?.[0] ?? null)} />
          </Field>
          {map && (
            <div className="flex items-center gap-2 text-sm">
              <MapIcon size={14} className="text-gold" /> {map.name}
              <button type="button" className="btn-ghost" aria-label="Remove the map" onClick={() => setMap(null)}>
                <X size={14} />
              </button>
            </div>
          )}
        </Card>
      )}

      {step === 'finish' && (
        <Card title="What will be made" className="space-y-3 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            {path === 'own' ? (
              <>
                <li>
                  <b>{worldName}</b>
                  {rows.length
                    ? `, with ${rows
                        .map((r) => r.name.trim())
                        .filter(Boolean)
                        .join(', ')}`
                    : ''}
                  .{world.pitch.trim() && <span className="text-dim italic"> {world.pitch.trim()}</span>}
                </li>
                <li>{calendar.later ? 'The calendar: twelve months of thirty days, until you choose.' : `The calendar starts on ${calendarPreview}.`}</li>
                <li>New records are Canon at once (Settings → Canon).</li>
              </>
            ) : (
              <li>The Worldkeeper setting{installed ? `, installed: ${installed.records.toLocaleString()} records` : ''}. New records wait for you in Canon Review.</li>
            )}
            <li>
              Rules: the SRD{path === 'setting' && settingRules ? " and the setting's rules" : ''}. Modules:{' '}
              {modules
                .filter((m) => m.on)
                .map((m) => m.label)
                .join(', ') || 'none'}
              .
            </li>
            {!campaign.skip ? (
              <li>
                A campaign, <b>{campaign.title.trim() || `${path === 'own' ? worldName : 'The Worldkeeper setting'}: the first campaign`}</b>
                {campaign.start === 'town'
                  ? `, starting in a new town, ${campaign.town.trim() || 'Millbrook'}`
                  : campaign.start === 'pick' && campaign.startId
                    ? `, starting in ${index.get(campaign.startId)?.name}`
                    : ''}
                {party.length ? `, with ${party.join(', ')}` : ''}.
              </li>
            ) : (
              <li>No campaign yet.</li>
            )}
            {map && <li>A map of the world from {map.name}.</li>}
          </ul>
          {path === 'own' && (
            <Toggle checked={tutorial} onChange={setTutorial}>
              <span>
                Add records that teach{' '}
                <span className="text-dim">
                  (Start Here, an inn, an NPC with a secret, a faction and a landmark, set in {rows[0]?.name.trim() || worldName}; remove them in one click when you're done)
                </span>
              </span>
            </Toggle>
          )}
          <button type="button" className="btn-primary text-base px-4 py-2" disabled={busy || (path === 'setting' && !installed)} onClick={() => void finish()}>
            <Compass size={16} /> {busy ? 'Making your world…' : path === 'own' ? 'Create my world' : 'Start playing'}
          </button>
        </Card>
      )}

      {path && step !== 'welcome' && (
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={() => (at <= 1 ? (setPath(null), setStep('welcome')) : go(-1))}>
            <ArrowLeft size={14} /> Back
          </button>
          <span className="ml-auto" />
          {step !== 'finish' && (
            <>
              {step !== 'world' && step !== 'setting' && (
                <button type="button" className="btn-ghost" onClick={() => go(1)}>
                  Skip
                </button>
              )}
              <button type="button" className="btn-primary" disabled={(step === 'world' && !world.name.trim()) || (step === 'setting' && !installed)} onClick={() => go(1)}>
                Next <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
