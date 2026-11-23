/**
 * Stat blocks for a world's creatures, hazards and fight-ready people (GM only): the GM's own, kept in the library
 * (table statblocks: usually a book stat block to use and what's different), and a setting pack's (its statblocks
 * folder), shown only while that setting's rules pack is on. Each record's page shows its stat block beside it; the
 * encounter tracker uses them for HP, AC and initiative.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { WORLDKEEPER, worldkeeperPath } from '../packs/paths.js';
import { findPack, installedPacks } from '../packs/registry.js';
import { settingPackOn } from './settingPack.js';

export interface StatEntry {
  name: string;
  text: string;
}
export interface StatBlock {
  id: string;
  name: string;
  meta: string;
  kind?: 'hazard' | 'creature' | 'npc';
  ac?: number;
  hp?: string;
  hpAvg?: number;
  init?: number;
  speed?: string;
  ab?: number[];
  cr?: string;
  xp?: number;
  pb?: number;
  saves?: string;
  skills?: string;
  vuln?: string;
  res?: string;
  imm?: string;
  cimm?: string;
  gear?: string;
  senses?: string;
  languages?: string;
  traits?: StatEntry[];
  actions?: StatEntry[];
  bonus?: StatEntry[];
  reactions?: StatEntry[];
  legendary?: StatEntry[];
  trigger?: string;
  effect?: string;
  counter?: string;
  /** For a person: how to play them in a fight. */
  tactics?: string;
  /** A short card: the Monster Manual stat block it uses, and what's different. */
  base?: string;
  changes?: string;
  /** False for someone who won't fight: the tactics say what they do instead. */
  fights?: boolean;
  /** GM-only looks, for someone the handbook doesn't describe. */
  looks?: string;
  /** True when how they fight is deliberately left open: looks only, no numbers yet. */
  open?: boolean;
  /** The GM's own (kept in the library), not a pack's. */
  own?: boolean;
}

const DIR = worldkeeperPath('statblocks');
const caches = new Map<string, { stamp: string; data: Record<string, StatBlock> }>();

/** Every stat block in a pack's statblocks folder (the Worldkeeper setting's by default), re-read when the files change. */
export function statblocks(dir = DIR): Record<string, StatBlock> {
  if (!fs.existsSync(dir)) return {};
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const stamp = files.map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`).join('|');
  const hit = caches.get(dir);
  if (hit?.stamp === stamp) return hit.data;
  const data: Record<string, StatBlock> = {};
  for (const f of files) Object.assign(data, (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { statblocks?: Record<string, StatBlock> }).statblocks ?? {});
  caches.set(dir, { stamp, data });
  return data;
}

/**
 * The packs' stat blocks: the Worldkeeper setting's while its rules pack is on, and any other installed pack's own
 * (its statblocks/*.json, docs/SETTING_PACKS.md).
 */
function packBlocks(db: DB): Record<string, StatBlock> {
  const out: Record<string, StatBlock> = settingPackOn(db) ? { ...statblocks() } : {};
  for (const p of installedPacks(db)) {
    if (p.id === WORLDKEEPER) continue;
    const dir = findPack(p.id)?.dir;
    if (dir) for (const [id, b] of Object.entries(statblocks(path.join(dir, 'statblocks')))) out[id] ??= b;
  }
  return out;
}

/** The GM's own stat block for a record. */
export function libraryStatblock(db: DB, id: string): StatBlock | null {
  try {
    const r = db.prepare('SELECT data FROM statblocks WHERE entity_id = ?').get(id) as { data: string } | undefined;
    return r ? ({ ...parseJson<StatBlock>(r.data, { id, name: id, meta: '' }), id, own: true } as StatBlock) : null;
  } catch {
    return null; // a library from before migration 26
  }
}

/** A record's stat block: the GM's own first, then its setting pack's. */
export const statblockFor = (db: DB, id: string) => libraryStatblock(db, id) ?? packBlocks(db)[id] ?? null;

/** A short list for pickers and the tracker. */
export function statblockIndex(db: DB) {
  const own = (() => {
    try {
      return (db.prepare('SELECT entity_id FROM statblocks').all() as { entity_id: string }[]).map((r) => libraryStatblock(db, r.entity_id)!).filter(Boolean);
    } catch {
      return [];
    }
  })();
  const ids = new Set(own.map((s) => s.id));
  return [...own, ...Object.values(packBlocks(db)).filter((s) => !ids.has(s.id))].map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind ?? 'creature',
    cr: s.cr ?? null,
    ac: s.ac ?? null,
    hp: s.hpAvg ?? null,
    init: s.init ?? null,
  }));
}

const ownSchema = z.object({
  /** The book stat block it uses (by name), and what's different. */
  base: z.string().trim().max(200).optional(),
  changes: z.string().max(5000).default(''),
  tactics: z.string().max(5000).default(''),
  ac: z.number().int().min(0).max(40).optional(),
  hpAvg: z.number().int().min(0).max(2000).optional(),
  init: z.number().int().min(-10).max(20).optional(),
  cr: z.string().max(10).optional(),
  kind: z.enum(['creature', 'npc', 'hazard']).default('npc'),
});

/** Give a record of the GM's a stat block (a book block and its changes, with numbers for the tracker). */
export function setLibraryStatblock(db: DB, id: string, body: unknown): StatBlock {
  const e = db.prepare('SELECT name FROM entities WHERE id = ?').get(id) as { name: string } | undefined;
  if (!e) throw notFound('Record');
  const d = ownSchema.parse(body ?? {});
  if (!d.base && !d.changes.trim()) throw badRequest('Name a stat block from your books, or say how it fights');
  const block = { id, name: e.name, meta: d.base ? `Uses the ${d.base} stat block` : '', ...d };
  db.prepare(
    `INSERT INTO statblocks (entity_id, data, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(entity_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(id, JSON.stringify(block));
  return libraryStatblock(db, id)!;
}

export function deleteLibraryStatblock(db: DB, id: string) {
  db.prepare('DELETE FROM statblocks WHERE entity_id = ?').run(id);
}
