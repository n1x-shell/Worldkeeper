/**
 * The Worldkeeper setting pack (packs/worldkeeper/rules/README.md): the setting's own creatures, hazards and items as a
 * built-in, removable rules pack (CC BY 4.0), off until the GM turns it on. With the Thinning mechanic switched off,
 * the entries that use Thinning, true names or Shardscarred use their standard-rules versions (standard.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { moduleOn } from './modules.js';
import { worldkeeperPath } from '../packs/paths.js';

type DB = Database.Database;
type J = Record<string, any>;

const ASSETS = worldkeeperPath();
const read = (p: string): J => JSON.parse(fs.readFileSync(path.join(ASSETS, p), 'utf8')) as J;
export const SETTING_PACK = { id: 'worldkeeper', name: 'The Worldkeeper setting', source: 'The Worldkeeper contributors, CC BY 4.0 (built in)' };
const CREDIT = 'The Worldkeeper setting pack (CC BY 4.0)';

export const settingPackOn = (db: DB) => (db.prepare(`SELECT value FROM settings WHERE key = 'rules_worldkeeper'`).get() as { value: string } | undefined)?.value === 'on';
export function setSettingPack(db: DB, on: boolean) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('rules_worldkeeper', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(on ? 'on' : 'off');
}

let cache: { creatures: J[]; items: J[]; standard: J } | null = null;
function load() {
  if (cache) return cache;
  const blocks = Object.values(read('statblocks/statblocks.json').statblocks as Record<string, J>);
  const catalogue = read('treasure/catalogue.json').items as Record<string, J>;
  // The Kaelmar items' names are on their records in the pack's lore; their rules are in the treasure catalogue.
  const names: Record<string, string> = {};
  const loreDir = path.join(ASSETS, 'lore/kaelmar-items');
  if (fs.existsSync(loreDir))
    for (const f of fs.readdirSync(loreDir).filter((x) => x.endsWith('.md'))) {
      const t = fs.readFileSync(path.join(loreDir, f), 'utf8');
      const id = /^ID: (\S+)/m.exec(t)?.[1];
      const name = /^Name: (.+)$/m.exec(t)?.[1]?.trim();
      if (id && name) names[id] = name;
    }
  const kaelmar = Object.entries(catalogue)
    .filter(([id, it]) => it.rules && names[id])
    .map(([id, it]) => ({ id, name: names[id], type: 'Wondrous Item', rarity: it.rarity, attunement: it.attunement ? 'requires attunement' : '', text: it.rules }));
  const aetheris = (read('rules/items-aetheris.json').items as J[]).map((i) => ({ ...i }));
  cache = {
    creatures: blocks.map((b) => ({ ...b, worldId: b.id, id: `wk:${b.id}`, source: CREDIT })),
    items: [...aetheris, ...kaelmar].map((i) => ({ ...i, magic: !!i.rarity, value: null, weight: null, tables: [], source: CREDIT })),
    standard: read('rules/standard.json'),
  };
  return cache;
}

/** The pack's creatures and items, in their standard-rules versions when the Thinning module is off. */
export function settingPack(db: DB): { creatures: J[]; items: J[] } {
  const { creatures, items, standard } = load();
  if (moduleOn(db, 'thinning')) return { creatures, items };
  const sc = standard.creatures as Record<string, J>;
  const si = standard.items as Record<string, string>;
  return {
    creatures: creatures.map((c) => {
      const o = sc[c.worldId];
      if (!o) return c;
      const out: J = { ...c };
      for (const [field, v] of Object.entries(o)) {
        if (typeof v === 'string') out[field] = v;
        else out[field] = ((c[field] ?? []) as J[]).map((e) => (v[e.name] ? { ...e, ...v[e.name] } : e));
      }
      return out;
    }),
    items: items.map((i) => (si[i.id] ? { ...i, text: si[i.id] } : i)),
  };
}

export const settingPackCounts = () => ({ creature: load().creatures.length, item: load().items.length });
