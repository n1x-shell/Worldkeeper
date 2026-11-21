import { Link } from 'react-router-dom';
import { Globe2 } from 'lucide-react';
import { useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Card, EntityLink, ErrorBox, Loading, PageHeader } from '../components/ui';
import { NeedCampaign } from './Campaign';

/** The state of the world, region by region, as this campaign has left it. */
interface RegionState {
  region: { id: string; name: string; type: string };
  holder: { id: string; name: string } | null;
  places: number;
  agendas: { id: number; faction: string; title: string; progress: number; segments: number }[];
  standing: { faction_id: string; name: string; renown: number; rank: string }[];
  changes: { id: number; entity_id: string; entity: string; field: string; value: string; status: string }[];
  discovered: { id: string; name: string }[];
  visits: { entity_id: string | null; label: string; session: number | null }[];
  clues: { id: number; note: string; entity_id: string; secret: string; mystery: string | null }[];
  rumours: { heard: number; unheard: number; latest: string[] };
}

export function RegionsPage() {
  const { activeCampaignId } = useAppState();
  const { data, error } = useApi<RegionState[]>(activeCampaignId ? `/api/regions/state?campaign_id=${activeCampaignId}` : null);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const touched = (s: RegionState) => s.discovered.length + s.visits.length + s.changes.length + s.agendas.length + s.standing.length + s.rumours.heard;
  const sorted = [...data].sort((a, b) => touched(b) - touched(a));
  return (
    <div className="space-y-4">
      <PageHeader
        title="State of the World"
        subtitle="Each region as this campaign has left it: who holds it, what's moving there, what the party has seen, and what's still to find."
        note="Players get a short version in their handbook, built only from what they've seen and heard."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {sorted.map((s) => (
          <Card
            key={s.region.id}
            className={`space-y-2 ${touched(s) ? '' : 'opacity-70'}`}
            icon={<Globe2 size={15} className="text-gold" />}
            title={<EntityLink id={s.region.id} className="font-display text-lg text-gold" />}
            aside={
              s.holder && (
                <>
                  held by <EntityLink id={s.holder.id} />
                </>
              )
            }
            actions={
              <span className="text-xs text-dim">
                <span className="num">{s.places}</span> places
              </span>
            }
          >
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <Box title="Moving here">
                {s.agendas.length || s.standing.length ? (
                  <ul className="space-y-0.5">
                    {s.agendas.map((a) => (
                      <li key={a.id}>
                        {a.faction}: {a.title}{' '}
                        <span className="text-dim num">
                          ({a.progress}/{a.segments})
                        </span>
                      </li>
                    ))}
                    {s.standing.map((x) => (
                      <li key={x.faction_id} className="text-dim">
                        The party is {x.rank} with {x.name} (<span className="num">{x.renown}</span>)
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-dim">Quiet.</span>
                )}
              </Box>
              <Box title="What has changed">
                {s.changes.length ? (
                  <ul className="space-y-0.5">
                    {s.changes.slice(0, 6).map((c) => (
                      <li key={c.id}>
                        <EntityLink id={c.entity_id} />: {c.field} is now {c.value}
                        {c.status === 'proposed' && <span className="text-xs text-dim"> (for review)</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-dim">Nothing yet.</span>
                )}
              </Box>
              <Box title="What the party has seen">
                {s.discovered.length || s.visits.length ? (
                  <>
                    {s.visits[0] && (
                      <div>
                        Last there: {s.visits[0].label || 'on the road'}
                        {s.visits[0].session ? <span className="text-dim"> (session {s.visits[0].session})</span> : null}
                      </div>
                    )}
                    {s.discovered.length > 0 && <div className="text-dim">Found: {s.discovered.map((d) => d.name).join(', ')}</div>}
                  </>
                ) : (
                  <span className="text-dim">Not been here.</span>
                )}
                {s.rumours.heard + s.rumours.unheard > 0 && (
                  <div className="text-xs text-dim mt-1">
                    Rumours heard: <span className="num">{s.rumours.heard}</span> of <span className="num">{s.rumours.heard + s.rumours.unheard}</span>. <Link to="/rumours">Rumours</Link>
                  </div>
                )}
              </Box>
              <Box title="Still to find">
                {s.clues.length ? (
                  <ul className="space-y-0.5">
                    {s.clues.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <span className="text-dim">{c.mystery}:</span> {c.note || c.secret}
                      </li>
                    ))}
                    {s.clues.length > 5 && <li className="text-dim">and {s.clues.length - 5} more</li>}
                  </ul>
                ) : (
                  <span className="text-dim">No unfound clues here.</span>
                )}
              </Box>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="text-[11px] uppercase tracking-widest text-dim mb-1">{title}</div>
      {children}
    </div>
  );
}
