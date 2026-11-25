/**
 * Bring your notes (v0.9.11): an Obsidian vault or a folder of plain Markdown, zipped. The GM says what each folder
 * holds (people, places, factions…), and the notes become records: their [[links]] link the records, the pictures
 * they embed become the records' pictures. It ends in the same preview and confirmation as any addition.
 */
import { useRef, useState } from 'react';
import { zipStored } from '@shared/zipParts';
import { FileArchive, FolderOpen, NotebookPen } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Field } from './ui';

interface Scan {
  token: string;
  notes: number;
  pictures: number;
  folders: { path: string; notes: number; guess: string | null; sample: string[] }[];
  looksLikeNotes: boolean;
  types: { key: string; label: string }[];
  realms: { id: string; name: string; kind: string }[];
  canonReview: boolean;
}

/** What the conversion left out or couldn't do, shown beside the preview. */
export interface NotesReport {
  skipped: { path: string; reason: string }[];
  unresolvedLinks: number;
  pictures: number;
}

const SKIP = 'skip';
const WANTED = /\.(md|png|jpe?g|webp|gif)$/i;

/** `onPreview` gets what `/api/import/preview` returns for any addition (the page's own preview), and the notes' report. */
export function NotesImport({ onPreview, onReset }: { onPreview: (preview: unknown, report: NotesReport) => void; onReset: () => void }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [fallback, setFallback] = useState('custom');
  const [realm, setRealm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const read = async (file: File | null) => {
    setScan(null);
    setErr(null);
    onReset();
    if (!file) return;
    setBusy(true);
    try {
      const s = await api.upload<Scan>('/api/import/notes/scan', 'archive', file);
      setScan(s);
      setFolders(Object.fromEntries(s.folders.filter((f) => f.guess).map((f) => [f.path, f.guess!])));
      setFallback(s.types.some((t) => t.key === 'custom') ? 'custom' : (s.types[0]?.key ?? 'custom'));
      setRealm(s.realms[0]?.name ?? '');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** A folder chosen as it is: its notes and pictures are zipped here (nothing else is read), then sent like an archive. */
  const readFolder = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => WANTED.test(f.name) && !/(^|\/)(\.|__MACOSX)/.test(f.webkitRelativePath || f.name));
    if (zipInput.current) zipInput.current.value = '';
    if (!list?.length) return;
    const refuse = (why: string) => (setScan(null), onReset(), setErr(why));
    if (!files.length) return refuse('No Markdown (.md) notes were found in that folder');
    if (files.reduce((n, f) => n + f.size, 0) > 280 * 1024 * 1024) return refuse('That folder is too large to bring in at once. Bring in part of it, or a ZIP of the notes without the largest pictures.');
    setBusy(true);
    try {
      const parts = zipStored(await Promise.all(files.map(async (f) => ({ name: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
      const name = (files[0].webkitRelativePath || 'notes').split('/')[0] || 'notes';
      setChosen(name);
      await read(new File(parts as BlobPart[], `${name}.zip`, { type: 'application/zip' }));
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };

  const kept = scan ? scan.folders.filter((f) => folders[f.path] !== SKIP).reduce((n, f) => n + f.notes, 0) : 0;

  return (
    <div data-testid="notes-import">
    <Card className="space-y-3">
      <div>
        <div className="label">Your notes (an Obsidian vault or a folder of Markdown)</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            ref={folderInput}
            type="file"
            multiple
            className="sr-only"
            aria-label="The folder your notes are in"
            // Chromium, WebKit and Firefox all read a whole folder with this attribute; it isn't in React's types.
            {...({ webkitdirectory: '' } as object)}
            onChange={(e) => (setChosen(''), void readFolder(e.target.files).then(() => e.target && (e.target.value = '')))}
          />
          <input ref={zipInput} type="file" accept=".zip,application/zip" className="sr-only" aria-label="A ZIP of your notes" onChange={(e) => (setChosen(e.target.files?.[0]?.name ?? ''), void read(e.target.files?.[0] ?? null))} />
          <button type="button" className="btn" disabled={busy} onClick={() => folderInput.current?.click()}>
            <FolderOpen size={14} /> Choose the folder
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => zipInput.current?.click()}>
            <FileArchive size={14} /> or a .zip of it
          </button>
          <span className="text-sm text-dim" aria-live="polite">
            {busy && !scan ? 'Reading…' : chosen}
          </span>
        </div>
      </div>
      {!scan && !busy && (
        <p className="flex items-start gap-2 text-xs text-dim">
          <NotebookPen size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          <span>
            Each note becomes a record. Links between notes (<code>[[Like this]]</code>) link the records, pictures a note embeds become its record&apos;s pictures, and tags and alternate names are kept. Choose the folder your notes are in: only its notes and pictures are read.
          </span>
        </p>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
      {scan && (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{scan.notes}</b> {scan.notes === 1 ? 'note' : 'notes'} in {scan.folders.length} {scan.folders.length === 1 ? 'folder' : 'folders'}
            {scan.pictures > 0 && (
              <>
                , and <b>{scan.pictures}</b> {scan.pictures === 1 ? 'picture' : 'pictures'}
              </>
            )}
            . Say what each folder holds; a note that names its own type (<code>type: NPC</code> at its top) keeps it.
          </p>
          {!scan.looksLikeNotes && (
            <p className="rounded border border-warn/50 bg-warn/10 px-3 py-2 text-sm">These look like record files this app wrote (each starts with an ID). Add those with “Records from files” above, which reads them as they are.</p>
          )}
          <ul className="divide-y divide-line/60 rounded border border-line">
            {scan.folders.map((f) => (
              <li key={f.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <FolderOpen size={15} className="shrink-0 text-gold" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.path || 'Notes at the top (in no folder)'}</div>
                  <div className="truncate text-xs text-dim">
                    {f.notes} {f.notes === 1 ? 'note' : 'notes'}: {f.sample.join(', ')}
                    {f.notes > f.sample.length ? '…' : ''}
                  </div>
                </div>
                <select
                  className="input w-56 max-w-full py-1 text-sm"
                  aria-label={`What ${f.path || 'the top folder'} holds`}
                  value={folders[f.path] ?? ''}
                  onChange={(e) => {
                    onReset();
                    setFolders((cur) => {
                      const next = { ...cur };
                      if (e.target.value) next[f.path] = e.target.value;
                      else delete next[f.path];
                      return next;
                    });
                  }}
                >
                  <option value="">{f.path.includes('/') ? 'As the folder it is in' : 'The type for everything else'}</option>
                  <option value={SKIP}>Leave these out</option>
                  {scan.types.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="The type for everything else">
              <select className="input py-1 text-sm" value={fallback} onChange={(e) => (onReset(), setFallback(e.target.value))}>
                {scan.types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            {scan.realms.length > 1 && (
              <Field label="Where these records are">
                <select className="input py-1 text-sm" value={realm} onChange={(e) => (onReset(), setRealm(e.target.value))}>
                  {scan.realms.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !kept || !realm}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  const p = await api.post<{ notes: NotesReport }>('/api/import/notes/preview', { token: scan.token, folders, fallback, realm });
                  onPreview(p, p.notes);
                } catch (x) {
                  setErr((x as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Reading…' : `Preview ${kept} ${kept === 1 ? 'record' : 'records'}`}
            </button>
          </div>
          <p className="text-xs text-dim">
            New records are {scan.canonReview ? 'Proposed, for you to review' : 'canon'}, and only you see them until you reveal them. Bring the same notes in again later and the records are updated, not doubled; one you have changed here is
            asked about first.
          </p>
        </div>
      )}
    </Card>
    </div>
  );
}

/** Under the preview of a notes import: what was left out, links that led nowhere, pictures to come. */
export function NotesReportCard({ report }: { report: NotesReport }) {
  const [open, setOpen] = useState(false);
  if (!report.skipped.length && !report.unresolvedLinks && !report.pictures) return null;
  return (
    <div data-testid="notes-report">
    <Card className="space-y-1 text-sm">
      {report.pictures > 0 && (
        <div>
          {report.pictures} {report.pictures === 1 ? 'picture' : 'pictures'} from the notes will be on {report.pictures === 1 ? 'its record' : 'their records'} (for you only, until you show them to players).
        </div>
      )}
      {report.unresolvedLinks > 0 && (
        <div>
          {report.unresolvedLinks} {report.unresolvedLinks === 1 ? 'link leads' : 'links lead'} to a note that isn&apos;t here; {report.unresolvedLinks === 1 ? 'it stays' : 'they stay'} as plain words.
        </div>
      )}
      {report.skipped.length > 0 && (
        <div>
          {report.skipped.length} {report.skipped.length === 1 ? 'note is' : 'notes are'} left out.{' '}
          <button type="button" className="btn-ghost text-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide them' : 'Show them'}
          </button>
          {open && (
            <ul className="mt-1 max-h-48 overflow-auto text-xs text-dim">
              {report.skipped.map((s) => (
                <li key={s.path}>
                  {s.path}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
    </div>
  );
}
