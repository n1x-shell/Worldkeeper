/**
 * The name generator: new names in the style of a people, built from its common names, that nobody in the world
 * already has. A first name or a surname that is already used anywhere is never offered, so new people never clash
 * with old ones by accident.
 */

/** Peoples that go by a single name, or a name with no family part. */
export const SINGLE_NAMES = new Set(['autognomes', 'bloomborn', 'changelings', 'fairies', 'githyanki', 'githzerai', 'kenku', 'plasmoids', 'tabaxi', 'thri-kreen', 'warforged']);

/** Peoples whose names are ordinary words: new names come from these, alongside the people's own. */
const WORD_NAMES: Record<string, string[]> = {
  kenku: [
    'Bell',
    'Chime',
    'Clatter',
    'Click',
    'Creak',
    'Drip',
    'Flutter',
    'Hiss',
    'Hum',
    'Knock',
    'Patter',
    'Rattle',
    'Rustle',
    'Scrape',
    'Shuffle',
    'Snap',
    'Tap',
    'Thrum',
    'Tick',
    'Tinkle',
    'Whirr',
    'Whisk',
  ],
  warforged: [
    'Anchor',
    'Anvil',
    'Bastion',
    'Brace',
    'Buckle',
    'Cairn',
    'Gauntlet',
    'Girder',
    'Halberd',
    'Ledger',
    'Lintel',
    'Mallet',
    'Pillar',
    'Rampart',
    'Rivet',
    'Sentry',
    'Spindle',
    'Steeple',
    'Tally',
    'Warden',
  ],
  autognomes: [
    'Axle',
    'Bracket',
    'Calliper',
    'Chisel',
    'Clasp',
    'Dial',
    'Fuse',
    'Gimbal',
    'Hinge',
    'Latch',
    'Lever',
    'Nib',
    'Pinion',
    'Plumb',
    'Ratchet',
    'Rivet',
    'Sprocket',
    'Tinker',
    'Valve',
    'Widget',
  ],
  plasmoids: ['Blot', 'Burble', 'Dapple', 'Drift', 'Glob', 'Gloss', 'Jelly', 'Murk', 'Ooze', 'Plip', 'Quaver', 'Ripple', 'Seep', 'Slick', 'Sway', 'Swirl', 'Wobble'],
};
/** Tabaxi names are phrases about the world: "Moss-in-Rain", "Five Dawns", "Ember-Eyes". */
const TABAXI_WORDS = [
  'Ash',
  'Bramble',
  'Cloud',
  'Dew',
  'Dusk',
  'Ember',
  'Feather',
  'Fern',
  'Frost',
  'Leaf',
  'Moon',
  'Moss',
  'Rain',
  'River',
  'Salt',
  'Shadow',
  'Smoke',
  'Snow',
  'Spark',
  'Star',
  'Stone',
  'Sun',
  'Thorn',
  'Wind',
];
const TABAXI_NUMBERS = ['Two', 'Three', 'Five', 'Seven', 'Nine', 'Twelve', 'Many'];

const SURNAME_START = [
  'Amber',
  'Ash',
  'Barrow',
  'Birch',
  'Black',
  'Bram',
  'Briar',
  'Brook',
  'Cinder',
  'Cold',
  'Copper',
  'Crow',
  'Dusk',
  'Elder',
  'Ember',
  'Fallow',
  'Fern',
  'Flint',
  'Frost',
  'Gale',
  'Glen',
  'Gold',
  'Hawk',
  'Hazel',
  'Heath',
  'Hollow',
  'Iron',
  'Kestrel',
  'Lark',
  'Linden',
  'Marsh',
  'Mill',
  'Moor',
  'Moss',
  'North',
  'Oak',
  'Pike',
  'Quarry',
  'Raven',
  'Red',
  'Reed',
  'Rook',
  'Rowan',
  'Salt',
  'Sedge',
  'Silver',
  'Slate',
  'Sorrow',
  'Stone',
  'Storm',
  'Swift',
  'Tall',
  'Thistle',
  'Tinder',
  'Wether',
  'White',
  'Willow',
  'Winter',
  'Wolf',
  'Wren',
];
const SURNAME_END = [
  'acre',
  'bank',
  'barrow',
  'bourne',
  'bridge',
  'brook',
  'by',
  'combe',
  'cote',
  'croft',
  'dale',
  'den',
  'field',
  'fold',
  'ford',
  'gate',
  'grave',
  'hart',
  'haven',
  'hill',
  'holm',
  'hurst',
  'ley',
  'low',
  'mantle',
  'mere',
  'more',
  'ridge',
  'shaw',
  'stead',
  'thorpe',
  'ton',
  'vale',
  'well',
  'wick',
  'wood',
  'worth',
  'wright',
];

/** A small seeded random number generator, so a list can be reproduced. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const pick = <T>(xs: T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)];
const VOWEL = /[aeiouy]/i;

/** Split a name after its first vowel group ("Kirru" → "Kir" + "ru"), for recombining. */
function halves(name: string): [string, string] | null {
  const m = /^([^aeiouy]*[aeiouy]+[^aeiouy]?)(.+)$/i.exec(name);
  return m && m[2].length >= 2 ? [m[1], m[2]] : null;
}

/** First names in the style of the seeds: a seed's start joined to another seed's ending. */
function firstName(seeds: string[], rnd: () => number) {
  const starts = seeds
    .map(halves)
    .filter((x): x is [string, string] => !!x)
    .map((x) => x[0]);
  const ends = seeds.flatMap((s) => [2, 3, 4].filter((n) => s.length > n + 1).map((n) => s.slice(-n).toLowerCase()));
  if (!starts.length || !ends.length) return pick(seeds, rnd);
  const a = pick(starts, rnd);
  const b = pick(ends, rnd);
  const joined = a.endsWith(b[0]) ? a + b.slice(1) : a + b;
  // Keep a vowel near the join, and no triple letters.
  return VOWEL.test(joined.slice(a.length - 1)) && !/(.)\1\1/.test(joined) ? joined : a + b;
}

/** Rough pronounceability: no three consonants together, no doubled consonant at the end, and a sensible ending. */
export function sayable(name: string) {
  if (name.split(/['-]/).some((part) => part.length < 3)) return false;
  const n = name.toLowerCase().replace(/['-]/g, '');
  if (/[^aeiouy]{3}/.test(n) || /([^aeiouy])\1$/.test(n) || /([aeiou])\1\1/.test(n)) return false;
  const tail = n.slice(-2);
  return /[aeiouy]/.test(tail) || ['nd', 'rn', 'rd', 'ld', 'rk', 'rt', 'st', 'th', 'sh', 'ck', 'nk', 'nt', 'rm', 'lm'].includes(tail);
}

const plural = (w: string) => (/(s|sh|ch|x)$/.test(w) ? `${w}es` : `${w}s`);

export interface NameOptions {
  /** The people's common names, from its page. */
  seeds: string[];
  /** The people's key, lower case and plural ("dwarves", "kenku"). */
  people: string;
  /** Every word already used in a name in the world, lower case. */
  used: Set<string>;
  count?: number;
  seed?: number;
}

/** New names in the people's style, none of whose words are already used. */
export function generateNames({ seeds, people, used, count = 12, seed = Date.now() }: NameOptions): string[] {
  const rnd = seeded(seed);
  const clean = seeds.map((s) => s.trim()).filter(Boolean);
  if (!clean.length) return [];
  const single = SINGLE_NAMES.has(people.toLowerCase());
  const out = new Set<string>();
  const taken = (w: string) => used.has(w.toLowerCase()) || [...out].some((n) => n.toLowerCase().split(/\s+/).includes(w.toLowerCase()));
  const key = people.toLowerCase();
  for (let tries = 0; out.size < count && tries < count * 80; tries++) {
    let name: string;
    if (WORD_NAMES[key]) name = pick([...WORD_NAMES[key], ...clean], rnd);
    else if (key === 'tabaxi') {
      const n = pick(TABAXI_WORDS, rnd);
      const r = rnd();
      name = r < 0.4 ? `${n}-in-${pick(TABAXI_WORDS, rnd)}` : r < 0.7 ? `${pick(TABAXI_NUMBERS, rnd)} ${plural(n)}` : `${n}-Eyes`;
      if (name.split(/[\s-]/).filter((w) => w !== 'in').length !== new Set(name.split(/[\s-]/)).size - (name.includes('-in-') ? 1 : 0)) continue;
    } else {
      const first = firstName(clean, rnd);
      if (first.length < 3 || first.length > 10 || taken(first) || !sayable(first)) continue;
      if (single) name = first;
      else {
        const sur = pick(SURNAME_START, rnd) + pick(SURNAME_END, rnd);
        if (taken(sur) || sur.length > 12) continue;
        name = `${first} ${sur}`;
      }
    }
    if (out.has(name) || used.has(name.toLowerCase()) || (WORD_NAMES[key] && taken(name))) continue;
    out.add(name);
  }
  return [...out];
}
