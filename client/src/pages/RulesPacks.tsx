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
  const [msg, setMsg] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
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
        <span className="text-xs text-dim">The format is in docs/RULES_PACKS.md. Importing a pack with the same name replaces it.</span>
      </div>
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
