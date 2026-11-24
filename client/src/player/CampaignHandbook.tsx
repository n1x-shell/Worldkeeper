/**
 * A campaign's own handbook address on the table server: /player/c/<code> (docs/LIBRARIES_PLAN.md §2.3). The same
 * handbook, with everything as that campaign knows it and nothing of any other.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
