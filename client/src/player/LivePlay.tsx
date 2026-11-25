import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronDown, Compass, Dices, Gift, Shield, Swords, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlayer, usePlayerIndex } from './context';
import type { PRoll } from './source';
import { PlayerPageTitle } from './PlayerPages';
import { CalendarView, TodayCard } from '../components/CalendarView';
import { formatDate } from '../../../shared/calendar';
import { Badge } from '../components/ui/badges';
import { Card } from '../components/ui/surfaces';
import { HpBar } from '../components/ui/data';
import { Empty } from '../components/ui/feedback';

const SEEN = 'wk.player.handout-seen';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** The name of this device's own character (from its remembered page code), to find "you" in the turn order. */
function useMyName() {
  const { source } = usePlayer();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const code = read('wk.player.me');
    if (!code || !source.myPage) return;
    let live = true;
    source
      .myPage(code)
      .then((p) => live && setName(p?.name ?? null))
      .catch(() => {
        /* the turn order still shows, just without "you" */
      });
    return () => {
      live = false;
    };
  }, [source]);
  return name;
}

/** How long a roll stays on the players' screens. */
const ROLL_SHOWN_MS = 10 * 60 * 1000;

/**
 * The table's rolls worth showing: those made since this page opened, and those of the last ten minutes (so a page
 * opened mid-scene sees what was just rolled). By the server's order, not the phone's clock, where it can be.
 */
function useTableRolls(rolls: PRoll[] | undefined): PRoll[] {
  const [since, setSince] = useState<number | null>(null);
  // The time as of the last look at the table (each look brings the rolls anew).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rolls && since === null) setSince(rolls[0]?.id ?? 0);
    setNow(Date.now());
  }, [rolls, since]);
  if (!rolls || since === null) return [];
  return rolls.filter((r) => r.id > since || now - Date.parse(r.created_at) < ROLL_SHOWN_MS);
}

/** The table's rolls: the newest in one line, the rest on a tap. Put away until the next roll with the cross. */
function TableRollsCard({ rolls, me }: { rolls: PRoll[]; me: string | null }) {
  const [open, setOpen] = useState(false);
  const [away, setAway] = useState<number | null>(null);
  const newest = rolls[0];
  if (!newest || newest.id === away) return null;
  const who = (r: PRoll) => (me && r.who.trim().toLowerCase() === me.trim().toLowerCase() ? 'You' : r.who);
  return (
    <section className="panel elev-3 overflow-hidden" aria-label="The table’s rolls" data-testid="table-rolls-card">
      <div className="flex items-center gap-1">
        <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Dices size={18} className="shrink-0 text-gold" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm" aria-live="polite">
            <b className="font-semibold text-ink">{who(newest)}</b> rolled <b className="num text-lg text-gold">{newest.total}</b>
            {newest.label && <span className="text-dim"> · {newest.label}</span>}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <button type="button" className="btn-ghost mr-1 h-10 w-10 shrink-0 justify-center" onClick={() => setAway(newest.id)} aria-label="Put the rolls away until the next one">
          <X size={16} />
        </button>
      </div>
      {open && (
        <ol className="max-h-[40vh] overflow-y-auto border-t border-line py-1">
          {rolls.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 px-4 py-1 text-sm">
              <span className="num w-8 shrink-0 text-right font-semibold text-ink">{r.total}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{who(r)}</span>
                {r.label && <span className="text-dim"> · {r.label}</span>} <span className="num text-xs text-dim">{r.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Live play on the players' phones (the app only, never the published handbook): the running fight's turn order, and
 * a note when the GM hands them something. Made to be read at arm's length: whose turn it is, large, and your own
 * turn called out.
 */
export function PlayerLiveCard() {
  const { live } = usePlayerIndex();
  const { base } = usePlayer();
  const me = useMyName();
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<number | null>(() => Number(read(SEEN)) || null);
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
      localStorage.setItem(SEEN, String(handout.id));
    } catch {
      /* remembered for this visit only */
    }
  };
  const rolls = useTableRolls(live?.rolls);
  if ((!live?.live || (!fight && !fresh)) && !rolls.length) return null;
  const isMe = (n: string) => !!me && n.trim().toLowerCase() === me.trim().toLowerCase();
  const current = fight?.order.find((c) => c.current);
  const myTurn = !!current && isMe(current.name);
  const next = fight ? fight.order[(fight.order.findIndex((c) => c.current) + 1) % fight.order.length] : undefined;
  return (
    <div className="fixed inset-x-3 bottom-3 z-1400 space-y-2 sm:left-auto sm:w-96" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <TableRollsCard rolls={rolls} me={me} />
      {fresh && (
        <Link
          to={`${base}/handouts`}
          onClick={markSeen}
          className="panel elev-3 gilt-corners flex min-h-14 items-center gap-3 border-gold/60 px-4 py-3 transition-colors hover:bg-raised"
          aria-label={`The GM hands you something: ${handout.title}. Open your handouts.`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold">
            <Gift size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-[0.12em] text-dim">The GM hands you something</span>
            <span className="block truncate font-display text-lg text-gold">{handout.title}</span>
          </span>
          <span className="text-sm font-medium text-gold">Open</span>
        </Link>
      )}
      {fight &&
        (open ? (
          <section className={`panel elev-3 overflow-hidden ${myTurn ? 'border-gold' : ''}`} aria-label="Turn order" aria-live="polite">
            <header className={`flex items-start gap-3 border-b px-4 py-3 ${myTurn ? 'border-gold/50 bg-gold/20' : 'border-line bg-gold/6'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-dim">
                  <Swords size={14} className="text-gold" />
                  <span className="num">Round {fight.round || 1}</span>
                </div>
                <div className={`mt-0.5 truncate text-2xl font-semibold leading-tight ${myTurn ? 'text-gold' : 'text-ink'}`}>
                  {myTurn ? 'Your turn' : current ? `${current.name}'s turn` : 'Combat'}
                </div>
                {next && current && next !== current && (
                  <div className="mt-0.5 truncate text-sm text-dim">
                    Next: <span className={isMe(next.name) ? 'font-semibold text-gold' : 'text-ink'}>{isMe(next.name) ? 'you' : next.name}</span>
                  </div>
                )}
              </div>
              <button type="button" className="btn-ghost -mr-2 h-10 w-10 shrink-0 justify-center" onClick={() => setOpen(false)} aria-label="Hide the turn order">
                <ChevronDown size={18} />
              </button>
            </header>
            <ol className="max-h-[45vh] overflow-y-auto py-1">
              {fight.order.map((c, i) => {
                const mine = isMe(c.name);
                return (
                  <li
                    key={i}
                    aria-current={c.current ? 'step' : undefined}
                    className={`relative flex min-h-10 items-center gap-2.5 px-4 py-1.5 text-sm ${c.current ? 'bg-gold/15 font-semibold text-ink' : 'text-ink/90'}`}
                  >
                    {c.current && <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-gold" aria-hidden />}
                    <span className="num w-5 shrink-0 text-right text-xs text-dim">{i + 1}</span>
                    {c.pc ? <Shield size={14} className="shrink-0 text-arcane" aria-label="Player character" /> : <Swords size={14} className="shrink-0 text-dim" aria-label="Foe or other" />}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {mine && <Badge tone="gold">You</Badge>}
                    {c.hp && (
                      <span className="flex w-20 shrink-0 flex-col gap-0.5">
                        <span className="num text-right text-xs text-dim">
                          {c.hp.hp}/{c.hp.max}
                        </span>
                        <HpBar hp={c.hp.hp} max={c.hp.max} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <button
            type="button"
            className={`panel elev-3 ml-auto flex min-h-12 items-center gap-2.5 px-4 py-2 ${myTurn ? 'border-gold bg-gold/20' : ''}`}
            onClick={() => setOpen(true)}
            aria-label="Show the turn order"
          >
            <Swords size={16} className="text-gold" />
            <span className={`text-base font-semibold ${myTurn ? 'text-gold' : 'text-ink'}`}>{myTurn ? 'Your turn' : `${current?.name ?? 'Combat'}'s turn`}</span>
            <span className="num text-xs text-dim">Round {fight.round || 1}</span>
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
  const newest = all.length ? all.reduce((a, b) => (b.pushed_at > a.pushed_at ? b : a)).id : null;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PlayerPageTitle eyebrow="Campaign" icon={<Gift size={14} />} title="Handouts" subtitle="Letters, maps and pictures the GM has handed you, newest first." />
      {!all.length && (
        <Empty icon={<Gift size={28} />} title="Nothing yet">
          When the GM hands you a letter, a map or a picture, it appears here.
        </Empty>
      )}
      {all.map((h) => (
        <Card key={h.id} featured={h.id === newest} className="space-y-4 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-xl text-ink sm:text-2xl">{h.title}</h2>
            {h.id === newest && <Badge tone="gold">Newest</Badge>}
            <time className="num ml-auto text-xs text-dim" dateTime={h.pushed_at}>
              {all.length > 1 && campaigns.length > 1 ? `${h.campaign} · ` : ''}
              {new Date(h.pushed_at).toLocaleDateString()}
            </time>
          </div>
          {h.image_file && <img src={source.imageUrl(h.image_file)} alt={h.title} className="max-h-[70vh] max-w-full rounded-md border border-line object-contain" />}
          {h.body && (
            <div className="parchment prose-lore max-w-[72ch] px-4 py-3 font-serif text-[16px] sm:px-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{h.body}</ReactMarkdown>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/** The campaign's date, the year's festivals, and what's coming. */
export function PlayerCalendar() {
  const { campaigns } = usePlayerIndex();
  if (!campaigns) return null;
  const c = campaigns.find((x) => x.calendar);
  if (!c?.calendar) return <Empty icon={<CalendarDays size={28} />} title="No calendar yet" />;
  const cal = c.calendar;
  return (
    <div className="space-y-5">
      <PlayerPageTitle eyebrow="Campaign" icon={<CalendarDays size={14} />} title="Calendar" subtitle="The date in the world, the festivals and what's coming.">
        <div className="mt-4">
          <TodayCard def={cal.def} date={cal.date} />
        </div>
      </PlayerPageTitle>
      <Card title="Coming up">
        {cal.coming.length ? (
          <ul className="divide-y divide-line text-sm">
            {cal.coming.map((x, i) => (
              <li key={i} className="py-2 first:pt-0 last:pb-0">
                <span className={x.kind === 'festival' ? 'text-gold font-medium' : 'text-arcane font-medium'}>{x.title}</span>{' '}
                <span className="num text-dim text-xs">
                  {x.inDays === 0 ? 'today' : x.inDays === 1 ? 'tomorrow' : `in ${x.inDays} days`}, {formatDate(cal.def, x.date, 'short')}
                  {x.where ? `, ${x.where}` : ''}
                </span>
                {x.notes && <div className="text-xs text-dim">{x.notes}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-dim">Nothing for a while.</p>
        )}
      </Card>
      <CalendarView def={cal.def} date={cal.date} events={cal.coming.filter((x) => x.kind === 'event').map((x) => ({ day: x.date.day, year: x.date.year, title: x.title, kind: 'event' as const }))} />
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
    <div className="mx-auto max-w-4xl space-y-5">
      <PlayerPageTitle eyebrow="Campaign" icon={<Compass size={14} />} title="Around the World" subtitle="What your party has seen and heard, region by region." />
      {!all.length && (
        <Empty icon={<Compass size={28} />} title="Nowhere yet">
          You haven't been anywhere yet.
        </Empty>
      )}
      {all.map((r) => (
        <Card key={r.id} className="space-y-2">
          <h2>
            <Link to={`${base}/e/${encodeURIComponent(r.id)}`} data-peek={r.id} className="font-display text-xl text-ink hover:text-gold">
              {r.name}
            </Link>
          </h2>
          {r.lastVisit && (
            <p className="text-sm">
              Last there{r.lastVisit.place ? `: ${r.lastVisit.place}` : ''}
              {r.lastVisit.session ? <span className="text-dim"> (session {r.lastVisit.session})</span> : null}
            </p>
          )}
          {r.discovered.length > 0 && <p className="text-sm text-dim">Places you've found: {r.discovered.join(', ')}</p>}
          {r.heard.length > 0 && (
            <div>
              <div className="label mt-2">What you've heard lately</div>
              <ul className="list-disc space-y-1 pl-5 font-serif text-[16px] leading-relaxed">
                {r.heard.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
