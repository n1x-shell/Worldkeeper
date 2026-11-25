/** Bulk tools (v0.9.13, docs/BETA_PLAN.md B7): tags, one change to many records, merging, and find-and-replace. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';

type App = ReturnType<typeof createApp>;
const make = async (gm: App, body: Record<string, unknown>) => (await request(gm).post('/api/entities').send({ type: 'npc', realm: 'world', ...body })).body as { id: string; version: number; tags: string[] };
const get = async (gm: App, id: string, follow = true) => (await request(gm).get(`/api/entities/${id}${follow ? '' : '?follow=0'}`)).body;

describe('tags across the library', () => {
  it('lists them, renames one everywhere, merges two and removes one', async () => {
    const gm = createApp(tempContext());
    const a = await make(gm, { name: 'Mara', tags: ['ally', 'harbour'] });
    const b = await make(gm, { name: 'Tam', tags: ['Ally', 'harbour', 'ferry'] });
    const tags = (await request(gm).get('/api/tags')).body as { tag: string; count: number; system: boolean }[];
    expect(tags.find((t) => t.tag === 'harbour')).toEqual({ tag: 'harbour', count: 2, system: false });
    expect(tags.find((t) => t.tag === 'status/canon')).toMatchObject({ count: 2, system: true });
    // The editable ones come first.
    expect(tags.findIndex((t) => t.system)).toBeGreaterThan(tags.findIndex((t) => t.tag === 'ferry'));

    expect((await request(gm).post('/api/tags/rename').send({ from: 'harbour', to: ' #docks ' })).body).toEqual({ changed: 2, merged: false });
    expect((await get(gm, a.id)).entity.tags).toContain('docks');
    // Renaming onto a tag that exists merges them, with no doubles.
    expect((await request(gm).post('/api/tags/rename').send({ from: 'Ally', to: 'ally' })).body).toEqual({ changed: 1, merged: true });
    expect((await get(gm, b.id)).entity.tags.filter((t: string) => t.toLowerCase() === 'ally')).toEqual(['ally']);
    expect((await request(gm).post('/api/tags/delete').send({ tag: 'ferry' })).body).toEqual({ changed: 1 });
    expect((await get(gm, b.id)).entity.tags).not.toContain('ferry');
    // Each record changed has the change in its history, and can be put back.
    const history = (await request(gm).get(`/api/entities/${b.id}/revisions`)).body as { change_type: string; reason: string }[];
    expect(history.filter((h) => h.change_type === 'bulk').map((h) => h.reason)).toEqual(expect.arrayContaining(['Tag “harbour” renamed “docks”', 'Tag “ferry” removed everywhere']));

    // The app's own tags aren't renamed or removed by hand; a tag nobody has isn't found.
    expect((await request(gm).post('/api/tags/rename').send({ from: 'status/canon', to: 'x' })).status).toBe(400);
    expect((await request(gm).post('/api/tags/rename').send({ from: 'docks', to: 'vis/player' })).status).toBe(400);
    expect((await request(gm).post('/api/tags/delete').send({ tag: 'realm/world' })).status).toBe(400);
    expect((await request(gm).post('/api/tags/rename').send({ from: 'nobody', to: 'x' })).status).toBe(404);
    expect((await request(gm).post('/api/tags/rename').send({ from: 'docks', to: '  ' })).status).toBe(400);
  });
});

describe('one change to many records', () => {
  it('tags, moves, sets canon, reveals and archives them together', async () => {
    const gm = createApp(tempContext());
    const town = await make(gm, { name: 'Harrowgate', type: 'settlement' });
    const a = await make(gm, { name: 'Mara', tags: ['old', 'status/canon', 'realm/world'] });
    const b = await make(gm, { name: 'Tam', tags: ['old'] });
    const ids = [a.id, b.id];
    const bulk = (action: Record<string, unknown>, which = ids) => request(gm).post('/api/entities/bulk').send({ ids: which, action });

    expect((await bulk({ do: 'tag', add: ['docks', ' Docks  crew '], remove: ['old'] })).body).toMatchObject({ changed: 2, unchanged: 0, skipped: [] });
    expect((await get(gm, a.id)).entity.tags).toEqual(expect.arrayContaining(['docks', 'Docks crew']));
    expect((await get(gm, a.id)).entity.tags).not.toContain('old');
    // The same again changes nothing, and says so.
    expect((await bulk({ do: 'tag', add: ['docks'] })).body).toMatchObject({ changed: 0, unchanged: 2 });

    expect((await bulk({ do: 'parent', parent_id: town.id })).body.changed).toBe(2);
    expect((await get(gm, town.id)).children.map((c: { id: string }) => c.id).sort()).toEqual([...ids].sort());
    // A record can't be put inside itself, or inside something that sits in it.
    expect((await bulk({ do: 'parent', parent_id: a.id }, [a.id, town.id, b.id])).body).toMatchObject({ changed: 1, skipped: [{ id: a.id }, { id: town.id }] });

    expect((await bulk({ do: 'canon', canon_status: 'PROPOSED' })).body.changed).toBe(2);
    const mara = (await get(gm, a.id)).entity;
    expect(mara.canon_status).toBe('PROPOSED');
    // The tag the app keeps for it follows.
    expect(mara.tags).toContain('status/proposed');
    expect(mara.tags).not.toContain('status/canon');

    expect((await bulk({ do: 'reveal', revealed: true })).body.changed).toBe(2);
    expect((await get(gm, b.id)).entity.revealed).toBe(true);
    expect((await bulk({ do: 'reveal', revealed: false }, [a.id])).body.changed).toBe(1);
    // To one campaign only: everyone else still doesn't know.
    const c = (await request(gm).post('/api/campaigns').send({ title: 'North' })).body;
    expect((await bulk({ do: 'reveal', revealed: true, campaign_id: c.id }, [a.id])).body).toMatchObject({ changed: 1 });
    expect((await request(gm).get(`/api/entities/${a.id}/reveals`)).body.campaigns.map((x: { campaign_id: number }) => x.campaign_id)).toEqual([c.id]);
    expect((await get(gm, a.id)).entity.revealed).toBe(false);
    expect((await bulk({ do: 'reveal', revealed: false, campaign_id: c.id }, [a.id])).body.changed).toBe(1);
    expect((await request(gm).get(`/api/entities/${a.id}/reveals`)).body.campaigns).toEqual([]);

    expect((await bulk({ do: 'archive', archived: true })).body.changed).toBe(2);
    expect((await request(gm).get('/api/entities')).body.map((e: { id: string }) => e.id)).toEqual([town.id]);

    // A mistake in the request changes nothing; a record that isn't there is passed over.
    expect((await bulk({ do: 'realm', realm: 'nowhere' })).status).toBe(400);
    expect((await bulk({ do: 'tag', add: ['status/canon'] })).status).toBe(400);
    expect((await bulk({ do: 'tag' })).status).toBe(400);
    expect((await bulk({ do: 'parent', parent_id: 'NOPE-1' })).status).toBe(404);
    expect((await bulk({ do: 'tag', add: ['x'] }, [town.id, 'NOPE-1'])).body).toMatchObject({ changed: 1, skipped: [{ id: 'NOPE-1' }] });
    expect((await bulk({ do: 'explode' })).status).toBe(400);
  });
});

describe('two records made one', () => {
  it('keeps one with the other’s names, facts, text and links, and leaves a redirect', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const town = await make(gm, { name: 'Harrowgate', type: 'settlement' });
    const keep = await make(gm, { name: 'Mara Venn', aliases: ['Mara'], tags: ['ally'], fields: [['Occupation', 'Fence']], body: 'A fence in the harbour.\n\n## Secrets\n\nShe reports to the keep.\n' });
    const dupe = await make(gm, {
      name: 'The Red Whisper',
      aliases: ['Whisper', 'mara'],
      tags: ['spy', 'ally', 'vis/gm'],
      parent_id: town.id,
      fields: [
        ['Occupation', 'Informer'],
        ['Age', '112'],
      ],
      body: 'Nobody has seen her face.',
      notes: 'Used in session 2.',
    });
    const child = await make(gm, { name: 'Whisper’s Runner', parent_id: dupe.id });
    const friend = await make(gm, { name: 'Old Tam', body: `Owes The Red Whisper [${dupe.id}] a favour, and @[The Red Whisper] knows it.` });
    const camp = (await request(gm).post('/api/campaigns').send({ title: 'North', starting_location_id: town.id })).body;
    const quest = (await request(gm).post('/api/quests').send({ campaign_id: camp.id, title: 'Find her', giver_id: dupe.id })).body;
    await request(gm).post('/api/entities/bulk').send({ ids: [dupe.id], action: { do: 'reveal', revealed: true, campaign_id: camp.id } });

    const res = await request(gm).post(`/api/entities/${keep.id}/merge`).send({ from: dupe.id });
    expect(res.status).toBe(200);
    expect(res.body.backup).toMatch(/pre-merge/);
    const m = res.body.entity;
    expect(m.aliases).toEqual(['Mara', 'The Red Whisper', 'Whisper']);
    expect(m.tags).toEqual(expect.arrayContaining(['ally', 'spy']));
    expect(m.tags.filter((t: string) => t === 'vis/gm')).toHaveLength(keep.tags.filter((t) => t === 'vis/gm').length);
    // A fact the kept record lacked is added; one that differs is written down, not lost and not overwritten.
    expect(m.fields).toEqual([
      ['Occupation', 'Fence'],
      ['Age', '112'],
    ]);
    expect(m.body).toContain('A fence in the harbour.');
    expect(m.body).toContain('## From The Red Whisper\n\n- **Occupation:** Informer\n\nNobody has seen her face.');
    expect(m.notes).toBe('Used in session 2.');

    // The other record is a redirect: its ID still leads here, and it has left the lists.
    const followed = await get(gm, dupe.id);
    expect(followed.entity.id).toBe(keep.id);
    expect((await get(gm, dupe.id, false)).entity).toMatchObject({ type: 'redirect', redirect_to: keep.id });
    expect((await request(gm).get('/api/entities')).body.map((e: { id: string }) => e.id)).not.toContain(dupe.id);
    // What pointed at it points here: what sat inside it, the quest it gave, what the campaign knew, links in text.
    expect((await get(gm, keep.id)).children.map((c: { id: string }) => c.id)).toEqual([child.id]);
    expect((await request(gm).get(`/api/quests?campaign_id=${camp.id}`)).body.find((q: { id: number }) => q.id === quest.id).giver_id).toBe(keep.id);
    expect((await request(gm).get(`/api/entities/${keep.id}/reveals`)).body.campaigns.map((x: { campaign_id: number }) => x.campaign_id)).toEqual([camp.id]);
    const rels = ctx.db.prepare(`SELECT source_id, target_id FROM relationships WHERE source_id = ? OR target_id = ?`).all(friend.id, friend.id) as { source_id: string; target_id: string }[];
    expect(rels.some((r) => r.target_id === keep.id || r.source_id === keep.id)).toBe(true);
    expect(ctx.db.prepare(`SELECT COUNT(*) n FROM relationships WHERE source_id = ? OR target_id = ?`).get(dupe.id, dupe.id)).toEqual({ n: 0 });
    // Its last state is in its history.
    expect((await request(gm).get(`/api/entities/${dupe.id}/revisions`)).body[0]).toMatchObject({ change_type: 'merge', reason: `Merged into Mara Venn (${keep.id})` });

    // Not with itself, not twice, not with what isn't there.
    expect((await request(gm).post(`/api/entities/${keep.id}/merge`).send({ from: keep.id })).status).toBe(400);
    expect((await request(gm).post(`/api/entities/${town.id}/merge`).send({ from: dupe.id })).status).toBe(400);
    expect((await request(gm).post(`/api/entities/${keep.id}/merge`).send({ from: 'NOPE-1' })).status).toBe(404);
  });

  it('doesn’t leave the kept record inside itself', async () => {
    const gm = createApp(tempContext());
    const region = await make(gm, { name: 'The Reach', type: 'region' });
    const outer = await make(gm, { name: 'Harrowgate', type: 'settlement', parent_id: region.id });
    const inner = await make(gm, { name: 'Harrowgate Town', type: 'settlement', parent_id: outer.id });
    const m = (await request(gm).post(`/api/entities/${inner.id}/merge`).send({ from: outer.id })).body.entity;
    expect(m.parent_id).toBe(region.id);
  });
});

describe('find and replace', () => {
  it('shows what would change, then changes only what was ticked', async () => {
    const gm = createApp(tempContext());
    const a = await make(gm, { name: 'Mara of Harrowgate', body: 'Born in Harrowgate.\nHarrowgate made her.\n', fields: [['Home', 'Harrowgate']] });
    const b = await make(gm, { name: 'Tam', body: 'Ferries folk to harrowgate and back.', notes: 'Harrowgates are not a thing.' });
    const c = await make(gm, { name: 'Elsewhere', body: 'Nothing to see.' });
    const find = (o: Record<string, unknown>) => request(gm).post('/api/find').send({ find: 'Harrowgate', replace: 'Harrowmouth', ...o });

    const all = (await find({})).body;
    expect(all.matches).toBe(5);
    expect(all.records.map((r: { id: string; count: number }) => [r.id, r.count])).toEqual([
      [a.id, 3],
      [b.id, 2],
    ]);
    expect(all.records[0]).toMatchObject({ where: ['Text (2)', 'Facts'], before: 'Born in Harrowgate.', after: 'Born in Harrowmouth.' });
    // Names are only touched when asked for; whole words and matching case narrow it.
    expect((await find({ parts: ['name'] })).body.records.map((r: { id: string }) => r.id)).toEqual([a.id]);
    expect((await find({ matchCase: true })).body.matches).toBe(4);
    expect((await find({ wholeWord: true })).body.matches).toBe(4);
    expect((await find({ type: 'settlement' })).body.records).toEqual([]);
    // Nothing has been written yet.
    expect((await get(gm, a.id)).entity.body).toContain('Born in Harrowgate.');

    const done = (await request(gm).post('/api/replace').send({ find: 'Harrowgate', replace: 'Harrowmouth', ids: [a.id] })).body;
    expect(done).toMatchObject({ changed: 1, matches: 3 });
    expect(done.backup).toMatch(/pre-replace/);
    const mara = (await get(gm, a.id)).entity;
    expect(mara.body).toBe('Born in Harrowmouth.\nHarrowmouth made her.\n');
    expect(mara.fields).toEqual([['Home', 'Harrowmouth']]);
    expect(mara.name).toBe('Mara of Harrowgate');
    expect((await get(gm, b.id)).entity.body).toContain('harrowgate');
    expect((await request(gm).get(`/api/entities/${a.id}/revisions`)).body[0]).toMatchObject({ change_type: 'bulk', reason: 'Find and replace: “Harrowgate” → “Harrowmouth”' });
    expect((await get(gm, c.id)).entity.version).toBe(c.version);

    // The words are taken as written: a dot is a dot, and "$1" in the replacement is "$1".
    await make(gm, { name: 'Prices', body: 'Costs 1.5 gp, or 125 gp for ten.' });
    expect((await request(gm).post('/api/find').send({ find: '1.5', replace: '$1' })).body.matches).toBe(1);
    await request(gm).post('/api/replace').send({ find: '1.5', replace: '$1' });
    expect((await request(gm).post('/api/find').send({ find: '$1 gp', replace: 'x' })).body.matches).toBe(1);
    // Renaming through it, and refusing to leave a record nameless or to replace a thing with itself.
    expect((await request(gm).post('/api/replace').send({ find: 'Tam', replace: 'Old Tam', parts: ['name'], wholeWord: true })).body.changed).toBe(1);
    expect((await get(gm, b.id)).entity.name).toBe('Old Tam');
    expect((await request(gm).post('/api/replace').send({ find: 'Elsewhere', replace: '', parts: ['name'] })).status).toBe(400);
    expect((await request(gm).post('/api/replace').send({ find: 'a', replace: 'a' })).status).toBe(400);
    expect((await request(gm).post('/api/find').send({ find: '' })).status).toBe(400);
  });
});
