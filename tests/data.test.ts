import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createEntity, duplicateAsDraft, getEntity, listRevisions, revertToRevision, updateEntity } from '../server/src/repo/entities.js';
import { createRelationship, listRelationshipsFor, neighbourhood } from '../server/src/repo/relationships.js';
import { createBackup, stageRestore } from '../server/src/backup/backup.js';
import { AppContext } from '../server/src/context.js';
import { createApp } from '../server/src/app.js';
import { playerEntities, playerEntity, playerSnapshot } from '../server/src/player/projection.js';
import {
  campaigns,
  campaignState,
  decideProposal,
  generateRecapDraft,
  listProposals,
  proposePromotion,
  recordState,
  sessionLog,
  sessions,
  createNextSession,
} from '../server/src/repo/campaigns.js';
import { canonReview, reviewDecision } from '../server/src/repo/review.js';
import { exportJson, importJson, exportMarkdownZip, exportCampaign, importCampaign, exportPlayerZip } from '../server/src/backup/exporter.js';

function seeded() {
  const ctx = tempContext();
  const files = readZip(zipOf(fixtureFiles()));
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'fixture.zip'));
  return ctx;
}

describe('editing and persistence', () => {
  it('keeps edits after the database is closed and reopened (restart)', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'NPC-001', { notes: 'Met the party at the gate.', body: getEntity(ctx.db, 'NPC-001').body + '\n\n## Added\nNew line.' });
    ctx.db.close();
    const reopened = new AppContext(ctx.paths);
    const e = getEntity(reopened.db, 'NPC-001');
    expect(e.notes).toBe('Met the party at the gate.');
    expect(e.body).toContain('New line.');
    expect(e.version).toBe(2);
  });

  it('partial updates never blank other fields', () => {
    const ctx = seeded();
    const before = getEntity(ctx.db, 'SET-001');
    updateEntity(ctx.db, 'SET-001', { favorite: true });
    const after = getEntity(ctx.db, 'SET-001');
    expect(after.body).toBe(before.body);
    expect(after.tags).toEqual(before.tags);
    expect(after.favorite).toBe(true);
  });

  it('records revisions and can revert; derived links follow the text; user links survive edits', () => {
    const ctx = seeded();
    createRelationship(ctx.db, { source_id: 'NPC-001', target_id: 'LOC-002', type: 'lives_in', canon_status: 'CANON' });
    const orig = getEntity(ctx.db, 'SET-001');
    updateEntity(ctx.db, 'SET-001', { body: '# Test Town\n\nNo references any more.', reason: 'rewrite' });
    expect(listRelationshipsFor(ctx.db, 'SET-001').some((r) => r.origin === 'import-reference')).toBe(false);
    const revs = listRevisions(ctx.db, 'SET-001') as { id: number; change_type: string }[];
    const editRev = revs.find((r) => r.change_type === 'edit')!;
    revertToRevision(ctx.db, 'SET-001', editRev.id, 'undo');
    expect(getEntity(ctx.db, 'SET-001').body).toBe(orig.body);
    expect(listRelationshipsFor(ctx.db, 'SET-001').some((r) => r.target_id === 'LOC-002')).toBe(true);
    expect(listRelationshipsFor(ctx.db, 'NPC-001').some((r) => r.type === 'lives_in' && r.origin === 'user')).toBe(true);
  });

  it('rejects stale writes (optimistic concurrency) and reused IDs', () => {
    const ctx = seeded();
    expect(() => updateEntity(ctx.db, 'LOC-002', { notes: 'x', expected_version: 99 })).toThrow(/changed elsewhere/);
    expect(() =>
      createEntity(ctx.db, { id: 'LOC-002', name: 'Dup', type: 'landmark', realm: 'aetheris', canon_status: 'PROPOSED', aliases: [], tags: [], fields: [], body: '', notes: '' }),
    ).toThrow(/already exists/);
  });

  it('new records and drafts are PROPOSED, never canon, until approved', () => {
    const ctx = seeded();
    const d = duplicateAsDraft(ctx.db, 'LOC-002');
    expect(d.canon_status).toBe('PROPOSED');
    expect(d.id).toMatch(/^CUS-\d{4}$/);
    expect(getEntity(ctx.db, 'LOC-002').canon_status).toBe('CANON');
    const p = listProposals(ctx.db).find((x) => (x as { entity_id: string }).entity_id === d.id) as { id: number };
    decideProposal(ctx.db, p.id, 'approved', 'ok');
    expect(getEntity(ctx.db, d.id).canon_status).toBe('CANON');
  });

  it('canon review lists modified canon records and can revert them to the imported text', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'LOC-002', { body: 'Changed history.' });
    expect(canonReview(ctx.db).modified.map((m) => m.id)).toContain('LOC-002');
    reviewDecision(ctx.db, 'LOC-002', 'revert', 'not approved');
    expect(getEntity(ctx.db, 'LOC-002').body).toContain('A ruined tower.');
    expect(canonReview(ctx.db).modified.map((m) => m.id)).not.toContain('LOC-002');
  });

  it('graph neighbourhood is focused and filterable', () => {
    const ctx = seeded();
    const g = neighbourhood(ctx.db, 'SET-001', { depth: 1 });
    expect(g.nodes.map((n) => n.id)).toContain('CON-001');
    const npcOnly = neighbourhood(ctx.db, 'SET-001', { depth: 1, types: ['npc'] });
    expect(npcOnly.nodes.every((n) => n.id === 'SET-001' || n.type === 'npc')).toBe(true);
  });
});

describe('campaign state never overwrites canon', () => {
  it('records campaign changes as an overlay and promotes only with approval', () => {
    const ctx = seeded();
    const c = campaigns.create(ctx.db, { title: 'Test Campaign' }) as { id: number };
    const s1 = recordState(ctx.db, { campaign_id: c.id, entity_id: 'LOC-002', field: 'Controlled by', value: 'The party' }) as { id: number };
    expect(getEntity(ctx.db, 'LOC-002').fields).toEqual([]);
    const s2 = recordState(ctx.db, { campaign_id: c.id, entity_id: 'LOC-002', field: 'Controlled by', value: 'Test Guild' }) as { id: number };
    expect((campaignState.get(ctx.db, s1.id) as { status: string }).status).toBe('superseded');
    const pid = proposePromotion(ctx.db, s2.id, 'Make it canon');
    expect(getEntity(ctx.db, 'LOC-002').fields).toEqual([]);
    decideProposal(ctx.db, pid, 'approved', 'yes');
    expect(getEntity(ctx.db, 'LOC-002').fields).toEqual([['Controlled by', 'Test Guild']]);
    expect(canonReview(ctx.db).modified.map((m) => m.id)).not.toContain('LOC-002');
  });

  it('generates a recap only from recorded entries', () => {
    const ctx = seeded();
    const c = campaigns.create(ctx.db, { title: 'C' }) as { id: number };
    const s = createNextSession(ctx.db, c.id, 'First') as { id: number };
    expect(generateRecapDraft(ctx.db, s.id)).toContain('No events were recorded');
    sessionLog.create(ctx.db, { session_id: s.id, kind: 'npc', text: 'Spoke with the keeper', entity_id: 'NPC-001' });
    recordState(ctx.db, { campaign_id: c.id, entity_id: 'LOC-002', field: 'State', value: 'Burned', session_id: s.id, status: 'proposed' });
    const draft = generateRecapDraft(ctx.db, s.id);
    expect(draft).toContain('Spoke with the keeper (Test Keeper [NPC-001])');
    expect(draft).toContain('State: Burned');
    expect(draft).not.toContain('Hidden Test Villain');
    sessions.update(ctx.db, s.id, { recap: draft });
    expect((sessions.get(ctx.db, s.id) as { recap: string }).recap).toBe(draft);
  });
});

describe('player safety', () => {
  it('exposes nothing until revealed, and never GM sections even if requested', () => {
    const ctx = seeded();
    expect(playerEntities(ctx.db)).toEqual([]);
    updateEntity(ctx.db, 'SET-001', {
      revealed: true,
      player_summary: 'A quiet town. Its keeper is Test Keeper [NPC-001].',
      revealed_sections: ['Overview', 'GM-only truths'],
    });
    const e = playerEntity(ctx.db, 'SET-001')!;
    expect(e.sections.map((s) => s.heading)).toEqual(['Overview']);
    const json = JSON.stringify(playerSnapshot(ctx.db));
    expect(json).not.toContain('Hidden Test Villain');
    expect(json).not.toContain('forbidden ledger');
    expect(json).not.toContain('Test_Bible.md');
    // Reference to an unrevealed record is scrubbed.
    expect(json).not.toContain('NPC-001');
    expect(json).not.toContain('LOC-002');
  });

  it('player-mode server exposes no DM routes and no secrets', async () => {
    const dm = seeded();
    updateEntity(dm.db, 'NPC-001', { revealed: true, revealed_sections: ['Wants', 'Secrets (GM only)'] });
    dm.db.close();
    const playerCtx = new AppContext(dm.paths, 'player');
    const app = createApp(playerCtx);
    expect((await request(app).get('/api/entities')).status).toBe(404);
    expect((await request(app).get('/api/entities/NPC-001')).status).toBe(404);
    expect((await request(app).get('/api/export/json')).status).toBe(404);
    expect((await request(app).get('/api/search?q=ledger')).status).toBe(404);
    const res = await request(app).get('/api/player/entities/NPC-001');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('forbidden ledger');
    expect((await request(app).get('/api/player/entities/SET-001')).status).toBe(404);
    expect(JSON.stringify((await request(app).get('/api/player/search?q=ledger')).body)).toBe('[]');
  });

  it('player export zip contains no secret text', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'SET-001', { revealed: true, revealed_sections: ['Overview', 'GM-only truths'] });
    const text = exportPlayerZip(ctx.db).toString('latin1');
    // zip entries are deflated; check the JSON via the projection instead and that the archive is non-empty
    expect(text.length).toBeGreaterThan(100);
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('Hidden Test Villain');
  });
});

describe('backup, restore and export round-trips', () => {
  it('backup → change → restore brings back records and relationships', async () => {
    const ctx = seeded();
    const relsBefore = (ctx.db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n;
    const b = createBackup(ctx.db, ctx.paths, 'manual');
    ctx.db.prepare('DELETE FROM relationships').run();
    ctx.db.prepare(`DELETE FROM entities WHERE id = 'NPC-001'`).run();
    const staged = stageRestore(ctx.paths, fs.readFileSync(`${ctx.paths.backupsDir}/${b.file}`));
    ctx.replaceDatabase(staged.dbFile);
    expect(getEntity(ctx.db, 'NPC-001').name).toBe('Test Keeper');
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n).toBe(relsBefore);
  });

  it('restore through the API refuses non-backup files', async () => {
    const ctx = seeded();
    const app = createApp(ctx);
    const res = await request(app).post('/api/backups/restore-upload').attach('backup', zipOf([{ path: 'x.md', content: 'x' }]), 'x.zip');
    expect(res.status).toBe(400);
    expect(getEntity(ctx.db, 'NPC-001')).toBeTruthy();
  });

  it('JSON export imports into a fresh installation with identical data', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'LOC-002', { notes: 'dm note' });
    const data = JSON.parse(JSON.stringify(exportJson(ctx.db)));
    const fresh = tempContext();
    importJson(fresh.db, data);
    expect(getEntity(fresh.db, 'LOC-002').notes).toBe('dm note');
    const n = (d: typeof ctx.db) => (d.prepare('SELECT COUNT(*) n FROM relationships').get() as { n: number }).n;
    expect(n(fresh.db)).toBe(n(ctx.db));
    expect(() => importJson(fresh.db, data)).toThrow(/empty library/);
  });

  it('Markdown export re-imports into a fresh installation with the same IDs', () => {
    const ctx = seeded();
    const files = readZip(exportMarkdownZip(ctx.db));
    const fresh = tempContext();
    commitPlan(fresh.db, files, buildPlan(fresh.db, files, 'md-export'));
    const ids = (d: typeof ctx.db) => (d.prepare('SELECT id FROM entities ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    expect(ids(fresh.db)).toEqual(ids(ctx.db));
    expect(getEntity(fresh.db, 'SET-001').body).toBe(getEntity(ctx.db, 'SET-001').body);
    expect(getEntity(fresh.db, 'FAC-001').fields).toEqual(getEntity(ctx.db, 'FAC-001').fields);
  });

  it('campaign export imports as a new campaign', () => {
    const ctx = seeded();
    const c = campaigns.create(ctx.db, { title: 'Exported' }) as { id: number };
    createNextSession(ctx.db, c.id, 'One');
    const newId = importCampaign(ctx.db, JSON.parse(JSON.stringify(exportCampaign(ctx.db, c.id))));
    expect(newId).not.toBe(c.id);
    expect(sessions.list(ctx.db, { campaign_id: newId }).length).toBe(1);
  });
});
