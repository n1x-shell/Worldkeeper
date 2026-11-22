/**
 * Live play: the session briefing, handouts and the players' live feed. The records below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { campaigns, encounters, sessions, setActiveCampaign } from '../server/src/repo/campaigns';
import { nearbyPeople, sessionBriefing } from '../server/src/repo/briefing';
import { updateEntity } from '../server/src/repo/entities';
import { handouts, playerLive, pushHandout } from '../server/src/repo/handouts';
import { playerCampaign } from '../server/src/player/projection';

const rec = (id: string, name: string, category: string, parent = 'None'): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: ${parent}\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA record.\n`,
});

function setup() {
  const ctx = tempContext();
  const files = [rec('REG-801', 'Test Marches', 'Region'), rec('SET-801', 'Test Town', 'Settlement', 'Test Marches [REG-801]'), rec('LOC-801', 'Old Tower', 'Landmark', 'Test Marches [REG-801]')];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  ctx.db.prepare(`UPDATE entities SET parent_id = 'REG-801' WHERE id IN ('SET-801','LOC-801')`).run();
  const c = campaigns.create(ctx.db, { title: 'Test', starting_location_id: 'SET-801' }) as { id: number };
  setActiveCampaign(ctx.db, c.id);
  const s = sessions.create(ctx.db, { campaign_id: c.id, number: 1, title: 'One' }) as { id: number };
  return { ctx, campaignId: c.id, sessionId: s.id };
}

describe('live play', () => {
  it('briefs the session from where the party is', () => {
    const { ctx, sessionId } = setup();
    const b = sessionBriefing(ctx.db, sessionId);
    expect(b.location).toMatchObject({ id: 'SET-801', name: 'Test Town' });
    expect(b.region).toMatchObject({ id: 'REG-801' });
    expect(b.nearby.map((n) => n.id)).toContain('LOC-801');
    expect(b.level).toBe(1);
  });

  it('finds who is nearby, with their looks, manner and what they say', () => {
    const { ctx, sessionId } = setup();
    const files = [rec('NPC-801', 'Mara Quill', 'NPC'), rec('NPC-802', 'Far Away', 'NPC')];
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    updateEntity(ctx.db, 'NPC-801', {
      player_summary: '*The town baker.*\n\n| People | Class | Known as | Pronouns | From |\n| --- | --- | --- | --- | --- |\n| Halfling | Rogue | Rogue | She/her | Test Town |\n\n**Looks.** Floury to the elbows.\n\n**Manner.** Brisk and kind.\n',
      revealed: true,
    });
    ctx.db.prepare(`INSERT INTO relationships (source_id, target_id, type, origin) VALUES ('NPC-801', 'SET-801', 'lives_in', 'user')`).run();
    ctx.db.prepare(`INSERT INTO rumours (key, text, source_id) VALUES ('t1', 'Mara bakes before dawn.', 'NPC-801')`).run();
    const n = nearbyPeople(ctx.db, sessionId);
    expect(n.place).toBe('Test Town');
    expect(n.people).toEqual([
      expect.objectContaining({ id: 'NPC-801', species: 'Halfling', looks: 'Floury to the elbows.', manner: 'Brisk and kind.', rumours: ['Mara bakes before dawn.'], gmOnly: false }),
    ]);
  });

  it('shows players handouts only once given, and logs the giving', () => {
    const { ctx, campaignId, sessionId } = setup();
    const h = handouts.create(ctx.db, { campaign_id: campaignId, title: 'A sealed letter', body: 'Meet me at the tower.' }) as { id: number };
    expect(playerCampaign(ctx.db, campaignId)!.handouts).toEqual([]);
    sessions.update(ctx.db, sessionId, { status: 'live' });
    pushHandout(ctx.db, h.id, true);
    expect(playerCampaign(ctx.db, campaignId)!.handouts.map((x) => x.title)).toEqual(['A sealed letter']);
    expect(ctx.db.prepare('SELECT kind, text FROM session_log WHERE session_id = ?').all(sessionId)).toEqual([{ kind: 'handout', text: 'Handout given to the players: A sealed letter.' }]);
    pushHandout(ctx.db, h.id, false);
    expect(playerCampaign(ctx.db, campaignId)!.handouts).toEqual([]);
  });

  it('gives players the turn order during a live session, with no monster numbers or hidden foes', () => {
    const { ctx, campaignId, sessionId } = setup();
    expect(playerLive(ctx.db)).toEqual({ live: false });
    sessions.update(ctx.db, sessionId, { status: 'live' });
    const base = { initiativeBonus: 0, tempHp: 0, ac: 12, conditions: [], concentration: null, entityId: null, notes: '', defeated: false };
    encounters.create(ctx.db, {
      campaign_id: campaignId,
      session_id: sessionId,
      title: 'Ambush',
      status: 'running',
      round: 2,
      turn_index: 1,
      combatants: [
        { ...base, id: 'a', name: 'Ilsa', initiative: 18, hp: 20, maxHp: 24, isPC: true, hidden: false, playerName: '' },
        { ...base, id: 'b', name: 'Name-Eater', initiative: 14, hp: 30, maxHp: 45, isPC: false, hidden: false, playerName: 'the grey slick' },
        { ...base, id: 'c', name: 'Lurker', initiative: 10, hp: 9, maxHp: 9, isPC: false, hidden: true, playerName: '' },
      ],
    });
    const l = playerLive(ctx.db);
    expect(l.live).toBe(true);
    const fight = (l as { fight: { round: number; order: { name: string; current: boolean; hp: unknown }[] } }).fight;
    expect(fight.round).toBe(2);
    expect(fight.order.map((c) => c.name)).toEqual(['Ilsa', 'the grey slick']);
    expect(fight.order[1]).toMatchObject({ current: true, hp: null });
    expect(fight.order[0].hp).toEqual({ hp: 20, max: 24 });
    expect(JSON.stringify(l)).not.toContain('Name-Eater');
    expect(JSON.stringify(l)).not.toContain('Lurker');
  });
});

import { bastions, hostStanding, takeBastionTurn } from '../server/src/repo/bastions';
import { adjustRenown } from '../server/src/repo/standing';
import { specialSlots } from '../shared/bastions';

describe('bastions', () => {
  it('records each facility order as a turn, clears the orders, and checks the host faction', () => {
    const { ctx, campaignId, sessionId } = setup();
    sessions.update(ctx.db, sessionId, { status: 'live' });
    const files = [rec('FAC-801', 'The Test Order', 'Faction')];
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    const b = bastions.create(ctx.db, {
      campaign_id: campaignId,
      name: 'The Old Tower',
      host_faction_id: 'FAC-801',
      facilities: [
        { id: 'a', name: 'Smithy', kind: 'special', order: 'Craft' },
        { id: 'b', name: 'Bedroom', kind: 'basic' },
      ],
    }) as { id: number };
    expect(hostStanding(ctx.db, campaignId, 'FAC-801')).toMatchObject({ welcome: false });
    adjustRenown(ctx.db, campaignId, 'FAC-801', 10, 'Saved the chapter');
    expect(hostStanding(ctx.db, campaignId, 'FAC-801')).toMatchObject({ rank: 'Honoured', welcome: true }); // the plain ladder: no setting pack here
    const t = takeBastionTurn(ctx.db, b.id, { event: 'A visiting smith.' });
    expect(t).toMatchObject({ number: 1, orders: [{ facility: 'Smithy', order: 'Craft' }], event: 'A visiting smith.' });
    expect((bastions.get(ctx.db, b.id) as { facilities: { order: string }[] }).facilities.every((f) => f.order === '')).toBe(true);
    const log = ctx.db.prepare('SELECT text FROM session_log WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId) as { text: string };
    expect(log.text).toBe('Bastion turn 1 at The Old Tower: Smithy (Craft). A visiting smith.');
    expect([1, 5, 9, 13, 17].map(specialSlots)).toEqual([0, 2, 4, 5, 6]);
  });
});
