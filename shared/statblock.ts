/**
 * The arithmetic of a 2024 stat block, shared by the server (which fills in what follows from what the GM wrote) and
 * the stat block editor (which shows it as they type): XP and Proficiency Bonus from Challenge Rating, ability
 * modifiers, and Hit Points from Hit Dice.
 */
export const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

/** Every Challenge Rating, lowest first. */
export const CHALLENGE_RATINGS = Object.keys(XP_BY_CR).sort((a, b) => XP_BY_CR[a] - XP_BY_CR[b]);

export const crPb = (cr: string) => {
  const n = cr.includes('/') ? 0 : Number(cr);
  return n >= 29 ? 9 : n >= 25 ? 8 : n >= 21 ? 7 : n >= 17 ? 6 : n >= 13 ? 5 : n >= 9 ? 4 : n >= 5 ? 3 : 2;
};

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/**
 * Hit Points as the books write them, from what a GM types: "7d8+7" becomes "38 (7d8 + 7)" (the average, rounded
 * down); "38 (7d8 + 7)" and "38" are kept. Null for anything else.
 */
export function hitPoints(text: string): { hp: string; avg: number } | null {
  const t = text.trim();
  const dice = /^(\d{1,3})\s*d\s*(\d{1,3})(?:\s*([+-])\s*(\d{1,4}))?$/i.exec(t);
  if (dice) {
    const [n, die, bonus] = [Number(dice[1]), Number(dice[2]), Number(dice[4] ?? 0) * (dice[3] === '-' ? -1 : 1)];
    if (!n || !die) return null;
    const avg = Math.max(1, Math.floor((n * (die + 1)) / 2) + bonus);
    return { hp: `${avg} (${n}d${die}${bonus ? ` ${bonus < 0 ? '-' : '+'} ${Math.abs(bonus)}` : ''})`, avg };
  }
  const written = /^(\d{1,5})(?:\s*\(.+\))?$/.exec(t);
  return written ? { hp: t, avg: Number(written[1]) } : null;
}

interface BlockEntry {
  name: string;
  text: string;
}
interface BlockLists {
  traits?: BlockEntry[];
  actions?: BlockEntry[];
  bonus?: BlockEntry[];
  reactions?: BlockEntry[];
  legendary?: BlockEntry[];
}

/**
 * What a stat block has that runs out, for the encounter tracker: legendary actions (back at the start of its turn),
 * uses each day ("Legendary Resistance (3/Day)"), and abilities that must recharge ("Fire Breath (Recharge 5–6)").
 */
export function countersFrom(b: BlockLists): { name: string; max: number; used: number; eachTurn?: boolean; recharge?: number | null }[] {
  const out: ReturnType<typeof countersFrom> = [];
  if (b.legendary?.length) {
    const uses = b.legendary.map((e) => /\bUses?:?\s*(\d+)/i.exec(`${e.name} ${e.text}`)?.[1]).find(Boolean);
    out.push({ name: 'Legendary actions', max: Number(uses) || 3, used: 0, eachTurn: true });
  }
  for (const e of [...(b.traits ?? []), ...(b.actions ?? []), ...(b.bonus ?? []), ...(b.reactions ?? [])]) {
    const recharge = /\(Recharge (\d)(?:\s*[–-]\s*6)?\)/i.exec(e.name);
    // "(3/Day)", "(3/Day, or 4/Day in Lair)", "(2/Day Each)"; "(Recharge after a Short or Long Rest)" is one use.
    const daily = /\((\d+)\/Day\b/i.exec(e.name) ?? (/\(Recharge after\b/i.test(e.name) ? ['', '1'] : null);
    const name = e.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (recharge) out.push({ name, max: 1, used: 0, recharge: Number(recharge[1]) });
    else if (daily) out.push({ name, max: Number(daily[1]), used: 0 });
  }
  return out;
}

/** A roll written into a stat block's text. */
export interface BlockRoll {
  /** "to hit", "Slashing", "damage". */
  what: string;
  expression: string;
  /** A d20 test (Advantage and Disadvantage apply); not damage. */
  d20: boolean;
}

/**
 * The rolls in an entry's text as the 2024 books write them: "Melee Attack Roll: +7" is 1d20+7 to hit, and every
 * "13 (2d8 + 4) Bludgeoning" is its dice, named for its damage type.
 */
export function rollsIn(text: string): BlockRoll[] {
  const out: BlockRoll[] = [];
  for (const m of text.matchAll(/Attack Roll:\s*([+−-])\s*(\d+)/gi)) out.push({ what: 'to hit', expression: `1d20${m[1] === '+' ? '+' : '-'}${m[2]}`, d20: true });
  for (const m of text.matchAll(/\((\d+d\d+(?:\s*[+−-]\s*\d+)?)\)\s*([A-Z][a-z]+)?/g)) {
    const type = m[2] && !/^(Hit|Miss|Failure|Success|Or)$/.test(m[2]) ? m[2] : 'damage';
    out.push({ what: type, expression: m[1].replace(/\s/g, '').replace(/−/g, '-'), d20: false });
  }
  return out;
}

