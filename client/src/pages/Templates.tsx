/**
 * Library → Templates (docs/OWN_WORLD_PLAN.md §2.2): every record type and its templates. Built-in and archive
 * templates are read-only (duplicate one to make it your own); your own can be edited, in Markdown with a live preview.
 * Here you can also add a record type of your own. A changed template affects only new records.
 */
import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { parseTemplate, templateToMarkdown } from '@shared/templates';
import { TYPE_CATEGORIES, TYPE_PREFIX_RE, type TypeCategory, type TypeTraits } from '@shared/recordTypes';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { useRecordTypes, type ClientRecordType } from '../components/recordTypes';
import { ORIGIN_LABEL, TemplatePreview, type ClientTemplate } from '../components/TemplatePreview';
import { PageHeader } from '../components/ui/pageHeader';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { Check, Field, Toggle } from '../components/ui/inputs';
import { Modal, ask, toast } from '../components/ui/overlays';
import { Empty, ErrorBox, Loading } from '../components/ui/feedback';
import { AutoTextarea } from '../components/ui/textarea';

const CATEGORY_LABEL: Record<TypeCategory, string> = {
  place: 'Places',
  person: 'People',
  group: 'Groups',
  folk: 'Peoples and species',
  myth: 'Myth and history',
  thing: 'Things',
  creature: 'Creatures',
  rule: 'Rules',
  adventure: 'Adventures',
  meta: 'Bookkeeping',
};

const TRAIT_LABEL: Partial<Record<keyof TypeTraits, string>> = {
  place: 'A place (maps, locations, hometowns)',
  regionLike: 'Large enough for a region panel (terrain, encounters)',
  holdable: 'A thing someone can carry or own',
  group: 'A group of people (standing, faction web)',
  folk: 'A people or species (names, the character builder)',
  person: 'A single person',
  commonNoun: "Don't link its name automatically in text",
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function TemplatesPage() {
  const { recordTypes: all, reloadTypes } = useAppState();
  const recordTypes = useRecordTypes();
  const { data: templates, error, reload } = useApi<ClientTemplate[]>('/api/templates');
  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState('');
  const [editing, setEditing] = useState<{ id?: string; markdown: string } | null>(null);
  const [newType, setNewType] = useState(false);
  const list = (all.length ? all : recordTypes.list) as ClientRecordType[];
  const shown = list.filter((t) => (showArchived || !t.archived) && !t.traits.meta);
  const current = shown.find((t) => t.key === picked) ?? shown[0];
  const forType = (templates ?? []).filter((t) => t.type === current?.key);
  const byCategory = useMemo(() => TYPE_CATEGORIES.map((c) => ({ c, types: shown.filter((t) => t.category === c) })).filter((g) => g.types.length), [shown]);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    try {
      await f();
      await Promise.all([reload(), reloadTypes()]);
      if (done) toast(done, 'ok');
    } catch (e) {
      toast(message(e), 'danger');
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!templates) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Templates"
        subtitle="Every kind of record and what it asks for. Duplicate a template to make it your own; changes affect only new records."
        actions={
          <button className="btn" onClick={() => setNewType(true)}>
            <Plus size={14} /> New record type
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Record types" className="space-y-4">
          {byCategory.map(({ c, types }) => (
            <div key={c}>
              <div className="section-title !text-xs mb-1">{CATEGORY_LABEL[c]}</div>
              <ul>
                {types.map((t) => {
                  const n = (templates ?? []).filter((x) => x.type === t.key).length;
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        onClick={() => setPicked(t.key)}
                        aria-current={current?.key === t.key}
                        className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${current?.key === t.key ? 'bg-gold/10 text-gold' : 'hover:bg-raised'} ${t.archived ? 'opacity-60' : ''}`}
                      >
                        <span className="flex-1 truncate">{t.label}</span>
                        {!t.builtin && <Badge tone="arcane">Yours</Badge>}
                        <span className="text-xs text-dim num">{n || ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <Toggle checked={showArchived} onChange={setShowArchived} className="text-dim text-sm">
            Show archived types
          </Toggle>
        </nav>

        {current ? (
          <div className="space-y-4 min-w-0">
            <Card
              title={current.label}
              aside={
                <div className="flex gap-1.5">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      void run(() => api.patch(`/api/record-types/${current.key}`, { archived: !current.archived }), current.archived ? `${current.label} restored` : `${current.label} archived`)
                    }
                  >
                    {current.archived ? 'Restore type' : 'Archive type'}
                  </button>
                  {!current.builtin && !current.records && (
                    <button
                      className="btn-ghost text-xs text-danger"
                      onClick={async () => {
                        if (await ask({ title: `Delete ${current.label}?`, body: 'The type and your templates for it are removed. No record uses it.', confirmLabel: 'Delete', danger: true }))
                          void run(() => api.del(`/api/record-types/${current.key}`), `${current.label} deleted`);
                      }}
                    >
                      Delete type
                    </button>
                  )}
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <Badge>New IDs: {current.prefix}-0001</Badge>
                <Badge>{(current.records ?? 0).toLocaleString('en')} records</Badge>
                {current.pack && <Badge tone="gold">Worldkeeper setting</Badge>}
                {(Object.keys(TRAIT_LABEL) as (keyof TypeTraits)[])
                  .filter((k) => current.traits[k])
                  .map((k) => (
                    <Badge key={k} tone="dim" title={TRAIT_LABEL[k]}>
                      {TRAIT_LABEL[k]!.split(' (')[0]}
                    </Badge>
                  ))}
              </div>
              {current.archived && <p className="text-xs text-dim mt-2">Archived: not offered for new records. Its records keep it.</p>}
            </Card>

            {forType.length === 0 && (
              <Empty
                title={`No template for ${current.plural.toLowerCase()} yet`}
                action={
                  <button className="btn-primary" onClick={() => setEditing({ markdown: starter(current) })}>
                    <Plus size={14} /> Write one
                  </button>
                }
              >
                A template lists the facts and sections a {current.label.toLowerCase()} should have.
              </Empty>
            )}
            {forType.map((t, i) => (
              <Card
                key={t.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {t.name}
                    <Badge tone={t.origin === 'user' ? 'arcane' : 'dim'}>{ORIGIN_LABEL[t.origin]}</Badge>
                    {i === 0 && <Badge tone="gold">Used for new records</Badge>}
                  </span>
                }
                aside={
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost px-1.5"
                      title="Duplicate as your own"
                      aria-label={`Duplicate ${t.name}`}
                      onClick={() => void run(() => api.post(`/api/templates/${encodeURIComponent(t.id)}/duplicate`), `${t.name} duplicated`)}
                    >
                      <Copy size={14} />
                    </button>
                    {t.origin === 'user' && (
                      <>
                        <button className="btn-ghost px-1.5" title="Edit" aria-label={`Edit ${t.name}`} onClick={() => setEditing({ id: t.id, markdown: t.markdown })}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-ghost px-1.5 text-danger"
                          title="Delete"
                          aria-label={`Delete ${t.name}`}
                          onClick={async () => {
                            if (await ask({ title: `Delete ${t.name}?`, body: 'Records made from it keep their sections.', confirmLabel: 'Delete', danger: true }))
                              void run(() => api.del(`/api/templates/${encodeURIComponent(t.id)}`), `${t.name} deleted`);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                }
              >
                <TemplatePreview template={t} />
              </Card>
            ))}
          </div>
        ) : (
          <Empty title="No record types" />
        )}
      </div>

      {editing && (
        <TemplateEditor
          initial={editing.markdown}
          onClose={() => setEditing(null)}
          onSave={async (markdown) => {
            try {
              if (editing.id) await api.put(`/api/templates/${encodeURIComponent(editing.id)}`, { markdown });
              else await api.post('/api/templates', { markdown });
              await reload();
              setEditing(null);
              toast('Template saved', 'ok');
            } catch (e) {
              toast(message(e), 'danger');
            }
          }}
        />
      )}
      {newType && (
        <NewTypeDialog
          taken={new Set(list.map((t) => t.prefix))}
          onClose={() => setNewType(false)}
          onCreated={async (t) => {
            await Promise.all([reload(), reloadTypes()]);
            setNewType(false);
            setPicked(t.key);
            setEditing({ markdown: starter(t) });
          }}
        />
      )}
    </div>
  );
}

/** A starting template for a type that has none. */
const starter = (t: Pick<ClientRecordType, 'key' | 'label'>) =>
  templateToMarkdown({
    type: t.key,
    name: t.label,
    description: `What a ${t.label.toLowerCase()} is, and when to use it.`,
    facts: [],
    sections: [
      { heading: 'Overview', guidance: 'What players see and know first.', gm: false },
      { heading: 'Secrets', guidance: 'What only you know.', gm: true },
    ],
  });

function TemplateEditor({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (markdown: string) => Promise<void> }) {
  const [md, setMd] = useState(initial);
  const [busy, setBusy] = useState(false);
  const spec = useMemo(() => parseTemplate(md), [md]);
  return (
    <Modal
      title="Edit template"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={async () => (setBusy(true), await onSave(md), setBusy(false))}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Markdown"
          hint={'"## Facts" with "- **Name**: guidance"; then a "## Section" each, with "> Guidance:" and "> Example (Source):". Add "(GM only)" to a heading to keep it from players.'}
        >
          <AutoTextarea value={md} onChange={(e) => setMd(e.target.value)} minRows={22} links={false} aria-label="Template Markdown" />
        </Field>
        <div className="min-w-0">
          <div className="label mb-1.5">Preview</div>
          <div className="panel p-3 max-h-[28rem] overflow-auto">
            <div className="font-display text-lg text-ink mb-2">{spec.name || 'Untitled'}</div>
            <TemplatePreview template={spec} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NewTypeDialog({ taken, onClose, onCreated }: { taken: Set<string>; onClose: () => void; onCreated: (t: ClientRecordType) => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [prefix, setPrefix] = useState('');
  const [category, setCategory] = useState<TypeCategory>('place');
  const [traits, setTraits] = useState<TypeTraits>({ place: true });
  const [pin, setPin] = useState<'site' | 'area' | ''>('site');
  const auto = label
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
  const pfx = (prefix || auto).toUpperCase();
  const prefixOk = TYPE_PREFIX_RE.test(pfx) && !taken.has(pfx);
  const save = async () => {
    try {
      const t = await api.post<ClientRecordType>('/api/record-types', {
        label: label.trim(),
        plural: `${label.trim()}s`,
        prefix: pfx,
        category,
        pin: traits.place ? pin || null : null,
        traits,
        browse: traits.place ? ['places', pin === 'area' ? 'regions' : 'landmarks'] : traits.group ? ['factions'] : traits.person ? ['npcs'] : [],
        handbook: traits.place ? 'places' : traits.group ? 'factions' : traits.person ? 'people' : traits.folk ? 'peoples' : traits.holdable ? 'treasures' : 'other',
        icon: traits.place ? (pin === 'area' ? 'map' : 'home') : 'file',
      });
      await onCreated(t);
    } catch (e) {
      toast(message(e), 'danger');
    }
  };
  return (
    <Modal
      title="New record type"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!label.trim() || !prefixOk} onClick={() => void save()}>
            Add type
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tavern" autoFocus />
        </Field>
        <Field label="ID prefix" hint={prefixOk || !pfx ? `New records: ${pfx || 'ABC'}-0001` : taken.has(pfx) ? 'Another type uses it' : 'Two to five capital letters'}>
          <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder={auto || 'TAV'} maxLength={5} />
        </Field>
        <Field label="Sort of thing">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as TypeCategory)}>
            {TYPE_CATEGORIES.filter((c) => c !== 'meta').map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        {traits.place && (
          <Field label="On a map">
            <select className="input" value={pin} onChange={(e) => setPin(e.target.value as 'site' | 'area')}>
              <option value="site">A pin (a town, a building, a ruin)</option>
              <option value="area">An area (a region, a forest)</option>
            </select>
          </Field>
        )}
      </div>
      <fieldset className="mt-4 space-y-1.5">
        <legend className="label mb-1">What it can do</legend>
        {(Object.keys(TRAIT_LABEL) as (keyof TypeTraits)[]).map((k) => (
          <Check key={k} checked={!!traits[k]} onChange={(v) => setTraits({ ...traits, [k]: v })}>
            {TRAIT_LABEL[k]}
          </Check>
        ))}
      </fieldset>
    </Modal>
  );
}
