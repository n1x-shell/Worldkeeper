import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Minus, Moon, Plus, Sun, Trash2, Wand2, X } from 'lucide-react';
import { proficiencyBonus } from '@shared/play';
import { CONDITIONS_2024 } from '@shared/domain';
import {
  ABILITIES,
  ALIGNMENTS,
  SIZES,
  SKILLS,
  initiative,
  longRest,
  mod,
  passive,
  saveBonus,
  score,
  shortRest,
  signed,
  skillBonus,
  type Ability,
  type Attack,
  type Sheet,
  type SheetChar,
} from '@shared/sheet';
import { ABILITY_NAMES, ARMOR, BACKGROUNDS, CLASSES, SRD_SPECIES, WEAPONS, armorClass, attackFor, backgroundInfo, classInfo, masteryCount, resourcesFor, weaponInfo } from '@shared/rules2024';
import { ChoiceSelect, Diamond, Field, Pips, Rule, Tabs, num, type Tab } from './parts';
import { SpellsTab } from './SpellsTab';
import { FeaturesTab } from './FeaturesTab';
import { LogTab, type LogEntry } from './LogTab';
import { portraitFromFile, useSheetOptions } from './options';

export type { SheetChar };

export interface FullSheetProps {
  value: SheetChar;
  onChange: (next: SheetChar) => void;
  /** The player can't change their level; the GM sets it. */
  levelLocked?: boolean;
  readOnly?: boolean;
  /** The portrait's address, and how to save a new one (a small data URL) or remove it (null). */
  portraitUrl?: string | null;
  onPortrait?: (dataUrl: string | null) => Promise<void>;
  /** More tabs: the world's own rules (Thinning and memories), and the GM's. */
  extraTabs?: Tab[];
  /** The change log, if there is one. */
  loadLog?: () => Promise<LogEntry[]>;
  /** Where to remember the open tab. */
  storeKey?: string;
  /** Shown under the name: save status and the like. */
  status?: ReactNode;
}

/** The attribution the SRD's licence asks for, wherever its rules text is shown. */
export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const SKILLS_BY: Record<Ability, string[]> = Object.fromEntries(ABILITIES.map((a) => [a, SKILLS.filter((k) => k.ability === a).map((k) => k.name)])) as Record<Ability, string[]>;
const toggle = (list: string[] | undefined, item: string) => (list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item]);

/**
 * A D&D 2024 character sheet, laid out like a ledger: the portrait and the numbers you need every turn down the side,
 * and everything else in tabs (abilities and skills, combat, spells, inventory, features, story). It holds everything
 * the official sheet does. Shared by the player's page on the table server and the GM's party screen: one record.
 */
export function FullSheet(props: FullSheetProps) {
  const { value, onChange, levelLocked = false, readOnly = false, extraTabs = [], loadLog, storeKey = 'wk.sheet.tab' } = props;
  const s = value.sheet;
  const lvl = value.level;
  const cls = value.class_name;
  const set = (p: Partial<SheetChar>) => onChange({ ...value, ...p });
  const put = (p: Partial<Sheet>) => onChange({ ...value, sheet: { ...s, ...p } });
  const options = useSheetOptions();
  const people = options?.peoples.find((p) => p.name === value.species || p.plural === value.species);
  const speciesRules = people?.rules ?? (SRD_SPECIES.includes(value.species) ? value.species : null);
  const [logTick, setLogTick] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setLogTick((n) => n + 1), 1500);
    return () => window.clearTimeout(t);
  }, [value]);

  const tabs: Tab[] = [
    { id: 'abilities', label: 'Abilities', content: <AbilitiesTab s={s} put={put} level={lvl} cls={cls} readOnly={readOnly} /> },
    { id: 'combat', label: 'Combat', content: <CombatTab s={s} put={put} level={lvl} cls={cls} readOnly={readOnly} /> },
    { id: 'spells', label: 'Spells', content: <SpellsTab s={s} put={put} level={lvl} cls={cls} readOnly={readOnly} /> },
    { id: 'inventory', label: 'Inventory', content: <InventoryTab s={s} put={put} cls={cls} readOnly={readOnly} /> },
    { id: 'features', label: 'Features', content: <FeaturesTab s={s} put={put} level={lvl} cls={cls} speciesRules={speciesRules} readOnly={readOnly} /> },
    { id: 'story', label: 'Story', content: <StoryTab s={s} put={put} readOnly={readOnly} /> },
    ...extraTabs,
    ...(loadLog ? [{ id: 'log', label: 'Log', content: <LogTab load={loadLog} refresh={logTick} /> }] : []),
  ];

  return (
    <div className="ledger grid gap-5 p-4 lg:grid-cols-[17rem_1fr] lg:p-5">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Portrait name={value.name} url={props.portraitUrl ?? null} onPortrait={readOnly ? undefined : props.onPortrait} />
        <div className="text-center space-y-1">
          <input
            className="input-bare text-center font-display text-2xl text-gold border-transparent hover:border-line"
            value={value.name}
            aria-label="Character name"
            disabled={readOnly}
            onChange={(e) => set({ name: e.target.value })}
          />
          <input
            className="input-bare text-center text-sm text-dim border-transparent hover:border-line"
            value={s.pronouns ?? ''}
            placeholder="Pronouns"
            aria-label="Pronouns"
            disabled={readOnly}
            onChange={(e) => put({ pronouns: e.target.value })}
          />
          {props.status}
        </div>
        <Identity value={value} set={set} put={put} levelLocked={levelLocked} readOnly={readOnly} options={options} speciesRules={speciesRules} />
        <Vitals s={s} put={put} level={lvl} cls={cls} readOnly={readOnly} />
      </aside>
      <main className="min-w-0">
        <Tabs tabs={tabs} storeKey={storeKey} />
        <p className="mt-6 text-[10px] text-dim/80">{SRD_ATTRIBUTION}</p>
      </main>
    </div>
  );
}

function Portrait({ name, url, onPortrait }: { name: string; url: string | null; onPortrait?: (dataUrl: string | null) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const pick = async (f: File | undefined) => {
    if (!f || !onPortrait) return;
    setBusy('Saving…');
    try {
      await onPortrait(await portraitFromFile(f));
      setBusy('');
    } catch (e) {
      setBusy((e as Error).message);
    }
  };
  return (
    <figure className="mx-auto w-44 lg:w-full max-w-[13rem] space-y-1">
      <div className="ledger-frame group">
        <div className="ledger-frame-inner relative flex items-center justify-center">
          {url ? (
            <img src={url} alt={`Portrait of ${name}`} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-6xl text-gold/40" aria-hidden>
              {(name || '?').slice(0, 1)}
            </span>
          )}
          {onPortrait && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent">
              <button className="btn text-xs" onClick={() => input.current?.click()}>
                <Camera size={13} /> {url ? 'Change' : 'Add portrait'}
              </button>
              {url && (
                <button className="btn text-xs" onClick={() => void onPortrait(null)} aria-label="Remove portrait">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Portrait picture" onChange={(e) => void pick(e.target.files?.[0])} tabIndex={-1} />
      {busy && <figcaption className="text-center text-xs text-dim">{busy}</figcaption>}
      {!url && onPortrait && !busy && (
        <button className="block mx-auto text-xs text-dim hover:text-gold lg:hidden" onClick={() => input.current?.click()}>
          Add a portrait
        </button>
      )}
    </figure>
  );
}

function Identity({
  value,
  set,
  put,
  levelLocked,
  readOnly,
  options,
  speciesRules,
}: {
  value: SheetChar;
  set: (p: Partial<SheetChar>) => void;
  put: (p: Partial<Sheet>) => void;
  levelLocked: boolean;
  readOnly: boolean;
  options: ReturnType<typeof useSheetOptions>;
  speciesRules: string | null;
}) {
  const s = value.sheet;
  const info = classInfo(value.class_name);
  const clsOpt = options?.classes.find((c) => c.name === info?.name);
  const sub = clsOpt?.subclasses.find((x) => x.name === s.subclass);
  const worldBgs = options?.backgrounds ?? [];
  const needsBasics = !!info && !readOnly && (!(s.saves ?? []).length || s.hitDie !== `d${info.hitDie}`);
  const applyBasics = () => {
    if (!info) return;
    const bgi = backgroundInfo(s.background);
    put({
      saves: info.saves,
      hitDie: `d${info.hitDie}`,
      armorTraining: info.armor,
      weaponProf: info.weapons,
      toolProf: [info.tools, bgi?.tool].filter(Boolean).join('; ') || s.toolProf,
      spellAbility: info.spellAbility ?? s.spellAbility,
      resources: resourcesFor(info.name, value.level, s),
    });
  };
  return (
    <div className="space-y-2">
      <Field label="Species">
        <ChoiceSelect
          label="Species"
          value={value.species}
          disabled={readOnly}
          onChange={(v) => set({ species: v })}
          groups={[
            { label: 'Peoples of the world', options: (options?.peoples ?? []).map((p) => ({ value: p.name })) },
            { label: 'SRD species', options: SRD_SPECIES.filter((x) => !options?.peoples.some((p) => p.name === x)).map((x) => ({ value: x })) },
          ]}
        />
      </Field>
      {value.species && speciesRules && speciesRules !== value.species && <p className="text-[11px] text-dim -mt-1">Uses the {speciesRules} rules.</p>}
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Class">
          <ChoiceSelect
            label="Class"
            value={value.class_name}
            disabled={readOnly}
            onChange={(v) => set({ class_name: v })}
            groups={[{ label: 'Classes', options: CLASSES.map((c) => ({ value: c.name })) }]}
          />
        </Field>
        <Field label="Level">
          <select
            className="input"
            value={value.level}
            disabled={readOnly || levelLocked}
            title={levelLocked ? 'Your GM sets your level' : undefined}
            aria-label={levelLocked ? 'Level (your GM sets this)' : 'Level'}
            onChange={(e) => set({ level: Number(e.target.value) })}
          >
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Subclass" hint={sub?.known ? `Known in the world as a ${sub.known}` : value.level < 3 && info ? 'Chosen at level 3' : undefined}>
        <ChoiceSelect
          label="Subclass"
          value={s.subclass ?? ''}
          disabled={readOnly}
          onChange={(v) => put({ subclass: v })}
          groups={clsOpt ? [{ label: `${clsOpt.name} subclasses`, options: clsOpt.subclasses.map((x) => ({ value: x.name, label: `${x.name} (${x.book})` })) }] : []}
        />
      </Field>
      <Field label="Background">
        <ChoiceSelect
          label="Background"
          value={s.background ?? ''}
          disabled={readOnly}
          onChange={(v) => put({ background: v })}
          groups={[
            ...['Aetheris', 'Kaelmar', 'Ethereal'].map((from) => ({
              label: from === 'Ethereal' ? 'The Ethereal Realm' : from,
              options: worldBgs.filter((b) => b.from === from).map((b) => ({ value: b.name })),
            })),
            { label: "Player's Handbook", options: BACKGROUNDS.map((b) => ({ value: b.name })) },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Alignment">
          <select className="input" value={s.alignment ?? ''} disabled={readOnly} onChange={(e) => put({ alignment: e.target.value })}>
            <option value="" />
            {ALIGNMENTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="XP">
          <input type="number" min={0} className="input" value={s.xp ?? ''} disabled={readOnly} onChange={(e) => put({ xp: num(e.target.value) })} />
        </Field>
      </div>
      {needsBasics && (
        <button className="btn w-full justify-center text-xs" onClick={applyBasics} title="Saving throws, Hit Die, armor and weapon training, tools, spellcasting ability and class resources">
          <Wand2 size={13} /> Fill in {info!.name} basics
        </button>
      )}
    </div>
  );
}

function Vitals({ s, put, level, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; level: number; cls: string; readOnly: boolean }) {
  const [amount, setAmount] = useState('');
  const max = s.maxHp ?? 0;
  const hp = s.hp ?? max;
  const temp = s.tempHp ?? 0;
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const ds = s.deathSaves ?? { successes: 0, failures: 0 };
  const hd = s.hitDie ?? (classInfo(cls) ? `d${classInfo(cls)!.hitDie}` : '');
  const n = Number(amount) || 0;
  const damage = () => {
    const fromTemp = Math.min(temp, n);
    put({ tempHp: temp - fromTemp, hp: Math.max(0, hp - (n - fromTemp)) });
    setAmount('');
  };
  const heal = () => {
    put({ hp: Math.min(max || hp + n, hp + n), ...(hp === 0 ? { deathSaves: { successes: 0, failures: 0 } } : {}) });
    setAmount('');
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="stat-box relative">
          <span className="stat-label">AC</span>
          <input
            type="number"
            className="stat-value w-full bg-transparent text-center focus:outline-none"
            value={s.ac ?? ''}
            placeholder="10"
            aria-label="Armor Class"
            disabled={readOnly}
            onChange={(e) => put({ ac: num(e.target.value) })}
          />
          <span className="flex items-center gap-1 text-[10px] text-dim">
            <Diamond on={!!s.shield} label="Shield" onChange={readOnly ? undefined : (on) => put({ shield: on, ac: (s.ac ?? 10) + (on ? 2 : -2) })} /> Shield
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Initiative</span>
          <span className="stat-value">{signed(initiative(s))}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Speed</span>
          <input
            className="stat-value w-full bg-transparent text-center text-lg focus:outline-none"
            value={s.speed ?? ''}
            placeholder="30 ft."
            aria-label="Speed"
            disabled={readOnly}
            onChange={(e) => put({ speed: e.target.value })}
          />
        </div>
        <div className="stat-box">
          <span className="stat-label">Proficiency</span>
          <span className="stat-value">+{proficiencyBonus(level)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Passive Perc.</span>
          <span className="stat-value">{passive(s, level, 'Perception')}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Size</span>
          <select className="w-full bg-transparent text-center text-sm focus:outline-none" value={s.size ?? ''} aria-label="Size" disabled={readOnly} onChange={(e) => put({ size: e.target.value })}>
            <option value="">—</option>
            {SIZES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ledger-card space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.16em] text-dim">Hit points</span>
          <span className="font-display text-lg">
            <input
              type="number"
              className="w-12 bg-transparent text-right focus:outline-none"
              value={s.hp ?? ''}
              placeholder={String(max)}
              aria-label="Current hit points"
              disabled={readOnly}
              onChange={(e) => put({ hp: num(e.target.value) })}
            />
            <span className="text-dim"> / </span>
            <input
              type="number"
              className="w-12 bg-transparent focus:outline-none"
              value={s.maxHp ?? ''}
              placeholder="max"
              aria-label="Hit point maximum"
              disabled={readOnly}
              onChange={(e) => put({ maxHp: num(e.target.value) })}
            />
          </span>
        </div>
        <div className="h-2 rounded-full bg-bg overflow-hidden" aria-hidden>
          <div className={`h-full ${pct > 50 ? 'bg-ok/80' : pct > 20 ? 'bg-gold/80' : 'bg-danger/80'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-dim text-xs">Temp</span>
          <input
            type="number"
            min={0}
            className="input-bare w-12 text-center"
            value={s.tempHp ?? ''}
            placeholder="0"
            aria-label="Temporary hit points"
            disabled={readOnly}
            onChange={(e) => put({ tempHp: num(e.target.value) })}
          />
          {!readOnly && (
            <>
              <input type="number" min={0} className="input-bare w-12 text-center ml-auto" value={amount} placeholder="±" aria-label="Amount" onChange={(e) => setAmount(e.target.value)} />
              <button className="btn-ghost px-1.5" onClick={damage} disabled={!n} aria-label="Take damage" title="Take damage (temporary hit points go first)">
                <Minus size={14} />
              </button>
              <button className="btn-ghost px-1.5" onClick={heal} disabled={!n} aria-label="Heal" title="Heal">
                <Plus size={14} />
              </button>
            </>
          )}
        </div>
        {hp === 0 && max > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs">
            <span className="text-danger">Death saves</span>
            <span className="flex items-center gap-1">
              ✓ <Pips max={3} used={ds.successes} label="Successes" onChange={readOnly ? undefined : (v) => put({ deathSaves: { ...ds, successes: v } })} />
            </span>
            <span className="flex items-center gap-1">
              ✗ <Pips max={3} used={ds.failures} label="Failures" onChange={readOnly ? undefined : (v) => put({ deathSaves: { ...ds, failures: v } })} />
            </span>
          </div>
        )}
      </div>

      <div className="ledger-card grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Hit Dice ({hd || '?'})</div>
          <Pips max={level} used={Math.min(level, s.hitDiceSpent ?? 0)} label="Hit Die" onChange={readOnly ? undefined : (v) => put({ hitDiceSpent: v })} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Heroic Inspiration</div>
          <Diamond on={!!s.inspiration} label="Heroic Inspiration" onChange={readOnly ? undefined : (on) => put({ inspiration: on })} double />
        </div>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn justify-center" onClick={() => put(shortRest(s, classInfo(cls)?.caster === 'pact'))} title="Short-rest uses come back. Spend Hit Dice above.">
            <Sun size={14} /> Short rest
          </button>
          <button
            className="btn justify-center"
            onClick={() => {
              if (confirm('Take a long rest? All hit points, Hit Dice and spell slots come back, and Exhaustion goes down by one.')) put(longRest(s));
            }}
          >
            <Moon size={14} /> Long rest
          </button>
        </div>
      )}
      {s.lastRest && <p className="text-[11px] text-dim text-center">Last: {s.lastRest}</p>}
    </div>
  );
}

function AbilitiesTab({ s, put, level, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; level: number; cls: string; readOnly: boolean }) {
  const info = classInfo(cls);
  const masteries = s.masteries ?? [];
  const canMaster = masteryCount(cls, level);
  const [addMastery, setAddMastery] = useState('');
  const cycle = (skill: string) => {
    const prof = s.skills?.includes(skill);
    const exp = s.expertise?.includes(skill);
    if (!prof) put({ skills: [...(s.skills ?? []), skill] });
    else if (!exp) put({ expertise: [...(s.expertise ?? []), skill] });
    else put({ skills: (s.skills ?? []).filter((x) => x !== skill), expertise: (s.expertise ?? []).filter((x) => x !== skill) });
  };
  return (
    <div className="space-y-6">
      <p className="text-xs text-dim">A filled diamond means proficient; a ringed one, Expertise (your Proficiency Bonus counts twice). Click a skill's diamond to step through them.</p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        {ABILITIES.map((a) => (
          <section key={a} className="medallion" aria-label={ABILITY_NAMES[a]}>
            <h3 className="font-display text-[12px] uppercase tracking-[0.2em] text-gold">{ABILITY_NAMES[a]}</h3>
            <div className="font-display text-3xl leading-none mt-1" aria-label={`${ABILITY_NAMES[a]} modifier`}>
              {signed(mod(s, a))}
            </div>
            <input
              type="number"
              min={1}
              max={30}
              className="mt-1 w-14 rounded-full border border-gold/40 bg-bg/70 text-center text-sm focus:outline-none focus:border-gold"
              value={s.abilities?.[a] ?? ''}
              placeholder={String(score(s, a))}
              aria-label={`${ABILITY_NAMES[a]} score`}
              disabled={readOnly}
              onChange={(e) => put({ abilities: { ...(s.abilities ?? {}), [a]: Number(e.target.value) || 10 } })}
            />
            <ul className="mt-2 w-full space-y-0.5 border-t border-gold/20 pt-1.5 text-sm">
              <li className="flex items-center gap-1.5 font-medium">
                <Diamond on={!!s.saves?.includes(a)} label={`${ABILITY_NAMES[a]} saving throw proficiency`} onChange={readOnly ? undefined : () => put({ saves: toggle(s.saves, a) })} />
                <span className="flex-1">Saving throw</span>
                <span className="tabular-nums">{signed(saveBonus(s, level, a))}</span>
              </li>
              {SKILLS_BY[a].map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Diamond
                    on={!!s.skills?.includes(k)}
                    double={!!s.expertise?.includes(k)}
                    label={`${k}: ${s.expertise?.includes(k) ? 'Expertise' : s.skills?.includes(k) ? 'proficient' : 'not proficient'}`}
                    onChange={readOnly ? undefined : () => cycle(k)}
                  />
                  <span className="flex-1 text-[13px]">
                    {k}
                    {s.expertise?.includes(k) && <span className="text-[10px] text-gold ml-1">EXP</span>}
                  </span>
                  <span className="tabular-nums text-[13px]">{signed(skillBonus(s, level, k))}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {['Perception', 'Insight', 'Investigation'].map((k) => (
          <div key={k} className="stat-box">
            <span className="stat-label">Passive {k}</span>
            <span className="stat-value">{passive(s, level, k)}</span>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <Rule>Equipment training and proficiencies</Rule>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-[10px] uppercase tracking-[0.16em] text-dim">Armor training</span>
          {(['light', 'medium', 'heavy', 'shields'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <Diamond on={!!s.armorTraining?.[k]} label={`${k} armor training`} onChange={readOnly ? undefined : (on) => put({ armorTraining: { ...(s.armorTraining ?? {}), [k]: on } })} />
              {k[0].toUpperCase() + k.slice(1)}
            </span>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Weapons">
            <textarea className="input min-h-16" value={s.weaponProf ?? ''} disabled={readOnly} onChange={(e) => put({ weaponProf: e.target.value })} placeholder={info?.weapons} />
          </Field>
          <Field label="Tools">
            <textarea className="input min-h-16" value={s.toolProf ?? ''} disabled={readOnly} onChange={(e) => put({ toolProf: e.target.value })} />
          </Field>
          <Field label="Languages">
            <textarea className="input min-h-16" value={s.languages ?? ''} disabled={readOnly} onChange={(e) => put({ languages: e.target.value })} placeholder="Common, and…" />
          </Field>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Weapon mastery {canMaster ? `(${masteries.length} of ${canMaster})` : ''}</div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {masteries.map((m) => (
              <span key={m} className="chip border-gold/50 text-gold">
                {m}
                {weaponInfo(m) ? `: ${weaponInfo(m)!.mastery}` : ''}
                {!readOnly && (
                  <button aria-label={`Remove ${m}`} className="hover:text-danger" onClick={() => put({ masteries: masteries.filter((x) => x !== m) })}>
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {!readOnly && (
              <select
                className="input w-auto text-xs py-0.5"
                value={addMastery}
                aria-label="Add a weapon mastery"
                onChange={(e) => {
                  if (e.target.value) put({ masteries: [...masteries, e.target.value] });
                  setAddMastery('');
                }}
              >
                <option value="">Add a weapon…</option>
                {WEAPONS.filter((w) => !masteries.includes(w.name)).map((w) => (
                  <option key={w.name} value={w.name}>
                    {w.name} ({w.mastery})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CombatTab({ s, put, level, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; level: number; cls: string; readOnly: boolean }) {
  const attacks = s.attacks ?? [];
  const resources = s.resources ?? [];
  const [weapon, setWeapon] = useState('');
  const setAttack = (i: number, p: Partial<Attack>) => put({ attacks: attacks.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const fresh = resourcesFor(cls, level, s);
  const resourcesStale = fresh.length > 0 && JSON.stringify(fresh.map((r) => [r.name, r.max])) !== JSON.stringify(resources.map((r) => [r.name, r.max]));
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Rule
          actions={
            !readOnly && (
              <span className="flex gap-1">
                <select
                  className="input w-auto text-xs py-1"
                  value={weapon}
                  aria-label="Add a weapon"
                  onChange={(e) => {
                    const w = weaponInfo(e.target.value);
                    if (w) put({ attacks: [...attacks, attackFor(w, s, cls, level)] });
                    setWeapon('');
                  }}
                >
                  <option value="">Add a weapon…</option>
                  {(['Simple', 'Martial'] as const).map((c) => (
                    <optgroup key={c} label={`${c} weapons`}>
                      {WEAPONS.filter((w) => w.category === c).map((w) => (
                        <option key={w.name}>{w.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn-ghost text-xs" onClick={() => put({ attacks: [...attacks, { name: '', bonus: '', damage: '', notes: '' }] })}>
                  <Plus size={13} /> By hand
                </button>
              </span>
            )
          }
        >
          Weapons and damaging cantrips
        </Rule>
        {attacks.length === 0 ? (
          <p className="text-sm text-dim">Add your weapons: the bonus and damage are worked out from your scores and training.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-dim text-left">
                  <th className="py-1 pr-2 font-normal">Name</th>
                  <th className="py-1 pr-2 font-normal w-20">Atk / DC</th>
                  <th className="py-1 pr-2 font-normal">Damage and type</th>
                  <th className="py-1 pr-2 font-normal">Notes</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {attacks.map((a, i) => (
                  <tr key={i} className="border-t border-line/50">
                    {(['name', 'bonus', 'damage', 'notes'] as const).map((k) => (
                      <td key={k} className="py-1 pr-2">
                        <input
                          className={`input-bare ${k === 'name' ? 'font-serif text-[15px]' : ''}`}
                          value={a[k]}
                          aria-label={k}
                          disabled={readOnly}
                          onChange={(e) => setAttack(i, { [k]: e.target.value })}
                        />
                      </td>
                    ))}
                    <td>
                      {!readOnly && (
                        <button aria-label={`Remove ${a.name || 'attack'}`} className="text-dim hover:text-danger" onClick={() => put({ attacks: attacks.filter((_, j) => j !== i) })}>
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Rule
          actions={
            !readOnly &&
            resourcesStale && (
              <button className="btn-ghost text-xs" onClick={() => put({ resources: fresh.map((f) => ({ ...f, used: Math.min(f.max, resources.find((r) => r.name === f.name)?.used ?? 0) })) })}>
                <Wand2 size={13} /> Set for {classInfo(cls)?.name} {level}
              </button>
            )
          }
        >
          Class resources
        </Rule>
        {resources.length === 0 && <p className="text-sm text-dim">Uses that come back on a rest: Rage, Channel Divinity, Focus Points and the like.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {resources.map((r, i) => (
            <li key={i} className="ledger-card flex items-center gap-2 py-2">
              <span className="flex-1">
                <span className="block font-display text-[13px] tracking-wide">{r.name}</span>
                <span className="text-[11px] text-dim">
                  {r.reset === 'long' ? 'Back on a long rest' : r.reset === 'short' ? 'Back on a short rest' : 'One back on a short rest, all on a long rest'}
                </span>
              </span>
              <Pips max={r.max} used={r.used} label={r.name} onChange={readOnly ? undefined : (used) => put({ resources: resources.map((x, j) => (j === i ? { ...x, used } : x)) })} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <Rule>Conditions</Rule>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS_2024.filter((c) => c !== 'Exhaustion').map((c) => {
            const on = !!s.conditions?.includes(c);
            return (
              <button
                key={c}
                className={`chip ${on ? 'border-danger text-danger bg-danger/10' : 'border-line text-dim'}`}
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => put({ conditions: toggle(s.conditions, c) })}
              >
                {c}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Exhaustion" hint={s.exhaustion ? `−${2 * s.exhaustion} to D20 Tests, Speed −${5 * s.exhaustion} ft.` : undefined}>
            <Pips max={6} used={s.exhaustion ?? 0} label="Exhaustion level" onChange={readOnly ? undefined : (v) => put({ exhaustion: v })} />
          </Field>
          <Field label="Concentrating on">
            <input className="input" value={s.concentration ?? ''} disabled={readOnly} onChange={(e) => put({ concentration: e.target.value || null })} placeholder="Nothing" />
          </Field>
        </div>
      </section>
    </div>
  );
}

function InventoryTab({ s, put, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; cls: string; readOnly: boolean }) {
  const coins = s.coins ?? {};
  const att = [0, 1, 2].map((i) => s.attunement?.[i] ?? '');
  const wear = (p: Partial<Sheet>) => {
    const next = { ...s, ...p };
    put({ ...p, ac: armorClass(next, cls).value });
  };
  const calc = armorClass(s, cls);
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Rule>Armor</Rule>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <Field label="Worn">
            <select className="input" value={s.armorWorn ?? ''} disabled={readOnly} onChange={(e) => wear({ armorWorn: e.target.value })}>
              <option value="">No armor</option>
              {(['Light', 'Medium', 'Heavy'] as const).map((c) => (
                <optgroup key={c} label={`${c} armor`}>
                  {ARMOR.filter((a) => a.category === c).map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} (AC {a.base}
                      {a.dexMax === null ? ' + Dex' : a.dexMax ? ' + Dex, max 2' : ''}){a.strength ? `, Str ${a.strength}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <span className="flex items-center gap-1.5 pb-2 text-sm">
            <Diamond on={!!s.shield} label="Shield" onChange={readOnly ? undefined : (on) => wear({ shield: on })} /> Shield (+2)
          </span>
        </div>
        <p className="text-sm text-dim">
          AC {calc.value}: {calc.how}.{' '}
          {s.ac !== calc.value && !readOnly && (
            <button className="text-gold underline" onClick={() => put({ ac: calc.value })}>
              Use {calc.value} (the sheet says {s.ac ?? '—'})
            </button>
          )}
        </p>
      </section>

      <section className="space-y-2">
        <Rule>Equipment</Rule>
        <textarea
          className="input min-h-40 font-serif text-[15px]"
          value={s.equipment ?? ''}
          disabled={readOnly}
          onChange={(e) => put({ equipment: e.target.value })}
          placeholder="One thing per line"
          aria-label="Equipment"
        />
      </section>

      <section className="space-y-2">
        <Rule>Magic item attunement</Rule>
        <ul className="space-y-1.5">
          {att.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <Diamond on={!!a} label={`Attunement slot ${i + 1}`} />
              <input
                className="input-bare"
                value={a}
                placeholder="Attuned item"
                aria-label={`Attuned item ${i + 1}`}
                disabled={readOnly}
                onChange={(e) => put({ attunement: att.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <Rule>Coins</Rule>
        <div className="grid grid-cols-5 gap-2">
          {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((c) => (
            <div key={c} className="stat-box">
              <span className="stat-label">{c.toUpperCase()}</span>
              <input
                type="number"
                min={0}
                className="w-full bg-transparent text-center font-display text-lg focus:outline-none"
                value={coins[c] ?? ''}
                placeholder="0"
                aria-label={c.toUpperCase()}
                disabled={readOnly}
                onChange={(e) => put({ coins: { ...coins, [c]: num(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StoryTab({ s, put, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; readOnly: boolean }) {
  return (
    <div className="space-y-5">
      {(
        [
          ['appearance', 'Appearance', 'How they look, what people notice first', 'min-h-24'],
          ['personality', 'Personality', 'Ideals, bonds, flaws, habits', 'min-h-24'],
          ['backstory', 'Backstory', 'Where they come from, and why they set out', 'min-h-48'],
        ] as const
      ).map(([k, label, ph, h]) => (
        <section key={k} className="space-y-2">
          <Rule>{label}</Rule>
          <textarea
            className={`input font-serif text-[16px] leading-relaxed ${h}`}
            value={s[k] ?? ''}
            placeholder={ph}
            disabled={readOnly}
            onChange={(e) => put({ [k]: e.target.value })}
            aria-label={label}
          />
        </section>
      ))}
    </div>
  );
}
