/**
 * Facts for the built-in SRD 5.2.1 data that the SRD prints only as tables, or not at all, taken from a 5etools copy's
 * entries flagged as SRD 5.2.1: each creature's environments and ability scores (a cross-check), and each item's kind,
 * rarity, price, weight and generic-item name pattern, with the app's own one-line weapon and armor summaries.
 * No descriptive text is written out: that comes from the SRD itself (see README.md).
 *
 *   npx tsx scripts/srd/book_metadata.ts <5etools data folder> metadata.json
 */
import fs from 'node:fs';
import { creatureBlock, itemEntry, setItemTemplates } from '../../server/src/repo/fivetools.js';

const [D, OUT] = process.argv.slice(2);
type J = Record<string, any>;
const J = (p: string): J => JSON.parse(fs.readFileSync(`${D}/${p}`, 'utf8'));
setItemTemplates(J('items-base.json').itemEntry);
// The SRD's own names where the books use another (Daern's Instant Fortress is Instant Fortress).
const renames: [string, string][] = [];
for (const it of [...J('items.json').item, ...J('items-base.json').baseitem]) if (typeof it.srd52 === 'string') renames.push([it.name, it.srd52]);
renames.sort((a, b) => b[0].length - a[0].length);
const srdName = (t: string) => renames.reduce((x, [a, b]) => x.split(a).join(b), t);
const bestiary = fs.readdirSync(`${D}/bestiary`).filter((f) => f.startsWith('bestiary-'));
const creatures = bestiary
  .flatMap((f) => (J(`bestiary/${f}`).monster ?? []) as J[])
  .filter((m) => m.srd52 && !m._copy)
  .map((m) => {
    const b = creatureBlock(m);
    return { name: typeof m.srd52 === 'string' ? m.srd52 : m.name, environment: b.environment, ab: b.ab };
  });
const item = (i: J, name: string) => {
  const e = itemEntry({ ...i, entries: [] }); // the app's own summary: weapon damage and properties, armor AC
  return { name: srdName(name), type: e.type, rarity: e.rarity, magic: e.magic, value: e.value, weight: e.weight, text: e.text, ...(e.prefix !== undefined ? { prefix: e.prefix, suffix: e.suffix } : {}) };
};
const items = [
  ...[...J('items.json').item, ...J('items-base.json').baseitem].filter((i: J) => i.srd52 && !i._copy).map((i: J) => item(i, i.name)),
  ...J('magicvariants.json')
    .magicvariant.filter((v: J) => v.inherits?.srd52)
    .map((v: J) => item({ ...v.inherits, ...v, source: v.inherits.source }, v.name)),
];
fs.writeFileSync(OUT, JSON.stringify({ creatures, items }));
console.log(`${creatures.length} creatures, ${items.length} items`);
