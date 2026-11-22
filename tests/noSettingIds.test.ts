/**
 * The app's code names no setting's records (docs/OWN_WORLD_PLAN.md §2.10): a page finds the record that plays a part
 * by its pack's role, and features read type traits. Comments may cite records; the migrations, which repaired
 * libraries from before packs, are exempt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIRS = ['server/src', 'client/src', 'shared'];
const EXEMPT = new Set(['server/src/db/migrations.ts']);
// A record ID inside a string: a prefix of capitals, a dash and three digits ("SYS-907", `COS-032`).
const ID_IN_STRING = /['"`][^'"`\n]*\b[A-Z]{2,5}-\d{3}\b/;

function files(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) return files(rel);
    return /\.(ts|tsx)$/.test(d.name) ? [rel] : [];
  });
}

/** The code without its comments (line and block), keeping line numbers. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('no setting record IDs in app code', () => {
  it('names records by role, never by ID', () => {
    const found: string[] = [];
    for (const f of DIRS.flatMap(files)) {
      if (EXEMPT.has(f)) continue;
      stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (ID_IN_STRING.test(line)) found.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
        });
    }
    expect(found).toEqual([]);
  });
});
