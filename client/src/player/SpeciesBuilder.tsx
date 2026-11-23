import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Flower2, Search } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { Md } from './PlayerPages';
import { Badge, RealmBadge } from '../components/ui/badges';
import { Tabs } from '../components/ui/inputs';
import { Empty, Loading } from '../components/ui/feedback';
import { realmClass, useRealms } from '../components/realms';
import { handbookTypesWith } from './categories';
import { CLASSES } from '../../../shared/rules2024';
import { loadRulesText, useLoaded } from './sheet/options';
import type { RulesView } from '../../../shared/rulesView';

/**
 * Species and Classes, laid out like a character builder: pick from the list on the left, read everything about it on
 * the right. Species and classes are two tabs. On a phone the list and the page take turns.
 *
 * The classes are the ones in the rules in use (the SRD, the GM's books and published open rules). A class with a page
 * of its own in the handbook (a setting's calling record) shows that page; the others show what the rules say. The
 * world's own names for the classes (Warrior, Mage and the rest) are listed under them.
 */
const TABS = [
  { key: 'species', label: 'Species', types: handbookTypesWith('folk') },
  { key: 'classes', label: 'Classes', types: ['calling'] },
] as const;

/** The 2024 classes the sheet knows. Other calling records are the world's names for them. */
const CLASS_NAMES = new Set(CLASSES.map((c) => c.name));
const isClass = (e: PEntity) => e.type === 'calling' && CLASS_NAMES.has(e.name);
const lower = (s: string) => s.toLowerCase();

/** The classes to list: those in the rules in use, and any with a page in the handbook, in name order. */
function classList(entities: PEntity[], rules: RulesView | null): { name: string; entity?: PEntity }[] {
  const names = new Map<string, string>();
  for (const n of Object.keys(rules?.classes ?? {})) if (rules!.classes[n].features.length || Object.keys(rules!.classes[n].subclasses).length) names.set(lower(n), n);
  for (const e of entities) if (isClass(e)) names.set(lower(e.name), e.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, entity: entities.find((e) => isClass(e) && lower(e.name) === lower(name)) }));
}
/** A class picked from the rules (it has no handbook page) is linked as ?pick=class:Name. */
const RULE_PICK = 'class:';
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
/** The continents and planes a people or calling is found in, in the library's order, each with its colour dot. */
function useWhere() {
  const realms = useRealms();
  const places = realms.list.filter((r) => r.kind !== 'world' && !r.archived).map((r) => ({ key: r.id, label: r.name, dot: `${realmClass(r)} bg-realm` }));
  return { places, where: (e: PEntity) => places.filter((c) => e.realm === c.key || !!e.realms?.includes(c.key)) };
}

export function SpeciesBuilder({ entities }: { entities: PEntity[] }) {
  const { base } = usePlayer();
  const { places: CONTINENTS, where } = useWhere();
  const [params, setParams] = useSearchParams();
  // ?tab=callings is the older link to the same tab.
  const tabKey = params.get('tab') === 'callings' ? 'classes' : params.get('tab');
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const inTab = (t: (typeof TABS)[number], e: PEntity) =>
    t.key === 'classes' ? isClass(e) : handbookTypesWith('folk').includes(e.type);
  const [q, setQ] = useState('');
  const rules = useLoaded(loadRulesText);
  const classes = useMemo(() => classList(entities, rules), [entities, rules]);
  const list = useMemo(
    () =>
      entities
        .filter((e) => inTab(tab, e))
        .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name))),
    [entities, tab, q],
  );
  const pick = params.get('pick');
  const chosen = entities.find((e) => e.id === pick && (tab.key === 'species' ? handbookTypesWith('folk') : (tab.types as readonly string[])).includes(e.type));
  // The world's names for the classes (Warrior, Mage and the rest), linked under the class list.
  const worldNames = tab.key === 'classes' ? entities.filter((e) => e.type === 'calling' && !isClass(e)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next))
      if (v == null) p.delete(k);
      else p.set(k, v);
    setParams(p, { replace: true });
  };
  const counts = TABS.map((t) => (t.key === 'classes' ? classes.length : entities.filter((e) => inTab(t, e)).length));
  const shown = chosen ?? list[0];
  // The classes tab lists every class in the rules, each with its handbook page if it has one.
  const ruleClasses = classes.filter((c) => !q || lower(c.name).includes(lower(q)));
  const pickedRule = pick?.startsWith(RULE_PICK) ? classes.find((c) => c.name === pick.slice(RULE_PICK.length)) : undefined;
  const shownClass = tab.key === 'classes' ? (pickedRule ?? (chosen ? undefined : ruleClasses[0])) : undefined;
  const picked = !!chosen || !!pickedRule;

  return (
    <div className="space-y-5">
      <header className="title-band elev-1 !px-4 !py-4 sm:!px-6 sm:!py-5">
        <div className="section-title">Peoples and classes</div>
        <h1 className="illuminated mt-1 text-[26px] sm:text-[30px] leading-tight text-ink">Species and Classes</h1>
        <p className="mt-2 text-sm text-dim max-w-[72ch]">
          Who your character is, and what they do. Pick one to read about it, or{' '}
          <Link to={`${base}/builder`} className="text-arcane hover:underline">
            make a character
          </Link>{' '}
          step by step.
        </p>
      </header>
      <Tabs
        tabs={TABS.map((t, i) => ({
          id: t.key,
          label: (
            <span className="inline-flex items-center gap-1.5 font-display tracking-wide">
              {t.label} <span className="num text-xs text-dim">{counts[i]}</span>
            </span>
          ),
        }))}
        value={tab.key}
        onChange={(k) => set({ tab: k === 'species' ? null : k, pick: null })}
      />
      <div className="grid gap-5 md:grid-cols-[17rem_minmax(0,1fr)]">
        {/* The list. On a phone it hides while something is picked. */}
        <div className={`${picked ? 'hidden md:block' : ''} min-w-0 space-y-3`}>
          <label className="relative block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input
              className="input w-full pl-8 min-h-10 sm:min-h-0"
              placeholder={`Find a ${tab.key === 'species' ? 'species' : 'class'}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={`Find a ${tab.key === 'species' ? 'species' : 'class'}`}
            />
          </label>
          <ul className="panel elev-1 p-1 md:max-h-[70vh] md:overflow-y-auto" aria-label={tab.label}>
            {tab.key === 'classes' &&
              ruleClasses.map((c) => {
                const on = c.entity ? (chosen ?? (pickedRule ? undefined : shownClass?.entity))?.id === c.entity.id : shownClass?.name === c.name && !chosen;
                return (
                  <li key={c.name}>
                    <button
                      className={`w-full min-h-10 text-left rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-colors ${on ? 'bg-gold/10 text-gold' : 'hover:bg-raised'}`}
                      onClick={() => set({ pick: c.entity ? c.entity.id : `${RULE_PICK}${c.name}` })}
                      aria-current={on}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-display tracking-wide">{c.name}</span>
                        {c.entity && knownAs(c.entity) && <span className="block truncate text-xs text-dim">called a {knownAs(c.entity)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            {tab.key === 'species' && list.map((e) => {
              const on = shown?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    className={`w-full min-h-10 text-left rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-colors ${on ? (chosen ? 'bg-gold/10 text-gold' : 'md:bg-gold/10 md:text-gold hover:bg-raised') : 'hover:bg-raised'}`}
                    onClick={() => set({ pick: e.id })}
                    aria-current={on}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-display tracking-wide">{e.name}</span>
                      {knownAs(e) && <span className="block truncate text-xs text-dim">called a {knownAs(e)}</span>}
                    </span>
                    {e.bloom && <Flower2 size={13} className="text-gold shrink-0" aria-label="Shaped by the Bloom" />}
                    <span className="flex gap-1 shrink-0">
                      {where(e).map((c) => (
                        <span key={c.key} className={`w-1.5 h-1.5 rounded-full ${c.dot}`} title={c.label} />
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
            {!(tab.key === 'classes' ? ruleClasses.length : list.length) && (
              <li>
                <Empty compact title={q ? `Nothing matches “${q}”.` : `No ${tab.key === 'species' ? 'species' : 'classes'} yet.`} />
              </li>
            )}
          </ul>
          {worldNames.length > 0 && (
            <div className="px-1 text-sm">
              <div className="section-title !text-xs mb-1.5">What the world calls them</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {worldNames.map((e) => (
                  <button key={e.id} className={`min-h-8 hover:text-gold ${shown?.id === e.id ? 'text-gold' : 'text-arcane'}`} onClick={() => set({ pick: e.id })}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-dim px-1">
            {CONTINENTS.filter((c) => list.some((e) => where(e).some((x) => x.key === c.key))).map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5">
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
        <div className={`${picked ? '' : 'hidden md:block'} min-w-0`}>
          {tab.key === 'classes' && !chosen ? (
            shownClass ? (
              shownClass.entity ? (
                <Detail entry={shownClass.entity} onBack={() => set({ pick: null })} />
              ) : (
                <RuleClassDetail name={shownClass.name} rules={rules} onBack={() => set({ pick: null })} />
              )
            ) : (
              <Empty title={rules ? 'No classes yet' : 'Loading the rules…'}>{rules ? 'The rules in use have no classes.' : ''}</Empty>
            )
          ) : shown ? (
            <Detail entry={shown} onBack={() => set({ pick: null })} />
          ) : (
            <Empty title="Nothing here yet">When your GM shares peoples and classes, they appear here.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

/** A class as the rules describe it: its hit die, saves and skills, its features by level, and its subclasses. */
function RuleClassDetail({ name, rules, onBack }: { name: string; rules: RulesView | null; onBack: () => void }) {
  const info = CLASSES.find((c) => lower(c.name) === lower(name));
  const rc = rules ? Object.entries(rules.classes).find(([n]) => lower(n) === lower(name))?.[1] : undefined;
  const byLevel = new Map<number, string[]>();
  for (const f of rc?.features ?? []) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.name]);
  const subs = Object.values(rc?.subclasses ?? {});
  return (
    <article className="panel elev-1 gilt-corners p-4 sm:p-6 space-y-4">
      <button className="md:hidden min-h-10 -mt-1 text-sm text-arcane inline-flex items-center gap-1" onClick={onBack}>
        <ArrowLeft size={14} /> All classes
      </button>
      <header className="border-b border-line pb-4">
        <h2 className="illuminated text-[26px] sm:text-[30px] leading-tight text-ink break-words">{name}</h2>
        {info && (
          <p className="mt-2 text-sm text-dim">
            Hit die d{info.hitDie} · {info.primary} · saves {info.saves.join(' and ')}
          </p>
        )}
      </header>
      <div className="max-w-[72ch] space-y-4 text-sm">
        {info && (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
            <dt className="font-medium">Skills</dt>
            <dd>{info.skillFrom === 'any' ? `Any ${info.skillCount}` : `${info.skillCount} of ${info.skillFrom.join(', ')}`}</dd>
            <dt className="font-medium">Weapons</dt>
            <dd>{info.weapons}</dd>
            {info.tools && (
              <>
                <dt className="font-medium">Tools</dt>
                <dd>{info.tools}</dd>
              </>
            )}
          </dl>
        )}
        {byLevel.size > 0 && (
          <section>
            <h3 className="section-title !text-xs mb-1.5">Features by level</h3>
            <ul className="space-y-0.5">
              {[...byLevel.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([lv, names]) => (
                  <li key={lv}>
                    <span className="num text-dim inline-block w-16 whitespace-nowrap">Level {lv}</span> {names.join(', ')}
                  </li>
                ))}
            </ul>
          </section>
        )}
        {subs.length > 0 && (
          <section>
            <h3 className="section-title !text-xs mb-1.5">Subclasses</h3>
            <ul className="space-y-1.5">
              {subs.map((x) => (
                <li key={x.name}>
                  <span className="font-medium">{x.name}</span>
                  {x.source && <span className="text-xs text-dim"> · {x.source}</span>}
                  {x.about && <span className="block text-dim">{x.about.split('\n')[0]}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!rc && <p className="text-dim italic">The rules in use don't describe this class yet.</p>}
      </div>
    </article>
  );
}

function Detail({ entry, onBack }: { entry: PEntity; onBack: () => void }) {
  const { source, base } = usePlayer();
  const { byId } = usePlayerIndex();
  const { where } = useWhere();
  // The index may hold only the summary; the full entry has every section.
  const { data } = usePlayerData<PEntity | null>(() => source.entity(entry.id), entry.id);
  const e = { ...entry, ...(data ?? {}), realms: entry.realms, bloom: entry.bloom ?? data?.bloom };
  const places = where(e);
  return (
    <article className="panel elev-1 gilt-corners p-4 sm:p-6 space-y-4">
      <button className="md:hidden min-h-10 -mt-1 text-sm text-arcane inline-flex items-center gap-1" onClick={onBack}>
        <ArrowLeft size={14} /> All {e.type === 'calling' ? 'classes' : 'species'}
      </button>
      <header className="border-b border-line pb-4">
        <h2 className="illuminated text-[26px] sm:text-[30px] leading-tight text-ink break-words">{e.name}</h2>
        {(places.length > 0 || e.bloom) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {places.map((c) => (
              <RealmBadge key={c.key} realm={c.key} />
            ))}
            {e.bloom && (
              <Badge tone="gold" icon={<Flower2 size={12} />} title="The spore-storms of the Bloom in Kaelmar rewrote this people.">
                Shaped by the Bloom
              </Badge>
            )}
          </div>
        )}
      </header>
      {!data && !e.summary && <Loading inline label="Opening…" />}
      <div className="max-w-[72ch] space-y-4">
        {e.summary && <Md text={e.summary} />}
        {e.sections?.map((s) => (
          <Md key={s.heading} text={`## ${s.heading}\n\n${s.content}`} />
        ))}
      </div>
      {data !== undefined && !e.summary && !e.sections?.length && <p className="text-dim italic">You know of them, but little more.</p>}
      {byId.has(e.id) && (
        <div className="border-t border-line pt-3">
          <Link to={`${base}/e/${encodeURIComponent(e.id)}`} data-peek={e.id} className="btn min-h-10 sm:min-h-0">
            Open the full page <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </article>
  );
}
