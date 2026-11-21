import { Link } from 'react-router-dom';
import { Compass, Wand2 } from 'lucide-react';
import { useApi } from '../lib/api';
import { Card, Empty, EntityLink, Loading } from '../components/ui';

/**
 * Session prep from the world: a live briefing on the session's prep tab, built from the campaign's state. A button
 * copies the useful parts into the prep fields that are still empty; it never overwrites anything written there.
 */
export interface Briefing {
  previous: { number: number; title: string; recap: string } | null;
  location: { id: string | null; name: string; type: string } | null;
  chain: { id: string; name: string }[];
  region: { id: string; name: string } | null;
  nearby: { id: string; name: string; type: string }[];
  locals: { id: string; name: string }[];
  met: { id: string; name: string }[];
  clues: { id: number; kind: string; note: string; entity_id: string | null; entity: string | null; secret: string; mystery: string | null; question: string; state: string }[];
  agendas: { id: number; faction_id: string; faction: string | null; title: string; progress: number; segments: number }[];
  standing: { faction_id: string; name: string; renown: number; rank: string; next: { name: string; at: number } | null; close: boolean }[];
  quests: { id: number; title: string; status: string }[];
  level: number;
  tables: { id: number; name: string }[];
  treasure: { region: string; tier: string; label: string } | null;
  terrain?: string[];
  campaign?: { id: number; title: string };
  coming: { kind: string; title: string; inDays: number }[];
}

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');

/** The text each prep field would get from the briefing. */
export function briefingFill(b: Briefing): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (b.previous?.recap) out.recap = b.previous.recap;
  if (b.location) out.partyLocation = [b.location.name, ...b.chain.map((c) => c.name)].join(', ');
  if (b.clues.length) out.clues = bullets(b.clues.map((c) => `${c.mystery ? `${c.mystery}: ` : ''}${c.note || c.secret}${c.entity ? ` (${c.entity})` : ''}`));
  const people = [...b.locals, ...b.met.filter((m) => !b.locals.some((l) => l.id === m.id))];
  if (people.length) out.npcNotes = bullets(people.map((p) => p.name));
  if (b.tables.length) out.encounters = bullets(b.tables.map((t) => t.name));
  if (b.treasure) out.treasure = `Treasure tool: ${b.treasure.label}, levels ${b.treasure.tier}.`;
  const qs = [...new Set(b.clues.map((c) => c.question).filter(Boolean))];
  if (qs.length) out.questions = bullets(qs);
  const cons = [
    ...b.agendas.map((a) => `${a.faction ?? 'A faction'}: "${a.title}" is ${a.segments - a.progress} step${a.segments - a.progress === 1 ? '' : 's'} from done.`),
    ...b.standing.filter((s) => s.close && s.next).map((s) => `${s.name} is ${s.next!.at - s.renown} Renown from ${s.next!.name}.`),
  ];
  if (cons.length) out.consequences = bullets(cons);
  const ids = [b.location?.id, ...b.locals.map((l) => l.id), ...b.met.map((m) => m.id)].filter((x): x is string => !!x);
  if (ids.length) out.relevantIds = [...new Set(ids)].slice(0, 20);
  return out;
}

export function BriefingPanel({ sessionId, onFill }: { sessionId: number; onFill: (b: Briefing) => void }) {
  const { data: b } = useApi<Briefing>(`/api/sessions/${sessionId}/briefing`);
  if (!b) return <Loading />;
  const people = [...b.locals, ...b.met.filter((m) => !b.locals.some((l) => l.id === m.id))];
  return (
    <Card
      featured
      className="space-y-3 lg:col-span-2"
      icon={<Compass size={16} className="text-gold" />}
      title="From the world"
      aside={
        <>
          Built from the campaign as it stands now. Party level <span className="num">{b.level}</span>.
        </>
      }
      actions={
        <button type="button" className="btn text-xs" onClick={() => onFill(b)} title="Copies into prep fields that are still empty. Nothing you've written is changed.">
          <Wand2 size={13} /> Fill the empty prep fields
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
        <Block title="Where the party is">
          {b.location ? (
            <p>
              {b.location.id ? <EntityLink id={b.location.id} /> : b.location.name}
              {b.chain.length > 0 && <span className="text-dim">, {b.chain.map((c) => c.name).join(', ')}</span>}
            </p>
          ) : (
            <p className="text-dim">Unknown. Move the party on the map, or set the campaign's starting place.</p>
          )}
          {b.nearby.length > 0 && (
            <p className="text-xs text-dim mt-1">
              Nearby:{' '}
              {b.nearby.slice(0, 10).map((n, i) => (
                <span key={n.id}>
                  {i > 0 && ', '}
                  <EntityLink id={n.id} />
                </span>
              ))}
            </p>
          )}
        </Block>
        <Block title="Clues to find here">
          {b.clues.length ? (
            <ul className="space-y-1">
              {b.clues.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <span className="text-dim">{c.mystery}:</span> {c.note || c.secret}
                  {c.entity_id && (
                    <>
                      {' '}
                      (<EntityLink id={c.entity_id} />)
                    </>
                  )}
                </li>
              ))}
              {b.clues.length > 8 && <li className="text-dim">and {b.clues.length - 8} more</li>}
            </ul>
          ) : (
            <Empty compact title="No unfound clues point here." />
          )}
          <Link to="/mysteries" className="text-xs text-arcane">
            Mysteries
          </Link>
        </Block>
        <Block title="People">
          {people.length ? (
            <p>
              {people.slice(0, 14).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <EntityLink id={p.id} />
                </span>
              ))}
            </p>
          ) : (
            <Empty compact title="Nobody yet." />
          )}
          {b.met.length > 0 && <p className="text-xs text-dim mt-1">Includes the {b.met.length} the party has met in play.</p>}
        </Block>
        <Block title="Moving soon">
          {b.agendas.length || b.coming.length || b.standing.some((s) => s.close) ? (
            <ul className="space-y-1">
              {b.agendas.map((a) => (
                <li key={a.id}>
                  {a.faction ?? 'A faction'}: {a.title}{' '}
                  <span className="text-dim num">
                    ({a.progress}/{a.segments})
                  </span>
                </li>
              ))}
              {b.coming.map((c, i) => (
                <li key={`c${i}`}>
                  <span className={c.kind === 'festival' ? 'text-gold' : 'text-arcane'}>{c.title}</span>{' '}
                  <span className="text-dim">{c.inDays === 0 ? 'today' : c.inDays === 1 ? 'tomorrow' : `in ${c.inDays} days`}</span>
                </li>
              ))}
              {b.standing
                .filter((s) => s.close && s.next)
                .map((s) => (
                  <li key={s.faction_id}>
                    {s.name}: {s.rank}, {s.next!.at - s.renown} from {s.next!.name}
                  </li>
                ))}
            </ul>
          ) : (
            <Empty compact title="No agenda or standing is about to tip." />
          )}
        </Block>
        <Block title="Open quests">
          {b.quests.length ? (
            <ul className="list-disc pl-5">
              {b.quests.map((q) => (
                <li key={q.id}>{q.title}</li>
              ))}
            </ul>
          ) : (
            <Empty compact title="None open." />
          )}
        </Block>
        <Block title="Tables for here">
          {b.tables.length || b.treasure ? (
            <ul className="space-y-1">
              {b.tables.map((t) => (
                <li key={t.id}>
                  <Link to={`/tables?t=${t.id}`} className="text-arcane">
                    {t.name}
                  </Link>
                </li>
              ))}
              {b.treasure && (
                <li>
                  <Link to="/campaign/treasure" className="text-arcane">
                    Treasure: {b.treasure.label}, levels {b.treasure.tier}
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <Empty compact title="No tables for this place yet." />
          )}
        </Block>
      </div>
    </Card>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-xs uppercase tracking-widest text-dim mb-1">{title}</div>
      {children}
    </div>
  );
}
