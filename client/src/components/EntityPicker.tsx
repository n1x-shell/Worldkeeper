import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppState } from '../lib/store';
import { useRecordTypes } from './recordTypes';
import type { TypeTraits } from '@shared/recordTypes';
import { Badge } from './ui';

/**
 * Expand a picker's `types`: type keys, or traits written "@place", "@group", "@person", "@holdable", "@folk"... (any
 * type with that trait in this library's registry, a pack's or the GM's own included).
 */
export function useTypeFilter(types: string[] | undefined): Set<string> | null {
  const reg = useRecordTypes();
  return useMemo(() => (types ? new Set(types.flatMap((t) => (t.startsWith('@') ? reg.with(t.slice(1) as keyof TypeTraits) : [t]))) : null), [types, reg]);
}

/** Accessible combobox to choose a record from the index by name, alias-free ID or partial name. */
export function EntityPicker({
  value,
  onChange,
  types,
  placeholder = 'Search records…',
  allowClear = true,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  types?: string[];
  placeholder?: string;
  allowClear?: boolean;
}) {
  const recordTypes = useRecordTypes();
  const { index, debug } = useAppState();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const allowed = useTypeFilter(types);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [...index.values()].filter((e) => e.type !== 'redirect' && (!allowed || allowed.has(e.type)));
    if (!needle) return all.slice(0, 30);
    return all
      .filter((e) => e.name.toLowerCase().includes(needle) || e.id.toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)))
      .slice(0, 30);
  }, [q, index, allowed]);
  const selected = value ? index.get(value) : null;

  if (value && !open)
    return (
      <div className="flex items-center gap-1 input">
        <button type="button" className="flex-1 text-left truncate" onClick={() => (setOpen(true), setTimeout(() => inputRef.current?.focus(), 0))}>
          {selected ? selected.name : value} {debug && <span className="text-dim text-xs">{value}</span>}
        </button>
        {allowClear && (
          <button type="button" className="text-dim hover:text-danger" onClick={() => onChange(null)} aria-label="Clear">
            <X size={14} />
          </button>
        )}
      </div>
    );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="input"
        role="combobox"
        aria-expanded={open}
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
          else if (e.key === 'Enter' && results[hi]) {
            e.preventDefault();
            onChange(results[hi].id);
            setQ('');
            setOpen(false);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-1500 mt-1 max-h-64 w-full overflow-auto panel elev-2">
          {results.map((e, i) => (
            <li
              key={e.id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(ev) => {
                ev.preventDefault();
                onChange(e.id);
                setQ('');
                setOpen(false);
              }}
              className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between gap-2 ${i === hi ? 'bg-raised text-gold' : ''}`}
            >
              <span className="truncate">{e.name}</span>
              <span className="text-xs text-dim shrink-0">
                {recordTypes.label(e.type)}
                {debug && ` · ${e.id}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Multi-select list of record IDs. */
export function EntityMultiPicker({ value, onChange, types, label }: { value: string[]; onChange: (ids: string[]) => void; types?: string[]; label?: string }) {
  const { index } = useAppState();
  return (
    <div className="space-y-1.5">
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-1">
        {value.map((id) => (
          <Badge key={id} tone="arcane">
            {index.get(id)?.name ?? id}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label={`Remove ${id}`}>
              <X size={11} />
            </button>
          </Badge>
        ))}
      </div>
      <EntityPicker value={null} types={types} placeholder="Add a record…" onChange={(id) => id && !value.includes(id) && onChange([...value, id])} />
    </div>
  );
}
