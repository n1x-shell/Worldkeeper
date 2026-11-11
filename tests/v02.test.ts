import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { readZip, type SourceFile } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { AppContext } from '../server/src/context.js';
import { createApp } from '../server/src/app.js';
import { listEras, setRowEra, eraVocabularyFromText, humanizeEra } from '../server/src/repo/eras.js';
import { neighbourhood } from '../server/src/repo/relationships.js';
import { getProfile, saveProfile, influenceMatrix } from '../server/src/repo/profiles.js';
import { revealDuringPlay } from '../server/src/repo/reveal.js';
import { campaigns, createNextSession, generateRecapDraft, sessionLog } from '../server/src/repo/campaigns.js';
import { getEntity } from '../server/src/repo/entities.js';
import { playerEntity, playerSnapshot } from '../server/src/player/projection.js';

/** Fixture library + an era vocabulary row (as in the real implementation guide) + era tags. */
function eraFiles(): SourceFile[] {
  const files = readZip(zipOf(fixtureFiles()));
  return [
    ...files.map((f) => (f.path.endsWith('LOC-002_Old_Tower.md') ? { ...f, content: f.content.replace('vis/gm', 'vis/gm, era/long-ago') } : f)),
    { path: 'References/Guide.md', content: '# Guide\n\n| Prefix | Values |\n| --- | --- |\n| era/ | long-ago, middle-time, now-ish |\n' },
  ];
}

function seeded(files = eraFiles()) {
  const ctx = tempContext();
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'fixture'));
  return { ctx, files };
}

type Row = { id: number; era: string | null; era_origin: string | null; time_label: string };
const rows = (ctx: AppContext) => ctx.db.prepare('SELECT id, era, era_origin, time_label FROM timeline_rows ORDER BY sort_order').all() as Row[];

describe('eras', () => {
  it('reads the era vocabulary from the library and derives row eras from linked records', () => {
    expect(eraVocabularyFromText('| era/ | before-the-cycle, the-cycle, future |')).toEqual(['before-the-cycle', 'the-cycle', 'future']);
    const { ctx } = seeded();
    expect(listEras(ctx.db).map((e) => e.key)).toEqual(['long-ago', 'middle-time', 'now-ish']);
    expect(listEras(ctx.db)[0].name).toBe('Long Ago');
    expect(humanizeEra('before-the-cycle')).toBe('Before the Cycle');
    const r = rows(ctx);
    expect(r[0]).toMatchObject({ era: 'long-ago', era_origin: 'derived' }); // links LOC-002
    expect(r[1]).toMatchObject({ era: null }); // no linked record: left unassigned, not guessed
  });

  it('keeps DM era assignments across re-imports and can return to the derived era', () => {
    const { ctx, files } = seeded();
    const [a, b] = rows(ctx);
    setRowEra(ctx.db, b.id, 'now-ish');
    setRowEra(ctx.db, a.id, 'middle-time');
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'again'));
    const after = rows(ctx);
    expect(after[1]).toMatchObject({ era: 'now-ish', era_origin: 'user' });
    expect(after[0]).toMatchObject({ era: 'middle-time', era_origin: 'user' });
    setRowEra(ctx.db, after[0].id, 'auto');
    expect(rows(ctx)[0]).toMatchObject({ era: 'long-ago', era_origin: 'derived' });
    expect(() => setRowEra(ctx.db, after[0].id, 'no-such-era')).toThrow(/Unknown era/);
  });

  it('backfills eras for libraries imported before eras existed', () => {
    const { ctx } = seeded();
    ctx.db.prepare('DELETE FROM eras').run();
    ctx.db.prepare('UPDATE timeline_rows SET era = NULL, era_origin = NULL').run();
    ctx.db.close();
    const reopened = new AppContext(ctx.paths);
    expect(listEras(reopened.db).length).toBe(3);
    expect(rows(reopened)[0].era).toBe('long-ago');
  });

  it('filters the relationship graph by era', () => {
    const { ctx } = seeded();
    const g = neighbourhood(ctx.db, 'SET-001', { eras: ['long-ago'] });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['LOC-002', 'SET-001']);
  });
});

describe('NPC and faction profiles', () => {
  it('shows source values read-only and stores DM values per scope without touching canon', () => {
    const { ctx } = seeded();
    const before = getEntity(ctx.db, 'NPC-001');
    const p = getProfile(ctx.db, 'NPC-001', null);
    expect(p.kind).toBe('npc');
    expect(p.source.goals[0]).toMatchObject({ text: 'Order.', from: 'Section: Wants' });
    expect(p.source.secrets[0].text).toBe('Keeps a forbidden ledger.');
    expect(p.source.pronouns).toEqual([]); // not in source: shown as UNDEFINED by the UI, never guessed
    expect(p.source.factions.some((v) => v.refs.includes('FAC-001'))).toBe(true); // via the Leaders field relationship

    const c = campaigns.create(ctx.db, { title: 'C' }) as { id: number };
    saveProfile(ctx.db, 'NPC-001', 'world', null, { pronouns: 'they/them', voice: 'Soft, precise.' });
    saveProfile(ctx.db, 'NPC-001', 'campaign', c.id, { attitude: 'Wary', promises: ['Find the ledger'] });
    const q = getProfile(ctx.db, 'NPC-001', c.id);
    expect(q.world).toEqual({ pronouns: 'they/them', voice: 'Soft, precise.' });
    expect(q.campaign).toEqual({ attitude: 'Wary', promises: ['Find the ledger'] });
    expect(getProfile(ctx.db, 'NPC-001', null).campaign).toBeNull();
    // Empty value removes the key.
    saveProfile(ctx.db, 'NPC-001', 'world', null, { voice: '' });
    expect(getProfile(ctx.db, 'NPC-001', null).world).toEqual({ pronouns: 'they/them' });
    // Canon record untouched.
    const after = getEntity(ctx.db, 'NPC-001');
    expect(after.body).toBe(before.body);
    expect(after.version).toBe(before.version);
  });

  it('validates fields, scopes and record types', () => {
    const { ctx } = seeded();
    expect(() => saveProfile(ctx.db, 'NPC-001', 'world', null, { nonsense: 'x' })).toThrow(/Unknown world profile field/);
    expect(() => saveProfile(ctx.db, 'NPC-001', 'world', null, { attitude: 'x' })).toThrow(/Unknown world profile field/);
    expect(() => saveProfile(ctx.db, 'NPC-001', 'campaign', null, { attitude: 'x' })).toThrow(/active campaign/);
    expect(() => getProfile(ctx.db, 'LOC-002', null)).toThrow(/Profiles exist/);
  });

  it('faction profile: leaders from metadata, influence matrix per campaign, last encounter from the session log', () => {
    const { ctx } = seeded();
    const fp = getProfile(ctx.db, 'FAC-001', null);
    expect(fp.kind).toBe('faction');
    expect(fp.source.leaders.flatMap((v) => v.refs)).toContain('NPC-001');
    const c = campaigns.create(ctx.db, { title: 'C' }) as { id: number };
    saveProfile(ctx.db, 'FAC-001', 'campaign', c.id, { influence: [{ region: 'SET-001', level: 'Strong', note: '' }] });
    expect(influenceMatrix(ctx.db, c.id)).toEqual([{ faction_id: 'FAC-001', faction_name: 'Test Guild', region: 'SET-001', level: 'Strong', note: '' }]);
    const s = createNextSession(ctx.db, c.id, 'One') as { id: number };
    sessionLog.create(ctx.db, { session_id: s.id, kind: 'npc', text: 'Met at the gate', entity_id: 'NPC-001' });
    expect(getProfile(ctx.db, 'NPC-001', c.id).lastLogged).toMatchObject({ text: 'Met at the gate', session_number: 1 });
  });

  it('profiles are never exposed to players', async () => {
    const { ctx } = seeded();
    saveProfile(ctx.db, 'NPC-001', 'world', null, { secrets: 'PROFILE-SECRET-XYZ' });
    revealDuringPlay(ctx.db, 'NPC-001', { revealed: true });
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('PROFILE-SECRET-XYZ');
    ctx.db.close();
    const app = createApp(new AppContext(ctx.paths, 'player'));
    expect((await request(app).get('/api/profiles/NPC-001')).status).toBe(404);
  });
});

describe('revealing during play', () => {
  it('reveals record, sections and facts in one step and logs them to the session', () => {
    const { ctx } = seeded();
    const c = campaigns.create(ctx.db, { title: 'C' }) as { id: number };
    const s = createNextSession(ctx.db, c.id, 'One') as { id: number };
    revealDuringPlay(ctx.db, 'SET-001', { section: 'Overview', session_id: s.id });
    revealDuringPlay(ctx.db, 'SET-001', { fact: 'The town gate is barred at night.', session_id: s.id });
    const pe = playerEntity(ctx.db, 'SET-001')!;
    expect(pe.sections.map((x) => x.heading)).toEqual(['Overview']);
    expect(pe.facts).toEqual(['The town gate is barred at night.']);
    const log = sessionLog.list(ctx.db, { session_id: s.id }) as { kind: string; text: string }[];
    expect(log.map((l) => l.kind)).toEqual(['reveal', 'reveal']);
    expect(log[0].text).toContain('record made known to players');
    const recap = generateRecapDraft(ctx.db, s.id);
    expect(recap).toContain('## Revealed to players');
    expect(recap).toContain('The town gate is barred at night.');
  });

  it('refuses GM-only sections, unknown sections and empty requests', () => {
    const { ctx } = seeded();
    expect(() => revealDuringPlay(ctx.db, 'SET-001', { section: 'GM-only truths' })).toThrow(/cannot be published/);
    expect(() => revealDuringPlay(ctx.db, 'SET-001', { section: 'Nope' })).toThrow(/No section/);
    expect(() => revealDuringPlay(ctx.db, 'SET-001', {})).toThrow(/Nothing to reveal/);
    expect(getEntity(ctx.db, 'SET-001').revealed).toBe(false);
  });
});
