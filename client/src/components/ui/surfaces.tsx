/** Page structure: cards, GM-only sections and key-value lists. No app dependencies (the player handbook uses these). */
import type { ReactNode } from 'react';

/**
 * A card: a panel with an optional title row (icon, title, a quiet aside and actions). `featured` adds the gilt
 * corners (record headers, the dashboard, session prep); `flush` drops the padding for tables and lists that run
 * edge to edge.
 */
export function Card({
  title,
  icon,
  aside,
  actions,
  featured,
  flush,
  className = '',
  id,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  featured?: boolean;
  flush?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
}) {
  const head = title || actions || aside;
  return (
    <section id={id} className={`panel elev-1 ${featured ? 'gilt-corners' : ''} ${flush ? '' : 'p-4'} ${className}`}>
      {head && (
        <div className={`flex items-center gap-2 ${flush ? 'px-4 pt-3 pb-2' : 'mb-3'}`}>
          {title && (
            <h2 className="section-title flex items-center gap-2 min-w-0">
              {icon}
              {title}
            </h2>
          )}
          {aside && <span className="text-xs text-dim">{aside}</span>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A titled block inside a card or page, without a frame of its own. */
export function Section({ title, actions, className = '', children }: { title: ReactNode; actions?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="section-title">{title}</h3>
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** GM-only material: a stitched red margin and a "GM only" label, the same everywhere. Never shown to players. */
export function GmOnly({ label = 'GM only', inline, className = '', children }: { label?: ReactNode; inline?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`gm-only ${inline ? 'gm-only-inline' : ''} ${className}`}>
      {label && <div className="gm-only-label">{label}</div>}
      {children}
    </div>
  );
}

/** Labels and values in two columns. Values that are numbers line up. */
export function KeyValue({ items, className = '' }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm ${className}`}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-dim">{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
