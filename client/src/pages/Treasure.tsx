import { useMechanics } from '../lib/mechanics';
import { useState } from 'react';
import { Coins, Dices, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { Badge, Card, Check, Empty, EntityLink, ErrorBox, Field, Loading, PageHeader, RarityTag, Segmented } from '../components/ui';
import { NeedCampaign } from './Campaign';
import { ItemRulesList } from '../components/ItemRules';

/**
 * Treasure for the active campaign: roll individual treasure or a hoard by tier and region (Treasure [RUL-620]), add it
 * to the party's treasure log, and keep track of who carries what. Treasure found during a live session is noted in
 * the session log, and players see what the party carries in their handbook.
 */
interface Options {
  tiers: { key: string; label: string }[];
  regions: { key: string; label: string }[];
}
interface Roll {
  tier_label: string;
  region_label: string;
  kind: 'individual' | 'hoard';
  coins: { amount: number; coin: string; note: string };
  goods: { text: string; gp: number; count: number }[];
  items: { name: string; rarity: string; entity_id: string | null; fades: boolean }[];
  hook: string | null;
  total_gp: number;
  fades: boolean;
}
interface Row {
  id: number;
  name: string;
  kind: string;
  quantity: number;
  value_gp: number;
  rarity: string;
  entity_id: string | null;
  holder: string;
  status: string;
  found_at: string;
  fades: boolean;
  anchored: boolean;
  player_visible: boolean;
  notes: string;
}
const STATUSES = ['carried', 'stored', 'sold', 'spent', 'given', 'lost', 'faded'];
const gp = (n: number) => `${Math.round(n).toLocaleString('en')} gp`;

export function TreasurePage() {
  const { activeCampaignId } = useAppState();
  const { data: opts } = useApi<Options>('/api/treasure/options');
  const { data: rows, error, reload } = useApi<Row[]>(activeCampaignId ? `/api/party-treasure?campaign_id=${activeCampaignId}` : null);
  const { data: chars } = useApi<{ id: number; name: string }[]>(activeCampaignId ? `/api/characters?campaign_id=${activeCampaignId}` : null);
  const [tier, setTier] = useState('1-4');
  const [regionPick, setRegion] = useState('marches');
  const mech = useMechanics();
  // The region chosen, or the first one offered (the books, when the setting's treasure is off).
  const region = opts?.regions.some((r) => r.key === regionPick) ? regionPick : (opts?.regions[0]?.key ?? regionPick);
  const fading = mech?.fading !== false;
  const [kind, setKind] = useState<'individual' | 'hoard'>('hoard');
  const [roll, setRoll] = useState<Roll | null>(null);
  const [foundAt, setFoundAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!opts || !rows) return <Loading />;
  const doRoll = async () => {
    try {
      setErr(null);
      setRoll(await api.post<Roll>('/api/treasure/roll', { tier, region, kind }));
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const keep = async () => {
    if (!roll) return;
    await api.post('/api/party-treasure/from-roll', { campaign_id: activeCampaignId, roll, found_at: foundAt });
    setRoll(null);
    setFoundAt('');
    reload();
  };
  const patch = async (r: Row, p: Partial<Row>) => {
    await api.patch(`/api/party-treasure/${r.id}`, p);
    reload();
  };
  const held = rows.filter((r) => r.status === 'carried' || r.status === 'stored');
  const list = showAll ? rows : held;
  const worth = held.reduce((n, r) => n + r.value_gp, 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Treasure"
        subtitle="Roll treasure by tier and region, and keep the party's treasure log."
        note="Magic is scarce: about half the DMG's items, with the world's own items turning up where they belong. Artifacts never come up on a roll; they rest where their records say."
      />

      <Card className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto_auto] items-end">
          <Field label="Party level">
            <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
              {opts.tiers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {opts.regions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Segmented
            label="Kind of treasure"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'hoard', label: 'Hoard' },
            ]}
          />
          <button className="btn-primary h-[38px]" onClick={doRoll} disabled={!opts.regions.length}>
            <Dices size={15} /> Roll
          </button>
        </div>
        {!opts.regions.length && (
          <p className="text-sm text-dim">
            Nothing to roll from yet: import your books (with a Dungeon Master&apos;s Guide) in Settings, Rules packs, or switch the setting&apos;s treasure on in Settings, Campaign mechanics.
          </p>
        )}
        {err && <p className="text-danger text-sm">{err}</p>}
        {roll && (
          <div className="rounded-md border border-gold/40 p-3 space-y-2">
            <div className="text-xs uppercase tracking-widest text-dim">
              {roll.kind === 'hoard' ? 'Hoard' : 'Individual treasure'} · {roll.region_label} · {roll.tier_label}
            </div>
            <div className="flex items-center gap-2">
              <Coins size={15} className="text-gold" />
              <span className="font-display text-lg">
                <span className="num">{roll.coins.amount.toLocaleString('en')}</span> {roll.coins.coin}
              </span>
              <span className="text-sm text-dim">{roll.coins.note}</span>
            </div>
            {roll.goods.length > 0 && (
              <ul className="text-sm list-disc pl-5">
                {roll.goods.map((g) => (
                  <li key={g.text}>
                    {g.count > 1 ? `${g.count} × ` : ''}
                    {g.text} <span className="text-dim num">({gp(g.gp)} each)</span>
                  </li>
                ))}
              </ul>
            )}
            {roll.items.length > 0 && (
              <ul className="text-sm space-y-1">
                {roll.items.map((it, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <RarityTag rarity={it.rarity} />
                    {it.entity_id ? <EntityLink id={it.entity_id} /> : <span>{it.name}</span>}
                  </li>
                ))}
              </ul>
            )}
            <ItemRulesList names={roll.items.filter((it) => !it.entity_id).map((it) => it.name)} title="What they do (from your books)" />
            {roll.kind === 'hoard' && !roll.items.length && <p className="text-sm text-dim">No magic this time.</p>}
            {roll.hook && <p className="text-sm italic">{roll.hook}</p>}
            {roll.fades && fading && <p className="text-xs text-dim">Salvage from lost worlds: it fades once taken out of the Ethereal Realm unless it's anchored.</p>}
            <div className="text-sm text-dim">
              Worth about <span className="num">{gp(roll.total_gp)}</span>, before magic.
            </div>
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <input className="input max-w-xs" placeholder="Found at (optional)" value={foundAt} onChange={(e) => setFoundAt(e.target.value)} />
              <button className="btn" onClick={keep}>
                <Plus size={14} /> Add to the party's treasure
              </button>
              <button className="btn-ghost" onClick={doRoll}>
                Roll again
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="The party's treasure"
        aside={
          <span className="text-sm">
            <span className="num">{held.length}</span> things carried or stored, worth about <span className="num">{gp(worth)}</span>
          </span>
        }
        actions={
          <>
            <AddLine campaignId={activeCampaignId} onAdded={reload} />
            <Check checked={showAll} onChange={setShowAll}>
              Show sold, spent and lost
            </Check>
          </>
        }
      >
        {!list.length ? (
          <Empty compact title="Nothing yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table data-table">
              <thead>
                <tr>
                  <th>Treasure</th>
                  <th className="text-right">Worth</th>
                  <th>Carried by</th>
                  <th>Status</th>
                  <th>Found</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        {r.quantity > 1 && r.kind !== 'coins' && <span className="text-dim num">{r.quantity} ×</span>}
                        {r.entity_id ? <EntityLink id={r.entity_id} /> : <span>{r.name}</span>}
                        {r.rarity && <RarityTag rarity={r.rarity} />}
                        {fading && r.fades && !r.anchored && (
                          <button title="Mark it anchored once its story has been told" onClick={() => patch(r, { anchored: true })}>
                            <Badge tone="danger">fading</Badge>
                          </button>
                        )}
                        {fading && r.fades && r.anchored && <Badge tone="gold">anchored</Badge>}
                      </div>
                    </td>
                    <td className="num text-right whitespace-nowrap">{r.value_gp ? gp(r.value_gp) : <span className="text-dim">—</span>}</td>
                    <td>
                      <select className="input py-0.5 text-sm" value={r.holder} onChange={(e) => patch(r, { holder: e.target.value })}>
                        <option value="">The party</option>
                        {(chars ?? []).map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                        {r.holder && !(chars ?? []).some((c) => c.name === r.holder) && <option value={r.holder}>{r.holder}</option>}
                      </select>
                    </td>
                    <td>
                      <select className="input py-0.5 text-sm" value={r.status} onChange={(e) => patch(r, { status: e.target.value })}>
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-dim">{r.found_at}</td>
                    <td className="whitespace-nowrap">
                      <button className="btn-ghost p-1" title={r.player_visible ? 'Players see this' : 'Hidden from players'} onClick={() => patch(r, { player_visible: !r.player_visible })}>
                        {r.player_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="btn-ghost p-1 hover:text-danger" title="Delete" onClick={async () => (await api.del(`/api/party-treasure/${r.id}`), reload())}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pt-3">
              <ItemRulesList names={list.filter((r) => r.kind !== 'coins' && !r.entity_id).map((r) => r.name)} title="What the party's items do (from your books)" />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AddLine({ campaignId, onAdded }: { campaignId: number; onAdded: () => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await api.post('/api/party-treasure', { campaign_id: campaignId, name: name.trim(), kind: 'other' });
        setName('');
        onAdded();
      }}
    >
      <input className="input py-1 text-sm w-56" placeholder="Add something by hand…" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn py-1 text-sm" type="submit" disabled={!name.trim()}>
        <Plus size={13} />
      </button>
    </form>
  );
}

interface CatalogueInfo {
  kind: 'item' | 'artifact';
  rarity: string;
  attunement: boolean;
  rules?: string;
  where?: string;
  wants?: string;
  place?: string;
  holder?: string;
  leads?: string[];
}

/** On an item's or artifact's page (GM): its rarity, rules where the archive gave none, where it turns up, and who wants it. */
export function TreasurePanel({ entityId, type }: { entityId: string; type: string }) {
  const { data } = useApi<CatalogueInfo | null>(type === 'item' || type === 'artifact' ? `/api/treasure/catalogue/${encodeURIComponent(entityId)}` : null);
  if (!data) return null;
  return (
    <Card title="Treasure" className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <RarityTag rarity={data.rarity} />
        {data.attunement && <Badge>requires attunement</Badge>}
      </div>
      {data.rules && (
        <div>
          <div className="label">Rules (homebrew)</div>
          <p>{data.rules}</p>
        </div>
      )}
      {data.where && (
        <div>
          <div className="label">Where it turns up</div>
          <p>{data.where}</p>
        </div>
      )}
      {data.place && (
        <div>
          <div className="label">Where it rests</div>
          <p>
            <EntityLink id={data.place} /> — {data.holder}
          </p>
        </div>
      )}
      {data.wants && (
        <div>
          <div className="label">Who wants it</div>
          <p>{data.wants}</p>
        </div>
      )}
      {!!data.leads?.length && (
        <div>
          <div className="label">Leads</div>
          <ul className="list-disc pl-5">
            {data.leads.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
