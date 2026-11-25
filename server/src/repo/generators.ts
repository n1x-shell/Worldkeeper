/**
 * The generators' data (v0.9.12): the world's peoples and built-in name styles for names, the library's item
 * catalogue for a shop's shelves, a place's wealth and terrain, and a campaign's date and season for the weather.
 * The making itself is in shared/generators.ts.
 */
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { generateNames, seeded } from '../../../shared/names.js';
import { NAME_STYLES, SHOP_KINDS, makeShop, npcIdea, weatherOn, type NpcIdea, type Shop, type Weather } from '../../../shared/generators.js';
import { WEALTHS, type Terrain, type Wealth } from '../../../shared/places.js';
import { addDays, dayName, seasonOf, yearDays, type WDate } from '../../../shared/calendar.js';
import { makeNames, namePeoples, usedNameWords } from './names.js';
import { bookItems } from './bookData.js';
import { placeProfile } from './places.js';
import { campaignCalendar, campaignDates } from './calendars.js';
import { types } from './recordTypes.js';

const STYLE = 'style:';

/** Where names can come from: the world's peoples that have common names, then the built-in styles. */
export function nameSources(db: DB) {
  return [...namePeoples(db).map((p) => ({ id: p.id, name: p.name, builtIn: false })), ...NAME_STYLES.map((s) => ({ id: STYLE + s.key, name: s.label, builtIn: true }))];
}

/** New names from a people's page or a built-in style. Nobody in the world already has them. */
export function namesFrom(db: DB, source: string, count: number, seed: number): { people: string; names: string[] } {
  if (!source.startsWith(STYLE)) return makeNames(db, source, count, seed);
  const style = NAME_STYLES.find((s) => s.key === source.slice(STYLE.length));
  if (!style) throw notFound('Name style');
  return { people: style.label, names: generateNames({ seeds: style.seeds, people: style.key, used: usedNameWords(db), count, seed }) };
}

/** People to meet: each with a name in the style asked for (or a different one each, with none asked for). */
export function npcIdeas(db: DB, o: { source?: string; role?: string; count?: number; seed?: number }): NpcIdea[] {
  const seed = o.seed ?? Date.now();
  const rnd = seeded(seed);
  const count = Math.max(1, Math.min(12, o.count ?? 6));
  const sources = nameSources(db);
  // With none chosen: the world's own peoples if it has any, else the built-in styles.
  const pool = o.source ? sources.filter((s) => s.id === o.source) : sources.some((s) => !s.builtIn) ? sources.filter((s) => !s.builtIn) : sources;
  if (!pool.length) throw notFound('People');
  const out: NpcIdea[] = [];
  const names = new Map<string, string[]>();
  for (let i = 0; i < count; i++) {
    const src = pool[Math.floor(rnd() * pool.length)];
    if (!names.has(src.id)) names.set(src.id, namesFrom(db, src.id, count, seed + i + 1).names);
    const name = names.get(src.id)!.shift();
    if (!name) continue;
    out.push(npcIdea(rnd, name, src.name, o.role));
  }
  return out;
}

const KEEPERS: Record<string, string> = { general: 'shopkeeper', smith: 'blacksmith', apothecary: 'apothecary', stable: 'stable master', tavern: 'innkeeper', workshop: 'craftsperson', arcane: 'dealer in curios' };

export interface ShopResult {
  shop: Shop;
  keeper: NpcIdea | null;
  place: { id: string; name: string; realm: string } | null;
  /** Where the wealth came from: the place (or one it sits in), or the GM's choice. */
  wealthFrom: 'place' | 'chosen' | 'default';
}

/** A shop of a kind, in a place (its wealth read from the place's facts) or of a wealth the GM names. */
export function shopFor(db: DB, o: { kind: string; place?: string; wealth?: string; source?: string; seed?: number }): ShopResult {
  const kind = SHOP_KINDS.find((k) => k.key === o.kind);
  if (!kind) throw badRequest('Choose what kind of shop it is');
  const seed = o.seed ?? Date.now();
  const rnd = seeded(seed);
  const place = o.place ? ((db.prepare('SELECT id, name, realm FROM entities WHERE id = ? AND archived = 0').get(o.place) as { id: string; name: string; realm: string } | undefined) ?? null) : null;
  if (o.place && !place) throw notFound('Place');
  const profile = place ? placeProfile(db, place.id) : null;
  const chosen = WEALTHS.find((w) => w === o.wealth);
  const wealth: Wealth = chosen ?? profile?.wealth ?? 'modest';
  const wealthFrom = chosen ? 'chosen' : profile?.from.wealth ? 'place' : 'default';
  let keeper: NpcIdea | null = null;
  try {
    keeper = npcIdeas(db, { source: o.source, role: KEEPERS[kind.key], count: 1, seed: seed + 17 })[0] ?? null;
  } catch {
    keeper = null; // no names to draw on: the shop stands without a keeper
  }
  const items = bookItems(db, '', 100000).filter((i) => i.rarity !== 'varies' && i.rarity !== 'artifact');
  return { shop: makeShop(rnd, kind, wealth, items, keeper?.name ?? ''), keeper, place, wealthFrom };
}

/** Places a shop can stand in: settlements and the like, with their wealth. */
export function shopPlaces(db: DB) {
  const reg = types(db);
  const keys = reg.list.filter((t) => t.traits.place && !t.traits.regionLike).map((t) => t.key);
  if (!keys.length) return [];
  const rows = db.prepare(`SELECT id, name, type FROM entities WHERE archived = 0 AND type IN (${keys.map(() => '?').join(',')}) ORDER BY name LIMIT 2000`).all(...keys) as { id: string; name: string; type: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, type: reg.get(r.type)?.label ?? r.type }));
}

export interface WeatherDay {
  date: WDate;
  label: string;
  season: string;
  weather: Weather | null;
}

/**
 * The weather where the party is, today and the days after: from the season of the campaign's date and the terrain of
 * the place (the party's last stop on a map, else where the campaign began). The same day always has the same weather.
 */
export function campaignWeather(db: DB, campaignId: number, days = 7): { place: { id: string; name: string } | null; terrain: Terrain[]; days: WeatherDay[] } {
  const c = db.prepare('SELECT id, starting_location_id FROM campaigns WHERE id = ?').get(campaignId) as { id: number; starting_location_id: string | null } | undefined;
  if (!c) throw notFound('Campaign');
  const stop = db.prepare('SELECT entity_id FROM map_travel WHERE campaign_id = ? AND entity_id IS NOT NULL ORDER BY id DESC LIMIT 1').get(campaignId) as { entity_id: string } | undefined;
  const ent = db.prepare('SELECT id, name FROM entities WHERE id = ?');
  const place = ((stop && ent.get(stop.entity_id)) || (c.starting_location_id && ent.get(c.starting_location_id)) || null) as { id: string; name: string } | null;
  const terrain = place ? placeProfile(db, place.id).terrain : [];
  const def = campaignCalendar(db, campaignId);
  const today = campaignDates(db, campaignId).date;
  const out: WeatherDay[] = [];
  for (let i = 0; i < Math.max(1, Math.min(14, days)); i++) {
    const date = addDays(def, today, i);
    const season = seasonOf(def, date.day);
    out.push({ date, label: dayName(def, date.day), season, weather: weatherOn({ season, terrain, seed: campaignId * 7919 + 13, day: date.year * yearDays(def) + date.day }) });
  }
  return { place, terrain, days: out };
}
