/** Combat depth (v0.9.10, docs/BETA_PLAN.md B9): effects that end, things that run out, groups, and stat block rolls. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { addEffect, defeatedXp, effectRoundsLeft, newCombatant, nextTurn, rollInitiatives, startTurn, type Combatant } from '../shared/play.js';
import { countersFrom, rollsIn } from '../shared/statblock.js';
import { bookCreature } from '../server/src/repo/bookData.js';

const fight = (): Combatant[] => [
  newCombatant({ id: 'cleric', name: 'Ilse', isPC: true, initiative: 18 }),
  newCombatant({ id: 'ogre', name: 'Ogre', initiative: 12 }),
  newCombatant({ id: 'rogue', name: 'Bram', isPC: true, initiative: 7 }),
];

describe('effects that end', () => {
  it('end at the start of the caster’s turn, the rounds later', () => {
    let list = fight();
    // Round 1, Ilse's turn: she casts Bless on Bram (10 rounds) and Hold Person on the ogre (1 round).
    let s = { round: 1, turnIndex: 0 };
    list = list.map((c) => (c.id === 'rogue' ? addEffect(c, 'Bless', 10, s, list) : c.id === 'ogre' ? addEffect(c, ' Hold Person ', 1, s, list) : c));
    expect(list[1].effects![0]).toMatchObject({ name: 'Hold Person', endRound: 2, anchor: 'cleric' });
    expect(effectRoundsLeft(list[2].effects![0], s)).toBe(10);
    // The ogre's and Bram's turns: nothing ends.
    for (let i = 0; i < 2; i++) {
      s = nextTurn(list, s);
      const t = startTurn(list, s);
      expect(t.notes).toEqual([]);
      list = t.list;
    }
    // Round 2, Ilse's turn again: Hold Person ends; Bless has 9 rounds left.
    s = nextTurn(list, s);
    const t = startTurn(list, s);
    expect(s).toEqual({ round: 2, turnIndex: 0 });
    expect(t.notes).toEqual(['Hold Person ends on Ogre.']);
    expect(t.list[1].effects).toEqual([]);
    expect(effectRoundsLeft(t.list[2].effects![0], s)).toBe(9);
  });

  it('end when their round comes if the caster is down', () => {
    let list = fight();
    list = list.map((c) => (c.id === 'ogre' ? addEffect(c, 'Faerie Fire', 1, { round: 1, turnIndex: 0 }, list) : c));
    list = list.map((c) => (c.id === 'cleric' ? { ...c, defeated: true } : c));
    // Round 2 starts on the ogre (the cleric is skipped): the effect ends there.
    const s = nextTurn(list, { round: 1, turnIndex: 2 });
    expect(s).toEqual({ round: 2, turnIndex: 1 });
    expect(startTurn(list, s).notes).toEqual(['Faerie Fire ends on Ogre.']);
  });
});

describe('things that run out', () => {
  it('legendary actions come back each turn; a spent recharge asks for its roll', () => {
    const dragon = newCombatant({ id: 'd', name: 'Dragon', initiative: 15, counters: [{ name: 'Legendary actions', max: 3, used: 2, eachTurn: true }, { name: 'Fire Breath', max: 1, used: 1, recharge: 5 }, { name: 'Legendary Resistance', max: 3, used: 1 }] });
    const list = [newCombatant({ id: 'a', name: 'Ilse', isPC: true, initiative: 20 }), dragon];
    const t = startTurn(list, { round: 2, turnIndex: 1 });
    expect(t.notes).toEqual(['Dragon: roll to recharge Fire Breath (5–6).']);
    expect(t.list[1].counters).toEqual([{ name: 'Legendary actions', max: 3, used: 0, eachTurn: true }, { name: 'Fire Breath', max: 1, used: 1, recharge: 5 }, { name: 'Legendary Resistance', max: 3, used: 1 }]);
    // Someone else's turn changes nothing of the dragon's.
    expect(startTurn(list, { round: 2, turnIndex: 0 }).list[1]).toBe(dragon);
  });

  it('are read from a stat block', () => {
    expect(
      countersFrom({
        traits: [{ name: 'Legendary Resistance (3/Day)', text: '' }, { name: 'Amphibious', text: '' }],
        actions: [{ name: 'Fire Breath (Recharge 5–6)', text: '' }, { name: 'Web (Recharge 6)', text: '' }, { name: 'Spellcasting (2/Day Each)', text: '' }],
        legendary: [{ name: 'Legendary Action Uses: 3 (4 in Lair)', text: '' }, { name: 'Pounce', text: '' }],
      }),
    ).toEqual([
      { name: 'Legendary actions', max: 3, used: 0, eachTurn: true },
      { name: 'Legendary Resistance', max: 3, used: 0 },
      { name: 'Fire Breath', max: 1, used: 0, recharge: 5 },
      { name: 'Web', max: 1, used: 0, recharge: 6 },
      { name: 'Spellcasting', max: 2, used: 0 },
    ]);
    expect(countersFrom({ actions: [{ name: 'Bite', text: '' }] })).toEqual([]);
    // The SRD's own dragon, as the app has it.
    const dragon = bookCreature(tempContext().db, 'srd:adult-red-dragon') as never;
    const names = countersFrom(dragon).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Legendary actions', 'Legendary Resistance', 'Fire Breath']));
  });
});

describe('groups and the defeated', () => {
  it('a group rolls initiative once; a rolled initiative is taken as given', () => {
    const list = [
      newCombatant({ id: 'w1', name: 'Wolf 1', group: 'g', initiativeBonus: 2 }),
      newCombatant({ id: 'w2', name: 'Wolf 2', group: 'g', initiativeBonus: 2 }),
      newCombatant({ id: 'b', name: 'Bandit', initiativeBonus: 1 }),
      newCombatant({ id: 'p', name: 'Ilse', isPC: true, initiative: null }),
      newCombatant({ id: 'set', name: 'Set', initiative: 9 }),
    ];
    const rolls = [0.5, 0.95, 0.1];
    let i = 0;
    const out = rollInitiatives(list, { p: 21 }, () => rolls[i++]);
    expect(out.map((c) => c.initiative)).toEqual([13, 13, 21, 21, 9]);
    expect(i).toBe(2);
  });

  it('adds up what the defeated foes are worth', () => {
    const list = [newCombatant({ name: 'Ogre', xp: 450, defeated: true }), newCombatant({ name: 'Goblin', xp: 50 }), newCombatant({ name: 'Ilse', isPC: true, defeated: true, xp: 999 }), newCombatant({ name: 'Rat', defeated: true })];
    expect(defeatedXp(list)).toBe(450);
  });
});

describe('rolls in a stat block', () => {
  it('finds the attack roll and each damage', () => {
    expect(rollsIn('Melee Attack Roll: +7, reach 10 ft. Hit: 13 (2d8 + 4) Bludgeoning damage plus 3 (1d6) Fire damage.')).toEqual([
      { what: 'to hit', expression: '1d20+7', d20: true },
      { what: 'Bludgeoning', expression: '2d8+4', d20: false },
      { what: 'Fire', expression: '1d6', d20: false },
    ]);
    expect(rollsIn('Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.')).toEqual([{ what: 'Fire', expression: '17d6', d20: false }]);
    expect(rollsIn('The dragon makes three Rend attacks.')).toEqual([]);
    expect(rollsIn('Ranged Attack Roll: −1, range 30 ft. Hit: 2 (1d6 − 1) Piercing damage.')).toEqual([
      { what: 'to hit', expression: '1d20-1', d20: true },
      { what: 'Piercing', expression: '1d6-1', d20: false },
    ]);
  });
});

describe('the tracker keeps it all', () => {
  it('an encounter saves effects, counters, groups, XP and the party’s characters', async () => {
    const gm = createApp(tempContext());
    const enc = (await request(gm).post('/api/encounters').send({ title: 'The gate' })).body as { id: number };
    const c = {
      ...newCombatant({ id: 'd', name: 'Dragon', group: 'g1', xp: 18000, characterId: null }),
      effects: [{ id: 'e1', name: 'Bane', endRound: 4, anchor: 'd' }],
      counters: [{ name: 'Fire Breath', max: 1, used: 1, recharge: 5 }],
    };
    const pc = newCombatant({ id: 'p', name: 'Ilse', isPC: true, characterId: 7 });
    const saved = (await request(gm).patch(`/api/encounters/${enc.id}`).send({ combatants: [c, pc] })).body as { combatants: Combatant[] };
    expect(saved.combatants[0]).toMatchObject({ group: 'g1', xp: 18000, effects: c.effects, counters: c.counters });
    expect(saved.combatants[1].characterId).toBe(7);
    expect((await request(gm).patch(`/api/encounters/${enc.id}`).send({ combatants: [{ ...c, counters: [{ name: 'x', max: 1, used: 0, recharge: 9 }] }] })).status).toBe(400);
  });
});
