/** Open the table: the GM's server serves the player-only table on the network itself (v0.6.1). */
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { AppContext } from '../server/src/context.js';
import { closeTable, tableStatus } from '../server/src/table.js';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

afterEach(async () => {
  await closeTable();
  delete process.env.WORLDKEEPER_TABLE_PORT;
});

describe('opening the table from the GM app', () => {
  it('serves only the players’ routes, from the library the GM has open, until closed', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    await request(gm).post('/api/entities').send({ name: 'Harrowgate', type: 'settlement', realm: 'world', body: '## A first look\n\nMills.' });
    await request(gm)
      .patch('/api/entities/SET-0001')
      .send({ revealed: true, revealed_sections: ['A first look'] });
    process.env.WORLDKEEPER_TABLE_PORT = String(await freePort());
    expect((await request(gm).get('/api/table')).body.open).toBe(false);

    const opened = (await request(gm).post('/api/table').send({ open: true })).body;
    expect(opened).toMatchObject({ open: true, port: Number(process.env.WORLDKEEPER_TABLE_PORT) });
    const table = `http://127.0.0.1:${opened.port}`;
    const names = async () => ((await (await fetch(`${table}/api/player/entities`)).json()) as { name: string }[]).map((e) => e.name);
    expect(await names()).toEqual(['Harrowgate']);
    // No GM routes on the table.
    expect((await fetch(`${table}/api/entities`)).status).toBe(404);
    expect((await fetch(`${table}/api/table`)).status).toBe(404);
    expect((await fetch(`${table}/api/libraries`)).status).toBe(404);
    expect(((await (await fetch(`${table}/api/player/info`)).json()) as { mode: string }).mode).toBe('player');
    // Opening again changes nothing.
    expect((await request(gm).post('/api/table').send({ open: true })).body.open).toBe(true);

    // It follows the GM to another library, at once.
    await request(gm).post('/api/libraries').send({ name: 'Second', open: true });
    expect(await names()).toEqual([]);

    expect((await request(gm).post('/api/table').send({ open: false })).body.open).toBe(false);
    await expect(fetch(`${table}/api/player/info`)).rejects.toThrow();
  });

  it('says so when the port is taken', async () => {
    const ctx = tempContext();
    const busy = net.createServer();
    const port = await new Promise<number>((resolve) => busy.listen(0, '0.0.0.0', () => resolve((busy.address() as net.AddressInfo).port)));
    process.env.WORLDKEEPER_TABLE_PORT = String(port);
    const r = await request(createApp(ctx)).post('/api/table').send({ open: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already in use/);
    expect(tableStatus().open).toBe(false);
    busy.close();
  });

  it('is not on the table server itself', async () => {
    const ctx = tempContext();
    expect(
      (
        await request(createApp(new AppContext(ctx.paths, 'player')))
          .post('/api/table')
          .send({ open: true })
      ).status,
    ).toBe(404);
  });
});
