/**
 * Stat blocks for the world's creatures, hazards and fight-ready people (GM only), shipped with the additions in
 * assets/statblocks. They're read, not copied into the library: records stay as the archive wrote them, and each
 * record's page shows its stat block beside it. The encounter tracker uses them to fill in HP, AC and initiative.
 */
import fs from 'node:fs';
import path from 'node:path';
import { worldkeeperPath } from '../packs/paths.js';

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
}

const DIR = worldkeeperPath('statblocks');
let cache: { stamp: string; data: Record<string, StatBlock> } | null = null;

/** Every stat block, re-read when the files change. */
export function statblocks(dir = DIR): Record<string, StatBlock> {
  if (!fs.existsSync(dir)) return {};
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const stamp = files.map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`).join('|');
  if (cache?.stamp === stamp) return cache.data;
  const data: Record<string, StatBlock> = {};
  for (const f of files) Object.assign(data, (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { statblocks: Record<string, StatBlock> }).statblocks);
  cache = { stamp, data };
  return data;
}

export const statblockFor = (id: string) => statblocks()[id] ?? null;

/** A short list for pickers and the tracker. */
export function statblockIndex() {
  return Object.values(statblocks()).map((s) => ({ id: s.id, name: s.name, kind: s.kind ?? 'creature', cr: s.cr ?? null, ac: s.ac ?? null, hp: s.hpAvg ?? null, init: s.init ?? null }));
}
