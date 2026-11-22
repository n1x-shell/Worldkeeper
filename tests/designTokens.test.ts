/**
 * The design tokens (docs/DESIGN_OVERHAUL.md, section 6): in both themes, every text colour reaches WCAG AA (4.5:1)
 * on every surface, and control borders reach 3:1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(import.meta.dirname, '../client/src/styles/index.css'), 'utf8');
function theme(selector: RegExp): Record<string, number[]> {
  const block = selector.exec(css)?.[1];
  if (!block) throw new Error(`no theme block for ${selector}`);
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)].map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
}
const lum = ([r, g, b]: number[]) => {
  const c = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const SURFACES = ['bg', 'panel', 'raised'];
const TEXT = [
  'ink',
  'dim',
  'gold',
  'arcane',
  'danger',
  'ok',
  'warn',
  'r-common',
  'r-uncommon',
  'r-rare',
  'r-very-rare',
  'r-legendary',
  'r-artifact',
  'rc-blue',
  'rc-amber',
  'rc-green',
  'rc-violet',
  'rc-red',
  'rc-teal',
  'rc-rose',
  'rc-slate',
  'belief',
  'homebrew',
];

describe.each([
  ['Warm Parchment', theme(/:root,\s*\.light\s*\{([^}]*)\}/)],
  ['Dark Codex', theme(/\n\.dark\s*\{([^}]*)\}/)],
])('%s', (_name, t) => {
  it('has every token', () => {
    for (const k of [...SURFACES, 'line', 'edge', ...TEXT]) expect(t[k], k).toBeDefined();
  });
  it.each(TEXT)('%s text reaches 4.5:1 on every surface', (fg) => {
    for (const s of SURFACES) expect(ratio(t[fg], t[s]), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it('control borders reach 3:1', () => {
    for (const s of SURFACES) expect(ratio(t.edge, t[s]), `edge on ${s}`).toBeGreaterThanOrEqual(3);
  });
});

it('Warm Parchment is the default theme', () => {
  const store = fs.readFileSync(path.resolve(import.meta.dirname, '../client/src/lib/store.tsx'), 'utf8');
  expect(store).toMatch(/read\('wk\.theme', 'light'\)/);
});
