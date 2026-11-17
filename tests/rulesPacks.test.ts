/** Rules packs: the GM's own rules (synthetic test content here), imported privately and never published. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { exportJson } from '../server/src/backup/exporter.js';
import { playerSnapshot } from '../server/src/player/projection.js';
import { rulesSpeciesName } from '../client/src/player/sheet/srd.js';
import { parseKit } from '../client/src/player/builder/compute.js';

const SECRET = 'Zorbleflax glimmers';
function pack(files: Record<string, string>) {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text, 'utf8'));
  return zip.toBuffer();
}
const TEST_PACK = pack({
  'pack.md': 'Pack: Test Books\nSource: Test Book of Everything\n',
  'spells/fireball.md': `Kind: spell\nName: Fireball\nLevel: 3\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action\nRange: 150 feet\nComponents: V, S\nDuration: Instantaneous\n\n${SECRET}.`,
  'spells/frost-lance.md':
    'Name: Frost Lance\nLevel: Cantrip\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action or Ritual\nRange: 60 feet\nComponents: V, S, M (ice)\nDuration: Concentration, up to 1 minute\n\nCold.',
  'species/testfolk.md': 'Kind: species\nName: Sea Testfolk\nSize: Small or Medium\nSpeed: 35\n\nAbout them.\n\n## Gills\nBreathe water.\n\n## Swim\nSwim speed.',
  'subclasses/moon.md': 'Kind: subclass\nName: Circle of Testing\nClass: Druid\n\nTesters.\n\n## Level 3: Test Forms\nChange shape.\n\n## Level 6: Better Forms\nMore.',
  'backgrounds/artisan.md':
    "Kind: background\nName: Artisan\nAbility Scores: Strength, Dexterity, Intelligence\nFeat: Crafter\nSkills: Investigation, Persuasion\nTool: Smith's Tools\nEquipment: Choose A or B: (A) Smith's Tools, 2 Pouches (small), Traveler's Clothes, 32 GP; or (B) 50 GP\n\nMakers.",
  'feats/tester.md': 'Kind: feat\nName: Tester\nCategory: Origin\n\nYou test things.',
  'feats/broken.md': 'Kind: gadget\nName: Nope\n\nx',
});

async function setup() {
  const ctx = tempContext();
  const gm = createApp(ctx);
  const table = createApp(new AppContext(ctx.paths, 'player'));
  return { ctx, gm, table };
}

describe('rules packs', () => {
  it('import a zip of Markdown, report what they skip, and win over the SRD', async () => {
    const { gm, table } = await setup();
    const r = await request(gm).post('/api/rules/packs').attach('pack', TEST_PACK, 'pack.zip');
    expect(r.status).toBe(200);
    expect(r.body.pack).toMatchObject({ id: 'test-books', name: 'Test Books', enabled: true, counts: { spell: 2, species: 1, subclass: 1, background: 1, feat: 1 } });
    expect(r.body.problems).toEqual([expect.stringContaining('feats/broken.md')]);
    const rules = (await request(table).get('/api/player/rules')).body;
    expect(rules.srd).toBe(true);
    expect(rules.spells.find((s: { name: string }) => s.name === 'Fireball')).toMatchObject({ text: `${SECRET}.`, source: 'Test Book of Everything' });
    expect(rules.spells.find((s: { name: string }) => s.name === 'Frost Lance')).toMatchObject({ level: 0, concentration: true, ritual: true, material: true });
    expect(rules.spells.find((s: { name: string }) => s.name === 'Magic Missile')).toBeTruthy();
    expect(rules.species['Sea Testfolk']).toMatchObject({ size: ['Small', 'Medium'], speed: 35, traits: [{ name: 'Gills' }, { name: 'Swim' }] });
    expect(rules.classes.Druid.subclasses['Circle of Testing'].features.map((f: { level: number }) => f.level)).toEqual([3, 6]);
    expect(rules.classes.Druid.subclasses['Circle of the Land']).toBeTruthy();
    expect(rules.feats.Tester.category).toBe('Origin');
    // The GM's pack controls aren't on the table server.
    expect((await request(table).get('/api/rules/packs')).status).toBe(404);
  });

  it('can be turned off or removed, and the SRD can be turned off too', async () => {
    const { gm, table } = await setup();
    await request(gm).post('/api/rules/packs').attach('pack', TEST_PACK, 'pack.zip');
    await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
    let rules = (await request(table).get('/api/player/rules')).body;
    expect(rules.srd).toBe(false);
    expect(rules.spells.map((s: { name: string }) => s.name)).toEqual(['Fireball', 'Frost Lance']);
    await request(gm).patch('/api/rules/packs/test-books').send({ enabled: false });
    rules = (await request(table).get('/api/player/rules')).body;
    expect(rules.spells).toEqual([]);
    expect((await request(gm).delete('/api/rules/packs/srd')).status).toBe(400);
    const left = (await request(gm).delete('/api/rules/packs/test-books')).body as { id: string }[];
    expect(left.map((p) => p.id)).toEqual(['srd']);
  });

  it('never reach the published handbook or an export', async () => {
    const { ctx, gm } = await setup();
    await request(gm).post('/api/rules/packs').attach('pack', TEST_PACK, 'pack.zip');
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain(SECRET);
    expect(JSON.stringify(exportJson(ctx.db))).not.toContain(SECRET);
    await request(gm).patch('/api/rules/packs/srd').send({ enabled: false });
    expect(playerSnapshot(ctx.db).rulesSrd).toBe(false);
  });

  it('refuse a zip with no pack.md, or nothing in it', async () => {
    const { gm } = await setup();
    expect(
      (
        await request(gm)
          .post('/api/rules/packs')
          .attach('pack', pack({ 'a.md': 'Kind: feat\nName: X\n\ny' }), 'p.zip')
      ).status,
    ).toBe(400);
    expect((await request(gm).post('/api/rules/packs').attach('pack', Buffer.from('not a zip'), 'p.zip')).status).toBe(400);
  });
});

describe('matching a people to its species rules', () => {
  it('takes exactly the rules a people page names', () => {
    expect(rulesSpeciesName('Use the sea elf rules.')).toBe('Sea Elf');
    expect(rulesSpeciesName('Use the half-orc rules.')).toBe('Half-Orc');
    expect(rulesSpeciesName('Use the lizardfolk rules, or dragonborn rules described as scaled hunters.')).toBe('Lizardfolk');
    expect(rulesSpeciesName('Play a Moonborn as an elf with the Fey Touched feat.')).toBe('Elf');
    expect(rulesSpeciesName("Stormborn are this world's air genasi: use the air genasi rules from Monsters.")).toBe('Air Genasi');
    expect(rulesSpeciesName('Ask your GM.')).toBeNull();
  });
  it("read a background's kit", () => {
    expect(parseKit("Choose A or B: (A) Smith's Tools, 2 Pouches (small), Traveler's Clothes, 32 GP; or (B) 50 GP")).toEqual({
      items: ["Smith's Tools", '2 Pouches (small)', "Traveler's Clothes"],
      gp: 32,
    });
    expect(parseKit('50 GP')).toBeNull();
  });
});
