import type { DB } from '../db/connection.js';
import { keepTimelineReveals } from '../repo/timeline.js';
import { sha256 } from '../lib/hash.js';
import { now, parseJson } from '../lib/json.js';
import { parseMarkdownFile, parsePipeTable, splitSections, type ParsedFile } from './parseMarkdown.js';
import { blockToDraft, extractRefs, ID_RE_STRICT, isTemplatePlaceholder, normalizeRealm, type EntityDraft, type KnownRealm } from './normalize.js';
import { availablePacks, findPack, installPack, installedManifests } from '../packs/registry.js';
import type { ImportProfile, PackManifest } from '../../../shared/packs.js';
import { ensureRealm, listRealms, realmExists } from '../repo/realms.js';
import type { SourceFile } from './scan.js';
import { contentHash, getEntity, rowToEntity, saveRevision, type EntityRow } from '../repo/entities.js';
import { rebuildDerivedRelationships } from '../repo/relationships.js';
import { loadNameIndex } from '../repo/nameMatch.js';
import { loadMentionIndex } from '../repo/mentions.js';
import { reindexAll } from '../repo/search.js';
import { deriveTimelineEras, eraVocabularyFromText, seedEras } from '../repo/eras.js';
import { types } from '../repo/recordTypes.js';

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

/**
 * What kind of file this is. A pack's archive has its own layout (its import profile: references, worked examples,
 * guides...); any archive's templates folder holds templates, a file with no records is an index, and the rest are
 * records.
 */
export function classifyFile(path: string, parsed: ParsedFile, profile?: ImportProfile): DocKind {
  const p = path.toLowerCase();
  const real = parsed.blocks.filter((b) => b.id && !isTemplatePlaceholder(b.id) && ID_RE_STRICT.test(b.id));
  if (!p.startsWith('references/') && (p.includes('/templates/') || /(^|\/)template_[^/]+\.md$/.test(p))) return 'template';
  for (const rule of profile?.files ?? []) {
    if (!new RegExp(rule.pattern).test(p)) continue;
    if (rule.onlyWithoutRecords && real.length) continue;
    return rule.kind as DocKind;
  }
  if (p.includes('/templates/') || /(^|\/)template_[^/]+\.md$/.test(p)) return 'template';
  if (!real.length) return 'index';
  return 'entry';
}

/** The pack an import belongs to: one whose archive these files look like (its import profile's detect patterns). */
export function packForFiles(files: SourceFile[]): PackManifest | null {
  const paths = files.map((f) => f.path.toLowerCase());
  for (const { manifest } of availablePacks()) {
    const detect = manifest.importProfile?.detect ?? [];
    if (detect.some((d) => paths.some((p) => new RegExp(d).test(p)))) return manifest;
  }
  return null;
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
  /** The setting pack this import belongs to (its archive, or its own content), if any. */
  packId: string | null;
  counts: { byType: Record<string, number>; byRealm: Record<string, number>; byAction: Record<string, number> };
  warnings: string[];
}

interface Candidate {
  draft: EntityDraft;
  standalone: boolean;
  kind: DocKind;
}

/** Parse the Canonical Entry Locator (`| \`ID\` | Entry | \`file\` |`) if present. */
function readLocator(files: SourceFile[], profile?: ImportProfile): Map<string, string> {
  const map = new Map<string, string>();
  if (!profile?.locator) return map;
  const loc = files.find((f) => new RegExp(profile.locator!, 'i').test(f.path));
  if (!loc) return map;
  for (const row of parsePipeTable(loc.content)) {
    if (row.length < 3) continue;
    const id = row[0].replace(/`/g, '').trim();
    const file = row[2].replace(/`/g, '').trim();
    if (ID_RE_STRICT.test(id)) map.set(id, file);
  }
  return map;
}

export function buildPlan(db: DB, files: SourceFile[], sourceName: string, opts: { packId?: string } = {}): ImportPlan {
  const reg = types(db);
  // A pack's archive (or its own content) is read through its import profile, with its realms known even before it
  // is installed; anything else through the library's types and realms alone.
  const pack = opts.packId ? (findPack(opts.packId)?.manifest ?? null) : packForFiles(files);
  const profile = pack?.importProfile;
  const knownRealms: KnownRealm[] = listRealms(db, { includeArchived: true }).map((r) => ({ id: r.id, name: r.name, kind: r.kind, parent_id: r.parent_id }));
  for (const r of pack?.realms ?? []) if (!knownRealms.some((k) => k.id === r.id)) knownRealms.push({ id: r.id, name: r.name, kind: r.kind, parent_id: r.parent_id });
  const plan: ImportPlan = {
    sourceName,
    packId: pack?.id ?? null,
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
  const locator = readLocator(files, profile);
  const candidates = new Map<string, Candidate[]>();

  for (const f of files) {
    const parsed = parseMarkdownFile(f.path, f.content);
    const kind = classifyFile(f.path, parsed, profile);
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
      const draft = blockToDraft(b, f.path, knownRealms, reg, profile);
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

  const timeline = profile?.timelineFile ? files.find((f) => new RegExp(profile.timelineFile!, 'i').test(f.path)) : undefined;
  if (timeline) plan.timelineRows = parseTimeline(timeline.content).length;
  else if (profile?.timelineFile && !opts.packId) plan.warnings.push('The archive has no World Timeline; the timeline view will be empty');
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
  // A pack's archive or content: the pack's realms, types and templates come first, so its records have them.
  const pack = plan.packId ? installPack(db, plan.packId) : null;
  const profile = pack?.importProfile;
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
    // A realm and every realm that holds it (a domain, its parent domain, its realm).
    const parentOf = db.prepare('SELECT parent_id FROM realms WHERE id = ?');
    const realmChain = (id: string) => {
      const out = [id];
      for (let p = (parentOf.get(id) as { parent_id: string | null } | undefined)?.parent_id; p && out.length < 10; p = (parentOf.get(p) as { parent_id: string | null } | undefined)?.parent_id) out.push(p);
      return out;
    };
    // The realms these records name: the setting's own, or new ones this archive brings.
    const palette = ['teal', 'rose', 'red', 'slate', 'amber', 'green', 'violet', 'blue'] as const;
    let nextColor = (db.prepare('SELECT COUNT(*) n FROM realms').get() as { n: number }).n;
    const realmFor = (id: string, created?: { id: string; name: string }) => {
      if (realmExists(db, id)) return id;
      if (created && created.id === id) return ensureRealm(db, id, { name: created.name, kind: 'continent', parent_id: 'world', color: palette[nextColor++ % palette.length], icon: 'compass' });
      return 'world';
    };
    for (const p of plan.entities) {
      const d = p.draft;
      // A pack's domain record, or a record that sits in one (its landmarks), belongs to that domain.
      const domains = profile?.domainRecords ?? {};
      const inDomain = domains[d.id] ?? (d.parent_id ? domains[d.parent_id] : undefined);
      if (inDomain && realmExists(db, inDomain) && d.realm !== inDomain && realmChain(inDomain).includes(d.realm)) {
        d.realm = inDomain;
        d.realms = [inDomain, ...d.realms.filter((x) => x !== inDomain)];
      }
      d.realm = realmFor(d.realm, d.newRealm);
      d.realms = [...new Set(d.realms.map((x) => realmFor(x, d.newRealm)))];
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
    // A pack's records are marked as the pack's (a record of the GM's own with the same ID keeps its own mark).
    if (pack) {
      const mark = db.prepare(`UPDATE entities SET pack_id = ? WHERE id = ? AND origin = 'import'`);
      for (const p of plan.entities) mark.run(pack.id, p.draft.id);
    }
    const importedIds = (db.prepare(`SELECT id FROM entities WHERE origin = 'import'`).all() as { id: string }[]).map((r) => r.id);
    const mentionIndex = loadMentionIndex(db);
    const nameIndex = loadNameIndex(db);
    for (const id of importedIds) rebuildDerivedRelationships(db, id, mentionIndex, nameIndex);
    if (pack) db.prepare(`UPDATE relationships SET pack_id = ? WHERE origin <> 'user' AND source_id IN (SELECT id FROM entities WHERE pack_id = ?)`).run(pack.id, pack.id);
    result.relationships = (db.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number }).n;

    // 4. Timeline index rows (imported rows only; DM-added rows are kept).
    const timeline = profile?.timelineFile ? files.find((f) => new RegExp(profile.timelineFile!, 'i').test(f.path)) : undefined;
    if (timeline) {
      // Keep the DM's hand-assigned eras across re-imports.
      const kept = new Map(
        (db.prepare(`SELECT time_label, event, era FROM timeline_rows WHERE origin = 'import' AND era_origin = 'user'`).all() as { time_label: string; event: string; era: string | null }[]).map(
          (r) => [`${r.time_label}\u0000${r.event}`, r.era],
        ),
      );
      // And what players were shown of them (repo/timeline.ts).
      const restoreReveals = keepTimelineReveals(db);
      db.prepare(`DELETE FROM timeline_rows WHERE origin = 'import'`).run();
      const ins = db.prepare(
        `INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, realm_ids, source, access, entity_ids, origin, era, era_origin, pack_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?, ?)`,
      );
      for (const r of parseTimeline(timeline.content)) {
        const key = `${r.time_label}\u0000${r.event}`;
        const userEra = kept.has(key) ? kept.get(key)! : undefined;
        ins.run(r.sort_order, r.time_label, r.event, r.realm_label, JSON.stringify(timelineRealms(db, r.realm_label)), r.source, r.access, JSON.stringify(r.entity_ids), userEra ?? null, userEra !== undefined ? 'user' : null, pack?.id ?? null);
        result.timelineRows++;
      }
      restoreReveals();
    }

    // 4b. Eras: vocabulary from the library's own tag documentation and era tags; then derive row eras.
    const vocab = files.map((f) => eraVocabularyFromText(f.content)).find((v) => v.length) ?? [];
    seedEras(db, vocab);
    deriveTimelineEras(db);

    // 5. Templates.
    const insT = db.prepare(
      `INSERT INTO templates (id, name, type, fields, sections, origin, pack_id) VALUES (?, ?, ?, ?, ?, 'import', ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, fields = excluded.fields, sections = excluded.sections, pack_id = excluded.pack_id WHERE templates.origin = 'import'`,
    );
    for (const t of plan.templates) {
      insT.run(t.id, t.name, templateType(t.id), JSON.stringify(t.fields), JSON.stringify(t.sections), pack?.id ?? null);
      result.templates++;
    }

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

/** A timeline row's realms from its free-text realm column ("Aetheris", "Both", "World"…), among the library's realms. */
export function timelineRealms(db: DB, label: string): string[] {
  const known = listRealms(db, { includeArchived: true });
  const l = label.toLowerCase();
  if (/\bboth\b/.test(l)) return known.filter((r) => r.kind === 'continent').map((r) => r.id);
  const profile = installedManifests(db).find((m) => m.importProfile)?.importProfile;
  const { realms } = normalizeRealm(label, known.map((r) => ({ id: r.id, name: r.name, kind: r.kind, parent_id: r.parent_id })), profile);
  return realms.filter((id) => known.some((r) => r.id === id));
}
