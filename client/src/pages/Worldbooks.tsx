/**
 * Library → Worldbooks (docs/WORLDBOOKS_PLAN.md): the worlds the app can add to this library (bundled with it, or added
 * to this computer), and the ones it has. Adding brings in the worldbook's realms, record types, templates and content;
 * updating brings in what's new without touching the GM's own work; removing takes out only what the worldbook brought.
 * (Internally a worldbook is still a "pack": packs/, /api/setting-packs.)
 */
import { useState } from 'react';
import { BookCopy, Download, RefreshCw, Trash2 } from 'lucide-react';
import type { PackInfo } from '@shared/packs';
import { api } from '../lib/api';
import { useAppState } from '../lib/store';
import { packsChanged, usePacks } from '../lib/packs';
import { PageHeader } from '../components/ui/pageHeader';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { ask, toast } from '../components/ui/overlays';
import { Empty, Loading } from '../components/ui/feedback';

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

export function WorldbooksPage() {
  const { packs, loaded } = usePacks();
  const { reloadIndex, reloadMeta, reloadRealms, reloadTypes, debug } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [clashes, setClashes] = useState<{ pack: string; list: UpdateResult['clashes'] } | null>(null);

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
      />
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
                  <button className="btn-primary" disabled={!!busy} onClick={() => void run(p, 'install')}>
                    <Download size={14} /> {busy === p.id ? 'Adding…' : 'Add to this library'}
                  </button>
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
            {clashes.pack} has records with the same ID as some of yours. Yours were kept, and the worldbook's versions weren't brought in. Give yours a new ID to bring the worldbook's in on its next update.
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
