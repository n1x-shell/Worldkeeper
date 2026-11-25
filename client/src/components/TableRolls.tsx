/**
 * The table's roll log for the GM (v0.9.8): everyone's rolls as they happen, and the GM's own dice. The GM's rolls
 * are behind the screen unless they say otherwise, and one made behind it can be shown to the table afterwards.
 */
import { useEffect, useState } from 'react';
import { Dice5, Eye, EyeOff, Trash2 } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { onServerChange } from '../player/changes';
import { Check, ask } from './ui';

interface Roll {
  id: number;
  who: string;
  character_id: number | null;
  label: string;
  expression: string;
  mode: 'normal' | 'adv' | 'dis';
  total: number;
  detail: string;
  hidden: boolean;
  created_at: string;
}

const QUICK = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', '4d6kh3'];

export function TableRolls({ campaignId, compact = false }: { campaignId: number; compact?: boolean }) {
  const { data, reload, setData } = useApi<Roll[]>(`/api/campaigns/${campaignId}/rolls`);
  const [expr, setExpr] = useState('1d20');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<Roll['mode']>('normal');
  const [hidden, setHidden] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Players' rolls arrive as they are made.
  useEffect(() => onServerChange('/api/events', () => void reload()), [reload]);
  const roll = async (expression: string) => {
    try {
      const r = await api.post<Roll>(`/api/campaigns/${campaignId}/rolls`, { expression, label, mode: /d20\b/i.test(expression) ? mode : 'normal', hidden });
      setData([r, ...(data ?? [])]);
      setMode('normal');
      setErr(null);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const show = async (r: Roll, nowHidden: boolean) => {
    const next = await api.patch<Roll>(`/api/campaigns/${campaignId}/rolls/${r.id}`, { hidden: nowHidden });
    setData((data ?? []).map((x) => (x.id === r.id ? next : x)));
  };
  return (
    <div className="space-y-2" data-testid="table-rolls">
      <div className="flex gap-2">
        <input className="input font-mono w-32 shrink-0" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void roll(expr)} aria-label="Dice expression" />
        <input className="input min-w-0" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void roll(expr)} placeholder="What for (optional)" aria-label="What the roll is for" />
        <button className="btn-primary shrink-0" onClick={() => void roll(expr)}>
          <Dice5 size={14} /> Roll
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {QUICK.map((d) => (
          <button key={d} className="btn px-2 py-0.5 text-xs" onClick={() => void roll(d)}>
            {d}
          </button>
        ))}
        <div className="segmented segmented-sm ml-1" role="radiogroup" aria-label="How the next d20 is rolled">
          {(
            [
              ['normal', 'Normal'],
              ['adv', 'Adv'],
              ['dis', 'Dis'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Check checked={hidden} onChange={setHidden} label="Roll behind the screen">
          <span className="text-sm">Behind the screen</span>
        </Check>
        <span className="text-xs text-dim">{hidden ? 'Your rolls are yours alone until you show one.' : 'The table sees your rolls.'}</span>
        {!!data?.length && (
          <button
            className="btn-ghost ml-auto text-xs"
            onClick={async () => {
              if (!(await ask({ body: 'Clear the table’s roll log? Players’ screens lose it too.', confirmLabel: 'Clear', danger: true }))) return;
              await api.del(`/api/campaigns/${campaignId}/rolls`);
              setData([]);
            }}
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      {err && <div className="text-xs text-danger">{err}</div>}
      <ul className={`space-y-1 ${compact ? 'max-h-56' : 'max-h-[55vh]'} overflow-auto`} aria-label="The table’s rolls" aria-live="polite">
        {(data ?? []).map((r, i) => (
          <li key={r.id} className={`flex items-baseline gap-2 ${i === 0 ? 'text-ink' : 'text-dim'}`}>
            <span className={`num w-9 shrink-0 text-right font-display ${i === 0 ? 'text-2xl text-gold' : 'text-base'}`}>{r.total}</span>
            <span className="min-w-0 flex-1 text-sm">
              <b className="font-medium text-ink/90">{r.who}</b>
              {r.label && <> · {r.label}</>} <span className="font-mono text-xs">{r.detail}</span>
            </span>
            {r.character_id == null &&
              (r.hidden ? (
                <button className="btn-ghost shrink-0 text-xs" onClick={() => void show(r, false)} title="Only you see this roll. Show it to the table.">
                  <EyeOff size={12} /> Show the table
                </button>
              ) : (
                <button className="btn-ghost shrink-0 text-xs" onClick={() => void show(r, true)} title="The table sees this roll. Take it back behind the screen.">
                  <Eye size={12} /> Shown
                </button>
              ))}
          </li>
        ))}
        {data && !data.length && <li className="text-sm text-dim">No rolls yet. Players roll from their sheets; yours are made here.</li>}
      </ul>
    </div>
  );
}
