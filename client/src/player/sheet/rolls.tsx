/**
 * Rolling from the sheet (v0.9.8). Where the sheet can roll (the player's own on the table server, the GM's), its
 * numbers become buttons: a check, a save, a skill, initiative, an attack, its damage. The server rolls, and the whole
 * table sees the result. A sheet that can't roll (the builder's preview, a printed one) shows plain numbers.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Dices } from 'lucide-react';

export { attackDice, d20, damageDice } from './rollDice';

export type RollMode = 'normal' | 'adv' | 'dis';
export interface RollAsk {
  /** What the roll is for: "Stealth", "Longsword attack". */
  label: string;
  /** Dice as written: "1d20+5", "1d8+3". */
  expression: string;
  mode: RollMode;
}
export interface RollShown {
  label: string;
  expression: string;
  mode: RollMode;
  total: number;
  detail: string;
}
export type Roller = (ask: RollAsk) => Promise<RollShown>;

interface RollState {
  roll: (label: string, expression: string, d20: boolean) => void;
  busy: boolean;
  mode: RollMode;
  setMode: (m: RollMode) => void;
  last: RollShown | null;
  err: string | null;
}
const Ctx = createContext<RollState | null>(null);

const MODES: [RollMode, string, string][] = [
  ['normal', 'Normal', 'Roll one d20'],
  ['adv', 'Advantage', 'Roll two d20s and keep the higher'],
  ['dis', 'Disadvantage', 'Roll two d20s and keep the lower'],
];

/** Makes the numbers of the sheet inside it rollable. `RollBar` shows how the next d20 is rolled and the last result. */
export function RollProvider({ onRoll, children }: { onRoll: Roller; children: ReactNode }) {
  const [mode, setMode] = useState<RollMode>('normal');
  const [last, setLast] = useState<RollShown | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roll = (label: string, expression: string, isD20: boolean) => {
    setBusy(true);
    setErr(null);
    void onRoll({ label, expression, mode: isD20 ? mode : 'normal' })
      .then((r) => {
        setLast(r);
        // Advantage is for one roll: the next is an ordinary one again.
        if (isD20) setMode('normal');
      })
      .catch((e: unknown) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  };
  return <Ctx.Provider value={{ roll, busy, mode, setMode, last, err }}>{children}</Ctx.Provider>;
}

/** Under the sheet's header: how the next d20 is rolled, and what the last roll came to. Nothing on a sheet that can't roll. */
export function RollBar() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const { mode, setMode, last, err } = ctx;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-raised/40 px-4 py-2 text-sm" data-testid="roll-bar">
      <span className="flex items-center gap-1.5 text-dim">
        <Dices size={15} className="text-gold" aria-hidden /> <span className="max-sm:sr-only">Tap an underlined number to roll it. The table sees it.</span>
      </span>
      <div className="segmented segmented-sm" role="radiogroup" aria-label="How the next d20 is rolled">
        {MODES.map(([m, label, title]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} title={title} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>
      <output className="ml-auto min-w-0 truncate" aria-live="polite" data-testid="last-roll">
        {err ? (
          <span className="text-danger">{err}</span>
        ) : last ? (
          <>
            <span className="text-dim">{last.label || last.expression}:</span> <b className="num text-lg text-gold">{last.total}</b> <span className="num text-xs text-dim">{last.detail}</span>
          </>
        ) : null}
      </output>
    </div>
  );
}

/**
 * A number on the sheet that can be rolled. `d20` (the default) is a check, save or attack, which Advantage and
 * Disadvantage apply to; damage and the like aren't.
 */
export function Rollable({ label, expression, d20: isD20 = true, className = '', children }: { label: string; expression: string; d20?: boolean; className?: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      // Above a row's own tap target (the proficiency diamond covers its row).
      className={`relative z-10 rounded-sm px-1 underline decoration-gold/60 decoration-dotted underline-offset-4 hover:bg-gold/15 focus-visible:bg-gold/15 disabled:opacity-60 max-sm:min-h-9 max-sm:min-w-9 ${className}`}
      disabled={ctx.busy}
      aria-label={`Roll ${label}`}
      title={`Roll ${label} (${expression})`}
      onClick={(e) => {
        e.stopPropagation();
        ctx.roll(label, expression, isD20);
      }}
    >
      {children}
    </button>
  );
}

/** Whether the sheet around this can roll. */
export const useCanRoll = () => !!useContext(Ctx);
