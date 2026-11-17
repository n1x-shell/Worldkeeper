/** Importing rules from a 5etools copy. The data here is a tiny made-up stand-in in 5etools' shape, not real book text. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { createEntity } from '../server/src/repo/entities.js';
import { plainTags, renderEntries } from '../server/src/repo/fivetools.js';
import { playerSnapshot } from '../server/src/player/projection.js';

const json = (o: unknown) => Buffer.from(JSON.stringify(o));
function fakeFivetools() {
  const z = new AdmZip();
  const d = 'fake-main/data/';
  z.addFile(
    `${d}books.json`,
    json({
      book: [
        { id: 'XPHB', name: "Player's Handbook (2024)", published: '2024-09-17', group: 'core' },
        { id: 'PHB', name: "Player's Handbook (2014)", published: '2014-08-19', group: 'core' },
        { id: 'TCE', name: "Tasha's Cauldron of Everything", published: '2020-11-17', group: 'supplement' },
        { id: 'VGM', name: "Volo's Guide to Monsters", published: '2016-11-15', group: 'supplement' },
        { id: 'XMM', name: 'Monster Manual (2025)', published: '2025-02-18', group: 'core' },
        { id: 'XDMG', name: "Dungeon Master's Guide (2024)", published: '2024-11-12', group: 'core' },
      ],
    }),
  );
  z.addFile(
    `${d}races.json`,
    json({
      race: [
        {
          name: 'Testling',
          source: 'XPHB',
          page: 9,
          size: ['S', 'M'],
          speed: { walk: 30, fly: 30 },
          creatureTypes: ['humanoid'],
          entries: [{ type: 'entries', name: 'Zap', entries: ['Deal {@damage 1d4} to a {@condition Prone|XPHB} foe, {@dc 12}.'] }],
        },
        { name: 'Testling', source: 'PHB', page: 1, size: ['M'], speed: 25, entries: [{ type: 'entries', name: 'Old', entries: ['old'] }] },
        { name: 'Oldling', source: 'VGM', page: 3, size: ['M'], speed: 30, entries: [{ type: 'entries', name: 'Ancient', entries: ['from an old book'] }] },
        { name: 'Homebrewling', source: 'WoW', size: ['M'], speed: 30, entries: [] },
      ],
      subrace: [],
    }),
  );
  z.addFile(
    `${d}spells/spells-xphb.json`,
    json({
      spell: [
        {
          name: 'Zap Bolt',
          source: 'XPHB',
          page: 300,
          level: 1,
          school: 'V',
          time: [{ number: 1, unit: 'action' }],
          range: { type: 'point', distance: { type: 'feet', amount: 60 } },
          components: { v: true, m: 'a spark' },
          duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 }, concentration: true }],
          meta: { ritual: true },
          entries: ['Hits for {@damage 2d6}.'],
          entriesHigherLevel: [{ type: 'entries', name: 'Using a Higher-Level Spell Slot', entries: ['+1d6 per level.'] }],
        },
      ],
    }),
  );
  z.addFile(
    `${d}spells/spells-wow.json`,
    json({
      spell: [
        {
          name: 'Fel Bolt',
          source: 'WoW',
          level: 1,
          school: 'V',
          time: [{ number: 1, unit: 'action' }],
          range: { type: 'point', distance: { type: 'self' } },
          components: {},
          duration: [{ type: 'instant' }],
          entries: ['no'],
        },
      ],
    }),
  );
  z.addFile(`${d}generated/gendata-spell-source-lookup.json`, json({ xphb: { 'zap bolt': { class: { XPHB: { Wizard: true }, WoW: { Mage: true } } } } }));
  z.addFile(
    `${d}class/class-wizard.json`,
    json({
      class: [{ name: 'Wizard', source: 'XPHB', page: 164 }],
      classFeature: [{ name: 'Zap Training', source: 'XPHB', className: 'Wizard', classSource: 'XPHB', level: 1, entries: ['Learn {@spell Zap Bolt|XPHB}.'] }],
      subclass: [{ name: 'Zapper', shortName: 'Zapper', source: 'TCE', className: 'Wizard', classSource: 'PHB' }],
      subclassFeature: [
        {
          name: 'Zapper',
          source: 'TCE',
          className: 'Wizard',
          classSource: 'PHB',
          subclassShortName: 'Zapper',
          subclassSource: 'TCE',
          level: 2,
          entries: ['Masters of zapping.', { type: 'refSubclassFeature', subclassFeature: 'Big Zap|Wizard||Zapper|TCE|2' }],
        },
        {
          name: 'Big Zap',
          source: 'TCE',
          className: 'Wizard',
          classSource: 'PHB',
          subclassShortName: 'Zapper',
          subclassSource: 'TCE',
          level: 2,
          header: 1,
          entries: ['{@i 2nd-level Zapper feature}', 'Zap harder.'],
        },
      ],
    }),
  );
  z.addFile(
    `${d}feats.json`,
    json({
      feat: [
        { name: 'Zappy', source: 'XPHB', page: 200, category: 'O', entries: ['You zap.'] },
        { name: 'Zap Lord', source: 'XPHB', category: 'G', prerequisite: [{ level: 4, ability: [{ int: 13 }] }], entries: ['More zap.'] },
      ],
    }),
  );
  z.addFile(
    `${d}backgrounds.json`,
    json({
      background: [
        {
          name: 'Zap Scholar',
          source: 'XPHB',
          page: 180,
          ability: [{ choose: { weighted: { from: ['int', 'wis', 'cha'], weights: [2, 1] } } }],
          feats: [{ 'magic initiate; wizard|xphb': true }],
          skillProficiencies: [{ arcana: true, history: true }],
          toolProficiencies: [{ "calligrapher's supplies": true }],
          startingEquipment: [{ A: [{ item: 'quarterstaff|xphb' }, { item: 'parchment|xphb', quantity: 8 }, { value: 800 }], B: [{ value: 5000 }] }],
          entries: ['A scholar.'],
        },
      ],
    }),
  );
  z.addFile(`${d}optionalfeatures.json`, json({ optionalfeature: [] }));
  z.addFile(
    `${d}bestiary/bestiary-xmm.json`,
    json({
      monster: [
        {
          name: 'Priest',
          source: 'XMM',
          page: 7,
          size: ['M'],
          type: { type: 'humanoid', tags: ['cleric'] },
          alignment: ['N'],
          ac: [13],
          hp: { average: 20, formula: '4d8 + 2' },
          speed: { walk: 30, fly: { number: 10, condition: '(hover)' }, alternate: { climb: [{ number: 5 }] } },
          str: 10,
          dex: 14,
          con: 12,
          int: 10,
          wis: 16,
          cha: 10,
          skill: { religion: '+4', other: [{ oneOf: {} }] },
          senses: ['darkvision 60 ft.'],
          passive: 13,
          languages: ['Common'],
          cr: '2',
          initiative: { proficiency: 1 },
          resist: ['fire', { resist: ['cold'], note: 'while praying' }],
          conditionImmune: ['charmed'],
          gear: ['mace|xphb'],
          action: [{ name: 'Smite', entries: ['{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Radiant damage.'] }],
          spellcasting: [{ name: 'Spellcasting', headerEntries: ['The priest casts:'], will: ['{@spell Light|XPHB}'], daily: { '1e': ['{@spell Bless|XPHB}'] }, displayAs: 'action' }],
        },
        { name: 'Copied Priest', source: 'XMM', _copy: { name: 'Priest', source: 'XMM' } },
      ],
    }),
  );
  z.addFile(
    `${d}items.json`,
    json({
      item: [
        { name: 'Potion of Zapping', source: 'XDMG', page: 290, type: 'P|XDMG', rarity: 'uncommon', value: 5000, weight: 0.5, entries: ['You zap for {@damage 2d4}.'] },
        { name: 'Ring of Zap', source: 'XDMG', page: 291, type: 'RG|XDMG', rarity: 'rare', reqAttune: 'by a wizard', entries: ['Zaps.'] },
      ],
    }),
  );
  z.addFile(
    `${d}items-base.json`,
    json({
      baseitem: [
        {
          name: 'Dagger',
          source: 'XPHB',
          page: 215,
          type: 'M|XPHB',
          rarity: 'none',
          weight: 1,
          value: 200,
          weaponCategory: 'simple',
          property: ['F|XPHB', 'L|XPHB', 'T|XPHB'],
          range: '20/60',
          mastery: ['Nick|XPHB'],
          dmg1: '1d4',
          dmgType: 'P',
          weapon: true,
        },
        {
          name: 'Longsword',
          source: 'XPHB',
          page: 215,
          type: 'M|XPHB',
          rarity: 'none',
          weight: 3,
          value: 1500,
          weaponCategory: 'martial',
          property: ['V|XPHB'],
          dmg1: '1d8',
          dmg2: '1d10',
          dmgType: 'S',
          weapon: true,
        },
      ],
    }),
  );
  z.addFile(
    `${d}magicvariants.json`,
    json({
      magicvariant: [
        {
          name: '+1 Weapon',
          type: 'GV|XDMG',
          inherits: { namePrefix: '+1 ', source: 'XDMG', page: 324, rarity: 'uncommon', bonusWeapon: '+1', entries: ['You have a {=bonusWeapon} bonus to attack and damage rolls.'] },
        },
        { name: 'Flame Tongue', type: 'GV|XDMG', inherits: { namePrefix: 'Flame Tongue ', source: 'XDMG', page: 263, rarity: 'rare', reqAttune: true, entries: ['Flames.'] } },
      ],
    }),
  );
  return z.toBuffer();
}

describe('importing from 5etools', () => {
  it('turns 5etools tags and entries into plain text', () => {
    expect(plainTags('Take {@damage 2d6} on a {@dc 15} save; {@hit 5} to hit, {@spell fire bolt|XPHB|Fire Bolt}.')).toBe('Take 2d6 on a DC 15 save; +5 to hit, Fire Bolt.');
    expect(plainTags('{@filter Warlock cantrips|spells|level=0}')).toBe('Warlock cantrips');
    expect(renderEntries([{ type: 'list', items: [{ type: 'item', name: 'Feat:', entry: 'Alert' }, 'plain'] }])).toEqual(['• Feat: Alert', '• plain']);
  });

  it('takes only your books, prefers the newest printing, and adds older species only when the world names them', async () => {
    const ctx = tempContext();
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
    const ctx = tempContext();
    const gm = createApp(ctx);
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
    const ctx = tempContext();
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
    expect((await request(createApp(tempContext())).post('/api/rules/5etools/scan').attach('data', z.toBuffer(), 'x.zip')).status).toBe(400);
  });
});
