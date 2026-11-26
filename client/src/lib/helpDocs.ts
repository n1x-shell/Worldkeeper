/**
 * The guides, as part of the app (v0.9.21): the Markdown files in docs/ that are written for GMs are bundled when the
 * app is built, each loaded only when it is first wanted. So help works offline, in the desktop app, and always
 * describes the version that is installed. (Which files are guides is said in shared/help.ts; the list here has to
 * be written out for the bundler, and tests/help.test.ts checks the two agree.)
 */
import { GUIDES, searchHelp, type HelpHit } from '@shared/help';

const files = import.meta.glob<string>('../../../docs/{QUICKSTART,FEATURES,PLAYER_VIEW,DATA,RULES_PACKS,WORLDBOOKS,SHORTCUTS,INSTALL,TROUBLESHOOTING,WHATS_NEW}.md', { query: '?raw', import: 'default' });

const loaded = new Map<string, Promise<string>>();

/** One guide's text. */
export function loadGuide(slug: string): Promise<string> {
  const guide = GUIDES.find((g) => g.slug === slug);
  const load = guide && files[`../../../docs/${guide.file}`];
  if (!load) return Promise.reject(new Error('There is no such guide'));
  if (!loaded.has(slug)) loaded.set(slug, load());
  return loaded.get(slug)!;
}

let all: Promise<{ slug: string; markdown: string }[]> | null = null;
/** Every guide, for searching them. */
export function loadGuides() {
  all ??= Promise.all(GUIDES.map(async (g) => ({ slug: g.slug, markdown: await loadGuide(g.slug) })));
  return all;
}

export async function findInHelp(query: string, limit?: number): Promise<HelpHit[]> {
  return searchHelp(await loadGuides(), query, limit);
}
