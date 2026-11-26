/**
 * Try publishing against the real GitHub (v0.9.23, docs/BETA_PLAN.md A7). The tests speak to a stand-in that behaves
 * as GitHub's documentation says; this speaks to GitHub itself, with a repository and a token of your own, and says
 * at each step whether GitHub did what the app expects. It publishes four small test files to a branch of its own
 * (`worldkeeper-publish-check`), reads them back, publishes again, and deletes the branch. It does not touch
 * `gh-pages`, your handbook or the repository's Pages settings.
 *
 *   WORLDKEEPER_GITHUB_TOKEN=<token> npm run publish:check -- <owner>/<repository>
 *
 * The token needs "Contents: Read and write" for that repository. It is read from the environment and never shown.
 * An empty repository (made a moment ago, nothing in it) is a good one to try: the app has to start it.
 */
import { gitBlobSha, publishToGitHub } from '../server/src/publish/github.js';

const BRANCH = 'worldkeeper-publish-check';
const [target] = process.argv.slice(2);
const token = process.env.WORLDKEEPER_GITHUB_TOKEN;
if (!target || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(target) || !token) {
  console.error('Usage: WORLDKEEPER_GITHUB_TOKEN=<token> npm run publish:check -- <owner>/<repository>');
  process.exit(2);
}
const [owner, repo] = target.split('/');
const api = 'https://api.github.com';
const gh = (method: string, url: string) =>
  fetch(`${api}/repos/${owner}/${repo}${url}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'worldkeeper-publish-check' } });
const ok = (m: string) => console.log('✓', m);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const files = [
  { path: 'index.html', data: Buffer.from('<!doctype html><title>Worldkeeper publish check</title><p>This branch is a test and can be deleted.</p>\n') },
  { path: 'data/words.json', data: Buffer.from(JSON.stringify({ words: 'é ü — “quoted” 龍', when: new Date().toISOString() })) },
  { path: 'uploads/dot.png', data: png },
  { path: '.nojekyll', data: Buffer.alloc(0) },
];

let failed = false;
try {
  const first = await publishToGitHub({ owner, repo, branch: BRANCH, token, files, message: 'Worldkeeper publish check', pages: false });
  ok(`published ${first.uploaded} files to the branch ${BRANCH} (commit ${first.commitSha?.slice(0, 7)})`);

  // Read back what GitHub has, and compare each file with what was sent.
  const ref = (await (await gh('GET', `/git/ref/heads/${BRANCH}`)).json()) as { object: { sha: string } };
  const commit = (await (await gh('GET', `/git/commits/${ref.object.sha}`)).json()) as { tree: { sha: string } };
  const tree = (await (await gh('GET', `/git/trees/${commit.tree.sha}?recursive=1`)).json()) as { tree: { path: string; sha: string; type: string }[] };
  const there = new Map(tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  for (const f of files) {
    if (there.get(f.path) !== gitBlobSha(f.data)) throw new Error(`${f.path} is not on GitHub as it was sent (text sent with the tree must arrive byte for byte)`);
  }
  if (there.size !== files.length) throw new Error(`the branch holds ${there.size} files, not the ${files.length} sent: ${[...there.keys()].join(', ')}`);
  ok('GitHub holds each file exactly as it was sent, and nothing else');

  const again = await publishToGitHub({ owner, repo, branch: BRANCH, token, files, message: 'Worldkeeper publish check', pages: false });
  if (again.changed || again.uploaded) throw new Error(`publishing the same files again sent ${again.uploaded} of them (it should send none)`);
  ok('publishing the same files again sends nothing');

  const next = files.filter((f) => f.path !== 'uploads/dot.png').map((f) => (f.path === 'index.html' ? { ...f, data: Buffer.from('<!doctype html><p>Changed.</p>\n') } : f));
  const third = await publishToGitHub({ owner, repo, branch: BRANCH, token, files: next, message: 'Worldkeeper publish check (a change)', pages: false });
  if (!third.changed || third.uploaded !== 1) throw new Error(`a change to one file sent ${third.uploaded} files`);
  ok('a change sends only what changed, and a file no longer published is gone');

  const pages = await gh('GET', '/pages');
  console.log(pages.status === 200 ? `  (GitHub Pages is on for this repository: ${((await pages.json()) as { html_url?: string }).html_url})` : `  (GitHub Pages is not on for this repository, or the token can't see it: ${pages.status}. The app turns it on at the first real publish if the token has "Pages: Read and write".)`);
} catch (e) {
  failed = true;
  console.error(`✗ ${(e as Error).message}`);
} finally {
  const del = await gh('DELETE', `/git/refs/heads/${BRANCH}`);
  console.log(del.status === 204 ? `✓ the test branch is deleted` : `  (the test branch ${BRANCH} could not be deleted: ${del.status}. Delete it on GitHub.)`);
}
console.log(failed ? '\nThe check did not pass. Please report what it printed (docs/TROUBLESHOOTING.md).' : '\nPublishing works against GitHub itself.');
process.exit(failed ? 1 : 0);
