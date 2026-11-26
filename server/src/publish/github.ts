import { createHash } from 'node:crypto';
import type { SiteFile } from './site.js';

/**
 * Publish a static site to a branch of a GitHub repository using the Git Data API, then make sure
 * GitHub Pages serves that branch. Each publish is one commit that replaces the branch's files;
 * files whose content is unchanged are not uploaded again.
 */

export interface PublishOptions {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  files: SiteFile[];
  message: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  /** Waiting, for the tests to do in no time. */
  sleep?: (ms: number) => Promise<void>;
  /** False leaves GitHub Pages as it is (scripts/publish-check.ts, which only tries the upload). */
  pages?: boolean;
}

export interface PublishResult {
  changed: boolean;
  commitSha: string | null;
  uploaded: number;
  unchanged: number;
  url: string;
  pages: 'enabled' | 'created' | 'other-source' | 'not-enabled';
  pagesNote: string | null;
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The object id Git gives a file's content (what GitHub reports in tree listings). */
export function gitBlobSha(data: Buffer): string {
  return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/**
 * What GitHub's own documentation asks of a program that writes to it (docs.github.com, "Rate limits for the REST
 * API" and "Best practices"), which the first version of this never met because it had only ever spoken to a
 * stand-in (v0.9.23):
 *
 * - "No more than 80 content-generating requests per minute and no more than 500 per hour." A handbook is some seventy
 *   files of the app itself before a single map or portrait, and each was its own request. Text files now travel
 *   inside the request that makes the tree (GitHub writes them out itself), a few dozen at a time, so only pictures
 *   and fonts are sent one by one; and when many of those have to go, there is a pause between each ("wait at least
 *   one second between each request").
 * - When told to slow down (403 or 429): wait as long as `retry-after` says, or until `x-ratelimit-reset`, or a
 *   minute if neither is given; then go on. Not for ever: after a few waits the GM is told how long to leave it.
 * - "You are unable to create new references for empty repositories": a repository made a moment ago, with nothing
 *   in it, can't be given a branch this way. It is started with a README first, as GitHub's own page offers to.
 */
const INLINE_MAX = 200_000; // a text file up to this size rides in the tree request
const BATCH_BYTES = 900_000; // and this much text, at most, in one such request
const BATCH_FILES = 80;
const PACE_ABOVE = 40; // more uploads than this in one publish, and they are spaced out
const PACE_MS = 1100;
const MAX_WAITS = 4;
const MAX_WAIT_MS = 5 * 60_000;

/** Text that survives being sent as a JSON string exactly as it is (so the file GitHub writes is byte for byte ours). */
const isPlainText = (data: Buffer) => data.length > 0 && data.length <= INLINE_MAX && !data.includes(0) && Buffer.from(data.toString('utf8'), 'utf8').equals(data);

const minutes = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return `${m} minute${m === 1 ? '' : 's'}`;
};

export async function publishToGitHub(o: PublishOptions): Promise<PublishResult> {
  const api = o.apiBase ?? 'https://api.github.com';
  const doFetch = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const repoPath = `/repos/${encodeURIComponent(o.owner)}/${encodeURIComponent(o.repo)}`;
  let waits = 0;
  const call = async <T>(method: string, url: string, body?: unknown, okMissing = false): Promise<T | null> => {
    for (;;) {
      const res = await doFetch(api + url, {
        method,
        headers: {
          Authorization: `Bearer ${o.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'worldkeeper-player-handbook',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      if (okMissing && res.status === 404) return null;
      if (res.ok) return res.status === 204 ? null : ((await res.json()) as T);
      const text = await res.text().catch(() => '');
      let msg = text;
      try {
        msg = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* plain text */
      }
      // Told to slow down, as GitHub says it: wait as long as it asks, then go on.
      const retryAfter = Number(res.headers.get('retry-after'));
      const spent = res.headers.get('x-ratelimit-remaining') === '0';
      if ((res.status === 403 || res.status === 429) && (retryAfter > 0 || spent || /rate limit/i.test(msg))) {
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
        const wait = retryAfter > 0 ? retryAfter * 1000 : spent && reset > 0 ? reset + 1000 : 60_000;
        if (waits >= MAX_WAITS || wait > MAX_WAIT_MS)
          throw new GitHubError(429, `GitHub asked the app to slow down. Nothing is broken: publish again in about ${minutes(Math.max(wait, 60_000))}, and it will carry on from what is already there.`);
        waits++;
        await sleep(wait);
        continue;
      }
      if (res.status === 403 && /not accessible by personal access token|must have (admin|push)/i.test(msg))
        throw new GitHubError(403, `The token isn’t allowed to do this (${msg}). It needs “Contents: Read and write” for this repository, and “Pages: Read and write” to turn the site on.`);
      throw new GitHubError(res.status, msg || `GitHub returned ${res.status}`);
    }
  };

  // 1. Repository access
  try {
    await call('GET', repoPath);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) throw new GitHubError(401, 'GitHub did not accept the token. Create a new one and paste it again.');
    if (e instanceof GitHubError && e.status === 404) throw new GitHubError(404, `Repository ${o.owner}/${o.repo} was not found, or the token cannot access it.`);
    throw e;
  }

  // An empty repository (made a moment ago, nothing in it) is given a first file, so that it can have branches.
  let started = false;
  const startEmptyRepository = async () => {
    if (started) throw new GitHubError(409, 'GitHub says the repository is empty, though the app has just started it. Try publishing again in a minute.');
    started = true;
    try {
      await call('PUT', `${repoPath}/contents/README.md`, {
        message: 'Start the repository for a player handbook',
        content: Buffer.from('# Player handbook\n\nPublished from The Worldkeeper. The handbook itself is on the `' + o.branch + '` branch, and is shown by GitHub Pages.\n').toString('base64'),
      });
    } catch (e) {
      // Already has that file: then it isn't empty, and whatever was wrong is something else.
      if (e instanceof GitHubError && e.status === 422) return;
      throw new GitHubError(409, `This repository is empty, and GitHub would not let the app start it${e instanceof GitHubError ? ` (${e.message})` : ''}. On GitHub, open the repository, choose “Add a README”, then publish again.`);
    }
  };
  const isEmptyRepository = (e: unknown) => e instanceof GitHubError && e.status === 409 && /empty/i.test(e.message);
  /** Do it; if GitHub says the repository is empty, start the repository and do it once more. */
  const inRepository = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!isEmptyRepository(e)) throw e;
      await startEmptyRepository();
      return fn();
    }
  };

  // 2. Current branch state
  const ref = await inRepository(() => call<{ object: { sha: string } }>('GET', `${repoPath}/git/ref/heads/${encodeURIComponent(o.branch)}`, undefined, true));
  let existing = new Map<string, string>();
  let headSha: string | null = null;
  let headTree: string | null = null;
  if (ref) {
    headSha = ref.object.sha;
    const commit = await call<{ tree: { sha: string } }>('GET', `${repoPath}/git/commits/${headSha}`);
    headTree = commit!.tree.sha;
    const tree = await call<{ tree: { path: string; sha: string; type: string }[]; truncated: boolean }>('GET', `${repoPath}/git/trees/${headTree}?recursive=1`);
    if (!tree!.truncated) existing = new Map(tree!.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  }

  // 3. What is new or changed. Text goes with the tree; anything else (pictures, fonts, big files) is sent by itself.
  type Entry = { path: string; mode: string; type: string; sha?: string; content?: string };
  const entries: Entry[] = [];
  const toSend: { entry: Entry; data: Buffer }[] = [];
  let uploaded = 0;
  for (const f of o.files) {
    const sha = gitBlobSha(f.data);
    const entry: Entry = { path: f.path, mode: '100644', type: 'blob', sha };
    entries.push(entry);
    if (existing.get(f.path) === sha) continue;
    uploaded++;
    if (isPlainText(f.data)) {
      delete entry.sha;
      entry.content = f.data.toString('utf8');
    } else toSend.push({ entry, data: f.data });
  }
  const sendBlob = async (data: Buffer) => (await inRepository(() => call<{ sha: string }>('POST', `${repoPath}/git/blobs`, { content: data.toString('base64'), encoding: 'base64' })))!.sha;
  for (const [i, x] of toSend.entries()) {
    if (i > 0 && toSend.length > PACE_ABOVE) await sleep(PACE_MS);
    x.entry.sha = await sendBlob(x.data);
  }

  // 4. The tree: exactly these files (nothing is carried over from before, so what is no longer published is gone).
  // Built up a batch at a time, each on the one before, so no single request is too large.
  const batches: Entry[][] = [[]];
  let bytes = 0;
  for (const e of entries) {
    const size = e.content ? Buffer.byteLength(e.content) : 0;
    const last = batches[batches.length - 1];
    if (last.length && (last.length >= BATCH_FILES || bytes + size > BATCH_BYTES)) {
      batches.push([]);
      bytes = 0;
    }
    batches[batches.length - 1].push(e);
    bytes += size;
  }
  let treeSha: string | null = null;
  for (const batch of batches) {
    const body = (list: Entry[]) => ({ ...(treeSha ? { base_tree: treeSha } : {}), tree: list });
    try {
      treeSha = (await inRepository(() => call<{ sha: string }>('POST', `${repoPath}/git/trees`, body(batch))))!.sha;
    } catch (e) {
      // If GitHub won't take text this way after all (too large, or refused): send those files one by one instead.
      if (!(e instanceof GitHubError) || ![413, 422].includes(e.status) || !batch.some((x) => x.content !== undefined)) throw e;
      const plain: Entry[] = [];
      for (const x of batch) {
        if (x.content === undefined) plain.push(x);
        else {
          await sleep(PACE_MS);
          plain.push({ path: x.path, mode: x.mode, type: x.type, sha: await sendBlob(Buffer.from(x.content, 'utf8')) });
        }
      }
      treeSha = (await call<{ sha: string }>('POST', `${repoPath}/git/trees`, body(plain)))!.sha;
    }
  }
  const pagesUrlGuess = `https://${o.owner.toLowerCase()}.github.io/${o.repo}/`;
  let commitSha: string | null = null;
  const changed = treeSha !== headTree;
  if (changed) {
    const commit = await call<{ sha: string }>('POST', `${repoPath}/git/commits`, { message: o.message, tree: treeSha, parents: headSha ? [headSha] : [] });
    commitSha = commit!.sha;
    if (headSha) await call('PATCH', `${repoPath}/git/refs/heads/${encodeURIComponent(o.branch)}`, { sha: commitSha, force: false });
    else await inRepository(() => call('POST', `${repoPath}/git/refs`, { ref: `refs/heads/${o.branch}`, sha: commitSha }));
  }

  // 5. GitHub Pages
  let pages: PublishResult['pages'] = 'enabled';
  let pagesNote: string | null = null;
  let url = pagesUrlGuess;
  if (o.pages === false) return { changed, commitSha, uploaded, unchanged: o.files.length - uploaded, url, pages: 'not-enabled', pagesNote: null };
  const info = await call<{ html_url?: string; source?: { branch: string; path: string } }>('GET', `${repoPath}/pages`, undefined, true).catch(() => null);
  if (info) {
    if (info.html_url) url = info.html_url;
    if (info.source && info.source.branch !== o.branch) {
      pages = 'other-source';
      pagesNote = `GitHub Pages for this repository serves the "${info.source.branch}" branch. To show the handbook, open the repository's Settings → Pages and choose "${o.branch}".`;
    }
  } else {
    try {
      const created = await call<{ html_url?: string }>('POST', `${repoPath}/pages`, { source: { branch: o.branch, path: '/' } });
      pages = 'created';
      if (created?.html_url) url = created.html_url;
      pagesNote = 'GitHub Pages was turned on. The first build can take a minute or two.';
    } catch (e) {
      pages = 'not-enabled';
      pagesNote = `The files were uploaded, but GitHub Pages could not be turned on automatically${e instanceof GitHubError ? ` (${e.message})` : ''}. Open the repository's Settings → Pages, choose "Deploy from a branch" and select "${o.branch}".`;
    }
  }

  return { changed, commitSha, uploaded, unchanged: o.files.length - uploaded, url, pages, pagesNote };
}
