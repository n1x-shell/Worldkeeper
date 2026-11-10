import { describe, expect, it } from 'vitest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { readZip, safeRelativePath } from '../server/src/import/scan.js';
import { buildPlan, commitPlan, summarisePlan } from '../server/src/import/importer.js';
import { parseMarkdownFile } from '../server/src/import/parseMarkdown.js';
import { normalizeCanon, normalizeRealm, normalizeType } from '../server/src/import/normalize.js';
import { getEntity, updateEntity } from '../server/src/repo/entities.js';
import { listRelationshipsFor } from '../server/src/repo/relationships.js';
import { search } from '../server/src/repo/search.js';

function importFixture(ctx = tempContext(), files = readZip(zipOf(fixtureFiles()))) {
  const plan = buildPlan(ctx.db, files, 'fixture.zip');
  const result = commitPlan(ctx.db, files, plan);
  return { ctx, plan, result, files };
}

describe('markdown parsing', () => {
  it('parses metadata blocks, extra fields and multiple embedded blocks', () => {
    const f = fixtureFiles().find((x) => x.path.endsWith('03_World_Cosmology.md'))!;
    const parsed = parseMarkdownFile(f.path, f.content);
    expect(parsed.blocks.map((b) => b.id)).toEqual(['WLD-903', 'COS-901', 'COS-950']);
    expect(parsed.blocks[0].body).toContain('Compendium.');
    expect(parsed.blocks[0].body).not.toContain('COS-901');
  });

  it('normalises canon status, flags and realm without losing the raw text', () => {
    expect(normalizeCanon('CANON, SECRET')).toEqual({ status: 'CANON', flags: ['CANON', 'SECRET'] });
    expect(normalizeCanon('CANON. The rule is [HOMEBREW].').flags).toContain('HOMEBREW');
    expect(normalizeCanon('[UNDEFINED: check source]').status).toBe('UNDEFINED');
    expect(normalizeRealm('Aetheris (source listing); actual established domain: Ethereal Realm').realm).toBe('ethereal');
    expect(normalizeRealm('World (both continents)').realm).toBe('world');
    expect(normalizeType('LOC-015', 'Legacy cross-reference (NOT a second Lore site)')).toBe('redirect');
    expect(normalizeType('CON-501', 'Continent')).toBe('realm');
  });

  it('rejects unsafe archive paths', () => {
    expect(safeRelativePath('../etc/passwd')).toBeNull();
    expect(safeRelativePath('/abs/file.md')).toBeNull();
    expect(safeRelativePath('C:/x.md')).toBeNull();
    expect(safeRelativePath('a/b.md')).toBe('a/b.md');
  });
});

describe('import', () => {
  it('imports one record per stable ID and skips copies, examples and templates', () => {
    const { ctx, plan, result } = importFixture();
    const s = summarisePlan(plan);
    const ids = (ctx.db.prepare('SELECT id FROM entities ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual(['CON-001', 'COS-901', 'COS-950', 'FAC-001', 'LOC-002', 'LOC-099', 'NPC-001', 'SET-001', 'WLD-901', 'WLD-903', 'WLD-904']);
    expect(result.created).toBe(11);
    // COS-901 standalone page wins over the compendium copy; worked example + template are not records.
    expect(getEntity(ctx.db, 'COS-901').source_file).toBe('00_World/Cosmology_Entries/COS-901_The_First_Thing.md');
    expect(s.skipped.some((x) => x.reason.startsWith('Worked example'))).toBe(true);
    expect(s.skipped.some((x) => x.id === 'COS-901' && x.reason.startsWith('Embedded copy'))).toBe(true);
    expect(s.templates).toBe(1);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM templates').get() as { n: number }).n).toBe(1);
  });

  it('preserves IDs, names, aliases, raw canon text, source references and GM secrets', () => {
    const { ctx } = importFixture();
    const town = getEntity(ctx.db, 'SET-001');
    expect(town.name).toBe('Test Town');
    expect(town.canon_raw).toBe('CANON, SECRET');
    expect(town.canon_flags).toEqual(['CANON', 'SECRET']);
    expect(town.source_raw).toBe('Test_Bible.md: Section');
    expect(town.fields).toEqual([['Population', '100']]);
    expect(town.body).toContain('The mayor is secretly the Hidden Test Villain.');
    expect(town.body).toContain('UNDEFINED');
    expect(town.revealed).toBe(false);
  });

  it('builds structured relationships from parent, fields and cross-references; resolves redirects; reports broken refs', () => {
    const { ctx, plan } = importFixture();
    const rels = listRelationshipsFor(ctx.db, 'FAC-001');
    expect(rels.some((r) => r.type === 'leads' && r.source_id === 'NPC-001' && r.target_id === 'FAC-001')).toBe(true);
    // LOC-099 is a legacy redirect: the link goes to LOC-002 instead.
    expect(rels.some((r) => r.target_id === 'LOC-002')).toBe(true);
    expect(rels.some((r) => r.target_id === 'LOC-099')).toBe(false);
    expect(summarisePlan(plan).brokenRefs).toContainEqual({ from: 'FAC-001', ref: 'NPC-777' });
    const town = listRelationshipsFor(ctx.db, 'SET-001');
    expect(town.some((r) => r.type === 'part_of' && r.target_id === 'CON-001')).toBe(true);
  });

  it('is repeatable: re-importing the same source changes nothing', () => {
    const { ctx, files } = importFixture();
    const relCount = (ctx.db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n;
    const plan2 = buildPlan(ctx.db, files, 'again');
    expect(summarisePlan(plan2).counts.byAction).toEqual({ unchanged: 11 });
    const r2 = commitPlan(ctx.db, files, plan2);
    expect(r2.created).toBe(0);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n).toBe(11);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n).toBe(relCount);
  });

  it('never silently overwrites local edits; conflicts default to keeping the local version', () => {
    const { ctx, files } = importFixture();
    updateEntity(ctx.db, 'LOC-002', { body: '# Old Tower\n\nMy edited text.', reason: 'test edit' });
    const changed = files.map((f) => (f.path.endsWith('LOC-002_Old_Tower.md') ? { ...f, content: f.content.replace('A ruined tower.', 'A rebuilt tower.') } : f));
    const plan = buildPlan(ctx.db, changed, 'v2');
    expect(plan.entities.find((e) => e.draft.id === 'LOC-002')!.action).toBe('conflict');
    commitPlan(ctx.db, changed, plan);
    expect(getEntity(ctx.db, 'LOC-002').body).toContain('My edited text.');
    // Explicit choice to take the source keeps the old version in history.
    const plan3 = buildPlan(ctx.db, changed, 'v2');
    commitPlan(ctx.db, changed, plan3, { resolutions: { 'LOC-002': 'take-source' } });
    expect(getEntity(ctx.db, 'LOC-002').body).toContain('A rebuilt tower.');
    const revs = ctx.db.prepare(`SELECT snapshot FROM entity_revisions WHERE entity_id = 'LOC-002' AND change_type = 'pre-import'`).all() as { snapshot: string }[];
    expect(revs.some((r) => r.snapshot.includes('My edited text.'))).toBe(true);
  });

  it('updates unedited records when the source changes, and never overwrites the setting bibles', () => {
    const { ctx, files } = importFixture();
    const changed = files.map((f) => {
      if (f.path.endsWith('LOC-002_Old_Tower.md')) return { ...f, content: f.content.replace('A ruined tower.', 'A ruined tower, v2.') };
      if (f.path.endsWith('Aetheris_Setting_Bible.md')) return { ...f, content: '# Test bible\n\nTAMPERED text.' };
      return f;
    });
    const plan = buildPlan(ctx.db, changed, 'v2');
    expect(plan.entities.find((e) => e.draft.id === 'LOC-002')!.action).toBe('update');
    expect(plan.protectedDocs.length).toBe(1);
    commitPlan(ctx.db, changed, plan);
    expect(getEntity(ctx.db, 'LOC-002').body).toContain('v2');
    const bible = ctx.db.prepare(`SELECT content FROM source_documents WHERE path = 'References/Aetheris_Setting_Bible.md'`).get() as { content: string };
    expect(bible.content).toContain('Immutable source text v1.');
    const copies = ctx.db.prepare(`SELECT COUNT(*) n FROM source_documents WHERE path LIKE 'References/Aetheris_Setting_Bible.md@%'`).get() as { n: number };
    expect(copies.n).toBe(1);
  });

  it('rolls back the whole import when anything fails', () => {
    const ctx = tempContext();
    const files = readZip(zipOf(fixtureFiles()));
    const plan = buildPlan(ctx.db, files, 'bad');
    // Corrupt one planned record so the INSERT violates NOT NULL.
    (plan.entities[3].draft as { name: string | null }).name = null;
    expect(() => commitPlan(ctx.db, files, plan)).toThrow();
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM entities').get() as { n: number }).n).toBe(0);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM source_documents').get() as { n: number }).n).toBe(0);
    expect((ctx.db.prepare(`SELECT status FROM import_runs`).get() as { status: string }).status).toBe('failed');
  });

  it('indexes records and source documents for search, including stable IDs and timeline rows', () => {
    const { ctx } = importFixture();
    expect(search(ctx.db, 'SET-001')[0].ref).toBe('SET-001');
    expect(search(ctx.db, 'ruined tower').some((h) => h.ref === 'LOC-002')).toBe(true);
    // A legacy ID search lands on the authoritative record.
    expect(search(ctx.db, 'LOC-099')[0].ref).toBe('LOC-002');
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM timeline_rows').get() as { n: number }).n).toBe(2);
  });
});
