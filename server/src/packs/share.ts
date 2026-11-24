/**
 * Worldbooks shared between GMs (docs/WORLDBOOKS_PLAN.md, W3b): a `.worldbook` file is a ZIP of a worldbook folder, in
 * the same format as the Worldkeeper worldbook (docs/WORLDBOOKS.md), so adding one is the same as adding any worldbook.
 *
 *  - Share as a worldbook: the open library's own world (what no other worldbook brought): its realms, record types,
 *    templates, calendar and switched-on modules, every record as Markdown, its curated links and timeline, its maps
 *    with their pins, routes and region outlines. Never campaigns, characters, sessions or what players were shown.
 *    GM-only sections can be left out.
 *  - Add a worldbook: the file is checked (paths, kinds of file, sizes, the manifest) and unpacked into the computer's
 *    worldbooks (data/shared/packs/<id>), shared by every library, like books' rules. Adding it to a library is then
 *    what it is for any worldbook (registry.installPack and content.updatePack).
 *
 * A shared worldbook never carries an import profile, cleaning or handbook rules (patterns the app would run): only the
 * worldbooks that ship with the app have those.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { entityToMarkdown } from '../backup/exporter.js';
import { rowToEntity, type EntityRow } from '../repo/entities.js';
import { templateToMarkdown, GM_ONLY_HEADING } from '../../../shared/templates.js';
import { listTemplates } from '../repo/templates.js';
import { listRecordTypes } from '../repo/recordTypes.js';
import { worldCalendar } from '../repo/calendars.js';
import { modulesOn } from '../repo/modules.js';
import { forgetPacks, installedPacks } from './registry.js';
import { BUNDLED_PACKS_DIR, installedPacksDir } from './paths.js';
import type { PackManifest, PackRealm } from '../../../shared/packs.js';
import pkg from '../../../package.json' with { type: 'json' };

/** What a shared worldbook's manifest adds to a worldbook's. */
export interface SharedManifest extends PackManifest {
  author?: string;
  /** Made by "Share as a worldbook". */
  shared?: { format: 1; made_at: string; app_version: string; gm_only_left_out: boolean; built_on: string[]; counts: Record<string, number> };
}

export interface ShareOptions {
  name: string;
  description?: string;
  author?: string;
  licence?: string;
  version?: string;
  /** Leave out sections marked GM only, for a world shared with players in mind. */
  leaveOutGmOnly?: boolean;
}

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '') || 'world';

const fileSlug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'entry';

/** The ids the app's own worldbooks use: a shared worldbook can't take one. */
const bundledIds = () => (fs.existsSync(BUNDLED_PACKS_DIR) ? fs.readdirSync(BUNDLED_PACKS_DIR).filter((d) => fs.existsSync(path.join(BUNDLED_PACKS_DIR, d, 'pack.json'))) : []);

/** A record's text without its GM-only sections. */
export function leaveOutGmOnly(body: string): string {
  const parts = body.split(/^(?=#{2,3} )/m);
  return parts
    .filter((p) => {
      const heading = /^#{2,3} (.+)$/m.exec(p.split('\n')[0] ?? '')?.[1];
      return !heading || !GM_ONLY_HEADING.test(heading.trim());
    })
    .join('')
    .trimEnd();
}

/** Make a `.worldbook` (a ZIP) from the open library's own world. */
export function buildWorldbook(db: DB, uploadsDir: string, o: ShareOptions): { file: Buffer; manifest: SharedManifest } {
  const name = o.name.trim();
  if (!name) throw badRequest('Give the worldbook a name');
  let id = slug(name);
  if (bundledIds().includes(id)) id = `${id}-world`;
  const zip = new AdmZip();
  const add = (p: string, content: string | Buffer) => zip.addFile(p, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
  const counts: Record<string, number> = {};

  // Realms, types and templates of the library's own (not another worldbook's).
  const realms = (
    db.prepare(`SELECT id, name, kind, parent_id, color, icon, description, sort_order FROM realms WHERE pack_id IS NULL AND archived = 0 ORDER BY sort_order`).all() as (PackRealm & {
      description: string;
    })[]
  ).map((r) => ({ ...r }));
  const typeDefs = listRecordTypes(db)
    .filter((t) => !t.builtin && !t.pack)
    .map((t) => ({
      key: t.key,
      label: t.label,
      plural: t.plural,
      prefix: t.prefix,
      icon: t.icon,
      pin: t.pin,
      category: t.category,
      browse: t.browse,
      handbook: t.handbook,
      traits: t.traits,
      aliases: t.aliases,
    }));
  const seenTypes = new Set<string>();
  for (const t of listTemplates(db).filter((x) => x.origin === 'user' || x.origin === 'import')) {
    if (seenTypes.has(t.type)) continue;
    seenTypes.add(t.type);
    add(`templates/${fileSlug(t.type)}.md`, templateToMarkdown(t));
  }
  counts.templates = seenTypes.size;

  // The calendar, if the library chose one of its own (not a worldbook's).
  const cal = worldCalendar(db, 'world');
  const calendar = cal.id && !cal.pack_id ? { file: 'calendar.json', worlds: ['world'] } : undefined;
  if (calendar) add('calendar.json', JSON.stringify(cal.def, null, 1));

  // Every record of the library's own, as Markdown.
  const rows = db.prepare(`SELECT * FROM entities WHERE pack_id IS NULL AND archived = 0 ORDER BY id`).all() as EntityRow[];
  const ids = new Set<string>();
  for (const r of rows) {
    const e = rowToEntity(r);
    if (o.leaveOutGmOnly) e.body = leaveOutGmOnly(e.body);
    ids.add(e.id);
    add(`lore/${fileSlug(e.realm)}/${e.id}_${fileSlug(e.name)}.md`, entityToMarkdown(e, db));
  }
  counts.records = rows.length;

  // Links the GM made by hand (the rest come back from the records' own text).
  const links = (
    db
      .prepare(`SELECT source_id, target_id, type, label, description FROM relationships WHERE origin = 'user' AND pack_id IS NULL`)
      .all() as { source_id: string; target_id: string; type: string; label: string; description: string }[]
  )
    .filter((l) => ids.has(l.source_id) && ids.has(l.target_id))
    .map((l) => ({ source: l.source_id, target: l.target_id, type: l.type, label: l.label, description: l.description }));
  if (links.length) add('lore/links.json', JSON.stringify({ links }, null, 1));
  counts.links = links.length;

  // The World Timeline's rows.
  const timeline = (
    db.prepare(`SELECT sort_order, time_label, event, realm_label, access, entity_ids, era FROM timeline_rows WHERE pack_id IS NULL ORDER BY sort_order`).all() as {
      sort_order: number;
      time_label: string;
      event: string;
      realm_label: string;
      access: string;
      entity_ids: string;
      era: string | null;
    }[]
  ).map((t) => ({
    ...t,
    entity_ids: (JSON.parse(t.entity_ids || '[]') as string[]).filter((x) => ids.has(x)),
    era: t.era ?? undefined,
  }));
  if (timeline.length) add('lore/timeline.json', JSON.stringify({ rows: timeline }, null, 1));
  counts.timeline = timeline.length;

  // Maps: the picture, its pins (by record), routes and region outlines, in pixels from the top-left.
  const maps = db.prepare(`SELECT id, name, image_file, height, scale_miles, realm_id FROM maps WHERE pack_id IS NULL AND kind = 'image' AND image_file IS NOT NULL ORDER BY id`).all() as {
    id: number;
    name: string;
    image_file: string;
    height: number;
    scale_miles: number | null;
    realm_id: string | null;
  }[];
  const bases = new Set<string>();
  let mapCount = 0;
  for (const m of maps) {
    const file = path.join(uploadsDir, path.basename(m.image_file));
    if (!fs.existsSync(file)) continue;
    let base = slug(m.name);
    while (bases.has(base)) base += '-2';
    bases.add(base);
    const image = `${base}${path.extname(m.image_file).toLowerCase()}`;
    add(`maps/${image}`, fs.readFileSync(file));
    const pins = (
      db.prepare(`SELECT entity_id, label, x, y, category FROM map_markers WHERE map_id = ? AND entity_id IS NOT NULL`).all(m.id) as {
        entity_id: string;
        label: string;
        x: number;
        y: number;
        category: string;
      }[]
    )
      .filter((p) => ids.has(p.entity_id))
      .map((p) => ({ id: p.entity_id, label: p.label, x: Math.round(p.x), y: Math.round(m.height - p.y), category: p.category }));
    add(`maps/${base}.pins.json`, JSON.stringify({ name: m.name, image, realm: m.realm_id ?? 'world', ...(m.scale_miles ? { scale_miles: m.scale_miles } : {}), pins }, null, 1));
    const shapes = db.prepare(`SELECT kind, label, color, points, entity_id FROM map_shapes WHERE map_id = ? AND kind = ?`);
    const flip = (pts: string) => (JSON.parse(pts) as [number, number][]).map(([x, y]) => [Math.round(x), Math.round(m.height - y)]);
    const routes = (shapes.all(m.id, 'route') as { label: string; color: string; points: string }[]).map((s) => ({ label: s.label, color: s.color, points: flip(s.points) }));
    if (routes.length) add(`maps/${base}.routes.json`, JSON.stringify({ routes }, null, 1));
    const regions = (shapes.all(m.id, 'region') as { entity_id: string | null; points: string }[])
      .filter((s) => s.entity_id && ids.has(s.entity_id))
      .map((s) => ({ entity_id: s.entity_id, points: flip(s.points) }));
    if (regions.length) add(`maps/${base}.regions.json`, JSON.stringify({ regions }, null, 1));
    mapCount++;
  }
  counts.maps = mapCount;

  const manifest: SharedManifest = {
    id,
    name,
    version: o.version?.trim() || '1.0.0',
    description: o.description?.trim() ?? '',
    ...(o.author?.trim() ? { author: o.author.trim() } : {}),
    ...(o.licence?.trim() ? { licence: o.licence.trim() } : {}),
    realms,
    types: typeDefs,
    roles: {},
    modules: [...modulesOn(db)],
    ...(calendar ? { calendar } : {}),
    shared: {
      format: 1,
      made_at: new Date().toISOString(),
      app_version: pkg.version,
      gm_only_left_out: !!o.leaveOutGmOnly,
      built_on: installedPacks(db).map((p) => p.id),
      counts,
    },
  };
  add('pack.json', JSON.stringify(manifest, null, 1));
  return { file: zip.toBuffer(), manifest };
}

/**
 * A new library started from a worldbook takes the worldbook's names for the realms every library has (its world is
 * "Ostmark", not "The World"). Only used for a library that is new.
 */
export function adoptWorldbookRealms(db: DB, m: PackManifest) {
  const upd = db.prepare('UPDATE realms SET name = @name, kind = @kind, color = @color, icon = @icon, description = COALESCE(@description, description) WHERE id = @id');
  for (const r of m.realms as (PackRealm & { description?: string })[])
    if (typeof r.name === 'string' && r.name.trim()) upd.run({ id: r.id, name: r.name, kind: r.kind, color: r.color, icon: r.icon, description: r.description ?? null });
}

// ---- Adding one --------------------------------------------------------------------------------------------------

const LIMITS = { files: 20_000, bytes: 500 * 1024 * 1024, file: 50 * 1024 * 1024 };
const FOLDERS = ['lore', 'templates', 'maps', 'adventures', 'tables', 'treasure', 'statblocks', 'encounters', 'player-text', 'archive'];
const ROOT_FILES = ['pack.json', 'calendar.json', 'README.md'];
const EXT = /\.(md|json|webp|png|jpe?g)$/i;

/** Check a `.worldbook` and read its manifest and files. Throws, naming the problem, if anything is wrong. */
export function readWorldbook(buf: Buffer): { manifest: SharedManifest; files: { path: string; data: Buffer }[] } {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw badRequest('That file is not a worldbook (it isn’t a ZIP).');
  }
  const entries = zip.getEntries().filter((e) => !e.isDirectory && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.entryName));
  if (entries.length > LIMITS.files) throw badRequest(`That worldbook has too many files (${entries.length}).`);
  // A worldbook zipped with its folder: read it from inside the folder.
  const head = entries.find((e) => /(^|\/)pack\.json$/.test(e.entryName) && e.entryName.split('/').length <= 2);
  if (!head) throw badRequest('That file is not a worldbook: it has no pack.json.');
  const root = head.entryName.slice(0, -'pack.json'.length);
  let total = 0;
  const files: { path: string; data: Buffer }[] = [];
  for (const e of entries) {
    if (!e.entryName.startsWith(root)) continue;
    const p = e.entryName.slice(root.length);
    if (!p || p.includes('\\') || p.startsWith('/') || p.split('/').some((s) => s === '..' || s === '.' || s === '')) throw badRequest(`That worldbook has a file in a place it can't: ${e.entryName}`);
    const top = p.split('/')[0];
    if (!(p.includes('/') ? FOLDERS.includes(top) : ROOT_FILES.includes(p))) throw badRequest(`That worldbook has a file a worldbook doesn't hold: ${p}`);
    if (!EXT.test(p)) throw badRequest(`That worldbook has a kind of file a worldbook doesn't hold: ${p}`);
    const size = e.header.size;
    if (size > LIMITS.file) throw badRequest(`${p} is too large.`);
    total += size;
    if (total > LIMITS.bytes) throw badRequest('That worldbook is too large.');
    files.push({ path: p, data: e.getData() });
  }
  let m: SharedManifest;
  try {
    m = JSON.parse(files.find((f) => f.path === 'pack.json')!.data.toString('utf8')) as SharedManifest;
  } catch {
    throw badRequest('That worldbook’s pack.json can’t be read.');
  }
  if (typeof m?.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(m.id)) throw badRequest('That worldbook’s id is missing or not lower-case letters, digits and hyphens.');
  if (bundledIds().includes(m.id)) throw badRequest(`“${m.id}” is the id of a worldbook that comes with the app.`);
  if (typeof m.name !== 'string' || !m.name.trim()) throw badRequest('That worldbook has no name.');
  if (!Array.isArray(m.realms) || !Array.isArray(m.types) || !Array.isArray(m.modules ?? [])) throw badRequest('That worldbook’s pack.json is incomplete (realms, types).');
  // Only the app's own worldbooks may carry patterns the app runs.
  delete m.importProfile;
  delete m.cleaning;
  delete m.handbook;
  delete m.rulesPack;
  m.roles = typeof m.roles === 'object' && m.roles ? m.roles : {};
  m.modules = (m.modules ?? []).filter((x): x is string => typeof x === 'string');
  m.version = typeof m.version === 'string' ? m.version.slice(0, 40) : '1.0.0';
  m.description = typeof m.description === 'string' ? m.description.slice(0, 2000) : '';
  return { manifest: m, files };
}

/** Add a `.worldbook` to this computer's worldbooks (replacing an earlier version of the same one). */
export function addWorldbookFile(buf: Buffer): SharedManifest {
  const { manifest, files } = readWorldbook(buf);
  const into = installedPacksDir();
  if (!into) throw badRequest('No library is open.');
  const dir = path.join(into, manifest.id);
  const staging = `${dir}.adding`;
  fs.rmSync(staging, { recursive: true, force: true });
  for (const f of files) {
    const out = path.join(staging, f.path);
    // Belt and braces: every file lands inside the worldbook's own folder.
    if (!out.startsWith(staging + path.sep)) throw badRequest(`That worldbook has a file in a place it can't: ${f.path}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.path === 'pack.json' ? JSON.stringify(manifest, null, 1) : f.data);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(staging, dir);
  forgetPacks();
  return manifest;
}
