/**
 * The app shell's navigation (docs/DESIGN_OVERHAUL.md, section 5): every page the old sidebar linked to still has a
 * home in a workspace or the Library menu, and every route belongs to the right workspace.
 */
import { describe, expect, it } from 'vitest';
import { LIBRARY, WORKSPACES, workspaceFor } from '../client/src/components/navigation';

// The 66 links of the sidebar before the overhaul (v0.3.7), plus the style guide added then.
const OLD =
  `/ /world /atlas /realm/aetheris /realm/kaelmar /realm/ethereal /timeline /browse/cosmology /browse/pantheon /browse/cultures /browse/magic /browse/all /browse/regions /browse/landmarks /browse/npcs /browse/factions /browse/artifacts /browse/creatures /browse/events /mysteries /graph /campaigns /campaign /campaign/adventures /campaign/arcs /campaign/quests /campaign/standing /campaign/faction-web /campaign/return /campaign/treasure /campaign/handouts /campaign/bastions /campaign/sessions /campaign/calendar /campaign/regions /campaign/encounters /campaign/party /campaign/journal /campaign/party-export /dm /tracker /tracker/quick /conditions /npc-ref /names /agendas /rumours /world-events /tables /dice /rules /books /quick-reference /notes /search /publish /import /review /consistency /open-questions /broken /history /documents /backups /style-guide /settings`.split(
    ' ',
  );

const all = [...WORKSPACES.flatMap((w) => w.groups.flatMap((g) => g.items)), ...LIBRARY.items].map((i) => i.to);

describe('navigation', () => {
  it('keeps every old link, once', () => {
    for (const to of OLD) expect(all, to).toContain(to);
    expect(new Set(all).size).toBe(all.length);
  });
  it('has the five workspaces in order', () => {
    expect(WORKSPACES.map((w) => w.label)).toEqual(['Codex', 'Campaign', 'Characters', 'Atlas', 'Live']);
  });
  it.each([
    ['/', 'codex'],
    ['/e/SET-001', 'codex'],
    ['/browse/npcs', 'codex'],
    ['/kaelmar/vaults', 'codex'],
    ['/ethereal/explorer', 'codex'],
    ['/new', 'codex'],
    ['/campaign', 'campaign'],
    ['/campaigns', 'campaign'],
    ['/adventure/4', 'campaign'],
    ['/session/2', 'campaign'],
    ['/campaign/party', 'characters'],
    ['/books', 'characters'],
    ['/atlas', 'atlas'],
    ['/atlas/3', 'atlas'],
    ['/atlas/explore/3', 'atlas'],
    ['/campaign/live', 'live'],
    ['/tracker', 'live'],
    ['/tracker/12', 'live'],
    ['/dm', 'live'],
    ['/settings', 'library'],
    ['/search', 'library'],
    ['/review', 'library'],
  ])('%s belongs to %s', (path, ws) => {
    expect(workspaceFor(path)).toBe(ws);
  });
});
