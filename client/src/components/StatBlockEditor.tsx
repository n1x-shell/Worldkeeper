/**
 * The GM's own stat block for a record (v0.9.4): a book stat block and what's different, a whole stat block of its
 * own in the books' layout, or a hazard. The block shows as it will read while it's written.
 */
import { useMemo, useState } from 'react';
import { ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { CHALLENGE_RATINGS, XP_BY_CR, abilityMod, crPb, hitPoints } from '@shared/statblock';
import { api, useApi } from '../lib/api';
import { ErrorBox, Field, Modal, Segmented } from './ui';
import { StatBlock, type StatBlockData } from './StatBlock';

type Mode = 'book' | 'own' | 'hazard';
interface Entry {
  name: string;
  text: string;
}
const LISTS = [
  ['traits', 'Traits', 'Pack Tactics'],
  ['actions', 'Actions', 'Bite'],
  ['bonus', 'Bonus actions', 'Nimble Escape'],
  ['reactions', 'Reactions', 'Parry'],
  ['legendary', 'Legendary actions', 'Tail Sweep'],
] as const;
type ListKey = (typeof LISTS)[number][0];
const LINES = [
  ['saves', 'Saving throws', 'Dex +5, Wis +2'],
  ['skills', 'Skills', 'Perception +4, Stealth +5'],
  ['vuln', 'Vulnerabilities', 'Fire'],
  ['res', 'Resistances', 'Cold, Necrotic'],
  ['imm', 'Immunities', 'Poison'],
  ['cimm', 'Condition immunities', 'Charmed, Poisoned'],
  ['gear', 'Gear', 'Longsword, Chain Mail'],
  ['senses', 'Senses', 'Darkvision 60 ft., Passive Perception 14'],
  ['languages', 'Languages', 'Common, Elvish'],
] as const;
type LineKey = (typeof LINES)[number][0];
const ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];

interface Draft extends Record<LineKey, string>, Record<ListKey, Entry[]> {
  kind: 'creature' | 'npc';
  base: string;
  changes: string;
  tactics: string;
  looks: string;
  meta: string;
  ac: string;
  hp: string;
  init: string;
  speed: string;
  ab: string[];
  cr: string;
  trigger: string;
  effect: string;
  counter: string;
}

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Math.trunc(Number(s)));
const sg = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function draftFrom(s: StatBlockData | null): Draft {
  const line = (k: LineKey) => s?.[k] ?? '';
  const list = (k: ListKey) => (s?.[k] ?? []).map((e) => ({ name: e.name, text: e.text }));
  return {
    kind: s?.kind === 'creature' ? 'creature' : 'npc',
    base: s?.base ?? '',
    changes: s?.changes ?? '',
    tactics: s?.tactics ?? '',
    looks: s?.looks ?? '',
    // A card's own line ("Uses the … stat block") isn't a creature's size and type.
    meta: s?.base ? '' : (s?.meta ?? ''),
    ac: s?.ac != null ? String(s.ac) : '',
    hp: s?.hp ?? (s?.hpAvg != null ? String(s.hpAvg) : ''),
    init: s?.init != null ? String(s.init) : '',
    speed: s?.speed ?? '',
    ab: ABILITIES.map((_, i) => (typeof s?.ab?.[i] === 'number' ? String(s.ab[i]) : '')),
    cr: s?.cr ?? '',
    saves: line('saves'),
    skills: line('skills'),
    vuln: line('vuln'),
    res: line('res'),
    imm: line('imm'),
    cimm: line('cimm'),
    gear: line('gear'),
    senses: line('senses'),
    languages: line('languages'),
    traits: list('traits'),
    actions: list('actions'),
    bonus: list('bonus'),
    reactions: list('reactions'),
    legendary: list('legendary'),
    trigger: s?.trigger ?? '',
    effect: s?.effect ?? '',
    counter: s?.counter ?? '',
  };
}

/** What is sent to be kept; throws with words for the GM where something written can't be. */
function bodyOf(mode: Mode, d: Draft) {
  if (mode === 'hazard') return { kind: 'hazard', meta: d.meta, trigger: d.trigger, effect: d.effect, counter: d.counter };
  if (mode === 'book') {
    if (!d.base.trim()) throw new Error('Name the stat block it uses.');
    return { kind: d.kind, base: d.base.trim(), changes: d.changes, tactics: d.tactics, looks: d.looks };
  }
  const scores = d.ab.map(num);
  const given = scores.filter((x) => x !== undefined).length;
  if (given && given < 6) throw new Error('Give all six ability scores, or none.');
  if (scores.some((x) => x !== undefined && (x < 1 || x > 30))) throw new Error('Ability scores run from 1 to 30.');
  return {
    kind: d.kind,
    meta: d.meta,
    ac: num(d.ac),
    hp: d.hp,
    init: num(d.init),
    speed: d.speed,
    ab: given ? scores : undefined,
    cr: d.cr || undefined,
    ...Object.fromEntries(LINES.map(([k]) => [k, d[k]])),
    ...Object.fromEntries(LISTS.map(([k]) => [k, d[k].filter((e) => e.name.trim() || e.text.trim())])),
    changes: '',
    tactics: d.tactics,
    looks: d.looks,
  };
}

/** The block as it will read. */
function preview(mode: Mode, d: Draft, name: string): StatBlockData {
  if (mode === 'hazard') return { id: '', name, kind: 'hazard', meta: d.meta || 'Hazard', trigger: d.trigger, effect: d.effect, counter: d.counter };
  const scores = d.ab.map(num);
  const ab = scores.every((x) => x !== undefined) ? scores : undefined;
  const hp = hitPoints(d.hp);
  return {
    id: '',
    name,
    kind: d.kind,
    meta: d.meta,
    ac: num(d.ac),
    hp: hp?.hp ?? d.hp,
    hpAvg: hp?.avg,
    init: num(d.init) ?? (ab ? abilityMod(ab[1]) : 0),
    speed: d.speed,
    ab,
    cr: d.cr || undefined,
    xp: d.cr ? XP_BY_CR[d.cr] : undefined,
    pb: d.cr ? crPb(d.cr) : undefined,
    ...Object.fromEntries(LINES.map(([k]) => [k, d[k]])),
    ...Object.fromEntries(LISTS.map(([k]) => [k, d[k].filter((e) => e.name.trim() || e.text.trim())])),
    tactics: d.tactics,
    looks: d.looks,
  };
}

function EntryList({ label, example, list, onChange }: { label: string; example: string; list: Entry[]; onChange: (l: Entry[]) => void }) {
  const set = (i: number, p: Partial<Entry>) => onChange(list.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (
    <fieldset className="space-y-2">
      <legend className="label">{label}</legend>
      {list.map((e, i) => (
        // Entries have no id of their own; they are only added at the end, moved up or removed.
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="rounded-sm border border-line p-2 space-y-1">
          <div className="flex gap-1">
            <input className="input py-1" value={e.name} placeholder={example} aria-label={`${label}: name`} onChange={(x) => set(i, { name: x.target.value })} />
            {i > 0 && (
              <button
                type="button"
                className="btn-ghost"
                aria-label={`Move ${e.name || 'this one'} up`}
                title="Move up"
                onClick={() => onChange(list.map((x, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : x)))}
              >
                <ArrowUp size={14} />
              </button>
            )}
            <button type="button" className="btn-ghost" aria-label={`Remove ${e.name || 'this one'}`} title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </button>
          </div>
          <textarea className="input text-sm" rows={2} value={e.text} placeholder="Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage." aria-label={`${label}: what it does`} onChange={(x) => set(i, { text: x.target.value })} />
        </div>
      ))}
      <button type="button" className="btn-ghost text-xs" onClick={() => onChange([...list, { name: '', text: '' }])}>
        <Plus size={13} /> Add to {label.toLowerCase()}
      </button>
    </fieldset>
  );
}

/** Start from a creature in the open rules: its whole stat block, to change. A book's creature stays in the book. */
function CopyFrom({ onCopy }: { onCopy: (s: StatBlockData) => void }) {
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const { data: options } = useApi<{ id: string; name: string; cr?: string | null }[]>(`/api/books/creatures?q=${encodeURIComponent(q)}&limit=40`);
  const copy = async () => {
    const hit = (options ?? []).find((o) => o.name.toLowerCase() === q.trim().toLowerCase());
    if (!hit) return setNote('Choose a creature from the list.');
    if (hit.id.startsWith('book:')) return setNote(`${hit.name} is from one of your books. Choose "A book's stat block" for it and say what's different: the book's own words stay in the book.`);
    const s = await api.get<StatBlockData | null>(`/api/statblocks/${encodeURIComponent(hit.id)}`);
    if (!s) return setNote('That one has no stat block.');
    setNote(`Copied ${hit.name}. Change what's different.`);
    onCopy(s);
  };
  return (
    <div className="rounded-sm border border-dashed border-line p-2">
      <Field label="Start from a creature (optional)" hint={note ?? 'Copies a creature from the open rules (the SRD and open packs) for you to change.'}>
        <div className="flex gap-1">
          <input className="input" list="sb-copy" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bandit Captain" />
          <datalist id="sb-copy">
            {(options ?? []).map((o) => (
              <option key={o.id} value={o.name}>
                {o.cr ? `CR ${o.cr}` : ''}
              </option>
            ))}
          </datalist>
          <button type="button" className="btn" disabled={!q.trim()} onClick={() => void copy()}>
            <Copy size={14} /> Copy
          </button>
        </div>
      </Field>
    </div>
  );
}

export function StatBlockEditor({
  entityId,
  name,
  start,
  mine,
  hazardFirst,
  onClose,
  onSaved,
}: {
  entityId: string;
  name: string;
  /** The block to start from: the GM's own, or a worldbook's to make a version of. */
  start: StatBlockData | null;
  /** Whether `start` is the GM's own (so it can be removed). */
  mine: boolean;
  /** For a record that isn't a creature or a person: a new block starts as a hazard. */
  hazardFirst?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>(start?.kind === 'hazard' || (!start && hazardFirst) ? 'hazard' : !start || start.base ? 'book' : 'own');
  const [d, setD] = useState<Draft>(() => draftFrom(start));
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((v) => ({ ...v, ...p }));
  const { data: options } = useApi<{ id: string; name: string; cr?: string | null }[]>(mode === 'book' ? `/api/books/creatures?q=${encodeURIComponent(d.base)}&limit=40` : null);
  const shown = useMemo(() => preview(mode, d, name), [mode, d, name]);
  const hp = hitPoints(d.hp);
  const dex = num(d.ab[1]);

  const save = async () => {
    try {
      await api.put(`/api/statblocks/${encodeURIComponent(entityId)}`, bodyOf(mode, d));
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <Modal
      title={`${name}: stat block`}
      wide={mode !== 'book'}
      onClose={onClose}
      footer={
        <>
          {mine && (
            <button className="btn mr-auto" onClick={async () => (await api.del(`/api/statblocks/${encodeURIComponent(entityId)}`), onSaved())}>
              Remove
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3" data-testid="statblock-editor">
        {err && <ErrorBox error={err} />}
        <Segmented
          label="What kind of stat block"
          value={mode}
          onChange={(m) => (setMode(m), setErr(null))}
          options={[
            { value: 'book', label: "A book's stat block", title: 'Use a creature from the SRD or your books, and say what’s different' },
            { value: 'own', label: 'Its own', title: 'Write the whole stat block' },
            { value: 'hazard', label: 'A hazard', title: 'A trap, a sickness or a dangerous place' },
          ]}
        />

        {mode === 'book' && (
          <>
            <Field label="Uses the stat block of" hint="A creature from the SRD or your books.">
              <input className="input" list={`sb-${entityId}`} value={d.base} onChange={(e) => set({ base: e.target.value })} placeholder="Bandit Captain" />
              <datalist id={`sb-${entityId}`}>
                {(options ?? []).map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.cr ? `CR ${o.cr}` : ''}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="With these changes">
              <textarea className="input" rows={3} value={d.changes} onChange={(e) => set({ changes: e.target.value })} placeholder="Wields a halberd (reach); speaks Elvish." />
            </Field>
            <Field label="How it fights">
              <textarea className="input" rows={2} value={d.tactics} onChange={(e) => set({ tactics: e.target.value })} />
            </Field>
          </>
        )}

        {mode === 'hazard' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-3">
              <Field label="What it is" hint="As the books put it: its kind and the levels it suits.">
                <input className="input" value={d.meta} onChange={(e) => set({ meta: e.target.value })} placeholder="Trap (levels 1 to 4)" />
              </Field>
              <Field label="Trigger">
                <textarea className="input" rows={2} value={d.trigger} onChange={(e) => set({ trigger: e.target.value })} placeholder="A creature steps on the pressure plate." />
              </Field>
              <Field label="Effect">
                <textarea className="input" rows={3} value={d.effect} onChange={(e) => set({ effect: e.target.value })} placeholder="Dexterity saving throw, DC 13. Failure: 11 (2d10) Piercing damage." />
              </Field>
              <Field label="Countermeasures">
                <textarea className="input" rows={2} value={d.counter} onChange={(e) => set({ counter: e.target.value })} placeholder="Wisdom (Perception) DC 13 to spot the plate; wedge it with a spike." />
              </Field>
            </div>
            <aside className="rounded-sm border border-line p-3 self-start lg:sticky lg:top-16" aria-label="How it will read">
              <StatBlock s={shown} />
            </aside>
          </div>
        )}

        {mode === 'own' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-3">
              <CopyFrom onCopy={(s) => setD((v) => ({ ...draftFrom(s), kind: v.kind, tactics: v.tactics, looks: v.looks }))} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Size, type and alignment">
                  <input className="input" value={d.meta} onChange={(e) => set({ meta: e.target.value })} placeholder="Medium Humanoid, Neutral" />
                </Field>
                <div>
                  <span className="label">It is</span>
                  <Segmented
                    label="Creature or person"
                    value={d.kind}
                    onChange={(kind) => set({ kind })}
                    options={[
                      { value: 'npc', label: 'A person' },
                      { value: 'creature', label: 'A creature' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Armor Class">
                  <input className="input num" inputMode="numeric" value={d.ac} onChange={(e) => set({ ac: e.target.value })} placeholder="15" />
                </Field>
                <Field label="Hit Points" hint={d.hp.trim() ? (hp ? (hp.hp !== d.hp.trim() ? `Reads: ${hp.hp}` : undefined) : 'A number, or dice: 7d8 + 7') : 'Dice work: 7d8 + 7'}>
                  <input className="input num" value={d.hp} onChange={(e) => set({ hp: e.target.value })} onBlur={() => hp && set({ hp: hp.hp })} placeholder="7d8 + 7" />
                </Field>
                <Field label="Speed">
                  <input className="input" value={d.speed} onChange={(e) => set({ speed: e.target.value })} placeholder="30 ft." />
                </Field>
                <Field label="Initiative" hint={d.init.trim() === '' && dex !== undefined ? `From Dexterity: ${sg(abilityMod(dex))}` : undefined}>
                  <input className="input num" inputMode="numeric" value={d.init} onChange={(e) => set({ init: e.target.value })} placeholder={dex !== undefined ? sg(abilityMod(dex)) : '+2'} />
                </Field>
              </div>
              <fieldset>
                <legend className="label">Ability scores</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {ABILITIES.map((a, i) => {
                    const v = num(d.ab[i]);
                    return (
                      <label key={a} className="block text-center">
                        <span className="text-[10px] uppercase tracking-wider text-dim">{a}</span>
                        <input className="input num text-center" inputMode="numeric" value={d.ab[i]} aria-label={a} onChange={(e) => set({ ab: d.ab.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="10" />
                        <span className="num text-xs text-dim">{v !== undefined ? sg(abilityMod(v)) : ' '}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <Field label="Challenge Rating" hint={d.cr && XP_BY_CR[d.cr] !== undefined ? `XP ${XP_BY_CR[d.cr].toLocaleString()}; Proficiency Bonus +${crPb(d.cr)}` : undefined}>
                <select className="input" value={d.cr} onChange={(e) => set({ cr: e.target.value })}>
                  <option value="">None</option>
                  {CHALLENGE_RATINGS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {LINES.map(([k, label, example]) => (
                  <Field key={k} label={label}>
                    <input className="input" value={d[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={example} />
                  </Field>
                ))}
              </div>
              {LISTS.map(([k, label, example]) => (
                <EntryList key={k} label={label} example={example} list={d[k]} onChange={(l) => set({ [k]: l })} />
              ))}
              <Field label="How it fights">
                <textarea className="input" rows={2} value={d.tactics} onChange={(e) => set({ tactics: e.target.value })} />
              </Field>
            </div>
            <aside className="rounded-sm border border-line p-3 self-start lg:sticky lg:top-16" aria-label="How it will read">
              <StatBlock s={shown} />
            </aside>
          </div>
        )}
      </div>
    </Modal>
  );
}
