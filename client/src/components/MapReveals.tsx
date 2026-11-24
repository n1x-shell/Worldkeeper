/**
 * Maps, pins and outlines shown per campaign (docs/LIBRARIES_PLAN.md §2.1): with two or more campaigns in the
 * library, the Atlas offers each campaign beside the "everyone" switch.
 */
import { api, useApi } from '../lib/api';
import { toast } from './ui';

export type MapPart = 'map' | 'marker' | 'shape';

export interface MapReveals {
  map: Record<number, number[]>;
  marker: Record<number, number[]>;
  shape: Record<number, number[]>;
  choices: { id: number; title: string }[];
  default: number | null;
}

export function useMapReveals(mapId: number | null | undefined) {
  return useApi<MapReveals>(mapId ? `/api/maps/${mapId}/reveals` : null);
}

/** Chips to show a map part to each campaign, besides everyone. Nothing with fewer than two campaigns. */
export function CampaignChips({ reveals, kind, refId, everyone, onChange }: { reveals: MapReveals | undefined; kind: MapPart; refId: number; everyone: boolean; onChange: () => void }) {
  if (!reveals || reveals.choices.length < 2) return null;
  const shown = new Set(reveals[kind][refId] ?? []);
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="Shown to campaigns">
      <span className="text-dim">{everyone ? 'Shown to everyone.' : 'Shown to:'}</span>
      {!everyone &&
        reveals.choices.map((c) => {
          const on = shown.has(c.id);
          return (
            <button
              key={c.id}
              aria-pressed={on}
              title={on ? `Hide from ${c.title}` : `Show to ${c.title}`}
              className={`chip min-h-7 px-2 ${on ? 'border-ok/60 text-ok' : 'border-line text-dim hover:border-gold'}`}
              onClick={async () => {
                try {
                  await api.post('/api/map-reveals', { kind, ref_id: refId, campaign_id: c.id, on: !on });
                  onChange();
                } catch (x) {
                  toast((x as Error).message, 'danger');
                }
              }}
            >
              {on ? '✓ ' : ''}
              {c.title}
            </button>
          );
        })}
    </div>
  );
}
