/**
 * The style guide (docs/DESIGN_OVERHAUL.md, step 1): every design token and the shared pieces, in the current theme,
 * with each text colour's contrast measured live. Use the switch at the top to compare Warm Parchment and Dark Codex.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun, Sword, Shield, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../lib/store';
import {
  ask,
  askText,
  Badge,
  CanonBadge,
  Card,
  Check,
  ConditionChips,
  DataTable,
  Drawer,
  Empty,
  ErrorBox,
  Field,
  GmOnly,
  HpBar,
  HpStepper,
  KeyValue,
  Loading,
  Modal,
  PageHeader,
  RarityTag,
  RealmBadge,
  SaveStatus,
  Segmented,
  Skeleton,
  Tabs,
  toast,
  Toggle,
  TypeBadge,
  VisibilityBadge,
} from '../components/ui';
import { CONDITIONS_2024 } from '@shared/domain';
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

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
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
  const [demo, setDemo] = useState({
    toggle: true,
    check: false,
    pace: 'normal' as 'slow' | 'normal' | 'fast',
    tab: 'record' as 'record' | 'profile' | 'history',
    dialog: false,
    drawer: false,
    combatants: [
      { name: 'Ghost Artillerist', init: 14, ac: 12, hp: 22, max: 22, temp: 0, conditions: [] as string[] },
      { name: 'Forgotten Legionnaire 1', init: 11, ac: 14, hp: 9, max: 16, temp: 0, conditions: ['Prone'] },
      { name: 'Tamsin Vey', init: 9, ac: 16, hp: 3, max: 13, temp: 5, conditions: [] },
    ],
  });
  const setCombatant = (name: string, p: Partial<(typeof demo.combatants)[number]>) => setDemo((d) => ({ ...d, combatants: d.combatants.map((c) => (c.name === name ? { ...c, ...p } : c)) }));

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Style Guide"
        subtitle="The design tokens and shared pieces every page is built from. Compare the two themes with the switch."
        actions={
          <>
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> Warm Parchment</span> },
                { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Dark Codex</span> },
              ]}
            />
            <Toggle checked={!texture} onChange={(v) => toggleTexture(!v)}>
              Reduce texture
            </Toggle>
          </>
        }
      />

      <GuideSection title="Surfaces and lines">
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
      </GuideSection>

      <GuideSection title="Text colours and contrast">
        <p className="text-sm text-dim">Every text colour must reach 4.5:1 (WCAG AA) on every surface. Measured live in this theme.</p>
        <Card flush title="Combatants" aside="Click a header to sort">
          <DataTable
            rowKey={(r) => r.name}
            rows={demo.combatants}
            initialSort={{ key: 'init', dir: 'desc' }}
            columns={[
              {
                key: 'name',
                label: 'Combatant',
                sortable: true,
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    <Sword size={13} className="text-dim" /> {r.name}
                  </span>
                ),
              },
              { key: 'init', label: 'Init', num: true, sortable: true },
              { key: 'ac', label: 'AC', num: true, sortable: true },
              { key: 'hp', label: 'HP', sortValue: (r) => r.hp, headClassName: 'w-40', render: (r) => <HpBar hp={r.hp} max={r.max} temp={r.temp} label /> },
              {
                key: 'act',
                label: 'Damage / heal',
                render: (r) => (
                  <HpStepper
                    onTemp={(n) => setCombatant(r.name, { temp: n })}
                    onDamage={(n) => setCombatant(r.name, { hp: Math.max(0, r.hp - Math.max(0, n - r.temp)), temp: Math.max(0, r.temp - n) })}
                    onHeal={(n) => setCombatant(r.name, { hp: Math.min(r.max, r.hp + n) })}
                  />
                ),
              },
              { key: 'cond', label: 'Conditions', render: (r) => <ConditionChips value={r.conditions} options={CONDITIONS_2024} onChange={(c) => setCombatant(r.name, { conditions: c })} /> },
            ]}
          />
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="At a glance">
            <KeyValue
              items={[
                ['Characters', 4],
                ['Open quests', 3],
                ['Party level', 5],
                ['In-world date', '12 Thawmonth, Year 31 Unbound'],
              ]}
            />
          </Card>
          <Card title="Empty">
            <Empty compact title="No quests yet" action={<button className="btn-primary">Add a quest</button>}>
              Quests the party takes on show here.
            </Empty>
          </Card>
        </div>
        <div className="max-w-xl">
          <StatBlockById id="CRE-029" />
        </div>
      </GuideSection>

      <GuideSection title="Feedback">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card flush>
            <Loading label="Loading the record…" />
          </Card>
          <Card className="space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </Card>
        </div>
        <ErrorBox error="The server didn't answer." onRetry={() => toast('Trying again…')} />
        <Empty title="No campaigns yet" action={<button className="btn-primary">New campaign</button>}>
          A campaign keeps its own sessions, party and state of the world.
        </Empty>
      </GuideSection>

      <GuideSection title="Overlays">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setDemo({ ...demo, dialog: true })}>
            Dialog
          </button>
          <button className="btn" onClick={() => setDemo({ ...demo, drawer: true })}>
            Drawer
          </button>
          <button className="btn" onClick={async () => toast((await ask({ title: 'Delete this quest?', body: 'It goes for good.', danger: true })) ? 'Deleted (not really).' : 'Kept.')}>
            Confirm
          </button>
          <button className="btn" onClick={async () => toast(`You typed: ${(await askText({ title: 'Encounter name', initial: 'Ambush' })) ?? '(cancelled)'}`)}>
            Ask for text
          </button>
          <button className="btn" onClick={() => toast('Saved to the log.', 'ok')}>
            Toast
          </button>
        </div>
        {demo.dialog && (
          <Modal title="A dialog" onClose={() => setDemo({ ...demo, dialog: false })} footer={<button className="btn-primary" onClick={() => setDemo({ ...demo, dialog: false })}>Done</button>}>
            <p className="text-sm">Dialogs sit at the third elevation. Esc or a click outside closes them.</p>
          </Modal>
        )}
        {demo.drawer && (
          <Drawer title="Mara Venn" onClose={() => setDemo({ ...demo, drawer: false })}>
            <p className="text-sm text-dim">The inspector's content opens here on narrow screens.</p>
          </Drawer>
        )}
      </GuideSection>

      <GuideSection title="Lore text">
        <div className="panel-pad prose-lore max-w-3xl">
          <h2>The Corner Table</h2>
          <p>
            The Crooked Nail smells of last night&apos;s smoke and this morning&apos;s bread. Record links look like <a className="wk-ref">Mara Venn</a>; a broken one like{' '}
            <a className="wk-ref-broken">Nobody</a>.
          </p>
          <blockquote>Read-aloud and quotations sit in a gilt margin.</blockquote>
        </div>
      </GuideSection>
    </div>
  );
}
