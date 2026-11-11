# The Worldkeeper

**A local-first worldbuilding encyclopedia and D&D 5e (2024) campaign manager** for one world with three branches: **Aetheris**, **Kaelmar** and the **Ethereal Realm**.

The Worldkeeper imports an existing Markdown lore library, keeps every stable ID, source reference, canon label and GM secret intact, and turns it into an interconnected, searchable encyclopedia with maps, relationship graphs, campaign tracking and table-side tools for running sessions.

It runs entirely on your own computer: no account, no cloud service, no paid API, and no AI dependency. Your data is one SQLite file plus a folder of map images, backed up automatically.

> "The Worldkeeper" is a working title. Rename it under **Settings**.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Desktop app](#desktop-app)
- [Importing your world](#importing-your-world)
- [Typical workflow](#typical-workflow)
- [Player view](#player-view)
- [Data, backups and exports](#data-backups-and-exports)
- [Commands](#commands)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Canon and safety guarantees](#canon-and-safety-guarantees)
- [Status and roadmap](#status-and-roadmap)

---

## Features

### Encyclopedia
- One record per stable ID (`NPC-010`, `VLT-305`, `CON-001-DOM`…), with original name, aliases, category, parent, realm, canon status, source references and tags kept verbatim.
- Record pages with key facts, GM-only sections clearly flagged, child records, connections, campaign state and full history.
- Markdown editor with live preview, autosave, a visible save indicator, change reasons and conflict protection.
- `Name [ID]` cross-references become links automatically; broken references are reported.
- **Record-link suggestions while typing:** type `[[` and part of a name or ID in any text area. Choose a suggestion and it is inserted as `Name [ID]`.
- Version history with line-by-line diffs and one-click restore. Duplicate a record as a PROPOSED draft without touching the original.
- New records start from your library's own templates, with missing facts left as `UNDEFINED`. The app warns you when a similar record already exists.

### NPC and faction profiles
- **Structured forms for NPCs:** pronouns, species, role, appearance, voice, home, factions, goals, pressures, secrets, what the NPC knows, disguise, game statistics and portrait.
- **Structured forms for factions, cults and families:** ideology, leaders, headquarters, resources, allies, rivals, goals and secrets.
- **Source text beside your notes:** each field shows what your source library already says, read-only, next to your own value. Fields the source does not cover show `UNDEFINED`. The canon record is never changed.
- **Campaign fields:** attitude toward the party, status, current location, last encountered (filled in automatically from the session log), what the party knows, promises, debts and recent actions. For factions: current plans, influence by region, attitude and recent events.
- **Influence by region:** Faction Agendas shows a matrix of faction influence per region and flags regions where several factions compete.

### Search and relationships
- Global search (`Ctrl+K`) across names, aliases, stable IDs, tags, full text, original source files, sessions, quests, adventures and notes, with realm, type and canon filters.
- Structured relationships (Lives in, Leads, Member of, Allied with, Opposes, Controls, Seeks…), some created from the source text (Parent, Leaders and cross-references) and others curated by you.
- Interactive relationship graph showing the focused neighbourhood of one record, filterable by depth, entity type, continent, historical era, canon status and relationship type.

### The three branches
- **Aetheris:** Crystal Shards table (lore power, GM-only canon location, interested parties, plus per-campaign holder, location, shardscarred bearer and cult activity), dominions and factions overview.
- **Kaelmar:** Thirteen Vaults tracker (location, purpose, key, canon state, plus per-campaign vault state, clues, guardians and consequences). All vaults are sealed at the default start, 300 AB.
- **Ethereal Realm:** an explorer that separates the border layer from the deep domains, highlights access requirements, and links crossings, hazards, Thinning and Unmaking, and inhabitants.
- World overview, World Timeline (300 AB = Year 31 Unbound; undated events are never given invented dates), cosmology, pantheon, peoples, magic systems, and mysteries and secrets.
- **Eras on the timeline:** the eras come from your library's own `era/` tags, and each event takes the era of the records it links to. You assign the rest, filter or group the timeline by era, and rename, reorder or add eras.

### World Atlas
- Upload your own maps (PNG, JPEG, WEBP or GIF), or create abstract diagrams for places such as the Ethereal Realm.
- Map hierarchy World → Continent → Region → Settlement → Building, with drill-down from markers to local maps.
- Draggable markers linked to records, categories, layers, region boundaries and routes, and DM-only or player-visible items.
- **Unplaced locations** list shows the source's written placement ("east of centre", "half a day from…") so you can position places yourself. No coordinates are invented.

### Campaigns
- Multiple campaigns in the same world, each with premise, dates, status, players, active factions and notes.
- **Campaign state overlay:** "the party captured the fortress" is stored per campaign. The encyclopedia record is never overwritten. You can propose a development as world canon, which then waits in Canon Review.
- Party sheets with 2024 basics: ability scores and modifiers, proficiency by level, saves, skills, AC, HP, initiative, conditions, exhaustion, concentration, spell slots, rests, equipment and setting mechanics.
- Quests with a "players see" flag; adventures with premise, hook, stakes, opposition, clues, obstacles, rewards, approaches, consequences and "if ignored"; story arcs.
- Scenes that can be reordered, copied between adventures, and arranged in a visual branching flow editor.

### Running sessions
- **Session prep:** recap, party location, goals, scenes, NPC notes, read-aloud text, clues, encounters, treasure, consequences and open questions.
- **Live Session Mode:** current scene and read-aloud text, encounter tracker, quick event log, quest updates, proposed world changes, relevant NPC cards and dice, all on one screen.
- **Reveal to players from live mode:** pick a record, then make it known to players, reveal a section, or write a fact in your own words. Every reveal is logged to the session and appears in the recap. GM-only sections cannot be revealed.
- **Recap draft** built only from what you recorded, then a review screen to accept or reject the session's proposed changes.
- **Encounter and initiative tracker:** roll or enter initiative, rounds and turns, damage, healing and temporary HP, the 15 conditions, concentration save DC (2024 rule), defeated and hidden combatants, and adding the whole party.
- DM screen, NPC quick-reference cards, faction agendas (progress tracks you advance yourself, with a reason), world events, random tables, dice roller (`2d6+3`, `1d20 adv`, `4d6kh3`, `d%`), rules reference labelled OFFICIAL / HOMEBREW / OUTSIDE 2024 CORE / UNVERIFIED, and notes.

> No rulebook text or monster stat blocks are bundled. Statistics and rules come from your own source material or what you enter.

### Library management
- Import preview, confirmation and history; exports; Canon Review; broken references; change history; backups and restore; settings.
- Dark fantasy theme (default) and a readable light theme, collapsible sidebar, keyboard shortcuts, and layouts that work on tablets and phones.

---

## Quick start

**Requirements:** Node.js 20 or newer (22 recommended).

```bash
git clone <this repository>
cd Worldbuilder
npm install
npm run build
npm start
```

Open **http://127.0.0.1:4310**.

For development, with live reload of server and client:

```bash
npm run dev        # API on :4310, client on http://localhost:5173
```

### Desktop app

The Worldkeeper can also be built as a desktop application (Linux, macOS, Windows) with [Tauri](https://tauri.app). It bundles its own Node.js runtime, keeps data in your OS app-data folder, and needs no terminal or browser:

```bash
npm run desktop:build      # installers in src-tauri/target/release/bundle/
```

Prerequisites (Rust and per-OS system libraries), data locations, signing and troubleshooting are in [docs/DESKTOP.md](docs/DESKTOP.md).

---

## Importing your world

1. Open **Library Management → Import and Export**.
2. Choose your archive, for example `Amsel_Unified_World_Lore_Reference_v10.zip`.
3. Click **Preview import** and review the report:
   - records to create, update or leave unchanged
   - duplicate IDs and which page was kept
   - skipped copies (compendium copies, worked examples, templates)
   - broken references
   - protected source files (setting bibles)
   - conflicts with your own edits
4. Click **Confirm import**. A backup is made first, then everything is written in one transaction. If anything fails, nothing is changed.

From the command line:

```bash
npm run import -- path/to/archive.zip --dry-run     # preview only
npm run import -- path/to/archive.zip               # import (backs up first)
npm run import -- path/to/folder                    # a folder of Markdown files works too
```

**Re-importing is safe.** Unchanged records stay untouched. Records you edited are kept by default when the source also changed, and the other version is preserved in history either way. Records missing from a newer archive are never deleted.

What the importer understands:
- metadata headers: `ID / Name / Alternate names / Category / Parent / Continent or realm / Canon status / Source / Tags`, plus template fields
- files that contain several entries
- the Canonical Entry Locator, used to choose authoritative pages
- legacy redirect IDs
- `References/`, stored as protected originals

---

## Typical workflow

1. **Import** your library and browse it from the **Dashboard** or the realm pages.
2. **Create a campaign** (All Campaigns) and make it active.
3. **Add the party**, **quests** and **adventures**. Start an adventure from one of the source hooks to link it.
4. **Prepare the next session**, choosing the adventures and the NPCs and places in play.
5. **Go live** (Live Session button): run encounters, log events, update quests and record world changes.
6. **End the session.** Generate the recap draft, edit it, and accept or reject the recorded changes.
7. Reveal records to players, and publish quests, recaps and maps.
8. Use **Canon Review** to approve anything that should become permanent world canon.

---

## Player view

- **On your machine:** open `http://127.0.0.1:4310/player`, or use the **Player View** button.
- **For players on your network:** start a separate player-only server:

  ```bash
  npm run start:player      # http://<your-computer>:4320
  ```

  This process contains **no DM routes at all**. Only player-safe data can be requested from it.

A record exists for players only after you enable **Players know this record exists** on its *Player view* tab. Players then see only:
- your player summary
- facts you have revealed
- the sections you tick

Sections whose headings say *GM only* or *Secret* cannot be published. References to unrevealed records are removed. Maps, markers, regions, quests and recaps are hidden until you publish them.

---

## Data, backups and exports

By default all data lives in `./data/`, which git ignores:

| Path | Contents |
| --- | --- |
| `data/worldkeeper.db` | SQLite database: records, history, relationships, campaigns, maps |
| `data/uploads/` | Uploaded map images |
| `data/backups/` | Versioned `.wkbackup.zip` backups |

**Backups** are created daily while the server runs, before every import, before every restore, and on demand: use **Backups → Back up now** or `npm run backup`. A restore checks the archive and the database's integrity first, and saves a safety backup of the current state.

**Exports** (Import and Export → Export):

| Export | Use |
| --- | --- |
| Full world ZIP | Markdown library + complete JSON + every original source file + map images |
| Markdown library | One file per record in the library format; re-importable anywhere |
| JSON data | Every table; loads into an empty installation |
| Campaign-only | One campaign; imports as a new campaign |
| Player-safe | Only revealed and published material; contains no secrets |

---

## Commands

| Command | Description |
| --- | --- |
| `npm run setup` | Install dependencies and build the client |
| `npm start` | Start the DM app (production build) on `127.0.0.1:4310` |
| `npm run start:player` | Start the player-only server on `0.0.0.0:4320` |
| `npm run dev` | Development mode with live reload |
| `npm run build` | Type-check and build the client into `dist/` |
| `npm run import -- <zip or folder> [--dry-run] [--take-source]` | Import a lore library from the command line |
| `npm run backup [-- reason]` | Write a backup archive |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check client and server |
| `npm run e2e -- <url> [screenshot dir]` | Browser end-to-end smoke test against a running app |
| `npm run desktop:prepare` | Bundle server, client, SQLite driver and Node runtime for the desktop app |
| `npm run desktop:dev` | Run the desktop app in development mode |
| `npm run desktop:build` | Build desktop installers |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORLDKEEPER_DATA_DIR` | `./data` | Where the database, uploads and backups are stored |
| `PORT` | `4310` (DM), `4320` (player) | Listening port |
| `HOST` | `127.0.0.1` (DM), `0.0.0.0` (player) | Listening address. The DM server is local-only unless you change this. |
| `WORLDKEEPER_MODE` | `dm` | Set to `player` for the player-only server |
| `WORLDKEEPER_STATIC_DIR` | `./dist` | Location of the built client (set by the desktop app) |

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+K` or `/` | Search |
| `Alt+D` | DM screen |
| `Ctrl+\` | Collapse or expand the sidebar |
| `Ctrl+Enter` | Save a live-session log entry |
| `[[` in a text area | Suggest a record link; `Enter`/`Tab` inserts it, `Esc` closes |

---

## Project structure

```
shared/            Domain vocabulary and pure play logic (dice, initiative, damage), used by client and server
server/src/
  db/              SQLite connection and versioned migrations
  import/          Archive scanning, Markdown parsing, normalisation, import plan/commit
  repo/            Data access: entities, relationships, search, campaigns, maps, canon review
  player/          The player-safe projection (the only source of player data)
  backup/          Backups, restore, exports
  routes/          HTTP API
  cli/             Command-line import and backup
client/src/
  components/      Layout, search palette, Markdown renderer, pickers, UI primitives
  pages/           Dashboard, encyclopedia, atlas, graph, realm tools, campaigns, live mode, DM tools, library
  player/          Player view app
tests/             Unit, API and integration tests
scripts/           Browser end-to-end smoke test
docs/              Architecture, schema, import strategy, desktop packaging
src-tauri/         Desktop (Tauri) shell that runs the bundled server
desktop/           Desktop icon source and loading page
```

**Stack:** React, TypeScript, Vite, Tailwind CSS, Lucide, React Flow, Leaflet; Node.js, Express, SQLite (better-sqlite3, FTS5), zod. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the database schema, import strategy and security model.

---

## Testing

```bash
npm test                                                    # unit + API tests (synthetic fixtures)
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip npm test       # adds the full real-archive import test
npm run typecheck
```

**Browser end-to-end smoke test.** Start the app first; Playwright and Chromium are required.

```bash
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip node scripts/e2e-smoke.mjs http://127.0.0.1:4310 ./screenshots
```

The tests cover:
- import planning, deduplication, rollback and idempotency
- protection of local edits and of the setting bibles
- search and relationships
- persistence across restarts and revision history
- canon review and campaign overlays
- recap generation
- player-data safety, including the player-only server
- backup and restore, and the JSON / Markdown / campaign export round-trips
- atlas uploads, dice and initiative

---

## Canon and safety guarantees

- **No invented lore.** Missing facts stay `UNDEFINED`. No placeholder entries, coordinates, dates or campaign events are generated.
- **Canon changes are visible and reversible.** Every edit is versioned with a reason. Edited canon records appear in Canon Review with a diff until you approve or revert them. New records are `PROPOSED`.
- **Campaigns never overwrite the world.** Campaign developments are stored separately and become canon only through explicit approval.
- **Source originals are protected.** The setting bibles and other references are stored verbatim and never overwritten.
- **Players see only what you reveal.** This is enforced on the server, not by hiding text in the page.
- **Safe rendering.** Raw HTML in lore is never rendered. Uploaded images are checked by content, and SVG is refused. All writes are validated.

---

## Status and roadmap

The first release is functional. [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) lists completed and partial features, known issues, the tests performed and next steps.

**v0.2 "At the table"** added:
- record-link suggestions while typing
- NPC and faction profiles
- revealing to players during a live session
- timeline eras
- the desktop app

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for what comes next.

An optional, provider-independent AI assistant is planned only after the core is in regular use. It will only ever create `PROPOSED` drafts.
