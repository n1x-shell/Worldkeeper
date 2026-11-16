/** The name generator never offers a word that is already used, and keeps names sayable. */
import { describe, expect, it } from 'vitest';
import { generateNames, sayable } from '../shared/names';

describe('name generator', () => {
  it('never reuses a first name or surname, and keeps them sayable', () => {
    const used = new Set(['kelra', 'briarvale', 'ora']);
    const names = generateNames({ seeds: ['Bruna', 'Dagnal', 'Eberk', 'Hilda', 'Kildrak', 'Orsik', 'Torbera', 'Vistra'], people: 'Dwarves', used, count: 20, seed: 7 });
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) {
      const [first, sur] = n.split(' ');
      expect(used.has(first.toLowerCase())).toBe(false);
      expect(used.has(sur.toLowerCase())).toBe(false);
      expect(sayable(first)).toBe(true);
    }
    expect(new Set(names.flatMap((n) => n.split(' '))).size).toBe(names.length * 2);
  });

  it('gives single names to peoples without family names, and phrase names to tabaxi', () => {
    expect(generateNames({ seeds: ['Whistle', 'Tidewash'], people: 'Kenku', used: new Set(), count: 5, seed: 3 }).every((n) => !n.includes(' '))).toBe(true);
    expect(generateNames({ seeds: ['Moss-in-Rain', 'Five Dawns'], people: 'Tabaxi', used: new Set(), count: 6, seed: 3 }).every((n) => /-in-|-Eyes| /.test(n))).toBe(true);
  });
});
