/** Generators (v0.9.12, docs/BETA_PLAN.md B5): people to meet, shops with stock and prices, and the weather. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { seeded } from '../shared/names.js';
import { SHOP_KINDS, coins, makeShop, npcIdea, npcText, shopText, weatherOn, type ShopItem } from '../shared/generators.js';

const ITEMS: ShopItem[] = [
  { name: 'Longsword', type: 'Melee Weapon', rarity: 'none', magic: false, value: 15 },
  { name: 'Dagger', type: 'Melee Weapon', rarity: 'none', magic: false, value: 2 },
  { name: 'Plate Armor', type: 'Heavy Armor', rarity: 'none', magic: false, value: 1500 },
  { name: 'Shield', type: 'Shield', rarity: 'none', magic: false, value: 10 },
  { name: 'Rope', type: 'Adventuring Gear', rarity: 'none', magic: false, value: 1 },
  { name: 'Priceless Relic', type: 'Melee Weapon', rarity: 'none', magic: false, value: null },
  { name: 'Flame Tongue', type: 'Weapon (Any Melee Weapon)', rarity: 'rare', magic: true, value: null },
  { name: 'Weapon, +1', type: 'Weapon (Any Simple or Martial)', rarity: 'uncommon', magic: true, value: null },
  { name: 'Potion of Healing', type: 'Potion', rarity: 'common', magic: true, value: 50 },
  { name: 'Potion of Climbing', type: 'Potion', rarity: 'common', magic: true, value: null },
];
const smith = SHOP_KINDS.find((k) => k.key === 'smith')!;
const apothecary = SHOP_KINDS.find((k) => k.key === 'apothecary')!;

describe('a person to meet', () => {
  it('is the same for the same seed, keeps a role the GM gave, and reads as a record', () => {
    const a = npcIdea(seeded(7), 'Mara Venn', 'Humans');
    expect(npcIdea(seeded(7), 'Mara Venn', 'Humans')).toEqual(a);
    expect(npcIdea(seeded(8), 'Mara Venn', 'Humans')).not.toEqual(a);
    const b = npcIdea(seeded(7), 'Old Tam', 'Humans', ' ferry keeper ');
    expect(b.role).toBe('ferry keeper');
    const text = npcText(b);
    expect(text).toMatch(/^A ferry keeper, with .+\. Old /);
    // The secret is under the heading the app keeps from players.
    expect(text).toContain(`## Secrets\n\n${b.secret}`);
    expect(npcText({ ...b, role: 'innkeeper' })).toMatch(/^An innkeeper/);
  });
});

describe('a shop', () => {
  it('sells what its kind sells, at prices from the catalogue, and less in a poor place', () => {
    const rich = makeShop(seeded(3), smith, 'rich', ITEMS, 'Borrik Stonehand');
    const names = rich.lines.map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['Longsword', 'Dagger', 'Plate Armor', 'Shield']));
    expect(names).not.toContain('Rope'); // not a smith's
    expect(names).not.toContain('Priceless Relic'); // no price, so not for sale
    expect(names).not.toContain('Potion of Healing'); // a smith's magic is arms and armour
    const mark = { cheap: 0.9, fair: 1, dear: 1.2 }[rich.prices];
    expect(rich.lines.find((l) => l.name === 'Longsword')!.price).toBeCloseTo(Math.round(15 * mark), 5);
    // Cheap things are there in plenty; costly ones are counted.
    expect(rich.lines.find((l) => l.name === 'Dagger')!.stock).toBe(0);
    expect(rich.lines.find((l) => l.name === 'Plate Armor')!.stock).toBeGreaterThan(0);
    // Magic by rarity: a +1 weapon at the usual 400 gp, a rare one at 4,000, times the shop's prices.
    for (const l of rich.lines.filter((x) => x.magic)) expect(l.price).toBe({ uncommon: 400, rare: 4000 }[l.rarity]! * mark);

    const poor = makeShop(seeded(3), smith, 'poor', ITEMS);
    expect(poor.lines.map((l) => l.name)).not.toContain('Plate Armor');
    expect(poor.lines.some((l) => l.rarity === 'rare' || l.rarity === 'uncommon')).toBe(false);
    expect(makeShop(seeded(3), smith, 'poor', ITEMS)).toEqual(poor);
  });

  it('prices a potion from its own value, or half its rarity’s, and writes itself up', () => {
    let shop = makeShop(seeded(1), apothecary, 'rich', ITEMS);
    for (let s = 2; shop.lines.filter((l) => l.magic).length < 2 && s < 40; s++) shop = makeShop(seeded(s), apothecary, 'rich', ITEMS);
    const mark = { cheap: 0.9, fair: 1, dear: 1.2 }[shop.prices];
    expect(shop.lines.find((l) => l.name === 'Potion of Healing')!.price).toBe(50 * mark);
    expect(shop.lines.find((l) => l.name === 'Potion of Climbing')!.price).toBe(50 * mark);
    const keeper = npcIdea(seeded(2), 'Nissle Reedbrook', 'Gnomish', 'apothecary');
    const text = shopText(shop, keeper, 'Harrowgate');
    expect(text).toMatch(/^An apothecary in Harrowgate, kept by Nissle Reedbrook \(gnomish\)/);
    expect(text).toContain('| Item | Price | In stock |');
    expect(text).toContain(`| Potion of Healing (common) | ${coins(50 * mark)} | 1 |`);
    expect(text).toContain('## Secrets');
  });

  it('writes prices as coins', () => {
    expect([coins(1500), coins(12), coins(2.5), coins(0.5), coins(0.02), coins(40000)]).toEqual(['1,500 gp', '12 gp', '2.5 gp', '5 sp', '2 cp', '40,000 gp']);
  });
});

describe('the weather', () => {
  const at = (season: string, terrain: Parameters<typeof weatherOn>[0]['terrain'], day: number) => weatherOn({ season, terrain, seed: 99, day });
  const year = (season: string, terrain: Parameters<typeof weatherOn>[0]['terrain']) => Array.from({ length: 360 }, (_, d) => at(season, terrain, d)!);

  it('is the same on the same day, and follows the season and the land', () => {
    expect(at('Winter', ['forest'], 40)).toEqual(at('Winter', ['forest'], 40));
    const warmth = (ws: { temperature: string }[]) => ws.reduce((n, w) => n + ['freezing', 'cold', 'cool', 'mild', 'warm', 'hot', 'scorching'].indexOf(w.temperature), 0) / ws.length;
    const winter = year('Winter', ['forest']);
    const summer = year('High Summer', ['forest']);
    expect(warmth(winter)).toBeLessThan(warmth(summer) - 2);
    expect(warmth(year('Summer', ['arctic']))).toBeLessThan(warmth(summer) - 1.5);
    // It snows in winter and never in summer; a desert is dry.
    expect(winter.some((w) => w.falling.includes('snow'))).toBe(true);
    expect(summer.some((w) => w.falling.includes('snow'))).toBe(false);
    const wet = (ws: { falling: string }[]) => ws.filter((w) => /rain|snow|sleet|storm/.test(w.falling)).length;
    expect(wet(year('Spring', ['desert']))).toBeLessThan(wet(year('Spring', ['swamp'])) / 3);
    // A season the app has never heard of still has weather.
    expect(at('The Long Dusk', [], 5)).toBeTruthy();
  });

  it('says what it does at the table, and that there is none under the ground', () => {
    const all = [...year('Winter', ['arctic']), ...year('Summer', ['desert']), ...year('Spring', ['coastal'])];
    const effect = (re: RegExp) => all.filter((w) => w.effects.some((e) => re.test(e)));
    expect(effect(/^Extreme cold/).every((w) => w.temperature === 'freezing')).toBe(true);
    expect(effect(/^Extreme cold/).length).toBeGreaterThan(0);
    expect(effect(/^Extreme heat/).length).toBeGreaterThan(0);
    expect(effect(/^Strong wind/).every((w) => w.wind === 'windy' || w.wind === 'gale')).toBe(true);
    expect(effect(/^Heavy/).every((w) => /heavy|thunderstorm/.test(w.falling))).toBe(true);
    expect(all.every((w) => w.summary.endsWith('.'))).toBe(true);
    // Most days are ordinary: nothing to rule on.
    expect(year('Spring', ['grassland']).filter((w) => !w.effects.length).length).toBeGreaterThan(180);
    expect(at('Winter', ['underdark'], 3)).toBeNull();
    expect(at('Winter', ['underdark', 'mountain'], 3)).toBeTruthy();
  });

  it('comes in spells: neighbouring days are more alike than days far apart', () => {
    const ws = year('Autumn', ['hill']);
    const idx = (w: { temperature: string }) => ['freezing', 'cold', 'cool', 'mild', 'warm', 'hot', 'scorching'].indexOf(w.temperature);
    const diff = (gap: number) => ws.slice(0, 300).reduce((n, w, i) => n + Math.abs(idx(w) - idx(ws[i + gap])), 0);
    expect(diff(1)).toBeLessThan(diff(30));
  });
});

describe('through the app', () => {
  it('names people in a blank world from the built-in styles, and in the world’s own once it has peoples', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const src = (await request(gm).get('/api/generate/sources')).body;
    expect(src.names.map((n: { name: string }) => n.name)).toEqual(expect.arrayContaining(['Common folk', 'Dwarven', 'Elven']));
    expect(src.shops.map((k: { key: string }) => k.key)).toContain('smith');
    const people = (await request(gm).get('/api/generate/npcs?count=5&seed=11')).body as { name: string; people: string; role: string; secret: string }[];
    expect(people).toHaveLength(5);
    expect(people.every((p) => /^\S+ \S+$/.test(p.name) && p.role && p.secret)).toBe(true);
    expect((await request(gm).get('/api/generate/npcs?count=5&seed=11')).body).toEqual(people);
    // The name generator's page works in a blank world too.
    expect((await request(gm).get('/api/names?people=style:dwarven&count=4&seed=3')).body.names).toHaveLength(4);

    const made = (await request(gm).post('/api/entities').send({ name: 'Marsh Folk', type: 'people', realm: 'world', fields: [['Common names', 'Aru, Besh, Coro, Dima, Eshu, Faro, Gimi, Hadu']] })).body;
    const own = (await request(gm).get('/api/generate/npcs?count=4&seed=5')).body as { people: string }[];
    expect(own.every((p) => p.people === 'Marsh Folk')).toBe(true);
    const asked = (await request(gm).get(`/api/generate/npcs?count=2&seed=5&role=ferry%20keeper&source=${made.id}`)).body as { role: string }[];
    expect(asked.every((p) => p.role === 'ferry keeper')).toBe(true);
    expect((await request(gm).get('/api/generate/npcs?source=NOPE-1')).status).toBe(404);
  });

  it('stocks a shop from the catalogue by the place’s wealth', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const town = (await request(gm).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', fields: [['Wealth', 'Rich, from the river trade']] })).body;
    const hamlet = (await request(gm).post('/api/entities').send({ name: 'Mudford', type: 'settlement', realm: 'world', fields: [['Wealth', 'poor']] })).body;
    expect((await request(gm).get('/api/generate/sources')).body.places.map((p: { name: string }) => p.name)).toEqual(['Harrowgate', 'Mudford']);
    const rich = (await request(gm).get(`/api/generate/shop?kind=smith&place=${town.id}&seed=4`)).body;
    expect(rich).toMatchObject({ place: { id: town.id, name: 'Harrowgate' }, wealthFrom: 'place', shop: { kind: 'smith', wealth: 'rich' } });
    expect(rich.keeper.role).toBe('blacksmith');
    const names = rich.shop.lines.map((l: { name: string }) => l.name);
    expect(names.length).toBeGreaterThan(10);
    expect(names.some((n: string) => /sword|axe|bow|armor|mail/i.test(n))).toBe(true);
    expect(rich.shop.lines.every((l: { price: number }) => l.price > 0)).toBe(true);
    const poor = (await request(gm).get(`/api/generate/shop?kind=smith&place=${hamlet.id}&seed=4`)).body;
    expect(poor.shop.wealth).toBe('poor');
    expect(poor.shop.lines.length).toBeLessThan(rich.shop.lines.length);
    expect(Math.max(...poor.shop.lines.filter((l: { magic: boolean }) => !l.magic).map((l: { price: number }) => l.price))).toBeLessThanOrEqual(60);
    // The GM's word over the place's; no place at all is a modest one.
    expect((await request(gm).get(`/api/generate/shop?kind=arcane&place=${hamlet.id}&wealth=rich&seed=4`)).body).toMatchObject({ wealthFrom: 'chosen', shop: { wealth: 'rich' } });
    expect((await request(gm).get('/api/generate/shop?kind=general&seed=4')).body).toMatchObject({ place: null, wealthFrom: 'default', shop: { wealth: 'modest' } });
    for (const k of SHOP_KINDS) expect((await request(gm).get(`/api/generate/shop?kind=${k.key}&seed=9`)).body.shop.lines.length, k.key).toBeGreaterThan(3);
    expect((await request(gm).get('/api/generate/shop?kind=bakery')).status).toBe(400);
  });

  it('gives a campaign its weather from its date and where it began', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const peak = (await request(gm).post('/api/entities').send({ name: 'Frostpeak', type: 'landmark', realm: 'world', fields: [['Terrain', 'Arctic mountain']] })).body;
    const c = (await request(gm).post('/api/campaigns').send({ title: 'North', starting_location_id: peak.id })).body;
    const w = (await request(gm).get(`/api/campaigns/${c.id}/weather`)).body;
    expect(w.place).toMatchObject({ id: peak.id, name: 'Frostpeak' });
    expect(w.terrain).toEqual(['arctic', 'mountain']);
    expect(w.days).toHaveLength(7);
    expect(w.days[0].label).toBeTruthy();
    expect(w.days.every((d: { weather: { temperature: string } }) => ['freezing', 'cold', 'cool', 'mild'].includes(d.weather.temperature))).toBe(true);
    expect((await request(gm).get(`/api/campaigns/${c.id}/weather`)).body).toEqual(w);
    // A campaign with no place still has weather (a mild land's).
    const d = (await request(gm).post('/api/campaigns').send({ title: 'Nowhere' })).body;
    expect((await request(gm).get(`/api/campaigns/${d.id}/weather?days=3`)).body).toMatchObject({ place: null, terrain: [] });
    expect((await request(gm).get('/api/campaigns/9999/weather')).status).toBe(404);
  });
});
