/** The character so far: beside every step on wide screens, and as a summary that opens on a phone. */
import { ChevronDown } from 'lucide-react';
import { ABILITIES, mod, signed } from '../../../../shared/sheet';
import { proficiencyBonus } from '../../../../shared/play';
import { ABILITY_NAMES } from '../../../../shared/rules2024';
import { STEPS, type StepTodo } from './parts';
import type { Build, buildSheet } from './compute';

type Sheet = ReturnType<typeof buildSheet>;

const subtitle = (b: Build) => [b.people, b.cls && `${b.cls} ${b.level}`, b.level >= 3 && b.subclass].filter(Boolean).join(' · ') || 'Nothing chosen yet';

function Portrait({ b, size }: { b: Build; size: 'sm' | 'lg' }) {
  return (
    <div className={`${size === 'lg' ? 'h-[4.5rem] w-14' : 'h-10 w-8'} shrink-0 overflow-hidden rounded-t-full rounded-b border border-gold/50 bg-raised flex items-center justify-center`} aria-hidden>
      {b.portrait ? (
        <img src={b.portrait} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`font-display text-gold/50 ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>{(b.name || '?')[0]}</span>
      )}
    </div>
  );
}

function Body({ b, sheet, todo, onStep }: { b: Build; sheet: Sheet; todo: StepTodo[]; onStep: (i: number) => void }) {
  const s = sheet.sheet;
  const pb = proficiencyBonus(b.level);
  const rows = (
    [
      ['Skills', [...(s.skills ?? [])].sort().join(', ')],
      ['Saves', (s.saves ?? []).join(', ')],
      ['Speed', s.speed],
      ['Feats', (s.featList ?? []).map((f) => f.name).join(', ')],
      ['Spells', s.spells?.length ? `${s.spells.length} chosen` : ''],
    ] as const
  ).filter(([, v]) => v);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {ABILITIES.map((a) => (
          <div key={a} className="rounded-md border border-line bg-raised/60 px-1 py-1.5 text-center" title={ABILITY_NAMES[a]}>
            <div className="text-[10px] uppercase tracking-[0.16em] text-dim">{a}</div>
            <div className="num text-lg font-semibold leading-tight text-ink">{signed(mod(s, a))}</div>
            <div className="num text-[11px] text-dim">{s.abilities?.[a]}</div>
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
          <div key={k} className="rounded-md border border-gold/30 bg-gold/5 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-dim">{k}</div>
            <div className="num text-base font-semibold text-ink">{v}</div>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <dl className="space-y-1.5 border-t border-line pt-3 text-[13px] leading-snug">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[3.75rem_1fr] gap-2">
              <dt className="text-dim">{k}</dt>
              <dd className="text-ink num">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="border-t border-line pt-3">
        {todo.length ? (
          <>
            <div className="text-[11px] uppercase tracking-[0.16em] text-dim mb-1.5">Still to choose</div>
            <ul className="space-y-0.5">
              {todo.slice(0, 4).map((t) => (
                <li key={t.what}>
                  <button className="w-full min-h-8 flex items-center gap-2 rounded px-1 -mx-1 text-left text-[13px] text-ink hover:bg-raised hover:text-gold" onClick={() => onStep(t.step)}>
                    <span className="h-1.5 w-1.5 rotate-45 border border-gold/70 shrink-0" aria-hidden />
                    <span className="flex-1">{t.what[0].toUpperCase() + t.what.slice(1)}</span>
                    <span className="text-[11px] text-dim">{STEPS[t.step]}</span>
                  </button>
                </li>
              ))}
            </ul>
            {todo.length > 4 && <div className="mt-1 text-xs text-dim num">and {todo.length - 4} more</div>}
          </>
        ) : (
          <p className="text-[13px] text-ok">Everything is chosen.</p>
        )}
      </div>
    </div>
  );
}

/** Wide screens: a featured card that stays in view as you scroll. */
export function Preview(props: { b: Build; sheet: Sheet; todo: StepTodo[]; onStep: (i: number) => void }) {
  const { b } = props;
  return (
    <aside className="panel elev-1 gilt-corners p-4 space-y-4 lg:sticky lg:top-4 lg:self-start print:hidden" aria-label="Your character so far">
      <div className="flex items-center gap-3">
        <Portrait b={b} size="lg" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-dim">Your character</div>
          <div className={`font-display text-lg leading-tight truncate ${b.name ? 'text-ink' : 'text-dim'}`}>{b.name || 'Unnamed'}</div>
          <div className="text-xs text-dim mt-0.5">{subtitle(b)}</div>
        </div>
      </div>
      <Body {...props} />
    </aside>
  );
}

/** Phones and tablets: one line (name, class, HP and AC) that opens to the whole summary. */
export function MobileSummary(props: { b: Build; sheet: Sheet; todo: StepTodo[]; onStep: (i: number) => void }) {
  const { b, sheet } = props;
  return (
    <details className="group panel elev-1 print:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden" aria-label="Your character so far">
        <Portrait b={b} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-display text-[15px] ${b.name ? 'text-ink' : 'text-dim'}`}>{b.name || 'Unnamed'}</span>
          <span className="block truncate text-xs text-dim">{subtitle(b)}</span>
        </span>
        <span className="num shrink-0 text-xs text-dim">
          HP <b className="text-ink font-semibold">{sheet.sheet.maxHp}</b> · AC <b className="text-ink font-semibold">{sheet.sheet.ac}</b>
        </span>
        <ChevronDown size={16} className="shrink-0 text-dim transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line p-3">
        <Body {...props} />
      </div>
    </details>
  );
}
