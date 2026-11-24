/**
 * Libraries for the GM (docs/LIBRARIES_PLAN.md §3.2): the open library's name and the others in the Library menu,
 * New library, and the desktop app's start when there are several. Opening a library reloads the app, since
 * everything on screen belongs to the library that was open.
 */
import { useEffect, useState } from 'react';
import { FolderOpen, Library as LibraryIcon, Plus, Settings2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { askText, toast } from './ui';

export interface LibraryRow {
  id: string;
  name: string;
  folder: string;
  dir: string;
  created_at: string;
  last_opened_at: string | null;
  archived: boolean;
  records: number | null;
}
export interface LibraryList {
  open: string;
  libraries: LibraryRow[];
}

/** Open a library and start the app afresh in it (a new library starts with "Start your world"). */
export async function openLibrary(id: string) {
  await api.post(`/api/libraries/${encodeURIComponent(id)}/open`, {});
  remember();
  window.location.assign('/');
}

/** Ask for a name, make the library and open it. */
export async function newLibrary() {
  const name = await askText({
    title: 'New library',
    body: 'A library of its own: its own records, campaigns, settings, backups and handbook. Your books’ rules and installed packs are shared. It opens with Start your world.',
    label: 'Name',
    placeholder: 'e.g. The Shattered Coast',
    confirmLabel: 'Make and open',
  });
  if (!name?.trim()) return;
  try {
    await api.post('/api/libraries', { name: name.trim(), open: true });
    remember();
    window.location.assign('/');
  } catch (x) {
    toast((x as Error).message, 'danger');
  }
}

/** The top of the Library menu: which library is open, the others to open, New library, Manage libraries. */
export function LibraryMenuSection({ close, onManage, itemClass }: { close: () => void; onManage: () => void; itemClass: string }) {
  const { data } = useApi<LibraryList>('/api/libraries');
  if (!data) return null;
  const open = data.libraries.find((l) => l.id === data.open);
  const others = data.libraries.filter((l) => l.id !== data.open);
  return (
    <div role="group" aria-label="Libraries" className="border-b border-line pb-1 mb-1">
      <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.2em] text-dim">Open library</div>
      <div className="px-3 pb-1 text-sm text-gold flex items-center gap-2" data-testid="open-library">
        <LibraryIcon size={14} /> <span className="truncate">{open?.name}</span>
      </div>
      {others.map((l) => (
        <button
          key={l.id}
          role="menuitem"
          className={itemClass}
          onClick={() => {
            close();
            void openLibrary(l.id);
          }}
        >
          <FolderOpen size={14} /> Open {l.name}
        </button>
      ))}
      <button
        role="menuitem"
        className={itemClass}
        onClick={() => {
          close();
          void newLibrary();
        }}
      >
        <Plus size={14} /> New library…
      </button>
      <button
        role="menuitem"
        className={itemClass}
        onClick={() => {
          close();
          onManage();
        }}
      >
        <Settings2 size={14} /> Manage libraries
      </button>
    </div>
  );
}

/** "1 record", "12 records". */
export const records = (n: number | null) => (n == null ? 'Records unknown' : `${n} record${n === 1 ? '' : 's'}`);

// ---------------------------------------------------------------- the desktop app's start

const PICKED = 'wk.libraryPicked';
function remember() {
  try {
    sessionStorage.setItem(PICKED, '1');
  } catch {
    /* private mode: ask again next time */
  }
}
function picked() {
  try {
    return sessionStorage.getItem(PICKED) === '1';
  } catch {
    return true;
  }
}

/**
 * In the desktop app, with several libraries: the start shows them to pick from, the last opened first (§3.2). Once
 * per window; the web version opens the last library, as the server does.
 */
export function LibraryPicker({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<LibraryList | null>(null);
  const [skip, setSkip] = useState(picked());
  useEffect(() => {
    if (skip) return;
    void (async () => {
      try {
        const meta = await api.get<{ desktop?: boolean }>('/api/meta');
        const l = meta.desktop ? await api.get<LibraryList>('/api/libraries') : null;
        if (l && l.libraries.length > 1) setList(l);
        else setSkip(true);
      } catch {
        setSkip(true);
      }
    })();
  }, [skip]);
  // The picker shows before the app (which applies the theme): use the saved one, Warm Parchment by default.
  useEffect(() => {
    if (!list) return;
    let dark = false;
    try {
      dark = localStorage.getItem('wk.theme') === 'dark';
    } catch {
      /* no storage: the default */
    }
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  }, [list]);
  if (skip) return <>{children}</>;
  if (!list) return null;
  const byLast = [...list.libraries].sort((a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? ''));
  return (
    <main className="min-h-screen grid place-items-center bg-bg p-6">
      <section className="panel elev-2 gilt-corners w-full max-w-lg space-y-4 px-6 py-8">
        <h1 className="title-rule text-[26px] text-gold text-center">Choose a library</h1>
        <ul className="divide-y divide-line/60">
          {byLast.map((l) => (
            <li key={l.id}>
              <button
                className="w-full text-left py-3 px-2 hover:bg-gold/10 rounded flex items-center gap-3"
                onClick={async () => {
                  if (l.id === list.open) {
                    remember();
                    setSkip(true);
                  } else await openLibrary(l.id);
                }}
              >
                <LibraryIcon size={18} className="text-gold shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-display text-lg truncate">{l.name}</span>
                  <span className="block text-xs text-dim">
                    {records(l.records)}
                    {l.last_opened_at ? ` · last opened ${new Date(l.last_opened_at).toLocaleDateString()}` : ''}
                    {l.id === list.open ? ' · open now' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn w-full justify-center" onClick={() => void newLibrary()}>
          <Plus size={14} /> New library
        </button>
      </section>
    </main>
  );
}
