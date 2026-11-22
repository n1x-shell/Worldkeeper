/**
 * Realms (docs/OWN_WORLD_PLAN.md §2.1): the library's worlds, continents, planes and region groups. Records, maps,
 * timeline rows and campaigns name their realm by its id. The ids are stable: renaming a realm never changes it.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { DEFAULT_REALM, REALM_COLORS, REALM_ICONS, REALM_KEY_RE, REALM_KINDS, REALM_PARENT_KINDS, canSitIn, realmKey, sortRealms, type RealmInfo, type RealmKind } from '../../../shared/realms.js';
import { types } from './recordTypes.js';

interface Row {
  id: string;
  name: string;
  kind: RealmInfo['kind'];
  parent_id: string | null;
  color: string;
  icon: string;
  description: string;
  sort_order: number;
  archived: number;
}
const toRealm = (r: Row): RealmInfo => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  parent_id: r.parent_id,
  color: (REALM_COLORS as readonly string[]).includes(r.color) ? (r.color as RealmInfo['color']) : 'blue',
  icon: (REALM_ICONS as readonly string[]).includes(r.icon) ? (r.icon as RealmInfo['icon']) : 'globe',
  description: r.description,
  sort_order: r.sort_order,
  archived: !!r.archived,
});

/** Every realm, in reading order. With `counts`, how many (unarchived) records each holds. */
export function listRealms(db: DB, opts: { counts?: boolean; includeArchived?: boolean } = {}): RealmInfo[] {
  const rows = (db.prepare('SELECT * FROM realms').all() as Row[]).map(toRealm).filter((r) => opts.includeArchived || !r.archived);
  if (opts.counts) {
    const counts = new Map(
      (db.prepare(`SELECT realm, COUNT(*) n FROM entities WHERE archived = 0 AND type NOT IN ('redirect','index','register') GROUP BY realm`).all() as { realm: string; n: number }[]).map((r) => [
        r.realm,
        r.n,
      ]),
    );
    for (const r of rows) r.records = counts.get(r.id) ?? 0;
    const intros = realmIntros(db);
    for (const r of rows) r.intro_id = intros.get(r.id) ?? null;
  }
  return sortRealms(rows);
}

/** Record types that introduce a realm: its own world, continent, realm or domain record. */
const introTypes = (db: DB) => types(db).with('intro');

/**
 * Each realm's introducing record: a record in it of an introducing type, the one named like the realm first (Aetheris's
 * is its continent record, the Hollow Verge's its domain record). No record ids are written into the app.
 */
export function realmIntros(db: DB): Map<string, string> {
  const realms = new Map((db.prepare('SELECT id, name FROM realms').all() as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const bare = (s: string) => s.toLowerCase().replace(/^the\s+/, '').trim();
  const out = new Map<string, string>();
  const INTRO = introTypes(db);
  const rows = db
    .prepare(`SELECT id, name, type, realm FROM entities WHERE archived = 0 AND type IN (${INTRO.map(() => '?').join(',') || "''"}) ORDER BY id`)
    .all(...INTRO) as { id: string; name: string; type: string; realm: string }[];
  const rank = (r: (typeof rows)[number]) => (bare(r.name) === bare(realms.get(r.realm) ?? '') ? 0 : 1) * 100 + INTRO.indexOf(r.type);
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) if (realms.has(r.realm) && !out.has(r.realm)) out.set(r.realm, r.id);
  return out;
}

export function getRealm(db: DB, id: string): RealmInfo {
  const r = db.prepare('SELECT * FROM realms WHERE id = ?').get(id) as Row | undefined;
  if (!r) throw notFound('Realm');
  return toRealm(r);
}

export const realmExists = (db: DB, id: string) => !!db.prepare('SELECT 1 FROM realms WHERE id = ?').get(id);

const realmInput = z.object({
  id: z.string().regex(REALM_KEY_RE, 'Use lower-case letters, digits and hyphens').optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(REALM_KINDS).default('continent'),
  parent_id: z.string().nullable().optional(),
  color: z.enum(REALM_COLORS).default('blue'),
  icon: z.enum(REALM_ICONS).default('globe'),
  description: z.string().max(400).default(''),
  sort_order: z.number().int().optional(),
});
// No defaults here: an edit changes only what it names (a default would reset the colour on every archive).
const realmPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(REALM_KINDS).optional(),
  parent_id: z.string().nullable().optional(),
  color: z.enum(REALM_COLORS).optional(),
  icon: z.enum(REALM_ICONS).optional(),
  description: z.string().max(400).optional(),
  sort_order: z.number().int().optional(),
  archived: z.boolean().optional(),
});

const KIND_NAME: Record<RealmKind, string> = { realm: 'a realm', world: 'a world', continent: 'a continent', domain: 'a domain', region_group: 'a region group' };
const kindOf = (db: DB, id: string) => (db.prepare('SELECT kind FROM realms WHERE id = ?').get(id) as { kind: RealmKind } | undefined)?.kind;

/**
 * What can sit inside what (shared/realms.ts REALM_PARENT_KINDS): a realm at the top, a world in a realm (or the top),
 * a continent in a world, a region group in a continent. Checked for the realm itself and for what's already inside it.
 */
function checkPlacement(db: DB, id: string | null, kind: RealmKind, parent: string | null | undefined) {
  const parentKind = parent ? (kindOf(db, parent) ?? null) : null;
  if (!canSitIn(kind, parentKind)) {
    const where = REALM_PARENT_KINDS[kind].filter((k): k is RealmKind => !!k).map((k) => KIND_NAME[k]);
    const top = REALM_PARENT_KINDS[kind].includes(null);
    throw badRequest(
      `${KIND_NAME[kind][0].toUpperCase()}${KIND_NAME[kind].slice(1)} ${top && !where.length ? 'is always top level' : `goes inside ${where.join(' or ')}${top ? ', or at the top level' : ''}`}`,
    );
  }
  if (!id) return;
  for (const c of db.prepare('SELECT name, kind FROM realms WHERE parent_id = ?').all(id) as { name: string; kind: RealmKind }[]) {
    if (!canSitIn(c.kind, kind)) throw badRequest(`${c.name} is inside it and can't sit inside ${KIND_NAME[kind]}: move it first`);
  }
}

function checkParent(db: DB, id: string | null, parent: string | null | undefined) {
  if (!parent) return;
  if (!realmExists(db, parent)) throw badRequest('That parent realm does not exist');
  // No cycles: walk up from the parent.
  for (let p: string | null = parent, guard = 0; p && guard < 50; guard++) {
    if (p === id) throw badRequest('A realm cannot sit inside itself');
    p = (db.prepare('SELECT parent_id FROM realms WHERE id = ?').get(p) as { parent_id: string | null } | undefined)?.parent_id ?? null;
  }
}

/** A free id from a name: "ostmark", or "ostmark-2" if taken. */
function freeId(db: DB, wanted: string) {
  let id = wanted;
  for (let n = 2; realmExists(db, id); n++) id = `${wanted}-${n}`;
  return id;
}

export function createRealm(db: DB, input: unknown): RealmInfo {
  const d = realmInput.parse(input);
  const id = d.id ? d.id : freeId(db, realmKey(d.name));
  if (d.id && realmExists(db, id)) throw badRequest(`A realm with the id "${id}" already exists`);
  checkParent(db, id, d.parent_id);
  checkPlacement(db, null, d.kind, d.parent_id);
  const order = d.sort_order ?? ((db.prepare('SELECT MAX(sort_order) m FROM realms').get() as { m: number | null }).m ?? 0) + 1;
  db.prepare('INSERT INTO realms (id, name, kind, parent_id, color, icon, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    d.name,
    d.kind,
    d.parent_id ?? null,
    d.color,
    d.icon,
    d.description,
    order,
  );
  return getRealm(db, id);
}

export function updateRealm(db: DB, id: string, input: unknown): RealmInfo {
  getRealm(db, id);
  const d = realmPatch.parse(input);
  const was = getRealm(db, id);
  if (d.parent_id !== undefined) checkParent(db, id, d.parent_id);
  if (d.kind !== undefined || d.parent_id !== undefined) checkPlacement(db, id, d.kind ?? was.kind, d.parent_id !== undefined ? d.parent_id : was.parent_id);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(k === 'archived' ? (v ? 1 : 0) : v);
  }
  if (sets.length) db.prepare(`UPDATE realms SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getRealm(db, id);
}

/** Put the realms in this order (ids not listed keep their place after them). */
export function reorderRealms(db: DB, ids: string[]): RealmInfo[] {
  const set = db.prepare('UPDATE realms SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => set.run(i, id)))();
  return listRealms(db, { counts: true });
}

/** Delete an empty realm. One with records, maps or campaigns must be emptied (or archived) instead. */
export function deleteRealm(db: DB, id: string) {
  getRealm(db, id);
  if (id === DEFAULT_REALM) throw badRequest('The World is where records without a realm live; rename it instead of deleting it');
  const used =
    (db.prepare('SELECT COUNT(*) n FROM entities WHERE realm = ?').get(id) as { n: number }).n +
    (db.prepare('SELECT COUNT(*) n FROM maps WHERE realm_id = ?').get(id) as { n: number }).n +
    (db.prepare('SELECT COUNT(*) n FROM campaigns WHERE world_id = ?').get(id) as { n: number }).n;
  if (used) throw badRequest('This realm still has records, maps or campaigns. Move them to another realm, or archive the realm instead.');
  const inside = db.prepare('SELECT name FROM realms WHERE parent_id = ?').all(id) as { name: string }[];
  if (inside.length) throw badRequest(`${inside.map((r) => r.name).join(', ')} ${inside.length === 1 ? 'is' : 'are'} inside it. Move or delete ${inside.length === 1 ? 'it' : 'them'} first.`);
  db.transaction(() => {
    db.prepare('UPDATE realms SET parent_id = NULL WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM realms WHERE id = ?').run(id);
  })();
}

/**
 * Make sure a realm exists, creating it with these defaults if not (the importer uses this for the realms an archive
 * names). Returns its id.
 */
export function ensureRealm(db: DB, id: string, defaults: Partial<Omit<RealmInfo, 'id' | 'records'>> & { name: string }): string {
  if (realmExists(db, id)) return id;
  const order = ((db.prepare('SELECT MAX(sort_order) m FROM realms').get() as { m: number | null }).m ?? 0) + 1;
  db.prepare('INSERT INTO realms (id, name, kind, parent_id, color, icon, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    defaults.name,
    defaults.kind ?? 'continent',
    defaults.parent_id && realmExists(db, defaults.parent_id) ? defaults.parent_id : null,
    defaults.color ?? 'blue',
    defaults.icon ?? 'globe',
    defaults.description ?? '',
    defaults.sort_order ?? order,
  );
  return id;
}

/**
 * Make sure every realm a record, map or campaign names exists: known ones (the setting's) with their defaults, others
 * under their id as name. For data from before realms were their own table.
 */
export function repairRealms(db: DB, known: Record<string, Partial<Omit<RealmInfo, 'id' | 'records'>> & { name: string }> = {}) {
  const used = db
    .prepare(
      `SELECT realm AS id FROM entities UNION SELECT value FROM entities, json_each(entities.realms) UNION SELECT realm_id FROM maps WHERE realm_id IS NOT NULL UNION SELECT world_id FROM campaigns WHERE world_id IS NOT NULL`,
    )
    .all() as { id: string }[];
  for (const { id } of used)
    if (id && !realmExists(db, id)) ensureRealm(db, id, known[id] ?? { name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), kind: 'continent', parent_id: DEFAULT_REALM });
}
