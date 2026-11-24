/**
 * The setting-pack registry: the packs the app can install (bundled with it, or installed into this library's data
 * folder), the ones this library has, and what each puts into it: its realms, record types, templates and roles.
 * Its content (records, links, maps...) comes in through the pack's update (packs/content.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { BUNDLED_PACKS_DIR, installedPacksDir } from './paths.js';
import { ensureRealm, realmExists } from '../repo/realms.js';
import { syncPackTemplates } from '../repo/templates.js';
import { forgetTypes } from '../repo/recordTypes.js';
import type { PackInfo, PackManifest } from '../../../shared/packs.js';
import { reindexAll } from '../repo/search.js';
import { syncPackCalendar } from '../repo/calendars.js';
import type { CalendarDef } from '../../../shared/calendar.js';

export interface AvailablePack {
  manifest: PackManifest;
  dir: string;
  source: 'bundled' | 'installed';
}

export function readManifest(dir: string): PackManifest | null {
  const f = path.join(dir, 'pack.json');
  if (!fs.existsSync(f)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(f, 'utf8')) as PackManifest;
    return m.id && m.name ? m : null;
  } catch {
    return null;
  }
}

// Manifests are read once per process (a pack's folder doesn't change while the app runs; installing one clears it).
let cache: AvailablePack[] | null = null;
export const forgetPacks = () => void (cache = null);

/** Every pack the app can install: installed copies first (they replace a bundled one of the same id). */
export function availablePacks(): AvailablePack[] {
  if (cache) return cache;
  const out = new Map<string, AvailablePack>();
  const scan = (base: string | null, source: AvailablePack['source']) => {
    if (!base || !fs.existsSync(base)) return;
    for (const d of fs.readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory() || out.has(d.name)) continue;
      const m = readManifest(path.join(base, d.name));
      if (m && m.id === d.name) out.set(m.id, { manifest: m, dir: path.join(base, d.name), source });
    }
  };
  scan(installedPacksDir(), 'installed');
  scan(BUNDLED_PACKS_DIR, 'bundled');
  cache = [...out.values()];
  return cache;
}

export const findPack = (id: string) => availablePacks().find((p) => p.manifest.id === id);

interface Row {
  id: string;
  name: string;
  version: string;
  installed_at: string;
  updated_at: string | null;
}

/** The packs this library has. A library from before packs (or a test's) simply has none. */
export function installedPacks(db: DB): Row[] {
  try {
    return db.prepare('SELECT * FROM setting_packs ORDER BY installed_at').all() as Row[];
  } catch {
    return [];
  }
}
export const isInstalled = (db: DB, id: string) => installedPacks(db).some((p) => p.id === id);

/** The installed packs' manifests (a pack whose folder has gone is skipped). */
export const installedManifests = (db: DB): PackManifest[] => installedPacks(db).flatMap((p) => findPack(p.id)?.manifest ?? []);

/** What the app shows about every pack it can install, and whether this library has it. */
export function listPacks(db: DB): PackInfo[] {
  const rows = new Map(installedPacks(db).map((r) => [r.id, r]));
  const counts = new Map((db.prepare('SELECT pack_id, COUNT(*) n FROM entities WHERE pack_id IS NOT NULL GROUP BY pack_id').all() as { pack_id: string; n: number }[]).map((r) => [r.pack_id, r.n]));
  return availablePacks().map(({ manifest: m, source }) => {
    const r = rows.get(m.id);
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      licence: m.licence,
      modules: m.modules ?? [],
      source,
      installed: r ? { version: r.version, installed_at: r.installed_at, updated_at: r.updated_at } : null,
      records: counts.get(m.id) ?? 0,
      cleaning: m.cleaning,
    };
  });
}

/**
 * Write a pack's definitions into the library: its realms (missing ones are added, parents first; an existing realm
 * only gains the place the pack gives it if it has none), its record types and its templates. Safe to repeat: the app
 * does it at every start for installed packs, so an updated pack's definitions arrive.
 */
export function syncPackDefinitions(db: DB, m: PackManifest, dir: string) {
  const depth = (id: string, seen = 0): number => {
    const r = m.realms.find((x) => x.id === id);
    return r?.parent_id && seen < 10 ? 1 + depth(r.parent_id, seen + 1) : 0;
  };
  db.transaction(() => {
    for (const r of [...m.realms].sort((a, b) => depth(a.id) - depth(b.id))) {
      if (realmExists(db, r.id)) {
        if (r.parent_id && realmExists(db, r.parent_id)) db.prepare('UPDATE realms SET parent_id = ? WHERE id = ? AND parent_id IS NULL').run(r.parent_id, r.id);
        db.prepare('UPDATE realms SET pack_id = ? WHERE id = ? AND pack_id IS NULL AND id <> ?').run(m.id, r.id, 'world');
      } else {
        ensureRealm(db, r.id, r);
        db.prepare('UPDATE realms SET pack_id = ? WHERE id = ?').run(m.id, r.id);
      }
    }
    const upsert = db.prepare(
      `INSERT INTO record_types (key, label, plural, prefix, icon, pin, category, browse, handbook, traits, aliases, pack_id, builtin, sort_order)
       VALUES (@key, @label, @plural, @prefix, @icon, @pin, @category, @browse, @handbook, @traits, @aliases, @pack, 0, @sort_order)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label, plural = excluded.plural, icon = excluded.icon, pin = excluded.pin, category = excluded.category,
         browse = excluded.browse, handbook = excluded.handbook, traits = excluded.traits, aliases = excluded.aliases, pack_id = excluded.pack_id
       WHERE record_types.builtin = 0 AND (record_types.pack_id IS NULL OR record_types.pack_id = excluded.pack_id)`,
    );
    const taken = db.prepare('SELECT key FROM record_types WHERE prefix = ?');
    m.types.forEach((t, i) => {
      const owner = taken.get(t.prefix) as { key: string } | undefined;
      if (owner && owner.key !== t.key) return; // another type already has the prefix: the pack's type waits (ID clash report)
      upsert.run({ ...t, pin: t.pin ?? null, browse: JSON.stringify(t.browse), traits: JSON.stringify(t.traits), aliases: JSON.stringify(t.aliases ?? []), pack: m.id, sort_order: 1000 + i });
    });
  })();
  forgetTypes(db);
  syncPackTemplates(db, m.id, path.join(dir, 'templates'));
  const cal = m.calendar && path.join(dir, m.calendar.file);
  if (cal && fs.existsSync(cal)) syncPackCalendar(db, m.id, JSON.parse(fs.readFileSync(cal, 'utf8')) as CalendarDef, m.calendar!.worlds);
}

/** Bring every installed pack's definitions up to date (at start). */
export function syncInstalledPacks(db: DB) {
  for (const p of installedPacks(db)) {
    const found = findPack(p.id);
    if (found) syncPackDefinitions(db, found.manifest, found.dir);
  }
}

/** Add a pack to this library: its definitions now; its content with its first update (packs/content.ts). */
export function installPack(db: DB, id: string): PackManifest {
  const found = findPack(id);
  if (!found) throw notFound('Worldbook');
  if (!isInstalled(db, id)) {
    db.prepare('INSERT INTO setting_packs (id, name, version) VALUES (?, ?, ?)').run(id, found.manifest.name, found.manifest.version);
    // A setting brings its own rules (creatures, hazards, items): on with it, unless the GM had already chosen.
    if (found.manifest.rulesPack === 'worldkeeper') db.prepare(`INSERT INTO settings (key, value) VALUES ('rules_worldkeeper', 'on') ON CONFLICT(key) DO NOTHING`).run();
  }
  syncPackDefinitions(db, found.manifest, found.dir);
  return found.manifest;
}

/**
 * Remove a pack and everything it brought: its records (and their links), timeline rows, rumours, mysteries,
 * secrets and clues, maps, adventures, tables, templates, and the realms and types nothing else uses. The GM's own
 * work stays; links from it to the pack's records become broken references, which Library → Broken references lists.
 */
export function uninstallPack(db: DB, id: string) {
  if (!isInstalled(db, id)) throw badRequest('That pack is not installed');
  const removed: Record<string, number> = {};
  const run = (label: string, sql: string, ...args: unknown[]) => (removed[label] = db.prepare(sql).run(...args).changes);
  db.transaction(() => {
    run('links', `DELETE FROM relationships WHERE pack_id = ? OR source_id IN (SELECT id FROM entities WHERE pack_id = ?) OR target_id IN (SELECT id FROM entities WHERE pack_id = ?)`, id, id, id);
    for (const t of ['timeline_rows', 'rumours', 'clues', 'secrets', 'mysteries', 'map_markers', 'map_shapes', 'random_tables', 'adventures', 'eras'])
      try {
        run(t, `DELETE FROM ${t} WHERE pack_id = ?`, id);
      } catch {
        /* a table this library doesn't have */
      }
    run('maps', 'DELETE FROM maps WHERE pack_id = ?', id);
    run('templates', 'DELETE FROM templates WHERE pack_id = ?', id);
    run('records', 'DELETE FROM entities WHERE pack_id = ?', id);
    // Its realms and types, where nothing of the GM's still uses them (deepest realms first).
    const realms = db.prepare('SELECT id FROM realms WHERE pack_id = ? ORDER BY sort_order DESC').all(id) as { id: string }[];
    db.prepare(`UPDATE realms SET parent_id = NULL WHERE id = 'world' AND parent_id IN (SELECT id FROM realms WHERE pack_id = ?)`).run(id);
    for (const r of realms) {
      const used =
        (db.prepare('SELECT COUNT(*) n FROM entities WHERE realm = ?').get(r.id) as { n: number }).n +
        (db.prepare('SELECT COUNT(*) n FROM maps WHERE realm_id = ?').get(r.id) as { n: number }).n +
        (db.prepare('SELECT COUNT(*) n FROM realms WHERE parent_id = ?').get(r.id) as { n: number }).n;
      if (!used) db.prepare('DELETE FROM realms WHERE id = ?').run(r.id);
      else db.prepare('UPDATE realms SET pack_id = NULL WHERE id = ?').run(r.id);
    }
    for (const t of db.prepare('SELECT key FROM record_types WHERE pack_id = ?').all(id) as { key: string }[]) {
      if (!db.prepare('SELECT 1 FROM entities WHERE type = ? LIMIT 1').get(t.key)) db.prepare('DELETE FROM record_types WHERE key = ?').run(t.key);
    }
    // Its rules pack goes off with it.
    if (findPack(id)?.manifest.rulesPack === 'worldkeeper') db.prepare(`INSERT INTO settings (key, value) VALUES ('rules_worldkeeper', 'off') ON CONFLICT(key) DO UPDATE SET value = 'off'`).run();
    // Its calendar: a world that used it goes back to the default (realms.calendar_id is set to null).
    db.prepare('DELETE FROM calendars WHERE pack_id = ?').run(id);
    db.prepare('DELETE FROM setting_packs WHERE id = ?').run(id);
  })();
  forgetTypes(db);
  reindexAll(db);
  return removed;
}

/**
 * The record that plays a part ("world.overview", "rules.travel"...), from the installed packs' roles. A role names a
 * record ID or a realm id; a role whose record isn't in the library is null, and its part of the page hides.
 */
export function role(db: DB, key: string): string | null {
  for (const m of installedManifests(db)) {
    const id = m.roles?.[key];
    if (!id) continue;
    if (db.prepare('SELECT 1 FROM entities WHERE id = ?').get(id) || realmExists(db, id)) return id;
  }
  return null;
}

/** Every role the installed packs give, with its record (for the client). */
export function roles(db: DB): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of [...installedManifests(db)].reverse())
    for (const key of Object.keys(m.roles ?? {})) {
      const id = role(db, key);
      if (id) out[key] = id;
    }
  return out;
}

/** Whether a pack's own action (its update, its handbook match...) may run here: only with the pack installed. */
export function requirePack(db: DB, id: string) {
  if (!isInstalled(db, id)) throw badRequest(`This needs the worldbook "${findPack(id)?.manifest.name ?? id}", which this library doesn't have. Add it in Library → Worldbooks.`);
}
