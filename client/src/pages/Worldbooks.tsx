/**
 * Library → Worldbooks (docs/WORLDBOOKS_PLAN.md): the worlds the app can add to this library (bundled with it, or added
 * to this computer), and the ones it has. Adding brings in the worldbook's realms, record types, templates and content;
 * updating brings in what's new without touching the GM's own work; removing takes out only what the worldbook brought.
 * (Internally a worldbook is still a "pack": packs/, /api/setting-packs.)
 */
import { useRef, useState } from 'react';
import { BookCopy, Download, LibraryBig, RefreshCw, Share2, Trash2, Upload } from 'lucide-react';
import type { PackInfo } from '@shared/packs';
import { api } from '../lib/api';
import { useAppState } from '../lib/store';
import { packsChanged, usePacks } from '../lib/packs';
import { PageHeader } from '../components/ui/pageHeader';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { ask, toast } from '../components/ui/overlays';
import { Empty, ErrorBox, Loading } from '../components/ui/feedback';
import { Check, Field } from '../components/ui/inputs';

interface UpdateResult {
  backup: string;
  records: number;
  clashes: { id: string; name: string }[];
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
};

interface Added {
  id: string;
  name: string;
  version: string;
  description: string;
  counts: Record<string, number>;
}

/** Start a new library with a worldbook, and open it. */
async function startLibrary(id: string) {
  await api.post(`/api/libraries/from-worldbook/${encodeURIComponent(id)}`, {});
  window.location.assign('/');
}

/** Share as a worldbook: the open library's own world, as a .worldbook file. */
function SharePanel({ onClose }: { onClose: () => void }) {
  const { realms } = useAppState();
  const world = realms.find((r) => r.id === 'world');
  const [f, setF] = useState({ name: world?.name && world.name !== 'The World' ? world.name : '', description: world?.description ?? '', author: '', licence: '', gmOnly: false });
  const href = `/api/worldbooks/share?${new URLSearchParams({
    name: f.name,
    description: f.description,
    author: f.author,
    licence: f.licence,
    gmOnly: f.gmOnly ? 'leave-out' : 'keep',
  }).toString()}`;
  return (
    <section data-testid="share-worldbook">
      <Card title="Share as a worldbook" icon={<Share2 size={14} />} className="space-y-3">
        <p className="text-sm text-dim">
          A file another GM adds to their app: this library&apos;s own world (its realms, record types, templates, calendar and modules, every record, its links and timeline, its maps with their pins,
          routes and outlines). Never your campaigns, characters, sessions or what your players have been shown. Worldbooks you added to this library aren&apos;t included; the other GM adds those
          themselves.
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
        <Check checked={f.gmOnly} onChange={(v) => setF({ ...f, gmOnly: v })} label="Leave out GM-only sections">
          <span className="text-sm">Leave out GM-only sections (for a world shared with players in mind)</span>
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
              {[added.description, added.counts.records != null && `${added.counts.records} record${added.counts.records === 1 ? '' : 's'}`, added.counts.maps ? `${added.counts.maps} map${added.counts.maps === 1 ? '' : 's'}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!!busy} onClick={() => (setBusy(added.id), void startLibrary(added.id).finally(() => setBusy(null)))}>
                <LibraryBig size={14} /> {busy === added.id ? 'Starting…' : 'Start a library with it'}
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
                  {p.installed ? <Badge tone="ok">In this library</Badge> : <Badge>Not in this library</Badge>}
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
                      <button className="btn" disabled={!!busy} onClick={() => (setBusy(p.id), void startLibrary(p.id).finally(() => setBusy(null)))}>
                        <LibraryBig size={14} /> Start a library with it
                      </button>
                    )}
                    <button className="btn-primary" disabled={!!busy} onClick={() => void run(p, 'install')}>
                      <Download size={14} /> {busy === p.id ? 'Adding…' : 'Add to this library'}
                    </button>
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
