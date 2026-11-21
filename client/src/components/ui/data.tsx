/** Data display: the sortable table, hit points and conditions. */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Heart, Shield, Sword, X } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** What the cell shows. Defaults to the row's value at `key`. */
  render?: (row: T) => ReactNode;
  /** Sort by this. Give it (or `sortable`, to sort by the row's value at `key`) to make the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Numbers: right-aligned with tabular figures. */
  num?: boolean;
  className?: string;
  /** Column header class, e.g. a width. */
  headClassName?: string;
}

const cmp = (a: unknown, b: unknown) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

/**
 * A table: sticky header, sortable columns (click a header; again to reverse), tabular numbers, and an empty
 * message in place of rows when there are none.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing here yet.',
  initialSort,
  onRowClick,
  rowClassName,
  caption,
  className = '',
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string | number;
  empty?: ReactNode;
  initialSort?: { key: string; dir?: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  caption?: string;
  className?: string;
  /** Scroll inside the table past this height (the header stays put). */
  maxHeight?: number | string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ? { key: initialSort.key, dir: initialSort.dir ?? 'asc' } : null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string | number);
    const out = [...rows].sort((a, b) => cmp(val(a), val(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);
  const alignOf = (c: Column<T>) => c.align ?? (c.num ? 'right' : 'left');
  return (
    <div className={`overflow-auto ${className}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="table data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const canSort = !!(c.sortValue || c.sortable);
              const on = sort?.key === c.key;
              const a = alignOf(c);
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''} ${c.headClassName ?? ''}`}
                  aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : canSort ? 'none' : undefined}
                >
                  {canSort ? (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gold ${on ? 'text-gold' : ''}`}
                      onClick={() => setSort(on && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : on ? null : { key: c.key, dir: 'asc' })}
                    >
                      {c.label}
                      {on ? sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="opacity-50" />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-dim py-6">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((r, i) => (
              <tr key={rowKey(r, i)} className={`${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(r) ?? ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => {
                  const a = alignOf(c);
                  return (
                    <td key={c.key} className={`${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''} ${c.num ? 'num' : ''} ${c.className ?? ''}`}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** How hurt something is: a bar that goes from green to amber to red, with temporary hit points shown beside it. */
export function HpBar({ hp, max, temp = 0, label, className = '' }: { hp: number; max: number; temp?: number; label?: boolean; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return (
    <div className={className}>
      {label && (
        <div className="flex items-baseline gap-1 text-sm num">
          <span className="text-ink font-medium">{hp}</span>
          <span className="text-dim">/ {max}</span>
          {temp > 0 && <span className="text-arcane text-xs">+{temp} temp</span>}
        </div>
      )}
      <div className="h-1.5 bg-raised rounded-full overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label="Hit points">
        {/* No maximum yet (a combatant added without hit points): an empty track, not a dying one. */}
        {max > 0 && <div className={`h-full rounded-full transition-[width] ${pct > 0.5 ? 'bg-ok' : pct > 0.25 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${pct * 100}%` }} />}
      </div>
      {!label && temp > 0 && <div className="text-[10px] text-arcane num">+{temp} temp</div>}
    </div>
  );
}

/** Enter an amount, then Damage, Heal or (optionally) set Temporary hit points. Enter in the box deals damage. */
export function HpStepper({
  onDamage,
  onHeal,
  onTemp,
  disabled,
  size = 'sm',
}: {
  onDamage: (n: number) => void;
  onHeal: (n: number) => void;
  onTemp?: (n: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const [amount, setAmount] = useState('');
  const n = Math.max(0, Math.round(Number(amount)) || 0);
  const run = (f: (n: number) => void) => {
    if (!n) return;
    f(n);
    setAmount('');
  };
  const pad = size === 'sm' ? 'px-1.5 py-0.5' : '';
  return (
    <div className="inline-flex items-center gap-1">
      <input
        className={`input num text-center ${size === 'sm' ? 'w-14 py-0.5' : 'w-20'}`}
        inputMode="numeric"
        value={amount}
        disabled={disabled}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && run(onDamage)}
        aria-label="Amount"
        placeholder="0"
      />
      <button type="button" className={`btn ${pad} text-danger`} disabled={disabled || !n} onClick={() => run(onDamage)} title="Damage">
        <Sword size={12} />
        {size === 'md' && 'Damage'}
      </button>
      <button type="button" className={`btn ${pad} text-ok`} disabled={disabled || !n} onClick={() => run(onHeal)} title="Heal">
        <Heart size={12} />
        {size === 'md' && 'Heal'}
      </button>
      {onTemp && (
        <button type="button" className={`btn ${pad} text-arcane`} disabled={disabled} onClick={() => (onTemp(n), setAmount(''))} title="Set temporary hit points">
          <Shield size={12} />
          {size === 'md' && 'Temp'}
        </button>
      )}
    </div>
  );
}

/** Conditions as chips. Click one to remove it; pick from the list to add one. */
export function ConditionChips({ value, options, onChange, readOnly }: { value: string[]; options: readonly string[]; onChange?: (next: string[]) => void; readOnly?: boolean }) {
  const edit = !readOnly && !!onChange;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((k) =>
        edit ? (
          <button key={k} type="button" className="chip border-danger/60 text-danger bg-danger/10 hover:bg-danger/20" onClick={() => onChange!(value.filter((x) => x !== k))} title={`Remove ${k}`}>
            {k} <X size={10} />
          </button>
        ) : (
          <span key={k} className="chip border-danger/60 text-danger bg-danger/10">
            {k}
          </span>
        ),
      )}
      {edit && (
        <select className="input w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && onChange!([...value, e.target.value])} aria-label="Add condition">
          <option value="">+ Condition</option>
          {options
            .filter((k) => !value.includes(k))
            .map((k) => (
              <option key={k}>{k}</option>
            ))}
        </select>
      )}
      {!edit && value.length === 0 && <span className="text-xs text-dim">None</span>}
    </div>
  );
}
