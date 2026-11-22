/**
 * Treasure (Treasure [RUL-620]): the world's own items and artifacts (where they turn up, who wants them, and rules
 * for those the archive gave none), the Treasure tool that rolls individual treasure and hoards by tier and region, and
 * the party's treasure log for each campaign.
 *
 * The catalogue and pools ship with the Worldkeeper additions (packs/worldkeeper/treasure); they are read, not copied into the
 * library, so archive records are never changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { makeCrud } from './crud.js';
import { moduleData, moduleDataFor, moduleOn, setModuleData } from './modules.js';
import { rollDice } from '../../../shared/play.js';
import { worldkeeperPath } from '../packs/paths.js';

export const DEFAULT_TREASURE_DIR = worldkeeperPath('treasure');

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface CatalogueItem {
  rarity: Rarity;
  attunement: boolean;
  rules?: string;
  pools: string[];
  tier: number;
  where: string;
  wants: string;
}
export interface CatalogueArtifact {
  attunement: boolean;
  rules: string;
  place: string;
  holder: string;
  leads: string[];
}
interface Tier {
  key: string;
  label: string;
  individual: { dice: string; mult: number; coin: string };
  hoard: { dice: string; mult: number; coin: string };
  items: { dice: string; rarities: Partial<Record<Rarity, number>> };
}
interface Region {
  label: string;
  ids: string[];
  pools: string[];
  coins: string;
  barter?: number;
  fades?: boolean;
}
export interface TreasureData {
  catalogue: { items: Record<string, CatalogueItem>; artifacts: Record<string, CatalogueArtifact> };
  tiers: Tier[];
  regions: Record<string, Region>;
  pools: Record<string, Partial<Record<Rarity, string[]>>>;
  goods: Record<string, [string, number][]>;
  hooks: Record<string, string[]>;
}

let cache: { dir: string; stamp: string; data: TreasureData } | null = null;

/** The catalogue and pools, re-read when the files change. */
export function treasureData(dir = DEFAULT_TREASURE_DIR): TreasureData {
  const files = ['catalogue.json', 'pools.json'].map((f) => path.join(dir, f));
  if (!files.every((f) => fs.existsSync(f))) return { catalogue: { items: {}, artifacts: {} }, tiers: [], regions: {}, pools: {}, goods: {}, hooks: {} };
  const stamp = files.map((f) => fs.statSync(f).mtimeMs).join('|');
  if (cache && cache.dir === dir && cache.stamp === stamp) return cache.data;
  const catalogue = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  const pools = JSON.parse(fs.readFileSync(files[1], 'utf8'));
  const data: TreasureData = {
    catalogue: { items: catalogue.items, artifacts: catalogue.artifacts },
    tiers: pools.tiers,
    regions: pools.regions,
    pools: pools.pools,
    goods: pools.goods,
    hooks: pools.hooks,
  };
  cache = { dir, stamp, data };
  return data;
}

/** What the catalogue says about one record, for its page. */
export function catalogueFor(id: string, data = treasureData()) {
  const item = data.catalogue.items[id];
  if (item) return { kind: 'item' as const, ...item };
  const art = data.catalogue.artifacts[id];
  if (art) return { kind: 'artifact' as const, rarity: 'artifact', ...art };
  return null;
}

export interface RolledItem {
  name: string;
  rarity: Rarity;
  /** A setting item's record, when it is one. */
  entity_id: string | null;
  fades: boolean;
}
export interface TreasureRoll {
  tier: string;
  tier_label: string;
  region: string;
  region_label: string;
  kind: 'individual' | 'hoard';
  coins: { amount: number; coin: string; note: string };
  goods: { text: string; gp: number; count: number }[];
  items: RolledItem[];
  hook: string | null;
  total_gp: number;
  fades: boolean;
}

const pick = <T>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];
function weighted<K extends string>(w: Partial<Record<K, number>>, rng: () => number): K {
  const entries = Object.entries(w) as [K, number][];
  let r = rng() * entries.reduce((n, [, v]) => n + v, 0);
  for (const [k, v] of entries) if ((r -= v) < 0) return k;
  return entries[entries.length - 1][0];
}
const TO_GP: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** What the GM's books offer the Treasure tool when it rolls from them (bookData.ts). */
export interface BookTreasure {
  /** Magic items, by name and rarity. */
  magic: { name: string; rarity: string }[];
  /** Gemstones and art objects, by name and worth in gp. */
  goods: [string, number][];
}
/** The region the Treasure tool uses when it rolls from the GM's books instead of the setting. */
export const BOOKS_REGION = 'books';

/**
 * Roll individual treasure or a hoard for a tier and region. With `books` and the region BOOKS_REGION, the magic items,
 * gems and art come from the GM's books instead of the setting's tables. `fading` false means nothing fades.
 */
export function rollTreasure(opts: { tier: string; region: string; kind: 'individual' | 'hoard'; rng?: () => number; data?: TreasureData; books?: BookTreasure; fading?: boolean }): TreasureRoll {
  const data = opts.data ?? treasureData();
  const rng = opts.rng ?? Math.random;
  const tier = data.tiers.find((t) => t.key === opts.tier);
  const fromBooks = opts.region === BOOKS_REGION;
  const region: TreasureData['regions'][string] | undefined = fromBooks ? { label: 'From the SRD and your books', ids: [], pools: [], coins: '', barter: 0 } : data.regions[opts.region];
  if (!tier) throw badRequest('Unknown tier');
  if (!region) throw badRequest('Unknown region');
  const tierNo = data.tiers.indexOf(tier) + 1;
  const fades = opts.fading !== false && !!region.fades;
  const out: TreasureRoll = {
    tier: tier.key,
    tier_label: tier.label,
    region: opts.region,
    region_label: region.label,
    kind: opts.kind,
    coins: { amount: 0, coin: 'gp', note: region.coins },
    goods: [],
    items: [],
    hook: null,
    total_gp: 0,
    fades,
  };
  const spec = opts.kind === 'individual' ? tier.individual : tier.hoard;
  const value = Math.max(0, rollDice(spec.dice, rng).total) * spec.mult;
  // Barter country keeps most of its worth in goods; elsewhere a hoard is mostly coin.
  const goodsShare = opts.kind === 'hoard' ? Math.max(region.barter ?? 0, 0.3) : (region.barter ?? 0) / 2;
  let goodsValue = Math.round(value * goodsShare * TO_GP[spec.coin]);
  const coinValue = Math.round(value * (1 - goodsShare));
  out.coins = { amount: coinValue, coin: spec.coin, note: region.coins };
  // Goods: the most valuable that fit, until the goods' share is spent.
  const goods = [...(fromBooks ? (opts.books?.goods ?? []) : (data.goods[opts.region] ?? data.goods.marches ?? []))].sort((a, b) => b[1] - a[1]);
  for (let guard = 0; guard < 16 && goodsValue > 0 && goods.length; guard++) {
    // Any good that fits, leaning toward the valuable ones, and no more than three of any one.
    const fits = goods.filter(([t, gp]) => gp <= goodsValue && (out.goods.find((g) => g.text === t)?.count ?? 0) < 3);
    if (!fits.length) break;
    const [text, gp] = pick(rng() < 0.5 ? fits.slice(0, 3) : fits, rng);
    const have = out.goods.find((g) => g.text === text);
    if (have) have.count++;
    else out.goods.push({ text, gp, count: 1 });
    goodsValue -= gp;
  }
  // Magic items, hoards only: about half the DMG's, and half of those the world's own where any fit.
  if (opts.kind === 'hoard') {
    const n = Math.max(0, rollDice(tier.items.dice, rng).total);
    const taken = new Set<string>();
    for (let i = 0; i < n; i++) {
      const rarity = weighted(tier.items.rarities, rng);
      if (fromBooks) {
        // A magic item of that rarity from the books, stepping down a rarity if they have none.
        let r = RARITIES.indexOf(rarity);
        let list: string[] = [];
        while (r >= 0 && !(list = (opts.books?.magic ?? []).filter((m) => m.rarity === RARITIES[r] && !taken.has(m.name)).map((m) => m.name)).length) r--;
        if (!list.length) continue;
        const name = pick(list, rng);
        taken.add(name);
        out.items.push({ name, rarity: RARITIES[r], entity_id: null, fades: false });
        continue;
      }
      const own = Object.entries(data.catalogue.items).filter(([id, it]) => it.rarity === rarity && it.tier <= tierNo && it.pools.some((p) => region.pools.includes(p)) && !taken.has(id));
      if (own.length && rng() < 0.5) {
        const [id] = pick(own, rng);
        taken.add(id);
        out.items.push({ name: id, rarity, entity_id: id, fades });
        continue;
      }
      // A generic item from the region's pool, stepping down a rarity if the pool has none.
      let r = RARITIES.indexOf(rarity);
      let list: string[] = [];
      while (r >= 0 && !(list = region.pools.flatMap((p) => data.pools[p]?.[RARITIES[r]] ?? [])).length) r--;
      if (!list.length) continue;
      out.items.push({ name: pick(list, rng), rarity: RARITIES[r], entity_id: null, fades });
    }
    out.hook = fromBooks ? null : (pick(data.hooks[opts.region] ?? data.hooks.marches ?? [null], rng) ?? null);
  }
  out.total_gp = Math.round(out.coins.amount * TO_GP[out.coins.coin] + out.goods.reduce((n, g) => n + g.gp * g.count, 0));
  return out;
}

/** The magic item tables (one per region and rarity) for the GM's Random Tables. */
export function itemTables(data = treasureData()) {
  const out: { name: string; region: string; entries: string[] }[] = [];
  for (const [key, region] of Object.entries(data.regions)) {
    for (const rarity of RARITIES) {
      const generic = region.pools.flatMap((p) => data.pools[p]?.[rarity] ?? []);
      const own = Object.entries(data.catalogue.items)
        .filter(([, it]) => it.rarity === rarity && it.pools.some((p) => region.pools.includes(p)))
        .map(([id]) => `[${id}] (the world's own)`);
      const entries = [...generic, ...own];
      if (entries.length) out.push({ name: `Treasure: ${rarity} magic items, ${region.label}`, region: key, entries });
    }
  }
  return out;
}

// ---------- The party's treasure ----------
// Fading and anchoring belong to the fading-salvage module: kept in module_data, given with each line.
interface Fading {
  fades: boolean;
  anchored: boolean;
}
const fadingSchema = z.object({ fades: z.boolean().optional(), anchored: z.boolean().optional() });
const coreTreasure = makeCrud({
  table: 'party_treasure',
  schema: z.object({
    campaign_id: z.number().int(),
    name: z.string().trim().min(1).max(300),
    kind: z.enum(['coins', 'goods', 'item', 'artifact', 'other']).default('item'),
    quantity: z.number().int().min(0).max(1_000_000).default(1),
    value_gp: z.number().min(0).max(100_000_000).default(0),
    rarity: z.string().max(40).default(''),
    entity_id: z.string().max(40).nullable().optional(),
    holder: z.string().max(200).default(''),
    status: z.enum(['carried', 'stored', 'sold', 'spent', 'given', 'lost', 'faded']).default('carried'),
    found_at: z.string().max(300).default(''),
    player_visible: z.boolean().default(true),
    notes: z.string().max(5000).default(''),
    session_id: z.number().int().nullable().optional(),
  }),
  boolColumns: ['player_visible'],
  orderBy: "status != 'carried', id DESC",
});
const withFading = (row: Record<string, unknown>, f: Partial<Fading> | undefined) => ({ ...row, fades: !!f?.fades, anchored: !!f?.anchored });
function saveFading(db: DB, id: number, input: unknown) {
  const patch = fadingSchema.parse(input ?? {});
  if (patch.fades === undefined && patch.anchored === undefined) return;
  const next = { fades: false, anchored: false, ...moduleData<Fading>(db, 'fading-salvage', 'treasure', id), ...patch };
  if (next.fades || next.anchored) setModuleData(db, 'fading-salvage', 'treasure', id, next);
  else db.prepare(`DELETE FROM module_data WHERE module = 'fading-salvage' AND owner = 'treasure' AND owner_id = ?`).run(id);
}
export const partyTreasure: typeof coreTreasure = {
  list(db, where = {}) {
    const rows = coreTreasure.list(db, where);
    const f = moduleDataFor<Fading>(
      db,
      'fading-salvage',
      'treasure',
      rows.map((r) => r.id as number),
    );
    return rows.map((r) => withFading(r, f.get(r.id as number)));
  },
  get: (db, id) => withFading(coreTreasure.get(db, id), moduleData<Fading>(db, 'fading-salvage', 'treasure', id)),
  create(db, input) {
    const row = coreTreasure.create(db, input);
    saveFading(db, row.id as number, input);
    return partyTreasure.get(db, row.id as number);
  },
  update(db, id, input) {
    coreTreasure.update(db, id, input);
    saveFading(db, id, input);
    return partyTreasure.get(db, id);
  },
  remove: coreTreasure.remove,
};

function liveSessionId(db: DB, campaignId: number): number | null {
  const s = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
  return s?.id ?? null;
}

/** Add a rolled treasure to the party's log, line by line, and note it in the live session's log. */
export function addRollToParty(db: DB, campaignId: number, roll: TreasureRoll, foundAt = '') {
  const sessionId = liveSessionId(db, campaignId);
  const name = (id: string) => (db.prepare('SELECT name FROM entities WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? id;
  const where = foundAt || roll.region_label;
  const rows: unknown[] = [];
  db.transaction(() => {
    if (roll.coins.amount > 0)
      rows.push(
        partyTreasure.create(db, {
          campaign_id: campaignId,
          name: `${roll.coins.amount.toLocaleString('en')} ${roll.coins.coin}`,
          kind: 'coins',
          quantity: roll.coins.amount,
          value_gp: Math.round(roll.coins.amount * TO_GP[roll.coins.coin]),
          found_at: where,
          fades: roll.fades,
          session_id: sessionId,
        }),
      );
    for (const g of roll.goods)
      rows.push(
        partyTreasure.create(db, { campaign_id: campaignId, name: g.text, kind: 'goods', quantity: g.count, value_gp: g.gp * g.count, found_at: where, fades: roll.fades, session_id: sessionId }),
      );
    for (const it of roll.items)
      rows.push(
        partyTreasure.create(db, {
          campaign_id: campaignId,
          name: it.entity_id ? name(it.entity_id) : it.name,
          kind: 'item',
          rarity: it.rarity,
          entity_id: it.entity_id,
          found_at: where,
          fades: it.fades,
          session_id: sessionId,
        }),
      );
    if (sessionId != null) {
      const bits = [
        roll.coins.amount ? `${roll.coins.amount.toLocaleString('en')} ${roll.coins.coin}` : '',
        ...roll.goods.map((g) => (g.count > 1 ? `${g.count} × ${g.text}` : g.text)),
        ...roll.items.map((i) => (i.entity_id ? name(i.entity_id) : i.name)),
      ].filter(Boolean);
      if (bits.length) db.prepare(`INSERT INTO session_log (session_id, kind, text) VALUES (?, 'treasure', ?)`).run(sessionId, `Treasure found${foundAt ? ` at ${foundAt}` : ''}: ${bits.join('; ')}.`);
    }
  })();
  return rows;
}

/** What players see: what the party carries or has stored, without the GM's notes. Setting items only by revealed name. */
export function playerTreasure(db: DB, campaignId: number) {
  const rows = db
    .prepare(
      `SELECT id, name, kind, quantity, value_gp, rarity, entity_id, holder, status, found_at FROM party_treasure WHERE campaign_id = ? AND player_visible = 1 AND status IN ('carried', 'stored') ORDER BY kind, id`,
    )
    .all(campaignId) as {
    id: number;
    name: string;
    kind: string;
    quantity: number;
    value_gp: number;
    rarity: string;
    entity_id: string | null;
    holder: string;
    status: string;
    found_at: string;
  }[];
  const revealed = db.prepare('SELECT 1 FROM entities WHERE id = ? AND revealed = 1');
  // Fading shows only while its module is on for the campaign.
  const fading = moduleOn(db, 'fading-salvage', campaignId)
    ? moduleDataFor<Fading>(
        db,
        'fading-salvage',
        'treasure',
        rows.map((r) => r.id),
      )
    : new Map<number, Partial<Fading>>();
  return rows.map((r) => {
    const f = fading.get(r.id);
    return { ...r, entity_id: r.entity_id && revealed.get(r.entity_id) ? r.entity_id : null, fades: !!f?.fades && !f.anchored, anchored: !!f?.anchored };
  });
}
