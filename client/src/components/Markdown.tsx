import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { ID_PATTERN_SOURCE } from '@shared/domain';
import { useAppState } from '../lib/store';

const REF_RE = new RegExp(`\\[(${ID_PATTERN_SOURCE})\\](?!\\()`, 'g');

/**
 * Safe Markdown renderer. Raw HTML in lore is NOT rendered (react-markdown escapes it; no rehype-raw),
 * and only http(s)/mailto/internal links survive the URL transform. `Name [ID]` references become record links.
 */
export function Markdown({ text, className = 'prose-lore' }: { text: string; className?: string }) {
  const { index, indexLoaded } = useAppState();
  const linked = text.replace(REF_RE, (_m, id: string) => `[${id}](wk:${id})`);
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('wk:') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('wk:')) {
              const id = href.slice(3);
              const e = index.get(id);
              if (indexLoaded && !e)
                return (
                  <span className="wk-ref-broken text-danger" title={`Broken reference: no record ${id}`}>
                    {children}
                  </span>
                );
              return (
                <Link to={`/e/${encodeURIComponent(id)}`} className="wk-ref text-[0.8em] font-sans" title={e ? e.name : id}>
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
