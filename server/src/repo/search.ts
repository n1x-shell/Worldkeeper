import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';

/**
 * Full-text search index (SQLite FTS5). Rows:
 *   kind 'entity'  ref = stable ID
 *   kind 'doc'     ref = source document path
 *   kind 'session' ref = session id, 'quest' ref = quest id, 'note' ref = note id, 'adventure' ref = adventure id
 */

export function reindexEntity(db: DB, id: string) {
  db.prepare(`DELETE FROM search_index WHERE kind = 'entity' AND ref = ?`).run(id);
  const e = db.prepare('SELECT id, name, aliases, tags, body, notes, fields, type FROM entities WHERE id = ?').get(id) as
    | { id: string; name: string; aliases: string; tags: string; body: string; notes: string; fields: string; type: string }
    | undefined;
  if (!e || e.type === 'redirect') return;
  const fields = parseJson<[string, string][]>(e.fields, [])
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  db.prepare('INSERT INTO search_index (ref, kind, title, aliases, tags, body) VALUES (?, ?, ?, ?, ?, ?)').run(
    e.id,
    'entity',
    e.name,
    `${e.id} ${parseJson<string[]>(e.aliases, []).join(' ; ')}`,
    parseJson<string[]>(e.tags, []).join(' '),
    `${fields}\n${e.body}\n${e.notes}`,
  );
}

export function indexAux(db: DB, kind: string, ref: string | number, title: string, body: string) {
  db.prepare('DELETE FROM search_index WHERE kind = ? AND ref = ?').run(kind, String(ref));
  db.prepare('INSERT INTO search_index (ref, kind, title, aliases, tags, body) VALUES (?, ?, ?, ?, ?, ?)').run(
    String(ref),
    kind,
    title,
    '',
    '',
    body,
  );
}

export function removeAux(db: DB, kind: string, ref: string | number) {
  db.prepare('DELETE FROM search_index WHERE kind = ? AND ref = ?').run(kind, String(ref));
}

export function reindexAll(db: DB) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM search_index').run();
    for (const { id } of db.prepare('SELECT id FROM entities').all() as { id: string }[]) reindexEntity(db, id);
    for (const d of db.prepare(`SELECT path, title, content, kind FROM source_documents`).all() as {
      path: string;
      title: string;
      content: string;
      kind: string;
    }[]) {
      db.prepare('INSERT INTO search_index (ref, kind, title, aliases, tags, body) VALUES (?, ?, ?, ?, ?, ?)').run(
        d.path,
        'doc',
        d.title,
        d.path,
        d.kind,
        d.content,
      );
    }
    for (const s of db.prepare('SELECT id, title, number, recap, prep FROM sessions').all() as {
      id: number;
      title: string;
      number: number;
      recap: string;
      prep: string;
    }[])
      indexAux(db, 'session', s.id, `Session ${s.number}: ${s.title}`, `${s.recap}\n${s.prep}`);
    for (const q of db.prepare('SELECT id, title, description, notes FROM quests').all() as {
      id: number;
      title: string;
      description: string;
      notes: string;
    }[])
      indexAux(db, 'quest', q.id, q.title, `${q.description}\n${q.notes}`);
    for (const n of db.prepare('SELECT id, title, body FROM notes').all() as { id: number; title: string; body: string }[])
      indexAux(db, 'note', n.id, n.title, n.body);
    for (const a of db.prepare('SELECT id, title, data FROM adventures').all() as { id: number; title: string; data: string }[])
      indexAux(db, 'adventure', a.id, a.title, a.data);
    for (const p of db.prepare('SELECT p.entity_id, p.campaign_id, p.data, e.name FROM profiles p JOIN entities e ON e.id = p.entity_id').all() as {
      entity_id: string;
      campaign_id: number;
      data: string;
      name: string;
    }[])
      indexAux(db, 'profile', `${p.entity_id}:${p.campaign_id}`, `${p.name} (profile)`, p.data);
  });
  tx();
}

/** Turn user text into a safe FTS5 query: every term is quoted and prefix-matched. */
export function toFtsQuery(q: string): string | null {
  const terms = q
    .replace(/["*^():]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!terms.length) return null;
  return terms.map((t) => `"${t}"*`).join(' AND ');
}

export interface SearchHit {
  kind: string;
  ref: string;
  title: string;
  snippet: string;
  type?: string;
  realm?: string;
  canon_status?: string;
  revealed?: boolean;
  score: number;
}

export interface SearchOptions {
  kinds?: string[];
  types?: string[];
  realms?: string[];
  canon?: string[];
  limit?: number;
}

export function search(db: DB, q: string, opts: SearchOptions = {}): SearchHit[] {
  const limit = Math.min(opts.limit ?? 50, 200);
  const results: SearchHit[] = [];
  // Exact stable-ID hit first.
  const idHit = db.prepare('SELECT id, name, type, realm, canon_status, revealed, redirect_to FROM entities WHERE upper(id) = upper(?)').get(q.trim()) as
    | { id: string; name: string; type: string; realm: string; canon_status: string; revealed: number; redirect_to: string | null }
    | undefined;
  if (idHit) {
    results.push({
      kind: 'entity',
      ref: idHit.redirect_to ?? idHit.id,
      title: idHit.redirect_to ? `${idHit.name} → ${idHit.redirect_to}` : idHit.name,
      snippet: `Stable ID ${idHit.id}`,
      type: idHit.type,
      realm: idHit.realm,
      canon_status: idHit.canon_status,
      revealed: !!idHit.revealed,
      score: -1000,
    });
  }
  const fts = toFtsQuery(q);
  if (!fts) return results;
  const rows = db
    .prepare(
      `SELECT s.ref, s.kind, s.title, snippet(search_index, 5, '[[', ']]', ' … ', 18) AS snip,
              bm25(search_index, 0, 0, 12.0, 6.0, 3.0, 1.0) AS score,
              e.type, e.realm, e.canon_status, e.revealed
       FROM search_index s LEFT JOIN entities e ON s.kind = 'entity' AND e.id = s.ref
       WHERE search_index MATCH ? ORDER BY score LIMIT ?`,
    )
    .all(fts, limit * 3) as {
    ref: string;
    kind: string;
    title: string;
    snip: string;
    score: number;
    type: string | null;
    realm: string | null;
    canon_status: string | null;
    revealed: number | null;
  }[];
  for (const r of rows) {
    if (opts.kinds?.length && !opts.kinds.includes(r.kind)) continue;
    if (r.kind === 'entity') {
      if (opts.types?.length && !opts.types.includes(r.type!)) continue;
      if (opts.realms?.length && !opts.realms.includes(r.realm!)) continue;
      if (opts.canon?.length && !opts.canon.includes(r.canon_status!)) continue;
    } else if (opts.types?.length || opts.realms?.length || opts.canon?.length) {
      continue;
    }
    if (idHit && r.kind === 'entity' && r.ref === (idHit.redirect_to ?? idHit.id)) continue;
    results.push({
      kind: r.kind,
      ref: r.ref,
      title: r.title,
      snippet: r.snip,
      type: r.type ?? undefined,
      realm: r.realm ?? undefined,
      canon_status: r.canon_status ?? undefined,
      revealed: r.revealed == null ? undefined : !!r.revealed,
      score: r.score,
    });
    if (results.length >= limit) break;
  }
  // Records first (they are the primary targets), then documents, sessions and notes; stable within each group.
  const rank = (h: SearchHit) => (h.score === -1000 ? -1 : h.kind === 'entity' ? 0 : h.kind === 'doc' ? 2 : 1);
  return results.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).map((x) => x.h);
}
