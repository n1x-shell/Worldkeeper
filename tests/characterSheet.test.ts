/** The character sheet: change log, portraits, and the D&D 2024 rules that fill a sheet in. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { exportCampaign, importCampaign } from '../server/src/backup/exporter.js';
import { armorClass, attackFor, hitPointsFor, spellSlotsFor, weaponInfo, resourcesFor } from '../shared/rules2024.js';
import { buildSheet, EMPTY_BUILD, finalScores } from '../client/src/player/builder/compute.js';
import spells from '../shared/srd/spells.json';
import text from '../shared/srd/text.json';
import type { SrdSpell, SrdText } from '../client/src/player/sheet/srd.js';

// A 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function setup() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const camp = (await request(gm).post('/api/campaigns').send({ title: 'Test campaign' })).body;
  const ch = (
    await request(gm)
      .post('/api/characters')
      .send({ campaign_id: camp.id, name: 'Wren', species: 'Halfling', class_name: 'Rogue', level: 3, sheet: { hp: 20 } })
  ).body;
  const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body;
  const table = createApp(new AppContext(ctx.paths, 'player'));
  return { ctx, gm, table, camp, ch, me: `/api/player/me/${page.code}` };
}

describe('the change log', () => {
  it('records who changed what, folds a burst of edits into one entry, and keeps GM notes out of the player view', async () => {
    const { gm, table, ch, me } = await setup();
    await request(table)
      .patch(me)
      .send({ character: { sheet: { hp: 15 } } });
    await request(table)
      .patch(me)
      .send({ character: { sheet: { hp: 12 } } });
    await request(gm)
      .patch(`/api/characters/${ch.id}`)
      .send({ sheet: { hp: 12, shardscarred: 'GM: the shard hums' } });
    await request(gm).patch(`/api/characters/${ch.id}/page`).send({ thinning: 2 });
    const log = (await request(gm).get(`/api/characters/${ch.id}/log`)).body as { by: string; field: string; summary: string }[];
    const hp = log.filter((e) => e.field === 'sheet.hp');
    expect(hp).toHaveLength(1);
    expect(hp[0]).toMatchObject({ by: 'player', summary: '20 → 12' });
    expect(log.find((e) => e.field === 'page.thinning')).toMatchObject({ by: 'gm', summary: '0 → 2' });
    expect(log.find((e) => e.field === 'sheet.shardscarred')?.by).toBe('gm');
    const theirs = (await request(table).get(`${me}/log`)).body as { field: string }[];
    expect(theirs.some((e) => e.field === 'sheet.hp')).toBe(true);
    expect(theirs.some((e) => e.field === 'sheet.shardscarred')).toBe(false);
    // A change undone within a few minutes leaves no entry.
    await request(gm).patch(`/api/characters/${ch.id}`).send({ name: 'Wrenna' });
    await request(gm).patch(`/api/characters/${ch.id}`).send({ name: 'Wren' });
    expect(((await request(gm).get(`/api/characters/${ch.id}/log`)).body as { field: string }[]).some((e) => e.field === 'name')).toBe(false);
  });
});

describe('portraits', () => {
  it('are uploaded by the player or the GM, served to the table, and survive a sheet save sent without them', async () => {
    const { ctx, gm, table, ch, me } = await setup();
    expect((await request(table).post(`${me}/portrait`).send({ image: 'data:image/png;base64,aGVsbG8=' })).status).toBe(400);
    const r = await request(table).post(`${me}/portrait`).send({ image: PNG });
    expect(r.status).toBe(200);
    const file = r.body.sheet.portrait as string;
    expect(file).toMatch(/^portrait-\d+-[a-f0-9]+\.png$/);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, file))).toBe(true);
    expect((await request(table).get(`/api/player/uploads/${file}`)).status).toBe(200);
    // A save that left the portrait out (or tried to point it elsewhere) doesn't change it.
    await request(table)
      .patch(me)
      .send({ character: { sheet: { hp: 9 } } });
    await request(gm)
      .patch(`/api/characters/${ch.id}`)
      .send({ sheet: { hp: 9, portrait: 'portrait-99-abc.png' } });
    expect((await request(gm).get(`/api/characters/${ch.id}`)).body.sheet.portrait).toBe(file);
    // The GM replaces it; the old file goes.
    const g = await request(gm).post(`/api/characters/${ch.id}/portrait`).send({ image: PNG });
    expect(g.body.sheet.portrait).not.toBe(file);
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, file))).toBe(false);
    const log = (await request(gm).get(`/api/characters/${ch.id}/log`)).body as { by: string; field: string; summary: string }[];
    expect(log.filter((e) => e.field === 'sheet.portrait').map((e) => e.by)).toEqual(['gm', 'player']);
  });

  it('travel inside a campaign export, with the change log', async () => {
    const { ctx, gm, camp, ch } = await setup();
    await request(gm).post(`/api/characters/${ch.id}/portrait`).send({ image: PNG });
    const data = exportCampaign(ctx.db, camp.id, ctx.paths.uploadsDir);
    expect(Object.keys(data.portraits)).toHaveLength(1);
    const cid = importCampaign(ctx.db, JSON.parse(JSON.stringify(data)), ctx.paths.uploadsDir);
    const copy = ctx.db.prepare('SELECT id, sheet FROM characters WHERE campaign_id = ?').get(cid) as { id: number; sheet: string };
    const pic = JSON.parse(copy.sheet).portrait as string;
    expect(pic).toMatch(new RegExp(`^portrait-${copy.id}-`));
    expect(fs.existsSync(path.join(ctx.paths.uploadsDir, pic))).toBe(true);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM character_changes WHERE character_id = ?').get(copy.id) as { n: number }).n).toBeGreaterThan(0);
  });
});

describe('the 2024 rules', () => {
  it('work out hit points, spell slots, armor class and attacks', () => {
    expect(hitPointsFor(8, 1, 2)).toBe(10);
    expect(hitPointsFor(12, 5, 3)).toBe(12 + 3 + 4 * (7 + 3));
    expect(spellSlotsFor('Wizard', 5)).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(spellSlotsFor('Paladin', 1)).toEqual({ 1: 2 });
    expect(spellSlotsFor('Warlock', 5)).toEqual({ 3: 2 });
    expect(spellSlotsFor('Fighter', 5)).toEqual({});
    const s = { abilities: { STR: 10, DEX: 16, CON: 14, WIS: 15 } };
    expect(armorClass(s, 'Rogue').value).toBe(13);
    expect(armorClass({ ...s, armorWorn: 'Chain Shirt', shield: true }, 'Cleric').value).toBe(13 + 2 + 2);
    expect(armorClass(s, 'Barbarian').value).toBe(10 + 3 + 2);
    expect(armorClass(s, 'Monk').value).toBe(10 + 3 + 2);
    expect(attackFor(weaponInfo('Rapier')!, s, 'Rogue', 1)).toMatchObject({ bonus: '+5', damage: '1d8 + 3 Piercing' });
    // A Wizard isn't proficient with a longsword.
    expect(attackFor(weaponInfo('Longsword')!, s, 'Wizard', 1).bonus).toBe('+0');
    expect(resourcesFor('Barbarian', 3, s)).toEqual([{ name: 'Rage', max: 3, used: 0, reset: 'short-one' }]);
  });

  it('build a whole sheet from the builder’s choices', () => {
    const b = {
      ...EMPTY_BUILD,
      level: 4,
      people: 'Dwarf',
      cls: 'Fighter',
      subclass: 'Champion',
      background: 'Soldier',
      bgAbilities: ['STR', 'DEX', 'CON'] as const,
      plusTwo: 'STR' as const,
      plusOne: 'CON' as const,
      base: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 },
      improvements: [{ level: 4, kind: 'asi' as const, picks: ['STR' as const, 'CON' as const], feat: '' }],
      classSkills: ['Perception', 'Survival'],
      languages: ['Dwarvish', 'Giant'],
      masteries: ['Greatsword', 'Flail', 'Javelin', 'Longbow'],
      name: 'Brannoc',
    };
    expect(finalScores({ ...b, bgAbilities: [...b.bgAbilities] })).toMatchObject({ STR: 18, CON: 16 });
    const out = buildSheet({ ...b, bgAbilities: [...b.bgAbilities] }, { world: [], speciesRules: 'Dwarf', text: text as unknown as SrdText, spells: spells as SrdSpell[] });
    const s = out.sheet;
    expect(out).toMatchObject({ name: 'Brannoc', class_name: 'Fighter', level: 4 });
    expect(s.saves).toEqual(['STR', 'CON']);
    expect(s.skills).toEqual(expect.arrayContaining(['Athletics', 'Intimidation', 'Perception', 'Survival']));
    // d10 at 1, 6 a level after, +3 Con a level, and a dwarf's Dwarven Toughness (+1 a level).
    expect(s.maxHp).toBe(10 + 3 + 3 * (6 + 3) + 4);
    expect(s.armorWorn).toBe('Chain Mail');
    expect(s.ac).toBe(16);
    expect(s.attacks?.map((a) => a.name)).toEqual(expect.arrayContaining(['Greatsword', 'Flail', 'Javelin', 'Spear', 'Shortbow']));
    expect(s.attacks?.find((a) => a.name === 'Greatsword')).toMatchObject({ bonus: '+6', damage: '2d6 + 4 Slashing' });
    expect(s.featList?.map((f) => f.name)).toEqual(['Savage Attacker']);
    expect(s.featList?.[0].text).toContain('Once per turn');
    expect(s.classFeatures?.map((f) => f.name)).toEqual(expect.arrayContaining(['Second Wind', 'Action Surge', 'Improved Critical']));
    expect(s.speciesTraits?.map((f) => f.name)).toEqual(expect.arrayContaining(['Dwarven Toughness']));
    expect(s.languages).toBe('Common, Dwarvish, Giant');
    expect(s.coins?.gp).toBe(4 + 14);
    expect(s.resources?.map((r) => r.name)).toEqual(['Second Wind', 'Action Surge']);
  });
});
