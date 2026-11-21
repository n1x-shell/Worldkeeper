import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer, usePlayerIndex } from './context';
import type { PTie } from './source';
import { Eclipse, Network } from 'lucide-react';
import { Card } from '../components/ui/surfaces';
import { Empty, Loading } from '../components/ui/feedback';

const REALMS = [
  { key: 'aetheris', label: 'Aetheris' },
  { key: 'kaelmar', label: 'Kaelmar' },
  { key: 'ethereal', label: 'The Ethereal Realm' },
];

/**
 * A page title in the handbook's style (the same as PlayerPages' PlayerPageTitle). Kept here so the GM app, which
 * borrows WebDiagram, doesn't pull the handbook's pages in with it.
 */
function PageTitle({ eyebrow, icon, title, subtitle }: { eyebrow: string; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <header className="title-band elev-1 px-5 py-5 sm:px-7 sm:py-6">
      <div className="section-title flex items-center gap-2">
        {icon}
        {eyebrow}
      </div>
      <h1 className="mt-1.5 text-[26px] sm:text-[32px] text-ink leading-tight break-words">{title}</h1>
      <div className="mt-2 h-0.5 w-24 bg-gradient-to-r from-gold to-transparent" aria-hidden />
      <p className="mt-3 text-sm text-dim max-w-[72ch]">{subtitle}</p>
    </header>
  );
}

/** The faction web: who is allied with whom and who opposes whom, as far as the party knows. */
export function PlayerFactionWeb() {
  const { factionWeb } = usePlayerIndex();
  const { base } = usePlayer();
  const realmsHere = REALMS.filter((r) => (factionWeb ?? []).some((t) => t.aRealm === r.key || t.bRealm === r.key));
  const [realm, setRealm] = useState('');
  const shown = realm || realmsHere[0]?.key || '';
  const ties = useMemo(() => (factionWeb ?? []).filter((t) => t.aRealm === shown || t.bRealm === shown), [factionWeb, shown]);
  if (!factionWeb) return <Loading />;
  const allied = ties.filter((t) => t.kind !== 'opposed').length;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Records" icon={<Network size={14} />} title="The Faction Web" subtitle="Who stands with whom, and who's against whom, as far as you know. More will come to light." />
      {realmsHere.length > 1 && (
        <div className="flex gap-1 border-b border-line overflow-x-auto" role="tablist" aria-label="Realm">
          {realmsHere.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={r.key === shown}
              className={`px-4 min-h-[44px] -mb-px border-b-2 font-display text-[14px] tracking-wide whitespace-nowrap transition-colors ${r.key === shown ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'}`}
              onClick={() => setRealm(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {ties.length ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
          <Card featured className="px-3 py-4 sm:px-5" title="The web" aside={<span className="num">{`${new Set(ties.flatMap((t) => [t.a, t.b])).size} factions`}</span>}>
            <WebDiagram ties={ties} base={base} />
            <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-dim" aria-hidden>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 bg-gold/80" /> Allies
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 bg-danger/70" /> Enemies
              </span>
            </div>
          </Card>
          <div className="space-y-4">
            {allied > 0 && <TieList title="Allies" ties={ties.filter((t) => t.kind !== 'opposed')} base={base} />}
            {allied < ties.length && <TieList title="Enemies" ties={ties.filter((t) => t.kind === 'opposed')} base={base} />}
          </div>
        </div>
      ) : (
        <Empty icon={<Network size={22} />} title="You don't know of any ties yet." />
      )}
    </div>
  );
}

/** A ring of factions with lines between them: gold for allies, red for enemies. */
export function WebDiagram({ ties, base, onPick }: { ties: { a: string; b: string; aName: string; bName: string; kind: string; dashed?: boolean }[]; base?: string; onPick?: (id: string) => void }) {
  const nodes = [...new Map(ties.flatMap((t) => [[t.a, t.aName] as const, [t.b, t.bName] as const])).entries()];
  const R = 150;
  const pos = new Map(nodes.map(([id], i) => [id, { x: 320 + R * Math.cos((2 * Math.PI * i) / nodes.length - Math.PI / 2), y: 200 + R * Math.sin((2 * Math.PI * i) / nodes.length - Math.PI / 2) }]));
  return (
    <svg viewBox="0 0 640 400" className="w-full max-w-2xl mx-auto block" role="img" aria-label="Diagram of the faction web">
      {ties.map((t) => {
        const a = pos.get(t.a)!;
        const b = pos.get(t.b)!;
        return (
          <line
            key={`${t.a}-${t.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={2}
            strokeDasharray={t.dashed ? '5 4' : undefined}
            className={t.kind === 'opposed' ? 'stroke-danger/70' : 'stroke-gold/80'}
          />
        );
      })}
      {nodes.map(([id, name]) => {
        const p = pos.get(id)!;
        const left = p.x < 319;
        const label = name.replace(/^The /, '').replace(/\s*\(.*\)$/, '');
        const node = (
          <g>
            <circle cx={p.x} cy={p.y} r={6} className="fill-panel stroke-ink" strokeWidth={1.5} />
            <text x={p.x + (left ? -10 : 10)} y={p.y + 4} textAnchor={left ? 'end' : 'start'} className="fill-ink text-[13px]">
              {label}
            </text>
          </g>
        );
        if (onPick)
          return (
            <g key={id} className="cursor-pointer" onClick={() => onPick(id)}>
              {node}
            </g>
          );
        return base != null ? (
          <Link key={id} to={`${base}/e/${encodeURIComponent(id)}`}>
            {node}
          </Link>
        ) : (
          <g key={id}>{node}</g>
        );
      })}
    </svg>
  );
}

function TieList({ title, ties, base }: { title: string; ties: PTie[]; base: string }) {
  const link = (id: string, name: string) => (
    <Link to={`${base}/e/${encodeURIComponent(id)}`} data-peek={id} className="text-arcane hover:text-gold">
      {name}
    </Link>
  );
  const opposed = title === 'Enemies';
  return (
    <Card flush title={title} icon={<span className={`h-2 w-2 rounded-full ${opposed ? 'bg-danger' : 'bg-gold'}`} aria-hidden />} aside={<span className="num">{ties.length}</span>}>
      <ul className="divide-y divide-line/60 border-t border-line/60 text-sm">
        {ties.map((t) => (
          <li key={`${t.a}-${t.b}`} className="px-4 py-2.5 flex items-center gap-2 min-h-[44px]">
            <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5">
              {link(t.a, t.aName)}
              <span className={`text-xs ${opposed ? 'text-danger' : 'text-gold'}`}>{opposed ? 'against' : 'with'}</span>
              {link(t.b, t.bName)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Signs and omens: what the party has seen of something coming. */
export function PlayerOmens() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return <Loading />;
  const omens = campaigns.flatMap((c) => c.omens ?? []);
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Campaign" icon={<Eclipse size={14} />} title="Signs and Omens" subtitle="Strange things people have noticed. Nobody agrees what they mean." />
      {!omens.length && <Empty icon={<Eclipse size={22} />} title="Nothing strange yet. Or nothing anyone's noticed." />}
      <ol className="space-y-4">
        {omens.map((o, i) => (
          <li key={i}>
            <Card featured={i === omens.length - 1} className="px-5 py-5 sm:px-7">
              <div className="max-w-[72ch]">
                <div className="section-title">
                  Sign <span className="num">{i + 1}</span>
                  {i === omens.length - 1 && omens.length > 1 ? ' · the latest' : ''}
                </div>
                <p className="prose-lore mt-2 text-[18px] leading-relaxed text-ink my-0">{o.omen}</p>
                {o.rumours.length > 0 && (
                  <div className="mt-4 border-t border-line/70 pt-3">
                    <div className="text-[11px] uppercase tracking-wider text-dim mb-1.5">What people say</div>
                    <ul className="space-y-1.5">
                      {o.rumours.map((r) => (
                        <li key={r} className="font-serif italic text-[16px] text-ink/85 border-l-2 border-gold/40 pl-3">
                          “{r}”
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
