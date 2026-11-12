/**
 * Rumours: the "What people say" lines of the world, as records the GM can mark true, false or partly true, and
 * tick off as heard in each campaign. GM-only: nothing here is ever part of player data (players read rumours as
 * plain text on handbook pages, never their truth).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { collectRefs } from '../../../shared/mentions.js';
import { loadMentionIndex } from './mentions.js';
import { normName } from './nameMatch.js';
import { ENTITY_TYPE_LABELS, type EntityType } from '../../../shared/domain.js';

export const TRUTHS = ['true', 'false', 'partly', 'unknown'] as const;
export type Truth = (typeof TRUTHS)[number];

export interface Rumour {
  id: number;
  text: string;
  truth: Truth;
  gm_note: string;
  source_id: string | null;
  source_name: string | null;
  about: string[];
  origin: 'handbook' | 'user';
  stale: boolean;
  heard: boolean;
  heard_at: string | null;
}

interface Row {
  id: number;
  text: string;
  truth: Truth;
  gm_note: string;
  source_id: string | null;
  source_name: string | null;
  about: string;
  origin: 'handbook' | 'user';
  stale: number;
  heard_at: string | null;
}

const toRumour = (r: Row): Rumour => ({
  id: r.id,
  text: r.text,
  truth: r.truth,
  gm_note: r.gm_note,
  source_id: r.source_id,
  source_name: r.source_name,
  about: parseJson<string[]>(r.about, []),
  origin: r.origin,
  stale: !!r.stale,
  heard: !!r.heard_at,
  heard_at: r.heard_at,
});

export interface RumourFilter {
  campaignId?: number | null;
  entityId?: string;
  truth?: Truth;
  heard?: 'heard' | 'unheard';
  q?: string;
}

export function listRumours(db: DB, f: RumourFilter = {}): Rumour[] {
  const where: string[] = [];
  const args: (string | number)[] = [Number(f.campaignId ?? 0)];
  if (f.entityId) {
    where.push(`(r.source_id = ? OR EXISTS (SELECT 1 FROM json_each(r.about) WHERE json_each.value = ?))`);
    args.push(f.entityId, f.entityId);
  }
  if (f.truth) {
    where.push('r.truth = ?');
    args.push(f.truth);
  }
  if (f.heard === 'heard') where.push('h.heard_at IS NOT NULL');
  if (f.heard === 'unheard') where.push('h.heard_at IS NULL');
  if (f.q?.trim()) {
    where.push('(r.text LIKE ? OR r.gm_note LIKE ?)');
    args.push(`%${f.q.trim()}%`, `%${f.q.trim()}%`);
  }
  const rows = db
    .prepare(
      `SELECT r.*, e.name AS source_name, h.heard_at FROM rumours r
       LEFT JOIN entities e ON e.id = r.source_id
       LEFT JOIN rumour_heard h ON h.rumour_id = r.id AND h.campaign_id = ?
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY r.stale, e.name, r.id`,
    )
    .all(...args) as Row[];
  return rows.map(toRumour);
}

const createSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  truth: z.enum(TRUTHS).default('unknown'),
  gm_note: z.string().max(5000).default(''),
  source_id: z.string().max(40).nullable().optional(),
  about: z.array(z.string().max(40)).max(50).default([]),
});

export function createRumour(db: DB, input: unknown): Rumour {
  const d = createSchema.parse(input);
  const key = `user:${crypto.randomUUID()}`;
  const res = db
    .prepare(`INSERT INTO rumours (key, text, truth, gm_note, source_id, about, origin) VALUES (?, ?, ?, ?, ?, ?, 'user')`)
    .run(key, d.text, d.truth, d.gm_note, d.source_id ?? null, JSON.stringify(d.about));
  return getRumour(db, Number(res.lastInsertRowid));
}

export function getRumour(db: DB, id: number, campaignId = 0): Rumour {
  const r = db
    .prepare(
      `SELECT r.*, e.name AS source_name, h.heard_at FROM rumours r LEFT JOIN entities e ON e.id = r.source_id
       LEFT JOIN rumour_heard h ON h.rumour_id = r.id AND h.campaign_id = ? WHERE r.id = ?`,
    )
    .get(campaignId, id) as Row | undefined;
  if (!r) throw notFound('Rumour');
  return toRumour(r);
}

const patchSchema = z.object({
  truth: z.enum(TRUTHS).optional(),
  gm_note: z.string().max(5000).optional(),
  text: z.string().trim().min(1).max(2000).optional(),
  about: z.array(z.string().max(40)).max(50).optional(),
});

/** Truth and GM notes can be changed on any rumour; the text only on the GM's own (handbook text lives in the handbook). */
export function updateRumour(db: DB, id: number, input: unknown): Rumour {
  const d = patchSchema.parse(input);
  const cur = getRumour(db, id);
  if (d.text !== undefined && cur.origin !== 'user') throw badRequest('This rumour comes from the handbook text. Edit it there.');
  db.prepare(
    `UPDATE rumours SET truth = ?, gm_note = ?, text = ?, about = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(d.truth ?? cur.truth, d.gm_note ?? cur.gm_note, d.text ?? cur.text, JSON.stringify(d.about ?? cur.about), id);
  return getRumour(db, id);
}

export function deleteRumour(db: DB, id: number) {
  const cur = getRumour(db, id);
  if (cur.origin !== 'user' && !cur.stale) throw badRequest('This rumour comes from the handbook text. Remove it there.');
  db.prepare('DELETE FROM rumours WHERE id = ?').run(id);
}

export function setHeard(db: DB, id: number, campaignId: number, heard: boolean, note = '') {
  if (!campaignId) throw badRequest('Choose a campaign first');
  getRumour(db, id);
  if (heard) db.prepare(`INSERT OR IGNORE INTO rumour_heard (campaign_id, rumour_id, note) VALUES (?, ?, ?)`).run(campaignId, id, note);
  else db.prepare(`DELETE FROM rumour_heard WHERE campaign_id = ? AND rumour_id = ?`).run(campaignId, id);
  return getRumour(db, id, campaignId);
}

// ------------------------------------------------------------------ sync from handbook text

export const DEFAULT_PLAYER_TEXT_DIR = path.resolve(import.meta.dirname, '../../../assets/player-text');

export interface RumourSource {
  sourceId: string;
  text: string;
}

/**
 * Find every rumour in DM-written player text: the bullets under "What people say" in each "## Name" section.
 * A section heading is matched to its record the same way the handbook build does ("## Name" or "## Name (Type)").
 */
export function extractRumours(db: DB, markdown: string): RumourSource[] {
  const byName = db.prepare(`SELECT id, type FROM entities WHERE lower(name) = lower(?) AND type NOT IN ('index','register','redirect') AND archived = 0`);
  const find = (heading: string): string | null => {
    const exact = byName.all(heading) as { id: string; type: string }[];
    if (exact.length === 1) return exact[0].id;
    const m = /^(.*?)\s*\(([^)]+)\)$/.exec(heading);
    if (!m) return null;
    const kind = m[2].trim().toLowerCase();
    const hits = (byName.all(m[1]) as { id: string; type: string }[]).filter(
      (r) => r.type === kind || (ENTITY_TYPE_LABELS[r.type as EntityType] ?? '').toLowerCase() === kind,
    );
    return hits.length === 1 ? hits[0].id : null;
  };
  const out: RumourSource[] = [];
  for (const part of markdown.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    const sourceId = find(part.slice(0, nl).trim());
    if (!sourceId) continue;
    let inSay = false;
    for (const line of part.slice(nl + 1).split('\n')) {
      if (/^\*\*What people say\*\*/i.test(line.trim())) inSay = true;
      else if (/^\*\*[^*]+\*\*/.test(line.trim()) || /^#/.test(line)) inSay = false;
      else if (inSay) {
        const b = /^\s*[-*]\s+(.+)$/.exec(line);
        if (b) out.push({ sourceId, text: b[1].trim() });
      }
    }
  }
  return out;
}

/** Records a rumour is about: its page, the records it links with @[...], and records it names in plain text. */
function aboutIds(db: DB, sourceId: string, text: string, keys: [string, string][]): string[] {
  const ids = new Set<string>([sourceId]);
  for (const id of collectRefs(text, loadMentionIndexCached(db)).ids) ids.add(id);
  const plain = normName(text.replace(/@\[([^\]|]+)[^\]]*\]/g, '$1'));
  for (const [k, id] of keys) if (k.length >= 6 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(plain)) ids.add(id);
  return [...ids];
}

let mentionCache: { db: DB; index: ReturnType<typeof loadMentionIndex> } | null = null;
function loadMentionIndexCached(db: DB) {
  if (!mentionCache || mentionCache.db !== db) mentionCache = { db, index: loadMentionIndex(db) };
  return mentionCache.index;
}

/**
 * Bring the handbook's rumours into the library. Existing rumours keep their truth, notes and heard ticks. A
 * rumour that has gone from the text is kept, marked stale, if the GM has marked it or a campaign has heard it,
 * and removed otherwise.
 */
export function syncRumours(db: DB, files: { path: string; content: string }[]) {
  mentionCache = null;
  // Plain-name lookup: every record name (without "The") that points at exactly one record.
  const nameRows = db
    .prepare(`SELECT id, name FROM entities WHERE archived = 0 AND type NOT IN ('index','register','redirect')`)
    .all() as { id: string; name: string }[];
  const count = new Map<string, string[]>();
  for (const r of nameRows) {
    const k = normName(r.name.split(/[“"]/)[0]);
    count.set(k, [...(count.get(k) ?? []), r.id]);
  }
  const keys = [...count.entries()].filter(([, ids]) => ids.length === 1).map(([k, ids]) => [k, ids[0]] as [string, string]);

  const found = new Map<string, RumourSource>();
  for (const f of files) for (const r of extractRumours(db, f.content)) found.set(keyOf(r), r);

  const upsert = db.prepare(
    `INSERT INTO rumours (key, text, source_id, about, origin, stale) VALUES (?, ?, ?, ?, 'handbook', 0)
     ON CONFLICT(key) DO UPDATE SET text = excluded.text, source_id = excluded.source_id, about = excluded.about, stale = 0`,
  );
  let added = 0;
  const before = new Set((db.prepare(`SELECT key FROM rumours WHERE origin = 'handbook'`).all() as { key: string }[]).map((r) => r.key));
  db.transaction(() => {
    for (const [key, r] of found) {
      if (!before.has(key)) added++;
      upsert.run(key, r.text, r.sourceId, JSON.stringify(aboutIds(db, r.sourceId, r.text, keys)));
    }
    const gone = [...before].filter((k) => !found.has(k));
    for (const key of gone) {
      const row = db
        .prepare(`SELECT id, truth, gm_note, (SELECT COUNT(*) FROM rumour_heard WHERE rumour_id = rumours.id) AS heard FROM rumours WHERE key = ?`)
        .get(key) as { id: number; truth: string; gm_note: string; heard: number };
      if (row.truth !== 'unknown' || row.gm_note || row.heard) db.prepare(`UPDATE rumours SET stale = 1 WHERE id = ?`).run(row.id);
      else db.prepare(`DELETE FROM rumours WHERE id = ?`).run(row.id);
    }
  })();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM rumours WHERE origin = 'handbook' AND stale = 0`).get() as { n: number }).n;
  return { found: found.size, added, total };
}

const keyOf = (r: RumourSource) => `hb:${r.sourceId}:${crypto.createHash('sha1').update(r.text).digest('hex').slice(0, 16)}`;

/** Read the handbook text files (assets/player-text/*.md, drafts skipped). */
export function readPlayerText(dir = DEFAULT_PLAYER_TEXT_DIR): { path: string; content: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => ({ path: n, content: fs.readFileSync(path.join(dir, n), 'utf8') }));
}
