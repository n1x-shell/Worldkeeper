/** Features read a record's structured facts (its template's) before its prose (docs/OWN_WORLD_PLAN.md §2.10). */
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers.js';
import { createEntity, updateEntity } from '../server/src/repo/entities.js';
import { createRealm } from '../server/src/repo/realms.js';
import { campaigns } from '../server/src/repo/campaigns.js';
import { regionState } from '../server/src/repo/regionState.js';
import { makeNames, namePeoples } from '../server/src/repo/names.js';
import { playerEntity } from '../server/src/player/projection.js';

const rec = (name: string, type: string, realm: string, fields: [string, string][] = [], body = '## Overview\nText.') =>
  ({ name, type, realm, canon_status: 'CANON', aliases: [], tags: [], fields, body, notes: '' }) as never;

describe('structured facts', () => {
  it('a region names its ruling faction', () => {
    const { db } = tempContext();
    const guild = createEntity(db, rec('The Salt Guild', 'faction', 'world'));
    const region = createEntity(db, rec('The Salt Flats', 'region', 'world', [['Ruling faction', `The Salt Guild [${guild.id}]`]]));
    const c = campaigns.create(db, { title: 'Test' } as never) as { id: number };
    expect(regionState(db, c.id, region.id).holder).toMatchObject({ id: guild.id, name: 'The Salt Guild' });
    // By name, too.
    const marsh = createEntity(db, rec('The Marsh', 'region', 'world', [['Ruling faction', 'The Salt Guild']]));
    expect(regionState(db, c.id, marsh.id).holder?.id).toBe(guild.id);
  });

  it("a people's common names seed the name generator", () => {
    const { db } = tempContext();
    const p = createEntity(db, rec('Fenfolk', 'people', 'world', [['Common names', 'Aldo, Brisk, Corra, Dunn, Elsie']]));
    expect(namePeoples(db).find((x) => x.id === p.id)?.seeds).toBe(5);
    expect(makeNames(db, p.id, 6, 1).names.length).toBe(6);
  });

  it("a people's Found in fact says which continents the handbook lists it under, ahead of its prose", () => {
    const { db } = tempContext();
    createRealm(db, { name: 'Ostmark', kind: 'continent', parent_id: 'world' });
    createRealm(db, { name: 'Westreach', kind: 'continent', parent_id: 'world' });
    // Something revealed in each, so both are known to players.
    createEntity(db, rec('Grimhold', 'settlement', 'ostmark'));
    createEntity(db, rec('Saltmere', 'settlement', 'westreach'));
    const p = createEntity(db, rec('Fenfolk', 'people', 'world', [['Found in', 'Westreach']], '## Overview\nFound all over Ostmark and Westreach.'));
    db.prepare('UPDATE entities SET revealed = 1').run();
    updateEntity(db, p.id, { player_summary: 'Marsh people of Ostmark and Westreach.' } as never);
    const realms = playerEntity(db, p.id)!.realms;
    expect(realms).toContain('westreach');
    expect(realms).not.toContain('ostmark');
    // The fact itself never reaches players.
    expect(JSON.stringify(playerEntity(db, p.id))).not.toMatch(/Found in/);
  });
});
