/**
 * Faction standing (the Renown module): a ladder of ranks, each starting at a Renown. A setting pack can give its own
 * ladder (pack.json "renown"); any other world uses the plain one below. The rank that holds 0 is the neutral one:
 * below it, a party has only its own rank; above it, it has earned every rank from the first above neutral to its own.
 */

/** A ladder as written in a pack: ranks from lowest to highest, each with the Renown it starts at (null: the lowest). */
export interface RankLadderSpec {
  ranks: { name: string; from: number | null }[];
  /** The Renown from which a faction welcomes the party (for its Bastion, for one). */
  welcomeAt?: number;
}

export interface RankDef {
  name: string;
  from: number;
  to: number;
}

export interface RankLadder {
  ranks: RankDef[];
  /** The rank that holds Renown 0. */
  neutral: string;
  welcomeAt: number;
  spec: RankLadderSpec;
}

export function makeLadder(spec: RankLadderSpec): RankLadder {
  const sorted = [...spec.ranks].sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
  const ranks = sorted.map((r, i) => ({ name: r.name, from: i === 0 ? -Infinity : (r.from ?? -Infinity), to: i < sorted.length - 1 ? (sorted[i + 1].from ?? 0) - 1 : Infinity }));
  const neutral = ranks.find((r) => r.from <= 0 && r.to >= 0)?.name ?? ranks[0]?.name ?? '';
  return { ranks, neutral, welcomeAt: spec.welcomeAt ?? 10, spec };
}

/** The ladder for a world with no setting pack's own. */
export const PLAIN_LADDER = makeLadder({
  ranks: [
    { name: 'Hostile', from: null },
    { name: 'Unfriendly', from: -9 },
    { name: 'Neutral', from: -2 },
    { name: 'Friendly', from: 3 },
    { name: 'Honoured', from: 10 },
    { name: 'Revered', from: 25 },
  ],
  welcomeAt: 10,
});

const indexOf = (renown: number, l: RankLadder) => {
  const i = l.ranks.findIndex((r) => renown >= r.from && renown <= r.to);
  return i < 0 ? l.ranks.findIndex((r) => r.name === l.neutral) : i;
};

export function rankOf(renown: number, l: RankLadder = PLAIN_LADDER): string {
  return l.ranks[indexOf(renown, l)]?.name ?? l.neutral;
}

/** The next rank up (below neutral, towards it), and the Renown it starts at. */
export function nextRank(renown: number, l: RankLadder = PLAIN_LADDER): { name: string; at: number } | null {
  const up = l.ranks[indexOf(renown, l) + 1];
  return up ? { name: up.name, at: up.from } : null;
}

/** The ranks whose benefits a party has earned: every rank above neutral up to its own; below neutral, its own. */
export function earnedRanks(renown: number, l: RankLadder = PLAIN_LADDER): string[] {
  const i = indexOf(renown, l);
  const n = l.ranks.findIndex((r) => r.name === l.neutral);
  if (i < n) return [l.ranks[i].name];
  return l.ranks.slice(n + 1, i + 1).map((r) => r.name);
}

/** Where a rank sits: below neutral (negative), neutral (0) or above (its step, 1 up). */
export function rankStep(name: string, l: RankLadder = PLAIN_LADDER): number {
  return l.ranks.findIndex((r) => r.name === name) - l.ranks.findIndex((r) => r.name === l.neutral);
}
