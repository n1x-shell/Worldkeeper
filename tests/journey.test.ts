/**
 * Travel tools: distances from a map's scale, days on the road by the 2024 paces, and "travel to here" moving the
 * calendar on and rolling the region's encounters. The records below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { campaigns, characters, randomTables } from '../server/src/repo/campaigns';
import { maps, markers, shapes } from '../server/src/repo/maps';
import { campaignDate } from '../server/src/repo/calendar';
import { encounterTableFor, journey, partyLevel, regionAt } from '../server/src/repo/journey';
import { formatMiles, milesBetween, niceMiles, pathMiles, travelDays } from '../shared/travel';

const rec = (id: string, name: string, category: string, parent = 'None'): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: ${parent}\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nText.\n`,
});

describe('travel rules', () => {
  const map = { width: 1000, scale_miles: 100 };
  it('measures miles from the scale, and none without one', () => {
    expect(milesBetween({ x: 0, y: 0 }, { x: 300, y: 400 }, map)).toBe(50);
    expect(milesBetween({ x: 0, y: 0 }, { x: 300, y: 400 }, { width: 1000, scale_miles: null })).toBeNull();
    expect(
      pathMiles(
        [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
        map,
      ),
    ).toBe(20);
  });
  it('counts days by the 2024 paces, a part day as a day', () => {
    expect([travelDays(48, 'slow'), travelDays(48, 'normal'), travelDays(48, 'fast')]).toEqual([3, 2, 2]);
    expect(travelDays(0, 'normal')).toBe(0);
    expect(travelDays(25, 'normal')).toBe(2);
  });
  it('formats miles and picks round scale bars', () => {
    expect(formatMiles(4.26)).toBe('4.3 miles');
    expect(formatMiles(42.4)).toBe('42 miles');
    expect(formatMiles(1234)).toBe('about 1,230 miles');
    expect([niceMiles(7), niceMiles(40), niceMiles(130)]).toEqual([5, 50, 100]);
  });
});

function setup() {
  const ctx = tempContext();
  const files = [rec('REG-001', 'Test Marches', 'Region'), rec('SET-001', 'Start Town', 'Settlement', 'Test Marches [REG-001]'), rec('SET-002', 'Far Town', 'Settlement', 'Test Marches [REG-001]')];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  const map = maps.create(ctx.db, { name: 'World', width: 1000, height: 800, scale_miles: 100 }) as { id: number };
  markers.create(ctx.db, { map_id: map.id, entity_id: 'SET-001', label: 'Start Town', x: 100, y: 100 });
  markers.create(ctx.db, { map_id: map.id, entity_id: 'SET-002', label: 'Far Town', x: 580, y: 100 });
  shapes.create(ctx.db, {
    map_id: map.id,
    kind: 'region',
    label: 'Test Marches',
    entity_id: 'REG-001',
    points: [
      [0, 0],
      [700, 0],
      [700, 400],
      [0, 400],
    ],
  });
  const c = campaigns.create(ctx.db, { title: 'Test', current_date: 'Spring Dawn 1, 300 AB (Year 31 Unbound)' }) as { id: number };
  randomTables.create(ctx.db, { name: 'Encounters: Test Marches, levels 1 to 4', die: 'd2', entries: [{ weight: 1, text: 'Wolves' }], source: 'Worldkeeper additions (REG-001)' });
  randomTables.create(ctx.db, { name: 'Encounters: Test Marches, levels 5 to 10', die: 'd2', entries: [{ weight: 1, text: 'A dragon' }], source: 'Worldkeeper additions (REG-001)' });
  return { db: ctx.db, mapId: map.id, cid: c.id };
}

describe('travel to here', () => {
  it('finds the region of a place or a point, and the table for the party level', () => {
    const { db, mapId, cid } = setup();
    expect(regionAt(db, mapId, { entity_id: 'SET-001', x: 0, y: 0 })).toBe('REG-001');
    expect(regionAt(db, mapId, { x: 50, y: 50 })).toBe('REG-001');
    expect(regionAt(db, mapId, { x: 900, y: 700 })).toBeNull();
    expect(partyLevel(db, cid)).toBe(1);
    characters.create(db, { campaign_id: cid, name: 'A', level: 6 });
    characters.create(db, { campaign_id: cid, name: 'B', level: 6 });
    expect(encounterTableFor(db, 'REG-001', partyLevel(db, cid))?.name).toContain('levels 5 to 10');
  });

  it('moves the party, the calendar and rolls a day at a time', () => {
    const { db, mapId, cid } = setup();
    const first = journey(db, { campaign_id: cid, map_id: mapId, to: { entity_id: 'SET-001' }, advance: true, roll: true });
    expect(first.miles).toBeNull(); // nowhere to come from yet
    expect(first.days).toBe(0);
    const before = campaignDate(db, cid).day;
    const r = journey(db, { campaign_id: cid, map_id: mapId, to: { entity_id: 'SET-002' }, pace: 'slow', advance: true, roll: true }, () => 0);
    expect(r.miles).toBeCloseTo(48);
    expect(r.days).toBe(3);
    expect(campaignDate(db, cid).day).toBe(before + 3);
    expect(r.rolls.map((x) => x.result)).toEqual(['Wolves', 'Wolves', 'Wolves']);
    expect(r.region?.name).toBe('Test Marches');
    expect(r.exploration.trail.at(-1)?.entity_id).toBe('SET-002');
  });

  it('leaves the calendar and the dice alone unless asked, and takes the GM’s own number of days', () => {
    const { db, mapId, cid } = setup();
    journey(db, { campaign_id: cid, map_id: mapId, to: { entity_id: 'SET-001' } });
    const before = campaignDate(db, cid).day;
    const r = journey(db, { campaign_id: cid, map_id: mapId, to: { x: 300, y: 300, label: 'Camp' }, days: 5 });
    expect(r.days).toBe(5);
    expect(r.rolls).toEqual([]);
    expect(campaignDate(db, cid).day).toBe(before);
  });
});
