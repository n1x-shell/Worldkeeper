/**
 * The key to a plan (v0.9.25): each numbered place, and what is in it. Open a place to rename it, write what is read
 * aloud there, and add, change or remove its entries: an encounter with its creatures, a trap, a puzzle, a hazard,
 * loot, a secret, a clue, a person, or a note. The app suggests an entry on request, from the GM's books and its own
 * ideas.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookmarkPlus, ChevronDown, ChevronRight, Dices, Map as MapIcon, Plus, Swords, Trash2, Unlink, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAppState } from '../lib/store';
import { newCombatant } from '../../../shared/play';
import { KEY_KINDS, KEY_KIND_INFO, MAX_NAMES, isKeyed, newItem, newRoom, type KeyItem, type KeyKind, type KeyLine, type KeyRoom, type PlanKind, type Storey } from '@shared/plan/index';
import { CreatureLinks } from './CreatureLinks';
import { EntityPicker } from './EntityPicker';
import { ask, toast } from './ui';

const SUGGESTED: KeyKind[] = ['encounter', 'trap', 'puzzle', 'hazard', 'loot'];
const STOREYS: [Storey, string][] = [
  ['ground', 'Ground floor'],
  ['upper', 'Upper floor'],
  ['under', 'Below ground'],
];
const HOARD = /\b(treasur\w*|vault|hoard|strongroom|reliquary)\b/i;

/** A text box that offers names from the GM's books as they type; anything else typed is kept as it is. */
function NamePicker({ value, from, label, onPick }: { value: string; from: 'creatures' | 'items'; label: string; onPick: (name: string, id?: string) => void }) {
  const list = useId();
  const [found, setFound] = useState<{ id?: string; name: string }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // What is in the box now, and whether it has been matched to something in the books.
  const now = useRef({ value, matched: false, onPick });
  now.current.value = value;
  // The books may answer after other things have changed: the answer goes to the page as it is then, not as it was.
  now.current.onPick = onPick;
  const look = (q: string) => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) return setFound([]);
    timer.current = window.setTimeout(() => {
      api
        .get<{ id?: string; name: string }[]>(`/api/books/${from}?q=${encodeURIComponent(q.trim())}&limit=12`)
        .then((list) => {
          setFound(list);
          // Typed in full before the books answered: it is the books' one all the same.
          const hit = list.find((f) => f.name.toLowerCase() === now.current.value.trim().toLowerCase());
          if (hit?.id && !now.current.matched) {
            now.current.matched = true;
            now.current.onPick(hit.name, hit.id);
          }
        })
        .catch(() => setFound([]));
    }, 180);
  };
  return (
    <>
      <input
        className="input min-w-0 flex-1 py-1"
        value={value}
        list={list}
        aria-label={label}
        maxLength={120}
        onChange={(e) => {
          const v = e.target.value;
          const hit = found.find((f) => f.name.toLowerCase() === v.trim().toLowerCase());
          now.current.matched = !!hit?.id;
          onPick(hit ? hit.name : v, hit?.id);
          look(v);
        }}
      />
      <datalist id={list}>
        {found.map((f) => (
          <option key={f.id ?? f.name} value={f.name} />
        ))}
      </datalist>
    </>
  );
}

const count = (v: string) => Math.max(1, Math.min(999, Math.round(Number(v)) || 1));

/** One entry of a place, with the particulars its kind has. */
function ItemEditor({ item, place, onChange, onRemove }: { item: KeyItem; place: string; onChange: (patch: Partial<KeyItem>) => void; onRemove: () => void }) {
  const nav = useNavigate();
  const { activeCampaignId, index } = useAppState();
  const info = KEY_KIND_INFO[item.kind];
  const creatures = item.creatures ?? [];
  const things = item.things ?? [];
  const numbered = item.kind === 'trap' || item.kind === 'puzzle' || item.kind === 'hazard';

  const toTracker = async () => {
    if (!activeCampaignId || !creatures.length) return;
    try {
      // Each creature's hit points, Armor Class and initiative from its stat block, where it has one.
      const blocks = await Promise.all(creatures.map((c) => (c.id ? api.get<{ hpAvg?: number; ac?: number; init?: number } | null>(`/api/statblocks/${encodeURIComponent(c.id)}`).catch(() => null) : Promise.resolve(null))));
      const combatants = creatures.flatMap((c, i) =>
        Array.from({ length: c.count }, (_, n) =>
          newCombatant({ name: c.count > 1 ? `${c.name} ${n + 1}` : c.name, ...(c.id ? { statblockId: c.id } : {}), hp: blocks[i]?.hpAvg ?? 0, maxHp: blocks[i]?.hpAvg ?? 0, ac: blocks[i]?.ac ?? null, initiativeBonus: blocks[i]?.init ?? 0 }),
        ),
      );
      const e = await api.post<{ id: number }>('/api/encounters', { campaign_id: activeCampaignId, title: `${place}: ${item.title.trim() || creatures.map((c) => `${c.count > 1 ? `${c.count} ` : ''}${c.name}`).join(' and ')}`, combatants });
      void nav(`/tracker/${e.id}`);
    } catch (x) {
      toast((x as Error).message, 'danger');
    }
  };

  return (
    <div className="space-y-2 rounded-sm border border-line bg-raised/30 p-2.5" data-testid="key-item">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1 font-medium" value={item.kind} aria-label="What kind of entry" onChange={(e) => onChange({ kind: e.target.value as KeyKind })}>
          {KEY_KINDS.map((k) => (
            <option key={k} value={k}>
              {KEY_KIND_INFO[k].label}
            </option>
          ))}
        </select>
        <input className="input min-w-0 flex-1 py-1" value={item.title} maxLength={200} placeholder="A few words" aria-label={`${info.label}: a few words`} onChange={(e) => onChange({ title: e.target.value })} />
        <button type="button" className="btn-ghost" aria-label={`Remove this ${info.label.toLowerCase()}`} title="Remove" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      {item.kind === 'encounter' && (
        <div className="space-y-1.5">
          {creatures.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input w-16 py-1" type="number" min={1} max={999} value={c.count} aria-label="How many" onChange={(e) => onChange({ creatures: creatures.map((x, j) => (j === i ? { ...x, count: count(e.target.value) } : x)) })} />
              <NamePicker value={c.name} from="creatures" label="Creature" onPick={(name, id) => onChange({ creatures: creatures.map((x, j) => (j === i ? { count: x.count, name, ...(id ? { id } : {}) } : x)) })} />
              <button type="button" className="btn-ghost" aria-label={`Remove ${c.name || 'this creature'}`} onClick={() => onChange({ creatures: creatures.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ creatures: [...creatures, { name: '', count: 1 }] })}>
              <Plus size={12} /> Add a creature
            </button>
            {activeCampaignId && creatures.some((c) => c.name.trim()) && (
              <button type="button" className="btn-ghost text-xs" onClick={() => void toTracker()}>
                <Swords size={12} /> Put in the tracker
              </button>
            )}
          </div>
          <CreatureLinks creatures={creatures.filter((c) => c.id).map((c) => ({ id: c.id!, name: c.name, count: c.count }))} />
        </div>
      )}

      {numbered && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-dim">DC</span>
            <input className="input w-16 py-1" type="number" min={1} max={40} value={item.dc ?? ''} onChange={(e) => onChange({ dc: e.target.value === '' ? null : Math.max(1, Math.min(40, Math.round(Number(e.target.value)) || 10)) })} />
          </label>
          {item.kind !== 'puzzle' && (
            <label className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="text-dim">Harm</span>
              <input className="input min-w-0 flex-1 py-1" value={item.damage ?? ''} maxLength={120} placeholder="2d10 piercing" onChange={(e) => onChange({ damage: e.target.value })} />
            </label>
          )}
        </div>
      )}

      {item.kind === 'loot' && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-dim">Coin</span>
            <input className="input min-w-0 flex-1 py-1" value={item.coins ?? ''} maxLength={120} placeholder="120 gp, 40 sp" onChange={(e) => onChange({ coins: e.target.value })} />
          </label>
          {things.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input w-16 py-1" type="number" min={1} max={9999} value={t.count} aria-label="How many" onChange={(e) => onChange({ things: things.map((x, j) => (j === i ? { ...x, count: Math.min(9999, count(e.target.value) || 1) } : x)) })} />
              <NamePicker value={t.name} from="items" label="Thing" onPick={(name) => onChange({ things: things.map((x, j) => (j === i ? { ...x, name } : x)) })} />
              <button type="button" className="btn-ghost" aria-label={`Remove ${t.name || 'this thing'}`} onClick={() => onChange({ things: things.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost text-xs" onClick={() => onChange({ things: [...things, { name: '', count: 1 }] })}>
            <Plus size={12} /> Add a thing
          </button>
        </div>
      )}

      {item.kind === 'way' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 max-w-sm flex-1">
            <EntityPicker value={item.entity ?? null} types={['@place']} placeholder="The place it leads to…" onChange={(id) => onChange({ entity: id })} />
          </div>
          {item.entity && (
            <Link className="btn-ghost text-xs" to={`/e/${encodeURIComponent(item.entity)}/plan`} data-testid="key-way-plan">
              <MapIcon size={12} /> Open its plan
            </Link>
          )}
        </div>
      )}

      {item.kind === 'person' && (
        <div className="max-w-sm">
          <EntityPicker
            value={item.entity ?? null}
            types={['@person']}
            placeholder="One of your people…"
            onChange={(id) => onChange({ entity: id, ...(id && !item.title.trim() ? { title: index.get(id)?.name ?? '' } : {}) })}
          />
        </div>
      )}

      <textarea className="input min-h-16 w-full py-1.5" value={item.text} maxLength={6000} rows={2} placeholder={info.hint} aria-label={`${info.label}: the rest`} onChange={(e) => onChange({ text: e.target.value })} />
    </div>
  );
}

export function PlanKey({
  kind,
  lines,
  rooms,
  selected,
  onSelect,
  onRooms,
  entityId,
  drawn = false,
  still = false,
  under = [],
  onMakeRecord,
}: {
  kind: PlanKind;
  /** Each place's size and ways out, as the plan has it. */
  lines: KeyLine[];
  rooms: KeyRoom[];
  /** The place that is open, by its position in the key. */
  selected: number | null;
  onSelect: (i: number | null) => void;
  /** `redraw`: the list of places changed (one added, removed, moved, or put on another storey), so the plan is drawn again. */
  onRooms: (next: KeyRoom[], redraw: boolean) => void;
  entityId?: string;
  /** The plan has been changed by hand: places are added on the plan itself, and one removed here comes off it as drawn. */
  drawn?: boolean;
  /** The plan is being changed by hand: a place chosen on it opens here, but the page stays where it is. */
  still?: boolean;
  /** Places kept as records under this plan's record: one of the same name as a numbered place is that place. */
  under?: { id: string; name: string }[];
  /** Make a numbered place a record of its own, kept under this plan's record. Absent for a plan of no record. */
  onMakeRecord?: (i: number) => Promise<void>;
}) {
  const { index } = useAppState();
  /** The record a place is: the one it is tied to, or one kept under this place by the same name. */
  const recordOf = (r: KeyRoom) => r.record ?? under.find((u) => u.name.trim().toLowerCase() === r.name.trim().toLowerCase())?.id;
  const [busy, setBusy] = useState('');
  const open = useRef<HTMLLIElement>(null);
  // Chosen on the drawing: bring its line into view.
  useEffect(() => {
    if (selected != null && !still) open.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    // Only a place newly chosen brings its line into view, not the plan's leaving the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const change = (i: number, patch: Partial<KeyRoom>, redraw = false) => onRooms(rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)), redraw);
  const changeItem = (i: number, id: string, patch: Partial<KeyItem>) => change(i, { items: rooms[i].items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= rooms.length) return;
    const next = [...rooms];
    [next[i], next[j]] = [next[j], next[i]];
    onRooms(next, true);
    onSelect(j);
  };
  const remove = async (i: number) => {
    const r = rooms[i];
    const off = kind === 'settlement' ? 'Its building stays on the plan, as a house like any other.' : kind === 'cave' ? 'Its number comes off the plan.' : 'The room comes off the plan, with what is in it.';
    const body = `${isKeyed(r) ? 'What is keyed to it goes with it. ' : ''}${drawn ? off : 'The plan is drawn again without it.'} The places after it are renumbered.`;
    if ((drawn || isKeyed(r)) && !(await ask({ title: `Remove ${r.name}?`, body, confirmLabel: 'Remove it', danger: true }))) return;
    onRooms(
      rooms.filter((_, j) => j !== i),
      true,
    );
    onSelect(null);
  };
  // The key as it is now, for what comes back after a wait (a suggestion): added to the key as it is then.
  const live = useRef({ rooms, onRooms });
  live.current = { rooms, onRooms };
  const suggest = async (i: number, k: KeyKind) => {
    setBusy(k);
    const id = rooms[i].id;
    try {
      const { item } = await api.post<{ item: KeyItem }>('/api/plan/suggest', { kind: k, ...(entityId ? { entity: entityId } : {}), hoard: HOARD.test(rooms[i].name) });
      const { rooms: now, onRooms: tell } = live.current;
      tell(
        now.map((r) => (r.id === id ? { ...r, items: [...r.items, item] } : r)),
        false,
      );
    } catch (x) {
      toast((x as Error).message, 'danger');
    } finally {
      setBusy('');
    }
  };

  return (
    <div data-testid="plan-key">
      <ol className="space-y-1 text-sm">
        {rooms.map((r, i) => {
          const line = lines[i];
          const isOpen = selected === i;
          const summary = r.items.map((it) => KEY_KIND_INFO[it.kind].label);
          return (
            <li key={r.id} ref={isOpen ? open : undefined} className={`rounded-sm border ${isOpen ? 'border-gold/70 bg-raised/40' : 'border-transparent'}`}>
              <button type="button" className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-raised/60" aria-expanded={isOpen} onClick={() => onSelect(isOpen ? null : i)}>
                {isOpen ? <ChevronDown size={14} className="mt-1 shrink-0 text-dim" /> : <ChevronRight size={14} className="mt-1 shrink-0 text-dim" />}
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.name}</span>
                  {line && !line.onPlan ? <span className="text-danger"> No room for it on this plan: draw another, or give it more room.</span> : line?.detail && <span className="text-dim"> {line.detail}</span>}
                  {!isOpen && (summary.length > 0 || r.aloud.trim()) && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {r.aloud.trim() && <span className="chip border-line text-xs">Read aloud</span>}
                      {recordOf(r) && <span className="chip border-line text-xs">A record of its own</span>}
                      {[...new Set(summary)].map((label) => (
                        <span key={label} className="chip border-line text-xs">
                          {label}
                          {summary.filter((s) => s === label).length > 1 ? ` × ${summary.filter((s) => s === label).length}` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 px-3 pb-3 pt-1" data-testid="key-room">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-40 flex-1">
                      <span className="label">Its name</span>
                      <input className="input" value={r.name} maxLength={80} onChange={(e) => change(i, { name: e.target.value })} onBlur={(e) => !e.target.value.trim() && change(i, { name: r.drawnAs })} />
                    </label>
                    {kind === 'building' && !drawn && (
                      <label>
                        <span className="label">Storey</span>
                        <select className="input" value={r.floor ?? 'ground'} onChange={(e) => change(i, { floor: e.target.value as Storey }, true)}>
                          {STOREYS.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="flex gap-1">
                      <button type="button" className="btn-ghost" disabled={i === 0} aria-label={`Move ${r.name} earlier in the key`} title="Earlier in the key" onClick={() => move(i, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" className="btn-ghost" disabled={i === rooms.length - 1} aria-label={`Move ${r.name} later in the key`} title="Later in the key" onClick={() => move(i, 1)}>
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" className="btn-ghost" disabled={rooms.length <= 1} aria-label={`Remove ${r.name} from the plan`} title="Remove from the plan" onClick={() => void remove(i)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {!drawn && r.name.trim() !== r.drawnAs && <p className="text-xs text-dim">The plan was drawn for “{r.drawnAs}”. It stays as it is until you draw it again.</p>}

                  {/* A place that is a record of its own (an inn in a town) has a plan of its own, a step away. */}
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="key-room-record">
                    <span className="text-dim">A record of its own:</span>
                    {recordOf(r) ? (
                      <>
                        <Link className="font-medium underline" to={`/e/${encodeURIComponent(recordOf(r)!)}`}>
                          {index.get(recordOf(r)!)?.name ?? 'a record that is gone'}
                        </Link>
                        <Link className="btn-ghost text-xs" to={`/e/${encodeURIComponent(recordOf(r)!)}/plan`} data-testid="key-room-plan">
                          <MapIcon size={12} /> Its plan
                        </Link>
                        {r.record && (
                          <button type="button" className="btn-ghost text-xs" onClick={() => change(i, { record: undefined })} title="The record stays; this place is no longer tied to it.">
                            <Unlink size={12} /> Untie
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-56">
                          <EntityPicker value={null} types={['@place']} placeholder="Choose one…" onChange={(id) => id && change(i, { record: id })} />
                        </div>
                        {onMakeRecord && (
                          <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => void onMakeRecord(i)} data-testid="key-room-make-record">
                            <BookmarkPlus size={12} /> Make it one
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <label className="block">
                    <span className="label">Read aloud</span>
                    <textarea className="input min-h-16 w-full py-1.5" rows={2} value={r.aloud} maxLength={6000} placeholder="What the party sees, hears and smells on coming in." onChange={(e) => change(i, { aloud: e.target.value })} />
                  </label>

                  {r.items.map((it) => (
                    <ItemEditor key={it.id} item={it} place={r.name} onChange={(patch) => changeItem(i, it.id, patch)} onRemove={() => change(i, { items: r.items.filter((x) => x.id !== it.id) })} />
                  ))}

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Add to ${r.name}`}>
                      <span className="w-16 text-xs text-dim">Add</span>
                      {KEY_KINDS.map((k) => (
                        <button key={k} type="button" className="chip border-line hover:border-gold" disabled={r.items.length >= 40} onClick={() => change(i, { items: [...r.items, newItem(k, k === 'encounter' ? { creatures: [{ name: '', count: 1 }] } : {})] })}>
                          <Plus size={11} className="mr-0.5 inline" />
                          {KEY_KIND_INFO[k].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Suggest for ${r.name}`}>
                      <span className="w-16 text-xs text-dim">Suggest</span>
                      {SUGGESTED.map((k) => (
                        <button key={k} type="button" className="chip border-line hover:border-gold" disabled={!!busy || r.items.length >= 40} onClick={() => void suggest(i, k)}>
                          <Dices size={11} className="mr-0.5 inline" />
                          {KEY_KIND_INFO[k].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {drawn ? (
        <p className="mt-3 text-xs text-dim" data-testid="key-add-by-hand">
          {kind === 'settlement' ? 'To add a place, change the plan by hand: choose a building and give it a number.' : kind === 'cave' ? 'To add a place, change the plan by hand: put a number on a floor.' : 'To add a room, change the plan by hand: draw one, or put a number on a floor.'}
        </p>
      ) : (
        <button
          type="button"
          className="btn mt-3"
          disabled={rooms.length >= MAX_NAMES}
          onClick={() => {
            onRooms([...rooms, newRoom(kind === 'settlement' ? 'A new place' : 'A new room', kind === 'building' ? 'ground' : undefined)], true);
            onSelect(rooms.length);
          }}
          data-testid="key-add-room"
        >
          <Plus size={14} /> Add a {kind === 'settlement' ? 'place' : 'room'}
        </button>
      )}
    </div>
  );
}

