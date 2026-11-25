/**
 * The GM's control for the table display (v0.9.9): what the screen at the table shows, and where to open it. The
 * display can only show what players may see, so the choices are the maps players see and the campaign's handouts
 * (showing one gives it to the players, as handing it out does). A record's picture is put up from the record's page.
 */
import { useEffect } from 'react';
import { ExternalLink, MonitorPlay } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { onServerChange } from '../player/changes';
import { toast } from './ui';

type Display = { kind: 'title' } | { kind: 'map'; map_id: number } | { kind: 'handout'; handout_id: number } | { kind: 'picture'; image_id: number };
interface Options {
  display: Display;
  maps: { id: number; name: string }[];
  handouts: { id: number; title: string; pushed_at: string | null }[];
}
interface Handbook {
  code: string;
  addresses: string[];
  port: number;
  table_open?: boolean;
}

/** Put something on the table display; says why not when it can't be shown. */
export async function showOnDisplay(campaignId: number, display: Display, what: string) {
  try {
    await api.put(`/api/campaigns/${campaignId}/display`, display);
    toast(`${what} is on the table display`, 'ok');
    return true;
  } catch (x) {
    toast((x as Error).message, 'danger');
    return false;
  }
}

export function TableDisplayControl({ campaignId }: { campaignId: number }) {
  const { data, reload } = useApi<Options>(`/api/campaigns/${campaignId}/display`);
  const { data: book } = useApi<Handbook>(`/api/campaigns/${campaignId}/handbook`);
  useEffect(() => onServerChange('/api/events', () => void reload()), [reload]);
  if (!data) return null;
  const d = data.display;
  const set = async (next: Display, what: string) => {
    if (await showOnDisplay(campaignId, next, what)) void reload();
  };
  const now =
    d.kind === 'title'
      ? 'The title card'
      : d.kind === 'map'
        ? `The map: ${data.maps.find((m) => m.id === d.map_id)?.name ?? 'one players can no longer see'}`
        : d.kind === 'handout'
          ? `The handout: ${data.handouts.find((h) => h.id === d.handout_id)?.title ?? 'one since removed'}`
          : 'A record’s picture';
  const path = book ? `/player/c/${book.code}/table` : '/player/table';
  return (
    <div className="space-y-2 text-sm" data-testid="table-display-control">
      <p className="text-xs text-dim">A screen at the table (a television, a second monitor): what you choose here, with the turn order and the table’s rolls beside it. It only ever shows what players may see.</p>
      <div className="flex flex-wrap items-center gap-2">
        <MonitorPlay size={15} className="text-gold" aria-hidden />
        <span>
          Showing: <b>{now}</b>
        </span>
        <a className="btn ml-auto text-xs" href={path} target="_blank" rel="noreferrer" title="Opens the display in a new window: drag it to the second screen and press Full screen">
          <ExternalLink size={13} /> Open the display
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={d.kind === 'title' ? 'btn-primary text-xs' : 'btn text-xs'} onClick={() => void set({ kind: 'title' }, 'The title card')}>
          Title card
        </button>
        <select
          className="input w-auto max-w-56 py-1 text-xs"
          aria-label="Show a map"
          value={d.kind === 'map' ? d.map_id : ''}
          onChange={(e) => e.target.value && void set({ kind: 'map', map_id: Number(e.target.value) }, data.maps.find((m) => m.id === Number(e.target.value))?.name ?? 'The map')}
        >
          <option value="">{data.maps.length ? 'A map…' : 'No maps shown to players yet'}</option>
          {data.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          className="input w-auto max-w-56 py-1 text-xs"
          aria-label="Show a handout"
          value={d.kind === 'handout' ? d.handout_id : ''}
          onChange={(e) => e.target.value && void set({ kind: 'handout', handout_id: Number(e.target.value) }, data.handouts.find((h) => h.id === Number(e.target.value))?.title ?? 'The handout')}
        >
          <option value="">{data.handouts.length ? 'A handout…' : 'No handouts yet'}</option>
          {data.handouts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.title}
              {h.pushed_at ? '' : ' (gives it to the players)'}
            </option>
          ))}
        </select>
      </div>
      {book && (
        <p className="text-xs text-dim">
          For a screen with its own browser{book.table_open ? '' : ' (open the table first)'}:{' '}
          <span className="num select-all text-ink/90">
            http://{book.addresses[0] ?? 'localhost'}:{book.port}
            {path}
          </span>
          . A record’s picture is put up from the record’s page (Edit pictures).
        </p>
      )}
    </div>
  );
}
