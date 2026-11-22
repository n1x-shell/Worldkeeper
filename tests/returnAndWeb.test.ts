/** The Return clock shows players only omens, and the faction web shows them only public and revealed ties. */
import { setLibraryModules } from '../server/src/repo/modules.js';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { campaigns } from '../server/src/repo/campaigns';
import { returnClock, setReturnStage } from '../server/src/repo/returnClock';
import { factionWeb, playerFactionWeb, revealTie } from '../server/src/repo/factionWeb';
import { updateEntity } from '../server/src/repo/entities';
import { playerCampaign } from '../server/src/player/projection';

const fac = (id: string, name: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: Faction\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA faction.\n`,
});

describe('the Return', () => {
  it('moves by hand, jumps to stage 6 when an Orb forms, and gives players only omens', () => {
    const { db } = tempContext();
    const c = campaigns.create(db, { title: 'T' }) as { id: number };
    setLibraryModules(db, { 'the-return': true });
    expect(playerCampaign(db, c.id)!.omens).toEqual([]);
    setReturnStage(db, c.id, { stage: 2 });
    expect(playerCampaign(db, c.id)!.omens).toHaveLength(2);
    // Switched off, players see no omens (the clock is kept).
    setLibraryModules(db, { 'the-return': false });
    expect(playerCampaign(db, c.id)!.omens).toEqual([]);
    setLibraryModules(db, { 'the-return': true });
    expect(JSON.stringify(playerCampaign(db, c.id))).not.toMatch(/stage|Guest|teacher/i);
    expect(() => setReturnStage(db, c.id, { stage: 1 })).toThrow();
    setReturnStage(db, c.id, { orb: true });
    expect(returnClock(db, c.id).stage).toBe(6);
    expect(returnClock(db, c.id).log[0].reason).toContain('Orb');
  });
});

describe('the faction web', () => {
  it('shows public rivalries at once, secret alliances only once revealed, and nothing about hidden factions', () => {
    const ctx = tempContext();
    const files = [fac('FAC-901', 'The Gold Order'), fac('FAC-902', 'The Red Host'), fac('FAC-903', 'The Grey Hand'), fac('FAC-904', 'The Unseen')];
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    for (const id of ['FAC-901', 'FAC-902', 'FAC-903']) updateEntity(ctx.db, id, { revealed: true });
    updateEntity(ctx.db, 'FAC-901', { player_summary: '**Who opposes them.** The Red Host, across the river.' });
    const link = ctx.db.prepare(`INSERT INTO relationships (source_id, target_id, type, origin) VALUES (?, ?, ?, 'user')`);
    link.run('FAC-901', 'FAC-902', 'opposes');
    link.run('FAC-902', 'FAC-903', 'allied_with');
    link.run('FAC-903', 'FAC-904', 'allied_with');
    const c = campaigns.create(ctx.db, { title: 'T' }) as { id: number };
    expect(factionWeb(ctx.db, c.id).ties).toHaveLength(3);
    expect(playerFactionWeb(ctx.db, c.id).map((t) => `${t.a}-${t.b}-${t.kind}`)).toEqual(['FAC-901-FAC-902-opposed']);
    revealTie(ctx.db, c.id, 'FAC-903', 'FAC-902', true);
    revealTie(ctx.db, c.id, 'FAC-903', 'FAC-904', true);
    expect(playerFactionWeb(ctx.db, c.id).map((t) => `${t.a}-${t.b}`)).toEqual(['FAC-901-FAC-902', 'FAC-902-FAC-903']);
  });
});
