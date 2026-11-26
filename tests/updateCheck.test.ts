/** Is there a newer version? (v0.9.17, docs/BETA_PLAN.md A2.) Never the real network here: GitHub's answer is given. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tempContext } from './helpers.js';
import { createApp } from '../server/src/app.js';
import { RELEASES_API, checkForUpdate, isNewer, parseVersion, setUpdateCheck, updateStatus } from '../server/src/updateCheck.js';
import { APP_VERSION } from '../shared/version.js';

type Call = { url: string; headers: Record<string, string> };
/** GitHub's list of releases, as it answers: newest first by date, every one of this project's marked pre-release. */
const github = (releases: Record<string, unknown>[], calls: Call[] = [], status = 200) =>
  ((url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(releases) });
  }) as Parameters<typeof checkForUpdate>[1] extends infer O ? (O extends { fetch?: infer F } ? NonNullable<F> : never) : never;
const release = (tag: string, o: Record<string, unknown> = {}) => ({ tag_name: tag, name: tag, html_url: `https://github.com/n1x-shell/Worldkeeper/releases/tag/${tag}`, published_at: '2026-11-24T22:13:22Z', prerelease: true, draft: false, ...o });
const [maj, min, pat] = APP_VERSION.split('.').map(Number);
const NEXT = `${maj}.${min}.${pat + 1}`;

describe('comparing versions', () => {
  it('reads them as numbers, with or without a v', () => {
    expect(parseVersion('v0.10.2')).toEqual({ parts: [0, 10, 2], pre: '' });
    expect(parseVersion('1.0.0-beta.2')).toEqual({ parts: [1, 0, 0], pre: 'beta.2' });
    expect(parseVersion('latest')).toBeNull();
    expect(isNewer('0.10.0', '0.9.17')).toBe(true);
    expect(isNewer('v0.9.17', '0.9.17')).toBe(false);
    expect(isNewer('0.9.9', '0.9.17')).toBe(false);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    // A beta comes before the release it is a beta of, and after the one before.
    expect(isNewer('1.0.0', '1.0.0-beta.3')).toBe(true);
    expect(isNewer('1.0.0-beta.3', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0-beta.10', '1.0.0-beta.9')).toBe(true);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
  });
});

describe('asking whether a newer version exists', () => {
  it('finds the highest published version, though GitHub marks them all pre-release', async () => {
    const { paths } = tempContext();
    const calls: Call[] = [];
    // Newest by date is not the highest version, and a draft is not public.
    const st = await checkForUpdate(paths, { fetch: github([release('v0.9.2'), release(`v${NEXT}`), release('v99.0.0', { draft: true }), release('nightly')], calls) });
    expect(st).toMatchObject({ enabled: true, current: APP_VERSION, newer: true, error: null, latest: { version: NEXT, url: `https://github.com/n1x-shell/Worldkeeper/releases/tag/v${NEXT}` } });
    // One request, to the list of releases, saying only what app this is.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RELEASES_API);
    expect(calls[0].url).not.toContain('/latest');
    expect(calls[0].headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': `The-Worldkeeper/${APP_VERSION}` });
    // Kept for the installation, outside any library.
    expect(JSON.parse(fs.readFileSync(path.join(paths.sharedDir, 'update.json'), 'utf8')).latest.version).toBe(NEXT);
  });

  it('asks once a day, not at all when switched off, and at once when told to', async () => {
    const { paths } = tempContext();
    const calls: Call[] = [];
    const ask = github([release('v0.9.2')], calls);
    const t0 = Date.parse('2026-12-01T10:00:00Z');
    expect((await checkForUpdate(paths, { fetch: ask, now: t0 })).newer).toBe(false);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 3 * 3600_000 });
    expect(calls).toHaveLength(1);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 25 * 3600_000 });
    expect(calls).toHaveLength(2);
    expect(setUpdateCheck(paths, false).enabled).toBe(false);
    await checkForUpdate(paths, { fetch: ask, now: t0 + 80 * 3600_000 });
    expect(calls).toHaveLength(2);
    // "Check now" asks even when the daily check is off.
    await checkForUpdate(paths, { fetch: ask, now: t0 + 81 * 3600_000, force: true });
    expect(calls).toHaveLength(3);
    expect(updateStatus(paths).enabled).toBe(false);
  });

  it('learns nothing when offline or refused, and keeps what it knew', async () => {
    const { paths } = tempContext();
    await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`)]) });
    const offline = (() => Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { name: 'Error' }))) as ReturnType<typeof github>;
    const st = await checkForUpdate(paths, { fetch: offline, force: true });
    expect(st.error).toMatch(/ENOTFOUND/);
    expect(st).toMatchObject({ newer: true, latest: { version: NEXT } });
    expect((await checkForUpdate(paths, { fetch: github([], [], 403), force: true })).error).toBe('GitHub answered 403');
    expect((await checkForUpdate(paths, { fetch: github([]), force: true })).error).toBe('No release has been published yet');
    expect((await checkForUpdate(paths, { fetch: github({ message: 'Not Found' } as never), force: true })).error).toMatch(/list of releases/);
  });

  it('never points anywhere but this project’s releases', async () => {
    const { paths } = tempContext();
    const st = await checkForUpdate(paths, { fetch: github([release(`v${NEXT}`, { html_url: 'https://evil.example/download', name: 'x'.repeat(5000) })]) });
    expect(st.latest!.url).toBe('https://github.com/n1x-shell/Worldkeeper/releases');
    expect(st.latest!.name).toHaveLength(200);
  });

  it('is shown and switched in the app, without the app itself asking', async () => {
    const ctx = tempContext();
    const gm = createApp(ctx);
    // Opening the app's pages asks GitHub nothing: only the scheduled check and "Check now" do.
    expect((await request(gm).get('/api/update')).body).toMatchObject({ enabled: true, current: APP_VERSION, latest: null, newer: false, checked_at: null });
    expect((await request(gm).put('/api/update').send({ enabled: false })).body.enabled).toBe(false);
    expect((await request(gm).get('/api/update')).body.enabled).toBe(false);
    expect((await request(gm).put('/api/update').send({ enabled: true })).body.enabled).toBe(true);
  });
});
