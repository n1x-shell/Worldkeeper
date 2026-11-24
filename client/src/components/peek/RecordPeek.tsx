/** A record at a glance: the inspector's and split view's content. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Columns2, ExternalLink, Pin as PinIcon, X } from 'lucide-react';
import { Markdown } from '../Markdown';
import { StatBlockById } from '../StatBlock';
import { EntityLink, ErrorBox, GmOnly, KeyValue, Loading, RealmBadge, TypeBadge, VisibilityBadge, Badge } from '../ui';
import { usePeek, type PeekData } from './context';

export function usePeekData(id: string | null) {
  const p = usePeek();
  const [data, setData] = useState<PeekData | undefined>(() => (id ? p?.cached(id) : undefined));
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!id || !p) return;
    let live = true;
    setError(null);
    setData(p.cached(id));
    p.load(id).then(
      (d) => live && setData(d),
      (e: Error) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, [id, p]);
  return { data, error };
}

/** A fact's value, with its record references as links. */
export function FactValue({ v }: { v: string }) {
  return <Markdown text={v} className="prose-peek text-[13px] [&_p]:my-0 font-sans" />;
}

export function PeekBadges({ d }: { d: PeekData }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <TypeBadge type={d.type} />
      <RealmBadge realm={d.realm} />
      <VisibilityBadge revealed={d.revealed} />
      {d.archived && <Badge tone="danger">Archived</Badge>}
    </div>
  );
}

/** `mode`: the inspector (narrow, sections fold) or split view (wide, sections open, with a close button). */
export function RecordPeek({ id, mode, onClose }: { id: string; mode: 'inspector' | 'beside'; onClose?: () => void }) {
  const p = usePeek();
  const { data: d, error } = usePeekData(id);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading label="Opening the record…" />;
  const pinned = p?.pins.some((x) => x.id === d.id);
  return (
    <article className="space-y-4" aria-label={d.name}>
      <header className="space-y-2">
        {d.image && <img src={`/api/uploads/${encodeURIComponent(d.image)}`} alt="" className="max-h-56 w-full rounded object-cover" />}
        <PeekBadges d={d} />
        <div className="flex items-start gap-2">
          <h2 className={`font-display text-gold ${mode === 'beside' ? 'text-2xl' : 'text-xl'} leading-tight flex-1 min-w-0`}>{d.name}</h2>
          {onClose && (
            <button className="btn-ghost" onClick={onClose} aria-label="Close" title="Close">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link to={`/e/${encodeURIComponent(d.id)}`} className="btn text-xs">
            <ExternalLink size={13} /> Open
          </Link>
          {mode === 'inspector' && p && (
            <button className="btn text-xs" onClick={() => (p.openBeside(d.id), p.setInspectorOpen(false))}>
              <Columns2 size={13} /> Open beside
            </button>
          )}
          {d.hasStatBlock && p && (
            <button className="btn text-xs" onClick={() => (pinned ? p.unpin(d.id) : p.pin({ id: d.id, name: d.name }))} aria-pressed={pinned}>
              <PinIcon size={13} /> {pinned ? 'Unpin stat block' : 'Pin stat block'}
            </button>
          )}
        </div>
      </header>
      {d.facts.length > 0 && <KeyValue items={d.facts.map(([k, v]) => [k, <FactValue key={k} v={v} />])} />}
      <div className="space-y-2">
        {d.sections.map((s, i) => {
          const body = <Markdown text={s.content} className="prose-lore prose-peek" />;
          const head = s.heading || (i === 0 ? 'Overview' : 'More');
          const inner =
            mode === 'beside' ? (
              <section>
                {s.heading && <h3 className="section-title mb-1">{s.heading}</h3>}
                {body}
              </section>
            ) : (
              <details open={i === 0}>
                <summary className="cursor-pointer section-title py-1">{head}</summary>
                {body}
              </details>
            );
          return s.secret ? (
            <GmOnly key={i} label={/\b(gm|dm) only\b/i.test(s.heading) ? null : undefined}>
              {inner}
            </GmOnly>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
      {d.hasStatBlock && (
        <details open={mode === 'beside'}>
          <summary className="cursor-pointer section-title py-1">Stat block</summary>
          <StatBlockById id={d.id} />
        </details>
      )}
      {d.links.length > 0 && (
        <section>
          <h3 className="section-title mb-1">Connections</h3>
          <ul className="space-y-0.5 text-sm">
            {d.links.map((l, i) => (
              <li key={`${l.id}-${i}`}>
                <span className="text-dim text-xs">{l.label}</span> <EntityLink id={l.id}>{l.name}</EntityLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
