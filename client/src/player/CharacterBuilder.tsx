import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Copy, Printer, RotateCcw, Search, Send, UserPlus } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity } from './source';
import { generateNames } from '../../../shared/names';
import { ABILITY_NAMES, ORIGIN_FEATS, classInfo } from '../../../shared/rules2024';
import { backgroundsFrom, classesFrom, isBackgroundTable, loadRulesText, loadSpells, peoplesFrom, subclassChoices, useLoaded } from './sheet/options';
import { PrintSheet } from './sheet/PrintSheet';
import { SRD_ATTRIBUTION } from './sheet/FullSheet';
import { EMPTY_BUILD, backgroundFor, buildSheet, type Build } from './builder/compute';
import { ChoiceCard, Group, STEPS, StepCard, StepNav, Stepper, cardGrid, plain, progress } from './builder/parts';
import { MobileSummary, Preview } from './builder/Preview';
import { AbilitiesStep, BackgroundStep, DetailsStep, EquipmentStep, SkillsStep, SpellsStep, TiesStep, type Nav } from './builder/steps';
import { ask, askText, toast } from '../components/ui/overlays';
import { Empty, Loading } from '../components/ui/feedback';

/**
 * The character builder: a complete D&D 2024 character at any level, one step at a time, with the sheet building
 * itself alongside. Peoples, classes, subclasses and backgrounds come from the handbook; the rules (class tables,
 * spells, features, species traits, feats) from the SRD 5.2.1. It works in the published handbook too, and on the
 * table server it can send the finished build to the player's sheet. Choices are kept in this browser only.
 */
const KEY = 'wk.player.builder';

function useSaved(): [Build, (c: Build) => void] {
  const [c, setC] = useState<Build>(() => {
    try {
      const old = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Build> & { cls?: string };
      return { ...EMPTY_BUILD, ...old, base: { ...EMPTY_BUILD.base, ...old.base } };
    } catch {
      return EMPTY_BUILD;
    }
  });
  const save = (next: Build) => {
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
  const [b, save] = useSaved();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const set = (patch: Partial<Build>) => save({ ...b, ...patch });
  useEffect(() => {
    // The player layout scrolls its main column, not the window.
    window.scrollTo?.(0, 0);
    document.getElementById('main')?.scrollTo?.(0, 0);
  }, [step]);

  const tables = useMemo(() => (entities ?? []).filter(isBackgroundTable), [entities]);
  const { data: full } = usePlayerData(() => Promise.all(tables.map((e) => source.entity(e.id))), tables.map((e) => e.id).join(','));
  const fullTables = useMemo(() => (full ?? []).filter((x): x is PEntity => !!x), [full]);
  const peoples = useMemo(() => peoplesFrom(entities ?? []), [entities]);
  const classes = useMemo(() => classesFrom(entities ?? []), [entities]);
  const world = useMemo(() => backgroundsFrom(fullTables), [fullTables]);
  const factions = useMemo(() => (entities ?? []).filter((e) => e.type === 'faction' || e.type === 'cult').sort((a, b) => a.name.localeCompare(b.name)), [entities]);
  const starts = useMemo(() => {
    const t = fullTables.map((e) => e.summary).find((s) => s.includes('| Start in |')) ?? '';
    return t
      .slice(t.indexOf('| Start in |'))
      .split('\n')
      .slice(2)
      .filter((l) => l.startsWith('|'))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((x) =>
            x
              .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
              .replace(/\*+/g, '')
              .trim(),
          ),
      )
      .map(([where, what]) => ({ where, what }));
  }, [fullTables]);
  const text = useLoaded(loadRulesText);
  const spells = useLoaded(loadSpells);
  // Species in the rules packs that no people of the world is named for, to play as themselves.
  const otherSpecies = useMemo(
    () =>
      Object.keys(text?.species ?? {})
        .filter((x) => !peoples.some((p) => p.name.toLowerCase() === x.toLowerCase()))
        .sort(),
    [text, peoples],
  );
  const people = useMemo(
    () =>
      peoples.find((p) => p.name === b.people) ??
      (otherSpecies.includes(b.people) ? { id: null as string | null, name: b.people, plural: b.people, tagline: '', rules: b.people, atTable: '', summary: '' } : undefined),
    [peoples, otherSpecies, b.people],
  );
  const cls = classes.find((x) => x.name === b.cls);
  const info = classInfo(b.cls);
  const bg = backgroundFor(b, world, text);
  const sheet = useMemo(() => buildSheet(b, { world, speciesRules: people?.rules ?? null, text, spells }), [b, world, people, text, spells]);

  const suggestName = () => {
    const seeds =
      /Common names[.:]*\**\s*([^\n]+)/i
        .exec(people?.summary ?? '')?.[1]
        ?.replace(/\.$/, '')
        .split(',')
        .map((s) => s.replace(/\*+/g, '').trim()) ?? [];
    const used = new Set(
      (entities ?? []).flatMap((e) =>
        e.name
          .split(/[\s"“”'’,()]+/)
          .filter((w) => w.length >= 3)
          .map((w) => w.toLowerCase()),
      ),
    );
    const [n] = generateNames({ seeds, people: people?.plural ?? '', used, count: 1, seed: Date.now() });
    if (n) set({ name: n });
  };

  // On the table server: fill in the player's character sheet from this build (with the code from My Character).
  const sendToSheet = async () => {
    let code = '';
    try {
      code = localStorage.getItem('wk.player.me') ?? '';
    } catch {
      /* private window */
    }
    if (!code) code = ((await askText({ title: 'Your character code', label: 'The code from your GM', confirmLabel: 'Continue' })) ?? '').trim().toUpperCase();
    if (!code || !source.myPage || !source.saveMyPage) return;
    const page = await source.myPage(code);
    if (!page) return toast(`No character has the code ${code}. Check it with your GM.`, 'danger');
    if (
      !(await ask({
        title: `Replace ${page.name}'s sheet?`,
        body: `Everything on the sheet is replaced with this build (your GM's notes and your character page are kept). The level stays ${page.level}, as your GM set it.`,
        confirmLabel: 'Replace the sheet',
      }))
    )
      return;
    const built = b.level === page.level ? sheet : buildSheet({ ...b, level: page.level }, { world, speciesRules: people?.rules ?? null, text, spells });
    const { portrait, ...rest } = built.sheet;
    await source.saveMyPage(code, { character: { name: built.name, species: built.species, class_name: built.class_name, sheet: rest } });
    if (portrait && source.myPortrait) await source.myPortrait(code, portrait);
    void navigate(`${base}/me/${code}`);
  };

  // In the GM's own app: save the build straight into a campaign's Party and Characters.
  const [gm, setGm] = useState<{ campaigns: { id: number; title: string }[]; active: number | null } | null>(null);
  const [gmCampaign, setGmCampaign] = useState<number | null>(null);
  const [gmState, setGmState] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => {
    let live = true;
    void source
      .gmCampaigns?.()
      .then((g) => {
        if (!live || !g) return;
        setGm(g);
        setGmCampaign(g.active ?? g.campaigns[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [source]);
  const saveToParty = async () => {
    if (!gmCampaign || !source.gmSaveCharacter) return;
    setGmState({ busy: true });
    try {
      const { portrait, ...rest } = sheet.sheet as Record<string, unknown> & { portrait?: string };
      const id = await source.gmSaveCharacter(gmCampaign, { name: sheet.name, species: sheet.species, class_name: sheet.class_name, level: sheet.level, sheet: rest }, portrait || undefined);
      if (gmCampaign !== gm?.active) await fetch('/api/campaigns/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: gmCampaign }) });
      void navigate(`/campaign/party?character=${id}`);
    } catch (x) {
      setGmState({ error: (x as Error).message });
    }
  };

  const stepTo = (i: number) => setStep(i);
  const [pq, setPq] = useState('');
  const match = (n: string) => !pq || n.toLowerCase().includes(pq.trim().toLowerCase());
  if (!entities)
    return (
      <div className="panel">
        <Loading label="Opening the character builder…" lines={4} />
      </div>
    );
  const { todo, done } = progress(b, sheet, !bg || bg.fixed);
  const nav: Nav = { step, onBack: () => stepTo(step - 1), onNext: () => stepTo(step + 1) };
  const doneCount = done.filter(Boolean).length;
  const readMore = [people?.id ? { id: people.id, name: people.plural } : null, cls?.id ? { id: cls.id, name: cls.name } : null].filter((x): x is { id: string; name: string } => !!x);

  return (
    <div className="space-y-5 print:space-y-0">
      <header className="title-band elev-1 print:hidden px-4! py-4! sm:px-6! sm:py-5!">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-72">
            <div className="section-title">My Character</div>
            <h1 className="illuminated mt-1 text-[26px] sm:text-[30px] leading-tight text-ink">Make a Character</h1>
            <p className="mt-2 text-sm text-dim max-w-[72ch]">A complete D&D 2024 character, one step at a time. The sheet fills itself in as you go. Your choices stay in this browser.</p>
          </div>
          <div className="flex w-full sm:w-auto items-end justify-between gap-4 border-t border-line pt-3 sm:border-0 sm:pt-0">
            <div className="sm:text-right">
              <div className="label mb-0.5!">Progress</div>
              <div className="num text-sm text-ink">
                <b className="font-semibold">{doneCount}</b> of {STEPS.length} steps
              </div>
            </div>
            <label className="block">
              <span className="label">Starting level</span>
              <select className="input num w-20 min-h-10 sm:min-h-0" value={b.level} onChange={(e) => set({ level: Number(e.target.value) })} aria-label="Starting level">
                {Array.from({ length: 20 }, (_, i) => (
                  <option key={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>
      <Stepper step={step} done={done} onStep={stepTo} />

      {step !== 9 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_18.5rem]">
          <div className="min-w-0 space-y-4">
            <div className="lg:hidden">
              <MobileSummary b={b} sheet={sheet} todo={todo} onStep={stepTo} />
            </div>
            {step === 0 && (
              <StepCard
                {...nav}
                title={peoples.length ? 'Choose a people' : 'Choose a species'}
                note={peoples.length ? 'Each people of the world plays with one set of species rules. A card names them when they go by another name.' : 'The species in your rules.'}
              >
                {peoples.length + otherSpecies.length > 12 && (
                  <label className="relative block w-full sm:max-w-xs">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
                    <input
                      className="input pl-8 min-h-10 sm:min-h-0"
                      placeholder={peoples.length ? 'Find a people' : 'Find a species'}
                      value={pq}
                      onChange={(e) => setPq(e.target.value)}
                      aria-label="Find a people or species"
                    />
                  </label>
                )}
                {pq && !peoples.some((p) => match(p.name)) && !otherSpecies.some(match) && <Empty compact title={`Nothing matches “${pq}”.`} />}
                {peoples.some((p) => match(p.name)) && (
                  <div className={cardGrid}>
                    {peoples
                      .filter((p) => match(p.name))
                      .map((p) => (
                        <ChoiceCard
                          key={p.id}
                          on={b.people === p.name}
                          title={p.name}
                          sub={plain(p.tagline)}
                          badge={p.rules && p.rules.toLowerCase() !== p.name.toLowerCase() ? p.rules : undefined}
                          onClick={() => set({ people: p.name })}
                        />
                      ))}
                  </div>
                )}
                {!text && !peoples.length && <Loading label="Loading the species in your rules…" lines={3} />}
                {otherSpecies.some(match) && (
                  <Group title={peoples.length ? 'Other species in your rules' : 'Species'}>
                    <div className={cardGrid}>
                      {otherSpecies.filter(match).map((x) => (
                        <ChoiceCard key={x} on={b.people === x} title={x} sub={text?.species[x]?.source ?? ''} onClick={() => set({ people: x })} />
                      ))}
                    </div>
                  </Group>
                )}
                {text && !peoples.length && !otherSpecies.length && <Empty compact title="No species yet. Your GM hasn't shared any peoples, and there are no rules to draw on." />}
              </StepCard>
            )}

            {step === 1 && (
              <StepCard {...nav} title="Choose a class" note="Your class is what you do: how you fight, what you're good at, and whether you cast spells.">
                <div className={cardGrid}>
                  {classes.map((x) => {
                    const ci = classInfo(x.name)!;
                    return (
                      <ChoiceCard
                        key={x.name}
                        on={b.cls === x.name}
                        title={x.name}
                        badge={`d${ci.hitDie}`}
                        sub={
                          <>
                            {x.tagline && <span className="block">{plain(x.tagline)}</span>}
                            <span className="block">
                              {ci.primary}. Saves: {ci.saves.map((a) => ABILITY_NAMES[a]).join(', ')}.{ci.caster ? ` Casts with ${ABILITY_NAMES[ci.spellAbility!]}.` : ''}
                            </span>
                          </>
                        }
                        onClick={() => set({ cls: x.name, subclass: '', classSkills: [], expertise: [], spells: [], classKit: 0 })}
                      />
                    );
                  })}
                </div>
                {info?.outsideSrd && (
                  <p className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-ink">
                    The {info.name} isn&apos;t in the SRD: the builder fills in its basics, and you add its features and spells from your book.
                  </p>
                )}
                {cls && (
                  <Group title={`${cls.name} subclass`} note={b.level < 3 ? 'You choose a subclass at level 3. You can pick one now to plan ahead.' : undefined}>
                    <div className={cardGrid}>
                      {subclassChoices(cls, text, cls.name).map((s) => (
                        <ChoiceCard
                          key={s.name}
                          on={b.subclass === s.name}
                          title={s.name}
                          sub={`${s.book}${s.known ? `. Known in the world as a ${s.known}` : ''}`}
                          onClick={() => set({ subclass: s.name })}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-dim max-w-[72ch]">
                      The SRD has the rules text for one subclass per class ({info?.srdSubclass ?? 'none for this class'}). For the others, add their features from your book. Subclasses from
                      Xanathar&apos;s and Tasha&apos;s were written for the 2014 rules: check with your GM.
                    </p>
                  </Group>
                )}
              </StepCard>
            )}

            {step === 2 && <BackgroundStep b={b} set={set} world={world} rules={text} nav={nav} />}
            {step === 3 && <AbilitiesStep b={b} set={set} feats={text ? [...new Set([...ORIGIN_FEATS, ...Object.keys(text.feats)])].sort() : ORIGIN_FEATS} nav={nav} />}
            {step === 4 && <SkillsStep b={b} set={set} bgSkills={bg?.skills ?? []} nav={nav} />}
            {step === 5 && <EquipmentStep b={b} set={set} world={world} rules={text} nav={nav} />}
            {step === 6 && <SpellsStep b={b} set={set} srd={spells} nav={nav} />}
            {step === 7 && (
              <DetailsStep b={b} set={set} canSuggest={!!people} suggestTitle={people ? `A ${people.name} name nobody in the world has` : 'Choose a people first'} onSuggest={suggestName} nav={nav} />
            )}
            {step === 8 && <TiesStep b={b} set={set} starts={starts} factions={factions} nav={nav} />}
          </div>
          <div className="hidden lg:block">
            <Preview b={b} sheet={sheet} todo={todo} onStep={stepTo} />
          </div>
        </div>
      ) : (
        <>
          <section className="panel elev-1 gilt-corners p-4 sm:p-6 space-y-5 print:hidden" aria-labelledby="builder-step-title">
            <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-60">
                <div className="text-xs uppercase tracking-[0.18em] text-dim num">
                  Step {STEPS.length} of {STEPS.length}
                </div>
                <h2 id="builder-step-title" className="title-rule mt-1 inline-block pr-6 text-xl sm:text-[22px] text-ink">
                  {b.name ? `${b.name}'s sheet` : 'Your character sheet'}
                </h2>
                <p className="mt-2 text-sm text-dim">Print it, send it to your sheet at the table, or copy it to keep.</p>
              </div>
            </header>
            {todo.length ? (
              <div className="rounded-md border border-warn/40 bg-warn/10 p-3 space-y-2">
                <div className="text-sm text-ink">
                  <b className="font-semibold num">{todo.length}</b> {todo.length === 1 ? 'thing' : 'things'} still to choose. Tap one to go back to it.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {todo.map((t) => (
                    <button key={t.what} className="btn min-h-10 sm:min-h-0" onClick={() => stepTo(t.step)}>
                      {t.what[0].toUpperCase() + t.what.slice(1)} <span className="text-xs text-dim">· {STEPS[t.step]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 p-3 text-sm text-ok">
                <Check size={15} /> Complete. Print it, or send it to your sheet.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 *:min-h-10 sm:*:min-h-0">
              <button className="btn-primary" onClick={() => window.print()}>
                <Printer size={14} /> Print the sheet
              </button>
              {source.saveMyPage && (
                <button className="btn" onClick={() => void sendToSheet()}>
                  <Send size={14} /> Send to my sheet
                </button>
              )}
              {gm &&
                (gm.campaigns.length ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <button
                      className="btn min-h-10 sm:min-h-0"
                      disabled={gmState.busy || !gmCampaign}
                      onClick={() => void saveToParty()}
                      title="Add this character to the campaign's Party and Characters (GM only)"
                    >
                      <UserPlus size={14} /> {gmState.busy ? 'Saving…' : 'Save to Party and Characters'}
                    </button>
                    {gm.campaigns.length > 1 && (
                      <select className="input w-auto min-h-10 sm:min-h-0" value={gmCampaign ?? ''} onChange={(e) => setGmCampaign(Number(e.target.value))} aria-label="Campaign">
                        {gm.campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-dim">Make a campaign to save characters to its party.</span>
                ))}
              <button
                className="btn"
                onClick={() =>
                  void navigator.clipboard?.writeText(JSON.stringify(sheet, null, 2)).then(
                    () => toast('The sheet is copied as text.'),
                    () => toast("Couldn't copy: your browser blocked it.", 'danger'),
                  )
                }
                title="The whole sheet as text, to keep or share"
              >
                <Copy size={14} /> Copy as text
              </button>
              <button
                className="btn-ghost sm:ml-auto"
                onClick={async () => {
                  if (await ask({ title: 'Start again?', body: 'This build is cleared.', danger: true, confirmLabel: 'Start again' })) (save(EMPTY_BUILD), stepTo(0));
                }}
              >
                <RotateCcw size={14} /> Start again
              </button>
            </div>
            {gmState.error && <p className="text-sm text-danger">{gmState.error}</p>}
            {readMore.length > 0 && (
              <p className="text-sm text-dim">
                Read more:{' '}
                {readMore.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ', '}
                    <Link to={`${base}/e/${encodeURIComponent(e.id)}`} data-peek={e.id} className="text-arcane hover:underline">
                      {e.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <StepNav step={step} onBack={nav.onBack} />
          </section>
          <div className="overflow-x-auto print:overflow-visible">
            <PrintSheet value={sheet} portraitUrl={b.portrait || null} />
          </div>
        </>
      )}
      <p className="text-[11px] leading-snug text-dim print:hidden">{SRD_ATTRIBUTION}</p>
    </div>
  );
}
