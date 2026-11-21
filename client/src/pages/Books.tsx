/**
 * Your books (GM only): the creatures and items imported from the GM's own books (rules packs, see
 * docs/RULES_PACKS.md), to browse and search. Creatures go into the encounter tracker and NPC cards; items show their
 * rules in treasure and on character sheets. Nothing here is published or exported.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/api';
import { Card, Empty, PageHeader, Segmented } from '../components/ui';
import { StatBlockById } from '../components/StatBlock';
import { ItemCard, type BookItem } from '../components/ItemRules';
import { EncounterIdeas } from '../components/EncounterIdeas';
import { useAppState } from '../lib/store';

interface Creature {
  id: string;
  name: string;
  cr: string | null;
  meta: string;
  source: string;
}
const crNum = (cr: string | null) => (!cr ? -1 : cr.includes('/') ? Number(cr.split('/')[0]) / Number(cr.split('/')[1]) : Number(cr));
const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];

export function BooksPage() {
  const [tab, setTab] = useState<'creatures' | 'items' | 'encounters'>('creatures');
  const { data: counts } = useApi<{ creatures: number; items: number }>('/api/books');
  return (
    <div className="space-y-4">
      <PageHeader title="Your Books" subtitle="Creatures, items and hazards from the SRD 5.2.1 and the books you imported. Only you see these." />
      {counts && !counts.creatures && !counts.items ? (
        <Empty
          title="Nothing imported yet"
          action={
            <Link to="/settings" className="btn-primary">
              Settings → Rules packs
            </Link>
          }
        >
          Bring in your books in Settings → Rules packs.
        </Empty>
      ) : (
        <>
          <Segmented
            label="Book section"
            value={tab}
            onChange={setTab}
            options={(['creatures', 'items', 'encounters'] as const).map((t) => ({
              value: t,
              label: (
                <span className="capitalize">
                  {t} {counts && t !== 'encounters' && <span className="text-xs num">({t === 'creatures' ? counts.creatures : counts.items})</span>}
                </span>
              ),
            }))}
          />
          {tab === 'creatures' ? <Creatures /> : tab === 'items' ? <Items /> : <Encounters />}
        </>
      )}
    </div>
  );
}

function Creatures() {
  const { data } = useApi<Creature[]>('/api/books/creatures');
  const [q, setQ] = useState('');
  const [cr, setCr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const crs = useMemo(() => [...new Set((data ?? []).map((c) => c.cr ?? ''))].filter(Boolean).sort((a, b) => crNum(a) - crNum(b)), [data]);
  const list = (data ?? []).filter((c) => (!q || `${c.name} ${c.meta}`.toLowerCase().includes(q.toLowerCase())) && (!cr || c.cr === cr)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input className="input" placeholder="Find a creature or type" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a creature" />
          <select className="input w-24" value={cr} onChange={(e) => setCr(e.target.value)} aria-label="Challenge rating">
            <option value="">Any CR</option>
            {crs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <Card flush className="max-h-[70vh] overflow-auto">
          <ul className="divide-y divide-line/60">
            {list.slice(0, 400).map((c) => (
              <li key={c.id}>
                <button className={`w-full text-left px-3 py-1.5 text-sm ${open === c.id ? 'bg-gold/10' : ''}`} onClick={() => setOpen(c.id)}>
                  <span className="font-medium">{c.name}</span> <span className="text-xs text-dim num">CR {c.cr}</span>
                  <span className="block text-xs text-dim truncate">{c.meta}</span>
                </button>
              </li>
            ))}
            {list.length > 400 && <li className="px-3 py-1.5 text-xs text-dim">{list.length - 400} more: narrow the search.</li>}
          </ul>
        </Card>
      </div>
      <Card>{open ? <StatBlockById id={open} /> : <Empty compact title="Choose a creature to see its stat block." />}</Card>
    </div>
  );
}

function Items() {
  const { data } = useApi<BookItem[]>('/api/books/items');
  const [q, setQ] = useState('');
  const [rarity, setRarity] = useState('');
  const list = (data ?? [])
    .filter((i) => (!q || `${i.name} ${i.type}`.toLowerCase().includes(q.toLowerCase())) && (!rarity || (rarity === 'mundane' ? !i.rarity : i.rarity === rarity)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-2 max-w-3xl">
      <div className="flex gap-2">
        <input className="input" placeholder="Find an item or kind (potion, ring…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" />
        <select className="input w-36" value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">
          <option value="">Any rarity</option>
          <option value="mundane">Not magic</option>
          {RARITIES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        {list.slice(0, 300).map((i) => (
          <ItemCard key={i.name} item={i} />
        ))}
        {list.length > 300 && <p className="text-xs text-dim">{list.length - 300} more: narrow the search.</p>}
      </div>
    </div>
  );
}

/** Encounter ideas for a party: its level, and a terrain or one of the world's regions. */
function Encounters() {
  const { activeCampaignId } = useAppState();
  const { data } = useApi<{ terrains: string[]; regions: { id: string; label: string; terrain: string[] }[] }>('/api/books/terrains');
  const [level, setLevel] = useState(3);
  const [terrain, setTerrain] = useState<string[]>([]);
  const [region, setRegion] = useState('');
  const toggle = (t: string) => {
    setRegion('');
    setTerrain(terrain.includes(t) ? terrain.filter((x) => x !== t) : [...terrain, t]);
  };
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-sm text-dim">
        Groups of creatures from your books for the party&apos;s level, within the Dungeon Master&apos;s Guide (2024) XP budget. Choose where: a terrain, or one of your world&apos;s regions.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          Level
          <input type="number" min={1} max={20} className="input w-16 py-1" value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} aria-label="Party level" />
        </label>
        {(data?.regions.length ?? 0) > 0 && (
          <select className="input w-auto py-1" value={region} onChange={(e) => (setRegion(e.target.value), setTerrain([]))} aria-label="Region">
            <option value="">Any region</option>
            {data!.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(data?.terrains ?? []).map((t) => (
          <button
            key={t}
            className={`chip capitalize ${terrain.includes(t) ? 'border-gold text-gold bg-gold/10' : 'border-line text-dim'}`}
            aria-pressed={terrain.includes(t)}
            onClick={() => toggle(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <EncounterIdeas level={level} terrain={terrain} region={region || undefined} campaignId={activeCampaignId} />
      {!activeCampaignId && <p className="text-xs text-dim">Choose an active campaign to put an encounter in the tracker.</p>}
    </div>
  );
}
