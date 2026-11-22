/**
 * The change log for a character: who changed what on the sheet or the character page, the player or the GM, and
 * when. Typing makes many saves, so changes to one thing by the same person within a few minutes are folded into
 * one entry (and dropped if they end up back where they started). The player's view leaves out the GM's own notes.
 */
import { moduleData } from './modules.js';
import type Database from 'better-sqlite3';
import { GM_ONLY_SHEET_KEYS } from '../../../shared/sheet.js';

type DB = Database.Database;
export type Who = 'player' | 'gm';

export interface ChangeEntry {
  id: number;
  at: string;
  by: Who;
  field: string;
  label: string;
  summary: string;
}

const FOLD_MS = 10 * 60 * 1000;
/** Plain objects on the sheet that are logged key by key (an ability score, a coin, a spell slot level). */
const NESTED = new Set(['abilities', 'coins', 'deathSaves', 'armorTraining', 'spellSlots']);
/** Fields the player never sees, in the log or anywhere else. */
const GM_ONLY = new Set(['notes', 'kind', ...GM_ONLY_SHEET_KEYS.map((k) => `sheet.${k}`)]);
export const isGmOnlyField = (field: string) => GM_ONLY.has(field) || [...GM_ONLY].some((g) => field.startsWith(`${g}.`));

/** Everything about a character that can change, flattened to one level of named fields. */
export function characterSnapshot(db: DB, characterId: number): Record<string, unknown> {
  const c = db.prepare('SELECT name, player, kind, species, class_name, level, sheet, notes FROM characters WHERE id = ?').get(characterId) as Record<string, unknown> | undefined;
  if (!c) return {};
  const out: Record<string, unknown> = {};
  for (const k of ['name', 'player', 'kind', 'species', 'class_name', 'level', 'notes']) out[k] = c[k];
  const sheet = JSON.parse((c.sheet as string) || '{}') as Record<string, unknown>;
  for (const [k, v] of Object.entries(sheet)) {
    if (NESTED.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'spellSlots' && v2 && typeof v2 === 'object') {
          out[`sheet.spellSlots.${k2}.max`] = (v2 as { max: number }).max;
          out[`sheet.spellSlots.${k2}.used`] = (v2 as { used: number }).used;
        } else out[`sheet.${k}.${k2}`] = v2;
      }
    } else out[`sheet.${k}`] = v;
  }
  const p = db.prepare('SELECT notes FROM character_pages WHERE character_id = ?').get(characterId) as { notes: string } | undefined;
  if (p) {
    // The Thinning module's data, kept with its own key names in the log.
    const t = moduleData<{ true_name: string; memories: unknown[]; known_by: string[]; thinning: number; shardscarred: boolean }>(db, 'thinning', 'character', characterId);
    out['page.true_name'] = t.true_name ?? '';
    out['page.memories'] = t.memories ?? [];
    out['page.known_by'] = t.known_by ?? [];
    out['page.thinning'] = t.thinning ?? 0;
    out['page.shardscarred'] = !!t.shardscarred;
    out['page.notes'] = p.notes;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
/** Nothing, and nothing much: a box first ticked off, a count first set to zero. Not worth a log entry. */
const blank = (v: unknown) => empty(v) || v === false || v === 0 || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

/** Write the differences between two snapshots to the log, folding them into recent entries by the same person. */
export function logChanges(db: DB, characterId: number, by: Who, before: Record<string, unknown>, after: Record<string, unknown>) {
  const at = new Date();
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const recent = db.prepare('SELECT id, at, by, before FROM character_changes WHERE character_id = ? AND field = ? ORDER BY id DESC LIMIT 1');
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (same(a, b) || (empty(a) && empty(b)) || (empty(a) && blank(b)) || (blank(a) && empty(b))) continue;
    const last = recent.get(characterId, field) as { id: number; at: string; by: Who; before: string } | undefined;
    if (last && last.by === by && at.getTime() - Date.parse(last.at) < FOLD_MS) {
      if (same(JSON.parse(last.before), b)) db.prepare('DELETE FROM character_changes WHERE id = ?').run(last.id);
      else db.prepare('UPDATE character_changes SET after = ?, at = ? WHERE id = ?').run(JSON.stringify(b ?? null), at.toISOString(), last.id);
      continue;
    }
    db.prepare('INSERT INTO character_changes (character_id, at, by, field, before, after) VALUES (?, ?, ?, ?, ?, ?)').run(
      characterId,
      at.toISOString(),
      by,
      field,
      JSON.stringify(a ?? null),
      JSON.stringify(b ?? null),
    );
  }
}

/** Run a change and log what it did. */
export function logged<T>(db: DB, characterId: number, by: Who, change: () => T): T {
  const before = characterSnapshot(db, characterId);
  const out = change();
  logChanges(db, characterId, by, before, characterSnapshot(db, characterId));
  return out;
}

const ABILITY: Record<string, string> = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' };
const LABELS: Record<string, string> = {
  name: 'Name',
  player: 'Player',
  kind: 'Status',
  species: 'Species',
  class_name: 'Class',
  level: 'Level',
  notes: 'GM notes',
  'sheet.saves': 'Saving throw proficiencies',
  'sheet.skills': 'Skill proficiencies',
  'sheet.expertise': 'Expertise',
  'sheet.ac': 'Armor Class',
  'sheet.maxHp': 'Hit point maximum',
  'sheet.hp': 'Hit points',
  'sheet.tempHp': 'Temporary hit points',
  'sheet.initiativeBonus': 'Initiative',
  'sheet.speed': 'Speed',
  'sheet.hitDie': 'Hit Die',
  'sheet.hitDiceSpent': 'Hit Dice spent',
  'sheet.inspiration': 'Heroic Inspiration',
  'sheet.concentration': 'Concentrating on',
  'sheet.conditions': 'Conditions',
  'sheet.exhaustion': 'Exhaustion',
  'sheet.equipment': 'Equipment',
  'sheet.lastRest': 'Last rest',
  'sheet.subclass': 'Subclass',
  'sheet.background': 'Background',
  'sheet.alignment': 'Alignment',
  'sheet.size': 'Size',
  'sheet.xp': 'XP',
  'sheet.armorProf': 'Armor training notes',
  'sheet.weaponProf': 'Weapon proficiencies',
  'sheet.toolProf': 'Tool proficiencies',
  'sheet.languages': 'Languages',
  'sheet.masteries': 'Weapon masteries',
  'sheet.attacks': 'Weapons and damaging cantrips',
  'sheet.spellAbility': 'Spellcasting ability',
  'sheet.spells': 'Spells',
  'sheet.features': 'Class feature notes',
  'sheet.traits': 'Species trait notes',
  'sheet.feats': 'Feat notes',
  'sheet.classFeatures': 'Class features',
  'sheet.speciesTraits': 'Species traits',
  'sheet.featList': 'Feats',
  'sheet.armorWorn': 'Armor worn',
  'sheet.shield': 'Shield',
  'sheet.attunement': 'Attuned items',
  'sheet.resources': 'Class resources',
  'sheet.pronouns': 'Pronouns',
  'sheet.portrait': 'Portrait',
  'sheet.appearance': 'Appearance',
  'sheet.personality': 'Personality',
  'sheet.backstory': 'Backstory',
  'sheet.shardscarred': 'Setting mechanics',
  'sheet.hometown': 'Hometown',
  'sheet.ties': 'World ties',
  'page.true_name': 'True name',
  'page.memories': 'Named memories',
  'page.known_by': 'Who knows the true name',
  'page.thinning': 'Thinning',
  'page.shardscarred': 'Shardscarred',
  'page.notes': 'Page notes',
};
export function fieldLabel(field: string) {
  if (LABELS[field]) return LABELS[field];
  let m = /^sheet\.abilities\.(\w+)$/.exec(field);
  if (m) return `${ABILITY[m[1]] ?? m[1]} score`;
  m = /^sheet\.coins\.(\w+)$/.exec(field);
  if (m) return m[1].toUpperCase();
  m = /^sheet\.spellSlots\.(\d)\.(max|used)$/.exec(field);
  if (m) return `Level ${m[1]} spell slots${m[2] === 'used' ? ' expended' : ''}`;
  m = /^sheet\.deathSaves\.(\w+)$/.exec(field);
  if (m) return `Death save ${m[1]}`;
  m = /^sheet\.armorTraining\.(\w+)$/.exec(field);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} armor training`;
  return field.replace(/^(sheet|page)\./, '').replace(/([A-Z])/g, ' $1');
}

const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'nothing';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return `“${short(v.replace(/\s+/g, ' '))}”`;
  return short(String(v));
};
const itemName = (x: unknown) =>
  typeof x === 'string'
    ? x
    : x && typeof x === 'object'
      ? String((x as { name?: string; text?: string; entity_id?: string }).name ?? (x as { text?: string }).text ?? (x as { entity_id?: string }).entity_id ?? '')
      : String(x);

/** A plain-words summary of one change. */
export function describeChange(field: string, before: unknown, after: unknown): string {
  if (field === 'sheet.portrait') return after ? (before ? 'Changed the portrait' : 'Added a portrait') : 'Removed the portrait';
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = (Array.isArray(before) ? before : []) as unknown[];
    const b = (Array.isArray(after) ? after : []) as unknown[];
    const an = a.map(itemName);
    const bn = b.map(itemName);
    const added = bn.filter((n) => !an.includes(n));
    const removed = an.filter((n) => !bn.includes(n));
    const parts: string[] = [];
    if (added.length) parts.push(`added ${added.join(', ')}`);
    if (removed.length) parts.push(`removed ${removed.join(', ')}`);
    const changed = bn.filter((n, i) => an.includes(n) && !same(a[an.indexOf(n)], b[i]));
    if (changed.length) parts.push(`changed ${changed.join(', ')}`);
    if (field === 'page.memories') {
      const struck = b.filter(
        (m, i) => (m as { struck?: boolean }).struck && !(a.find((x) => (x as { id?: number }).id === (m as { id?: number }).id) as { struck?: boolean } | undefined)?.struck && i >= 0,
      );
      if (struck.length) parts.push(`struck ${struck.map(itemName).join(', ')}`);
    }
    const s = parts.join('; ');
    return short(s ? s[0].toUpperCase() + s.slice(1) : 'Reordered', 300);
  }
  if (typeof before === 'string' && typeof after === 'string' && (before.length > 80 || after.length > 80)) return 'Edited the text';
  return `${show(before)} → ${show(after)}`;
}

/** The log, newest first. For the player, without the GM's own notes. */
export function characterLog(db: DB, characterId: number, forPlayer = false, limit = 300): ChangeEntry[] {
  const rows = db.prepare('SELECT * FROM character_changes WHERE character_id = ? ORDER BY id DESC LIMIT ?').all(characterId, forPlayer ? limit * 2 : limit) as {
    id: number;
    at: string;
    by: Who;
    field: string;
    before: string;
    after: string;
  }[];
  return rows
    .filter((r) => !forPlayer || !isGmOnlyField(r.field))
    .slice(0, limit)
    .map((r) => ({ id: r.id, at: r.at, by: r.by, field: r.field, label: fieldLabel(r.field), summary: describeChange(r.field, JSON.parse(r.before), JSON.parse(r.after)) }));
}
