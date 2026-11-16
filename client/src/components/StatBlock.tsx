import { Swords } from 'lucide-react';
import { useApi } from '../lib/api';

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
      <div className="space-y-1">
        <div className="font-display text-gold/90 border-b border-gold/30">{title}</div>
        {list.map((e) => (
          <p key={e.name}>
            <b>
              <i>{e.name}.</i>
            </b>{' '}
            {e.text}
          </p>
        ))}
      </div>
    ) : null;
  return (
    <div className="space-y-2 text-sm">
      <div>
        <div className="font-display text-lg text-gold">{s.name}</div>
        <div className="italic text-dim text-xs">{s.meta}</div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <b>AC</b> {s.ac}
        </span>
        <span>
          <b>Initiative</b> {sg(s.init ?? 0)} ({10 + (s.init ?? 0)})
        </span>
        <span>
          <b>HP</b> {s.hp}
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
              <div>
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
            <b>CR</b> {s.cr} (XP {s.xp?.toLocaleString()}; PB +{s.pb})
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
    </div>
  );
}

/** On a record's page (GM): its stat block, if it has one. */
export function StatBlockPanel({ entityId }: { entityId: string }) {
  const { data } = useApi<StatBlockData | null>(`/api/statblocks/${encodeURIComponent(entityId)}`);
  if (!data) return null;
  return (
    <div className="panel-pad space-y-2">
      <div className="flex items-center gap-2">
        <Swords size={15} className="text-gold" />
        <div className="section-title">{data.kind === 'hazard' ? 'Hazard' : 'Stat block'}</div>
        <span className="text-xs text-dim ml-auto">GM only</span>
      </div>
      <StatBlock s={data} />
    </div>
  );
}
