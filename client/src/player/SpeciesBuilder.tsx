import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Flower2, Search } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { Md } from './PlayerPages';

/**
 * Species and Classes, laid out like a character builder: pick from the list on the left, read everything about it on
 * the right. Species and classes are two tabs. On a phone the list and the page take turns. The world's own names for
 * the classes (Warrior, Mage and the rest) are listed under the classes.
 */
const TABS = [
  { key: 'species', label: 'Species', types: ['people', 'species', 'culture'] },
  { key: 'classes', label: 'Classes', types: ['calling'] },
] as const;

const CONTINENTS = [
  { key: 'aetheris', label: 'Aetheris', dot: 'bg-arcane' },
  { key: 'kaelmar', label: 'Kaelmar', dot: 'bg-gold' },
  { key: 'ethereal', label: 'Ethereal Realm', dot: 'bg-ink/70' },
];

/** The thirteen classes. Other calling records are the world's names for them. */
const CLASS_NAMES = new Set(['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']);
const isClass = (e: PEntity) => e.type === 'calling' && CLASS_NAMES.has(e.name);
/** What the world calls a class ("Known in the world as a Warrior ..."), for a hint under its name. */
const knownAs = (e: PEntity) => {
  const m = /Known in the world as\*\* ([^,.]+)/.exec(e.summary ?? '');
  if (!m) return null;
  const name = m[1]
    .replace(/@?\[([^\]]+)\](\([^)]*\))?/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^(an?|the) /, '')
    .trim();
  return name && name !== e.name ? name : null;
};

const sortName = (n: string) => n.replace(/^["'“‘\s]+/, '');
const where = (e: PEntity) => CONTINENTS.filter((c) => e.realm === c.key || e.realms?.includes(c.key));

export function SpeciesBuilder({ entities }: { entities: PEntity[] }) {
  const [params, setParams] = useSearchParams();
  // ?tab=callings is the older link to the same tab.
  const tabKey = params.get('tab') === 'callings' ? 'classes' : params.get('tab');
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const inTab = (t: (typeof TABS)[number], e: PEntity) => (t.key === 'classes' ? isClass(e) : (t.types as readonly string[]).includes(e.type));
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      entities
        .filter((e) => inTab(tab, e))
        .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name))),
    [entities, tab, q],
  );
  const pick = params.get('pick');
  const chosen = entities.find((e) => e.id === pick && (tab.types as readonly string[]).includes(e.type));
  // The world's names for the classes (Warrior, Mage and the rest), linked under the class list.
  const worldNames = tab.key === 'classes' ? entities.filter((e) => e.type === 'calling' && !isClass(e)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next))
      if (v == null) p.delete(k);
      else p.set(k, v);
    setParams(p, { replace: true });
  };
  const counts = TABS.map((t) => entities.filter((e) => inTab(t, e)).length);
  const shown = chosen ?? list[0];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl text-gold">Species and Classes</h1>
        <div className="text-sm text-dim mt-1">Who your character is, and what they do. Pick one to read about it.</div>
      </div>
      <div className="flex gap-1 border-b border-line mb-4" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab.key}
            className={`px-4 py-2 -mb-px border-b-2 font-display ${t.key === tab.key ? 'border-gold text-gold' : 'border-transparent text-dim hover:text-ink'}`}
            onClick={() => set({ tab: t.key === 'species' ? null : t.key, pick: null })}
          >
            {t.label} <span className="text-xs opacity-70">{counts[i]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* The list. On a phone it hides while something is picked. */}
        <div className={`${chosen ? 'hidden md:block' : ''} min-w-0`}>
          <label className="relative block mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input w-full pl-8" placeholder={`Find a ${tab.key === 'species' ? 'species' : 'class'}`} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className="panel p-1 md:max-h-[70vh] md:overflow-y-auto" aria-label={tab.label}>
            {list.map((e) => (
              <li key={e.id}>
                <button
                  className={`w-full text-left rounded px-2.5 py-2 flex items-center gap-2 ${shown?.id === e.id ? (chosen ? 'bg-gold/15 text-gold' : 'md:bg-gold/15 md:text-gold hover:bg-white/5') : 'hover:bg-white/5'}`}
                  onClick={() => set({ pick: e.id })}
                  aria-current={shown?.id === e.id}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-display">{e.name}</span>
                    {knownAs(e) && <span className="block truncate text-xs text-dim">called a {knownAs(e)}</span>}
                  </span>
                  {e.bloom && <Flower2 size={13} className="text-gold shrink-0" aria-label="Shaped by the Bloom" />}
                  <span className="flex gap-0.5 shrink-0">
                    {where(e).map((c) => (
                      <span key={c.key} className={`w-1.5 h-1.5 rounded-full ${c.dot}`} title={c.label} />
                    ))}
                  </span>
                </button>
              </li>
            ))}
            {!list.length && <li className="text-sm text-dim p-3">Nothing matches.</li>}
          </ul>
          {worldNames.length > 0 && (
            <div className="mt-3 px-1 text-sm">
              <div className="text-xs uppercase tracking-widest text-dim mb-1">What the world calls them</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {worldNames.map((e) => (
                  <button key={e.id} className={`hover:text-gold ${shown?.id === e.id ? 'text-gold' : 'text-arcane'}`} onClick={() => set({ pick: e.id })}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-dim mt-2 px-1">
            {CONTINENTS.filter((c) => c.key !== 'ethereal' || list.some((e) => where(e).includes(c))).map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} /> {c.label}
              </span>
            ))}
            {tab.key === 'species' && (
              <span className="inline-flex items-center gap-1">
                <Flower2 size={11} className="text-gold" /> Shaped by the Bloom
              </span>
            )}
          </div>
        </div>
        {/* The page. On a phone it only shows once something is picked. */}
        <div className={`${chosen ? '' : 'hidden md:block'} min-w-0`}>{shown ? <Detail entry={shown} onBack={() => set({ pick: null })} /> : <p className="text-dim">Nothing here yet.</p>}</div>
      </div>
    </div>
  );
}

function Detail({ entry, onBack }: { entry: PEntity; onBack: () => void }) {
  const { source, base } = usePlayer();
  const { byId } = usePlayerIndex();
  // The index may hold only the summary; the full entry has every section.
  const { data } = usePlayerData<PEntity | null>(() => source.entity(entry.id), entry.id);
  const e = { ...entry, ...(data ?? {}), realms: entry.realms, bloom: entry.bloom ?? data?.bloom };
  const places = where(e);
  return (
    <article className="panel p-5 space-y-3">
      <button className="md:hidden text-sm text-arcane inline-flex items-center gap-1" onClick={onBack}>
        <ArrowLeft size={13} /> All {e.type === 'calling' ? 'classes' : 'species'}
      </button>
      <div>
        <h2 className="text-3xl text-gold font-display">{e.name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {places.map((c) => (
            <span key={c.key} className="chip border-line text-ink inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} /> {c.label}
            </span>
          ))}
          {e.bloom && (
            <span className="chip border-gold/60 text-gold inline-flex items-center gap-1.5" title="The spore-storms of the Bloom in Kaelmar rewrote this people.">
              <Flower2 size={12} /> Shaped by the Bloom
            </span>
          )}
        </div>
      </div>
      {e.summary && <Md text={e.summary} />}
      {e.sections?.map((s) => (
        <Md key={s.heading} text={`## ${s.heading}\n\n${s.content}`} />
      ))}
      {!e.summary && !e.sections?.length && <p className="text-dim">You know of them, but little more.</p>}
      {byId.has(e.id) && (
        <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="text-sm text-arcane inline-flex items-center gap-1">
          Open the full page <ArrowRight size={13} />
        </Link>
      )}
    </article>
  );
}
