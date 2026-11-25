/** Rolls the whole table sees (v0.9.8, docs/BETA_PLAN.md B4). */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';

async function table() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const camp = (await request(gm).post('/api/campaigns').send({ title: 'The Iron Crown' })).body as { id: number };
  await request(gm).put('/api/campaigns/active').send({ id: camp.id });
  const ch = (await request(gm).post('/api/characters').send({ campaign_id: camp.id, name: 'Ilse', class_name: 'Rogue', level: 3 })).body as { id: number };
  const page = (await request(gm).get(`/api/characters/${ch.id}/page`)).body as { code: string };
  const player = createApp(new AppContext(ctx.paths, 'player'));
  const live = async () => (await request(player).get('/api/player/live')).body as { live: boolean; rolls: { who: string; label: string; total: number; hidden: boolean }[] };
  return { ctx, gm, player, camp, ch, me: `/api/player/me/${page.code}`, live };
}

describe('rolls the whole table sees', () => {
  it('a player rolls from their sheet: the server rolls, and the table reads it', async () => {
    const { gm, player, camp, ch, me, live } = await table();
    const r = (await request(player).post(`${me}/roll`).send({ label: 'Stealth', expression: '1d20+7' })).body;
    expect(r).toMatchObject({ who: 'Ilse', character_id: ch.id, label: 'Stealth', expression: '1d20+7', mode: 'normal', hidden: false });
    expect(r.total).toBeGreaterThanOrEqual(8);
    expect(r.total).toBeLessThanOrEqual(27);
    expect(r.detail).toMatch(/^1d20\[\d+\] \+7$/);
    // Advantage rolls two and says so.
    const adv = (await request(player).post(`${me}/roll`).send({ label: 'Dexterity save', expression: '1d20+5', mode: 'adv' })).body;
    expect(adv.detail).toMatch(/\(adv \d+, \d+\)/);
    // No session is running, and the table still sees the rolls, newest first.
    const l = await live();
    expect(l.live).toBe(false);
    expect(l.rolls.map((x) => [x.who, x.label])).toEqual([
      ['Ilse', 'Dexterity save'],
      ['Ilse', 'Stealth'],
    ]);
    expect((await request(gm).get(`/api/campaigns/${camp.id}/rolls`)).body).toHaveLength(2);
  });

  it('the GM rolls behind the screen, shows one, and rolls for a character', async () => {
    const { gm, camp, ch, live } = await table();
    const secret = (await request(gm).post(`/api/campaigns/${camp.id}/rolls`).send({ label: 'The guard’s Perception', expression: '1d20+3', hidden: true })).body;
    expect(secret).toMatchObject({ who: 'The GM', hidden: true });
    await request(gm).post(`/api/campaigns/${camp.id}/rolls`).send({ expression: '2d6', label: 'Fire damage' });
    await request(gm).post(`/api/campaigns/${camp.id}/rolls`).send({ expression: '1d20+2', label: 'Initiative', character_id: ch.id });
    expect((await live()).rolls.map((x) => [x.who, x.label])).toEqual([
      ['Ilse', 'Initiative'],
      ['The GM', 'Fire damage'],
    ]);
    expect(JSON.stringify(await live())).not.toContain('Perception');
    expect((await request(gm).get(`/api/campaigns/${camp.id}/rolls`)).body).toHaveLength(3);
    // Shown to the table after all.
    await request(gm).patch(`/api/campaigns/${camp.id}/rolls/${secret.id}`).send({ hidden: false });
    expect((await live()).rolls).toHaveLength(3);
    await request(gm).delete(`/api/campaigns/${camp.id}/rolls`);
    expect((await live()).rolls).toEqual([]);
  });

  it('a player can’t hide a roll, roll for someone else, or roll nonsense', async () => {
    const { gm, player, camp, me, live } = await table();
    const r = (await request(player).post(`${me}/roll`).send({ label: 'Sneaky', expression: '1d20', hidden: true })).body;
    expect(r.hidden).toBe(false);
    expect((await live()).rolls).toHaveLength(1);
    expect((await request(player).post(`${me}/roll`).send({ expression: 'a lot' })).status).toBe(400);
    expect((await request(player).post(`${me}/roll`).send({ expression: '' })).status).toBe(400);
    expect((await request(player).post('/api/player/me/NOPE99/roll').send({ expression: '1d20' })).status).toBe(404);
    // The GM's routes aren't on the table server.
    expect((await request(player).post(`/api/campaigns/${camp.id}/rolls`).send({ expression: '1d20' })).status).toBe(404);
    // Another campaign's character can't be rolled for here.
    const other = (await request(gm).post('/api/campaigns').send({ title: 'Elsewhere' })).body as { id: number };
    const stranger = (await request(gm).post('/api/characters').send({ campaign_id: other.id, name: 'Odo' })).body as { id: number };
    expect((await request(gm).post(`/api/campaigns/${camp.id}/rolls`).send({ expression: '1d20', character_id: stranger.id })).status).toBe(400);
  });

  it('each campaign has its own log, at its own address, and keeps only the latest', async () => {
    const { ctx, gm, player, camp, me } = await table();
    const other = (await request(gm).post('/api/campaigns').send({ title: 'Elsewhere' })).body as { id: number };
    await request(gm).post(`/api/campaigns/${other.id}/rolls`).send({ expression: '1d6', label: 'Theirs' });
    await request(player).post(`${me}/roll`).send({ expression: '1d6', label: 'Ours' });
    const code = (id: number) => (ctx.db.prepare('SELECT handbook_code c FROM campaigns WHERE id = ?').get(id) as { c: string }).c;
    await request(gm).get(`/api/campaigns/${camp.id}/overview`);
    await request(gm).get(`/api/campaigns/${other.id}/overview`);
    const at = async (id: number) => ((await request(player).get(`/api/player/c/${code(id)}/live`)).body.rolls as { label: string }[]).map((x) => x.label);
    if (code(camp.id) && code(other.id)) {
      expect(await at(camp.id)).toEqual(['Ours']);
      expect(await at(other.id)).toEqual(['Theirs']);
    }
    // The log is for the table tonight: old rolls go.
    const ins = ctx.db.prepare(`INSERT INTO table_rolls (campaign_id, who, expression, total) VALUES (?, 'x', '1d4', 1)`);
    for (let i = 0; i < 230; i++) ins.run(camp.id);
    await request(player).post(`${me}/roll`).send({ expression: '1d6' });
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM table_rolls WHERE campaign_id = ?').get(camp.id) as { n: number }).n).toBe(200);
  });
});

describe('what the sheet reads as dice', () => {
  it('finds the dice in an attack row as players write it', async () => {
    const { attackDice, d20, damageDice } = await import('../client/src/player/sheet/rollDice.js');
    expect([d20(5), d20(0), d20(-1)]).toEqual(['1d20+5', '1d20', '1d20-1']);
    expect([attackDice('+5'), attackDice('7'), attackDice('− 1'), attackDice('DC 13'), attackDice('')]).toEqual(['1d20+5', '1d20+7', '1d20-1', null, null]);
    expect([damageDice('1d8 + 3 Slashing'), damageDice('2d6+1d4 − 1 fire'), damageDice('d10 Piercing'), damageDice('5'), damageDice('see notes')]).toEqual(['1d8+3', '2d6+1d4-1', 'd10', null, null]);
  });
});
