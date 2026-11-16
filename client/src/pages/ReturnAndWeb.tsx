import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Empty, EntityLink, ErrorBox, Loading, PageHeader } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { WebDiagram } from '../player/WebAndOmens';

interface ReturnData {
  stage: number;
  heldUntil: string;
  stages: { stage: number; title: string; gm: string; omen: string; rumours: string[] }[];
  log: { from_stage: number; to_stage: number; reason: string; created_at: string }[];
}

/**
 * The Return: a seven-stage clock only the GM sees (The Return [COS-032]). Each stage it reaches shows its omen and
 * rumours to the players, on their Signs and Omens page. Forming any Orb jumps it to stage 6.
 */
export function ReturnPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, setData } = useApi<ReturnData>(activeCampaignId ? `/api/return?campaign_id=${activeCampaignId}` : null);
  const [reason, setReason] = useState('');
  const [held, setHeld] = useState('');
  if (!activeCampaignId) return <Empty title="No active campaign">Choose a campaign first.</Empty>;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const move = async (body: Record<string, unknown>) => {
    setData(await api.post<ReturnData>('/api/return', { campaign_id: activeCampaignId, reason: reason || undefined, held_until: held || data.heldUntil, ...body }));
    setReason('');
  };
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="The Return" subtitle="A clock only you see. Each stage it reaches shows its omen to the players, on their Signs and Omens page." />
      <p className="text-sm text-dim">
        What moves it, what holds it and what each stage means: <EntityLink id="COS-032" />.
      </p>
      <div className="panel-pad space-y-3">
        <div className="flex items-center gap-1" aria-label={`Stage ${data.stage} of 7`}>
          {data.stages.map((s) => (
            <div key={s.stage} title={s.title} className={`flex-1 h-3 rounded ${s.stage <= data.stage ? 'bg-danger/80' : 'bg-raised border border-line'}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-gold text-lg">{data.stage ? `Stage ${data.stage}: ${data.stages[data.stage - 1]?.title}` : 'Not yet begun'}</span>
          <div className="ml-auto flex gap-1">
            <button className="btn" disabled={data.stage <= 0 || !reason.trim()} title="Going back needs a reason" onClick={() => void move({ stage: data.stage - 1 })}>
              <Minus size={14} /> Back
            </button>
            <button className="btn" disabled={data.stage >= 7} onClick={() => void move({ stage: data.stage + 1 })}>
              <Plus size={14} /> Advance
            </button>
            <button className="btn" disabled={data.stage >= 6} onClick={() => void move({ orb: true })} title="Any Orb jumps the clock to stage 6">
              An Orb was formed
            </button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Why it moved (for the log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className="input" placeholder="Held until (a season, if something holds it)" defaultValue={data.heldUntil} onChange={(e) => setHeld(e.target.value)} />
        </div>
      </div>
      <ol className="space-y-2">
        {data.stages.map((s) => (
          <li key={s.stage} className={`panel-pad space-y-1 ${s.stage <= data.stage ? 'border-danger/50' : 'opacity-80'}`}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-gold">
                {s.stage}. {s.title}
              </span>
              {s.stage <= data.stage && <span className="text-[10px] uppercase tracking-wider text-danger">reached: players have seen this</span>}
            </div>
            {s.gm && <Markdown text={s.gm} />}
            <p className="text-sm">
              <span className="text-dim">Players see:</span> {s.omen}
            </p>
            <p className="text-xs text-dim">Rumours: {s.rumours.map((r) => `"${r}"`).join(' ')}</p>
          </li>
        ))}
      </ol>
      {data.log.length > 0 && (
        <div className="panel-pad">
          <div className="section-title mb-1">History</div>
          <ul className="text-sm space-y-1">
            {data.log.map((l, i) => (
              <li key={i}>
                Stage {l.from_stage} → {l.to_stage}
                {l.reason && <span className="text-dim">: {l.reason}</span>} <span className="text-xs text-dim">{new Date(l.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Tie {
  a: string;
  b: string;
  aName: string;
  bName: string;
  kind: 'allied' | 'opposed';
  public: boolean;
  revealed: boolean;
}
interface Group {
  id: string;
  name: string;
  realm: string;
  revealed: number;
}

/**
 * The faction web for the GM: every tie from the library's links. Public ties (named in a faction's "Who opposes
 * them" line) players always see; reveal any other tie when the party learns it.
 */
export function FactionWebPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, setData } = useApi<{ groups: Group[]; ties: Tie[] }>(`/api/faction-web${activeCampaignId ? `?campaign_id=${activeCampaignId}` : ''}`);
  const [realm, setRealm] = useState('aetheris');
  const [focus, setFocus] = useState<string | null>(null);
  const realmOf = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.id, g.realm])), [data]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const ties = data.ties.filter((t) => (realmOf.get(t.a) === realm || realmOf.get(t.b) === realm) && (!focus || t.a === focus || t.b === focus));
  const reveal = async (t: Tie, on: boolean) => {
    if (!activeCampaignId) return;
    setData(await api.post('/api/faction-web/reveal', { campaign_id: activeCampaignId, a: t.a, b: t.b, on }));
  };
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title="Faction Web" subtitle="Every alliance and enmity in the library. Players see the public ones, and any you reveal." />
      <p className="text-sm text-dim">
        Ties come from the factions' links (allied with, opposes): change them on each faction's page. Players see it under <Link to="/player/factions-web">Faction Web</Link>.
      </p>
      <div className="flex flex-wrap gap-1">
        {[
          ['aetheris', 'Aetheris'],
          ['kaelmar', 'Kaelmar'],
          ['ethereal', 'The Ethereal Realm'],
        ].map(([k, l]) => (
          <button key={k} className={`chip ${realm === k ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => (setRealm(k), setFocus(null))}>
            {l}
          </button>
        ))}
        {focus && (
          <button className="chip border-line text-dim" onClick={() => setFocus(null)}>
            Show all
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-2">
          <WebDiagram ties={ties.map((t) => ({ ...t, dashed: !t.public && !t.revealed }))} onPick={setFocus} />
          <p className="text-xs text-dim px-2">Gold: allies. Red: enemies. Dashed: players don't know yet. Click a faction to see only its ties.</p>
        </div>
        <ul className="space-y-1 text-sm">
          {ties.map((t) => (
            <li key={`${t.a}-${t.b}`} className="panel px-3 py-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${t.kind === 'opposed' ? 'bg-danger' : 'bg-gold'}`} />
              <span className="flex-1">
                <EntityLink id={t.a} /> {t.kind === 'opposed' ? 'vs' : 'with'} <EntityLink id={t.b} />
              </span>
              {t.public ? (
                <span className="text-[10px] uppercase tracking-wider text-dim">public</span>
              ) : (
                <button className="btn-ghost text-xs" disabled={!activeCampaignId} onClick={() => void reveal(t, !t.revealed)} title={activeCampaignId ? '' : 'Choose a campaign first'}>
                  {t.revealed ? <Eye size={13} className="text-gold" /> : <EyeOff size={13} />} {t.revealed ? 'Revealed' : 'Reveal'}
                </button>
              )}
            </li>
          ))}
          {!ties.length && <li className="text-dim">No ties here.</li>}
        </ul>
      </div>
    </div>
  );
}
