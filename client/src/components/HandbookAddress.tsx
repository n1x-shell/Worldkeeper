/**
 * A campaign's handbook address on the table server (docs/LIBRARIES_PLAN.md §2.3): the code, the address on this
 * computer's network, a QR code to scan at the table, and a new code when the old one has gone too far.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Radio, RefreshCw } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { qrMatrix, qrSvgPath } from '@shared/qr';
import { Card, ask, toast } from './ui';

interface Handbook {
  code: string;
  addresses: string[];
  port: number;
  /** Whether the table (the player-only server on the network) is open. */
  table_open?: boolean;
}

/** Open or close the table from the GM app: the players' handbook on this computer's network. */
export async function setTableOpen(open: boolean) {
  const r = await api.post<{ open: boolean; port: number }>('/api/table', { open });
  toast(r.open ? `The table is open: players on your network can reach it on port ${r.port}` : 'The table is closed', 'ok');
  window.dispatchEvent(new CustomEvent('wk:table', { detail: r.open }));
  return r;
}

/** A QR code, drawn as one SVG path (dark on white, whatever the theme, so phones can read it). */
export function QrCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const qr = useMemo(() => qrSvgPath(qrMatrix(text)), [text]);
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" className="rounded-sm">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

export function HandbookAddress({ campaignId, title }: { campaignId: number; title: string }) {
  const { data, setData } = useApi<Handbook>(`/api/campaigns/${campaignId}/handbook`);
  const [pick, setPick] = useState<string | null>(null);
  if (!data) return null;
  const host = pick ?? data.addresses[0] ?? 'localhost';
  const url = `http://${host}:${data.port}/player/c/${data.code}`;
  return (
    <Card title="The players’ handbook" className="space-y-2">
      <p className="text-xs text-dim">
        {title}’s own handbook on the table server: what’s common knowledge, and what this group has learned. Nothing another campaign learned. Open the table, then players on your network open the
        address or scan the code.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="table-status">
        <span className={`inline-block h-2 w-2 rounded-full ${data.table_open ? 'bg-ok' : 'bg-dim/50'}`} aria-hidden />
        <span className={data.table_open ? 'text-ok' : 'text-dim'}>{data.table_open ? 'The table is open' : 'The table is closed'}</span>
        <button
          className={data.table_open ? 'btn-ghost text-xs ml-auto' : 'btn text-xs ml-auto'}
          onClick={async () => {
            try {
              const r = await setTableOpen(!data.table_open);
              setData({ ...data, table_open: r.open });
            } catch (x) {
              toast((x as Error).message, 'danger');
            }
          }}
        >
          {data.table_open ? 'Close the table' : 'Open the table'}
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <QrCode text={url} label={`QR code for ${url}`} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-xs text-dim">Code</div>
          <div className="font-mono text-lg tracking-[0.2em] text-gold" data-testid="handbook-code">
            {data.code}
          </div>
          {data.addresses.length > 1 && (
            <select className="input text-xs" aria-label="This computer’s address" value={host} onChange={(e) => setPick(e.target.value)}>
              {data.addresses.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          )}
          <div className="text-xs break-all" data-testid="handbook-url">
            {url}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              className="btn text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                toast('Address copied', 'ok');
              }}
            >
              <Copy size={12} /> Copy
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                if (!(await ask({ body: `Give ${title}’s handbook a new code? The old address and QR code stop working.`, danger: true, confirmLabel: 'New code' }))) return;
                setData(await api.post<Handbook>(`/api/campaigns/${campaignId}/handbook/new-code`, {}));
                toast('New code made', 'ok');
              }}
            >
              <RefreshCw size={12} /> New code
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** In the top bar: shown while the table is open, so it isn't left open by accident. Links to the campaign's card. */
export function TableIndicator() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .get<{ open: boolean }>('/api/table')
      .then((t) => live && setOpen(t.open))
      .catch(() => undefined);
    const on = (e: Event) => setOpen(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('wk:table', on);
    return () => {
      live = false;
      window.removeEventListener('wk:table', on);
    };
  }, []);
  if (!open) return null;
  return (
    <Link
      to="/campaign"
      className="btn-ghost text-ok"
      aria-label="Table open"
      title="The table is open: players on your network can reach the handbook. Close it from the campaign’s overview."
      data-testid="table-open"
    >
      <Radio size={16} /> <span className="hidden 2xl:inline whitespace-nowrap">Table open</span>
    </Link>
  );
}
