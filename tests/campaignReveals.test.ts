/** Reveals per campaign (docs/LIBRARIES_PLAN.md step A1): two groups in one world see only what each has learned. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity, updateEntity } from '../server/src/repo/entities.js';
import { campaigns, setActiveCampaign } from '../server/src/repo/campaigns.js';
import { revealMapPartToCampaign, revealToCampaign, whoKnows } from '../server/src/repo/reveals.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { exportCampaign } from '../server/src/backup/exporter.js';

function twoGroups() {
  const ctx = tempContext();
  const rec = (id: string, name: string, body: string) =>
    createEntity(ctx.db, { id, name, type: 'settlement', realm: 'world', canon_status: 'CANON', aliases: [], tags: [], fields: [], body, notes: '' } as never);
  rec('SET-0001', 'Harrowgate', '# Harrowgate\n\n## A first look\n\nMill wheels.\n\n## The docks\n\nSmugglers land here.\n\n## Secrets (GM only)\n\nThe reeve sells grain.');
  rec('SET-0002', 'Ashford', '# Ashford\n\n## A first look\n\nA burned town. Near @[Harrowgate].');
  rec('SET-0003', 'Coldwater', '# Coldwater\n\n## A first look\n\nA lake town, three days from @[Ashford].');
  const a = (campaigns.create(ctx.db, { title: 'Table A' }) as { id: number }).id;
  const b = (campaigns.create(ctx.db, { title: 'Table B' }) as { id: number }).id;
  // Common knowledge: Harrowgate and its first look, revealed to everyone (as every reveal before v0.6 is).
  updateEntity(ctx.db, 'SET-0001', { revealed: true, revealed_sections: ['A first look'] });
  // Table A learned of Ashford, and the docks of Harrowgate.
  revealToCampaign(ctx.db, a, 'SET-0002', { sections: ['A first look'], facts: ['Ashford burned two winters ago.'] });
  revealToCampaign(ctx.db, a, 'SET-0001', { sections: ['The docks'] });
  // Table B learned of Coldwater.
  revealToCampaign(ctx.db, b, 'SET-0003', { sections: ['A first look'] });
  const player = createApp(new AppContext(ctx.paths, 'player'));
  return { ctx, a, b, player };
}

const names = (body: { name: string }[]) => body.map((e) => e.name).sort();

describe('reveals per campaign', () => {
  it('shows each group what’s revealed to everyone and what it learned, never the other group’s', async () => {
    const { ctx, a, b, player } = twoGroups();
    setActiveCampaign(ctx.db, a);
    expect(names((await request(player).get('/api/player/entities')).body)).toEqual(['Ashford', 'Harrowgate']);
    const harrowA = (await request(player).get('/api/player/entities/SET-0001')).body;
    expect(harrowA.sections.map((s: { heading: string }) => s.heading)).toEqual(['A first look', 'The docks']);
    expect(JSON.stringify(harrowA)).not.toContain('reeve');
    expect((await request(player).get('/api/player/entities/SET-0002')).body.facts).toEqual(['Ashford burned two winters ago.']);
    expect((await request(player).get('/api/player/entities/SET-0003')).status).toBe(404);
    expect(names((await request(player).get('/api/player/search?q=town')).body)).toEqual(['Ashford']);

    setActiveCampaign(ctx.db, b);
    expect(names((await request(player).get('/api/player/entities')).body)).toEqual(['Coldwater', 'Harrowgate']);
    const harrowB = (await request(player).get('/api/player/entities/SET-0001')).body;
    expect(harrowB.sections.map((s: { heading: string }) => s.heading)).toEqual(['A first look']);
    expect((await request(player).get('/api/player/entities/SET-0002')).status).toBe(404);
    // A link to a record this group hasn't learned of is only its name.
    const cold = (await request(player).get('/api/player/entities/SET-0003')).body;
    expect(cold.sections[0].content).toContain('three days from Ashford');
    expect(cold.sections[0].content).not.toContain('/player/e/SET-0002');
    expect(names((await request(player).get('/api/player/search?q=smugglers')).body)).toEqual([]);

    // The published handbook (a demo) shows only what's revealed to everyone.
    expect(names(playerSnapshot(ctx.db).entities)).toEqual(['Harrowgate']);
    // The GM can see who knows what.
    expect(whoKnows(ctx.db, 'SET-0001')).toEqual([{ campaign_id: a, title: 'Table A', sections: ['The docks'], facts: [] }]);
  });

  it('shows maps, pins and outlines per campaign too', async () => {
    const { ctx, a, b, player } = twoGroups();
    const map = Number(ctx.db.prepare(`INSERT INTO maps (name, kind, width, height, player_visible) VALUES ('The Downs', 'image', 100, 100, 0)`).run().lastInsertRowid);
    const pin = Number(ctx.db.prepare(`INSERT INTO map_markers (map_id, entity_id, label, x, y, hidden) VALUES (?, 'SET-0002', 'Ashford', 10, 10, 1)`).run(map).lastInsertRowid);
    revealMapPartToCampaign(ctx.db, a, 'map', map, true);
    revealMapPartToCampaign(ctx.db, a, 'marker', pin, true);
    setActiveCampaign(ctx.db, a);
    const mapsA = (await request(player).get('/api/player/maps')).body;
    expect(mapsA.map((m: { name: string }) => m.name)).toEqual(['The Downs']);
    expect(mapsA[0].markers).toMatchObject([{ label: 'Ashford', entity_id: 'SET-0002' }]);
    setActiveCampaign(ctx.db, b);
    expect((await request(player).get('/api/player/maps')).body).toEqual([]);
    revealMapPartToCampaign(ctx.db, a, 'marker', pin, false);
    setActiveCampaign(ctx.db, a);
    expect((await request(player).get('/api/player/maps')).body[0].markers).toEqual([]);
  });

  it('refuses GM-only sections, can take a record back, and goes with the campaign', async () => {
    const { ctx, a } = twoGroups();
    expect(() => revealToCampaign(ctx.db, a, 'SET-0001', { sections: ['Secrets (GM only)'] })).toThrow(/GM only/);
    revealToCampaign(ctx.db, a, 'SET-0002', { hide: true });
    expect(whoKnows(ctx.db, 'SET-0002')).toEqual([]);

    // A campaign export carries what its players learned; importing it gives the copy the same.
    const data = exportCampaign(ctx.db, a);
    expect(data.campaign_reveals).toHaveLength(1);
    await request(createApp(ctx))
      .post('/api/import/json')
      .attach('file', Buffer.from(JSON.stringify(data)), 'a.json');
    expect(
      whoKnows(ctx.db, 'SET-0001')
        .map((w) => w.title)
        .sort(),
    ).toEqual(['Table A', 'Table A (imported)']);
    // Deleting a campaign forgets what it learned.
    ctx.db.prepare('DELETE FROM campaigns WHERE id = ?').run(a);
    expect(whoKnows(ctx.db, 'SET-0001').map((w) => w.title)).toEqual(['Table A (imported)']);
  });

  it('leaves a library with reveals from before unchanged: everything stays common knowledge', async () => {
    const ctx = tempContext();
    createEntity(ctx.db, {
      id: 'SET-0009',
      name: 'Oldtown',
      type: 'settlement',
      realm: 'world',
      canon_status: 'CANON',
      aliases: [],
      tags: [],
      fields: [],
      body: '## Overview\n\nOld.',
      notes: '',
    } as never);
    updateEntity(ctx.db, 'SET-0009', { revealed: true, revealed_sections: ['Overview'] });
    const one = (campaigns.create(ctx.db, { title: 'One' }) as { id: number }).id;
    const two = (campaigns.create(ctx.db, { title: 'Two' }) as { id: number }).id;
    const player = createApp(new AppContext(ctx.paths, 'player'));
    for (const c of [one, two, null]) {
      setActiveCampaign(ctx.db, c);
      expect((await request(player).get('/api/player/entities/SET-0009')).body.sections).toEqual([{ heading: 'Overview', content: 'Old.' }]);
    }
  });
});
