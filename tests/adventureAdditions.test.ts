/** The shipped opening adventures go into the GM's Adventures once, with their scenes, and are never overwritten. */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { applyAdventures } from '../server/src/adventureAdditions';

const DIR = path.resolve(import.meta.dirname, '../assets/adventures');

describe('adventure additions', () => {
  it('adds each adventure with its scenes, in order, and only once', () => {
    const { db } = tempContext();
    const added = applyAdventures(db, DIR);
    expect(added).toEqual(['The Dead Man at the Crooked Nail', 'The Hum Under the West Road', 'The Lamplighter', 'The Lightless Crossing', 'The Return Line', 'The Long Way Out', 'The Waystone at Dusk', 'Paid Twice', 'The Sunken Nave', 'The First Fire', 'Echoes in the Sand']);
    const adv = db.prepare(`SELECT id, status, arc, data FROM adventures WHERE title = 'The Dead Man at the Crooked Nail'`).get() as { id: number; status: string; arc: string; data: string };
    expect(adv.status).toBe('ready');
    expect(adv.arc).toBe('The Loose Thread');
    const data = JSON.parse(adv.data);
    expect(data.premise).toContain('Crooked Nail');
    expect(data.scaling).toContain('Levels 5 to 10');
    expect(data.clues.length).toBeGreaterThan(5);
    const sc = db.prepare('SELECT title, kind, read_aloud FROM scenes WHERE adventure_id = ? ORDER BY sort_order').all(adv.id) as { title: string; kind: string; read_aloud: string }[];
    expect(sc[0]).toMatchObject({ title: 'The Corner Table', kind: 'scene' });
    expect(sc[0].read_aloud).toMatch(/^The Crooked Nail smells/);
    expect(sc.at(-1)!.kind).toBe('climax');
    const links = (db.prepare('SELECT COUNT(*) n FROM scene_links WHERE adventure_id = ?').get(adv.id) as { n: number }).n;
    expect(links).toBe(sc.length - 1);
    // Applying again changes nothing, even after the GM has edited one.
    db.prepare(`UPDATE adventures SET arc = 'Mine' WHERE id = ?`).run(adv.id);
    expect(applyAdventures(db, DIR)).toEqual([]);
    expect((db.prepare('SELECT COUNT(*) n FROM adventures').get() as { n: number }).n).toBe(11);
    expect((db.prepare('SELECT arc FROM adventures WHERE id = ?').get(adv.id) as { arc: string }).arc).toBe('Mine');
  });
});
