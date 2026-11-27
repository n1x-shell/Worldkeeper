/**
 * Plans of places (v0.9.24, docs/BETA_PLAN.md C8): what a place's record says about it, read for its plan; the plan
 * the GM settled on, remembered so that it is drawn the same again; its key written into the record; and the Atlas map
 * made from it. The laying out and the drawing are in shared/plan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { BUILDING_USES, KEY_KINDS, MAX_NAMES, PLAN_KINDS, TOWN_SIZES, hasOwnNames, ideaFor, newItem, suggest, type KeyItem, type PlaceFacts, type PlanSettings } from '../../../shared/plan/index.js';
import { getEntity, updateEntity } from './entities.js';
import { maps, markers } from './maps.js';
import { placeProfile } from './places.js';
import { DANGERS, WEALTHS, difficultyFor } from '../../../shared/places.js';
import { TREASURE_TIERS } from '../../../shared/treasureTiers.js';
import { bookTreasure } from './bookData.js';
import { getActiveCampaignId } from './campaigns.js';
import { suggestEncounters } from './encounters.js';
import { partyLevel } from './journey.js';
import { BOOKS_REGION, rollTreasure } from './treasure.js';
import { types } from './recordTypes.js';

const zSettings = z.object({
  kind: z.enum(PLAN_KINDS),
  seed: z.number().int().min(1).max(2147483647),
  names: z.array(z.string().trim().min(1).max(80)).max(MAX_NAMES),
  size: z.enum(['small', 'medium', 'large']),
  rough: z.boolean(),
  ways: z.enum(['one', 'some', 'many']),
  secrets: z.boolean(),
  traps: z.boolean(),
  use: z.string().refine((u) => u in BUILDING_USES, 'Choose what the building is for'),
  town: z.enum(Object.keys(TOWN_SIZES) as [keyof typeof TOWN_SIZES, ...(keyof typeof TOWN_SIZES)[]]),
  water: z.enum(['none', 'river', 'coast']),
  walled: z.boolean(),
  around: z.enum(['fields', 'woods', 'open']),
  key: z.array(z.lazy(() => zRoom)).max(MAX_NAMES).optional(),
});

const short = z.string().max(200);
/** One thing keyed to a place (shared/plan/key.ts). */
const zItem = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(KEY_KINDS),
  title: short,
  text: z.string().max(6000),
  creatures: z.array(z.object({ name: short, count: z.number().int().min(1).max(999), id: z.string().max(200).optional() })).max(40).optional(),
  dc: z.number().int().min(1).max(40).nullable().optional(),
  damage: short.optional(),
  coins: short.optional(),
  things: z.array(z.object({ name: short, count: z.number().int().min(1).max(9999) })).max(60).optional(),
  entity: z.string().max(60).nullable().optional(),
});
const zRoom = z.object({
  id: z.string().min(1).max(40),
  // Kept as typed (a name half typed may end in a space); only a name of nothing is refused.
  name: z.string().max(80).refine((v) => v.trim().length > 0, 'A place needs a name'),
  drawnAs: z.string().max(80).refine((v) => v.trim().length > 0, 'A place needs a name'),
  floor: z.enum(['ground', 'upper', 'under']).optional(),
  aloud: z.string().max(6000),
  items: z.array(zItem).max(40),
});

/** What the record says of the place, for choosing and keying its plan. */
function facts(db: DB, id: string): { facts: PlaceFacts; place: boolean; version: number } {
  const e = getEntity(db, id);
  const reg = types(db);
  const placeTypes = reg.list.filter((t) => t.traits.place).map((t) => t.key);
  const children = placeTypes.length
    ? (db.prepare(`SELECT name FROM entities WHERE parent_id = ? AND archived = 0 AND type IN (${placeTypes.map(() => '?').join(',')}) ORDER BY name LIMIT ${MAX_NAMES}`).all(id, ...placeTypes) as { name: string }[]).map((r) => r.name)
    : [];
  const profile = placeProfile(db, id);
  return {
    facts: { id: e.id, type: e.type, name: e.name, fields: e.fields, body: e.body, children, terrain: profile.terrain, danger: profile.danger, wealth: profile.wealth },
    place: !!reg.get(e.type)?.traits.place && !reg.get(e.type)?.traits.regionLike,
    version: e.version,
  };
}

interface Saved {
  settings: string;
  map_id: number | null;
}
const savedRow = (db: DB, id: string) => db.prepare('SELECT settings, map_id FROM place_plans WHERE entity_id = ?').get(id) as Saved | undefined;

export interface PlanInfo {
  entity: { id: string; name: string; type: string; version: number };
  /** A single place (a town, a building, a dungeon), not a country or a continent. */
  place: boolean;
  /** The plan the GM settled on, if there is one. */
  saved: PlanSettings | null;
  /** The plan that suits the record as it is written now. */
  suggested: PlanSettings;
  /** Whether the record names its own places (in its text, or as records kept under it). */
  ownNames: boolean;
  /** The Atlas map made from the plan, if it is still there. */
  map: { id: number; name: string } | null;
}

export function planInfo(db: DB, id: string): PlanInfo {
  const f = facts(db, id);
  const row = savedRow(db, id);
  const parsed = row ? zSettings.safeParse(parseJson(row.settings, null)) : null;
  const map = row?.map_id ? ((db.prepare('SELECT id, name FROM maps WHERE id = ?').get(row.map_id) as { id: number; name: string } | undefined) ?? null) : null;
  return { entity: { id: f.facts.id, name: f.facts.name, type: f.facts.type, version: f.version }, place: f.place, saved: parsed?.success ? parsed.data : null, suggested: suggest(f.facts), ownNames: hasOwnNames(f.facts), map };
}

export function savePlan(db: DB, id: string, input: unknown): PlanInfo {
  getEntity(db, id);
  const settings = zSettings.parse(input);
  db.prepare(
    `INSERT INTO place_plans (entity_id, settings) VALUES (?, ?)
     ON CONFLICT(entity_id) DO UPDATE SET settings = excluded.settings, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(id, JSON.stringify(settings));
  return planInfo(db, id);
}

/** Forget the plan. The picture and the map made from it stay: they are the record's own now. */
export function forgetPlan(db: DB, id: string): PlanInfo {
  db.prepare('DELETE FROM place_plans WHERE entity_id = ?').run(id);
  return planInfo(db, id);
}

const KEY_SECTION = /^##\s+Map key\b.*$/im;

/**
 * Write a plan's key into the record's text, as a section of its own: in place of the key that is there, or at the
 * end. Read back, the key gives the plan the same places in the same order, so the text and the drawing keep in step.
 */
export function writeKey(db: DB, id: string, input: unknown) {
  const o = z.object({ markdown: z.string().trim().min(1).max(20000), gm: z.boolean().default(true), expected_version: z.number().int().optional() }).parse(input);
  const e = getEntity(db, id);
  const section = `## Map key${o.gm ? ' (GM only)' : ''}\n\n${o.markdown}\n`;
  let body: string;
  const at = KEY_SECTION.exec(e.body);
  if (at) {
    const rest = e.body.slice(at.index + at[0].length);
    const next = /^##\s/m.exec(rest);
    body = `${e.body.slice(0, at.index)}${section}${next ? `\n${rest.slice(next.index)}` : ''}`;
  } else body = `${e.body.replace(/\s+$/, '')}\n\n${section}`;
  return updateEntity(db, id, { body, expected_version: o.expected_version });
}

/**
 * Make the plan a map in the Atlas (or draw it again on the map made before): the picture as the players may see it,
 * a pin for each numbered place (hidden until the GM shows it), and the scale, so the ruler measures in feet's worth
 * of miles. The pins a plan made before are replaced; any the GM added are kept.
 */
export function planToMap(db: DB, id: string, uploadsDir: string, image: { buffer: Buffer; ext: string; width: number; height: number }, input: unknown) {
  const o = z
    .object({
      squares: z.number().positive().max(400),
      feet: z.number().positive().max(1000),
      areas: z.array(z.object({ n: z.number().int().min(1).max(999), name: z.string().max(80), x: z.number().min(0).max(400), y: z.number().min(0).max(400) })).max(MAX_NAMES * 2),
    })
    .parse(input);
  const e = getEntity(db, id);
  if (!savedRow(db, id)) throw badRequest('Keep the plan first');
  const row = savedRow(db, id)!;
  const existing = row.map_id ? (db.prepare('SELECT id, image_file FROM maps WHERE id = ?').get(row.map_id) as { id: number; image_file: string | null } | undefined) : undefined;
  const px = image.width / o.squares;
  const file = `map-plan-${id.replace(/[^\w-]/g, '')}-${randomBytes(6).toString('hex')}${image.ext}`;
  fs.writeFileSync(path.join(uploadsDir, file), image.buffer);
  const data = { image_file: file, kind: 'image' as const, width: image.width, height: image.height, scale_miles: (o.squares * o.feet) / 5280 };
  let mapId: number;
  try {
    mapId = db.transaction(() => {
      const map = existing ? maps.update(db, existing.id, data) : maps.create(db, { name: `${e.name}: plan`, entity_id: id, realm_id: e.realm || null, layers: ['Locations'], ...data });
      const mid = Number((map as { id: number }).id);
      db.prepare(`DELETE FROM map_markers WHERE map_id = ? AND category = 'plan'`).run(mid);
      // A numbered place that is a record kept under this one has its pin lead to that record.
      const under = new Map((db.prepare('SELECT id, name FROM entities WHERE parent_id = ? AND archived = 0').all(id) as { id: string; name: string }[]).map((c) => [c.name.toLowerCase(), c.id]));
      // The Atlas measures up from the bottom of a map; a plan, down from its top.
      for (const a of o.areas) markers.create(db, { map_id: mid, entity_id: under.get(a.name.toLowerCase()) ?? null, label: `${a.n}. ${a.name}`, x: Math.round(a.x * px), y: Math.round(image.height - a.y * px), category: 'plan', layer: 'Locations', hidden: true });
      db.prepare('UPDATE place_plans SET map_id = ? WHERE entity_id = ?').run(mid, id);
      return mid;
    })();
  } catch (err) {
    fs.rmSync(path.join(uploadsDir, file), { force: true });
    throw err;
  }
  if (existing?.image_file && existing.image_file !== file) fs.rmSync(path.join(uploadsDir, path.basename(existing.image_file)), { force: true });
  const made = db.prepare('SELECT id, name FROM maps WHERE id = ?').get(mapId) as { id: number; name: string } | undefined;
  if (!made) throw notFound('Map');
  return { map: made, updated: !!existing };
}

/**
 * Something to key to a place. From the GM's books: an encounter for the party's level and the place's danger and
 * terrain, or loot for the party's level and the place's wealth. From the app's own ideas (shared/plan/key.ts): a
 * trap, a puzzle or a hazard, with numbers to fit. The level is the active campaign's party's unless one is given.
 */
export function suggestKeyItem(db: DB, input: unknown, rng: () => number = Math.random): { item: KeyItem; level: number } {
  const o = z
    .object({
      kind: z.enum(['encounter', 'loot', 'trap', 'puzzle', 'hazard']),
      entity: z.string().max(60).optional(),
      level: z.number().int().min(1).max(20).optional(),
      danger: z.enum(DANGERS).optional(),
      wealth: z.enum(WEALTHS).optional(),
      /** A hoard (a treasury, a vault), not what one creature carries. */
      hoard: z.boolean().default(false),
    })
    .parse(input);
  const profile = o.entity ? placeProfile(db, o.entity) : null;
  const campaign = getActiveCampaignId(db);
  const level = o.level ?? (campaign ? partyLevel(db, campaign) : 1);
  if (o.kind === 'trap' || o.kind === 'puzzle' || o.kind === 'hazard') return { level, item: ideaFor(o.kind, level, o.danger ?? profile?.danger ?? 'risky', rng) };
  if (o.kind === 'encounter') {
    const size = campaign ? ((db.prepare(`SELECT COUNT(*) n FROM characters WHERE campaign_id = ? AND kind = 'pc'`).get(campaign) as { n: number }).n || 4) : 4;
    const { ideas } = suggestEncounters(db, { level, size, difficulty: difficultyFor(o.danger ?? profile?.danger ?? 'risky'), terrain: profile?.terrain ?? [], count: 3, rng });
    if (!ideas.length) throw badRequest('Nothing in your books fits a party of this level here. Add the creatures yourself, or bring in a book of monsters.');
    const idea = ideas[Math.floor(rng() * ideas.length)];
    return { level, item: newItem('encounter', { creatures: idea.creatures.map((c) => ({ name: c.name, count: c.count, id: c.id })) }) };
  }
  const tier = TREASURE_TIERS[level >= 17 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0];
  const label = o.entity ? getEntity(db, o.entity).name : 'This place';
  const roll = rollTreasure({ tier: tier.key, region: BOOKS_REGION, kind: o.hoard ? 'hoard' : 'individual', books: bookTreasure(db), place: { label, wealth: o.wealth ?? profile?.wealth ?? 'modest' }, fading: false, rng });
  const things = [...roll.goods.map((g) => ({ name: `${g.text} (${g.gp} gp)`, count: g.count })), ...roll.items.map((i) => ({ name: i.name, count: 1 }))];
  return { level, item: newItem('loot', { title: o.hoard ? 'A hoard' : '', coins: roll.coins.amount ? `${roll.coins.amount.toLocaleString('en')} ${roll.coins.coin}` : '', things }) };
}
