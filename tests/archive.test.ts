/**
 * Integration test against the real world archive. Skipped unless WORLDKEEPER_TEST_ARCHIVE points to the ZIP or folder:
 *   WORLDKEEPER_TEST_ARCHIVE=~/Amsel_Unified_World_Lore_Reference_v10.zip npm test
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { readSource } from '../server/src/import/scan.js';
import { buildPlan, commitPlan, summarisePlan } from '../server/src/import/importer.js';
import { getEntity } from '../server/src/repo/entities.js';
import { brokenReferences } from '../server/src/repo/relationships.js';

const archive = process.env.WORLDKEEPER_TEST_ARCHIVE;

describe.skipIf(!archive)('real world archive', () => {
  it('imports every stable ID once, with intact references, idempotently', () => {
    const ctx = tempContext();
    const files = readSource(archive!);
    const plan = buildPlan(ctx.db, files, 'archive');
    const s = summarisePlan(plan);
    const sourceIds = new Set<string>();
    // References/ are protected source documents (bibles, guides), not encyclopedia records.
    for (const f of files.filter((x) => !x.path.startsWith('References/'))) for (const m of f.content.matchAll(/^ID:\s*(\S+)/gm)) if (!m[1].startsWith('[')) sourceIds.add(m[1]);
    commitPlan(ctx.db, files, plan);
    const dbIds = new Set((ctx.db.prepare('SELECT id FROM entities').all() as { id: string }[]).map((r) => r.id));
    expect([...sourceIds].filter((id) => !dbIds.has(id))).toEqual([]);
    expect(dbIds.size).toBe(sourceIds.size);
    expect(s.brokenRefs).toEqual([]);
    expect(brokenReferences(ctx.db).references).toEqual([]);
    const n = (sql: string) => (ctx.db.prepare(sql).get() as { n: number }).n;
    expect(n(`SELECT COUNT(*) n FROM entities WHERE type = 'vault'`)).toBe(13);
    expect(n(`SELECT COUNT(*) n FROM entities WHERE type = 'shard'`)).toBe(13);
    expect(n(`SELECT COUNT(*) n FROM entities WHERE type = 'ethereal_domain'`)).toBe(7);
    for (const id of ['CON-001', 'CON-301', 'CON-501', 'WLD-901']) expect(getEntity(ctx.db, id)).toBeTruthy();
    // All vaults sealed at the default start.
    for (const v of ctx.db.prepare(`SELECT fields FROM entities WHERE type = 'vault'`).all() as { fields: string }[]) expect(v.fields).toMatch(/Sealed/);
    expect(getEntity(ctx.db, 'LOC-015').redirect_to).toBe('LOC-505');
    const again = buildPlan(ctx.db, files, 'again');
    expect(summarisePlan(again).counts.byAction).toEqual({ unchanged: dbIds.size });
  });
});
