/**
 * Settings, Campaign mechanics: which of the Worldkeeper setting's own mechanics this library uses. Switch them all
 * off to run a standard D&D campaign with whatever books the GM imported.
 */
import { Cog } from 'lucide-react';
import { api } from '../lib/api';
import { mechanicsChanged, useMechanics } from '../lib/mechanics';
import { MECHANICS, SETTING_PRESET, STANDARD_PRESET, type Mechanics } from '../../../shared/mechanics';

export function MechanicsPanel() {
  const m = useMechanics();
  const save = async (patch: Partial<Mechanics>) => mechanicsChanged(await api.put<Mechanics>('/api/mechanics', patch));
  if (!m) return null;
  const all = MECHANICS.every(({ key }) => m[key]);
  const none = MECHANICS.every(({ key }) => !m[key]);
  return (
    <div className="panel-pad space-y-3">
      <div className="section-title flex items-center gap-2">
        <Cog size={14} /> Campaign mechanics
      </div>
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
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={m[key]} onChange={(e) => save({ [key]: e.target.checked })} aria-label={label} />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-xs text-dim">{about}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
