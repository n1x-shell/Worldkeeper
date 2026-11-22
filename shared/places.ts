/**
 * What a place is like, for encounters and treasure in any world (docs/OWN_WORLD_PLAN.md §2.9): its terrain (in the
 * words creatures' environments use), how dangerous it is, and how rich. Read from a place's facts ("Terrain",
 * "Danger", "Wealth"), written in plain words; the place it sits in fills any it doesn't say.
 */

export const TERRAINS = ['arctic', 'coastal', 'desert', 'forest', 'grassland', 'hill', 'mountain', 'swamp', 'underdark', 'underwater', 'urban', 'planar'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const DANGERS = ['safe', 'risky', 'deadly'] as const;
export type Danger = (typeof DANGERS)[number];
export const WEALTHS = ['poor', 'modest', 'rich'] as const;
export type Wealth = (typeof WEALTHS)[number];

/** Other words for each terrain, as people write them. */
const TERRAIN_WORDS: Record<Terrain, string[]> = {
  arctic: ['arctic', 'ice', 'icy', 'tundra', 'snow', 'glacier', 'frozen'],
  coastal: ['coastal', 'coast', 'shore', 'beach', 'cliffs', 'sea', 'harbour', 'harbor', 'island', 'islands'],
  desert: ['desert', 'dunes', 'sand', 'barrens', 'wasteland', 'ash'],
  forest: ['forest', 'forests', 'wood', 'woods', 'woodland', 'jungle', 'deepwood'],
  grassland: ['grassland', 'grasslands', 'plain', 'plains', 'meadow', 'meadows', 'farmland', 'fields', 'steppe', 'prairie'],
  hill: ['hill', 'hills', 'highlands', 'downs', 'moor', 'moors'],
  mountain: ['mountain', 'mountains', 'peak', 'peaks', 'crags', 'range'],
  swamp: ['swamp', 'swamps', 'marsh', 'marshes', 'fen', 'fens', 'bog', 'mire', 'wetland', 'wetlands'],
  underdark: ['underdark', 'cave', 'caves', 'caverns', 'underground', 'tunnels', 'mines'],
  underwater: ['underwater', 'undersea', 'sunken', 'depths'],
  urban: ['urban', 'city', 'town', 'village', 'streets', 'settled'],
  planar: ['planar', 'plane', 'planes', 'astral', 'otherworld', 'otherworldly'],
};

/** The terrains a piece of text names. */
export function readTerrain(text: string | null | undefined): Terrain[] {
  const words = new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
  );
  return TERRAINS.filter((t) => TERRAIN_WORDS[t].some((w) => words.has(w)));
}

/** How dangerous a piece of text says a place is (the worst it mentions). */
export function readDanger(text: string | null | undefined): Danger | null {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return null;
  if (/\b(deadly|lethal|deathly|perilous)\b/.test(t)) return 'deadly';
  if (/\b(risky|dangerous|hostile|unsafe|lawless|contested|wild)\b/.test(t)) return 'risky';
  if (/\b(safe|peaceful|quiet|watched|guarded)\b/.test(t)) return 'safe';
  return null;
}

export function readWealth(text: string | null | undefined): Wealth | null {
  const t = String(text ?? '').toLowerCase();
  if (/\b(rich|wealthy|prosperous|opulent)\b/.test(t)) return 'rich';
  if (/\b(poor|impoverished|destitute|starving)\b/.test(t)) return 'poor';
  if (/\b(modest|middling|comfortable|average)\b/.test(t)) return 'modest';
  return null;
}

/** An encounter's difficulty for a place's danger (DMG 2024: low, moderate, high). */
export const difficultyFor = (d: Danger): 'low' | 'moderate' | 'high' => (d === 'safe' ? 'low' : d === 'deadly' ? 'high' : 'moderate');
