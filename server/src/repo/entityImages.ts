/**
 * Pictures on records (v0.9.3, docs/BETA_PLAN.md B1): any record can have pictures, each with a caption and a choice of
 * whether players see it. The first is the record's picture: shown at the head of its page and on its hover card.
 * Files live in the library's uploads folder, like maps and handout pictures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';

export interface EntityImage {
  id: number;
  entity_id: string;
  file: string;
  caption: string;
  player_visible: boolean;
  sort_order: number;
}

interface Row extends Omit<EntityImage, 'player_visible'> {
  player_visible: number;
}
const out = (r: Row): EntityImage => ({ id: r.id, entity_id: r.entity_id, file: r.file, caption: r.caption, player_visible: !!r.player_visible, sort_order: r.sort_order });

/** A record's pictures, the main one first. */
export function listImages(db: DB, entityId: string): EntityImage[] {
  return (db.prepare('SELECT id, entity_id, file, caption, player_visible, sort_order FROM entity_images WHERE entity_id = ? AND removed = 0 ORDER BY sort_order, id').all(entityId) as Row[]).map(out);
}

/** The record's picture (its first), if it has one. */
export function mainImage(db: DB, entityId: string): string | null {
  try {
    return (db.prepare('SELECT file FROM entity_images WHERE entity_id = ? AND removed = 0 ORDER BY sort_order, id LIMIT 1').get(entityId) as { file: string } | undefined)?.file ?? null;
  } catch {
    return null; // a library from before migration 34
  }
}

export function addImage(db: DB, entityId: string, file: string, o: { caption?: string; player_visible?: boolean; origin?: string } = {}): EntityImage {
  if (!db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId)) throw notFound('Record');
  const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM entity_images WHERE entity_id = ?').get(entityId) as { n: number }).n;
  const id = db
    .prepare('INSERT INTO entity_images (entity_id, file, caption, player_visible, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entityId, file, (o.caption ?? '').slice(0, 500), o.player_visible ? 1 : 0, next, o.origin ?? null).lastInsertRowid;
  return listImages(db, entityId).find((i) => i.id === Number(id))!;
}

const patch = z.object({ caption: z.string().max(500).optional(), player_visible: z.boolean().optional(), main: z.literal(true).optional() });

/** Change a picture's caption or who sees it, or make it the record's picture (first). Returns the record's pictures. */
export function updateImage(db: DB, id: number, body: unknown): EntityImage[] {
  const row = db.prepare('SELECT entity_id FROM entity_images WHERE id = ? AND removed = 0').get(id) as { entity_id: string } | undefined;
  if (!row) throw notFound('Picture');
  const d = patch.parse(body ?? {});
  db.transaction(() => {
    if (d.caption !== undefined) db.prepare('UPDATE entity_images SET caption = ? WHERE id = ?').run(d.caption, id);
    if (d.player_visible !== undefined) db.prepare('UPDATE entity_images SET player_visible = ? WHERE id = ?').run(d.player_visible ? 1 : 0, id);
    if (d.main) {
      const order = [id, ...listImages(db, row.entity_id).map((i) => i.id).filter((x) => x !== id)];
      const set = db.prepare('UPDATE entity_images SET sort_order = ? WHERE id = ?');
      order.forEach((x, i) => set.run(i, x));
    }
  })();
  return listImages(db, row.entity_id);
}

/**
 * Remove a picture; its file goes too, unless something else still uses it. A worldbook's picture leaves a note
 * that it was removed, so updating the worldbook doesn't bring it back.
 */
export function deleteImage(db: DB, id: number, uploadsDir: string): EntityImage[] {
  const row = db.prepare('SELECT entity_id, file, origin FROM entity_images WHERE id = ? AND removed = 0').get(id) as { entity_id: string; file: string; origin: string | null } | undefined;
  if (!row) throw notFound('Picture');
  if (row.origin) db.prepare('UPDATE entity_images SET removed = 1, player_visible = 0 WHERE id = ?').run(id);
  else db.prepare('DELETE FROM entity_images WHERE id = ?').run(id);
  const stillUsed = db.prepare('SELECT 1 FROM entity_images WHERE file = ? AND removed = 0').get(row.file);
  if (!stillUsed && /^[\w.-]+$/.test(row.file)) fs.rmSync(path.join(uploadsDir, row.file), { force: true });
  return listImages(db, row.entity_id);
}

/** The pictures players may see, by record (only ever asked for records they can read). */
export function playerImages(db: DB): Map<string, { file: string; caption: string }[]> {
  const m = new Map<string, { file: string; caption: string }[]>();
  try {
    for (const r of db.prepare('SELECT entity_id, file, caption FROM entity_images WHERE player_visible = 1 AND removed = 0 ORDER BY sort_order, id').all() as { entity_id: string; file: string; caption: string }[])
      m.set(r.entity_id, [...(m.get(r.entity_id) ?? []), { file: r.file, caption: r.caption }]);
  } catch {
    /* a library from before migration 34 */
  }
  return m;
}

/** Whether a file is a picture players may be sent: marked for players, on a record that isn't archived. */
export function isPlayerRecordPicture(db: DB, file: string): boolean {
  try {
    return !!db.prepare('SELECT 1 FROM entity_images i JOIN entities e ON e.id = i.entity_id WHERE i.file = ? AND i.player_visible = 1 AND i.removed = 0 AND e.archived = 0').get(file);
  } catch {
    return false;
  }
}
