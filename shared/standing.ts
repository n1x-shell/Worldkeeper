/**
 * Faction standing ranks, from Aetheris Allegiance and Pacing [RUL-010]: Hostile at -10, Distrusted at -3, Neutral at 0,
 * Initiate at 3, Trusted at 10, Exalted at 25, Champion at 50.
 */
export const RANKS = [
  { name: 'Hostile', from: -Infinity, to: -10 },
  { name: 'Distrusted', from: -9, to: -3 },
  { name: 'Neutral', from: -2, to: 2 },
  { name: 'Initiate', from: 3, to: 9 },
  { name: 'Trusted', from: 10, to: 24 },
  { name: 'Exalted', from: 25, to: 49 },
  { name: 'Champion', from: 50, to: Infinity },
] as const;
export type RankName = (typeof RANKS)[number]['name'];

export function rankOf(renown: number): RankName {
  return (RANKS.find((r) => renown >= r.from && renown <= r.to) ?? RANKS[2]).name;
}

/** The next rank up (or down, below Neutral), and the Renown it starts at. */
export function nextRank(renown: number): { name: RankName; at: number } | null {
  if (renown < 0) {
    const i = RANKS.findIndex((r) => r.name === rankOf(renown));
    const up = RANKS[i + 1];
    return { name: up.name, at: up.from };
  }
  const i = RANKS.findIndex((r) => r.name === rankOf(renown));
  const up = RANKS[i + 1];
  return up ? { name: up.name, at: up.from } : null;
}

/** The ranks whose benefits a party has earned: every rank from Initiate up to its own; below Neutral, its own rank. */
export function earnedRanks(renown: number): RankName[] {
  const r = rankOf(renown);
  if (renown < -2) return [r];
  const order: RankName[] = ['Initiate', 'Trusted', 'Exalted', 'Champion'];
  return order.slice(0, order.indexOf(r) + 1);
}
