/**
 * Bastion terms from the Dungeon Master's Guide (2024), for the Bastion tracker. Only names and the party level each
 * facility needs are listed here; the rules for each are in the book.
 */
export const SPECIAL_FACILITIES: { name: string; level: number }[] = [
  ...['Arcane Study', 'Armory', 'Barrack', 'Garden', 'Library', 'Sanctum', 'Smithy', 'Storehouse', 'Workshop'].map((name) => ({ name, level: 5 })),
  ...['Gaming Hall', 'Greenhouse', 'Laboratory', 'Sacristy', 'Scriptorium', 'Stable', 'Teleportation Circle', 'Theater', 'Training Area', 'Trophy Room'].map((name) => ({ name, level: 9 })),
  ...['Archive', 'Meditation Chamber', 'Menagerie', 'Observatory', 'Pub', 'Reliquary'].map((name) => ({ name, level: 13 })),
  ...['Demiplane', 'Guildhall', 'Sanctuary', 'War Room'].map((name) => ({ name, level: 17 })),
];
export const BASIC_FACILITIES = ['Bedroom', 'Courtyard', 'Dining Room', 'Kitchen', 'Parlor', 'Storage'];
export const SPACES = ['Cramped', 'Roomy', 'Vast'];
export const ORDERS = ['Craft', 'Empower', 'Harvest', 'Maintain', 'Recruit', 'Research', 'Trade'];

/** How many special facilities a Bastion can have at a party level. */
export function specialSlots(level: number) {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 2 : 0;
}
