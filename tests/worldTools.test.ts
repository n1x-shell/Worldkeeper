/** The calendar, region state, the party export and the consistency checker. Records are SYNTHETIC TEST DATA. */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { campaigns, sessions, setActiveCampaign } from '../server/src/repo/campaigns';
import { YEAR_DAYS, addDays, dayOfYear, formatDate, moonPhase, MOONS, parseDate } from '../shared/calendar';
import { calendarEvents, comingUp, setCampaignDate } from '../server/src/repo/calendar';
import { travel } from '../server/src/repo/exploration';
import { maps, markers } from '../server/src/repo/maps';
import { updateEntity } from '../server/src/repo/entities';
import { playerRegions, regionState } from '../server/src/repo/regionState';
import { partyExport } from '../server/src/player/partyExport';
import { consistencyReport } from '../server/src/repo/consistency';

const rec = (id: string, name: string, category: string, parent = 'None', extra = ''): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: ${parent}\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA record.${extra}\n`,
});

describe('calendar', () => {
  it('turns every day of the year into a date and back', () => {
    for (let d = 1; d <= YEAR_DAYS; d++) expect(parseDate(formatDate({ year: 300, day: d }))).toEqual({ year: 300, day: d });
    expect(formatDate({ year: 300, day: 333 })).toBe('Evernight Festival, 300 AB (Year 31 Unbound)');
    expect(parseDate("Winter's Dusk 4, Year 31 Unbound")).toEqual({ year: 300, day: dayOfYear(11, 4) });
    expect(addDays({ year: 300, day: 363 }, 1)).toEqual({ year: 301, day: 1 });
    expect(moonPhase({ year: 1, day: 1 }, MOONS[0]).dark).toBe(true);
  });

  it('moves the campaign date, logs it in play, and shows festivals and shared events coming', () => {
    const { db } = tempContext();
    const c = campaigns.create(db, { title: 'Test', current_date: 'Old Winds 25, 300 AB' }) as { id: number };
    const s = sessions.create(db, { campaign_id: c.id, number: 1, title: 'One' }) as { id: number };
    sessions.update(db, s.id, { status: 'live' });
    calendarEvents.create(db, { campaign_id: c.id, year: 300, day: dayOfYear(8, 28), title: 'Secret meeting', player_visible: false });
    calendarEvents.create(db, { campaign_id: c.id, day: dayOfYear(8, 27), title: 'Market day', yearly: true, player_visible: true });
    const gm = comingUp(db, c.id, 10).map((x) => x.title);
    expect(gm).toEqual(['Market day', 'Secret meeting', 'Masking Night']);
    expect(comingUp(db, c.id, 10, true).map((x) => x.title)).toEqual(['Market day', 'Masking Night']);
    expect(setCampaignDate(db, c.id, { days: 7, reason: 'travel' }).text).toBe('Snowfall 2, 300 AB (Year 31 Unbound)');
    expect((db.prepare('SELECT text FROM session_log WHERE session_id = ?').get(s.id) as { text: string }).text).toMatch(/^7 days pass \(travel\)\. It is now Snowfall 2/);
  });
});

describe('the world as the campaign has left it', () => {
  function setup() {
    const ctx = tempContext();
    const files = [
      rec('REG-001', 'Test Marches', 'Region'),
      rec('SET-801', 'Test Town', 'Settlement', 'Test Marches [REG-001]'),
      rec('LOC-801', 'Hidden Vault', 'Landmark', 'Test Marches [REG-001]'),
      rec('NPC-801', 'Ghost', 'NPC', 'None', ' Cites [LOC-999].'),
    ];
    commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
    ctx.db.prepare(`UPDATE entities SET parent_id = 'REG-001' WHERE id IN ('SET-801','LOC-801')`).run();
    for (const id of ['REG-001', 'SET-801']) updateEntity(ctx.db, id, { revealed: true, player_summary: 'Known.', revealed_sections: [], reason: 'test' });
    const map = maps.create(ctx.db, { name: 'World', kind: 'image', width: 100, height: 100, player_visible: true }) as { id: number };
    markers.create(ctx.db, { map_id: map.id, entity_id: 'SET-801', label: 'Test Town', x: 1, y: 1, hidden: false });
    markers.create(ctx.db, { map_id: map.id, entity_id: 'LOC-801', label: 'Hidden Vault', x: 2, y: 2, hidden: true });
    const c = campaigns.create(ctx.db, { title: 'Test' }) as { id: number };
    setActiveCampaign(ctx.db, c.id);
    travel(ctx.db, c.id, map.id, { entity_id: 'SET-801' });
    travel(ctx.db, c.id, map.id, { entity_id: 'LOC-801' });
    return { ctx, campaignId: c.id };
  }

  it('gives the GM the whole region, and players only what they know', () => {
    const { ctx, campaignId } = setup();
    const gm = regionState(ctx.db, campaignId, 'REG-001');
    expect(gm.discovered.map((d) => d.id).sort()).toEqual(['LOC-801', 'SET-801']);
    const p = playerRegions(ctx.db, campaignId);
    expect(p).toHaveLength(1);
    expect(p[0].discovered).toEqual(['Test Town']);
    expect(p[0].lastVisit!.place).toBeNull(); // the last stop was the unrevealed vault
    expect(JSON.stringify(p)).not.toContain('Hidden Vault');
  });

  it('exports what the party knows without anything the players do not', () => {
    const { ctx, campaignId } = setup();
    const x = partyExport(ctx.db, campaignId);
    expect(x.markdown).toContain('## Places discovered');
    expect(x.markdown).toContain('Test Town');
    expect(x.markdown).not.toContain('Hidden Vault');
  });

  it('reports a record citing a record that does not exist', () => {
    const { ctx } = setup();
    const r = consistencyReport(ctx.db);
    expect(r.problems.some((p) => p.check === 'Missing records cited' && p.ids[0] === 'NPC-801')).toBe(true);
  });
});
