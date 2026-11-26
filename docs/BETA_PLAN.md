# The road to 1.0-BETA

Status: **under way**, November 2026. The audit below was made at v0.9.2.

**Decided by the owner (24 November 2026):** all of this happens in v0.9.x releases, one step each, starting with section B (what a GM would expect and not find); then 1.0-BETA. The release grouping in section 4 is replaced by that order. The five decisions in section 5 were made on 26 November 2026.

| Step | Release | Status |
| --- | --- | --- |
| B1 Pictures on records | v0.9.3 | Done, except pictures inside a record's text |
| B2 Homebrew workshop: a whole stat block, hazards | v0.9.4 | Done |
| B2 Homebrew workshop: your own magic items and spells | v0.9.5 | Done |
| B2 Homebrew workshop: creatures and items in Markdown rules packs | | To do (small; not part of v0.9.11) |
| B3 Party progression | v0.9.6 | Done, except XP worked out from an encounter |
| B4 A live table: changes pushed, and sheets that two people can edit | v0.9.7 | Done |
| B4 A live table: rolls from sheets into a shared log | v0.9.8 | Done |
| B4 A live table: a table display for a second screen | v0.9.9 | Done |
| B9 Combat depth | v0.9.10 | Done, except lair actions and a tracker for players' own effects |
| B6 Bring my notes: an Obsidian vault or a folder of Markdown | v0.9.11 | Done, except character import |
| B5 Generators: people, shops, weather | v0.9.12 | Done |
| B7 Bulk tools: tags, many records at once, merging, find-and-replace | v0.9.13 | Done |
| B8 The GM on a tablet | v0.9.14 | Done (over plain HTTP, for the GM's own network) |
| A1 Safe upgrades | v0.9.15 | Done, except a test on library files kept from real old versions |
| A2 Installers: an update check (on, switchable off) and clear instructions for unsigned installers | v0.9.17 | Done; the install steps are written from the systems' standard behaviour, not tried on a Mac or a Windows PC |
| A2 Installers: the app updates itself ("Update and restart") | v0.9.18 | Built, and tried end to end on Linux; not tried on Windows or macOS. Needs the update key added to the repository's secrets, and a first signed release, before any GM sees it |
| A3 to A7 | | To do |
| C8 A location generator: ink-style maps of places from their records | | To do, before the beta (decided) |
| The bundled world's own name: Oros | v0.9.16 | Done |
| C2 play over the internet, C4 assistant, C5 sync and co-GMs, C6 rich-text editor, C3 other systems | | After the beta, if at all (decided) |

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
| A1 | **Safe upgrades** | **Done in v0.9.15.** Found: no automatic backup before an update changes a library's database, and no test that opens a library made by an older version. Agreed as fine before release; a beta can't lose a campaign to an update. |
| A2 | **Installers people can trust** | **Done in v0.9.17 as decided** (unsigned with instructions; a daily update check). Found: unsigned: macOS and Windows warn or block. No update check: a GM never learns a fix exists. 130 MB. The Windows build broke for two releases without anyone noticing until a download was missing. |
| A3 | **When something goes wrong** | No log file, no "copy details for a bug report", no issue templates. A beta lives on bug reports. |
| A4 | **Tested like a product** | CI drives only the first-run wizard. The full smoke test runs by hand; the table server, the installed desktop app and a large library (10,000 records) are never tested automatically. No client-side tests. |
| A5 | **Help inside the app** | The manual is Markdown in the repository. In the app: a first-run wizard, a Getting started card, and nothing after. |
| A6 | **Accessibility and devices** | Labels exist in places; there has been no keyboard-only, screen-reader or contrast pass, and no pass of the GM app on a tablet. |
| A7 | **Security and publishing** | The table server's codes are not passwords (documented). Publishing to GitHub Pages has never been run against the real GitHub. |

### B. What a GM would expect and not find

| # | Gap | What I found |
| --- | --- | --- |
| B1 | **Pictures on records** | **Done in v0.9.3**, except pictures inside a record's text. (Found: characters had portraits and handouts had pictures; an NPC's or faction's profile had one GM-only portrait that players never saw; a place, an item or any other record could have no picture, and text couldn't embed one. The first draft of this audit said "none", missing the profile portrait.) |
| B2 | **Homebrew workshop** | **The stat block editor is done in v0.9.4, and your own items and spells in v0.9.5;** Markdown packs are next. Found: a GM's stat block is "a book creature plus what's different" and four numbers; there is no full stat block editor, and no way to make a magic item or spell in the app. Markdown rules packs can't hold creatures or items at all. |
| B3 | **Party progression** | **Done in v0.9.6.** (Found: sessions did have a real-world date, "Played on"; the first draft of this audit missed it. Attendance was missing.) Found: no XP or milestone tracking, no level-up flow for an existing character (the builder builds at any level, but levelling up is editing by hand), no real-world session date or attendance. |
| B4 | **A live table** | **Done:** pushing in v0.9.7, shared rolls in v0.9.8, the table display in v0.9.9. Found: nothing pushes: players' phones poll. Players can't roll from their sheet into a shared log. No "table display" for a TV or second screen (map, handout, turn order). |
| B5 | **Generators** | **Done in v0.9.12.** Found: names, treasure, encounters and tables exist. No NPC generator, no shops with stock and prices, no weather (the calendar has moons and festivals, not weather). |
| B6 | **Bring my notes** | **Done in v0.9.11 for notes** (a vault or a folder of Markdown: front matter, wiki-links, pictures); character import is not done. Found: import needs this app's own header format. No import of an Obsidian vault or a plain folder of Markdown (front matter, wiki-links, pictures), which is where most GMs' notes live. No character import. |
| B7 | **Bulk tools** | **Done in v0.9.13.** Found: no tag manager, no bulk edit, move or reveal, no merge of duplicates, no find-and-replace across records. |
| B8 | **The GM on a tablet** | **Done in v0.9.14.** Found: the GM app answers only on the computer it runs on, with no password option, so a GM can't run a session from a tablet at the table. |
| B9 | **Combat depth** | **Done in v0.9.10.** Found: the tracker has initiative, HP, conditions and concentration. To check against a real fight: legendary and lair actions, recharge, groups of monsters, effect timers, monsters' attacks rolled from their blocks. |

### C. Big bets: what "the one tool" could mean

Each is weeks of work. None is needed to call it a beta; any could be its headline.

| # | Bet | Notes |
| --- | --- | --- |
| C1 | **Battle maps** | **Not to be built** (decided 26 November 2026: a tool such as Arkenforge does this better, and is used alongside; see C8). Found: none today (the atlas is for world and region maps). A grid, tokens tied to the tracker, fog revealed by the GM, shown on the table display. Not dynamic lighting. This is the one thing that still sends a GM to another tool mid-session. |
| C2 | **Play over the internet** | Today: the same network, or a static published handbook. A way for remote players to reach the table without router settings. |
| C3 | **Other game systems** | D&D 2024 only. A system-neutral mode (worldbuilding and campaign tools without the D&D rules), or other systems' sheets. |
| C4 | **An assistant** | Planned long ago and deferred: optional, any provider, cites records, only ever makes PROPOSED drafts. |
| C5 | **Sync and co-GMs** | One computer today; a world moves by file. |
| C6 | **A rich-text editor** | Markdown with a toolbar and preview today. |
| C8 | **A location generator** | Added 26 November 2026, in place of C1. Lay out a dungeon, building or settlement from its record (type, terrain, wealth, size, who lives there), with rooms keyed to its text. Drawn as clean ink-style line maps: it can look good that way, and cannot look like painted maps without an art library. Exported as an image with a grid, to be dressed up in a tool such as Arkenforge. |
| C7 | **A home** | A name ("The Worldkeeper" is a working title that is also the bundled world's name), a website with the manual, a place to find and post worldbooks. |

## 4. Proposed shape (replaced: see the status at the top)

Kept as the first proposal. The owner chose one line of v0.9.x releases instead, section B first.

- **0.10, Trust:** A1 to A7. The least exciting release and the one that makes the rest worth doing.
- **0.11, The missing basics:** B1 pictures, B2 homebrew workshop, B3 progression, B7 bulk tools.
- **0.12, The table:** B4 live table and table display, B8 GM on a tablet, B9 combat depth, B5 generators.
- **0.13, Bring your world:** B6 imports, and C7 a home (name, website, manual).
- **1.0-BETA:** a feature freeze, a full pass on real tables, the upgrade promise in writing.
- **Battle maps (C1):** either the beta's headline (after 0.12, on the table display it needs) or the first thing after it.

## 5. Decisions (made by the owner, 26 November 2026)

1. **Big bets before the beta:** a location generator (C8) instead of built-in battle maps (C1). Play over the internet (C2) was chosen at first and then dropped the same day. It, the assistant, sync and co-GMs, and a rich-text editor wait until after the beta.
2. **Signing:** ship unsigned, with clear instructions for opening the app on macOS and Windows. No paid certificates.
3. **Update check:** yes. The app may ask GitHub once a day whether a newer version exists; on by default, switchable off in Settings, and it sends nothing about the GM or their world.
4. **The name:** the app stays "The Worldkeeper". The bundled world is called **Oros**, a name its own peoples give it (done in v0.9.16). The pack's ID stays `worldkeeper`, so installed libraries are not affected.
5. **Game system:** D&D 2024 only for 1.0.
