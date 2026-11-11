# Development Status

_Last updated: 2026-11-11 · v0.2.0 "At the table"_

This file is the hand-over document for anyone (human or AI) continuing the project. Keep it current.

## Source archive findings (Phase 1)

- Archive `Amsel_Unified_World_Lore_Reference_v10.zip`: 475 Markdown files, 422 distinct `ID:` values (+ template placeholders).
- Metadata convention: 9 standard keys (`ID, Name, Alternate names, Category, Parent, Continent or realm, Canon status, Source, Tags`) then template-specific keys, then the Markdown body.
- ID families: WLD CON REG LOC SET VLT KEY NPC FAC CLT FAM PPL CAL DEI COS HIS SHD ART ITM CRE RUL ETH SYS HOOK DEC, plus GDE/IDX and suffixed forms (`CON-001-DOM`, `PPL-008-009`, `IDX-AETH-FAI`).
- Cross-references: `Name [ID]`. Embedded duplicates: `00_World/03_World_Cosmology.md` (COS-901…915), `05_World_Geography.md` (REG-901, LOC-901, LOC-902), `Worked_Examples/` (5). Redirect stub: LOC-015 → LOC-505. Dual roles kept separate by design (FAC-301/SET-302, FAC-310/NPC-302, FAC-311/LOC-302).
- Authority: `07_Continuity/Canonical_Entry_Locator_v8.md` is used to pick authoritative pages; `References/` (both setting bibles, implementation guide, audits) are stored as protected source documents.

**Import result on the real archive:** 421 records (all non-reference IDs), 475 source documents, 1,008 relationships, 17 timeline rows, 17 templates, 18 duplicate IDs resolved, 23 copies skipped, **0 broken references**. Counts include 13 vaults, 13 shards, 7 Ethereal domains, 110 NPCs. Re-import: 421 unchanged.

## v0.2 "At the table" (working and tested)

- **Record-link suggestions while typing:** typing `[[` in any DM text area opens a ranked list of records. The text areas covered: record body, DM notes, session prep, scenes, adventure fields, recaps, quests, notes, NPC profile fields and the live log. Choosing one inserts `Name [ID]`, the library's own reference format. Keyboard: arrows, Enter or Tab, Esc. Redirects and archived records are excluded.
- **NPC and faction profiles:**
  - Structured forms on the record page. Field definitions are in `shared/profiles.ts`.
  - Each field shows the source's own text read-only, extracted from the record's sections and metadata fields and from structured relationships, next to a DM value.
  - World-scope values sit beside the canon text, never in it. Campaign-scope values (attitude, status, current location, promises, debts, what the party knows, recent actions, current plans, influence by region, recent events) are stored per campaign.
  - Last encountered is read automatically from the session log.
  - Portraits are uploaded and checked by file content.
  - NPC quick cards and the DM screen use the profiles.
  - Faction Agendas shows an influence-by-region matrix that flags contested regions.
  - Profiles are never part of player data, and the player-only server has no profile routes.
- **Reveal to players during play:** a live-mode panel reveals that a record exists, reveals individual sections, or adds a revealed fact.
  - One server call updates the record and logs the reveal to the session, in a single transaction.
  - GM-only and secret sections are refused on the server.
  - Reveals appear in the recap draft under "Revealed to players".
- **Timeline eras:**
  - The era vocabulary is read from the library's own `era/` tag documentation (the implementation guide) and the `era/*` tags on records. Display names are title-cased and can be renamed, reordered or added to.
  - Timeline rows take the era of the records they link to. Rows without such a link stay unassigned, not guessed.
  - The DM can assign or override any row, and these assignments survive re-imports.
  - The timeline can be filtered by era and realm and grouped by era; the event list below it follows the filter. The relationship graph has a historical-era filter.
  - Libraries imported with v0.1 are backfilled automatically on startup from the stored source documents.
- **Desktop app (Tauri 2):**
  - `src-tauri/` holds the Rust shell. It launches the server, bundled into one file with esbuild, on a bundled Node.js runtime (sidecar), bound to 127.0.0.1 on a free port, with data in the OS app-data folder.
  - It shows a loading page, then the app, or a readable error naming the log file.
  - Quitting stops the server cleanly with SIGTERM. A parent-process watchdog makes the server exit if the app is killed.
  - `npm run desktop:prepare | desktop:dev | desktop:build`; see `docs/DESKTOP.md`.
  - GitHub Actions workflows: `ci.yml` (typecheck, tests, build) and `desktop.yml` (installers for Linux, macOS and Windows).

## Completed functionality from v0.1 (working and tested)

**Core / data engine**
- SQLite database with versioned migrations, WAL, FTS5 full-text search.
- Markdown import: ZIP upload or folder (CLI), recursive discovery, multi-block files, ID preservation, duplicate resolution via locator/standalone rule, worked examples and templates excluded, link resolution, source citation retention, preview report, explicit confirmation, automatic pre-import backup, single-transaction commit with rollback, idempotent re-import, conflict detection that never overwrites local edits, protected setting bibles.
- Records: view, autosaving editor (visible save state, optimistic concurrency, change reason), revisions with diff and restore, duplicate-as-draft (PROPOSED), archive, favorite, Markdown export, template-based creation with duplicate-name warning, all missing values left `UNDEFINED`.
- Relationships: structured edges (curated + derived from Parent/fields/text), add/retype/delete, redirect resolution, broken-reference report; focused neighbourhood graph (React Flow) with depth, type, realm, canon and relationship filters.
- Global search (Ctrl+K): names, IDs, aliases, tags, full text, source documents, sessions, quests, notes, adventures; filters by kind, realm, type, canon.

**World**
- Dashboard with real branch data, world/campaign date, active campaign, open quests, faction agendas, campaign world events, mysteries, recent/favorite/key records, Continue Last Session (no events are fabricated).
- World Overview, realm hubs (Aetheris, Kaelmar, Ethereal Realm), World Timeline (imported table + DM-added PROPOSED rows), Cosmology, Pantheon, Cultures, Magic, all encyclopedia category lists, Mysteries and Secrets, Source Documents viewer.
- Kaelmar: Thirteen Vaults tracker (location, purpose, key, canon state, campaign state with Sealed/Opened/Damaged/…, clues, guardians, consequences, associated records). All sealed by default.
- Aetheris: Crystal Shards table (power, GM canon location, interested party, campaign holder/location/bearer/cult activity), Dominions and factions overview.
- Ethereal Realm explorer: border vs deep layers, access sections highlighted, links to ways in/out, dangers, Thinning and Unmaking, inhabitants.

**Atlas**
- Map hierarchy (parent maps, drill-down via marker → local map), image upload (PNG/JPEG/WEBP/GIF, magic-byte checked), abstract diagram maps, zoom/pan, draggable markers linked to records, marker categories and layers, layer toggles, region polygons and routes, hidden/visible per marker and shape, per-map player visibility, side panel with record excerpt, unplaced-locations list showing the source's written placement.

**Campaigns and play**
- Multiple campaigns, active campaign, premise, dates, status, players, active factions, notes, export/import.
- Campaign state overlay (never edits canon) with supersession, accept/reject of proposed changes, promotion to canon via Canon Review.
- Party: 2024 character basics (ability scores/modifiers, proficiency by level, saves, skills, AC, HP, initiative, exhaustion, conditions, concentration, spell slots, long rest, equipment, setting mechanics).
- Quests (player-visible flag), adventures (structured plan, clue checklist, linked records, from-hook creation), scenes (reorder, copy to another adventure), visual scene-flow editor with branches, story arcs.
- Sessions: preparation workspace, live mode (scene + read-aloud, encounter tracker, quick log, quest updates, proposed world changes, relevant NPC cards, dice), recap draft generated only from recorded entries, change review, journal.
- DM tools: encounter/initiative tracker (sort, roll missing, rounds/turns, damage/heal/temp HP, conditions, concentration DC per 2024 rule, defeated/hidden), quick initiative, DM screen, NPC quick reference cards (UNDEFINED where missing), faction agendas with explicit advancement logged to campaign state, world events, random tables (user-authored), dice roller (adv/dis, keep/drop), rules reference with OFFICIAL/HOMEBREW/OUTSIDE 2024 CORE/UNVERIFIED filters, notes and scratchpad.

**Library management**
- Import/export page (preview UI, conflicts, history), exports: full world ZIP, Markdown library, JSON, campaign-only, player-safe ZIP; JSON import into empty install; campaign import.
- Canon Review: proposals (approve/revise/reject), changed canon with diff (approve as baseline or revert), proposed records, possible duplicates (dual roles noted), conflicts, missing sources.
- Broken references, change history, backups (manual, daily, pre-import, pre-restore; download; restore with integrity check and safety backup), settings (app name, default world date, theme).

**Player view**
- Separate player app at `/player` using only `/api/player/*`; separate player-only server (`npm run start:player`) with no DM routes. Projection is allow-list based; secrets and unrevealed references are excluded.

**Design**: dark fantasy theme (default) + light theme, collapsible sidebar, responsive down to phone width, keyboard shortcuts, error boundaries.

## Partially completed

- **Editor:** Markdown text area with live preview, `Name [ID]` linking and `[[` suggestions. There is no WYSIWYG editor. Undo is the browser's text-area undo, which is kept for inserted links where the browser supports `insertText`, plus revision restore.
- **Desktop builds:** the Linux build was compiled, launched and tested here (see Tests). The macOS and Windows builds are configured (`desktop.yml`, platform-specific code paths in `lib.rs`) but have **not been built or run yet**. Builds are unsigned.
- **Resizable panels:** layouts are responsive but panels are not drag-resizable.
- **Relationship era filter:** the graph filters by type/realm/canon/relationship; there is no structured "historical era" field in the source to filter on (era tags exist on some records only).
- **Map labels:** markers can be used as labels (category `label`, permanent tooltips on abstract maps); no free-floating text-only label type.
- **Player access control:** player mode is a separate read-only server; there is no per-player login.

## Not started

- Optional AI assistant (Phase 22) — intentionally deferred until the core is in daily use.
- Rich-text/WYSIWYG editor, map marker icon library, timeline drag-reordering.

## Known issues

- The desktop app is about 140 MB, most of it the bundled Node.js runtime.
- The desktop app only serves this computer. A LAN player server still needs `npm run start:player` from the repository.
- Opening two desktop windows at once shares one database. SQLite handles this safely, but there is no single-instance lock yet.

- Client bundle is ~1 MB (one chunk); fine locally, could be code-split.
- Import keeps the whole archive in memory during preview (fine for this ~2.4 MB library; large image-heavy archives are not supported because only `.md` files are read).
- `faction_plans`/`campaign_state` have no undo beyond editing/rejecting rows.
- The dashboard "World date" shows the active campaign's date when one is active; the default comes from settings (`300 AB / Year 31 Unbound`).

## Tests performed

**v0.2:**
- **Unit and API tests:**
  - `tests/v02.test.ts`: era vocabulary parsing, derivation from linked records, DM overrides surviving re-import, backfill on reopen, graph era filter.
  - Profiles: source extraction, scope storage, validation, the canon record left untouched, the influence matrix, last encountered from the log, no exposure to players.
  - Live reveals: section, fact and record reveals logged to the session; the recap section; GM-only sections, unknown sections and empty requests refused.
  - Link-suggestion ranking.
- **Total:** `npm test` reports 52 passing (plus the real-archive test when `WORLDKEEPER_TEST_ARCHIVE` is set).
- **Browser test (`npm run e2e`)**, extended:
  - typing `[[blind se` + Enter inserts `The Blind Seer [NPC-001]` and autosaves
  - the NPC profile shows source sections and `UNDEFINED`; DM values persist across a reload
  - live reveal of record, section and fact reaches `/api/player/entities/NPC-010`, the GM-only chip is disabled, and the secret text is absent
  - timeline era filter, unassigned filter, manual assignment and grouping
- **Upgrade path:** a v0.1 database was opened by v0.2: migration 4 ran and eras were backfilled. A 65-route browser sweep showed no console or page errors.
- **Desktop (Linux, under Xvfb):**
  - `desktop:prepare` passes its own check that the bundle starts on plain Node.
  - The debug build launched the window, the sidecar answered on 127.0.0.1, the UI rendered, and the database was created in the data folder.
  - A window close through a window manager stopped the server via SIGTERM (exit handler), and a SIGKILL of the app stopped it via the watchdog, leaving no orphaned processes.
  - The release build produced `.deb` and `.rpm` installers (~50 MB each).
  - The `.deb` was installed with apt: `/usr/bin/worldkeeper` launched with its own `worldkeeper-node` runtime and used `~/.local/share/app.worldkeeper.desktop`.
  - The real archive was imported through the installed app's server: 421 records, 1,008 links, 0 broken. Search and eras worked.
  - Closing or terminating the app left no server processes.
  - Testing the installer caught a packaging bug: the sidecar was first installed as `/usr/bin/node`, which would clash with a system Node.js. It was renamed to `worldkeeper-node`.

**v0.1:**

- `npm test`: 41 passing (parser/normaliser, import planning and commit, duplicate handling, rollback, idempotency, local-edit protection, protected bibles, search, relationships/graph, persistence after reopen, revisions/revert/coalescing, concurrency, canon review, campaign overlay and promotion, recap generation, player projection and player-only server, backup→restore with relationships, JSON/Markdown/campaign export round-trips, atlas upload/marker/player visibility, dice/initiative/damage/concentration).
- `WORLDKEEPER_TEST_ARCHIVE=… npm test`: real-archive integration test passes (every ID imported once, 0 broken refs, 13 vaults sealed, 13 shards, 7 domains, LOC-015 redirect, idempotent).
- Browser (Playwright/Chromium) `scripts/e2e-smoke.mjs`: import through UI, dashboard, search → record, edit persists across reload, relationships, graph, vaults, Ethereal explorer, campaign → live session → log + encounter → end → recap draft, player view empty until reveal, atlas. Additional sweep of 61 routes with zero console/page errors; atlas upload + marker placement; mobile width (390px) without horizontal overflow.
- `npm run typecheck` clean (client and server); production build succeeds.

## Next development steps (suggested milestone: v0.3)

1. Run the `desktop.yml` workflow and fix any macOS or Windows issues. Add code signing. Add a single-instance lock and an in-app "share with players on my network" toggle.
2. Player view: per-campaign publication, handout records, a player-facing timeline filtered by revealed eras and events.
3. Timeline: place campaign sessions on the timeline, with in-world dates per session.
4. Editor: side-by-side section editing, keyboard save, link suggestions inside the record picker.
5. Code-split the client; run the Playwright smoke test in CI.
6. Optional provider-independent AI assistant that cites records and only creates PROPOSED drafts.
