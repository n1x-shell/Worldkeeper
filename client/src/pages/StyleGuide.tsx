/**
 * The style guide (docs/DESIGN_OVERHAUL.md, step 1): every design token and the shared pieces, in the current theme,
 * with each text colour's contrast measured live. Use the switch at the top to compare Warm Parchment and Dark Codex.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun, Sword, Shield, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../lib/store';
import { CanonBadge, Field, PageHeader, RealmBadge, TypeBadge, VisibilityBadge } from '../components/ui';
import { StatBlockById } from '../components/StatBlock';

const SURFACES = ['bg', 'panel', 'raised'] as const;
const TEXT = ['ink', 'dim', 'gold', 'arcane', 'danger', 'ok', 'warn'] as const;
// Full class names, so the stylesheet build keeps them.
const RARITY = [
  ['rarity-common', 'Common'],
  ['rarity-uncommon', 'Uncommon'],
  ['rarity-rare', 'Rare'],
  ['rarity-very-rare', 'Very rare'],
  ['rarity-legendary', 'Legendary'],
  ['rarity-artifact', 'Artifact'],
] as const;
const ELEVATION = [
  ['elev-1', 'Elevation 1', 'Panels and cards'],
  ['elev-2', 'Elevation 2', 'Hover cards, menus'],
  ['elev-3', 'Elevation 3', 'Drawers, dialogs'],
] as const;
const ROLE: Record<string, string> = {
  bg: 'Page',
  panel: 'Cards and bars',
  raised: 'Inputs and hovers',
  line: 'Hairlines and dividers',
  edge: 'Control borders (3:1)',
  ink: 'Text',
  dim: 'Secondary text',
  gold: 'Accent, focus',
  arcane: 'Record links',
  danger: 'Danger, GM only',
  ok: 'Success',
  warn: 'Warning',
};

const rgb = (name: string): [number, number, number] => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).map(Number);
  return [v[0] || 0, v[1] || 0, v[2] || 0];
};
const lum = ([r, g, b]: number[]) => {
  const c = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="title-rule text-lg">{title}</h2>
      {children}
    </section>
  );
}

export function StyleGuidePage() {
  const { theme, setTheme } = useAppState();
  // Re-measure after the theme changes (the variables come from the stylesheet).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTick((n) => n + 1), 30);
    return () => clearTimeout(t);
  }, [theme]);
  const [texture, setTexture] = useState(() => {
    try {
      return localStorage.getItem('wk.texture') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleTexture = (on: boolean) => {
    setTexture(on);
    try {
      localStorage.setItem('wk.texture', on ? 'on' : 'off');
    } catch {
      /* preference only */
    }
    document.documentElement.classList.toggle('no-texture', !on);
  };
  void tick;

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Style Guide"
        subtitle="The design tokens and shared pieces every page is built from. Compare the two themes with the switch."
        actions={
          <>
            <div className="inline-flex rounded-md border border-line overflow-hidden" role="radiogroup" aria-label="Theme">
              {(
                [
                  ['light', 'Warm Parchment', <Sun key="s" size={14} />],
                  ['dark', 'Dark Codex', <Moon key="m" size={14} />],
                ] as const
              ).map(([t, label, icon]) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={theme === t}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm ${theme === t ? 'bg-gold/15 text-gold' : 'text-dim hover:text-ink'}`}
                  onClick={() => setTheme(t)}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-dim">
              <input type="checkbox" checked={!texture} onChange={(e) => toggleTexture(!e.target.checked)} /> Reduce texture
            </label>
          </>
        }
      />

      <Section title="Surfaces and lines">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[...SURFACES, 'line', 'edge'].map((t) => (
            <div key={t} className="panel overflow-hidden">
              <div className="h-14 border-b border-line" style={{ background: `rgb(var(--${t}))` }} />
              <div className="p-2 text-xs">
                <div className="font-medium text-ink">{t}</div>
                <div className="text-dim">{ROLE[t]}</div>
                {t === 'edge' && <div className="text-dim num">{SURFACES.map((s) => `${ratio(rgb('edge'), rgb(s)).toFixed(1)}:1 on ${s}`).join(' · ')}</div>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Text colours and contrast">
        <p className="text-sm text-dim">Every text colour must reach 4.5:1 (WCAG AA) on every surface. Measured live in this theme.</p>
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Use</th>
                {SURFACES.map((s) => (
                  <th key={s}>On {s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEXT.map((t) => (
                <tr key={t}>
                  <td>
                    <span className="font-medium" style={{ color: `rgb(var(--${t}))` }}>
                      {t}
                    </span>
                  </td>
                  <td className="text-dim">{ROLE[t]}</td>
                  {SURFACES.map((s) => {
                    const r = ratio(rgb(t), rgb(s));
                    return (
                      <td key={s} style={{ background: `rgb(var(--${s}))` }}>
                        <span className="num" style={{ color: `rgb(var(--${t}))` }}>
                          {r.toFixed(2)}:1
                        </span>{' '}
                        <span className={`text-xs ${r >= 4.5 ? 'text-ok' : 'text-danger'}`}>{r >= 4.5 ? 'AA' : 'fails'}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          {RARITY.map(([k, label]) => (
            <span key={k} className={`tag ${k}`}>
              {label}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="panel-pad space-y-3">
          <p className="font-display text-4xl text-ink">Display 36 · Cinzel</p>
          <p className="font-display text-[28px] text-ink">Page title 28</p>
          <p className="font-display text-[22px] text-ink">Section 22</p>
          <p className="font-serif text-lg">Lore 18 · EB Garamond, for the archive&apos;s words: &ldquo;The doors were barred all night.&rdquo;</p>
          <p className="font-serif text-base">Lore 16 · the base size for record text and handouts.</p>
          <p className="text-sm">UI 14 · the base size for controls, lists and labels.</p>
          <p className="text-ui">UI 13 · dense rows and secondary controls.</p>
          <p className="text-xs text-dim">Small 12 · captions and hints.</p>
          <p className="text-sm">
            Numbers line up with <code className="num">.num</code>: <span className="num">AC 11 · HP 22 · DC 14 · +4 · 1,250 gp</span>
          </p>
        </div>
      </Section>

      <Section title="Spacing, corners and elevation">
        <div className="flex flex-wrap items-end gap-3">
          {[4, 8, 12, 16, 24, 32, 48].map((n) => (
            <div key={n} className="text-center text-xs text-dim">
              <div className="bg-gold/40" style={{ width: n, height: n }} />
              <div className="num mt-1">{n}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {ELEVATION.map(([cls, label, use]) => (
            <div key={cls} className={`panel p-4 ${cls} text-sm`}>
              <div className="font-medium">{label}</div>
              <div className="text-dim">{use}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ornament">
        <p className="text-sm text-dim">
          A little more than minimal: gilt rules and title bands, corner marks on featured cards, and an illuminated first letter on record titles. Never inside tables, stat blocks, trackers or forms.
        </p>
        <div className="title-band gilt-corners">
          <div className="text-xs uppercase tracking-wider text-dim">Settlement · Aetheris</div>
          <h1 className="illuminated text-3xl text-ink mt-3">Hollow Refuge</h1>
          <p className="font-serif text-base text-dim mt-2">A walled town at the edge of the Hollow Marches, neutral ground for five factions.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-4 gilt-corners elev-1">
            <div className="title-rule text-base">Featured card</div>
            <p className="text-sm text-dim mt-2">Corner marks frame featured cards only: record headers, the dashboard, session prep.</p>
          </div>
          <div className="gm-only text-sm">
            <div className="text-xs uppercase tracking-wider text-danger mb-1">GM only</div>
            The dead man is Lemmy Carrow, one end of a loose thread. GM-only material looks the same on every page.
          </div>
        </div>
      </Section>

      <Section title="Controls">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary">
            <Plus size={14} /> Primary
          </button>
          <button className="btn">
            <Shield size={14} /> Secondary
          </button>
          <button className="btn-ghost">Ghost</button>
          <button className="btn-danger">
            <Trash2 size={14} /> Danger
          </button>
          <button className="btn" disabled>
            Disabled
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" hint="Hints sit under the field.">
            <input className="input" placeholder="Mara Venn" />
          </Field>
          <Field label="Status">
            <select className="input" defaultValue="pc">
              <option>pc</option>
              <option>companion</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea className="input min-h-[38px]" placeholder="Anything worth remembering" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type="npc" />
          <RealmBadge realm="aetheris" />
          <RealmBadge realm="kaelmar" />
          <RealmBadge realm="ethereal" />
          <RealmBadge realm="world" />
          <CanonBadge status="CANON" />
          <CanonBadge status="RUMOR" />
          <CanonBadge status="BELIEF" />
          <CanonBadge status="SECRET" />
          <CanonBadge status="HOMEBREW" />
          <VisibilityBadge revealed />
          <VisibilityBadge revealed={false} />
          <span className="chip border-line text-dim">chip</span>
        </div>
      </Section>

      <Section title="Data">
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Combatant</th>
                <th className="text-right">Init</th>
                <th className="text-right">AC</th>
                <th className="text-right">HP</th>
                <th>Conditions</th>
              </tr>
            </thead>
            <tbody className="num">
              {[
                ['Ghost Artillerist', 14, 12, '22/22', ''],
                ['Forgotten Legionnaire 1', 11, 14, '9/16', 'Prone'],
                ['Tamsin Vey', 9, 16, '12/13', ''],
              ].map(([n, i, ac, hp, c]) => (
                <tr key={n as string}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <Sword size={13} className="text-dim" /> {n}
                    </span>
                  </td>
                  <td className="text-right">{i}</td>
                  <td className="text-right">{ac}</td>
                  <td className="text-right">{hp}</td>
                  <td>{c && <span className="tag border-warn/50 text-warn">{c}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="max-w-xl">
          <StatBlockById id="CRE-029" />
        </div>
      </Section>

      <Section title="Lore text">
        <div className="panel-pad prose-lore max-w-3xl">
          <h2>The Corner Table</h2>
          <p>
            The Crooked Nail smells of last night&apos;s smoke and this morning&apos;s bread. Record links look like <a className="wk-ref">Mara Venn</a>; a broken one like{' '}
            <a className="wk-ref-broken">Nobody</a>.
          </p>
          <blockquote>Read-aloud and quotations sit in a gilt margin.</blockquote>
        </div>
      </Section>
    </div>
  );
}
