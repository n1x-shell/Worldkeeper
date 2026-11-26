/**
 * Windows and macOS treat `LevelUp.tsx` and `levelUp.ts` as one file (v0.9.20). The project is written on Linux, where
 * they are two, so from v0.9.6 the app built there and nowhere else, and nothing said so until a build was tried on the
 * other systems. No two files in a folder may have names that differ only in capitals, or only in their ending.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-player', 'target', 'data', 'build', 'gen']);

function clashes(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !SKIP.has(e.name));
  const seen = new Map<string, string>();
  for (const e of entries) {
    // A script and its typed twin count as one name: an import without an ending could mean either.
    const key = (e.isFile() ? e.name.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '.<script>') : e.name).toLowerCase();
    const other = seen.get(key);
    if (other) out.push(`${path.relative(root, dir)}: ${other} and ${e.name}`);
    seen.set(key, e.name);
    if (e.isDirectory()) clashes(path.join(dir, e.name), out);
  }
  return out;
}

describe('file names', () => {
  it('never differ only in capitals or only in their ending, so the app builds on Windows and macOS', () => {
    expect(clashes(root)).toEqual([]);
  });
});
