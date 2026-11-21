/**
 * The region panel in the GM's map view (docs/DESIGN_OVERHAUL.md): a region's terrain, its state in the active
 * campaign (who holds it, faction agendas and standing, what has changed, what the party has found), the places
 * inside it, and its encounter tables with a Roll button.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dices } from 'lucide-react';
import { api, useApi } from '../../lib/api';
import { Markdown } from '../Markdown';
import { CreatureLinks } from '../CreatureLinks';

interface Panel {
  region: { id: string; name: string; type: string };
  terrain: { label: string; terrain: string[] } | null;
  tables: { id: number; name: string; die: string }[];
  places: { id: string; name: string; type: string }[];
  state: {
    holder: { id: string; name: string } | null;
    agendas: { id: number; faction_id: string; faction: string; title: string; progress: number; segments: number }[];
    standing: { faction_id: string; name: string; renown: number; rank: string }[];
    changes: { id: number; entity_id: string; entity: string; field: string; value: string }[];
    discovered: { id: string; name: string }[];
    clues: { id: number }[];
    rumours: { heard: number; unheard: number };
  } | null;
}

const PLACE_LIMIT = 12;

export function RegionPanel({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  const { data } = useApi<Panel>(`/api/regions/${encodeURIComponent(id)}/panel`);
  const [rolls, setRolls] = useState<Record<number, { result: string; creatures?: { id: string; name: string }[] } | string>>({});
  const [allPlaces, setAllPlaces] = useState(false);
  if (!data) return null;
  const st = data.state;
  const roll = async (tableId: number) => {
    try {
      setRolls({ ...rolls, [tableId]: await api.post<{ result: string; creatures?: { id: string; name: string }[] }>(`/api/random-tables/${tableId}/roll`) });
    } catch (x) {
      setRolls({ ...rolls, [tableId]: (x as Error).message });
    }
  };
  const places = allPlaces ? data.places : data.places.slice(0, PLACE_LIMIT);
  return (
    <div className="space-y-4 mb-5 text-sm">
      {data.terrain && (
        <div>
          <div className="section-title mb-1">Terrain</div>
          <div className="flex flex-wrap gap-1">
            {data.terrain.terrain.map((t) => (
              <span key={t} className="chip border-line text-dim capitalize">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {st && (
        <div className="space-y-2">
          <div className="section-title">In this campaign</div>
          {st.holder && (
            <div>
              <span className="text-dim">Held by </span>
              <Link className="text-arcane" to={`/e/${st.holder.id}`}>
                {st.holder.name}
              </Link>
            </div>
          )}
          {st.agendas.length > 0 && (
            <ul className="space-y-1">
              {st.agendas.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate" title={`${a.faction}: ${a.title}`}>
                    <span className="text-dim">{a.faction}:</span> {a.title}
                  </span>
                  <span className="flex gap-0.5 shrink-0" aria-label={`${a.progress} of ${a.segments}`}>
                    {Array.from({ length: a.segments }, (_, i) => (
                      <span key={i} className={`h-2 w-2 rounded-sm ${i < a.progress ? 'bg-gold' : 'bg-white/15'}`} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {st.standing.length > 0 && (
            <div className="text-xs text-dim">
              Standing:{' '}
              {st.standing.map((s, i) => (
                <span key={s.faction_id}>
                  {i ? ', ' : ''}
                  {s.name} <span className="text-ink">{s.rank}</span>
                </span>
              ))}
            </div>
          )}
          {st.changes.length > 0 && (
            <ul className="text-xs space-y-0.5">
              {st.changes.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <span className="text-dim">{c.entity}:</span> {c.field} → <span className="text-ink">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-xs text-dim num">
            Found {st.discovered.length} of {data.places.length} places · {st.clues.length} clues still here · rumours {st.rumours.heard} heard, {st.rumours.unheard} not yet
          </div>
          <Link to="/campaign/regions" className="text-xs text-arcane">
            State of the World
          </Link>
        </div>
      )}
      {data.tables.length > 0 && (
        <div>
          <div className="section-title mb-1">Encounters</div>
          <ul className="space-y-2">
            {data.tables.map((t) => {
              const r = rolls[t.id];
              return (
                <li key={t.id}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate" title={t.name}>
                      {t.name.replace(/^Encounters:\s*/, '')}
                    </span>
                    <button type="button" className="btn text-xs py-0.5" onClick={() => void roll(t.id)}>
                      <Dices size={13} /> Roll {t.die}
                    </button>
                  </div>
                  {r && (
                    <div className="mt-1 rounded border border-line bg-white/5 px-2 py-1 text-[13px]">
                      {typeof r === 'string' ? (
                        <span className="text-danger">{r}</span>
                      ) : (
                        <>
                          <Markdown text={r.result} />
                          {r.creatures?.length ? <CreatureLinks creatures={r.creatures} label="From your books" /> : null}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {data.places.length > 0 && (
        <div>
          <div className="section-title mb-1">Places here ({data.places.length})</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {places.map((p) => (
              <li key={p.id} className="truncate">
                <button type="button" className="text-left text-arcane hover:text-gold truncate max-w-full" onClick={() => onPick(p.id)} title={p.name}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          {data.places.length > PLACE_LIMIT && (
            <button type="button" className="btn-ghost text-xs mt-1" onClick={() => setAllPlaces(!allPlaces)}>
              {allPlaces ? 'Fewer' : `All ${data.places.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
