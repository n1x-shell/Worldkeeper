import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Printer, RotateCcw, Wand2 } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { generateNames } from '../../../shared/names';

/**
 * The character builder: a people, a class and subclass, a background, a place to start and ties to the world, one
 * step at a time, ending in a one-page summary to print or bring to session zero. Everything comes from the handbook
 * itself, so it works in the published handbook too. Choices are kept in this browser only.
 */
const CLASS_NAMES = ['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const PHB_BACKGROUNDS = ['Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide', 'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer'];
const STEPS = ['People', 'Class', 'Background', 'Start', 'Ties', 'Summary'] as const;
const KEY = 'wk.player.builder';

interface Choice {
  name: string;
  pronouns: string;
  people: string;
  cls: string;
  subclass: string;
  background: string;
  start: string;
  hometown: string;
  faction: string;
  family: string;
  rival: string;
  debt: string;
  notes: string;
}
const EMPTY: Choice = { name: '', pronouns: '', people: '', cls: '', subclass: '', background: '', start: '', hometown: '', faction: '', family: '', rival: '', debt: '', notes: '' };

const plain = (md: string) =>
  md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*+/g, '')
    .trim();

interface Background {
  name: string;
  who: string;
  skills: string;
  tool: string;
  feat: string;
  from: string;
}

/** Background rows from the handbook's background tables. */
function backgroundsFrom(entities: PEntity[]): Background[] {
  const out: Background[] = [];
  for (const e of entities) {
    const text = [e.summary, ...(e.sections ?? []).map((s) => s.content)].join('\n');
    const at = text.indexOf('| Background | Who you were |');
    if (at < 0) continue;
    const from = e.name.replace(/ Backgrounds$/, '').replace('Character Options and', 'Kaelmar');
    for (const line of text.slice(at).split('\n').slice(2)) {
      if (!line.startsWith('|')) break;
      const c = line
        .split('|')
        .slice(1, -1)
        .map((x) => plain(x));
      if (c.length >= 5) out.push({ name: c[0], who: c[1], skills: c[2], tool: c[3], feat: c[4], from });
    }
  }
  return out;
}

/** Subclasses from a class page: "- Paths…, … *(PHB 2024)*; … *(Xanathar's)*", with the world's name for each group. */
function subclassesFrom(summary: string) {
  const out: { name: string; book: string; known: string | null }[] = [];
  const list = summary.split('**Subclasses.**')[1] ?? '';
  for (const line of list.split('\n')) {
    if (!line.startsWith('- ') || !line.includes('*(')) continue;
    let rest = line.slice(2);
    let known: string | null = null;
    const label = /^([A-Z][a-z]+s): /.exec(rest);
    if (label) {
      known = label[1].replace(/s$/, '');
      rest = rest.slice(label[0].length);
    }
    for (const seg of rest.split(';')) {
      const m = /(.*?)\s*\*\(([^)]+)\)\*/.exec(seg);
      if (!m) continue;
      for (const n of m[1]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean))
        out.push({ name: n, book: m[2], known });
    }
  }
  return out;
}

function useSaved(): [Choice, (c: Choice) => void] {
  const [c, setC] = useState<Choice>(() => {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Choice>) };
    } catch {
      return EMPTY;
    }
  });
  const save = (next: Choice) => {
    setC(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* kept for this visit only */
    }
  };
  return [c, save];
}

export function CharacterBuilder() {
  const { entities } = usePlayerIndex();
  const { source, base } = usePlayer();
  const [c, save] = useSaved();
  const [step, setStep] = useState(0);
  const set = (patch: Partial<Choice>) => save({ ...c, ...patch });
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [step]);

  // Full entries for the pages the builder reads (the index may hold only summaries).
  const tables = useMemo(() => (entities ?? []).filter((e) => /Backgrounds$|^Character Options and Backgrounds$|^Type Builds/.test(e.name)), [entities]);
  const { data: full } = usePlayerData(() => Promise.all(tables.map((e) => source.entity(e.id))), tables.map((e) => e.id).join(','));
  const fullTables = (full ?? []).filter((x): x is PEntity => !!x);
  const peoples = useMemo(() => (entities ?? []).filter((e) => ['people', 'species', 'culture'].includes(e.type)).sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const classes = useMemo(() => (entities ?? []).filter((e) => e.type === 'calling' && CLASS_NAMES.includes(e.name)).sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const factions = useMemo(() => (entities ?? []).filter((e) => e.type === 'faction' || e.type === 'cult').sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const backgrounds = useMemo(() => backgroundsFrom(fullTables), [fullTables]);
  const starts = useMemo(() => {
    const t = fullTables.map((e) => e.summary).find((s) => s.includes('| Start in |')) ?? '';
    return t
      .slice(t.indexOf('| Start in |'))
      .split('\n')
      .slice(2)
      .filter((l) => l.startsWith('|'))
      .map((l) => l.split('|').slice(1, -1).map(plain))
      .map(([where, what]) => ({ where, what }));
  }, [fullTables]);
  const people = peoples.find((p) => p.name === c.people);
  const cls = classes.find((x) => x.name === c.cls);
  const { data: clsFull } = usePlayerData(() => (cls ? source.entity(cls.id) : Promise.resolve(null)), cls?.id ?? '');
  const subclasses = useMemo(() => subclassesFrom(clsFull?.summary ?? cls?.summary ?? ''), [clsFull, cls]);
  const knownAs =
    subclasses.find((s) => s.name === c.subclass)?.known ?? /Known in the world as\*\* (?:an? |the )?(?:\[|\*\*)?([A-Z][A-Za-z ]+?)(?:\]|\*\*|[,.])/.exec(cls?.summary ?? '')?.[1] ?? null;
  const bg = backgrounds.find((b) => b.name === c.background);

  const suggestName = () => {
    const seeds =
      /Common names[.:]*\**\s*([^\n]+)/i
        .exec(people?.summary ?? '')?.[1]
        ?.replace(/\.$/, '')
        .split(',')
        .map((s) => s.trim()) ?? [];
    const used = new Set(
      (entities ?? []).flatMap((e) =>
        e.name
          .split(/[\s"“”'’,()]+/)
          .filter((w) => w.length >= 3)
          .map((w) => w.toLowerCase()),
      ),
    );
    const [n] = generateNames({ seeds, people: people?.name ?? '', used, count: 1, seed: Date.now() });
    if (n) set({ name: n });
  };

  if (!entities) return null;
  const summary = [
    `# ${c.name || 'Unnamed'}`,
    c.pronouns && `Pronouns: ${c.pronouns}`,
    c.people && `People: ${c.people}`,
    c.cls && `Class: ${c.cls}${c.subclass ? ` (${c.subclass})` : ''}${knownAs ? `, known in the world as a ${knownAs}` : ''}`,
    c.background && `Background: ${c.background}${bg ? ` (${bg.skills}; ${bg.tool}; ${bg.feat})` : ''}`,
    c.start && `Starts in: ${c.start}`,
    c.hometown && `Hometown: ${c.hometown}`,
    c.faction && `Faction: ${c.faction}`,
    c.family && `Family: ${c.family}`,
    c.rival && `Rival: ${c.rival}`,
    c.debt && `Owes: ${c.debt}`,
    c.notes && `\n${c.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

  const Option = ({ on, title, sub, onClick }: { on: boolean; title: string; sub?: string; onClick: () => void }) => (
    <button className={`panel p-3 text-left w-full hover:border-gold/60 ${on ? 'border-gold bg-gold/10' : ''}`} onClick={onClick} aria-pressed={on}>
      <div className="font-display text-gold">{title}</div>
      {sub && <div className="text-xs text-dim mt-1 line-clamp-2">{sub}</div>}
    </button>
  );
  const tagline = (e?: PEntity) => /^\*([^*\n]+)\*/.exec(e?.summary?.trim() ?? '')?.[1] ?? '';

  return (
    <div className="space-y-5 print:space-y-2">
      <div className="print:hidden">
        <h1 className="text-2xl text-gold">Make a Character</h1>
        <p className="text-sm text-dim mt-1">One step at a time: who you are, what you do, where you're from and where you start. Your choices stay in this browser.</p>
      </div>
      <ol className="flex flex-wrap gap-1 print:hidden" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button className={`chip ${i === step ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setStep(i)} aria-current={i === step}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Choose a people</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {peoples.map((p) => (
              <Option key={p.id} on={c.people === p.name} title={p.name} sub={tagline(p)} onClick={() => set({ people: p.name })} />
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="section-title">Choose a class</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((x) => (
              <Option key={x.id} on={c.cls === x.name} title={x.name} sub={tagline(x)} onClick={() => set({ cls: x.name, subclass: '' })} />
            ))}
          </div>
          {cls && subclasses.length > 0 && (
            <>
              <h3 className="section-title pt-2">And a subclass (you choose it at level 3)</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subclasses.map((s) => (
                  <Option key={s.name} on={c.subclass === s.name} title={s.name} sub={`${s.book}${s.known ? `. Called a ${s.known}` : ''}`} onClick={() => set({ subclass: s.name })} />
                ))}
              </div>
              <p className="text-xs text-dim">Subclasses from Xanathar's and Tasha's were written for the 2014 rules: check with your GM.</p>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="section-title">Choose a background</h2>
          {['Aetheris', 'Kaelmar', 'Ethereal'].map((from) => {
            const list = backgrounds.filter((b) => b.from === from);
            if (!list.length) return null;
            return (
              <div key={from} className="space-y-2">
                <h3 className="text-sm text-dim uppercase tracking-widest">{from === 'Ethereal' ? 'The Ethereal Realm' : from}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((b) => (
                    <Option key={b.name} on={c.background === b.name} title={b.name} sub={`${b.who} ${b.skills}; ${b.tool}; ${b.feat}.`} onClick={() => set({ background: b.name })} />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="space-y-2">
            <h3 className="text-sm text-dim uppercase tracking-widest">From the Player's Handbook</h3>
            <div className="flex flex-wrap gap-1">
              {PHB_BACKGROUNDS.map((b) => (
                <button key={b} className={`chip ${c.background === b ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => set({ background: b })}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h2 className="section-title">Choose where you start</h2>
          <p className="text-sm text-dim">The whole group starts together. Agree on this one with the others.</p>
          <div className="grid gap-2 md:grid-cols-3">
            {starts.map((s) => (
              <Option key={s.where} on={c.start === s.where} title={s.where} sub={s.what} onClick={() => set({ start: s.where })} />
            ))}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3 max-w-2xl">
          <h2 className="section-title">Name and ties</h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_10rem] items-end">
            <label className="block">
              <span className="text-xs text-dim">Name</span>
              <input className="input w-full" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <button className="btn" onClick={suggestName} disabled={!people} title={people ? `A ${people.name} name nobody in the world has` : 'Choose a people first'}>
              <Wand2 size={14} /> Suggest
            </button>
            <label className="block">
              <span className="text-xs text-dim">Pronouns</span>
              <input className="input w-full" value={c.pronouns} onChange={(e) => set({ pronouns: e.target.value })} placeholder="she/her" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-dim">Hometown</span>
            <input className="input w-full" value={c.hometown} onChange={(e) => set({ hometown: e.target.value })} placeholder="Anywhere in the handbook, or somewhere that no longer exists" />
          </label>
          <label className="block">
            <span className="text-xs text-dim">A faction you have ties to</span>
            <select className="input w-full" value={c.faction} onChange={(e) => set({ faction: e.target.value })}>
              <option value="">None</option>
              {factions.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ['family', 'Family', 'Who they are, and whether they still talk to you'],
              ['rival', 'A rival', 'Someone who wants what you want'],
              ['debt', 'A debt', 'Who you owe, and what'],
            ] as const
          ).map(([k, label, ph]) => (
            <label key={k} className="block">
              <span className="text-xs text-dim">{label}</span>
              <input className="input w-full" value={c[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
            </label>
          ))}
          <label className="block">
            <span className="text-xs text-dim">Anything else your GM should know</span>
            <textarea className="input w-full min-h-24" value={c.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 print:hidden">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(summary)}>
              <Copy size={14} /> Copy as text
            </button>
            <button className="btn-ghost ml-auto" onClick={() => (save(EMPTY), setStep(0))}>
              <RotateCcw size={14} /> Start again
            </button>
          </div>
          <article className="parchment p-6 space-y-3 font-serif text-[15px] max-w-2xl print:max-w-none print:shadow-none">
            <h2 className="font-display text-3xl">{c.name || 'Unnamed'}</h2>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
              {(
                [
                  ['Pronouns', c.pronouns],
                  ['People', c.people],
                  ['Class', c.cls && `${c.cls}${c.subclass ? ` (${c.subclass})` : ''}`],
                  ['Known as', knownAs && c.cls ? `a ${knownAs}` : ''],
                  ['Background', c.background],
                  ['Skills, tool, feat', bg ? `${bg.skills}; ${bg.tool}; ${bg.feat}` : ''],
                  ['Starts in', c.start],
                  ['Hometown', c.hometown],
                  ['Faction', c.faction],
                  ['Family', c.family],
                  ['Rival', c.rival],
                  ['Owes', c.debt],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-xs uppercase tracking-wider opacity-70 pt-1">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {bg?.who && <p className="italic">{bg.who}</p>}
            {c.notes && <p className="whitespace-pre-wrap">{c.notes}</p>}
            <p className="text-xs opacity-60 pt-2">Made with the character builder. Bring this to your first session.</p>
          </article>
          <p className="text-sm text-dim print:hidden">
            Read more:{' '}
            {[people, cls].filter(Boolean).map((e, i) => (
              <span key={e!.id}>
                {i > 0 && ', '}
                <Link to={`${base}/e/${encodeURIComponent(e!.id)}`} className="text-arcane">
                  {e!.name}
                </Link>
              </span>
            ))}
          </p>
        </section>
      )}

      <div className="flex justify-between print:hidden">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 && (
          <button className="btn" onClick={() => setStep(step + 1)}>
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
