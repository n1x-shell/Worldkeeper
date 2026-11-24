/**
 * Library → Worldbooks (docs/WORLDBOOKS_PLAN.md): the worlds the app can add to this library (bundled with it, or added
 * to this computer), and the ones it has. Adding brings in the worldbook's realms, record types, templates and content;
 * updating brings in what's new without touching the GM's own work; removing takes out only what the worldbook brought.
 * (Internally a worldbook is still a "pack": packs/, /api/setting-packs.)
 */
import { useRef, useState } from 'react';
import { BookCopy, Download, LibraryBig, RefreshCw, Share2, Trash2, Upload } from 'lucide-react';
import type { PackInfo } from '@shared/packs';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { packsChanged, usePacks } from '../lib/packs';
import { PageHeader } from '../components/ui/pageHeader';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { ask, toast } from '../components/ui/overlays';
import { Empty, ErrorBox, Loading } from '../components/ui/feedback';
import { Check, Field } from '../components/ui/inputs';

interface BooksReport {
  mode: 'required' | 'optional' | 'safe' | null;
  missing: { book: string; things: { kind: string; name: string }[] }[];
  switchedOn: string[];
  standIns: number;
}

interface UpdateResult {
  backup: string;
  records: number;
  clashes: { id: string; name: string }[];
  books?: BooksReport;
}

const KIND_WORD: Record<string, [string, string]> = { species: ['species', 'species'], class: ['class', 'classes'], item: ['item', 'items'], creature: ['creature', 'creatures'] };
/** "6 items, 2 species" */
const thingCounts = (things: { kind: string }[]) =>
  Object.entries(things.reduce<Record<string, number>>((n, t) => ((n[t.kind] = (n[t.kind] ?? 0) + 1), n), {}))
    .map(([k, n]) => `${n} ${(KIND_WORD[k] ?? [k, `${k}s`])[n === 1 ? 0 : 1]}`)
    .join(', ');

/** What adding said about the books: what's missing, what was switched on, the stand-ins in use. */
function booksSummary(b: BooksReport | undefined): string[] {
  if (!b) return [];
  const out: string[] = [];
  if (b.switchedOn.length) out.push(`Switched on in this library: ${b.switchedOn.join(', ')}.`);
  for (const m of b.missing)
    out.push(
      m.book === 'Not in your rules'
        ? `Not in your rules: ${m.things
            .map((t) => t.name)
            .slice(0, 12)
            .join(', ')}${m.things.length > 12 ? '…' : ''}. They show by name only.`
        : `${m.book}, which you don't have: ${thingCounts(m.things)} (${m.things
            .map((t) => t.name.replace(/\s*\([A-Za-z]{2,5}\)$/, ''))
            .slice(0, 6)
            .join(', ')}${m.things.length > 6 ? '…' : ''}).`,
    );
  if (b.standIns) out.push(`${b.standIns} open stand-in${b.standIns === 1 ? '' : 's'} in use until you have the book.`);
  return out;
}

const MODULE_LABEL: Record<string, string> = {
  thinning: 'The Thinning',
  'the-return': 'The Return',
  'fading-salvage': 'Fading and salvage',
  'setting-treasure': 'Treasure catalogue',
  vaults: 'Vaults',
  shards: 'Shards',
  'depths-explorer': 'Depths explorer',
  'quick-reference': 'Quick reference',
  renown: 'Renown',
};

interface Added {
  id: string;
  name: string;
  version: string;
  description: string;
  counts: Record<string, number>;
}

/** Start a new library with a worldbook, and open it (saying first what it found about the books, once). */
async function startLibrary(id: string) {
  const r = await api.post<{ books: BooksReport; booksOnly: { on: boolean; keep: string[] } | null }>(`/api/libraries/from-worldbook/${encodeURIComponent(id)}`, {});
  const lines = booksSummary(r.books);
  if (r.booksOnly?.on)
    lines.unshift(
      `You have every book this world draws on, so the new library uses your books alone${r.booksOnly.keep.length ? `; the open rules stay for ${r.booksOnly.keep.map((k) => KIND_WORD[k]?.[1] ?? `${k}s`).join(', ')}, which your books don't have` : ''}. Change it in Settings → Rules packs → Books only.`,
    );
  if (lines.length)
    await ask({
      title: 'Your books',
      body: (
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ),
      confirmLabel: 'Open the library',
    });
  window.location.assign('/');
}

interface ShareBooks {
  books: { name: string; things: { kind: string; name: string }[] }[];
  standIns: { kind: string; name: string; book: string; standIn: string }[];
  choices: Record<string, string[]>;
  open: { id: string; name: string; source: string }[];
  missing: { kind: string; name: string }[];
}

/** How the books a world draws on count when it's shared: required, optional, or safe mode with open stand-ins. */
function BooksChoice({ mode, setMode, swaps, setSwaps }: { mode: string; setMode: (m: string) => void; swaps: Record<string, string>; setSwaps: (s: Record<string, string>) => void }) {
  const { data } = useApi<ShareBooks>('/api/worldbooks/share/books');
  if (!data) return null;
  if (!data.books.length)
    return (
      <p className="text-sm text-dim" data-testid="share-books">
        This world names nothing from a closed book, so anyone can add it.
        {data.open.length ? ` The open rules it uses (${data.open.map((p) => p.name).join(', ')}) travel with it, with their credits.` : ''}
      </p>
    );
  const opt = (key: string, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="radio" name="books" checked={mode === key} onChange={() => setMode(key)} className="mt-1" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-dim">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-2 rounded-md border border-line/70 p-3" data-testid="share-books">
      <div className="text-sm">
        It draws on {data.books.length === 1 ? 'a book' : 'books'} of yours: {data.books.map((b) => `${b.name} (${thingCounts(b.things)})`).join('; ')}. A worldbook never holds book text, only names.
        How should the books count?
      </div>
      {opt('required', 'Books required', 'It can’t be added without these books.')}
      {opt('optional', 'Books optional', 'It can be added without them, with a warning; those things show by name only.')}
      {opt('safe', 'Safe mode', 'Anyone can add it: each thing only a book has gets an open stand-in of the same kind. A GM with the book gets the original.')}
      {mode === 'safe' && (
        <ul className="divide-y divide-line/60 text-sm">
          {data.standIns.map((x) => {
            const key = `${x.kind}:${x.name}`;
            return (
              <li key={key} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="flex-1 min-w-48">
                  {x.name}{' '}
                  <span className="text-xs text-dim">
                    ({x.kind}, {x.book})
                  </span>
                </span>
                <span className="text-dim">→</span>
                <select className="input w-auto" aria-label={`Stand-in for ${x.name}`} value={swaps[key] ?? x.standIn} onChange={(e) => setSwaps({ ...swaps, [key]: e.target.value })}>
                  {(data.choices[x.kind] ?? [x.standIn]).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      {!!data.open.length && <p className="text-xs text-dim">The open rules it uses ({data.open.map((p) => p.name).join(', ')}) travel with it, with their credits.</p>}
    </div>
  );
}

/** Share as a worldbook: the open library's own world, as a .worldbook file. */
function SharePanel({ onClose }: { onClose: () => void }) {
  const { realms } = useAppState();
  const world = realms.find((r) => r.id === 'world');
  const [f, setF] = useState({ name: world?.name && world.name !== 'The World' ? world.name : '', description: world?.description ?? '', author: '', licence: '', gmOnly: false });
  const [mode, setMode] = useState('optional');
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const href = `/api/worldbooks/share?${new URLSearchParams({
    name: f.name,
    description: f.description,
    author: f.author,
    licence: f.licence,
    gmOnly: f.gmOnly ? 'leave-out' : 'keep',
    books: mode,
    swaps: JSON.stringify(mode === 'safe' ? swaps : {}),
  }).toString()}`;
  return (
    <section data-testid="share-worldbook">
      <Card title="Share as a worldbook" icon={<Share2 size={14} />} className="space-y-3">
        <p className="text-sm text-dim">
          A file another GM adds to their app: this library&apos;s own world (its realms, record types, templates, calendar and modules, every record, its links and timeline, its adventures, random
          tables and stat blocks, your own items and spells, its pictures, its maps with their pins, routes and outlines). Never your campaigns, characters, sessions or what your players have been shown. Worldbooks you added to this library
          aren&apos;t included; the other GM adds those themselves.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ostmark" />
          </Field>
          <Field label="By (optional)">
            <input className="input" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
          </Field>
          <Field label="What it is">
            <textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Licence (optional)" hint="How others may use it, e.g. CC BY 4.0.">
            <input className="input" value={f.licence} onChange={(e) => setF({ ...f, licence: e.target.value })} />
          </Field>
        </div>
        <BooksChoice mode={mode} setMode={setMode} swaps={swaps} setSwaps={setSwaps} />
        <Check checked={f.gmOnly} onChange={(v) => setF({ ...f, gmOnly: v })} label="Leave out GM-only sections, adventures, stat blocks and your own items">
          <span className="text-sm">Leave out GM-only sections, adventures, stat blocks and your own items (for a world shared with players in mind)</span>
        </Check>
        <div className="flex flex-wrap gap-2">
          <a className={`btn-primary ${f.name.trim() ? '' : 'pointer-events-none opacity-60'}`} href={href} download aria-disabled={!f.name.trim()}>
            <Download size={14} /> Make the .worldbook
          </a>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </Card>
    </section>
  );
}

export function WorldbooksPage() {
  const { packs, loaded } = usePacks();
  const { reloadIndex, reloadMeta, reloadRealms, reloadTypes, debug } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [clashes, setClashes] = useState<{ pack: string; list: UpdateResult['clashes'] } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [books, setBooks] = useState<{ pack: string; lines: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const after = async () => {
    await Promise.all([packsChanged(), reloadIndex(), reloadMeta(), reloadRealms(), reloadTypes()]);
  };
  const run = async (p: PackInfo, what: 'install' | 'update' | 'remove') => {
    setBusy(p.id);
    try {
      if (what === 'remove') {
        await api.del(`/api/setting-packs/${p.id}`);
        toast(`${p.name} removed. A backup was taken first.`);
      } else {
        const r = await api.post<UpdateResult>(`/api/setting-packs/${p.id}/${what}`, {});
        toast(`${p.name} ${what === 'install' ? 'added to this library' : 'updated'}: ${r.records} records. A backup was taken first.`);
        setBooks(r.books && booksSummary(r.books).length ? { pack: p.name, lines: booksSummary(r.books) } : null);
        setClashes(r.clashes.length ? { pack: p.name, list: r.clashes } : null);
      }
      await after();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Worldbooks"
        subtitle="Whole worlds to add to this library: their places, peoples, record types, templates, maps and tools."
        note="Your own records are never changed. Updating brings in what's new; removing takes out only what the worldbook brought. A backup is taken before each."
        actions={
          <>
            <button className="btn" onClick={() => setSharing((v) => !v)}>
              <Share2 size={14} /> Share as a worldbook…
            </button>
            <button className="btn" onClick={() => file.current?.click()}>
              <Upload size={14} /> Add a worldbook…
            </button>
          </>
        }
      />
      <input
        ref={file}
        type="file"
        accept=".worldbook,.zip,application/zip"
        className="sr-only"
        aria-label="Worldbook file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setErr(null);
          try {
            const r = await api.upload<{ worldbook: Added }>('/api/worldbooks/add', 'file', f);
            setAdded(r.worldbook);
            await packsChanged();
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      />
      {err && <ErrorBox error={err} />}
      {sharing && <SharePanel onClose={() => setSharing(false)} />}
      {added && (
        <section data-testid="worldbook-added">
          <Card className="space-y-2">
            <div className="font-display text-gold text-lg">{added.name} is on this computer now</div>
            <p className="text-sm text-dim">
              {[
                added.description,
                added.counts.records != null && `${added.counts.records} record${added.counts.records === 1 ? '' : 's'}`,
                added.counts.maps ? `${added.counts.maps} map${added.counts.maps === 1 ? '' : 's'}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!!busy} onClick={() => (setBusy(`start:${added.id}`), void startLibrary(added.id).finally(() => setBusy(null)))}>
                <LibraryBig size={14} /> {busy === `start:${added.id}` ? 'Starting…' : 'Start a library with it'}
              </button>
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => {
                  const p = packs.find((x) => x.id === added.id);
                  if (p) void run(p, 'install').then(() => setAdded(null));
                }}
              >
                <Download size={14} /> Add to this library
              </button>
            </div>
          </Card>
        </section>
      )}
      {!loaded ? (
        <Loading />
      ) : !packs.length ? (
        <Empty title="No worldbooks" icon={<BookCopy size={18} />}>
          This copy of the app has no worldbooks to add. Your world is your own.
        </Empty>
      ) : (
        packs.map((p) => (
          <Card key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[16rem]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-gold text-lg">{p.name}</span>
                  {p.installed ? <Badge tone="ok">In this library</Badge> : p.madeHere ? <Badge tone="gold">Made from this library</Badge> : <Badge>Not in this library</Badge>}
                  {p.installed && p.installed.version !== p.version && <Badge tone="warn">Update available</Badge>}
                  {debug && (
                    <Badge title="Where the worldbook comes from">
                      {p.source === 'bundled' ? 'comes with the app' : 'added to this computer'} · {p.id} · v{p.version}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-dim mt-1">{p.description}</p>
                {p.installed && <p className="text-xs text-dim mt-1">{p.records ?? 0} records from this worldbook.</p>}
                {!!p.modules.length && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.modules.map((m) => (
                      <Badge key={m} tone="arcane">
                        {MODULE_LABEL[m] ?? m}
                      </Badge>
                    ))}
                  </div>
                )}
                {p.licence && <p className="text-xs text-dim mt-2">Licence: {p.licence}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!p.installed ? (
                  <>
                    {p.source === 'installed' && (
                      <button className="btn" disabled={!!busy} onClick={() => (setBusy(`start:${p.id}`), void startLibrary(p.id).finally(() => setBusy(null)))}>
                        <LibraryBig size={14} /> Start a library with it
                      </button>
                    )}
                    {!p.madeHere && (
                      <button className="btn-primary" disabled={!!busy} onClick={() => void run(p, 'install')}>
                        <Download size={14} /> {busy === p.id ? 'Adding…' : 'Add to this library'}
                      </button>
                    )}
                    {p.source === 'installed' && (
                      <button
                        className="btn-ghost"
                        disabled={!!busy}
                        aria-label={`Remove ${p.name} from this computer`}
                        title="Remove from this computer"
                        onClick={async () => {
                          if (
                            !(await ask({
                              title: `Remove ${p.name} from this computer?`,
                              body: 'It goes from the worldbooks you can add, in every library. If a library still has it, you’ll be told which: remove it from that library first. You can add it again from its .worldbook file.',
                              confirmLabel: 'Remove from this computer',
                              danger: true,
                            }))
                          )
                            return;
                          setErr(null);
                          try {
                            await api.del(`/api/worldbooks/${encodeURIComponent(p.id)}`);
                            if (added?.id === p.id) setAdded(null);
                            toast(`${p.name} removed from this computer.`);
                            await packsChanged();
                          } catch (x) {
                            setErr((x as Error).message);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn-primary" disabled={!!busy} onClick={() => void run(p, 'update')}>
                      <RefreshCw size={14} /> {busy === p.id ? 'Updating…' : 'Update'}
                    </button>
                    <button
                      className="btn"
                      disabled={!!busy}
                      onClick={async () => {
                        if (
                          await ask({
                            title: `Remove ${p.name} from this library?`,
                            body: `Its ${p.records ?? 0} records go, with their links, maps, adventures, tables, rumours and mysteries. Your own records stay; links from them to the worldbook's records will show in Broken references. A backup is taken first.`,
                            confirmLabel: 'Remove',
                            danger: true,
                          })
                        )
                          void run(p, 'remove');
                      }}
                    >
                      <Trash2 size={14} /> Remove from this library
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
      {books && (
        <section data-testid="books-report">
          <Card className="space-y-1">
            <div className="font-display text-gold">{books.pack} and your books</div>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {books.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {clashes && (
        <Card className="space-y-1">
          <div className="font-display text-gold">Records kept as yours</div>
          <p className="text-sm text-dim">
            {clashes.pack} has records with the same ID as some of yours. Yours were kept, and the worldbook's versions weren't brought in. Give yours a new ID to bring the worldbook's in on its next
            update.
          </p>
          <ul className="text-sm list-disc pl-5">
            {clashes.list.map((c) => (
              <li key={c.id}>
                {c.name} {debug && <span className="text-dim">({c.id})</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
