/** The sheet's Features tab: class features, species traits and feats, each with its rules text. */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Wand2, X } from 'lucide-react';
import type { Feature, Sheet } from '@shared/sheet';
import { classInfo, ORIGIN_FEATS } from '@shared/rules2024';
import { Rule } from './parts';
import { classFeaturesFor, featFor, hasClassRules, loadRulesText, speciesTraitsFor, useLoaded } from './options';

/** Add features that aren't there yet (by name and source), keeping the ones the player wrote or changed. */
const merge = (have: Feature[], add: Feature[]) => [...have, ...add.filter((a) => !have.some((h) => h.name === a.name && h.source === a.source))];

function FeatureList({
  title,
  list,
  onChange,
  readOnly,
  fill,
  fillLabel,
  addOptions,
}: {
  title: string;
  list: Feature[];
  onChange: (l: Feature[]) => void;
  readOnly?: boolean;
  fill?: () => void;
  fillLabel?: string;
  addOptions?: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [pick, setPick] = useState('');
  const set = (i: number, p: Partial<Feature>) => onChange(list.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <section className="space-y-2">
      <Rule
        actions={
          !readOnly && (
            <span className="flex gap-1">
              {fill && (
                <button className="btn-ghost text-xs" onClick={fill} title={fillLabel}>
                  <Wand2 size={13} /> {fillLabel}
                </button>
              )}
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  onChange([...list, { name: '', source: '', text: '' }]);
                  setOpen(list.length);
                }}
              >
                <Plus size={13} /> Add
              </button>
            </span>
          )
        }
      >
        {title}
      </Rule>
      {addOptions && !readOnly && (
        <div className="flex gap-2">
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Add from the list: ${title}`}>
            <option value="">Add from the list…</option>
            {addOptions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!pick}
            onClick={async () => {
              const t = await loadRulesText();
              onChange([...list, featFor(t, pick)]);
              setPick('');
            }}
          >
            Add
          </button>
        </div>
      )}
      {list.length === 0 && <p className="text-sm text-dim">None yet.</p>}
      <ul className="space-y-1.5">
        {list.map((f, i) => (
          <li key={i} className="rounded border border-line/60 bg-bg/30">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                className="text-dim hover:text-gold"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-label={`${open === i ? 'Hide' : 'Show'} ${f.name || 'feature'}`}
              >
                {open === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <input
                className="input-bare font-display text-[14px] tracking-wide flex-1"
                value={f.name}
                placeholder="Name"
                aria-label="Name"
                disabled={readOnly}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <input
                className="input-bare text-xs text-dim w-36"
                value={f.source}
                placeholder="Where it's from"
                aria-label="Source"
                disabled={readOnly}
                onChange={(e) => set(i, { source: e.target.value })}
              />
              {!readOnly && (
                <button className="text-dim hover:text-danger" aria-label={`Remove ${f.name || 'feature'}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              )}
            </div>
            {open === i &&
              (readOnly ? (
                <div className="px-3 pb-2 font-serif text-[15px] whitespace-pre-wrap">{f.text}</div>
              ) : (
                <textarea
                  className="input font-serif text-[15px] min-h-28 rounded-none border-x-0 border-b-0"
                  value={f.text}
                  aria-label={`${f.name} text`}
                  onChange={(e) => set(i, { text: e.target.value })}
                />
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FeaturesTab({
  s,
  put,
  level,
  cls,
  speciesRules,
  readOnly,
}: {
  s: Sheet;
  put: (p: Partial<Sheet>) => void;
  level: number;
  cls: string;
  speciesRules: string | null;
  readOnly?: boolean;
}) {
  const text = useLoaded(loadRulesText);
  const info = classInfo(cls);
  const srdClass = !!(text && info && hasClassRules(text, info.name));
  const feats = text ? [...new Set([...ORIGIN_FEATS, ...Object.keys(text.feats)])].sort() : ORIGIN_FEATS;
  return (
    <div className="space-y-6">
      <FeatureList
        title="Class features"
        list={s.classFeatures ?? []}
        onChange={(l) => put({ classFeatures: l })}
        readOnly={readOnly}
        fill={srdClass ? () => put({ classFeatures: merge(s.classFeatures ?? [], classFeaturesFor(text!, info!.name, level, s.subclass)) }) : undefined}
        fillLabel={info ? `${info.name} features to level ${level}` : undefined}
      />
      <FeatureList
        title="Species traits"
        list={s.speciesTraits ?? []}
        onChange={(l) => put({ speciesTraits: l })}
        readOnly={readOnly}
        fill={text && speciesRules && speciesTraitsFor(text, speciesRules).length ? () => put({ speciesTraits: merge(s.speciesTraits ?? [], speciesTraitsFor(text, speciesRules)) }) : undefined}
        fillLabel={speciesRules ? `${speciesRules} traits` : undefined}
      />
      <FeatureList title="Feats" list={s.featList ?? []} onChange={(l) => put({ featList: l })} readOnly={readOnly} addOptions={feats} />
      {(s.features || s.traits || s.feats) && (
        <section className="space-y-2">
          <Rule>Older notes</Rule>
          <p className="text-xs text-dim">Written before features had their own cards. Move them into cards above when you like.</p>
          {(
            [
              ['features', 'Class features'],
              ['traits', 'Species traits'],
              ['feats', 'Feats'],
            ] as const
          )
            .filter(([k]) => s[k])
            .map(([k, label]) => (
              <label key={k} className="block">
                <span className="text-[10px] uppercase tracking-[0.16em] text-dim">{label}</span>
                <textarea className="input min-h-20" value={s[k] ?? ''} disabled={readOnly} onChange={(e) => put({ [k]: e.target.value })} />
              </label>
            ))}
        </section>
      )}
    </div>
  );
}
