/** The sheet's Spells tab: spellcasting numbers, slots, and cantrips and prepared spells picked from the SRD. */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { ABILITIES, mod, signed, spellAttack, spellSaveDc, type Sheet, type Spell } from '@shared/sheet';
import { ABILITY_NAMES, classInfo, spellCounts, spellSlotsFor } from '@shared/rules2024';
import { Diamond, Field, LABEL, NO_SPIN, Pips, Rule, Stat } from './parts';
import { Check } from '../../components/ui/inputs';
import { loadSpells, useLoaded, type SrdSpell } from './options';

const LEVEL_NAME = (l: number) => (l === 0 ? 'Cantrips' : `Level ${l}`);

export function SpellsTab({ s, put, level, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; level: number; cls: string; readOnly?: boolean }) {
  const srd = useLoaded(loadSpells);
  const info = classInfo(cls);
  const spells = s.spells ?? [];
  const slots = s.spellSlots ?? {};
  const dc = spellSaveDc(s, level);
  const atk = spellAttack(s, level);
  const counts = spellCounts(cls, level);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const byName = useMemo(() => new Map((srd ?? []).map((x) => [x.name.toLowerCase(), x])), [srd]);
  const setSpell = (i: number, p: Partial<Spell>) => put({ spells: spells.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setSlot = (lvl: string, p: Partial<{ max: number; used: number }>) => {
    const cur = slots[lvl] ?? { max: 0, used: 0 };
    const next = { ...cur, ...p };
    next.used = Math.min(next.used, next.max);
    put({ spellSlots: { ...slots, [lvl]: next } });
  };
  const fromTable = () => {
    const t = spellSlotsFor(cls, level);
    put({ spellSlots: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { max: v, used: Math.min(v, slots[k]?.used ?? 0) }])) });
  };
  const cantrips = spells.filter((x) => x.level === 0).length;
  const leveled = spells.filter((x) => x.level > 0 && x.prepared).length;
  const addSpell = (x: SrdSpell) =>
    put({
      spells: [
        ...spells,
        {
          name: x.name,
          level: x.level,
          prepared: true,
          time: x.time.replace(/, which you take.*$/, ''),
          range: x.range,
          concentration: x.concentration,
          ritual: x.ritual,
          material: x.material,
          notes: '',
        },
      ],
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
        <Field label="Spellcasting ability" className="col-span-3 sm:col-span-1">
          <select className="input max-sm:min-h-10" value={s.spellAbility ?? ''} onChange={(e) => put({ spellAbility: e.target.value })} disabled={readOnly}>
            <option value="">None</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {ABILITY_NAMES[a]}
              </option>
            ))}
          </select>
        </Field>
        <Stat label="Modifier">{s.spellAbility ? signed(mod(s, s.spellAbility as (typeof ABILITIES)[number])) : '—'}</Stat>
        <Stat label="Spell save DC">{dc ?? '—'}</Stat>
        <Stat label="Spell attack">{atk === null ? '—' : signed(atk)}</Stat>
      </div>
      {info?.spellAbility && s.spellAbility !== info.spellAbility && !readOnly && (
        <p className="text-sm text-dim">
          {info.name}s cast with {ABILITY_NAMES[info.spellAbility]}.{' '}
          <button className="text-gold underline underline-offset-2 max-sm:min-h-10" onClick={() => put({ spellAbility: info.spellAbility })}>
            Use {ABILITY_NAMES[info.spellAbility]}
          </button>
        </p>
      )}

      <section className="space-y-2">
        <Rule
          actions={
            info?.caster && !readOnly ? (
              <button className="btn-ghost text-xs max-sm:min-h-10" onClick={fromTable} title={`Totals from the ${info.name} table at level ${level}`}>
                Set totals for {info.name} {level}
              </button>
            ) : null
          }
        >
          Spell slots
        </Rule>
        {info?.caster === 'pact' && <p className="text-xs text-dim">Pact Magic: all your slots are the same level, and come back on a short rest.</p>}
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-5 2xl:grid-cols-9">
          {Array.from({ length: 9 }, (_, i) => String(i + 1)).map((l) => {
            const sl = slots[l] ?? { max: 0, used: 0 };
            return (
              <div key={l} className={`space-y-1 rounded-md border p-2 text-center ${sl.max ? 'border-line bg-raised/50' : 'border-line/60 bg-transparent'}`}>
                <div className={`text-[10px] font-medium uppercase tracking-widest ${sl.max ? 'text-gold' : 'text-dim'}`}>Level {l}</div>
                <input
                  type="number"
                  min={0}
                  max={9}
                  className={`input-bare num text-center text-lg font-semibold ${sl.max ? '' : 'text-dim'} ${NO_SPIN}`}
                  value={sl.max || ''}
                  placeholder="0"
                  aria-label={`Level ${l} slots in total`}
                  disabled={readOnly}
                  onChange={(e) => setSlot(l, { max: Math.max(0, Number(e.target.value) || 0) })}
                />
                {sl.max > 0 && <Pips max={sl.max} used={sl.used} label={`Level ${l} slot`} onChange={readOnly ? undefined : (used) => setSlot(l, { used })} />}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Rule
          actions={
            !readOnly && (
              <button className="btn text-xs max-sm:min-h-10" onClick={() => setAdding(!adding)} aria-expanded={adding}>
                <Plus size={13} /> Add a spell
              </button>
            )
          }
        >
          Cantrips and prepared spells
        </Rule>
        {(counts.cantrips > 0 || counts.prepared > 0) && (
          <p className="text-xs text-dim">
            A level {level} {info?.name} has {counts.cantrips ? `${counts.cantrips} cantrips` : ''}
            {counts.cantrips && counts.prepared ? ' and ' : ''}
            {counts.prepared ? `${counts.prepared} prepared spells` : ''}. You have {cantrips} cantrips and {leveled} prepared.
          </p>
        )}
        {adding && <SpellPicker srd={srd} cls={info?.name ?? ''} level={level} have={spells} onPick={addSpell} onHand={() => put({ spells: [...spells, { name: '', level: 1, prepared: true }] })} />}
        {spells.length === 0 && <p className="text-sm text-dim">No spells yet.</p>}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
          .filter((l) => spells.some((x) => x.level === l))
          .map((l) => (
            <div key={l} className="space-y-1">
              <div className="flex items-baseline gap-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">{LEVEL_NAME(l)}</span>
                <span className="num text-xs text-dim">{spells.filter((x) => x.level === l).length}</span>
              </div>
              <div className={`hidden md:grid grid-cols-[1.5rem_1fr_7rem_6rem_5.5rem_1fr_1.75rem] gap-2 px-1 ${LABEL} text-[10px]!`}>
                <span title="Prepared">P</span>
                <span>Name</span>
                <span>Casting time</span>
                <span>Range</span>
                <span title="Concentration, Ritual, Material">C · R · M</span>
                <span>Notes</span>
                <span />
              </div>
              {spells.map((x, i) =>
                x.level !== l ? null : (
                  <div key={i} className="rounded-md border border-line bg-raised/40">
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2 p-1 md:grid-cols-[1.5rem_1fr_7rem_6rem_5.5rem_1fr_1.75rem]">
                      <span className="relative flex h-10 items-center justify-center rounded-sm md:h-7">
                        <Diamond
                          cover
                          on={l === 0 || x.prepared}
                          label={l === 0 ? 'Cantrip (always ready)' : 'Prepared'}
                          onChange={l === 0 || readOnly ? undefined : (on) => setSpell(i, { prepared: on })}
                        />
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        {byName.has(x.name.toLowerCase()) && (
                          <button
                            className="flex h-10 w-7 shrink-0 items-center justify-center rounded-sm text-dim hover:text-gold md:h-7"
                            onClick={() => setOpen(open === x.name ? null : x.name)}
                            aria-label={`${open === x.name ? 'Hide' : 'Show'} ${x.name}`}
                          >
                            {open === x.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                        <input
                          className="input-bare font-serif text-[15px]"
                          value={x.name}
                          placeholder="Spell name"
                          aria-label="Spell name"
                          disabled={readOnly}
                          onChange={(e) => setSpell(i, { name: e.target.value })}
                        />
                      </span>
                      <input
                        className="input-bare hidden md:block text-sm"
                        value={x.time ?? ''}
                        aria-label="Casting time"
                        disabled={readOnly}
                        onChange={(e) => setSpell(i, { time: e.target.value })}
                      />
                      <input className="input-bare hidden md:block text-sm" value={x.range ?? ''} aria-label="Range" disabled={readOnly} onChange={(e) => setSpell(i, { range: e.target.value })} />
                      <span className="hidden md:flex gap-1.5 items-center text-[11px] text-dim">
                        <Diamond on={!!x.concentration} label="Concentration" onChange={readOnly ? undefined : (on) => setSpell(i, { concentration: on })} />C
                        <Diamond on={!!x.ritual} label="Ritual" onChange={readOnly ? undefined : (on) => setSpell(i, { ritual: on })} />R
                        <Diamond on={!!x.material} label="Material component" onChange={readOnly ? undefined : (on) => setSpell(i, { material: on })} />M
                      </span>
                      <input className="input-bare hidden md:block text-sm" value={x.notes ?? ''} aria-label="Notes" disabled={readOnly} onChange={(e) => setSpell(i, { notes: e.target.value })} />
                      {!readOnly ? (
                        <button
                          className="flex h-10 w-10 items-center justify-center justify-self-end rounded-sm text-dim hover:bg-danger/10 hover:text-danger md:h-7 md:w-7"
                          aria-label={`Remove ${x.name || 'spell'}`}
                          onClick={() => put({ spells: spells.filter((_, j) => j !== i) })}
                        >
                          <X size={14} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {open === x.name && byName.get(x.name.toLowerCase()) && <SpellText sp={byName.get(x.name.toLowerCase())!} />}
                  </div>
                ),
              )}
            </div>
          ))}
      </section>
    </div>
  );
}

function SpellText({ sp }: { sp: SrdSpell }) {
  return (
    <div className="space-y-2 border-t border-line px-3 py-2.5 text-sm">
      <div className="num text-xs text-dim">
        {sp.level === 0 ? `${sp.school} cantrip` : `Level ${sp.level} ${sp.school}`} · {sp.time} · {sp.range} · {sp.components} · {sp.duration}
      </div>
      {sp.text.split('\n\n').map((p, i) => (
        <p key={i} className="max-w-[72ch] font-serif text-[16px] leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

function SpellPicker({ srd, cls, level, have, onPick, onHand }: { srd: SrdSpell[] | null; cls: string; level: number; have: Spell[]; onPick: (s: SrdSpell) => void; onHand: () => void }) {
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(!!cls && cls !== 'Artificer');
  const [lv, setLv] = useState<number | ''>('');
  const [peek, setPeek] = useState<string | null>(null);
  const maxLevel = Math.min(9, Math.ceil(level / 2));
  const list = (srd ?? [])
    .filter((x) => !have.some((h) => h.name.toLowerCase() === x.name.toLowerCase()))
    .filter((x) => !mine || x.classes.includes(cls))
    .filter((x) => (lv === '' ? true : x.level === lv))
    .filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);
  return (
    <div className="space-y-2 rounded-md border border-gold/40 bg-raised/40 p-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="relative flex-1 min-w-48">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input pl-8 max-sm:min-h-10" placeholder="Search the SRD's spells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" autoFocus />
        </span>
        <select className="input w-auto max-sm:min-h-10" value={lv} onChange={(e) => setLv(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Spell level">
          <option value="">Any level</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {LEVEL_NAME(l)}
              {l > maxLevel ? ' (above your slots)' : ''}
            </option>
          ))}
        </select>
        {cls && (
          <Check checked={mine} onChange={setMine} className="max-sm:min-h-10 max-sm:items-center">
            {cls} spells only
          </Check>
        )}
        <button className="btn-ghost text-sm max-sm:min-h-10" onClick={onHand}>
          Type one in
        </button>
      </div>
      {!srd && <p className="text-sm text-dim">Loading spells…</p>}
      <ul className="max-h-80 divide-y divide-line overflow-auto">
        {list.map((x) => (
          <li key={x.name} className="py-1.5">
            <div className="flex items-center gap-2">
              <button className="btn-ghost h-10 w-10 shrink-0 justify-center text-xs md:h-8 md:w-8" onClick={() => onPick(x)} aria-label={`Add ${x.name}`}>
                <Plus size={13} />
              </button>
              <button className="min-h-10 min-w-0 flex-1 text-left md:min-h-0" onClick={() => setPeek(peek === x.name ? null : x.name)}>
                <span className="font-serif text-[15px]">{x.name}</span>{' '}
                <span className="text-xs text-dim">
                  {x.level === 0 ? 'cantrip' : `level ${x.level}`} · {x.school} · {x.time.replace(/, which you take.*$/, '')}
                  {x.concentration ? ' · C' : ''}
                  {x.ritual ? ' · R' : ''}
                  {x.level > maxLevel ? ' · above your slots' : ''}
                </span>
              </button>
            </div>
            {peek === x.name && <SpellText sp={x} />}
          </li>
        ))}
        {srd && !list.length && <li className="py-2 text-sm text-dim">Nothing matches.</li>}
      </ul>
    </div>
  );
}
