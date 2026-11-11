import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { fixtureFiles, tempContext, zipOf } from './helpers.js';
import { readZip } from '../server/src/import/scan.js';
import { buildPlan, commitPlan } from '../server/src/import/importer.js';
import { createApp } from '../server/src/app.js';
import { updateEntity } from '../server/src/repo/entities.js';
import { maps } from '../server/src/repo/maps.js';
import { gitBlobSha } from '../server/src/publish/github.js';
import { exportJson } from '../server/src/backup/exporter.js';
import { createBackup } from '../server/src/backup/backup.js';

// ---- A small in-memory stand-in for the GitHub REST API (Git Data + Pages endpoints) ----
function fakeGitHub(opts: { token: string; pagesAllowed: boolean }) {
  const blobs = new Map<string, Buffer>();
  const trees = new Map<string, { path: string; sha: string; type: string; mode: string }[]>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  const refs = new Map<string, string>();
  let pages: { source: { branch: string; path: string }; html_url: string } | null = null;
  const calls: string[] = [];
  const authSeen: string[] = [];
  const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, res, next) => {
    calls.push(`${req.method} ${req.path}`);
    authSeen.push(String(req.headers.authorization));
    if (req.headers.authorization !== `Bearer ${opts.token}`) return res.status(401).json({ message: 'Bad credentials' });
    next();
  });
  const base = '/repos/me/handbook';
  app.get(base, (_q, r) => r.json({ full_name: 'me/handbook' }));
  app.get('/repos/:o/:r', (_q, r) => r.status(404).json({ message: 'Not Found' }));
  app.get(`${base}/git/ref/heads/:b`, (q, r) => (refs.has(q.params.b) ? r.json({ object: { sha: refs.get(q.params.b) } }) : r.status(404).json({ message: 'Not Found' })));
  app.get(`${base}/git/commits/:sha`, (q, r) => r.json({ sha: q.params.sha, tree: { sha: commits.get(q.params.sha)!.tree } }));
  app.get(`${base}/git/trees/:sha`, (q, r) => r.json({ sha: q.params.sha, tree: trees.get(q.params.sha), truncated: false }));
  app.post(`${base}/git/blobs`, (q, r) => {
    const data = Buffer.from(q.body.content, 'base64');
    const sha = gitBlobSha(data);
    blobs.set(sha, data);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/trees`, (q, r) => {
    const tree = q.body.tree as { path: string; sha: string; type: string; mode: string }[];
    for (const t of tree) if (!blobs.has(t.sha)) return r.status(422).json({ message: `missing blob ${t.sha}` });
    const sha = sha1(JSON.stringify(tree.map((t) => [t.path, t.sha])));
    trees.set(sha, tree);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/commits`, (q, r) => {
    const sha = sha1(JSON.stringify(q.body) + commits.size);
    commits.set(sha, q.body);
    r.status(201).json({ sha });
  });
  app.post(`${base}/git/refs`, (q, r) => {
    refs.set(q.body.ref.replace('refs/heads/', ''), q.body.sha);
    r.status(201).json({});
  });
  app.patch(`${base}/git/refs/heads/:b`, (q, r) => {
    const parent = commits.get(q.body.sha)!.parents[0];
    if (parent !== refs.get(q.params.b)) return r.status(422).json({ message: 'Update is not a fast forward' });
    refs.set(q.params.b, q.body.sha);
    r.json({});
  });
  app.get(`${base}/pages`, (_q, r) => (pages ? r.json(pages) : r.status(404).json({ message: 'Not Found' })));
  app.post(`${base}/pages`, (q, r) => {
    if (!opts.pagesAllowed) return r.status(403).json({ message: 'Resource not accessible by personal access token' });
    pages = { source: q.body.source, html_url: 'https://me.github.io/handbook/' };
    r.status(201).json(pages);
  });
  const filesOn = (branch: string) => {
    const tree = trees.get(commits.get(refs.get(branch)!)!.tree)!;
    return new Map(tree.map((t) => [t.path, blobs.get(t.sha)!]));
  };
  return { app, calls, authSeen, refs, commits, filesOn };
}

const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-site-'));
fs.mkdirSync(path.join(siteDir, 'assets'));
fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><div id="root"></div>');
fs.writeFileSync(path.join(siteDir, 'assets', 'app.js'), 'console.log("player app")');
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let server: import('node:http').Server;
let gh: ReturnType<typeof fakeGitHub>;

beforeAll(async () => {
  process.env.WORLDKEEPER_PLAYER_SITE_DIR = siteDir;
  gh = fakeGitHub({ token: 'test-token-123', pagesAllowed: true });
  await new Promise<void>((resolve) => {
    server = gh.app.listen(0, '127.0.0.1', () => resolve());
  });
  process.env.WORLDKEEPER_GITHUB_API = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server?.close();
  delete process.env.WORLDKEEPER_GITHUB_API;
  delete process.env.WORLDKEEPER_PLAYER_SITE_DIR;
});

function seeded() {
  const ctx = tempContext();
  const files = readZip(zipOf(fixtureFiles()));
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, 'f'));
  // Reveal one record (with a secret-bearing GM section) and publish one map.
  updateEntity(ctx.db, 'SET-001', { revealed: true, player_summary: 'A quiet town kept by @[Test Keeper].', revealed_sections: ['Overview', 'GM-only truths'] });
  fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-1-abc.png'), PNG);
  fs.writeFileSync(path.join(ctx.paths.uploadsDir, 'map-2-secret.png'), PNG);
  maps.create(ctx.db, { name: 'Shared map', image_file: 'map-1-abc.png', player_visible: true });
  maps.create(ctx.db, { name: 'DM map', image_file: 'map-2-secret.png', player_visible: false });
  return { ctx, app: createApp(ctx) };
}

describe('player handbook site', () => {
  it('git blob ids match git hash-object', () => {
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('ZIP contains the player app, player-safe data and only published map images', async () => {
    const { app } = seeded();
    const res = await request(app).get('/api/publish/site.zip').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const zip = new AdmZip(res.body as Buffer);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual([
      'player-handbook/.nojekyll',
      'player-handbook/assets/app.js',
      'player-handbook/data/player.json',
      'player-handbook/index.html',
      'player-handbook/robots.txt',
      'player-handbook/uploads/map-1-abc.png',
    ]);
    const data = zip.getEntry('player-handbook/data/player.json')!.getData().toString('utf8');
    expect(data).toContain('A quiet town kept by Test Keeper.');
    for (const secret of ['Hidden Test Villain', 'forbidden ledger', 'Test_Bible.md', 'NPC-001', 'map-2-secret', 'LOC-002'])
      expect(data).not.toContain(secret);
  });
});

describe('publishing to GitHub Pages', () => {
  it('publishes, skips unchanged files, and only uploads what changed', async () => {
    const { ctx, app } = seeded();
    expect((await request(app).post('/api/publish/github').send({ confirm: true })).status).toBe(400); // not configured
    const cfg = await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'test-token-123' });
    expect(cfg.status).toBe(200);
    expect(cfg.body.tokenSaved).toBe(true);
    expect(cfg.body.config).toEqual({ repo: 'me/handbook', branch: 'gh-pages' });
    expect(cfg.body.preview).toMatchObject({ entries: 1, maps: 1 });
    expect((await request(app).post('/api/publish/github').send({})).status).toBe(400); // needs confirmation

    const first = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ changed: true, uploaded: 6, pages: 'created', url: 'https://me.github.io/handbook/' });
    const site = gh.filesOn('gh-pages');
    expect([...site.keys()].sort()).toEqual(['.nojekyll', 'assets/app.js', 'data/player.json', 'index.html', 'robots.txt', 'uploads/map-1-abc.png']);
    const published = site.get('data/player.json')!.toString('utf8');
    expect(published).not.toContain('Hidden Test Villain');
    expect(gh.authSeen.every((a) => a === 'Bearer test-token-123')).toBe(true);

    const second = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(second.body).toMatchObject({ changed: false, uploaded: 0, pages: 'enabled' });

    updateEntity(ctx.db, 'SET-001', { revealed_facts: ['The gate is barred at night.'] });
    const firstCommit = gh.refs.get('gh-pages')!;
    const third = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(third.body).toMatchObject({ changed: true, uploaded: 1, unchanged: 5 });
    expect(gh.commits.get(gh.refs.get('gh-pages')!)!.parents).toEqual([firstCommit]);
    expect(gh.filesOn('gh-pages').get('data/player.json')!.toString('utf8')).toContain('The gate is barred at night.');
    expect((await request(app).get('/api/publish')).body.last).toMatchObject({ changed: true, uploaded: 1 });
  });

  it('reports a rejected token and an unknown repository in plain words', async () => {
    const { app } = seeded();
    await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'wrong' });
    const bad = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/did not accept the token/);
    await request(app).put('/api/publish/config').send({ repo: 'me/other', token: 'test-token-123' });
    const missing = await request(app).post('/api/publish/github').send({ confirm: true });
    expect(missing.body.error).toMatch(/not found, or the token cannot access it/);
    expect((await request(app).put('/api/publish/config').send({ repo: 'not a repo' })).status).toBe(400);
  });

  it('keeps the token out of the database, API responses, exports and backups', async () => {
    const { ctx, app } = seeded();
    await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: 'super-secret-token' });
    const secretsFile = path.join(ctx.paths.dataDir, 'secrets.json');
    expect(fs.existsSync(secretsFile)).toBe(true);
    if (process.platform !== 'win32') expect(fs.statSync(secretsFile).mode & 0o077).toBe(0);
    for (const url of ['/api/publish', '/api/settings', '/api/meta']) expect(JSON.stringify((await request(app).get(url)).body)).not.toContain('super-secret-token');
    expect(JSON.stringify(exportJson(ctx.db))).not.toContain('super-secret-token');
    const b = createBackup(ctx.db, ctx.paths, 'manual');
    expect(fs.readFileSync(path.join(ctx.paths.backupsDir, b.file)).includes('super-secret-token')).toBe(false);
    // Clearing the token
    const cleared = await request(app).put('/api/publish/config').send({ repo: 'me/handbook', token: '' });
    expect(cleared.body.tokenSaved).toBe(false);
  });
});
