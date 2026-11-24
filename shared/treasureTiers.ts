/**
 * The D&D 2024 treasure tiers (the rules layer, not any setting's): coins for one foe and for a hoard, and how many
 * magic items of which rarities a hoard holds, by the party's levels. A place's wealth scales them (treasure.ts).
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary';

export interface TreasureTier {
  key: string;
  label: string;
  individual: { dice: string; mult: number; coin: string };
  hoard: { dice: string; mult: number; coin: string };
  items: { dice: string; rarities: Partial<Record<Rarity, number>> };
}

export const TREASURE_TIERS: TreasureTier[] = [
  {
    key: '1-4',
    label: 'Levels 1 to 4',
    individual: { dice: '3d6', mult: 1, coin: 'gp' },
    hoard: { dice: '2d4', mult: 100, coin: 'gp' },
    items: { dice: '1d3-1', rarities: { common: 3, uncommon: 2 } },
  },
  {
    key: '5-10',
    label: 'Levels 5 to 10',
    individual: { dice: '2d8', mult: 10, coin: 'gp' },
    hoard: { dice: '8d10', mult: 100, coin: 'gp' },
    items: { dice: '1d2', rarities: { uncommon: 3, rare: 2 } },
  },
  {
    key: '11-16',
    label: 'Levels 11 to 16',
    individual: { dice: '2d10', mult: 10, coin: 'pp' },
    hoard: { dice: '8d8', mult: 1000, coin: 'gp' },
    items: { dice: '1d3', rarities: { rare: 3, 'very rare': 2 } },
  },
  {
    key: '17-20',
    label: 'Levels 17 to 20',
    individual: { dice: '2d8', mult: 100, coin: 'pp' },
    hoard: { dice: '6d10', mult: 10000, coin: 'gp' },
    items: { dice: '1d3', rarities: { 'very rare': 3, legendary: 1 } },
  },
];
