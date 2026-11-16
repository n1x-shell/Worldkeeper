/**
 * Character pages: each character's named memories, their true name and who knows it, and their Thinning track
 * (Thinning and Unmaking [SYS-907]). The GM sees and edits everything in the GM app. Each page has a private code;
 * with it, the character's player reads and edits their own page on the table server. Players never change Thinning
 * (the GM does, after a failed save), and can never bring back a memory once it is struck: lost memories don't return.
 * Nothing here is ever part of the published handbook.
 */
import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';

type DB = Database.Database;

export interface Memory {
  id: number;
  text: string;
  struck: boolean;
}
export interface CharacterPage {
  character_id: number;
  code: string;
  true_name: string;
  memories: Memory[];
  known_by: string[];
  thinning: number;
  shardscarred: boolean;
  notes: string;
  updated_at: string;
}
/** What the player sees: their page, and who their character is. Never the code-holder's campaign or anyone else's page. */
export interface PlayerCharacterPage extends Omit<CharacterPage, 'character_id' | 'code'> {
  name: string;
  species: string;
  class_name: string;
  level: number;
}

interface Row {
  character_id: number;
  code: string;
  true_name: string;
  memories: string;
  known_by: string;
  thinning: number;
  shardscarred: number;
  notes: string;
  updated_at: string;
}

// No look-alike letters or digits, so a code can be read aloud across the table.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const now = () => new Date().toISOString();

const fromRow = (r: Row): CharacterPage => ({
  character_id: r.character_id,
  code: r.code,
  true_name: r.true_name,
  memories: JSON.parse(r.memories) as Memory[],
  known_by: JSON.parse(r.known_by) as string[],
  thinning: r.thinning,
  shardscarred: !!r.shardscarred,
  notes: r.notes,
  updated_at: r.updated_at,
});

function freshCode(db: DB): string {
  for (;;) {
    const c = newCode();
    if (!db.prepare('SELECT 1 FROM character_pages WHERE code = ?').get(c)) return c;
  }
}

/** A character's page, made the first time anyone asks for it. */
export function characterPage(db: DB, characterId: number): CharacterPage {
  if (!db.prepare('SELECT 1 FROM characters WHERE id = ?').get(characterId)) throw notFound('Character');
  let row = db.prepare('SELECT * FROM character_pages WHERE character_id = ?').get(characterId) as Row | undefined;
  if (!row) {
    db.prepare('INSERT INTO character_pages (character_id, code) VALUES (?, ?)').run(characterId, freshCode(db));
    row = db.prepare('SELECT * FROM character_pages WHERE character_id = ?').get(characterId) as Row;
  }
  return fromRow(row);
}

/** A new private code, so an old link stops working (for a lost or shared link). */
export function renewCharacterCode(db: DB, characterId: number): CharacterPage {
  characterPage(db, characterId);
  db.prepare('UPDATE character_pages SET code = ?, updated_at = ? WHERE character_id = ?').run(freshCode(db), now(), characterId);
  return characterPage(db, characterId);
}

const memorySchema = z.object({ id: z.number().int().positive().optional(), text: z.string().trim().min(1).max(500), struck: z.boolean().default(false) });
const names = z.array(z.string().trim().min(1).max(200)).max(50);
const playerSchema = z
  .object({
    true_name: z.string().trim().max(200).optional(),
    memories: z.array(memorySchema).max(60).optional(),
    known_by: names.optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();
const gmSchema = playerSchema.extend({ thinning: z.number().int().min(0).max(6).optional(), shardscarred: z.boolean().optional() }).strict();

/** Give new memories ids, keeping existing ones. */
function numbered(list: z.infer<typeof memorySchema>[], old: Memory[]): Memory[] {
  let next = Math.max(0, ...old.map((m) => m.id)) + 1;
  return list.map((m) => ({ id: m.id && old.some((o) => o.id === m.id) ? m.id : next++, text: m.text, struck: m.struck }));
}

function save(db: DB, page: CharacterPage) {
  db.prepare('UPDATE character_pages SET true_name = ?, memories = ?, known_by = ?, thinning = ?, shardscarred = ?, notes = ?, updated_at = ? WHERE character_id = ?').run(
    page.true_name,
    JSON.stringify(page.memories),
    JSON.stringify(page.known_by),
    page.thinning,
    page.shardscarred ? 1 : 0,
    page.notes,
    now(),
    page.character_id,
  );
}

/** The GM's edit: anything, Thinning included. The GM can also restore a struck memory, if the table agrees. */
export function updateCharacterPage(db: DB, characterId: number, body: unknown): CharacterPage {
  const patch = gmSchema.parse(body);
  const page = characterPage(db, characterId);
  const next: CharacterPage = {
    ...page,
    ...(patch.true_name !== undefined ? { true_name: patch.true_name } : {}),
    ...(patch.known_by !== undefined ? { known_by: patch.known_by } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.thinning !== undefined ? { thinning: patch.thinning } : {}),
    ...(patch.shardscarred !== undefined ? { shardscarred: patch.shardscarred } : {}),
    ...(patch.memories !== undefined ? { memories: numbered(patch.memories, page.memories) } : {}),
  };
  save(db, next);
  return characterPage(db, characterId);
}

function byCode(db: DB, code: string) {
  const row = db.prepare('SELECT * FROM character_pages WHERE code = ?').get(code.trim().toUpperCase()) as Row | undefined;
  if (!row) throw notFound('Character page');
  return fromRow(row);
}

function forPlayer(db: DB, page: CharacterPage): PlayerCharacterPage {
  const c = db.prepare('SELECT name, species, class_name, level FROM characters WHERE id = ?').get(page.character_id) as {
    name: string;
    species: string;
    class_name: string;
    level: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { character_id, code, ...rest } = page;
  return { ...c, ...rest };
}

/** On the table server: the page behind a private code. */
export function playerCharacterPage(db: DB, code: string): PlayerCharacterPage {
  return forPlayer(db, byCode(db, code));
}

/**
 * The player's edit. Their true name, who knows it, their notes and their memories: they can add memories, reword
 * ones they still have, and strike one when the GM says so. They can't change Thinning, and can't unstrike, reword
 * or remove a memory once it is struck.
 */
export function updatePlayerCharacterPage(db: DB, code: string, body: unknown): PlayerCharacterPage {
  const patch = playerSchema.parse(body);
  const page = byCode(db, code);
  let memories = page.memories;
  if (patch.memories !== undefined) {
    memories = numbered(patch.memories, page.memories);
    for (const lost of page.memories.filter((m) => m.struck)) {
      const now = memories.find((m) => m.id === lost.id);
      if (!now || !now.struck || now.text !== lost.text) throw badRequest('A struck memory stays struck. Lost memories don’t come back.');
    }
  }
  save(db, {
    ...page,
    memories,
    ...(patch.true_name !== undefined ? { true_name: patch.true_name } : {}),
    ...(patch.known_by !== undefined ? { known_by: patch.known_by } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
  });
  return playerCharacterPage(db, page.code);
}
