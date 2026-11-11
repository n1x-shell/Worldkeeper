import type { DB } from '../db/connection.js';
import { rowToEntity, type EntityRow, getEntity, revertToRevision, acceptAsBaseline } from './entities.js';
import { brokenReferences } from './relationships.js';
import { listProposals } from './campaigns.js';
import { parseJson } from '../lib/json.js';
import { badRequest } from '../lib/errors.js';

/** Everything the Canon Review screen needs, computed from stored data. */
export function canonReview(db: DB) {
  const rows = db.prepare(`SELECT * FROM entities WHERE type != 'redirect'`).all() as EntityRow[];
  const entities = rows.map(rowToEntity);
  const modified = entities
    .filter((e) => e.modified_since_import)
    .map((e) => ({ id: e.id, name: e.name, type: e.type, canon_status: e.canon_status, updated_at: e.updated_at, version: e.version }));
  const proposed = entities.filter((e) => e.canon_status === 'PROPOSED' && !e.archived).map((e) => ({ id: e.id, name: e.name, type: e.type, origin: e.origin }));
  const conflicts = entities
    .filter((e) => e.canon_status === 'CONFLICT' || e.canon_flags.includes('CONFLICT'))
    .map((e) => ({ id: e.id, name: e.name, type: e.type }));
  const missingSources = entities
    .filter((e) => !e.source_raw || /^\s*(undefined|none)?\s*$/i.test(e.source_raw))
    .map((e) => ({ id: e.id, name: e.name, origin: e.origin }));

  // Possible duplicates: identical normalised names across different IDs (dual-role entries are flagged, not merged).
  const byName = new Map<string, { id: string; name: string; type: string }[]>();
  for (const e of entities) {
    const k = e.name.toLowerCase().replace(/^the\s+/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
    const list = byName.get(k) ?? [];
    list.push({ id: e.id, name: e.name, type: e.type });
    byName.set(k, list);
  }
  const duplicates = [...byName.values()].filter((l) => l.length > 1);
  const dualRoles = new Set(
    (db.prepare(`SELECT source_id, target_id FROM relationships WHERE type = 'same_as'`).all() as { source_id: string; target_id: string }[]).flatMap((r) => [
      r.source_id,
      r.target_id,
    ]),
  );

  const lastRun = db.prepare(`SELECT report FROM import_runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`).get() as { report: string } | undefined;
  const importReport = lastRun ? parseJson<{ plan?: { duplicates?: unknown[]; skipped?: unknown[]; warnings?: string[] } }>(lastRun.report, {}).plan : undefined;

  return {
    modified,
    proposed,
    conflicts,
    missingSources,
    duplicates: duplicates.map((l) => ({ records: l, acknowledgedDualRole: l.every((r) => dualRoles.has(r.id)) })),
    broken: brokenReferences(db),
    proposals: listProposals(db, 'pending').concat(listProposals(db, 'revise')),
    importDuplicates: importReport?.duplicates ?? [],
    importSkipped: importReport?.skipped ?? [],
    importWarnings: importReport?.warnings ?? [],
  };
}

/** Diff an imported record against its last reviewed (import/approved) revision. */
export function baselineFor(db: DB, id: string) {
  const rev = db
    .prepare(`SELECT * FROM entity_revisions WHERE entity_id = ? AND change_type IN ('import','approved') ORDER BY id DESC LIMIT 1`)
    .get(id) as { id: number; snapshot: string; created_at: string; change_type: string } | undefined;
  if (!rev) return null;
  return { revisionId: rev.id, created_at: rev.created_at, change_type: rev.change_type, snapshot: parseJson(rev.snapshot, {}) };
}

export function reviewDecision(db: DB, id: string, decision: 'approve' | 'revert', note: string) {
  const e = getEntity(db, id);
  if (!e.modified_since_import) throw badRequest('This record has no unreviewed changes');
  if (decision === 'approve') {
    acceptAsBaseline(db, id, note);
    return getEntity(db, id);
  }
  const base = baselineFor(db, id);
  if (!base) throw badRequest('No reviewed baseline to revert to');
  const reverted = revertToRevision(db, id, base.revisionId, note || 'Reverted to reviewed canon in Canon Review');
  return reverted;
}
