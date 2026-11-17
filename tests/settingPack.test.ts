/** The Worldkeeper setting pack: the setting's creatures and items as a built-in pack, with standard-rules versions. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { bookCreature, itemByName } from '../server/src/repo/bookData.js';

describe('the Worldkeeper setting pack', () => {
  it('is off until turned on, then brings the setting’s creatures, hazards and items', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const pack = () =>
      request(gm)
        .get('/api/rules/packs')
        .then((r) => r.body.find((p: { id: string }) => p.id === 'worldkeeper'));
    expect(await pack()).toMatchObject({ name: 'The Worldkeeper setting', enabled: false, builtin: true, source: 'The Worldkeeper contributors, CC BY 4.0 (built in)' });
    expect(bookCreature(ctx.db, 'wk:CRE-313')).toBeNull();
    await request(gm).patch('/api/rules/packs/worldkeeper').send({ enabled: true });
    const p = await pack();
    expect(p.enabled).toBe(true);
    expect(p.counts.creature).toBe(92);
    expect(p.counts.item).toBe(34);
    expect((await request(gm).delete('/api/rules/packs/worldkeeper')).status).toBe(400);
    expect(itemByName(ctx.db, "Widow's Ring")).toMatchObject({ rarity: 'uncommon', attunement: 'requires attunement', source: 'The Worldkeeper setting pack (CC BY 4.0)' });
    expect(itemByName(ctx.db, 'Name-thread')?.type).toBe('Wondrous Item');
  });

  it('uses the standard-rules versions when Thinning is switched off', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).patch('/api/rules/packs/worldkeeper').send({ enabled: true });
    // A library without the setting starts as standard D&D: Thinning is off.
    const thing = (await request(gm).get('/api/statblocks/wk:CRE-313')).body;
    expect(thing.traits.find((t: { name: string }) => t.name === 'Fraying Touch').text).toMatch(/^A creature reduced to 0 Hit Points by the Thing makes a DC 13 Charisma saving throw/);
    expect(JSON.stringify(thing)).not.toMatch(/Thinning/);
    expect((await request(gm).get('/api/statblocks/wk:CRE-354')).body.effect).toMatch(/DC 15 Charisma saving throw/);
    expect(itemByName(ctx.db, 'Name-thread')?.text).toBe('Single use. When you fail a Charisma saving throw, you succeed instead, and the thread snaps.');
    expect(itemByName(ctx.db, 'Worldscar Key')?.text).toMatch(/DC 15 Charisma saving throw/);
    // With Thinning on, the originals.
    await request(gm).put('/api/mechanics').send({ thinning: true });
    expect((await request(gm).get('/api/statblocks/wk:CRE-313')).body.traits.find((t: { name: string }) => t.name === 'Thinning Touch')).toBeTruthy();
    expect(itemByName(ctx.db, 'Worldscar Key')?.text).toMatch(/Each use costs a Thinning save/);
  });
});
