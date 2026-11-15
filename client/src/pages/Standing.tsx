import { useState } from 'react';
import { Eye, EyeOff, Minus, Plus, Undo2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Markdown } from '../components/Markdown';
import { EntityLink, ErrorBox, Loading, PageHeader } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { NeedCampaign } from './Campaign';
import { RANKS, earnedRanks, type RankName } from '../../../shared/standing';

/**
 * Faction standing for the active campaign: the party's Renown with each faction, its rank, what the ranks bring, and
 * every change with its reason. Changes made during a live session are written into the session log.
 */
interface Row {
  faction_id: string;
  name: string;
  type: string;
  revealed: boolean;
  renown: number;
  rank: RankName;
  next: { name: RankName; at: number } | null;
  player_visible: boolean;
  notes: string;
  rule_id: string | null;
  values: string;
  ranks: Partial<Record<RankName, string>>;
  log: { id: number; delta: number; reason: string; session_id: number | null; created_at: string }[];
}

const RANK_STYLE: Record<RankName, string> = {
  Hostile: 'bg-danger text-white',
  Distrusted: 'bg-danger/40',
  Neutral: 'bg-line',
  Initiate: 'bg-gold/30',
  Trusted: 'bg-gold/50',
  Exalted: 'bg-gold/75 text-black',
  Champion: 'bg-gold text-black',
};

export function StandingPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload, setData } = useApi<Row[]>(activeCampaignId ? `/api/standing?campaign_id=${activeCampaignId}` : null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const replace = (row: Row) => setData(data.map((r) => (r.faction_id === row.faction_id ? row : r)).concat(data.some((r) => r.faction_id === row.faction_id) ? [] : [row]));
  const known = data.filter((r) => r.renown !== 0 || r.log.length);
  const rest = data.filter((r) => !(r.renown !== 0 || r.log.length));
  const list = showAll ? data : known.length ? known : data;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Faction Standing"
        subtitle="The party's Renown with each faction, and what each rank brings."
        note="Ranks follow Aetheris Allegiance and Pacing: Hostile -10, Distrusted -3, Neutral 0, Initiate 3, Trusted 10, Exalted 25, Champion 50. Edit what a rank brings in the faction's Standing record."
      />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-72">
          <EntityPicker value={adding} types={['faction', 'cult', 'family']} onChange={setAdding} placeholder="Track another faction…" />
        </div>
        {adding && (
          <button
            className="btn"
            onClick={async () => {
              replace(await api.patch<Row>(`/api/standing/${adding}`, { campaign_id: activeCampaignId }));
              setOpen(adding);
              setAdding(null);
            }}
          >
            Track it
          </button>
        )}
        {known.length > 0 && rest.length > 0 && (
          <label className="flex items-center gap-2 text-sm ml-auto">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show factions the party hasn't dealt with ({rest.length})
          </label>
        )}
      </div>
      <ul className="space-y-2">
        {list.map((r) => (
          <StandingCard
            key={r.faction_id}
            row={r}
            campaignId={activeCampaignId}
            open={open === r.faction_id}
            onToggle={() => setOpen(open === r.faction_id ? null : r.faction_id)}
            onChange={replace}
            onReload={reload}
          />
        ))}
      </ul>
    </div>
  );
}

function StandingCard({ row: r, campaignId, open, onToggle, onChange }: { row: Row; campaignId: number; open: boolean; onToggle: () => void; onChange: (r: Row) => void; onReload: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const adjust = async (delta: number) => {
    try {
      setErr(null);
      onChange(await api.post<Row>('/api/standing/adjust', { campaign_id: campaignId, faction_id: r.faction_id, delta, reason }));
      setReason('');
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const earned = new Set(earnedRanks(r.renown));
  return (
    <li className="panel">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button type="button" className="text-left flex-1 min-w-[12rem]" onClick={onToggle} aria-expanded={open}>
          <div className="font-display text-gold text-lg leading-tight">{r.name}</div>
          <div className="text-xs text-dim">
            Renown {r.renown}
            {r.next ? ` · ${r.next.name} at ${r.next.at}` : ''}
            {!r.revealed ? ' · not yet known to players' : !r.player_visible ? ' · hidden from players' : ''}
          </div>
        </button>
        <span className={`text-xs px-2 py-0.5 rounded-full ${RANK_STYLE[r.rank]}`}>{r.rank}</span>
        <div className="flex items-center gap-1">
          {[-2, -1].map((d) => (
            <button key={d} className="btn-ghost text-xs px-2" onClick={() => adjust(d)} title={`${d} Renown`}>
              {d === -1 ? <Minus size={13} /> : d}
            </button>
          ))}
          {[1, 2, 3].map((d) => (
            <button key={d} className="btn-ghost text-xs px-2" onClick={() => adjust(d)} title={`+${d} Renown`}>
              {d === 1 ? <Plus size={13} /> : `+${d}`}
            </button>
          ))}
        </div>
      </div>
      {/* Where the party sits on the ladder. */}
      <div className="flex gap-0.5 px-3 pb-2" aria-hidden>
        {RANKS.map((k) => (
          <span key={k.name} title={k.name} className={`h-1.5 flex-1 rounded-full ${k.name === r.rank ? RANK_STYLE[k.name].split(' ')[0] : 'bg-line/60'}`} />
        ))}
      </div>
      {open && (
        <div className="border-t border-line p-3 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {r.values && (
              <div>
                <div className="section-title mb-1">What they value</div>
                <Markdown text={r.values} />
              </div>
            )}
            {RANKS.filter((k) => r.ranks[k.name]).map((k) => (
              <div key={k.name} className={`rounded-md border px-3 py-2 ${k.name === r.rank ? 'border-gold/60' : earned.has(k.name) ? 'border-gold/25' : 'border-line opacity-70'}`}>
                <div className="text-xs uppercase tracking-widest text-dim">
                  {k.name} {Number.isFinite(k.from) ? `(${k.from}${Number.isFinite(k.to) ? ` to ${k.to}` : '+'})` : '(-10 or less)'}
                  {k.name === r.rank ? ' · now' : ''}
                </div>
                <Markdown text={r.ranks[k.name]!} />
              </div>
            ))}
            {!r.rule_id && (
              <p className="text-sm text-dim">No Standing record for this faction yet, so its ranks bring nothing written down. Add a rule record with a Faction field to describe them.</p>
            )}
            {r.rule_id && (
              <p className="text-xs text-dim">
                Edit what each rank brings: <EntityLink id={r.rule_id} />
              </p>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor={`why-${r.faction_id}`}>
                Why (for the log)
              </label>
              <input id={`why-${r.faction_id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Carried the Seer's letter…" />
              <div className="flex flex-wrap gap-1 mt-2">
                {[-5, -3, -2, -1, 1, 2, 3, 5].map((d) => (
                  <button key={d} className="btn text-xs" onClick={() => adjust(d)}>
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              {err && <p className="text-danger text-xs mt-1">{err}</p>}
            </div>
            <button className="btn text-xs" onClick={async () => onChange(await api.patch<Row>(`/api/standing/${r.faction_id}`, { campaign_id: campaignId, player_visible: !r.player_visible }))}>
              {r.player_visible ? <Eye size={13} /> : <EyeOff size={13} />} {r.player_visible ? 'Players see this standing' : 'Hidden from players'}
            </button>
            <div>
              <div className="section-title mb-1">History</div>
              {r.log.length ? (
                <ul className="text-sm space-y-1">
                  {r.log.map((l) => (
                    <li key={l.id} className="flex items-start gap-2">
                      <span className={`w-8 text-right tabular-nums ${l.delta > 0 ? 'text-gold' : 'text-danger'}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
                      <span className="flex-1">{l.reason || <span className="text-dim">No reason given</span>}</span>
                      <button
                        className="text-dim hover:text-danger p-0.5"
                        title="Undo this change"
                        onClick={async () => onChange(await api.del<Row>(`/api/standing/log/${l.id}?campaign_id=${campaignId}`))}
                      >
                        <Undo2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-dim">No changes yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
