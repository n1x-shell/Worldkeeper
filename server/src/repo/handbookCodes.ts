/**
 * Each campaign's handbook address on the table server: /player/c/<code> (docs/LIBRARIES_PLAN.md §2.3). A short
 * private code per campaign, so two groups can use one table server at once, each seeing only what it has learned.
 */
import { randomInt } from 'node:crypto';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';

// No look-alike letters or digits, so a code can be read aloud across the table (as character codes).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z2-9]{6,16}$/;

function freshCode(db: DB): string {
  for (;;) {
    const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!db.prepare('SELECT 1 FROM campaigns WHERE handbook_code = ?').get(c)) return c;
  }
}

/** A campaign's handbook code, given the first time it's asked for. */
export function handbookCode(db: DB, campaignId: number): string {
  const row = db.prepare('SELECT handbook_code FROM campaigns WHERE id = ?').get(campaignId) as { handbook_code: string | null } | undefined;
  if (!row) throw notFound('Campaign');
  if (row.handbook_code) return row.handbook_code;
  const code = freshCode(db);
  db.prepare('UPDATE campaigns SET handbook_code = ? WHERE id = ?').run(code, campaignId);
  return code;
}

/** A new code, so the old address stops working (for an address shared too widely). */
export function renewHandbookCode(db: DB, campaignId: number): string {
  handbookCode(db, campaignId);
  const code = freshCode(db);
  db.prepare('UPDATE campaigns SET handbook_code = ? WHERE id = ?').run(code, campaignId);
  return code;
}

/** At startup: every campaign gets its code. */
export function adoptHandbookCodes(db: DB) {
  for (const { id } of db.prepare('SELECT id FROM campaigns WHERE handbook_code IS NULL').all() as { id: number }[]) handbookCode(db, id);
}

/** The campaign behind a handbook code, or null (unknown, or the campaign is archived). */
export function campaignByHandbookCode(db: DB, code: string): number | null {
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return null;
  const row = db.prepare(`SELECT id FROM campaigns WHERE handbook_code = ? AND status != 'archived'`).get(c) as { id: number } | undefined;
  return row?.id ?? null;
}
