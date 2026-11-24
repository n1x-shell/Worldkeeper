/** The builder's steps from Background on: each one a step card of choices. */
import { useRef, useState } from 'react';
import { Camera, ChevronDown, Dices, Minus, Plus, Search, Trash2, Wand2 } from 'lucide-react';
import { ItemRulesList } from '../../components/ItemRules';
import { Field, Segmented } from '../../components/ui/inputs';
import { Empty, Loading } from '../../components/ui/feedback';
import { ABILITIES, ALIGNMENTS, SKILLS, signed, type Ability } from '../../../../shared/sheet';
import {
  ABILITY_NAMES,
  BACKGROUNDS,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  RARE_LANGUAGES,
  STANDARD_LANGUAGES,
  WEAPONS,
  classInfo,
  masteryCount,
  spellCounts,
  spellSlotsFor,
} from '../../../../shared/rules2024';
import type { PEntity } from '../source';
import { portraitFromFile, type backgroundsFrom, type SrdSpell, type SrdText } from '../sheet/options';
import { backgroundFor, expertiseCount, finalScores, improvementSlots, kitFor, methodPool, packBackground, pointsSpent, rollScore, type Build, type Improvement } from './compute';
import { ChoiceCard, Count, Group, Pill, StepCard, cardGrid } from './parts';

type SetB = (p: Partial<Build>) => void;
export interface Nav {
  step: number;
  onBack: () => void;
  onNext: () => void;
}
type World = ReturnType<typeof backgroundsFrom>;
const toggle = (list: string[], x: string, max: number) => (list.includes(x) ? list.filter((y) => y !== x) : list.length < max ? [...list, x] : list);

export function BackgroundStep({ b, set, world, rules, nav }: { b: Build; set: SetB; world: World; rules: SrdText | null; nav: Nav }) {
  const choose = (name: string) => {
    const phb = BACKGROUNDS.find((x) => x.name === name);
    const pack = phb ? null : packBackground(rules, name);
    set({ background: name, bgAbilities: phb ? phb.abilities : pack?.abilities.length === 3 ? pack.abilities : [], plusTwo: '', plusOne: '', bgKit: 0 });
  };
  const bg = backgroundFor(b, world, rules);
  // The world's background tables, by where they're from; then any other backgrounds in the rules packs.
  const froms = [...new Set(world.map((x) => x.from))];
  const others = Object.entries(rules?.backgrounds ?? {})
    .filter(([n]) => !BACKGROUNDS.some((x) => x.name.toLowerCase() === n.toLowerCase()) && !world.some((x) => x.name.toLowerCase() === n.toLowerCase()))
    .sort(([a], [z]) => a.localeCompare(z));
  return (
    <StepCard {...nav} title="Choose a background" note="Your background gives two skills, a tool, an Origin feat, and raises three ability scores.">
      {bg && !bg.fixed && (
        <div className="rounded-md border border-gold/40 bg-gold/5 p-3 space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="flex-1 min-w-[12rem]">
              The world&apos;s backgrounds don&apos;t name the abilities they raise: choose three that fit <b className="font-semibold">{bg.name}</b>.
            </span>
            <Count n={b.bgAbilities.length} of={3} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ABILITIES.map((a) => {
              const on = b.bgAbilities.includes(a);
              return (
                <Pill key={a} on={on} onClick={() => set({ bgAbilities: on ? b.bgAbilities.filter((x) => x !== a) : [...b.bgAbilities, a].slice(-3), plusTwo: '', plusOne: '' })}>
                  {ABILITY_NAMES[a]}
                </Pill>
              );
            })}
          </div>
        </div>
      )}
      {froms.map((from) => {
        const list = world.filter((x) => x.from === from);
        if (!list.length) return null;
        return (
          <Group key={from} title={from === 'Ethereal' ? 'The Ethereal Realm' : from}>
            <div className={cardGrid}>
              {list.map((x) => (
                <ChoiceCard key={x.name} on={b.background === x.name} title={x.name} sub={`${x.who} ${x.skills}; ${x.tool}; ${x.feat}.`} onClick={() => choose(x.name)} />
              ))}
            </div>
          </Group>
        );
      })}
      <Group title="From the Player's Handbook">
        <div className={cardGrid}>
          {BACKGROUNDS.map((x) => (
            <ChoiceCard
              key={x.name}
              on={b.background === x.name}
              title={x.name}
              sub={`${x.skills.join(', ')}; ${x.tool}; ${x.feat}. Raises ${x.abilities.join(', ')}.`}
              onClick={() => choose(x.name)}
            />
          ))}
        </div>
      </Group>
      {others.length > 0 && (
        <Group title="Other backgrounds in your rules">
          <div className={cardGrid}>
            {others.map(([n, x]) => (
              <ChoiceCard
                key={n}
                on={b.background === n}
                title={n}
                sub={[[x.skills.join(', '), x.tool, x.feat].filter(Boolean).join('; '), x.abilities.length ? `Raises ${x.abilities.join(', ')}.` : '', x.source ?? ''].filter(Boolean).join('. ')}
                onClick={() => choose(n)}
              />
            ))}
          </div>
        </Group>
      )}
    </StepCard>
  );
}

const METHODS: { value: Build['method']; label: string; what: string }[] = [
  { value: 'standard', label: 'Standard array', what: 'Give each ability one of 15, 14, 13, 12, 10 and 8.' },
  { value: 'pointbuy', label: 'Point buy', what: `Spend ${POINT_BUY_BUDGET} points. Scores go from 8 to 15 before increases.` },
  { value: 'roll', label: 'Roll', what: 'Roll 4d6 six times, drop the lowest die each time, and place the totals.' },
  { value: 'manual', label: 'Enter', what: 'Type in scores you rolled at the table or your GM gave you.' },
];

export function AbilitiesStep({ b, set, feats, nav }: { b: Build; set: SetB; feats: string[]; nav: Nav }) {
  const pool = methodPool(b);
  const final = finalScores(b);
  const spent = pointsSpent(b.base);
  const setBase = (a: Ability, v: number) => set({ base: { ...b.base, [a]: v } });
  const used = (v: number, except: Ability) => {
    // How many of this value the pool has, and how many other abilities already took it.
    const have = pool.filter((x) => x === v).length;
    const taken = ABILITIES.filter((x) => x !== except && b.base[x] === v).length;
    return taken >= have;
  };
  const choose = (m: Build['method']) => {
    if (m === 'pointbuy') set({ method: m, base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 } });
    else if (m === 'roll') set({ method: m, rolls: Array.from({ length: 6 }, rollScore), base: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 } });
    else if (m === 'standard') set({ method: m, base: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 } });
    else set({ method: m, base: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
  };
  const imps = improvementSlots(b);
  const setImp = (imp: Improvement) => set({ improvements: [...b.improvements.filter((i) => i.level !== imp.level), imp] });
  const bgAb = b.bgAbilities;
  const left = POINT_BUY_BUDGET - spent;
  const assigned = ABILITIES.filter((a) => b.base[a] > 0).length;
  return (
    <StepCard {...nav} title="Ability scores" note="Choose how to set your scores, then where your background's increases go.">
      <Group title="How to set them">
        <div className="max-w-full overflow-x-auto [&_button]:min-h-10 sm:[&_button]:min-h-0">
          <Segmented label="How to set scores" value={b.method} onChange={choose} options={METHODS.map((m) => ({ value: m.value, label: m.label, title: m.what }))} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-dim">{METHODS.find((m) => m.value === b.method)?.what}</span>
          {b.method === 'roll' && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-dim">Your rolls:</span>
              {b.rolls.map((r, i) => (
                <span key={i} className="num inline-flex h-7 min-w-7 items-center justify-center rounded border border-line bg-raised px-1 text-sm font-semibold">
                  {r}
                </span>
              ))}
              <button className="btn-ghost min-h-10 sm:min-h-0" onClick={() => choose('roll')}>
                <Dices size={14} /> Roll again
              </button>
            </span>
          )}
        </div>
        {b.method === 'pointbuy' && (
          <div className="max-w-sm space-y-1" aria-live="polite">
            <div className={`flex items-baseline justify-between text-sm ${left < 0 ? 'text-danger' : ''}`}>
              <span className="text-dim">Points left</span>
              <span className="num font-semibold">
                {left} <span className="text-dim font-normal">of {POINT_BUY_BUDGET}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-raised border border-line overflow-hidden" aria-hidden>
              <div className={`h-full ${left < 0 ? 'bg-danger' : 'bg-gold/70'}`} style={{ width: `${Math.min(100, (spent / POINT_BUY_BUDGET) * 100)}%` }} />
            </div>
          </div>
        )}
      </Group>

      <Group title="Your scores" count={b.method === 'standard' || b.method === 'roll' ? <Count n={assigned} of={6} label="placed" /> : undefined}>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {ABILITIES.map((a) => (
            <div key={a} className="flex flex-col items-center gap-2 rounded-md border border-line bg-raised/50 p-2.5 text-center">
              <div className="text-[11px] uppercase tracking-[0.16em] text-dim">{ABILITY_NAMES[a]}</div>
              {b.method === 'standard' || b.method === 'roll' ? (
                <select className="input num text-center min-h-10 sm:min-h-0" value={b.base[a] || ''} onChange={(e) => setBase(a, Number(e.target.value))} aria-label={`${ABILITY_NAMES[a]} score`}>
                  <option value="">—</option>
                  {[...new Set(pool)]
                    .sort((x, y) => y - x)
                    .map((v) => (
                      <option key={v} value={v} disabled={used(v, a) && b.base[a] !== v}>
                        {v}
                      </option>
                    ))}
                </select>
              ) : b.method === 'pointbuy' ? (
                <div className="flex items-center gap-1">
                  <button className="btn h-10 w-10 sm:h-8 sm:w-8 justify-center px-0" disabled={b.base[a] <= 8} onClick={() => setBase(a, b.base[a] - 1)} aria-label={`Lower ${ABILITY_NAMES[a]}`}>
                    <Minus size={14} />
                  </button>
                  <span className="num w-7 text-center text-lg font-semibold">{b.base[a]}</span>
                  <button
                    className="btn h-10 w-10 sm:h-8 sm:w-8 justify-center px-0"
                    disabled={b.base[a] >= 15 || spent - POINT_BUY_COST[b.base[a]] + POINT_BUY_COST[b.base[a] + 1] > POINT_BUY_BUDGET}
                    onClick={() => setBase(a, b.base[a] + 1)}
                    aria-label={`Raise ${ABILITY_NAMES[a]}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <input
                  type="number"
                  min={3}
                  max={20}
                  className="input num text-center min-h-10 sm:min-h-0"
                  value={b.base[a]}
                  onChange={(e) => setBase(a, Number(e.target.value) || 10)}
                  aria-label={`${ABILITY_NAMES[a]} score`}
                />
              )}
              <div className="w-full border-t border-line pt-1.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-dim">Final</div>
                <div className="num leading-tight">
                  <span className="text-xl font-semibold text-ink">{final[a] || '—'}</span> <span className="text-sm text-gold">{final[a] ? signed(Math.floor((final[a] - 10) / 2)) : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group title="Background increases" note={bgAb.length === 3 ? `${b.background} raises ${bgAb.map((a) => ABILITY_NAMES[a]).join(', ')}. No score can go above 20 this way.` : undefined}>
        {bgAb.length < 3 ? (
          <Empty compact title={`Choose a background first${b.background ? ', and the three abilities it raises' : ''}.`} />
        ) : (
          <div className="space-y-3">
            <div className="[&_button]:min-h-10 sm:[&_button]:min-h-0 max-w-full overflow-x-auto">
              <Segmented
                label="Background increases"
                value={b.bonusMode}
                onChange={(m) => set({ bonusMode: m })}
                options={[
                  { value: '2-1', label: '+2 and +1' },
                  { value: '1-1-1', label: '+1 to all three' },
                ]}
              />
            </div>
            {b.bonusMode === '2-1' && (
              <div className="grid gap-3 grid-cols-2 max-w-md">
                <Field label="+2 to">
                  <select className="input min-h-10 sm:min-h-0" value={b.plusTwo} onChange={(e) => set({ plusTwo: e.target.value as Ability })}>
                    <option value="">—</option>
                    {bgAb.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_NAMES[a]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="+1 to">
                  <select className="input min-h-10 sm:min-h-0" value={b.plusOne} onChange={(e) => set({ plusOne: e.target.value as Ability })}>
                    <option value="">—</option>
                    {bgAb
                      .filter((a) => a !== b.plusTwo)
                      .map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
            )}
          </div>
        )}
      </Group>

      {imps.length > 0 && (
        <Group title={`Improvements and feats, to level ${b.level}`} note="The SRD has a few feats; type any other feat on your sheet afterwards.">
          <ul className="divide-y divide-line rounded-md border border-line">
            {imps.map((imp) => (
              <li key={imp.level} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <span className="num w-16 shrink-0 text-dim">Level {imp.level}</span>
                {imp.level !== 19 && (
                  <select
                    className="input w-auto min-h-10 sm:min-h-0"
                    value={imp.kind}
                    onChange={(e) => setImp({ ...imp, kind: e.target.value as Improvement['kind'] })}
                    aria-label={`Level ${imp.level}`}
                  >
                    <option value="asi">Ability Score Improvement</option>
                    <option value="feat">Another feat</option>
                  </select>
                )}
                {imp.kind === 'asi' ? (
                  <>
                    {[0, 1].map((slot) => (
                      <select
                        key={slot}
                        className="input w-auto min-h-10 sm:min-h-0"
                        value={imp.picks?.[slot] ?? ''}
                        aria-label={`Level ${imp.level} increase ${slot + 1}`}
                        onChange={(e) => setImp({ ...imp, picks: [0, 1].map((j) => (j === slot ? (e.target.value as Ability | '') : (imp.picks?.[j] ?? ''))) })}
                      >
                        <option value="">+1 to…</option>
                        {ABILITIES.map((a) => (
                          <option key={a} value={a}>
                            {ABILITY_NAMES[a]}
                          </option>
                        ))}
                      </select>
                    ))}
                    <span className="text-xs text-dim">Pick the same one twice for +2.</span>
                  </>
                ) : (
                  <select className="input w-auto min-h-10 sm:min-h-0" value={imp.feat} onChange={(e) => setImp({ ...imp, feat: e.target.value })} aria-label={`Level ${imp.level} feat`}>
                    <option value="">{imp.level === 19 ? 'Epic Boon…' : 'Feat…'}</option>
                    {feats.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </Group>
      )}
    </StepCard>
  );
}

export function SkillsStep({ b, set, bgSkills, nav }: { b: Build; set: SetB; bgSkills: string[]; nav: Nav }) {
  const info = classInfo(b.cls);
  const from = info ? (info.skillFrom === 'any' ? SKILLS.map((s) => s.name) : info.skillFrom) : [];
  const n = info?.skillCount ?? 0;
  const exp = expertiseCount(b.cls, b.level);
  const all = [...new Set([...bgSkills, ...b.classSkills])];
  const mastery = masteryCount(b.cls, b.level);
  return (
    <StepCard
      {...nav}
      title="Skills and languages"
      note={info ? `Your background gives ${bgSkills.join(' and ') || 'two skills'}. Choose ${n} more from the ${info.name} list.` : 'Choose a class first: it says which skills you can pick.'}
    >
      <Group title="Skills" count={info ? <Count n={b.classSkills.length} of={n} /> : undefined}>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {SKILLS.map((k) => {
            const fromBg = bgSkills.includes(k.name);
            const allowed = from.includes(k.name);
            const on = fromBg || b.classSkills.includes(k.name);
            return (
              <button
                key={k.name}
                type="button"
                disabled={fromBg || !allowed || (!on && b.classSkills.length >= n)}
                onClick={() => set({ classSkills: toggle(b.classSkills, k.name, n), expertise: b.expertise.filter((e) => e !== k.name || fromBg) })}
                className={`flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                  on ? 'border-gold/60 bg-gold/10' : 'border-line bg-raised/50 hover:border-gold/50'
                } disabled:pointer-events-none ${!on ? 'disabled:opacity-45' : ''}`}
                aria-pressed={on}
              >
                <span className="diamond" aria-hidden aria-checked={on} />
                <span className="flex-1">{k.name}</span>
                <span className={`text-[11px] ${fromBg ? 'text-gold' : 'text-dim'}`}>{fromBg ? 'Background' : ABILITY_NAMES[k.ability].slice(0, 3)}</span>
              </button>
            );
          })}
        </div>
      </Group>
      {exp > 0 && (
        <Group title="Expertise" note={`Choose ${exp} of your skills: your Proficiency Bonus counts twice for them.`} count={<Count n={b.expertise.length} of={exp} />}>
          <div className="flex flex-wrap gap-1.5">
            {all.length ? (
              all.map((k) => (
                <Pill key={k} on={b.expertise.includes(k)} onClick={() => set({ expertise: toggle(b.expertise, k, exp) })}>
                  {k}
                </Pill>
              ))
            ) : (
              <span className="text-sm text-dim italic">Choose your skills first.</span>
            )}
          </div>
        </Group>
      )}
      <Group title="Languages" note="Everyone speaks Common. Choose two more (rare ones, in italics, only with your GM's say-so)." count={<Count n={b.languages.length} of={2} />}>
        <div className="flex flex-wrap gap-1.5">
          {[...STANDARD_LANGUAGES.filter((l) => l !== 'Common'), ...RARE_LANGUAGES].map((l) => (
            <Pill key={l} on={b.languages.includes(l)} italic={RARE_LANGUAGES.includes(l)} onClick={() => set({ languages: toggle(b.languages, l, 2) })}>
              {l}
            </Pill>
          ))}
        </div>
      </Group>
      {mastery > 0 && (
        <Group title="Weapon mastery" note={`Choose ${mastery} weapons whose mastery property you can use.`} count={<Count n={b.masteries.length} of={mastery} />}>
          <div className="flex flex-wrap gap-1.5">
            {WEAPONS.filter((w) => w.category === 'Simple' || info?.martial !== 'none').map((w) => (
              <Pill key={w.name} on={b.masteries.includes(w.name)} onClick={() => set({ masteries: toggle(b.masteries, w.name, mastery) })}>
                {w.name} <span className="text-xs text-dim">{w.mastery}</span>
              </Pill>
            ))}
          </div>
        </Group>
      )}
    </StepCard>
  );
}

export function EquipmentStep({ b, set, world, rules, nav }: { b: Build; set: SetB; world: World; rules: SrdText | null; nav: Nav }) {
  const info = classInfo(b.cls);
  const bg = backgroundFor(b, world, rules);
  const kit = kitFor(b, world, rules);
  return (
    <StepCard {...nav} title="Starting equipment" note="Take each kit, or its gold to buy your own.">
      {!info && !bg && <Empty compact title="Choose a class and a background first: each comes with a kit." />}
      {info && (
        <Group title={info.name}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {info.equipment.map((k, i) => (
              <ChoiceCard
                key={i}
                on={b.classKit === i}
                title={`${String.fromCharCode(65 + i)}: ${k.items.length ? 'Kit' : 'Gold only'}`}
                badge={`${k.gp} GP`}
                sub={k.items.length ? k.items.join(', ') : 'Buy your own gear'}
                onClick={() => set({ classKit: i })}
              />
            ))}
          </div>
        </Group>
      )}
      {bg && (
        <Group title={bg.name}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <ChoiceCard
              on={b.bgKit === 0}
              title={bg.kit ? 'A: Kit' : 'A: The kit in your book'}
              badge={bg.kit ? `${bg.kit.gp} GP` : undefined}
              sub={bg.kit ? bg.kit.items.join(', ') : 'Add its items to your sheet yourself'}
              onClick={() => set({ bgKit: 0 })}
            />
            <ChoiceCard on={b.bgKit === 1} title="B: Gold only" badge="50 GP" sub="Buy your own gear" onClick={() => set({ bgKit: 1 })} />
          </div>
        </Group>
      )}
      <div className="rounded-md border border-gold/40 bg-gold/5 p-3 space-y-1.5">
        <div className="flex items-baseline gap-2">
          <h3 className="section-title flex-1">You carry</h3>
          <span className="num text-base font-semibold text-gold">{kit.gp} GP</span>
        </div>
        <p className="text-sm">{kit.items.length ? kit.items.join(', ') : <span className="text-dim italic">Nothing yet</span>}</p>
        {kit.bgKitUnknown && <p className="text-xs text-dim">Plus your background&apos;s kit from your book (or take B for 50 GP).</p>}
      </div>
      <ItemRulesList names={kit.items} title="What your kit does" />
    </StepCard>
  );
}

export function SpellsStep({ b, set, srd, nav }: { b: Build; set: SetB; srd: SrdSpell[] | null; nav: Nav }) {
  const info = classInfo(b.cls);
  if (!info?.caster)
    return (
      <StepCard {...nav} title="Spells">
        <Empty compact title={info ? `${info.name}s don't cast spells (unless a subclass or feat says so).` : 'Choose a class first.'}>
          Go on to the next step.
        </Empty>
      </StepCard>
    );
  return <SpellList b={b} set={set} srd={srd} nav={nav} />;
}

function SpellList({ b, set, srd, nav }: { b: Build; set: SetB; srd: SrdSpell[] | null; nav: Nav }) {
  const info = classInfo(b.cls)!;
  const counts = spellCounts(b.cls, b.level);
  const slots = spellSlotsFor(b.cls, b.level);
  const maxLevel = Math.max(0, ...Object.keys(slots).map(Number));
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState<string | null>(null);
  const mine = (srd ?? []).filter((x) => x.classes.includes(info.name) && x.level <= maxLevel);
  const chosen = (lvl0: boolean) => b.spells.filter((n) => (srd?.find((x) => x.name === n)?.level === 0) === lvl0).length;
  const flip = (x: SrdSpell) => set({ spells: b.spells.includes(x.name) ? b.spells.filter((n) => n !== x.name) : [...b.spells, x.name] });
  const levels = Array.from({ length: maxLevel + 1 }, (_, l) => l).map((l) => ({ l, list: mine.filter((x) => x.level === l && (!q || x.name.toLowerCase().includes(q.toLowerCase()))) }));
  return (
    <StepCard
      {...nav}
      title="Spells"
      note={
        info.outsideSrd
          ? `The ${info.name} isn't in the SRD: add your spells on your sheet from your book.`
          : `A level ${b.level} ${info.name} knows ${counts.cantrips} cantrips and prepares ${counts.prepared} spells, of level ${maxLevel} or lower.`
      }
      aside={
        !info.outsideSrd && (
          <>
            <Count n={chosen(true)} of={counts.cantrips} label="cantrips" />
            <Count n={chosen(false)} of={counts.prepared} label="prepared" />
          </>
        )
      }
    >
      {!info.outsideSrd && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="relative block w-full sm:max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
              <input className="input pl-8 min-h-10 sm:min-h-0" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" />
            </label>
            <span className="text-sm text-dim num">
              Slots:{' '}
              {Object.entries(slots)
                .map(([l, n]) => `${n} × level ${l}`)
                .join(', ')}
            </span>
          </div>
          {!srd && <Loading label="Loading spells…" lines={4} />}
          {srd && levels.every((x) => !x.list.length) && <Empty compact title={q ? `No ${info.name} spell matches “${q}”.` : `The SRD has no ${info.name} spells.`} />}
          {levels.map(({ l, list }) =>
            list.length ? (
              <Group key={l} title={l === 0 ? 'Cantrips' : `Level ${l}`}>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((x) => {
                    const on = b.spells.includes(x.name);
                    const open = peek === x.name;
                    return (
                      <li key={x.name} className={`rounded-md border transition-colors ${on ? 'border-gold/60 bg-gold/10' : 'border-line bg-raised/50'} ${open ? 'sm:col-span-2' : ''}`}>
                        <div className="flex min-h-10 items-center gap-1 pl-1.5 pr-1">
                          <button className="diamond h-8 w-8" role="checkbox" aria-checked={on} aria-label={`Choose ${x.name}`} onClick={() => flip(x)} />
                          <button className="flex flex-1 min-w-0 items-center gap-2 py-1.5 text-left text-sm" onClick={() => setPeek(open ? null : x.name)} aria-expanded={open}>
                            <span className="flex-1 min-w-0 truncate">{x.name}</span>
                            <span className="shrink-0 text-[11px] text-dim">
                              {x.school}
                              {x.concentration ? ' · C' : ''}
                              {x.ritual ? ' · R' : ''}
                            </span>
                            <ChevronDown size={14} className={`shrink-0 text-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                          </button>
                        </div>
                        {open && (
                          <div className="border-t border-line px-3 py-2 space-y-1.5">
                            <div className="text-xs text-dim">
                              {x.time} · {x.range} · {x.components} · {x.duration}
                            </div>
                            <div className="prose-lore max-w-[72ch] space-y-1.5">
                              {x.text.split('\n\n').map((p, i) => (
                                <p key={i} className="font-serif text-[15px] leading-normal">
                                  {p}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Group>
            ) : null,
          )}
        </>
      )}
    </StepCard>
  );
}

export function DetailsStep({ b, set, canSuggest, suggestTitle, onSuggest, nav }: { b: Build; set: SetB; canSuggest: boolean; suggestTitle: string; onSuggest: () => void; nav: Nav }) {
  return (
    <StepCard {...nav} title="Who they are" note="A name, a face and a few lines on who they are. Only the name is needed.">
      <div className="max-w-2xl space-y-4">
        <PortraitPicker value={b.portrait} onChange={(portrait) => set({ portrait })} name={b.name} />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_10rem] items-end">
          <Field label="Name">
            <input className="input min-h-10 sm:min-h-0" value={b.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <button className="btn min-h-10 sm:min-h-0 justify-center" onClick={onSuggest} disabled={!canSuggest} title={suggestTitle}>
            <Wand2 size={14} /> Suggest
          </button>
          <Field label="Pronouns">
            <input className="input min-h-10 sm:min-h-0" value={b.pronouns} onChange={(e) => set({ pronouns: e.target.value })} placeholder="they/them" />
          </Field>
        </div>
        <Field label="Alignment">
          <select className="input min-h-10 sm:min-h-0 sm:max-w-xs" value={b.alignment} onChange={(e) => set({ alignment: e.target.value })}>
            <option value="" />
            {ALIGNMENTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Appearance">
          <textarea className="input min-h-20" value={b.appearance} onChange={(e) => set({ appearance: e.target.value })} placeholder="How they look, what people notice first" />
        </Field>
        <Field label="Personality">
          <textarea className="input min-h-20" value={b.personality} onChange={(e) => set({ personality: e.target.value })} placeholder="Ideals, bonds, flaws, habits" />
        </Field>
      </div>
    </StepCard>
  );
}

export function TiesStep({ b, set, starts, factions, nav }: { b: Build; set: SetB; starts: { where: string; what: string }[]; factions: PEntity[]; nav: Nav }) {
  return (
    <StepCard {...nav} title="Ties to the world" note="Where the story starts, and who your character knows. All of it is optional.">
      <Group title="Where you start" note="The whole group starts together. Agree on this one with the others.">
        {starts.length ? (
          <div className="grid gap-2.5 md:grid-cols-3">
            {starts.map((s) => (
              <ChoiceCard key={s.where} on={b.start === s.where} title={s.where} sub={s.what} onClick={() => set({ start: s.where })} />
            ))}
          </div>
        ) : (
          <Empty compact title="The handbook doesn't list starting places. Ask your GM where you begin." />
        )}
      </Group>
      <Group title="People and places">
        <div className="max-w-3xl grid gap-3 sm:grid-cols-2">
          <Field label="Hometown">
            <input
              className="input min-h-10 sm:min-h-0"
              value={b.hometown}
              onChange={(e) => set({ hometown: e.target.value })}
              placeholder="Anywhere in the handbook, or somewhere that no longer exists"
            />
          </Field>
          <Field label="A faction you have ties to">
            <select className="input min-h-10 sm:min-h-0" value={b.faction} onChange={(e) => set({ faction: e.target.value })}>
              <option value="">None</option>
              {factions.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          {(
            [
              ['family', 'Family', 'Who they are, and whether they still talk to you'],
              ['rival', 'A rival', 'Someone who wants what you want'],
              ['debt', 'A debt', 'Who you owe, and what'],
            ] as const
          ).map(([k, label, ph]) => (
            <Field key={k} label={label}>
              <input className="input min-h-10 sm:min-h-0" value={b[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Backstory, and anything else your GM should know">
              <textarea className="input min-h-28" value={b.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Group>
    </StepCard>
  );
}

function PortraitPicker({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  return (
    <div className="flex items-center gap-4">
      <div className="ledger-frame w-24 shrink-0">
        <div className="ledger-frame-inner flex items-center justify-center">
          {value ? (
            <img src={value} alt={`Portrait of ${name || 'your character'}`} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-3xl text-gold/40">{(name || '?')[0]}</span>
          )}
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap gap-2">
          <button className="btn min-h-10 sm:min-h-0" onClick={() => input.current?.click()}>
            <Camera size={14} /> {value ? 'Change portrait' : 'Add a portrait'}
          </button>
          {value && (
            <button className="btn-ghost min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 justify-center" onClick={() => onChange('')} aria-label="Remove portrait">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p className="text-xs text-dim">Any picture: it is shrunk to fit and kept in this browser until you send it to your sheet.</p>
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="Portrait picture"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            setErr('');
            onChange(await portraitFromFile(f, 320));
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      />
    </div>
  );
}
