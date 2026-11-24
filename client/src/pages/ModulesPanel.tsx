/**
 * Settings → Modules: the optional features (shared/modules.ts) this library uses, and where the active campaign
 * differs. A setting pack turns its own on; anything can be switched on or off by hand. Switching one off hides it
 * everywhere (menus, sheets, the player view and the handbook) and deletes nothing.
 */
import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { ModuleKey } from '@shared/modules';
import { api, useApi } from '../lib/api';
import { reloadModules } from '../lib/modules';
import { useAppState } from '../lib/store';
import { Badge, Card, Toggle } from '../components/ui';
import { Segmented } from '../components/ui/inputs';
import { Dev } from '../components/Dev';

interface ModuleRow {
  key: ModuleKey;
  label: string;
  about: string;
  on: boolean;
  library: boolean | null;
  campaign: boolean | null;
  fromPack: boolean;
  storage: string[];
}

type CampaignChoice = 'library' | 'on' | 'off';

export function ModulesPanel() {
  const { activeCampaignId } = useAppState();
  const { data, reload } = useApi<{ campaign_id: number | null; modules: ModuleRow[] }>(`/api/modules${activeCampaignId ? `?campaign_id=${activeCampaignId}` : ''}`);
  const { data: campaigns } = useApi<{ id: number; title: string }[]>('/api/campaigns');
  const [busy, setBusy] = useState(false);
  const campaign = campaigns?.find((c) => c.id === data?.campaign_id);
  const change = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
      await reload();
      await reloadModules();
    } finally {
      setBusy(false);
    }
  };
  if (!data) return null;
  return (
    <Card title="Modules" icon={<Puzzle size={14} />} className="space-y-3">
      <p className="text-sm text-dim">
        Optional features. A worldbook switches on its own; switch any of them on or off for your world. A switched-off module leaves the menus, sheets, the player view and the handbook, and
        nothing is deleted: switch it back on and it&apos;s all still there.
      </p>
      <ul className="space-y-3">
        {data.modules.map((m) => {
          const libOn = m.library ?? m.fromPack;
          const choice: CampaignChoice = m.campaign === null ? 'library' : m.campaign ? 'on' : 'off';
          return (
            <li key={m.key} className="space-y-1">
              <Toggle checked={libOn} disabled={busy} onChange={(v) => void change(() => api.put('/api/modules', { [m.key]: v === m.fromPack ? null : v }))} hint={m.about}>
                <span className="font-medium">{m.label}</span> {m.fromPack && <Badge tone="arcane">From your worldbook</Badge>}
              </Toggle>
              {campaign && (
                <div className="flex flex-wrap items-center gap-2 pl-12 text-xs text-dim">
                  <span>In {campaign.title}:</span>
                  <Segmented<CampaignChoice>
                    size="sm"
                    label={`${m.label} in ${campaign.title}`}
                    value={choice}
                    disabled={busy}
                    onChange={(v) => void change(() => api.put(`/api/campaigns/${campaign.id}/modules`, { [m.key]: v === 'library' ? null : v === 'on' }))}
                    options={[
                      { value: 'library', label: `As the library (${libOn ? 'on' : 'off'})` },
                      { value: 'on', label: 'On' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                </div>
              )}
              <Dev>
                <div className="pl-12 text-[11px] text-dim">
                  {m.key} · data: {m.storage.join(', ') || 'none'}
                </div>
              </Dev>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
