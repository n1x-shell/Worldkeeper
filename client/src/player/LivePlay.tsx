import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Shield, Swords, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlayer, usePlayerIndex } from './context';
import { CalendarView, TodayCard } from '../components/CalendarView';
import { formatDate } from '../../../shared/calendar';

/**
 * Live play on the players' phones (the app only, never the published handbook): the running fight's turn order, and
 * a note when the GM hands them something.
 */
export function PlayerLiveCard() {
  const { live } = usePlayerIndex();
  const { base } = usePlayer();
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem('wk.player.handout-seen')) || null;
    } catch {
      return null;
    }
  });
  const fight = live?.fight;
  // A new fight opens the card again.
  useEffect(() => {
    if (fight) setOpen(true);
  }, [fight?.round, fight]);
  const handout = live?.latest_handout;
  const fresh = handout && handout.id !== seen;
  const markSeen = () => {
    if (!handout) return;
    setSeen(handout.id);
    try {
      localStorage.setItem('wk.player.handout-seen', String(handout.id));
    } catch {
      /* remembered for this visit only */
    }
  };
  if (!live?.live || (!fight && !fresh)) return null;
  return (
    <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:w-80 z-40 space-y-2">
      {fresh && (
        <Link to={`${base}/handouts`} onClick={markSeen} className="panel p-3 flex items-center gap-2 border-gold/60 shadow-lg">
          <Gift size={18} className="text-gold shrink-0" />
          <span className="text-sm">
            <span className="text-dim">The GM hands you something: </span>
            <span className="font-display text-gold">{handout!.title}</span>
          </span>
        </Link>
      )}
      {fight &&
        (open ? (
          <div className="panel p-3 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <Swords size={16} className="text-gold" />
              <span className="font-display text-gold">Round {fight.round || 1}</span>
              <button type="button" className="btn-ghost p-1 ml-auto" onClick={() => setOpen(false)} aria-label="Hide the turn order">
                <X size={14} />
              </button>
            </div>
            <ol className="space-y-1">
              {fight.order.map((c, i) => (
                <li key={i} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${c.current ? 'bg-gold/20 text-gold font-medium' : ''}`}>
                  {c.pc ? <Shield size={12} className="text-arcane" /> : <Swords size={12} className="text-dim" />}
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.hp && (
                    <span className="text-xs tabular-nums text-dim">
                      {c.hp.hp}/{c.hp.max}
                    </span>
                  )}
                  {c.current && <span className="text-[10px] uppercase tracking-wider">turn</span>}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <button type="button" className="panel px-3 py-2 shadow-lg flex items-center gap-2 ml-auto" onClick={() => setOpen(true)}>
            <Swords size={14} className="text-gold" /> <span className="text-sm">{fight.order.find((c) => c.current)?.name ?? 'Combat'}'s turn</span>
          </button>
        ))}
    </div>
  );
}

/** Everything the GM has handed the players, newest first. */
export function PlayerHandouts() {
  const { campaigns } = usePlayerIndex();
  const { source } = usePlayer();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => (c.handouts ?? []).map((h) => ({ ...h, campaign: c.title })));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl text-gold">Handouts</h1>
      {!all.length && <p className="text-dim">The GM hasn't handed you anything yet.</p>}
      {all.map((h) => (
        <article key={h.id} className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-xl text-gold">{h.title}</h2>
            <span className="text-xs text-dim ml-auto">{new Date(h.pushed_at).toLocaleDateString()}</span>
          </div>
          {h.image_file && <img src={source.imageUrl(h.image_file)} alt={h.title} className="max-w-full rounded-md border border-line" />}
          {h.body && (
            <div className="parchment p-3 font-serif text-[15px] prose-lore">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{h.body}</ReactMarkdown>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** The campaign's date, the year's festivals, and what's coming. */
export function PlayerCalendar() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const c = campaigns.find((x) => x.calendar);
  if (!c?.calendar) return <p className="text-dim">No calendar yet.</p>;
  const cal = c.calendar;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl text-gold">Calendar</h1>
      <TodayCard date={cal.date} />
      <section className="panel p-4">
        <h2 className="section-title mb-2">Coming up</h2>
        {cal.coming.length ? (
          <ul className="space-y-2 text-sm">
            {cal.coming.map((x, i) => (
              <li key={i}>
                <span className={x.kind === 'festival' ? 'text-gold font-medium' : 'text-arcane font-medium'}>{x.title}</span>{' '}
                <span className="text-dim text-xs">
                  {x.inDays === 0 ? 'today' : x.inDays === 1 ? 'tomorrow' : `in ${x.inDays} days`}, {formatDate(x.date, 'ab')}
                  {x.where ? `, ${x.where}` : ''}
                </span>
                {x.notes && <div className="text-xs text-dim">{x.notes}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">Nothing for a while.</p>
        )}
      </section>
      <CalendarView date={cal.date} events={cal.coming.filter((x) => x.kind === 'event').map((x) => ({ day: x.date.day, year: x.date.year, title: x.title, kind: 'event' as const }))} />
    </div>
  );
}

/** Each region the party knows: what they've found there, when they were last there, and what they've heard. */
export function PlayerRegions() {
  const { campaigns } = usePlayerIndex();
  const { base } = usePlayer();
  if (!campaigns) return null;
  const all = campaigns.flatMap((c) => c.regions ?? []);
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl text-gold">Around the World</h1>
      <p className="text-sm text-dim">What your party has seen and heard, region by region.</p>
      {!all.length && <p className="text-dim">You haven't been anywhere yet.</p>}
      {all.map((r) => (
        <section key={r.id} className="panel p-4 space-y-2">
          <Link to={`${base}/e/${encodeURIComponent(r.id)}`} className="font-display text-xl text-gold">
            {r.name}
          </Link>
          {r.lastVisit && (
            <p className="text-sm">
              Last there{r.lastVisit.place ? `: ${r.lastVisit.place}` : ''}
              {r.lastVisit.session ? <span className="text-dim"> (session {r.lastVisit.session})</span> : null}
            </p>
          )}
          {r.discovered.length > 0 && <p className="text-sm text-dim">Places you've found: {r.discovered.join(', ')}</p>}
          {r.heard.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-dim">What you've heard lately</div>
              <ul className="list-disc pl-5 text-sm">
                {r.heard.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
