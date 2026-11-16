import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { proficiencyBonus } from '@shared/play';
import { CONDITIONS_2024 } from '@shared/domain';
import {
  ABILITIES,
  ALIGNMENTS,
  HIT_DICE,
  MASTERY_PROPERTIES,
  SIZES,
  SKILLS,
  initiative,
  longRest,
  mod,
  passive,
  saveBonus,
  score,
  signed,
  skillBonus,
  spellAttack,
  spellSaveDc,
  type Attack,
  type Sheet,
  type Spell,
} from '@shared/sheet';

export interface SheetChar {
  name: string;
  species: string;
  class_name: string;
  level: number;
  sheet: Sheet;
}

const Box = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
  <section className={`panel p-3 space-y-2 ${className}`}>
    <h2 className="font-display text-gold tracking-wide">{title}</h2>
    {children}
  </section>
);
const L = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-xs text-dim space-y-0.5">
    <span>{label}</span>
    {children}
  </label>
);
const num = (v: string) => (v === '' ? undefined : Number(v));

/**
 * A D&D 2024 character sheet in the app's own layout. Shared by the GM's party screen and the player's page on the
 * table server: one record, never two copies. Bonuses are worked out from the scores, level and proficiencies.
 */
export function FullSheet({ value, onChange, levelLocked = false }: { value: SheetChar; onChange: (next: SheetChar) => void; levelLocked?: boolean }) {
  const s = value.sheet;
  const lvl = value.level;
  const pb = proficiencyBonus(lvl);
  const set = (p: Partial<SheetChar>) => onChange({ ...value, ...p });
  const put = (p: Partial<Sheet>) => onChange({ ...value, sheet: { ...s, ...p } });
  const toggle = (list: string[] | undefined, item: string) => (list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item]);
  const dc = spellSaveDc(s, lvl);
  const atk = spellAttack(s, lvl);
  const attacks = s.attacks ?? [];
  const spells = s.spells ?? [];
  const setAttack = (i: number, p: Partial<Attack>) => put({ attacks: attacks.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const setSpell = (i: number, p: Partial<Spell>) => put({ spells: spells.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const ds = s.deathSaves ?? { successes: 0, failures: 0 };

  return (
    <div className="space-y-3">
      <Box title="Character">
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <L label="Name">
            <input className="input w-full" value={value.name} onChange={(e) => set({ name: e.target.value })} />
          </L>
          <L label="Species">
            <input className="input w-full" value={value.species} onChange={(e) => set({ species: e.target.value })} />
          </L>
          <L label="Class">
            <input className="input w-full" value={value.class_name} onChange={(e) => set({ class_name: e.target.value })} />
          </L>
          <L label="Subclass">
            <input className="input w-full" value={s.subclass ?? ''} onChange={(e) => put({ subclass: e.target.value })} />
          </L>
          <L label={levelLocked ? 'Level (your GM sets this)' : 'Level'}>
            <input
              type="number"
              min={1}
              max={20}
              className="input w-full"
              value={lvl}
              disabled={levelLocked}
              onChange={(e) => set({ level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
            />
          </L>
          <L label="Background">
            <input className="input w-full" value={s.background ?? ''} onChange={(e) => put({ background: e.target.value })} />
          </L>
          <L label="Alignment">
            <select className="input w-full" value={s.alignment ?? ''} onChange={(e) => put({ alignment: e.target.value })}>
              <option value="" />
              {ALIGNMENTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </L>
          <L label="Size">
            <select className="input w-full" value={s.size ?? ''} onChange={(e) => put({ size: e.target.value })}>
              <option value="" />
              {SIZES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </L>
          <L label="Experience points">
            <input type="number" min={0} className="input w-full" value={s.xp ?? ''} onChange={(e) => put({ xp: num(e.target.value) })} />
          </L>
          <L label="Proficiency bonus">
            <div className="input">+{pb}</div>
          </L>
          <L label="Heroic Inspiration">
            <label className="input flex items-center gap-2">
              <input type="checkbox" checked={!!s.inspiration} onChange={(e) => put({ inspiration: e.target.checked })} /> {s.inspiration ? 'Yes' : 'No'}
            </label>
          </L>
        </div>
      </Box>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Box title="Abilities and saving throws">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {ABILITIES.map((a) => (
              <div key={a} className="parchment p-2 text-center">
                <div className="text-[11px] font-display tracking-widest">{a}</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-full bg-transparent text-center text-xl font-serif outline-none"
                  value={score(s, a)}
                  onChange={(e) => put({ abilities: { ...(s.abilities ?? {}), [a]: Math.max(1, Math.min(30, Number(e.target.value) || 1)) } })}
                  aria-label={`${a} score`}
                />
                <div className="text-sm">{signed(mod(s, a))}</div>
                <label className="text-[10px] flex items-center justify-center gap-1" title="Proficient in this saving throw">
                  <input type="checkbox" checked={s.saves?.includes(a) ?? false} onChange={() => put({ saves: toggle(s.saves, a) })} /> save {signed(saveBonus(s, lvl, a))}
                </label>
              </div>
            ))}
          </div>
        </Box>

        <Box title="In a fight">
          <div className="grid gap-2 grid-cols-3">
            <L label="Armor Class">
              <input type="number" className="input w-full" value={s.ac ?? ''} onChange={(e) => put({ ac: num(e.target.value) })} />
            </L>
            <L label={`Initiative ${signed(initiative(s))}`}>
              <input type="number" className="input w-full" value={s.initiativeBonus ?? ''} placeholder={signed(mod(s, 'DEX'))} onChange={(e) => put({ initiativeBonus: num(e.target.value) })} />
            </L>
            <L label="Speed">
              <input className="input w-full" value={s.speed ?? ''} placeholder="30 ft." onChange={(e) => put({ speed: e.target.value })} />
            </L>
            <L label="Hit Points">
              <input type="number" className="input w-full" value={s.hp ?? ''} onChange={(e) => put({ hp: num(e.target.value) })} />
            </L>
            <L label="Max">
              <input type="number" min={0} className="input w-full" value={s.maxHp ?? ''} onChange={(e) => put({ maxHp: num(e.target.value) })} />
            </L>
            <L label="Temporary">
              <input type="number" min={0} className="input w-full" value={s.tempHp ?? ''} onChange={(e) => put({ tempHp: num(e.target.value) })} />
            </L>
            <L label="Hit Die">
              <select className="input w-full" value={s.hitDie ?? ''} onChange={(e) => put({ hitDie: e.target.value })}>
                <option value="" />
                {HIT_DICE.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </L>
            <L label={`Hit Dice spent (of ${lvl})`}>
              <input
                type="number"
                min={0}
                max={lvl}
                className="input w-full"
                value={s.hitDiceSpent ?? 0}
                onChange={(e) => put({ hitDiceSpent: Math.max(0, Math.min(lvl, Number(e.target.value) || 0)) })}
              />
            </L>
            <L label="Exhaustion">
              <input type="number" min={0} max={6} className="input w-full" value={s.exhaustion ?? 0} onChange={(e) => put({ exhaustion: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} />
            </L>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['successes', 'failures'] as const).map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className="text-dim text-xs">Death saves, {k}</span>
                {[1, 2, 3].map((n) => (
                  <input key={n} type="checkbox" checked={ds[k] >= n} onChange={() => put({ deathSaves: { ...ds, [k]: ds[k] >= n ? n - 1 : n } })} aria-label={`${k} ${n}`} />
                ))}
              </div>
            ))}
          </div>
          <L label="Concentrating on">
            <input className="input w-full" value={s.concentration ?? ''} onChange={(e) => put({ concentration: e.target.value || null })} />
          </L>
          <div className="flex flex-wrap gap-1">
            {CONDITIONS_2024.map((c) => {
              const on = s.conditions?.includes(c);
              return (
                <button key={c} type="button" className={`chip ${on ? 'border-danger text-danger' : 'border-line text-dim'}`} onClick={() => put({ conditions: toggle(s.conditions, c) })}>
                  {c}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn text-xs" onClick={() => onChange({ ...value, sheet: longRest(s) })}>
              Long rest
            </button>
            <span className="text-xs text-dim">All Hit Points and Hit Dice back, spell slots restored, Exhaustion down one. {s.lastRest && `Last: ${s.lastRest}.`}</span>
          </div>
        </Box>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Box title="Skills">
          <p className="text-xs text-dim">
            Tick once for proficiency, twice for expertise. Passive Perception {passive(s, lvl, 'Perception')}, Insight {passive(s, lvl, 'Insight')}, Investigation {passive(s, lvl, 'Investigation')}.
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-4 text-sm">
            {SKILLS.map((k) => {
              const prof = s.skills?.includes(k.name);
              const exp = s.expertise?.includes(k.name);
              return (
                <li key={k.name} className="flex items-center gap-2 py-0.5">
                  <button
                    type="button"
                    className={`w-5 h-5 rounded border text-[10px] ${exp ? 'bg-gold border-gold text-black' : prof ? 'bg-gold/40 border-gold' : 'border-line'}`}
                    aria-label={`${k.name}: ${exp ? 'expertise' : prof ? 'proficient' : 'not proficient'}`}
                    onClick={() =>
                      exp
                        ? put({ skills: (s.skills ?? []).filter((x) => x !== k.name), expertise: (s.expertise ?? []).filter((x) => x !== k.name) })
                        : prof
                          ? put({ expertise: [...(s.expertise ?? []), k.name] })
                          : put({ skills: [...(s.skills ?? []), k.name] })
                    }
                  >
                    {exp ? '2' : prof ? '1' : ''}
                  </button>
                  <span className="w-8 text-right">{signed(skillBonus(s, lvl, k.name))}</span>
                  <span>{k.name}</span>
                  <span className="text-[10px] text-dim">{k.ability}</span>
                </li>
              );
            })}
          </ul>
        </Box>

        <Box title="Proficiencies and training">
          <L label="Armor training">
            <input className="input w-full" value={s.armorProf ?? ''} onChange={(e) => put({ armorProf: e.target.value })} />
          </L>
          <L label="Weapons">
            <input className="input w-full" value={s.weaponProf ?? ''} onChange={(e) => put({ weaponProf: e.target.value })} />
          </L>
          <L label="Tools">
            <input className="input w-full" value={s.toolProf ?? ''} onChange={(e) => put({ toolProf: e.target.value })} />
          </L>
          <L label="Languages">
            <input className="input w-full" value={s.languages ?? ''} onChange={(e) => put({ languages: e.target.value })} />
          </L>
          <L label={`Weapon Mastery (weapon and property: ${MASTERY_PROPERTIES.join(', ')})`}>
            <input
              className="input w-full"
              value={(s.masteries ?? []).join(', ')}
              placeholder="Longsword (Sap), Shortbow (Vex)"
              onChange={(e) =>
                put({
                  masteries: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </L>
        </Box>
      </div>

      <Box title="Weapons and damaging cantrips">
        <div className="space-y-1">
          {attacks.map((a, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_2fr_2fr_auto] gap-1">
              <input className="input" placeholder="Name" value={a.name} onChange={(e) => setAttack(i, { name: e.target.value })} aria-label="Attack name" />
              <input className="input" placeholder="+5" value={a.bonus} onChange={(e) => setAttack(i, { bonus: e.target.value })} aria-label="Attack bonus" />
              <input className="input" placeholder="1d8+3 Slashing" value={a.damage} onChange={(e) => setAttack(i, { damage: e.target.value })} aria-label="Damage" />
              <input className="input" placeholder="Notes" value={a.notes} onChange={(e) => setAttack(i, { notes: e.target.value })} aria-label="Notes" />
              <button type="button" className="btn-ghost" aria-label="Remove attack" onClick={() => put({ attacks: attacks.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn text-xs" onClick={() => put({ attacks: [...attacks, { name: '', bonus: '', damage: '', notes: '' }] })}>
          <Plus size={12} /> Add
        </button>
      </Box>

      <Box title="Spellcasting">
        <div className="grid gap-2 grid-cols-3 max-w-md">
          <L label="Ability">
            <select className="input w-full" value={s.spellAbility ?? ''} onChange={(e) => put({ spellAbility: e.target.value })}>
              <option value="">None</option>
              {(['INT', 'WIS', 'CHA'] as const).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </L>
          <L label="Save DC">
            <div className="input">{dc ?? '–'}</div>
          </L>
          <L label="Attack bonus">
            <div className="input">{atk === null ? '–' : signed(atk)}</div>
          </L>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => {
            const slot = s.spellSlots?.[l] ?? { max: 0, used: 0 };
            const upd = (p: Partial<typeof slot>) => put({ spellSlots: { ...(s.spellSlots ?? {}), [l]: { ...slot, ...p } } });
            return (
              <div key={l} className="panel p-1.5 text-center text-xs w-20">
                <div className="text-dim">Level {l}</div>
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    min={0}
                    className="w-8 bg-transparent text-center"
                    value={slot.max - slot.used}
                    onChange={(e) => upd({ used: Math.max(0, slot.max - Number(e.target.value)) })}
                    aria-label={`Level ${l} slots left`}
                  />
                  /
                  <input type="number" min={0} className="w-8 bg-transparent text-center" value={slot.max} onChange={(e) => upd({ max: Number(e.target.value) })} aria-label={`Level ${l} slots`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          {spells.map((sp, i) => (
            <div key={i} className="grid grid-cols-[auto_4rem_1fr_auto] gap-1 items-center">
              <input type="checkbox" checked={sp.prepared} onChange={(e) => setSpell(i, { prepared: e.target.checked })} aria-label="Prepared" title="Prepared" />
              <select className="input" value={sp.level} onChange={(e) => setSpell(i, { level: Number(e.target.value) })} aria-label="Spell level">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Cantrip' : n}
                  </option>
                ))}
              </select>
              <input className="input" value={sp.name} placeholder="Spell" onChange={(e) => setSpell(i, { name: e.target.value })} aria-label="Spell name" />
              <button type="button" className="btn-ghost" aria-label="Remove spell" onClick={() => put({ spells: spells.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn text-xs" onClick={() => put({ spells: [...spells, { name: '', level: 0, prepared: true }] })}>
          <Plus size={12} /> Add a spell
        </button>
      </Box>

      <div className="grid gap-3 lg:grid-cols-3">
        {(
          [
            ['features', 'Class features'],
            ['traits', 'Species traits'],
            ['feats', 'Feats'],
          ] as const
        ).map(([k, t]) => (
          <Box key={k} title={t}>
            <textarea className="input w-full min-h-[120px]" value={s[k] ?? ''} onChange={(e) => put({ [k]: e.target.value })} aria-label={t} />
          </Box>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Box title="Equipment">
          <textarea className="input w-full min-h-[120px]" value={s.equipment ?? ''} onChange={(e) => put({ equipment: e.target.value })} aria-label="Equipment" />
        </Box>
        <Box title="Coins">
          <div className="grid grid-cols-5 gap-1">
            {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((c) => (
              <L key={c} label={c.toUpperCase()}>
                <input type="number" min={0} className="input w-full px-1" value={s.coins?.[c] ?? ''} onChange={(e) => put({ coins: { ...(s.coins ?? {}), [c]: num(e.target.value) } })} />
              </L>
            ))}
          </div>
        </Box>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {(
          [
            ['appearance', 'Appearance'],
            ['personality', 'Personality'],
            ['backstory', 'Backstory'],
          ] as const
        ).map(([k, t]) => (
          <Box key={k} title={t}>
            <textarea className="input w-full min-h-[120px]" value={s[k] ?? ''} onChange={(e) => put({ [k]: e.target.value })} aria-label={t} />
          </Box>
        ))}
      </div>
    </div>
  );
}
