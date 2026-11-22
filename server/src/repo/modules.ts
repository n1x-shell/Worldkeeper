/**
 * Which modules (shared/modules.ts) are on: the campaign's own switch, else the library's, else on if an installed
 * setting pack turns it on, else off. Also each module's data about a character or a treasure (table module_data),
 * which stays when the module is switched off.
 */
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { MODULES, MODULE_KEYS, isModuleKey, type ModuleKey, type ModuleSwitches } from '../../../shared/modules.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { installedManifests } from '../packs/registry.js';
import { getActiveCampaignId } from './campaigns.js';

type DB = Database.Database;

const clean = (raw: unknown): ModuleSwitches => {
  const out: ModuleSwitches = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (isModuleKey(k) && typeof v === 'boolean') out[k] = v;
  return out;
};

export function librarySwitches(db: DB): ModuleSwitches {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'modules'`).get() as { value: string } | undefined;
  return clean(parseJson(row?.value, {}));
}

export function campaignSwitches(db: DB, campaignId: number | null | undefined): ModuleSwitches {
  if (!campaignId) return {};
  try {
    const row = db.prepare('SELECT modules FROM campaigns WHERE id = ?').get(campaignId) as { modules: string | null } | undefined;
    return clean(parseJson(row?.modules, {}));
  } catch {
    return {}; // a library from before migration 23
  }
}

/** The modules the installed setting packs turn on. */
export const packDefaults = (db: DB): Set<ModuleKey> => new Set(installedManifests(db).flatMap((m) => (m.modules ?? []).filter(isModuleKey)));

/** The modules on for a campaign (the active one when none is given; the library's choice with no campaign). */
export function modulesOn(db: DB, campaignId?: number | null): Set<ModuleKey> {
  const cid = campaignId === undefined ? getActiveCampaignId(db) : campaignId;
  const lib = librarySwitches(db);
  const own = campaignSwitches(db, cid);
  const packs = packDefaults(db);
  return new Set(MODULE_KEYS.filter((k) => own[k] ?? lib[k] ?? packs.has(k)));
}

export const moduleOn = (db: DB, key: ModuleKey, campaignId?: number | null) => modulesOn(db, campaignId).has(key);

/** Refuse a module's action while it's off. */
export function requireModule(db: DB, key: ModuleKey, campaignId?: number | null) {
  if (!moduleOn(db, key, campaignId)) {
    const m = MODULES.find((x) => x.key === key)!;
    throw badRequest(`${m.label} is switched off. Switch it on in Settings → Modules.`);
  }
}

/** What Settings → Modules shows: each module, whether it's on, and where that comes from. */
export function listModules(db: DB, campaignId?: number | null) {
  const cid = campaignId === undefined ? getActiveCampaignId(db) : campaignId;
  const lib = librarySwitches(db);
  const own = campaignSwitches(db, cid);
  const packs = packDefaults(db);
  const on = modulesOn(db, cid);
  return {
    campaign_id: cid,
    modules: MODULES.map((m) => ({
      ...m,
      on: on.has(m.key),
      library: lib[m.key] ?? null,
      campaign: own[m.key] ?? null,
      fromPack: packs.has(m.key),
    })),
  };
}

const patchSchema = z.record(z.string(), z.boolean().nullable());

/** Change the library's switches. null goes back to the default (on if a pack turns it on). */
export function setLibraryModules(db: DB, body: unknown) {
  const next = { ...librarySwitches(db) };
  for (const [k, v] of Object.entries(patchSchema.parse(body ?? {}))) {
    if (!isModuleKey(k)) throw badRequest(`There is no module "${k}"`);
    if (v === null) delete next[k];
    else next[k] = v;
  }
  db.prepare(`INSERT INTO settings (key, value) VALUES ('modules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(next));
  return listModules(db);
}

/** Change a campaign's own switches. null follows the library again. */
export function setCampaignModules(db: DB, campaignId: number, body: unknown) {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  const next = { ...campaignSwitches(db, campaignId) };
  for (const [k, v] of Object.entries(patchSchema.parse(body ?? {}))) {
    if (!isModuleKey(k)) throw badRequest(`There is no module "${k}"`);
    if (v === null) delete next[k];
    else next[k] = v;
  }
  db.prepare('UPDATE campaigns SET modules = ? WHERE id = ?').run(Object.keys(next).length ? JSON.stringify(next) : null, campaignId);
  return listModules(db, campaignId);
}

// ---- Module data about a character or a treasure ----

export type DataOwner = 'character' | 'treasure';

export function moduleData<T extends object>(db: DB, module: ModuleKey, owner: DataOwner, id: number): Partial<T> {
  const row = db.prepare('SELECT data FROM module_data WHERE module = ? AND owner = ? AND owner_id = ?').get(module, owner, id) as { data: string } | undefined;
  return parseJson<Partial<T>>(row?.data, {});
}

/** Many owners' data at once (a party's treasure). */
export function moduleDataFor<T extends object>(db: DB, module: ModuleKey, owner: DataOwner, ids: number[]): Map<number, Partial<T>> {
  if (!ids.length) return new Map();
  const rows = db.prepare(`SELECT owner_id, data FROM module_data WHERE module = ? AND owner = ? AND owner_id IN (${ids.map(() => '?').join(',')})`).all(module, owner, ...ids) as {
    owner_id: number;
    data: string;
  }[];
  return new Map(rows.map((r) => [r.owner_id, parseJson<Partial<T>>(r.data, {})]));
}

export function setModuleData(db: DB, module: ModuleKey, owner: DataOwner, id: number, data: object) {
  db.prepare(
    `INSERT INTO module_data (module, owner, owner_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(module, owner, owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(module, owner, id, JSON.stringify(data), new Date().toISOString());
}
