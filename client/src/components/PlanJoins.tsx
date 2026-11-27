/**
 * Joined plans (v0.9.27): where a plan stands among the others. The place it is in, with its number there; the places
 * that lead to it; the ways on from it, and the places in it that are records of their own; and the way to add a level
 * below. And, for a town or a city, its districts: what each is called, and a closer plan of each.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, CornerDownRight, Layers, Map as MapIcon, Plus } from 'lucide-react';
import { useAppState } from '../lib/store';
import type { KeyRoom, PlanKind, Ward } from '@shared/plan/index';
import { Card, Check, Field } from './ui';

export interface Joined {
  within: { id: string; name: string; plan: boolean; n: number | null; ward: string | null } | null;
  under: { id: string; name: string; type: string; plan: boolean }[];
  from: { id: string; name: string; n: number; room: string; how: string }[];
}

const planOf = (id: string, room?: number | null) => `/e/${encodeURIComponent(id)}/plan${room ? `?room=${room}` : ''}`;

export function PlanJoins({
  name,
  kind,
  joined,
  rooms,
  recordOf,
  wardRecords,
  selected,
  busy,
  onBelow,
}: {
  name: string;
  kind: PlanKind;
  joined: Joined;
  rooms: KeyRoom[];
  /** The record a numbered place is, if it is one. */
  recordOf: (r: KeyRoom) => string | undefined;
  /** The records that are its districts: shown with the districts, not here. */
  wardRecords: string[];
  selected: number | null;
  busy: boolean;
  /** A level below, reached from a numbered place: what it is called, whether it is a dungeon or a cave, and whether stairs are drawn here. */
  onBelow: (at: number, title: string, kind: 'dungeon' | 'cave', stairs: boolean) => void;
}) {
  const { index } = useAppState();
  const [adding, setAdding] = useState(false);
  const [at, setAt] = useState(0);
  const [title, setTitle] = useState('');
  const [below, setBelow] = useState<'dungeon' | 'cave'>('dungeon');
  const [stairs, setStairs] = useState(true);
  const called = (id: string) => index.get(id)?.name ?? 'a record that is gone';

  // What leads on from here: the ways keyed to its places, and the places that are records of their own.
  const ways = rooms.flatMap((r, i) => r.items.filter((it) => it.kind === 'way' && it.entity).map((it) => ({ n: i + 1, room: r.name, how: it.title.trim(), id: it.entity! })));
  const own = rooms.flatMap((r, i) => (recordOf(r) ? [{ n: i + 1, room: r.name, id: recordOf(r)! }] : []));
  const shown = new Set([...ways.map((w) => w.id), ...own.map((o) => o.id), ...wardRecords]);
  const others = joined.under.filter((u) => !shown.has(u.id));
  const empty = !joined.within && !joined.from.length && !ways.length && !own.length && !others.length;

  const begin = () => {
    setAt(selected != null && selected < rooms.length ? selected : Math.max(0, rooms.length - 1));
    setTitle(`${name}: the level below`.slice(0, 80));
    setAdding(true);
  };

  return (
    <Card title="Joined plans" aside={empty ? 'This plan stands alone so far.' : undefined}>
      <div className="space-y-2 text-sm" data-testid="plan-joins">
        {joined.within && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ArrowUpFromLine size={14} className="shrink-0 text-dim" />
            <span>
              In{' '}
              <Link className="font-medium underline" to={planOf(joined.within.id, joined.within.n)} data-testid="plan-join-within">
                {joined.within.name}
              </Link>
              {joined.within.n ? `: number ${joined.within.n} on its plan.` : joined.within.ward ? `: its ${joined.within.ward}.` : joined.within.plan ? ', which has a plan.' : '.'}
            </span>
          </p>
        )}
        {joined.from.map((f, i) => (
          <p key={`from${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ArrowUpFromLine size={14} className="shrink-0 text-dim" />
            <span>
              Reached from{' '}
              <Link className="font-medium underline" to={planOf(f.id, f.n)} data-testid="plan-join-from">
                {f.n}. {f.room || 'a place'} of {f.name}
              </Link>
              {f.how ? ` (${f.how.toLowerCase()}).` : '.'}
            </span>
          </p>
        ))}
        {ways.map((w, i) => (
          <p key={`way${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ArrowDownToLine size={14} className="shrink-0 text-dim" />
            <span>
              {w.n}. {w.room}: {w.how ? `${w.how.toLowerCase()} to` : 'a way on to'}{' '}
              <Link className="font-medium underline" to={planOf(w.id)} data-testid="plan-join-way">
                {called(w.id)}
              </Link>
              .
            </span>
          </p>
        ))}
        {own.map((o, i) => (
          <p key={`own${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CornerDownRight size={14} className="shrink-0 text-dim" />
            <span>
              {o.n}. {o.room} is{' '}
              <Link className="font-medium underline" to={planOf(o.id)} data-testid="plan-join-own">
                {called(o.id)}
              </Link>
              , with a plan of its own.
            </span>
          </p>
        ))}
        {others.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Layers size={14} className="shrink-0 text-dim" />
            <span>Also kept under it:</span>
            {others.map((u) => (
              <Link key={u.id} className="chip border-line hover:border-gold" to={planOf(u.id)}>
                <MapIcon size={11} className="mr-1 inline" />
                {u.name}
              </Link>
            ))}
          </p>
        )}

        {adding ? (
          <form
            className="space-y-2 rounded-sm border border-line bg-raised/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim() || !rooms[at]) return;
              onBelow(at, title.trim(), below, stairs && kind !== 'settlement');
              setAdding(false);
            }}
            data-testid="plan-below-form"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="The way down is from">
                <select className="input" value={at} onChange={(e) => setAt(Number(e.target.value))}>
                  {rooms.map((r, i) => (
                    <option key={r.id} value={i}>
                      {i + 1}. {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What the level below is called">
                <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="It is a">
                <select className="input" value={below} onChange={(e) => setBelow(e.target.value as 'dungeon' | 'cave')}>
                  <option value="dungeon">Dungeon</option>
                  <option value="cave">Cave</option>
                </select>
              </Field>
            </div>
            {kind !== 'settlement' && (
              <Check checked={stairs} onChange={setStairs} hint="Drawing them makes this plan a drawing of your own, as changing it by hand does.">
                Draw the stairs down in that place
              </Check>
            )}
            <p className="text-xs text-dim">
              The level below becomes a record kept under this one, for you only, with a plan of its own whose way in is the stairs up to here. Here, “Way on: stairs down” is keyed to the place you chose. Each plan then has a link to the other.
            </p>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={busy || !title.trim()} data-testid="plan-below-add">
                <Plus size={14} /> Add it
              </button>
              <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
                Not now
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn" disabled={busy || !rooms.length} onClick={begin} data-testid="plan-below">
            <ArrowDownToLine size={14} /> Add a level below
          </button>
        )}
      </div>
    </Card>
  );
}

/** A town's or a city's districts: what each is called, and a closer plan of each as a record of its own. */
export function PlanDistricts({ districts, wards, busy, onName, onMake }: { districts: { name: string }[]; wards: Ward[]; busy: boolean; onName: (i: number, name: string) => void; onMake?: (i: number) => void }) {
  const { index } = useAppState();
  return (
    <Card title="Districts" aside={`${districts.length}. Each is named for what stands in it; call them what you like.`}>
      <ol className="space-y-2 text-sm" data-testid="plan-districts">
        {districts.map((d, i) => {
          const record = wards[i]?.record;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input className="input w-56" value={wards[i]?.name ?? d.name} maxLength={60} aria-label={`What district ${i + 1} is called`} onChange={(e) => onName(i, e.target.value)} onBlur={(e) => !e.target.value.trim() && onName(i, d.name)} />
              {record ? (
                <Link className="btn-ghost text-xs" to={planOf(record)} data-testid="plan-district-plan">
                  <MapIcon size={12} /> {index.get(record)?.name ?? 'Its record'}: its own plan
                </Link>
              ) : onMake ? (
                <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => onMake(i)} title="The same streets and houses, drawn closer, as a record kept under this one: to change by hand and to key." data-testid="plan-district-make">
                  <Plus size={12} /> A plan of its own
                </button>
              ) : (
                <span className="text-xs text-dim">Keep the plan as a record to give a district a plan of its own.</span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
