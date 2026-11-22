/**
 * Errata (packs/worldkeeper/lore/errata.json): corrections to wording in a library's records and adventures, applied by
 * "Apply additions" and the handbook build. Each names a record (by ID) or an adventure (by title, including the
 * copies in campaigns), the old wording and the new. The new wording replaces the old wherever it appears: a record's
 * text, its fields and its player text; an adventure's notes, scenes and read-aloud text. Wording that isn't there
 * (already corrected, or changed by the GM) is left alone, so applying them twice changes nothing. Record changes are
 * revisions, with the erratum's reason, and show in Canon Review.
 */
import fs from 'node:fs';
import type { DB } from './db/connection.js';
import { getEntity, updateEntity } from './repo/entities.js';
import { parseJson } from './lib/json.js';

export interface Erratum {
  /** A record's ID. */
  id?: string;
  /** An adventure's title (every adventure with that title, in any campaign). */
  adventure?: string;
  find: string;
  replace: string;
}

const swap = (text: string, e: Erratum) => (text.includes(e.find) ? text.split(e.find).join(e.replace) : text);

export function readErrata(file: string): { reason: string; errata: Erratum[] } {
  if (!fs.existsSync(file)) return { reason: '', errata: [] };
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { reason?: string; errata?: Erratum[] };
  return { reason: doc.reason ?? 'Errata', errata: doc.errata ?? [] };
}

/** Apply the errata. Returns how many records and adventures changed. */
export function applyErrata(db: DB, file: string): { records: number; adventures: number } {
  const { reason, errata } = readErrata(file);
  const byRecord = new Map<string, Erratum[]>();
  const byAdventure = new Map<string, Erratum[]>();
  for (const e of errata) {
    if (!e.find || e.find === e.replace) continue;
    if (e.id) byRecord.set(e.id, [...(byRecord.get(e.id) ?? []), e]);
    if (e.adventure) byAdventure.set(e.adventure, [...(byAdventure.get(e.adventure) ?? []), e]);
  }
  let records = 0;
  let adventures = 0;
  db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?');
    for (const [id, list] of byRecord) {
      if (!exists.get(id)) continue;
      const e = getEntity(db, id);
      let body = e.body;
      let summary = e.player_summary ?? '';
      let fields = e.fields;
      for (const x of list) {
        body = swap(body, x);
        summary = swap(summary, x);
        fields = fields.map(([k, v]) => [k, swap(v, x)] as [string, string]);
      }
      const patch: Record<string, unknown> = {};
      if (body !== e.body) patch.body = body;
      if (summary !== (e.player_summary ?? '')) patch.player_summary = summary;
      if (JSON.stringify(fields) !== JSON.stringify(e.fields)) patch.fields = fields;
      if (!Object.keys(patch).length) continue;
      updateEntity(db, id, { ...patch, reason });
      records++;
    }
    for (const [title, list] of byAdventure) {
      for (const a of db.prepare('SELECT id, data FROM adventures WHERE title = ? OR title = ?').all(title, `${title} (imported)`) as { id: number; data: string }[]) {
        let changed = false;
        const data = parseJson<Record<string, unknown>>(a.data, {});
        for (const [k, v] of Object.entries(data)) {
          if (typeof v !== 'string') continue;
          const next = list.reduce((t, x) => swap(t, x), v);
          if (next !== v) ((data[k] = next), (changed = true));
        }
        if (changed) db.prepare('UPDATE adventures SET data = ? WHERE id = ?').run(JSON.stringify(data), a.id);
        for (const s of db.prepare('SELECT id, body, read_aloud FROM scenes WHERE adventure_id = ?').all(a.id) as { id: number; body: string; read_aloud: string }[]) {
          const body = list.reduce((t, x) => swap(t, x), s.body);
          const read = list.reduce((t, x) => swap(t, x), s.read_aloud);
          if (body === s.body && read === s.read_aloud) continue;
          db.prepare('UPDATE scenes SET body = ?, read_aloud = ? WHERE id = ?').run(body, read, s.id);
          changed = true;
        }
        if (changed) adventures++;
      }
    }
  })();
  return { records, adventures };
}
