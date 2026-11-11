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

export async function publishToGitHub(o: PublishOptions): Promise<PublishResult> {
  const api = o.apiBase ?? 'https://api.github.com';
  const doFetch = o.fetchImpl ?? fetch;
  const repoPath = `/repos/${encodeURIComponent(o.owner)}/${encodeURIComponent(o.repo)}`;
  const call = async <T>(method: string, url: string, body?: unknown, okMissing = false): Promise<T | null> => {
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
    });
    if (okMissing && res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = text;
      try {
        msg = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* plain text */
      }
      throw new GitHubError(res.status, msg || `GitHub returned ${res.status}`);
    }
    return res.status === 204 ? (null as T) : ((await res.json()) as T);
  };

  // 1. Repository access
  try {
    await call('GET', repoPath);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) throw new GitHubError(401, 'GitHub did not accept the token. Create a new one and paste it again.');
    if (e instanceof GitHubError && e.status === 404) throw new GitHubError(404, `Repository ${o.owner}/${o.repo} was not found, or the token cannot access it.`);
    throw e;
  }

  // 2. Current branch state
  const ref = await call<{ object: { sha: string } }>('GET', `${repoPath}/git/ref/heads/${encodeURIComponent(o.branch)}`, undefined, true);
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

  // 3. Upload new or changed files only
  const entries: { path: string; mode: string; type: string; sha: string }[] = [];
  let uploaded = 0;
  for (const f of o.files) {
    let sha = gitBlobSha(f.data);
    if (existing.get(f.path) !== sha) {
      const blob = await call<{ sha: string }>('POST', `${repoPath}/git/blobs`, { content: f.data.toString('base64'), encoding: 'base64' });
      sha = blob!.sha;
      uploaded++;
    }
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha });
  }

  // 4. Full tree (no base tree, so files no longer published are removed)
  const tree = await call<{ sha: string }>('POST', `${repoPath}/git/trees`, { tree: entries });
  const pagesUrlGuess = `https://${o.owner.toLowerCase()}.github.io/${o.repo}/`;
  let commitSha: string | null = null;
  const changed = tree!.sha !== headTree;
  if (changed) {
    const commit = await call<{ sha: string }>('POST', `${repoPath}/git/commits`, { message: o.message, tree: tree!.sha, parents: headSha ? [headSha] : [] });
    commitSha = commit!.sha;
    if (headSha) await call('PATCH', `${repoPath}/git/refs/heads/${encodeURIComponent(o.branch)}`, { sha: commitSha, force: false });
    else await call('POST', `${repoPath}/git/refs`, { ref: `refs/heads/${o.branch}`, sha: commitSha });
  }

  // 5. GitHub Pages
  let pages: PublishResult['pages'] = 'enabled';
  let pagesNote: string | null = null;
  let url = pagesUrlGuess;
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
