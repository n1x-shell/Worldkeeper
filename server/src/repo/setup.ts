/**
 * The first run (docs/OWN_WORLD_PLAN.md §2.6, §2.7): whether a library still needs setting up, what the wizard makes
 * (your world's realms and calendar, rules and modules, a first campaign, its town and party, and the records that
 * teach), the setting's install, and the dashboard's Getting started checklist.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { CALENDAR_PRESETS, type CalendarDef } from '../../../shared/calendar.js';
import { REALM_KINDS } from '../../../shared/realms.js';
import { buildRecord, sectionDrafts, stripComments } from '../../../shared/newRecord.js';
import { splitSections } from '../import/parseMarkdown.js';
import { createEntity } from './entities.js';
import { createRealm, updateRealm } from './realms.js';
import { setWorldCalendar } from './calendars.js';
import { setLibraryModules } from './modules.js';
import { campaigns, characters, setActiveCampaign } from './campaigns.js';
import { listTemplates } from './templates.js';
import { createRelationship, rebuildDerivedRelationships } from './relationships.js';
import { types } from './recordTypes.js';
import { isInstalled } from '../packs/registry.js';

const setting = (db: DB, key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const put = (db: DB, key: string, value: string) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
const count = (db: DB, sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

export const TUTORIAL_TAG = 'tutorial';

/**
 * Whether the library still needs its first run: nothing in it yet (no records, campaigns, setting pack or import) and
 * the wizard neither finished nor skipped. A library from before the wizard has records, so it never sees it.
 */
export function setupState(db: DB) {
  const done = !!setting(db, 'setup_done');
  const empty =
    count(db, `SELECT COUNT(*) n FROM entities`) === 0 &&
    count(db, `SELECT COUNT(*) n FROM campaigns`) === 0 &&
    count(db, `SELECT COUNT(*) n FROM setting_packs`) === 0 &&
    count(db, `SELECT COUNT(*) n FROM import_runs WHERE status = 'completed'`) === 0;
  return { needed: !done && empty, done, settingInstalled: isInstalled(db, 'worldkeeper') };
}

/** Leave the wizard without making anything (the dashboard's empty states take over). */
export function skipSetup(db: DB) {
  put(db, 'setup_done', JSON.stringify({ at: new Date().toISOString(), path: 'skipped' }));
  return setupState(db);
}

// ---------------------------------------------------------------- the plan

const realmRow = z.object({
  /** The row's key in the plan, for parents ("world" is the world itself). */
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  // Any kind but a world (the world is the library's own).
  kind: z.enum(REALM_KINDS).refine((k) => k !== 'world', 'The world is already there'),
  parent: z.string().max(40).nullable().default(null),
});

export const setupPlan = z.object({
  path: z.enum(['own', 'setting']),
  appName: z.string().trim().max(100).optional(),
  world: z.object({ name: z.string().trim().min(1).max(200), pitch: z.string().trim().max(500).default('') }).optional(),
  /** The calendar: a preset, the year a campaign starts in, and the year's name ("AR" in "1247 AR"). Null: decide later. */
  calendar: z
    .object({
      preset: z.string().max(40),
      year: z.number().int().min(-1_000_000).max(1_000_000).optional(),
      era: z.string().trim().max(40).optional(),
    })
    .nullable()
    .optional(),
  realms: z.array(realmRow).max(40).default([]),
  /** Modules on (true) or off (false); left out follows what the packs say. */
  modules: z.record(z.string(), z.boolean()).default({}),
  campaign: z
    .object({
      title: z.string().trim().min(1).max(300),
      /** A place already in the library, or a town to make (its name). */
      startId: z.string().max(40).nullable().optional(),
      town: z.string().trim().max(200).nullable().optional(),
      party: z.array(z.string().trim().max(200)).max(12).default([]),
    })
    .nullable()
    .optional(),
  tutorial: z.boolean().default(false),
});

const PLACE_REALM_KINDS = new Set(['continent', 'region_group']);

/**
 * Make what the wizard planned, in one go: the world's name and pitch, its realms and calendar, the modules, a first
 * campaign (with a town and the party's characters) and, if wanted, the records that teach. Canon at once for your
 * own world; Canon Review on for the setting.
 */
export function finishSetup(db: DB, input: unknown) {
  const plan = setupPlan.parse(input);
  if (plan.path === 'setting' && !isInstalled(db, 'worldkeeper')) throw badRequest('Add the Oros worldbook first');
  const made: { realms: string[]; campaignId: number | null; town: string | null; characters: number; tutorial: string[] } = {
    realms: [],
    campaignId: null,
    town: null,
    characters: 0,
    tutorial: [],
  };
  const tx = db.transaction(() => {
    if (plan.appName) put(db, 'app_name', plan.appName);
    // Who approves new records (§2.5): your own world is Canon at once; the setting keeps Canon Review.
    put(db, 'canon_review', plan.path === 'own' ? 'off' : 'on');

    if (plan.path === 'own') {
      if (plan.world) updateRealm(db, 'world', { name: plan.world.name, description: plan.world.pitch });
      const ids = new Map<string, string>([['world', 'world']]);
      // Parents before children, whatever order the rows came in.
      const pending = [...plan.realms];
      for (let guard = 0; pending.length && guard < 50; guard++) {
        for (const r of [...pending]) {
          const parent = r.parent ? ids.get(r.parent) : null;
          if (r.parent && !parent) continue;
          const realm = createRealm(db, { name: r.name, kind: r.kind, parent_id: parent ?? null });
          ids.set(r.key, realm.id);
          made.realms.push(realm.id);
          pending.splice(pending.indexOf(r), 1);
        }
      }
      if (pending.length) throw badRequest(`${pending[0].name} is inside a realm that isn't in the plan`);
      if (plan.calendar) {
        const preset = CALENDAR_PRESETS.find((p) => p.key === plan.calendar!.preset);
        if (!preset) throw badRequest(`There is no calendar preset "${plan.calendar.preset}"`);
        const def: CalendarDef = {
          ...preset.def,
          ...(plan.calendar.era ? { eras: [{ format: `{y} ${plan.calendar.era}` }] } : {}),
          ...(plan.calendar.year != null ? { startYear: plan.calendar.year } : {}),
        };
        setWorldCalendar(db, 'world', { def });
      }
    }

    if (Object.keys(plan.modules).length) setLibraryModules(db, plan.modules);

    // Where new places go: the first continent, else the world.
    const home = made.realms.find((id) => PLACE_REALM_KINDS.has((db.prepare('SELECT kind FROM realms WHERE id = ?').get(id) as { kind: string }).kind)) ?? 'world';
    const canon = plan.path === 'own' ? 'CANON' : 'PROPOSED';

    if (plan.campaign) {
      let start = plan.campaign.startId ?? null;
      if (start && !db.prepare('SELECT 1 FROM entities WHERE id = ?').get(start)) throw badRequest('That starting place is not in the library');
      if (!start && plan.campaign.town) {
        start = makeFromTemplate(db, 'settlement', plan.campaign.town, { realm: home, canon }).id;
        made.town = start;
      }
      const c = campaigns.create(db, { title: plan.campaign.title, starting_location_id: start, status: 'active', world_id: 'world' }) as { id: number };
      made.campaignId = c.id;
      setActiveCampaign(db, c.id);
      for (const name of plan.campaign.party.filter(Boolean)) {
        characters.create(db, { campaign_id: c.id, name });
        made.characters++;
      }
    }

    if (plan.tutorial) made.tutorial = makeTutorial(db, { realm: home, town: made.town });

    put(
      db,
      'setup_done',
      JSON.stringify({
        at: new Date().toISOString(),
        path: plan.path,
        // The town the wizard made from the template, for the checklist's "Write …".
        town: made.town,
        // The records there were, so the checklist can tell when the GM makes one of their own.
        records: count(db, `SELECT COUNT(*) n FROM entities`),
      }),
    );
  });
  tx();
  return { ...made, state: setupState(db) };
}

/** A record of a type from its template, with nothing written yet (each section's guidance in a comment). */
function makeFromTemplate(db: DB, type: string, name: string, o: { realm: string; canon: string; parent?: string | null; facts?: Record<string, string> }) {
  const template = listTemplates(db).find((t) => t.type === type) ?? { facts: [], sections: [] };
  const { fields, body } = buildRecord(name, template, o.facts ?? {}, sectionDrafts(template));
  return createEntity(
    db,
    {
      name,
      type,
      realm: o.realm,
      parent_id: o.parent ?? null,
      canon_status: o.canon,
      category_raw: types(db).label(type),
      source_raw: 'Made in the first-run wizard',
      tags: [`realm/${o.realm}`],
      fields,
      body,
    } as never,
    'Made in the first-run wizard',
  );
}

// ---------------------------------------------------------------- records that teach

const tutorialId = (db: DB, type: string, n = 1) => `${types(db).get(type)?.prefix ?? 'CUS'}-TUT${n}`;

/**
 * The records that teach (§2.7): Start Here, a town (unless the wizard made one), an inn in it, an NPC who lives there
 * with a GM-only secret, a faction allied with her and a landmark nearby. Real records, linked together, tagged
 * `tutorial`, with IDs of their own (TUT) so removing them never frees an ID the GM's records could take.
 */
export function makeTutorial(db: DB, o: { realm: string; town?: string | null }): string[] {
  const realmName = (db.prepare('SELECT name FROM realms WHERE id = ?').get(o.realm) as { name: string } | undefined)?.name ?? 'your world';
  const worldName = (db.prepare(`SELECT name FROM realms WHERE id = 'world'`).get() as { name: string } | undefined)?.name ?? 'your world';
  const made: string[] = [];
  const make = (type: string, name: string, fields: [string, string][], body: string, parent: string | null = null) => {
    const id = tutorialId(db, type);
    if (db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id)) return id;
    createEntity(
      db,
      {
        id,
        name,
        type,
        realm: o.realm,
        parent_id: parent,
        canon_status: 'CANON',
        category_raw: types(db).label(type),
        source_raw: 'A tutorial record from the first-run wizard',
        tags: [TUTORIAL_TAG, `realm/${o.realm}`, 'status/canon', 'vis/gm'],
        fields,
        body,
      } as never,
      'Tutorial record',
    );
    made.push(id);
    return id;
  };
  const note = (what: string) => `\n\n_What this section is for: ${what}_`;

  let town = o.town ?? null;
  const townName = town ? ((db.prepare('SELECT name FROM entities WHERE id = ?').get(town) as { name: string } | undefined)?.name ?? 'the town') : 'Millbrook';
  if (!town)
    town = make(
      'settlement',
      'Millbrook',
      [
        ['Population', 'about 600'],
        ['Ruled by', 'the Mill Council'],
        ['What people say', 'The Lantern Inn never closes, and nobody knows who pays for the oil.'],
        ['Terrain', 'grassland'],
        ['Danger', 'safe'],
        ['Wealth', 'modest'],
      ],
      `# Millbrook

## A first look

Three mill wheels turn in a slow brown river, and every roof is slate. Lamps burn in the windows of @[The Lantern Inn] even at noon.${note('a few lines to read aloud as the party arrives.')}

## What you know

- The mills grind for half of ${realmName}.
- The Mill Council meets at the inn, never at the town hall.${note('the plain facts anyone here could tell a stranger.')}

## Who runs it

The Mill Council: three millers and whoever keeps the inn. Today that's @[Edda Vane].${note('who keeps order, and what they care about.')}

## Places in town

- @[The Lantern Inn], by the middle wheel.
- @[The Old Watchtower], an hour's walk up the hill.${note('the places worth visiting, each with a line, linked to their own records.')}
`,
    );

  const inn = make(
    'building',
    'The Lantern Inn',
    [],
    `# The Lantern Inn

## A first look

A long low room, warm, smelling of bread and lamp oil. Every lamp is lit, all the time.${note('what the party sees as they walk in.')}

## Who's here

@[Edda Vane] keeps it. The @[The Lamplighters] drink in the back room on market days.${note('the people found here, linked to their records so a hover shows them.')}
`,
    town,
  );

  const npc = make(
    'npc',
    'Edda Vane',
    [
      ['Pronouns', 'she/her'],
      ['Species', 'Human'],
      ['Looks', 'Grey braid, ink on her fingers, a lamp-lighter’s pole by the door'],
      ['Manner', 'Warm, quick, never answers a question she hasn’t asked herself first'],
      ['Home', townName],
    ],
    `# Edda Vane

## Who they are

The keeper of @[The Lantern Inn] and the quiet fourth voice on the Mill Council.${note('what anyone could tell the party about her.')}

## What they want

To keep every lamp in ${townName} burning through the winter.${note('the one thing she is working towards.')}

## Secrets (GM only)

The oil comes from @[The Lamplighters], and they don't buy it. Players never see this section, whatever you reveal.${note('what only you know. A heading ending in "(GM only)" never reaches players.')}
`,
    inn,
  );

  const faction = make(
    'faction',
    'The Lamplighters',
    [
      ['Goal', 'Keep the roads lit, whatever it costs'],
      ['Leader', 'unknown'],
    ],
    `# The Lamplighters

## Who they are

A guild that lights the lamps along the roads of ${realmName}. Nobody remembers hiring them.${note('what the group is, in a line or two.')}

## Allies and rivals

Allied with @[Edda Vane].${note('who they work with and against; links here show on the Relationship graph.')}
`,
  );

  make(
    'landmark',
    'The Old Watchtower',
    [
      ['Terrain', 'hill'],
      ['Danger', 'risky'],
    ],
    `# The Old Watchtower

## A first look

A broken tower on the hill above ${townName}. One lamp burns at the top, and nobody climbs up to light it.${note('a few lines to read aloud. Pin it on your map in the Atlas.')}
`,
  );

  make(
    'custom',
    'Start Here',
    [],
    `# Start Here

## What this is

Welcome to ${worldName}. Everything in it is a **record**: a place, a person, a group, a rule. Records link to each other, sit in **realms** (here, ${realmName}) and belong to your world, not to any one campaign.

This record and the few it links to are **tutorial records**. They're real records, so try anything on them. When you're done, remove them all in one click from **Getting started** on the dashboard.

## Things to try

1. Hover the link to @[The Lantern Inn] to see it without leaving this page. Press \`]\` to open it beside this one.
2. Open @[Edda Vane]. Her section marked **GM only** never reaches players.
3. On her page, open **Player view** and reveal a section. That's what your players will see, and nothing else.
4. Open **Relationships** on @[The Lamplighters] to see who they're tied to.
5. Make a record of your own with **New** in the top bar, or **Add an NPC who lives here** on ${townName}.
6. Open the **Atlas** and add a map of your world; pin @[The Old Watchtower] on it.

## Campaigns

Your world is shared by every **campaign** you run in it. A campaign keeps its own sessions, party, quests and notes, and what its players have learned.
`,
  );

  // A faction allied with her, and the links the text makes.
  createRelationship(db, { source_id: faction, target_id: npc, type: 'allied_with', canon_status: 'CANON', description: 'A tutorial link' });
  for (const id of new Set([...made, inn, npc, town])) if (id) rebuildDerivedRelationships(db, id);
  return made;
}

/** The records the wizard made to teach. */
export const tutorialIds = (db: DB) => (db.prepare(`SELECT id FROM entities WHERE tags LIKE ?`).all(`%"${TUTORIAL_TAG}"%`) as { id: string }[]).map((r) => r.id);

/**
 * Remove the records that teach: they, their links, history, pins and search entries go. What points at them from
 * elsewhere (a campaign's starting place, a map's record) is cleared, never deleted.
 */
export function removeTutorial(db: DB) {
  const ids = tutorialIds(db);
  if (!ids.length) return { removed: 0 };
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((t) => t.name);
  const tx = db.transaction(() => {
    for (const table of tables) {
      if (table === 'entities') continue;
      let fks: { table: string; from: string; to: string | null }[];
      try {
        fks = db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as typeof fks;
      } catch {
        continue;
      }
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; notnull: number }[];
      for (const fk of fks.filter((f) => f.table === 'entities')) {
        const nullable = !cols.find((c) => c.name === fk.from)?.notnull;
        const marks = ids.map(() => '?').join(',');
        if (nullable) db.prepare(`UPDATE "${table}" SET "${fk.from}" = NULL WHERE "${fk.from}" IN (${marks})`).run(...ids);
        else db.prepare(`DELETE FROM "${table}" WHERE "${fk.from}" IN (${marks})`).run(...ids);
      }
    }
    const marks = ids.map(() => '?').join(',');
    // Columns that name records without a foreign key.
    for (const [table, col] of [
      ['relationships', 'source_id'],
      ['relationships', 'target_id'],
      ['entity_revisions', 'entity_id'],
      ['recent_views', 'entity_id'],
      ['proposals', 'entity_id'],
      ['map_markers', 'entity_id'],
    ] as const)
      if (tables.includes(table)) db.prepare(`DELETE FROM ${table} WHERE ${col} IN (${marks})`).run(...ids);
    db.prepare(`UPDATE campaigns SET starting_location_id = NULL WHERE starting_location_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM search_index WHERE kind = 'entity' AND ref IN (${marks})`).run(...ids);
    db.prepare(`UPDATE entities SET parent_id = NULL WHERE parent_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM entities WHERE id IN (${marks})`).run(...ids);
  });
  tx();
  return { removed: ids.length };
}

// ---------------------------------------------------------------- Getting started

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Where to go to do it. */
  to: string;
}

interface Progress {
  dismissed?: boolean;
  ticked?: string[];
}
const progress = (db: DB): Progress => {
  try {
    return JSON.parse(setting(db, 'getting_started') ?? '{}') as Progress;
  } catch {
    return {};
  }
};

/** The dashboard's Getting started card: what's been tried, worked out from the library, or ticked by hand. */
export function gettingStarted(db: DB) {
  const p = progress(db);
  const ticked = new Set(p.ticked ?? []);
  let setup: { at?: string; records?: number; path?: string; town?: string | null } = {};
  try {
    setup = JSON.parse(setting(db, 'setup_done') ?? '{}');
  } catch {
    /* none */
  }
  const tutorial = tutorialIds(db);
  const start = tutorial.find((id) => id.startsWith(`${types(db).get('custom')?.prefix ?? 'CUS'}-TUT`)) ?? null;
  const npc = tutorial.find((id) => db.prepare(`SELECT 1 FROM entities WHERE id = ? AND type = 'npc'`).get(id)) ?? null;
  const seen = (id: string | null) => !!id && !!db.prepare('SELECT 1 FROM recent_views WHERE entity_id = ?').get(id);
  const own = count(db, `SELECT COUNT(*) n FROM entities WHERE tags NOT LIKE ? AND origin = 'user'`, `%"${TUTORIAL_TAG}"%`);
  const baseline = Math.max(0, (setup.records ?? 0) - tutorial.length);
  // The town the wizard made: written once any of its sections is (each starts as its guidance, waiting).
  const town = setup.town ? (db.prepare('SELECT id, name, body FROM entities WHERE id = ?').get(setup.town) as { id: string; name: string; body: string } | undefined) : undefined;
  const townWritten = (body: string) => splitSections(body).some((s) => s.heading && stripComments(s.content).trim().length > 0);
  const items: ChecklistItem[] = [
    ...(start ? [{ key: 'start', label: 'Read Start Here', done: seen(start), to: `/e/${start}` }] : []),
    ...(town ? [{ key: 'town', label: `Write ${town.name}: fill in a section or two`, done: townWritten(town.body), to: `/e/${town.id}` }] : []),
    { key: 'peek', label: 'Hover a link to peek at a record, then press ] to open it beside', done: false, to: start ? `/e/${start}` : '/browse/all' },
    { key: 'new', label: 'Make a record of your own with New', done: own > baseline, to: '/new?type=npc' },
    { key: 'reveal', label: 'Reveal a section to your players', done: count(db, `SELECT COUNT(*) n FROM entities WHERE revealed = 1`) > 0, to: npc ? `/e/${npc}` : '/browse/all' },
    { key: 'map', label: 'Add a map of your world in the Atlas', done: count(db, `SELECT COUNT(*) n FROM maps`) > 0, to: '/atlas' },
    { key: 'session', label: 'Plan your first session', done: count(db, `SELECT COUNT(*) n FROM sessions`) > 0, to: '/sessions' },
  ].map((i) => ({ ...i, done: i.done || ticked.has(i.key) }));
  return {
    show: !!setup.at && setup.path !== 'skipped' && !p.dismissed,
    items,
    tutorial: tutorial.length,
  };
}

export function updateGettingStarted(db: DB, body: unknown) {
  const b = z.object({ tick: z.string().max(40).optional(), untick: z.string().max(40).optional(), dismissed: z.boolean().optional() }).parse(body ?? {});
  const p = progress(db);
  const ticked = new Set(p.ticked ?? []);
  if (b.tick) ticked.add(b.tick);
  if (b.untick) ticked.delete(b.untick);
  put(db, 'getting_started', JSON.stringify({ dismissed: b.dismissed ?? p.dismissed ?? false, ticked: [...ticked] }));
  return gettingStarted(db);
}
