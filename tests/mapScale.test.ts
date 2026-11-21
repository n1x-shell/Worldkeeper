/**
 * Shipped maps put to scale: a library's copy gets the map's scale if it has none, and pins, routes and outlines that
 * moved are brought up to date only where they are still exactly where they were shipped (never what the GM moved).
 * The world map itself is checked against the approved plan. The records below are SYNTHETIC TEST DATA.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempContext } from './helpers';
import { buildPlan, commitPlan } from '../server/src/import/importer';
import type { SourceFile } from '../server/src/import/scan';
import { applyMaps } from '../server/src/mapAdditions';

const rec = (id: string, name: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: Settlement\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nText.\n`,
});
// A 1000 x 500 PNG header: enough for the map's size.
const png = () => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(1000, 16);
  b.writeUInt32BE(500, 20);
  return b;
};
const write = (dir: string, f: string, v: unknown) => fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));

describe('shipped maps put to scale', () => {
  it("moves what the GM hasn't moved, and leaves the rest", () => {
    const ctx = tempContext();
    commitPlan(
      ctx.db,
      [rec('SET-001', 'Town'), rec('SET-002', 'Village'), rec('SET-003', 'Keep')],
      buildPlan(ctx.db, [rec('SET-001', 'Town'), rec('SET-002', 'Village'), rec('SET-003', 'Keep')], 'test'),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-maps-'));
    fs.writeFileSync(path.join(dir, 'w.png'), png());
    const pins = (v: [number, number], k: [number, number]) => ({
      name: 'World',
      image: 'w.png',
      pins: [
        { id: 'SET-001', label: 'Town', x: 100, y: 100, category: 'settlement' },
        { id: 'SET-002', label: 'Village', x: v[0], y: v[1], category: 'settlement' },
        { id: 'SET-003', label: 'Keep', x: k[0], y: k[1], category: 'settlement' },
      ],
    });
    write(dir, 'w.pins.json', pins([400, 100], [600, 300]));
    write(dir, 'w.routes.json', {
      routes: [
        {
          label: 'Village to Town: a day',
          color: '#ffffff',
          points: [
            [400, 100],
            [100, 100],
          ],
        },
      ],
    });
    applyMaps(ctx.db, ctx.paths.uploadsDir, dir, { onlyRevealed: false });
    const mapId = (ctx.db.prepare('SELECT id FROM maps').get() as { id: number }).id;
    // The GM drags the keep somewhere of their own.
    ctx.db.prepare(`UPDATE map_markers SET x = 650, y = 150 WHERE entity_id = 'SET-003'`).run();

    // The shipped map is put to scale: the village and the keep move, the route follows, and a scale is set.
    write(dir, 'w.pins.json', { ...pins([130, 100], [130, 120]), scale_miles: 800 });
    write(dir, 'w.routes.json', {
      routes: [
        {
          label: 'Village to Town: a day, on the road',
          color: '#ffffff',
          points: [
            [130, 100],
            [100, 100],
          ],
        },
      ],
    });
    write(dir, 'w.moves.json', {
      pins: { 'SET-002': [400, 100], 'SET-003': [600, 300] },
      routes: [
        {
          label: 'Village to Town: a day, on the road',
          was_label: 'Village to Town: a day',
          was_points: [
            [400, 100],
            [100, 100],
          ],
        },
      ],
    });
    const [r] = applyMaps(ctx.db, ctx.paths.uploadsDir, dir, { onlyRevealed: false });
    expect(r.moved).toBe(2);
    const at = (id: string) => ctx.db.prepare('SELECT x, y FROM map_markers WHERE entity_id = ?').get(id);
    expect(at('SET-002')).toEqual({ x: 130, y: 400 }); // y from the bottom: 500 - 100
    expect(at('SET-003')).toEqual({ x: 650, y: 150 }); // the GM's own position is kept
    const route = ctx.db.prepare(`SELECT label, points FROM map_shapes WHERE kind = 'route'`).get() as { label: string; points: string };
    expect(route.label).toBe('Village to Town: a day, on the road');
    expect(JSON.parse(route.points)).toEqual([
      [130, 400],
      [100, 400],
    ]);
    expect((ctx.db.prepare('SELECT scale_miles FROM maps WHERE id = ?').get(mapId) as { scale_miles: number }).scale_miles).toBe(800);
    // Applying again changes nothing.
    expect(applyMaps(ctx.db, ctx.paths.uploadsDir, dir, { onlyRevealed: false })[0].moved).toBe(0);
  });
});

describe('the world map, to scale', () => {
  const dir = path.resolve(import.meta.dirname, '../assets/maps');
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'world-map.pins.json'), 'utf8')) as { scale_miles: number; pins: { id: string; x: number; y: number }[] };
  const routes = (JSON.parse(fs.readFileSync(path.join(dir, 'world-map.routes.json'), 'utf8')) as { routes: { label: string; points: [number, number][] }[] }).routes;
  const perPx = spec.scale_miles / 3344;
  const length = (pts: [number, number][]) => pts.slice(1).reduce((d, p, i) => d + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) * perPx;
  const WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  /** The days a route's label gives ("about a week and a half", "nearly three weeks", "about nine days"). */
  const days = (label: string) => {
    const t = label.split(':').slice(1).join(':').toLowerCase();
    if (/(?:about|nearly) a week and a half/.test(t)) return 10.5;
    const w = /(?:about|nearly) (a|one|two|three|four)( and a half)? weeks?/.exec(t);
    if (w) return (WORDS[w[1]] + (w[2] ? 0.5 : 0)) * 7;
    const d = /(?:about|nearly) (\w+) days/.exec(t);
    if (d) return WORDS[d[1]];
    if (/about a week/.test(t)) return 7;
    return null;
  };
  it('is about 2,700 miles across', () => expect(spec.scale_miles).toBe(2675));
  it.each(routes.filter((r) => days(r.label) && !/ship|crossing|barge/i.test(r.label)).map((r) => [r.label.split(':')[0], r] as const))('%s: its time matches its length on the map', (_name, r) => {
    const miles = length(r.points);
    expect(Math.abs(miles / 24 - days(r.label)!) / days(r.label)!).toBeLessThan(0.3);
  });
});
