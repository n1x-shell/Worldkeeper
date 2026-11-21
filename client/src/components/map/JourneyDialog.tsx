/**
 * Travel to here (GM map view): the distance from where the party is, the days on the road at a 2024 pace, and the
 * choice to move the campaign's calendar on and roll the region's encounter table once a day. After the trip it
 * shows each day's roll.
 */
import { useMemo, useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '../../lib/api';
import { Modal } from '../ui';
import { Markdown } from '../Markdown';
import { CreatureLinks } from '../CreatureLinks';
import { PACES, formatMiles, milesBetween, travelDays, type Pace } from '../../../../shared/travel';

export interface JourneyTarget {
  entity_id?: string | null;
  x: number;
  y: number;
  label: string;
}
interface Result {
  exploration: unknown;
  miles: number | null;
  days: number;
  date: string | null;
  region: { id: string; name: string | null } | null;
  table: { id: number; name: string } | null;
  rolls: { day: number; result: string; creatures: { id: string; name: string }[] }[];
}

export function JourneyDialog({
  campaignId,
  map,
  from,
  to,
  onClose,
  onDone,
}: {
  campaignId: number;
  map: { id: number; width: number; scale_miles?: number | null };
  from: { x: number; y: number; label: string } | null;
  to: JourneyTarget;
  onClose: () => void;
  onDone: (exploration: unknown) => void;
}) {
  const miles = useMemo(() => (from ? milesBetween(from, to, map) : null), [from, to, map]);
  const [pace, setPace] = useState<Pace>('normal');
  const auto = miles != null ? travelDays(miles, pace) : 0;
  const [days, setDays] = useState<string>('');
  const n = days === '' ? auto : Math.max(0, Math.min(365, Math.round(Number(days)) || 0));
  const [label, setLabel] = useState(to.label);
  const [advance, setAdvance] = useState(true);
  const [roll, setRoll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<Result>('/api/exploration/journey', {
        campaign_id: campaignId,
        map_id: map.id,
        entity_id: to.entity_id ?? null,
        x: to.entity_id ? undefined : to.x,
        y: to.entity_id ? undefined : to.y,
        label,
        pace,
        days: n,
        advance,
        roll,
      });
      onDone(r.exploration);
      if (r.rolls.length || r.date) setResult(r);
      else onClose();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result)
    return (
      <Modal title={`On the road to ${label || 'a new place'}`} onClose={onClose}>
        <div className="space-y-3 text-sm">
          <p>
            {result.days} {result.days === 1 ? 'day' : 'days'} on the road
            {result.miles != null ? ` (${formatMiles(result.miles)})` : ''}.{result.date ? ` It is now ${result.date}.` : ''}
          </p>
          {result.table && result.rolls.length > 0 && (
            <div>
              <div className="section-title mb-1">{result.table.name}</div>
              <ol className="space-y-2">
                {result.rolls.map((r) => (
                  <li key={r.day} className="rounded border border-line px-2 py-1">
                    <div className="text-xs text-dim mb-0.5">Day {r.day}</div>
                    <Markdown text={r.result} />
                    {r.creatures.length > 0 && <CreatureLinks creatures={r.creatures} label="From your books" />}
                  </li>
                ))}
              </ol>
              {result.days > result.rolls.length && <p className="text-xs text-dim mt-1">Only the first {result.rolls.length} days were rolled.</p>}
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal title="Travel to here" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="label">Where</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A short name for this spot" disabled={!!to.entity_id} />
        </label>
        <p className="text-dim">
          {!from
            ? 'The party has no position on this map yet, so there is no distance to measure.'
            : miles == null
              ? `From ${from.label || 'where the party is'}. Set the map's scale (GM tools) to measure the distance.`
              : `From ${from.label || 'where the party is'}: ${formatMiles(miles)} as the crow flies.`}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Pace</span>
            <select className="input w-auto" value={pace} onChange={(e) => (setPace(e.target.value as Pace), setDays(''))}>
              {(Object.keys(PACES) as Pace[]).map((k) => (
                <option key={k} value={k}>
                  {PACES[k].label} ({PACES[k].milesPerDay} miles a day)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Days on the road</span>
            <input className="input w-24 num" type="number" min={0} max={365} value={days === '' ? String(auto) : days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
        {PACES[pace].note && <p className="text-xs text-dim">{PACES[pace].note}.</p>}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} disabled={!n} /> Move the calendar on {n} {n === 1 ? 'day' : 'days'}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={roll} onChange={(e) => setRoll(e.target.checked)} disabled={!n} /> Roll the region&apos;s encounter table for each day
        </label>
        {err && <p className="text-danger text-xs">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => void go()}>
            <Flag size={14} /> {busy ? 'Travelling…' : 'Travel'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
