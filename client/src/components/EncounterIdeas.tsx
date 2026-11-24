/**
 * Encounter ideas from the GM's books: groups of creatures for the party's level and the terrain, within the 2024
 * Dungeon Master's Guide's XP budget, each opening its stat blocks and ready to put in the encounter tracker.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { newCombatant } from '../../../shared/play';
import { CreatureLinks } from './CreatureLinks';
import { Empty } from './ui';

interface Idea {
  label: string;
  creatures: { id: string; name: string; cr: string; xp: number; count: number }[];
  xp: number;
  budget: number;
}

export function EncounterIdeas({ level, terrain, region, campaignId, compact = false }: { level: number; terrain?: string[]; region?: string; campaignId?: number | null; compact?: boolean }) {
  const [difficulty, setDifficulty] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [size, setSize] = useState(4);
  const [res, setRes] = useState<{ budget: number; ideas: Idea[]; terrain: string[] } | null>(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const go = async () => {
    setErr('');
    const q = new URLSearchParams({ level: String(level), size: String(size), difficulty });
    if (region) q.set('region', region);
    else if (terrain?.length) q.set('terrain', terrain.join(','));
    try {
      setRes(await api.get(`/api/books/encounters?${q}`));
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const toTracker = async (idea: Idea) => {
    if (!campaignId) return;
    // A new encounter in the active campaign, with each creature's HP, AC and initiative from its stat block.
    const blocks = await Promise.all(idea.creatures.map((c) => api.get<{ hpAvg?: number; ac?: number; init?: number } | null>(`/api/statblocks/${encodeURIComponent(c.id)}`)));
    const combatants = idea.creatures.flatMap((c, i) =>
      Array.from({ length: c.count }, (_, n) =>
        newCombatant({
          name: c.count > 1 ? `${c.name} ${n + 1}` : c.name,
          statblockId: c.id,
          hp: blocks[i]?.hpAvg ?? 0,
          maxHp: blocks[i]?.hpAvg ?? 0,
          ac: blocks[i]?.ac ?? null,
          initiativeBonus: blocks[i]?.init ?? 0,
        }),
      ),
    );
    const e = await api.post<{ id: number }>('/api/encounters', {
      campaign_id: campaignId,
      title: idea.creatures.map((c) => `${c.count > 1 ? `${c.count} ` : ''}${c.name}`).join(' and '),
      combatants,
    });
    void nav(`/tracker/${e.id}`);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input w-auto py-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label="Difficulty">
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
        </select>
        {!compact && (
          <label className="flex items-center gap-1">
            Party of
            <input type="number" min={1} max={10} className="input w-16 py-1" value={size} onChange={(e) => setSize(Number(e.target.value) || 4)} aria-label="Party size" />
          </label>
        )}
        <button className="btn" onClick={go}>
          <Dices size={14} /> Suggest from your books
        </button>
        {res && (
          <span className="text-xs text-dim">
            Level <span className="num">{level}</span>, budget <span className="num">{res.budget.toLocaleString()}</span> XP{res.terrain.length ? `, ${res.terrain.join(', ')}` : ''}
          </span>
        )}
      </div>
      {err && <p className="text-danger text-sm">{err}</p>}
      {res && !res.ideas.length && (
        <Empty compact title="Nothing in your books fits.">
          Try another difficulty or terrain, or import a monster book.
        </Empty>
      )}
      {res?.ideas.map((idea, i) => (
        <div key={i} className="rounded-sm border border-line p-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{idea.label}</span>
            <span className="text-xs text-dim num">
              {idea.xp.toLocaleString()} XP of {idea.budget.toLocaleString()}
            </span>
            {campaignId && (
              <button className="btn-ghost text-xs ml-auto" onClick={() => toTracker(idea)}>
                <Plus size={12} /> Put in the tracker
              </button>
            )}
          </div>
          <CreatureLinks creatures={idea.creatures.map((c) => ({ id: c.id, name: `${c.name} (CR ${c.cr})`, count: c.count }))} label="Creatures" />
        </div>
      ))}
    </div>
  );
}
