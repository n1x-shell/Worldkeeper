/**
 * Manage libraries (docs/LIBRARIES_PLAN.md §3.2): each library is a complete world with its own records, campaigns,
 * settings, backups and handbook. Rename, duplicate, archive and restore, open from a file, show in folder.
 */
import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Copy, Download, FolderOpen, Library as LibraryIcon, Plus, Upload } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { Badge, Card, ErrorBox, Loading, PageHeader, ask, askText, toast } from '../components/ui';
import { newLibrary, openLibrary, records, type LibraryList, type LibraryRow } from '../components/Libraries';

export function LibrariesPage() {
  const { data, setData } = useApi<LibraryList>('/api/libraries?all=1');
  const { data: meta } = useApi<{ desktop?: boolean }>('/api/meta');
  const file = useRef<HTMLInputElement>(null);
  const everything = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Loading />;
  const act = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await f();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const live = data.libraries.filter((l) => !l.archived);
  const archived = data.libraries.filter((l) => l.archived);
  const row = (l: LibraryRow) => {
    const isOpen = l.id === data.open;
    return (
      <li key={l.id} className="py-3 space-y-1.5" data-testid={`library-${l.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <LibraryIcon size={16} className={isOpen ? 'text-gold' : 'text-dim'} />
          <input
            className="input max-w-xs font-display"
            aria-label={`Name of ${l.name}`}
            defaultValue={l.name}
            disabled={l.archived}
            onBlur={(e) => {
              const n = e.target.value.trim();
              if (n && n !== l.name) void act('rename', async () => setData(await api.patch<LibraryList>(`/api/libraries/${l.id}`, { name: n })));
            }}
          />
          {isOpen && <Badge tone="ok">Open</Badge>}
          {l.archived && <Badge>Archived</Badge>}
          <span className="text-xs text-dim">
            {records(l.records)}
            {l.last_opened_at ? ` · last opened ${new Date(l.last_opened_at).toLocaleString()}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {!l.archived && !isOpen && (
            <button className="btn text-xs" disabled={!!busy} onClick={() => void openLibrary(l.id)}>
              <FolderOpen size={12} /> Open
            </button>
          )}
          {!l.archived && (
            <button
              className="btn-ghost text-xs"
              disabled={!!busy}
              onClick={async () => {
                const name = await askText({
                  title: `Duplicate ${l.name}`,
                  body: 'A copy of its records, campaigns, settings and pictures, to try something risky in (a big import, a pack update). Backups aren’t copied.',
                  label: 'Name of the copy',
                  initial: `${l.name} (copy)`,
                  confirmLabel: 'Duplicate',
                });
                if (name?.trim())
                  await act('duplicate', async () => (setData(await api.post<LibraryList>(`/api/libraries/${l.id}/duplicate`, { name: name.trim() })), toast(`Made ${name.trim()}`, 'ok')));
              }}
            >
              <Copy size={12} /> Duplicate
            </button>
          )}
          {!l.archived && !isOpen && (
            <button
              className="btn-ghost text-xs"
              disabled={!!busy}
              onClick={async () => {
                if (await ask({ title: `Archive ${l.name}?`, body: 'It leaves the list; its files stay where they are, and you can restore it here any time.', confirmLabel: 'Archive' }))
                  await act('archive', async () => setData(await api.post<LibraryList>(`/api/libraries/${l.id}/archive`, { archived: true })));
              }}
            >
              <Archive size={12} /> Archive
            </button>
          )}
          {l.archived && (
            <button
              className="btn text-xs"
              disabled={!!busy}
              onClick={() => void act('restore', async () => setData(await api.post<LibraryList>(`/api/libraries/${l.id}/archive`, { archived: false })))}
            >
              <ArchiveRestore size={12} /> Restore
            </button>
          )}
          {meta?.desktop ? (
            <button className="btn-ghost text-xs" onClick={() => void act('show', () => api.post(`/api/libraries/${l.id}/show`, {}))}>
              <FolderOpen size={12} /> Show in folder
            </button>
          ) : (
            <span className="text-[11px] text-dim break-all">
              Folder: <code>{l.dir}</code>
            </span>
          )}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title="Libraries"
        subtitle="Each library is a world of its own: its own records, campaigns, settings, backups and handbook. Your books’ rules and worldbooks are shared by all of them."
        actions={
          <>
            <button className="btn-primary" onClick={() => void newLibrary()}>
              <Plus size={14} /> New library
            </button>
            <button className="btn" disabled={!!busy} onClick={() => file.current?.click()}>
              <Upload size={14} /> Open a library from a file
            </button>
            <a className="btn" href="/api/libraries/everything" download title="Every library and your books’ rules and worldbooks, in one file (not your publishing token)">
              <Download size={14} /> Back up everything
            </a>
            <button className="btn-ghost" disabled={!!busy} onClick={() => everything.current?.click()}>
              <Upload size={14} /> Open everything from a file
            </button>
            <input
              ref={everything}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              aria-label="Everything file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (
                  !(await ask({
                    title: 'Open everything from a file?',
                    body: `Each library in ${f.name} is added as a new library; your books’ rules and worldbooks it has are added too. Nothing here is replaced.`,
                    confirmLabel: 'Add them',
                  }))
                )
                  return;
                await act('everything', async () => {
                  const r = await api.upload<LibraryList & { result: { libraries: { name: string }[]; rules: number; packs: string[] } }>('/api/libraries/everything', 'file', f);
                  setData(r);
                  toast(
                    `Added ${r.result.libraries.length} librar${r.result.libraries.length === 1 ? 'y' : 'ies'}${r.result.rules ? `, ${r.result.rules} rules pack${r.result.rules === 1 ? '' : 's'}` : ''}${r.result.packs.length ? `, ${r.result.packs.length} worldbook${r.result.packs.length === 1 ? '' : 's'}` : ''}`,
                    'ok',
                  );
                });
              }}
            />
            <input
              ref={file}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              aria-label="Full-world ZIP"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const name = await askText({
                  title: 'Open a library from a file',
                  body: `${f.name} becomes a new library, and opens.`,
                  label: 'Name',
                  initial: f.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' '),
                  confirmLabel: 'Open it',
                });
                if (!name?.trim()) return;
                await act('import', async () => {
                  await api.upload(`/api/libraries/import?name=${encodeURIComponent(name.trim())}`, 'file', f);
                  window.location.assign('/');
                });
              }}
            />
          </>
        }
      />
      {err && <ErrorBox error={err} />}
      {busy === 'import' && <Loading label="Opening the library…" />}
      {busy === 'everything' && <Loading label="Adding everything from the file…" />}
      <Card>
        <ul className="divide-y divide-line/60">{live.map(row)}</ul>
      </Card>
      <p className="text-xs text-dim">
        <b>Moving a world</b> to a co-GM or another computer: export it from <b>Add and Share → Full world (ZIP)</b>, and there use <b>Open a library from a file</b>. Backups and restores are each
        library’s own; restoring one never touches another.
      </p>
      {archived.length > 0 && (
        <Card title="Archived">
          <ul className="divide-y divide-line/60">{archived.map(row)}</ul>
        </Card>
      )}
    </div>
  );
}
