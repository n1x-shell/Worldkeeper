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
import { XP_BY_CR, abilityMod, crPb, hitPoints } from '../../../shared/statblock.js';

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
    const r = db.prepare('SELECT s.data, e.name FROM statblocks s LEFT JOIN entities e ON e.id = s.entity_id WHERE s.entity_id = ?').get(id) as { data: string; name: string | null } | undefined;
    if (!r) return null;
    const block = parseJson<StatBlock>(r.data, { id, name: id, meta: '' });
    // The record's name as it is now (it may have been renamed since).
    return { ...block, id, name: r.name ?? block.name, own: true };
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

const line = z.string().trim().max(600).optional();
const long = z.string().trim().max(5000).optional();
const entryList = z
  .array(z.object({ name: z.string().trim().max(120).default(''), text: z.string().trim().max(5000).default('') }))
  .max(40)
  .optional()
  .transform((l) => l?.filter((e) => e.name || e.text));

const ownSchema = z.object({
  kind: z.enum(['creature', 'npc', 'hazard']).default('npc'),
  /** The book stat block it uses (by name), and what's different. */
  base: z.string().trim().max(200).optional(),
  changes: z.string().max(5000).default(''),
  tactics: z.string().max(5000).default(''),
  looks: long,
  // A stat block of its own, in the books' layout.
  meta: z.string().trim().max(200).optional(),
  ac: z.number().int().min(0).max(40).optional(),
  hp: z.string().trim().max(60).optional(),
  hpAvg: z.number().int().min(0).max(5000).optional(),
  init: z.number().int().min(-10).max(30).optional(),
  speed: line,
  ab: z.array(z.number().int().min(1).max(30)).length(6).optional(),
  cr: z.string().trim().max(10).optional(),
  saves: line,
  skills: line,
  vuln: line,
  res: line,
  imm: line,
  cimm: line,
  gear: line,
  senses: line,
  languages: line,
  traits: entryList,
  actions: entryList,
  bonus: entryList,
  reactions: entryList,
  legendary: entryList,
  // A hazard: a trap, a sickness, a dangerous place.
  trigger: long,
  effect: long,
  counter: long,
});

/**
 * Give a record of the GM's a stat block: a book block and its changes (a short card), a whole stat block of its own,
 * or a hazard. What follows from what was written is filled in: average Hit Points from the dice, XP and Proficiency
 * Bonus from the Challenge Rating, initiative from Dexterity.
 */
export function setLibraryStatblock(db: DB, id: string, body: unknown): StatBlock {
  const e = db.prepare('SELECT name FROM entities WHERE id = ?').get(id) as { name: string } | undefined;
  if (!e) throw notFound('Record');
  const d = ownSchema.parse(body ?? {});
  // Nothing typed is nothing kept.
  const kept = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as typeof d;
  let block: Omit<StatBlock, 'id' | 'name'> & { meta: string };
  if (d.kind === 'hazard') {
    if (!d.trigger && !d.effect) throw badRequest('Say what sets the hazard off, or what it does');
    block = { kind: 'hazard', meta: d.meta ?? 'Hazard', trigger: d.trigger, effect: d.effect, counter: d.counter };
  } else if (d.base) {
    const { meta: _meta, hp: _hp, ab: _ab, speed: _speed, trigger: _t, effect: _e, counter: _c, ...card } = kept;
    block = { ...card, meta: `Uses the ${d.base} stat block`, changes: d.changes, tactics: d.tactics };
  } else {
    const written = d.ab || d.hp || d.ac !== undefined || d.actions?.length || d.traits?.length;
    if (!written && !d.changes.trim()) throw badRequest('Name a stat block from your books, or write its own');
    if (d.cr && XP_BY_CR[d.cr] === undefined) throw badRequest(`"${d.cr}" isn't a Challenge Rating (0, 1/8, 1/4, 1/2, or 1 to 30)`);
    const hp = d.hp ? hitPoints(d.hp) : null;
    if (d.hp && !hp) throw badRequest('Write Hit Points as a number, or as dice such as 7d8 + 7');
    const { trigger: _t, effect: _e, counter: _c, base: _b, ...own } = kept;
    block = {
      ...own,
      meta: d.meta ?? '',
      changes: d.changes,
      tactics: d.tactics,
      ...(hp ? { hp: hp.hp, hpAvg: hp.avg } : d.hpAvg !== undefined ? { hp: String(d.hpAvg) } : {}),
      ...(d.init === undefined && d.ab ? { init: abilityMod(d.ab[1]) } : {}),
      ...(d.cr ? { xp: XP_BY_CR[d.cr], pb: crPb(d.cr) } : {}),
    };
  }
  db.prepare(
    `INSERT INTO statblocks (entity_id, data, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(entity_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(id, JSON.stringify({ id, name: e.name, ...block }));
  return libraryStatblock(db, id)!;
}

export function deleteLibraryStatblock(db: DB, id: string) {
  db.prepare('DELETE FROM statblocks WHERE entity_id = ?').run(id);
}
