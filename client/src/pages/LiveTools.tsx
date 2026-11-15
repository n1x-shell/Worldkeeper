import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Dices, Gift, Minus, Plus, ScrollText } from 'lucide-react';
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
      <QuickTables sessionId={sessionId} onLogged={onLogged} />
      <QuickTreasure sessionId={sessionId} campaignId={campaignId} onLogged={onLogged} />
      <QuickStanding campaignId={campaignId} onLogged={onLogged} />
      <QuickHandouts campaignId={campaignId} onLogged={onLogged} />
    </>
  );
}

function QuickTables({ sessionId, onLogged }: { sessionId: number; onLogged: () => void }) {
  const { data: b } = useApi<Briefing>(`/api/sessions/${sessionId}/briefing`);
  const [result, setResult] = useState<{ table: string; text: string } | null>(null);
  if (!b) return null;
  return (
    <div className="panel-pad space-y-2">
      <div className="flex items-center gap-2">
        <Dices size={15} className="text-gold" />
        <div className="section-title">Tables for here</div>
        {b.region && <span className="text-xs text-dim">{b.region.name}</span>}
      </div>
      {b.tables.length ? (
        <div className="flex flex-wrap gap-1.5">
          {b.tables.map((t) => (
            <button
              key={t.id}
              className="btn text-xs"
              onClick={async () => {
                const r = await api.post<{ result: string }>(`/api/random-tables/${t.id}/roll`);
                setResult({ table: t.name, text: r.result });
              }}
            >
              {t.name.replace(/^Encounters: /, '')}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-dim">
          No tables for the party's location. <Link to="/tables">Random tables</Link>
        </p>
      )}
      {result && (
        <div className="rounded-md border border-gold/40 p-2 text-sm space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-dim">{result.table}</div>
          <Markdown text={result.text} />
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
    </div>
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
    <div className="panel-pad space-y-2">
      <div className="flex items-center gap-2">
        <Coins size={15} className="text-gold" />
        <div className="section-title">Treasure</div>
        <span className="text-xs text-dim">
          {t.label}, levels {t.tier}
        </span>
      </div>
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
            {roll.coins.amount.toLocaleString('en')} {roll.coins.coin}
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
    </div>
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
    const reason = window.prompt(`Why does ${r.name}'s view of the party change?`, '');
    if (reason === null) return;
    const next = await api.post<StandingRow>('/api/standing/adjust', { campaign_id: campaignId, faction_id: r.faction_id, delta, reason });
    setData(data.map((x) => (x.faction_id === r.faction_id ? next : x)));
    onLogged();
  };
  return (
    <div className="panel-pad space-y-2">
      <div className="flex items-center gap-2">
        <div className="section-title">Standing</div>
        <Link to="/campaign/standing" className="text-xs text-arcane ml-auto">
          All factions
        </Link>
      </div>
      {rows.length ? (
        <ul className="text-sm space-y-1">
          {rows.map((r) => (
            <li key={r.faction_id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-xs text-dim w-24 text-right">
                {r.rank} ({r.renown})
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
        <p className="text-xs text-dim">The party hasn't dealt with any faction yet.</p>
      )}
    </div>
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
    <div className="panel-pad space-y-2">
      <div className="flex items-center gap-2">
        <Gift size={15} className="text-gold" />
        <div className="section-title">Handouts</div>
        <Link to="/campaign/handouts" className="text-xs text-arcane ml-auto">
          Write one
        </Link>
      </div>
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
        <p className="text-xs text-dim">No handouts written yet.</p>
      )}
    </div>
  );
}
