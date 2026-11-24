/** Books only (docs/WORLDBOOKS_PLAN.md §2a): the open rules set aside in one library, kept only for what the books lack. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { creatureByName, itemByName } from '../server/src/repo/bookData.js';

function pack(files: Record<string, string>) {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text, 'utf8'));
  return zip.toBuffer();
}
// A book: spells, a species and a subclass, but no classes, creatures or items.
const BOOK = pack({
  'pack.md': 'Pack: Test Book\nSource: Test Book of Testing\n',
  'spells/booklight.md': 'Kind: spell\nName: Book Light\nLevel: 1\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action\nRange: Self\nComponents: V\nDuration: 1 hour\n\nLight.',
  'species/bookfolk.md': 'Kind: species\nName: Bookfolk\nSize: Medium\nSpeed: 30\n\nReaders.',
  'subclasses/pages.md': 'Kind: subclass\nName: Circle of Pages\nClass: Druid\n\nPages.\n\n## Level 3: Papercut\nOuch.',
});
// Open content (an Open5e-style pack): it counts as open rules.
const OPEN = pack({
  'pack.md': 'Pack: Open Extras\nSource: Open Publisher, CC BY 4.0\n',
  'spells/openbolt.md': 'Kind: spell\nName: Open Bolt\nLevel: 1\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action\nRange: 60 feet\nComponents: V\nDuration: Instantaneous\n\nZap.',
});

describe('books only', () => {
  it('needs books, says what they lack, sets the open rules aside, and puts them back', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const spells = async () => ((await request(gm).get('/api/player/rules')).body.spells as { name: string }[]).map((s) => s.name);

    // No books yet: it can't be turned on.
    expect((await request(gm).put('/api/rules/books-only').send({ on: true })).status).toBe(400);

    await request(gm).post('/api/rules/packs').attach('pack', OPEN, 'open.zip');
    // An open pack is not a book.
    expect((await request(gm).put('/api/rules/books-only').send({ on: true })).status).toBe(400);
    await request(gm).post('/api/rules/packs').attach('pack', BOOK, 'book.zip');

    const check = (await request(gm).get('/api/rules/books-only')).body;
    expect(check).toMatchObject({ on: false, keep: [] });
    expect(check.check.books).toEqual([{ id: 'test-book', name: 'Test Book' }]);
    // The book has no classes, backgrounds, feats, creatures or items; the SRD has them all.
    expect(check.check.gaps).toEqual(['class', 'background', 'feat', 'creature', 'item']);
    expect(await spells()).toEqual(expect.arrayContaining(['Book Light', 'Open Bolt', 'Magic Missile']));

    // On: the book's spells only; the open rules are kept for what the book lacks.
    const on = (await request(gm).put('/api/rules/books-only').send({ on: true })).body;
    expect(on).toMatchObject({ on: true, keep: ['class', 'background', 'feat', 'creature', 'item'] });
    expect(await spells()).toEqual(['Book Light']);
    const rules = (await request(gm).get('/api/player/rules')).body;
    expect(Object.keys(rules.species)).toEqual(['Bookfolk']);
    // Classes kept from the SRD (the book has none), with the book's subclass.
    expect(rules.classes.Druid.subclasses['Circle of Pages']).toBeTruthy();
    // The book has subclasses, so the SRD's are set aside.
    expect(rules.classes.Druid.subclasses['Circle of the Land']).toBeUndefined();
    expect(creatureByName(ctx.db, 'Goblin Minion')).toBeTruthy();

    // Nothing kept: no SRD classes, creatures or items at all.
    await request(gm).put('/api/rules/books-only').send({ on: true, keep: [] });
    expect((await request(gm).get('/api/player/rules')).body.classes).toEqual({ Druid: { features: [], subclasses: { 'Circle of Pages': expect.anything() } } });
    expect(creatureByName(ctx.db, 'Goblin Minion')).toBeNull();
    expect(itemByName(ctx.db, 'Bag of Holding')).toBeNull();
    // The pack switches are as they were.
    const packs = (await request(gm).get('/api/rules/packs')).body as { id: string; enabled: boolean }[];
    expect(packs.filter((p) => p.enabled).map((p) => p.id)).toEqual(expect.arrayContaining(['srd', 'open-extras', 'test-book']));

    // Off: everything back.
    expect((await request(gm).put('/api/rules/books-only').send({ on: false })).body).toMatchObject({ on: false, keep: [] });
    expect(await spells()).toEqual(expect.arrayContaining(['Book Light', 'Open Bolt', 'Magic Missile']));
    expect(creatureByName(ctx.db, 'Goblin Minion')).toBeTruthy();
  });
});
