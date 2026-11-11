import type { DB } from '../db/connection.js';
import { sha256 } from '../lib/hash.js';
import { now, parseJson } from '../lib/json.js';
import { parseMarkdownFile, parsePipeTable, splitSections, type ParsedFile } from './parseMarkdown.js';
import { blockToDraft, extractRefs, ID_RE_STRICT, isTemplatePlaceholder, type EntityDraft } from './normalize.js';
import type { SourceFile } from './scan.js';
import { contentHash, getEntity, rowToEntity, saveRevision, type EntityRow } from '../repo/entities.js';
import { rebuildDerivedRelationships } from '../repo/relationships.js';
import { loadMentionIndex } from '../repo/mentions.js';
import { reindexAll } from '../repo/search.js';
import { deriveTimelineEras, eraVocabularyFromText, seedEras } from '../repo/eras.js';

export type DocKind =
  | 'bible'
  | 'reference'
  | 'template'
  | 'worked_example'
  | 'guide'
  | 'manifest'
  | 'continuity'
  | 'index'
  | 'entry';

export function classifyFile(path: string, parsed: ParsedFile): DocKind {
  const p = path.toLowerCase();
  if (p.startsWith('references/')) return /setting_bible/.test(p) ? 'bible' : 'reference';
  if (p.includes('/templates/') || /(^|\/)template_[^/]+\.md$/.test(p)) return 'template';
  if (p.includes('/worked_examples/')) return 'worked_example';
  if (p === 'manifest.md') return 'manifest';
  if (p.startsWith('08_amsel_lore_foundation/')) return 'guide';
  const real = parsed.blocks.filter((b) => b.id && !isTemplatePlaceholder(b.id) && ID_RE_STRICT.test(b.id));
  if (!real.length) return p.startsWith('07_continuity/') ? 'continuity' : 'index';
  return 'entry';
}

export type EntityAction = 'create' | 'update' | 'unchanged' | 'conflict';

export interface PlannedEntity {
  draft: EntityDraft;
  hash: string;
  action: EntityAction;
  note?: string;
}

export interface ImportPlan {
  sourceName: string;
  generatedAt: string;
  files: { path: string; kind: DocKind; ids: string[] }[];
  entities: PlannedEntity[];
  skipped: { id: string; file: string; line: number; reason: string }[];
  duplicates: { id: string; candidates: string[]; chosen: string; reason: string }[];
  brokenRefs: { from: string; ref: string }[];
  protectedDocs: { path: string; note: string }[];
  missingFromSource: string[];
  templates: { id: string; name: string; fields: string[]; sections: string[] }[];
  timelineRows: number;
  counts: { byType: Record<string, number>; byRealm: Record<string, number>; byAction: Record<string, number> };
  warnings: string[];
}

interface Candidate {
  draft: EntityDraft;
  standalone: boolean;
  kind: DocKind;
}

/** Parse the Canonical Entry Locator (`| \`ID\` | Entry | \`file\` |`) if present. */
function readLocator(files: SourceFile[]): Map<string, string> {
  const map = new Map<string, string>();
  const loc = files.find((f) => /canonical_entry_locator/i.test(f.path));
  if (!loc) return map;
  for (const row of parsePipeTable(loc.content)) {
    if (row.length < 3) continue;
    const id = row[0].replace(/`/g, '').trim();
    const file = row[2].replace(/`/g, '').trim();
    if (ID_RE_STRICT.test(id)) map.set(id, file);
  }
  return map;
}

export function buildPlan(db: DB, files: SourceFile[], sourceName: string): ImportPlan {
  const plan: ImportPlan = {
    sourceName,
    generatedAt: now(),
    files: [],
    entities: [],
    skipped: [],
    duplicates: [],
    brokenRefs: [],
    protectedDocs: [],
    missingFromSource: [],
    templates: [],
    timelineRows: 0,
    counts: { byType: {}, byRealm: {}, byAction: {} },
    warnings: [],
  };
  const locator = readLocator(files);
  const candidates = new Map<string, Candidate[]>();

  for (const f of files) {
    const parsed = parseMarkdownFile(f.path, f.content);
    const kind = classifyFile(f.path, parsed);
    const ids = parsed.blocks.map((b) => b.id).filter((id) => ID_RE_STRICT.test(id));
    plan.files.push({ path: f.path, kind, ids });

    if (kind === 'template') {
      const block = parsed.blocks[0];
      plan.templates.push({
        id: f.path.split('/').pop()!.replace(/\.md$/i, ''),
        name: parsed.title?.replace(/^TEMPLATE:\s*/i, '') ?? f.path,
        fields: block ? block.meta.map(([k]) => k) : [],
        sections: splitSections(block?.body ?? f.content)
          .map((s) => s.heading)
          .filter(Boolean),
      });
      continue;
    }
    if (kind === 'worked_example') {
      for (const b of parsed.blocks) plan.skipped.push({ id: b.id, file: f.path, line: b.startLine, reason: 'Worked example (instructional copy, not a Lore entry)' });
      continue;
    }
    if (kind !== 'entry') continue;

    parsed.blocks.forEach((b, i) => {
      if (!ID_RE_STRICT.test(b.id)) {
        plan.skipped.push({ id: b.id || '(none)', file: f.path, line: b.startLine, reason: 'Block has no valid stable ID' });
        return;
      }
      const draft = blockToDraft(b, f.path);
      const list = candidates.get(b.id) ?? [];
      list.push({ draft, standalone: i === 0, kind });
      candidates.set(b.id, list);
    });
  }

  // Choose one authoritative block per ID.
  const chosen = new Map<string, EntityDraft>();
  for (const [id, list] of candidates) {
    if (list.length === 1) {
      chosen.set(id, list[0].draft);
      continue;
    }
    const locFile = locator.get(id);
    let pick = locFile ? list.find((c) => c.draft.source_file === locFile) : undefined;
    let reason = pick ? 'Canonical Entry Locator' : '';
    if (!pick) {
      const standalone = list.filter((c) => c.standalone);
      if (standalone.length === 1) {
        pick = standalone[0];
        reason = 'Standalone page preferred over compendium copy';
      } else {
        pick = standalone[0] ?? list[0];
        reason = 'Several standalone pages share this ID; first kept, review required';
        plan.warnings.push(`ID ${id} appears as a standalone page in ${standalone.length} files`);
      }
    }
    chosen.set(id, pick.draft);
    plan.duplicates.push({ id, candidates: list.map((c) => `${c.draft.source_file}:${c.draft.source_line}`), chosen: pick.draft.source_file, reason });
    for (const c of list) {
      if (c !== pick) {
        const same = contentHash(c.draft) === contentHash(pick.draft);
        plan.skipped.push({
          id,
          file: c.draft.source_file,
          line: c.draft.source_line,
          reason: `Embedded copy of ${id}; authoritative record is ${pick.draft.source_file}${same ? '' : ' (TEXT DIFFERS: review)'}`,
        });
        if (!same) plan.warnings.push(`Embedded copy of ${id} in ${c.draft.source_file} differs from the authoritative page`);
      }
    }
  }

  // Compare against the database.
  const getRow = db.prepare('SELECT * FROM entities WHERE id = ?');
  for (const draft of chosen.values()) {
    const hash = contentHash(draft);
    const row = getRow.get(draft.id) as EntityRow | undefined;
    let action: EntityAction;
    let note: string | undefined;
    if (!row) action = 'create';
    else if (row.origin !== 'import') {
      action = 'conflict';
      note = 'A record you created already uses this ID';
    } else if (row.source_hash === hash) action = 'unchanged';
    else {
      const current = rowToEntity(row);
      if (current.modified_since_import) {
        action = 'conflict';
        note = 'Source changed and you have also edited this record';
      } else action = 'update';
    }
    plan.entities.push({ draft, hash, action, note });
    plan.counts.byType[draft.type] = (plan.counts.byType[draft.type] ?? 0) + 1;
    plan.counts.byRealm[draft.realm] = (plan.counts.byRealm[draft.realm] ?? 0) + 1;
    plan.counts.byAction[action] = (plan.counts.byAction[action] ?? 0) + 1;
  }
  plan.entities.sort((a, b) => a.draft.id.localeCompare(b.draft.id));

  const knownIds = new Set([...chosen.keys(), ...(db.prepare('SELECT id FROM entities').all() as { id: string }[]).map((r) => r.id)]);
  for (const d of chosen.values()) {
    const refs = new Set([...extractRefs(d.parent_raw), ...d.fields.flatMap(([, v]) => extractRefs(v)), ...extractRefs(d.body)]);
    for (const r of refs) if (!knownIds.has(r)) plan.brokenRefs.push({ from: d.id, ref: r });
  }

  const imported = db.prepare(`SELECT id FROM entities WHERE origin = 'import'`).all() as { id: string }[];
  plan.missingFromSource = imported.map((r) => r.id).filter((id) => !chosen.has(id));

  const existingDoc = db.prepare('SELECT hash, immutable FROM source_documents WHERE path = ?');
  for (const f of files) {
    const prev = existingDoc.get(f.path) as { hash: string; immutable: number } | undefined;
    if (prev && prev.immutable && prev.hash !== sha256(f.content)) {
      plan.protectedDocs.push({ path: f.path, note: 'Protected source differs from stored copy; the stored copy is kept and the new text is stored as a separate dated version' });
    }
  }

  const timeline = files.find((f) => /04_World_Timeline\.md$/i.test(f.path));
  if (timeline) plan.timelineRows = parseTimeline(timeline.content).length;
  else plan.warnings.push('World Timeline (WLD-904) not found; the timeline view will be empty');
  return plan;
}

export function parseTimeline(content: string) {
  const sections = splitSections(parseMarkdownFile('timeline', content).blocks[0]?.body ?? content);
  const sec = sections.find((s) => /established chronology/i.test(s.heading));
  const rows = parsePipeTable(sec?.content ?? '');
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  if (!header.length || !header[0].includes('time')) return [];
  return rows.slice(1).map((r, i) => ({
    sort_order: i + 1,
    time_label: r[0] ?? '',
    event: r[1] ?? '',
    realm_label: r[2] ?? '',
    source: r[3] ?? '',
    access: r[4] ?? '',
    entity_ids: extractRefs(r.join(' ')),
  }));
}

export type ConflictResolution = 'keep-local' | 'take-source';

export interface CommitOptions {
  resolutions?: Record<string, ConflictResolution>;
  backupFile?: string | null;
}

export interface CommitResult {
  runId: number;
  created: number;
  updated: number;
  unchanged: number;
  conflictsKept: number;
  conflictsReplaced: number;
  documents: number;
  relationships: number;
  timelineRows: number;
  templates: number;
}

/**
 * Apply a plan inside ONE transaction. Any error rolls back everything; the run is logged as failed.
 * Never deletes records, never touches DM notes / reveal state, never overwrites protected source documents.
 */
export function commitPlan(db: DB, files: SourceFile[], plan: ImportPlan, opts: CommitOptions = {}): CommitResult {
  const run = db
    .prepare(`INSERT INTO import_runs (source_name, status, backup_file) VALUES (?, 'running', ?)`)
    .run(plan.sourceName, opts.backupFile ?? null);
  const runId = Number(run.lastInsertRowid);
  const result: CommitResult = {
    runId,
    created: 0,
    updated: 0,
    unchanged: 0,
    conflictsKept: 0,
    conflictsReplaced: 0,
    documents: 0,
    relationships: 0,
    timelineRows: 0,
    templates: 0,
  };
  const tx = db.transaction(() => {
    // 1. Source documents (full text, provenance). Protected documents are never overwritten.
    const kinds = new Map(plan.files.map((f) => [f.path, f.kind]));
    const getDoc = db.prepare('SELECT hash, immutable FROM source_documents WHERE path = ?');
    const insDoc = db.prepare(
      `INSERT INTO source_documents (path, title, kind, doc_id, content, hash, immutable) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const updDoc = db.prepare(`UPDATE source_documents SET title = ?, kind = ?, doc_id = ?, content = ?, hash = ?, imported_at = ? WHERE path = ?`);
    for (const f of files) {
      const kind = kinds.get(f.path) ?? 'index';
      const parsed = parseMarkdownFile(f.path, f.content);
      const title = parsed.title ?? f.path.split('/').pop()!;
      const docId = parsed.blocks[0] && ID_RE_STRICT.test(parsed.blocks[0].id) ? parsed.blocks[0].id : null;
      const hash = sha256(f.content);
      const immutable = kind === 'bible' || kind === 'reference' ? 1 : 0;
      const prev = getDoc.get(f.path) as { hash: string; immutable: number } | undefined;
      if (!prev) insDoc.run(f.path, title, kind, docId, f.content, hash, immutable);
      else if (prev.hash !== hash) {
        if (prev.immutable) {
          const versioned = `${f.path}@${now().slice(0, 10)}-${hash.slice(0, 8)}`;
          if (!getDoc.get(versioned)) insDoc.run(versioned, `${title} (newer copy)`, kind, docId, f.content, hash, 1);
        } else updDoc.run(title, kind, docId, f.content, hash, now(), f.path);
      }
      result.documents++;
    }

    // 2. Entities.
    const insert = db.prepare(
      `INSERT INTO entities (id, name, aliases, category_raw, type, parent_raw, parent_id, realm_raw, realm, realms, canon_raw,
        canon_status, canon_flags, source_raw, tags, fields, body, source_visibility, origin, source_file, source_hash,
        import_content_hash, redirect_to)
       VALUES (@id, @name, @aliases, @category_raw, @type, @parent_raw, @parent_id, @realm_raw, @realm, @realms, @canon_raw,
        @canon_status, @canon_flags, @source_raw, @tags, @fields, @body, @source_visibility, 'import', @source_file, @hash,
        @hash, @redirect_to)`,
    );
    const update = db.prepare(
      `UPDATE entities SET name=@name, aliases=@aliases, category_raw=@category_raw, type=@type, parent_raw=@parent_raw,
        parent_id=@parent_id, realm_raw=@realm_raw, realm=@realm, realms=@realms, canon_raw=@canon_raw, canon_status=@canon_status,
        canon_flags=@canon_flags, source_raw=@source_raw, tags=@tags, fields=@fields, body=@body,
        source_visibility=@source_visibility, origin='import', source_file=@source_file, source_hash=@hash,
        import_content_hash=@hash, redirect_to=@redirect_to, version = version + 1, updated_at=@ts
       WHERE id=@id`,
    );
    const touched: string[] = [];
    for (const p of plan.entities) {
      const d = p.draft;
      const params = {
        ...d,
        aliases: JSON.stringify(d.aliases),
        realms: JSON.stringify(d.realms),
        canon_flags: JSON.stringify(d.canon_flags),
        tags: JSON.stringify(d.tags),
        fields: JSON.stringify(d.fields),
        hash: p.hash,
        ts: now(),
      };
      if (p.action === 'unchanged') {
        result.unchanged++;
        continue;
      }
      if (p.action === 'create') {
        insert.run(params);
        saveRevision(db, getEntity(db, d.id), 'import', `Imported from ${d.source_file} (${plan.sourceName})`);
        result.created++;
        touched.push(d.id);
        continue;
      }
      const resolution: ConflictResolution = p.action === 'update' ? 'take-source' : (opts.resolutions?.[d.id] ?? 'keep-local');
      if (resolution === 'keep-local') {
        result.conflictsKept++;
        continue;
      }
      const before = getEntity(db, d.id);
      saveRevision(db, before, 'pre-import', `State before re-import from ${plan.sourceName}`);
      update.run(params);
      saveRevision(db, getEntity(db, d.id), 'import', `Updated from ${d.source_file} (${plan.sourceName})`);
      if (p.action === 'update') result.updated++;
      else result.conflictsReplaced++;
      touched.push(d.id);
    }

    // 3. Derived relationships for every imported record (refs may now resolve to newly created records).
    const importedIds = (db.prepare(`SELECT id FROM entities WHERE origin = 'import'`).all() as { id: string }[]).map((r) => r.id);
    const mentionIndex = loadMentionIndex(db);
    for (const id of importedIds) rebuildDerivedRelationships(db, id, mentionIndex);
    result.relationships = (db.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number }).n;

    // 4. Timeline index rows (imported rows only; DM-added rows are kept).
    const timeline = files.find((f) => /04_World_Timeline\.md$/i.test(f.path));
    if (timeline) {
      // Keep the DM's hand-assigned eras across re-imports.
      const kept = new Map(
        (db.prepare(`SELECT time_label, event, era FROM timeline_rows WHERE origin = 'import' AND era_origin = 'user'`).all() as { time_label: string; event: string; era: string | null }[]).map(
          (r) => [`${r.time_label}\u0000${r.event}`, r.era],
        ),
      );
      db.prepare(`DELETE FROM timeline_rows WHERE origin = 'import'`).run();
      const ins = db.prepare(
        `INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, source, access, entity_ids, origin, era, era_origin) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)`,
      );
      for (const r of parseTimeline(timeline.content)) {
        const key = `${r.time_label}\u0000${r.event}`;
        const userEra = kept.has(key) ? kept.get(key)! : undefined;
        ins.run(r.sort_order, r.time_label, r.event, r.realm_label, r.source, r.access, JSON.stringify(r.entity_ids), userEra ?? null, userEra !== undefined ? 'user' : null);
        result.timelineRows++;
      }
    }

    // 4b. Eras: vocabulary from the library's own tag documentation and era tags; then derive row eras.
    const vocab = files.map((f) => eraVocabularyFromText(f.content)).find((v) => v.length) ?? [];
    seedEras(db, vocab);
    deriveTimelineEras(db);

    // 5. Templates.
    const insT = db.prepare(
      `INSERT INTO templates (id, name, type, fields, sections, origin) VALUES (?, ?, ?, ?, ?, 'import')
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, fields = excluded.fields, sections = excluded.sections WHERE templates.origin = 'import'`,
    );
    for (const t of plan.templates) {
      insT.run(t.id, t.name, templateType(t.id), JSON.stringify(t.fields), JSON.stringify(t.sections));
      result.templates++;
    }

    // 6. Settings defaults that come from the source (only if never set by the DM).
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('world_date', '300 AB / Year 31 Unbound')`).run();

    reindexAll(db);
    void touched;
  });
  try {
    tx();
    db.prepare(`UPDATE import_runs SET status = 'completed', finished_at = ?, report = ? WHERE id = ?`).run(
      now(),
      JSON.stringify({ result, plan: summarisePlan(plan) }),
      runId,
    );
    return result;
  } catch (err) {
    db.prepare(`UPDATE import_runs SET status = 'failed', finished_at = ?, report = ? WHERE id = ?`).run(
      now(),
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      runId,
    );
    throw err;
  }
}

function templateType(id: string): string {
  const t = id.replace(/^TEMPLATE_/i, '').toLowerCase();
  const map: Record<string, string> = {
    adventure_location: 'adventure_location',
    artifact_shard_relic: 'artifact',
    building: 'building',
    continent: 'continent',
    cult: 'cult',
    culture_or_people: 'people',
    ethereal_domain: 'ethereal_domain',
    faction: 'faction',
    historical_event: 'event',
    landmark: 'landmark',
    magic_system: 'magic_system',
    npc: 'npc',
    region: 'region',
    religion_or_deity: 'deity',
    settlement: 'settlement',
    vault: 'vault',
    world: 'world',
  };
  return map[t] ?? 'custom';
}

export function summarisePlan(plan: ImportPlan) {
  return {
    sourceName: plan.sourceName,
    generatedAt: plan.generatedAt,
    fileCount: plan.files.length,
    filesByKind: plan.files.reduce<Record<string, number>>((acc, f) => ((acc[f.kind] = (acc[f.kind] ?? 0) + 1), acc), {}),
    entityCount: plan.entities.length,
    counts: plan.counts,
    skipped: plan.skipped,
    duplicates: plan.duplicates,
    brokenRefs: plan.brokenRefs,
    protectedDocs: plan.protectedDocs,
    missingFromSource: plan.missingFromSource,
    conflicts: plan.entities.filter((e) => e.action === 'conflict').map((e) => ({ id: e.draft.id, name: e.draft.name, note: e.note })),
    updates: plan.entities.filter((e) => e.action === 'update').map((e) => ({ id: e.draft.id, name: e.draft.name })),
    templates: plan.templates.length,
    timelineRows: plan.timelineRows,
    warnings: plan.warnings,
  };
}

export function listImportRuns(db: DB) {
  return (db.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 50').all() as { report: string }[]).map((r) => ({
    ...r,
    report: parseJson(r.report, {}),
  }));
}
