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
    expect(scan.body.books.map((b: { id: string }) => b.id).sort()).toEqual(['PHB', 'TCE', 'VGM', 'WoW', 'XPHB']);
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
