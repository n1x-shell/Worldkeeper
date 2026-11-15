/** Treasure: the roller follows the tier and region, the world's own items turn up where they belong, and the party log. */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { campaigns, sessions } from '../server/src/repo/campaigns';
import { addRollToParty, catalogueFor, itemTables, partyTreasure, playerTreasure, rollTreasure, treasureData } from '../server/src/repo/treasure';

/** A seeded random number generator, so rolls repeat. */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

describe('treasure', () => {
  const data = treasureData();

  it('has a catalogue entry for every setting item and artifact, each pointing at a real pool', () => {
    expect(Object.keys(data.catalogue.items)).toHaveLength(34);
    expect(Object.keys(data.catalogue.artifacts)).toHaveLength(20);
    for (const [id, it] of Object.entries(data.catalogue.items)) for (const p of it.pools) expect(data.pools[p], `${id} pool ${p}`).toBeTruthy();
    for (const a of Object.values(data.catalogue.artifacts)) expect(a.leads.length).toBeGreaterThanOrEqual(2);
    expect(catalogueFor('ART-004')).toMatchObject({ kind: 'artifact', place: 'LOC-005' });
    expect(catalogueFor('NPC-001')).toBeNull();
  });

  it('rolls individual treasure as coin only, and hoards with goods, items and a hook', () => {
    const one = rollTreasure({ tier: '1-4', region: 'marches', kind: 'individual', rng: seeded(1) });
    expect(one.items).toEqual([]);
    expect(one.coins.amount).toBeGreaterThanOrEqual(3);
    expect(one.coins.amount).toBeLessThanOrEqual(18);
    let items = 0;
    let own = 0;
    for (let s = 1; s <= 200; s++) {
      const h = rollTreasure({ tier: '5-10', region: 'kaelmar-west', kind: 'hoard', rng: seeded(s) });
      expect(h.hook).toBeTruthy();
      expect(h.items.length).toBeLessThanOrEqual(2);
      items += h.items.length;
      own += h.items.filter((i) => i.entity_id).length;
      // Barter country: most of the worth is in goods.
      for (const i of h.items) if (i.entity_id) expect(data.catalogue.items[i.entity_id].pools).toContain('kaelmar-west');
    }
    expect(items).toBeGreaterThan(150);
    expect(own).toBeGreaterThan(20);
    // Artifacts never come up.
    for (let s = 1; s <= 200; s++) for (const i of rollTreasure({ tier: '17-20', region: 'ethereal', kind: 'hoard', rng: seeded(s) }).items) expect(i.entity_id ?? '').not.toMatch(/^ART-/);
    expect(rollTreasure({ tier: '11-16', region: 'ethereal', kind: 'hoard', rng: seeded(3) }).fades).toBe(true);
  });

  it('builds magic item tables by region and rarity', () => {
    const t = itemTables(data);
    expect(t.find((x) => x.name === 'Treasure: uncommon magic items, The Hollow Marches')!.entries).toContain("[ITM-003] (the world's own)");
  });

  it('logs found treasure to the party and the live session, and shows players only what they should see', () => {
    const { db } = tempContext();
    const c = campaigns.create(db, { title: 'Test' }) as { id: number };
    const s = sessions.create(db, { campaign_id: c.id, number: 1, title: 'One' }) as { id: number };
    sessions.update(db, s.id, { status: 'live' });
    const roll = rollTreasure({ tier: '1-4', region: 'marches', kind: 'hoard', rng: seeded(7) });
    roll.items = [{ name: 'ITM-003', rarity: 'uncommon', entity_id: 'ITM-003', fades: false }];
    addRollToParty(db, c.id, roll, 'the Old Wall');
    const rows = partyTreasure.list(db, { campaign_id: c.id }) as { id: number; kind: string; name: string }[];
    expect(rows.some((r) => r.kind === 'coins')).toBe(true);
    expect(rows.some((r) => r.kind === 'item' && r.name === 'ITM-003')).toBe(true); // no such record in this library: the id stands in
    const log = db.prepare('SELECT kind, text FROM session_log WHERE session_id = ?').all(s.id) as { kind: string; text: string }[];
    expect(log[0].kind).toBe('treasure');
    expect(log[0].text).toMatch(/^Treasure found at the Old Wall: /);
    const item = rows.find((r) => r.kind === 'item')!;
    expect(playerTreasure(db, c.id).find((r) => r.id === item.id)!.entity_id).toBeNull(); // not a revealed record
    partyTreasure.update(db, item.id, { player_visible: false });
    expect(playerTreasure(db, c.id).some((r) => r.id === item.id)).toBe(false);
  });
});
