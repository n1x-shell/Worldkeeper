/**
 * Pickers from the rules packs that are on (the SRD, the GM's books, open add-ons) for a new record's facts
 * (docs/OWN_WORLD_PLAN.md §2.4): a creature's stat block, a magic item to start from, a people's species rules and an
 * NPC's species or class. Each is a text box with suggestions, so anything the rules don't have can still be typed.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { api, qs } from '../lib/api';
import { DANGERS, TERRAINS, WEALTHS } from '@shared/places';

interface Option {
  key: string;
  label: string;
  detail?: string;
}

/** A text box offering suggestions as you type; choosing one fills it in. */
function Suggest({
  value,
  onChange,
  onPick,
  load,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (o: Option) => void;
  load: (q: string) => Promise<Option[]>;
  placeholder?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [hi, setHi] = useState(0);
  const list = useId();
  const latest = useRef(0);
  useEffect(() => {
    if (!open) return;
    const n = ++latest.current;
    const t = setTimeout(async () => {
      const found = await load(value.trim()).catch(() => []);
      if (n === latest.current) {
        setOptions(found.slice(0, 10));
        setHi(0);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [value, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (o: Option) => {
    onChange(o.label);
    onPick?.(o);
    setOpen(false);
  };
  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={list}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi((hi + 1) % options.length));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((hi - 1 + options.length) % options.length));
          else if (e.key === 'Enter') (e.preventDefault(), pick(options[hi]));
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && options.length > 0 && (
        <ul id={list} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto panel elev-2 py-1 text-sm">
          {options.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={i === hi}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1 ${i === hi ? 'bg-raised text-gold' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span className="truncate">{o.label}</span>
              {o.detail && <span className="ml-auto shrink-0 text-xs text-dim">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Creature {
  id: string;
  name: string;
  cr: string | null;
  source: string;
}
export interface RulesItem {
  name: string;
  type: string;
  rarity: string;
  attunement: string;
  source: string;
}

const creatures = async (q: string) =>
  (await api.get<Creature[]>(`/api/books/creatures${qs({ q, limit: 60 })}`))
    .sort((a, b) => rank(a.name, q) - rank(b.name, q))
    .slice(0, 10)
    .map((c) => ({ key: c.id, label: c.name, detail: `${c.cr != null ? `CR ${c.cr} · ` : ''}${c.source}`, c }));

/** Names that start with the query first, then ones that contain it, then the rest (found by their kind). */
const rank = (name: string, q: string) => {
  const n = name.toLowerCase();
  const x = q.trim().toLowerCase();
  return n.startsWith(x) ? 0 : n.includes(x) ? 1 : 2;
};

// The species and classes in the rules packs that are on, loaded once.
let rulesNames: Promise<{ species: string[]; classes: string[] }> | null = null;
const loadRules = () =>
  (rulesNames ??= api
    .get<{ species: Record<string, unknown>; classes: Record<string, unknown> }>('/api/player/rules')
    .then((r) => ({ species: Object.keys(r.species ?? {}).sort(), classes: Object.keys(r.classes ?? {}).sort() }))
    .catch(() => ({ species: [], classes: [] })));
const fromList = (names: string[], q: string) =>
  names
    .filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(q.toLowerCase())) - Number(!b.toLowerCase().startsWith(q.toLowerCase())))
    .map((n) => ({ key: n, label: n }));

/** Which picker a fact gets, by its name and the record's type; null for a plain text box. */
export function rulesPickerFor(fact: string, type: string): 'creature' | 'species' | 'class' | null {
  if (/^stat ?block$/i.test(fact)) return 'creature';
  if (/^species rules$/i.test(fact) || (/^species$/i.test(fact) && type === 'npc')) return 'species';
  if (/^class$/i.test(fact) && type === 'npc') return 'class';
  return null;
}

/** A fact's input: a picker from the rules where one fits, else a text box. */
export function RulesFactInput({
  fact,
  type,
  value,
  onChange,
  placeholder,
  onPickCreature,
}: {
  fact: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onPickCreature?: (c: Creature) => void;
}) {
  const kind = rulesPickerFor(fact, type);
  if (kind === 'creature')
    return (
      <Suggest
        value={value}
        onChange={onChange}
        label={fact}
        placeholder={placeholder || 'Search the stat blocks in your rules…'}
        load={creatures}
        onPick={(o) => onPickCreature?.((o as Option & { c: Creature }).c)}
      />
    );
  if (kind === 'species' || kind === 'class')
    return (
      <Suggest
        value={value}
        onChange={onChange}
        label={fact}
        placeholder={placeholder}
        load={async (q) => {
          const r = await loadRules();
          return fromList(kind === 'species' ? r.species : r.classes, q);
        }}
      />
    );
  // A place's danger and wealth from their scales; its terrain as words the encounter tables know.
  const scale = /^danger$/i.test(fact) ? DANGERS : /^wealth$/i.test(fact) ? WEALTHS : null;
  if (scale)
    return (
      <select className="input" value={value} aria-label={fact} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {scale.map((v) => (
          <option key={v}>{v}</option>
        ))}
        {value && !(scale as readonly string[]).includes(value) && <option>{value}</option>}
      </select>
    );
  if (/^terrain$/i.test(fact))
    return (
      <Suggest
        value={value}
        onChange={onChange}
        label={fact}
        placeholder={placeholder}
        load={async (q) => {
          // Suggest for the last word typed, keeping the ones before it.
          const parts = q.split(/,\s*/);
          const last = parts.pop() ?? '';
          const before = parts.filter(Boolean);
          return TERRAINS.filter((t) => t.startsWith(last.toLowerCase()) && !before.includes(t)).map((t) => ({ key: t, label: [...before, t].join(', ') }));
        }}
      />
    );
  return <input className="input" value={value} placeholder={placeholder} aria-label={fact} onChange={(e) => onChange(e.target.value)} />;
}

/** Start an item from one in the rules: its rarity, attunement and kind fill in. */
export function ItemPicker({ onPick }: { onPick: (it: RulesItem) => void }) {
  const [q, setQ] = useState('');
  return (
    <label className="block">
      <span className="label">Start from a rules item (optional)</span>
      <Suggest
        value={q}
        onChange={setQ}
        label="Rules item"
        placeholder="Search the magic items in your rules…"
        load={async (query) =>
          (await api.get<RulesItem[]>(`/api/books/items${qs({ q: query, limit: 10 })}`)).map((it) => ({
            key: `${it.name}|${it.source}`,
            label: it.name,
            detail: `${it.rarity || it.type} · ${it.source}`,
            it,
          }))
        }
        onPick={(o) => onPick((o as Option & { it: RulesItem }).it)}
      />
    </label>
  );
}
