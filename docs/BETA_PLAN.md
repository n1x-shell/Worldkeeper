# The road to 1.0-BETA

Status: **draft for the owner's decisions**, November 2026 (after v0.9.2). Nothing here is agreed yet.

## 1. What "beta" should mean

A GM who has never seen this repository can install the app, build a world or add one, run a campaign in it for months, and trust their data across every update. Up to now the releases have promised features; a beta promises that.

Measured against that, the app is **feature-rich and trust-poor**: it does more than most tools of its kind, but the things that let a stranger rely on it (safe upgrades, signed installers, help, bug reports, tests on the installed app) are thin.

## 2. What is there (audited at v0.9.2)

About 58,000 lines of TypeScript, 39 GM pages, 410 tests, a first-run check in CI.

- **World:** records with templates and custom types, realms, calendars, timeline, relationships graph, mysteries, maps with pins, routes, regions, fog and travel, canon review, revisions, consistency check, search.
- **Campaign:** several campaigns per world with their own reveals, sessions (prep, live, recap, journal), adventures with scene flows, quests, handouts, encounters and tracker, treasure, standing, bastions, downtime, state of the world.
- **Characters:** the full D&D 2024 sheet, a builder for levels 1 to 20, the SRD built in, books from 5etools, Open5e, Books only.
- **Players:** a table server with a handbook per campaign, sheets players edit, turn order and handouts on phones, an offline published handbook.
- **Sharing:** libraries, backups, worldbooks with books required, optional or safe mode, the Worldkeeper world whole on the SRD.

## 3. Gaps

Each was checked in the code, not assumed. "None" means no trace of it.

### A. Trust: needed before the word "beta"

| # | Gap | What I found |
| --- | --- | --- |
| A1 | **Safe upgrades** | No automatic backup before an update changes a library's database, and no test that opens a library made by an older version. Agreed as fine before release; a beta can't lose a campaign to an update. |
| A2 | **Installers people can trust** | Unsigned: macOS and Windows warn or block. No update check: a GM never learns a fix exists. 130 MB. The Windows build broke for two releases without anyone noticing until a download was missing. |
| A3 | **When something goes wrong** | No log file, no "copy details for a bug report", no issue templates. A beta lives on bug reports. |
| A4 | **Tested like a product** | CI drives only the first-run wizard. The full smoke test runs by hand; the table server, the installed desktop app and a large library (10,000 records) are never tested automatically. No client-side tests. |
| A5 | **Help inside the app** | The manual is Markdown in the repository. In the app: a first-run wizard, a Getting started card, and nothing after. |
| A6 | **Accessibility and devices** | Labels exist in places; there has been no keyboard-only, screen-reader or contrast pass, and no pass of the GM app on a tablet. |
| A7 | **Security and publishing** | The table server's codes are not passwords (documented). Publishing to GitHub Pages has never been run against the real GitHub. |

### B. What a GM would expect and not find

| # | Gap | What I found |
| --- | --- | --- |
| B1 | **Pictures on records** | None. Characters have portraits and handouts have pictures, but an NPC, a place or an item can't have an image, and text can't embed one. For a worldbuilding tool this is the most visible hole. |
| B2 | **Homebrew workshop** | A GM's stat block is "a book creature plus what's different" and four numbers; there is no full stat block editor, and no way to make a magic item or spell in the app. Markdown rules packs can't hold creatures or items at all. |
| B3 | **Party progression** | No XP or milestone tracking, no level-up flow for an existing character (the builder builds at any level, but levelling up is editing by hand), no real-world session date or attendance. |
| B4 | **A live table** | Nothing pushes: players' phones poll. Players can't roll from their sheet into a shared log. No "table display" for a TV or second screen (map, handout, turn order). |
| B5 | **Generators** | Names, treasure, encounters and tables exist. No NPC generator, no shops with stock and prices, no weather (the calendar has moons and festivals, not weather). |
| B6 | **Bring my notes** | Import needs this app's own header format. No import of an Obsidian vault or a plain folder of Markdown (front matter, wiki-links, pictures), which is where most GMs' notes live. No character import. |
| B7 | **Bulk tools** | No tag manager, no bulk edit, move or reveal, no merge of duplicates, no find-and-replace across records. |
| B8 | **The GM on a tablet** | The GM app answers only on the computer it runs on, with no password option, so a GM can't run a session from a tablet at the table. |
| B9 | **Combat depth** | The tracker has initiative, HP, conditions and concentration. To check against a real fight: legendary and lair actions, recharge, groups of monsters, effect timers, monsters' attacks rolled from their blocks. |

### C. Big bets: what "the one tool" could mean

Each is weeks of work. None is needed to call it a beta; any could be its headline.

| # | Bet | Notes |
| --- | --- | --- |
| C1 | **Battle maps** | None today (the atlas is for world and region maps). A grid, tokens tied to the tracker, fog revealed by the GM, shown on the table display. Not dynamic lighting. This is the one thing that still sends a GM to another tool mid-session. |
| C2 | **Play over the internet** | Today: the same network, or a static published handbook. A way for remote players to reach the table without router settings. |
| C3 | **Other game systems** | D&D 2024 only. A system-neutral mode (worldbuilding and campaign tools without the D&D rules), or other systems' sheets. |
| C4 | **An assistant** | Planned long ago and deferred: optional, any provider, cites records, only ever makes PROPOSED drafts. |
| C5 | **Sync and co-GMs** | One computer today; a world moves by file. |
| C6 | **A rich-text editor** | Markdown with a toolbar and preview today. |
| C7 | **A home** | A name ("The Worldkeeper" is a working title that is also the bundled world's name), a website with the manual, a place to find and post worldbooks. |

## 4. Proposed shape (for discussion)

- **0.10, Trust:** A1 to A7. The least exciting release and the one that makes the rest worth doing.
- **0.11, The missing basics:** B1 pictures, B2 homebrew workshop, B3 progression, B7 bulk tools.
- **0.12, The table:** B4 live table and table display, B8 GM on a tablet, B9 combat depth, B5 generators.
- **0.13, Bring your world:** B6 imports, and C7 a home (name, website, manual).
- **1.0-BETA:** a feature freeze, a full pass on real tables, the upgrade promise in writing.
- **Battle maps (C1):** either the beta's headline (after 0.12, on the table display it needs) or the first thing after it.

## 5. Decisions needed

1. Which big bets, if any, belong in the beta (C1 to C6)?
2. Signing: Apple's developer programme is about $99 a year; a Windows certificate about $10 a month or more. Pay for them, or ship unsigned with clear instructions?
3. Update check: the app makes no network calls today. May it ask GitHub once a day whether a newer version exists (switchable off)?
4. The name: keep "The Worldkeeper" for both app and world, or rename one before a beta makes it stick?
5. D&D 2024 only for 1.0, or a system-neutral mode?
