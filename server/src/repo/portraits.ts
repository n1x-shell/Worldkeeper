/**
 * Character portraits: one picture per character, kept in the library's uploads folder and named on the sheet.
 * The player (with their code) or the GM uploads it as a data URL; the browser has already shrunk it. Only real
 * WebP, JPEG or PNG pictures are kept, up to 2 MB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { badRequest, notFound } from '../lib/errors.js';

type DB = Database.Database;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

/** A data URL's picture, checked to be what it says it is. */
export function decodePicture(dataUrl: unknown): { data: Buffer; ext: string } {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw badRequest('Send the portrait as a WebP, JPEG or PNG picture.');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_BYTES) throw badRequest('That picture is too big (2 MB at most).');
  const t = TYPES[m[1]];
  if (!t.magic(data)) throw badRequest('That file is not a picture.');
  return { data, ext: t.ext };
}

function sheetOf(db: DB, characterId: number) {
  const row = db.prepare('SELECT sheet FROM characters WHERE id = ?').get(characterId) as { sheet: string } | undefined;
  if (!row) throw notFound('Character');
  return JSON.parse(row.sheet || '{}') as Record<string, unknown>;
}
function writeSheet(db: DB, characterId: number, sheet: Record<string, unknown>) {
  db.prepare('UPDATE characters SET sheet = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(sheet), new Date().toISOString(), characterId);
}
const isPortraitFile = (f: unknown): f is string => typeof f === 'string' && /^portrait-[a-z0-9-]+\.(webp|jpg|png)$/.test(f);

/** Save a character's portrait, replacing (and deleting) the old one. Returns the new file name. */
export function savePortrait(db: DB, uploadsDir: string, characterId: number, dataUrl: unknown): string {
  const sheet = sheetOf(db, characterId);
  const { data, ext } = decodePicture(dataUrl);
  const file = `portrait-${characterId}-${randomBytes(6).toString('hex')}.${ext}`;
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, file), data);
  const old = sheet.portrait;
  writeSheet(db, characterId, { ...sheet, portrait: file });
  if (isPortraitFile(old)) fs.rmSync(path.join(uploadsDir, old), { force: true });
  return file;
}

export function removePortrait(db: DB, uploadsDir: string, characterId: number) {
  const sheet = sheetOf(db, characterId);
  const old = sheet.portrait;
  delete sheet.portrait;
  writeSheet(db, characterId, sheet);
  if (isPortraitFile(old)) fs.rmSync(path.join(uploadsDir, old), { force: true });
}

/** A portrait as a data URL, for a campaign export. */
export function portraitDataUrl(uploadsDir: string, file: unknown): string | null {
  if (!isPortraitFile(file)) return null;
  const full = path.join(uploadsDir, file);
  if (!fs.existsSync(full)) return null;
  const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
  return `data:${type};base64,${fs.readFileSync(full).toString('base64')}`;
}

/** Whether a file is some character's portrait (so the table server may send it). */
export const isCharacterPortrait = (db: DB, file: string) => isPortraitFile(file) && !!db.prepare("SELECT 1 FROM characters WHERE json_extract(sheet, '$.portrait') = ?").get(file);

/**
 * A sheet sent with a character edit keeps the stored portrait: the portrait changes only through its own routes, so
 * a save that was on its way when a new picture went up can't undo it.
 */
export function keepPortrait<T>(db: DB, characterId: number, body: T): T {
  const b = body as { sheet?: Record<string, unknown> } | undefined;
  if (!b || typeof b !== 'object' || !b.sheet || typeof b.sheet !== 'object') return body;
  const row = db.prepare('SELECT sheet FROM characters WHERE id = ?').get(characterId) as { sheet: string } | undefined;
  const stored = row ? (JSON.parse(row.sheet || '{}') as { portrait?: string }).portrait : undefined;
  const sheet = { ...b.sheet };
  if (stored) sheet.portrait = stored;
  else delete sheet.portrait;
  return { ...b, sheet } as T;
}
