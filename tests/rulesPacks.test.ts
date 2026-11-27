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
    expect(left.map((p) => p.id)).toEqual(['srd', 'worldkeeper']);
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

describe('a Markdown pack’s creatures, hazards and items (v0.9.30)', () => {
  const HOUND = `Kind: creature
Name: Ash Hound
Size: Medium
Type: Monstrosity
Alignment: Neutral Evil
AC: 14 (natural armour)
HP: 6d8 + 12
Speed: 40 ft.
Abilities: 15, 14, 14, 3, 12, 6
Skills: Perception +3
Resistances: Fire
Senses: Darkvision 60 ft.
CR: 2
Environment: Mountain, Underdark

**Keen Smell.** The hound has Advantage on Wisdom (Perception) checks that rely on smell.

## Actions

### Bite
Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Piercing damage.

It does not let go.

***Cinder Breath (Recharge 5–6).*** Dexterity Saving Throw: DC 12. ${SECRET}.

## Legendary Actions

Legendary Action Uses: 2.

**Lope.** The hound moves up to half its Speed.
`;
  const BEAST_PACK = pack({
    'pack.md': 'Pack: Test Bestiary\nSource: My table\n',
    'creatures/ash-hound.md': HOUND,
    'creatures/by-fields.md':
      'Name: Bog Lurker\nStrength: 18\nDexterity: 8\nCon: 16\nInt: 5\nWis: 10\nCha: 5\nHit Points: 45\nChallenge: 1/2\nInitiative: +3\nSenses: Passive Perception 14\n\n## Actions\n\n**Slam.** Hit.',
    'creatures/bad-cr.md': 'Name: Wrong\nCR: 99\n\nx',
    'creatures/bad-section.md': 'Name: Wronger\n\n## Lair\n\nx',
    'hazards/pit.md': 'Name: Ash Pit\nType: Nuisance Trap (Levels 1–4)\nTrigger: A creature steps on the crust\n\nThe crust gives way.',
    'items/lantern.md': 'Kind: item\nName: Lantern of the Last Light\nType: Wondrous Item\nRarity: Very Rare\nAttunement: by a cleric\nValue: 2,500 gp\nWeight: 2 lb.\n\nIt does not go out.',
    'items/rope.md': 'Name: Ashweave Rope\nValue: 5 sp\n\nFifty feet of it.',
    'items/bad.md': 'Name: Odd Thing\nRarity: Shiny\n\nx',
  });

  it('come in as stat blocks, hazard cards and items the GM can use, and say what was skipped', async () => {
    const { gm, table } = await setup();
    const r = await request(gm).post('/api/rules/packs').attach('pack', BEAST_PACK, 'pack.zip');
    expect(r.status).toBe(200);
    expect(r.body.pack).toMatchObject({ id: 'test-bestiary', counts: { creature: 3, item: 2 } });
    expect(r.body.problems.map((p: string) => p.split(' ')[0]).sort()).toEqual(['creatures/bad-cr.md', 'creatures/bad-section.md', 'items/bad.md']);
    expect(r.body.problems.join(' ')).toMatch(/Challenge Rating/);

    const hound = (await request(gm).get('/api/books/creatures/test-bestiary:ash-hound')).body;
    expect(hound).toMatchObject({
      name: 'Ash Hound',
      meta: 'Medium Monstrosity, Neutral Evil',
      kind: 'creature',
      ac: 14,
      hp: '39 (6d8 + 12)',
      hpAvg: 39,
      init: 2,
      ab: [15, 14, 14, 3, 12, 6],
      cr: '2',
      xp: 450,
      pb: 2,
      res: 'Fire',
      senses: 'Darkvision 60 ft.; Passive Perception 11',
      languages: 'None',
      environment: ['Mountain', 'Underdark'],
      source: 'My table',
    });
    expect(hound.traits).toEqual([{ name: 'Keen Smell', text: 'The hound has Advantage on Wisdom (Perception) checks that rely on smell.' }]);
    expect(hound.actions.map((a: { name: string }) => a.name)).toEqual(['Bite', 'Cinder Breath (Recharge 5–6)']);
    expect(hound.actions[0].text).toContain('It does not let go.');
    expect(hound.legendary).toEqual([
      { name: '', text: 'Legendary Action Uses: 2.' },
      { name: 'Lope', text: 'The hound moves up to half its Speed.' },
    ]);
    const lurker = (await request(gm).get('/api/books/creatures/test-bestiary:bog-lurker')).body;
    expect(lurker).toMatchObject({ ab: [18, 8, 16, 5, 10, 5], hp: '45', cr: '1/2', xp: 100, init: 3, senses: 'Passive Perception 14', meta: 'Medium Creature' });
    const pit = (await request(gm).get('/api/books/creatures/test-bestiary:ash-pit')).body;
    expect(pit).toMatchObject({ kind: 'hazard', meta: 'Nuisance Trap (Levels 1–4)', trigger: 'A creature steps on the crust', effect: 'The crust gives way.' });

    const items = (await request(gm).get('/api/books/items?q=last light')).body as { name: string }[];
    expect(items[0]).toMatchObject({ name: 'Lantern of the Last Light', rarity: 'very rare', attunement: 'requires attunement by a cleric', magic: true, value: 2500, weight: 2, source: 'My table' });
    const rope = ((await request(gm).get('/api/books/items?q=ashweave')).body as { name: string }[])[0];
    expect(rope).toMatchObject({ type: 'Gear', magic: false, value: 0.5, rarity: '' });

    // Creatures are the GM's: the table is not given them, in its rules or anywhere.
    const rules = JSON.stringify((await request(table).get('/api/player/rules')).body);
    expect(rules).not.toContain('Ash Hound');
    expect(rules).not.toContain(SECRET);
    expect((await request(table).get('/api/books/creatures/test-bestiary:ash-hound')).status).toBe(404);
  });

  it('never reach the published handbook or an export, and go when the pack is switched off', async () => {
    const { ctx, gm } = await setup();
    await request(gm).post('/api/rules/packs').attach('pack', BEAST_PACK, 'pack.zip');
    expect(JSON.stringify(playerSnapshot(ctx.db))).not.toContain(SECRET);
    expect(JSON.stringify(exportJson(ctx.db))).not.toContain(SECRET);
    await request(gm).patch('/api/rules/packs/test-bestiary').send({ enabled: false });
    expect((await request(gm).get('/api/books/creatures/test-bestiary:ash-hound')).status).toBe(404);
    expect((await request(gm).get('/api/books/items?q=last light')).body).toEqual([]);
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
