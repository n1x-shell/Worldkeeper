/**
 * The GM's own magic items and spells (v0.9.5): the editor for each, the list on Your Books, and an item record's
 * own rules. They are kept in the library and join the books' wherever items and spells are read.
 */
import { useState } from 'react';
import { Pencil, Plus, ScrollText, Sparkles } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { Badge, Card, Check, Empty, ErrorBox, Field, Modal, Segmented, ask } from './ui';
import { ItemCard, type BookItem } from './ItemRules';

const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const ITEM_TYPES = ['Wondrous Item', 'Armor', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Weapon', 'Adventuring Gear'];
const LEVELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

interface ItemData {
  type: string;
  rarity: string;
  attunement: string;
  value: number | null;
  weight: number | null;
  text: string;
}
interface SpellData {
  level: number;
  school: string;
  classes: string[];
  time: string;
  range: string;
  components: string;
  duration: string;
  ritual: boolean;
  text: string;
}
export interface Homebrew {
  id: number;
  kind: 'item' | 'spell';
  name: string;
  entity_id: string | null;
  pack_id: string | null;
  data: Record<string, unknown>;
}

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
const asItem = (h: Homebrew): BookItem => ({ magic: false, value: null, weight: null, source: 'Your own', type: '', rarity: '', attunement: '', text: '', ...(h.data as Partial<BookItem>), name: h.name });

/** "2nd-level Evocation (ritual)" or "Evocation cantrip", as the books write it. */
export function spellLine(s: { level: number; school: string; ritual?: boolean }) {
  return `${s.level ? `${LEVELS[s.level]}-level ${s.school}` : `${s.school} cantrip`}${s.ritual ? ' (ritual)' : ''}`;
}

function SpellCard({ name, s, open }: { name: string; s: SpellData; open?: boolean }) {
  return (
    <details className="rounded-sm border border-line/70 px-2 py-1 text-sm" open={open}>
      <summary className="cursor-pointer">
        <span className="font-medium">{name || 'A new spell'}</span> <span className="text-xs text-dim">{spellLine(s)}</span>
      </summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
        {(
          [
            ['Casting time', s.time],
            ['Range', s.range],
            ['Components', s.components],
            ['Duration', s.duration],
            ['Classes', s.classes.join(', ')],
          ] as const
        ).map(
          ([k, v]) =>
            v && (
              <div key={k} className="contents">
                <dt className="text-dim">{k}</dt>
                <dd>{v}</dd>
              </div>
            ),
        )}
      </dl>
      <p className="whitespace-pre-line mt-1">{s.text}</p>
    </details>
  );
}

/** Make or change one of the GM's own items or spells. `entity` makes it the rules of that record. */
export function HomebrewEditor({
  kind,
  start,
  entity,
  onClose,
  onSaved,
}: {
  kind: 'item' | 'spell';
  start: Homebrew | null;
  entity?: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = (start?.data ?? {}) as Partial<ItemData & SpellData>;
  const [name, setName] = useState(start?.name ?? entity?.name ?? '');
  const [err, setErr] = useState<string | null>(null);
  // An item.
  const [type, setType] = useState(d.type ?? 'Wondrous Item');
  const [rarity, setRarity] = useState(d.rarity ?? 'uncommon');
  const [attuned, setAttuned] = useState(!!d.attunement);
  const [attuneBy, setAttuneBy] = useState((d.attunement ?? '').replace(/^requires attunement\s*(by\s*)?/i, ''));
  const [value, setValue] = useState(d.value != null ? String(d.value) : '');
  const [weight, setWeight] = useState(d.weight != null ? String(d.weight) : '');
  // A spell.
  const [level, setLevel] = useState(d.level ?? 1);
  const [school, setSchool] = useState(d.school ?? 'Evocation');
  const [classes, setClasses] = useState<string[]>(d.classes ?? []);
  const [time, setTime] = useState(d.time ?? 'Action');
  const [range, setRange] = useState(d.range ?? '');
  const [components, setComponents] = useState(d.components ?? 'V, S');
  const [duration, setDuration] = useState(d.duration ?? 'Instantaneous');
  const [ritual, setRitual] = useState(!!d.ritual);
  const [text, setText] = useState(d.text ?? '');
  const { data: rules } = useApi<{ classes: Record<string, unknown> }>(kind === 'spell' ? '/api/player/rules' : null);
  const classNames = [...new Set([...Object.keys(rules?.classes ?? {}), ...classes])].sort();

  const item: ItemData = { type: type.trim() || 'Wondrous Item', rarity, attunement: attuned ? `requires attunement${attuneBy.trim() ? ` by ${attuneBy.trim()}` : ''}` : '', value: num(value), weight: num(weight), text };
  const spell: SpellData = { level, school, classes, time, range, components, duration, ritual, text };
  const save = async () => {
    const body = { kind, name, entity_id: entity?.id ?? start?.entity_id ?? null, data: kind === 'item' ? item : spell };
    try {
      if (start) await api.put(`/api/homebrew/${start.id}`, body);
      else await api.post('/api/homebrew', body);
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <Modal
      title={start ? `Change ${start.name}` : kind === 'item' ? (entity ? `${entity.name}: its rules` : 'A new item') : 'A new spell'}
      wide
      onClose={onClose}
      footer={
        <>
          {start && (
            <button
              className="btn mr-auto"
              onClick={async () => {
                if (!(await ask({ body: `Remove ${start.name}? Sheets that have it keep its name, without its rules.`, confirmLabel: 'Remove', danger: true }))) return;
                await api.del(`/api/homebrew/${start.id}`);
                onSaved();
              }}
            >
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
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" data-testid="homebrew-editor">
        <div className="space-y-3">
          {err && <ErrorBox error={err} />}
          {start?.pack_id && <p className="text-xs text-dim">This came with a worldbook. Saving a change makes it yours: updating the worldbook then leaves it alone.</p>}
          <Field label="Name" hint={entity ? 'It goes by the record’s name.' : undefined}>
            <input className="input" value={name} disabled={!!entity || !!start?.entity_id} onChange={(e) => setName(e.target.value)} placeholder={kind === 'item' ? 'Lantern of the Drowned' : 'Ashen Step'} />
          </Field>
          {kind === 'item' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kind of item" hint="As the books write it: Weapon (Longsword), Armor (Shield)…">
                  <input className="input" list="hb-types" value={type} onChange={(e) => setType(e.target.value)} />
                  <datalist id="hb-types">
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Rarity">
                  <select className="input" value={rarity} onChange={(e) => setRarity(e.target.value)}>
                    <option value="">Not magic</option>
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {r[0].toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Check checked={attuned} onChange={setAttuned} label="Requires attunement">
                  <span className="text-sm">Requires attunement</span>
                </Check>
                {attuned && (
                  <label className="flex items-center gap-2 text-sm">
                    by
                    <input className="input py-1" value={attuneBy} onChange={(e) => setAttuneBy(e.target.value)} placeholder="anyone (or: a cleric)" aria-label="Attunement by" />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Worth (GP)">
                  <input className="input num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
                </Field>
                <Field label="Weight (lb.)">
                  <input className="input num" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Level">
                  <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    {LEVELS.map((l, i) => (
                      <option key={l} value={i}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="School">
                  <select className="input" value={school} onChange={(e) => setSchool(e.target.value)}>
                    {SCHOOLS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Casting time">
                  <input className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Action, Bonus Action, 1 minute…" />
                </Field>
                <Field label="Range">
                  <input className="input" value={range} onChange={(e) => setRange(e.target.value)} placeholder="60 feet" />
                </Field>
                <Field label="Components" hint="V, S, M (and what the material is)">
                  <input className="input" value={components} onChange={(e) => setComponents(e.target.value)} placeholder="V, S, M (a pinch of ash)" />
                </Field>
                <Field label="Duration" hint="Start with “Concentration” if it needs it.">
                  <input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Concentration, up to 1 minute" />
                </Field>
              </div>
              <Check checked={ritual} onChange={setRitual} label="Can be cast as a ritual">
                <span className="text-sm">Can be cast as a ritual</span>
              </Check>
              <fieldset>
                <legend className="label">Whose spell list it is on</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {classNames.map((c) => (
                    <Check key={c} checked={classes.includes(c)} label={c} onChange={(on) => setClasses(on ? [...classes, c] : classes.filter((x) => x !== c))}>
                      <span className="text-sm">{c}</span>
                    </Check>
                  ))}
                  {!classNames.length && <span className="text-xs text-dim">No classes in your rules yet.</span>}
                </div>
              </fieldset>
            </>
          )}
          <Field label="What it does" hint={kind === 'spell' ? 'End with a paragraph on casting it with a higher-level slot, if that changes it.' : undefined}>
            <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
        <aside className="self-start lg:sticky lg:top-16 space-y-1" aria-label="How it will read">
          <div className="label">How it will read</div>
          {kind === 'item' ? (
            <ItemCard item={{ ...asItem({ id: 0, kind: 'item', name: name || 'A new item', entity_id: null, pack_id: null, data: {} }), ...item, magic: !!item.rarity }} open />
          ) : (
            <SpellCard name={name} s={spell} open />
          )}
        </aside>
      </div>
    </Modal>
  );
}

/** On Your Books: the GM's own items and spells, with a way to make more. */
export function YourOwn() {
  const { data, reload } = useApi<Homebrew[]>('/api/homebrew');
  const [kind, setKind] = useState<'item' | 'spell'>('item');
  const [editing, setEditing] = useState<{ kind: 'item' | 'spell'; start: Homebrew | null } | null>(null);
  const list = (data ?? []).filter((h) => h.kind === kind);
  return (
    <div className="space-y-3 max-w-3xl" data-testid="your-own">
      <p className="text-sm text-dim">
        Magic items and spells you made. They are kept in this library and travel with its backups and shared worldbooks. An item shows in treasure and on sheets by its name; a spell shows in the spell lists of
        the classes you give it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Items or spells"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'item', label: `Items (${(data ?? []).filter((h) => h.kind === 'item').length})` },
            { value: 'spell', label: `Spells (${(data ?? []).filter((h) => h.kind === 'spell').length})` },
          ]}
        />
        <button className="btn-primary ml-auto" onClick={() => setEditing({ kind, start: null })}>
          <Plus size={14} /> {kind === 'item' ? 'New item' : 'New spell'}
        </button>
      </div>
      {data && !list.length && (
        <Empty compact title={kind === 'item' ? 'No items of your own yet.' : 'No spells of your own yet.'}>
          {kind === 'item' ? 'Make one here, or give an item record rules from its page.' : 'Make one and tick the classes that can learn it.'}
        </Empty>
      )}
      <div className="space-y-1">
        {list.map((h) => (
          <div key={h.id} className="flex items-start gap-1">
            <div className="min-w-0 flex-1">{h.kind === 'item' ? <ItemCard item={asItem(h)} /> : <SpellCard name={h.name} s={h.data as unknown as SpellData} />}</div>
            {h.pack_id && <Badge>From a worldbook</Badge>}
            <button className="btn-ghost" aria-label={`Change ${h.name}`} title="Change" onClick={() => setEditing({ kind: h.kind, start: h })}>
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <HomebrewEditor
          kind={editing.kind}
          start={editing.start}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

/** On an item's record page (GM): the rules it has of its own, or a way to give it some. */
export function ItemRulesPanel({ entityId, name }: { entityId: string; name: string }) {
  const { data, reload } = useApi<{ rules: Homebrew | null }>(`/api/homebrew/record/${encodeURIComponent(entityId)}`);
  const [editing, setEditing] = useState(false);
  if (!data) return null;
  const h = data.rules;
  return (
    <Card
      title="Rules"
      icon={h ? <ScrollText size={15} className="text-gold" /> : <Sparkles size={15} className="text-gold" />}
      actions={
        <button className="btn-ghost text-xs py-0.5" onClick={() => setEditing(true)}>
          {h ? 'Change' : 'Give it rules'}
        </button>
      }
    >
      {h ? <ItemCard item={asItem(h)} open /> : <p className="text-sm text-dim">None of its own yet. Give it a rarity and say what it does, and it shows in treasure and on sheets by its name.</p>}
      {editing && (
        <HomebrewEditor
          kind="item"
          start={h}
          entity={{ id: entityId, name }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
    </Card>
  );
}
