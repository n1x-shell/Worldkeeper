import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { createEntity, getEntity } from '../server/src/repo/entities.js';
import { createRelationship } from '../server/src/repo/relationships.js';
import { firstParagraph } from '../server/src/repo/peek.js';

const make = (id: string, name: string, body: string, fields: [string, string][] = []) =>
  ({ id, name, type: 'npc', realm: 'aetheris', canon_status: 'CANON', aliases: [], tags: [], fields, body, notes: '' }) as never;

describe('Quick-Peek', () => {
  it('summarises a record without its title or secrets, with facts and links, and is not counted as a visit', async () => {
    const ctx = tempContext();
    createEntity(
      ctx.db,
      make('NPC-801', 'Testa Venn', '# Testa Venn\n\n## Overview\nKeeps the inn. Knows everyone.\n\n## Secrets (GM only)\nShe is the thirteenth heir.', [
        ['Role', 'Innkeeper'],
        ['Secret', 'An heir'],
        ['Voice', 'UNDEFINED'],
      ]),
    );
    createEntity(ctx.db, make('NPC-802', 'Ollo', '## Overview\nA cook.'));
    createRelationship(ctx.db, { source_id: 'NPC-801', target_id: 'NPC-802', type: 'allied_with' });
    const app = createApp(ctx);
    const before = getEntity(ctx.db, 'NPC-801');
    const r = await request(app).get('/api/entities/NPC-801/peek').expect(200);
    expect(r.body.name).toBe('Testa Venn');
    expect(r.body.summary).toBe('Keeps the inn. Knows everyone.');
    expect(r.body.summary).not.toContain('heir');
    expect(r.body.facts).toEqual([['Role', 'Innkeeper']]);
    expect(r.body.sections.map((s: { heading: string; secret: boolean }) => [s.heading, s.secret])).toEqual([
      ['Overview', false],
      ['Secrets (GM only)', true],
    ]);
    expect(r.body.links).toEqual([{ id: 'NPC-802', name: 'Ollo', label: expect.any(String) }]);
    expect(r.body.hasStatBlock).toBe(false);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM recent_views').get() as { n: number }).n).toBe(0);
    expect(getEntity(ctx.db, 'NPC-801').updated_at).toBe(before.updated_at);
  });

  it('cuts a long first paragraph at a sentence', () => {
    const long = `${'One sentence here. '.repeat(30)}`;
    const s = firstParagraph(long, 100);
    expect(s.length).toBeLessThanOrEqual(100);
    expect(s.endsWith('.')).toBe(true);
    expect(firstParagraph('- a list\n\nThe prose.')).toBe('The prose.');
  });
});
