/**
 * Links derived from list sections, and the Worldkeeper additions. The records below are SYNTHETIC TEST DATA.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import { applyAdditions } from '../server/src/additions';
import { listItems } from '../server/src/repo/nameMatch';
import type { SourceFile } from '../server/src/import/scan';

const rec = (id: string, name: string, category: string, body: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\n${body}\n`,
});

const files: SourceFile[] = [
  rec('FAC-001', 'Test Order', 'Faction', '## Leaders\nHighlord Alpha Person, Sister Beta'),
  rec('CLT-001', 'The Test Cult', 'Cult', '## Known figures\nGamma the Grim, Delta'),
  rec('NPC-001', 'Highlord Alpha Person', 'NPC', '## Associated groups\nTest Order'),
  rec('NPC-002', 'Sister Beta "the Bold"', 'NPC', '## Associated groups\nTest Order, Test Town'),
  rec('NPC-003', 'Gamma "the Grim"', 'NPC', 'A figure.'),
  rec('NPC-004', 'Delta', 'NPC', 'Another figure.'),
  rec('SET-001', 'Test Town', 'Settlement', 'A town.'),
];

function linksOf(db: ReturnType<typeof tempContext>['db']) {
  return db.prepare(`SELECT source_id, target_id, type FROM relationships WHERE type IN ('member_of','leads','lives_in')`).all() as {
    source_id: string;
    target_id: string;
    type: string;
  }[];
}

describe('links from list sections', () => {
  it('splits prose lists into names', () => {
    expect(listItems('Highlord Theos Valcairn, Grand Theurgist Selara Dawnveil and Inquisitor Malrik Vael')).toEqual([
      'Highlord Theos Valcairn',
      'Grand Theurgist Selara Dawnveil',
      'Inquisitor Malrik Vael',
    ]);
    expect(listItems('None on the cards')).toEqual([]);
  });

  it('turns leaders, known figures and associated groups into typed links, matching names without titles or nicknames', () => {
    const ctx = tempContext();
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    const links = linksOf(ctx.db).map((l) => `${l.source_id} ${l.type} ${l.target_id}`);
    expect(links).toContain('NPC-001 leads FAC-001');
    expect(links).toContain('NPC-002 leads FAC-001'); // "Sister Beta" names 'Sister Beta "the Bold"'
    expect(links).toContain('NPC-003 member_of CLT-001'); // "Gamma the Grim" names 'Gamma "the Grim"'
    expect(links).toContain('NPC-004 member_of CLT-001');
    expect(links).toContain('NPC-001 member_of FAC-001');
    expect(links).toContain('NPC-002 lives_in SET-001'); // a place in "Associated groups" is where they are
  });
});

describe('Worldkeeper additions', () => {
  it('adds new records and curated links to a library, without repeating links and safely more than once', () => {
    const ctx = tempContext();
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-additions-'));
    fs.writeFileSync(path.join(dir, 'SET-010_New_Town.md'), rec('SET-010', 'New Town', 'Settlement', 'A new town.').content);
    fs.mkdirSync(path.join(dir, 'drafts'));
    fs.writeFileSync(path.join(dir, 'drafts', 'SET-099_Draft.md'), rec('SET-099', 'Draft Town', 'Settlement', 'Not yet.').content);
    fs.writeFileSync(
      path.join(dir, 'links.json'),
      JSON.stringify({
        links: [
          { source: 'NPC-003', target: 'SET-010', type: 'lives_in' },
          { source: 'NPC-003', target: 'SET-001', type: 'comes_from' },
          { source: 'NPC-001', target: 'FAC-001', type: 'member_of' }, // already given by the archive text
          { source: 'NPC-999', target: 'SET-010', type: 'lives_in' }, // not in this library
        ],
      }),
    );
    const first = applyAdditions(ctx.db, dir);
    expect(first.records).toBe(1); // the draft is skipped
    expect(first.links.added).toBe(2);
    expect(first.links.skipped).toEqual(['NPC-999 lives_in SET-010']);
    applyAdditions(ctx.db, dir);
    const curated = ctx.db.prepare(`SELECT COUNT(*) AS n FROM relationships WHERE origin = 'user'`).get() as { n: number };
    expect(curated.n).toBe(2);
    expect(ctx.db.prepare(`SELECT 1 FROM entities WHERE id = 'SET-099'`).get()).toBeUndefined();
    expect(ctx.db.prepare(`SELECT 1 FROM entities WHERE id = 'FAC-001'`).get()).toBeTruthy(); // archive records untouched
  });
});

describe('names in prose', () => {
  it('links a record named in a sentence, including the possessive, but not inside another word', () => {
    const ctx = tempContext();
    const prose: SourceFile[] = [
      rec('SET-001', 'Test Town', 'Settlement', 'A town.'),
      rec('NPC-001', 'Mira Quill', 'NPC', 'She lives near Test Town\'s gate.'),
      rec('NPC-002', 'Other Person', 'NPC', 'Nothing about Test Townsfolk here.'),
    ];
    commitPlan(ctx.db, prose, buildPlan(ctx.db, prose, 'test'));
    const refs = ctx.db.prepare(`SELECT source_id, target_id FROM relationships WHERE type = 'references'`).all() as { source_id: string; target_id: string }[];
    expect(refs).toContainEqual({ source_id: 'NPC-001', target_id: 'SET-001' });
    expect(refs).not.toContainEqual({ source_id: 'NPC-002', target_id: 'SET-001' });
  });
});

describe('timeline additions', () => {
  it('adds the additions’ timeline rows, replaces them on a second run, and keeps an era the GM set', () => {
    const ctx = tempContext();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-timeline-'));
    const rows = [{ sort_order: 15.01, time_label: 'Year 1 Unbound', event: 'The First Morning', entity_ids: [] }];
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ rows }));
    fs.mkdirSync(path.join(dir, 'drafts'));
    fs.writeFileSync(path.join(dir, 'drafts', 'timeline.json'), JSON.stringify({ rows: [{ sort_order: 1, time_label: 'x', event: 'Draft row' }] }));
    expect(applyAdditions(ctx.db, dir).timeline).toBe(1);
    ctx.db.prepare(`UPDATE timeline_rows SET era = 'the-cycle', era_origin = 'user'`).run();
    applyAdditions(ctx.db, dir);
    const all = ctx.db.prepare(`SELECT event, era, era_origin FROM timeline_rows`).all();
    expect(all).toEqual([{ event: 'The First Morning', era: 'the-cycle', era_origin: 'user' }]);
  });
});

describe('player text links', () => {
  it('links the first plain mention of a revealed record, never an unrevealed one, and not inside name lists', async () => {
    const { playerEntity } = await import('../server/src/player/projection');
    const { updateEntity } = await import('../server/src/repo/entities');
    const ctx = tempContext();
    const recs: SourceFile[] = [
      rec('SET-001', 'Test Town', 'Settlement', 'A town.'),
      rec('SET-002', 'Secret Keep', 'Settlement', 'Hidden.'),
      rec('NPC-001', 'Mira Quill', 'NPC', 'A person.'),
    ];
    commitPlan(ctx.db, recs, buildPlan(ctx.db, recs, 'test'));
    updateEntity(ctx.db, 'SET-001', { revealed: true, player_summary: 'A town.', revealed_sections: [], reason: 'test' });
    updateEntity(ctx.db, 'NPC-001', {
      revealed: true,
      player_summary: 'She lives in Test Town, near Secret Keep. Test Town again.\n\n**Common names.** Test Town, Mira',
      revealed_sections: [],
      reason: 'test',
    });
    const s = playerEntity(ctx.db, 'NPC-001')!.summary;
    expect(s).toContain('[Test Town](/player/e/SET-001), near Secret Keep. Test Town again.');
    expect(s).toContain('**Common names.** Test Town, Mira');
    expect(s).not.toContain('SET-002');
  });
});
