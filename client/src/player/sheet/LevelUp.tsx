/**
 * Taking a level on the sheet (v0.9.6). When the GM has raised a character's level past what the sheet has taken in,
 * a banner offers the level: its hit points, features, subclass, ability scores or feat, and the new numbers. The
 * player (or the GM) chooses, and the sheet is filled in; everything stays editable afterwards.
 */
import { useMemo, useState } from 'react';
import { ArrowUpCircle, Dices } from 'lucide-react';
import { ABILITIES, type Ability, type SheetChar } from '@shared/sheet';
import { ABILITY_NAMES } from '@shared/rules2024';
import { pendingLevels } from '@shared/progression';
import { Modal } from '../../components/ui/overlays';
import { loadRulesText, useLoaded } from './options';
import { gainSummary, levelGain, takeLevel } from './levelUp';

export function LevelUpBanner({ value, onChange, speciesRules }: { value: SheetChar; onChange: (v: SheetChar) => void; speciesRules: string | null }) {
  const pending = pendingLevels(value.level, value.sheet.builtLevel);
  const [open, setOpen] = useState(false);
  if (!pending.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gold/40 bg-gold/10 px-4 py-2 text-sm" role="status" data-testid="level-up-banner">
      <ArrowUpCircle size={16} className="text-gold" aria-hidden />
      <span>
        <b>Level {pending[0]}</b> is waiting{pending.length > 1 ? ` (and ${pending.length - 1} more)` : ''}: see what it gives and take it.
      </span>
      <button className="btn-primary ml-auto max-sm:min-h-10" onClick={() => setOpen(true)}>
        Level up
      </button>
      {open && <LevelUpDialog value={value} level={pending[0]} speciesRules={speciesRules} onChange={onChange} onClose={() => setOpen(false)} last={pending.length === 1} />}
    </div>
  );
}

function LevelUpDialog({
  value,
  level,
  speciesRules,
  onChange,
  onClose,
  last,
}: {
  value: SheetChar;
  level: number;
  speciesRules: string | null;
  onChange: (v: SheetChar) => void;
  onClose: () => void;
  last: boolean;
}) {
  const rules = useLoaded(loadRulesText);
  // The character as it was at the level below: the sheet hasn't taken this level in yet.
  const before = useMemo(() => ({ ...value, level: level - 1 }), [value, level]);
  const gain = useMemo(() => levelGain(before, level, rules, speciesRules), [before, level, rules, speciesRules]);
  const [hpMode, setHpMode] = useState<'fixed' | 'roll'>('fixed');
  const [die, setDie] = useState('');
  const [subclass, setSubclass] = useState('');
  const [improve, setImprove] = useState<'abilities' | 'feat'>('abilities');
  const [picks, setPicks] = useState<(Ability | '')[]>(['', '']);
  const [feat, setFeat] = useState('');
  const rolled = Number(die);
  const hp = hpMode === 'fixed' ? gain.hpAverage : Math.max(1, (rolled || 0) + gain.conMod) + gain.hpExtra;
  const missing =
    (hpMode === 'roll' && !(rolled >= 1 && rolled <= gain.hitDie) && `Roll the d${gain.hitDie} for hit points, or take the fixed value.`) ||
    (gain.subclasses && !subclass && 'Choose a subclass.') ||
    (gain.improvement === 'asi' && improve === 'abilities' && picks.some((p) => !p) && 'Choose the ability scores to raise.') ||
    (gain.improvement && (improve === 'feat' || gain.improvement === 'boon') && !feat && gain.feats.length > 0 && (gain.improvement === 'boon' ? 'Choose an Epic Boon.' : 'Choose a feat.')) ||
    null;
  const featChosen = gain.improvement === 'boon' || improve === 'feat';

  const take = () => {
    const sheet = takeLevel(before, gain, { hp, subclass: subclass || undefined, ...(gain.improvement ? (featChosen ? { feat: feat || undefined } : { abilities: picks }) : {}) }, rules, speciesRules);
    onChange({ ...value, sheet });
    setDie('');
    setSubclass('');
    setPicks(['', '']);
    setFeat('');
    if (last) onClose();
  };
  const byHand = () => {
    onChange({ ...value, sheet: { ...value.sheet, builtLevel: level } });
    if (last) onClose();
  };

  return (
    <Modal
      title={`${value.name || 'Your character'}: level ${level}${value.class_name ? ` ${value.class_name}` : ''}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost mr-auto text-xs" onClick={byHand} title="Nothing on the sheet is changed: you fill in the level yourself">
            I’ll do it by hand
          </button>
          <button className="btn" onClick={onClose}>
            Not now
          </button>
          <button className="btn-primary" disabled={!!missing || !rules} title={missing || undefined} onClick={take}>
            Take level {level}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm" data-testid="level-up">
        {!gain.known && <p className="rounded-sm border border-line p-2 text-dim">Your rules don’t have the {value.class_name || 'class'} class, so only hit points can be worked out here. Add its features on the Features tab.</p>}

        <section className="space-y-2">
          <h3 className="label">Hit points</h3>
          <label className="flex items-center gap-2">
            <input type="radio" name="hp" checked={hpMode === 'fixed'} onChange={() => setHpMode('fixed')} />
            <span>
              The fixed value: <b className="num">+{gain.hpAverage}</b>{' '}
              <span className="text-dim">
                ({gain.hitDie / 2 + 1} for the d{gain.hitDie}, {gain.conMod >= 0 ? '+' : '−'} {Math.abs(gain.conMod)} Constitution{gain.hpExtra ? `, + ${gain.hpExtra}` : ''})
              </span>
            </span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="hp" checked={hpMode === 'roll'} onChange={() => setHpMode('roll')} />
            <span>Roll the d{gain.hitDie}:</span>
            <input
              className="input num w-16 py-1"
              inputMode="numeric"
              value={die}
              aria-label={`What the d${gain.hitDie} rolled`}
              onFocus={() => setHpMode('roll')}
              onChange={(e) => setDie(e.target.value.replace(/\D/g, ''))}
              placeholder={`1–${gain.hitDie}`}
            />
            <button type="button" className="btn text-xs" onClick={() => (setHpMode('roll'), setDie(String(1 + Math.floor(Math.random() * gain.hitDie))))}>
              <Dices size={13} /> Roll it here
            </button>
            {hpMode === 'roll' && rolled >= 1 && (
              <span>
                <b className="num">+{hp}</b> <span className="text-dim">with Constitution</span>
              </span>
            )}
          </label>
        </section>

        {gain.subclasses && (
          <section className="space-y-1">
            <h3 className="label">Subclass</h3>
            <select className="input" value={subclass} onChange={(e) => setSubclass(e.target.value)} aria-label="Subclass">
              <option value="">Choose…</option>
              {gain.subclasses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </section>
        )}

        {gain.improvement && (
          <section className="space-y-2">
            <h3 className="label">{gain.improvement === 'boon' ? 'Epic Boon' : 'Ability Score Improvement'}</h3>
            {gain.improvement === 'asi' && (
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="imp" checked={improve === 'abilities'} onChange={() => setImprove('abilities')} /> Raise ability scores
                </label>
                {gain.feats.length > 0 && (
                  <label className="flex items-center gap-2">
                    <input type="radio" name="imp" checked={improve === 'feat'} onChange={() => setImprove('feat')} /> Take a feat
                  </label>
                )}
              </div>
            )}
            {!featChosen ? (
              <div className="flex flex-wrap items-center gap-2">
                {[0, 1].map((i) => (
                  <select key={i} className="input w-44" value={picks[i]} aria-label={i ? 'Second +1' : 'First +1'} onChange={(e) => setPicks(picks.map((p, j) => (j === i ? (e.target.value as Ability | '') : p)))}>
                    <option value="">+1 to…</option>
                    {ABILITIES.map((a) => (
                      <option key={a} value={a} disabled={(before.sheet.abilities?.[a] ?? 10) + (picks[1 - i] === a ? 1 : 0) >= 20}>
                        {ABILITY_NAMES[a]} ({before.sheet.abilities?.[a] ?? 10})
                      </option>
                    ))}
                  </select>
                ))}
                <span className="text-xs text-dim">The same one twice for +2. No score goes above 20.</span>
              </div>
            ) : (
              <>
                <select className="input" value={feat} onChange={(e) => setFeat(e.target.value)} aria-label={gain.improvement === 'boon' ? 'Epic Boon' : 'Feat'}>
                  <option value="">Choose…</option>
                  {gain.feats.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <p className="text-xs text-dim">The feat goes on the Features tab with its text. If it raises an ability score, raise that on the Abilities tab.</p>
              </>
            )}
          </section>
        )}

        {gain.features.length > 0 && (
          <section className="space-y-1">
            <h3 className="label">New features</h3>
            {gain.features.map((f) => (
              <details key={`${f.source}:${f.name}`} className="rounded-sm border border-line/70 px-2 py-1">
                <summary className="cursor-pointer">
                  <b>{f.name}</b> <span className="text-xs text-dim">{f.source}</span>
                </summary>
                <p className="mt-1 whitespace-pre-line">{f.text}</p>
              </details>
            ))}
            {gain.subclasses && <p className="text-xs text-dim">Your subclass’s features are added when you take the level.</p>}
          </section>
        )}

        {gainSummary(gain).length > 0 && (
          <section className="space-y-1">
            <h3 className="label">Also at this level</h3>
            <ul className="list-disc pl-5">
              {gainSummary(gain).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
