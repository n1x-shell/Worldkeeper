/**
 * Mysteries, secrets and clues. The campaign's big questions, the secrets that answer them, and the clues that lead
 * to each secret: rumours, NPCs who know, places with evidence, items, or free text. Per campaign, each secret is
 * unknown, suspected or known to the party, and each clue is found or not. GM-only: never part of player data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';

export const SECRET_STATES = ['unknown', 'suspected', 'known'] as const;
export type SecretState = (typeof SECRET_STATES)[number];
export const CLUE_KINDS = ['rumour', 'npc', 'place', 'item', 'text'] as const;
export type ClueKind = (typeof CLUE_KINDS)[number];

export interface Clue {
  id: number;
  kind: ClueKind;
  note: string;
  entity_id: string | null;
  rumours: { id: number; text: string; source_id: string | null }[];
  origin: string;
  found: boolean;
}
export interface Secret {
  id: number;
  mystery_id: number | null;
  title: string;
  truth: string;
  gm_note: string;
  source_id: string | null;
  about: string[];
  origin: string;
  state: SecretState;
  progress_note: string;
  clues: Clue[];
}
export interface Mystery {
  id: number;
  title: string;
  question: string;
  summary: string;
  origin: string;
  secrets: Secret[];
}

/** Every mystery with its secrets and clues, and the party's progress in one campaign (0 = none chosen). */
export function listMysteries(db: DB, campaignId = 0, entityId?: string): Mystery[] {
  const mysteries = db.prepare('SELECT * FROM mysteries ORDER BY sort_order, id').all() as {
    id: number;
    title: string;
    question: string;
    summary: string;
    origin: string;
  }[];
  const secrets = db
    .prepare(
      `SELECT s.*, p.state, p.note AS progress_note FROM secrets s
       LEFT JOIN secret_progress p ON p.secret_id = s.id AND p.campaign_id = ? WHERE s.origin <> 'removed' ORDER BY s.sort_order, s.id`,
    )
    .all(campaignId) as (Omit<Secret, 'about' | 'clues' | 'state'> & { about: string; state: SecretState | null })[];
  const clues = db
    .prepare(`SELECT c.*, f.found_at FROM clues c LEFT JOIN clue_found f ON f.clue_id = c.id AND f.campaign_id = ? WHERE c.origin <> 'removed' ORDER BY c.sort_order, c.id`)
    .all(campaignId) as { id: number; secret_id: number; kind: ClueKind; note: string; entity_id: string | null; rumour_ids: string; origin: string; found_at: string | null }[];
  const rumour = db.prepare('SELECT id, text, source_id FROM rumours WHERE id = ?');
  const cluesBySecret = new Map<number, Clue[]>();
  for (const c of clues) {
    const rumours = parseJson<number[]>(c.rumour_ids, [])
      .map((id) => rumour.get(id) as { id: number; text: string; source_id: string | null } | undefined)
      .filter((r): r is { id: number; text: string; source_id: string | null } => !!r);
    cluesBySecret.set(c.secret_id, [
      ...(cluesBySecret.get(c.secret_id) ?? []),
      { id: c.id, kind: c.kind, note: c.note, entity_id: c.entity_id, rumours, origin: c.origin, found: !!c.found_at },
    ]);
  }
  const built = secrets.map(
    (s): Secret => ({
      ...s,
      about: parseJson<string[]>(s.about, []),
      state: s.state ?? 'unknown',
      progress_note: s.progress_note ?? '',
      clues: cluesBySecret.get(s.id) ?? [],
    }),
  );
  const touches = (s: Secret) =>
    !entityId ||
    s.source_id === entityId ||
    s.about.includes(entityId) ||
    s.clues.some((c) => c.entity_id === entityId || c.rumours.some((r) => r.source_id === entityId));
  const out: Mystery[] = mysteries.map((m) => ({ ...m, secrets: built.filter((s) => s.mystery_id === m.id && touches(s)) }));
  const loose = built.filter((s) => s.mystery_id === null && touches(s));
  if (loose.length) out.push({ id: 0, title: 'Other secrets', question: '', summary: '', origin: 'user', secrets: loose });
  return entityId ? out.filter((m) => m.secrets.length) : out;
}

// ------------------------------------------------------------------ editing

const secretPatch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  truth: z.string().max(10000).optional(),
  gm_note: z.string().max(10000).optional(),
  mystery_id: z.number().int().nullable().optional(),
  about: z.array(z.string().max(40)).max(50).optional(),
});
export function updateSecret(db: DB, id: number, input: unknown) {
  const d = secretPatch.parse(input);
  const cur = db.prepare('SELECT * FROM secrets WHERE id = ?').get(id) as { title: string; truth: string; gm_note: string; mystery_id: number | null; about: string } | undefined;
  if (!cur) throw notFound('Secret');
  db.prepare(`UPDATE secrets SET title = ?, truth = ?, gm_note = ?, mystery_id = ?, about = ?, origin = CASE origin WHEN 'additions' THEN 'edited' ELSE origin END WHERE id = ?`).run(
    d.title ?? cur.title,
    d.truth ?? cur.truth,
    d.gm_note ?? cur.gm_note,
    d.mystery_id === undefined ? cur.mystery_id : d.mystery_id,
    d.about ? JSON.stringify(d.about) : cur.about,
    id,
  );
  return { ok: true };
}

const secretCreate = z.object({
  title: z.string().trim().min(1).max(300),
  truth: z.string().max(10000).default(''),
  mystery_id: z.number().int().nullable().default(null),
  source_id: z.string().max(40).nullable().default(null),
});
export function createSecret(db: DB, input: unknown) {
  const d = secretCreate.parse(input);
  const res = db
    .prepare(`INSERT INTO secrets (key, title, truth, mystery_id, source_id, about, origin) VALUES (?, ?, ?, ?, ?, ?, 'user')`)
    .run(`user:${Date.now()}:${Math.random().toString(36).slice(2)}`, d.title, d.truth, d.mystery_id, d.source_id, JSON.stringify(d.source_id ? [d.source_id] : []));
  return { id: Number(res.lastInsertRowid) };
}

const mysteryCreate = z.object({ title: z.string().trim().min(1).max(300), question: z.string().max(1000).default(''), summary: z.string().max(10000).default('') });
export function createMystery(db: DB, input: unknown) {
  const d = mysteryCreate.parse(input);
  const res = db
    .prepare(`INSERT INTO mysteries (key, title, question, summary, sort_order, origin) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM mysteries), 'user')`)
    .run(`user:${Date.now()}:${Math.random().toString(36).slice(2)}`, d.title, d.question, d.summary);
  return { id: Number(res.lastInsertRowid) };
}
export function updateMystery(db: DB, id: number, input: unknown) {
  const d = mysteryCreate.partial().parse(input);
  const cur = db.prepare('SELECT title, question, summary FROM mysteries WHERE id = ?').get(id) as { title: string; question: string; summary: string } | undefined;
  if (!cur) throw notFound('Mystery');
  db.prepare(`UPDATE mysteries SET title = ?, question = ?, summary = ?, origin = CASE origin WHEN 'additions' THEN 'edited' ELSE origin END WHERE id = ?`).run(d.title ?? cur.title, d.question ?? cur.question, d.summary ?? cur.summary, id);
  return { ok: true };
}

const clueCreate = z.object({
  secret_id: z.number().int(),
  kind: z.enum(CLUE_KINDS),
  note: z.string().max(2000).default(''),
  entity_id: z.string().max(40).nullable().default(null),
  rumour_ids: z.array(z.number().int()).max(20).default([]),
});
export function createClue(db: DB, input: unknown) {
  const d = clueCreate.parse(input);
  if (!db.prepare('SELECT 1 FROM secrets WHERE id = ?').get(d.secret_id)) throw notFound('Secret');
  if (d.kind === 'rumour' && !d.rumour_ids.length) throw badRequest('Choose the rumour this clue is');
  const res = db
    .prepare(`INSERT INTO clues (key, secret_id, kind, note, entity_id, rumour_ids, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, 999, 'user')`)
    .run(`user:${Date.now()}:${Math.random().toString(36).slice(2)}`, d.secret_id, d.kind, d.note, d.entity_id, JSON.stringify(d.rumour_ids));
  return { id: Number(res.lastInsertRowid) };
}
/** Drafted rows are hidden rather than deleted, so a later sync does not bring them back. */
export function deleteClue(db: DB, id: number) {
  db.prepare(`UPDATE clues SET origin = 'removed' WHERE id = ? AND origin IN ('additions','edited')`).run(id);
  db.prepare(`DELETE FROM clues WHERE id = ? AND origin = 'user'`).run(id);
  return { ok: true };
}
export function deleteSecret(db: DB, id: number) {
  db.prepare(`UPDATE secrets SET origin = 'removed' WHERE id = ? AND origin IN ('additions','edited')`).run(id);
  db.prepare(`DELETE FROM secrets WHERE id = ? AND origin = 'user'`).run(id);
  return { ok: true };
}

export function setSecretState(db: DB, id: number, campaignId: number, state: SecretState, note?: string) {
  if (!campaignId) throw badRequest('Choose a campaign first');
  if (!SECRET_STATES.includes(state)) throw badRequest('Unknown state');
  db.prepare(
    `INSERT INTO secret_progress (campaign_id, secret_id, state, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(campaign_id, secret_id) DO UPDATE SET state = excluded.state, note = COALESCE(?, secret_progress.note), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(campaignId, id, state, note ?? '', note ?? null);
  return { ok: true };
}

export function setClueFound(db: DB, id: number, campaignId: number, found: boolean) {
  if (!campaignId) throw badRequest('Choose a campaign first');
  if (found) {
    db.prepare('INSERT OR IGNORE INTO clue_found (campaign_id, clue_id) VALUES (?, ?)').run(campaignId, id);
    // A found clue makes its secret at least suspected.
    const s = db.prepare('SELECT secret_id FROM clues WHERE id = ?').get(id) as { secret_id: number } | undefined;
    if (s) db.prepare(`INSERT OR IGNORE INTO secret_progress (campaign_id, secret_id, state) VALUES (?, ?, 'suspected')`).run(campaignId, s.secret_id);
  } else db.prepare('DELETE FROM clue_found WHERE campaign_id = ? AND clue_id = ?').run(campaignId, id);
  return { ok: true };
}

// ------------------------------------------------------------------ sync from assets/lore/mysteries.json

interface ClueSpec {
  kind: ClueKind;
  match?: string;
  entity?: string | null;
  note?: string;
}
interface SecretSpec {
  key: string;
  title: string;
  truth: string;
  source: string;
  about: string[];
  clues: ClueSpec[];
}
interface MysterySpec {
  key: string;
  title: string;
  question: string;
  summary: string;
  secrets: SecretSpec[];
}

export const DEFAULT_MYSTERIES_FILE = process.env.WORLDKEEPER_ADDITIONS_DIR
  ? path.join(process.env.WORLDKEEPER_ADDITIONS_DIR, 'lore', 'mysteries.json')
  : path.resolve(import.meta.dirname, '../../../assets/lore/mysteries.json');

/**
 * Bring the drafted mysteries into the library. Text the GM has edited in the app is kept (only rows still
 * marked as coming from the additions are refreshed), and progress is never touched. Rumour clues are matched to
 * rumours by their text, so run the rumour sync first.
 */
export function syncMysteries(db: DB, file = DEFAULT_MYSTERIES_FILE) {
  if (!fs.existsSync(file)) return { mysteries: 0, secrets: 0, clues: 0, unmatched: [] as string[] };
  const { mysteries } = JSON.parse(fs.readFileSync(file, 'utf8')) as { mysteries: MysterySpec[] };
  const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
  const rumoursLike = db.prepare(`SELECT id FROM rumours WHERE stale = 0 AND lower(text) LIKE ? ORDER BY id`);
  const unmatched: string[] = [];
  let nS = 0;
  let nC = 0;
  db.transaction(() => {
    mysteries.forEach((m, mi) => {
      db.prepare(
        `INSERT INTO mysteries (key, title, question, summary, sort_order, origin) VALUES (?, ?, ?, ?, ?, 'additions')
         ON CONFLICT(key) DO UPDATE SET title = excluded.title, question = excluded.question, summary = excluded.summary, sort_order = excluded.sort_order
         WHERE mysteries.origin = 'additions'`,
      ).run(m.key, m.title, m.question, m.summary, mi);
      const mid = (db.prepare('SELECT id FROM mysteries WHERE key = ?').get(m.key) as { id: number }).id;
      m.secrets.forEach((s, si) => {
        const source = exists.get(s.source) ? s.source : null;
        db.prepare(
          `INSERT INTO secrets (key, mystery_id, title, truth, source_id, about, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, 'additions')
           ON CONFLICT(key) DO UPDATE SET mystery_id = excluded.mystery_id, title = excluded.title, truth = excluded.truth,
             source_id = excluded.source_id, about = excluded.about, sort_order = excluded.sort_order
           WHERE secrets.origin = 'additions'`,
        ).run(s.key, mid, s.title, s.truth, source, JSON.stringify([source, ...s.about].filter((x): x is string => !!x && !!exists.get(x))), si);
        const sid = (db.prepare('SELECT id FROM secrets WHERE key = ?').get(s.key) as { id: number }).id;
        nS++;
        s.clues.forEach((c, ci) => {
          let rumourIds: number[] = [];
          if (c.kind === 'rumour') {
            rumourIds = (rumoursLike.all(`%${(c.match ?? '').toLowerCase()}%`) as { id: number }[]).map((r) => r.id);
            if (!rumourIds.length) unmatched.push(`${s.key}: ${c.match}`);
          }
          const entity = c.entity && exists.get(c.entity) ? c.entity : null;
          db.prepare(
            `INSERT INTO clues (key, secret_id, kind, note, entity_id, rumour_ids, sort_order, origin) VALUES (?, ?, ?, ?, ?, ?, ?, 'additions')
             ON CONFLICT(key) DO UPDATE SET secret_id = excluded.secret_id, kind = excluded.kind, note = excluded.note,
               entity_id = excluded.entity_id, rumour_ids = excluded.rumour_ids, sort_order = excluded.sort_order
             WHERE clues.origin = 'additions'`,
          ).run(`${s.key}#${ci}`, sid, c.kind, c.note ?? '', entity, JSON.stringify(rumourIds), ci);
          nC++;
        });
      });
    });
  })();
  return { mysteries: mysteries.length, secrets: nS, clues: nC, unmatched };
}
