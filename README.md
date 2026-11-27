# The Worldkeeper

**Your world. Your canon. Your campaigns.**

The Worldkeeper is a **free, open-source, local-first worldbuilding encyclopedia and D&D 5e (2024) campaign manager**. Start a world of your own or bring in the lore you have, connect characters, factions and locations, explore maps, run sessions, and share only the knowledge your players have discovered.

Build **a world of your own**, with its own worlds, continents and planes, calendar, kinds of record and templates, from a first-run wizard. Or play in **Oros**, a shattered world of Aetheris, Kaelmar and the Ethereal Realm, which comes whole with the app as a **worldbook**. Share your own world as a worldbook, and add the ones other GMs share. Either way it runs a **standard D&D 2024 campaign** from the SRD and the books you own, keeps stable IDs, source references, canon labels and GM secrets, and manages independent campaigns in the same world.

**No account, required cloud service, paid API or AI dependency.** World data lives on your computer in SQLite and an uploads directory, with backups and portable exports.

> **Status:** v0.9, an early functional release: Oros is now whole on the SRD alone, with 40 species of its own for its peoples. Built on v0.8 **“Worldbooks”**: whole worlds you add, share and hand to other GMs as one file, Oros complete inside the app, and worldbooks that work with whatever books each GM owns (books required, optional, or open stand-ins), with a Books only switch. Built on v0.7's players' timeline and v0.6's several groups and several worlds in one installation. Some features and desktop platform builds are still undergoing validation. Read [Development Status](DEVELOPMENT_STATUS.md) before relying on the application for important campaign data.

## Screenshots

Actual screenshots from Worldkeeper: a world of one's own, *Ostmark*, and Oros with a sample campaign, *The Loose Thread*.

### Start your world

A fresh library opens on a short wizard: your world's name, calendar and shape (or Oros), rules and modules, a first campaign with its town and party, and a map. A few records that teach come with it, and the dashboard's **Getting started** card follows what you try.

| Its shape | Getting started |
| --- | --- |
| ![The wizard's shape step: Ostmark with two continents and a plane](docs/images/start-world.jpg) | ![The dashboard after the wizard, with the Getting started checklist](docs/images/getting-started.jpg) |

### New ▸ anything

Make any kind of record, **Guided** through its template (facts as proper inputs, one step per section, then a review of what players can see) or **Advanced**, as Markdown in the editor beside its preview.

| Guided: the review | Advanced: Split view |
| --- | --- |
| ![A new NPC's review step: the record as it will read, its links and what players will see](docs/images/new-guided.jpg) | ![The same NPC in Advanced mode: the template's Markdown beside its preview](docs/images/new-advanced.jpg) |

### Several groups, several worlds

Run two groups in one world without either seeing what the other learned: each reveal goes to one campaign or to everyone, and each campaign has its own handbook address on the table server, with a QR code to scan at the table. Keep unrelated worlds in libraries of their own, and switch between them from the Library menu.

| Who learns this | Each campaign's handbook |
| --- | --- |
| ![Hollow Refuge's Player view: revealing to The Loose Thread only, who knows each section, and exactly what that group's players see](docs/images/reveal-per-campaign.jpg) | ![The Loose Thread's overview with its handbook code, address and QR code](docs/images/handbook-address.jpg) |

![Library → Libraries: Oros, Ostmark and a copy, with the Library menu open to switch between them](docs/images/libraries.jpg)

### Worldbooks

A **worldbook** is a whole world in one file: its realms, record types, templates, calendar, records, links, timeline and maps. Oros comes with the app as one. **Share as a worldbook…** makes one from your own world, never your campaigns or what your players saw; another GM **adds** it and starts a library with it. A worldbook never holds book text, only names: sharing asks whether the books it draws on are required, optional, or swapped for open stand-ins, and adding one says which books it misses.

| Worldbooks in a library | Share as a worldbook |
| --- | --- |
| ![Library → Worldbooks: Oros in this library, and Ostmark, shared by another GM, ready to start a library with](docs/images/worldbooks.jpg) | ![Sharing Ostmark: its name, author, description and licence, and what it says about the books](docs/images/share-worldbook.jpg) |

### World dashboard

Your active campaign, what you were reading, your favourites, the realms and the state of the world, in Warm Parchment.

![The World Dashboard: the active campaign with its sessions, party and quests, recently viewed records, favourites and the realms](docs/images/dashboard.jpg)

### Records, with Quick-Peek

Every record opens on its lore, with an illuminated title; its connections, mentions and latest changes sit in the inspector on the right. Hover any record link for a card, peek it into the inspector, or open it beside the page.

| A record and its inspector | A hover card |
| --- | --- |
| ![Hollow Refuge's record page with its connections in the inspector](docs/images/record.jpg) | ![A hover card for The Hollow Marches over a record's text](docs/images/quick-peek.jpg) |

### The Atlas

The maps fill the screen, drawn to scale, with the campaign's quests, adventure places and the party on them. Hover a pin for its card; click it for its panel.

| The world | The Ethereal Realm |
| --- | --- |
| ![The world map with Hollow Refuge's panel open, the party there, and the legend in the sidebar](docs/images/atlas.jpg) | ![The Ethereal Realm's chart](docs/images/ethereal.jpg) |

The region border editor lets the GM draw and adjust regional boundaries directly on the atlas.

![GM drawing and editing region boundaries on the World Atlas](docs/images/region.jpeg)

### Plans of places

Open a town, a building, a dungeon or a ship and the app lays it out from what its record says, and draws it in ink with a grid: the rooms its text names, numbered in the same order; a settlement's streets, walls and water from its population and its land. Draw another until you like it, keep it, and take it away as a picture with so many pixels to a square, for a virtual tabletop or a mapping tool.

Then key it. Click a number on the plan and say what is there: words to read aloud, and encounters, traps, puzzles, hazards, loot, secrets, clues and people, added, changed and removed as you like, or suggested from your books for the party and the place.

| A dungeon, from the rooms its record lists | A walled town, from its facts |
| --- | --- |
| ![The plan of The Sunken Vault: eleven numbered rooms, with letters on the GM's copy for what is keyed to each](docs/images/plan.jpg) | ![The plan of Hollow Refuge as a walled town by a river, its named places numbered](docs/images/plan-town.jpg) |

![The key to the guard room: what is read aloud, an encounter with its creatures and their stat blocks, a trap with its DC and harm, and the loot in the chest](docs/images/plan-key.jpg)

And change it by hand. Draw, move and resize rooms; cut passages a square at a time; put doors in walls; set down stairs, pillars and altars, or a whole ready-made piece (a shrine, a row of cells, a crypt). In a dungeon, keep the rooms you like and redraw the rest around them. A settlement's buildings move, turn, come and go. Everything undoes, and everything works from the keyboard.

![The Sunken Vault being changed by hand: tools above the plan, two rooms marked to be kept, a row of cells set down as a ready-made piece, and the treasury chosen with handles on its sides](docs/images/plan-edit.jpg)

And join them up. A numbered place can be a record of its own with its own plan: the inn in the town, a click away, and tunnels under the inn's cellar a click below that. **Add a level below** makes the next level down with its stairs. A town or a city is drawn in districts, and each district can have a closer plan of its own, with the same streets.

| A city in districts | The inn's cellar, joined to the town above and the tunnels below |
| --- | --- |
| ![The plan of Marrow Ford, a walled city in six named districts with broken lines between them](docs/images/plan-districts.jpg) | ![The key to an inn's cellar with a way on, stairs down to the Smugglers' Run, and under it the joined plans: in Marrow Ford, number 2 on its plan; stairs down to the Smugglers' Run](docs/images/plan-joined.jpg) |

And put them on the ground they are really on. Any plan can be overgrown, shattered by a rift, aloft on an island in the sky, adrift in the mist between worlds (with lettered doors that open on rooms not next door), unearthly, or in the void among the stars. A **ship** is a fifth kind of plan: a hull and its decks, at sea, in the sky or in the void.

Or paint them. **Painted** draws the same plan on stone, earth, timber and grass from photographs, with its furnishings in timber, stone and cloth, shadows under them, torches and the light they throw, rugs, and wear in the floors; a town gets lit roofs, shadows, stalls in its square and boats at its piers. It is a picture to play on; ink stays the one to print.

| A dungeon, painted | A walled town, painted |
| --- | --- |
| ![A dungeon of nine rooms on cobbled floors in dark rock, lit by torches, with beds under blankets, barrels, a shelf of books, pillars and two traps marked](docs/images/plan-painted.jpg) | ![A walled town by a river on grass, with earth roads, roofs lit on one side and shaded on the other, stalls in the square, fields under different crops and four named wards](docs/images/plan-painted-town.jpg) |

| A ship among the stars | A city aloft, in districts | A dungeon adrift: doors of a letter open on one another |
| --- | --- | --- |
| ![The plan of The Starwind: three decks of a ship, white on a black sheet of stars](docs/images/plan-ship.jpg) | ![The plan of Zepharyos, the Floating City: a walled city on an island among clouds, with landing stages where its roads end](docs/images/plan-aloft.jpg) | ![The plan of The Unmoored Archive: seven rooms in the mist with no passages between them, their doors lettered A to F](docs/images/plan-adrift.jpg) |

### Prepare, play and keep the party

| Session prep | Live session (Dark Codex) |
| --- | --- |
| ![Session prep: your prep notes and the board built from the world](docs/images/session-prep.jpg) | ![A live session: the encounter tracker beside the scene's read-aloud text](docs/images/live-session.jpg) |

![Party and Characters: the party summary, character cards and a full D&D 2024 sheet](docs/images/party.jpg)

### The player handbook

What the players see, on the table server or published to GitHub Pages: only what you have revealed, on desktop or a phone.

| The handbook | On a phone |
| --- | --- |
| ![The player handbook's home: the world, open quests and the realms, with the live initiative card](docs/images/handbook.jpg) | ![An entry in the handbook on a phone, in Dark Codex](docs/images/handbook-phone-entry.jpg) |

## Why Worldkeeper?

- **Protect established lore.** Preserve original IDs, references and source texts. Record revisions, review canon changes, and keep uncertain facts explicitly `UNDEFINED`.
- **Let campaigns evolve independently.** Track events, changing NPC attitudes, faction influence and locations without silently rewriting world canon.
- **Keep secrets behind the screen.** Player views use a dedicated server-side data projection and explicit reveal controls, rather than hiding GM text in the browser.
- **Run the game in one place.** Manage party sheets, quests, scenes, encounters, initiative, session logs and recaps.
- **Own and move your data.** Use local SQLite storage, Markdown and JSON exports, uploaded map images, and backup archives.
- **Keep AI optional.** Core functionality runs without an external model or service; an optional assistant is a future proposal, not a current requirement.

## Features at a glance

| Area | What it provides |
| --- | --- |
| **Your own world** | A first-run wizard; worlds, continents and planes; your own calendar, record types and templates; records that teach |
| **Encyclopedia** | Searchable records, New ▸ anything (guided or advanced), a Markdown editor with record links and GM-only sections, source provenance, revisions and Canon Review |
| **Worldbooks** | Whole worlds as one file: add one (or start a library with it), update it and remove it without touching your own work; share your own world as a `.worldbook`; Oros comes with the app as one. Books required, optional or open stand-ins; see [Writing a worldbook](docs/WORLDBOOKS.md) |
| **Characters and factions** | Structured profiles, campaign-specific attitudes and goals, regional influence |
| **World exploration** | Maps, hierarchical locations, timelines, relationship graphs, cosmology and realm tools |
| **Campaign management** | Multiple campaigns, each with its own reveals (what one group learned stays with it), party sheets, quests, adventures, scene flows and campaign state overlays |
| **Session tools** | Preparation, live session dashboard, initiative, dice, event log, recaps and player reveals |
| **Character sheets and builder** | A full D&D 2024 sheet for players and the GM, with a change log, and a builder for any level from 1 to 20 |
| **Your own books** | Rules packs from the books you own: spells, species, classes, feats, backgrounds, creatures and magic items, imported once for all your libraries and kept private; **Books only** sets the open rules aside |
| **Modules** | Thinning, the Return, Renown and the rest are modules: on with their worldbook, or switched on for your own world, per library or per campaign; treasure and encounters can come from your books |
| **Player publishing** | Player-only server with a handbook address (and QR code) per campaign, static player handbook, optional GitHub Pages publishing |
| **Libraries** | Several worlds in one installation, each with its own records, campaigns, settings, backups and handbook: switch, duplicate, archive, or open one from a file |
| **Library operations** | Previewed imports, protective merging, complete exports (JSON, Markdown, full-world ZIP, campaigns), backups and restoration |
| **Design** | Warm Parchment or Dark Codex; five workspaces; hover cards, an inspector and split view; tablet and phone layouts for the table |

See the [complete feature reference](docs/FEATURES.md).

## Get started

### Desktop application

Download the installer for Windows, macOS (Apple silicon) or Linux from [Releases](https://github.com/n1x-shell/Worldkeeper/releases). The installers aren't signed, so Windows and macOS warn the first time you open the app: [Installing The Worldkeeper](docs/INSTALL.md) has the steps for each system, how to check a download, and how updating works. If there is no installer for your computer, run it from source. Developers: see the [desktop build notes](docs/DESKTOP.md).

### Run from source

Requires **Node.js 22 or later**; **26**, the current LTS, is recommended (`.nvmrc`).

```bash
git clone https://github.com/n1x-shell/Worldkeeper.git
cd Worldkeeper
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4310>. A fresh library opens on **Start your world**.

For development, run `npm run dev` (API on port 4310, Vite client on port 5173).

For a first-world walkthrough, see [Quick Start](docs/QUICKSTART.md). For the full command list and environment variables, see [Development](docs/DEVELOPMENT.md).

## Using your own books

Worldkeeper ships with the whole **SRD 5.2.1** (free, under CC-BY-4.0): the classes, species, backgrounds, feats and spells for character sheets, and its 330 creatures, magic items, gear, traps and poisons for the GM, so a standard campaign works with no books at all. For everything else (the Player's Handbook, the Dungeon Master's Guide, the Monster Manual, supplements and adventures), it reads rules from **your own copy** and keeps them in your library, never in the app or anything you publish.

The quickest way is a copy of the **5etools** data:

1. Find the 5etools project's source repository yourself (it isn't linked here).
2. Download an archive of the repository as a zip (the whole repository, or just its `data` folder).
3. In Worldkeeper, open **Settings → Rules packs → Import your books from 5etools**, upload the zip, tick the books you own, and choose **Import**.

Spells, species, classes and subclasses, backgrounds and feats then reach the character sheets and the builder. To use your books alone, switch on **Settings → Rules packs → Books only**: it says first what your books don't cover, and keeps the open rules for just that. Creatures become stat blocks for the GM, and magic items show their rules in treasure and on sheets. Only use material from books you own. What you import stays in your library: it is never part of the published handbook, a player export, a campaign export or this repository. You can also write your own packs in Markdown. See [Rules packs](docs/RULES_PACKS.md).

A world of your own starts as a standard D&D 2024 campaign; with Oros, switch any of its systems off in **Settings → Modules**. Each world has its own calendar (**Campaign → Calendar → The world's calendar**). See [Features](docs/FEATURES.md#modules-a-standard-dd-campaign-or-the-worldkeeper-setting).

## How it works

```text
Original Markdown library and protected source files
                       |
                       v
             Import preview + review
                       |
                       v
        World encyclopedia + canon history
                       |
            +----------+----------+
            |                     |
            v                     v
     Campaign overlays       Canon Review
            |
            v
      Explicit GM reveals
            |
            v
   Player-safe data projection
            |
        +---+----------------+
        |                    |
   Local/LAN player view   Static player handbook
```

Source facts and campaign developments are intentionally distinct. A fortress captured in one campaign does not become universal canon unless a change is explicitly proposed and approved.

**Player publication is public disclosure.** The player projection is designed to exclude unrevealed material, but you should review the output before sharing it. GitHub Pages sites may be publicly accessible, and material committed to a public repository can remain accessible in its Git history after later removal. See [Player View & Publishing](docs/PLAYER_VIEW.md).

## Data and privacy

By default, Worldkeeper keeps its libraries in `./data`: each library's database, pictures and backups in `./data/libraries/<id>/`. The DM web server binds to `127.0.0.1` by default; **do not expose it to an untrusted network**. A separate player-only server is available for LAN use. To use the GM app from a tablet or another computer, open it to your network from **Settings → The GM app on another device**: it then asks for a password you set, on a port of its own.

Backups are generated on a schedule while the server is running and before sensitive operations. Backups and exports should still be stored and tested independently. Read [Data, Backups & Exports](docs/DATA.md).

## Documentation

| Guide | Contents |
| --- | --- |
| [Installing](docs/INSTALL.md) | The installers, opening an unsigned app on Windows and macOS, checking a download, updating |
| [What's new](docs/WHATS_NEW.md) | What changed in each version |
| [Keyboard shortcuts](docs/SHORTCUTS.md) | Getting around without the mouse |
| [When something goes wrong](docs/TROUBLESHOOTING.md) | Reporting a bug, where the log is, a library that won't open, getting your world back from a backup |
| [Quick Start](docs/QUICKSTART.md) | Start your own world or Oros, and prepare the first session |
| [Features](docs/FEATURES.md) | Full encyclopedia, atlas, campaign and table-side feature reference |
| [Rules packs](docs/RULES_PACKS.md) | The SRD, importing your own books from 5etools, and writing packs by hand |
| [Writing a worldbook](docs/WORLDBOOKS.md) | Packaging a whole world: its manifest, records, templates, maps and more |
| [Player View & Publishing](docs/PLAYER_VIEW.md) | Reveals, player-only LAN server, static handbook, publishing precautions |
| [Data, Backups & Exports](docs/DATA.md) | Import safety, data paths, backup/restore, export formats |
| [Development](docs/DEVELOPMENT.md) | Commands, configuration, keyboard shortcuts and testing |
| [Architecture](docs/ARCHITECTURE.md) | System design, schema and security model |
| [Desktop](docs/DESKTOP.md) | Tauri packaging, prerequisites and platform-specific notes |
| [Development Status](DEVELOPMENT_STATUS.md) | Completed features, known issues and roadmap |

## Development, contributions and security

Stack: **React, TypeScript, Vite, Tailwind CSS, React Flow, Leaflet; Node.js, Express, SQLite (better-sqlite3 / FTS5), zod; Tauri**.

Run `npm test`, `npm run typecheck` and `npm run build` before proposing changes. Testing details are in [Development](docs/DEVELOPMENT.md).

Contributions are welcome subject to review; see [Contributing](CONTRIBUTING.md). To report a security problem, see [Security Policy](SECURITY.md) and avoid publicly disclosing exploitable vulnerabilities before remediation.

## Roadmap

v0.2, **“At the table,”** added record-link suggestions, structured NPC and faction profiles, in-session player reveals, timeline eras and desktop packaging. v0.3, **“Your books, your table,”** added the full D&D 2024 character sheet and builder, rules packs from your own books, the SRD 5.2.1 and the to-scale world map. v0.4, **“Illuminated,”** redesigned everything: the GM app, the table server and the player handbook. v0.5, **“A World of Your Own,”** made the app as good for a GM's own world as for the Worldkeeper setting: realms, record types, templates, calendars, rules and modules as data, setting packs, the Markdown editor, New ▸ anything and a first-run wizard. v0.6, **“Many Tables, Many Worlds,”** lets several groups share a world without seeing each other's discoveries, each at its own handbook address, and keeps several worlds in one installation as libraries of their own. v0.7 brought the timeline to the table: sessions on the World Timeline and the players' own timeline of what they've learned. v0.8, **“Worldbooks,”** makes a world something you hand to another GM: Oros complete inside the app, sharing and adding `.worldbook` files, and worldbooks that respect the books each GM owns, with Books only. v0.9 shares adventures, tables and creature stand-ins in worldbooks, and gives Oros 40 open species of its own, so it needs no book to play. See [Development Status](DEVELOPMENT_STATUS.md) for feature maturity, known issues and next steps.

An optional, provider-independent AI assistant is planned for a later phase. Any generated lore should enter as a `PROPOSED` draft subject to GM review, not silently become canon.

## License and disclaimer

Licensed under the **BSD 2-Clause License**. See [LICENSE](LICENSE) for the full text.

Worldkeeper is an independent tabletop campaign tool, compatible with fifth edition. It is **not affiliated with or endorsed by Wizards of the Coast**. Apart from the System Reference Document 5.2.1 (its character rules, spells, creatures, magic items, equipment and hazards), it does not bundle official D&D rulebook text. A creature's environments in the encounter generator are facts recorded alongside the SRD's stat blocks, not text. The 5etools importer reads a copy that you supply and stores what it converts only in your own library; users provide their own appropriately licensed or owned material. Worldkeeper is not affiliated with 5etools.

The painted style of plans uses six textures from Poly Haven (polyhaven.com), which are in the public domain (CC0 1.0): cobblestone_floor_08, gravel_floor, rock_04, dark_wooden_planks, rocky_terrain_02 and dirt_floor, cut down and recoloured.

The Oros worldbook's rules (the world's creatures, hazards and items, in `packs/worldkeeper/rules/`, `packs/worldkeeper/statblocks/statblocks.json` and `packs/worldkeeper/treasure/catalogue.json`) is licensed under CC BY 4.0: "The Oros worldbook's rules, by the Worldkeeper contributors, CC BY 4.0."

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

> “The Worldkeeper” is a working title. You can rename your installation under **Settings**.
