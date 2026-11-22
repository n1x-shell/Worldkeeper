/** Importing rules from a 5etools copy. The data here is a tiny made-up stand-in in 5etools' shape, not real book text. */
import AdmZip from 'adm-zip';
import { fakeFivetools } from './fakeFivetools.js';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';
import { plainTags, renderEntries } from '../server/src/repo/fivetools.js';
import { playerSnapshot } from '../server/src/player/projection.js';

describe('importing from 5etools', () => {
  it('turns 5etools tags and entries into plain text', () => {
    expect(plainTags('Take {@damage 2d6} on a {@dc 15} save; {@hit 5} to hit, {@spell fire bolt|XPHB|Fire Bolt}.')).toBe('Take 2d6 on a DC 15 save; +5 to hit, Fire Bolt.');
    expect(plainTags('{@filter Warlock cantrips|spells|level=0}')).toBe('Warlock cantrips');
    expect(renderEntries([{ type: 'list', items: [{ type: 'item', name: 'Feat:', entry: 'Alert' }, 'plain'] }])).toEqual(['• Feat: Alert', '• plain']);
  });

  it('takes only your books, prefers the newest printing, and adds older species only when the world names them', async () => {
    const ctx = tempContext({ settingRealms: true });
    createEntity(ctx.db, {
      name: 'Old Folk',
      type: 'people',
      realm: 'aetheris',
      canon_status: 'CANON',
      aliases: [],
      tags: [],
      fields: [],
      body: '**At the table.** Use the oldling rules.',
      notes: '',
    });
    const gm = createApp(ctx);
    const scan = await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'fivetools.zip');
    expect(scan.status).toBe(200);
    expect(scan.body.books.map((b: { id: string }) => b.id).sort()).toEqual(['PHB', 'TCE', 'VGM', 'WoW', 'XDMG', 'XMM', 'XPHB']);
    expect(scan.body.books.find((b: { id: string }) => b.id === 'XMM').counts).toEqual({ creature: 1 });
    expect(scan.body.books.find((b: { id: string }) => b.id === 'XPHB').counts).toMatchObject({ spell: 1, species: 1, class: 1, feat: 2, background: 1 });
    expect(scan.body.chosen).toContain('XPHB');
    const r = await request(gm)
      .post('/api/rules/5etools/import')
      .send({ token: scan.body.token, books: ['XPHB', 'TCE'] });
    expect(r.status).toBe(200);
    // The uploaded copy is gone, and the choice is remembered.
    expect(
      (
        await request(gm)
          .post('/api/rules/5etools/import')
          .send({ token: scan.body.token, books: ['XPHB'] })
      ).status,
    ).toBe(400);
    expect((await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body.chosen.sort()).toEqual(['TCE', 'XPHB']);
    expect(r.body.result.counts).toMatchObject({ spell: 1, species: 2, class: 1, subclass: 1, feat: 2, background: 1 });
    expect(r.body.result.legacySpecies).toEqual(['Oldling (VGM)']);
    const rules = (await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/player/rules')).body;
    expect(rules.spells.find((s: { name: string }) => s.name === 'Fel Bolt')).toBeUndefined();
    expect(rules.spells.find((s: { name: string }) => s.name === 'Zap Bolt')).toMatchObject({
      classes: ['Wizard'],
      time: 'Action or Ritual',
      range: '60 feet',
      components: 'V, M (a spark)',
      duration: 'Concentration, up to 1 minute',
      concentration: true,
      ritual: true,
      text: 'Hits for 2d6.\n\nUsing a Higher-Level Spell Slot. +1d6 per level.',
    });
    expect(rules.species.Testling).toMatchObject({ size: ['Small', 'Medium'], speed: 30, source: "Player's Handbook (2024) p. 9" });
    expect(rules.species.Testling.traits).toEqual([
      { name: 'Speeds', text: 'Fly 30 ft.' },
      { name: 'Zap', text: 'Deal 1d4 to a Prone foe, DC 12.' },
    ]);
    expect(rules.species.Oldling.source).toContain('older printing');
    expect(rules.species.Homebrewling).toBeUndefined();
    expect(rules.classes.Wizard.features).toEqual([{ level: 1, name: 'Zap Training', text: 'Learn Zap Bolt.' }]);
    expect(rules.classes.Wizard.subclasses.Zapper).toMatchObject({ about: 'Masters of zapping.', features: [{ level: 2, name: 'Big Zap', text: 'Zap harder.' }] });
    expect(rules.feats['Zap Lord']).toMatchObject({ category: 'General', prerequisite: 'Level 4+, Intelligence 13+' });
    expect(rules.backgrounds['Zap Scholar']).toMatchObject({
      abilities: ['Intelligence', 'Wisdom', 'Charisma'],
      feat: 'Magic Initiate (Wizard)',
      skills: ['Arcana', 'History'],
      equipment: 'Choose A or B: (A) Quarterstaff, 8 Parchment, 8 GP; or (B) 50 GP',
    });
    // Like every pack, none of it reaches the published handbook.
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('Zap');
  });

  it('brings in creatures as stat blocks and items with their rules, for the GM, the tracker, treasure and sheets', async () => {
    const ctx = tempContext({ settingRealms: true });
    const gm = createApp(ctx);
    // The books alone (the built-in SRD's creatures and items are tested in mechanics.test.ts).
    await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
    const scan = (await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body;
    const r = await request(gm)
      .post('/api/rules/5etools/import')
      .send({ token: scan.token, books: ['XPHB', 'XMM', 'XDMG'] });
    expect(r.body.result.counts).toMatchObject({ creature: 1, item: 6 });
    expect((await request(gm).get('/api/books')).body).toEqual({ creatures: 1, items: 6 });

    // A creature is a stat block in the app's own shape.
    const index = (await request(gm).get('/api/statblocks')).body as { id: string; name: string; book?: boolean }[];
    expect(index.find((s) => s.book)).toMatchObject({ id: 'book:xmm:priest', name: 'Priest', cr: '2', ac: 13, hp: 20, init: 4 });
    expect(index.some((s) => !s.book)).toBe(true);
    const priest = (await request(gm).get('/api/statblocks/book:xmm:priest')).body;
    expect(priest).toMatchObject({
      meta: 'Medium Humanoid (Cleric), Neutral',
      hp: '20 (4d8 + 2)',
      speed: '30 ft., Fly 10 ft. (hover)',
      ab: [10, 14, 12, 10, 16, 10],
      xp: 450,
      pb: 2,
      skills: 'Religion +4',
      res: 'Fire, Cold while praying',
      imm: 'Charmed',
      gear: 'Mace',
      senses: 'Darkvision 60 ft., Passive Perception 13',
      source: 'Monster Manual (2025) p. 7',
    });
    expect(priest.actions).toEqual([
      { name: 'Smite', text: 'Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Radiant damage.' },
      { name: 'Spellcasting', text: 'The priest casts:\nAt will: Light\n1/Day each: Bless' },
    ]);
    // An NPC card built on the Priest carries the book's block.
    expect((await request(gm).get('/api/statblocks/NPC-304')).body.baseBlock).toMatchObject({ name: 'Priest', ac: 13 });

    // Items, by the names treasure and sheets use.
    const names = ['Arcane Focus (dagger)', 'Potion of Zapping', 'Weapon, +1', 'Flame Tongue Longsword', '2 Daggers', 'Ring of Zap (XDMG)', 'Nothing Real'];
    const items = (
      await request(createApp(new AppContext(ctx.paths, 'player')))
        .get('/api/player/items')
        .query({ names: names.join('\n') })
    ).body;
    expect(items['Potion of Zapping']).toMatchObject({ type: 'Potion', rarity: 'uncommon', value: 50, text: 'You zap for 2d4.', source: "Dungeon Master's Guide (2024) p. 290" });
    expect(items['Weapon, +1'].text).toBe('You have a +1 bonus to attack and damage rolls.');
    expect(items['Flame Tongue Longsword']).toMatchObject({ name: 'Flame Tongue Longsword', attunement: 'requires attunement', rarity: 'rare' });
    expect(items['Flame Tongue Longsword'].text).toContain('Longsword: Martial weapon. 1d8 Slashing damage. Versatile (1d10).');
    expect(items['2 Daggers'].text).toBe('Simple weapon. 1d4 Piercing damage. Finesse, Light, Thrown (20/60 ft.). Mastery: Nick.');
    expect(items['Ring of Zap (XDMG)'].attunement).toBe('requires attunement by a wizard');
    expect(items['Nothing Real']).toBeNull();
    expect(items['Arcane Focus (dagger)'].name).toBe('Dagger');

    // Creatures stay with the GM: not in the players' rules, the table server's other routes, or the handbook.
    const rules = JSON.stringify((await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/player/rules')).body);
    expect(rules).not.toContain('book:xmm');
    expect((await request(createApp(new AppContext(ctx.paths, 'player'))).get('/api/statblocks')).status).toBe(404);
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('book:xmm');
  });

  it('takes only the books you choose', async () => {
    const ctx = tempContext({ settingRealms: true });
    const gm = createApp(ctx);
    const scan = (await request(gm).post('/api/rules/5etools/scan').attach('data', fakeFivetools(), 'f.zip')).body;
    // Only the 2014 book: its Testling, not the 2024 one, and no 2024 spells.
    const r = await request(gm)
      .post('/api/rules/5etools/import')
      .send({ token: scan.token, books: ['PHB'] });
    expect(r.body.result.counts).toMatchObject({ species: 1 });
    expect(r.body.result.counts.spell).toBeUndefined();
    const rules = (await request(gm).get('/api/player/rules')).body;
    expect(rules.species.Testling.source).toBe("Player's Handbook (2014) p. 1");
    expect(
      (
        await request(gm)
          .post('/api/rules/5etools/import')
          .send({ token: 'nope', books: ['PHB'] })
      ).status,
    ).toBe(400);
  });

  it('refuses a zip that isn’t 5etools', async () => {
    const z = new AdmZip();
    z.addFile('readme.txt', Buffer.from('hi'));
    expect((await request(createApp(tempContext({ settingRealms: true }))).post('/api/rules/5etools/scan').attach('data', z.toBuffer(), 'x.zip')).status).toBe(400);
  });
});
