import { ItemRulesList, equipmentNames } from '../../components/ItemRules';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronDown, Moon, Plus, Sun, Trash2, Wand2, X } from 'lucide-react';
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
import { ABILITY_NAMES, ARMOR, BACKGROUNDS, CLASSES, WEAPONS, armorClass, attackFor, backgroundInfo, classInfo, masteryCount, resourcesFor, weaponInfo } from '@shared/rules2024';
import { ChoiceSelect, Diamond, Field, LABEL, NO_SPIN, Pips, Rule, STAT_INPUT, Stat, Tabs, num, type Tab } from './parts';
import { SpellsTab } from './SpellsTab';
import { FeaturesTab } from './FeaturesTab';
import { LogTab, type LogEntry } from './LogTab';
import { loadRulesText, portraitFromFile, subclassChoices, useLoaded, useSheetOptions } from './options';
import { ask } from '../../components/ui/overlays';
import { Badge } from '../../components/ui/badges';
import { ConditionChips, HpBar, HpStepper } from '../../components/ui/data';

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
/** A row in an ability card: the whole row toggles its diamond, and on a phone it's finger-height. */
const ROW = 'relative flex items-center gap-1.5 rounded-sm px-1 py-0.5 max-sm:min-h-10';
const toggle = (list: string[] | undefined, item: string) => (list?.includes(item) ? list.filter((x) => x !== item) : [...(list ?? []), item]);

/**
 * A D&D 2024 character sheet, laid out like a ledger: a header band with the portrait and the numbers you need every
 * turn, the rests and who they are down the side, and everything else in tabs (abilities and skills, combat, spells, inventory, features, story). It holds everything
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
  const speciesRules = people?.rules ?? (value.species || null);
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
    <div className="ledger">
      <Band value={value} set={set} put={put} readOnly={readOnly} status={props.status} portraitUrl={props.portraitUrl ?? null} onPortrait={readOnly ? undefined : props.onPortrait} />
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* On a phone the tabs come straight after the band; this side column follows them. */}
        <aside className="order-2 space-y-4 lg:order-0 lg:sticky lg:top-4 lg:self-start" aria-label="Rests, Hit Dice and identity">
          <Vitals s={s} put={put} level={lvl} cls={cls} readOnly={readOnly} />
          <Identity value={value} set={set} put={put} levelLocked={levelLocked} readOnly={readOnly} options={options} speciesRules={speciesRules} />
        </aside>
        <main className="min-w-0">
          <Tabs tabs={tabs} storeKey={storeKey} />
          <p className="mt-8 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">{SRD_ATTRIBUTION}</p>
        </main>
      </div>
    </div>
  );
}

/**
 * The sheet's header band: the portrait, the name and who they are, and what's asked for every turn (hit points,
 * Armor Class, Initiative, Speed), so it's all in view before any tab.
 */
function Band({
  value,
  set,
  put,
  readOnly,
  status,
  portraitUrl,
  onPortrait,
}: {
  value: SheetChar;
  set: (p: Partial<SheetChar>) => void;
  put: (p: Partial<Sheet>) => void;
  readOnly: boolean;
  status?: ReactNode;
  portraitUrl: string | null;
  onPortrait?: (dataUrl: string | null) => Promise<void>;
}) {
  const s = value.sheet;
  const who = [value.species, value.class_name && `${value.class_name} ${value.level}`, s.subclass, s.background].filter(Boolean);
  const conditions = s.conditions ?? [];
  return (
    <header className="relative rounded-t-lg border-b border-gold/25 bg-linear-to-b from-gold/10 to-transparent px-4 pb-4 pt-5 sm:px-5">
      <div aria-hidden className="gilt-corners pointer-events-none absolute inset-0 rounded-t-lg" />
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,37rem)]">
        <Portrait name={value.name} url={portraitUrl} onPortrait={onPortrait} />
        <div className="min-w-0 space-y-1">
          <input
            className="block w-full truncate border-b border-transparent bg-transparent font-display text-2xl leading-tight tracking-wide text-gold hover:border-line focus:border-gold focus:outline-hidden disabled:opacity-100 sm:text-[28px]"
            value={value.name}
            placeholder="Name"
            aria-label="Character name"
            disabled={readOnly}
            onChange={(e) => set({ name: e.target.value })}
          />
          <p className="num text-sm text-ink/85">{who.length ? who.join(' · ') : <span className="text-dim">Choose a species and class below.</span>}</p>
          <input
            className="block w-full max-w-[16rem] border-b border-transparent bg-transparent text-sm text-dim placeholder:text-dim/70 hover:border-line focus:border-gold focus:outline-hidden disabled:opacity-100"
            value={s.pronouns ?? ''}
            placeholder={readOnly ? '' : 'Pronouns'}
            aria-label="Pronouns"
            disabled={readOnly}
            onChange={(e) => put({ pronouns: e.target.value })}
          />
          {(s.inspiration || s.concentration || conditions.length > 0 || (s.exhaustion ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {s.inspiration && <Badge tone="gold">Heroic Inspiration</Badge>}
              {s.concentration && <Badge tone="arcane">Concentrating: {s.concentration}</Badge>}
              {(s.exhaustion ?? 0) > 0 && <Badge tone="warn">Exhaustion {s.exhaustion}</Badge>}
              {conditions.length > 0 && <ConditionChips value={conditions} options={CONDITIONS_2024} readOnly />}
            </div>
          )}
          {status}
        </div>
        <Glance s={s} put={put} readOnly={readOnly} />
      </div>
    </header>
  );
}

/** Hit points with damage and healing, then Armor Class, Initiative and Speed. */
function Glance({ s, put, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; readOnly: boolean }) {
  const max = s.maxHp ?? 0;
  const hp = s.hp ?? max;
  const temp = s.tempHp ?? 0;
  const ds = s.deathSaves ?? { successes: 0, failures: 0 };
  const damage = (n: number) => {
    const fromTemp = Math.min(temp, n);
    put({ tempHp: temp - fromTemp, hp: Math.max(0, hp - (n - fromTemp)) });
  };
  const heal = (n: number) => put({ hp: Math.min(max || hp + n, hp + n), ...(hp === 0 ? { deathSaves: { successes: 0, failures: 0 } } : {}) });
  return (
    <div className="col-span-2 grid grid-cols-3 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] xl:col-span-1">
      <section className="col-span-3 space-y-2 rounded-md border border-line bg-raised/60 p-2.5 sm:col-span-1" aria-label="Hit points">
        <div className="flex items-baseline gap-2">
          <span className={LABEL}>Hit points</span>
          {temp > 0 && <span className="num text-xs font-medium text-arcane">+{temp} temp</span>}
          <span className="num ml-auto flex items-baseline text-2xl font-semibold leading-none text-ink">
            <input
              type="number"
              className={`w-[3.2ch] bg-transparent text-right focus:outline-hidden disabled:opacity-100 ${NO_SPIN}`}
              value={s.hp ?? ''}
              placeholder={String(max)}
              aria-label="Current hit points"
              disabled={readOnly}
              onChange={(e) => put({ hp: num(e.target.value) })}
            />
            <span className="px-1 text-base font-normal text-dim">/</span>
            <input
              type="number"
              className={`w-[3.2ch] bg-transparent text-base font-normal text-dim focus:text-ink focus:outline-hidden disabled:opacity-100 ${NO_SPIN}`}
              value={s.maxHp ?? ''}
              placeholder="max"
              aria-label="Hit point maximum"
              disabled={readOnly}
              onChange={(e) => put({ maxHp: num(e.target.value) })}
            />
          </span>
        </div>
        <HpBar hp={hp} max={max} />
        {!readOnly && (
          <div className="[&>div]:flex [&>div]:w-full [&_.btn]:min-w-0 [&_.btn]:flex-1 [&_.btn]:justify-center [&_.btn]:gap-1 [&_.btn]:px-1.5 [&_.input]:w-16 [&_.input]:shrink-0 [&_svg]:shrink-0 max-sm:[&_.btn]:min-h-10 max-sm:[&_.input]:min-h-10">
            <HpStepper size="md" onDamage={damage} onHeal={heal} onTemp={(n) => put({ tempHp: n })} />
          </div>
        )}
        {hp === 0 && max > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
            <span className="font-medium text-danger">Death saves</span>
            <span className="flex items-center gap-1">
              <span className="text-dim">Saved</span>
              <Pips max={3} used={ds.successes} label="Successes" onChange={readOnly ? undefined : (v) => put({ deathSaves: { ...ds, successes: v } })} />
            </span>
            <span className="flex items-center gap-1">
              <span className="text-dim">Failed</span>
              <Pips max={3} used={ds.failures} label="Failures" onChange={readOnly ? undefined : (v) => put({ deathSaves: { ...ds, failures: v } })} />
            </span>
          </div>
        )}
      </section>
      <Stat
        label="AC"
        title="Armor Class"
        foot={
          <span className="relative mt-0.5 flex items-center gap-1 rounded-sm px-1 text-[11px] text-dim max-sm:min-h-8">
            <Diamond cover on={!!s.shield} label="Shield" onChange={readOnly ? undefined : (on) => put({ shield: on, ac: (s.ac ?? 10) + (on ? 2 : -2) })} /> Shield
          </span>
        }
      >
        <input
          type="number"
          className={`${STAT_INPUT} ${NO_SPIN}`}
          value={s.ac ?? ''}
          placeholder="10"
          aria-label="Armor Class"
          disabled={readOnly}
          onChange={(e) => put({ ac: num(e.target.value) })}
        />
      </Stat>
      <Stat label="Initiative">{signed(initiative(s))}</Stat>
      <Stat label="Speed">
        <input className={`${STAT_INPUT} text-lg!`} value={s.speed ?? ''} placeholder="30 ft." aria-label="Speed" disabled={readOnly} onChange={(e) => put({ speed: e.target.value })} />
      </Stat>
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
  const badge = "absolute flex h-7 w-7 items-center justify-center rounded-full border border-gold/60 bg-panel text-gold shadow-xs hover:bg-raised after:absolute after:-inset-1.5 after:content-['']";
  return (
    <figure className="relative w-20 sm:w-24 xl:w-28">
      <div className="ledger-frame p-1!">
        <div className="ledger-frame-inner relative flex items-center justify-center">
          {url ? (
            <img src={url} alt={`Portrait of ${name}`} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-4xl text-gold/50 sm:text-5xl" aria-hidden>
              {(name || '?').slice(0, 1)}
            </span>
          )}
        </div>
      </div>
      {onPortrait && (
        <>
          <button
            type="button"
            className={`${badge} -bottom-1 -right-1`}
            onClick={() => input.current?.click()}
            aria-label={url ? 'Change portrait' : 'Add portrait'}
            title={url ? 'Change portrait' : 'Add portrait'}
          >
            <Camera size={14} />
          </button>
          {url && (
            <button type="button" className={`${badge} -bottom-1 -left-1`} onClick={() => void onPortrait(null)} aria-label="Remove portrait" title="Remove portrait">
              <Trash2 size={13} />
            </button>
          )}
        </>
      )}
      <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Portrait picture" onChange={(e) => void pick(e.target.files?.[0])} tabIndex={-1} />
      {busy && <figcaption className="absolute inset-x-0 top-full mt-2 text-center text-[11px] text-dim">{busy}</figcaption>}
    </figure>
  );
}

/** Open on a wide screen, folded away on a phone (the band above already says who this is). */
function useWide() {
  const [wide] = useState(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches;
    } catch {
      return true;
    }
  });
  return wide;
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
  const rules = useLoaded(loadRulesText);
  const clsOpt = options?.classes.find((c) => c.name === info?.name);
  const subs = info ? subclassChoices(clsOpt, rules, info.name) : [];
  const sub = subs.find((x) => x.name === s.subclass);
  const worldBgs = options?.backgrounds ?? [];
  const [open, setOpen] = useState(useWide());
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
    <details className="group rounded-md border border-line bg-raised/30" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="section-title text-[12px]">Identity</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-dim transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line px-3 pb-3 pt-3">
        <Field label="Species">
          <ChoiceSelect
            label="Species"
            value={value.species}
            disabled={readOnly}
            onChange={(v) => set({ species: v })}
            groups={[
              { label: 'Peoples of the world', options: (options?.peoples ?? []).map((p) => ({ value: p.name })) },
              {
                label: 'Other species in your rules',
                options: Object.keys(rules?.species ?? {})
                  .filter((x) => !options?.peoples.some((p) => p.name.toLowerCase() === x.toLowerCase()))
                  .sort()
                  .map((x) => ({ value: x })),
              },
            ]}
          />
        </Field>
        {value.species && speciesRules && speciesRules !== value.species && <p className="-mt-1.5 text-xs text-dim">Uses the {speciesRules} rules.</p>}
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field label="Class">
            <ChoiceSelect
              label="Class"
              value={value.class_name}
              disabled={readOnly}
              onChange={(v) => set({ class_name: v })}
              groups={[
                { label: 'Classes', options: CLASSES.map((c) => ({ value: c.name })) },
                {
                  label: 'Other classes in your rules',
                  options: Object.keys(rules?.classes ?? {})
                    .filter((x) => !CLASSES.some((c) => c.name.toLowerCase() === x.toLowerCase()))
                    .sort()
                    .map((x) => ({ value: x })),
                },
              ]}
            />
          </Field>
          <Field label="Level">
            <select
              className="input max-sm:min-h-10"
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
            groups={info ? [{ label: `${info.name} subclasses`, options: subs.map((x) => ({ value: x.name, label: `${x.name} (${x.book})` })) }] : []}
          />
        </Field>
        <Field label="Background">
          <ChoiceSelect
            label="Background"
            value={s.background ?? ''}
            disabled={readOnly}
            onChange={(v) => put({ background: v })}
            groups={[
              ...[...new Set(worldBgs.map((b) => b.from))].map((from) => ({
                label: from === 'Ethereal' ? 'The Ethereal Realm' : from,
                options: worldBgs.filter((b) => b.from === from).map((b) => ({ value: b.name })),
              })),
              { label: "Player's Handbook", options: BACKGROUNDS.map((b) => ({ value: b.name })) },
              {
                label: 'Other backgrounds in your rules',
                options: Object.keys(rules?.backgrounds ?? {})
                  .filter((n) => !BACKGROUNDS.some((x) => x.name.toLowerCase() === n.toLowerCase()) && !worldBgs.some((x) => x.name.toLowerCase() === n.toLowerCase()))
                  .sort()
                  .map((x) => ({ value: x })),
              },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Alignment">
            <select className="input max-sm:min-h-10" value={s.alignment ?? ''} disabled={readOnly} onChange={(e) => put({ alignment: e.target.value })}>
              <option value="" />
              {ALIGNMENTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="XP">
            <input type="number" min={0} className="input num max-sm:min-h-10" value={s.xp ?? ''} disabled={readOnly} onChange={(e) => put({ xp: num(e.target.value) })} />
          </Field>
        </div>
        {needsBasics && (
          <button
            className="btn w-full justify-center text-xs max-sm:min-h-10"
            onClick={applyBasics}
            title="Saving throws, Hit Die, armor and weapon training, tools, spellcasting ability and class resources"
          >
            <Wand2 size={13} /> Fill in {info.name} basics
          </button>
        )}
      </div>
    </details>
  );
}

/** The figures asked for now and then, Hit Dice and Heroic Inspiration, and the rests. */
function Vitals({ s, put, level, cls, readOnly }: { s: Sheet; put: (p: Partial<Sheet>) => void; level: number; cls: string; readOnly: boolean }) {
  const hd = s.hitDie ?? (classInfo(cls) ? `d${classInfo(cls)!.hitDie}` : '');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Proficiency">+{proficiencyBonus(level)}</Stat>
        <Stat label="Passive Perception">{passive(s, level, 'Perception')}</Stat>
        <Stat label="Size">
          <select
            className="w-full appearance-none bg-transparent text-center text-base font-semibold text-ink focus:outline-hidden disabled:opacity-100 max-sm:min-h-8"
            value={s.size ?? ''}
            aria-label="Size"
            disabled={readOnly}
            onChange={(e) => put({ size: e.target.value })}
          >
            <option value="">—</option>
            {SIZES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Stat>
      </div>

      <div className="divide-y divide-line rounded-md border border-line bg-raised/40 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
          <span className={LABEL}>
            Hit Dice <span className="num normal-case tracking-normal">({hd || '?'})</span>
          </span>
          <Pips max={level} used={Math.min(level, s.hitDiceSpent ?? 0)} label="Hit Die" onChange={readOnly ? undefined : (v) => put({ hitDiceSpent: v })} />
        </div>
        <div className="relative flex items-center justify-between gap-3 px-3 py-2 max-sm:min-h-10">
          <span className={LABEL}>Heroic Inspiration</span>
          <Diamond cover on={!!s.inspiration} label="Heroic Inspiration" onChange={readOnly ? undefined : (on) => put({ inspiration: on })} double />
        </div>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn justify-center max-sm:min-h-10" onClick={() => put(shortRest(s, classInfo(cls)?.caster === 'pact'))} title="Short-rest uses come back. Spend Hit Dice above.">
            <Sun size={14} /> Short rest
          </button>
          <button
            className="btn justify-center max-sm:min-h-10"
            onClick={async () => {
              if (await ask({ title: 'Take a long rest?', body: 'All hit points, Hit Dice and spell slots come back, and Exhaustion goes down by one.', confirmLabel: 'Long rest' })) put(longRest(s));
            }}
          >
            <Moon size={14} /> Long rest
          </button>
        </div>
      )}
      {s.lastRest && <p className="text-center text-xs text-dim">Last rest: {s.lastRest}</p>}
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
      <p className="text-xs text-dim">A filled diamond means proficient; a ringed one, Expertise (your Proficiency Bonus counts twice). Tap a skill to step through them.</p>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {ABILITIES.map((a) => (
          <section key={a} className="medallion" aria-label={ABILITY_NAMES[a]}>
            <h3 className="font-display text-[12px] uppercase tracking-[0.2em] text-gold">{ABILITY_NAMES[a]}</h3>
            <div className="num mt-1 text-3xl font-semibold leading-none text-ink" aria-label={`${ABILITY_NAMES[a]} modifier`}>
              {signed(mod(s, a))}
            </div>
            <input
              type="number"
              min={1}
              max={30}
              className={`num mt-1.5 h-7 w-14 rounded-full border border-gold/40 bg-raised text-center text-sm text-ink focus:border-gold focus:outline-hidden disabled:opacity-100 max-sm:h-9 ${NO_SPIN}`}
              value={s.abilities?.[a] ?? ''}
              placeholder={String(score(s, a))}
              aria-label={`${ABILITY_NAMES[a]} score`}
              disabled={readOnly}
              onChange={(e) => put({ abilities: { ...s.abilities, [a]: Number(e.target.value) || 10 } })}
            />
            <ul className="mt-2 w-full border-t border-gold/20 pt-1 text-sm">
              <li className={`${ROW} font-medium`}>
                <Diamond cover on={!!s.saves?.includes(a)} label={`${ABILITY_NAMES[a]} saving throw proficiency`} onChange={readOnly ? undefined : () => put({ saves: toggle(s.saves, a) })} />
                <span className="min-w-0 flex-1 truncate" title="Saving throw">
                  <span className="xl:hidden">Save</span>
                  <span className="max-xl:hidden">Saving throw</span>
                </span>
                <span className="num">{signed(saveBonus(s, level, a))}</span>
              </li>
              {SKILLS_BY[a].map((k) => (
                <li key={k} className={ROW}>
                  <Diamond
                    cover
                    on={!!s.skills?.includes(k)}
                    double={!!s.expertise?.includes(k)}
                    label={`${k}: ${s.expertise?.includes(k) ? 'Expertise' : s.skills?.includes(k) ? 'proficient' : 'not proficient'}`}
                    onChange={readOnly ? undefined : () => cycle(k)}
                  />
                  <span className="flex-1 text-[13px]">
                    {k}
                    {s.expertise?.includes(k) && <span className="ml-1 text-[10px] font-semibold tracking-wider text-gold">EXP</span>}
                  </span>
                  <span className="num text-[13px]">{signed(skillBonus(s, level, k))}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {['Perception', 'Insight', 'Investigation'].map((k) => (
          <Stat key={k} label={<>Passive {k}</>} title={`Passive ${k}`}>
            {passive(s, level, k)}
          </Stat>
        ))}
      </div>

      <section className="space-y-3">
        <Rule>Equipment training and proficiencies</Rule>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={`w-full sm:w-auto ${LABEL}`}>Armor training</span>
          {(['light', 'medium', 'heavy', 'shields'] as const).map((k) => (
            <span key={k} className="relative flex items-center gap-1.5 rounded-sm px-1 max-sm:min-h-10">
              <Diamond cover on={!!s.armorTraining?.[k]} label={`${k} armor training`} onChange={readOnly ? undefined : (on) => put({ armorTraining: { ...s.armorTraining, [k]: on } })} />
              {k[0].toUpperCase() + k.slice(1)}
            </span>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Weapons">
            <textarea className="input min-h-16 text-sm" value={s.weaponProf ?? ''} disabled={readOnly} onChange={(e) => put({ weaponProf: e.target.value })} placeholder={info?.weapons} />
          </Field>
          <Field label="Tools">
            <textarea className="input min-h-16 text-sm" value={s.toolProf ?? ''} disabled={readOnly} onChange={(e) => put({ toolProf: e.target.value })} />
          </Field>
          <Field label="Languages">
            <textarea className="input min-h-16 text-sm" value={s.languages ?? ''} disabled={readOnly} onChange={(e) => put({ languages: e.target.value })} placeholder="Common, and…" />
          </Field>
        </div>
        <div className="space-y-1">
          <div className={LABEL}>
            Weapon mastery{' '}
            {canMaster ? (
              <span className="num normal-case tracking-normal">
                ({masteries.length} of {canMaster})
              </span>
            ) : (
              ''
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {masteries.map((m) => (
              <span key={m} className="tag border-gold/50 bg-gold/10 text-gold">
                {m}
                {weaponInfo(m) ? `: ${weaponInfo(m)!.mastery}` : ''}
                {!readOnly && (
                  <button
                    aria-label={`Remove ${m}`}
                    className="relative hover:text-danger after:absolute after:-inset-3 after:content-['']"
                    onClick={() => put({ masteries: masteries.filter((x) => x !== m) })}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {!readOnly && (
              <select
                className="input w-auto py-1 text-xs max-sm:min-h-10"
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
                  className="input w-auto py-1 text-xs max-sm:min-h-10"
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
                <button className="btn-ghost text-xs max-sm:min-h-10" onClick={() => put({ attacks: [...attacks, { name: '', bonus: '', damage: '', notes: '' }] })}>
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
          <div className="space-y-2 md:space-y-0">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_5.5rem_minmax(0,1.2fr)_minmax(0,1fr)_1.75rem] gap-3 border-b border-line px-1 pb-1 md:grid">
              {['Name', 'Atk / DC', 'Damage and type', 'Notes'].map((h) => (
                <span key={h} className={LABEL}>
                  {h}
                </span>
              ))}
            </div>
            {attacks.map((a, i) => (
              <div
                key={i}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1 rounded-md border border-line bg-raised/40 p-2 md:grid-cols-[minmax(0,1.3fr)_5.5rem_minmax(0,1.2fr)_minmax(0,1fr)_1.75rem] md:rounded-none md:border-0 md:border-b md:border-line/60 md:bg-transparent md:px-1 md:py-1"
              >
                {(
                  [
                    ['name', 'Name', 'col-span-2 md:col-span-1 font-serif text-[16px]', 'Name'],
                    ['bonus', 'Attack bonus or save DC', 'num row-start-2 md:row-start-auto', 'Atk / DC'],
                    ['damage', 'Damage and type', 'num row-start-2 md:row-start-auto', 'Damage'],
                    ['notes', 'Notes', 'col-span-3 text-sm md:col-span-1', 'Notes'],
                  ] as const
                ).map(([k, label, cls, short]) => (
                  <label key={k} className={`min-w-0 ${cls}`}>
                    {k !== 'name' && <span className={`block md:sr-only ${LABEL}`}>{short}</span>}
                    <input
                      className="input-bare max-sm:min-h-9"
                      value={a[k]}
                      aria-label={label}
                      placeholder={k === 'name' ? 'Weapon or cantrip' : ''}
                      disabled={readOnly}
                      onChange={(e) => setAttack(i, { [k]: e.target.value })}
                    />
                  </label>
                ))}
                {!readOnly ? (
                  <button
                    aria-label={`Remove ${a.name || 'attack'}`}
                    className="col-start-3 row-start-1 flex h-10 w-10 items-center justify-center justify-self-end rounded-sm text-dim hover:bg-danger/10 hover:text-danger md:col-start-auto md:row-start-auto md:h-7 md:w-7"
                    onClick={() => put({ attacks: attacks.filter((_, j) => j !== i) })}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Rule
          actions={
            !readOnly &&
            resourcesStale && (
              <button
                className="btn-ghost text-xs max-sm:min-h-10"
                onClick={() => put({ resources: fresh.map((f) => ({ ...f, used: Math.min(f.max, resources.find((r) => r.name === f.name)?.used ?? 0) })) })}
              >
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
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-raised/40 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{r.name}</span>
                <span className="text-xs text-dim">{r.reset === 'long' ? 'Back on a long rest' : r.reset === 'short' ? 'Back on a short rest' : 'One back on a short rest, all on a long rest'}</span>
              </span>
              <Pips max={r.max} used={r.used} label={r.name} onChange={readOnly ? undefined : (used) => put({ resources: resources.map((x, j) => (j === i ? { ...x, used } : x)) })} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <Rule>Conditions</Rule>
        <div className="max-sm:[&_.chip]:min-h-8 max-sm:[&_select]:min-h-10">
          <ConditionChips
            value={s.conditions ?? []}
            options={CONDITIONS_2024.filter((c) => c !== 'Exhaustion')}
            onChange={readOnly ? undefined : (conditions) => put({ conditions })}
            readOnly={readOnly}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Exhaustion" hint={s.exhaustion ? `−${2 * s.exhaustion} to D20 Tests, Speed −${5 * s.exhaustion} ft.` : undefined}>
            <Pips max={6} used={s.exhaustion ?? 0} label="Exhaustion level" onChange={readOnly ? undefined : (v) => put({ exhaustion: v })} />
          </Field>
          <Field label="Concentrating on">
            <input className="input max-sm:min-h-10" value={s.concentration ?? ''} disabled={readOnly} onChange={(e) => put({ concentration: e.target.value || null })} placeholder="Nothing" />
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
            <select className="input max-sm:min-h-10" value={s.armorWorn ?? ''} disabled={readOnly} onChange={(e) => wear({ armorWorn: e.target.value })}>
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
          <span className="relative flex items-center gap-1.5 rounded-sm px-1 pb-2 text-sm max-sm:min-h-10 max-sm:pb-0">
            <Diamond cover on={!!s.shield} label="Shield" onChange={readOnly ? undefined : (on) => wear({ shield: on })} /> Shield (+2)
          </span>
        </div>
        <p className="text-sm text-dim">
          <span className="num font-semibold text-ink">AC {calc.value}</span>: {calc.how}.{' '}
          {s.ac !== calc.value && !readOnly && (
            <button className="text-gold underline underline-offset-2 max-sm:min-h-10" onClick={() => put({ ac: calc.value })}>
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
        <ItemRulesList names={equipmentNames(s.equipment ?? '')} title="What your equipment does (from the GM's books)" />
      </section>

      <section className="space-y-2">
        <Rule>Magic item attunement</Rule>
        <ul className="space-y-1.5">
          {att.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <Diamond on={!!a} label={`Attunement slot ${i + 1}`} />
              <input
                className="input-bare max-sm:min-h-10"
                value={a}
                placeholder="Attuned item"
                aria-label={`Attuned item ${i + 1}`}
                disabled={readOnly}
                onChange={(e) => put({ attunement: att.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </li>
          ))}
        </ul>
        <ItemRulesList names={att} title="Attuned items" />
      </section>

      <section className="space-y-2">
        <Rule>Coins</Rule>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((c) => (
            <Stat key={c} label={c.toUpperCase()} className={c === 'gp' ? 'border-gold/50' : ''}>
              <input
                type="number"
                min={0}
                className={`${STAT_INPUT} text-lg! ${NO_SPIN}`}
                value={coins[c] ?? ''}
                placeholder="0"
                aria-label={c.toUpperCase()}
                disabled={readOnly}
                onChange={(e) => put({ coins: { ...coins, [c]: num(e.target.value) } })}
              />
            </Stat>
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
