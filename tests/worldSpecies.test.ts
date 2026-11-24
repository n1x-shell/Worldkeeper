/** The Worldkeeper world's own species (v0.9.0, docs/PLAN_0.9.md): open rules for its peoples, the book winning. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { worldSpecies, publishedRuleEntries } from '../server/src/repo/rulesPacks.js';
import { rulesSpeciesNames, speciesInRules } from '../shared/rulesView.js';

const BOOK = (() => {
  const zip = new AdmZip();
  zip.addFile('pack.md', Buffer.from('Pack: Test Folk Book\nSource: Test Book of Folk\n'));
  zip.addFile('species/tabaxi.md', Buffer.from('Kind: species\nName: Tabaxi\nSize: Medium\nSpeed: 30\n\nThe book’s cat-folk.\n\n## Book Trait\nFrom the book.'));
  return zip.toBuffer();
})();

describe("the world's own species", () => {
  it('are 40, each a well-formed species', () => {
    const all = worldSpecies();
    expect(all).toHaveLength(40);
    for (const s of all) {
      const d = s.data as { size: string[]; speed: number; traits: unknown[] };
      expect(d.size.length).toBeGreaterThan(0);
      expect(d.speed).toBeGreaterThanOrEqual(30);
      expect(d.traits.length).toBeGreaterThanOrEqual(2);
    }
    expect(all.map((s) => s.name)).toEqual(expect.arrayContaining(['Cat-folk', 'Crow-folk', "Taur'n", 'Shadowkin', 'Bugbear', 'Made']));
  });

  it('a people names the book first and the world second; the first the rules have is used', () => {
    const line = "Use the tabaxi rules. Without the book, use the cat-folk rules (the world's own, open to all).";
    expect(rulesSpeciesNames(line)).toEqual(['Tabaxi', 'Cat-Folk']);
    expect(speciesInRules(rulesSpeciesNames(line), { 'Cat-folk': {} })).toBe('Cat-folk');
    expect(speciesInRules(rulesSpeciesNames(line), { Tabaxi: {}, 'Cat-folk': {} })).toBe('Tabaxi');
    expect(rulesSpeciesNames("Use the minotaur rules, or goliath rules with horns. Without the book, use the taur'n rules")).toEqual(['Minotaur', "Taur'n"]);
  });

  it('come with the world’s rules, as open rules; a GM with the book gets the book’s', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).post('/api/setting-packs/worldkeeper/install').expect(200);
    const rules = async () => (await request(gm).get('/api/player/rules')).body as { species: Record<string, { source: string; traits: { name: string }[] }> };
    let r = await rules();
    expect(r.species['Cat-folk']).toMatchObject({ source: "The Worldkeeper worldbook's rules (CC BY 4.0)" });
    expect(Object.keys(r.species)).toHaveLength(9 + 40);
    // The Tabaxi people play as the world's Cat-folk without the book.
    // (peoplesFrom in client/src/player/sheet/options.ts does just this for each people.)
    const tabaxi = rulesSpeciesNames("Use the tabaxi rules. Without the book, use the cat-folk rules (the world's own, open to all).");
    expect(speciesInRules(tabaxi, r.species)).toBe('Cat-folk');
    // The players' handbook carries them too (they're CC BY).
    expect(publishedRuleEntries(ctx.db).filter((e) => e.kind === 'species')).toHaveLength(40);

    // With the book: the book's Tabaxi.
    await request(gm).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');
    r = await rules();
    expect(speciesInRules(tabaxi, r.species)).toBe('Tabaxi');
    expect(r.species.Tabaxi.traits).toEqual([{ name: 'Book Trait', text: 'From the book.' }]);

    // Books only sets the world's species aside with the other open rules (the book has species, so none are kept).
    await request(gm).put('/api/rules/books-only').send({ on: true });
    r = await rules();
    expect(Object.keys(r.species)).toEqual(['Tabaxi']);
    expect(publishedRuleEntries(ctx.db).filter((e) => e.kind === 'species')).toEqual([]);

    // Off with the world's rules pack.
    await request(gm).put('/api/rules/books-only').send({ on: false });
    await request(gm).patch('/api/rules/packs/worldkeeper').send({ enabled: false });
    expect((await rules()).species['Cat-folk']).toBeUndefined();
  });
});
