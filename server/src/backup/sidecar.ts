/**
 * What a Markdown export carries beside its records (docs/OWN_WORLD_PLAN.md §2.10, "Exports are complete"): the
 * library's realms as they are (kind, place, colour, icon, description), the GM's own and the archive's templates,
 * and each record's canon flags and reveal state. Written to `_worldkeeper/library.json` in the ZIP, and read back
 * when that ZIP is imported, so a Markdown export makes the same library again.
 */
import AdmZip from 'adm-zip';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { REALM_COLORS, REALM_ICONS, REALM_KINDS } from '../../../shared/realms.js';
import { createRealm, realmExists } from '../repo/realms.js';
import { createTemplate } from '../repo/templates.js';

export const SIDECAR_PATH = '_worldkeeper/library.json';

const sidecarSchema = z.object({
  app: z.literal('worldkeeper-library'),
  format: z.literal(1),
  realms: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().max(80),
        kind: z.enum(REALM_KINDS),
        parent_id: z.string().max(80).nullable(),
        color: z.enum(REALM_COLORS).catch('blue'),
        icon: z.enum(REALM_ICONS).catch('globe'),
        description: z.string().max(400).default(''),
      }),
    )
    .max(500)
    .default([]),
  templates: z
    .array(z.object({ id: z.string().max(120), origin: z.string().max(20), markdown: z.string().max(200_000) }))
    .max(500)
    .default([]),
  records: z
    .record(
      z.string().max(40),
      z.object({
        canon_flags: z.array(z.string().max(40)).max(20).optional(),
        revealed: z.boolean().optional(),
        revealed_sections: z.array(z.string().max(300)).max(200).optional(),
        revealed_facts: z.array(z.string().max(5000)).max(500).optional(),
        player_summary: z.string().max(100_000).optional(),
      }),
    )
    .default({}),
});
export type Sidecar = z.infer<typeof sidecarSchema>;

/** The sidecar for a library: its realms, the templates that aren't built in, and every record's canon and reveals. */
export function buildSidecar(db: DB): Sidecar {
  const realms = db.prepare('SELECT id, name, kind, parent_id, color, icon, description FROM realms ORDER BY sort_order, id').all() as Sidecar['realms'];
  const templates = (db.prepare(`SELECT id, origin, body FROM templates WHERE origin IN ('user', 'import')`).all() as { id: string; origin: string; body: string | null }[])
    .filter((t) => t.body)
    .map((t) => ({ id: t.id, origin: t.origin, markdown: t.body! }));
  const records: Sidecar['records'] = {};
  for (const r of db.prepare('SELECT id, canon_flags, revealed, revealed_sections, revealed_facts, player_summary FROM entities').all() as {
    id: string;
    canon_flags: string;
    revealed: number;
    revealed_sections: string;
    revealed_facts: string;
    player_summary: string | null;
  }[]) {
    const sections = parseJson<string[]>(r.revealed_sections, []);
    const facts = parseJson<string[]>(r.revealed_facts, []);
    records[r.id] = {
      canon_flags: parseJson<string[]>(r.canon_flags, []),
      ...(r.revealed ? { revealed: true } : {}),
      ...(sections.length ? { revealed_sections: sections } : {}),
      ...(facts.length ? { revealed_facts: facts } : {}),
      ...(r.player_summary ? { player_summary: r.player_summary } : {}),
    };
  }
  return { app: 'worldkeeper-library', format: 1, realms, templates, records };
}

/** The sidecar in an uploaded ZIP, if it has one (anything malformed is ignored, as if it weren't there). */
export function readSidecar(buffer: Buffer): Sidecar | null {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((e) => !e.isDirectory && e.entryName.replace(/\\/g, '/').endsWith(SIDECAR_PATH));
    if (!entry || entry.header.size > 50 * 1024 * 1024) return null;
    const parsed = sidecarSchema.safeParse(JSON.parse(entry.getData().toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Before the records go in: the realms they name, as they were (parents first); existing realms are left alone. */
export function applySidecarRealms(db: DB, s: Sidecar) {
  const pending = s.realms.filter((r) => !realmExists(db, r.id));
  for (let guard = 0; pending.length && guard < 20; guard++) {
    for (const r of [...pending]) {
      if (r.parent_id && !realmExists(db, r.parent_id)) continue;
      try {
        createRealm(db, { id: r.id, name: r.name, kind: r.kind, parent_id: r.parent_id, color: r.color, icon: r.icon, description: r.description });
      } catch {
        /* a realm that can't sit there is left for the importer to make from the records' names */
      }
      pending.splice(pending.indexOf(r), 1);
    }
  }
}

/** After the records go in: the GM's templates (as their own, if not already there) and each record's canon and reveals. */
export function applySidecarState(db: DB, s: Sidecar) {
  let templates = 0;
  for (const t of s.templates) {
    if (db.prepare('SELECT 1 FROM templates WHERE id = ? OR (origin = ? AND body = ?)').get(t.id, t.origin, t.markdown)) continue;
    try {
      createTemplate(db, { markdown: t.markdown });
      templates++;
    } catch {
      /* a template for a type this library doesn't have */
    }
  }
  const set = db.prepare(
    `UPDATE entities SET canon_flags = COALESCE(@canon_flags, canon_flags), revealed = COALESCE(@revealed, revealed),
       revealed_sections = COALESCE(@revealed_sections, revealed_sections), revealed_facts = COALESCE(@revealed_facts, revealed_facts),
       player_summary = COALESCE(@player_summary, player_summary) WHERE id = @id`,
  );
  let records = 0;
  for (const [id, r] of Object.entries(s.records)) {
    const changes = set.run({
      id,
      canon_flags: r.canon_flags ? JSON.stringify(r.canon_flags) : null,
      revealed: r.revealed == null ? null : r.revealed ? 1 : 0,
      revealed_sections: r.revealed_sections ? JSON.stringify(r.revealed_sections) : null,
      revealed_facts: r.revealed_facts ? JSON.stringify(r.revealed_facts) : null,
      player_summary: r.player_summary ?? null,
    }).changes;
    records += changes;
  }
  return { templates, records };
}
