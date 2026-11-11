import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Dice5, Heart, Plus, Shield, Skull, Trash2, Users, Sword, Eye, EyeOff, Brain, Pin } from 'lucide-react';
import { CONDITIONS_2024 } from '@shared/domain';
import { applyDamage, applyHealing, newCombatant, nextTurn, previousTurn, rollDice, sortByInitiative, type Combatant, type DiceResult } from '@shared/play';
import { api, qs, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import type { Entity, EntitySummary, StateRow } from '../lib/types';
import { AutoTextarea, CanonFlags, Empty, EntityLink, ErrorBox, Field, Loading, PageHeader, SaveStatus } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { Markdown } from '../components/Markdown';
import { splitSections } from '../lib/sections';
import type { Character } from './Campaign';
import { ProfileSummary, type ProfileResponse } from './Profile';
import { profileKindFor } from '@shared/profiles';
import { INFLUENCE_LEVELS } from '@shared/profiles';

// ------------------------------------------------------------------ Encounter tracker (used standalone and in live mode)
interface Encounter {
  id: number;
  campaign_id: number | null;
  session_id: number | null;
  title: string;
  notes: string;
  round: number;
  turn_index: number;
  status: string;
  combatants: Combatant[];
}

export function EncounterTracker({ encounterId, compact = false, onLog }: { encounterId: number; compact?: boolean; onLog?: (text: string) => void }) {
  const { data, error } = useApi<Encounter>(`/api/encounters/${encounterId}`);
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [dmg, setDmg] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const { activeCampaignId } = useAppState();
  const { data: party } = useApi<Character[]>(activeCampaignId ? `/api/characters?campaign_id=${activeCampaignId}` : null);
  const auto = useAutosave((e: Encounter) => api.patch(`/api/encounters/${e.id}`, { title: e.title, notes: e.notes, round: e.round, turn_index: e.turn_index, status: e.status, combatants: e.combatants }), 400);
  const [newName, setNewName] = useState('');
  const [newEntity, setNewEntity] = useState<string | null>(null);
  const [newInit, setNewInit] = useState('');
  const [newHp, setNewHp] = useState('');
  const [newAc, setNewAc] = useState('');
  const [newCount, setNewCount] = useState('1');
  const { index } = useAppState();
  useEffect(() => {
    if (data) setEnc(data);
  }, [data]);
  if (error) return <ErrorBox error={error} />;
  if (!enc) return <Loading />;
  const save = (p: Partial<Encounter>) => {
    const n = { ...enc, ...p };
    setEnc(n);
    auto.schedule(n);
  };
  const setC = (id: string, f: (c: Combatant) => Combatant) => save({ combatants: enc.combatants.map((c) => (c.id === id ? f(c) : c)) });
  const list = enc.combatants;
  const active = enc.round > 0 ? list[enc.turn_index] : null;

  const addPCs = () => {
    const pcs = (party ?? []).filter((c) => c.kind === 'pc' && !list.some((x) => x.name === c.name));
    save({
      combatants: [
        ...list,
        ...pcs.map((c) => newCombatant({ name: c.name, isPC: true, hp: c.sheet.hp ?? c.sheet.maxHp ?? 0, maxHp: c.sheet.maxHp ?? 0, ac: c.sheet.ac ?? null, initiativeBonus: c.sheet.initiativeBonus ?? 0 })),
      ],
    });
  };
  const add = () => {
    const name = newName.trim() || (newEntity ? index.get(newEntity)?.name ?? newEntity : '');
    if (!name) return;
    const n = Math.max(1, Math.min(20, Number(newCount) || 1));
    const extra = Array.from({ length: n }, (_, i) =>
      newCombatant({ name: n > 1 ? `${name} ${i + 1}` : name, entityId: newEntity, initiative: newInit ? Number(newInit) : null, hp: Number(newHp) || 0, maxHp: Number(newHp) || 0, ac: newAc ? Number(newAc) : null }),
    );
    save({ combatants: [...list, ...extra] });
    setNewName('');
    setNewEntity(null);
    setNewInit('');
    setNewHp('');
    setNewAc('');
    setNewCount('1');
  };
  const sort = () => {
    const cur = active?.id;
    const sorted = sortByInitiative(list);
    save({ combatants: sorted, turn_index: cur ? Math.max(0, sorted.findIndex((c) => c.id === cur)) : enc.turn_index });
  };
  const rollMissing = () =>
    save({
      combatants: sortByInitiative(list.map((c) => (c.initiative == null ? { ...c, initiative: rollDice(`1d20${c.initiativeBonus >= 0 ? '+' : ''}${c.initiativeBonus}`).total } : c))),
    });
  const next = () => {
    const sorted = enc.round === 0 ? sortByInitiative(list) : list;
    const s = nextTurn(sorted, { round: enc.round, turnIndex: enc.turn_index });
    if (s.round !== enc.round) onLog?.(`Round ${s.round} begins in ${enc.title}.`);
    save({ combatants: sorted, round: s.round, turn_index: s.turnIndex, status: 'running' });
  };
  const prev = () => {
    const s = previousTurn(list, { round: enc.round, turnIndex: enc.turn_index });
    save({ round: s.round, turn_index: s.turnIndex });
  };
  const hit = (c: Combatant, sign: 1 | -1) => {
    const amt = Number(dmg[c.id]);
    if (!amt) return;
    if (sign === 1) {
      const out = applyDamage(c, amt);
      setC(c.id, () => out.combatant);
      if (out.concentrationDC) setAlert(`${c.name} takes ${amt} damage while concentrating on ${c.concentration}: Constitution save DC ${out.concentrationDC}.`);
    } else setC(c.id, (x) => applyHealing(x, amt));
    setDmg({ ...dmg, [c.id]: '' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <input className="input max-w-xs font-display" value={enc.title} onChange={(e) => save({ title: e.target.value })} />}
        <span className="chip border-gold/60 text-gold">Round {enc.round || '—'}</span>
        <button className="btn" onClick={prev} disabled={enc.round === 0} aria-label="Previous turn">
          <ChevronLeft size={14} />
        </button>
        <button className="btn-primary" onClick={next}>
          {enc.round === 0 ? 'Start combat' : 'Next turn'} <ChevronRight size={14} />
        </button>
        <button className="btn" onClick={rollMissing} title="Roll d20 + bonus for anyone without initiative">
          <Dice5 size={14} /> Roll missing
        </button>
        <button className="btn" onClick={sort}>
          Sort
        </button>
        {party && party.length > 0 && (
          <button className="btn" onClick={addPCs}>
            <Users size={14} /> Add party
          </button>
        )}
        {enc.round > 0 && (
          <button
            className="btn"
            onClick={() => {
              onLog?.(`${enc.title} ended after ${enc.round} round(s).`);
              save({ round: 0, turn_index: 0, status: 'finished' });
            }}
          >
            End combat
          </button>
        )}
        <SaveStatus state={auto.state} error={auto.error} />
      </div>
      {alert && (
        <div className="panel border-amber-500/60 bg-amber-500/10 p-2 text-sm flex items-center gap-2" role="alert">
          <Brain size={14} className="text-amber-400" /> {alert}
          <button className="btn-ghost ml-auto" onClick={() => setAlert(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Init</th>
              <th>Combatant</th>
              <th>AC</th>
              <th>HP</th>
              <th>Damage / heal</th>
              <th>Conditions</th>
              <th>Concentration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => {
              const isTurn = enc.round > 0 && i === enc.turn_index;
              const pct = c.maxHp ? c.hp / c.maxHp : 1;
              return (
                <tr key={c.id} className={`${isTurn ? 'bg-gold/10' : ''} ${c.defeated ? 'opacity-40' : ''}`}>
                  <td className="w-16">
                    <input
                      className="input w-14 py-0.5 text-center"
                      value={c.initiative ?? ''}
                      onChange={(e) => setC(c.id, (x) => ({ ...x, initiative: e.target.value === '' ? null : Number(e.target.value) }))}
                      aria-label={`${c.name} initiative`}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {isTurn && <span className="text-gold">▶</span>}
                      {c.isPC ? <Shield size={12} className="text-arcane" /> : <Sword size={12} className="text-dim" />}
                      <input className="bg-transparent outline-none font-medium min-w-0" value={c.name} onChange={(e) => setC(c.id, (x) => ({ ...x, name: e.target.value }))} />
                    </div>
                    {c.entityId && <EntityLink id={c.entityId} className="text-[11px]" />}
                  </td>
                  <td className="w-14">
                    <input className="input w-12 py-0.5 text-center" value={c.ac ?? ''} onChange={(e) => setC(c.id, (x) => ({ ...x, ac: e.target.value === '' ? null : Number(e.target.value) }))} aria-label="AC" />
                  </td>
                  <td className="w-36">
                    <div className="flex items-center gap-1">
                      <input className="input w-12 py-0.5 text-center" value={c.hp} onChange={(e) => setC(c.id, (x) => ({ ...x, hp: Number(e.target.value) || 0 }))} aria-label="HP" />/
                      <input className="input w-12 py-0.5 text-center" value={c.maxHp} onChange={(e) => setC(c.id, (x) => ({ ...x, maxHp: Number(e.target.value) || 0 }))} aria-label="Max HP" />
                    </div>
                    <div className="h-1 bg-raised rounded mt-1">
                      <div className={`h-full rounded ${pct > 0.5 ? 'bg-ok' : pct > 0.25 ? 'bg-amber-500' : 'bg-danger'}`} style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
                    </div>
                    {c.tempHp > 0 && <div className="text-[10px] text-arcane">+{c.tempHp} temp</div>}
                  </td>
                  <td className="w-44">
                    <div className="flex gap-1">
                      <input className="input w-14 py-0.5" value={dmg[c.id] ?? ''} onChange={(e) => setDmg({ ...dmg, [c.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && hit(c, 1)} aria-label="Amount" />
                      <button className="btn px-1.5 text-danger" onClick={() => hit(c, 1)} title="Damage">
                        <Sword size={12} />
                      </button>
                      <button className="btn px-1.5 text-ok" onClick={() => hit(c, -1)} title="Heal">
                        <Heart size={12} />
                      </button>
                      <button className="btn px-1.5" title="Set temp HP" onClick={() => setC(c.id, (x) => ({ ...x, tempHp: Number(dmg[c.id]) || 0 }))}>
                        T
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-0.5">
                      {c.conditions.map((k) => (
                        <button key={k} className="chip border-danger/60 text-danger" onClick={() => setC(c.id, (x) => ({ ...x, conditions: x.conditions.filter((y) => y !== k) }))} title="Remove">
                          {k} ×
                        </button>
                      ))}
                      <select className="input w-24 py-0 text-xs" value="" onChange={(e) => e.target.value && setC(c.id, (x) => ({ ...x, conditions: [...x.conditions, e.target.value] }))} aria-label="Add condition">
                        <option value="">+ cond.</option>
                        {CONDITIONS_2024.filter((k) => !c.conditions.includes(k)).map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="w-32">
                    <input className="input py-0.5 text-xs" placeholder="spell" value={c.concentration ?? ''} onChange={(e) => setC(c.id, (x) => ({ ...x, concentration: e.target.value || null }))} aria-label="Concentration" />
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-ghost" title={c.defeated ? 'Restore' : 'Mark defeated'} onClick={() => setC(c.id, (x) => ({ ...x, defeated: !x.defeated }))}>
                      <Skull size={13} />
                    </button>
                    <button className="btn-ghost" title={c.hidden ? 'Hidden from players' : 'Visible'} onClick={() => setC(c.id, (x) => ({ ...x, hidden: !x.hidden }))}>
                      {c.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button className="btn-ghost" onClick={() => save({ combatants: list.filter((x) => x.id !== c.id), turn_index: Math.min(enc.turn_index, Math.max(0, list.length - 2)) })} aria-label="Remove">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-3 text-sm text-dim">Add combatants below.</p>}
      </div>
      <div className="panel-pad flex flex-wrap gap-2 items-end">
        <div className="w-40 grow">
          <Field label="Name">
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Bandit, wolf…" />
          </Field>
        </div>
        <div className="w-52 grow">
          <Field label="Linked record (optional)">
            <EntityPicker value={newEntity} types={['npc', 'creature']} onChange={setNewEntity} />
          </Field>
        </div>
        <div className="w-16">
          <Field label="Init">
            <input className="input" value={newInit} onChange={(e) => setNewInit(e.target.value)} />
          </Field>
        </div>
        <div className="w-16">
          <Field label="HP">
            <input className="input" value={newHp} onChange={(e) => setNewHp(e.target.value)} />
          </Field>
        </div>
        <div className="w-16">
          <Field label="AC">
            <input className="input" value={newAc} onChange={(e) => setNewAc(e.target.value)} />
          </Field>
        </div>
        <div className="w-14">
          <Field label="Count">
            <input className="input" value={newCount} onChange={(e) => setNewCount(e.target.value)} />
          </Field>
        </div>
        <button className="btn-primary" onClick={add}>
          <Plus size={14} /> Add
        </button>
      </div>
      <p className="text-xs text-dim">Statistics are whatever you enter. The tracker does not contain monster stat blocks; attach your own rules or creature records.</p>
      {!compact && (
        <Field label="Encounter notes">
          <AutoTextarea minRows={3} value={enc.notes} onChange={(e) => save({ notes: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

export function TrackerPage() {
  const { encounterId } = useParams();
  const nav = useNavigate();
  const { activeCampaignId } = useAppState();
  const { data: list, reload } = useApi<Encounter[]>(activeCampaignId ? `/api/encounters?campaign_id=${activeCampaignId}` : '/api/encounters');
  useEffect(() => {
    if (encounterId !== 'quick' || !list) return;
    (async () => {
      const existing = list.find((e) => e.title === 'Quick initiative');
      const id = existing?.id ?? (await api.post<Encounter>('/api/encounters', { title: 'Quick initiative', campaign_id: activeCampaignId })).id;
      nav(`/tracker/${id}`, { replace: true });
    })();
  }, [encounterId, list, activeCampaignId, nav]);
  if (encounterId && encounterId !== 'quick')
    return (
      <div className="space-y-3">
        <PageHeader title="Encounter Tracker" actions={<Link className="btn" to="/tracker">All encounters</Link>} />
        <EncounterTracker key={encounterId} encounterId={Number(encounterId)} />
      </div>
    );
  return (
    <div className="space-y-3">
      <PageHeader
        title="Encounter Tracker"
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              const e = await api.post<Encounter>('/api/encounters', { title: 'New encounter', campaign_id: activeCampaignId });
              void reload();
              nav(`/tracker/${e.id}`);
            }}
          >
            <Plus size={14} /> New encounter
          </button>
        }
      />
      {!list ? (
        <Loading />
      ) : (
        <ul className="grid gap-2 md:grid-cols-3">
          {list.map((e) => (
            <li key={e.id}>
              <Link to={`/tracker/${e.id}`} className="panel p-3 block hover:border-gold/60">
                <div className="font-display text-gold">{e.title}</div>
                <div className="text-xs text-dim">
                  {e.status} · {e.combatants.length} combatants · round {e.round}
                </div>
              </Link>
            </li>
          ))}
          {!list.length && <Empty title="No encounters yet" />}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Dice
export function DiceRoller({ compact = false }: { compact?: boolean }) {
  const [expr, setExpr] = useState('1d20');
  const [results, setResults] = useState<DiceResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const roll = async (e: string) => {
    try {
      const r = await api.post<DiceResult>('/api/dice/roll', { expression: e });
      setResults((rs) => [r, ...rs].slice(0, 30));
      setErr(null);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input font-mono" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && roll(expr)} aria-label="Dice expression" />
        <button className="btn-primary" onClick={() => roll(expr)}>
          <Dice5 size={14} /> Roll
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '1d20 adv', '1d20 dis', '4d6kh3', '2d6'].map((d) => (
          <button key={d} className="btn px-2 py-0.5 text-xs" onClick={() => roll(d)}>
            {d}
          </button>
        ))}
      </div>
      {err && <div className="text-xs text-danger">{err}</div>}
      <ul className={`space-y-1 ${compact ? 'max-h-40' : 'max-h-[50vh]'} overflow-auto`}>
        {results.map((r, i) => (
          <li key={i} className={`flex items-baseline gap-2 ${i === 0 ? 'text-ink' : 'text-dim'}`}>
            <span className={`font-display ${i === 0 ? 'text-2xl text-gold' : 'text-base'}`}>{r.total}</span>
            <span className="text-xs font-mono">
              {r.expression}: {r.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DicePage() {
  return (
    <div className="max-w-xl">
      <PageHeader title="Dice Roller" subtitle="Supports NdM±K, adv/dis on d20, keep/drop (kh, kl, dh, dl) and d%." />
      <div className="panel-pad">
        <DiceRoller />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Conditions
export function ConditionsPage() {
  const { data } = useApi<EntitySummary[]>('/api/entities?type=rule,system');
  return (
    <div className="space-y-4">
      <PageHeader title="Combat Conditions" subtitle="The 2024 condition names used by the tracker. Rules text is not reproduced here; add your own summaries as Rule records with a source reference." />
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CONDITIONS_2024.map((c) => (
          <div key={c} className="panel p-3 text-center font-display text-gold">
            {c}
          </div>
        ))}
      </div>
      <div className="panel-pad">
        <div className="section-title mb-2">Setting conditions and mechanics in your library</div>
        <ul className="text-sm grid sm:grid-cols-2 gap-1">
          {data?.map((r) => (
            <li key={r.id}>
              <EntityLink id={r.id}>{r.name}</EntityLink> <CanonFlags status={r.canon_status} flags={r.canon_flags} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Rules reference
export function RulesPage() {
  const { data } = useApi<EntitySummary[]>('/api/entities?type=rule,system,magic_system');
  const [mech, setMech] = useState('');
  const rows = (data ?? []).filter((r) => !mech || r.canon_flags.includes(mech) || (mech === 'UNVERIFIED' && !r.canon_flags.some((f) => ['OFFICIAL', 'HOMEBREW'].includes(f))));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Rules Reference"
        subtitle="Your setting rules (Shards, Thinning and Unmaking, glyph-work, vault keys…) as imported. Official, homebrew and unverified mechanics are labelled. No rulebook is bundled."
        actions={
          <Link className="btn-primary" to="/new?type=rule">
            <Plus size={14} /> New rule entry
          </Link>
        }
      />
      <div className="flex gap-1.5">
        {['', 'OFFICIAL', 'HOMEBREW', 'OUTSIDE 2024 CORE', 'UNVERIFIED'].map((m) => (
          <button key={m} className={`chip ${mech === m ? 'border-gold text-gold' : 'border-line text-dim'}`} onClick={() => setMech(m)}>
            {m || 'All'}
          </button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((r) => (
          <Link key={r.id} to={`/e/${r.id}`} className="panel p-3 hover:border-gold/60">
            <div className="flex justify-between gap-2">
              <span className="text-ink">{r.name}</span>
              <span className="text-xs text-dim">{r.id}</span>
            </div>
            <CanonFlags status={r.canon_status} flags={r.canon_flags} />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ NPC quick reference
export function NpcCard({ id }: { id: string }) {
  const { activeCampaignId } = useAppState();
  const { data } = useApi<{ entity: Entity }>(`/api/entities/${encodeURIComponent(id)}`);
  const isProfiled = data ? profileKindFor(data.entity.type) !== null : false;
  const { data: profile } = useApi<ProfileResponse>(isProfiled ? `/api/profiles/${encodeURIComponent(id)}${activeCampaignId ? `?campaign=${activeCampaignId}` : ''}` : null);
  if (!data) return <div className="panel p-3"><Loading /></div>;
  const e = data.entity;
  const portrait = profile?.world.portrait as string | undefined;
  const keys =
    profile?.kind === 'faction'
      ? ['attitude', 'goals', 'currentPlans', 'leaders', 'headquarters', 'secrets']
      : ['pronouns', 'role', 'voice', 'attitude', 'status', 'goals', 'pressures', 'promises', 'debts', 'lastEncountered', 'secrets'];
  return (
    <div className="panel p-3 text-sm space-y-1.5">
      <div className="flex gap-3 items-start">
        {portrait && <img src={`/api/uploads/${portrait}`} alt="" className="w-14 h-14 rounded object-cover border border-line" />}
        <div>
          <Link to={`/e/${e.id}`} className="font-display text-gold text-base">
            {e.name}
          </Link>
          <div className="text-[11px] text-dim">
            {e.id} · {e.realm}
          </div>
        </div>
      </div>
      {profile ? (
        <>
          <ProfileSummary p={profile} keys={keys} />
          {profile.lastLogged && (
            <div className="text-[11px] text-dim">
              Last in log: session {profile.lastLogged.session_number}, “{profile.lastLogged.text.slice(0, 80)}”
            </div>
          )}
        </>
      ) : (
        <Markdown text={splitSections(e.body).find((s) => s.content && !s.secret)?.content.slice(0, 300) ?? ''} className="prose-lore text-[14px]" />
      )}
      {e.notes && <div className="text-xs text-dim italic line-clamp-3">{e.notes}</div>}
    </div>
  );
}

export function NpcRefPage() {
  const [sp, setSp] = useSearchParams();
  const pinned = (sp.get('ids') ?? '').split(',').filter(Boolean);
  const { data } = useApi<EntitySummary[]>('/api/entities?type=npc');
  const [q, setQ] = useState('');
  const shown = pinned.length ? pinned : (data ?? []).filter((n) => n.favorite).map((n) => n.id);
  return (
    <div className="space-y-4">
      <PageHeader title="NPC Quick Reference" subtitle="Compact cards for play. Pin NPCs here or star them as favorites. Missing details show as UNDEFINED; nothing is filled in." />
      <div className="flex gap-2 max-w-lg">
        <EntityPicker value={null} types={['npc']} placeholder="Pin an NPC…" onChange={(id) => id && setSp({ ids: [...new Set([...pinned, id])].join(',') })} />
        {pinned.length > 0 && (
          <button className="btn" onClick={() => setSp({})}>
            Clear
          </button>
        )}
      </div>
      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((id) => (
            <NpcCard key={id} id={id} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-dim">Pin NPCs above, or star NPCs to show them by default.</p>
      )}
      <div className="panel-pad">
        <input className="input mb-2 max-w-xs" placeholder="Filter all NPCs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-1 text-sm">
          {data
            ?.filter((n) => !q || n.name.toLowerCase().includes(q.toLowerCase()))
            .map((n) => (
              <button key={n.id} className="text-left hover:text-gold flex items-center gap-1" onClick={() => setSp({ ids: [...new Set([...pinned, n.id])].join(',') })}>
                <Pin size={11} className="text-dim" /> {n.name}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Faction agendas
interface Plan {
  id: number;
  campaign_id: number | null;
  faction_id: string;
  title: string;
  goal: string;
  deadline: string;
  progress: number;
  segments: number;
  status: string;
  attitude: string;
  notes: string;
}
export function AgendasPage() {
  const { activeCampaignId } = useAppState();
  const { data, reload } = useApi<Plan[]>(activeCampaignId ? `/api/faction-plans?campaign_id=${activeCampaignId}` : null);
  const { data: factions } = useApi<EntitySummary[]>('/api/entities?type=faction,cult');
  const [faction, setFaction] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const byFaction = useMemo(() => {
    const m = new Map<string, Plan[]>();
    for (const p of data ?? []) m.set(p.faction_id, [...(m.get(p.faction_id) ?? []), p]);
    return [...m.entries()];
  }, [data]);
  if (!activeCampaignId)
    return (
      <Empty title="No active campaign">
        Faction plans are campaign tools. <Link to="/campaigns" className="text-arcane">Choose a campaign.</Link>
      </Empty>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Faction Agendas" subtitle="Optional campaign progress tracks. They advance only when you advance them; nothing runs automatically and no world reset exists." />
      <div className="panel-pad grid gap-2 md:grid-cols-[260px_1fr_auto] items-end">
        <Field label="Faction">
          <EntityPicker value={faction} types={['faction', 'cult', 'family']} onChange={setFaction} />
        </Field>
        <Field label="Plan">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are they trying to do?" />
        </Field>
        <button
          className="btn-primary"
          disabled={!faction || !title.trim()}
          onClick={async () => {
            await api.post('/api/faction-plans', { campaign_id: activeCampaignId, faction_id: faction, title });
            setTitle('');
            void reload();
          }}
        >
          <Plus size={14} /> Add plan
        </button>
      </div>
      {byFaction.map(([fid, plans]) => (
        <div key={fid} className="panel-pad">
          <EntityLink id={fid} className="font-display text-lg" />
          <div className="grid gap-3 md:grid-cols-2 mt-2">
            {plans.map((p) => (
              <PlanCard key={p.id} p={p} onChange={reload} />
            ))}
          </div>
        </div>
      ))}
      {data && !data.length && <p className="text-sm text-dim">No plans yet. Factions in the library: {factions?.length ?? 0}.</p>}
      <InfluenceMatrix campaignId={activeCampaignId} />
    </div>
  );
}

/** Competing influence by region, from each faction's campaign profile (Influence by region). */
function InfluenceMatrix({ campaignId }: { campaignId: number }) {
  const { data } = useApi<{ faction_id: string; faction_name: string; region: string; level: string; note: string }[]>(`/api/profiles/influence?campaign=${campaignId}`);
  if (!data) return null;
  const regions = [...new Set(data.map((d) => d.region).filter(Boolean))];
  const factions = [...new Map(data.map((d) => [d.faction_id, d.faction_name])).entries()];
  const strength = (l: string) => Math.max(0, INFLUENCE_LEVELS.indexOf(l as (typeof INFLUENCE_LEVELS)[number]));
  return (
    <div className="panel-pad">
      <div className="section-title mb-1">Influence by region</div>
      <p className="text-xs text-dim mb-2">From each faction's profile (Faction profile tab → This campaign). Regions with more than one strong faction are emerging conflicts.</p>
      {!regions.length ? (
        <p className="text-sm text-dim">No influence recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Region</th>
                {factions.map(([id, name]) => (
                  <th key={id}>
                    <EntityLink id={id}>{name}</EntityLink>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => {
                const cells = factions.map(([id]) => data.find((d) => d.faction_id === id && d.region === r));
                const contested = cells.filter((c) => c && (strength(c.level) >= 3 || c.level === 'Contested')).length > 1;
                return (
                  <tr key={r} className={contested ? 'bg-danger/10' : ''}>
                    <td>
                      <EntityLink id={r} /> {contested && <span className="chip border-danger/60 text-danger ml-1">conflict</span>}
                    </td>
                    {cells.map((c, i) => (
                      <td key={i} title={c?.note}>
                        {c ? c.level : <span className="text-dim">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlanCard({ p: init, onChange }: { p: Plan; onChange: () => void }) {
  const [p, setP] = useState(init);
  const auto = useAutosave((x: Plan) => api.patch(`/api/faction-plans/${x.id}`, { title: x.title, goal: x.goal, deadline: x.deadline, segments: x.segments, status: x.status, attitude: x.attitude, notes: x.notes }));
  const set = (q: Partial<Plan>) => {
    const n = { ...p, ...q };
    setP(n);
    auto.schedule(n);
  };
  const advance = async (delta: number) => {
    const reason = prompt(delta > 0 ? 'Why does this plan advance? (recorded in campaign state)' : 'Why does it set back?');
    if (reason === null) return;
    const r = await api.post<Plan>(`/api/faction-plans/${p.id}/advance`, { delta, reason });
    setP(r);
    onChange();
  };
  return (
    <div className="border border-line rounded-md p-3 space-y-2">
      <div className="flex gap-2 items-center">
        <input className="input font-medium" value={p.title} onChange={(e) => set({ title: e.target.value })} />
        <SaveStatus state={auto.state} />
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: p.segments }, (_, i) => (
          <div key={i} className={`h-3 flex-1 rounded-sm ${i < p.progress ? 'bg-gold/80' : 'bg-raised border border-line'}`} />
        ))}
        <span className="text-xs text-dim ml-2">
          {p.progress}/{p.segments}
        </span>
      </div>
      <div className="flex gap-1">
        <button className="btn" onClick={() => advance(-1)}>
          −1
        </button>
        <button className="btn-primary" onClick={() => advance(1)}>
          Advance +1
        </button>
        <select className="input w-auto ml-auto" value={p.status} onChange={(e) => set({ status: e.target.value })}>
          {['active', 'paused', 'succeeded', 'failed', 'abandoned'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Deadline">
          <input className="input" value={p.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
        <Field label="Segments">
          <input type="number" className="input" value={p.segments} onChange={(e) => set({ segments: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <Field label="Attitude to party">
          <input className="input" value={p.attitude} onChange={(e) => set({ attitude: e.target.value })} />
        </Field>
      </div>
      <Field label="Goal and current plan">
        <AutoTextarea minRows={2} value={p.goal} onChange={(e) => set({ goal: e.target.value })} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ World events (campaign changes + DM timeline entries)
export function WorldEventsPage() {
  const { activeCampaignId } = useAppState();
  const { data } = useApi<StateRow[]>(activeCampaignId ? `/api/campaign-state?campaign_id=${activeCampaignId}` : null);
  const { data: tl } = useApi<{ id: number; time_label: string; event: string; origin: string; access: string }[]>('/api/timeline');
  const userRows = (tl ?? []).filter((r) => r.origin === 'user');
  return (
    <div className="space-y-4">
      <PageHeader title="World Events" subtitle="What has actually happened in play (recorded campaign changes) and DM-added timeline events. No events are generated." />
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When recorded</th>
              <th>Record</th>
              <th>Change</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.entity_id ? <EntityLink id={r.entity_id} /> : 'World'}</td>
                <td>
                  {r.field} → {r.value}
                  {r.note && <div className="text-xs text-dim">{r.note}</div>}
                </td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && <p className="p-4 text-sm text-dim">{activeCampaignId ? 'No changes recorded in this campaign.' : 'No active campaign.'}</p>}
      </div>
      <div className="panel-pad">
        <div className="section-title mb-2">DM-added timeline events</div>
        {userRows.length ? userRows.map((r) => <div key={r.id} className="text-sm">{r.time_label}: {r.event} <span className="text-xs text-dim">({r.access})</span></div>) : <p className="text-sm text-dim">None. Add events on the World Timeline page.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Random tables
interface RTable {
  id: number;
  name: string;
  die: string;
  entries: { weight: number; text: string }[];
  source: string;
}
export function TablesPage() {
  const { data, reload } = useApi<RTable[]>('/api/random-tables');
  const [sel, setSel] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const t = data?.find((x) => x.id === sel) ?? data?.[0];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Random Tables"
        subtitle="Your own tables. None are pre-filled, so nothing is invented for your world. One entry per line; prefix “3:” to weight an entry."
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              const r = await api.post<RTable>('/api/random-tables', { name: 'New table', source: 'DM' });
              await reload();
              setSel(r.id);
            }}
          >
            <Plus size={14} /> New table
          </button>
        }
      />
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty title="No tables yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="panel p-2">
            {data.map((x) => (
              <button key={x.id} onClick={() => (setSel(x.id), setResult(null))} className={`w-full text-left px-2 py-1 rounded text-sm ${t?.id === x.id ? 'bg-gold/10 text-gold' : 'hover:bg-raised'}`}>
                {x.name}
              </button>
            ))}
          </div>
          {t && <TableEditor key={t.id} t={t} result={result} setResult={setResult} onDelete={async () => (await api.del(`/api/random-tables/${t.id}`), setSel(null), reload())} />}
        </div>
      )}
    </div>
  );
}

function TableEditor({ t, result, setResult, onDelete }: { t: RTable; result: string | null; setResult: (r: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(t.name);
  const [text, setText] = useState(t.entries.map((e) => (e.weight > 1 ? `${e.weight}: ${e.text}` : e.text)).join('\n'));
  const auto = useAutosave((v: { name: string; text: string }) =>
    api.patch(`/api/random-tables/${t.id}`, {
      name: v.name,
      entries: v.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const m = /^(\d+):\s*(.*)$/.exec(l);
          return m ? { weight: Number(m[1]), text: m[2] } : { weight: 1, text: l };
        }),
    }),
  );
  return (
    <div className="panel-pad space-y-3">
      <div className="flex gap-2 items-center">
        <input className="input font-display" value={name} onChange={(e) => (setName(e.target.value), auto.schedule({ name: e.target.value, text }))} />
        <SaveStatus state={auto.state} />
        <button className="btn-danger" onClick={onDelete} aria-label="Delete table">
          <Trash2 size={14} />
        </button>
      </div>
      <AutoTextarea minRows={8} value={text} onChange={(e) => (setText(e.target.value), auto.schedule({ name, text: e.target.value }))} />
      <button
        className="btn-primary"
        onClick={async () => {
          await auto.flush();
          const r = await api.post<{ result: string }>(`/api/random-tables/${t.id}/roll`);
          setResult(r.result);
        }}
      >
        <Dice5 size={14} /> Roll on table
      </button>
      {result && <div className="parchment p-3 font-serif text-lg">{result}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Notes & scratchpad
interface Note {
  id: number;
  campaign_id: number | null;
  title: string;
  body: string;
  pinned: boolean;
  updated_at: string;
}
export function NotesPage() {
  const { data, reload } = useApi<Note[]>('/api/notes');
  const [sp, setSp] = useSearchParams();
  const sel = Number(sp.get('note')) || data?.[0]?.id;
  const n = data?.find((x) => x.id === sel);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes and Scratchpad"
        actions={
          <button
            className="btn-primary"
            onClick={async () => {
              const x = await api.post<Note>('/api/notes', { title: 'New note' });
              await reload();
              setSp({ note: String(x.id) });
            }}
          >
            <Plus size={14} /> New note
          </button>
        }
      />
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty title="No notes yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="panel p-2">
            {data.map((x) => (
              <button key={x.id} onClick={() => setSp({ note: String(x.id) })} className={`w-full text-left px-2 py-1 rounded text-sm ${x.id === sel ? 'bg-gold/10 text-gold' : 'hover:bg-raised'}`}>
                {x.pinned && <Pin size={11} className="inline mr-1" />}
                {x.title}
              </button>
            ))}
          </div>
          {n && <NoteEditor key={n.id} n={n} onDelete={async () => (await api.del(`/api/notes/${n.id}`), setSp({}), reload())} onSaved={reload} />}
        </div>
      )}
    </div>
  );
}

function NoteEditor({ n, onDelete, onSaved }: { n: Note; onDelete: () => void; onSaved: () => void }) {
  const [x, setX] = useState(n);
  const auto = useAutosave(async (v: Note) => {
    await api.patch(`/api/notes/${v.id}`, { title: v.title, body: v.body, pinned: v.pinned });
    onSaved();
  }, 1200);
  const set = (p: Partial<Note>) => {
    const m = { ...x, ...p };
    setX(m);
    auto.schedule(m);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input className="input font-display" value={x.title} onChange={(e) => set({ title: e.target.value })} />
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={x.pinned} onChange={(e) => set({ pinned: e.target.checked })} /> Pin
        </label>
        <SaveStatus state={auto.state} />
        <button className="btn-danger" onClick={() => confirm('Delete note?') && onDelete()} aria-label="Delete note">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <AutoTextarea minRows={18} value={x.body} onChange={(e) => set({ body: e.target.value })} />
        <div className="panel p-4">
          <Markdown text={x.body || '_Empty_'} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ DM screen
export function DmScreen() {
  const { activeCampaignId } = useAppState();
  const { data: notes } = useApi<Note[]>('/api/notes');
  const { data: favNpcs } = useApi<EntitySummary[]>('/api/entities?type=npc&favorite=1');
  const { data: encs } = useApi<Encounter[]>(activeCampaignId ? `/api/encounters?campaign_id=${activeCampaignId}&status=running` : null);
  const [q, setQ] = useState('');
  const { data: hits } = useApi<{ ref: string; title: string; kind: string }[]>(q.trim() ? `/api/search${qs({ q, limit: 8, kinds: 'entity' })}` : null);
  return (
    <div className="space-y-4">
      <PageHeader title="DM Screen" subtitle="Everything at hand during play. Alt+D opens this screen from anywhere." actions={<Link to="/campaign/live" className="btn-primary">Live session mode</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel-pad">
          <div className="section-title mb-2">Dice</div>
          <DiceRoller compact />
        </div>
        <div className="panel-pad">
          <div className="section-title mb-2">Quick lookup</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ID…" />
          <ul className="mt-2 text-sm space-y-1">
            {hits?.map((h) => (
              <li key={h.ref}>
                <EntityLink id={h.ref}>{h.title}</EntityLink>
              </li>
            ))}
          </ul>
          <div className="section-title mt-4 mb-2">Conditions</div>
          <div className="flex flex-wrap gap-1">
            {CONDITIONS_2024.map((c) => (
              <span key={c} className="chip border-line text-dim">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="panel-pad">
          <div className="section-title mb-2">Running encounters</div>
          {encs?.length ? encs.map((e) => <Link key={e.id} className="block text-arcane" to={`/tracker/${e.id}`}>{e.title} (round {e.round})</Link>) : <p className="text-sm text-dim">None running.</p>}
          <Link to="/tracker/quick" className="btn mt-2">
            Quick initiative
          </Link>
          <div className="section-title mt-4 mb-2">Pinned notes</div>
          {notes?.filter((n) => n.pinned).map((n) => <Link key={n.id} className="block text-sm hover:text-gold" to={`/notes?note=${n.id}`}>{n.title}</Link>)}
        </div>
      </div>
      <div>
        <div className="section-title mb-2">Favorite NPCs</div>
        {favNpcs?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {favNpcs.slice(0, 8).map((n) => (
              <NpcCard key={n.id} id={n.id} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-dim">Star NPCs to keep them on the DM screen.</p>
        )}
      </div>
    </div>
  );
}
