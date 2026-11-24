import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { parseRefs } from '@shared/mentions';
import { useAppState } from '../lib/store';

const escLabel = (s: string) => s.replace(/([\\[\]])/g, '\\$1');

/** How links and pictures render: the same functions on every render, so React keeps the links it made. */
const COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (href === 'wktodo:')
      return (
        <span className="wk-todo block text-sm text-dim italic border-l-2 border-gold/40 pl-2" title="Still to write: the template's guidance, for you only">
          To write: {children}
        </span>
      );
    if (href?.startsWith('wkbroken:')) {
      const why = href.slice(9);
      return (
        <span
          className="underline decoration-dotted decoration-danger/70 underline-offset-2"
          title={why === 'ambiguous' ? 'More than one record has this name. Add its type, e.g. @[Name (Settlement)].' : 'No record with this name yet.'}
        >
          {children}
        </span>
      );
    }
    if (href?.startsWith('wk:')) {
      const id = href.slice(3);
      return (
        <Link to={`/e/${encodeURIComponent(id)}`} className="wk-ref" data-peek={id}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="text-arcane underline">
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span className="text-dim italic">[image: {alt}]</span>,
};
const PLUGINS = [remarkGfm];
const urlTransform = (url: string) => (url.startsWith('wk:') || url.startsWith('wkbroken:') || url === 'wktodo:' ? url : defaultUrlTransform(url));

/**
 * Safe Markdown renderer. Raw HTML in lore is NOT rendered (react-markdown escapes it; no rehype-raw),
 * and only http(s)/mailto/internal links survive the URL transform.
 * Record references (`@[Name]` and the library's `Name [ID]`) render as links showing the name; stable IDs
 * are only shown in debug mode.
 */
export function Markdown({ text, className = 'prose-lore' }: { text: string; className?: string }) {
  const { indexLoaded, mentions, debug } = useAppState();
  // A section still to write shows its guidance as a quiet note (shared/newRecord.ts); other comments don't show.
  const shown = text.includes('<!--') ? text.replace(/<!--\s*To write:\s*([\s\S]*?)\s*-->/g, (_m, g: string) => `[${escLabel(g)}](wktodo:)`).replace(/<!--[\s\S]*?-->/g, '') : text;
  const linked = !indexLoaded
    ? shown
    : parseRefs(shown, mentions)
        .map((s) => {
          if (s.kind === 'text') return s.text;
          if (s.kind === 'link') return `[${escLabel(s.label)}](wk:${s.id})${debug ? ` [\`${s.id}\`](wk:${s.id})` : ''}`;
          if (s.kind === 'anchor') return debug ? ` [\`${s.id}\`](wk:${s.id})` : ` [↗](wk:${s.id})`;
          if (/^[A-Z]{2,4}-/.test(s.label)) return debug ? `[${escLabel(s.label)}](wkbroken:${encodeURIComponent(s.label)})` : '';
          return `[${escLabel(s.label)}](wkbroken:${s.reason})`;
        })
        .join('');
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={PLUGINS} urlTransform={urlTransform} components={COMPONENTS}>
        {linked}
      </ReactMarkdown>
    </div>
  );
}
