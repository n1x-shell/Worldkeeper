import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { parseRefs } from '@shared/mentions';
import { useAppState } from '../lib/store';

const escLabel = (s: string) => s.replace(/([\\[\]])/g, '\\$1');

/**
 * Safe Markdown renderer. Raw HTML in lore is NOT rendered (react-markdown escapes it; no rehype-raw),
 * and only http(s)/mailto/internal links survive the URL transform.
 * Record references (`@[Name]` and the library's `Name [ID]`) render as links showing the name; stable IDs
 * are only shown in debug mode.
 */
export function Markdown({ text, className = 'prose-lore' }: { text: string; className?: string }) {
  const { index, indexLoaded, mentions, debug } = useAppState();
  const linked = !indexLoaded
    ? text
    : parseRefs(text, mentions)
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('wk:') || url.startsWith('wkbroken:') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => {
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
              const e = index.get(id);
              return (
                <Link to={`/e/${encodeURIComponent(id)}`} className="wk-ref" title={e?.name ?? undefined}>
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
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
