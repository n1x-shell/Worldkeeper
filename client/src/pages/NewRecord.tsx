/**
 * New ▸ anything (docs/OWN_WORLD_PLAN.md §2.4): make a record of any type, guided or advanced, with the choice
 * remembered on this device.
 *
 * - Guided steps through the type's template: the basics (name, where it is, the type's facts as inputs, with pickers
 *   from the rules packs for stat blocks, items, species and classes), then one step per section with its guidance,
 *   example and the editor, each with "Skip for now", then a review of the record as it will read, with its links and
 *   what players can be shown. Create opens it on its page.
 * - Advanced writes the template's Markdown straight in the editor (Split view), header filled in.
 *
 * Both make the same record (shared/newRecord.ts): a skipped section stays as its heading with the guidance in a
 * comment. New records are Canon at once in your own world, Proposed where Canon Review is on (Settings → Canon).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, EyeOff, Plus, SkipForward } from 'lucide-react';
import { CANON_STATUSES } from '@shared/domain';
import { parseRefs } from '@shared/mentions';
import { buildRecord, draftMarkdown, factsFromParent, parseDraft, sectionDrafts, stripComments, toWriteNotes, type SectionDraft } from '@shared/newRecord';
import { api, qs, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { rememberType } from '../lib/recentTypes';
import type { Entity, EntitySummary } from '../lib/types';
import { useRecordTypes } from '../components/recordTypes';
import { useRealms } from '../components/realms';
import { ORIGIN_LABEL, type ClientTemplate } from '../components/TemplatePreview';
import { Badge, Card, EntityLink, ErrorBox, Field, PageHeader, Segmented, TypeBadge } from '../components/ui';
import { AutoTextarea } from '../components/ui/textarea';
import { EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { RulesFactInput, ItemPicker } from '../components/RulesPickers';

type Mode = 'guided' | 'advanced';
const MODE_KEY = 'wk.new.mode';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'guided';
  } catch {
    return 'guided';
  }
};

interface Basics {
  name: string;
  type: string;
  realm: string;
  parent_id: string | null;
  canon_status: string;
}

export function NewRecord() {
  const recordTypes = useRecordTypes();
  const realms = useRealms();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { reloadIndex, index, canonReview, mentions } = useAppState();
  const { data: templates } = useApi<ClientTemplate[]>('/api/templates');
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    // Moving to Advanced carries what's written so far into the draft.
    if (m === 'advanced') setDraft(draftFrom());
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* per-device only */
    }
  };

  const parentParam = sp.get('parent');
  const parent = parentParam ? index.get(parentParam) : undefined;
  const [basics, setBasics] = useState<Basics>(() => ({
    name: '',
    type: sp.get('type') || 'custom',
    realm: sp.get('realm') || 'world',
    parent_id: parentParam,
    canon_status: canonReview ? 'PROPOSED' : 'CANON',
  }));
  // The parent's realm, once the index has it; the canon default once the settings have loaded.
  useEffect(() => {
    if (parent && !sp.get('realm')) setBasics((b) => ({ ...b, realm: parent.realm }));
  }, [parent?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [canonTouched, setCanonTouched] = useState(false);
  useEffect(() => {
    if (!canonTouched) setBasics((b) => ({ ...b, canon_status: canonReview ? 'PROPOSED' : 'CANON' }));
  }, [canonReview, canonTouched]);

  const [templateId, setTemplateId] = useState('');
  const forType = useMemo(() => (templates ?? []).filter((t) => t.type === basics.type), [templates, basics.type]);
  const template = useMemo(
    () => forType.find((t) => t.id === templateId) ?? forType[0] ?? { id: '', origin: 'builtin' as const, markdown: '', type: basics.type, name: '', description: '', facts: [], sections: [] },
    [forType, templateId, basics.type],
  );

  const [facts, setFacts] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [step, setStep] = useState(0);
  // A new type or template starts its facts and sections again, with what the parent can fill in.
  useEffect(() => {
    setFacts(parent ? factsFromParent(template, parent.name) : {});
    setSections(sectionDrafts(template));
    setStep(0);
  }, [template.id, basics.type, templates, parent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<EntitySummary[]>([]);
  useEffect(() => {
    if (basics.name.trim().length < 3) return setSimilar([]);
    const t = setTimeout(async () => setSimilar(await api.get(`/api/entities/similar${qs({ name: basics.name })}`)), 250);
    return () => clearTimeout(t);
  }, [basics.name]);

  const realmName = (id: string) => realms.list.find((r) => r.id === id)?.name ?? id;
  const draftFrom = () =>
    draftMarkdown(
      {
        name: basics.name,
        category: recordTypes.label(basics.type),
        realm: realmName(basics.realm),
        parent: basics.parent_id ? (index.get(basics.parent_id)?.name ?? basics.parent_id) : '',
        canon: basics.canon_status,
      },
      template,
      facts,
      sections,
    );
  // Advanced opens on the template with the header filled in.
  useEffect(() => {
    if (mode === 'advanced' && templates) setDraft(draftFrom());
  }, [mode, template.id, basics.type, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = useMemo(() => buildRecord(basics.name || 'New record', template, facts, sections), [basics.name, template, facts, sections]);
  const steps = ['The basics', ...sections.map((s) => s.heading), 'Review'];
  const last = steps.length - 1;

  const create = async (input: { name: string; type: string; realm: string; parent_id: string | null; canon_status: string; aliases?: string[]; fields: [string, string][]; body: string }) => {
    setErr(null);
    setBusy(true);
    try {
      const e = await api.post<Entity>('/api/entities', {
        ...input,
        aliases: input.aliases ?? [],
        category_raw: recordTypes.label(input.type),
        source_raw: 'DM entry (The Worldkeeper)',
        tags: [`realm/${input.realm}`, `status/${input.canon_status.toLowerCase()}`, 'vis/gm'],
        notes: '',
      });
      rememberType(input.type);
      await reloadIndex();
      void nav(`/e/${e.id}`);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createGuided = () => create({ ...basics, name: basics.name.trim(), ...record });

  /** Read the Advanced draft: its header says the type, realm, parent and canon; the rest is the record. */
  const createAdvanced = () => {
    const d = parseDraft(draft);
    const type = d.header.category ? recordTypes.fromCategory(d.header.category) : basics.type;
    if (!type || !recordTypes.offered.some((t) => t.key === type)) return setErr(`"Category: ${d.header.category}" is not a record type in this library.`);
    const realmRaw = (d.header.realm ?? '').trim();
    const realm = realmRaw ? realms.list.find((r) => r.id === realmRaw || r.name.toLowerCase() === realmRaw.toLowerCase())?.id : basics.realm;
    if (!realm) return setErr(`"Continent or Realm: ${realmRaw}" is not a realm in this library.`);
    const parentRaw = (d.header.parent ?? '').trim();
    let parent_id: string | null = null;
    if (parentRaw) {
      const r = mentions.resolve(parentRaw.replace(/^@\[|\]$/g, '').replace(/\s*\[[A-Z]{2,5}-[A-Z0-9-]+\]$/, ''));
      const id = /\[([A-Z]{2,5}-[A-Z0-9-]+)\]/.exec(parentRaw)?.[1] ?? (index.has(parentRaw) ? parentRaw : r && 'id' in r ? r.id : null);
      if (r && 'ambiguous' in r && !id) return setErr(`More than one record is called "${parentRaw}". Give its type, as "${parentRaw} (Region)", or its ID.`);
      if (!id) return setErr(`No record is called "${parentRaw}", for its Parent. Leave it empty, or use the name of a record you have.`);
      parent_id = id;
    }
    const canon = (d.header.canon ?? basics.canon_status).trim().toUpperCase();
    if (!(CANON_STATUSES as readonly string[]).includes(canon)) return setErr(`"Canon Status: ${d.header.canon}" should be one of ${CANON_STATUSES.join(', ')}.`);
    const name = (d.header.name ?? '').trim();
    if (!name) return setErr('Give it a name: "Name:" at the top, or a "# Heading".');
    // The draft's title follows its Name until the GM writes a heading of their own.
    const body = d.body.replace(/^# New record[ \t]*$/m, `# ${name}`);
    void create({ name, type, realm, parent_id, canon_status: canon, aliases: d.aliases, fields: d.fields, body });
  };

  const subtitle = canonReview ? 'New records start as Proposed until you approve them in Canon Review.' : 'New records are Canon at once. Choose Proposed for an idea you are not sure of yet.';

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={`New ${recordTypes.label(basics.type).toLowerCase()}`}
        subtitle={subtitle}
        actions={
          <Segmented
            label="How to write it"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'guided', label: 'Guided', title: 'Step by step through the template' },
              { value: 'advanced', label: 'Advanced', title: 'The template as Markdown, in the editor' },
            ]}
          />
        }
      />
      {err && <ErrorBox error={err} />}

      {mode === 'advanced' ? (
        <>
          <Card className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
            <Field label="Type" hint="Choosing another type starts its template afresh.">
              <TypeSelect value={basics.type} onChange={(type) => setBasics({ ...basics, type })} />
            </Field>
            {forType.length > 1 && <TemplateSelect templates={forType} value={template.id} onChange={setTemplateId} />}
          </Card>
          <p className="text-sm text-dim">
            The header says what it is: its <b>Name</b>, <b>Category</b> (the type), <b>Parent</b>, <b>Continent or Realm</b>, <b>Canon Status</b> and the type's facts. Each section's{' '}
            <code>{'<!-- To write -->'}</code> note shows what's still to write; players never see it.
          </p>
          <AutoTextarea full startMode="split" value={draft} onChange={(e) => setDraft(e.target.value)} minRows={22} aria-label="Record (Markdown)" />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy || !draft.trim()} onClick={createAdvanced}>
              <Plus size={14} /> Create record
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className="flex flex-wrap gap-1 text-xs" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={`${i}-${s}`}>
                <button
                  type="button"
                  aria-current={i === step ? 'step' : undefined}
                  disabled={i > 0 && !basics.name.trim()}
                  className={`rounded-full border px-2.5 py-0.5 ${i === step ? 'border-gold bg-gold/10 text-gold' : i < step ? 'border-line text-ink' : 'border-line text-dim'} disabled:opacity-50`}
                  onClick={() => setStep(i)}
                >
                  {i + 1}. {s}
                  {i > 0 && i < last && sections[i - 1]?.gm && <EyeOff size={10} className="inline ml-1 -mt-0.5" aria-label="GM only" />}
                  {i > 0 && i < last && sections[i - 1]?.text?.trim() && <Check size={10} className="inline ml-1 -mt-0.5 text-good" aria-label="Written" />}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <BasicsStep
              basics={basics}
              setBasics={(b) => {
                if (b.canon_status !== basics.canon_status) setCanonTouched(true);
                setBasics(b);
              }}
              template={template}
              templates={forType}
              setTemplateId={setTemplateId}
              facts={facts}
              setFacts={setFacts}
            />
          )}
          {step > 0 && step < last && sections[step - 1] && (
            <SectionStep
              key={step}
              section={sections[step - 1]}
              example={template.sections.find((s) => s.heading === sections[step - 1].heading)?.example}
              onChange={(text) => setSections(sections.map((s, i) => (i === step - 1 ? { ...s, text } : s)))}
            />
          )}
          {step === last && <ReviewStep name={basics.name} record={record} sections={sections} mentionsText={record.body} resolve={(t) => parseRefs(t, mentions)} />}

          {similar.length > 0 && step === 0 && (
            <Card className="border-warn/50 text-sm">
              <div className="text-warn mb-1">Already in your library? Link to one of these instead of making a second:</div>
              <ul>
                {similar.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    <EntityLink id={s.id}>{s.name}</EntityLink> <TypeBadge type={s.type} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <span className="ml-auto" />
            {step > 0 && step < last && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setSections(sections.map((s, i) => (i === step - 1 ? { ...s, text: null } : s)));
                  setStep(step + 1);
                }}
              >
                <SkipForward size={14} /> Skip for now
              </button>
            )}
            {step < last && (
              <button className="btn" disabled={!basics.name.trim()} onClick={() => setStep(step === 0 && !sections.length ? last : step + 1)}>
                Next <ArrowRight size={14} />
              </button>
            )}
            <button className={step === last ? 'btn-primary' : 'btn'} disabled={busy || !basics.name.trim()} onClick={createGuided} title="Create it now; anything left is kept to write later">
              <Plus size={14} /> Create record
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TypeSelect({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const recordTypes = useRecordTypes();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Type">
      {recordTypes.offered.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

function TemplateSelect({ templates, value, onChange }: { templates: ClientTemplate[]; value: string; onChange: (id: string) => void }) {
  return (
    <Field label="Template">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Template">
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({ORIGIN_LABEL[t.origin].toLowerCase()})
          </option>
        ))}
      </select>
    </Field>
  );
}

function BasicsStep({
  basics,
  setBasics,
  template,
  templates,
  setTemplateId,
  facts,
  setFacts,
}: {
  basics: Basics;
  setBasics: (b: Basics) => void;
  template: ClientTemplate;
  templates: ClientTemplate[];
  setTemplateId: (id: string) => void;
  facts: Record<string, string>;
  setFacts: (f: Record<string, string>) => void;
}) {
  const realms = useRealms();
  const recordTypes = useRecordTypes();
  const setFact = (name: string, v: string) => setFacts({ ...facts, [name]: v });
  return (
    <>
      <Card className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input className="input" value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} autoFocus aria-label="Name" />
        </Field>
        <Field label="Type">
          <TypeSelect value={basics.type} onChange={(type) => setBasics({ ...basics, type })} />
        </Field>
        <Field label="Inside" hint={`Where it is or belongs: a region for a settlement, a settlement for the people who live there.`}>
          <EntityPicker value={basics.parent_id} onChange={(p) => setBasics({ ...basics, parent_id: p })} placeholder="Search for the place it is in…" />
        </Field>
        <Field label="Realm">
          <select className="input" value={basics.realm} onChange={(e) => setBasics({ ...basics, realm: e.target.value })} aria-label="Realm">
            {realms.list
              .filter((r) => !r.archived)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Canon status">
          <select className="input" value={basics.canon_status} onChange={(e) => setBasics({ ...basics, canon_status: e.target.value })} aria-label="Canon status">
            {CANON_STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {templates.length > 1 && <TemplateSelect templates={templates} value={template.id} onChange={setTemplateId} />}
      </Card>
      {(template.facts.length > 0 || template.description) && (
        <Card title={`${recordTypes.label(basics.type)} facts`}>
          {template.description && <p className="text-sm text-dim mb-3">{template.description}</p>}
          {basics.type === 'item' && (
            <div className="mb-3">
              <ItemPicker
                onPick={(it) =>
                  setFacts({
                    ...facts,
                    Rarity: facts.Rarity || it.rarity,
                    Attunement: facts.Attunement || (it.attunement ? it.attunement.replace(/^requires /i, '').replace(/^Attunement/, 'attunement') : 'no attunement'),
                    Kind: facts.Kind || it.type.toLowerCase(),
                    'Rules item': it.name,
                  })
                }
              />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {template.facts.map((f) => (
              <Field key={f.name} label={f.name} hint={f.guidance}>
                <RulesFactInput
                  fact={f.name}
                  type={basics.type}
                  value={facts[f.name] ?? ''}
                  placeholder={f.example ? `e.g. ${f.example}` : ''}
                  onChange={(v) => setFact(f.name, v)}
                  onPickCreature={(c) =>
                    setFacts({ ...facts, [f.name]: c.name, ...(template.facts.some((x) => x.name === 'Challenge') && !facts.Challenge && c.cr ? { Challenge: `CR ${c.cr}` } : {}) })
                  }
                />
              </Field>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function SectionStep({ section, example, onChange }: { section: SectionDraft; example?: { source: string; text: string }; onChange: (text: string) => void }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {section.heading}
          {section.gm && (
            <Badge tone="danger" icon={<EyeOff size={11} />} title="Never shown to players">
              GM only
            </Badge>
          )}
        </span>
      }
    >
      {section.guidance && <p className="text-sm text-ink/90 mb-2">{section.guidance}</p>}
      {example && (
        <blockquote className="mb-3 border-l-2 border-gold/50 pl-3 text-sm italic text-ink/80">
          “{example.text}”{example.source && <span className="not-italic text-dim"> ({example.source})</span>}
        </blockquote>
      )}
      <AutoTextarea full value={section.text ?? ''} onChange={(e) => onChange(e.target.value)} minRows={8} aria-label={section.heading} placeholder="Write here, or skip it for now." autoFocus />
    </Card>
  );
}

function ReviewStep({
  name,
  record,
  sections,
  mentionsText,
  resolve,
}: {
  name: string;
  record: { fields: [string, string][]; body: string };
  sections: SectionDraft[];
  mentionsText: string;
  resolve: (t: string) => ReturnType<typeof parseRefs>;
}) {
  const refs = resolve(stripComments(mentionsText));
  const links = [...new Map(refs.flatMap((r) => (r.kind === 'link' ? [[r.id, r.label] as const] : []))).entries()];
  const broken = [...new Set(refs.flatMap((r) => (r.kind === 'broken' ? [r.label] : [])))];
  const todo = toWriteNotes(record.body).length;
  const shareable = sections.filter((s) => !s.gm && s.text?.trim());
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card title="As it will read">
        {record.fields.some(([, v]) => v) && (
          <dl className="mb-4 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
            {record.fields
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium">{k}</dt>
                  <dd className="text-ink/90">{v}</dd>
                </div>
              ))}
          </dl>
        )}
        <Markdown text={record.body} />
      </Card>
      <div className="space-y-4">
        <Card title="Links" className="text-sm">
          {links.length ? (
            <ul className="space-y-0.5">
              {links.map(([id, label]) => (
                <li key={id}>
                  <EntityLink id={id}>{label}</EntityLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-dim">No links to other records yet. Type @ in any section to link one.</p>
          )}
          {broken.length > 0 && <p className="text-warn mt-2">Not in your library yet: {broken.join(', ')}.</p>}
        </Card>
        <Card title="What players will see" className="text-sm space-y-2">
          <p>Nothing, until you reveal it. New records are for you only.</p>
          {shareable.length > 0 ? (
            <p className="text-dim">When you do, you can share {shareable.map((s) => `“${s.heading}”`).join(', ')} and any facts you choose.</p>
          ) : (
            <p className="text-dim">No section players could be shown is written yet.</p>
          )}
          {sections.some((s) => s.gm) && (
            <p className="text-dim">
              <EyeOff size={12} className="inline -mt-0.5" />{' '}
              {sections
                .filter((s) => s.gm)
                .map((s) => `“${s.heading}”`)
                .join(', ')}{' '}
              {sections.filter((s) => s.gm).length > 1 ? 'are' : 'is'} never shown to players.
            </p>
          )}
        </Card>
        {todo > 0 && (
          <Card className="text-sm text-dim">
            {todo} section{todo === 1 ? '' : 's'} still to write. {todo === 1 ? 'It stays' : 'They stay'} in {name.trim() || 'the record'} as {todo === 1 ? 'a heading' : 'headings'} with the guidance,
            to fill in later.
          </Card>
        )}
        <p className="text-xs text-dim">
          You can keep editing on its page after you create it. <Link to="/templates">Templates</Link> decide what each type asks for.
        </p>
      </div>
    </div>
  );
}
