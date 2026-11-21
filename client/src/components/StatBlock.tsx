import { Swords } from 'lucide-react';
import { useApi } from '../lib/api';
import { Card, Empty, GmOnly } from './ui';

interface Entry {
  name: string;
  text: string;
}
export interface StatBlockData {
  id: string;
  name: string;
  meta: string;
  kind?: 'hazard' | 'creature' | 'npc';
  ac?: number;
  hp?: string;
  hpAvg?: number;
  init?: number;
  speed?: string;
  ab?: number[];
  cr?: string;
  xp?: number;
  pb?: number;
  saves?: string;
  skills?: string;
  vuln?: string;
  res?: string;
  imm?: string;
  cimm?: string;
  gear?: string;
  senses?: string;
  languages?: string;
  traits?: Entry[];
  actions?: Entry[];
  bonus?: Entry[];
  reactions?: Entry[];
  legendary?: Entry[];
  trigger?: string;
  effect?: string;
  counter?: string;
  tactics?: string;
  /** A short card: the Monster Manual stat block it uses, and what's different. */
  base?: string;
  changes?: string;
  /** False for someone who won't fight: the card says what they do instead. */
  fights?: boolean;
  /** GM-only looks, for someone the handbook doesn't describe. */
  looks?: string;
  /** True when how they fight is deliberately left open: looks only, no numbers yet. */
  open?: boolean;
  /** The book stat block a card's base names, when the GM's books have it. */
  baseBlock?: StatBlockData | null;
  /** The book and page, for a creature from the GM's books. */
  source?: string;
}

const sg = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const mod = (s: number) => Math.floor((s - 10) / 2);

/** A creature's, hazard's or person's stat block, laid out as in the 2024 books. */
export function StatBlock({ s }: { s: StatBlockData }) {
  if (s.kind === 'hazard')
    return (
      <div className="space-y-2 text-sm">
        <div>
          <div className="font-display text-lg text-gold">{s.name}</div>
          <div className="italic text-dim text-xs">{s.meta}</div>
        </div>
        {(
          [
            ['Trigger', s.trigger],
            ['Effect', s.effect],
            ['Countermeasures', s.counter],
          ] as const
        ).map(
          ([k, v]) =>
            v && (
              <p key={k}>
                <b>{k}.</b> {v}
              </p>
            ),
        )}
      </div>
    );
  const looks = s.looks && (
    <GmOnly inline label="Looks (GM only)">
      <p>{s.looks}</p>
    </GmOnly>
  );
  if (s.open)
    return (
      <div className="space-y-2 text-sm">
        <div>
          <div className="font-display text-lg text-gold">{s.name}</div>
          <div className="italic text-dim text-xs">{s.meta}</div>
        </div>
        {looks}
        <p className="rounded border border-line p-2">
          <b>Left open.</b> {s.tactics}
        </p>
      </div>
    );
  if (s.base)
    return (
      <div className="space-y-2 text-sm">
        <div>
          <div className="font-display text-lg text-gold">{s.name}</div>
          <div className="italic text-dim text-xs">{s.meta}</div>
        </div>
        {looks}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <b>AC</b> <span className="num">{s.ac}</span>
          </span>
          <span>
            <b>Initiative</b>{' '}
            <span className="num">
              {sg(s.init ?? 0)} ({10 + (s.init ?? 0)})
            </span>
          </span>
          <span>
            <b>HP</b> <span className="num">{s.hp}</span>
          </span>
          {s.cr && (
            <span>
              <b>CR</b> <span className="num">{s.cr}</span>
            </span>
          )}
        </div>
        {s.fights === false && (
          <p className="rounded border border-line p-2">
            <b>Won't fight.</b> {s.tactics}
          </p>
        )}
        <p>
          {s.fights === false ? 'If it comes to it, use' : 'Use'} the <b>{s.base}</b> stat block from the Monster Manual{s.changes ? ', with these changes:' : '.'}
        </p>
        {s.changes && <p>{s.changes}</p>}
        {s.baseBlock && (
          <details className="rounded border border-line p-2">
            <summary className="cursor-pointer">
              The <b>{s.baseBlock.name}</b> stat block, from your books
            </summary>
            <div className="mt-2">
              <StatBlock s={s.baseBlock} />
            </div>
          </details>
        )}
        {s.fights !== false && s.tactics && (
          <p className="rounded border border-line p-2">
            <b>In a fight.</b> {s.tactics}
          </p>
        )}
      </div>
    );
  const lines = (
    [
      ['Saving Throws', s.saves],
      ['Skills', s.skills],
      ['Vulnerabilities', s.vuln],
      ['Resistances', s.res],
      ['Immunities', s.imm],
      ['Condition Immunities', s.cimm],
      ['Gear', s.gear],
      ['Senses', s.senses],
      ['Languages', s.languages],
    ] as const
  ).filter(([, v]) => v);
  const section = (title: string, list?: Entry[]) =>
    list?.length ? (
      <details open className="space-y-1">
        <summary className="cursor-pointer select-none font-display text-gold/90 border-b border-gold/30 hover:text-gold">{title}</summary>
        {list.map((e) => (
          <p key={e.name || e.text.slice(0, 40)} className="whitespace-pre-line">
            {e.name && (
              <>
                <b>
                  <i>{e.name}.</i>
                </b>{' '}
              </>
            )}
            {e.text}
          </p>
        ))}
      </details>
    ) : null;
  return (
    <div className="space-y-2 text-sm">
      <div>
        <div className="font-display text-lg text-gold">{s.name}</div>
        <div className="italic text-dim text-xs">{s.meta}</div>
      </div>
      {looks}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <b>AC</b> <span className="num">{s.ac}</span>
        </span>
        <span>
          <b>Initiative</b>{' '}
          <span className="num">
            {sg(s.init ?? 0)} ({10 + (s.init ?? 0)})
          </span>
        </span>
        <span>
          <b>HP</b> <span className="num">{s.hp}</span>
        </span>
        <span>
          <b>Speed</b> {s.speed}
        </span>
      </div>
      {s.ab && (
        <div className="grid grid-cols-6 text-center border border-line rounded">
          {['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].map((k, i) => (
            <div key={k} className="py-1">
              <div className="text-[10px] uppercase tracking-wider text-dim">{k}</div>
              <div className="num">
                {s.ab![i]} ({sg(mod(s.ab![i]))})
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-0.5">
        {lines.map(([k, v]) => (
          <div key={k}>
            <b>{k}</b> {v}
          </div>
        ))}
        {s.cr && (
          <div>
            <b>CR</b>{' '}
            <span className="num">
              {s.cr} (XP {s.xp?.toLocaleString()}; PB +{s.pb})
            </span>
          </div>
        )}
      </div>
      {s.tactics && (
        <p className="rounded border border-line p-2">
          <b>In a fight.</b> {s.tactics}
        </p>
      )}
      {section('Traits', s.traits)}
      {section('Actions', s.actions)}
      {section('Bonus Actions', s.bonus)}
      {section('Reactions', s.reactions)}
      {section('Legendary Actions', s.legendary)}
      {s.source && <p className="text-xs text-dim">{s.source}</p>}
    </div>
  );
}

/** A stat block by id: a world record's, or a creature from the GM's books ("book:…"). */
export function StatBlockById({ id }: { id: string }) {
  const { data } = useApi<StatBlockData | null>(`/api/statblocks/${encodeURIComponent(id)}`);
  if (data === undefined) return null;
  if (!data) return <Empty compact title="No stat block for this one." />;
  return <StatBlock s={data} />;
}

/** On a record's page (GM): its stat block, if it has one. */
export function StatBlockPanel({ entityId }: { entityId: string }) {
  const { data } = useApi<StatBlockData | null>(`/api/statblocks/${encodeURIComponent(entityId)}`);
  if (!data) return null;
  return (
    <Card title={data.kind === 'hazard' ? 'Hazard' : 'Stat block'} icon={<Swords size={15} className="text-gold" />} actions={<span className="text-xs text-dim">GM only</span>}>
      <StatBlock s={data} />
    </Card>
  );
}
