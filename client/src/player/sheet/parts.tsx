/** Small pieces of the character sheet: labelled fields, diamond toggles, uses, and the tab bar. */
import { useState, type ReactNode } from 'react';

export const num = (v: string) => (v === '' ? undefined : Number(v));

/** The small caps over a field or a figure. */
export const LABEL = 'text-[11px] font-medium uppercase tracking-[0.12em] text-dim';

/** A labelled field. */
export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className={`block ${LABEL}`}>{label}</span>
      {children}
      {hint && <span className="block text-xs text-dim">{hint}</span>}
    </label>
  );
}

/** A figure in a box: AC, Initiative, a passive score, a coin. The value is tabular, so columns of them line up. */
export function Stat({ label, children, foot, className = '', title }: { label: ReactNode; children: ReactNode; foot?: ReactNode; className?: string; title?: string }) {
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center rounded-md border border-line bg-raised/60 px-2 py-1.5 text-center ${className}`} title={title}>
      <span className="block max-w-full text-[10px] font-medium uppercase leading-tight tracking-[0.08em] text-dim">{label}</span>
      <span className="num block w-full text-xl font-semibold leading-tight text-ink">{children}</span>
      {foot}
    </div>
  );
}

/** Number inputs drawn as plain figures: no spinner arrows. */
export const NO_SPIN = '[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** The bare input inside a Stat: it takes the box's figure style. */
export const STAT_INPUT = 'num w-full bg-transparent text-center text-xl font-semibold leading-tight text-ink placeholder:text-dim/60 focus:outline-none disabled:opacity-100';

/** A section heading in the ledger's style, with optional actions on the right. */
export function Rule({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <h3 className="ledger-rule min-w-[14rem] flex-1">{children}</h3>
      {actions}
    </div>
  );
}

/**
 * The official sheet's diamond: a toggle with its meaning spelled out for screen readers and on hover. `cover` makes
 * the whole row it sits in (the nearest positioned parent) the thing to tap, which is how a 16px diamond gets a
 * finger-sized target on a phone.
 */
export function Diamond({ on, onChange, label, disabled, double, cover }: { on: boolean; onChange?: (on: boolean) => void; label: string; disabled?: boolean; double?: boolean; cover?: boolean }) {
  const live = !disabled && !!onChange;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={!live}
      className={`diamond ${double ? 'diamond-double' : ''} ${cover && live ? "after:absolute after:inset-0 after:rounded after:content-[''] hover:after:bg-gold/5" : ''}`}
      onClick={() => onChange?.(!on)}
    />
  );
}

/** Uses of something, as diamonds: click one to set how many are spent. */
export function Pips({ max, used, onChange, label }: { max: number; used: number; onChange?: (used: number) => void; label: string }) {
  if (max > 12)
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <input
          type="number"
          className="input-bare num w-12 text-center"
          min={0}
          max={max}
          value={max - used}
          aria-label={`${label} left`}
          onChange={(e) => onChange?.(Math.max(0, Math.min(max, max - (Number(e.target.value) || 0))))}
          disabled={!onChange}
        />
        <span className="text-dim">/ {max}</span>
      </span>
    );
  return (
    <span className="inline-flex flex-wrap gap-0.5" role="group" aria-label={`${label}: ${max - used} of ${max} left`}>
      {Array.from({ length: max }, (_, i) => (
        <Diamond key={i} on={i < used} label={`${label} ${i + 1} ${i < used ? 'spent' : 'unspent'}`} onChange={onChange ? () => onChange(i < used ? i : i + 1) : undefined} />
      ))}
    </span>
  );
}

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}
/**
 * Tabs along the top of the sheet; the open one is remembered for this browser. On a phone they wrap into a grid of
 * finger-sized cells (every section in view, no sideways scrolling); from a small tablet up they're a single row.
 */
export function Tabs({ tabs, storeKey }: { tabs: Tab[]; storeKey: string }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storeKey) ?? tabs[0]?.id;
    } catch {
      return tabs[0]?.id;
    }
  });
  const current = tabs.find((t) => t.id === open) ?? tabs[0];
  const choose = (id: string) => {
    setOpen(id);
    try {
      localStorage.setItem(storeKey, id);
    } catch {
      /* private window */
    }
  };
  return (
    <div className="space-y-5">
      <div
        className="grid grid-cols-3 gap-1 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap sm:gap-x-1 sm:gap-y-0 sm:border-b sm:border-line"
        role="tablist"
        aria-label="Sheet sections"
      >
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              className={`relative min-h-10 whitespace-nowrap rounded-md border px-2 text-sm font-medium transition-colors sm:-mb-px sm:min-h-0 sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3 sm:py-2 ${
                on ? 'border-gold/60 bg-gold/15 text-gold sm:border-gold sm:bg-transparent' : 'border-line bg-raised/50 text-dim hover:text-ink sm:border-transparent sm:bg-transparent'
              }`}
              onClick={() => choose(t.id)}
              onKeyDown={(e) => {
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
                if (next) {
                  choose(next.id);
                  document.getElementById(`tab-${next.id}`)?.focus();
                }
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {current && (
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
          {current.content}
        </div>
      )}
    </div>
  );
}

/** A select with the usual choices, plus "Other…" for anything else (typed in). */
export function ChoiceSelect({
  value,
  onChange,
  groups,
  label,
  disabled,
  placeholder = 'Choose…',
}: {
  value: string;
  onChange: (v: string) => void;
  groups: { label: string; options: { value: string; label?: string }[] }[];
  label: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  // Typing when the player chose "Other…", or the value isn't one of the choices (which may still be loading).
  const [chose, setTyping] = useState(false);
  const typing = chose || (!!value && !known);
  if (typing)
    return (
      <span className="flex gap-1">
        <input className="input max-sm:min-h-10" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} autoFocus={!value} />
        {!disabled && (
          <button
            type="button"
            className="btn-ghost text-xs max-sm:min-h-10"
            onClick={() => {
              setTyping(false);
              if (!known) onChange('');
            }}
            title="Choose from the list"
          >
            List
          </button>
        )}
      </span>
    );
  return (
    <select
      className="input max-sm:min-h-10"
      value={known ? value : ''}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === '__other') {
          setTyping(true);
          onChange('');
        } else onChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {groups
        .filter((g) => g.options.length)
        .map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label ?? o.value}
              </option>
            ))}
          </optgroup>
        ))}
      <option value="__other">Other…</option>
    </select>
  );
}
