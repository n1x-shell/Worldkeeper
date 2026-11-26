/**
 * The character builder's building blocks: the stepper, the step card, choice cards and toggles. Tokens only; the
 * player bundle imports nothing from the GM app (see tests/playerBundle.test.ts).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Badge } from '../../components/ui/badges';
import { ABILITIES } from '../../../../shared/sheet';
import { classInfo, masteryCount, spellCounts } from '../../../../shared/rules2024';
import { expertiseCount, type Build, type buildSheet } from './compute';

export const STEPS = ['People', 'Class', 'Background', 'Abilities', 'Skills', 'Equipment', 'Spells', 'Details', 'Ties', 'Sheet'] as const;

/** Markdown links and emphasis out of a one-line tagline, for a card that is itself a button. */
export const plain = (s: string) =>
  s
    .replace(/@?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/@\[([^\]]+)\]/g, '$1')
    .replace(/\*+/g, '');

export interface StepTodo {
  step: number;
  what: string;
}

/**
 * What's still to choose, by step: the same list the finished sheet checks. A step is done when nothing in it is
 * left (Equipment once there's a class to equip, Ties once anything is written there, the sheet once all is done).
 */
export function progress(b: Build, sheet: ReturnType<typeof buildSheet>, bgFixed: boolean) {
  const info = classInfo(b.cls);
  const counts = spellCounts(b.cls, b.level);
  const items: [number, boolean, string][] = [
    [0, !!b.people, 'a people'],
    [1, !!info, 'a class'],
    [1, b.level < 3 || !!b.subclass, 'a subclass'],
    [2, !!b.background, 'a background'],
    [2, !b.background || bgFixed || b.bgAbilities.length === 3, 'the three abilities your background raises'],
    [3, ABILITIES.every((a) => b.base[a] > 0), 'all six ability scores'],
    [3, b.bonusMode === '1-1-1' ? b.bgAbilities.length === 3 : !!b.plusTwo && !!b.plusOne, "your background's increases"],
    [4, !info || b.classSkills.length >= info.skillCount, `${info?.skillCount ?? 0} class skills`],
    [4, b.expertise.length >= expertiseCount(b.cls, b.level), 'Expertise'],
    [4, b.languages.length >= 2, 'two languages'],
    [4, b.masteries.length >= masteryCount(b.cls, b.level), 'weapon masteries'],
    [6, !info?.caster || info.outsideSrd || (sheet.sheet.spells?.length ?? 0) >= counts.cantrips + counts.prepared, 'spells'],
    [7, !!b.name, 'a name'],
  ];
  const todo: StepTodo[] = items.filter(([, ok]) => !ok).map(([step, , what]) => ({ step, what }));
  const ties = !!(b.start || b.hometown || b.faction || b.family || b.rival || b.debt || b.notes);
  const done = STEPS.map((_, i) => {
    if (i === 5) return !!info;
    if (i === 8) return ties;
    if (i === 9) return todo.length === 0;
    if (i === 6 && !info) return false;
    if (i === 4 && !info) return false;
    return !todo.some((t) => t.step === i);
  });
  return { todo, done };
}

/** Where you are, what's done and what's left. It scrolls sideways on a phone, keeping the current step in view. */
export function Stepper({ step, done, onStep }: { step: number; done: boolean[]; onStep: (i: number) => void }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = list.current;
    const li = ol?.children[step] as HTMLElement | undefined;
    if (ol && li && ol.scrollWidth > ol.clientWidth) ol.scrollTo({ left: li.offsetLeft - ol.clientWidth / 2 + li.clientWidth / 2, behavior: 'smooth' });
  }, [step]);
  return (
    <nav className="print:hidden" aria-label="Progress">
      <ol ref={list} className="flex overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin" aria-label="Steps">
        {STEPS.map((s, i) => {
          const cur = i === step;
          const ok = done[i] && !cur;
          return (
            <li key={s} className="relative flex-1 min-w-19">
              {i > 0 && <span aria-hidden className={`absolute top-5.5 h-px ${done[i - 1] ? 'bg-gold/60' : 'bg-line'}`} style={{ right: 'calc(50% + 1.125rem)', width: 'calc(100% - 2.25rem)' }} />}
              <button
                type="button"
                onClick={() => onStep(i)}
                aria-current={cur ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s}${ok ? ', done' : ''}`}
                className="group relative flex w-full min-h-10 flex-col items-center gap-1 rounded-md px-1 py-2 focus-visible:outline-offset-0"
              >
                <span
                  className={`num flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    cur ? 'border-gold bg-gold text-panel' : ok ? 'border-gold/70 bg-gold/10 text-gold' : 'border-line bg-raised text-dim group-hover:border-gold/50 group-hover:text-ink'
                  }`}
                >
                  {ok ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={`whitespace-nowrap text-xs ${cur ? 'text-ink font-semibold' : ok ? 'text-ink' : 'text-dim group-hover:text-ink'}`}>{s}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** One step: a calm card with its title, a line on what to do, the choices, and the way on. */
export function StepCard({
  step,
  title,
  note,
  children,
  onBack,
  onNext,
  aside,
}: {
  step: number;
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  onBack: () => void;
  onNext?: () => void;
  aside?: ReactNode;
}) {
  return (
    <section className="panel elev-1 p-4 sm:p-6 print:hidden" aria-labelledby="builder-step-title">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2 mb-5">
        <div className="min-w-0 flex-1 basis-60">
          <div className="text-xs uppercase tracking-[0.18em] text-dim num">
            Step {step + 1} of {STEPS.length}
          </div>
          <h2 id="builder-step-title" className="title-rule mt-1 text-xl sm:text-[22px] text-ink inline-block pr-6">
            {title}
          </h2>
          {note && <p className="mt-2 text-sm text-dim max-w-[72ch]">{note}</p>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </header>
      <div className="space-y-6">{children}</div>
      <StepNav step={step} onBack={onBack} onNext={onNext} />
    </section>
  );
}

export function StepNav({ step, onBack, onNext }: { step: number; onBack: () => void; onNext?: () => void }) {
  return (
    <div className="mt-6 flex gap-2 border-t border-line pt-4 print:hidden">
      <button className="btn min-h-10 sm:min-h-0 justify-center flex-1 sm:flex-none" disabled={step === 0} onClick={onBack}>
        <ArrowLeft size={14} /> Back
      </button>
      {onNext && step < STEPS.length - 1 && (
        <button className="btn-primary min-h-10 sm:min-h-0 justify-center flex-2 sm:flex-none sm:ml-auto" onClick={onNext}>
          Next: {STEPS[step + 1]} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

/** A titled group of choices inside a step, with an optional counter ("2 of 4") on the right. */
export function Group({ title, note, count, children }: { title: ReactNode; note?: ReactNode; count?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="section-title">{title}</h3>
        {count}
      </div>
      {note && <p className="text-sm text-dim max-w-[72ch] -mt-1">{note}</p>}
      {children}
    </div>
  );
}

/** "2 of 4": a counter that turns green when the count is met and red when it's over. */
export function Count({ n, of, label }: { n: number; of: number; label?: string }) {
  return (
    <Badge tone={n > of ? 'danger' : n === of ? 'ok' : 'dim'} className="num">
      {n} of {of}
      {label ? ` ${label}` : ''}
    </Badge>
  );
}

/** One choice among cards (a people, a class, a background, a kit). */
export function ChoiceCard({ on, title, sub, onClick, badge }: { on: boolean; title: string; sub?: ReactNode; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      className={`group w-full min-h-12 rounded-md border p-3 text-left transition-colors ${
        on ? 'border-gold bg-gold/10 ring-1 ring-gold/40' : 'border-line bg-raised/60 hover:border-gold/50 hover:bg-raised'
      }`}
      onClick={onClick}
      aria-pressed={on}
    >
      <span className="flex items-start gap-2">
        <span className={`flex-1 min-w-0 font-display text-[15px] leading-snug tracking-wide ${on ? 'text-gold' : 'text-ink'}`}>{title}</span>
        {badge && <Badge className="shrink-0 mt-px">{badge}</Badge>}
        <span
          aria-hidden
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${on ? 'border-gold bg-gold text-panel' : 'border-edge/50 group-hover:border-gold/60'}`}
        >
          {on && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
      {sub && <span className="mt-1 text-[13px] leading-snug text-dim line-clamp-2 sm:line-clamp-3">{sub}</span>}
    </button>
  );
}

export const cardGrid = 'grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3';

/** A small on/off choice in a list (a language, Expertise, a weapon to master). */
export function Pill({ on, onClick, disabled, children, title, italic }: { on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode; title?: string; italic?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-10 sm:min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${italic ? 'italic' : ''} ${
        on ? 'border-gold/70 bg-gold/10 text-gold' : 'border-line bg-raised/60 text-ink hover:border-gold/50'
      }`}
    >
      {on && <Check size={13} strokeWidth={2.5} aria-hidden />}
      {children}
    </button>
  );
}
