import { describe, expect, it } from 'vitest';
import { groupByDistance } from '../client/src/components/map/grouping';

const at = (x: number, y: number, item: string) => ({ at: { x, y }, item });

describe('grouped pins', () => {
  it('groups places closer than the distance, and leaves the rest alone', () => {
    const g = groupByDistance([at(0, 0, 'a'), at(10, 0, 'b'), at(200, 0, 'c'), at(0, 20, 'd')], 34);
    expect(g.map((x) => x.items)).toEqual([['a', 'b', 'd'], ['c']]);
  });

  it('places a group at the centre of its places', () => {
    const [g] = groupByDistance([at(0, 0, 'a'), at(20, 0, 'b')], 34);
    expect(g.at).toEqual({ x: 10, y: 0 });
  });

  it('keeps places exactly the distance apart separate', () => {
    expect(groupByDistance([at(0, 0, 'a'), at(34, 0, 'b')], 34)).toHaveLength(2);
  });

  it('does not change the points it was given', () => {
    const items = [at(0, 0, 'a'), at(10, 0, 'b')];
    groupByDistance(items, 34);
    expect(items[0].at).toEqual({ x: 0, y: 0 });
  });
});
