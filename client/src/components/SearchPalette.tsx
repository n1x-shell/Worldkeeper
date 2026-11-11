import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { RealmBadge, TypeBadge, CanonBadge } from './ui';

export interface Hit {
  kind: string;
  ref: string;
  title: string;
  snippet: string;
  type?: string;
  realm?: string;
  canon_status?: string;
}

export function hitPath(h: Hit): string {
  switch (h.kind) {
    case 'entity':
      return `/e/${encodeURIComponent(h.ref)}`;
    case 'doc':
      return `/documents?path=${encodeURIComponent(h.ref)}`;
    case 'session':
      return `/session/${h.ref}`;
    case 'quest':
      return `/campaign/quests?quest=${h.ref}`;
    case 'note':
      return `/notes?note=${h.ref}`;
    case 'adventure':
      return `/adventure/${h.ref}`;
    case 'profile':
      return `/e/${encodeURIComponent(h.ref.split(':')[0])}`;
    default:
      return '/';
  }
}

/** Renders FTS snippets: `[[match]]` markers become highlights; everything else is plain text (no HTML injection). */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('[[') ? (
          <mark key={i} className="bg-gold/25 text-ink rounded px-0.5">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const KIND_LABEL: Record<string, string> = { doc: 'Source document', session: 'Session', quest: 'Quest', note: 'Note', adventure: 'Adventure', profile: 'Profile notes' };

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [hi, setHi] = useState(0);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const t = setTimeout(async () => {
      try {
        setHits(await api.get<Hit[]>(`/api/search${qs({ q, limit: 15 })}`));
        setHi(0);
      } catch {
        setHits([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q]);
  const go = (h: Hit) => {
    nav(hitPath(h));
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[2500] bg-black/60 flex justify-center pt-[10vh] px-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel w-full max-w-2xl shadow-2xl h-fit max-h-[75vh] flex flex-col" role="dialog" aria-label="Search">
        <div className="flex items-center gap-2 px-3 border-b border-line">
          <Search size={16} className="text-dim" />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, hits.length - 1));
              else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
              else if (e.key === 'Enter') {
                if (hits[hi]) go(hits[hi]);
                else if (q.trim()) {
                  nav(`/search?q=${encodeURIComponent(q)}`);
                  onClose();
                }
              }
            }}
            className="flex-1 bg-transparent py-3 text-base outline-none"
            placeholder="Mara Venn, NPC-010, Black Sun, vault key…"
            aria-label="Search query"
          />
          <kbd className="text-[10px] text-dim border border-line rounded px-1">Esc</kbd>
        </div>
        <ul className="overflow-y-auto">
          {hits.map((h, i) => (
            <li key={h.kind + h.ref}>
              <button onMouseEnter={() => setHi(i)} onClick={() => go(h)} className={`w-full text-left px-4 py-2.5 border-b border-line/50 ${i === hi ? 'bg-raised' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink">{h.title}</span>
                  {h.kind === 'entity' ? (
                    <>
                      <span className="text-xs text-dim">{h.ref}</span>
                      {h.type && <TypeBadge type={h.type} />}
                      {h.realm && <RealmBadge realm={h.realm} />}
                      {h.canon_status && h.canon_status !== 'CANON' && <CanonBadge status={h.canon_status} />}
                    </>
                  ) : (
                    <span className="chip border-line text-dim">{KIND_LABEL[h.kind] ?? h.kind}</span>
                  )}
                </div>
                <div className="text-xs text-dim mt-0.5 line-clamp-2">
                  <Snippet text={h.snippet} />
                </div>
              </button>
            </li>
          ))}
          {q && !hits.length && <li className="p-4 text-sm text-dim">No matches. Press Enter for the full search page.</li>}
        </ul>
      </div>
    </div>
  );
}
