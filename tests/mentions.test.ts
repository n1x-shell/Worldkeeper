import { describe, expect, it } from 'vitest';
import { MentionIndex, parseRefs, collectRefs } from '../shared/mentions.js';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createEntity, updateEntity } from '../server/src/repo/entities.js';
import { brokenReferences, listRelationshipsFor } from '../server/src/repo/relationships.js';
import { playerEntity } from '../server/src/player/projection.js';
import { loadMentionIndex } from '../server/src/repo/mentions.js';

const idx = new MentionIndex([
  { id: 'NPC-010', name: 'Mara Venn', type: 'npc' },
  { id: 'SET-001', name: 'Hollow Refuge', type: 'settlement' },
  { id: 'FAC-301', name: 'Kaelholm', type: 'faction' },
  { id: 'SET-302', name: 'Kaelholm', type: 'settlement' },
  { id: 'COS-913', name: 'The Double Grammar', type: 'cosmology' },
  { id: 'NPC-001', name: 'The Blind Seer', type: 'npc', aliases: ['High Prophet Azhir'] },
  { id: 'LOC-015', name: 'Legacy', type: 'redirect', redirect_to: 'SET-001' },
]);

describe('mention parsing', () => {
  it('resolves @[Name] by name, alias, "the", type qualifier and explicit ID', () => {
    expect(idx.resolve('Mara Venn')).toEqual({ id: 'NPC-010' });
    expect(idx.resolve('mara venn')).toEqual({ id: 'NPC-010' });
    expect(idx.resolve('Double Grammar')).toEqual({ id: 'COS-913' });
    expect(idx.resolve('High Prophet Azhir')).toEqual({ id: 'NPC-001' });
    expect(idx.resolve('Kaelholm')).toEqual({ ambiguous: ['FAC-301', 'SET-302'] });
    expect(idx.resolve('Kaelholm (Settlement)')).toEqual({ id: 'SET-302' });
    expect(idx.resolve('anything', 'FAC-301')).toEqual({ id: 'FAC-301' });
    expect(idx.resolve('Nobody')).toBeNull();
  });

  it('suggests unambiguous mention text', () => {
    expect(idx.mentionFor('NPC-010')).toBe('@[Mara Venn]');
    expect(idx.mentionFor('SET-302')).toBe('@[Kaelholm (Settlement)]');
  });

  it('turns legacy "Name [ID]" into a name link and never shows the ID', () => {
    const segs = parseRefs('Run by Mara Venn [NPC-010], near the double grammar [COS-913] and the catalog [SET-001]. See `[NPC-010]`.', idx);
    expect(segs).toEqual([
      { kind: 'text', text: 'Run by ' },
      { kind: 'link', id: 'NPC-010', label: 'Mara Venn', source: 'legacy' },
      { kind: 'text', text: ', near ' },
      { kind: 'link', id: 'COS-913', label: 'the double grammar', source: 'legacy' },
      { kind: 'text', text: ' and the catalog' },
      { kind: 'anchor', id: 'SET-001' },
      { kind: 'text', text: '. See `[NPC-010]`.' },
    ]);
  });

  it('collects ids, follows redirects and reports broken or ambiguous mentions', () => {
    expect(collectRefs('@[Mara Venn] met @[Nobody] in @[Kaelholm] by [LOC-015] and [NPC-999]', idx)).toEqual({
      ids: ['NPC-010', 'SET-001'],
      broken: ['@[Nobody]', '@[Kaelholm] (ambiguous)', 'NPC-999'],
    });
  });
});

describe('mentions in the library', () => {
  function seeded() {
    const ctx = tempContext();
    const files = readZip(zipOf(fixtureFiles()));
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'f'));
    return ctx;
  }

  it('@[Name] in record text creates a relationship and broken mentions are reported', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'LOC-002', { body: '# Old Tower\n\nHaunted by @[Test Keeper]. Rumours of @[Nobody Real].' });
    const rels = listRelationshipsFor(ctx.db, 'LOC-002');
    expect(rels.some((r) => r.target_id === 'NPC-001' && r.origin === 'import-reference')).toBe(true);
    expect(brokenReferences(ctx.db).references).toContainEqual(expect.objectContaining({ from: 'LOC-002', ref: '@[Nobody Real]' }));
  });

  it('players see names, never IDs; links only to revealed records', () => {
    const ctx = seeded();
    updateEntity(ctx.db, 'SET-001', { revealed: true, player_summary: 'Home of @[Test Keeper]. Near Old Tower [LOC-002].' });
    let pe = playerEntity(ctx.db, 'SET-001')!;
    expect(pe.summary).toBe('Home of Test Keeper. Near Old Tower.');
    updateEntity(ctx.db, 'NPC-001', { revealed: true });
    pe = playerEntity(ctx.db, 'SET-001')!;
    expect(pe.summary).toBe('Home of [Test Keeper](/player/e/NPC-001). Near Old Tower.');
  });

  it('user-created records are mentionable by name', () => {
    const ctx = seeded();
    createEntity(ctx.db, { name: 'Brother Quill', type: 'npc', realm: 'kaelmar', canon_status: 'PROPOSED', aliases: [], tags: [], fields: [], body: '', notes: '' });
    expect(loadMentionIndex(ctx.db).resolve('Brother Quill')).toEqual({ id: 'CUS-0001' });
  });
});
