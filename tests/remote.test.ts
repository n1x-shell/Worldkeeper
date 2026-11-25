/** The GM app from another device (v0.9.14, docs/BETA_PLAN.md B8): the network listener and its password. */
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { closeRemote, openRemote, remoteGate, setPassword } from '../server/src/remote.js';
import { getSecret } from '../server/src/publish/secrets.js';

afterEach(async () => {
  await closeRemote();
});

describe('the GM app on the network', () => {
  it('answers nothing of the library without a session, and everything with one', async () => {
    const ctx = tempContext();
    const local = createApp(ctx);
    await request(local).post('/api/entities').send({ name: 'The Secret Keep', type: 'landmark', realm: 'world' });
    setPassword(ctx.paths, 'correct horse battery');
    // Only a salted hash is kept, outside the library.
    expect(getSecret(ctx.paths, 'gm_remote_password')).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    expect(getSecret(ctx.paths, 'gm_remote_password')).not.toContain('correct');

    const net = createApp(ctx, { gate: remoteGate(ctx) });
    for (const url of ['/api/entities', '/api/campaigns', '/api/settings', '/api/player/index', '/api/uploads/x.png', '/api/export/json', '/api/backups', '/api/tags']) expect((await request(net).get(url)).status, url).toBe(401);
    expect((await request(net).post('/api/entities').send({ name: 'X', type: 'npc', realm: 'world' })).status).toBe(401);
    expect((await request(net).post('/api/import/preview').attach('archive', Buffer.from('x'), 'x.zip')).status).toBe(401);
    expect((await request(net).get('/api/entities')).body).toEqual({ error: 'Sign in to the GM app', signIn: true });
    // However the address is written: capitals, a slash at the end, no path at all.
    for (const url of ['/API/entities', '/Api/Entities/', '/api', '/api/', '/api/entities/', '/API/REMOTE']) expect((await request(net).get(url)).status, url).toBe(401);
    expect((await request(local).get('/API/entities')).status).toBe(200);
    // What may be asked without one: is this the network door, and am I signed in.
    expect((await request(net).get('/api/remote/session')).body).toEqual({ remote: true, signedIn: false });
    expect((await request(net).get('/api/health')).status).toBe(200);
    // On the computer itself nobody signs in.
    expect((await request(local).get('/api/remote/session')).body).toEqual({ remote: false, signedIn: true });

    const tablet = request.agent(net);
    expect((await tablet.post('/api/remote/login').send({ password: 'wrong' })).status).toBe(401);
    const ok = await tablet.post('/api/remote/login').send({ password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    const cookie = String(ok.headers['set-cookie']);
    expect(cookie).toMatch(/^wk_gm=[\w-]{40,}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
    expect((await tablet.get('/api/remote/session')).body).toEqual({ remote: true, signedIn: true });
    expect((await tablet.get('/api/entities')).body.map((e: { name: string }) => e.name)).toEqual(['The Secret Keep']);
    expect((await tablet.post('/api/entities').send({ name: 'Made on the tablet', type: 'npc', realm: 'world' })).status).toBe(200);
    // A made-up or stale cookie is nobody.
    expect((await request(net).get('/api/entities').set('Cookie', 'wk_gm=not-a-session')).status).toBe(401);

    // The password and the door itself are changed only on the computer.
    expect((await tablet.get('/api/remote')).status).toBe(403);
    expect((await tablet.put('/api/remote/password').send({ password: 'something else' })).status).toBe(403);
    expect((await tablet.post('/api/remote').send({ open: false })).status).toBe(403);
    // A change sent from another site's page in the same browser is refused; the app's own pages are let through.
    expect((await tablet.post('/api/entities').set('Origin', 'http://evil.example').set('Host', '192.168.1.5:4311').send({ name: 'Y', type: 'npc', realm: 'world' })).status).toBe(403);
    expect((await tablet.post('/api/entities').set('Origin', 'http://192.168.1.5:4311').set('Host', '192.168.1.5:4311').send({ name: 'Z', type: 'npc', realm: 'world' })).status).toBe(200);

    expect((await tablet.post('/api/remote/logout')).body).toEqual({ remote: true, signedIn: false });
    expect((await tablet.get('/api/entities')).status).toBe(401);
  });

  it('locks out after wrong passwords, and a new password signs everyone out', async () => {
    const ctx = tempContext();
    setPassword(ctx.paths, 'first password');
    const net = createApp(ctx, { gate: remoteGate(ctx) });
    const tablet = request.agent(net);
    await tablet.post('/api/remote/login').send({ password: 'first password' });
    expect((await tablet.get('/api/entities')).status).toBe(200);

    for (let i = 0; i < 5; i++) expect((await request(net).post('/api/remote/login').send({ password: `guess ${i}` })).status).toBe(401);
    // Locked: even the right password waits.
    const locked = await request(net).post('/api/remote/login').send({ password: 'first password' });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/Try again in \d+ seconds/);
    // Someone already signed in isn't thrown out by another's guesses.
    expect((await tablet.get('/api/entities')).status).toBe(200);

    setPassword(ctx.paths, 'second password');
    expect((await tablet.get('/api/entities')).status).toBe(401);
    expect((await request(net).post('/api/remote/login').send({ password: 'first password' })).status).toBe(401);
    expect((await request(net).post('/api/remote/login').send({ password: 'second password' })).status).toBe(200);
    // Not a password: nothing, a number, something huge.
    expect((await request(net).post('/api/remote/login').send({})).status).toBe(401);
    expect((await request(net).post('/api/remote/login').send({ password: 12345678 })).status).toBe(401);
    expect((await request(net).post('/api/remote/login').send({ password: 'x'.repeat(10000) })).status).toBe(400);
    expect(() => setPassword(ctx.paths, 'short')).toThrow(/at least 8/);
  });

  it('is opened and closed from the computer, never without a password, and closed at the start', async () => {
    const ctx = tempContext();
    const local = createApp(ctx);
    expect((await request(local).get('/api/remote')).body).toMatchObject({ open: false, hasPassword: false, sessions: 0 });
    expect((await request(local).post('/api/remote').send({ open: true })).status).toBe(400);
    expect((await request(local).put('/api/remote/password').send({ password: 'short' })).status).toBe(400);
    expect((await request(local).put('/api/remote/password').send({ password: 'a long enough one' })).body).toMatchObject({ hasPassword: true, open: false });

    // On a port of its own (any free one here); the GM's own listener is untouched.
    const st = await openRemote(ctx, { port: 0, host: '127.0.0.1' });
    expect(st.open).toBe(true);
    const base = `http://127.0.0.1:${st.port}`;
    expect((await fetch(`${base}/api/entities`)).status).toBe(401);
    const login = await fetch(`${base}/api/remote/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'a long enough one' }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect((await fetch(`${base}/api/entities`, { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await request(local).get('/api/remote')).body).toMatchObject({ open: true, sessions: 1 });

    // Signing everyone out, then taking the password away, which shuts the door.
    expect((await request(local).post('/api/remote/sign-out-all')).body.sessions).toBe(0);
    expect((await fetch(`${base}/api/entities`, { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await request(local).put('/api/remote/password').send({ password: null })).body).toMatchObject({ open: false, hasPassword: false });
    await expect(fetch(`${base}/api/health`)).rejects.toThrow();
  });
});
