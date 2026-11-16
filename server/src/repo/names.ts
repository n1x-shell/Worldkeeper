/**
 * The name generator's data: each people's common names (from its page), and every word already used in a name
 * anywhere in the world, so new names never clash with old ones.
 */
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { generateNames } from '../../../shared/names.js';

const COMMON = /Common names[.:]*\**\s*([^\n]+)/i;

export function namePeoples(db: DB) {
  const rows = db.prepare(`SELECT id, name, body, player_summary FROM entities WHERE type IN ('people', 'species') AND archived = 0 ORDER BY name`).all() as {
    id: string;
    name: string;
    body: string;
    player_summary: string;
  }[];
  return rows
    .map((r) => ({ id: r.id, name: r.name, seeds: seedsOf(`${r.body}\n${r.player_summary}`) }))
    .filter((r) => r.seeds.length)
    .map(({ id, name, seeds }) => ({ id, name, seeds: seeds.length }));
}

function seedsOf(text: string) {
  const m = COMMON.exec(text);
  return m
    ? m[1]
        .replace(/\.$/, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export function usedNameWords(db: DB) {
  const used = new Set<string>();
  for (const { name } of db.prepare(`SELECT name FROM entities`).all() as { name: string }[]) for (const w of name.split(/[\s"“”'’,()]+/)) if (w.length >= 3) used.add(w.toLowerCase());
  return used;
}

export function makeNames(db: DB, peopleId: string, count = 12, seed?: number) {
  const r = db.prepare(`SELECT name, body, player_summary FROM entities WHERE id = ?`).get(peopleId) as { name: string; body: string; player_summary: string } | undefined;
  if (!r) throw notFound('People');
  const seeds = seedsOf(`${r.body}\n${r.player_summary}`);
  return { people: r.name, names: generateNames({ seeds, people: r.name, used: usedNameWords(db), count, seed }) };
}
