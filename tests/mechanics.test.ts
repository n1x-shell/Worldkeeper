/** Campaign mechanics switches, and a standard D&D campaign run from the GM's books: treasure, encounters, options. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { fakeFivetools } from './fakeFivetools.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { creatureMentions, suggestEncounters, xpBudget } from '../server/src/repo/encounters.js';
import { itemNameCandidates } from '../server/src/repo/bookData.js';

async function withBooks() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const scan = (await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body;
  await request(gm)
    .post('/api/rules/5etools/import')
    .send({ token: scan.token, books: ['XPHB', 'XMM', 'XDMG'] });
  return { ctx, gm };
}

describe('campaign mechanics', () => {
  it('start as standard D&D in a library without the setting, and as the setting in one with it', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    expect((await request(gm).get('/api/mechanics')).body).toEqual({ setting: false, thinning: false, theReturn: false, fading: false, worldTreasure: false });
    createEntity(ctx.db, { id: 'SYS-907', name: 'Thinning', type: 'system', realm: 'aetheris', canon_status: 'CANON', aliases: [], tags: [], fields: [], body: 'x', notes: '' } as never);
    expect((await request(gm).get('/api/mechanics')).body.thinning).toBe(true);
    // The GM's choice sticks, and reaches the table server and the published handbook.
    const m = (await request(gm).put('/api/mechanics').send({ thinning: false, fading: false, nonsense: true })).body;
    expect(m).toEqual({ setting: true, thinning: false, theReturn: true, fading: false, worldTreasure: true });
    expect((await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/player/info')).body.mechanics).toEqual(m);
    expect(playerSnapshot(ctx.db).mechanics).toEqual(m);
  });

  it('rolls treasure from the books when the setting’s treasure is off', async () => {
    const { gm } = await withBooks();
    const opts = (await request(gm).get('/api/treasure/options')).body;
    expect(opts.regions).toEqual([{ key: 'books', label: 'From your books', ids: [] }]);
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

  it('reads item names the way the world writes them', () => {
    expect(itemNameCandidates('Spell Scroll (2nd level)')).toContain('spell scroll (level 2)');
    expect(itemNameCandidates('Ioun Stone (Mastery)')).toContain('ioun stone, mastery');
    expect(itemNameCandidates('Potion of Giant Strength (Hill)')).toContain('potion of hill giant strength');
    expect(itemNameCandidates('Weapon, +3 (blessed by the Order)')).toContain('+3 weapon');
    expect(itemNameCandidates('Orb of Direction (XGE), a needle in a glass bead')).toContain('orb of direction');
  });
});
