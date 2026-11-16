/** Every shipped stat block adds up: hit points match their dice and Constitution, and every damage average is right. */
import { describe, expect, it } from 'vitest';
import { statblocks } from '../server/src/repo/statblocks';

const AVG = /(\d+) \((\d+)d(\d+)(?: ([+-]) (\d+))?\)/g;
const avg = (x: number, y: number, z: number) => Math.floor((x * (y + 1)) / 2) + z;

describe('stat blocks', () => {
  const all = Object.values(statblocks());
  it('covers the creatures and hazards', () => {
    expect(all.length).toBeGreaterThanOrEqual(92);
    for (const s of all) expect(s.id).toMatch(/^(CRE|NPC)-\d{3}$/);
  });

  it('has hit points that match their dice and Constitution', () => {
    for (const s of all.filter((x) => x.kind !== 'hazard')) {
      // Short cards use a Monster Manual stat block's own numbers.
      if (s.base) {
        expect(s.hpAvg, `${s.id} hp`).toBe(Number(/^(\d+)/.exec(s.hp ?? '')?.[1]));
        continue;
      }
      const m = /^(\d+) \((\d+)d(\d+)(?: ([+-]) (\d+))?\)$/.exec(s.hp ?? '');
      expect(m, `${s.id} hp`).toBeTruthy();
      const [n, x, y, z] = [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![5] ?? 0) * (m![4] === '-' ? -1 : 1)];
      expect(avg(x, y, z), `${s.id} ${s.hp}`).toBe(n);
      expect(z, `${s.id} Constitution`).toBe(x * Math.floor((s.ab![2] - 10) / 2));
      expect(s.hpAvg).toBe(n);
    }
  });

  it('has every damage average right', () => {
    for (const s of all) {
      const text = [...(s.traits ?? []), ...(s.actions ?? []), ...(s.bonus ?? []), ...(s.reactions ?? []), ...(s.legendary ?? [])].map((e) => e.text).concat(s.changes ?? []).join('\n');
      for (const m of text.matchAll(AVG)) {
        const z = Number(m[5] ?? 0) * (m[4] === '-' ? -1 : 1);
        expect(avg(Number(m[2]), Number(m[3]), z), `${s.id}: ${m[0]}`).toBe(Number(m[1]));
      }
    }
  });
});
