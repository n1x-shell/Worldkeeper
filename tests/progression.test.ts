/** Party progression (v0.9.6, docs/BETA_PLAN.md B3): experience, milestones, taking a level, attendance. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { rulesView } from '../server/src/repo/rulesPacks.js';
import { exportCampaign, importCampaign } from '../server/src/backup/exporter.js';
import { levelForXp, pendingLevels, readyToLevel, xpForNext } from '../shared/progression.js';
import { gainSummary, levelGain, takeLevel } from '../client/src/player/sheet/levelUpRules.js';
import { hitPointsFor } from '../shared/rules2024.js';
import type { SheetChar } from '../shared/sheet.js';

async function table() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const camp = (await request(gm).post('/api/campaigns').send({ title: 'The Iron Crown' })).body as { id: number; advancement: string };
  const pc = async (name: string, extra: object = {}) => (await request(gm).post('/api/characters').send({ campaign_id: camp.id, name, class_name: 'Fighter', level: 1, ...extra })).body as { id: number };
  const get = async (id: number) => (await request(gm).get(`/api/characters/${id}`)).body as { level: number; sheet: { xp?: number; builtLevel?: number } };
  return { ctx, gm, camp, pc, get };
}

describe('experience', () => {
  it('knows the level experience earns, and what the next needs', () => {
    expect([levelForXp(0), levelForXp(299), levelForXp(300), levelForXp(6500), levelForXp(400000)]).toEqual([1, 1, 2, 5, 20]);
    expect([xpForNext(1), xpForNext(4), xpForNext(19), xpForNext(20)]).toEqual([300, 6500, 355000, null]);
    expect([readyToLevel(1, 299), readyToLevel(1, 300), readyToLevel(2, 300)]).toEqual([false, true, false]);
    expect([pendingLevels(5, undefined), pendingLevels(5, 5), pendingLevels(5, 3)]).toEqual([[], [], [4, 5]]);
  });
});

describe('awards', () => {
  it('shares experience out, logs it, and takes it back', async () => {
    const { gm, camp, pc, get } = await table();
    expect(camp.advancement).toBe('milestone');
    expect((await request(gm).patch(`/api/campaigns/${camp.id}`).send({ advancement: 'xp' })).body.advancement).toBe('xp');
    const [a, b, c] = [await pc('Ilse'), await pc('Bram'), await pc('Odo')];
    const s = (await request(gm).post('/api/sessions').send({ campaign_id: camp.id, number: 1 })).body as { id: number };
    // 700 between two is 350 each; the third wasn't there.
    let awards = (await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'xp', total: 700, character_ids: [a.id, b.id], session_id: s.id, reason: 'The goblin ambush' })).body;
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({ kind: 'xp', amount: 350, reason: 'The goblin ambush', session_number: 1 });
    expect(awards[0].characters.map((x: { name: string }) => x.name).sort()).toEqual(['Bram', 'Ilse']);
    expect([(await get(a.id)).sheet.xp, (await get(b.id)).sheet.xp, (await get(c.id)).sheet.xp]).toEqual([350, 350, undefined]);
    // It's in the character's own log, as the GM's.
    const log = (await request(gm).get(`/api/characters/${a.id}/log`)).body as { by: string; label?: string; field?: string }[];
    expect(JSON.stringify(log)).toContain('XP');
    awards = (await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'xp', each: 50, character_ids: [a.id] })).body;
    expect((await get(a.id)).sheet.xp).toBe(400);
    const list = (await request(gm).get(`/api/campaigns/${camp.id}/awards`)).body;
    expect(list.awards.map((x: { amount: number }) => x.amount)).toEqual([50, 350]);
    // Taken back: the experience comes off again.
    awards = (await request(gm).delete(`/api/campaigns/${camp.id}/awards/${list.awards[1].batch}`)).body;
    expect(awards).toHaveLength(1);
    expect([(await get(a.id)).sheet.xp, (await get(b.id)).sheet.xp]).toEqual([50, 0]);
    expect((await request(gm).delete(`/api/campaigns/${camp.id}/awards/nope`)).status).toBe(404);
  });

  it('a milestone gives a level, and marks the sheet so it offers what the level gives', async () => {
    const { gm, camp, pc, get } = await table();
    const [a, top] = [await pc('Ilse'), await pc('Old Bram', { level: 20 })];
    await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'milestone', character_ids: [a.id, top.id], reason: 'The crown is found' });
    expect(await get(a.id)).toMatchObject({ level: 2, sheet: { builtLevel: 1 } });
    expect((await get(top.id)).level).toBe(20);
    // A second level before the first is taken: both are waiting.
    await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'milestone', character_ids: [a.id] });
    const now = await get(a.id);
    expect(pendingLevels(now.level, now.sheet.builtLevel)).toEqual([2, 3]);
  });

  it('the player takes the level on the table server; a sheet left open doesn’t write over what the GM gave', async () => {
    const { ctx, gm, camp, pc, get } = await table();
    const a = await pc('Ilse', { sheet: { maxHp: 12, hp: 12, xp: 100 } });
    const page = (await request(gm).get(`/api/characters/${a.id}/page`)).body as { code: string };
    const player = createApp(new AppContext(ctx.paths, 'player'));
    const me = `/api/player/me/${page.code}`;
    type Mine = { level: number; sheet_at: string; sheet: { builtLevel?: number; maxHp?: number; hp?: number; xp?: number } };
    // The player opens their sheet; then the GM awards experience and a level.
    const open = (await request(player).get(me)).body as Mine;
    await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'xp', each: 300, character_ids: [a.id] });
    await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'milestone', character_ids: [a.id] });
    // The open sheet saves a change to hit points, from before the awards: the hit points are taken, the awards kept.
    const saved = (await request(player).patch(me).send({ character: { sheet: { ...open.sheet, hp: 7 }, sheet_at: open.sheet_at } })).body as Mine;
    expect(saved).toMatchObject({ level: 2, sheet: { hp: 7, xp: 400, builtLevel: 1 } });
    expect(pendingLevels(saved.level, saved.sheet.builtLevel)).toEqual([2]);
    // Taking the level: what the sheet sends. The level itself stays the GM's to set, and the mark can't pass it.
    const taken = (await request(player).patch(me).send({ character: { sheet: { ...saved.sheet, maxHp: 20, hp: 15, builtLevel: 9 }, sheet_at: saved.sheet_at } })).body as Mine;
    expect(taken).toMatchObject({ level: 2, sheet: { maxHp: 20, builtLevel: 2, xp: 400 } });
    // On a sheet that is up to date, experience the player types is theirs to type; the mark can't be taken back down.
    const typed = (await request(player).patch(me).send({ character: { sheet: { ...taken.sheet, xp: 450, builtLevel: 1 }, sheet_at: taken.sheet_at } })).body as Mine;
    expect(typed.sheet).toMatchObject({ xp: 450, builtLevel: 2 });
    // An app from before this version sends no stamp, and no mark: the mark is kept for it.
    await request(player).patch(me).send({ character: { sheet: { maxHp: 20, hp: 20, xp: 450 } } });
    expect(await get(a.id)).toMatchObject({ level: 2, sheet: { hp: 20, builtLevel: 2 } });
  });

  it('refuses what isn’t an award', async () => {
    const { gm, camp, pc } = await table();
    const a = await pc('Ilse');
    const other = (await request(gm).post('/api/campaigns').send({ title: 'Elsewhere' })).body as { id: number };
    const post = async (body: object, id = camp.id) => (await request(gm).post(`/api/campaigns/${id}/awards`).send(body)).status;
    expect(await post({ kind: 'xp', character_ids: [a.id] })).toBe(400);
    expect(await post({ kind: 'xp', each: 100, character_ids: [] })).toBe(400);
    expect(await post({ kind: 'xp', total: 1, character_ids: [a.id, a.id + 999] })).toBe(400);
    expect(await post({ kind: 'xp', each: 100, character_ids: [a.id] }, other.id)).toBe(400);
    expect(await post({ kind: 'xp', each: 100, character_ids: [a.id] }, 9999)).toBe(404);
    expect(await post({ kind: 'gold', each: 100, character_ids: [a.id] })).toBe(400);
  });
});

describe('attendance', () => {
  it('is unknown until the GM says, then counted for each character', async () => {
    const { gm, camp, pc } = await table();
    const [a, b] = [await pc('Ilse'), await pc('Bram')];
    const s1 = (await request(gm).post('/api/sessions').send({ campaign_id: camp.id, number: 1 })).body as { id: number };
    const s2 = (await request(gm).post('/api/sessions').send({ campaign_id: camp.id, number: 2 })).body as { id: number };
    expect((await request(gm).get(`/api/sessions/${s1.id}/attendance`)).body).toEqual({ present: null });
    expect((await request(gm).put(`/api/sessions/${s1.id}/attendance`).send({ character_ids: [a.id, b.id, 9999] })).body).toEqual({ present: [a.id, b.id] });
    await request(gm).put(`/api/sessions/${s2.id}/attendance`).send({ character_ids: [a.id] });
    expect((await request(gm).get(`/api/campaigns/${camp.id}/awards`)).body.attendance).toEqual({ taken: 2, by: { [a.id]: 2, [b.id]: 1 } });
    // Nobody came is still an answer.
    expect((await request(gm).put(`/api/sessions/${s2.id}/attendance`).send({ character_ids: [] })).body).toEqual({ present: [] });
  });

  it('awards and attendance travel with a campaign export', async () => {
    const { ctx, gm, camp, pc } = await table();
    const a = await pc('Ilse');
    const s = (await request(gm).post('/api/sessions').send({ campaign_id: camp.id, number: 1 })).body as { id: number };
    await request(gm).put(`/api/sessions/${s.id}/attendance`).send({ character_ids: [a.id] });
    await request(gm).post(`/api/campaigns/${camp.id}/awards`).send({ kind: 'xp', each: 300, character_ids: [a.id], session_id: s.id, reason: 'Bandits' });
    const cid = importCampaign(ctx.db, JSON.parse(JSON.stringify(exportCampaign(ctx.db, camp.id, ctx.paths.uploadsDir))), ctx.paths.uploadsDir);
    const there = (await request(gm).get(`/api/campaigns/${cid}/awards`)).body;
    expect(there.awards).toHaveLength(1);
    expect(there.awards[0]).toMatchObject({ amount: 300, reason: 'Bandits', session_number: 1, characters: [{ name: 'Ilse' }] });
    expect(there.attendance.taken).toBe(1);
    expect(Object.values(there.attendance.by)).toEqual([1]);
  });
});

describe('taking a level', () => {
  const rules = rulesView(tempContext().db);
  const fighter = (level: number, sheet: SheetChar['sheet'] = {}): SheetChar => ({
    name: 'Ilse',
    species: 'Human',
    class_name: 'Fighter',
    level,
    sheet: { abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 }, maxHp: hitPointsFor(10, level, 2), hp: hitPointsFor(10, level, 2), hitDie: 'd10', classFeatures: [], ...sheet },
  });

  it('gives hit points, the level’s features and the new numbers', () => {
    const before = fighter(1, { attacks: [{ name: 'Longsword', bonus: '+5', damage: '1d8 + 3 Slashing', notes: '' }], resources: [{ name: 'Second Wind', max: 2, used: 1, reset: 'short-one' }, { name: 'Luck', max: 3, used: 2, reset: 'long' }] });
    const g = levelGain(before, 2, rules);
    expect(g).toMatchObject({ level: 2, hitDie: 10, conMod: 2, hpAverage: 8, improvement: null, subclasses: null, known: true });
    expect(g.features.map((f) => f.name)).toContain('Action Surge');
    const s = takeLevel(before, g, { hp: g.hpAverage }, rules);
    expect(s).toMatchObject({ maxHp: 20, hp: 20, builtLevel: 2 });
    expect(s.classFeatures!.map((f) => f.source)).toContain('Fighter 2');
    // Rest uses: the class's at the new level keeping what's spent, and the player's own untouched.
    expect(s.resources).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Action Surge', max: 1, used: 0 }), expect.objectContaining({ name: 'Second Wind', used: 1 }), { name: 'Luck', max: 3, used: 2, reset: 'long' }]));
    // Taking it twice adds nothing twice.
    const again = takeLevel({ ...before, sheet: s }, g, { hp: 0 }, rules);
    expect(again.classFeatures!.filter((f) => f.name === 'Action Surge')).toHaveLength(1);
  });

  it('offers a subclass at level 3 and brings its features', () => {
    const before = fighter(2);
    const g = levelGain(before, 3, rules);
    expect(g.subclasses).toContain('Champion');
    const s = takeLevel(before, g, { hp: 7, subclass: 'Champion' }, rules);
    expect(s.subclass).toBe('Champion');
    expect(s.classFeatures!.some((f) => f.source === 'Champion 3')).toBe(true);
    expect(levelGain({ ...before, sheet: s }, 4, rules).subclasses).toBeNull();
  });

  it('raises ability scores, or takes a feat; Constitution lifts every level’s hit points', () => {
    const before = fighter(3, { ac: 12, attacks: [{ name: 'Longsword', bonus: '+5', damage: '1d8 + 3 Slashing', notes: 'mine' }, { name: 'Longbow', bonus: '+9', damage: 'changed by hand', notes: '' }] });
    const g = levelGain(before, 4, rules);
    expect(g.improvement).toBe('asi');
    expect(g.feats).toContain('Grappler');
    expect(g.feats).not.toContain('Boon of Fate');
    // +1 Constitution (14 to 15) changes no modifier; +2 (to 16) does: 4 levels each gain 1.
    const one = takeLevel(before, g, { hp: 8, abilities: ['CON', 'STR'] }, rules);
    expect(one).toMatchObject({ maxHp: before.sheet.maxHp! + 8, abilities: { CON: 15, STR: 17 } });
    const two = takeLevel(before, g, { hp: 8, abilities: ['CON', 'CON'] }, rules);
    expect(two.maxHp).toBe(before.sheet.maxHp! + 8 + 4);
    // Strength 16 to 18: the sword the sheet worked out follows (+3 to +4, and the damage); the bow changed by hand stays.
    const str = takeLevel(before, g, { hp: 8, abilities: ['STR', 'STR'] }, rules);
    expect(str.attacks![0]).toMatchObject({ bonus: '+6', damage: '1d8 + 4 Slashing', notes: 'mine' });
    expect(str.attacks![1]).toMatchObject({ bonus: '+9', damage: 'changed by hand' });
    // Unarmored 10 + Dex 2 was 12 as worked out: Dexterity 14 to 16 makes it 13.
    expect(takeLevel(before, g, { hp: 8, abilities: ['DEX', 'DEX'] }, rules).ac).toBe(13);
    const feat = takeLevel(before, g, { hp: 8, feat: 'Grappler' }, rules);
    expect(feat.abilities).toEqual(before.sheet.abilities);
    expect(feat.featList!.map((f) => f.name)).toEqual(['Grappler']);
    expect(feat.featList![0].text.length).toBeGreaterThan(20);
  });

  it('gives a caster its slots and says what to choose', () => {
    const wizard: SheetChar = { name: 'Odo', species: 'Elf', class_name: 'Wizard', level: 2, sheet: { abilities: { CON: 12, INT: 16 }, maxHp: 12, hp: 5, spellSlots: { '1': { max: 3, used: 2 } } } };
    const g = levelGain(wizard, 3, rules);
    expect(g.slots.to).toEqual({ '1': 4, '2': 2 });
    expect(gainSummary(g).join(' ')).toMatch(/Spell slots: 4 of level 1, 2 of level 2/);
    expect(gainSummary(g).join(' ')).toMatch(/prepare/);
    const s = takeLevel(wizard, g, { hp: g.hpAverage }, rules);
    expect(s.spellSlots).toEqual({ '1': { max: 4, used: 2 }, '2': { max: 2, used: 0 } });
    expect(s).toMatchObject({ maxHp: 17, hp: 10 });
    // Level 5: the Proficiency Bonus rises.
    expect(gainSummary(levelGain({ ...wizard, level: 4 }, 5, rules))).toContain('Proficiency Bonus rises to +3.');
  });

  it('an Epic Boon at 19; a class the rules don’t have still gets the arithmetic', () => {
    const g = levelGain(fighter(18), 19, rules);
    expect(g.improvement).toBe('boon');
    expect(g.feats).toContain('Boon of Fate');
    expect(g.feats).not.toContain('Grappler');
    const odd: SheetChar = { name: 'X', species: '', class_name: 'Gunslinger', level: 1, sheet: { hitDie: 'd12', abilities: { CON: 8 }, maxHp: 11, hp: 11 } };
    const og = levelGain(odd, 2, rules);
    expect(og).toMatchObject({ known: false, hitDie: 12, hpAverage: 6, features: [], improvement: null });
    expect(takeLevel(odd, og, { hp: og.hpAverage }, rules)).toMatchObject({ maxHp: 17, builtLevel: 2 });
  });
});
