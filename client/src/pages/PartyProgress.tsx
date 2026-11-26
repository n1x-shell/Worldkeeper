/**
 * Party progression for the GM (v0.9.6): how the party advances (milestones or experience), awards with their log,
 * who has earned a level, and who was at each session.
 */
import { useEffect, useState } from 'react';
import { ArrowUpCircle, Award as AwardIcon, Undo2 } from 'lucide-react';
import { levelForXp, readyToLevel, xpForNext, type Advancement } from '@shared/progression';
import { api, useApi } from '../lib/api';
import { Badge, Card, Check, ErrorBox, Field, Modal, Segmented, ask, useToast } from '../components/ui';

interface Char {
  id: number;
  name: string;
  kind: string;
  level: number;
  sheet: Record<string, unknown>;
}
const xpOf = (c: Char) => (typeof c.sheet.xp === 'number' ? c.sheet.xp : 0);
interface Ses {
  id: number;
  number: number;
  title: string;
  status: string;
}
interface Award {
  batch: string;
  kind: 'xp' | 'milestone';
  amount: number;
  reason: string;
  session_number: number | null;
  created_at: string;
  characters: { id: number; name: string }[];
}
interface Progress {
  awards: Award[];
  attendance: { taken: number; by: Record<number, number> };
}

const names = (list: { name: string }[]) => list.map((c) => c.name).join(', ');

export function PartyProgress({
  campaign,
  chars,
  sessions,
  beforeChange,
  onChanged,
}: {
  campaign: { id: number; advancement?: Advancement };
  chars: Char[];
  sessions: Ses[];
  /** Saves any edit still on its way from the open sheet, so an award isn't written over. */
  beforeChange: () => Promise<void>;
  onChanged: () => void;
}) {
  const mode: Advancement = campaign.advancement ?? 'milestone';
  const { data, reload } = useApi<Progress>(`/api/campaigns/${campaign.id}/awards`);
  const [giving, setGiving] = useState<'xp' | 'milestone' | null>(null);
  const { toast, node } = useToast();
  const party = chars.filter((c) => c.kind === 'pc' || c.kind === 'companion');
  const done = () => {
    void reload();
    onChanged();
  };
  const setMode = async (advancement: Advancement) => {
    await api.patch(`/api/campaigns/${campaign.id}`, { advancement });
    onChanged();
  };
  const levelUp = async (c: Char) => {
    await beforeChange();
    await api.post(`/api/campaigns/${campaign.id}/awards`, { kind: 'milestone', character_ids: [c.id], reason: mode === 'xp' ? `Enough experience for level ${c.level + 1}` : '' });
    toast(`${c.name} is level ${c.level + 1}. Their sheet offers what the level gives.`);
    done();
  };
  const takeBack = async (a: Award) => {
    const what = a.kind === 'xp' ? `${a.amount.toLocaleString()} XP from ${names(a.characters)}` : `the note of this milestone (the level itself stays: lower it on the sheet if you mean to)`;
    if (!(await ask({ body: `Take back ${what}?`, confirmLabel: 'Take back', danger: true }))) return;
    await beforeChange();
    await api.del(`/api/campaigns/${campaign.id}/awards/${a.batch}`);
    done();
  };

  return (
    <Card
      title="Progress"
      icon={<AwardIcon size={15} className="text-gold" />}
      actions={
        <Segmented
          size="sm"
          label="How the party advances"
          value={mode}
          onChange={(m) => void setMode(m)}
          options={[
            { value: 'milestone', label: 'Milestones', title: 'You say when the party gains a level' },
            { value: 'xp', label: 'Experience', title: 'Characters earn XP; a level comes at the 2024 rules’ totals' },
          ]}
        />
      }
    >
      <div className="space-y-3 text-sm" data-testid="party-progress">
        <ul className="divide-y divide-line/60">
          {party.map((c) => {
            const xp = xpOf(c);
            const next = xpForNext(c.level);
            const ready = mode === 'xp' && readyToLevel(c.level, xp);
            const sat = data?.attendance.taken ? `${data.attendance.by[c.id] ?? 0} of ${data.attendance.taken} sessions` : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="font-medium">{c.name}</span>
                <span className="text-dim">level {c.level}</span>
                {mode === 'xp' && (
                  <span className="num text-dim">
                    {xp.toLocaleString()} XP{next ? ` of ${next.toLocaleString()}` : ''}
                  </span>
                )}
                {ready && <Badge tone="gold">Has earned level {levelForXp(xp)}</Badge>}
                {sat && <span className="text-xs text-dim">at {sat}</span>}
                {c.level < 20 && (mode === 'milestone' || ready) && (
                  <button className={`${ready ? 'btn-primary' : 'btn-ghost'} ml-auto text-xs`} onClick={() => void levelUp(c)} aria-label={`Level up ${c.name} to ${c.level + 1}`}>
                    <ArrowUpCircle size={13} /> Level up
                  </button>
                )}
              </li>
            );
          })}
          {!party.length && <li className="py-1.5 text-dim">No player characters yet.</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          {mode === 'xp' && (
            <button className="btn-primary" disabled={!party.length} onClick={() => setGiving('xp')}>
              <AwardIcon size={14} /> Award experience
            </button>
          )}
          <button className={mode === 'milestone' ? 'btn-primary' : 'btn'} disabled={!party.length} onClick={() => setGiving('milestone')}>
            <ArrowUpCircle size={14} /> A milestone: the party levels up
          </button>
        </div>
        {!!data?.awards.length && (
          <details open={data.awards.length <= 5}>
            <summary className="label cursor-pointer">Awards so far ({data.awards.length})</summary>
            <ul className="mt-1 space-y-1">
              {data.awards.map((a) => (
                <li key={a.batch} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num">{a.kind === 'xp' ? `${a.amount.toLocaleString()} XP each` : 'A level'}</span>
                  <span className="text-dim">to {names(a.characters) || 'characters since removed'}</span>
                  {a.session_number != null && <span className="text-xs text-dim">· session {a.session_number}</span>}
                  {a.reason && <span>· {a.reason}</span>}
                  <button className="btn-ghost ml-auto text-xs" onClick={() => void takeBack(a)} aria-label={`Take back: ${a.kind === 'xp' ? `${a.amount} XP` : 'a level'} to ${names(a.characters)}`}>
                    <Undo2 size={12} /> Take back
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {node}
      {giving && (
        <GiveAward
          kind={giving}
          campaignId={campaign.id}
          party={party}
          sessions={sessions}
          beforeChange={beforeChange}
          onClose={() => setGiving(null)}
          onGiven={() => {
            setGiving(null);
            done();
          }}
        />
      )}
    </Card>
  );
}

function GiveAward({
  kind,
  campaignId,
  party,
  sessions,
  beforeChange,
  onClose,
  onGiven,
}: {
  kind: 'xp' | 'milestone';
  campaignId: number;
  party: Char[];
  sessions: Ses[];
  beforeChange: () => Promise<void>;
  onClose: () => void;
  onGiven: () => void;
}) {
  const recent = [...sessions].sort((a, b) => b.number - a.number);
  const [sessionId, setSessionId] = useState<number | ''>((recent.find((s) => s.status === 'live') ?? recent.find((s) => s.status === 'completed'))?.id ?? '');
  const [who, setWho] = useState<number[]>(party.filter((c) => c.kind === 'pc').map((c) => c.id));
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState(true);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Those who were at the session, once the GM has said who was.
  useEffect(() => {
    if (!sessionId) return;
    let on = true;
    void api.get<{ present: number[] | null }>(`/api/sessions/${sessionId}/attendance`).then((r) => on && r.present && setWho(r.present.filter((id) => party.some((c) => c.id === id))));
    return () => {
      on = false;
    };
    // Only when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  const n = Number(amount) || 0;
  const each = split && who.length ? Math.floor(n / who.length) : n;
  const give = async () => {
    try {
      await beforeChange();
      await api.post(`/api/campaigns/${campaignId}/awards`, {
        kind,
        character_ids: who,
        ...(kind === 'xp' ? (split ? { total: n } : { each: n }) : {}),
        session_id: sessionId || null,
        reason,
      });
      onGiven();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <Modal
      title={kind === 'xp' ? 'Award experience' : 'A milestone: level up'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!who.length || (kind === 'xp' && each < 1)} onClick={() => void give()}>
            {kind === 'xp' ? (each >= 1 ? `Give ${each.toLocaleString()} XP each` : 'Give') : `Level up ${who.length}`}
          </button>
        </>
      }
    >
      <div className="space-y-3" data-testid="give-award">
        {err && <ErrorBox error={err} />}
        {kind === 'xp' ? (
          <div className="grid grid-cols-[8rem_1fr] items-end gap-3">
            <Field label="Experience">
              <input className="input num" inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="700" />
            </Field>
            <Segmented
              label="How it is shared"
              value={split ? 'split' : 'each'}
              onChange={(v) => setSplit(v === 'split')}
              options={[
                { value: 'split', label: 'Shared between them', title: 'An encounter’s XP is shared out evenly' },
                { value: 'each', label: 'Each' },
              ]}
            />
          </div>
        ) : (
          <p className="text-sm text-dim">Each character chosen gains a level. Their sheet then offers what the level gives: hit points, features, and the choices to make.</p>
        )}
        <fieldset>
          <legend className="label">Who</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {party.map((c) => (
              <Check key={c.id} checked={who.includes(c.id)} label={c.name} onChange={(on) => setWho(on ? [...who, c.id] : who.filter((x) => x !== c.id))}>
                <span className="text-sm">
                  {c.name} <span className="text-xs text-dim">level {c.level}</span>
                </span>
              </Check>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Session" hint="Those you marked as there are ticked.">
            <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">None</option>
              {recent.map((s) => (
                <option key={s.id} value={s.id}>
                  Session {s.number}
                  {s.title ? `: ${s.title}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What for">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'xp' ? 'The goblin ambush' : 'The crown is found'} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** On a session's page: who was there. Unticked until the GM says; saved at once. */
export function Attendance({ sessionId, chars }: { sessionId: number; chars: Char[] }) {
  const { data, setData } = useApi<{ present: number[] | null }>(`/api/sessions/${sessionId}/attendance`);
  const party = chars.filter((c) => c.kind === 'pc' || c.kind === 'companion');
  if (!data || !party.length) return null;
  const present = data.present;
  const save = async (ids: number[]) => {
    setData({ present: ids });
    setData(await api.put<{ present: number[] }>(`/api/sessions/${sessionId}/attendance`, { character_ids: ids }));
  };
  return (
    <fieldset className="text-sm" data-testid="attendance">
      <legend className="label">Who was there</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {party.map((c) => (
          <Check key={c.id} checked={!!present?.includes(c.id)} label={`${c.name} was there`} onChange={(on) => void save(on ? [...(present ?? []), c.id] : (present ?? []).filter((x) => x !== c.id))}>
            <span>{c.name}</span>
          </Check>
        ))}
        {present === null ? (
          <button className="btn-ghost text-xs" onClick={() => void save(party.filter((c) => c.kind === 'pc').map((c) => c.id))}>
            Everyone
          </button>
        ) : (
          <span className="text-xs text-dim">
            {present.length} of {party.length}
          </span>
        )}
      </div>
    </fieldset>
  );
}
