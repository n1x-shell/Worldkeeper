/** The sheet's Spells tab: spellcasting numbers, slots, and cantrips and prepared spells picked from the SRD. */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { ABILITIES, mod, signed, spellAttack, spellSaveDc, type Sheet, type Spell } from '@shared/sheet';
import { ABILITY_NAMES, classInfo, spellCounts, spellSlotsFor } from '@shared/rules2024';
import { Diamond, Field, Pips, Rule } from './parts';
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
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Spellcasting ability">
          <select className="input" value={s.spellAbility ?? ''} onChange={(e) => put({ spellAbility: e.target.value })} disabled={readOnly}>
            <option value="">None</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {ABILITY_NAMES[a]}
              </option>
            ))}
          </select>
        </Field>
        <div className="stat-box">
          <span className="stat-label">Modifier</span>
          <span className="stat-value">{s.spellAbility ? signed(mod(s, s.spellAbility as (typeof ABILITIES)[number])) : '—'}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Spell save DC</span>
          <span className="stat-value">{dc ?? '—'}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Spell attack</span>
          <span className="stat-value">{atk === null ? '—' : signed(atk)}</span>
        </div>
      </div>
      {info?.spellAbility && s.spellAbility !== info.spellAbility && !readOnly && (
        <p className="text-sm text-dim">
          {info.name}s cast with {ABILITY_NAMES[info.spellAbility]}.{' '}
          <button className="text-gold underline" onClick={() => put({ spellAbility: info.spellAbility })}>
            Use {ABILITY_NAMES[info.spellAbility]}
          </button>
        </p>
      )}

      <section className="space-y-2">
        <Rule
          actions={
            info?.caster && !readOnly ? (
              <button className="btn-ghost text-xs" onClick={fromTable} title={`Totals from the ${info.name} table at level ${level}`}>
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
              <div key={l} className={`ledger-card p-2 space-y-1 text-center ${sl.max ? '' : 'opacity-60'}`}>
                <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Level {l}</div>
                <input
                  type="number"
                  min={0}
                  max={9}
                  className="input-bare text-center"
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
              <button className="btn text-xs" onClick={() => setAdding(!adding)} aria-expanded={adding}>
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
              <div className="text-xs uppercase tracking-[0.16em] text-gold/80">{LEVEL_NAME(l)}</div>
              <div className="hidden md:grid grid-cols-[1.25rem_1fr_7rem_6rem_5.5rem_1fr_1.5rem] gap-2 px-1 text-[10px] uppercase tracking-wider text-dim">
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
                  <div key={i} className="rounded border border-line/60 bg-bg/30">
                    <div className="grid grid-cols-[1.25rem_1fr_1.5rem] md:grid-cols-[1.25rem_1fr_7rem_6rem_5.5rem_1fr_1.5rem] gap-2 items-center p-1">
                      <Diamond on={l === 0 || x.prepared} label={l === 0 ? 'Cantrip (always ready)' : 'Prepared'} onChange={l === 0 || readOnly ? undefined : (on) => setSpell(i, { prepared: on })} />
                      <span className="flex items-center gap-1 min-w-0">
                        {byName.has(x.name.toLowerCase()) && (
                          <button className="text-dim hover:text-gold" onClick={() => setOpen(open === x.name ? null : x.name)} aria-label={`${open === x.name ? 'Hide' : 'Show'} ${x.name}`}>
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
                        <button className="text-dim hover:text-danger" aria-label={`Remove ${x.name || 'spell'}`} onClick={() => put({ spells: spells.filter((_, j) => j !== i) })}>
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
    <div className="border-t border-line/60 px-3 py-2 text-sm space-y-2">
      <div className="text-xs text-dim">
        {sp.level === 0 ? `${sp.school} cantrip` : `Level ${sp.level} ${sp.school}`} · {sp.time} · {sp.range} · {sp.components} · {sp.duration}
      </div>
      {sp.text.split('\n\n').map((p, i) => (
        <p key={i} className="font-serif text-[15px] leading-snug">
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
    <div className="ledger-card space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-2 top-2.5 text-dim" />
          <input className="input pl-7" placeholder="Search the SRD's spells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" autoFocus />
        </span>
        <select className="input w-auto" value={lv} onChange={(e) => setLv(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Spell level">
          <option value="">Any level</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {LEVEL_NAME(l)}
              {l > maxLevel ? ' (above your slots)' : ''}
            </option>
          ))}
        </select>
        {cls && (
          <label className="text-sm flex items-center gap-1.5">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {cls} spells only
          </label>
        )}
        <button className="btn-ghost text-sm" onClick={onHand}>
          Type one in
        </button>
      </div>
      {!srd && <p className="text-sm text-dim">Loading spells…</p>}
      <ul className="max-h-80 overflow-auto divide-y divide-line/50">
        {list.map((x) => (
          <li key={x.name} className="py-1.5">
            <div className="flex items-center gap-2">
              <button className="btn-ghost text-xs" onClick={() => onPick(x)} aria-label={`Add ${x.name}`}>
                <Plus size={13} />
              </button>
              <button className="flex-1 text-left" onClick={() => setPeek(peek === x.name ? null : x.name)}>
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
