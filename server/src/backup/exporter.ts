import { handbookCode } from '../repo/handbookCodes.js';
import fs from 'node:fs';
import path from 'node:path';
import { renewCharacterCode } from '../repo/characterPages.js';
import AdmZip from 'adm-zip';
import type { DB } from '../db/connection.js';
import type { Paths } from '../config.js';
import { schemaVersion } from '../db/migrations.js';
import { rowToEntity, type EntityRow } from '../repo/entities.js';
import { parseJson } from '../lib/json.js';
import { playerSnapshot } from '../player/projection.js';
import { reindexAll } from '../repo/search.js';
import { badRequest } from '../lib/errors.js';
import { portraitDataUrl, savePortrait } from '../repo/portraits.js';
import type { Entity } from '../../../shared/domain.js';
import { repairRealms } from '../repo/realms.js';
import { listRealms } from '../repo/realms.js';
import { BUILTIN_REGISTRY } from '../../../shared/recordTypes.js';
import { syncBuiltinTypes, types } from '../repo/recordTypes.js';
import { installedManifests, syncInstalledPacks } from '../packs/registry.js';
import { normalizeRealm, normalizeType } from '../import/normalize.js';
import { buildSidecar, SIDECAR_PATH } from './sidecar.js';
import { setModuleData } from '../repo/modules.js';
import { modulesFromMechanics } from '../../../shared/modules.js';

/** Tables included in a full JSON export, in dependency order. */
export const TABLES = [
  'settings',
  'setting_packs',
  'calendars',
  'realms',
  'record_types',
  'entities',
  'entity_revisions',
  'relationships',
  'source_documents',
  'templates',
  'import_runs',
  'timeline_rows',
  'recent_views',
  'campaigns',
  'characters',
  'character_pages',
  'character_changes',
  'quests',
  'adventures',
  'scenes',
  'scene_links',
  'sessions',
  'session_log',
  'campaign_state',
  'faction_plans',
  'encounters',
  'proposals',
  'notes',
  'random_tables',
  'dice_log',
  'maps',
  'map_markers',
  'map_shapes',
  'profiles',
  'eras',
  'rumours',
  'rumour_heard',
  'mysteries',
  'secrets',
  'clues',
  'secret_progress',
  'clue_found',
  'map_discoveries',
  'map_travel',
  'faction_standing',
  'renown_log',
  'return_clock',
  'return_log',
  'faction_ties_revealed',
  'party_treasure',
  'module_data',
  'statblocks',
  'handouts',
  'bastions',
  'bastion_turns',
  'downtime',
  'calendar_events',
  'campaign_reveals',
  'campaign_map_reveals',
  'campaign_timeline_reveals',
];

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'entry';

/**
 * Render a record in the library's own metadata-header format so it can be re-imported with its type and realm. The
 * original wording is kept when it still reads back as the record's type and realm; otherwise (a record made here, or
 * one whose type or realm was changed) the type's label and the realm's name are written instead.
 */
export function entityToMarkdown(e: Entity, db?: DB): string {
  const reg = db ? types(db) : BUILTIN_REGISTRY;
  const known = db ? listRealms(db, { includeArchived: true }).map((r) => ({ id: r.id, name: r.name })) : [];
  const category = e.category_raw && normalizeType(e.id, e.category_raw, reg) === e.type ? e.category_raw : reg.label(e.type);
  const realmName = known.find((r) => r.id === e.realm)?.name ?? e.realm;
  const realm = e.realm_raw && normalizeRealm(e.realm_raw, known).realm === e.realm ? e.realm_raw : realmName;
  const head: [string, string][] = [
    ['ID', e.id],
    ['Name', e.name],
    ['Alternate names', e.aliases.length ? e.aliases.join('; ') : 'None'],
    ['Category', category],
    ['Parent', e.parent_raw ?? (e.parent_id ? `[${e.parent_id}]` : 'None')],
    ['Continent or realm', realm],
    ['Canon status', e.canon_raw ?? e.canon_status],
    ['Source', e.source_raw ?? 'UNDEFINED'],
    ['Tags', e.tags.join(', ')],
    ...e.fields,
  ];
  return `${head.map(([k, v]) => `${k}: ${v.replace(/\r?\n/g, ' ')}`).join('\n')}\n\n${e.body.trim()}\n`;
}

export function exportJson(db: DB) {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return { app: 'worldkeeper', format: 1, schemaVersion: schemaVersion(db), exported_at: new Date().toISOString(), tables };
}

/** Load a full JSON export into an EMPTY installation (use backup restore to replace existing data). */
export function importJson(db: DB, data: ReturnType<typeof exportJson>) {
  if (data?.app !== 'worldkeeper' || typeof data.tables !== 'object') throw badRequest('Not a Worldkeeper JSON export');
  const n = (db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n + (db.prepare('SELECT COUNT(*) n FROM campaigns').get() as { n: number }).n;
  if (n > 0) throw badRequest('JSON import requires an empty library. Restore a backup archive to replace existing data.');
  const tx = db.transaction(() => {
    // Rows reference each other within a table (The World sits in Evershroud, exported after it): check keys at the end.
    db.pragma('defer_foreign_keys = ON');
    for (const t of TABLES) {
      const rows = (data.tables[t] ?? []) as Record<string, unknown>[];
      if (!rows.length) continue;
      const cols = (db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as { name: string }[]).map((c) => c.name);
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.includes(k));
        db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(
          Object.fromEntries(keys.map((k) => [k, row[k]])),
        );
      }
    }
    // An export from before realms were data names its realms only on records: make sure each exists, with the
    // installed packs' own realms as they define them.
    const packRealms = Object.fromEntries(installedManifests(db).flatMap((m) => m.realms.map((r) => [r.id, r] as const)));
    repairRealms(db, packRealms);
    adoptLegacyModuleData(db, data.tables as Record<string, Record<string, unknown>[] | undefined>);
    syncInstalledPacks(db);
    syncBuiltinTypes(db); // the imported types replace the registry this library had cached
    reindexAll(db);
  });
  tx();
}

export function exportMarkdownZip(db: DB): Buffer {
  const zip = new AdmZip();
  const rows = db.prepare('SELECT * FROM entities ORDER BY id').all() as EntityRow[];
  for (const r of rows) {
    const e = rowToEntity(r);
    zip.addFile(`Worldkeeper_Library/${e.realm}/${e.type}/${e.id}_${slug(e.name)}.md`, Buffer.from(entityToMarkdown(e, db), 'utf8'));
  }
  // The realms as they are, the GM's templates, and each record's canon flags and reveals (sidecar.ts).
  zip.addFile(`Worldkeeper_Library/${SIDECAR_PATH}`, Buffer.from(JSON.stringify(buildSidecar(db), null, 1), 'utf8'));
  zip.addFile(
    'Worldkeeper_Library/README.md',
    Buffer.from(
      `# Worldkeeper Markdown export\n\nExported ${new Date().toISOString()}. ${rows.length} records in the library's metadata-header format.\nImport this ZIP into any Worldkeeper installation: its realms, your templates, canon flags and what players have been shown come back with it (${SIDECAR_PATH}). Campaigns and DM-only tools are in the JSON export, a campaign export or a backup.\n`,
    ),
  );
  return zip.toBuffer();
}

export function exportFullWorldZip(db: DB, paths: Paths): Buffer {
  const zip = new AdmZip(exportMarkdownZip(db));
  zip.addFile('worldkeeper.json', Buffer.from(JSON.stringify(exportJson(db))));
  for (const d of db.prepare('SELECT path, content FROM source_documents').all() as { path: string; content: string }[]) {
    zip.addFile(`Original_Sources/${d.path.replace(/@/g, '_at_')}`, Buffer.from(d.content, 'utf8'));
  }
  if (fs.existsSync(paths.uploadsDir)) for (const f of fs.readdirSync(paths.uploadsDir)) zip.addLocalFile(path.join(paths.uploadsDir, f), 'uploads');
  return zip.toBuffer();
}

/**
 * Load a full-world ZIP (exportFullWorldZip) into an EMPTY installation: its JSON export, and the pictures (maps,
 * handouts, portraits) it carries. Only plain picture files are taken from it.
 */
export function importFullWorldZip(db: DB, paths: Paths, buffer: Buffer) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest('Not a ZIP file');
  }
  const json = zip.getEntry('worldkeeper.json');
  if (!json) throw badRequest('Not a full-world ZIP: it has no worldkeeper.json. Import a Markdown ZIP from Import and Export instead.');
  importJson(db, JSON.parse(json.getData().toString('utf8')));
  let pictures = 0;
  fs.mkdirSync(paths.uploadsDir, { recursive: true });
  for (const e of zip.getEntries()) {
    const m = /^uploads\/([\w.-]+\.(?:png|jpg|jpeg|webp|gif))$/i.exec(e.entryName);
    if (!m || e.isDirectory || e.header.size > 60 * 1024 * 1024) continue;
    fs.writeFileSync(path.join(paths.uploadsDir, m[1]), e.getData());
    pictures++;
  }
  return { pictures };
}

export function exportCampaign(db: DB, campaignId: number, uploadsDir?: string) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as Record<string, unknown> | undefined;
  if (!row) throw badRequest('Unknown campaign');
  // The handbook code is this table's private address: it never leaves in an export.
  const { handbook_code: _code, ...c } = row;
  void _code;
  const advIds = (db.prepare('SELECT id FROM adventures WHERE campaign_id = ?').all(campaignId) as { id: number }[]).map((a) => a.id);
  const sesIds = (db.prepare('SELECT id FROM sessions WHERE campaign_id = ?').all(campaignId) as { id: number }[]).map((a) => a.id);
  const inList = (ids: number[]) => (ids.length ? ids.join(',') : '-1');
  const byCampaign = (table: string) => db.prepare(`SELECT * FROM ${table} WHERE campaign_id = ?`).all(campaignId) as Record<string, unknown>[];
  const extra = Object.fromEntries(CAMPAIGN_TABLES.map((t) => [t, byCampaign(t)])) as Record<(typeof CAMPAIGN_TABLES)[number], Record<string, unknown>[]>;
  const bastionIds = extra.bastions.map((b) => b.id as number);
  const treasureIds = extra.party_treasure.map((t) => t.id as number);
  const more = {
    ...extra,
    bastion_turns: db.prepare(`SELECT * FROM bastion_turns WHERE bastion_id IN (${inList(bastionIds)})`).all(),
    // What the party has learned, by the rumour's, secret's and clue's own key (ids differ from library to library).
    rumour_heard: db
      .prepare(`SELECT h.*, r.key AS rumour_key, r.text AS rumour_text FROM rumour_heard h JOIN rumours r ON r.id = h.rumour_id WHERE h.campaign_id = ?`)
      .all(campaignId),
    secret_progress: db
      .prepare(`SELECT p.*, s.key AS secret_key, s.title AS secret_title FROM secret_progress p JOIN secrets s ON s.id = p.secret_id WHERE p.campaign_id = ?`)
      .all(campaignId),
    clue_found: db
      .prepare(`SELECT f.*, c.key AS clue_key, c.note AS clue_note, s.key AS secret_key FROM clue_found f JOIN clues c ON c.id = f.clue_id JOIN secrets s ON s.id = c.secret_id WHERE f.campaign_id = ?`)
      .all(campaignId),
    // Where the party has been, by the map's name.
    map_discoveries: db.prepare(`SELECT d.*, m.name AS map_name FROM map_discoveries d JOIN maps m ON m.id = d.map_id WHERE d.campaign_id = ?`).all(campaignId),
    map_travel: db.prepare(`SELECT t.*, m.name AS map_name FROM map_travel t JOIN maps m ON m.id = t.map_id WHERE t.campaign_id = ?`).all(campaignId),
    // What only this campaign's players have learned (repo/reveals.ts), records by ID; maps, pins and outlines by
    // their map's name and what they mark (ids differ from library to library).
    campaign_reveals: db.prepare('SELECT entity_id, revealed, revealed_sections, revealed_facts FROM campaign_reveals WHERE campaign_id = ?').all(campaignId),
    campaign_map_reveals: db
      .prepare(
        `SELECT r.kind, COALESCE(m.name, mm.name, sm.name) AS map_name, COALESCE(mk.entity_id, sh.entity_id) AS entity_id, COALESCE(mk.label, sh.label) AS label
         FROM campaign_map_reveals r
         LEFT JOIN maps m ON r.kind = 'map' AND m.id = r.ref_id
         LEFT JOIN map_markers mk ON r.kind = 'marker' AND mk.id = r.ref_id LEFT JOIN maps mm ON mm.id = mk.map_id
         LEFT JOIN map_shapes sh ON r.kind = 'shape' AND sh.id = r.ref_id LEFT JOIN maps sm ON sm.id = sh.map_id
         WHERE r.campaign_id = ?`,
      )
      .all(campaignId),
    // History rows shown only to this campaign, by their time and event (ids differ from library to library).
    campaign_timeline_reveals: db
      .prepare('SELECT t.time_label, t.event FROM campaign_timeline_reveals r JOIN timeline_rows t ON t.id = r.row_id WHERE r.campaign_id = ?')
      .all(campaignId),
    // Modules' data about the party's treasure (fading salvage).
    treasure_module_data: db.prepare(`SELECT * FROM module_data WHERE owner = 'treasure' AND owner_id IN (${inList(treasureIds)})`).all(),
    handout_images: uploadsDir
      ? Object.fromEntries(extra.handouts.map((h) => [h.id, pictureDataUrl(uploadsDir, h.image_file)] as const).filter(([, v]) => v))
      : {},
  };
  const base = {
    campaign: c,
    characters: db.prepare('SELECT * FROM characters WHERE campaign_id = ?').all(campaignId),
    character_pages: db.prepare('SELECT p.* FROM character_pages p JOIN characters c ON c.id = p.character_id WHERE c.campaign_id = ?').all(campaignId),
    character_changes: db.prepare('SELECT x.* FROM character_changes x JOIN characters c ON c.id = x.character_id WHERE c.campaign_id = ?').all(campaignId),
    // Modules' data about its characters (Thinning's track and true names).
    module_data: db.prepare(`SELECT m.* FROM module_data m JOIN characters c ON c.id = m.owner_id WHERE m.owner = 'character' AND c.campaign_id = ?`).all(campaignId),
    // Portraits travel inside the export, as pictures.
    portraits: uploadsDir
      ? Object.fromEntries(
          (db.prepare('SELECT id, sheet FROM characters WHERE campaign_id = ?').all(campaignId) as { id: number; sheet: string }[])
            .map((c) => [c.id, portraitDataUrl(uploadsDir, (JSON.parse(c.sheet || '{}') as { portrait?: string }).portrait)])
            .filter(([, v]) => v),
        )
      : {},
    quests: db.prepare('SELECT * FROM quests WHERE campaign_id = ?').all(campaignId),
    adventures: db.prepare('SELECT * FROM adventures WHERE campaign_id = ?').all(campaignId),
    scenes: db.prepare(`SELECT * FROM scenes WHERE adventure_id IN (${inList(advIds)})`).all(),
    scene_links: db.prepare(`SELECT * FROM scene_links WHERE adventure_id IN (${inList(advIds)})`).all(),
    sessions: db.prepare('SELECT * FROM sessions WHERE campaign_id = ?').all(campaignId),
    session_log: db.prepare(`SELECT * FROM session_log WHERE session_id IN (${inList(sesIds)})`).all(),
    campaign_state: db.prepare('SELECT * FROM campaign_state WHERE campaign_id = ?').all(campaignId),
    faction_plans: db.prepare('SELECT * FROM faction_plans WHERE campaign_id = ?').all(campaignId),
    encounters: db.prepare('SELECT * FROM encounters WHERE campaign_id = ?').all(campaignId),
    notes: db.prepare('SELECT * FROM notes WHERE campaign_id = ?').all(campaignId),
    ...more,
  };
  return { app: 'worldkeeper-campaign' as const, format: 2, exported_at: new Date().toISOString(), needs: campaignNeeds(db, base), ...base };
}

/** Campaign tables kept by campaign (besides those exportCampaign reads itself), all copied to an imported campaign. */
const CAMPAIGN_TABLES = [
  'faction_standing',
  'renown_log',
  'return_clock',
  'return_log',
  'faction_ties_revealed',
  'party_treasure',
  'handouts',
  'bastions',
  'downtime',
  'calendar_events',
  'profiles',
] as const;

/** A picture in the uploads folder, as a data URL (a handout's image travels inside the export). */
function pictureDataUrl(uploadsDir: string, file: unknown): string | null {
  if (typeof file !== 'string' || !/^[\w.-]+\.(png|jpg|jpeg|webp|gif)$/i.test(file)) return null;
  const full = path.join(uploadsDir, file);
  if (!fs.existsSync(full)) return null;
  const ext = file.split('.').pop()!.toLowerCase();
  const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${type};base64,${fs.readFileSync(full).toString('base64')}`;
}

/**
 * What a campaign needs from the library it goes into: its world, the setting packs installed where it was made, the
 * records it refers to and the maps its travel was on. Written into the export, and checked on import.
 */
function campaignNeeds(db: DB, data: Record<string, unknown>) {
  const rows = (k: string) => (data[k] ?? []) as Record<string, unknown>[];
  const c = data.campaign as Record<string, unknown>;
  const ids = new Set<string>();
  const add = (v: unknown) => typeof v === 'string' && v && ids.add(v);
  add(c.starting_location_id);
  for (const f of parseJson<string[]>(String(c.active_factions ?? '[]'), [])) add(f);
  for (const [table, cols] of [
    ['campaign_state', ['entity_id']],
    ['quests', ['giver_id', 'location_id']],
    ['faction_standing', ['faction_id']],
    ['faction_plans', ['faction_id']],
    ['renown_log', ['faction_id']],
    ['party_treasure', ['entity_id']],
    ['bastions', ['location_id', 'host_faction_id']],
    ['encounters', ['location_id']],
    ['map_travel', ['entity_id']],
    ['map_discoveries', ['entity_id']],
    ['profiles', ['entity_id']],
    ['campaign_reveals', ['entity_id']],
  ] as const)
    for (const r of rows(table)) for (const col of cols) add(r[col]);
  const world = c.world_id ? (db.prepare('SELECT id, name FROM realms WHERE id = ?').get(c.world_id) as { id: string; name: string } | undefined) : undefined;
  return {
    world: world ?? null,
    packs: db.prepare('SELECT id, name, version FROM setting_packs ORDER BY id').all() as { id: string; name: string; version: string }[],
    records: [...ids].sort(),
    maps: [...new Set([...rows('map_travel'), ...rows('map_discoveries')].map((r) => r.map_name as string).filter(Boolean))].sort(),
  };
}

/** What an imported campaign refers to that this library doesn't have. */
export function campaignMissing(db: DB, data: { needs?: ReturnType<typeof campaignNeeds> }) {
  const n = data.needs;
  if (!n) return { world: null, packs: [], records: [], maps: [] };
  return {
    world: n.world && !db.prepare('SELECT 1 FROM realms WHERE id = ?').get(n.world.id) ? n.world.name : null,
    packs: n.packs.filter((p) => !db.prepare('SELECT 1 FROM setting_packs WHERE id = ?').get(p.id)).map((p) => p.name),
    records: n.records.filter((id) => !db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id)),
    maps: n.maps.filter((name) => !db.prepare('SELECT 1 FROM maps WHERE name = ?').get(name)),
  };
}

/** Import a campaign export, with a report of anything it refers to that this library lacks. */
export function importCampaignWithReport(db: DB, data: ReturnType<typeof exportCampaign>, uploadsDir?: string) {
  const missing = campaignMissing(db, data);
  return { campaignId: importCampaign(db, data, uploadsDir), missing };
}

/** Import a campaign export as a NEW campaign (all ids remapped). World records are referenced, never copied. */
export function importCampaign(db: DB, data: ReturnType<typeof exportCampaign>, uploadsDir?: string): number {
  if (data?.app !== 'worldkeeper-campaign') throw badRequest('Not a Worldkeeper campaign export');
  const tx = db.transaction(() => {
    const insert = (table: string, row: Record<string, unknown>, overrides: Record<string, unknown>) => {
      const cols = (db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((c) => c.name);
      const merged = { ...row, ...overrides };
      delete merged.id;
      const keys = Object.keys(merged).filter((k) => cols.includes(k));
      return Number(
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(Object.fromEntries(keys.map((k) => [k, merged[k]])))
          .lastInsertRowid,
      );
    };
    const c = data.campaign as Record<string, unknown>;
    // A new handbook address for the copy: the original's code stays with the original.
    const cid = insert('campaigns', c, { title: `${c.title} (imported)`, handbook_code: null });
    handbookCode(db, cid);
    const advMap = new Map<number, number>();
    const sesMap = new Map<number, number>();
    const sceneMap = new Map<number, number>();
    const charMap = new Map<number, number>();
    for (const r of data.characters as Record<string, unknown>[]) charMap.set(r.id as number, insert('characters', r, { campaign_id: cid }));
    // Each page comes with its character; the private code is renewed, so the original campaign's links don't open the copy.
    for (const r of (data.character_pages ?? []) as Record<string, unknown>[])
      if (charMap.has(r.character_id as number)) {
        const id = charMap.get(r.character_id as number)!;
        insert('character_pages', r, { character_id: id, code: `IMPORT-${id}` });
        renewCharacterCode(db, id);
      }
    for (const r of (data.module_data ?? []) as Record<string, unknown>[])
      if (r.owner === 'character' && charMap.has(r.owner_id as number)) insert('module_data', r, { owner_id: charMap.get(r.owner_id as number) });
    // An export from before modules kept Thinning on the page itself.
    adoptLegacyModuleData(db, {
      character_pages: ((data.character_pages ?? []) as Record<string, unknown>[]).filter((r) => charMap.has(r.character_id as number)).map((r) => ({ ...r, character_id: charMap.get(r.character_id as number) })),
    });
    for (const r of (data.character_changes ?? []) as Record<string, unknown>[])
      if (charMap.has(r.character_id as number)) insert('character_changes', r, { character_id: charMap.get(r.character_id as number) });
    // A portrait becomes a new file for the copy; without the picture, the copy has none.
    for (const [oldId, id] of charMap) {
      const pic = (data.portraits ?? {})[oldId];
      const row = db.prepare('SELECT sheet FROM characters WHERE id = ?').get(id) as { sheet: string };
      const sheet = JSON.parse(row.sheet || '{}') as Record<string, unknown>;
      if (!sheet.portrait) continue;
      delete sheet.portrait;
      db.prepare('UPDATE characters SET sheet = ? WHERE id = ?').run(JSON.stringify(sheet), id);
      if (pic && uploadsDir) savePortrait(db, uploadsDir, id, pic);
    }
    for (const r of data.quests as Record<string, unknown>[]) insert('quests', r, { campaign_id: cid });
    for (const r of data.adventures as Record<string, unknown>[]) advMap.set(r.id as number, insert('adventures', r, { campaign_id: cid }));
    for (const r of data.scenes as Record<string, unknown>[]) sceneMap.set(r.id as number, insert('scenes', r, { adventure_id: advMap.get(r.adventure_id as number) }));
    for (const r of data.scene_links as Record<string, unknown>[])
      insert('scene_links', r, { adventure_id: advMap.get(r.adventure_id as number), from_scene: sceneMap.get(r.from_scene as number), to_scene: sceneMap.get(r.to_scene as number) });
    // A session's "adventures in play" point at the copies; one that wasn't exported is dropped.
    const prepFor = (raw: unknown) => {
      const prep = (typeof raw === 'string' ? parseJson<unknown>(raw, null) : raw) as { adventureIds?: unknown } | null;
      if (!prep || typeof prep !== 'object') return raw;
      const ids = Array.isArray(prep.adventureIds) ? prep.adventureIds : [];
      return JSON.stringify({ ...prep, adventureIds: ids.map((a) => advMap.get(a as number)).filter((a) => a != null) });
    };
    for (const r of data.sessions as Record<string, unknown>[])
      sesMap.set(r.id as number, insert('sessions', r, { campaign_id: cid, current_scene_id: null, prep: prepFor(r.prep) }));
    for (const r of data.session_log as Record<string, unknown>[]) insert('session_log', r, { session_id: sesMap.get(r.session_id as number) });
    for (const r of data.campaign_state as Record<string, unknown>[])
      insert('campaign_state', r, { campaign_id: cid, session_id: r.session_id ? (sesMap.get(r.session_id as number) ?? null) : null });
    for (const r of data.faction_plans as Record<string, unknown>[]) insert('faction_plans', r, { campaign_id: cid });
    for (const r of data.encounters as Record<string, unknown>[])
      insert('encounters', r, { campaign_id: cid, session_id: r.session_id ? (sesMap.get(r.session_id as number) ?? null) : null });
    for (const r of data.notes as Record<string, unknown>[]) insert('notes', r, { campaign_id: cid });

    // Everything else the campaign keeps (an export from before format 2 has none of it).
    const more = data as unknown as Record<string, Record<string, unknown>[] | Record<string, string> | undefined>;
    const list = (k: string) => (Array.isArray(more[k]) ? more[k] : []);
    const ses = (r: Record<string, unknown>) => (r.session_id ? (sesMap.get(r.session_id as number) ?? null) : null);
    for (const t of ['faction_standing', 'renown_log', 'return_clock', 'return_log', 'faction_ties_revealed', 'downtime', 'calendar_events', 'profiles'] as const)
      for (const r of list(t)) insert(t, r, { campaign_id: cid, ...('session_id' in r ? { session_id: ses(r) } : {}) });
    const treasureMap = new Map<number, number>();
    for (const r of list('party_treasure')) treasureMap.set(r.id as number, insert('party_treasure', r, { campaign_id: cid, session_id: ses(r) }));
    for (const r of list('treasure_module_data'))
      if (treasureMap.has(r.owner_id as number)) insert('module_data', r, { owner_id: treasureMap.get(r.owner_id as number) });
    const images = (more.handout_images ?? {}) as Record<string, string>;
    for (const r of list('handouts')) {
      const id = insert('handouts', r, { campaign_id: cid, session_id: ses(r), image_file: null });
      const pic = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(images[String(r.id)] ?? '');
      if (pic && uploadsDir) {
        const file = `handout-${id}-${Date.now().toString(36)}.${pic[1] === 'jpeg' ? 'jpg' : pic[1]}`;
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, file), Buffer.from(pic[2], 'base64'));
        db.prepare('UPDATE handouts SET image_file = ? WHERE id = ?').run(file, id);
      }
    }
    const bastionMap = new Map<number, number>();
    for (const r of list('bastions')) bastionMap.set(r.id as number, insert('bastions', r, { campaign_id: cid }));
    for (const r of list('bastion_turns')) if (bastionMap.has(r.bastion_id as number)) insert('bastion_turns', r, { bastion_id: bastionMap.get(r.bastion_id as number), session_id: ses(r) });
    // What the party has learned, matched by key (or wording) in this library; what it doesn't have is left out.
    const idBy = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { id: number } | undefined)?.id;
    const drop = ['rumour_key', 'rumour_text', 'secret_key', 'secret_title', 'clue_key', 'clue_note', 'map_name'];
    const clean = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)));
    for (const r of list('rumour_heard')) {
      const id = (r.rumour_key && idBy('SELECT id FROM rumours WHERE key = ?', r.rumour_key)) || idBy('SELECT id FROM rumours WHERE text = ?', r.rumour_text);
      if (id) insert('rumour_heard', clean(r), { campaign_id: cid, rumour_id: id });
    }
    for (const r of list('secret_progress')) {
      const id = (r.secret_key && idBy('SELECT id FROM secrets WHERE key = ?', r.secret_key)) || idBy('SELECT id FROM secrets WHERE title = ?', r.secret_title);
      if (id) insert('secret_progress', clean(r), { campaign_id: cid, secret_id: id });
    }
    for (const r of list('clue_found')) {
      const id =
        (r.clue_key && idBy('SELECT id FROM clues WHERE key = ?', r.clue_key)) ||
        idBy('SELECT c.id FROM clues c JOIN secrets s ON s.id = c.secret_id WHERE s.key = ? AND c.note = ?', r.secret_key, r.clue_note);
      if (id) insert('clue_found', clean(r), { campaign_id: cid, clue_id: id });
    }
    // What the campaign's players had learned: records this library has, and maps, pins and outlines found by their
    // map's name and what they mark.
    for (const r of list('campaign_reveals'))
      if (db.prepare('SELECT 1 FROM entities WHERE id = ?').get(r.entity_id)) insert('campaign_reveals', r, { campaign_id: cid });
    for (const r of list('campaign_map_reveals')) {
      const map = idBy('SELECT id FROM maps WHERE name = ?', r.map_name);
      if (!map) continue;
      const part = (table: string) =>
        r.entity_id ? idBy(`SELECT id FROM ${table} WHERE map_id = ? AND entity_id = ?`, map, r.entity_id) : idBy(`SELECT id FROM ${table} WHERE map_id = ? AND label = ?`, map, r.label);
      const ref = r.kind === 'map' ? map : r.kind === 'marker' ? part('map_markers') : r.kind === 'shape' ? part('map_shapes') : undefined;
      if (ref) db.prepare('INSERT OR IGNORE INTO campaign_map_reveals (campaign_id, kind, ref_id) VALUES (?, ?, ?)').run(cid, r.kind, ref);
    }
    // History rows this campaign had been shown, found by their time and event (never one marked SECRET).
    for (const r of list('campaign_timeline_reveals')) {
      const row = idBy(`SELECT id FROM timeline_rows WHERE time_label = ? AND event = ? AND upper(access) NOT LIKE '%SECRET%'`, r.time_label, r.event);
      if (row) db.prepare('INSERT OR IGNORE INTO campaign_timeline_reveals (campaign_id, row_id) VALUES (?, ?)').run(cid, row);
    }
    for (const t of ['map_discoveries', 'map_travel'] as const)
      for (const r of list(t)) {
        const map = idBy('SELECT id FROM maps WHERE name = ?', r.map_name);
        if (map) insert(t, clean(r), { campaign_id: cid, map_id: map, session_id: ses(r) });
      }
    reindexAll(db);
    return cid;
  });
  return tx();
}

export function exportPlayerZip(db: DB): Buffer {
  const snap = playerSnapshot(db);
  const zip = new AdmZip();
  zip.addFile('player_snapshot.json', Buffer.from(JSON.stringify(snap, null, 2)));
  for (const e of snap.entities) {
    const md = [
      `# ${e.name}`,
      `_${e.typeLabel} · ${e.realmLabel}_`,
      '',
      e.summary,
      ...(e.facts.length ? ['', '## Known facts', ...e.facts.map((f) => `- ${f}`)] : []),
      ...e.sections.flatMap((s) => ['', `## ${s.heading}`, s.content]),
    ].join('\n');
    zip.addFile(`Player_Handbook/${slug(e.name)}.md`, Buffer.from(md, 'utf8'));
  }
  for (const c of snap.campaigns) {
    const md = [`# ${c.title}`, `Current date: ${c.current_date}`, '', '## Quest journal', ...c.quests.map((q) => `- **${q.title}** (${q.status}) ${q.description}`), '', '## Session recaps', ...c.recaps.map((r) => `### Session ${r.number}: ${r.title}\n${r.recap}`)].join('\n');
    zip.addFile(`Player_Handbook/Campaign_${slug(c.title)}.md`, Buffer.from(md, 'utf8'));
  }
  return zip.toBuffer();
}


export { parseJson };

/**
 * An export from before modules (v0.4.3 and older): Thinning on character pages, fading on the party's treasure and
 * "campaign mechanics" in the settings become the modules' data and switches.
 */
function adoptLegacyModuleData(db: DB, tables: Record<string, Record<string, unknown>[] | undefined>) {
  for (const r of tables.character_pages ?? []) {
    if (!('thinning' in r) && !('true_name' in r)) continue;
    const t = {
      true_name: String(r.true_name ?? ''),
      memories: parseJson<unknown[]>(r.memories as string, []),
      known_by: parseJson<string[]>(r.known_by as string, []),
      thinning: Number(r.thinning ?? 0),
      shardscarred: !!r.shardscarred,
    };
    if (t.true_name || t.memories.length || t.known_by.length || t.thinning || t.shardscarred) setModuleData(db, 'thinning', 'character', r.character_id as number, t);
  }
  for (const r of tables.party_treasure ?? [])
    if (r.fades || r.anchored) setModuleData(db, 'fading-salvage', 'treasure', r.id as number, { fades: !!r.fades, anchored: !!r.anchored });
  const settings = tables.settings ?? [];
  const old = settings.find((s) => s.key === 'mechanics');
  if (old && !settings.some((s) => s.key === 'modules')) {
    const switches = { ...modulesFromMechanics(parseJson(old.value as string, {})), ...(tables.campaigns?.length ? { renown: true } : {}) };
    db.prepare(`INSERT INTO settings (key, value) VALUES ('modules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(switches));
    db.prepare(`DELETE FROM settings WHERE key = 'mechanics'`).run();
  }
}
