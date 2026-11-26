/**
 * Who may speak to the app's servers (v0.9.23, docs/BETA_PLAN.md A7). Before this, any web page open in the GM's
 * browser could post to the GM's server (open the table, restore a backup over the world), and a page that pointed
 * a name of its own at 127.0.0.1 could read everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { fromOwnPages, hostAllowed, hostName } from '../server/src/guard.js';
import { recoveryApp } from '../server/src/recovery.js';
import { closeTable, tableStatus } from '../server/src/table.js';
import { listBackups } from '../server/src/backup/backup.js';

describe('the address the app is asked for by', () => {
  it('may be an IP address, this computer’s own name, or a name only a home network has', () => {
    for (const host of ['127.0.0.1:4310', '127.0.0.1', 'localhost:43110', 'LOCALHOST', '[::1]:4310', '192.168.1.20:4320', '10.0.0.5', 'gm-laptop:4320', 'gm-laptop.local:4320', 'tower.lan', 'nas.home.arpa:4330', 'box.internal'])
      expect(hostAllowed(host, []), host).toBe(true);
  });

  it('may not be a name that someone else’s name service could answer for', () => {
    for (const host of ['evil.example:4310', 'evil.example', 'a.127.0.0.1.nip.io:4310', '127.0.0.1.evil.example', 'localhost.evil.example:4310', 'example.com.', 'xn--80ak6aa92e.com', '', undefined])
      expect(hostAllowed(host, []), String(host)).toBe(false);
    // Unless the GM has said this name is theirs (the app behind a name of their own).
    expect(hostAllowed('keeper.example.org:443', ['keeper.example.org'])).toBe(true);
    expect(hostAllowed('other.example.org', ['keeper.example.org'])).toBe(false);
  });

  it('is read without its port, IPv6 included', () => {
    expect(hostName('127.0.0.1:4310')).toBe('127.0.0.1');
    expect(hostName('[::1]:4310')).toBe('::1');
    expect(hostName('[fe80::1]')).toBe('fe80::1');
    expect(hostName('Gm-Laptop.Local:4320')).toBe('gm-laptop.local');
  });
});

describe('where a request that changes something comes from', () => {
  it('is the app’s own pages when the browser says so, or no browser at all', () => {
    expect(fromOwnPages({ host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310' })).toBe(true);
    expect(fromOwnPages({ host: '192.168.1.20:4320', origin: 'http://192.168.1.20:4320' })).toBe(true);
    expect(fromOwnPages({ host: '127.0.0.1:4310', 'sec-fetch-site': 'same-origin' })).toBe(true);
    // A script on the computer itself (curl, the tests): it says neither.
    expect(fromOwnPages({ host: '127.0.0.1:4310' })).toBe(true);
  });

  it('is not another site, another port of this computer, or a page with no address', () => {
    expect(fromOwnPages({ host: '127.0.0.1:4310', origin: 'https://evil.example' })).toBe(false);
    expect(fromOwnPages({ host: '127.0.0.1:4310', origin: 'http://127.0.0.1:8080' })).toBe(false);
    expect(fromOwnPages({ host: '127.0.0.1:4310', origin: 'http://localhost:4310' })).toBe(false);
    expect(fromOwnPages({ host: '127.0.0.1:4310', origin: 'null' })).toBe(false);
    expect(fromOwnPages({ host: '127.0.0.1:4310', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(fromOwnPages({ host: '127.0.0.1:4310', 'sec-fetch-site': 'same-site' })).toBe(false);
  });
});

describe('the GM’s server', () => {
  it('reads nothing out to a name a stranger pointed at this computer', async () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    await request(app).post('/api/entities').send({ type: 'npc', realm: 'world', name: 'Mirelle the Unseen' }).expect(200);
    const res = await request(app).get('/api/entities').set('Host', 'evil.example:4310').expect(403);
    expect(JSON.stringify(res.body)).not.toContain('Mirelle');
    expect(res.body.error).toContain('WORLDKEEPER_ALLOWED_HOSTS');
    for (const url of ['/api/health', '/api/meta', '/api/export/json', '/api/diagnostics', '/api/libraries/everything']) await request(app).get(url).set('Host', 'rebind.attacker.example').expect(403);
    // Its own address still answers.
    expect((await request(app).get('/api/entities').expect(200)).body).toHaveLength(1);
    await request(app).get('/api/entities').set('Host', 'localhost:4310').expect(200);
  });

  it('does nothing a page on another site asks of it', async () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    const made = (await request(app).post('/api/entities').send({ type: 'npc', realm: 'world', name: 'Corvin' }).expect(200)).body as { id: string };
    const stranger = { Origin: 'https://evil.example' };

    // Opening the table to the network: what a plain form on any page could do before.
    await request(app).post('/api/table').set(stranger).set('Content-Type', 'text/plain').send('').expect(403);
    expect(tableStatus().open).toBe(false);

    // A backup of the stranger's making, restored over the GM's world: a file upload needs no permission either.
    const before = listBackups(ctx.paths).length;
    await request(app).post('/api/backups/restore-upload').set(stranger).attach('backup', Buffer.from('not a backup'), 'world.wkbackup.zip').expect(403);
    await request(app).post('/api/backups').set(stranger).expect(403);
    expect(listBackups(ctx.paths).length).toBe(before);

    // And the ordinary ways of changing things.
    await request(app).post('/api/entities').set(stranger).send({ type: 'npc', realm: 'world', name: 'Planted' }).expect(403);
    await request(app).patch(`/api/entities/${made.id}`).set(stranger).send({ name: 'Renamed' }).expect(403);
    await request(app).put('/api/settings').set(stranger).send({ app_name: 'Owned' }).expect(403);
    await request(app).post('/api/setup/skip').set({ 'Sec-Fetch-Site': 'cross-site' }).expect(403);
    await request(app).post('/api/entities').set({ Origin: 'null' }).send({ type: 'npc', realm: 'world', name: 'From a file' }).expect(403);
    const all = (await request(app).get('/api/entities')).body as { name: string }[];
    expect(all.map((e) => e.name)).toEqual(['Corvin']);
  });

  it('still does what its own pages ask, and what a script on the computer asks', async () => {
    const ctx = tempContext();
    const app = createApp(ctx);
    // supertest speaks to 127.0.0.1:<port>; the browser would say the same in Origin.
    const res = await request(app).post('/api/entities').set('Sec-Fetch-Site', 'same-origin').send({ type: 'npc', realm: 'world', name: 'Sorrel' }).expect(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    // As a browser says it: the address asked for, and the same address as where the page came from.
    for (const host of ['127.0.0.1:43110', 'localhost:4310', '192.168.1.20:4330'])
      await request(app).post('/api/entities').set('Host', host).set('Origin', `http://${host}`).send({ type: 'npc', realm: 'world', name: `From ${host}` }).expect(200);
    // The table can still be opened from the app itself.
    await request(app).post('/api/table').send({ open: false }).expect(200);
    await closeTable();
  });
});

describe('the table’s server, and the page shown when no library opens', () => {
  it('hold to the same two rules', async () => {
    const ctx = tempContext();
    const table = createApp(new AppContext(ctx.paths, 'player'));
    await request(table).get('/api/player/info').expect(200);
    await request(table).get('/api/player/info').set('Host', 'evil.example').expect(403);
    await request(table).get('/api/player/info').set('Host', '192.168.1.20:4320').expect(200);
    await request(table).get('/api/player/info').set('Host', 'gm-laptop.local:4320').expect(200);
    await request(table).post('/api/player/me/NOSUCHCODE/roll').set('Origin', 'https://evil.example').send({}).expect(403);

    let retried = 0;
    const recovery = recoveryApp(
      () => ({ error: new Error('file is not a database'), rootDir: ctx.paths.rootDir, library: null, version: '0' }),
      () => (retried++, false),
    );
    await request(recovery).get('/').set('Host', 'evil.example').expect(403);
    await request(recovery).post('/recover').set('Origin', 'https://evil.example').type('form').send({ library: 'x' }).expect(403);
    expect(retried).toBe(0);
    await request(recovery).post('/recover').type('form').send({}).expect(303);
    expect(retried).toBe(1);
  });
});

describe('nothing else answers before the guard', () => {
  it('is the first thing each server does', () => {
    const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
    // In the app: straight after it is made, before the sign-in gate, the body is read or any route is added.
    const app = src('server/src/app.ts');
    expect(app.indexOf('app.use(guard())')).toBeGreaterThan(0);
    for (const later of ['app.use(opts.gate)', 'express.json(', "app.get('/api/health'", "app.use('/api/player'"]) expect(app.indexOf('app.use(guard())'), later).toBeLessThan(app.indexOf(later));
    const recovery = src('server/src/recovery.ts');
    expect(recovery.indexOf('app.use(guard())')).toBeLessThan(recovery.indexOf('app.post('));
    expect(recovery.indexOf('app.use(guard())')).toBeLessThan(recovery.indexOf("app.get('/api/health'"));
  });
});
