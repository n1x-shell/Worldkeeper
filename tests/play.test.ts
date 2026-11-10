import { describe, expect, it } from 'vitest';
import { applyDamage, applyHealing, newCombatant, nextTurn, previousTurn, proficiencyBonus, abilityModifier, rollDice, sortByInitiative } from '../shared/play.js';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('dice', () => {
  it('rolls expressions with modifiers', () => {
    const r = rollDice('2d6+3', seq(0, 0.99));
    expect(r.rolls).toEqual([1, 6]);
    expect(r.total).toBe(10);
  });
  it('advantage and disadvantage on d20', () => {
    expect(rollDice('1d20+5 adv', seq(0.1, 0.9)).total).toBe(19 + 5);
    expect(rollDice('d20 dis', seq(0.1, 0.9)).total).toBe(3);
  });
  it('keep highest', () => {
    expect(rollDice('4d6kh3', seq(0, 0.5, 0.99, 0.99)).total).toBe(4 + 6 + 6);
  });
  it('rejects garbage', () => {
    expect(() => rollDice('2d')).toThrow();
    expect(() => rollDice('hello')).toThrow();
    expect(() => rollDice('1000d6')).toThrow();
  });
});

describe('initiative', () => {
  const a = newCombatant({ name: 'A', initiative: 12, initiativeBonus: 1 });
  const b = newCombatant({ name: 'B', initiative: 18 });
  const c = newCombatant({ name: 'C', initiative: 12, initiativeBonus: 3 });
  const d = newCombatant({ name: 'D', initiative: null });
  it('sorts by initiative then bonus, unrolled last', () => {
    expect(sortByInitiative([a, b, c, d]).map((x) => x.name)).toEqual(['B', 'C', 'A', 'D']);
  });
  it('advances turns and rounds, skipping defeated', () => {
    const list = sortByInitiative([a, b, { ...c, defeated: true }]);
    let s = nextTurn(list, { round: 0, turnIndex: 0 });
    expect(s).toEqual({ round: 1, turnIndex: 0 });
    s = nextTurn(list, s);
    expect(list[s.turnIndex].name).toBe('A');
    s = nextTurn(list, s);
    expect(s).toEqual({ round: 2, turnIndex: 0 });
    expect(previousTurn(list, s)).toEqual({ round: 1, turnIndex: 2 });
  });
});

describe('damage and concentration', () => {
  it('temp HP absorbs first and concentration DC follows the 2024 rule', () => {
    const c = newCombatant({ name: 'Mage', maxHp: 30, hp: 30, tempHp: 5, concentration: 'Fly' });
    const out = applyDamage(c, 24);
    expect(out.combatant.tempHp).toBe(0);
    expect(out.combatant.hp).toBe(11);
    expect(out.concentrationDC).toBe(12);
    expect(applyDamage(c, 4).concentrationDC).toBe(10);
    expect(applyDamage(c, 100).concentrationDC).toBe(30);
  });
  it('healing caps at max HP and clears unconscious', () => {
    const c = newCombatant({ name: 'PC', maxHp: 10, hp: 0, isPC: true, conditions: ['Unconscious'] });
    expect(applyHealing(c, 50)).toMatchObject({ hp: 10, conditions: [] });
  });
  it('modifiers and proficiency', () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(15)).toBe(2);
    expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 4, 5, 6, 6]);
  });
});
