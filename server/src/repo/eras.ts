import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * Historical eras. The vocabulary comes from the source library itself (the `era/` tag row of the
 * implementation guide, plus any `era/*` tags on records). Timeline rows get an era from the era tags of
 * the records they link to; the DM can assign or override any row. Nothing is dated or invented.
 */

export interface Era {
  key: string;
  name: string;
  sort_order: number;
  description: string;
  origin: string;
}

const ERA_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MINOR_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'by']);
/** `before-the-cycle` → `Before the Cycle` (display name only; the DM can rename it). */
export const humanizeEra = (key: string) =>
  key
    .split('-')
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Find the `| era/ | a, b, c |` vocabulary row in the library's tag documentation. */
export function eraVocabularyFromText(text: string): string[] {
  const m = /^\|\s*era\/\s*\|\s*([^|]+)\|/m.exec(text);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ERA_KEY.test(s));
}

export function listEras(db: DB): Era[] {
  return db.prepare('SELECT * FROM eras ORDER BY sort_order, name').all() as Era[];
}

/** Seed eras from the source vocabulary + era tags in use. Existing eras (and DM renames) are kept. */
export function seedEras(db: DB, vocabulary: string[]) {
  const tagged = new Set<string>();
  for (const r of db.prepare(`SELECT tags FROM entities WHERE tags LIKE '%"era/%'`).all() as { tags: string }[]) {
    for (const t of parseJson<string[]>(r.tags, [])) if (t.startsWith('era/') && ERA_KEY.test(t.slice(4))) tagged.add(t.slice(4));
  }
  const ordered = [...vocabulary, ...[...tagged].filter((t) => !vocabulary.includes(t)).sort()];
  const max = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM eras').get() as { m: number }).m;
  const ins = db.prepare(`INSERT OR IGNORE INTO eras (key, name, sort_order, origin) VALUES (?, ?, ?, 'import')`);
  ordered.forEach((k, i) => ins.run(k, humanizeEra(k), max + 1 + i));
}

/** Era of a record = its first `era/*` tag that is a known era. */
export function entityEra(tags: string[], known: Set<string>): string | null {
  for (const t of tags) if (t.startsWith('era/') && known.has(t.slice(4))) return t.slice(4);
  return null;
}

/** Assign eras to timeline rows from their linked records. Rows the DM assigned by hand are not touched. */
export function deriveTimelineEras(db: DB) {
  const known = new Set(listEras(db).map((e) => e.key));
  const tagsOf = db.prepare('SELECT tags, type FROM entities WHERE id = ?');
  const rows = db.prepare(`SELECT id, entity_ids FROM timeline_rows WHERE era_origin IS NULL OR era_origin != 'user'`).all() as { id: number; entity_ids: string }[];
  const upd = db.prepare(`UPDATE timeline_rows SET era = ?, era_origin = ? WHERE id = ?`);
  for (const r of rows) {
    let era: string | null = null;
    // Prefer history records, then any linked record.
    const linked = parseJson<string[]>(r.entity_ids, [])
      .map((id) => tagsOf.get(id) as { tags: string; type: string } | undefined)
      .filter((x): x is { tags: string; type: string } => !!x)
      .sort((a, b) => Number(b.type === 'event') - Number(a.type === 'event'));
    for (const l of linked) {
      era = entityEra(parseJson<string[]>(l.tags, []), known);
      if (era) break;
    }
    upd.run(era, era ? 'derived' : null, r.id);
  }
}

export const eraInputSchema = z.object({
  key: z.string().regex(ERA_KEY, 'Use lowercase words separated by hyphens').max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  sort_order: z.number().int().optional(),
});

export function createEra(db: DB, input: unknown): Era {
  const d = eraInputSchema.parse(input);
  if (db.prepare('SELECT 1 FROM eras WHERE key = ?').get(d.key)) throw badRequest(`Era ${d.key} already exists`);
  const max = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM eras').get() as { m: number }).m;
  db.prepare(`INSERT INTO eras (key, name, sort_order, description, origin) VALUES (?, ?, ?, ?, 'user')`).run(d.key, d.name, d.sort_order ?? max + 1, d.description);
  return db.prepare('SELECT * FROM eras WHERE key = ?').get(d.key) as Era;
}

export function updateEra(db: DB, key: string, input: unknown): Era {
  if (!db.prepare('SELECT 1 FROM eras WHERE key = ?').get(key)) throw notFound('Era');
  const d = eraInputSchema.omit({ key: true }).partial().parse(input);
  if (d.name !== undefined) db.prepare('UPDATE eras SET name = ? WHERE key = ?').run(d.name, key);
  if (d.description !== undefined) db.prepare('UPDATE eras SET description = ? WHERE key = ?').run(d.description, key);
  if (d.sort_order !== undefined) db.prepare('UPDATE eras SET sort_order = ? WHERE key = ?').run(d.sort_order, key);
  return db.prepare('SELECT * FROM eras WHERE key = ?').get(key) as Era;
}

/** DM assigns (or clears) a timeline row's era. `null` clears it; `'auto'` returns to the derived era. */
export function setRowEra(db: DB, rowId: number, era: string | null | 'auto') {
  if (!db.prepare('SELECT 1 FROM timeline_rows WHERE id = ?').get(rowId)) throw notFound('Timeline row');
  if (era === 'auto') {
    db.prepare(`UPDATE timeline_rows SET era_origin = NULL WHERE id = ?`).run(rowId);
    deriveTimelineEras(db);
    return;
  }
  if (era !== null && !db.prepare('SELECT 1 FROM eras WHERE key = ?').get(era)) throw badRequest(`Unknown era ${era}`);
  db.prepare(`UPDATE timeline_rows SET era = ?, era_origin = 'user' WHERE id = ?`).run(era, rowId);
}

/** Backfill for libraries imported before eras existed: seed from stored source documents. Idempotent. */
export function ensureEras(db: DB) {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM eras').get() as { n: number }).n;
  if (n > 0) return;
  const hasData = (db.prepare('SELECT COUNT(*) AS n FROM entities').get() as { n: number }).n > 0;
  if (!hasData) return;
  const doc = db.prepare(`SELECT content FROM source_documents WHERE content LIKE '%| era/%' LIMIT 1`).get() as { content: string } | undefined;
  const tx = db.transaction(() => {
    seedEras(db, doc ? eraVocabularyFromText(doc.content) : []);
    deriveTimelineEras(db);
  });
  tx();
}
