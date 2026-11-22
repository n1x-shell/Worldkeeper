/**
 * The published handbook (and the table server's player pages) must never carry GM code: everything reachable from
 * the handbook's entry is checked against what players may load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { playerWorkspaceFor } from '../client/src/player/categories';

const root = path.resolve(import.meta.dirname, '..');
const client = path.join(root, 'client/src');

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@shared/')) base = path.join(root, 'shared', spec.slice(8));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const f = base + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  // shared modules are imported with .js in places
  const js = base.replace(/\.js$/, '');
  for (const ext of ['.ts', '.tsx']) if (fs.existsSync(js + ext)) return js + ext;
  return null;
}

export function reachable(entry: string) {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const line = m[0];
      if (/^(import|export)\s+type\s/.test(line)) continue; // types vanish from the bundle
      const r = resolve(f, m[1] ?? m[2]);
      if (r) stack.push(r);
    }
  }
  return [...seen].map((f) => path.relative(root, f).split(path.sep).join('/'));
}

const ALLOWED = [
  /^client\/src\/player\//,
  /^shared\//,
  /^client\/src\/components\/ui\/(badges|surfaces|data|inputs|overlays|feedback)\.tsx$/,
  /^client\/src\/components\/peek\/hover\.ts$/,
  /^client\/src\/components\/sidebarSlot\.ts$/,
  /^client\/src\/components\/map\/(MapView|grouping)\.tsx?$/,
  /^client\/src\/components\/(ItemRules|CalendarView|realms)\.tsx$/,
  /^client\/src\/components\/realmIcons\.ts$/,
  /^client\/src\/lib\/(mechanics|rank)\.ts$/,
  /^client\/src\/styles\//,
];

describe('the player handbook bundle', () => {
  it('reaches no GM code from its entry', () => {
    const files = reachable(path.join(client, 'player/static-main.tsx'));
    expect(files.length).toBeGreaterThan(10);
    const outside = files.filter((f) => !ALLOWED.some((re) => re.test(f)));
    expect(outside).toEqual([]);
  });
});

describe('the handbook navigation', () => {
  it('puts every page under one of its five workspaces, in the app (/player) and the published handbook', () => {
    for (const [p, w] of [
      ['/player', 'world'],
      ['/', 'world'],
      ['/realm/kaelmar', 'world'],
      ['/player/browse/places', 'records'],
      ['/e/SET-001', 'records'],
      ['/search', 'records'],
      ['/factions-web', 'records'],
      ['/player/maps/2', 'maps'],
      ['/quests', 'campaign'],
      ['/omens', 'campaign'],
      ['/player/me/ABCD2345', 'character'],
      ['/builder', 'character'],
      ['/print', 'character'],
    ] as const)
      expect(playerWorkspaceFor(p), p).toBe(w);
  });
});
