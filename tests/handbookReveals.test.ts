/** Matching the published Player Handbook's reveals, and opening links from the desktop app. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext, tempDir } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { getEntity, updateEntity } from '../server/src/repo/entities';
import { handbookReveals, safeSections } from '../server/src/player/handbookReveals';
import { createApp } from '../server/src/app';
import { openInBrowser } from '../server/src/lib/desktop';

const rec = (id: string, name: string, tags: string, body: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: Settlement\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, ${tags}\n\n# ${name}\n\n${body}\n`,
});
const BODY = `## Overview\nA quiet town.\n\n## Use in Play\nTable advice.\n\n## Secrets\nThe mayor is a spy.\n\n## Old Stones\nThe Seed Vault lies beneath.\n\n## Markets\nFish and salt.`;

function library() {
  const ctx = tempContext();
  const files = [rec('SET-901', 'Tollbridge', 'vis/player', BODY), rec('SET-902', 'Gloam', 'vis/gm', BODY), rec('SET-903', 'Reedmarch', 'vis/player', BODY)];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  const textDir = tempDir('wk-text-');
  fs.writeFileSync(path.join(textDir, 'towns.md'), '# Towns\n\n## Gloam\nA town of lamps.\n\n## Reedmarch\nReeds and herons.\n\n## Nowhere\nNo such place.\n');
  return { ctx, textDir };
}

describe('matching the published handbook', () => {
  it('reveals player-tagged records with only their safe sections, and the player text', () => {
    expect(safeSections('SET-901', BODY)).toEqual(['Overview', 'Markets']);
    const { ctx, textDir } = library();
    // The GM already revealed one section of Reedmarch, and wrote its player text.
    updateEntity(ctx.db, 'SET-903', { revealed: true, revealed_sections: ['Old Stones'], player_summary: 'My own words.', reason: 'test' });
    const plan = handbookReveals(ctx.db, { mode: 'match', apply: false, textDir });
    expect(plan.records.map((r) => [r.id, r.newRecord, r.sections, r.playerText])).toEqual([
      ['SET-902', true, [], true],
      ['SET-903', false, ['Overview', 'Markets'], false],
      ['SET-901', true, ['Overview', 'Markets'], false],
    ]);
    expect(getEntity(ctx.db, 'SET-901').revealed).toBe(false); // a preview changes nothing
    handbookReveals(ctx.db, { mode: 'match', apply: true, textDir });
    expect(getEntity(ctx.db, 'SET-901')).toMatchObject({ revealed: true, revealed_sections: ['Overview', 'Markets'] });
    expect(getEntity(ctx.db, 'SET-902')).toMatchObject({ revealed: true, player_summary: 'A town of lamps.' });
    // Nothing the GM revealed or wrote is taken away.
    expect(getEntity(ctx.db, 'SET-903')).toMatchObject({ revealed_sections: ['Old Stones', 'Overview', 'Markets'], player_summary: 'My own words.' });
    expect(handbookReveals(ctx.db, { mode: 'match', apply: false, textDir }).records).toEqual([]);
  });

  it('shows players the map pins of the places it reveals, and leaves other pins alone', () => {
    const { ctx, textDir } = library();
    const map = ctx.db.prepare(`INSERT INTO maps (name, kind, image_file, width, height, player_visible) VALUES ('World', 'image', 'w.png', 100, 100, 1)`).run().lastInsertRowid;
    const pin = ctx.db.prepare(`INSERT INTO map_markers (map_id, entity_id, label, x, y, hidden) VALUES (?, ?, ?, 1, 1, 1)`);
    pin.run(map, 'SET-901', 'Tollbridge'); // a place the handbook reveals: shown
    pin.run(map, 'SET-902', 'Gloam'); // revealed through its player text: shown
    pin.run(map, null, 'A GM note'); // no record: left hidden
    expect(handbookReveals(ctx.db, { mode: 'match', apply: false, textDir }).pins).toBe(2);
    handbookReveals(ctx.db, { mode: 'match', apply: true, textDir });
    const hidden = ctx.db.prepare('SELECT label FROM map_markers WHERE hidden = 1').all() as { label: string }[];
    expect(hidden.map((h) => h.label)).toEqual(['A GM note']);
    expect(handbookReveals(ctx.db, { mode: 'match', apply: false, textDir }).pins).toBe(0);
  });

  it('reveals in a fresh library what the published build does', () => {
    const a = library();
    const b = library();
    handbookReveals(a.ctx.db, { mode: 'fresh', apply: true, textDir: a.textDir });
    handbookReveals(b.ctx.db, { mode: 'match', apply: true, textDir: b.textDir });
    const revealed = (db: typeof a.ctx.db) => (db.prepare('SELECT id FROM entities WHERE revealed = 1 ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    expect(revealed(b.ctx.db)).toEqual(revealed(a.ctx.db));
    // The published build shows only the player text where there is some.
    expect(getEntity(a.ctx.db, 'SET-903')).toMatchObject({ revealed_sections: [], player_summary: 'Reeds and herons.' });
  });

  it('has a preview and an apply route, only with the setting pack', async () => {
    const bare = createApp(tempContext());
    expect((await request(bare).get('/api/handbook-reveals')).status).toBe(400);
    const ctx = tempContext({ settingRealms: true });
    const gm = createApp(ctx);
    expect((await request(gm).get('/api/handbook-reveals')).body).toEqual({ records: [], newRecords: 0, sections: 0, playerText: 0, pins: 0 });
    expect((await request(gm).post('/api/handbook-reveals')).status).toBe(200);
  });
});

describe('opening links from the desktop app', () => {
  it('opens only web addresses, without a shell', () => {
    const calls: unknown[][] = [];
    const fake = ((cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      return { on: () => undefined, unref: () => undefined };
    }) as never;
    expect(openInBrowser('http://127.0.0.1:4310/player', fake)).toEqual({ opened: 'http://127.0.0.1:4310/player' });
    expect((calls[0][1] as string[]).at(-1)).toBe('http://127.0.0.1:4310/player');
    expect(() => openInBrowser('file:///etc/passwd', fake)).toThrow(/web addresses/);
    expect(() => openInBrowser('not a url', fake)).toThrow();
  });

  it('refuses to open links outside the desktop app', async () => {
    const prev = process.env.WORLDKEEPER_PARENT_PID;
    delete process.env.WORLDKEEPER_PARENT_PID;
    const gm = createApp(tempContext());
    expect((await request(gm).get('/api/meta')).body.desktop).toBe(false);
    expect((await request(gm).post('/api/desktop/open').send({ url: 'https://example.com' })).status).toBe(400);
    if (prev) process.env.WORLDKEEPER_PARENT_PID = prev;
  });
});
