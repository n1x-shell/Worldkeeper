/** Rules for any world (docs/OWN_WORLD_PLAN.md §2.9): a region of the GM's own gets encounters and treasure from the SRD alone. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { createEntity } from '../server/src/repo/entities.js';
import { encounterTableFor, generateEncounterTable, tablesFor } from '../server/src/repo/tables.js';
import { placeProfile } from '../server/src/repo/places.js';

const place = (id: string, name: string, type: string, fields: [string, string][], parent_id?: string) =>
  createEntity(tempDb!, { id, name, type, realm: 'world', parent_id, canon_status: 'CANON', aliases: [], tags: [], fields, body: 'x', notes: '' } as never);
let tempDb: ReturnType<typeof tempContext>['db'] | null = null;

describe('rules for any world', () => {
  it('builds an encounter table for a region of the GM’s own from the SRD, and keeps hand-made tables first', async () => {
    const ctx = tempContext();
    tempDb = ctx.db;
    place('REG-0001', 'The Greenwood', 'region', [
      ['Terrain', 'Old forest and hills'],
      ['Danger', 'Deadly'],
      ['Wealth', 'Poor'],
    ]);
    place('SET-0001', 'Ashford', 'settlement', [], 'REG-0001');
    expect(placeProfile(ctx.db, 'SET-0001')).toMatchObject({ terrain: ['forest', 'hill'], danger: 'deadly', wealth: 'poor', from: { terrain: 'REG-0001' } });
    const t = generateEncounterTable(ctx.db, 'REG-0001', 3, () => 0.3);
    expect(t.name).toBe('Encounters: The Greenwood, levels 1 to 4');
    expect(t.entries.length).toBeGreaterThan(3);
    expect(t.entries[0].text).toMatch(/^\*\*Fight\.\*\* .+ \((low|moderate|high), [\d,]+ XP\)\.$/);
    // Regenerating replaces it; a copy is the GM's own and comes first.
    expect(generateEncounterTable(ctx.db, 'REG-0001', 2).id).toBe(t.id);
    const gm = createApp(ctx);
    const copy = (await request(gm).post(`/api/random-tables/${t.id}/copy`)).body;
    expect(copy).toMatchObject({ name: 'Encounters: The Greenwood, levels 1 to 4 (your copy)', auto: false, region_id: 'REG-0001', level_min: 1, level_max: 4 });
    expect(encounterTableFor(ctx.db, 'REG-0001', 2)!.id).toBe(copy.id);
    expect(tablesFor(ctx.db, 'REG-0001').map((x) => x.auto)).toEqual([0, 1]);
    // A region with no table yet gets one generated when the party travels and rolls.
    place('REG-0002', 'The Saltmarsh', 'region', [['Terrain', 'Salt marsh and coast']]);
    expect(encounterTableFor(ctx.db, 'REG-0002', 7)).toBeNull();
    expect(encounterTableFor(ctx.db, 'REG-0002', 7, { generate: true })!.name).toBe('Encounters: The Saltmarsh, levels 5 to 10');
    // The region panel lists its tables.
    expect((await request(gm).get('/api/regions/REG-0001/panel')).body.profile).toMatchObject({ terrain: ['forest', 'hill'], danger: 'deadly' });
  });
});

describe('treasure for any place', () => {
  it('rolls from the SRD at a place of the GM’s own, scaled by its wealth', async () => {
    const ctx = tempContext();
    tempDb = ctx.db;
    place('REG-0001', 'The Goldfields', 'region', [['Wealth', 'Rich']]);
    place('REG-0002', 'The Mire', 'region', [['Wealth', 'Poor']]);
    const gm = createApp(ctx);
    const opts = (await request(gm).get('/api/treasure/options')).body;
    expect(opts.tiers.map((t: { key: string }) => t.key)).toEqual(['1-4', '5-10', '11-16', '17-20']);
    expect(opts.places).toEqual([
      { id: 'REG-0001', label: 'The Goldfields', wealth: 'rich' },
      { id: 'REG-0002', label: 'The Mire', wealth: 'poor' },
    ]);
    const total = async (p: string) => {
      let n = 0;
      for (let i = 0; i < 30; i++) {
        const r = (await request(gm).post('/api/treasure/roll').send({ tier: '5-10', place: p, kind: 'hoard' })).body;
        expect(r.region_label).toBe(p === 'REG-0001' ? 'The Goldfields' : 'The Mire');
        n += r.coins.amount;
      }
      return n;
    };
    expect(await total('REG-0001')).toBeGreaterThan((await total('REG-0002')) * 2);
  });
});
