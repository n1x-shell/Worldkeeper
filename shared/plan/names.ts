/**
 * What a room's name says about it: how big it is, and what stands in it. And names for rooms nobody has named yet.
 */
import { pick, shuffled, type FeatureKind, type Rnd } from './model.js';

export type RoomSize = 'small' | 'medium' | 'large' | 'long';

const SMALL = /\b(cell|closet|privy|latrine|garderobe|alcove|pantry|larder|vestibule|antechamber|niche|shaft|cupboard|porch|landing|post|nook|vestry|strongroom|squeeze|crawl|cleft|ledge)\b/i;
const LARGE = /\b(great|grand|throne|temple|cathedral|arena|cavern|court|courtyard|barracks|nave|library|ballroom|feast|feasting|assembly|audience|common room|taproom|sanctuary|forge hall|hall)\b/i;
const LONG = /\b(gallery|corridor|passage|bridge|hallway|tunnel|colonnade|cloister|walk|stalls)\b/i;

export function sizeOf(name: string): RoomSize {
  if (LONG.test(name)) return 'long';
  if (SMALL.test(name)) return 'small';
  if (LARGE.test(name)) return 'large';
  return 'medium';
}

/** What a room of this name has in it. The first that fits is the main thing; others may follow. */
const FURNISHINGS: [RegExp, FeatureKind[]][] = [
  [/\b(throne|audience)\b/i, ['throne', 'pillar']],
  [/\b(shrine|temple|chapel|altar|sanctum|sanctuary|fane)\b/i, ['altar', 'pillar']],
  [/\b(nave)\b/i, ['altar', 'pew']],
  [/\b(crypt|tomb|burial|catacomb|ossuary|sepulch\w*|barrow|mausoleum)\b/i, ['tomb']],
  [/\b(treasur\w*|vault|hoard|reliquary|strongroom|prize)\b/i, ['chest']],
  [/\b(well)\b/i, ['well']],
  [/\b(cistern|pool|bath|baths|spring|fountain|lake|sump)\b/i, ['pool']],
  [/\b(statue|statues|guardian|guardians|hall of \w+)\b/i, ['statue']],
  [/\b(collapsed|ruined|rubble|cave-in|fallen|broken)\b/i, ['rubble']],
  [/\b(barracks|quarters|dormitor\w*|bedroom|bedchamber|guest|solar|sleeping|bunk\w*|cells?|bunks)\b/i, ['bed']],
  [/\b(kitchen|mess|dining|feast\w*|refectory|common room|taproom|parlour|parlor|main room|living)\b/i, ['table']],
  [/\b(forge|smithy|smith|foundry)\b/i, ['anvil']],
  [/\b(library|archive|study|scriptorium|office|records)\b/i, ['shelf', 'table']],
  [/\b(stor\w*|pantry|larder|cellar|armou?ry|warehouse|stock\w*|hold|loft)\b/i, ['barrel', 'shelf']],
  [/\b(guard\w*|watch\w*|gatehouse)\b/i, ['table']],
  [/\b(great|grand|pillared|hall)\b/i, ['pillar']],
  [/\b(stable|stalls|byre)\b/i, ['stall']],
  [/\b(shop|counter)\b/i, ['counter', 'shelf']],
  [/\b(workshop|work room|laborator\w*|embalming|offerings)\b/i, ['table', 'shelf']],
];
export function furnishingsOf(name: string): FeatureKind[] {
  return FURNISHINGS.find(([re]) => re.test(name))?.[1] ?? [];
}

/** Which storey a room named in the text is on. */
export function storeyOf(name: string): 'under' | 'upper' | 'ground' {
  if (/\b(cellar|basement|crypt|undercroft|vault|dungeon|cells|below)\b/i.test(name)) return 'under';
  if (/\b(upper|upstairs|loft|attic|solar|gallery|above|bedroom|bedchamber|guest)\b/i.test(name)) return 'upper';
  return 'ground';
}

const THEMES: { test: RegExp; first: string; last: string; rooms: string[] }[] = [
  {
    test: /\b(tomb|crypt|barrow|catacomb\w*|mausoleum|necropolis|ossuary|grave\w*|burial)\b/i,
    first: 'Entry stair',
    last: 'The great tomb',
    rooms: ['Antechamber', 'Hall of offerings', 'Embalming room', 'Lesser tombs', 'Ossuary', 'Chapel of the dead', 'Gallery of statues', 'False tomb', 'Collapsed passage', 'Burial niches', 'Guardian room', 'Store of grave goods', 'Well room', 'Priests’ cells', 'Pillared hall', 'Treasury'],
  },
  {
    test: /\b(temple|shrine|sanctum|abbey|monastery|cathedral|chapel|fane|priory)\b/i,
    first: 'Porch',
    last: 'Inner sanctum',
    rooms: ['Nave', 'Side chapel', 'Vestry', 'Priests’ cells', 'Library', 'Refectory', 'Kitchen', 'Store room', 'Hall of statues', 'Crypt', 'Baths', 'Bell room', 'Treasury', 'Guard room', 'Cloister walk', 'Scriptorium'],
  },
  {
    test: /\b(keep|fort|fortress|castle|prison|gaol|jail|stronghold|citadel|garrison|redoubt|tower|watch)\b/i,
    first: 'Gatehouse',
    last: 'Warden’s chamber',
    rooms: ['Guard room', 'Barracks', 'Armoury', 'Mess hall', 'Kitchen', 'Store room', 'Cells', 'Great hall', 'Chapel', 'Well room', 'Smithy', 'Stables', 'Strongroom', 'Officers’ quarters', 'Collapsed room', 'Records room'],
  },
  {
    test: /\b(mine|mines|quarry|delve|diggings|pit|shaft)\b/i,
    first: 'Adit',
    last: 'The deep face',
    rooms: ['Tool store', 'Ore room', 'Miners’ bunks', 'Pump room', 'Collapsed gallery', 'Shrine', 'Powder store', 'Smelting room', 'Flooded level', 'Overseer’s room', 'Cart turn', 'Old workings', 'Mess room', 'Well room', 'Timber store', 'Strongroom'],
  },
  {
    test: /\b(lair|den|nest|warren|hive|burrow)\b/i,
    first: 'Entrance',
    last: 'The heart of the lair',
    rooms: ['Watch post', 'Bone pit', 'Larder', 'Sleeping den', 'Nursery', 'Hoard room', 'Midden', 'Pool', 'Narrow crawl', 'Prisoners’ pit', 'Trophy room', 'Feeding hall', 'Collapsed room', 'Shrine', 'Store room', 'Guard room'],
  },
];
const GENERIC = {
  first: 'Entry hall',
  last: 'The vault',
  rooms: ['Guard room', 'Store room', 'Barracks', 'Shrine', 'Well room', 'Armoury', 'Cells', 'Gallery', 'Crypt', 'Workshop', 'Library', 'Great hall', 'Kitchen', 'Collapsed room', 'Pillared hall', 'Antechamber', 'Hall of statues', 'Baths', 'Treasury', 'Study'],
};
const CAVES = {
  first: 'Cave mouth',
  last: 'The deep',
  rooms: ['Low gallery', 'Dripping cavern', 'Bone pit', 'Fungus grotto', 'Still pool', 'Narrow squeeze', 'Great cavern', 'Crystal cleft', 'Sleeping ledge', 'Den', 'Sinkhole', 'Bat roost', 'Painted wall', 'Rockfall', 'Echoing hall', 'Sump'],
};

/** Names for `count` rooms of a place nobody has keyed yet, in an order that makes sense walking in. */
export function roomNames(rnd: Rnd, count: number, about: string, cave = false): string[] {
  const theme = cave ? CAVES : (THEMES.find((t) => t.test.test(about)) ?? GENERIC);
  if (count <= 1) return [theme.first];
  const pool = shuffled(rnd, theme.rooms);
  const out = [theme.first];
  for (let i = 0; out.length < count - 1; i++) out.push(i < pool.length ? pool[i] : `${pick(rnd, ['Lower', 'Old', 'Second', 'Far', 'Small'])} ${pool[i % pool.length].toLowerCase()}`);
  out.push(theme.last);
  return out;
}
