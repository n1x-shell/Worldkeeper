/** Back up everything (v0.6.3): every library and what they share, in one file; opening it adds, never replaces. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';

function rulesPack(name: string, spell: string) {
  const zip = new AdmZip();
  zip.addFile('pack.md', Buffer.from(`Pack: ${name}\nSource: Homebrew\n`));
  zip.addFile(
    'spells/s.md',
    Buffer.from(`Kind: spell\nName: ${spell}\nLevel: 1\nSchool: Evocation\nClasses: Wizard\nCasting Time: Action\nRange: 60 feet\nComponents: V\nDuration: Instantaneous\n\nZap.`),
  );
  return zip.toBuffer();
}

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('back up everything', () => {
  it('carries every library, the books’ rules and the packs, never the token; opening it adds them', async () => {
    // An installation with two libraries, a rules pack, a setting pack folder and a publishing token.
    const a = tempContext();
    const gmA = createApp(a);
    await request(gmA).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', body: '' });
    fs.writeFileSync(path.join(a.paths.uploadsDir, 'map.png'), 'png');
    await request(gmA).post('/api/rules/packs').attach('pack', rulesPack('Old Book', 'Glimmer Bolt'), 'p.zip');
    fs.mkdirSync(path.join(a.paths.sharedDir, 'packs', 'the-isle'), { recursive: true });
    fs.writeFileSync(path.join(a.paths.sharedDir, 'packs', 'the-isle', 'pack.json'), '{"id":"the-isle"}');
    fs.writeFileSync(path.join(a.paths.sharedDir, 'secrets.json'), '{"github_token":"ghp_SECRET"}');
    await request(gmA).post('/api/libraries').send({ name: 'Ostmark', open: true });
    await request(gmA).post('/api/entities').send({ name: 'Brennhaven', type: 'settlement', realm: 'world', body: '' });
    // A library made and never opened has no database yet: it still comes along, empty.
    await request(gmA).post('/api/libraries').send({ name: 'Not yet begun' });

    const file = (await request(gmA).get('/api/libraries/everything').buffer(true).parse(binary)).body as Buffer;
    const zip = new AdmZip(file);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('shared/rules.db');
    expect(names).toContain('shared/packs/the-isle/pack.json');
    expect(names.some((n) => n.endsWith('/uploads/map.png'))).toBe(true);
    expect(names.some((n) => n.includes('secrets') || n.includes('/backups/'))).toBe(false);
    expect(file.includes(Buffer.from('ghp_SECRET'))).toBe(false);

    // Another installation, with a library of its own and the same rules pack switched off.
    const b = tempContext();
    const gmB = createApp(b);
    await request(gmB).post('/api/entities').send({ name: 'Coldwater', type: 'settlement', realm: 'world', body: '' });
    await request(gmB).put('/api/settings').send({ app_name: 'B' });
    const r = (await request(gmB).post('/api/libraries/everything').attach('file', file, 'everything.zip')).body;
    expect(r.result.libraries.map((l: { name: string }) => l.name)).toEqual(['My library (from file)', 'Ostmark', 'Not yet begun']);
    expect(r.result.rules).toBe(1);
    expect(r.result.packs).toEqual(['the-isle']);
    expect(fs.existsSync(path.join(b.paths.sharedDir, 'packs', 'the-isle', 'pack.json'))).toBe(true);
    expect(fs.existsSync(path.join(b.paths.sharedDir, 'secrets.json'))).toBe(false);
    // Nothing of B's was replaced: still open, still its own.
    expect(((await request(gmB).get('/api/entities')).body as { name: string }[]).map((e) => e.name)).toEqual(['Coldwater']);
    // The libraries came over with their records and pictures.
    const from = r.libraries.find((l: { name: string }) => l.name === 'My library (from file)').id;
    await request(gmB).post(`/api/libraries/${from}/open`);
    expect(((await request(gmB).get('/api/entities')).body as { name: string }[]).map((e) => e.name)).toEqual(['Harrowgate']);
    expect(fs.existsSync(path.join(b.paths.uploadsDir, 'map.png'))).toBe(true);
    expect(((await request(gmB).get('/api/player/rules')).body.spells as { name: string }[]).some((s) => s.name === 'Glimmer Bolt')).toBe(true);
  });

  it('keeps a library’s own switch for a pack it already had, and ignores paths that leave their folder', async () => {
    const a = tempContext();
    const gmA = createApp(a);
    await request(gmA).post('/api/rules/packs').attach('pack', rulesPack('Book', 'Newer Bolt'), 'p.zip');
    const file = (await request(gmA).get('/api/libraries/everything').buffer(true).parse(binary)).body as Buffer;

    const b = tempContext();
    const gmB = createApp(b);
    b.db.prepare(`INSERT INTO shared.rules_packs (id, name, source, imported_at) VALUES ('book', 'Book', '', '2020-01-01T00:00:00Z')`).run();
    await request(gmB).patch('/api/rules/packs/book').send({ enabled: false });
    // A hostile entry trying to write outside the packs folder.
    const zip = new AdmZip(file);
    zip.addFile('shared/packs/evil/../../../escaped.txt', Buffer.from('x'));
    const r = (await request(gmB).post('/api/libraries/everything').attach('file', zip.toBuffer(), 'e.zip')).body;
    expect(r.result.rules).toBe(1);
    expect(((await request(gmB).get('/api/rules/packs')).body as { id: string; enabled: boolean }[]).find((p) => p.id === 'book')!.enabled).toBe(false);
    expect(fs.existsSync(path.join(b.paths.rootDir, 'escaped.txt'))).toBe(false);
    expect(fs.existsSync(path.join(b.paths.sharedDir, 'escaped.txt'))).toBe(false);
    // Not such a file.
    expect((await request(gmB).post('/api/libraries/everything').attach('file', Buffer.from('nope'), 'x.zip')).status).toBe(400);
  });
});
