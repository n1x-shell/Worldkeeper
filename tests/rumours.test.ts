/**
 * Rumours from handbook text. The records and text below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import { createRumour, extractRumours, listRumours, setHeard, syncRumours, updateRumour } from '../server/src/repo/rumours';
import { createApp } from '../server/src/app';
import { AppContext } from '../server/src/context';
import { playerSnapshot } from '../server/src/player/projection';
import type { SourceFile } from '../server/src/import/scan';

const rec = (id: string, name: string, category: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA record.\n`,
});
const files = [rec('SET-001', 'Test Town', 'Settlement'), rec('NPC-001', 'Mira Quill', 'NPC'), rec('FAC-001', 'Test Order', 'Faction'), rec('FAC-002', 'Test Town', 'Faction')];

const text = (extra = '') => `# Book

## How to use this

Not a record.

## Test Town (Settlement)

*A town.*

**What you know**

- It is a town.

**What people say**

- Mira Quill runs the market, and the Test Order watches her.
- The well is haunted.${extra}

## Mira Quill

**What people say**

- She owes @[Test Order|FAC-001] a favour.
`;

function setup() {
  const ctx = tempContext();
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  return ctx;
}

describe('rumours', () => {
  it('finds the "What people say" bullets under each record\'s section, and only those', () => {
    const ctx = setup();
    const found = extractRumours(ctx.db, text());
    expect(found.map((r) => `${r.sourceId}: ${r.text}`)).toEqual([
      'SET-001: Mira Quill runs the market, and the Test Order watches her.',
      'SET-001: The well is haunted.',
      'NPC-001: She owes @[Test Order|FAC-001] a favour.',
    ]);
  });

  it('links each rumour to its page and the records it names or links', () => {
    const ctx = setup();
    syncRumours(ctx.db, [{ path: 'a.md', content: text() }]);
    const market = listRumours(ctx.db).find((r) => r.text.startsWith('Mira Quill'))!;
    expect(market.about).toEqual(expect.arrayContaining(['SET-001', 'NPC-001', 'FAC-001']));
    expect(listRumours(ctx.db, { entityId: 'FAC-001' }).length).toBe(2);
  });

  it('keeps truth, notes and heard ticks when the handbook is synced again, and marks gone rumours stale', () => {
    const ctx = setup();
    syncRumours(ctx.db, [{ path: 'a.md', content: text() }]);
    const well = listRumours(ctx.db).find((r) => r.text === 'The well is haunted.')!;
    updateRumour(ctx.db, well.id, { truth: 'false', gm_note: 'It is a smuggler.' });
    setHeard(ctx.db, well.id, 7, true);
    const again = syncRumours(ctx.db, [{ path: 'a.md', content: text('\n- A new rumour.') }]);
    expect(again.added).toBe(1);
    const kept = listRumours(ctx.db, { campaignId: 7 }).find((r) => r.id === well.id)!;
    expect(kept).toMatchObject({ truth: 'false', gm_note: 'It is a smuggler.', heard: true, stale: false });
    expect(listRumours(ctx.db, { campaignId: 8 }).find((r) => r.id === well.id)!.heard).toBe(false); // per campaign

    // The well rumour leaves the text: kept but stale, because the GM marked it. Unmarked ones just go.
    syncRumours(ctx.db, [{ path: 'a.md', content: text().replace('- The well is haunted.', '') }]);
    expect(listRumours(ctx.db).find((r) => r.id === well.id)!.stale).toBe(true);
    expect(listRumours(ctx.db).some((r) => r.text === 'A new rumour.')).toBe(false);
  });

  it('lets the GM add their own rumours, but not rewrite the handbook\'s', () => {
    const ctx = setup();
    syncRumours(ctx.db, [{ path: 'a.md', content: text() }]);
    const mine = createRumour(ctx.db, { text: 'The mayor is two people.', source_id: 'SET-001', about: ['SET-001'] });
    expect(mine.origin).toBe('user');
    const hb = listRumours(ctx.db).find((r) => r.origin === 'handbook')!;
    expect(() => updateRumour(ctx.db, hb.id, { text: 'changed' })).toThrow(/handbook/);
  });

  it('never reaches player data', async () => {
    const ctx = setup();
    syncRumours(ctx.db, [{ path: 'a.md', content: text() }]);
    const id = listRumours(ctx.db)[0].id;
    updateRumour(ctx.db, id, { truth: 'true', gm_note: 'SECRET-NOTE-123' });
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('SECRET-NOTE-123');
    ctx.db.close();
    const app = createApp(new AppContext(ctx.paths, 'player'));
    expect((await request(app).get('/api/player/rumours')).status).toBe(404);
    expect((await request(app).get('/api/rumours')).status).toBe(404);
  });
});
