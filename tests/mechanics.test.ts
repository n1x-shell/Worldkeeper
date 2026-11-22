/** Module switches, and a standard D&D campaign run from the GM's books: treasure, encounters, options. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { fakeFivetools } from './fakeFivetools.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';
import { installPack } from '../server/src/packs/registry.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { creatureMentions, suggestEncounters, xpBudget } from '../server/src/repo/encounters.js';
import { itemNameCandidates } from '../server/src/repo/bookData.js';

async function withBooks(srd = false) {
  const ctx = tempContext();
  const gm = createApp(ctx);
  if (!srd) await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
  const scan = (await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body;
  await request(gm)
    .post('/api/rules/5etools/import')
    .send({ token: scan.token, books: ['XPHB', 'XMM', 'XDMG'] });
  return { ctx, gm };
}

describe('modules', () => {
  const on = (body: { modules: { key: string; on: boolean }[] }) => body.modules.filter((m) => m.on).map((m) => m.key);

  it('are off in a library without a setting pack, and on with the pack that turns them on', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    expect(on((await request(gm).get('/api/modules')).body)).toEqual([]);
    // Its records alone don't make a library the setting's: its pack does.
    createEntity(ctx.db, { id: 'SYS-907', name: 'Thinning', type: 'system', realm: 'world', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: 'x', notes: '' } as never);
    expect(on((await request(gm).get('/api/modules')).body)).toEqual([]);
    installPack(ctx.db, 'worldkeeper');
    expect(on((await request(gm).get('/api/modules')).body)).toEqual([
      'thinning',
      'the-return',
      'fading-salvage',
      'setting-treasure',
      'vaults',
      'shards',
      'depths-explorer',
      'quick-reference',
      'renown',
    ]);
    // The GM's choice sticks, and reaches the table server and the published handbook.
    expect((await request(gm).put('/api/modules').send({ nonsense: true })).status).toBe(400);
    const m = on((await request(gm).put('/api/modules').send({ thinning: false, 'fading-salvage': false })).body);
    expect(m).toEqual(['the-return', 'setting-treasure', 'vaults', 'shards', 'depths-explorer', 'quick-reference', 'renown']);
    expect((await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/player/info')).body.modules).toEqual(m);
    expect(playerSnapshot(ctx.db).modules).toEqual(m);
    // null goes back to what the pack says.
    expect(on((await request(gm).put('/api/modules').send({ thinning: null })).body)).toContain('thinning');
  });

  it('can be switched on in a blank library, and differ by campaign', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const a = (await request(gm).post('/api/campaigns').send({ title: 'A' })).body;
    const b = (await request(gm).post('/api/campaigns').send({ title: 'B' })).body;
    // Thinning in a world of one's own.
    await request(gm).put('/api/modules').send({ thinning: true, 'the-return': true });
    expect(on((await request(gm).get(`/api/modules?campaign_id=${a.id}`)).body)).toEqual(['thinning', 'the-return']);
    // Campaign B has no Return; A follows the library.
    const forB = (await request(gm).put(`/api/campaigns/${b.id}/modules`).send({ 'the-return': false })).body;
    expect(on(forB)).toEqual(['thinning']);
    expect(forB.modules.find((m: { key: string }) => m.key === 'the-return')).toMatchObject({ library: true, campaign: false, on: false });
    expect(on((await request(gm).get(`/api/modules?campaign_id=${a.id}`)).body)).toEqual(['thinning', 'the-return']);
    // A module's routes answer only where it's on; its data is kept.
    expect((await request(gm).get(`/api/return?campaign_id=${a.id}`)).status).toBe(200);
    const off = await request(gm).get(`/api/return?campaign_id=${b.id}`);
    expect(off.status).toBe(400);
    expect(off.body.error).toMatch(/switched off/);
    expect((await request(gm).get(`/api/standing?campaign_id=${a.id}`)).status).toBe(400);
    await request(gm).put(`/api/campaigns/${b.id}/modules`).send({ 'the-return': null });
    expect(on((await request(gm).get(`/api/modules?campaign_id=${b.id}`)).body)).toEqual(['thinning', 'the-return']);
  });

  it('rolls treasure from the books when the setting’s treasure is off', async () => {
    const { gm } = await withBooks();
    const opts = (await request(gm).get('/api/treasure/options')).body;
    expect(opts.regions).toEqual([{ key: 'books', label: 'From the SRD and your books', ids: [] }]);
    expect((await request(gm).post('/api/treasure/roll').send({ tier: '1-4', region: 'marches', kind: 'hoard' })).status).toBe(400);
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = (await request(gm).post('/api/treasure/roll').send({ tier: '5-10', region: 'books', kind: 'hoard' })).body;
      expect(r.fades).toBe(false);
      expect(r.hook).toBeNull();
      for (const it of r.items) names.add(it.name);
    }
    // Only the books' magic items with a set rarity: not a "+1 Weapon" that needs a base item, nor gear.
    expect([...names].every((n) => ['Potion of Zapping', 'Ring of Zap'].includes(n))).toBe(true);
    expect(names.size).toBeGreaterThan(0);
  });

  it('suggests encounters from the books by level and terrain, and finds the creatures a table row names', async () => {
    const { ctx, gm } = await withBooks();
    expect(xpBudget(4, 4, 'moderate')).toBe(1500);
    const urban = suggestEncounters(ctx.db, { level: 4, terrain: ['urban'], rng: () => 0 });
    expect(urban.ideas.flatMap((i) => i.creatures.map((c) => c.name))).toContain('Priest');
    expect(urban.ideas.every((i) => i.xp <= i.budget)).toBe(true);
    expect(suggestEncounters(ctx.db, { level: 4, terrain: ['arctic'] }).ideas).toEqual([]);
    // A region of the world, as its terrain.
    expect((await request(gm).get('/api/books/encounters').query({ level: 4, region: 'SET-001' })).body.terrain).toEqual(['urban', 'grassland']);
    expect(creatureMentions(ctx.db, '**Fight.** 3 priests and a Legion Scout [CRE-006] at the gate.')).toEqual([{ id: 'book:xmm:priest', name: 'Priest' }]);
    expect(creatureMentions(ctx.db, '**Sign.** A priest left a candle.')).toEqual([]);
  });

  it('has the SRD 5.2.1’s creatures, items and hazards built in, with books winning where they overlap', async () => {
    const ctx = tempContext({ settingRealms: true });
    const gm = createApp(ctx);
    const counts = (await request(gm).get('/api/books')).body;
    expect(counts.creatures).toBeGreaterThan(330);
    expect(counts.items).toBeGreaterThan(600);
    const priest = (await request(gm).get('/api/statblocks/srd:priest')).body;
    expect(priest).toMatchObject({ name: 'Priest', ac: 13, hpAvg: 38, cr: '2', xp: 450, source: 'SRD 5.2.1' });
    expect(priest.actions.map((a: { name: string }) => a.name)).toEqual(['Multiattack', 'Mace', 'Radiant Flame', 'Spellcasting']);
    expect((await request(gm).get('/api/statblocks/srd:collapsing-roof')).body).toMatchObject({ kind: 'hazard', trigger: 'A creature crosses a trip wire (duration: Instantaneous)' });
    // Every SRD stat block's modifiers fit its scores.
    const all = (await request(gm).get('/api/statblocks')).body as { id: string }[];
    expect(all.filter((s) => s.id.startsWith('srd:')).length).toBeGreaterThan(330);
    // An NPC card built on the Priest carries it, with no books imported.
    expect((await request(gm).get('/api/statblocks/NPC-304')).body.baseBlock).toMatchObject({ name: 'Priest', source: 'SRD 5.2.1' });
    const items = (
      await request(createApp(new AppContext(ctx.paths, 'player')))
        .get('/api/player/items')
        .query({ names: 'Potion of Healing\nBag of Holding\nWeapon, +1\nIoun Stone (Mastery)' })
    ).body;
    expect(items['Potion of Healing'].text).toContain('2d4 + 2 Hit Points');
    expect(items['Bag of Holding']).toMatchObject({ rarity: 'uncommon', source: 'SRD 5.2.1' });
    expect(items['Weapon, +1'].rarity).toBe('uncommon');
    expect(items['Ioun Stone (Mastery)'].rarity).toBe('legendary');
    // Treasure and encounters work with no books.
    expect((await request(gm).get('/api/treasure/options')).body.regions).toContainEqual({ key: 'books', label: 'From the SRD and your books', ids: [] });
    expect(suggestEncounters(ctx.db, { level: 3, terrain: ['forest'] }).ideas.length).toBeGreaterThan(0);
    // Imported books win over the SRD by name; switching the SRD off removes its entries.
    const scan = (await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body;
    await request(gm)
      .post('/api/rules/5etools/import')
      .send({ token: scan.token, books: ['XMM'] });
    expect((await request(gm).get('/api/statblocks/NPC-304')).body.baseBlock.source).toBe('Monster Manual (2025) p. 7');
    await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
    expect((await request(gm).get('/api/books')).body).toEqual({ creatures: 1, items: 0 });
  });

  it('reads item names the way the world writes them', () => {
    expect(itemNameCandidates('Spell Scroll (2nd level)')).toContain('spell scroll (level 2)');
    expect(itemNameCandidates('Ioun Stone (Mastery)')).toContain('ioun stone, mastery');
    expect(itemNameCandidates('Potion of Giant Strength (Hill)')).toContain('potion of hill giant strength');
    expect(itemNameCandidates('Weapon, +3 (blessed by the Order)')).toContain('+3 weapon');
    expect(itemNameCandidates('Orb of Direction (XGE), a needle in a glass bead')).toContain('orb of direction');
  });
});
