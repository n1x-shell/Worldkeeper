/**
 * Codex → Realms (docs/OWN_WORLD_PLAN.md §2.1): the library's worlds, continents, planes and region groups. Each one
 * gets a page, a place in the sidebar, a colour and an icon, and records, maps and campaigns belong to one.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { REALM_COLORS, REALM_ICONS, REALM_KINDS, REALM_KIND_LABELS, type RealmColor, type RealmIcon, type RealmInfo, type RealmKind } from '@shared/realms';
import { api } from '../lib/api';
import { useAppState } from '../lib/store';
import { REALM_ICON_COMPONENTS, RealmIconOf, realmClass, useRealms } from '../components/realms';
import { PageHeader } from '../components/ui/pageHeader';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { Field, Toggle } from '../components/ui/inputs';
import { Modal, ask, toast } from '../components/ui/overlays';
import { Empty, Loading } from '../components/ui/feedback';

type Draft = { id?: string; name: string; kind: RealmKind; parent_id: string | null; color: RealmColor; icon: RealmIcon; description: string };

/** A new world, continent (inside the first world) or plane (on its own, beside the worlds). */
const blank = (list: RealmInfo[], kind: RealmKind = list.length ? 'continent' : 'world'): Draft => ({
  name: '',
  kind,
  parent_id: kind === 'continent' || kind === 'region_group' ? (list.find((r) => r.kind === 'world' && !r.archived)?.id ?? null) : null,
  // The next colour nobody uses yet.
  color: REALM_COLORS.find((c) => !list.some((r) => r.color === c)) ?? 'slate',
  icon: 'compass',
  description: '',
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function RealmsPage() {
  const { realms: all, reloadRealms } = useAppState();
  const realms = useRealms();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const list = realms.list.filter((r) => showArchived || !r.archived);
  const depth = (r: RealmInfo): number => (r.parent_id && r.parent_id !== r.id ? 1 + depth(realms.get(r.parent_id)) : 0);
  const archivedN = realms.list.filter((r) => r.archived).length;

  const run = async (f: () => Promise<unknown>, done?: string) => {
    try {
      await f();
      await reloadRealms();
      if (done) toast(done, 'ok');
    } catch (e) {
      toast(message(e), 'danger');
    }
  };
  /** Move a realm up or down among its siblings (same parent), keeping everything else where it is. */
  const move = (r: RealmInfo, dir: -1 | 1) => {
    const ids = realms.list.map((x) => x.id);
    const siblings = realms.list.filter((x) => x.parent_id === r.parent_id);
    const j = siblings.findIndex((x) => x.id === r.id) + dir;
    if (j < 0 || j >= siblings.length) return;
    const other = siblings[j].id;
    const a = ids.indexOf(r.id);
    const b = ids.indexOf(other);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    void run(() => api.post('/api/realms/order', { ids }));
  };
  const remove = async (r: RealmInfo) => {
    if (!(await ask({ title: `Delete ${r.name}?`, body: 'Only a realm with no records, maps or campaigns can be deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    void run(() => api.del(`/api/realms/${r.id}`), `${r.name} deleted`);
  };

  if (!realms.loaded && !all.length) return <Loading />;
  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Worlds & Realms"
        subtitle="Your worlds, the continents inside them, and the planes beside them. Every record belongs to one; each gets a page, a colour and a place in the sidebar."
        actions={
          <>
            <button className="btn-primary" onClick={() => setEditing(blank(realms.list, 'continent'))}>
              <Plus size={14} /> Add a continent
            </button>
            <button className="btn" onClick={() => setEditing(blank(realms.list, 'plane'))}>
              <Plus size={14} /> Add a plane
            </button>
            <button className="btn" onClick={() => setEditing(blank(realms.list, 'world'))}>
              <Plus size={14} /> Add a world
            </button>
          </>
        }
      />
      {archivedN > 0 && (
        <Toggle checked={showArchived} onChange={setShowArchived} className="text-dim">
          Show archived ({archivedN})
        </Toggle>
      )}
      {!list.length ? (
        <Empty
          title="No realms yet"
          action={
            <button className="btn-primary" onClick={() => setEditing(blank([]))}>
              Add your world
            </button>
          }
        >
          Start with your world, then add its continents.
        </Empty>
      ) : (
        <Card flush>
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const siblings = realms.list.filter((x) => x.parent_id === r.parent_id);
              const at = siblings.findIndex((x) => x.id === r.id);
              return (
                <li key={r.id} className={`${realmClass(r)} relative flex flex-wrap items-center gap-3 px-4 py-3 ${r.archived ? 'opacity-60' : ''}`} style={{ paddingLeft: 16 + depth(r) * 32 }}>
                  {/* What it's inside: a branch from its parent's line. */}
                  {depth(r) > 0 && <span aria-hidden className="absolute top-0 bottom-1/2 border-l-2 border-b-2 border-line rounded-bl-md w-3" style={{ left: 16 + (depth(r) - 1) * 32 + 9 }} />}
                  <span className="text-realm shrink-0">
                    <RealmIconOf realm={r} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link to={`/realm/${r.id}`} className="font-display text-[17px] text-realm hover:underline">
                        {r.name}
                      </Link>
                      <Badge tone="realm">{REALM_KIND_LABELS[r.kind]}</Badge>
                      {r.parent_id && <span className="text-xs text-dim">in {realms.name(r.parent_id)}</span>}
                      {r.archived && <Badge>Archived</Badge>}
                    </div>
                    <div className="text-xs text-dim mt-0.5">
                      <span className="num text-ink">{(r.records ?? 0).toLocaleString('en')}</span> {r.records === 1 ? 'record' : 'records'}
                      {r.description && <span> · {r.description}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost px-1.5" disabled={at <= 0} onClick={() => move(r, -1)} title="Move up" aria-label={`Move ${r.name} up`}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn-ghost px-1.5" disabled={at < 0 || at >= siblings.length - 1} onClick={() => move(r, 1)} title="Move down" aria-label={`Move ${r.name} down`}>
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn-ghost px-1.5" onClick={() => setEditing({ ...r })} title="Edit" aria-label={`Edit ${r.name}`}>
                      <Pencil size={14} />
                    </button>
                    {r.id !== 'world' && (
                      <button
                        className="btn-ghost px-1.5"
                        onClick={() => void run(() => api.patch(`/api/realms/${r.id}`, { archived: !r.archived }), r.archived ? `${r.name} restored` : `${r.name} archived`)}
                        title={r.archived ? 'Restore' : 'Archive (hide it from lists and the sidebar; its records stay)'}
                        aria-label={`${r.archived ? 'Restore' : 'Archive'} ${r.name}`}
                      >
                        {r.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    )}
                    {r.id !== 'world' && !r.records && (
                      <button className="btn-ghost px-1.5 text-danger" onClick={() => void remove(r)} title="Delete" aria-label={`Delete ${r.name}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {editing && (
        <RealmEditor
          draft={editing}
          realms={realms.list}
          onClose={() => setEditing(null)}
          onSave={async (d) => {
            const { id, ...body } = d;
            try {
              if (id) await api.patch(`/api/realms/${id}`, body);
              else await api.post('/api/realms', body);
              await reloadRealms();
              setEditing(null);
              toast(id ? `${d.name} saved` : `${d.name} added`, 'ok');
            } catch (e) {
              toast(message(e), 'danger');
            }
          }}
        />
      )}
    </div>
  );
}

function RealmEditor({ draft, realms, onClose, onSave }: { draft: Draft; realms: RealmInfo[]; onClose: () => void; onSave: (d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  // A realm can sit inside any other except itself and what's inside it.
  const inside = (id: string): boolean => realms.some((r) => r.parent_id === d.id && (r.id === id || inside(r.id)));
  const parents = realms.filter((r) => r.id !== d.id && !(d.id && inside(r.id)) && !r.archived);
  const save = async () => {
    setBusy(true);
    await onSave({ ...d, name: d.name.trim() });
    setBusy(false);
  };
  return (
    <Modal
      title={d.id ? `Edit ${draft.name}` : `New ${REALM_KIND_LABELS[draft.kind].toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!d.name.trim() || busy} onClick={() => void save()}>
            {d.id ? 'Save' : `Add ${REALM_KIND_LABELS[d.kind].toLowerCase()}`}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder="e.g. The Sunken Isles" />
        </Field>
        <Field label="Kind">
          <select className="input" value={d.kind} onChange={(e) => set({ kind: e.target.value as RealmKind })}>
            {REALM_KINDS.map((k) => (
              <option key={k} value={k}>
                {REALM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inside" hint="A continent inside its world, a region group inside its continent.">
          <select className="input" value={d.parent_id ?? ''} onChange={(e) => set({ parent_id: e.target.value || null })}>
            <option value="">Nothing (top level)</option>
            {parents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Short description">
          <input className="input" value={d.description} maxLength={400} onChange={(e) => set({ description: e.target.value })} placeholder="One line for its page and cards" />
        </Field>
      </div>
      <div className="mt-4">
        <div className="label mb-1.5">Colour</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {REALM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={d.color === c}
              aria-label={c}
              title={c}
              onClick={() => set({ color: c })}
              className={`rc-${c} h-8 w-8 rounded-full bg-realm border-2 ${d.color === c ? 'border-ink ring-2 ring-gold' : 'border-transparent'}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="label mb-1.5">Icon</div>
        <div className={`rc-${d.color} flex flex-wrap gap-1.5`} role="radiogroup" aria-label="Icon">
          {REALM_ICONS.map((i) => {
            const I = REALM_ICON_COMPONENTS[i];
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={d.icon === i}
                aria-label={i}
                title={i}
                onClick={() => set({ icon: i })}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-md border ${d.icon === i ? 'border-realm bg-realm/10 text-realm' : 'border-line text-dim hover:text-ink'}`}
              >
                <I size={17} />
              </button>
            );
          })}
        </div>
      </div>
      {d.id && <p className="text-xs text-dim mt-4">Its key stays {d.id}, so links and records keep working after a rename.</p>}
    </Modal>
  );
}
