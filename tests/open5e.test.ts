/** Importing open content from Open5e. The responses here are a tiny made-up stand-in in Open5e's shape. */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { importOpen5e, open5eDocuments, type Fetcher } from '../server/src/repo/open5e.js';
import { bookCreature, itemByName } from '../server/src/repo/bookData.js';
import { rulesView } from '../server/src/repo/rulesPacks.js';

const doc = { key: 'zap', name: 'Zap Bestiary', publisher: { name: 'Zap Press' }, gamesystem: { name: '5th Edition 2014' }, licenses: [{ key: 'cc-by-40' }, { key: 'ogl-10a' }] };
const pages: Record<string, unknown[]> = {
  documents: [
    doc,
    { key: 'srd-2024', name: 'System Reference Document 5.2', publisher: { name: 'Wizards of the Coast' }, licenses: [{ key: 'cc-by-40' }] },
    { key: 'nolicence', name: 'No Licence', licenses: [] },
  ],
  creatures: [
    {
      key: 'zap_zapper',
      name: 'Zapper',
      size: { name: 'Small' },
      type: { name: 'Elemental' },
      alignment: 'chaotic neutral',
      challenge_rating: 0.5,
      armor_class: 13,
      hit_points: 11,
      hit_dice: '2d6+4',
      experience_points: 100,
      initiative_bonus: 3,
      speed: { walk: 20, fly: 40, hover: true },
      ability_scores: { strength: 8, dexterity: 16, constitution: 14, intelligence: 6, wisdom: 10, charisma: 10 },
      modifiers: { strength: -1, dexterity: 3, constitution: 2, intelligence: -2, wisdom: 0, charisma: 0 },
      saving_throws: { dexterity: 5 },
      skill_bonuses: { sleight_of_hand: 5 },
      passive_perception: 10,
      darkvision_range: 60,
      languages: { as_string: 'understands Common' },
      resistances_and_immunities: { damage_immunities_display: 'lightning; bludgeoning from nonmagical attacks', condition_immunities_display: 'exhaustion' },
      traits: [{ name: 'Static', desc: 'It **crackles**.' }],
      actions: [
        { name: 'Shock', desc: 'Melee Weapon Attack: +5 to hit. Hit: 5 (1d4 + 3) lightning damage.', action_type: 'ACTION', order_in_statblock: 1 },
        { name: 'Arc', desc: 'Each creature within 10 feet makes a DC 12 Dexterity saving throw.', action_type: 'ACTION', order_in_statblock: 2, usage_limits: { type: 'RECHARGE_ON_ROLL', param: 5 } },
        { name: 'Flicker', desc: 'It teleports 10 feet.', action_type: 'BONUS_ACTION', order_in_statblock: 3 },
      ],
      environments: [{ key: 'coast' }, { key: 'srd_feywild' }],
    },
  ],
  magicitems: [
    { name: 'Zap Ring', desc: 'You _crackle_.', category: { name: 'Ring' }, rarity: { key: 'very-rare' }, requires_attunement: true, attunement_detail: 'by a wizard', cost: '0.00', weight: '0.000' },
  ],
  items: [{ name: 'Zap Rod', desc: 'A rod.', category: { name: 'Gear' }, cost: '5.00', weight: '2.000' }],
  spells: [
    {
      name: 'Zap Bolt',
      level: 1,
      school: { name: 'Evocation' },
      casting_time: 'action',
      range_text: '60 feet',
      verbal: true,
      somatic: true,
      material: false,
      duration: '1 minute',
      concentration: true,
      ritual: false,
      desc: 'It zaps.',
      higher_level: 'More zap.',
    },
  ],
  feats: [{ name: 'Zappy', type: 'GENERAL', desc: 'You zap.', prerequisite: '', benefits: [{ desc: 'Zap more.' }] }],
  backgrounds: [
    {
      name: 'Zap Sage',
      desc: 'A sage.',
      benefits: [
        { type: 'ability_score', name: 'Ability Scores', desc: 'Intelligence, Wisdom and Charisma' },
        { type: 'skill_proficiency', name: 'Skills', desc: 'Arcana and History' },
      ],
    },
  ],
};
const fake: Fetcher = async (url) => {
  const kind = /\/v2\/(\w+)\//.exec(url)![1];
  const all = pages[kind] ?? [];
  // A source filter returns only that source's entries; there are two pages for documents.
  if (kind === 'documents') return url.includes('page=2') ? { results: all.slice(2), next: null } : { results: all.slice(0, 2), next: `${url}&page=2` };
  return { results: url.includes('document__key__in=zap') ? all : [], next: null };
};

describe('importing open content from Open5e', () => {
  it('lists sources with their licences, leaving out unlicensed ones and marking the built-in SRD', async () => {
    const docs = await open5eDocuments(fake);
    expect(docs).toEqual([
      { key: 'zap', name: 'Zap Bestiary', publisher: 'Zap Press', licences: ['CC BY 4.0', 'OGL 1.0a'], system: '5th Edition 2014', permalink: '', builtIn: false },
      { key: 'srd-2024', name: 'System Reference Document 5.2', publisher: 'Wizards of the Coast', licences: ['CC BY 4.0'], system: '', permalink: '', builtIn: true },
    ]);
  });

  it('brings each source in as its own pack, with creatures, items, spells, feats and backgrounds', async () => {
    const { db } = tempContext();
    await expect(importOpen5e(db, ['srd-2024'], fake)).rejects.toThrow(/built in/);
    const r = await importOpen5e(db, ['zap'], fake);
    expect(r.results).toEqual([{ key: 'zap', name: 'Zap Bestiary', counts: { creature: 1, item: 2, spell: 1, feat: 1, background: 1 } }]);
    expect(r.packs.find((p) => p.id === 'open5e-zap')).toMatchObject({ name: 'Zap Bestiary', source: 'Zap Press, CC BY 4.0 or OGL 1.0a, from Open5e' });
    expect(bookCreature(db, 'open5e:zap_zapper')).toMatchObject({
      meta: 'Small Elemental, Chaotic Neutral',
      hp: '11 (2d6+4)',
      cr: '1/2',
      xp: 100,
      pb: 2,
      speed: '20 ft., Fly 40 ft. (hover)',
      saves: 'Dex +5',
      skills: 'Sleight of Hand +5',
      imm: 'Lightning; Bludgeoning from nonmagical attacks; Exhaustion',
      senses: 'Darkvision 60 ft., Passive Perception 10',
      traits: [{ name: 'Static', text: 'It crackles.' }],
      actions: [
        { name: 'Shock', text: 'Melee Weapon Attack: +5 to hit. Hit: 5 (1d4 + 3) lightning damage.' },
        { name: 'Arc (Recharge 5–6)', text: 'Each creature within 10 feet makes a DC 12 Dexterity saving throw.' },
      ],
      bonus: [{ name: 'Flicker', text: 'It teleports 10 feet.' }],
      environment: ['coastal', 'planar, feywild'],
      source: 'Zap Bestiary (Zap Press, CC BY 4.0 or OGL 1.0a)',
    });
    expect(itemByName(db, 'Zap Ring')).toMatchObject({ type: 'Ring', rarity: 'very rare', attunement: 'requires attunement by a wizard', text: 'You crackle.' });
    expect(itemByName(db, 'Zap Rod')).toMatchObject({ value: 5, weight: 2, magic: false });
    const rules = rulesView(db);
    expect(rules.spells.find((s) => s.name === 'Zap Bolt')).toMatchObject({
      time: 'Action',
      duration: 'Concentration, up to 1 minute',
      components: 'V, S',
      text: 'It zaps.\n\nAt Higher Levels. More zap.',
    });
    expect(rules.feats.Zappy).toMatchObject({ category: 'General', text: 'You zap.\n• Zap more.' });
    expect(rules.backgrounds['Zap Sage']).toMatchObject({ abilities: ['Intelligence', 'Wisdom', 'Charisma'], skills: ['Arcana', 'History'] });
  });
});
