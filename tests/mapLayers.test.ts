/**
 * The campaign on the map: quests, adventure places, people and encounters at the pin of their place (or the
 * nearest place above it with a pin), and the region panel. The records below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { adventures, campaigns, encounters, quests, randomTables, scenes } from '../server/src/repo/campaigns';
import { maps, markers } from '../server/src/repo/maps';
import { createRelationship } from '../server/src/repo/relationships';
import { campaignLayers, regionPanel } from '../server/src/repo/mapLayers';

const rec = (id: string, name: string, category: string, parent = 'None'): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: ${parent}\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nText.\n`,
});

function setup() {
  const ctx = tempContext();
  const files = [
    rec('REG-001', 'Test Marches', 'Region'),
    rec('SET-001', 'Test Town', 'Settlement', 'Test Marches [REG-001]'),
    rec('LOC-001', 'The Inn', 'Building', 'Test Town [SET-001]'),
    rec('SET-002', 'Far Keep', 'Settlement'),
    rec('NPC-001', 'The Innkeeper', 'NPC'),
  ];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  const map = maps.create(ctx.db, { name: 'World', width: 1000, height: 800 }) as { id: number };
  markers.create(ctx.db, { map_id: map.id, entity_id: 'SET-001', label: 'Test Town', x: 100, y: 200 });
  markers.create(ctx.db, { map_id: map.id, entity_id: 'REG-001', label: 'Test Marches', x: 50, y: 50 });
  const c = campaigns.create(ctx.db, { title: 'Test' }) as { id: number };
  return { ctx, db: ctx.db, mapId: map.id, cid: c.id };
}

describe('campaign layers', () => {
  it('draws quests, adventure places, people and encounters at the nearest pinned place', () => {
    const { db, mapId, cid } = setup();
    quests.create(db, { campaign_id: cid, title: 'Find the inn', status: 'open', location_id: 'LOC-001' });
    quests.create(db, { campaign_id: cid, title: 'Done already', status: 'completed', location_id: 'SET-001' });
    quests.create(db, { campaign_id: cid, title: 'Not on this map', status: 'open', location_id: 'SET-002' });
    const a = adventures.create(db, { campaign_id: cid, title: 'The Inn Job', status: 'ready', linked_ids: ['NPC-001'] }) as { id: number };
    scenes.create(db, { adventure_id: a.id, title: 'At the inn', linked_ids: ['LOC-001'] });
    adventures.create(db, { campaign_id: cid, title: 'Finished', status: 'completed', linked_ids: ['SET-001'] });
    createRelationship(db, { source_id: 'NPC-001', target_id: 'LOC-001', type: 'lives_in' });
    encounters.create(db, { campaign_id: cid, title: 'Bar fight', location_id: 'SET-001' });
    encounters.create(db, { campaign_id: cid, title: 'Somewhere', location_id: null });

    const spots = campaignLayers(db, cid, mapId);
    const at = (layer: string) => spots.filter((s) => s.layer === layer);
    expect(at('quests')).toHaveLength(1);
    expect(at('quests')[0]).toMatchObject({ entity_id: 'SET-001', x: 100, y: 200 });
    expect(at('quests')[0].items.map((i) => i.label)).toEqual(['Find the inn']);
    expect(at('adventures').map((s) => [s.entity_id, s.items.map((i) => i.label)])).toEqual([['SET-001', ['The Inn Job']]]);
    expect(at('people')[0]).toMatchObject({ entity_id: 'SET-001' });
    expect(at('people')[0].items).toEqual([expect.objectContaining({ id: 'NPC-001', label: 'The Innkeeper', href: '/e/NPC-001' })]);
    expect(at('encounters')[0].items.map((i) => i.label)).toEqual(['Bar fight']);
  });

  it('keeps an encounter place through a campaign export field', () => {
    const { db, cid } = setup();
    const e = encounters.create(db, { campaign_id: cid, title: 'Ambush', location_id: 'SET-001' }) as { location_id: string };
    expect(e.location_id).toBe('SET-001');
  });
});

describe('region panel', () => {
  it("lists the region's places, its encounter tables and its campaign state", () => {
    const { db, cid } = setup();
    randomTables.create(db, { name: 'Encounters: Test Marches', die: 'd2', entries: [{ weight: 1, text: 'A' }], source: 'Worldkeeper additions (REG-001)' });
    randomTables.create(db, { name: 'Elsewhere', die: 'd2', entries: [{ weight: 1, text: 'B' }], source: 'Worldkeeper additions (REG-002)' });
    const p = regionPanel(db, 'REG-001', cid);
    expect(p.region.name).toBe('Test Marches');
    expect(p.places.map((x) => x.id)).toEqual(['SET-001', 'LOC-001']);
    expect(p.tables.map((t) => t.name)).toEqual(['Encounters: Test Marches']);
    expect(p.state?.region.id).toBe('REG-001');
    expect(regionPanel(db, 'REG-001', null).state).toBeNull();
  });
});
