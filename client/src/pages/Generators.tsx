/**
 * Generators (v0.9.12): somebody to meet, and a shop with its shelves and prices. Nothing is saved until the GM keeps
 * one, which makes an ordinary record (for the GM only, until revealed). The weather card is for the campaign calendar.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkPlus, CloudSun, RefreshCw, Store, Users } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { useRealms } from '../components/realms';
import { Card, Empty, Field, Loading, PageHeader, Tabs, toast } from '../components/ui';
import { article, coins, npcText, shopText, type NpcIdea, type Shop, type Weather } from '../../../shared/generators';
import type { Entity } from '../lib/types';

interface Sources {
  names: { id: string; name: string; builtIn: boolean }[];
  shops: { key: string; label: string }[];
  places: { id: string; name: string; type: string }[];
}

/** Keep something generated as a record of the world, for the GM only. */
function useKeep() {
  const { reloadIndex } = useAppState();
  const realms = useRealms();
  const [kept, setKept] = useState<Record<string, string>>({});
  const keep = async (key: string, input: { name: string; type: string; category: string; realm?: string; parent_id?: string | null; fields?: [string, string][]; body: string }) => {
    const realm = input.realm ?? realms.list.find((r) => !r.archived)?.id ?? 'world';
    try {
      const e = await api.post<Entity>('/api/entities', {
        name: input.name,
        type: input.type,
        realm,
        parent_id: input.parent_id ?? null,
        aliases: [],
        category_raw: input.category,
        source_raw: 'DM entry (The Worldkeeper)',
        tags: [`realm/${realm}`, 'vis/gm'],
        fields: input.fields ?? [],
        body: input.body,
        notes: '',
      });
      setKept((k) => ({ ...k, [key]: e.id }));
      await reloadIndex();
      toast(`${input.name} is now a record.`, 'ok');
    } catch (x) {
      toast((x as Error).message, 'danger');
    }
  };
  return { kept, keep };
}

const SourceSelect = ({ sources, value, onChange, any }: { sources: Sources['names']; value: string; onChange: (v: string) => void; any: string }) => (
  <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{any}</option>
    {sources.some((s) => !s.builtIn) && (
      <optgroup label="This world's peoples">
        {sources
          .filter((s) => !s.builtIn)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </optgroup>
    )}
    <optgroup label="Built-in styles">
      {sources
        .filter((s) => s.builtIn)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
    </optgroup>
  </select>
);

function People({ sources }: { sources: Sources }) {
  const [source, setSource] = useState('');
  const [role, setRole] = useState('');
  const [asked, setAsked] = useState('');
  const [seed, setSeed] = useState(() => Date.now());
  const { data } = useApi<NpcIdea[]>(`/api/generate/npcs?count=6&seed=${seed}${source ? `&source=${encodeURIComponent(source)}` : ''}${asked ? `&role=${encodeURIComponent(asked)}` : ''}`);
  const { kept, keep } = useKeep();
  const own = sources.names.some((s) => !s.builtIn);
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(role.trim());
          setSeed(Date.now());
        }}
      >
        <Field label="Names in the style of">
          <SourceSelect sources={sources.names} value={source} onChange={setSource} any={own ? 'Any of this world’s peoples' : 'Any style'} />
        </Field>
        <Field label="What they do (or leave it to chance)">
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="innkeeper, guard captain…" maxLength={80} />
        </Field>
        <button className="btn-primary" type="submit">
          <RefreshCw size={14} /> More people
        </button>
      </form>
      {!own && (
        <p className="text-xs text-dim">
          These names come from built-in styles. Give a People or Species record its <b>Common names</b> and people here are named in your world&apos;s own styles.
        </p>
      )}
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty title="No new names left in this style.">Try another.</Empty>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" data-testid="npc-ideas">
          {data.map((n) => {
            const key = `${seed}:${n.name}`;
            return (
              <li key={key} className="panel elev-1 space-y-2 p-4">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-lg text-gold">{n.name}</h3>
                  <span className="text-xs text-dim">
                    {n.people}, {n.role}
                  </span>
                </div>
                <p className="text-sm">
                  {article(n.role)} {n.role}, with {n.look}. {n.name.split(' ')[0]} {n.manner}.
                </p>
                <p className="text-sm">
                  <span className="label">Wants</span> {n.want}.
                </p>
                <p className="text-sm">
                  <span className="label">Secret</span> {n.secret}
                </p>
                {kept[key] ? (
                  <Link className="btn text-sm" to={`/e/${kept[key]}`}>
                    Open the record
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn text-sm"
                    onClick={() =>
                      void keep(key, {
                        name: n.name,
                        type: 'npc',
                        category: 'NPC',
                        fields: [
                          ['People', n.people],
                          ['Occupation', n.role],
                        ],
                        body: npcText(n),
                      })
                    }
                  >
                    <BookmarkPlus size={14} /> Keep as a record
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface ShopResult {
  shop: Shop;
  keeper: NpcIdea | null;
  place: { id: string; name: string; realm: string } | null;
  wealthFrom: 'place' | 'chosen' | 'default';
}

function Shops({ sources }: { sources: Sources }) {
  const [kind, setKind] = useState(sources.shops[0]?.key ?? 'general');
  const [place, setPlace] = useState('');
  const [wealth, setWealth] = useState('');
  const [source, setSource] = useState('');
  const [seed, setSeed] = useState(() => Date.now());
  const q = `kind=${kind}&seed=${seed}${place ? `&place=${encodeURIComponent(place)}` : ''}${wealth ? `&wealth=${wealth}` : ''}${source ? `&source=${encodeURIComponent(source)}` : ''}`;
  const { data } = useApi<ShopResult>(`/api/generate/shop?${q}`);
  const { kept, keep } = useKeep();
  const key = q;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="What kind of shop">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {sources.shops.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where it is">
          <select className="input max-w-56" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">Nowhere in particular</option>
            {sources.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
        </Field>
        <Field label="How rich the place is">
          <select className="input" value={wealth} onChange={(e) => setWealth(e.target.value)}>
            <option value="">{place ? 'As the place says' : 'Modest'}</option>
            <option value="poor">Poor</option>
            <option value="modest">Modest</option>
            <option value="rich">Rich</option>
          </select>
        </Field>
        <Field label="The keeper’s name in the style of">
          <SourceSelect sources={sources.names} value={source} onChange={setSource} any="Any" />
        </Field>
        <button className="btn-primary" type="button" onClick={() => setSeed(Date.now())}>
          <RefreshCw size={14} /> Another shop
        </button>
      </div>
      {!data ? (
        <Loading />
      ) : (
        <div data-testid="shop">
          <Card
            title={data.shop.name}
            icon={<Store size={16} />}
            actions={
              kept[key] ? (
                <Link className="btn text-sm" to={`/e/${kept[key]}`}>
                  Open the record
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() =>
                    void keep(key, {
                      name: data.shop.name,
                      type: 'building',
                      category: 'Building',
                      realm: data.place?.realm,
                      parent_id: data.place?.id ?? null,
                      fields: [
                        ['Kind', sources.shops.find((k) => k.key === data.shop.kind)?.label ?? 'Shop'],
                        ['Wealth', data.shop.wealth],
                        ...(data.keeper ? [['Kept by', data.keeper.name] as [string, string]] : []),
                      ],
                      body: shopText(data.shop, data.keeper, data.place?.name),
                    })
                  }
                >
                  <BookmarkPlus size={14} /> Keep as a record
                </button>
              )
            }
            flush
          >
            <div className="space-y-1 px-4 pb-3 text-sm">
              <p>
                {data.place ? `In ${data.place.name}, a ` : 'In a '}
                <b>{data.shop.wealth}</b> place
                {data.wealthFrom === 'default' && data.place ? ' (the place doesn’t say how rich it is: give it a Wealth fact)' : ''}. Its prices are <b>{data.shop.prices === 'dear' ? 'high' : data.shop.prices === 'cheap' ? 'low' : 'fair'}</b>.
              </p>
              {data.keeper && (
                <p>
                  Kept by <b>{data.keeper.name}</b> ({data.keeper.people.toLowerCase()}), with {data.keeper.look}. {data.keeper.name.split(' ')[0]} {data.keeper.manner}. <span className="text-dim">Wants {data.keeper.want}. {data.keeper.secret}</span>
                </p>
              )}
            </div>
            {data.shop.lines.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs uppercase tracking-wide text-dim">
                    <th className="px-4 py-1.5 font-normal">Item</th>
                    <th className="px-2 py-1.5 font-normal">Kind</th>
                    <th className="px-2 py-1.5 text-right font-normal">Price</th>
                    <th className="px-4 py-1.5 text-right font-normal">In stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {data.shop.lines.map((l) => (
                    <tr key={l.name}>
                      <td className="px-4 py-1.5">
                        {l.name}
                        {l.magic && <span className="ml-2 text-xs text-arcane">{l.rarity}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-dim">{l.type}</td>
                      <td className="num whitespace-nowrap px-2 py-1.5 text-right">{coins(l.price)}</td>
                      <td className="num px-4 py-1.5 text-right">{l.stock || 'Plenty'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 pb-4">
                <Empty compact title="Nothing on the shelves.">
                  No items of this kind are in your rules. Turn the SRD on, or add a book, in Your Books.
                </Empty>
              </div>
            )}
          </Card>
          <p className="mt-2 text-xs text-dim">Prices are the items’ own from your rules; a magic item with no price of its own is priced by its rarity (100, 400, 4,000, 40,000 or 200,000 gp; a potion half). Change them as you like once kept.</p>
        </div>
      )}
    </div>
  );
}

export function GeneratorsPage() {
  const { data } = useApi<Sources>('/api/generate/sources');
  const [tab, setTab] = useState<'people' | 'shops'>('people');
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Generators" subtitle="Somebody to meet, or a shop and what it sells, when the party goes where you hadn't planned." note="Nothing is saved until you keep it; what you keep becomes a record only you see." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'people',
            label: (
              <>
                <Users size={14} className="mr-1 inline" /> People
              </>
            ),
          },
          {
            id: 'shops',
            label: (
              <>
                <Store size={14} className="mr-1 inline" /> Shops
              </>
            ),
          },
        ]}
      />
      {!data ? <Loading /> : tab === 'people' ? <People sources={data} /> : <Shops sources={data} />}
    </div>
  );
}

interface WeatherDay {
  date: { year: number; day: number };
  label: string;
  season: string;
  weather: Weather | null;
}

/** The weather where the party is: today in full, and the days after in a line each. */
export function WeatherCard({ campaignId, today }: { campaignId: number; today: { year: number; day: number } }) {
  // Asked again when the date moves.
  const { data } = useApi<{ place: { id: string; name: string } | null; terrain: string[]; days: WeatherDay[] }>(`/api/campaigns/${campaignId}/weather?days=7&at=${today.year}-${today.day}`);
  if (!data) return null;
  const [first, ...rest] = data.days;
  return (
    <div data-testid="weather">
      <Card title="Weather" icon={<CloudSun size={16} />}>
        {!first?.weather ? (
          <p className="text-sm text-dim">No sky here, and no weather to speak of.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <span className="label">Today{first.season ? `, ${first.season.toLowerCase()}` : ''}</span> {first.weather.summary}
            </p>
            {first.weather.effects.map((e) => (
              <p key={e} className="rounded border border-warn/50 bg-warn/10 px-2 py-1 text-xs">
                {e}
              </p>
            ))}
            <ul className="space-y-0.5 text-xs text-dim">
              {rest.map((d) => (
                <li key={`${d.date.year}-${d.date.day}`} className="flex gap-2">
                  <span className="w-28 shrink-0 truncate">{d.label}</span>
                  <span className={d.weather?.effects.length ? 'text-ink' : ''}>{d.weather?.summary ?? 'No weather'}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-dim">
              {data.place ? (
                <>
                  Where the party is: <Link to={`/e/${data.place.id}`}>{data.place.name}</Link>
                  {data.terrain.length ? ` (${data.terrain.join(', ')})` : '. Give it or its region a Terrain fact and the weather follows the land'}.
                </>
              ) : (
                'The campaign has no place yet (its starting place, or a stop on a map), so this is a mild land’s weather.'
              )}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
