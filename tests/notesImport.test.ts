/** Bring your notes (v0.9.11, docs/BETA_PLAN.md B6): an Obsidian vault or plain Markdown, through the importer. */
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { guessFolder, looksLikeNotes, splitFrontMatter } from '../server/src/import/notes.js';
import { types } from '../server/src/repo/recordTypes.js';
import { readNotesZip } from '../server/src/import/notes.js';
import { zipStored } from '../shared/zipParts.js';

/** Enough of a PNG for the app to know it's one. */
function png() {
  const b = Buffer.alloc(34);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  return b;
}

function vault() {
  const zip = new AdmZip();
  const add = (p: string, text: string | Buffer) => zip.addFile(`My Vault/${p}`, typeof text === 'string' ? Buffer.from(text) : text);
  add('.obsidian/app.json', '{}');
  add(
    'NPCs/Mara Venn.md',
    `---
aliases: [The Red Whisper, "Mara"]
tags:
  - ally
  - harbor
race: Elf
home town: "[[Harrowgate]]"
---
# Mara Venn

A fence in [[Harrowgate]], and an old hand of [[Thieves Guild|the Guild]]. %%check her age%%
She once worked with [[Nobody Here]]. #spy

![[mara.png]]

## Secrets
She reports to [[Places/Harrowgate#The Keep|the keep]].
`,
  );
  add('Places/Harrowgate.md', '# Harrowgate\n\nA harbour town. ![the harbour](../attachments/harbour.png)\n\n## The Keep\nOld stone.\n');
  add('Factions/Thieves Guild.md', '---\ntype: Faction\n---\nThey run the docks. See [[Mara Venn]].\n');
  add('Sessions/Session 1.md', 'We met in a tavern.\n');
  add('Loose thoughts.md', 'An idea about the moon.\n');
  add('attachments/mara.png', png());
  add('attachments/harbour.png', png());
  add('attachments/unused.png', png());
  return zip.toBuffer();
}

describe('reading notes', () => {
  it('reads front matter as notes use it', () => {
    const { front, body } = splitFrontMatter('---\ntitle: "The Keep"\naliases: [Old Keep, \'The Rock\']\ntags:\n  - place\n  - ruin\nempty:\n---\nBody here.\n');
    expect(front).toEqual({ title: 'The Keep', aliases: ['Old Keep', 'The Rock'], tags: ['place', 'ruin'], empty: [] });
    expect(body).toBe('Body here.\n');
    expect(splitFrontMatter('No front matter.\n---\nA rule, not YAML.')).toEqual({ front: {}, body: 'No front matter.\n---\nA rule, not YAML.' });
  });

  it('guesses what a folder holds, and knows notes from this app’s own files', () => {
    const reg = types(tempContext().db);
    expect([guessFolder('NPCs', reg), guessFolder('World/02 - Places', reg), guessFolder('Factions', reg), guessFolder('Bestiary', reg), guessFolder('Session Notes', reg), guessFolder('Templates', reg), guessFolder('Misc', reg), guessFolder('', reg)]).toEqual([
      'npc',
      'landmark',
      'faction',
      'creature',
      'skip',
      'skip',
      null,
      null,
    ]);
    expect(looksLikeNotes([{ path: 'a.md', content: '# A\n\ntext' }])).toBe(true);
    expect(looksLikeNotes([{ path: 'a.md', content: 'ID: NPC-001\nName: A\n\ntext' }])).toBe(false);
  });
});

describe('a folder chosen in the browser', () => {
  it('is zipped there as it is, and read like any archive', () => {
    const enc = new TextEncoder();
    const zip = Buffer.concat(
      zipStored([
        { name: 'Vault/NPCs/Émile.md', data: enc.encode('# Émile\n\nA baker. ![[bread.png]]\n') },
        { name: 'Vault/pics/bread.png', data: new Uint8Array(png()) },
        { name: 'Vault/.obsidian/app.json', data: enc.encode('{}') },
      ]),
    );
    // A real archive: another reader opens it and finds what went in.
    expect(new AdmZip(zip).getEntries().map((e) => [e.entryName, e.getData().length])).toEqual([
      ['Vault/NPCs/Émile.md', 34],
      ['Vault/pics/bread.png', 34],
      ['Vault/.obsidian/app.json', 2],
    ]);
    const a = readNotesZip(zip);
    expect(a.notes.map((n) => n.path)).toEqual(['NPCs/Émile.md']);
    expect([...a.pictures.keys()]).toEqual(['pics/bread.png']);
  });
});

describe('bringing a vault in', () => {
  it('scans, previews with the GM’s choices, and makes linked records with their pictures', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    const scan = (await request(gm).post('/api/import/notes/scan').attach('archive', vault(), 'My Vault.zip')).body;
    expect(scan).toMatchObject({ notes: 5, pictures: 3, looksLikeNotes: true });
    expect(scan.folders.map((f: { path: string; notes: number; guess: string | null }) => [f.path, f.notes, f.guess])).toEqual([
      ['', 1, null],
      ['Factions', 1, 'faction'],
      ['NPCs', 1, 'npc'],
      ['Places', 1, 'landmark'],
      ['Sessions', 1, 'skip'],
    ]);
    const realm = scan.realms[0].name as string;
    const preview = (
      await request(gm)
        .post('/api/import/notes/preview')
        .send({ token: scan.token, folders: { NPCs: 'npc', Places: 'settlement', Sessions: 'skip' }, fallback: 'custom', realm })
    ).body;
    expect(preview.notes).toEqual({ skipped: [{ path: 'Sessions/Session 1.md', reason: 'Its folder is left out' }], unresolvedLinks: 1, pictures: 2 });
    expect(preview.entities.map((e: { name: string; type: string; action: string }) => [e.name, e.type, e.action]).sort()).toEqual([
      ['Harrowgate', 'settlement', 'create'],
      ['Loose thoughts', 'custom', 'create'],
      ['Mara Venn', 'npc', 'create'],
      ['Thieves Guild', 'faction', 'create'],
    ]);
    // Nothing is written until it is confirmed.
    expect((await request(gm).get('/api/entities')).body).toHaveLength(0);
    const done = (await request(gm).post('/api/import/commit').send({ token: preview.token })).body;
    expect(done.pictures).toBe(2);

    const all = (await request(gm).get('/api/entities')).body as { id: string; name: string; type: string }[];
    const id = (n: string) => all.find((e) => e.name === n)!.id;
    expect(id('Mara Venn')).toMatch(/^NPC-\d{4}$/);
    const mara = (await request(gm).get(`/api/entities/${id('Mara Venn')}`)).body.entity as { aliases: string[]; tags: string[]; fields: [string, string][]; body: string; canon_status: string };
    expect(mara.aliases).toEqual(['The Red Whisper', 'Mara']);
    expect(mara.tags).toEqual(expect.arrayContaining(['ally', 'harbor', 'spy']));
    expect(mara.fields).toEqual(expect.arrayContaining([['Race', 'Elf'], ['Home town', 'Harrowgate']]));
    expect(mara.canon_status).toBe('CANON');
    // Links name their records; a link to nothing is plain words; the comment, the title and the embed are gone.
    expect(mara.body).toContain(`Harrowgate [${id('Harrowgate')}]`);
    // A link shown in other words keeps the words.
    expect(mara.body).toContain(`an old hand of the Guild [${id('Thieves Guild')}]`);
    expect(mara.body).toContain(`She reports to the keep [${id('Harrowgate')}].`);
    expect(mara.body).toContain('worked with Nobody Here.');
    expect(mara.body).toContain('## Secrets');
    expect(mara.body).not.toMatch(/%%|\[\[|!\[|^# Mara Venn/m);
    // The records are linked, so the graph and "mentioned in" have them.
    const rels = (await request(gm).get(`/api/entities/${id('Mara Venn')}`)).body.relationships as { other_id?: string; target_id?: string; source_id?: string }[];
    expect(JSON.stringify(rels)).toContain(id('Harrowgate'));
    // The embedded pictures are the records' pictures (GM only); the unused one stays behind.
    const pics = (await request(gm).get(`/api/entities/${id('Mara Venn')}/images`)).body as { file: string; player_visible: boolean }[];
    expect(pics).toHaveLength(1);
    expect(pics[0].player_visible).toBe(false);
    expect((await request(gm).get(`/api/entities/${id('Harrowgate')}/images`)).body).toHaveLength(1);
    expect((ctx.db.prepare('SELECT COUNT(*) n FROM entity_images').get() as { n: number }).n).toBe(2);

    // Brought in again: the same records (by name and type), nothing new, no picture twice.
    const again = (await request(gm).post('/api/import/notes/scan').attach('archive', vault(), 'My Vault.zip')).body;
    const p2 = (await request(gm).post('/api/import/notes/preview').send({ token: again.token, folders: { NPCs: 'npc', Places: 'settlement', Sessions: 'skip' }, fallback: 'custom', realm })).body;
    expect(new Set(p2.entities.map((e: { action: string }) => e.action))).toEqual(new Set(['unchanged']));
    expect((await request(gm).post('/api/import/commit').send({ token: p2.token })).body.pictures).toBe(0);
    expect((await request(gm).get('/api/entities')).body).toHaveLength(4);
    // The GM's own notes don't switch canon review on: what they write next is still canon.
    expect((await request(gm).post('/api/entities').send({ name: 'A new place', type: 'landmark', realm: 'world' })).body.canon_status).toBe('CANON');
  });

  it('refuses what isn’t notes, and holds nothing once the choices are stale', async () => {
    const gm = createApp(tempContext());
    expect((await request(gm).post('/api/import/notes/scan')).status).toBe(400);
    const empty = new AdmZip();
    empty.addFile('readme.txt', Buffer.from('x'));
    expect((await request(gm).post('/api/import/notes/scan').attach('archive', empty.toBuffer(), 'x.zip')).status).toBe(400);
    expect((await request(gm).post('/api/import/notes/preview').send({ token: 'nope', realm: 'The World' })).status).toBe(400);
    const scan = (await request(gm).post('/api/import/notes/scan').attach('archive', vault(), 'v.zip')).body;
    const all = Object.fromEntries((scan.folders as { path: string }[]).map((f) => [f.path, 'skip']));
    expect((await request(gm).post('/api/import/notes/preview').send({ token: scan.token, folders: all, realm: scan.realms[0].name })).status).toBe(400);
  });
});
