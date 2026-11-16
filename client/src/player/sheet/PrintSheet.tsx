/**
 * The character sheet on paper: two pages laid out like the official D&D 2024 sheet (character, abilities and skills,
 * combat and features on the first; spellcasting, story and gear on the second). Ink on white, for printing; on
 * screen it shows as two sheets of paper.
 */
import type { ReactNode } from 'react';
import { proficiencyBonus } from '@shared/play';
import { ABILITIES, SKILLS, initiative, mod, passive, saveBonus, score, signed, skillBonus, spellAttack, spellSaveDc, type Sheet } from '@shared/sheet';
import { ABILITY_NAMES } from '@shared/rules2024';
import type { SheetChar } from './FullSheet';

const Box = ({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) => (
  <section className={`border border-neutral-500 rounded-md p-1.5 ${className}`}>
    {title && <h3 className="text-center text-[8.5pt] font-bold uppercase tracking-wider border-b border-neutral-400 pb-0.5 mb-1">{title}</h3>}
    {children}
  </section>
);
const Line = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col">
    <span className="border-b border-neutral-400 min-h-[13pt] text-[9.5pt]">{value}</span>
    <span className="text-[6.5pt] uppercase tracking-wide text-neutral-600">{label}</span>
  </div>
);
const Dot = ({ on, double }: { on: boolean; double?: boolean }) => (
  <span
    className={`inline-block h-[7pt] w-[7pt] shrink-0 rounded-full border border-neutral-700 ${on ? 'bg-neutral-800' : ''}`}
    style={double && on ? { boxShadow: '0 0 0 1.5pt white, 0 0 0 2.2pt #333' } : undefined}
  />
);
const Big = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <Box className="text-center">
    <div className="text-[7pt] font-bold uppercase">{label}</div>
    <div className="text-[15pt] leading-tight font-semibold">{value}</div>
    {sub}
  </Box>
);
const para = (t?: string) => (t ? t.split('\n').map((l, i) => <p key={i}>{l}</p>) : null);

export function PrintSheet({ value, portraitUrl }: { value: SheetChar; portraitUrl?: string | null }) {
  const s: Sheet = value.sheet;
  const lvl = value.level;
  const pb = proficiencyBonus(lvl);
  const slots = s.spellSlots ?? {};
  const dc = spellSaveDc(s, lvl);
  const atk = spellAttack(s, lvl);
  const ds = s.deathSaves ?? { successes: 0, failures: 0 };
  const features = [...(s.classFeatures ?? [])];
  return (
    <div className="print-sheet wk-print text-neutral-900 font-sans text-[8.5pt] leading-snug space-y-6 print:space-y-0">
      {/* Page 1 */}
      <div className="print-page bg-white shadow-lg print:shadow-none mx-auto p-[0.35in] space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-stretch">
          <Box className="grid grid-cols-[auto_1fr] gap-2">
            {portraitUrl ? <img src={portraitUrl} alt="" className="h-[0.95in] w-[0.8in] object-cover rounded border border-neutral-400" /> : <span />}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="col-span-2">
                <Line label="Character name" value={<b className="text-[12pt]">{value.name}</b>} />
              </div>
              <Line label="Background" value={s.background} />
              <Line label="Class" value={value.class_name} />
              <Line label="Species" value={value.species} />
              <Line label="Subclass" value={s.subclass} />
            </div>
          </Box>
          <Box className="text-center w-[0.8in]">
            <div className="text-[7pt] font-bold uppercase">Level</div>
            <div className="text-[18pt] font-semibold">{lvl}</div>
            <div className="text-[7pt] uppercase text-neutral-600 border-t border-neutral-400">XP {s.xp ?? 0}</div>
          </Box>
          <Box className="text-center w-[0.8in]">
            <div className="text-[7pt] font-bold uppercase">Armor class</div>
            <div className="text-[18pt] font-semibold">{s.ac ?? 10 + mod(s, 'DEX')}</div>
            <div className="text-[7pt] flex items-center justify-center gap-1">
              <Dot on={!!s.shield} /> Shield
            </div>
          </Box>
          <Box className="grid grid-cols-3 gap-2 w-[2.6in]">
            <div>
              <div className="text-[7pt] font-bold uppercase">Hit points</div>
              <div className="text-[7pt]">Current {s.hp ?? s.maxHp ?? ''}</div>
              <div className="text-[7pt]">Temp {s.tempHp || ''}</div>
              <div className="text-[7pt]">Max {s.maxHp ?? ''}</div>
            </div>
            <div>
              <div className="text-[7pt] font-bold uppercase">Hit dice</div>
              <div className="text-[7pt]">Spent {s.hitDiceSpent ?? 0}</div>
              <div className="text-[7pt]">
                Max {lvl}
                {s.hitDie ?? ''}
              </div>
            </div>
            <div>
              <div className="text-[7pt] font-bold uppercase">Death saves</div>
              <div className="text-[7pt] flex gap-0.5 items-center">
                {[1, 2, 3].map((n) => (
                  <Dot key={n} on={ds.successes >= n} />
                ))}{' '}
                Successes
              </div>
              <div className="text-[7pt] flex gap-0.5 items-center">
                {[1, 2, 3].map((n) => (
                  <Dot key={n} on={ds.failures >= n} />
                ))}{' '}
                Failures
              </div>
            </div>
          </Box>
        </div>

        <div className="grid grid-cols-[2.85in_1fr] gap-2">
          <div className="grid grid-cols-2 gap-2 content-start">
            <Big label="Proficiency bonus" value={`+${pb}`} />
            <Big label="Heroic inspiration" value={<Dot on={!!s.inspiration} />} />
            {ABILITIES.map((a) => (
              <Box key={a} title={ABILITY_NAMES[a]}>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[14pt] font-semibold">{signed(mod(s, a))}</span>
                  <span className="text-[8pt] border border-neutral-400 rounded px-1">{score(s, a)}</span>
                </div>
                <div className="flex items-center gap-1 border-b border-neutral-300 py-0.5 font-semibold">
                  <Dot on={!!s.saves?.includes(a)} /> <span className="w-6 text-right">{signed(saveBonus(s, lvl, a))}</span> Saving throw
                </div>
                {SKILLS.filter((k) => k.ability === a).map((k) => (
                  <div key={k.name} className="flex items-center gap-1">
                    <Dot on={!!s.skills?.includes(k.name)} double={s.expertise?.includes(k.name)} /> <span className="w-6 text-right">{signed(skillBonus(s, lvl, k.name))}</span> {k.name}
                  </div>
                ))}
              </Box>
            ))}
            <Box title="Equipment training and proficiencies" className="col-span-2">
              <div className="flex gap-2 items-center text-[7.5pt]">
                Armor:
                {(['light', 'medium', 'heavy', 'shields'] as const).map((k) => (
                  <span key={k} className="flex items-center gap-0.5">
                    <Dot on={!!s.armorTraining?.[k]} /> {k[0].toUpperCase() + k.slice(1)}
                  </span>
                ))}
              </div>
              <div>
                <b>Weapons:</b> {s.weaponProf}
                {s.masteries?.length ? ` (mastery: ${s.masteries.join(', ')})` : ''}
              </div>
              <div>
                <b>Tools:</b> {s.toolProf}
              </div>
            </Box>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <Big label="Initiative" value={signed(initiative(s))} />
              <Big label="Speed" value={s.speed ?? '30 ft.'} />
              <Big label="Size" value={s.size ?? 'Medium'} />
              <Big label="Passive perception" value={passive(s, lvl, 'Perception')} />
            </div>
            <Box title="Weapons and damage cantrips">
              <table className="w-full text-[8pt]">
                <thead>
                  <tr className="text-left text-[6.5pt] uppercase text-neutral-600">
                    <th>Name</th>
                    <th>Atk bonus / DC</th>
                    <th>Damage and type</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(s.attacks ?? []), ...Array.from({ length: Math.max(0, 5 - (s.attacks?.length ?? 0)) }, () => null)].map((a, i) => (
                    <tr key={i} className="border-b border-neutral-300 h-[13pt]">
                      <td>{a?.name}</td>
                      <td>{a?.bonus}</td>
                      <td>{a?.damage}</td>
                      <td className="text-[7pt]">{a?.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box title="Class features" className="min-h-[3.2in]">
              <div className="columns-2 gap-3 text-[7.5pt] space-y-1">
                {features.map((f, i) => (
                  <p key={i} className="break-inside-avoid">
                    <b>{f.name}</b> <span className="text-neutral-500">({f.source})</span>
                  </p>
                ))}
                {para(s.features)}
              </div>
            </Box>
            <div className="grid grid-cols-2 gap-2">
              <Box title="Species traits" className="min-h-[1.6in] text-[7.5pt]">
                {(s.speciesTraits ?? []).map((f, i) => (
                  <p key={i}>
                    <b>{f.name}.</b> {f.text.split('\n')[0].slice(0, 140)}
                    {f.text.length > 140 ? '…' : ''}
                  </p>
                ))}
                {para(s.traits)}
              </Box>
              <Box title="Feats" className="min-h-[1.6in] text-[7.5pt]">
                {(s.featList ?? []).map((f, i) => (
                  <p key={i}>
                    <b>{f.name}</b>
                  </p>
                ))}
                {para(s.feats)}
              </Box>
            </div>
          </div>
        </div>
      </div>

      {/* Page 2 */}
      <div className="print-page bg-white shadow-lg print:shadow-none mx-auto p-[0.35in] space-y-2">
        <div className="grid grid-cols-[1fr_2.4in] gap-2">
          <div className="space-y-2">
            <div className="grid grid-cols-[1.6in_1fr] gap-2">
              <Box>
                <Line label="Spellcasting ability" value={s.spellAbility ? ABILITY_NAMES[s.spellAbility as keyof typeof ABILITY_NAMES] : ''} />
                <div className="grid grid-cols-[1fr_auto] text-[8pt] mt-1">
                  <span>Spellcasting modifier</span>
                  <b>{s.spellAbility ? signed(mod(s, s.spellAbility as (typeof ABILITIES)[number])) : ''}</b>
                  <span>Spell save DC</span>
                  <b>{dc ?? ''}</b>
                  <span>Spell attack bonus</span>
                  <b>{atk === null ? '' : signed(atk)}</b>
                </div>
              </Box>
              <Box title="Spell slots">
                <div className="grid grid-cols-3 gap-x-3 text-[7.5pt]">
                  {Array.from({ length: 9 }, (_, i) => String(i + 1)).map((l) => (
                    <div key={l} className="flex items-center gap-1">
                      <span className="w-11 whitespace-nowrap">Level {l}</span>
                      <span className="w-4 text-center border-b border-neutral-400">{slots[l]?.max || ''}</span>
                      {Array.from({ length: slots[l]?.max ?? 0 }, (_, j) => (
                        <Dot key={j} on={j < (slots[l]?.used ?? 0)} />
                      ))}
                    </div>
                  ))}
                </div>
              </Box>
            </div>
            <Box title="Cantrips and prepared spells" className="min-h-[7.4in]">
              <table className="w-full text-[7.5pt]">
                <thead>
                  <tr className="text-left text-[6.5pt] uppercase text-neutral-600">
                    <th className="w-8">Level</th>
                    <th>Name</th>
                    <th>Casting time</th>
                    <th>Range</th>
                    <th>C R M</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...[...(s.spells ?? [])].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), ...Array.from({ length: Math.max(0, 28 - (s.spells?.length ?? 0)) }, () => null)].map(
                    (sp, i) => (
                      <tr key={i} className="border-b border-neutral-300 h-[12.5pt]">
                        <td>{sp ? (sp.level === 0 ? 'C' : sp.level) : ''}</td>
                        <td>{sp?.name}</td>
                        <td>{sp?.time}</td>
                        <td>{sp?.range}</td>
                        <td className="whitespace-nowrap">
                          {sp && (
                            <span className="inline-flex gap-0.5">
                              <Dot on={!!sp.concentration} />
                              <Dot on={!!sp.ritual} />
                              <Dot on={!!sp.material} />
                            </span>
                          )}
                        </td>
                        <td>{sp?.notes}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </Box>
          </div>
          <div className="space-y-2">
            <Box title="Appearance" className="min-h-[1.1in]">
              {para(s.appearance)}
            </Box>
            <Box title="Backstory and personality" className="min-h-[2.4in]">
              {para(s.personality)}
              {para(s.backstory)}
              <div className="mt-2">
                <Line label="Alignment" value={s.alignment} />
              </div>
            </Box>
            <Box title="Languages" className="min-h-[0.6in]">
              {s.languages}
            </Box>
            <Box title="Equipment" className="min-h-[2.2in]">
              {para(s.equipment)}
              <div className="mt-2 text-[7pt] font-semibold uppercase">Magic item attunement</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-1 border-b border-neutral-300 h-[12pt]">
                  <Dot on={!!s.attunement?.[i]} /> {s.attunement?.[i]}
                </div>
              ))}
            </Box>
            <Box title="Coins">
              <div className="grid grid-cols-5 text-center">
                {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((c) => (
                  <div key={c}>
                    <div className="text-[6.5pt] uppercase text-neutral-600">{c}</div>
                    <div className="border border-neutral-400 rounded mx-0.5 min-h-[14pt]">{s.coins?.[c] ?? ''}</div>
                  </div>
                ))}
              </div>
            </Box>
          </div>
        </div>
        <p className="text-[6pt] text-neutral-500">
          This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under
          the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
        </p>
      </div>
    </div>
  );
}
