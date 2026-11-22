/**
 * Rules packs, in Settings: the game rules the character sheet and builder draw on. The SRD 5.2.1 is built in (and can
 * be turned off); anything else comes from packs the GM imports (material from their own books, or homebrew), which
 * stay in this library and are never published, exported for players, or part of the app itself.
 */
import { useRef, useState } from 'react';
import { BookOpen, Trash2, Upload } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { reloadRules } from '../player/sheet/options';
import { Badge, Card, Check, Loading, ask } from '../components/ui';

interface Pack {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  builtin: boolean;
  imported_at: string | null;
  counts: Record<string, number>;
  /** Openly licensed, so it can be published to players; and whether it is. */
  open?: boolean;
  publish?: boolean;
}

const KINDS: [string, string][] = [
  ['spell', 'spells'],
  ['species', 'species'],
  ['class', 'classes'],
  ['subclass', 'subclasses'],
  ['background', 'backgrounds'],
  ['feat', 'feats'],
  ['creature', 'creatures'],
  ['item', 'items'],
];

export function RulesPacksPanel() {
  const { data, setData } = useApi<Pack[]>('/api/rules/packs');
  const input = useRef<HTMLInputElement>(null);
  const ft = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [scan, setScan] = useState<{ token: string; books: ScannedBook[]; chosen: string[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open5e, setOpen5e] = useState(false);
  const changed = (packs: Pack[]) => {
    setData(packs);
    reloadRules();
  };
  return (
    <Card title="Rules packs" icon={<BookOpen size={14} />} className="space-y-3">
      <p className="text-sm text-dim">
        The rules the character sheets and the builder use: spells, species, class and subclass features, backgrounds and feats. Packs from your books also bring creatures (in Your Books, the
        encounter tracker and NPC cards; only you see them) and items (their rules show in treasure and on sheets). Import a pack made from your own books, or your homebrew, as a zip of Markdown
        files. Packs stay in this library: they reach your sheets and your table server, never a player export or a campaign export, and never the published handbook unless a pack is openly licensed
        (CC BY, OGL, CC0, ORC) and you choose Publish to players. Where packs overlap, the newest wins, and any pack wins over the SRD.
      </p>
      <ul className="divide-y divide-line/60">
        {(data ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
            <Check
              className="flex flex-1 min-w-[14rem]"
              checked={p.enabled}
              label={`Use ${p.name}`}
              onChange={async (v) => changed(await api.patch<Pack[]>(`/api/rules/packs/${encodeURIComponent(p.id)}`, { enabled: v }))}
            >
              <span>
                <span className="font-medium">{p.name}</span>
                {p.builtin && <Badge className="ml-2">built in</Badge>}
                <span className="block text-xs text-dim">
                  {[
                    p.source,
                    KINDS.filter(([k]) => p.counts[k])
                      .map(([k, label]) => `${p.counts[k]} ${label}`)
                      .join(', '),
                    p.imported_at && `imported ${new Date(p.imported_at).toLocaleDateString()}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </Check>
            {p.open && p.enabled && (
              <Check
                checked={!!p.publish}
                label={`Publish ${p.name} to players`}
                onChange={async (v) => changed(await api.patch<Pack[]>(`/api/rules/packs/${encodeURIComponent(p.id)}`, { publish: v }))}
              >
                <span className="text-xs">Publish to players</span>
              </Check>
            )}
            {!p.builtin && (
              <button
                className="btn-ghost"
                aria-label={`Remove ${p.name}`}
                onClick={async () => {
                  if (await ask({ body: `Remove ${p.name}? Sheets keep what was already filled in from it.`, danger: true, confirmLabel: 'Remove' }))
                    changed(await api.del<Pack[]>(`/api/rules/packs/${encodeURIComponent(p.id)}`));
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => input.current?.click()}>
          <Upload size={14} /> Import a rules pack
        </button>
        <button className="btn" onClick={() => ft.current?.click()} title="Your own copy of the 5etools data, as a zip">
          <Upload size={14} /> Import your books from 5etools
        </button>
        <button className="btn" onClick={() => setOpen5e(true)} title="Openly licensed fifth-edition content: Level Up A5E, Kobold Press and more">
          <Upload size={14} /> Add open content from Open5e
        </button>
        <span className="text-xs text-dim">The format is in docs/RULES_PACKS.md. Importing a pack with the same name replaces it.</span>
      </div>
      <input
        ref={ft}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label="5etools zip"
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setMsg('Reading your 5etools copy… (a large file takes a moment to upload)');
          setProblems([]);
          try {
            const r = await api.upload<{ token: string; books: ScannedBook[]; chosen: string[] }>('/api/rules/5etools/scan', 'data', f);
            setScan(r);
            setPicked(new Set(r.chosen.filter((id) => r.books.some((b) => b.id === id))));
            setMsg('');
          } catch (x) {
            setMsg((x as Error).message);
          }
        }}
      />
      {open5e && (
        <Open5ePicker
          onCancel={() => setOpen5e(false)}
          onDone={(msg, packs) => {
            setOpen5e(false);
            setMsg(msg);
            changed(packs);
          }}
        />
      )}
      {scan && (
        <BookPicker
          scan={scan}
          picked={picked}
          setPicked={setPicked}
          onCancel={() => setScan(null)}
          onImport={async () => {
            setMsg('Importing your books…');
            try {
              const r = await api.post<{ pack: Pack; result: { counts: Record<string, number>; legacySpecies: string[]; missingSpecies: string[] } }>('/api/rules/5etools/import', {
                token: scan.token,
                books: [...picked],
              });
              const c = r.result.counts;
              setMsg(
                `Imported from ${picked.size} book${picked.size === 1 ? '' : 's'}: ${c.spell ?? 0} spells, ${c.species ?? 0} species, ${c.class ?? 0} classes, ${c.subclass ?? 0} subclasses, ${c.background ?? 0} backgrounds, ${c.feat ?? 0} feats, ${c.creature ?? 0} creatures, ${c.item ?? 0} items.` +
                  (r.result.legacySpecies.length ? ` From other books, because your peoples name them: ${r.result.legacySpecies.join(', ')}.` : '') +
                  (r.result.missingSpecies.length ? ` Not found: ${r.result.missingSpecies.join(', ')}.` : ''),
              );
              setScan(null);
              changed(await api.get<Pack[]>('/api/rules/packs'));
            } catch (x) {
              setMsg((x as Error).message);
            }
          }}
        />
      )}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label="Rules pack file"
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setMsg('Importing…');
          setProblems([]);
          try {
            const r = await api.upload<{ pack: Pack; problems: string[] }>('/api/rules/packs', 'pack', f);
            setMsg(`Imported ${r.pack.name}.`);
            setProblems(r.problems);
            changed(await api.get<Pack[]>('/api/rules/packs'));
          } catch (x) {
            setMsg((x as Error).message);
          }
        }}
      />
      {msg && (
        <p className="text-sm" aria-live="polite">
          {msg}
        </p>
      )}
      {problems.length > 0 && (
        <details className="text-xs text-dim">
          <summary>
            {problems.length} file{problems.length === 1 ? '' : 's'} skipped
          </summary>
          <ul className="list-disc pl-5">
            {problems.slice(0, 50).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

interface ScannedBook {
  id: string;
  name: string;
  published: string;
  group: string;
  counts: Record<string, number>;
  unofficial: boolean;
}

/** Choose which books in the 5etools copy to import. */
function BookPicker({
  scan,
  picked,
  setPicked,
  onImport,
  onCancel,
}: {
  scan: { books: ScannedBook[]; chosen: string[] };
  picked: Set<string>;
  setPicked: (s: Set<string>) => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  // The books chosen last time (or by default) first, then the rest, newest first.
  const chosenFirst = [...scan.books].sort((a, b) => Number(scan.chosen.includes(b.id)) - Number(scan.chosen.includes(a.id)));
  const shown = chosenFirst.filter((b) => (showAll || !b.unofficial || picked.has(b.id)) && (!q || `${b.name} ${b.id}`.toLowerCase().includes(q.toLowerCase())));
  const unofficial = scan.books.filter((b) => b.unofficial).length;
  const summary = (c: Record<string, number>) =>
    KINDS.filter(([k]) => c[k])
      .map(([k, label]) => `${c[k]} ${label}`)
      .join(', ');
  return (
    <div className="rounded border border-gold/40 p-3 space-y-2">
      <div className="text-sm font-medium">Choose the books to import</div>
      <p className="text-xs text-dim">
        Only books with rules, creatures or items are listed: your last choice first, then the rest, newest first. Where two chosen books have the same rule, the newer printing wins. Your choice is
        remembered for next time.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input max-w-xs" placeholder="Find a book" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a book" />
        <button className="btn-ghost text-xs" onClick={() => setPicked(new Set())}>
          Clear
        </button>
        {unofficial > 0 && (
          <Check checked={showAll} onChange={setShowAll}>
            Show {unofficial} playtest or unlisted sources
          </Check>
        )}
      </div>
      <ul className="max-h-80 overflow-auto divide-y divide-line/50">
        {shown.map((b) => (
          <li key={b.id}>
            <Check className="flex py-1.5" checked={picked.has(b.id)} onChange={() => toggle(b.id)} label={b.name}>
              {b.name}
              {b.unofficial && <Badge className="ml-2">playtest or unlisted</Badge>}
              <span className="block text-xs text-dim">{[b.published.slice(0, 4), summary(b.counts)].filter(Boolean).join(' · ')}</span>
            </Check>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!picked.size} onClick={onImport}>
          Import {picked.size} book{picked.size === 1 ? '' : 's'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface Open5eDoc {
  key: string;
  name: string;
  publisher: string;
  licences: string[];
  system: string;
  builtIn: boolean;
}

/** Choose openly licensed sources from Open5e; each comes in as its own pack, named with its publisher and licence. */
function Open5ePicker({ onCancel, onDone }: { onCancel: () => void; onDone: (msg: string, packs: Pack[]) => void }) {
  const { data, error } = useApi<Open5eDoc[]>('/api/rules/open5e/documents');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const toggle = (k: string) => {
    const n = new Set(picked);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPicked(n);
  };
  const go = async () => {
    setBusy(`Importing ${picked.size} source${picked.size === 1 ? '' : 's'} from Open5e… (a large one takes half a minute)`);
    try {
      const r = await api.post<{ packs: Pack[]; results: { name: string; counts: Record<string, number> }[] }>('/api/rules/open5e/import', { documents: [...picked] });
      onDone(
        r.results
          .map(
            (x) =>
              `${x.name}: ${KINDS.filter(([k]) => x.counts[k])
                .map(([k, label]) => `${x.counts[k]} ${label}`)
                .join(', ')}`,
          )
          .join('. ') + '.',
        r.packs,
      );
    } catch (x) {
      setBusy((x as Error).message);
    }
  };
  return (
    <div className="rounded border border-gold/40 p-3 space-y-2">
      <div className="text-sm font-medium">Open content from Open5e</div>
      <p className="text-xs text-dim">
        Openly licensed fifth-edition material, from api.open5e.com. Each source comes in as its own pack, named with its publisher and licence, and stays in this library like any other. Some were
        written for the 2014 rules: check them before your players use them. Creatures and items come in with their rules; species and classes from these sources aren&apos;t imported yet.
      </p>
      {error && <p className="text-danger text-sm">Couldn&apos;t reach Open5e: {error.message}</p>}
      {!data && !error && <Loading inline label="Asking Open5e what it has…" />}
      <ul className="max-h-80 overflow-auto divide-y divide-line/50">
        {(data ?? []).map((d) => (
          <li key={d.key}>
            <Check className="flex py-1.5" disabled={d.builtIn} checked={picked.has(d.key)} onChange={() => toggle(d.key)} label={d.name}>
              {d.name}
              {d.licences.map((l) => (
                <Badge key={l} className="ml-2">
                  {l}
                </Badge>
              ))}
              <span className="block text-xs text-dim">{[d.publisher, d.system, d.builtIn && 'already built in'].filter(Boolean).join(' · ')}</span>
            </Check>
          </li>
        ))}
      </ul>
      {busy && (
        <p className="text-sm" aria-live="polite">
          {busy}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!picked.size || !!busy} onClick={go}>
          Import {picked.size} source{picked.size === 1 ? '' : 's'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
