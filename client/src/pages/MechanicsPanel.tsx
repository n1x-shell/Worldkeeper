/**
 * Settings, Campaign mechanics: which of the Worldkeeper setting's own mechanics this library uses. Switch them all
 * off to run a standard D&D campaign with whatever books the GM imported.
 */
import { Cog } from 'lucide-react';
import { api } from '../lib/api';
import { mechanicsChanged, useMechanics } from '../lib/mechanics';
import { Card, Toggle } from '../components/ui';
import { MECHANICS, SETTING_PRESET, STANDARD_PRESET, type Mechanics } from '../../../shared/mechanics';

export function MechanicsPanel() {
  const m = useMechanics();
  const save = async (patch: Partial<Mechanics>) => mechanicsChanged(await api.put<Mechanics>('/api/mechanics', patch));
  if (!m) return null;
  const all = MECHANICS.every(({ key }) => m[key]);
  const none = MECHANICS.every(({ key }) => !m[key]);
  return (
    <Card title="Campaign mechanics" icon={<Cog size={14} />} className="space-y-3">
      <p className="text-sm text-dim">
        The Worldkeeper setting has mechanics of its own. Switch off any you don&apos;t use; to run a standard D&amp;D campaign with your own books, switch them all off. A switched-off mechanic leaves
        the menus, sheets, the player view and the handbook. Nothing is deleted: switch it back on and it&apos;s all still there. Characters are always built by the 2024 rules.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={none ? 'btn-primary' : 'btn'} onClick={() => save(STANDARD_PRESET)}>
          Standard D&amp;D
        </button>
        <button className={all ? 'btn-primary' : 'btn'} onClick={() => save(SETTING_PRESET)}>
          The Worldkeeper setting
        </button>
      </div>
      <ul className="space-y-2">
        {MECHANICS.map(({ key, label, about }) => (
          <li key={key}>
            <Toggle checked={m[key]} onChange={(v) => save({ [key]: v })} hint={about}>
              <span className="font-medium">{label}</span>
            </Toggle>
          </li>
        ))}
      </ul>
    </Card>
  );
}
