/** Worldbooks and the GM's books (docs/WORLDBOOKS_PLAN.md §2a, W3c): required, optional, safe mode, books only. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { readWorldbook } from '../server/src/packs/share.js';
import { creatureByName, itemByName } from '../server/src/repo/bookData.js';
import { ruleRefs } from '../server/src/packs/worldbookRules.js';
import { saveRulesPack } from '../server/src/repo/sharedRules.js';
import { randomTables } from '../server/src/repo/campaigns.js';

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
function pack(files: Record<string, string>) {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text, 'utf8'));
  return zip.toBuffer();
}
// A closed book with a small species (Bookfolk), and open content with another species (Openling).
const BOOK = pack({
  'pack.md': 'Pack: Test Book\nSource: Test Book of Testing\n',
  'species/bookfolk.md': 'Kind: species\nName: Bookfolk\nSize: Small\nSpeed: 30\n\nReaders.\n\n## Ink Sight\nSee in the dark.',
});
const OPEN = pack({
  'pack.md': 'Pack: Open Extras\nSource: Open Publisher, CC BY 4.0\n',
  'species/openling.md': 'Kind: species\nName: Openling\nSize: Medium\nSpeed: 30\n\nOpen folk.',
  'species/unused.md': 'Kind: species\nName: Unusedling\nSize: Medium\nSpeed: 30\n\nNot named by the world.',
});

/** GM A's world: two peoples, one playing a book species, one an open one, and a person with a class. */
async function worldA() {
  const a = tempContext();
  const gm = createApp(a);
  await request(gm).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');
  await request(gm).post('/api/rules/packs').attach('pack', OPEN, 'open.zip');
  await request(gm).post('/api/entities').send({ name: 'The Inkfolk', type: 'people', realm: 'world', body: 'Quiet readers.\n\n**At the table.** Use the bookfolk rules.' });
  await request(gm).post('/api/entities').send({ name: 'The Open', type: 'people', realm: 'world', body: '**At the table.** Use the openling rules.' });
  await request(gm).post('/api/entities').send({ name: 'Mira', type: 'npc', realm: 'world', fields: [['Class', 'Wizard (Evoker)']], body: '' });
  return { a, gm };
}
const share = async (gm: ReturnType<typeof createApp>, books: string, swaps?: Record<string, string>) =>
  (
    await request(gm)
      .get('/api/worldbooks/share')
      .query({ name: 'Inkmark', books, ...(swaps ? { swaps: JSON.stringify(swaps) } : {}) })
      .buffer(true)
      .parse(binary)
  ).body as Buffer;

describe('worldbooks and the books', () => {
  it('know what the world names and where each comes from', async () => {
    const { a, gm } = await worldA();
    expect(ruleRefs(a.db, null)).toEqual([
      { kind: 'class', name: 'Wizard' },
      { kind: 'species', name: 'Bookfolk' },
      { kind: 'species', name: 'Openling' },
    ]);
    const s = (await request(gm).get('/api/worldbooks/share/books')).body;
    expect(s.books).toEqual([{ name: 'Test Book', things: [{ kind: 'species', name: 'Bookfolk' }] }]);
    // A small species of speed 30 stands in with a small SRD one.
    expect(s.standIns).toEqual([{ kind: 'species', name: 'Bookfolk', book: 'Test Book', standIn: 'Gnome' }]);
    expect(s.choices.species).toEqual(expect.arrayContaining(['Human', 'Gnome']));
    expect(s.open).toEqual([{ id: 'open-extras', name: 'Open Extras', source: 'Open Publisher, CC BY 4.0' }]);
  });

  it('safe mode: the stand-in where the book is missing, the original where it is; open rules travel', async () => {
    const { gm } = await worldA();
    const file = await share(gm, 'safe', { 'species:Bookfolk': 'Halfling' });
    const { manifest, files } = readWorldbook(file);
    expect(manifest.rules).toMatchObject({ mode: 'safe', standIns: [{ kind: 'species', name: 'Bookfolk', book: 'Test Book', standIn: 'Halfling' }] });
    // Only the open entries the world names travel, with their credit; never the book's.
    const open = JSON.parse(files.find((f) => f.path === 'open-rules/open-extras.json')!.data.toString('utf8'));
    expect(open).toMatchObject({ name: 'Open Extras', source: 'Open Publisher, CC BY 4.0', entries: [{ kind: 'species', name: 'Openling' }] });
    expect(files.map((f) => f.data.toString('utf8')).join('\n')).not.toContain('See in the dark');

    // GM B has neither the book nor the open pack.
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Inkmark.worldbook');
    const started = (await request(gmB).post('/api/libraries/from-worldbook/inkmark').send({})).body;
    expect(started.books).toMatchObject({ mode: 'safe', missing: [{ book: 'Test Book', things: [{ kind: 'species', name: 'Bookfolk' }] }], standIns: 1 });
    expect(started.booksOnly).toBeNull();
    const rules = (await request(gmB).get('/api/player/rules')).body;
    // Bookfolk plays as the stand-in, saying so; Openling came with the worldbook.
    expect(rules.species.Bookfolk).toMatchObject({ size: ['Small'], source: expect.stringContaining('standing in for Bookfolk (Test Book)') });
    expect(rules.species.Openling).toBeTruthy();
    expect(rules.species.Unusedling).toBeUndefined();

    // GM C has the book: the original, and the new library uses the books alone (kept for what they lack).
    const c = tempContext();
    const gmC = createApp(c);
    await request(gmC).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');
    await request(gmC).post('/api/worldbooks/add').attach('file', file, 'Inkmark.worldbook');
    const startedC = (await request(gmC).post('/api/libraries/from-worldbook/inkmark').send({})).body;
    expect(startedC.books.missing).toEqual([]);
    expect(startedC.booksOnly).toMatchObject({ on: true, keep: expect.arrayContaining(['class', 'spell']) });
    const rulesC = (await request(gmC).get('/api/player/rules')).body;
    expect(rulesC.species.Bookfolk.traits).toEqual([{ name: 'Ink Sight', text: 'See in the dark.' }]);
    // Books only, with the book's species alone: the SRD's species and the bundled open one are set aside.
    expect(Object.keys(rulesC.species)).toEqual(['Bookfolk']);
    // Classes are kept (the book has none), so Mira's Wizard still works.
    expect(rulesC.classes.Wizard).toBeTruthy();
  });

  it('required: can’t be added without the books; optional: added with a warning', async () => {
    const { gm } = await worldA();
    const required = await share(gm, 'required');
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', required, 'Inkmark.worldbook');
    const before = (await request(gmB).get('/api/libraries')).body.libraries.length;
    const refused = await request(gmB).post('/api/libraries/from-worldbook/inkmark').send({});
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/needs books you haven't imported: Test Book \(Bookfolk\)/);
    // No library was left behind, and the open one is unchanged.
    expect((await request(gmB).get('/api/libraries')).body.libraries.length).toBe(before);
    expect((await request(gmB).post('/api/setting-packs/inkmark/install')).status).toBe(400);
    // With the book it goes in.
    await request(gmB).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');
    expect((await request(gmB).post('/api/setting-packs/inkmark/install')).status).toBe(200);

    const optional = await share(gm, 'optional');
    const c = tempContext();
    const gmC = createApp(c);
    await request(gmC).post('/api/worldbooks/add').attach('file', optional, 'Inkmark.worldbook');
    const added = (await request(gmC).post('/api/setting-packs/inkmark/install')).body;
    expect(added.books).toMatchObject({ mode: 'optional', missing: [{ book: 'Test Book' }], standIns: 0 });
    expect((await request(gmC).get('/api/player/rules')).body.species.Bookfolk).toBeUndefined();
  });

  it('a book the worldbook needs is switched on in the library that adds it', async () => {
    const { gm } = await worldA();
    const file = await share(gm, 'optional');
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');
    await request(gmB).patch('/api/rules/packs/test-book').send({ enabled: false });
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Inkmark.worldbook');
    const added = (await request(gmB).post('/api/setting-packs/inkmark/install')).body;
    expect(added.books.switchedOn).toEqual(['Test Book']);
    expect((await request(gmB).get('/api/player/rules')).body.species.Bookfolk).toBeTruthy();
  });

  it('creatures its encounter tables roll: found in the rules, stood in for by type and challenge, reported', async () => {
    const a = tempContext();
    const gm = createApp(a);
    // A book creature (from a 5etools import, as books' creatures are) and an encounter table that rolls it.
    saveRulesPack(a.db, { id: 'test-bestiary', name: 'Test Bestiary', source: 'Test Bestiary of Testing' }, [
      { kind: 'creature', name: 'Inkdrake', cls: '', data: { name: 'Inkdrake', meta: 'Large Dragon, Neutral', cr: '3', ac: 15, hpAvg: 60 } },
    ]);
    randomTables.create(a.db, {
      name: 'Encounters: the Ink Coast, levels 1 to 4',
      die: 'd2',
      entries: [
        { weight: 1, text: '**Fight.** Two Inkdrakes circle the lighthouse.' },
        { weight: 1, text: '**Fight.** 4 Bandits and a Bandit Captain [NPC-0001] on the road.' },
      ],
      source: 'user',
      kind: 'encounter',
    });
    expect(ruleRefs(a.db, null)).toEqual([
      { kind: 'creature', name: 'Bandit' },
      { kind: 'creature', name: 'Bandit Captain' },
      { kind: 'creature', name: 'Inkdrake' },
    ]);
    const s = (await request(gm).get('/api/worldbooks/share/books')).body;
    expect(s.books).toEqual([{ name: 'Test Bestiary', things: [{ kind: 'creature', name: 'Inkdrake' }] }]);
    // A large dragon of challenge 3 stands in with an SRD dragon of the nearest challenge.
    const standIn = s.standIns.find((x: { name: string }) => x.name === 'Inkdrake').standIn as string;
    expect(standIn).toMatch(/Dragon/);
    expect(creatureByName(a.db, standIn)).toMatchObject({ meta: expect.stringMatching(/Dragon/) });

    // Shared in safe mode, added where there's no bestiary: the table's Inkdrake is the stand-in, saying so.
    const file = (await request(gm).get('/api/worldbooks/share').query({ name: 'Ink Coast', books: 'safe' }).buffer(true).parse(binary)).body as Buffer;
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/worldbooks/add').attach('file', file, 'Ink Coast.worldbook');
    const started = (await request(gmB).post('/api/libraries/from-worldbook/ink-coast').send({})).body;
    expect(started.books.missing).toEqual([{ book: 'Test Bestiary', things: [{ kind: 'creature', name: 'Inkdrake' }] }]);
    expect(creatureByName(b.db, 'Inkdrake')).toMatchObject({ name: 'Inkdrake', source: expect.stringContaining('standing in for Inkdrake (Test Bestiary)'), meta: expect.stringMatching(/Dragon/) });
    // Where the bestiary is, the original.
    saveRulesPack(b.db, { id: 'test-bestiary', name: 'Test Bestiary', source: 'Test Bestiary of Testing' }, [
      { kind: 'creature', name: 'Inkdrake', cls: '', data: { name: 'Inkdrake', meta: 'Large Dragon, Neutral', cr: '3', ac: 15, hpAvg: 60 } },
    ]);
    expect(creatureByName(b.db, 'Inkdrake')).toMatchObject({ ac: 15, hpAvg: 60 });
  });

  it('the Worldkeeper worldbook says which of its species and treasure aren’t in the SRD, by book where it knows', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const r = (await request(gm).post('/api/setting-packs/worldkeeper/install')).body;
    const books = r.books.missing as { book: string; things: { kind: string; name: string }[] }[];
    const xge = books.find((x) => x.book === "Xanathar's Guide to Everything");
    expect(xge?.things).toEqual(expect.arrayContaining([{ kind: 'item', name: 'Moon-Touched Sword (XGE)' }]));
    const other = books.find((x) => x.book === 'Not in your rules');
    expect(other?.things).toEqual(expect.arrayContaining([{ kind: 'class', name: 'Artificer' }]));
    // The world's own species (v0.9.0) cover its peoples: none is missing.
    expect(books.flatMap((x) => x.things).filter((t) => t.kind === 'species')).toEqual([]);
    // SRD species and items aren't listed.
    expect(books.flatMap((x) => x.things).map((t) => t.name)).not.toContain('Halfling');
    expect(itemByName(ctx.db, 'Bag of Holding')).toBeTruthy();
  });
});
