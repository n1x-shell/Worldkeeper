/**
 * How a party advances (v0.9.6): by experience points, or by milestones the GM calls. The XP each level needs is the
 * 2024 rules' Character Advancement table.
 */
export type Advancement = 'xp' | 'milestone';

/** XP_FOR_LEVEL[n] is the experience a character needs to be level n. */
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

/** The level a character's experience has earned. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let l = 2; l <= 20; l++) if (xp >= XP_FOR_LEVEL[l]) level = l;
  return level;
}

/** The experience the next level needs, or null at level 20. */
export const xpForNext = (level: number): number | null => (level >= 20 ? null : XP_FOR_LEVEL[Math.max(1, level) + 1]);

/** Whether a character's experience has earned a level they haven't been given yet. */
export const readyToLevel = (level: number, xp: number) => levelForXp(xp) > level;

/**
 * The levels a sheet hasn't taken in yet: the GM raised the level, and what those levels give (hit points, features,
 * choices) is still to be taken. A sheet with no mark is up to date with its level.
 */
export function pendingLevels(level: number, builtLevel: number | undefined): number[] {
  if (builtLevel === undefined || builtLevel >= level) return [];
  return Array.from({ length: level - builtLevel }, (_, i) => builtLevel + 1 + i);
}
