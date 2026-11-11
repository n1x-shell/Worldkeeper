import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { DB } from '../db/connection.js';
import type { Paths } from '../config.js';
import { schemaVersion } from '../db/migrations.js';
import { getEntity, rowToEntity, type EntityRow } from '../repo/entities.js';
import { parseJson } from '../lib/json.js';
import { playerSnapshot } from '../player/projection.js';
import { reindexAll } from '../repo/search.js';
import { badRequest } from '../lib/errors.js';
import type { Entity } from '../../../shared/domain.js';

/** Tables included in a full JSON export, in dependency order. */
const TABLES = [
  'settings',
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
];

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'entry';

/** Render a record in the library's own metadata-header format so it can be re-imported. */
export function entityToMarkdown(e: Entity): string {
  const head: [string, string][] = [
    ['ID', e.id],
    ['Name', e.name],
    ['Alternate names', e.aliases.length ? e.aliases.join('; ') : 'None'],
    ['Category', e.category_raw ?? e.type],
    ['Parent', e.parent_raw ?? (e.parent_id ? `[${e.parent_id}]` : 'None')],
    ['Continent or realm', e.realm_raw ?? e.realm],
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
    reindexAll(db);
  });
  tx();
}

export function exportMarkdownZip(db: DB): Buffer {
  const zip = new AdmZip();
  const rows = db.prepare('SELECT * FROM entities ORDER BY id').all() as EntityRow[];
  for (const r of rows) {
    const e = rowToEntity(r);
    zip.addFile(`Worldkeeper_Library/${e.realm}/${e.type}/${e.id}_${slug(e.name)}.md`, Buffer.from(entityToMarkdown(e), 'utf8'));
  }
  zip.addFile(
    'Worldkeeper_Library/README.md',
    Buffer.from(
      `# Worldkeeper Markdown export\n\nExported ${new Date().toISOString()}. ${rows.length} records in the library's metadata-header format.\nImport this ZIP into any Worldkeeper installation. DM notes, reveal state and campaigns are in the JSON export / backup, not here.\n`,
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

export function exportCampaign(db: DB, campaignId: number) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!c) throw badRequest('Unknown campaign');
  const advIds = (db.prepare('SELECT id FROM adventures WHERE campaign_id = ?').all(campaignId) as { id: number }[]).map((a) => a.id);
  const sesIds = (db.prepare('SELECT id FROM sessions WHERE campaign_id = ?').all(campaignId) as { id: number }[]).map((a) => a.id);
  const inList = (ids: number[]) => (ids.length ? ids.join(',') : '-1');
  return {
    app: 'worldkeeper-campaign',
    format: 1,
    exported_at: new Date().toISOString(),
    campaign: c,
    characters: db.prepare('SELECT * FROM characters WHERE campaign_id = ?').all(campaignId),
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
  };
}

/** Import a campaign export as a NEW campaign (all ids remapped). World records are referenced, never copied. */
export function importCampaign(db: DB, data: ReturnType<typeof exportCampaign>): number {
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
    const cid = insert('campaigns', c, { title: `${c.title} (imported)` });
    const advMap = new Map<number, number>();
    const sesMap = new Map<number, number>();
    const sceneMap = new Map<number, number>();
    for (const r of data.characters as Record<string, unknown>[]) insert('characters', r, { campaign_id: cid });
    for (const r of data.quests as Record<string, unknown>[]) insert('quests', r, { campaign_id: cid });
    for (const r of data.adventures as Record<string, unknown>[]) advMap.set(r.id as number, insert('adventures', r, { campaign_id: cid }));
    for (const r of data.scenes as Record<string, unknown>[]) sceneMap.set(r.id as number, insert('scenes', r, { adventure_id: advMap.get(r.adventure_id as number) }));
    for (const r of data.scene_links as Record<string, unknown>[])
      insert('scene_links', r, { adventure_id: advMap.get(r.adventure_id as number), from_scene: sceneMap.get(r.from_scene as number), to_scene: sceneMap.get(r.to_scene as number) });
    for (const r of data.sessions as Record<string, unknown>[]) sesMap.set(r.id as number, insert('sessions', r, { campaign_id: cid, current_scene_id: null }));
    for (const r of data.session_log as Record<string, unknown>[]) insert('session_log', r, { session_id: sesMap.get(r.session_id as number) });
    for (const r of data.campaign_state as Record<string, unknown>[])
      insert('campaign_state', r, { campaign_id: cid, session_id: r.session_id ? (sesMap.get(r.session_id as number) ?? null) : null });
    for (const r of data.faction_plans as Record<string, unknown>[]) insert('faction_plans', r, { campaign_id: cid });
    for (const r of data.encounters as Record<string, unknown>[])
      insert('encounters', r, { campaign_id: cid, session_id: r.session_id ? (sesMap.get(r.session_id as number) ?? null) : null });
    for (const r of data.notes as Record<string, unknown>[]) insert('notes', r, { campaign_id: cid });
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

export function entityExportMarkdown(db: DB, id: string) {
  return entityToMarkdown(getEntity(db, id));
}

export { parseJson };
