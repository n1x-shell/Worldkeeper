/**
 * A campaign's handbook address on the table server (docs/LIBRARIES_PLAN.md §2.3): the code, the address on this
 * computer's network, a QR code to scan at the table, and a new code when the old one has gone too far.
 */
import { useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { qrMatrix, qrSvgPath } from '@shared/qr';
import { Card, ask, toast } from './ui';

interface Handbook {
  code: string;
  addresses: string[];
  port: number;
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
        {title}’s own handbook on the table server: what’s common knowledge, and what this group has learned. Nothing another campaign learned. Start the table server with{' '}
        <code>npm run start:player</code>; players on your network open the address or scan the code.
      </p>
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
