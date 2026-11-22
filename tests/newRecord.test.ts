/** New ▸ anything (docs/OWN_WORLD_PLAN.md §2.4, §2.5): making a town both ways, and canon for your own world. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { canonReview, createEntity, updateEntity } from '../server/src/repo/entities.js';
import { BUILTIN_TYPES } from '../shared/recordTypes.js';
import { addHere, buildRecord, draftMarkdown, factsFromParent, newMenu, noteRecentType, parseDraft, sectionDrafts, stripComments, toWrite, toWriteNotes } from '../shared/newRecord.js';
import type { TemplateSpec } from '../shared/templates.js';

const offered = BUILTIN_TYPES.filter((t) => !t.traits.meta && !t.pack);

describe('the New menu', () => {
  it('groups the types the way the Codex does, recently used first', () => {
    const menu = newMenu(offered, ['npc', 'nonsense', 'settlement', 'npc']);
    expect(menu.recent.map((t) => t.key)).toEqual(['npc', 'settlement']);
    expect(menu.groups.map((g) => g.title)).toEqual(['Places', 'People', 'Myth and history', 'Things', 'Rules and adventures', 'Other']);
    expect(menu.groups.at(-1)!.types.map((t) => t.key)).toEqual(['custom']);
    const places = menu.groups.find((g) => g.key === 'places')!.types.map((t) => t.key);
    expect(places).toEqual(expect.arrayContaining(['region', 'settlement', 'landmark']));
    expect(menu.groups.find((g) => g.key === 'people')!.types.map((t) => t.key)).toEqual(expect.arrayContaining(['npc', 'faction', 'species']));
    expect(noteRecentType(['npc', 'region'], 'region')).toEqual(['region', 'npc']);
  });

  it('offers to add what belongs inside a place, with its facts from the parent', () => {
    const has = (t: string) => offered.some((x) => x.key === t);
    expect(addHere('region', has)[0]).toEqual({ type: 'settlement', label: 'Add a settlement here' });
    expect(addHere('settlement', has)[0]).toEqual({ type: 'npc', label: 'Add an NPC who lives here' });
    expect(addHere('deity', has)).toEqual([]);
    expect(addHere('region', (t) => t !== 'settlement').map((a) => a.type)).toEqual(['landmark']);
    expect(
      factsFromParent(
        {
          facts: [
            { name: 'Home', guidance: '' },
            { name: 'Looks', guidance: '' },
          ],
        },
        'Millford',
      ),
    ).toEqual({ Home: 'Millford' });
  });
});

describe('making a town both ways', () => {
  async function setup() {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const templates = (await request(gm).get('/api/templates')).body as (TemplateSpec & { id: string })[];
    const town = templates.find((t) => t.type === 'settlement')!;
    const region = (await request(gm).post('/api/entities').send({ name: 'The Downs', type: 'region', realm: 'world', fields: [], body: '# The Downs\n' })).body;
    return { ctx, gm, town, region };
  }

  it('makes the same record guided and advanced, Canon at once in your own world', async () => {
    const { ctx, gm, town, region } = await setup();
    expect(canonReview(ctx.db)).toBe(false);
    expect((await request(gm).get('/api/meta')).body.canonReview).toBe(false);
    expect(region.canon_status).toBe('CANON');
    expect(region.tags).toContain('status/canon');

    // Guided: the basics, the first section written, the GM-only one written, the rest skipped for now.
    const sections = sectionDrafts(town);
    expect(sections.some((s) => s.gm)).toBe(true);
    const written = sections.map((s, i) =>
      i === 0 ? { ...s, text: 'The road dips into a green valley, and @[The Downs] opens out below.' } : s.gm ? { ...s, text: 'The reeve sells grain to raiders.' } : s,
    );
    const facts = { ...factsFromParent(town, 'The Downs'), Population: 'about 400', Danger: 'risky' };
    const guided = buildRecord('Millford', town, facts, written);
    expect(guided.fields.find(([k]) => k === 'Region')).toEqual(['Region', 'The Downs']);
    expect(guided.fields.map(([k]) => k)).toEqual(town.facts.map((f) => f.name));
    // A skipped section stays as its heading, with its guidance in a comment.
    const skipped = sections.find((s, i) => i > 0 && !s.gm)!;
    expect(guided.body).toContain(`## ${skipped.heading}\n\n${toWrite(skipped.guidance)}`);
    expect(toWriteNotes(guided.body)).toHaveLength(sections.length - 2);
    const a = (
      await request(gm)
        .post('/api/entities')
        .send({ name: 'Millford', type: 'settlement', realm: 'world', parent_id: region.id, ...guided })
    ).body;
    expect(a).toMatchObject({ name: 'Millford', type: 'settlement', parent_id: region.id, canon_status: 'CANON' });
    expect(a.body).toBe(guided.body);

    // Advanced: the template's Markdown with the header filled in, written in the editor, read back.
    const md = draftMarkdown({ name: 'Ashford', category: 'Settlement', realm: 'The World', parent: 'The Downs', canon: 'CANON' }, town, facts, written);
    expect(md.split('\n').slice(0, 5)).toEqual(['Name: Ashford', 'Category: Settlement', 'Parent: The Downs', 'Continent or Realm: The World', 'Canon Status: CANON']);
    const d = parseDraft(md.replace('Population: about 400', 'Population: about 900'));
    expect(d.header).toMatchObject({ name: 'Ashford', category: 'Settlement', parent: 'The Downs', realm: 'The World', canon: 'CANON' });
    expect(d.fields.map(([k]) => k)).toEqual(town.facts.map((f) => f.name));
    expect(d.fields.find(([k]) => k === 'Population')).toEqual(['Population', 'about 900']);
    expect(d.body).toBe(guided.body.replace('# Millford', '# Ashford'));
    const b = (await request(gm).post('/api/entities').send({ name: d.header.name, type: 'settlement', realm: 'world', parent_id: region.id, fields: d.fields, body: d.body })).body;
    expect(b.canon_status).toBe('CANON');
    // Both ways make the same kind of record.
    expect(b.fields.map(([k]: [string]) => k)).toEqual(a.fields.map(([k]: [string]) => k));
    expect(b.body.replace('Ashford', 'Millford')).toBe(a.body);

    // Players never see the notes still to write, nor the GM-only section, even when it is all revealed.
    updateEntity(ctx.db, a.id, { revealed: true, revealed_sections: sections.map((s) => (s.gm ? `${s.heading} (GM only)` : s.heading)) });
    const player = (await request(createApp(new AppContext(ctx.paths, 'player'))).get(`/api/player/entities/${a.id}`)).body;
    const text = JSON.stringify(player);
    expect(text).not.toContain('To write');
    expect(text).not.toContain('<!--');
    expect(text).not.toContain('raiders');
    expect(player.sections.find((s: { heading: string }) => s.heading === skipped.heading).content).toBe('');
    expect(text).toContain('green valley');
  });

  it('starts new records Proposed where Canon Review is on: an imported archive, or by choice', async () => {
    const { ctx, gm } = await setup();
    // A library built from an imported archive protects its source.
    ctx.db.prepare(`INSERT INTO import_runs (source_name, status) VALUES ('archive.zip', 'completed')`).run();
    expect(canonReview(ctx.db)).toBe(true);
    const p = createEntity(ctx.db, { name: 'Draft town', type: 'settlement', realm: 'world' } as never);
    expect(p.canon_status).toBe('PROPOSED');
    expect(p.tags).toContain('status/proposed');
    expect((ctx.db.prepare(`SELECT COUNT(*) n FROM proposals WHERE entity_id = ?`).get(p.id) as { n: number }).n).toBe(1);
    // An explicit status is kept either way.
    expect(createEntity(ctx.db, { name: 'Sure town', type: 'settlement', realm: 'world', canon_status: 'CANON' } as never).canon_status).toBe('CANON');
    // Settings → Canon switches it off, and back to following the library's origin.
    await request(gm).put('/api/settings').send({ canon_review: 'off' });
    expect((await request(gm).get('/api/meta')).body.canonReview).toBe(false);
    expect(createEntity(ctx.db, { name: 'Own town', type: 'settlement', realm: 'world' } as never).canon_status).toBe('CANON');
    await request(gm).put('/api/settings').send({ canon_review: 'auto' });
    expect((await request(gm).get('/api/settings')).body.canon_review).toBeUndefined();
    expect(canonReview(ctx.db)).toBe(true);
    // In your own world it can be switched on too.
    const own = tempContext();
    await request(createApp(own)).put('/api/settings').send({ canon_review: 'on' });
    expect(createEntity(own.db, { name: 'Idea', type: 'settlement', realm: 'world' } as never).canon_status).toBe('PROPOSED');
  });

  it('reads comments out of text for players, and an Advanced draft with no header', () => {
    expect(stripComments('a\n<!-- To write: b -->\nc')).toBe('a\nc');
    expect(toWrite('Say what --> it is')).toBe('<!-- To write: Say what —> it is -->');
    const d = parseDraft('# Just a heading\n\n## Overview\n\nText');
    expect(d.header.name).toBe('Just a heading');
    expect(d.fields).toEqual([]);
  });
});
