import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer, usePlayerIndex } from './context';
import type { PTie } from './source';

const REALMS = [
  { key: 'aetheris', label: 'Aetheris' },
  { key: 'kaelmar', label: 'Kaelmar' },
  { key: 'ethereal', label: 'The Ethereal Realm' },
];

/** The faction web: who is allied with whom and who opposes whom, as far as the party knows. */
export function PlayerFactionWeb() {
  const { factionWeb } = usePlayerIndex();
  const { base } = usePlayer();
  const realmsHere = REALMS.filter((r) => (factionWeb ?? []).some((t) => t.aRealm === r.key || t.bRealm === r.key));
  const [realm, setRealm] = useState('');
  const shown = realm || realmsHere[0]?.key || '';
  const ties = useMemo(() => (factionWeb ?? []).filter((t) => t.aRealm === shown || t.bRealm === shown), [factionWeb, shown]);
  if (!factionWeb) return null;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-gold">The Faction Web</h1>
        <p className="text-sm text-dim mt-1">Who stands with whom, and who's against whom, as far as you know. More will come to light.</p>
      </div>
      {realmsHere.length > 1 && (
        <div className="flex gap-1 border-b border-line" role="tablist">
          {realmsHere.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={r.key === shown}
              className={`px-4 py-2 -mb-px border-b-2 font-display ${r.key === shown ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'}`}
              onClick={() => setRealm(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {ties.length ? (
        <>
          <WebDiagram ties={ties} base={base} />
          <TieList ties={ties} base={base} />
        </>
      ) : (
        <p className="text-dim">You don't know of any ties yet.</p>
      )}
    </div>
  );
}

/** A ring of factions with lines between them: gold for allies, red for enemies. */
export function WebDiagram({ ties, base, onPick }: { ties: { a: string; b: string; aName: string; bName: string; kind: string; dashed?: boolean }[]; base?: string; onPick?: (id: string) => void }) {
  const nodes = [...new Map(ties.flatMap((t) => [[t.a, t.aName] as const, [t.b, t.bName] as const])).entries()];
  const R = 150;
  const pos = new Map(nodes.map(([id], i) => [id, { x: 220 + R * Math.cos((2 * Math.PI * i) / nodes.length - Math.PI / 2), y: 200 + R * Math.sin((2 * Math.PI * i) / nodes.length - Math.PI / 2) }]));
  return (
    <svg viewBox="0 0 440 400" className="w-full max-w-xl mx-auto block" role="img" aria-label="Diagram of the faction web">
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
        const left = p.x < 220;
        const label = name.replace(/^The /, '').replace(/\s*\(.*\)$/, '');
        const node = (
          <g>
            <circle cx={p.x} cy={p.y} r={6} className="fill-panel stroke-ink" strokeWidth={1.5} />
            <text x={p.x + (left ? -10 : 10)} y={p.y + 4} textAnchor={left ? 'end' : 'start'} className="fill-ink text-[11px]">
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

function TieList({ ties, base }: { ties: PTie[]; base: string }) {
  const link = (id: string, name: string) => (
    <Link to={`${base}/e/${encodeURIComponent(id)}`} className="text-gold hover:underline">
      {name}
    </Link>
  );
  return (
    <ul className="grid gap-1 sm:grid-cols-2 text-sm">
      {ties.map((t) => (
        <li key={`${t.a}-${t.b}`} className="panel px-3 py-2 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${t.kind === 'opposed' ? 'bg-danger' : 'bg-gold'}`} />
          <span>
            {link(t.a, t.aName)} {t.kind === 'opposed' ? 'and' : 'stand with'} {link(t.b, t.bName)}
            {t.kind === 'opposed' ? ' are enemies' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Signs and omens: what the party has seen of something coming. */
export function PlayerOmens() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const omens = campaigns.flatMap((c) => c.omens ?? []);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-gold">Signs and Omens</h1>
        <p className="text-sm text-dim mt-1">Strange things people have noticed. Nobody agrees what they mean.</p>
      </div>
      {!omens.length && <p className="text-dim">Nothing strange yet. Or nothing anyone's noticed.</p>}
      <ol className="space-y-3">
        {omens.map((o, i) => (
          <li key={i} className="panel p-4 space-y-2">
            <p className="font-serif text-[17px]">{o.omen}</p>
            <ul className="list-disc pl-5 text-sm text-dim">
              {o.rumours.map((r) => (
                <li key={r}>"{r}"</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
