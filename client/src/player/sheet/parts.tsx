/** Small pieces of the character sheet: labelled fields, diamond toggles, uses, and the tab bar. */
import { useState, type ReactNode } from 'react';

export const num = (v: string) => (v === '' ? undefined : Number(v));

/** A labelled field. */
export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-0.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.16em] text-dim">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

/** A section heading in the ledger's style, with optional actions on the right. */
export function Rule({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="ledger-rule flex-1">{children}</h3>
      {actions}
    </div>
  );
}

/** The official sheet's diamond: a toggle with its meaning spelled out for screen readers and on hover. */
export function Diamond({ on, onChange, label, disabled, double }: { on: boolean; onChange?: (on: boolean) => void; label: string; disabled?: boolean; double?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled || !onChange}
      className={`diamond ${double ? 'diamond-double' : ''}`}
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
          className="input-bare w-12 text-center"
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
/** Tabs along the top of the sheet; the open one is remembered for this browser. */
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
    <div className="space-y-4">
      <div className="ledger-tabs" role="tablist" aria-label="Sheet sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === current?.id}
            aria-controls={`panel-${t.id}`}
            className="ledger-tab"
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
        ))}
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
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} autoFocus={!value} />
        {!disabled && (
          <button
            type="button"
            className="btn-ghost text-xs"
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
      className="input"
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
