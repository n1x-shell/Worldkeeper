/**
 * Faction standing: Renown per faction per campaign, ranks from RUL-010, rank texts from the faction's Standing
 * record, and what players see. The records below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { campaigns, sessions, setActiveCampaign } from '../server/src/repo/campaigns';
import { updateEntity } from '../server/src/repo/entities';
import { adjustRenown, playerStanding, setStandingOptions, standingFor, undoRenown } from '../server/src/repo/standing';
import { playerCampaign } from '../server/src/player/projection';
import fs from 'node:fs';
import { PLAIN_LADDER, makeLadder, rankOf as rankIn, nextRank as nextIn, earnedRanks as earnedIn } from '../shared/standing';
import type { PackManifest } from '../shared/packs';

// The setting's ladder, as its pack gives it.
const SETTING = makeLadder((JSON.parse(fs.readFileSync(new URL('../packs/worldkeeper/pack.json', import.meta.url), 'utf8')) as PackManifest).renown!);
const rankOf = (n: number) => rankIn(n, SETTING);
const nextRank = (n: number) => nextIn(n, SETTING);
const earnedRanks = (n: number) => earnedIn(n, SETTING);

const faction = (id: string, name: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: Faction\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA faction.\n`,
});
const rule: SourceFile = {
  path: 'Lib/RUL-901.md',
  content: `ID: RUL-901\nName: Standing with the Test Order\nAlternate names: None\nCategory: Rule\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/player\nFaction: FAC-901\n\n# Standing with the Test Order\n\n## What they value\nTests.\n\n## Distrusted\nGlared at.\n\n## Initiate\nA badge.\n\n## Trusted\nA key.\n`,
};

function setup() {
  const ctx = tempContext({ settingRealms: true });
  const files = [faction('FAC-901', 'The Test Order'), faction('FAC-902', 'The Secret Ring'), rule];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  updateEntity(ctx.db, 'FAC-901', { revealed: true, player_summary: 'An order.', revealed_sections: [], reason: 'test' });
  const c = campaigns.create(ctx.db, { title: 'Test Campaign' }) as { id: number };
  setActiveCampaign(ctx.db, c.id);
  return { ctx, campaignId: c.id };
}

describe('faction standing', () => {
  it('ranks Renown as the setting rules say', () => {
    expect([-10, -9, -3, -2, 0, 2, 3, 9, 10, 24, 25, 49, 50].map(rankOf)).toEqual([
      'Hostile',
      'Distrusted',
      'Distrusted',
      'Neutral',
      'Neutral',
      'Neutral',
      'Initiate',
      'Initiate',
      'Trusted',
      'Trusted',
      'Exalted',
      'Exalted',
      'Champion',
    ]);
    expect(nextRank(4)).toEqual({ name: 'Trusted', at: 10 });
    expect(nextRank(-5)).toEqual({ name: 'Neutral', at: -2 });
    expect(nextRank(60)).toBeNull();
    expect(earnedRanks(12)).toEqual(['Initiate', 'Trusted']);
    expect(earnedRanks(-4)).toEqual(['Distrusted']);
    expect(earnedRanks(1)).toEqual([]);
    // A world without the setting's ladder gets a plain one.
    expect([-12, -5, 0, 4, 12, 30].map((n) => rankIn(n, PLAIN_LADDER))).toEqual(['Hostile', 'Unfriendly', 'Neutral', 'Friendly', 'Honoured', 'Revered']);
    expect(earnedIn(12, PLAIN_LADDER)).toEqual(['Friendly', 'Honoured']);
  });

  it('tracks Renown with its reasons, reads rank texts from the Standing record, and can undo', () => {
    const { ctx, campaignId } = setup();
    const before = standingFor(ctx.db, campaignId).find((r) => r.faction_id === 'FAC-901')!;
    expect(before).toMatchObject({ renown: 0, rank: 'Neutral', rule_id: 'RUL-901', values: 'Tests.' });
    expect(before.ranks).toEqual({ Distrusted: 'Glared at.', Initiate: 'A badge.', Trusted: 'A key.' });
    adjustRenown(ctx.db, campaignId, 'FAC-901', 2, 'Carried a letter');
    const r = adjustRenown(ctx.db, campaignId, 'FAC-901', 1, 'Kept a secret');
    expect(r).toMatchObject({ renown: 3, rank: 'Initiate' });
    expect(r.log.map((l) => l.reason)).toEqual(['Kept a secret', 'Carried a letter']);
    const undone = undoRenown(ctx.db, campaignId, r.log[0].id);
    expect(undone).toMatchObject({ renown: 2, rank: 'Neutral' });
    expect(() => adjustRenown(ctx.db, campaignId, 'FAC-901', 0)).toThrow();
  });

  it('writes changes into the live session log', () => {
    const { ctx, campaignId } = setup();
    const s = sessions.create(ctx.db, { campaign_id: campaignId, number: 1, title: 'One' }) as { id: number };
    sessions.update(ctx.db, s.id, { status: 'live' });
    adjustRenown(ctx.db, campaignId, 'FAC-901', 3, 'Saved a knight');
    expect(ctx.db.prepare('SELECT kind, text FROM session_log WHERE session_id = ?').all(s.id)).toEqual([
      { kind: 'standing', text: 'Standing with The Test Order: +3 (Saved a knight). Now Initiate.' },
    ]);
  });

  it('shows players only revealed, shared, non-neutral standing, with no reasons or notes', () => {
    const { ctx, campaignId } = setup();
    adjustRenown(ctx.db, campaignId, 'FAC-901', 12, 'A secret reason');
    adjustRenown(ctx.db, campaignId, 'FAC-902', 5, 'Helped the ring');
    setStandingOptions(ctx.db, campaignId, 'FAC-901', { notes: 'GM only note' });
    const seen = playerStanding(ctx.db, campaignId);
    expect(seen.map((f) => f.faction_id)).toEqual(['FAC-901']); // the Secret Ring isn't revealed
    expect(seen[0].earned).toEqual([
      { rank: 'Initiate', text: 'A badge.' },
      { rank: 'Trusted', text: 'A key.' },
    ]);
    const json = JSON.stringify(playerCampaign(ctx.db, campaignId));
    expect(json).not.toContain('A secret reason');
    expect(json).not.toContain('GM only note');
    expect(json).not.toContain('Secret Ring');
    setStandingOptions(ctx.db, campaignId, 'FAC-901', { player_visible: false });
    expect(playerStanding(ctx.db, campaignId)).toEqual([]);
  });
});
