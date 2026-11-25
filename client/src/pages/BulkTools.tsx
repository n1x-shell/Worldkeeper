/**
 * Bulk tools (v0.9.13): the library's tags, one change to many records (the bar under a list in Select mode), two
 * records made one, and find-and-replace across records. Every record changed keeps its earlier state in its history.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Eye, EyeOff, FolderInput, Globe, Merge, Pencil, Replace, Search, ShieldCheck, Tag, Tags, Trash2, X } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { useRealms } from '../components/realms';
import { useRecordTypes } from '../components/recordTypes';
import { EntityPicker } from '../components/EntityPicker';
import { Card, Check, Empty, ErrorBox, Field, Loading, Modal, PageHeader, TypeBadge, ask, askText, toast } from '../components/ui';
import { CANON_STATUSES } from '@shared/domain';

// ---- Tags ------------------------------------------------------------------------------------------------------------

interface TagRow {
  tag: string;
  count: number;
  system: boolean;
}

export function TagsPage() {
  const { data, error, reload } = useApi<TagRow[]>('/api/tags');
  const { reloadIndex } = useAppState();
  const [q, setQ] = useState('');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const own = data.filter((t) => !t.system && t.tag.toLowerCase().includes(q.trim().toLowerCase()));
  const kept = data.filter((t) => t.system);
  const after = async (what: string) => {
    toast(what, 'ok');
    await reload();
    void reloadIndex();
  };
  const rename = async (t: TagRow) => {
    const to = await askText({ title: `Rename “${t.tag}”`, label: 'Its new name (an existing tag’s name merges the two)', initial: t.tag, confirmLabel: 'Rename' });
    if (to == null || !to.trim() || to.trim() === t.tag) return;
    try {
      const r = await api.post<{ changed: number; merged: boolean }>('/api/tags/rename', { from: t.tag, to });
      await after(`${r.merged ? 'Merged into' : 'Renamed'} “${to.trim()}” on ${r.changed} ${r.changed === 1 ? 'record' : 'records'}.`);
    } catch (x) {
      toast((x as Error).message, 'danger');
    }
  };
  const remove = async (t: TagRow) => {
    if (!(await ask({ title: `Remove “${t.tag}”?`, body: `It comes off ${t.count} ${t.count === 1 ? 'record' : 'records'}. The records stay; each keeps the change in its history.`, confirmLabel: 'Remove the tag', danger: true }))) return;
    try {
      const r = await api.post<{ changed: number }>('/api/tags/delete', { tag: t.tag });
      await after(`Removed from ${r.changed} ${r.changed === 1 ? 'record' : 'records'}.`);
    } catch (x) {
      toast((x as Error).message, 'danger');
    }
  };
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Tags" subtitle="Every tag in the library. Rename one everywhere, merge two that mean the same, or remove one." icon={<Tags size={20} />} />
      <input className="input max-w-xs" placeholder="Filter tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tags" />
      {own.length ? (
        <Card flush>
          <ul className="divide-y divide-line/60" data-testid="tag-list">
            {own.map((t) => (
              <li key={t.tag} className="flex items-center gap-2 px-4 py-2">
                <Tag size={14} className="shrink-0 text-gold" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t.tag}</span>
                <span className="num text-xs text-dim">
                  {t.count} {t.count === 1 ? 'record' : 'records'}
                </span>
                <button type="button" className="btn-ghost text-xs" onClick={() => void rename(t)} aria-label={`Rename ${t.tag}`}>
                  <Pencil size={13} /> Rename
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => void remove(t)} aria-label={`Remove ${t.tag}`}>
                  <Trash2 size={13} /> Remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty title={q ? 'No tag matches' : 'No tags of your own yet'}>Add tags when you edit a record, or to many at once: open a list of records and choose Select.</Empty>
      )}
      {kept.length > 0 && (
        <p className="text-xs text-dim">
          The app keeps {kept.length} tags of its own in step with each record’s world, canon status and visibility ({kept
            .slice(0, 4)
            .map((t) => t.tag)
            .join(', ')}
          {kept.length > 4 ? '…' : ''}). Change those on the record, or for many records at once in a list.
        </p>
      )}
    </div>
  );
}

// ---- One change to many records --------------------------------------------------------------------------------------

type Doing = 'tag' | 'untag' | 'realm' | 'parent' | 'canon' | 'reveal' | 'hide';

/** The bar a list shows while records are selected. */
export function BulkBar({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const { activeCampaignId, reloadIndex } = useAppState();
  const realms = useRealms();
  const [doing, setDoing] = useState<Doing | null>(null);
  const [text, setText] = useState('');
  const [realm, setRealm] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [canon, setCanon] = useState<string>('CANON');
  const [onlyCampaign, setOnlyCampaign] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = ids.length;
  const these = `${n} ${n === 1 ? 'record' : 'records'}`;

  const run = async (action: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await api.post<{ changed: number; unchanged: number; skipped: { id: string; reason: string }[] }>('/api/entities/bulk', { ids, action });
      toast(`${done}: ${r.changed} changed${r.unchanged ? `, ${r.unchanged} already so` : ''}${r.skipped.length ? `, ${r.skipped.length} passed over (${r.skipped[0].reason})` : ''}.`, r.skipped.length ? 'gold' : 'ok');
      setDoing(null);
      setText('');
      await reloadIndex();
      onDone();
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  const tags = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const apply = () => {
    if (doing === 'tag') return run({ do: 'tag', add: tags }, 'Tagged');
    if (doing === 'untag') return run({ do: 'tag', remove: tags }, 'Tag taken off');
    if (doing === 'realm') return run({ do: 'realm', realm }, 'Moved');
    if (doing === 'parent') return run({ do: 'parent', parent_id: parent }, parent ? 'Put inside' : 'Taken out');
    if (doing === 'canon') return run({ do: 'canon', canon_status: canon }, 'Canon status set');
    return run({ do: 'reveal', revealed: doing === 'reveal', campaign_id: onlyCampaign ? activeCampaignId : null }, doing === 'reveal' ? 'Revealed' : 'Hidden');
  };
  const ready = doing === 'tag' || doing === 'untag' ? tags.length > 0 : doing === 'realm' ? !!realm : true;
  const titles: Record<Doing, string> = {
    tag: `Add a tag to ${these}`,
    untag: `Take a tag off ${these}`,
    realm: `Move ${these} to another world or realm`,
    parent: `Put ${these} inside another record`,
    canon: `Set the canon status of ${these}`,
    reveal: `Reveal ${these} to players`,
    hide: `Hide ${these} from players`,
  };
  const button = (d: Doing, icon: React.ReactNode, label: string) => (
    <button type="button" className="btn text-sm" onClick={() => (setDoing(d), setText(''))}>
      {icon} {label}
    </button>
  );
  return (
    <div className="sticky bottom-3 z-20 mt-3" data-testid="bulk-bar">
      <div className="panel elev-3 flex flex-wrap items-center gap-2 border-gold/60 px-3 py-2">
        <b className="mr-1 text-sm">{these} selected</b>
        {button('tag', <Tag size={14} />, 'Add tag')}
        {button('untag', <X size={14} />, 'Take tag off')}
        {button('parent', <FolderInput size={14} />, 'Put inside')}
        {realms.list.filter((r) => !r.archived).length > 1 && button('realm', <Globe size={14} />, 'Move to')}
        {button('canon', <ShieldCheck size={14} />, 'Canon')}
        {button('reveal', <Eye size={14} />, 'Reveal')}
        {button('hide', <EyeOff size={14} />, 'Hide')}
        <button
          type="button"
          className="btn text-sm"
          onClick={async () => {
            if (await ask({ title: `Archive ${these}?`, body: 'Archived records leave the lists and the players’ handbook. They aren’t deleted: tick “Include archived” to find them again.', confirmLabel: 'Archive' }))
              void run({ do: 'archive', archived: true }, 'Archived');
          }}
        >
          <Archive size={14} /> Archive
        </button>
        <button type="button" className="btn-ghost ml-auto text-sm" onClick={onClear}>
          Clear
        </button>
      </div>
      {doing && (
        <Modal
          title={titles[doing]}
          onClose={() => setDoing(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDoing(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={busy || !ready} onClick={() => void apply()}>
                {busy ? 'Changing…' : `Change ${these}`}
              </button>
            </>
          }
        >
          <div className="space-y-3 p-4 text-sm">
            {(doing === 'tag' || doing === 'untag') && (
              <Field label={doing === 'tag' ? 'The tag (several with commas)' : 'The tag to take off (several with commas)'}>
                <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ready && void apply()} />
              </Field>
            )}
            {doing === 'realm' && (
              <Field label="The world or realm they belong to">
                <select className="input" value={realm} onChange={(e) => setRealm(e.target.value)}>
                  <option value="">Choose…</option>
                  {realms.list
                    .filter((r) => !r.archived)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {doing === 'parent' && (
              <>
                <div className="label">The record they sit inside (a town’s region, a person’s home)</div>
                <EntityPicker value={parent} onChange={setParent} placeholder="Search for the record…" />
                <p className="text-xs text-dim">Leave it empty to take them out of wherever they are.</p>
              </>
            )}
            {doing === 'canon' && (
              <Field label="Canon status">
                <select className="input" value={canon} onChange={(e) => setCanon(e.target.value)}>
                  {CANON_STATUSES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            )}
            {(doing === 'reveal' || doing === 'hide') && (
              <>
                <p>
                  {doing === 'reveal'
                    ? 'Players will know these records exist and see what each is written to show them. GM-only sections stay yours.'
                    : 'Players will no longer see these records.'}
                </p>
                {activeCampaignId != null && (
                  <Check checked={onlyCampaign} onChange={setOnlyCampaign}>
                    {doing === 'reveal' ? 'Only to the active campaign’s players (other campaigns still don’t know)' : 'Only from the active campaign’s own knowledge (what everyone knows stays)'}
                  </Check>
                )}
              </>
            )}
            <p className="text-xs text-dim">Each record keeps how it was in its history, where it can be put back.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Two records made one --------------------------------------------------------------------------------------------

/** Fold another record into this one. */
export function MergeDialog({ keep, onClose, onMerged }: { keep: { id: string; name: string; type: string }; onClose: () => void; onMerged: () => void }) {
  const { reloadIndex, index } = useAppState();
  const [from, setFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const other = from ? index.get(from) : undefined;
  const merge = async () => {
    if (!from || from === keep.id) return;
    setBusy(true);
    try {
      await api.post(`/api/entities/${encodeURIComponent(keep.id)}/merge`, { from });
      toast(`${other?.name ?? 'The record'} is now part of ${keep.name}. A backup was made first.`, 'ok');
      await reloadIndex();
      onMerged();
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Merge another record into ${keep.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !from || from === keep.id} onClick={() => void merge()}>
            <Merge size={14} /> {busy ? 'Merging…' : other ? `Merge ${other.name} into ${keep.name}` : 'Merge'}
          </button>
        </>
      }
    >
      <div className="space-y-3 p-4 text-sm">
        <div className="label">The record that is the same thing</div>
        <EntityPicker value={from} onChange={setFrom} placeholder="Search for the duplicate…" allowClear />
        {from === keep.id && <p className="text-danger">That is this record.</p>}
        <ul className="list-disc space-y-1 pl-5 text-dim">
          <li>
            <b className="text-ink">{keep.name}</b> stays, and takes the other’s name as an alternate name, its tags, the facts it doesn’t have, its text (under a heading of its own), its notes and its pictures.
          </li>
          <li>Whatever pointed at the other record now points here: records inside it, quests, map pins, what campaigns know, links in text.</li>
          <li>The other record’s address keeps working and leads here. It leaves the lists; its last state stays in its history.</li>
          <li>A backup of the library is made first.</li>
        </ul>
      </div>
    </Modal>
  );
}

// ---- Find and replace ------------------------------------------------------------------------------------------------

const PARTS: [string, string][] = [
  ['body', 'Text'],
  ['player_summary', 'Players’ text'],
  ['fields', 'Facts'],
  ['notes', 'Your notes'],
  ['name', 'Names'],
  ['aliases', 'Alternate names'],
];

interface Found {
  records: { id: string; name: string; type: string; realm: string; count: number; where: string[]; before: string; after: string }[];
  matches: number;
  more: boolean;
}

export function FindReplacePage() {
  const { reloadIndex } = useAppState();
  const realms = useRealms();
  const recordTypes = useRecordTypes();
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);
  const [parts, setParts] = useState<string[]>(['body', 'player_summary', 'fields', 'notes']);
  const [type, setType] = useState('');
  const [realm, setRealm] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const query = { find, replace, matchCase, wholeWord, parts, ...(type ? { type } : {}), ...(realm ? { realm } : {}) };
  // Any change to what is asked makes the list on screen out of date.
  const stale = <T,>(set: (v: T) => void) => (v: T) => (set(v), setFound(null));

  const search = async () => {
    setBusy(true);
    setDone(null);
    try {
      setFound(await api.post<Found>('/api/find', query));
      setOff(new Set());
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  const chosen = found ? found.records.filter((r) => !off.has(r.id)) : [];
  const apply = async () => {
    if (!found || !chosen.length) return;
    const n = chosen.reduce((s, r) => s + r.count, 0);
    if (!(await ask({ title: `Replace in ${chosen.length} ${chosen.length === 1 ? 'record' : 'records'}?`, body: `“${find}” becomes “${replace}” ${n} ${n === 1 ? 'time' : 'times'}. A backup is made first, and each record keeps its earlier text in its history.`, confirmLabel: 'Replace' }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ changed: number; matches: number; backup: string }>('/api/replace', { ...query, ...(found.more && !off.size ? {} : { ids: chosen.map((c) => c.id) }) });
      setDone(`Replaced ${r.matches} ${r.matches === 1 ? 'time' : 'times'} in ${r.changed} ${r.changed === 1 ? 'record' : 'records'}. Backup first: ${r.backup}.`);
      setFound(null);
      await reloadIndex();
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Find and Replace" subtitle="Change a word or a name wherever it is written in your records. You see every change before it is made." icon={<Replace size={20} />} />
      <Card className="space-y-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (find) void search();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Find">
              <input className="input" value={find} onChange={(e) => stale(setFind)(e.target.value)} maxLength={500} />
            </Field>
            <Field label="Replace with">
              <input className="input" value={replace} onChange={(e) => stale(setReplace)(e.target.value)} maxLength={2000} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Check checked={wholeWord} onChange={stale(setWholeWord)}>
              Whole words only
            </Check>
            <Check checked={matchCase} onChange={stale(setMatchCase)}>
              Match capitals
            </Check>
            <span className="text-dim">In:</span>
            {PARTS.map(([k, label]) => (
              <Check key={k} checked={parts.includes(k)} onChange={(on) => stale(setParts)(on ? [...parts, k] : parts.filter((p) => p !== k))}>
                {label}
              </Check>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <select className="input w-auto" value={type} onChange={(e) => stale(setType)(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {recordTypes.list
                .filter((t) => !t.traits.meta)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
            </select>
            {realms.list.filter((r) => !r.archived).length > 1 && (
              <select className="input w-auto" value={realm} onChange={(e) => stale(setRealm)(e.target.value)} aria-label="World or realm">
                <option value="">All worlds and realms</option>
                {realms.list
                  .filter((r) => !r.archived)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            )}
            <button className="btn-primary" type="submit" disabled={!find || !parts.length || busy}>
              <Search size={14} /> {busy && !found ? 'Looking…' : 'Find'}
            </button>
          </div>
        </form>
        <p className="text-xs text-dim">
          Renaming a record? Change its name on the record itself: links to it follow. Use this for the places its old name is written out in other records’ text.
        </p>
      </Card>
      {done && <Card className="border-ok/50 bg-ok/10 text-sm text-ok">{done}</Card>}
      {found &&
        (found.records.length ? (
          <div data-testid="find-results">
            <Card
              title={`${found.matches} ${found.matches === 1 ? 'place' : 'places'} in ${found.records.length}${found.more ? '+' : ''} ${found.records.length === 1 ? 'record' : 'records'}`}
              actions={
                <button type="button" className="btn-primary text-sm" disabled={busy || !chosen.length || find === replace} onClick={() => void apply()}>
                  <Replace size={14} /> Replace in {chosen.length}
                </button>
              }
              flush
            >
              {found.more && <p className="px-4 pb-2 text-xs text-dim">Showing the first 500 records. With all of them ticked, the rest are changed too.</p>}
              <ul className="divide-y divide-line/60">
                {found.records.map((r) => (
                  <li key={r.id} className="flex gap-3 px-4 py-2">
                    <Check checked={!off.has(r.id)} onChange={(on) => setOff((s) => (on ? new Set([...s].filter((x) => x !== r.id)) : new Set([...s, r.id])))} label={`Change ${r.name}`}>
                      <span className="sr-only">Change {r.name}</span>
                    </Check>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link to={`/e/${encodeURIComponent(r.id)}`} className="font-medium hover:text-gold">
                          {r.name}
                        </Link>
                        <TypeBadge type={r.type} />
                        <span className="text-xs text-dim">{r.where.join(' · ')}</span>
                      </div>
                      <div className="mt-1 text-xs">
                        <div className="truncate text-dim line-through decoration-danger/60">{r.before}</div>
                        <div className="truncate">{r.after}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : (
          <Empty title="Not found">Nothing in your records matches. Try without “Whole words only”, or look in more parts.</Empty>
        ))}
    </div>
  );
}
