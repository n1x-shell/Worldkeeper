/** A tiny made-up stand-in for a 5etools copy, in its shape: no real book text. */
import AdmZip from 'adm-zip';

const json = (o: unknown) => Buffer.from(JSON.stringify(o));
export function fakeFivetools() {
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
          environment: ['urban'],
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
