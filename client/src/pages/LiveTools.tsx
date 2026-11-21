import { EncounterIdeas } from '../components/EncounterIdeas';
import { CreatureLinks } from '../components/CreatureLinks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Dices, Gift, Minus, Plus, ScrollText, Shuffle, UserRound } from 'lucide-react';
import { askText, Badge, Card, Empty, EntityLink } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { Briefing } from './Briefing';
import { Markdown } from '../components/Markdown';

/**
 * The live session's quick tools: roll the region's tables, roll and keep treasure, change standing, and give handouts.
 * Everything that matters is written to the session log, so it feeds the recap.
 */
export function LiveTools({ sessionId, campaignId, onLogged }: { sessionId: number; campaignId: number; onLogged: () => void }) {
  return (
    <>
      <WhosNearby sessionId={sessionId} onLogged={onLogged} />
      <QuickTables sessionId={sessionId} onLogged={onLogged} />
      <QuickTreasure sessionId={sessionId} campaignId={campaignId} onLogged={onLogged} />
      <QuickStanding campaignId={campaignId} onLogged={onLogged} />
      <QuickHandouts campaignId={campaignId} onLogged={onLogged} />
    </>
  );
}

interface NearbyPerson {
  id: string;
  name: string;
  species: string | null;
  knownAs: string | null;
  pronouns: string | null;
  tagline: string | null;
  looks: string | null;
  manner: string | null;
  rumours: string[];
  gmOnly: boolean;
  distance: number;
}

/** Someone near the party, ready to play: looks, manner and something they've heard. */
function WhosNearby({ sessionId, onLogged }: { sessionId: number; onLogged: () => void }) {
  const { data } = useApi<{ place: string | null; people: NearbyPerson[] }>(`/api/sessions/${sessionId}/nearby`);
  const [i, setI] = useState<number | null>(null);
  const [r, setR] = useState(0);
  if (!data) return null;
  const list = data.people;
  const p = i == null ? null : list[i % list.length];
  const another = () => {
    if (!list.length) return;
    // Mostly people right here or close by; now and then someone from further off.
    const near = list.map((x, k) => k).filter((k) => list[k].distance < 2);
    const pool = near.length && Math.random() < 0.8 ? near : list.map((_, k) => k);
    let n = pool[Math.floor(Math.random() * pool.length)];
    if (list.length > 1 && n === i) n = (n + 1) % list.length;
    setI(n);
    setR(Math.floor(Math.random() * 1000));
  };
  return (
    <Card
      className="space-y-2"
      icon={<UserRound size={15} className="text-gold" />}
      title="Who's nearby"
      aside={data.place}
      actions={
        <button className="btn text-xs" onClick={another} disabled={!list.length}>
          <Shuffle size={12} /> {p ? 'Someone else' : 'Someone nearby'}
        </button>
      }
    >
      {!list.length && (
        <Empty compact title="Nobody lives where the party is.">
          Move the party on the map, or set the campaign's starting place.
        </Empty>
      )}
      {p && (
        <div className="rounded-md border border-gold/40 p-2 text-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <EntityLink id={p.id} />
            <span className="text-xs text-dim">{[p.species, p.knownAs, p.pronouns].filter((x) => x && x !== 'Unknown').join(', ')}</span>
            <span className="text-[10px] uppercase tracking-wider text-dim">{['right here', 'close by', 'in the area'][p.distance] ?? ''}</span>
            {p.gmOnly && <Badge tone="danger">GM only</Badge>}
          </div>
          {p.tagline && <p className="italic text-dim">{p.tagline}</p>}
          {p.looks && (
            <p>
              <span className="text-dim">Looks:</span> {p.looks}
            </p>
          )}
          {p.manner && (
            <p>
              <span className="text-dim">Manner:</span> {p.manner}
            </p>
          )}
          {p.rumours.length > 0 && (
            <p>
              <span className="text-dim">They might say:</span> "{p.rumours[r % p.rumours.length]}"
            </p>
          )}
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              await api.post('/api/session-log', { session_id: sessionId, kind: 'npc', text: `Met ${p.name}.`, entity_id: p.id });
              onLogged();
            }}
          >
            <ScrollText size={12} /> Log the meeting
          </button>
        </div>
      )}
    </Card>
  );
}

function QuickTables({ sessionId, onLogged }: { sessionId: number; onLogged: () => void }) {
  const { data: b } = useApi<Briefing>(`/api/sessions/${sessionId}/briefing`);
  const [result, setResult] = useState<{ table: string; text: string; creatures: { id: string; name: string }[] } | null>(null);
  if (!b) return null;
  return (
    <Card className="space-y-2" icon={<Dices size={15} className="text-gold" />} title="Tables for here" aside={b.region?.name}>
      {b.tables.length ? (
        <div className="flex flex-wrap gap-1.5">
          {b.tables.map((t) => (
            <button
              key={t.id}
              className="btn text-xs"
              onClick={async () => {
                const r = await api.post<{ result: string; creatures?: { id: string; name: string }[] }>(`/api/random-tables/${t.id}/roll`);
                setResult({ table: t.name, text: r.result, creatures: r.creatures ?? [] });
              }}
            >
              {t.name.replace(/^Encounters: /, '')}
            </button>
          ))}
        </div>
      ) : (
        <Empty compact title="No tables for the party's location.">
          <Link to="/tables">Random tables</Link>
        </Empty>
      )}
      {result && (
        <div className="rounded-md border border-gold/40 p-2 text-sm space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-dim">{result.table}</div>
          <Markdown text={result.text} />
          <CreatureLinks creatures={result.creatures} label="From your books" />
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              await api.post('/api/session-log', { session_id: sessionId, kind: 'roll', text: result.text.replace(/\*\*/g, '') });
              setResult(null);
              onLogged();
            }}
          >
            <ScrollText size={12} /> Log it
          </button>
        </div>
      )}
      <div className="pt-1 border-t border-line/60">
        <EncounterIdeas level={b.level} terrain={b.terrain} campaignId={b.campaign?.id} compact />
      </div>
    </Card>
  );
}

interface Roll {
  coins: { amount: number; coin: string };
  goods: { text: string; count: number }[];
  items: { name: string; entity_id: string | null }[];
  hook: string | null;
  total_gp: number;
}

function QuickTreasure({ sessionId, campaignId, onLogged }: { sessionId: number; campaignId: number; onLogged: () => void }) {
  const { data: b } = useApi<Briefing>(`/api/sessions/${sessionId}/briefing`);
  const [roll, setRoll] = useState<Roll | null>(null);
  if (!b?.treasure) return null;
  const t = b.treasure;
  const doRoll = async (kind: 'individual' | 'hoard') => setRoll(await api.post<Roll>('/api/treasure/roll', { tier: t.tier, region: t.region, kind }));
  return (
    <Card className="space-y-2" icon={<Coins size={15} className="text-gold" />} title="Treasure" aside={`${t.label}, levels ${t.tier}`}>
      <div className="flex gap-1.5">
        <button className="btn text-xs" onClick={() => doRoll('individual')}>
          Individual
        </button>
        <button className="btn text-xs" onClick={() => doRoll('hoard')}>
          Hoard
        </button>
      </div>
      {roll && (
        <div className="rounded-md border border-gold/40 p-2 text-sm space-y-1">
          <div>
            <span className="num">{roll.coins.amount.toLocaleString('en')}</span> {roll.coins.coin}
            {roll.goods.length > 0 && `, ${roll.goods.map((g) => (g.count > 1 ? `${g.count} × ${g.text}` : g.text)).join(', ')}`}
          </div>
          {roll.items.length > 0 && <div className="text-arcane">{roll.items.map((i) => i.name).join(', ')}</div>}
          {roll.hook && <div className="italic text-dim">{roll.hook}</div>}
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              await api.post('/api/party-treasure/from-roll', { campaign_id: campaignId, roll, found_at: b.location?.name ?? '' });
              setRoll(null);
              onLogged();
            }}
          >
            <Plus size={12} /> The party takes it
          </button>
        </div>
      )}
    </Card>
  );
}

interface StandingRow {
  faction_id: string;
  name: string;
  renown: number;
  rank: string;
  log: unknown[];
}

function QuickStanding({ campaignId, onLogged }: { campaignId: number; onLogged: () => void }) {
  const { data, setData } = useApi<StandingRow[]>(`/api/standing?campaign_id=${campaignId}`);
  if (!data) return null;
  const rows = data.filter((r) => r.renown !== 0 || r.log.length).slice(0, 8);
  const adjust = async (r: StandingRow, delta: number) => {
    const reason = await askText({ title: `Why does ${r.name}'s view of the party change?`, confirmLabel: delta < 0 ? 'Lower standing' : 'Raise standing' });
    if (reason === null) return;
    const next = await api.post<StandingRow>('/api/standing/adjust', { campaign_id: campaignId, faction_id: r.faction_id, delta, reason });
    setData(data.map((x) => (x.faction_id === r.faction_id ? next : x)));
    onLogged();
  };
  return (
    <Card
      className="space-y-2"
      title="Standing"
      actions={
        <Link to="/campaign/standing" className="text-xs text-arcane">
          All factions
        </Link>
      }
    >
      {rows.length ? (
        <ul className="text-sm space-y-1">
          {rows.map((r) => (
            <li key={r.faction_id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-xs text-dim w-24 text-right">
                {r.rank} (<span className="num">{r.renown}</span>)
              </span>
              <button className="btn-ghost p-0.5" onClick={() => adjust(r, -1)} aria-label={`Lower standing with ${r.name}`}>
                <Minus size={13} />
              </button>
              <button className="btn-ghost p-0.5" onClick={() => adjust(r, 1)} aria-label={`Raise standing with ${r.name}`}>
                <Plus size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty compact title="The party hasn't dealt with any faction yet." />
      )}
    </Card>
  );
}

interface Handout {
  id: number;
  title: string;
  pushed_at: string | null;
}

function QuickHandouts({ campaignId, onLogged }: { campaignId: number; onLogged: () => void }) {
  const { data, reload } = useApi<Handout[]>(`/api/handouts?campaign_id=${campaignId}`);
  if (!data) return null;
  return (
    <Card
      className="space-y-2"
      icon={<Gift size={15} className="text-gold" />}
      title="Handouts"
      actions={
        <Link to="/campaign/handouts" className="text-xs text-arcane">
          Write one
        </Link>
      }
    >
      {data.length ? (
        <ul className="text-sm space-y-1">
          {data.slice(0, 8).map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{h.title}</span>
              <button
                className={`btn text-xs ${h.pushed_at ? '' : 'border-gold/60 text-gold'}`}
                onClick={async () => {
                  await api.post(`/api/handouts/${h.id}/push`, { pushed: !h.pushed_at });
                  reload();
                  onLogged();
                }}
              >
                {h.pushed_at ? 'Take back' : 'Give to players'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty compact title="No handouts written yet." />
      )}
    </Card>
  );
}
