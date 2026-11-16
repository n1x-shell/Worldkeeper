/** Open questions: every UNDEFINED in the library, kept open on purpose, filled by an addition, or still to do. */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { createEntity } from '../server/src/repo/entities.js';
import { openQuestions, readRules } from '../server/src/repo/openQuestions.js';

const rec = (id: string, type: string, body: string, player_summary?: string) => ({
  id,
  name: id,
  type,
  realm: 'aetheris',
  canon_status: 'CANON',
  aliases: [],
  tags: [],
  fields: [],
  body,
  notes: '',
  ...(player_summary ? { player_summary } : {}),
});

describe('open questions', () => {
  it('sorts each UNDEFINED by the rules, then the automatic checks, and skips notes about the library', () => {
    const { db } = tempContext();
    createEntity(db, rec('SHD-012', 'shard', '## Established\nIts identity, location and powers are UNDEFINED.\n\n## Other\nNothing open here.') as never);
    createEntity(db, rec('LOC-902', 'landmark', '## Open questions [UNDEFINED]\n\n- Its width in kilometres.\n- Islands, if any.') as never);
    createEntity(db, rec('NPC-777', 'npc', '## Attitude toward the party and current status\nTheir attitude is UNDEFINED until played.\n\n## Unspecified fields\nPronouns and combat statistics remain UNDEFINED.') as never);
    createEntity(db, rec('CLT-077', 'cult', '## Additional information\nPrecise headquarters: UNDEFINED.') as never);
    createEntity(db, rec('WLD-902', 'index', '## Rules\nA missing fact is marked UNDEFINED.') as never);
    const rules = [
      { ids: ['WLD-902'], status: 'skip' as const },
      { ids: ['SHD-012'], status: 'kept' as const, note: 'Forgotten.' },
      { ids: ['LOC-902'], status: 'filled' as const, by: ['LOC-903'] },
    ];
    const { questions, counts } = openQuestions(db, rules);
    const find = (id: string, section?: string) => questions.find((q) => q.id === id && (!section || q.section === section))!;
    expect(questions.some((q) => q.id === 'WLD-902')).toBe(false);
    expect(find('SHD-012')).toMatchObject({ status: 'kept', section: 'Established', note: 'Forgotten.' });
    // A marked heading takes its whole section, without the markers.
    expect(find('LOC-902')).toMatchObject({ status: 'filled', by: ['LOC-903'], section: 'Open questions', text: 'Its width in kilometres. Islands, if any.' });
    expect(find('NPC-777', 'Attitude toward the party and current status').status).toBe('kept');
    // No handbook page and no fight card: still to do, and the note says what's missing.
    expect(find('NPC-777', 'Unspecified fields')).toMatchObject({ status: 'todo', by: [] });
    expect(find('NPC-777', 'Unspecified fields').note).toContain('a fight card');
    expect(find('CLT-077').status).toBe('todo');
    expect(counts).toEqual({ kept: 2, filled: 1, todo: 2 });
  });

  it('ships rules that are well formed', () => {
    const rules = readRules();
    expect(rules.length).toBeGreaterThan(20);
    for (const r of rules) {
      expect(['kept', 'filled', 'todo', 'skip']).toContain(r.status);
      for (const id of [...r.ids, ...(r.by ?? [])]) expect(id).toMatch(/^[A-Z]{3,4}-\d{3}(-[A-Z]+)?$/);
    }
  });
});
