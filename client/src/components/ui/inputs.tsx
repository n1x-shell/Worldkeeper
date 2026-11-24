/** Inputs: fields, switches, checkboxes, segmented controls and tabs. No app dependencies (the player handbook uses these). */
import type { KeyboardEvent, ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-dim mt-1">{hint}</span>}
    </label>
  );
}

/**
 * An on/off switch for a setting that takes effect at once ("Players see it", "Revealed"). It is a real checkbox
 * (role "switch"), so it works with the keyboard and screen readers.
 */
export function Toggle({
  checked,
  onChange,
  children,
  hint,
  disabled,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-start gap-2 text-sm cursor-pointer ${disabled ? 'opacity-60 cursor-default' : ''} ${className}`}>
      <input type="checkbox" role="switch" className="toggle" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-checked={checked} />
      {(children || hint) && (
        <span className="leading-5">
          {children}
          {hint && <span className="block text-xs text-dim">{hint}</span>}
        </span>
      )}
    </label>
  );
}

/** A checkbox with its label: for choosing things (a filter, items in a list), where a switch would be odd. */
export function Check({
  checked,
  onChange,
  children,
  hint,
  disabled,
  className = '',
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <label className={`inline-flex items-start gap-2 text-sm cursor-pointer ${disabled ? 'opacity-60 cursor-default' : ''} ${className}`}>
      <input type="checkbox" className="check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      {(children || hint) && (
        <span className="leading-5">
          {children}
          {hint && <span className="block text-xs text-dim">{hint}</span>}
        </span>
      )}
    </label>
  );
}

/** One choice from a few, side by side. Arrow keys move the choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  disabled,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const keys = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelectorAll('button')[options.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={label} onKeyDown={keys}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} title={o.title} disabled={disabled} className={on ? 'on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  const keys = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = tabs[(i + d + tabs.length) % tabs.length];
    onChange(next.id);
    (e.currentTarget.querySelectorAll('[role="tab"]')[tabs.indexOf(next)] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="tablist" className="flex gap-1 border-b border-line overflow-x-auto" onKeyDown={keys}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t.id ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
