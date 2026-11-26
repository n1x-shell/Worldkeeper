/**
 * Help inside the app (v0.9.21, docs/BETA_PLAN.md A5). The manual was Markdown in the repository: a GM with the
 * desktop app had no way to read it without finding the project on GitHub. The guides in `docs/` that are written for
 * GMs are now part of the app (bundled at build time, so they work offline and always match the version installed).
 *
 * This file is the part with no page in it: which guides there are, how one is split into sections, where a link in
 * one leads, how they are searched, and which section belongs to which screen.
 */

export interface Guide {
  /** In the address: /help/<slug>. */
  slug: string;
  /** The file in docs/. */
  file: string;
  title: string;
  /** One line, for the list of guides. */
  about: string;
}

export const GUIDES: Guide[] = [
  { slug: 'start', file: 'QUICKSTART.md', title: 'Quick start', about: 'Your first world, your first campaign and your first session.' },
  { slug: 'features', file: 'FEATURES.md', title: 'Everything the app does', about: 'The encyclopedia, the map, campaigns and the table, part by part.' },
  { slug: 'players', file: 'PLAYER_VIEW.md', title: 'Players and the table', about: 'What players see, opening the table, and publishing a handbook.' },
  { slug: 'data', file: 'DATA.md', title: 'Your data', about: 'Where it is kept, bringing notes in, backups and exports.' },
  { slug: 'rules', file: 'RULES_PACKS.md', title: 'Rules and your books', about: 'The open rules, importing your own books, and your own items and spells.' },
  { slug: 'worldbooks', file: 'WORLDBOOKS.md', title: 'Worldbooks', about: 'Sharing your world, or adding someone else’s.' },
  { slug: 'shortcuts', file: 'SHORTCUTS.md', title: 'Keyboard shortcuts', about: 'Getting around without the mouse.' },
  { slug: 'install', file: 'INSTALL.md', title: 'Installing and updating', about: 'The installers, updating, and where the app keeps things.' },
  { slug: 'trouble', file: 'TROUBLESHOOTING.md', title: 'When something goes wrong', about: 'Reporting a bug, the log, and getting your world back.' },
  { slug: 'whats-new', file: 'WHATS_NEW.md', title: 'What’s new', about: 'What changed in each version.' },
];

export const PROJECT_PAGE = 'https://github.com/n1x-shell/Worldkeeper';

/** A heading's address within its page, as GitHub makes it (so a link written for the repository works here too). */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

export interface Section {
  /** 1 for the guide's own title, 2 and 3 for its parts. */
  level: number;
  title: string;
  id: string;
  /** The words under the heading, down to the next one (Markdown as written). */
  text: string;
}

/**
 * A guide's headings and what is under each. A `#` inside a code example is not a heading (the guides on rules and
 * worldbooks show whole files), and two headings with the same words get `-1`, `-2` as on GitHub.
 */
export function sections(markdown: string): Section[] {
  const out: Section[] = [];
  const used = new Map<string, number>();
  let fence: string | null = null;
  let current: Section | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    const h = !fence && !f ? /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      const base = slugify(h[2]);
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      current = { level: h[1].length, title: h[2].replace(/[*_`]/g, '').trim(), id: n ? `${base}-${n}` : base, text: '' };
      out.push(current);
    } else if (current) current.text += `${line}\n`;
  }
  return out;
}

export type LinkTarget = { kind: 'guide'; slug: string; anchor: string } | { kind: 'anchor'; anchor: string } | { kind: 'outside'; url: string };

/**
 * Where a link in a guide leads. Another guide opens in the app; a file of the project that isn't a guide (the
 * developers' notes, the README) opens on the project's page; a web address is itself.
 */
export function resolveLink(href: string): LinkTarget {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'outside', url: href };
  if (href.startsWith('#')) return { kind: 'anchor', anchor: href.slice(1) };
  const [path, anchor = ''] = href.split('#');
  // As the repository lays them out: the guides are in docs/, and "../" is the project's own folder.
  const parts = ['docs', ...path.split('/')].reduce<string[]>((acc, p) => {
    if (p === '..') acc.pop();
    else if (p && p !== '.') acc.push(p);
    return acc;
  }, []);
  const guide = parts.length === 2 && parts[0] === 'docs' ? GUIDES.find((g) => g.file === parts[1]) : undefined;
  if (guide) return { kind: 'guide', slug: guide.slug, anchor };
  return { kind: 'outside', url: `${PROJECT_PAGE}/blob/main/${parts.join('/')}${anchor ? `#${anchor}` : ''}` };
}

export interface HelpHit {
  slug: string;
  guide: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Search the guides. Every word asked for must be in the section (in its heading or its text); a word in the heading
 * counts for much more than one in the text, and the quick start comes before the reference when they tie.
 */
export function searchHelp(docs: { slug: string; markdown: string }[], query: string, limit = 12): HelpHit[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (!words.length) return [];
  const hits: HelpHit[] = [];
  docs.forEach((d, order) => {
    const guide = GUIDES.find((g) => g.slug === d.slug);
    if (!guide) return;
    for (const s of sections(d.markdown)) {
      const title = s.title.toLowerCase();
      const text = plain(s.text);
      const lower = text.toLowerCase();
      let score = 0;
      for (const w of words) {
        const inTitle = title.includes(w);
        const at = lower.indexOf(w);
        if (!inTitle && at < 0) {
          score = 0;
          break;
        }
        score += (inTitle ? 10 : 0) + (at >= 0 ? 1 + Math.min(3, lower.split(w).length - 1) * 0.5 : 0);
      }
      if (!score) continue;
      const first = Math.max(0, ...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).slice(0, 1));
      // From a little before the first word found, starting at a whole word.
      const near = Math.max(0, first - 50);
      const from = near === 0 ? 0 : near + text.slice(near).search(/\s/) + 1;
      hits.push({
        slug: d.slug,
        guide: guide.title,
        id: s.id,
        title: s.level === 1 ? guide.title : s.title,
        snippet: `${from > 0 ? '… ' : ''}${text.slice(from, from + 170)}${text.length > from + 170 ? ' …' : ''}`,
        // The guide's own title is the whole guide, not a place in it: the parts come first.
        score: score - order * 0.01 - (s.level === 1 ? 0.5 : 0),
      });
    }
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * The help for the screen the GM is on: the longest address that begins the page's own wins. Each names a guide and
 * one of its headings (tests/help.test.ts checks that every heading named here exists).
 */
export const HELP_FOR_PAGE: [prefix: string, slug: string, anchor: string][] = [
  ['/start', 'start', '2-start-your-world'],
  ['/atlas', 'features', 'the-map-for-the-gm'],
  ['/e', 'features', 'encyclopedia'],
  ['/browse', 'features', 'encyclopedia'],
  ['/world', 'features', 'encyclopedia'],
  ['/realm', 'features', 'worlds--realms'],
  ['/realms', 'features', 'worlds--realms'],
  ['/new', 'features', 'making-a-record'],
  ['/search', 'features', 'search-and-relationships'],
  ['/graph', 'features', 'search-and-relationships'],
  ['/templates', 'features', 'record-types-and-templates'],
  ['/worldbooks', 'worldbooks', 'sharing-your-world-as-a-worldbook'],
  ['/setting-packs', 'features', 'worldbooks'],
  ['/timeline', 'features', 'world-branches-and-timelines'],
  ['/world-events', 'features', 'world-branches-and-timelines'],
  ['/campaign', 'features', 'campaigns'],
  ['/campaigns', 'features', 'campaigns'],
  ['/campaign/calendar', 'features', 'calendars'],
  ['/campaign/live', 'features', 'session-preparation-and-play'],
  ['/campaign/sessions', 'features', 'session-preparation-and-play'],
  ['/campaign/encounters', 'features', 'session-preparation-and-play'],
  ['/session', 'features', 'session-preparation-and-play'],
  ['/tracker', 'features', 'session-preparation-and-play'],
  ['/dm', 'features', 'session-preparation-and-play'],
  ['/dice', 'features', 'session-preparation-and-play'],
  ['/generators', 'features', 'session-preparation-and-play'],
  ['/libraries', 'features', 'libraries-more-than-one-world'],
  ['/backups', 'data', 'backups'],
  ['/import', 'data', 'importing-markdown-lore'],
  ['/history', 'features', 'library-management'],
  ['/review', 'features', 'library-management'],
  ['/consistency', 'features', 'library-management'],
  ['/broken', 'features', 'library-management'],
  ['/tags', 'features', 'library-management'],
  ['/find-replace', 'features', 'library-management'],
  ['/publish', 'players', 'static-handbook-on-github-pages'],
  ['/rules', 'rules', 'rules-packs'],
  ['/books', 'rules', 'importing-your-books-from-5etools'],
  ['/settings', 'features', 'interface-and-technical-options'],
  ['/help', 'start', ''],
];

/** Where the "?" leads from a page: `/help/<guide>#<heading>`. */
export function helpFor(pathname: string): { slug: string; anchor: string } {
  const best = HELP_FOR_PAGE.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  return best ? { slug: best[1], anchor: best[2] } : { slug: 'start', anchor: '' };
}
