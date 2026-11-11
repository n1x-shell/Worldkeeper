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
  notes: string;
  defeated: boolean;
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
