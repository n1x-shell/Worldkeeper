/**
 * Errata: corrections to wording in a library's records (text, fields, player text) and adventures (including the
 * copies in campaigns), applied only where the old wording is still there. The records below are SYNTHETIC TEST DATA.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { getEntity, updateEntity, listRevisions } from '../server/src/repo/entities';
import { adventures, campaigns, scenes } from '../server/src/repo/campaigns';
import { applyErrata } from '../server/src/errata';

const rec: SourceFile = {
  path: 'Lib/SET-001.md',
  content:
    'ID: SET-001\nName: Test Town\nAlternate names: None\nCategory: Settlement\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nTravel from hub: Half a day to the gate\nSource: Test\nTags: realm/aetheris, vis/player\n\n# Test Town\n\n## Routes\nHalf a day to the Crossroads.\n',
};

describe('errata', () => {
  it('corrects records and adventures where the old wording is still there, and only once', () => {
    const ctx = tempContext();
    commitPlan(ctx.db, [rec], buildPlan(ctx.db, [rec], 'test'));
    updateEntity(ctx.db, 'SET-001', { player_summary: '- Half a day to the Crossroads.', reason: 'test' });
    const c = campaigns.create(ctx.db, { title: 'C' }) as { id: number };
    const a = adventures.create(ctx.db, { title: 'The Walk', campaign_id: c.id, data: { premise: 'He walks for half a day.' } }) as { id: number };
    scenes.create(ctx.db, { adventure_id: a.id, title: 'Road', body: 'He walks for half a day.', read_aloud: '' });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wk-errata-')), 'errata.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        reason: 'Test errata',
        errata: [
          { id: 'SET-001', find: 'Half a day to the Crossroads.', replace: 'About three days to the Crossroads.' },
          { id: 'SET-001', find: 'Half a day to the gate', replace: 'About a week to the gate' },
          { id: 'SET-404', find: 'x', replace: 'y' },
          { adventure: 'The Walk', find: 'He walks for half a day.', replace: 'He walks for three days.' },
        ],
      }),
    );
    expect(applyErrata(ctx.db, file)).toEqual({ records: 1, adventures: 1 });
    const e = getEntity(ctx.db, 'SET-001');
    expect(e.body).toContain('About three days to the Crossroads.');
    expect(e.player_summary).toBe('- About three days to the Crossroads.');
    expect(e.fields).toContainEqual(['Travel from hub', 'About a week to the gate']);
    expect(JSON.parse((ctx.db.prepare('SELECT data FROM adventures WHERE id = ?').get(a.id) as { data: string }).data).premise).toBe('He walks for three days.');
    expect((ctx.db.prepare('SELECT body FROM scenes WHERE adventure_id = ?').get(a.id) as { body: string }).body).toBe('He walks for three days.');
    expect((listRevisions(ctx.db, 'SET-001') as { reason: string }[]).some((r) => r.reason === 'Test errata')).toBe(true);
    // Again: nothing left to correct.
    expect(applyErrata(ctx.db, file)).toEqual({ records: 0, adventures: 0 });
  });

  it('every shipped erratum names its record or adventure and changes something', () => {
    const doc = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../assets/lore/errata.json'), 'utf8')) as {
      errata: { id?: string; adventure?: string; find: string; replace: string }[];
    };
    expect(doc.errata.length).toBeGreaterThan(50);
    for (const e of doc.errata) {
      expect(!!e.id !== !!e.adventure).toBe(true);
      expect(e.find && e.find !== e.replace).toBeTruthy();
    }
  });
});
