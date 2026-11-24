/**
 * A campaign's own handbook address on the table server: /player/c/<code> (docs/LIBRARIES_PLAN.md §2.3). The same
 * handbook, with everything as that campaign knows it and nothing of any other.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { PlayerApp } from './PlayerApp';
import { makeApiSource } from './source';

export function CampaignHandbook() {
  const { code = '' } = useParams();
  const api = `/api/player/c/${encodeURIComponent(code)}`;
  const source = useMemo(() => makeApiSource(api), [api]);
  const [known, setKnown] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${api}/info`)
      .then((r) => live && setKnown(r.ok))
      .catch(() => live && setKnown(false));
    return () => {
      live = false;
    };
  }, [api]);
  if (known === false)
    return (
      <main className="min-h-screen grid place-items-center bg-bg p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-2xl text-gold">This handbook address isn’t open</h1>
          <p className="text-dim">
            The code <b className="tracking-widest text-ink">{code}</b> doesn’t match a campaign on this table server. It may have been replaced with a new one, or the campaign has ended. Ask your GM
            for the current address.
          </p>
        </div>
      </main>
    );
  if (known === null) return null;
  return <PlayerApp source={source} base={`/player/c/${code}`} />;
}

/**
 * The plain address (/player) on a table that answers only campaign addresses: a character's link goes on to its
 * campaign's address; anyone else is asked for their campaign's code. Elsewhere (and in the GM app) it's the handbook.
 */
export function PlainHandbookGate({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [state, setState] = useState<'checking' | 'open' | 'ask'>('checking');
  const [code, setCode] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      const info = (await fetch('/api/player/info')
        .then((r) => r.json())
        .catch(() => ({}))) as { addressesOnly?: boolean };
      if (!info.addressesOnly) return live && setState('open');
      const me = /^\/player\/me\/([A-Za-z0-9]+)/.exec(loc.pathname);
      if (me) {
        const page = (await fetch(`/api/player/me/${me[1]}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as { handbook?: string | null } | null;
        if (page?.handbook) return window.location.replace(`/player/c/${page.handbook}/me/${me[1]}`);
      }
      if (live) setState('ask');
    })();
    return () => {
      live = false;
    };
  }, [loc.pathname]);
  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return null;
  return (
    <main className="min-h-screen grid place-items-center bg-bg p-6">
      <form
        className="max-w-md w-full text-center space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c) window.location.assign(`/player/c/${encodeURIComponent(c)}`);
        }}
      >
        <h1 className="font-display text-2xl text-gold">Your campaign’s handbook</h1>
        <p className="text-dim">This table opens each campaign at its own address. Scan your campaign’s QR code, or type the code your GM gave you.</p>
        <input className="input text-center tracking-[0.2em] uppercase" aria-label="Campaign code" placeholder="e.g. K7QX2M9P" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        <button className="btn-primary w-full justify-center" disabled={!code.trim()}>
          Open the handbook
        </button>
      </form>
    </main>
  );
}
