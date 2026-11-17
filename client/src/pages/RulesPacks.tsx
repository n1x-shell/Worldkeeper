/**
 * Rules packs, in Settings: the game rules the character sheet and builder draw on. The SRD 5.2.1 is built in (and can
 * be turned off); anything else comes from packs the GM imports (material from their own books, or homebrew), which
 * stay in this library and are never published, exported for players, or part of the app itself.
 */
import { useRef, useState } from 'react';
import { BookOpen, Trash2, Upload } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { reloadRules } from '../player/sheet/options';

interface Pack {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  builtin: boolean;
  imported_at: string | null;
  counts: Record<string, number>;
}

const KINDS: [string, string][] = [
  ['spell', 'spells'],
  ['species', 'species'],
  ['class', 'classes'],
  ['subclass', 'subclasses'],
  ['background', 'backgrounds'],
  ['feat', 'feats'],
];

export function RulesPacksPanel() {
  const { data, setData } = useApi<Pack[]>('/api/rules/packs');
  const input = useRef<HTMLInputElement>(null);
  const ft = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [scan, setScan] = useState<{ token: string; books: ScannedBook[]; chosen: string[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const changed = (packs: Pack[]) => {
    setData(packs);
    reloadRules();
  };
  return (
    <div className="panel-pad space-y-3">
      <div className="section-title flex items-center gap-2">
        <BookOpen size={14} /> Rules packs
      </div>
      <p className="text-sm text-dim">
        The rules the character sheets and the builder use: spells, species, class and subclass features, backgrounds and feats. Import a pack made from your own books, or your homebrew, as a zip of
        Markdown files. Packs stay in this library: they reach your sheets and your table server, never the published handbook, a player export or a campaign export. Where packs overlap, the newest
        wins, and any pack wins over the SRD.
      </p>
      <ul className="divide-y divide-line/60">
        {(data ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
            <label className="flex items-center gap-2 flex-1 min-w-[14rem]">
              <input
                type="checkbox"
                checked={p.enabled}
                aria-label={`Use ${p.name}`}
                onChange={async (e) => changed(await api.patch<Pack[]>(`/api/rules/packs/${encodeURIComponent(p.id)}`, { enabled: e.target.checked }))}
              />
              <span>
                <span className="font-medium">{p.name}</span>
                {p.builtin && <span className="chip border-line text-dim ml-2">built in</span>}
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
            </label>
            {!p.builtin && (
              <button
                className="btn-ghost"
                aria-label={`Remove ${p.name}`}
                onClick={async () => {
                  if (confirm(`Remove ${p.name}? Sheets keep what was already filled in from it.`)) changed(await api.del<Pack[]>(`/api/rules/packs/${encodeURIComponent(p.id)}`));
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
                `Imported from ${picked.size} book${picked.size === 1 ? '' : 's'}: ${c.spell ?? 0} spells, ${c.species ?? 0} species, ${c.class ?? 0} classes, ${c.subclass ?? 0} subclasses, ${c.background ?? 0} backgrounds, ${c.feat ?? 0} feats.` +
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
    </div>
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
        Only books with rules for character sheets are listed: your last choice first, then the rest, newest first. Where two chosen books have the same rule, the newer printing wins. Your choice is
        remembered for next time.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input max-w-xs" placeholder="Find a book" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a book" />
        <button className="btn-ghost text-xs" onClick={() => setPicked(new Set())}>
          Clear
        </button>
        {unofficial > 0 && (
          <label className="text-xs flex items-center gap-1.5">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show {unofficial} playtest or unlisted sources
          </label>
        )}
      </div>
      <ul className="max-h-80 overflow-auto divide-y divide-line/50">
        {shown.map((b) => (
          <li key={b.id}>
            <label className="flex items-start gap-2 py-1.5 text-sm">
              <input type="checkbox" className="mt-1" checked={picked.has(b.id)} onChange={() => toggle(b.id)} aria-label={b.name} />
              <span>
                {b.name}
                {b.unofficial && <span className="chip border-line text-dim ml-2">playtest or unlisted</span>}
                <span className="block text-xs text-dim">{[b.published.slice(0, 4), summary(b.counts)].filter(Boolean).join(' · ')}</span>
              </span>
            </label>
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
