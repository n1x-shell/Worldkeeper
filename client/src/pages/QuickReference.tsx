import { Link } from 'react-router-dom';
import { useMechanics } from '../lib/mechanics';
import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Empty, PageHeader } from '../components/ui';

/**
 * GM QUICK REFERENCE: the world's own rules on one printable sheet. Everything here restates approved records
 * (Thinning and Unmaking, anchors, Shardscarred, Elder Gods at the Table, faction standing, travel and the crossing).
 */
const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="panel p-4 space-y-2 break-inside-avoid">
    <h2 className="font-display text-lg text-gold">{title}</h2>
    <div className="text-sm space-y-1.5">{children}</div>
  </section>
);
const Table = ({ head, rows }: { head: string[]; rows: string[][] }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-dim">
        {head.map((h) => (
          <th key={h} className="py-1 pr-3 font-normal">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-line">
      {rows.map((r) => (
        <tr key={r[0]}>
          {r.map((c, i) => (
            <td key={i} className="py-1 pr-3 align-top">
              {c}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export function QuickReferencePage() {
  const mech = useMechanics();
  if (mech && !mech.setting)
    return (
      <Empty title="The setting's pages are switched off">
        This quick reference is for the Worldkeeper setting. Switch its pages on in <Link to="/settings">Settings, Campaign mechanics</Link>.
      </Empty>
    );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Quick Reference"
        subtitle="The world's own rules, on one sheet for the table."
        actions={
          <button className="btn" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
        }
      />
      <div className="wk-print wk-quickref grid gap-4 md:grid-cols-2">
        <Block title="Thinning">
          <p>
            <b>When.</b> Opening a glass door, riding a root-road, communing too deeply with the Bloom, trading with a memory-house.
          </p>
          <p>
            <b>Save.</b> Charisma, DC 12 + current Thinning (track 0 to 6). Fail: Thinning +1, and strike one named memory for good.
          </p>
          <p>
            <b>At 3</b> they stop answering to their name without effort. <b>At 6</b> they join the harmony, and become the GM&apos;s.
          </p>
          <p>
            <b>Names.</b> Hearing their true name from someone who knows it: Advantage. A month among people who use it: Thinning -1. Lost memories never return.
          </p>
          <p>
            <b>Anchors.</b> Someone who knows the traveller&apos;s true name makes the save for them, same DC. Fail: the anchor takes the Thinning. Once a day per person.
          </p>
          <p>
            <b>The keeping song.</b> Sung at Ashvale&apos;s stones by someone who has slept in Ashvale: Advantage on a Thinning save, once a day.
          </p>
        </Block>
        <Block title="Unmaking and the deep realm">
          <p>Death in the deep Ethereal Realm sets Thinning to 6 at once. No spell, relic or wish brings them back, and the world forgets them.</p>
          <p>Death saving throws work as usual until then. When someone is Unmade, each companion writes one true sentence about them.</p>
          <p>
            <b>Shardscarred.</b> Advantage on saves against effects that alter memory or rewrite reality.
          </p>
        </Block>
        <Block title="Elder gods and the Return">
          <p>A god can&apos;t be harmed, only stopped. Its Laws of Existence work as far as its reach.</p>
          <Table
            head={['Reach', 'Return stage', 'Where its Laws work', 'Save DC']}
            rows={[
              ['Dreaming', '1 to 2', 'Its own depth, faintly', '15'],
              ['Stirring', '3 to 5', 'Its depth, the Verge, the Rift, seeps of glass', '18'],
              ['Present', '6 to 7', 'Within a day of any thin place', '21'],
            ]}
          />
          <p>
            <b>The Unseen Gaze.</b> Looking at a true god: Wisdom save. Fail: a long-term madness, and Stunned until the end of the next turn.
          </p>
          <p>
            <b>Eclipse-rites</b> need a shard or fragment, a thin place, and a teacher&apos;s true name under open sky. Success moves the Return one stage. Forming any Orb jumps it to stage 6.
          </p>
          <p>Defeating a manifestation moves its god down one step for a year and a day.</p>
        </Block>
        <Block title="Faction standing">
          <Table
            head={['Rank', 'Renown']}
            rows={[
              ['Hostile', '-10 or less'],
              ['Distrusted', '-3 to -9'],
              ['Neutral', '-2 to 2'],
              ['Initiate', '3 to 9'],
              ['Trusted', '10 to 24'],
              ['Exalted', '25 to 49'],
              ['Champion', '50 or more'],
            ]}
          />
          <p>+1 small favour, +2 real service, +3 to +5 changes its fortunes. The same in reverse for working against it. Helping one great faction by harming another moves both.</p>
        </Block>
        <Block title="Travel and the crossing">
          <p>
            <b>Aetheris.</b> About 24 miles a day on roads. Hollow Refuge to a dominion&apos;s border: about a week; to its capital, another week.
          </p>
          <p>
            <b>The Black Tides.</b> About 700 miles, two weeks, every lantern out over the trench. Passage 70 gp; smugglers double. The Pact&apos;s dark toll: one coin in ten, at Tollrock.
          </p>
          <p>
            <b>The Ethereal Realm.</b> Verge legs 1d4 days (with a guide, lower of two rolls; without, +1 day). Through the Rift: 2d6 days. Deep realm: 1d6 days, 1d3 with a shared purpose said aloud
            each morning, +1d6 if they quarrel. Root-roads: minutes, and a Thinning save. The Black Horizon can&apos;t be reached by travel.
          </p>
        </Block>
        <Block title="Difficulty">
          <Table
            head={['Task', 'DC']}
            rows={[
              ['Very easy', '5'],
              ['Easy', '10'],
              ['Medium', '15'],
              ['Hard', '20'],
              ['Very hard', '25'],
              ['Nearly impossible', '30'],
            ]}
          />
          <p>The Hollow Marches&apos; sites use DC 12 for scene checks, as the books set.</p>
        </Block>
      </div>
    </div>
  );
}
