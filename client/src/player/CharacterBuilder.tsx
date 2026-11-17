import { ItemRulesList } from '../components/ItemRules';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, Check, Copy, Dices, Minus, Plus, Printer, RotateCcw, Send, Trash2, Wand2 } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { generateNames } from '../../../shared/names';
import { ABILITIES, ALIGNMENTS, SKILLS, mod, signed, type Ability } from '../../../shared/sheet';
import { proficiencyBonus } from '../../../shared/play';
import {
  ABILITY_NAMES,
  BACKGROUNDS,
  CLASSES,
  ORIGIN_FEATS,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  RARE_LANGUAGES,
  STANDARD_LANGUAGES,
  WEAPONS,
  classInfo,
  masteryCount,
  spellCounts,
  spellSlotsFor,
} from '../../../shared/rules2024';
import { backgroundsFrom, classesFrom, isBackgroundTable, loadRulesText, loadSpells, peoplesFrom, portraitFromFile, subclassChoices, useLoaded, type SrdSpell, type SrdText } from './sheet/options';
import { PrintSheet } from './sheet/PrintSheet';
import { SRD_ATTRIBUTION } from './sheet/FullSheet';
import {
  EMPTY_BUILD,
  abilityList,
  backgroundFor,
  buildSheet,
  expertiseCount,
  finalScores,
  improvementSlots,
  kitFor,
  methodPool,
  pointsSpent,
  rollScore,
  type Build,
  type Improvement,
} from './builder/compute';

/**
 * The character builder: a complete D&D 2024 character at any level, one step at a time, with the sheet building
 * itself alongside. Peoples, classes, subclasses and backgrounds come from the handbook; the rules (class tables,
 * spells, features, species traits, feats) from the SRD 5.2.1. It works in the published handbook too, and on the
 * table server it can send the finished build to the player's sheet. Choices are kept in this browser only.
 */
const STEPS = ['People', 'Class', 'Background', 'Abilities', 'Skills', 'Equipment', 'Spells', 'Details', 'Ties', 'Sheet'] as const;
const KEY = 'wk.player.builder';

function useSaved(): [Build, (c: Build) => void] {
  const [c, setC] = useState<Build>(() => {
    try {
      const old = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Build> & { cls?: string };
      return { ...EMPTY_BUILD, ...old, base: { ...EMPTY_BUILD.base, ...(old.base ?? {}) } };
    } catch {
      return EMPTY_BUILD;
    }
  });
  const save = (next: Build) => {
    setC(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* kept for this visit only */
    }
  };
  return [c, save];
}

const Card = ({ on, title, sub, onClick, badge }: { on: boolean; title: string; sub?: ReactNode; onClick: () => void; badge?: string }) => (
  <button className={`ledger-card text-left w-full transition-colors hover:border-gold/60 ${on ? 'border-gold bg-gold/10' : ''}`} onClick={onClick} aria-pressed={on}>
    <div className="flex items-start gap-2">
      <div className="font-display text-gold tracking-wide flex-1">{title}</div>
      {badge && <span className="chip border-line text-dim">{badge}</span>}
      {on && <Check size={15} className="text-gold" />}
    </div>
    {sub && <div className="text-xs text-dim mt-1 line-clamp-3">{sub}</div>}
  </button>
);
const H = ({ children, note }: { children: ReactNode; note?: ReactNode }) => (
  <div className="space-y-1">
    <h2 className="ledger-rule text-[13px]">{children}</h2>
    {note && <p className="text-sm text-dim">{note}</p>}
  </div>
);

export function CharacterBuilder() {
  const { entities } = usePlayerIndex();
  const { source, base } = usePlayer();
  const [b, save] = useSaved();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const set = (patch: Partial<Build>) => save({ ...b, ...patch });
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [step]);

  const tables = useMemo(() => (entities ?? []).filter(isBackgroundTable), [entities]);
  const { data: full } = usePlayerData(() => Promise.all(tables.map((e) => source.entity(e.id))), tables.map((e) => e.id).join(','));
  const fullTables = useMemo(() => (full ?? []).filter((x): x is PEntity => !!x), [full]);
  const peoples = useMemo(() => peoplesFrom(entities ?? []), [entities]);
  const classes = useMemo(() => classesFrom(entities ?? []), [entities]);
  const world = useMemo(() => backgroundsFrom(fullTables), [fullTables]);
  const factions = useMemo(() => (entities ?? []).filter((e) => e.type === 'faction' || e.type === 'cult').sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const starts = useMemo(() => {
    const t = fullTables.map((e) => e.summary).find((s) => s.includes('| Start in |')) ?? '';
    return t
      .slice(t.indexOf('| Start in |'))
      .split('\n')
      .slice(2)
      .filter((l) => l.startsWith('|'))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((x) =>
            x
              .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
              .replace(/\*+/g, '')
              .trim(),
          ),
      )
      .map(([where, what]) => ({ where, what }));
  }, [fullTables]);
  const text = useLoaded(loadRulesText);
  const spells = useLoaded(loadSpells);
  const people = peoples.find((p) => p.name === b.people);
  const cls = classes.find((x) => x.name === b.cls);
  const info = classInfo(b.cls);
  const bg = backgroundFor(b, world, text);
  const sheet = useMemo(() => buildSheet(b, { world, speciesRules: people?.rules ?? null, text, spells }), [b, world, people, text, spells]);

  const suggestName = () => {
    const seeds =
      /Common names[.:]*\**\s*([^\n]+)/i
        .exec(people?.summary ?? '')?.[1]
        ?.replace(/\.$/, '')
        .split(',')
        .map((s) => s.replace(/\*+/g, '').trim()) ?? [];
    const used = new Set(
      (entities ?? []).flatMap((e) =>
        e.name
          .split(/[\s"“”'’,()]+/)
          .filter((w) => w.length >= 3)
          .map((w) => w.toLowerCase()),
      ),
    );
    const [n] = generateNames({ seeds, people: people?.plural ?? '', used, count: 1, seed: Date.now() });
    if (n) set({ name: n });
  };

  // On the table server: fill in the player's character sheet from this build (with the code from My Character).
  const sendToSheet = async () => {
    let code = '';
    try {
      code = localStorage.getItem('wk.player.me') ?? '';
    } catch {
      /* private window */
    }
    if (!code) code = (prompt('Your character code, from your GM:') ?? '').trim().toUpperCase();
    if (!code || !source.myPage || !source.saveMyPage) return;
    const page = await source.myPage(code);
    if (!page) return alert(`No character has the code ${code}. Check it with your GM.`);
    if (
      !confirm(
        `Replace ${page.name}'s sheet with this build? Everything on the sheet is replaced (your GM's notes and your character page are kept). The level stays ${page.level}, as your GM set it.`,
      )
    )
      return;
    const built = b.level === page.level ? sheet : buildSheet({ ...b, level: page.level }, { world, speciesRules: people?.rules ?? null, text, spells });
    const { portrait, ...rest } = built.sheet;
    await source.saveMyPage(code, { character: { name: built.name, species: built.species, class_name: built.class_name, sheet: rest } });
    if (portrait && source.myPortrait) await source.myPortrait(code, portrait);
    navigate(`${base}/me/${code}`);
  };

  if (!entities) return null;
  const canSpell = !!info?.caster;
  const stepDone = [!!b.people, !!b.cls, !!b.background, true, true, true, true, !!b.name, true, true];

  return (
    <div className="space-y-5 print:space-y-0">
      <div className="print:hidden flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl text-gold">Make a Character</h1>
          <p className="text-sm text-dim mt-1">A complete D&D 2024 character, one step at a time. The sheet fills itself in as you go. Your choices stay in this browser.</p>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-dim">Starting level</span>
          <select className="input w-auto" value={b.level} onChange={(e) => set({ level: Number(e.target.value) })} aria-label="Starting level">
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1 print:hidden" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              className={`chip whitespace-nowrap ${i === step ? 'border-gold text-gold bg-gold/10' : stepDone[i] && i < step ? 'border-gold/40 text-ink' : 'border-line text-dim'}`}
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
            >
              {stepDone[i] && i !== step && i < step ? <Check size={11} /> : `${i + 1}.`} {s}
            </button>
          </li>
        ))}
      </ol>

      <div className={step === 9 ? '' : 'grid gap-5 lg:grid-cols-[1fr_17rem]'}>
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <section className="space-y-3">
              <H note="Each people of the world plays with one set of species rules; the card says which.">Choose a people</H>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {peoples.map((p) => (
                  <Card key={p.id} on={b.people === p.name} title={p.name} sub={p.tagline} badge={p.rules ?? undefined} onClick={() => set({ people: p.name })} />
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <H>Choose a class</H>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {classes.map((x) => {
                  const ci = classInfo(x.name)!;
                  return (
                    <Card
                      key={x.name}
                      on={b.cls === x.name}
                      title={x.name}
                      badge={`d${ci.hitDie}`}
                      sub={
                        <>
                          {x.tagline && <span className="block">{x.tagline}</span>}
                          <span className="block">
                            {ci.primary}. Saves: {ci.saves.map((a) => ABILITY_NAMES[a]).join(', ')}.{ci.caster ? ` Casts with ${ABILITY_NAMES[ci.spellAbility!]}.` : ''}
                          </span>
                        </>
                      }
                      onClick={() => set({ cls: x.name, subclass: '', classSkills: [], expertise: [], spells: [], classKit: 0 })}
                    />
                  );
                })}
              </div>
              {cls && (
                <div className="space-y-2">
                  <H note={b.level < 3 ? `You choose a subclass at level 3. You can pick one now to plan ahead.` : undefined}>{cls.name} subclass</H>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {subclassChoices(cls, text, cls.name).map((s) => (
                      <Card
                        key={s.name}
                        on={b.subclass === s.name}
                        title={s.name}
                        sub={`${s.book}${s.known ? `. Known in the world as a ${s.known}` : ''}`}
                        onClick={() => set({ subclass: s.name })}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-dim">
                    The SRD has the rules text for one subclass per class ({info?.srdSubclass ?? 'none for this class'}). For the others, add their features from your book. Subclasses from
                    Xanathar&apos;s and Tasha&apos;s were written for the 2014 rules: check with your GM.
                  </p>
                </div>
              )}
              {info?.outsideSrd && <p className="text-sm text-gold">The {info.name} isn&apos;t in the SRD: the builder fills in its basics, and you add its features and spells from your book.</p>}
            </section>
          )}

          {step === 2 && <BackgroundStep b={b} set={set} world={world} />}
          {step === 3 && <AbilitiesStep b={b} set={set} feats={text ? [...new Set([...ORIGIN_FEATS, ...Object.keys(text.feats)])].sort() : ORIGIN_FEATS} />}
          {step === 4 && <SkillsStep b={b} set={set} bgSkills={bg?.skills ?? []} />}
          {step === 5 && <EquipmentStep b={b} set={set} world={world} rules={text} />}
          {step === 6 &&
            (canSpell ? (
              <SpellsStep b={b} set={set} srd={spells} />
            ) : (
              <p className="text-sm text-dim">{info ? `${info.name}s don't cast spells (unless a subclass or feat says so).` : 'Choose a class first.'} Go on to the next step.</p>
            ))}
          {step === 7 && (
            <section className="space-y-4 max-w-2xl">
              <H>Who they are</H>
              <PortraitPicker value={b.portrait} onChange={(portrait) => set({ portrait })} name={b.name} />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_10rem] items-end">
                <label className="block">
                  <span className="text-xs text-dim">Name</span>
                  <input className="input w-full" value={b.name} onChange={(e) => set({ name: e.target.value })} />
                </label>
                <button className="btn" onClick={suggestName} disabled={!people} title={people ? `A ${people.name} name nobody in the world has` : 'Choose a people first'}>
                  <Wand2 size={14} /> Suggest
                </button>
                <label className="block">
                  <span className="text-xs text-dim">Pronouns</span>
                  <input className="input w-full" value={b.pronouns} onChange={(e) => set({ pronouns: e.target.value })} placeholder="they/them" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-dim">Alignment</span>
                <select className="input" value={b.alignment} onChange={(e) => set({ alignment: e.target.value })}>
                  <option value="" />
                  {ALIGNMENTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-dim">Appearance</span>
                <textarea className="input min-h-20" value={b.appearance} onChange={(e) => set({ appearance: e.target.value })} placeholder="How they look, what people notice first" />
              </label>
              <label className="block">
                <span className="text-xs text-dim">Personality</span>
                <textarea className="input min-h-20" value={b.personality} onChange={(e) => set({ personality: e.target.value })} placeholder="Ideals, bonds, flaws, habits" />
              </label>
            </section>
          )}
          {step === 8 && <TiesStep b={b} set={set} starts={starts} factions={factions} />}
          {step === 9 && (
            <section className="space-y-3">
              <div className="flex flex-wrap gap-2 print:hidden">
                <button className="btn-primary" onClick={() => window.print()}>
                  <Printer size={14} /> Print the sheet
                </button>
                {source.saveMyPage && (
                  <button className="btn" onClick={() => void sendToSheet()}>
                    <Send size={14} /> Send to my sheet
                  </button>
                )}
                <button className="btn" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(sheet, null, 2))} title="The whole sheet as text, to keep or share">
                  <Copy size={14} /> Copy as text
                </button>
                <button className="btn-ghost ml-auto" onClick={() => (confirm('Start again? This build is cleared.') ? (save(EMPTY_BUILD), setStep(0)) : undefined)}>
                  <RotateCcw size={14} /> Start again
                </button>
              </div>
              <Checklist b={b} sheet={sheet} />
              <div className="overflow-x-auto print:overflow-visible">
                <PrintSheet value={sheet} portraitUrl={b.portrait || null} />
              </div>
              <p className="text-sm text-dim print:hidden">
                Read more:{' '}
                {[people ? { id: people.id, name: people.plural } : null, cls?.id ? { id: cls.id, name: cls.name } : null]
                  .filter((x): x is { id: string; name: string } => !!x)
                  .map((e, i) => (
                    <span key={e.id}>
                      {i > 0 && ', '}
                      <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="text-arcane">
                        {e.name}
                      </Link>
                    </span>
                  ))}
              </p>
            </section>
          )}

          <div className="flex justify-between print:hidden pt-2">
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
              <ArrowLeft size={14} /> Back
            </button>
            {step < STEPS.length - 1 && (
              <button className="btn-primary" onClick={() => setStep(step + 1)}>
                {STEPS[step + 1]} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
        {step !== 9 && <Preview b={b} sheet={sheet} />}
      </div>
      <p className="text-[10px] text-dim/80 print:hidden">{SRD_ATTRIBUTION}</p>
    </div>
  );
}

/** The sheet so far, beside every step. */
function Preview({ b, sheet }: { b: Build; sheet: ReturnType<typeof buildSheet> }) {
  const s = sheet.sheet;
  const pb = proficiencyBonus(b.level);
  return (
    <aside className="ledger p-3 space-y-3 lg:sticky lg:top-4 lg:self-start print:hidden" aria-label="Your character so far">
      <div className="flex items-center gap-3">
        <div className="h-16 w-14 shrink-0 overflow-hidden rounded-t-full rounded-b border border-gold/50 bg-bg flex items-center justify-center">
          {b.portrait ? <img src={b.portrait} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-2xl text-gold/40">{(b.name || '?')[0]}</span>}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg text-gold truncate">{b.name || 'Unnamed'}</div>
          <div className="text-xs text-dim">{[b.people, b.cls && `${b.cls} ${b.level}`, b.level >= 3 && b.subclass].filter(Boolean).join(' · ') || 'Nothing chosen yet'}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {ABILITIES.map((a) => (
          <div key={a} className="stat-box py-1">
            <span className="stat-label">{a}</span>
            <span className="font-display text-lg leading-none">{signed(mod(s, a))}</span>
            <span className="text-[10px] text-dim">{s.abilities?.[a]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {(
          [
            ['HP', s.maxHp],
            ['AC', s.ac],
            ['Init', signed(s.initiativeBonus ?? mod(s, 'DEX'))],
            ['Prof', `+${pb}`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="stat-box py-1">
            <span className="stat-label">{k}</span>
            <span className="font-display text-base">{v}</span>
          </div>
        ))}
      </div>
      <dl className="text-xs space-y-1">
        {(
          [
            ['Skills', [...(s.skills ?? [])].sort().join(', ')],
            ['Saves', (s.saves ?? []).join(', ')],
            ['Speed', s.speed],
            ['Feats', (s.featList ?? []).map((f) => f.name).join(', ')],
            ['Spells', s.spells?.length ? `${s.spells.length} chosen` : ''],
          ] as const
        )
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="inline text-dim">{k}: </dt>
              <dd className="inline">{v}</dd>
            </div>
          ))}
      </dl>
    </aside>
  );
}

function BackgroundStep({ b, set, world }: { b: Build; set: (p: Partial<Build>) => void; world: ReturnType<typeof backgroundsFrom> }) {
  const choose = (name: string) => {
    const phb = BACKGROUNDS.find((x) => x.name === name);
    set({ background: name, bgAbilities: phb ? phb.abilities : [], plusTwo: '', plusOne: '', bgKit: 0 });
  };
  const bg = backgroundFor(b, world);
  return (
    <section className="space-y-4">
      <H note="Your background gives two skills, a tool, an Origin feat, and raises three ability scores.">Choose a background</H>
      {['Aetheris', 'Kaelmar', 'Ethereal'].map((from) => {
        const list = world.filter((x) => x.from === from);
        if (!list.length) return null;
        return (
          <div key={from} className="space-y-2">
            <h3 className="text-xs text-dim uppercase tracking-[0.18em]">{from === 'Ethereal' ? 'The Ethereal Realm' : from}</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((x) => (
                <Card key={x.name} on={b.background === x.name} title={x.name} sub={`${x.who} ${x.skills}; ${x.tool}; ${x.feat}.`} onClick={() => choose(x.name)} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="space-y-2">
        <h3 className="text-xs text-dim uppercase tracking-[0.18em]">From the Player&apos;s Handbook</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {BACKGROUNDS.map((x) => (
            <Card key={x.name} on={b.background === x.name} title={x.name} sub={`${x.skills.join(', ')}; ${x.tool}; ${x.feat}. Raises ${x.abilities.join(', ')}.`} onClick={() => choose(x.name)} />
          ))}
        </div>
      </div>
      {bg && !bg.fixed && (
        <div className="ledger-card space-y-2">
          <div className="text-sm">
            The world&apos;s backgrounds don&apos;t name the abilities they raise: choose three that fit <b>{bg.name}</b>.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ABILITIES.map((a) => {
              const on = b.bgAbilities.includes(a);
              return (
                <button
                  key={a}
                  className={`chip ${on ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`}
                  aria-pressed={on}
                  onClick={() => set({ bgAbilities: on ? b.bgAbilities.filter((x) => x !== a) : [...b.bgAbilities, a].slice(-3), plusTwo: '', plusOne: '' })}
                >
                  {ABILITY_NAMES[a]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AbilitiesStep({ b, set, feats }: { b: Build; set: (p: Partial<Build>) => void; feats: string[] }) {
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
    else if (m === 'roll') set({ method: m, rolls: Array.from({ length: 6 }, rollScore), base: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 } as Record<Ability, number> });
    else if (m === 'standard') set({ method: m, base: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 } as Record<Ability, number> });
    else set({ method: m, base: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } });
  };
  const imps = improvementSlots(b);
  const setImp = (imp: Improvement) => set({ improvements: [...b.improvements.filter((i) => i.level !== imp.level), imp] });
  const bgAb = b.bgAbilities;
  return (
    <section className="space-y-5">
      <H note="Choose how to set your scores, then where your background's increases go.">Ability scores</H>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How to set scores">
        {(
          [
            ['standard', 'Standard array (15, 14, 13, 12, 10, 8)'],
            ['pointbuy', 'Point buy (27 points)'],
            ['roll', 'Roll 4d6, drop the lowest'],
            ['manual', 'Enter them'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} role="radio" aria-checked={b.method === m} className={`chip ${b.method === m ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`} onClick={() => choose(m)}>
            {label}
          </button>
        ))}
      </div>
      {b.method === 'roll' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-dim">Your rolls:</span> {b.rolls.join(', ')}
          <button className="btn-ghost text-xs" onClick={() => choose('roll')}>
            <Dices size={13} /> Roll again
          </button>
        </div>
      )}
      {b.method === 'pointbuy' && (
        <p className={`text-sm ${spent > POINT_BUY_BUDGET ? 'text-danger' : 'text-dim'}`}>
          {POINT_BUY_BUDGET - spent} of {POINT_BUY_BUDGET} points left. Scores go from 8 to 15 before increases.
        </p>
      )}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {ABILITIES.map((a) => (
          <div key={a} className="medallion">
            <div className="font-display text-[11px] uppercase tracking-[0.16em] text-gold">{ABILITY_NAMES[a]}</div>
            {b.method === 'standard' || b.method === 'roll' ? (
              <select className="input mt-1 text-center" value={b.base[a] || ''} onChange={(e) => setBase(a, Number(e.target.value))} aria-label={`${ABILITY_NAMES[a]} score`}>
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
              <div className="flex items-center gap-1 mt-1">
                <button className="btn-ghost px-1" disabled={b.base[a] <= 8} onClick={() => setBase(a, b.base[a] - 1)} aria-label={`Lower ${ABILITY_NAMES[a]}`}>
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center font-display text-lg">{b.base[a]}</span>
                <button
                  className="btn-ghost px-1"
                  disabled={b.base[a] >= 15 || spent - POINT_BUY_COST[b.base[a]] + POINT_BUY_COST[b.base[a] + 1] > POINT_BUY_BUDGET}
                  onClick={() => setBase(a, b.base[a] + 1)}
                  aria-label={`Raise ${ABILITY_NAMES[a]}`}
                >
                  <Plus size={13} />
                </button>
              </div>
            ) : (
              <input
                type="number"
                min={3}
                max={20}
                className="input mt-1 text-center"
                value={b.base[a]}
                onChange={(e) => setBase(a, Number(e.target.value) || 10)}
                aria-label={`${ABILITY_NAMES[a]} score`}
              />
            )}
            <div className="mt-1 text-xs text-dim">
              Final <b className="text-ink">{final[a] || '—'}</b> ({final[a] ? signed(Math.floor((final[a] - 10) / 2)) : '—'})
            </div>
          </div>
        ))}
      </div>

      <div className="ledger-card space-y-2">
        <div className="text-sm font-medium">Background increases</div>
        {bgAb.length < 3 ? (
          <p className="text-sm text-dim">Choose a background first{b.background ? ', and the three abilities it raises' : ''}.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['2-1', '+2 to one, +1 to another'],
                  ['1-1-1', '+1 to all three'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  className={`chip ${b.bonusMode === m ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`}
                  aria-pressed={b.bonusMode === m}
                  onClick={() => set({ bonusMode: m })}
                >
                  {label}
                </button>
              ))}
            </div>
            {b.bonusMode === '2-1' && (
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  +2 to
                  <select className="input w-auto" value={b.plusTwo} onChange={(e) => set({ plusTwo: e.target.value as Ability })}>
                    <option value="">—</option>
                    {bgAb.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_NAMES[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  +1 to
                  <select className="input w-auto" value={b.plusOne} onChange={(e) => set({ plusOne: e.target.value as Ability })}>
                    <option value="">—</option>
                    {bgAb
                      .filter((a) => a !== b.plusTwo)
                      .map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
            <p className="text-xs text-dim">No score can go above 20 this way.</p>
          </>
        )}
      </div>

      {imps.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Ability Score Improvements and feats, to level {b.level}</div>
          {imps.map((imp) => (
            <div key={imp.level} className="ledger-card flex flex-wrap items-center gap-2 text-sm">
              <span className="w-16 text-dim">Level {imp.level}</span>
              {imp.level !== 19 && (
                <select className="input w-auto" value={imp.kind} onChange={(e) => setImp({ ...imp, kind: e.target.value as Improvement['kind'] })}>
                  <option value="asi">Ability Score Improvement</option>
                  <option value="feat">Another feat</option>
                </select>
              )}
              {imp.kind === 'asi' ? (
                <>
                  {[0, 1].map((slot) => (
                    <select
                      key={slot}
                      className="input w-auto"
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
                <select className="input w-auto" value={imp.feat} onChange={(e) => setImp({ ...imp, feat: e.target.value })} aria-label={`Level ${imp.level} feat`}>
                  <option value="">{imp.level === 19 ? 'Epic Boon…' : 'Feat…'}</option>
                  {feats.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <p className="text-xs text-dim">The SRD has a few feats; type any other feat on your sheet afterwards.</p>
        </div>
      )}
    </section>
  );
}

function SkillsStep({ b, set, bgSkills }: { b: Build; set: (p: Partial<Build>) => void; bgSkills: string[] }) {
  const info = classInfo(b.cls);
  const from = info ? (info.skillFrom === 'any' ? SKILLS.map((s) => s.name) : info.skillFrom) : [];
  const n = info?.skillCount ?? 0;
  const exp = expertiseCount(b.cls, b.level);
  const all = [...new Set([...bgSkills, ...b.classSkills])];
  const mastery = masteryCount(b.cls, b.level);
  const toggle = (list: string[], x: string, max: number) => (list.includes(x) ? list.filter((y) => y !== x) : list.length < max ? [...list, x] : list);
  return (
    <section className="space-y-5">
      <H note={info ? `Your background gives ${bgSkills.join(' and ') || 'two skills'}. Choose ${n} more from the ${info.name} list.` : 'Choose a class first.'}>Skills</H>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map((k) => {
          const fromBg = bgSkills.includes(k.name);
          const allowed = from.includes(k.name);
          const on = fromBg || b.classSkills.includes(k.name);
          return (
            <button
              key={k.name}
              disabled={fromBg || !allowed || (!on && b.classSkills.length >= n)}
              onClick={() => set({ classSkills: toggle(b.classSkills, k.name, n), expertise: b.expertise.filter((e) => e !== k.name || fromBg) })}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm text-left ${on ? 'border-gold/70 bg-gold/10' : 'border-line'} disabled:opacity-50`}
              aria-pressed={on}
            >
              <span className="diamond" aria-hidden aria-checked={on} />
              <span className="flex-1">{k.name}</span>
              <span className="text-[10px] text-dim">{fromBg ? 'background' : ABILITY_NAMES[k.ability].slice(0, 3)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-dim">
        {b.classSkills.length} of {n} chosen.
      </p>
      {exp > 0 && (
        <div className="space-y-2">
          <H note={`Choose ${exp} of your skills: your Proficiency Bonus counts twice for them.`}>Expertise</H>
          <div className="flex flex-wrap gap-1.5">
            {all.map((k) => {
              const on = b.expertise.includes(k);
              return (
                <button
                  key={k}
                  className={`chip ${on ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`}
                  aria-pressed={on}
                  onClick={() => set({ expertise: toggle(b.expertise, k, exp) })}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <H note="Everyone speaks Common. Choose two more languages (rare ones only with your GM's say-so).">Languages</H>
        <div className="flex flex-wrap gap-1.5">
          {[...STANDARD_LANGUAGES.filter((l) => l !== 'Common'), ...RARE_LANGUAGES].map((l) => {
            const on = b.languages.includes(l);
            return (
              <button
                key={l}
                className={`chip ${on ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'} ${RARE_LANGUAGES.includes(l) ? 'italic' : ''}`}
                aria-pressed={on}
                onClick={() => set({ languages: toggle(b.languages, l, 2) })}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      {mastery > 0 && (
        <div className="space-y-2">
          <H note={`Choose ${mastery} weapons whose mastery property you can use.`}>Weapon mastery</H>
          <div className="flex flex-wrap gap-1.5">
            {WEAPONS.filter((w) => w.category === 'Simple' || info?.martial !== 'none').map((w) => {
              const on = b.masteries.includes(w.name);
              return (
                <button
                  key={w.name}
                  className={`chip ${on ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`}
                  aria-pressed={on}
                  onClick={() => set({ masteries: toggle(b.masteries, w.name, mastery) })}
                >
                  {w.name} <span className="opacity-70">({w.mastery})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function EquipmentStep({ b, set, world, rules }: { b: Build; set: (p: Partial<Build>) => void; world: ReturnType<typeof backgroundsFrom>; rules: SrdText | null }) {
  const info = classInfo(b.cls);
  const bg = backgroundFor(b, world, rules);
  const kit = kitFor(b, world, rules);
  return (
    <section className="space-y-5">
      <H note="Take each kit, or its gold to buy your own.">Starting equipment</H>
      {info && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{info.name}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {info.equipment.map((k, i) => (
              <Card
                key={i}
                on={b.classKit === i}
                title={`${String.fromCharCode(65 + i)}: ${k.items.length ? k.items.join(', ') : 'Gold only'}`}
                sub={`and ${k.gp} GP`}
                onClick={() => set({ classKit: i })}
              />
            ))}
          </div>
        </div>
      )}
      {bg && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{bg.name}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Card
              on={b.bgKit === 0}
              title={bg.kit ? `A: ${bg.kit.items.join(', ')}` : 'A: The kit in your book'}
              sub={bg.kit ? `and ${bg.kit.gp} GP` : 'Add its items to your sheet yourself'}
              onClick={() => set({ bgKit: 0 })}
            />
            <Card on={b.bgKit === 1} title="B: Gold only" sub="50 GP" onClick={() => set({ bgKit: 1 })} />
          </div>
        </div>
      )}
      <div className="ledger-card text-sm space-y-1">
        <div className="font-medium">You carry</div>
        <p>{kit.items.length ? kit.items.join(', ') : 'Nothing yet'}</p>
        <p className="text-gold">{kit.gp} GP</p>
        {kit.bgKitUnknown && <p className="text-xs text-dim">Plus your background&apos;s kit from your book (or take B for 50 GP).</p>}
      </div>
      <ItemRulesList names={kit.items} title="What your kit does" />
    </section>
  );
}

function SpellsStep({ b, set, srd }: { b: Build; set: (p: Partial<Build>) => void; srd: SrdSpell[] | null }) {
  const info = classInfo(b.cls)!;
  const counts = spellCounts(b.cls, b.level);
  const slots = spellSlotsFor(b.cls, b.level);
  const maxLevel = Math.max(0, ...Object.keys(slots).map(Number));
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState<string | null>(null);
  const mine = (srd ?? []).filter((x) => x.classes.includes(info.name) && x.level <= maxLevel);
  const chosen = (lvl0: boolean) => b.spells.filter((n) => (srd?.find((x) => x.name === n)?.level === 0) === lvl0).length;
  const toggle = (x: SrdSpell) => set({ spells: b.spells.includes(x.name) ? b.spells.filter((n) => n !== x.name) : [...b.spells, x.name] });
  return (
    <section className="space-y-4">
      <H
        note={
          info.outsideSrd
            ? `The ${info.name} isn't in the SRD: add your spells on your sheet from your book.`
            : `A level ${b.level} ${info.name} knows ${counts.cantrips} cantrips and prepares ${counts.prepared} spells, of level ${maxLevel} or lower.`
        }
      >
        Spells
      </H>
      {!info.outsideSrd && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className={chosen(true) > counts.cantrips ? 'text-danger' : ''}>
              Cantrips: {chosen(true)} of {counts.cantrips}
            </span>
            <span className={chosen(false) > counts.prepared ? 'text-danger' : ''}>
              Prepared: {chosen(false)} of {counts.prepared}
            </span>
            <span className="text-dim">
              Slots:{' '}
              {Object.entries(slots)
                .map(([l, n]) => `${n} × level ${l}`)
                .join(', ')}
            </span>
          </div>
          <input className="input max-w-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" />
          {!srd && <p className="text-sm text-dim">Loading spells…</p>}
          {Array.from({ length: maxLevel + 1 }, (_, l) => l).map((l) => {
            const list = mine.filter((x) => x.level === l && (!q || x.name.toLowerCase().includes(q.toLowerCase())));
            if (!list.length) return null;
            return (
              <div key={l} className="space-y-1">
                <div className="text-xs uppercase tracking-[0.16em] text-gold/80">{l === 0 ? 'Cantrips' : `Level ${l}`}</div>
                <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((x) => {
                    const on = b.spells.includes(x.name);
                    return (
                      <li key={x.name} className={`rounded border ${on ? 'border-gold/70 bg-gold/10' : 'border-line'}`}>
                        <div className="flex items-center gap-1.5 px-2 py-1">
                          <button className="diamond" role="checkbox" aria-checked={on} aria-label={`Choose ${x.name}`} onClick={() => toggle(x)} />
                          <button className="flex-1 text-left text-sm" onClick={() => setPeek(peek === x.name ? null : x.name)}>
                            {x.name}{' '}
                            <span className="text-[10px] text-dim">
                              {x.school}
                              {x.concentration ? ' · C' : ''}
                              {x.ritual ? ' · R' : ''}
                            </span>
                          </button>
                        </div>
                        {peek === x.name && (
                          <div className="border-t border-line/60 px-2 py-1.5 text-xs space-y-1">
                            <div className="text-dim">
                              {x.time} · {x.range} · {x.components} · {x.duration}
                            </div>
                            {x.text.split('\n\n').map((p, i) => (
                              <p key={i} className="font-serif text-[13px]">
                                {p}
                              </p>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function TiesStep({ b, set, starts, factions }: { b: Build; set: (p: Partial<Build>) => void; starts: { where: string; what: string }[]; factions: PEntity[] }) {
  return (
    <section className="space-y-4 max-w-3xl">
      <H note="The whole group starts together. Agree on this one with the others.">Where you start</H>
      <div className="grid gap-2 md:grid-cols-3">
        {starts.map((s) => (
          <Card key={s.where} on={b.start === s.where} title={s.where} sub={s.what} onClick={() => set({ start: s.where })} />
        ))}
      </div>
      <H>Ties to the world</H>
      <label className="block">
        <span className="text-xs text-dim">Hometown</span>
        <input className="input w-full" value={b.hometown} onChange={(e) => set({ hometown: e.target.value })} placeholder="Anywhere in the handbook, or somewhere that no longer exists" />
      </label>
      <label className="block">
        <span className="text-xs text-dim">A faction you have ties to</span>
        <select className="input w-full" value={b.faction} onChange={(e) => set({ faction: e.target.value })}>
          <option value="">None</option>
          {factions.map((f) => (
            <option key={f.id} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ['family', 'Family', 'Who they are, and whether they still talk to you'],
          ['rival', 'A rival', 'Someone who wants what you want'],
          ['debt', 'A debt', 'Who you owe, and what'],
        ] as const
      ).map(([k, label, ph]) => (
        <label key={k} className="block">
          <span className="text-xs text-dim">{label}</span>
          <input className="input w-full" value={b[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
        </label>
      ))}
      <label className="block">
        <span className="text-xs text-dim">Backstory, and anything else your GM should know</span>
        <textarea className="input w-full min-h-28" value={b.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </section>
  );
}

function PortraitPicker({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  return (
    <div className="flex items-center gap-3">
      <div className="ledger-frame w-24 shrink-0">
        <div className="ledger-frame-inner flex items-center justify-center">
          {value ? (
            <img src={value} alt={`Portrait of ${name || 'your character'}`} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-3xl text-gold/40">{(name || '?')[0]}</span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex gap-2">
          <button className="btn" onClick={() => input.current?.click()}>
            <Camera size={14} /> {value ? 'Change portrait' : 'Add a portrait'}
          </button>
          {value && (
            <button className="btn-ghost" onClick={() => onChange('')} aria-label="Remove portrait">
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

/** What's still to choose before the sheet is complete. */
function Checklist({ b, sheet }: { b: Build; sheet: ReturnType<typeof buildSheet> }) {
  const info = classInfo(b.cls);
  const counts = spellCounts(b.cls, b.level);
  const items = [
    [!!b.people, 'a people'],
    [!!info, 'a class'],
    [b.level < 3 || !!b.subclass, 'a subclass'],
    [!!b.background, 'a background'],
    [ABILITIES.every((a) => b.base[a] > 0), 'all six ability scores'],
    [b.bonusMode === '1-1-1' ? b.bgAbilities.length === 3 : !!b.plusTwo && !!b.plusOne, "your background's increases"],
    [!info || b.classSkills.length >= info.skillCount, `${info?.skillCount ?? 0} class skills`],
    [b.expertise.length >= expertiseCount(b.cls, b.level), 'Expertise'],
    [b.languages.length >= 2, 'two languages'],
    [b.masteries.length >= masteryCount(b.cls, b.level), 'weapon masteries'],
    [!info?.caster || info.outsideSrd || (sheet.sheet.spells?.length ?? 0) >= counts.cantrips + counts.prepared, 'spells'],
    [!!b.name, 'a name'],
  ] as const;
  const todo = items.filter(([ok]) => !ok).map(([, what]) => what);
  return todo.length ? (
    <p className="text-sm text-gold print:hidden">Still to choose: {todo.join(', ')}.</p>
  ) : (
    <p className="text-sm text-ok print:hidden">
      <Check size={14} className="inline" /> Complete. Print it, or send it to your sheet.
    </p>
  );
}
