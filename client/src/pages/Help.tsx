/**
 * Help (v0.9.21, docs/BETA_PLAN.md A5): the guides, inside the app. Read one, search all of them, or arrive from the
 * "?" in the top bar at the part about the screen you were on.
 */
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { GUIDES, resolveLink, sections, slugify, type HelpHit } from '@shared/help';
import { findInHelp, loadGuide } from '../lib/helpDocs';
import { ErrorBox, Loading, PageHeader } from '../components/ui';

const PLUGINS = [remarkGfm];
const LINK = 'text-arcane underline underline-offset-2 hover:text-gold';

/** The words of a heading, whatever it is made of (plain text, `code`, **bold**). */
function words(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? words(c.props.children) : ''))
    .join('');
}

/**
 * How a guide renders. Headings get the addresses GitHub gives them, so a link written for the repository lands in
 * the same place here (no guide has two headings with the same words: tests/help.test.ts holds them to that). A link
 * to another guide stays in the app; one to the project's other files opens its page.
 */
const heading = (Tag: 'h1' | 'h2' | 'h3') =>
  function Heading({ children }: { children?: ReactNode }) {
    return (
      <Tag id={slugify(words(children))} className="scroll-mt-4">
        {children}
      </Tag>
    );
  };
const COMPONENTS: Components = {
  h1: heading('h1'),
  h2: heading('h2'),
  h3: heading('h3'),
  a: ({ href, children }) => {
    const to = resolveLink(href ?? '');
    if (to.kind === 'guide')
      return (
        <Link to={`/help/${to.slug}${to.anchor ? `#${to.anchor}` : ''}`} className={LINK}>
          {children}
        </Link>
      );
    if (to.kind === 'anchor')
      return (
        <Link to={{ hash: `#${to.anchor}` }} className={LINK}>
          {children}
        </Link>
      );
    return (
      <a href={to.url} target="_blank" rel="noreferrer noopener" className={LINK}>
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span className="text-dim italic">[picture: {alt}]</span>,
};

function GuideText({ markdown }: { markdown: string }) {
  return (
    <div className="prose-lore help-text max-w-3xl" data-testid="help-text">
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function HelpPage() {
  const { guide: slugParam } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const guide = GUIDES.find((g) => g.slug === (slugParam ?? 'start'));
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HelpHit[] | null>(null);

  useEffect(() => {
    let live = true;
    setMarkdown(null);
    setError(null);
    if (!guide) return;
    loadGuide(guide.slug).then(
      (m) => live && setMarkdown(m),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [guide]);

  // Arriving at a part of a guide (from the "?", a search result or a link): go to it once the guide is there.
  useEffect(() => {
    if (markdown === null) return;
    const id = decodeURIComponent(loc.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else document.querySelector('[data-testid=help-text]')?.scrollIntoView({ block: 'start' });
  }, [markdown, loc.hash, loc.pathname]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits(null);
    let live = true;
    const t = setTimeout(() => void findInHelp(q).then((h) => live && setHits(h)), 100);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const parts = useMemo(() => (markdown ? sections(markdown).filter((s) => s.level === 2) : []), [markdown]);

  return (
    <div className="space-y-4">
      <PageHeader title="Help" subtitle="The guides, for the version you have. They work without the internet." />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] items-start">
        <nav aria-label="Guides" className="space-y-3 lg:sticky lg:top-2">
          <label className="flex items-center gap-2 panel px-2.5 py-1.5">
            <Search size={14} className="text-dim shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQ('');
                else if (e.key === 'Enter' && hits?.[0]) {
                  void nav(`/help/${hits[0].slug}#${hits[0].id}`);
                  setQ('');
                }
              }}
              placeholder="Search the guides…"
              aria-label="Search the guides"
              className="flex-1 min-w-0 bg-transparent text-sm outline-hidden"
            />
          </label>
          <ul className="space-y-0.5">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/help/${g.slug}`}
                  onClick={() => setQ('')}
                  aria-current={g.slug === guide?.slug && !hits ? 'page' : undefined}
                  className={`block rounded-md px-2.5 py-1.5 ${g.slug === guide?.slug && !hits ? 'bg-gold/10 text-gold' : 'text-ink hover:bg-raised'}`}
                >
                  <span className="block text-sm font-medium">{g.title}</span>
                  <span className="block text-xs text-dim">{g.about}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {hits ? (
            <div data-testid="help-results">
              <p className="text-sm text-dim mb-2" role="status">
                {hits.length ? `${hits.length} part${hits.length === 1 ? '' : 's'} of the guides mention “${q.trim()}”` : `Nothing in the guides mentions “${q.trim()}”. Try fewer or other words.`}
              </p>
              <ul className="space-y-1">
                {hits.map((h) => (
                  <li key={`${h.slug}#${h.id}`}>
                    <Link to={`/help/${h.slug}#${h.id}`} onClick={() => setQ('')} className="block panel px-3 py-2 hover:border-gold/60">
                      <span className="font-medium text-ink">{h.title}</span> <span className="text-xs text-dim">· {h.guide}</span>
                      <span className="block text-xs text-dim mt-0.5 line-clamp-2">{h.snippet}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : !guide ? (
            <ErrorBox error="There is no such guide. Choose one from the list." />
          ) : error ? (
            <ErrorBox error={error} />
          ) : markdown === null ? (
            <Loading />
          ) : (
            <>
              {parts.length > 3 && (
                <details className="mb-3 text-sm">
                  <summary className="cursor-pointer text-arcane">In this guide</summary>
                  <ul className="mt-1.5 columns-1 sm:columns-2 gap-6 text-sm">
                    {parts.map((s) => (
                      <li key={s.id}>
                        <Link to={{ hash: `#${s.id}` }} className="text-ink hover:text-gold">
                          {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <GuideText markdown={markdown} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
