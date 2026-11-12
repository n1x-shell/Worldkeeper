/**
 * Mysteries, secrets and clues. The records, text and mysteries below are SYNTHETIC TEST DATA.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import { syncRumours } from '../server/src/repo/rumours';
import { deleteClue, listMysteries, setClueFound, setSecretState, syncMysteries, updateSecret } from '../server/src/repo/mysteries';
import { playerSnapshot } from '../server/src/player/projection';
import type { SourceFile } from '../server/src/import/scan';

const rec = (id: string, name: string, category: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA record.\n`,
});
const files = [rec('SET-001', 'Test Town', 'Settlement'), rec('NPC-001', 'Mira Quill', 'NPC'), rec('LOC-001', 'The Old Well', 'Landmark')];
const handbook = `## Test Town\n\n**What people say**\n\n- The well hums at night.\n- Mira never sleeps.\n`;
const spec = {
  mysteries: [
    {
      key: 'well',
      title: 'The Humming Well',
      question: 'What is under the well?',
      summary: 'A sleeping engine.',
      secrets: [
        {
          key: 'well-engine',
          title: 'The engine',
          truth: 'An engine sleeps under the well.',
          source: 'LOC-001',
          about: ['SET-001'],
          clues: [
            { kind: 'rumour', match: 'well hums', note: '' },
            { kind: 'npc', entity: 'NPC-001', note: 'Mira has heard it.' },
            { kind: 'rumour', match: 'nothing like this', note: '' },
          ],
        },
      ],
    },
  ],
};

function setup() {
  const ctx = tempContext();
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'test'));
  syncRumours(ctx.db, [{ path: 'a.md', content: handbook }]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wk-myst-')), 'mysteries.json');
  fs.writeFileSync(file, JSON.stringify(spec));
  return { ctx, file };
}

describe('mysteries', () => {
  it('brings in mysteries, secrets and clues, matching rumour clues by text and reporting the ones it cannot find', () => {
    const { ctx, file } = setup();
    const r = syncMysteries(ctx.db, file);
    expect(r).toMatchObject({ mysteries: 1, secrets: 1, clues: 3, unmatched: ['well-engine: nothing like this'] });
    const [m] = listMysteries(ctx.db);
    expect(m.title).toBe('The Humming Well');
    expect(m.secrets[0].clues[0].rumours[0].text).toBe('The well hums at night.');
    expect(m.secrets[0].about).toEqual(['LOC-001', 'SET-001']);
    expect(syncMysteries(ctx.db, file).secrets).toBe(1); // safe to run again
    expect(listMysteries(ctx.db)[0].secrets[0].clues.length).toBe(3);
  });

  it('tracks the party per campaign; finding a clue makes the secret suspected', () => {
    const { ctx, file } = setup();
    syncMysteries(ctx.db, file);
    const s = listMysteries(ctx.db)[0].secrets[0];
    setClueFound(ctx.db, s.clues[1].id, 3, true);
    expect(listMysteries(ctx.db, 3)[0].secrets[0]).toMatchObject({ state: 'suspected' });
    expect(listMysteries(ctx.db, 3)[0].secrets[0].clues[1].found).toBe(true);
    expect(listMysteries(ctx.db, 4)[0].secrets[0]).toMatchObject({ state: 'unknown' });
    setSecretState(ctx.db, s.id, 3, 'known');
    expect(listMysteries(ctx.db, 3)[0].secrets[0].state).toBe('known');
  });

  it('keeps the GM\'s edits and removals when the drafts are synced again', () => {
    const { ctx, file } = setup();
    syncMysteries(ctx.db, file);
    const s = listMysteries(ctx.db)[0].secrets[0];
    updateSecret(ctx.db, s.id, { truth: 'It is a sleeping god.' });
    deleteClue(ctx.db, s.clues[2].id);
    syncMysteries(ctx.db, file);
    const after = listMysteries(ctx.db)[0].secrets[0];
    expect(after.truth).toBe('It is a sleeping god.');
    expect(after.clues.length).toBe(2);
  });

  it('finds the secrets that involve a record, through its links or its clues', () => {
    const { ctx, file } = setup();
    syncMysteries(ctx.db, file);
    expect(listMysteries(ctx.db, 0, 'NPC-001').length).toBe(1); // only as a clue
    expect(listMysteries(ctx.db, 0, 'SET-001').length).toBe(1);
  });

  it('never reaches player data', () => {
    const { ctx, file } = setup();
    syncMysteries(ctx.db, file);
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain('sleeps under the well');
  });
});
