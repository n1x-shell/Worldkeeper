/**
 * Pure table-play logic shared by client and server (and unit-tested):
 * dice expressions, initiative order, damage/healing and concentration checks.
 */

export interface DiceResult {
  expression: string;
  total: number;
  detail: string;
  rolls: number[];
}

export type Rng = () => number;

const rollDie = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1;

/**
 * Supports: `d20`, `2d6+3`, `1d20+5 adv`, `1d20 dis`, `4d6kh3`, `4d6dl1`, `2d8+1d6+4`, `d%`.
 * Throws on anything else so typos never silently produce a number.
 */
export function rollDice(expression: string, rng: Rng = Math.random): DiceResult {
  let expr = expression.trim().toLowerCase().replace(/\s+/g, ' ');
  let mode: 'adv' | 'dis' | null = null;
  const m = /\s*\b(adv|advantage|dis|disadvantage)\b\s*$/.exec(expr);
  if (m) {
    mode = m[1].startsWith('adv') ? 'adv' : 'dis';
    expr = expr.slice(0, m.index).trim();
  }
  expr = expr.replace(/\s/g, '').replace(/d%/g, 'd100');
  if (!expr || !/^[+-]?(\d*d\d+((kh|kl|dh|dl)\d+)?|\d+)([+-](\d*d\d+((kh|kl|dh|dl)\d+)?|\d+))*$/.test(expr)) {
    throw new Error(`Cannot read dice expression "${expression}"`);
  }
  const terms = expr.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  const parts: string[] = [];
  const allRolls: number[] = [];
  let usedMode = false;
  for (const raw of terms) {
    const sign = raw.startsWith('-') ? -1 : 1;
    const term = raw.replace(/^[+-]/, '');
    const dm = /^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?$/.exec(term);
    if (!dm) {
      const n = parseInt(term, 10);
      total += sign * n;
      parts.push(`${sign < 0 ? '-' : '+'}${n}`);
      continue;
    }
    const count = dm[1] ? parseInt(dm[1], 10) : 1;
    const sides = parseInt(dm[2], 10);
    if (count < 1 || count > 200 || sides < 2 || sides > 1000) throw new Error('Dice count must be 1–200 and sides 2–1000');
    let rolls = Array.from({ length: count }, () => rollDie(sides, rng));
    let note = '';
    if (mode && !usedMode && count === 1 && sides === 20) {
      const second = rollDie(20, rng);
      const pick = mode === 'adv' ? Math.max(rolls[0], second) : Math.min(rolls[0], second);
      note = ` (${mode} ${rolls[0]}, ${second})`;
      rolls = [pick];
      usedMode = true;
    }
    let kept = rolls;
    if (dm[3]) {
      const k = parseInt(dm[4], 10);
      const sorted = [...rolls].sort((a, b) => b - a);
      if (dm[3] === 'kh') kept = sorted.slice(0, k);
      else if (dm[3] === 'kl') kept = sorted.slice(-k);
      else if (dm[3] === 'dh') kept = sorted.slice(k);
      else kept = sorted.slice(0, Math.max(0, sorted.length - k));
    }
    const sum = kept.reduce((a, b) => a + b, 0);
    total += sign * sum;
    allRolls.push(...rolls);
    parts.push(`${sign < 0 ? '-' : '+'}${count}d${sides}${dm[3] ? dm[3] + dm[4] : ''}[${rolls.join(',')}]${note}`);
  }
  return { expression: expression.trim(), total, detail: parts.join(' ').replace(/^\+/, ''), rolls: allRolls };
}

export interface Combatant {
  id: string;
  name: string;
  initiative: number | null;
  initiativeBonus: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number | null;
  conditions: string[];
  concentration: string | null;
  isPC: boolean;
  hidden: boolean;
  entityId: string | null;
  /** A creature from the GM's books, for its stat block (GM only). */
  statblockId?: string | null;
  /** What players call it on their phones; blank shows its name. */
  playerName?: string;
  notes: string;
  defeated: boolean;
  /** A party member's character: its hit points are the sheet's, both ways. */
  characterId?: number | null;
  /** Creatures added together share a group: one initiative roll for all of them. */
  group?: string | null;
  /** What defeating it is worth, from its stat block. */
  xp?: number | null;
  /** Spells and other things with an end ("Bless", "Hold Person"), which end by themselves. */
  effects?: Effect[];
  /** Things that run out: legendary actions, uses each day, an ability that must recharge. */
  counters?: Counter[];
}

/**
 * Something on a combatant that ends. It ends at the start of the turn of whoever's turn it was when it began (the
 * caster, usually), `rounds` rounds later, as "until the start of your turn" and "1 minute" run in the rules.
 */
export interface Effect {
  id: string;
  name: string;
  endRound: number;
  /** The combatant whose turn it ends on. */
  anchor: string | null;
}

export interface Counter {
  name: string;
  max: number;
  used: number;
  /** Comes back at the start of its own turn (legendary actions). */
  eachTurn?: boolean;
  /** Once used, comes back on a d6 roll of this or more, rolled at the start of its turn (Recharge 5–6 is 5). */
  recharge?: number | null;
}

export function newCombatant(partial: Partial<Combatant> & { name: string }): Combatant {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2, 10),
    initiative: null,
    initiativeBonus: 0,
    hp: partial.maxHp ?? 0,
    maxHp: 0,
    tempHp: 0,
    ac: null,
    conditions: [],
    concentration: null,
    isPC: false,
    hidden: false,
    entityId: null,
    notes: '',
    defeated: false,
    ...partial,
  };
}

/** Highest initiative first; ties broken by initiative bonus, then PCs first, then name. Unrolled last. */
export function sortByInitiative(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    if (a.initiative == null && b.initiative == null) return a.name.localeCompare(b.name);
    if (a.initiative == null) return 1;
    if (b.initiative == null) return -1;
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.initiativeBonus !== a.initiativeBonus) return b.initiativeBonus - a.initiativeBonus;
    if (a.isPC !== b.isPC) return a.isPC ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export interface TurnState {
  round: number;
  turnIndex: number;
}

/** Advance to the next living combatant, incrementing the round when the order wraps. */
export function nextTurn(list: Combatant[], s: TurnState): TurnState {
  if (!list.length) return s;
  if (s.round === 0) return { round: 1, turnIndex: firstActive(list, 0) };
  let idx = s.turnIndex;
  let round = s.round;
  for (let i = 0; i < list.length; i++) {
    idx++;
    if (idx >= list.length) {
      idx = 0;
      round++;
    }
    if (!list[idx].defeated) return { round, turnIndex: idx };
  }
  return { round, turnIndex: idx };
}

export function previousTurn(list: Combatant[], s: TurnState): TurnState {
  if (!list.length || s.round === 0) return s;
  let idx = s.turnIndex;
  let round = s.round;
  for (let i = 0; i < list.length; i++) {
    idx--;
    if (idx < 0) {
      if (round <= 1) return { round: 1, turnIndex: firstActive(list, 0) };
      idx = list.length - 1;
      round--;
    }
    if (!list[idx].defeated) return { round, turnIndex: idx };
  }
  return s;
}

function firstActive(list: Combatant[], from: number) {
  for (let i = from; i < list.length; i++) if (!list[i].defeated) return i;
  return 0;
}

export interface DamageOutcome {
  combatant: Combatant;
  concentrationDC: number | null;
}

/**
 * Apply damage: temporary hit points absorb first. If the creature is concentrating, report the
 * Constitution save DC (2024 rules: 10 or half the damage, whichever is higher, maximum 30).
 */
export function applyDamage(c: Combatant, amount: number): DamageOutcome {
  const dmg = Math.max(0, Math.floor(amount));
  const fromTemp = Math.min(c.tempHp, dmg);
  const rest = dmg - fromTemp;
  const hp = Math.max(0, c.hp - rest);
  const next: Combatant = { ...c, tempHp: c.tempHp - fromTemp, hp };
  if (hp === 0 && !next.conditions.includes('Unconscious') && c.isPC) next.conditions = [...next.conditions, 'Unconscious'];
  const concentrationDC = c.concentration && dmg > 0 ? Math.min(30, Math.max(10, Math.floor(dmg / 2))) : null;
  return { combatant: next, concentrationDC };
}

export function applyHealing(c: Combatant, amount: number): Combatant {
  const heal = Math.max(0, Math.floor(amount));
  const hp = c.maxHp > 0 ? Math.min(c.maxHp, c.hp + heal) : c.hp + heal;
  const conditions = hp > 0 ? c.conditions.filter((x) => x !== 'Unconscious') : c.conditions;
  return { ...c, hp, conditions };
}

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
/** 2024 proficiency bonus by character level. */
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);

/** Put an effect on a combatant for a number of rounds, counted from the turn it is now. */
export function addEffect(c: Combatant, name: string, rounds: number, s: TurnState, list: Combatant[]): Combatant {
  const effect: Effect = {
    id: Math.random().toString(36).slice(2, 10),
    name: name.trim(),
    endRound: Math.max(1, s.round) + Math.max(1, Math.floor(rounds)),
    anchor: s.round > 0 ? (list[s.turnIndex]?.id ?? c.id) : c.id,
  };
  return { ...c, effects: [...(c.effects ?? []), effect] };
}

/** How many more rounds an effect runs. */
export const effectRoundsLeft = (e: Effect, s: TurnState) => Math.max(0, e.endRound - Math.max(1, s.round));

/**
 * What a turn starting brings: effects that end now are taken off, the one whose turn it is gets its each-turn uses
 * back, and the GM is told what ended and what to roll a recharge for.
 */
export function startTurn(list: Combatant[], s: TurnState): { list: Combatant[]; notes: string[] } {
  const who = list[s.turnIndex];
  if (!who || s.round === 0) return { list, notes: [] };
  const acting = new Set(list.filter((c) => !c.defeated).map((c) => c.id));
  const notes: string[] = [];
  const out = list.map((c) => {
    let next = c;
    if (c.effects?.length) {
      // An effect whose own turn can't come any more (its caster is down or gone) ends when its round is reached.
      const ends = (e: Effect) => e.endRound <= s.round && (e.anchor === who.id || !e.anchor || !acting.has(e.anchor));
      const ended = c.effects.filter(ends);
      if (ended.length) {
        for (const e of ended) notes.push(`${e.name} ends on ${c.name}.`);
        next = { ...next, effects: c.effects.filter((e) => !ends(e)) };
      }
    }
    if (c.id === who.id && c.counters?.length) {
      for (const k of c.counters) if (k.recharge && k.used >= k.max) notes.push(`${c.name}: roll to recharge ${k.name} (${k.recharge === 6 ? '6' : `${k.recharge}–6`}).`);
      if (c.counters.some((k) => k.eachTurn && k.used)) next = { ...next, counters: c.counters.map((k) => (k.eachTurn ? { ...k, used: 0 } : k)) };
    }
    return next;
  });
  return { list: out, notes };
}

/**
 * Roll initiative for everyone without one: a group (creatures added together) rolls once, and a party member whose
 * player has already rolled takes that roll (`given`, by combatant id).
 */
export function rollInitiatives(list: Combatant[], given: Record<string, number> = {}, rng: Rng = Math.random): Combatant[] {
  const groups = new Map<string, number>();
  return list.map((c) => {
    if (c.initiative != null) return c;
    if (given[c.id] != null) return { ...c, initiative: given[c.id] };
    const roll = () => Math.floor(rng() * 20) + 1 + c.initiativeBonus;
    if (!c.group) return { ...c, initiative: roll() };
    if (!groups.has(c.group)) groups.set(c.group, roll());
    return { ...c, initiative: groups.get(c.group)! };
  });
}

/** What the defeated are worth: the experience of every foe marked defeated. */
export const defeatedXp = (list: Combatant[]) => list.filter((c) => !c.isPC && c.defeated).reduce((n, c) => n + (c.xp ?? 0), 0);

