/**
 * Character pages: the player's own notes (core), and, with the Thinning module, the character's named memories, their
 * true name and who knows it, and their Thinning track, kept as that module's data (module_data), so they stay put
 * while the module is off. The GM sees and edits everything in the GM app. Each page has a private code;
 * with it, the character's player reads and edits their own page on the table server. Players never change Thinning
 * (the GM does, after a failed save), and can never bring back a memory once it is struck: lost memories don't return.
 * Nothing here is ever part of the published handbook.
 */
import { handbookCode } from './handbookCodes.js';
import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { characterSheetSchema } from './campaigns.js';
import { GM_ONLY_SHEET_KEYS } from '../../../shared/sheet.js';
import { moduleData, setModuleData } from './modules.js';

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
/**
 * What the player sees: their page, who their character is, and the address of their own campaign's handbook. Never
 * anyone else's page, or any other campaign.
 */
export interface PlayerCharacterPage extends Omit<CharacterPage, 'character_id' | 'code'> {
  /** Their campaign's handbook code (/player/c/<code>), or null when the campaign is archived. */
  handbook: string | null;
  name: string;
  species: string;
  class_name: string;
  level: number;
  /** The character's 2024 sheet, without the GM's own notes (setting mechanics, world ties, hometown). */
  sheet: Record<string, unknown>;
  /** When the sheet was last changed, by anyone. Sent back with an edit, so the server knows what the edit was made on. */
  sheet_at: string;
}

interface Row {
  character_id: number;
  code: string;
  notes: string;
  updated_at: string;
}
/** The Thinning module's data about a character. */
type ThinningData = Pick<CharacterPage, 'true_name' | 'memories' | 'known_by' | 'thinning' | 'shardscarred'>;
const NO_THINNING: ThinningData = { true_name: '', memories: [], known_by: [], thinning: 0, shardscarred: false };

// No look-alike letters or digits, so a code can be read aloud across the table.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const now = () => new Date().toISOString();

const fromRow = (db: DB, r: Row): CharacterPage => ({
  character_id: r.character_id,
  code: r.code,
  ...NO_THINNING,
  ...moduleData<ThinningData>(db, 'thinning', 'character', r.character_id),
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
  return fromRow(db, row);
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
// What a player may change on the character itself: everything on the sheet but the GM's own notes, and never the level.
const playerCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    species: z.string().max(200).optional(),
    class_name: z.string().max(200).optional(),
    sheet: characterSheetSchema.optional(),
    /** The stamp of the sheet this edit was made on (`sheet_at` of the page as loaded). */
    sheet_at: z.string().max(40).optional(),
  })
  .strict();
const playerEditSchema = playerSchema.extend({ character: playerCharacterSchema.optional() }).strict();
const gmSchema = playerSchema.extend({ thinning: z.number().int().min(0).max(6).optional(), shardscarred: z.boolean().optional() }).strict();

/** Give new memories ids, keeping existing ones. */
function numbered(list: z.infer<typeof memorySchema>[], old: Memory[]): Memory[] {
  let next = Math.max(0, ...old.map((m) => m.id)) + 1;
  return list.map((m) => ({ id: m.id && old.some((o) => o.id === m.id) ? m.id : next++, text: m.text, struck: m.struck }));
}

function save(db: DB, page: CharacterPage) {
  db.prepare('UPDATE character_pages SET notes = ?, updated_at = ? WHERE character_id = ?').run(page.notes, now(), page.character_id);
  const t: ThinningData = { true_name: page.true_name, memories: page.memories, known_by: page.known_by, thinning: page.thinning, shardscarred: page.shardscarred };
  const blank = !t.true_name && !t.memories.length && !t.known_by.length && !t.thinning && !t.shardscarred;
  if (!blank || db.prepare(`SELECT 1 FROM module_data WHERE module = 'thinning' AND owner = 'character' AND owner_id = ?`).get(page.character_id))
    setModuleData(db, 'thinning', 'character', page.character_id, t);
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
  return fromRow(db, row);
}

/** The character behind a private code. */
export const characterIdByCode = (db: DB, code: string) => byCode(db, code).character_id;

const withoutGmNotes = (sheet: Record<string, unknown>) => Object.fromEntries(Object.entries(sheet).filter(([k]) => !(GM_ONLY_SHEET_KEYS as readonly string[]).includes(k)));

function forPlayer(db: DB, page: CharacterPage): PlayerCharacterPage {
  const { campaign_id, ...c } = db.prepare('SELECT name, species, class_name, level, sheet, campaign_id, updated_at AS sheet_at FROM characters WHERE id = ?').get(page.character_id) as {
    name: string;
    species: string;
    class_name: string;
    level: number;
    sheet: string;
    campaign_id: number;
    sheet_at: string;
  };
  const archived = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaign_id) as { status: string } | undefined)?.status === 'archived';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { character_id, code, ...rest } = page;
  return { ...c, handbook: archived ? null : handbookCode(db, campaign_id), sheet: withoutGmNotes(JSON.parse(c.sheet || '{}') as Record<string, unknown>), ...rest };
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
  const patch = playerEditSchema.parse(body);
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
  if (patch.character) {
    // The sheet the player sends replaces theirs, but the GM's own notes are kept as they were.
    const row = db.prepare('SELECT name, species, class_name, level, sheet, updated_at FROM characters WHERE id = ?').get(page.character_id) as {
      name: string;
      species: string;
      class_name: string;
      level: number;
      sheet: string;
      updated_at: string;
    };
    const old = JSON.parse(row.sheet || '{}') as Record<string, unknown>;
    // The portrait changes only through its own route, too.
    const kept = Object.fromEntries([...(GM_ONLY_SHEET_KEYS as readonly string[]), 'portrait'].filter((k) => k in old).map((k) => [k, old[k]]));
    const sent = patch.character.sheet ? withoutGmNotes(patch.character.sheet) : null;
    if (sent) delete sent.portrait;
    // What the GM gives stays given. A sheet open since before an award would otherwise write over it: the experience
    // awarded, and the mark that a level is waiting. The player can only move that mark up, by taking the level.
    if (sent) {
      const stale = patch.character.sheet_at !== undefined && patch.character.sheet_at !== row.updated_at;
      const mark = typeof sent.builtLevel === 'number' ? Math.min(sent.builtLevel, row.level) : undefined;
      if (typeof old.builtLevel === 'number') sent.builtLevel = stale || mark === undefined ? old.builtLevel : Math.max(old.builtLevel, mark);
      else if (mark !== undefined) sent.builtLevel = mark;
      if (stale && typeof old.xp === 'number') sent.xp = old.xp;
    }
    const sheet = sent ? { ...sent, ...kept } : old;
    db.prepare('UPDATE characters SET name = ?, species = ?, class_name = ?, sheet = ?, updated_at = ? WHERE id = ?').run(
      patch.character.name ?? row.name,
      patch.character.species ?? row.species,
      patch.character.class_name ?? row.class_name,
      JSON.stringify(sheet),
      now(),
      page.character_id,
    );
  }
  return playerCharacterPage(db, page.code);
}
