/**
 * Generators for the table (v0.9.12, docs/BETA_PLAN.md B5): a person to meet, a shop with its stock and prices, and
 * the weather for a day. All are pure and seeded, so the same seed gives the same result (a day's weather doesn't
 * change when the page is opened again). The words are this app's own, and fit any world.
 */
import type { Terrain, Wealth } from './places.js';

type Rnd = () => number;
const pick = <T>(xs: readonly T[], rnd: Rnd): T => xs[Math.floor(rnd() * xs.length)];
/** `n` different picks. */
function some<T>(xs: readonly T[], n: number, rnd: Rnd): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

// ---- Names for a world with no peoples of its own --------------------------------------------------------------------

/** Styles of first name, for worlds whose peoples have no common names yet. The name generator builds new names from them. */
export const NAME_STYLES: { key: string; label: string; seeds: string[] }[] = [
  { key: 'common', label: 'Common folk', seeds: ['Alden', 'Brenna', 'Corwin', 'Dessa', 'Edric', 'Fenna', 'Garran', 'Hilde', 'Ivor', 'Jessa', 'Kellan', 'Marta', 'Osric', 'Rowena', 'Tamsin', 'Wendel'] },
  { key: 'dwarven', label: 'Dwarven', seeds: ['Borrik', 'Dagmar', 'Thurgan', 'Hildur', 'Kolgrim', 'Brynja', 'Dolmar', 'Sigrun', 'Orvik', 'Gunnvar', 'Harnok', 'Torgild'] },
  { key: 'elven', label: 'Elven', seeds: ['Aethriel', 'Sylwen', 'Thalorin', 'Ilyanis', 'Faelith', 'Mirathel', 'Eriawen', 'Lathiran', 'Vaerion', 'Naelis', 'Caelith', 'Elowen'] },
  { key: 'halfling', label: 'Halfling', seeds: ['Milby', 'Rosalind', 'Perkin', 'Liddy', 'Wilmot', 'Poppy', 'Corbin', 'Jilly', 'Tobin', 'Merrily', 'Finley', 'Bramwell'] },
  { key: 'gnomish', label: 'Gnomish', seeds: ['Fizwin', 'Nissle', 'Bodrick', 'Ellabin', 'Dimbry', 'Carlow', 'Wrennik', 'Zookan', 'Orlabeth', 'Gimmery', 'Tannic', 'Jebbin'] },
  { key: 'orcish', label: 'Orcish', seeds: ['Grakka', 'Ushnar', 'Morgash', 'Drethka', 'Krugan', 'Volka', 'Thokar', 'Baghra', 'Urzog', 'Shakra', 'Dornak', 'Yezka'] },
  { key: 'draconic', label: 'Draconic', seeds: ['Rhazkar', 'Sorvath', 'Kriveth', 'Mishara', 'Tazmir', 'Vorhesh', 'Harakai', 'Nalaxis', 'Jhezra', 'Ordamin', 'Suravel', 'Kavarth'] },
  { key: 'infernal', label: 'Infernal', seeds: ['Azmiel', 'Lerith', 'Malvek', 'Nemira', 'Zoreth', 'Kasmira', 'Draveth', 'Orlissa', 'Ravok', 'Selmeth', 'Tirzah', 'Vexar'] },
];

// ---- A person to meet ------------------------------------------------------------------------------------------------

export const NPC_ROLES = [
  'innkeeper',
  'farmer',
  'shepherd',
  'miller',
  'baker',
  'brewer',
  'butcher',
  'blacksmith',
  'carpenter',
  'mason',
  'weaver',
  'tailor',
  'cobbler',
  'potter',
  'tanner',
  'chandler',
  'fisher',
  'ferry keeper',
  'sailor',
  'dock hand',
  'carter',
  'stable hand',
  'pedlar',
  'merchant',
  'moneylender',
  'scribe',
  'tutor',
  'healer',
  'midwife',
  'herbalist',
  'gravedigger',
  'priest',
  'pilgrim',
  'hermit',
  'town guard',
  'gate warden',
  'tax collector',
  'magistrate',
  'herald',
  'steward',
  'servant',
  'cook',
  'minstrel',
  'player in a troupe',
  'fortune teller',
  'hunter',
  'trapper',
  'woodcutter',
  'charcoal burner',
  'miner',
  'prospector',
  'caravan guard',
  'sellsword',
  'deserter',
  'smuggler',
  'pickpocket',
  'fence',
  'beggar',
  'rat catcher',
  'lamplighter',
  'messenger',
  'apprentice mage',
  'alchemist',
  'bookseller',
  'mapmaker',
  'noble’s younger child',
  'retired adventurer',
] as const;

const NPC_LOOKS = [
  'a broken nose that healed crooked',
  'ink-stained fingers',
  'a burn scar across one forearm',
  'a patch over one eye',
  'a stoop, and a slow, careful walk',
  'a scarf wound twice, whatever the season',
  'one ear notched like a tally stick',
  'a tooth capped in tin',
  'a limp, and a walking stick carved with tally marks',
  'a missing front tooth',
  'hands like shovels',
  'a voice far deeper than you would expect',
  'rings on every finger, none of them worth much',
  'a tattoo of a bird behind one ear',
  'clothes mended many times, and well',
  'a fine coat that was made for somebody else',
  'mud to the knees, whatever the weather',
  'a neat row of pins in the collar',
  'a faded soldier’s sash',
  'a string of wooden beads, worried smooth',
  'eyes of two different colours',
  'a bandaged hand they don’t explain',
  'a hat they never take off',
  'the smell of woodsmoke about them',
  'the smell of lamp oil and old paper',
  'flour, sawdust or soot on everything they own',
  'a child’s drawing folded in a pocket',
  'a dog that follows three steps behind',
  'spectacles held together with wire',
  'a laugh you hear before you see them',
  'very clean boots',
  'a heavy ring of keys',
  'a satchel that never leaves their shoulder',
  'a long scar they tell a different story about each time',
  'a thin, careful smile',
  'shoulders stooped from years of the same work',
] as const;

const NPC_MANNERS = [
  'talks fast and finishes other people’s sentences',
  'speaks slowly and chooses every word',
  'never quite meets your eye',
  'stares a little too long',
  'laughs at their own jokes',
  'answers a question with a question',
  'is polite to the point of stiffness',
  'is blunt, and proud of it',
  'whispers, even about ordinary things',
  'calls everyone “friend” and means none of it',
  'calls everyone “friend” and means it',
  'keeps count on their fingers while talking',
  'cannot stand still',
  'keeps busy with their hands the whole time',
  'is tired, and it shows',
  'is cheerful in a way that feels like armour',
  'is suspicious of strangers, warm once won over',
  'haggles over everything, by habit',
  'quotes proverbs, some of them made up',
  'complains about the weather, the roads and the young',
  'gossips freely about everyone but themselves',
  'asks about your journey and really listens',
  'is plainly afraid of something',
  'is plainly in a hurry',
  'flatters anyone with a full purse',
  'treats rank as nothing and work as everything',
  'apologises constantly',
  'hums the same four notes',
  'swears mildly and often',
  'is kind to animals and short with people',
  'remembers every name and every debt',
  'forgets names and makes up new ones',
] as const;

const NPC_WANTS = [
  'a letter carried to someone they can’t visit',
  'news of a relative who went away to the city',
  'a debt paid off before the next market day',
  'somebody to look into noises under their floor',
  'an honest price for something they found',
  'a rival embarrassed, nothing worse',
  'an escort along a road they no longer trust',
  'a lost tool, animal or heirloom brought back',
  'to leave this place, and the coin to do it',
  'to be left alone to do their work',
  'their child apprenticed somewhere safe',
  'a witness for a deal they don’t trust',
  'the truth about how a friend died',
  'a wrong put right without the law hearing of it',
  'a wrong put right by the law, for once',
  'a rare ingredient before it is too late',
  'word taken to the authorities, by someone they will believe',
  'a ghost, real or not, to stop bothering them',
  'to win a bet they should never have made',
  'to impress someone who barely knows they exist',
  'a place at a guild, a temple or a great house',
  'somebody to listen',
  'an old map explained',
  'a stranger in town followed and reported on',
  'protection, though they won’t say from whom',
  'revenge, and they will say exactly on whom',
  'to see one wonder before they die',
  'to forget something, with drink if nothing else',
  'help hiding something until a visitor has gone',
  'a quiet word put in with someone powerful',
] as const;

const NPC_SECRETS = [
  'They owe money to someone dangerous.',
  'They are not who they say they are; the name is borrowed.',
  'They saw something they should not have, and have told no one.',
  'They are passing information to an outside power, for pay.',
  'They are passing information to an outside power, out of belief.',
  'They stole the thing that made their living possible.',
  'They are hiding someone in their home.',
  'They once served a cause that is now a crime to have served.',
  'They are quietly, seriously ill.',
  'They know where something valuable is buried and can’t get to it.',
  'They are in love with someone they must not be.',
  'They forged the paper their position rests on.',
  'They let someone take the blame for what they did.',
  'They pray to a power their neighbours would not forgive.',
  'They have a small, unreliable gift for magic and fear it.',
  'They are the last who remembers a promise the town has broken.',
  'They are being blackmailed, and paying.',
  'They are blackmailing someone, and frightened of it.',
  'They killed in self-defence, and buried the proof.',
  'They are far richer than they let anyone see.',
  'They have already sold what they are still promising.',
  'They are planning to run, and soon.',
  'They recognise one of the party from somewhere, and say nothing.',
  'They keep a journal that would ruin three families.',
  'They have been paid to watch for people exactly like the party.',
  'Nothing at all: they are exactly what they seem, which nobody believes.',
] as const;

export interface NpcIdea {
  name: string;
  people: string;
  role: string;
  look: string;
  manner: string;
  want: string;
  secret: string;
}

/** A person to meet. `name` and `people` come from the name generator; `role` is the GM's, if they gave one. */
export function npcIdea(rnd: Rnd, name: string, people: string, role?: string): NpcIdea {
  return { name, people, role: role?.trim() || pick(NPC_ROLES, rnd), look: pick(NPC_LOOKS, rnd), manner: pick(NPC_MANNERS, rnd), want: pick(NPC_WANTS, rnd), secret: pick(NPC_SECRETS, rnd) };
}

/** "A" or "An" before a word. */
export const article = (word: string) => (/^[aeiou]/i.test(word) ? 'An' : 'A');

/** The person as a record's text: who they are, what they want, and a GM-only secret. */
export function npcText(n: NpcIdea): string {
  return `${article(n.role)} ${n.role}, with ${n.look}. ${n.name.split(' ')[0]} ${n.manner}.\n\n## Wants\n\n${n.want.charAt(0).toUpperCase()}${n.want.slice(1)}.\n\n## Secrets\n\n${n.secret}\n`;
}

// ---- A shop ----------------------------------------------------------------------------------------------------------

/** What a shop's shelves are filled from: item types, item names, and which magic items (by item type) it might have. */
export interface ShopKind {
  key: string;
  label: string;
  /** How it reads in a sentence: "a smithy". */
  noun: string;
  types?: RegExp;
  names?: RegExp;
  magic?: RegExp;
  /** How many kinds of ordinary thing a modest one has. */
  size: number;
  signs: string[];
}

export const SHOP_KINDS: ShopKind[] = [
  { key: 'general', label: 'General store', noun: 'a general store', types: /^(Adventuring Gear|Item|Food and Drink|Ammunition)$/, size: 16, signs: ['Stores', 'Goods', 'Provisions', 'Sundries', 'Trading Post'] },
  { key: 'smith', label: 'Smithy (weapons and armour)', noun: 'a smithy', types: /(Weapon|Armor)$|^(Shield|Ammunition)$/, magic: /^(Weapon|Armor) \(/, size: 12, signs: ['Forge', 'Anvil', 'Smithy', 'Arms', 'Ironworks'] },
  {
    key: 'apothecary',
    label: 'Apothecary',
    noun: 'an apothecary',
    names: /Healer|Herbalism|Antitoxin|Acid|Alchemist|Perfume|Soap|Vial|Flask|Component Pouch|Oil|Holy Water|Candle|Poisoner/i,
    magic: /^Potion$/,
    size: 8,
    signs: ['Remedies', 'Apothecary', 'Simples', 'Cures', 'Stillroom'],
  },
  { key: 'stable', label: 'Stable and wainwright', noun: 'a stable', types: /^(Mount|Vehicle|Tack and Harness)$/, size: 9, signs: ['Stables', 'Livery', 'Yard', 'Wheel and Harness', 'Coach House'] },
  { key: 'tavern', label: 'Tavern or inn', noun: 'a tavern', types: /^(Food and Drink|Gaming Set)$/, size: 7, signs: ['Arms', 'Inn', 'Tavern', 'Rest', 'Tap'] },
  { key: 'workshop', label: 'Tools and instruments', noun: 'a workshop', types: /Tools$|^(Musical Instrument|Gaming Set)$/, size: 12, signs: ['Workshop', 'Tools', 'Bench', 'Works', 'Makers'] },
  {
    key: 'arcane',
    label: 'Arcane shop',
    noun: 'an arcane shop',
    types: /^Spellcasting Focus$/,
    names: /Spellbook|Ink|Parchment|Paper|Book|Component Pouch|Chalk|Crystal|Lens|Hourglass/i,
    magic: /^(Potion|Scroll|Wand|Ring|Rod|Staff|Wondrous Item)$/,
    size: 9,
    signs: ['Curios', 'Emporium', 'Wonders', 'Oddments', 'Sigil'],
  },
];

const SIGN_WORDS = ['Golden', 'Silver', 'Copper', 'Crooked', 'Merry', 'Sleeping', 'Laughing', 'Old', 'Lucky', 'Honest', 'Black', 'Green', 'Red', 'Blue', 'Wandering', 'Last', 'Three', 'Seven'];
const SIGN_THINGS = ['Lantern', 'Anchor', 'Stag', 'Goose', 'Kettle', 'Crown', 'Barrel', 'Wheel', 'Fox', 'Bell', 'Candle', 'Oak', 'Hammer', 'Key', 'Moon', 'Sparrow', 'Bridge', 'Thimble'];

/** What a magic item usually sells for, by rarity, in gold pieces; a consumable is half. A guide, for the GM to change. */
export const RARITY_VALUE: Record<string, number> = { common: 100, uncommon: 400, rare: 4000, 'very rare': 40000, legendary: 200000 };

/** An item as the shop generator needs it (the item catalogue's rows fit). */
export interface ShopItem {
  name: string;
  type: string;
  rarity: string;
  magic: boolean;
  value: number | null;
}

export interface ShopLine {
  name: string;
  type: string;
  magic: boolean;
  rarity: string;
  /** In gold pieces. */
  price: number;
  /** How many there are; 0 means plenty. */
  stock: number;
}

export interface Shop {
  kind: string;
  name: string;
  wealth: Wealth;
  /** How this shop's prices compare with the usual. */
  prices: 'cheap' | 'fair' | 'dear';
  lines: ShopLine[];
}

/** A price as coins: "12 gp", "5 sp", "2 cp", "1,500 gp". */
export function coins(gp: number): string {
  if (gp >= 1) return `${(gp >= 100 ? Math.round(gp) : Math.round(gp * 10) / 10).toLocaleString('en-US')} gp`;
  if (gp >= 0.1) return `${Math.round(gp * 10)} sp`;
  return `${Math.max(1, Math.round(gp * 100))} cp`;
}

/** A price kept to coins people would ask for (no "13.37 gp"). */
function tidy(gp: number): number {
  if (gp >= 1000) return Math.round(gp / 50) * 50;
  if (gp >= 100) return Math.round(gp / 5) * 5;
  if (gp >= 10) return Math.round(gp);
  if (gp >= 1) return Math.round(gp * 2) / 2;
  return Math.max(0.01, Math.round(gp * 100) / 100);
}

const MARKUP = { cheap: 0.9, fair: 1, dear: 1.2 } as const;
/** The rarest magic a place of each wealth has for sale, and how many such things. */
const MAGIC_BY_WEALTH: Record<Wealth, { rarities: string[]; count: [number, number] }> = {
  poor: { rarities: ['common'], count: [0, 1] },
  modest: { rarities: ['common', 'uncommon'], count: [1, 3] },
  rich: { rarities: ['common', 'uncommon', 'uncommon', 'rare'], count: [3, 6] },
};

/**
 * A shop of a kind in a place of some wealth, stocked from the items given (the library's catalogue: the SRD's and
 * the GM's books'). A poor place has less, and nothing costly; a rich one has more, and rarer magic.
 */
export function makeShop(rnd: Rnd, kind: ShopKind, wealth: Wealth, items: ShopItem[], keeper = ''): Shop {
  const prices = pick(wealth === 'rich' ? (['fair', 'dear', 'dear'] as const) : wealth === 'poor' ? (['cheap', 'fair', 'fair'] as const) : (['cheap', 'fair', 'fair', 'dear'] as const), rnd);
  const ordinary = items.filter((i) => !i.magic && i.value != null && i.value > 0 && ((kind.types?.test(i.type) ?? false) || (kind.names?.test(i.name) ?? false)));
  const cap = wealth === 'poor' ? 50 : wealth === 'modest' ? 1000 : Infinity;
  const affordable = ordinary.filter((i) => i.value! <= cap);
  const n = Math.round(kind.size * (wealth === 'poor' ? 0.6 : wealth === 'rich' ? 1.4 : 1));
  const lines: ShopLine[] = some(affordable, n, rnd).map((i) => ({
    name: i.name,
    type: i.type,
    magic: false,
    rarity: '',
    price: tidy(i.value! * MARKUP[prices]),
    // Cheap things are there in plenty; costly ones by the handful.
    stock: i.value! < 5 ? 0 : 1 + Math.floor(rnd() * (i.value! >= 100 ? 2 : wealth === 'rich' ? 6 : 4)),
  }));
  if (kind.magic) {
    const m = MAGIC_BY_WEALTH[wealth];
    const count = m.count[0] + Math.floor(rnd() * (m.count[1] - m.count[0] + 1));
    const pool = items.filter((i) => i.magic && kind.magic!.test(i.type) && m.rarities.includes(i.rarity));
    // Rarer things are picked less often: each rarity in the list is one draw.
    const byRarity = (r: string) => pool.filter((i) => i.rarity === r);
    const seen = new Set<string>();
    for (let k = 0; k < count; k++) {
      const from = byRarity(pick(m.rarities, rnd)).filter((i) => !seen.has(i.name));
      if (!from.length) continue;
      const i = pick(from, rnd);
      seen.add(i.name);
      const base = i.value && i.value > 0 ? i.value : (RARITY_VALUE[i.rarity] ?? 0) * (i.type === 'Potion' ? 0.5 : 1);
      lines.push({ name: i.name, type: i.type, magic: true, rarity: i.rarity, price: tidy(base * MARKUP[prices]), stock: 1 });
    }
  }
  lines.sort((a, b) => Number(a.magic) - Number(b.magic) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const sign = pick(kind.signs, rnd);
  const surname = keeper.trim().split(/\s+/).slice(-1)[0];
  const name = surname && rnd() < 0.4 ? `${surname}’s ${sign}` : `The ${pick(SIGN_WORDS, rnd)} ${pick(SIGN_THINGS, rnd)}${rnd() < 0.5 ? ` ${sign}` : ''}`;
  return { kind: kind.key, name, wealth, prices, lines };
}

/** The shop as a record's text: what it is, who keeps it, and what is for sale. */
export function shopText(shop: Shop, keeper: NpcIdea | null, place = ''): string {
  const kind = SHOP_KINDS.find((k) => k.key === shop.kind);
  const head = `${kind ? kind.noun.charAt(0).toUpperCase() + kind.noun.slice(1) : 'A shop'}${place ? ` in ${place}` : ''}${keeper ? `, kept by ${keeper.name} (${keeper.people.toLowerCase()}), who ${keeper.manner}` : ''}. Its prices are ${shop.prices === 'dear' ? 'high' : shop.prices === 'cheap' ? 'low' : 'fair'}.`;
  const rows = shop.lines.map((l) => `| ${l.name}${l.magic ? ` (${l.rarity})` : ''} | ${coins(l.price)} | ${l.stock ? l.stock : 'Plenty'} |`);
  const secret = keeper ? `\n\n## Secrets\n\n${keeper.name.split(' ')[0]} wants ${keeper.want}. ${keeper.secret}\n` : '\n';
  return `${head}\n\n## For sale\n\n| Item | Price | In stock |\n| --- | --- | --- |\n${rows.join('\n')}${secret}`;
}

// ---- The weather -----------------------------------------------------------------------------------------------------

export const TEMPERATURES = ['freezing', 'cold', 'cool', 'mild', 'warm', 'hot', 'scorching'] as const;
export type Temperature = (typeof TEMPERATURES)[number];
export type Wind = 'calm' | 'breezy' | 'windy' | 'gale';

export interface Weather {
  temperature: Temperature;
  wind: Wind;
  /** What is falling or in the air, if anything. */
  falling: '' | 'light rain' | 'heavy rain' | 'light snow' | 'heavy snow' | 'sleet' | 'fog' | 'blowing dust' | 'thunderstorm';
  sky: 'clear' | 'some cloud' | 'overcast';
  /** One line to read out. */
  summary: string;
  /** What it does at the table, in rules terms. */
  effects: string[];
}

/** A season's usual warmth (an index into TEMPERATURES) and chance of rain or snow, from its name in any words. */
function seasonOf(season: string): { warmth: number; wet: number } {
  const s = season.toLowerCase();
  if (/winter|frost|ice|snow|dark|cold/.test(s)) return { warmth: 1, wet: 0.3 };
  if (/summer|high sun|heat|hot|dry|sun/.test(s)) return { warmth: 4.4, wet: /dry/.test(s) ? 0.08 : 0.18 };
  if (/autumn|fall|harvest|leaf/.test(s)) return { warmth: 2.4, wet: 0.35 };
  if (/spring|thaw|bloom|planting|green/.test(s)) return { warmth: 3, wet: 0.35 };
  if (/rain|wet|monsoon|storm|flood/.test(s)) return { warmth: 3.6, wet: 0.65 };
  return { warmth: 3, wet: 0.25 };
}

/** Terrains with no sky: there is no weather to speak of. */
const NO_SKY: Terrain[] = ['underdark', 'underwater', 'planar'];

const mix = (a: number, b: number) => {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 || 1;
};
function rng(seed: number): Rnd {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * The weather on a day. `day` counts days from any fixed start (year × days in a year + day of the year), so that a
 * spell of weather lasts a few days: the day's weather leans on a "front" shared by three days running.
 * Returns null where there is no sky.
 */
export function weatherOn(o: { season: string; terrain: Terrain[]; seed: number; day: number }): Weather | null {
  const t = new Set(o.terrain);
  if (o.terrain.length && o.terrain.every((x) => NO_SKY.includes(x))) return null;
  const front = rng(mix(o.seed, Math.floor(o.day / 3)));
  const today = rng(mix(o.seed ^ 0x51ed, o.day));
  for (let i = 0; i < 3; i++) (front(), today());
  const season = seasonOf(o.season);

  let warmth = season.warmth + (front() - 0.5) * 1.6 + (today() - 0.5) * 0.8;
  if (t.has('arctic')) warmth -= 2.2;
  if (t.has('mountain')) warmth -= 1;
  if (t.has('desert')) warmth += 1.8;
  if (t.has('swamp')) warmth += 0.4;
  const temperature = TEMPERATURES[Math.max(0, Math.min(TEMPERATURES.length - 1, Math.round(warmth)))];

  let windy = front() * 0.6 + today() * 0.4;
  if (t.has('coastal') || t.has('mountain') || t.has('grassland') || t.has('hill') || t.has('arctic')) windy += 0.12;
  if (t.has('forest') || t.has('urban') || t.has('swamp')) windy -= 0.08;
  const wind: Wind = windy > 0.93 ? 'gale' : windy > 0.72 ? 'windy' : windy > 0.38 ? 'breezy' : 'calm';

  let wet = season.wet + (front() - 0.5) * 0.4;
  if (t.has('desert')) wet *= 0.15;
  if (t.has('swamp') || t.has('coastal')) wet += 0.1;
  if (t.has('forest')) wet += 0.05;
  const roll = today();
  const cold = temperature === 'freezing' || temperature === 'cold';
  let falling: Weather['falling'] = '';
  if (roll < wet) {
    const heavy = roll < wet / 3;
    if (cold) falling = heavy ? 'heavy snow' : 'light snow';
    else if (temperature === 'cool' && today() < 0.3) falling = 'sleet';
    else if (heavy && (temperature === 'warm' || temperature === 'hot' || temperature === 'scorching') && today() < 0.5) falling = 'thunderstorm';
    else falling = heavy ? 'heavy rain' : 'light rain';
  } else if (t.has('desert') && (wind === 'windy' || wind === 'gale')) falling = 'blowing dust';
  else if (wind === 'calm' && today() < (t.has('swamp') || t.has('coastal') || t.has('forest') || t.has('hill') ? 0.3 : 0.1)) falling = 'fog';
  const sky: Weather['sky'] = falling && falling !== 'fog' && falling !== 'blowing dust' ? 'overcast' : today() < 0.45 ? 'clear' : today() < 0.6 ? 'overcast' : 'some cloud';

  const effects: string[] = [];
  if (falling === 'heavy rain' || falling === 'heavy snow' || falling === 'thunderstorm')
    effects.push(`Heavy ${falling === 'heavy snow' ? 'snow' : 'rain'}: everything outdoors is Lightly Obscured, and Wisdom (Perception) checks have Disadvantage.${falling === 'heavy snow' ? '' : ' Open flames go out.'}`);
  if (falling === 'fog') effects.push('Fog: the area is Heavily Obscured beyond a stone’s throw until it lifts.');
  if (falling === 'blowing dust') effects.push('Blowing dust: Lightly Obscured, and Wisdom (Perception) checks that rely on sight have Disadvantage.');
  if (wind === 'windy' || wind === 'gale') effects.push('Strong wind: ranged attack rolls with weapons have Disadvantage, open flames go out and fog blows away. Flying without magic is hard to keep up.');
  if (temperature === 'freezing') effects.push('Extreme cold: each hour without cold-weather gear, a DC 10 Constitution save or a level of Exhaustion.');
  if (temperature === 'scorching') effects.push('Extreme heat: each hour without enough water, a Constitution save (DC 5, one higher each hour) or a level of Exhaustion.');

  const air = wind === 'calm' ? 'still air' : wind === 'breezy' ? 'a light breeze' : wind === 'windy' ? 'a strong wind' : 'a gale';
  const skyWords = sky === 'clear' ? 'a clear sky' : sky === 'overcast' ? 'a grey sky' : 'broken cloud';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const summary = falling ? `${cap(temperature)}, with ${falling}${falling === 'fog' ? ' in the morning' : ''} and ${air}.` : `${cap(temperature)}, ${skyWords} and ${air}.`;
  return { temperature, wind, falling, sky, summary, effects };
}
