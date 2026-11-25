/**
 * A record's pictures (v0.9.3): the record's own picture large, the others as thumbnails, each opening full size.
 * The GM adds pictures, captions them, chooses the record's picture and which ones players see.
 */
import { useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, MonitorPlay, Pencil, Star, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { Modal, ask, toast } from './ui/overlays';
import { Check } from './ui/inputs';
import { useAppState } from '../lib/store';
import { showOnDisplay } from './TableDisplayControl';

export interface RecordPicture {
  id: number;
  file: string;
  caption: string;
  player_visible: boolean;
}

const src = (file: string) => `/api/uploads/${encodeURIComponent(file)}`;

export function RecordPictures({ entityId, name }: { entityId: string; name: string }) {
  const { data, setData } = useApi<RecordPicture[]>(`/api/entities/${encodeURIComponent(entityId)}/images`);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { activeCampaignId } = useAppState();
  const [over, setOver] = useState(false);
  const pictures = data ?? [];
  const shown = open == null ? null : pictures.find((p) => p.id === open);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await api.upload(`/api/entities/${encodeURIComponent(entityId)}/images`, 'image', f);
      setData(await api.get<RecordPicture[]>(`/api/entities/${encodeURIComponent(entityId)}/images`));
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const change = async (id: number, body: { caption?: string; player_visible?: boolean; main?: true }) => {
    // Shown at once (a tick answers the click); the server's list follows.
    const { main: _main, ...now } = body;
    setData(pictures.map((p) => (p.id === id ? { ...p, ...now } : p)));
    try {
      setData(await api.patch<RecordPicture[]>(`/api/entity-images/${id}`, body));
    } catch (x) {
      setData(pictures);
      toast((x as Error).message, 'danger');
    }
  };

  const picker = (
    <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={`Add a picture of ${name}`} onChange={(e) => void add(e.target.files)} />
  );

  if (!pictures.length)
    return (
      <div data-testid="record-pictures">
        {picker}
        {/* A picture-shaped frame where the record's picture will be: click it, or drop pictures on it. */}
        <button
          type="button"
          className={`flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-dim transition-colors hover:border-gold hover:text-ink ${over ? 'border-gold bg-gold/10 text-ink' : 'border-line bg-raised/40'}`}
          disabled={busy}
          aria-label={`Add a picture of ${name}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void add(e.dataTransfer.files);
          }}
        >
          <ImagePlus size={28} strokeWidth={1.5} />
          <span className="text-sm">{busy ? 'Adding…' : 'Add a picture'}</span>
          {!busy && <span className="text-xs">Click, or drop one here</span>}
        </button>
      </div>
    );

  const [main, ...rest] = pictures;
  return (
    <section className="panel elev-1 overflow-hidden" aria-label="Pictures" data-testid="record-pictures">
      {picker}
      <button type="button" className="block w-full" onClick={() => setOpen(main.id)} aria-label={`Open the picture${main.caption ? `: ${main.caption}` : ''}`}>
        <img src={src(main.file)} alt={main.caption || name} className="w-full max-h-80 object-cover" loading="lazy" />
      </button>
      {main.caption && <div className="px-3 pt-2 text-xs text-dim">{main.caption}</div>}
      {rest.length > 0 && (
        <div className="grid grid-cols-4 gap-1 p-2">
          {rest.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p.id)} aria-label={`Open the picture${p.caption ? `: ${p.caption}` : ''}`} className="relative">
              <img src={src(p.file)} alt={p.caption || name} className="aspect-square w-full rounded object-cover" loading="lazy" />
              {p.player_visible && <Eye size={11} className="absolute right-1 top-1 text-gold drop-shadow" aria-label="Players see this" />}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1 text-xs">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={13} /> {busy ? 'Adding…' : 'Add a picture'}
        </button>
        <button type="button" className="btn-ghost" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          <Pencil size={13} /> {editing ? 'Done' : 'Edit pictures'}
        </button>
        <span className="ml-auto text-dim">
          {pictures.some((p) => p.player_visible) ? (
            <>
              <Eye size={11} className="inline" /> {pictures.filter((p) => p.player_visible).length} for players
            </>
          ) : (
            <>
              <EyeOff size={11} className="inline" /> GM only
            </>
          )}
        </span>
      </div>
      {editing && (
        <ul className="divide-y divide-line/60 border-t border-line">
          {pictures.map((p, i) => (
            <li key={p.id} className="flex gap-2 p-2">
              <img src={src(p.file)} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  className="input py-1 text-xs"
                  defaultValue={p.caption}
                  placeholder="Caption"
                  aria-label="Caption"
                  onBlur={(e) => e.target.value !== p.caption && void change(p.id, { caption: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Check checked={p.player_visible} label="Players see this picture" onChange={(v) => void change(p.id, { player_visible: v })}>
                    <span className="text-xs">Players see it</span>
                  </Check>
                  {p.player_visible && activeCampaignId && (
                    <button type="button" className="btn-ghost text-xs" onClick={() => void showOnDisplay(activeCampaignId, { kind: 'picture', image_id: p.id }, p.caption || name)} title="Put this picture on the screen at the table">
                      <MonitorPlay size={12} /> Show on the table display
                    </button>
                  )}
                  {i > 0 && (
                    <button type="button" className="btn-ghost text-xs" onClick={() => void change(p.id, { main: true })}>
                      <Star size={12} /> Make it the record&apos;s picture
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    aria-label="Remove this picture"
                    onClick={async () => {
                      if (await ask({ body: 'Remove this picture? Its file is deleted.', confirmLabel: 'Remove', danger: true })) setData(await api.del<RecordPicture[]>(`/api/entity-images/${p.id}`));
                    }}
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <Modal title={shown.caption || name} wide onClose={() => setOpen(null)}>
          <img src={src(shown.file)} alt={shown.caption || name} className="mx-auto max-h-[70vh] max-w-full" />
          {pictures.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1">
              {pictures.map((p) => (
                <button key={p.id} type="button" onClick={() => setOpen(p.id)} aria-label="Show this picture" aria-current={p.id === shown.id}>
                  <img src={src(p.file)} alt="" className={`h-12 w-12 rounded object-cover ${p.id === shown.id ? 'ring-2 ring-gold' : 'opacity-70'}`} />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
