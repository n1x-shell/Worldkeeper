import { useState } from 'react';
import { Swords } from 'lucide-react';
import { useApi } from '../lib/api';
import { Card, Empty, GmOnly } from './ui';
import { StatBlockEditor } from './StatBlockEditor';
import { rollsIn } from '@shared/statblock';

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
  init?: number | null;
  speed?: string;
  /** A score is null where the book gives words instead (abNote). */
  ab?: (number | null)[];
  abNote?: string;
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

/** Rolls a stat block offers where it can be rolled from (the encounter tracker): what the roll is, and its dice. */
export type BlockRoller = (label: string, expression: string, d20: boolean) => void;

function RollChips({ entry, text, onRoll }: { entry: string; text: string; onRoll: BlockRoller }) {
  const rolls = rollsIn(text);
  if (!rolls.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {rolls.map((x, i) => (
        <button
          // The same dice can appear twice in one entry (two claws); position tells them apart.
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          type="button"
          className="num rounded-sm border border-gold/40 px-1.5 text-xs text-gold hover:bg-gold/15 max-sm:min-h-8"
          onClick={() => onRoll(`${entry ? `${entry}: ` : ''}${x.what === 'to hit' ? 'to hit' : `${x.what === 'damage' ? '' : `${x.what} `}damage`}`, x.expression, x.d20)}
          title={`Roll ${x.expression}`}
        >
          {x.d20 ? `${x.expression.replace('1d20', '') || '+0'} to hit` : x.expression}
        </button>
      ))}
    </span>
  );
}

/**
 * A creature's, hazard's or person's stat block, laid out as in the 2024 books. With `onRoll` (the encounter tracker),
 * its attack rolls, damage and ability checks can be rolled from it.
 */
export function StatBlock({ s, onRoll }: { s: StatBlockData; onRoll?: BlockRoller }) {
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
        <p className="rounded-sm border border-line p-2">
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
          <p className="rounded-sm border border-line p-2">
            <b>Won't fight.</b> {s.tactics}
          </p>
        )}
        <p>
          {s.fights === false ? 'If it comes to it, use' : 'Use'} the <b>{s.base}</b> stat block from the Monster Manual{s.changes ? ', with these changes:' : '.'}
        </p>
        {s.changes && <p>{s.changes}</p>}
        {s.baseBlock && (
          <details className="rounded-sm border border-line p-2" open={!!onRoll}>
            <summary className="cursor-pointer">
              The <b>{s.baseBlock.name}</b> stat block, from your books
            </summary>
            <div className="mt-2">
              <StatBlock s={s.baseBlock} onRoll={onRoll} />
            </div>
          </details>
        )}
        {s.fights !== false && s.tactics && (
          <p className="rounded-sm border border-line p-2">
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
            {onRoll && <RollChips entry={e.name} text={e.text} onRoll={onRoll} />}
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
        <div className="grid grid-cols-6 text-center border border-line rounded-sm">
          {['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].map((k, i) => {
            const v = s.ab![i];
            const shown = typeof v === 'number' ? `${v} (${sg(mod(v))})` : '—';
            return (
              <div key={k} className="py-1">
                <div className="text-[10px] uppercase tracking-wider text-dim">{k}</div>
                <div className="num">
                  {typeof v === 'number' && onRoll ? (
                    <button type="button" className="rounded-sm px-1 underline decoration-gold/60 decoration-dotted underline-offset-4 hover:bg-gold/15" onClick={() => onRoll(`${k} check`, `1d20${mod(v) > 0 ? `+${mod(v)}` : mod(v) < 0 ? mod(v) : ''}`, true)} title={`Roll a ${k} check`}>
                      {shown}
                    </button>
                  ) : (
                    shown
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {s.abNote && <p className="text-xs italic text-dim">{s.abNote}</p>}
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
        <p className="rounded-sm border border-line p-2">
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
export function StatBlockById({ id, onRoll }: { id: string; onRoll?: BlockRoller }) {
  const { data } = useApi<StatBlockData | null>(`/api/statblocks/${encodeURIComponent(id)}`);
  if (data === undefined) return null;
  if (!data?.name) return <Empty compact title="No stat block for this one." />;
  return <StatBlock s={data} onRoll={onRoll} />;
}

/**
 * On a record's page (GM): its stat block, and a way to give it one or change it (kept in the library). A creature
 * or a person always has the panel; any other record has it once it has a stat block, or when one is asked for.
 */
export function StatBlockPanel({ entityId, name, fights, asked, onClosed }: { entityId: string; name: string; fights: boolean; asked: boolean; onClosed: () => void }) {
  const { data, reload } = useApi<(StatBlockData & { own?: boolean }) | null>(`/api/statblocks/${encodeURIComponent(entityId)}`);
  const [editing, setEditing] = useState(false);
  if (data === undefined) return null;
  const has = !!data && !!data.name;
  const open = editing || asked;
  const close = () => (setEditing(false), onClosed());
  const editor = open && (
    <StatBlockEditor
      entityId={entityId}
      name={name}
      start={has ? data : null}
      mine={has && !!data.own}
      hazardFirst={!fights}
      onClose={close}
      onSaved={() => {
        close();
        void reload();
      }}
    />
  );
  if (!has && !fights) return editor || null;
  return (
    <Card
      title={has && data.kind === 'hazard' ? 'Hazard' : 'Stat block'}
      icon={<Swords size={15} className="text-gold" />}
      actions={
        <span className="flex items-center gap-2 text-xs text-dim">
          GM only
          <button className="btn-ghost text-xs py-0.5" onClick={() => setEditing(true)} title={has && !data.own ? 'Yours is used instead of the worldbook’s; remove yours to have the worldbook’s back' : undefined}>
            {!has ? 'Give it a stat block' : data.own ? 'Change' : 'Write your own'}
          </button>
        </span>
      }
    >
      {has ? <StatBlock s={data} /> : <p className="text-sm text-dim">None yet. Use a stat block from the SRD or your books and say what's different, or write its own.</p>}
      {editor}
    </Card>
  );
}
