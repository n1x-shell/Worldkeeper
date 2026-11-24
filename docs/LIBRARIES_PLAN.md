# Campaigns and libraries: a plan (v0.6)

**Status:** approved direction (owner answers in §5, 23 November 2026). Step A1 (campaign reveals: storage and what players see) is built, in v0.5.2; step A2 (revealing per campaign, for the GM) in v0.5.3; step A3 (each campaign's handbook address) in v0.5.4; step B1 (the library root) in v0.5.5.
**Goal:** a GM can run several groups in one world without one group's handbook showing what another group learned, and can keep unrelated worlds in libraries of their own, each with its own records, backups and handbook, switching between them in a click.

Two parts, in this order:

- **A. Per-campaign reveals.** What players have learned belongs to their campaign. Some things are common knowledge in the world and every group sees them; the rest only the group that learned it.
- **B. Separate libraries.** One installation holds several libraries. Each library is a complete world (or set of worlds) with its own records, campaigns, settings, backups and handbook. Your books' rules are shared between them, so they're imported once.

Part A comes first: it fixes something players can see today, it's smaller, and it doesn't change how data is stored on disk.

## 1. Where we are today

**One library per installation.** The data folder (`WORLDKEEPER_DATA_DIR`, or `./data`; on the desktop the app-data folder) holds one library: `worldkeeper.db`, `uploads/`, `backups/`, `staging/`, the installed setting packs (`packs/`) and the publishing token (`secrets.json`). The server opens it at start (`server/src/context.ts`) and never switches; a backup restore copies a file over the same path (`replaceDatabase`). The table server (`npm run start:player`) opens the same folder.

**Reveals are library-wide.** A record's `revealed`, `revealed_sections`, `revealed_facts` and `player_summary` are columns on the record itself, with no campaign. The live reveal (`POST /entities/:id/reveal`) and "Match the published handbook" set them. Maps (`player_visible`) and their pins and outlines (`hidden`) are the same.

**Much of the player side is already per campaign:** quests, recaps, handouts, the party's treasure, calendar events, faction standing, the faction ties revealed, map discoveries and travel, and the rumours heard, secrets learned and clues found. The handbook shows them per campaign.

**Which campaign players see** is the active campaign (`settings.active_campaign_id`): the faction web, modules, the live view and map exploration all follow it. The published handbook (`playerSnapshot`) holds the library's reveals plus every campaign's own parts.

**So, today:** two groups in one world see each other's reveals in their handbooks. Two worlds in one library share search, the New menu's types and templates, settings, backups and the handbook.

**Rules:** the SRD is bundled; the setting's rules come from its pack's files; **your books' rules are rows in each library's database** (`rules_packs`, `rules_entries`, with `rules_srd` and `fivetools_books` in its settings). A second library would need them imported again, unless they're shared (§3.3).

## 2. Part A: per-campaign reveals

### 2.1 The model

A reveal is either:

- **To everyone:** common knowledge in the world (the capital's name, the public face of the church). Every campaign's players see it. This is what every reveal is today.
- **To a campaign:** what one group learned. Only that campaign's players see it.

What a campaign's players see of a record is **everything revealed to everyone, plus everything revealed to their campaign**: the record itself, each section, each fact. Secret (GM-only) sections are never shown, either way.

Storage: the record's own columns keep meaning "to everyone". A new table, `campaign_reveals (campaign_id, entity_id, revealed, revealed_sections, revealed_facts, updated_at)`, holds each campaign's additions. The player summary stays one text per record (it is the GM's player-safe description; who sees it follows the reveals).

Maps work the same way: a map, a pin or an outline is shown to everyone, or to a campaign (`campaign_map_reveals`). Map discoveries (the fog of war) are already per campaign and stay as they are.

### 2.2 For the GM

- **Revealing:** the record's **Player view** tab and the live session's reveal ask **who learns this**: the active campaign (the default once the library has two or more campaigns) or **everyone**. With one campaign, nothing changes: reveals go to everyone, as now.
- **Who knows what:** a record's Player view shows, per section and fact, whether everyone, this campaign or other campaigns know it. A small "known to" line on the record page lists the campaigns.
- **Making something common knowledge:** "Reveal to everyone" promotes a campaign's reveal; "Only this campaign" takes a world-wide reveal back to one campaign (with a confirmation, since other groups lose it).
- **The session log** records which campaign learned it, as today.
- **Exports:** a campaign export carries its campaign reveals (they go in with it); the JSON and full-world exports carry the table.

### 2.3 For players

- **Each campaign has its own handbook address** on the table server: `/player/c/<code>`, a short private code per campaign, shown on the campaign page with a QR code. Two groups can use the table server at the same time, each seeing only their own. `/player` keeps working: it shows the active campaign, as today.
- A character's private page already belongs to a campaign: it links to that campaign's handbook.
- Search, the lore list, the map, the timeline of revealed records, the faction web and standing all follow the campaign.
- **Publishing is unchanged.** The published (GitHub Pages) handbook is a demo of the app, not where groups play (§5, answer 4): it keeps showing what's revealed to everyone, as today. Groups play on the table server, each at its own address.

### 2.4 Existing libraries

Nothing changes on upgrade: every existing reveal stays "to everyone", so every handbook shows exactly what it does now. Campaign reveals start with the first reveal made after upgrading, in a library with two or more campaigns.

## 3. Part B: separate libraries

### 3.1 The model

An installation has a **library root** (the data folder) holding:

- `libraries.json`: the libraries (id, name, folder, created, last opened) and which one is open;
- `libraries/<id>/`: each library's own `worldkeeper.db`, `uploads/`, `backups/` and `staging/`;
- `shared/`: what every library shares: your books' rules (`rules.db`, §3.3), the installed setting packs (`packs/`) and the publishing token (`secrets.json`).

**One library is open at a time.** Switching closes the database and opens another, the way a restore already swaps the database, and the app reloads its state. The table server serves the open library.

### 3.2 For the GM

- **The Library menu** names the open library and lists the others: **Open**, **New library**, and **Manage libraries** (rename, duplicate, archive (hidden, files kept; restore it any time), show in folder).
- **New library** opens **Start your world** in the new, empty library. Both ways to begin work as now.
- **Duplicate** makes a copy to try something risky in (a big import, a pack update).
- **Backups and restore are per library**: restoring one never touches another.
- **Moving a world:** a library exports as one file (the full-world ZIP) and opens from one (**Open a library from a file**), which is how a world goes to a co-GM or another computer.
- **The desktop app** opens the last library; with several, the start shows them to pick from. It stays one app at a time.

### 3.3 Your books, once

Your books' rules move from each library's database to `shared/rules.db`, attached to whichever library is open (SQLite `ATTACH`), so they're imported once per installation. Each library keeps its own switches: which packs it uses, the SRD on or off, the setting's rules on or off. Rules packs never travel in exports, as now.

### 3.4 Existing installations

On the first start of v0.6, after a backup:

- the existing library becomes the first library, named after its app name (or its world), and its files move into `libraries/<id>/`;
- its imported rules move to `shared/rules.db`, and its switches stay with it;
- installed setting packs and the publishing token move to `shared/`.

Nothing else changes. Pointing `WORLDKEEPER_DATA_DIR` at an old data folder still works: the move happens on first start.

## 4. Delivery plan

Each step is its own PR, merged on the owner's OK; the release comes last.

| Step | What                                                                                                                                                                                                                             | Test                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1   | **Campaign reveals: storage and projection.** `campaign_reveals` and `campaign_map_reveals`; the player projection, search and snapshot per campaign (everyone's plus the campaign's); exports; existing reveals stay world-wide | Two campaigns in one world: each handbook shows only its own reveals and the common knowledge         |
| A2   | **Revealing per campaign, for the GM.** Who learns this (the active campaign or everyone) in Player view and the live reveal; who knows what; promote to everyone, or take back to one campaign; maps and pins                   | Reveal in a live session for one group; the other group's handbook doesn't change                     |
| A3   | **Each campaign's handbook.** `/player/c/<code>` on the table server, the code and QR on the campaign page, character pages linking to it                                                                                        | Two browsers, two campaigns, one table server: each sees only its own                                 |
| B1   | **The library root.** `libraries.json`, per-library folders, opening and switching libraries on the server, the move of an existing installation                                                                                 | An existing installation upgrades into its first library unchanged; a second library opens and closes |
| B2   | **Shared rules and packs.** `shared/rules.db` attached, per-library switches, installed packs and the token shared                                                                                                               | Books imported once are in every library; each library's switches are its own                         |
| B3   | **Libraries for the GM.** The Library menu's switcher, New library (with the wizard), Manage libraries, open from a file, the desktop start                                                                                      | Make a second world, switch back and forth, restore one without touching the other                    |
| B4   | **Docs, screenshots and the release (v0.6.0)**                                                                                                                                                                                   | The release                                                                                           |

**Tests across the steps:** two groups in one world never see each other's campaign reveals (projection, search, snapshot, campaign export); every existing library unchanged on upgrade (its handbook identical before and after); a reveal promoted to everyone and taken back; two libraries never share records, settings, backups or uploads; books imported once and used by both; an installation upgraded from v0.5 with its archive library intact; the table server serving two campaigns at once.

## 5. Owner answers (23 November 2026)

1. **New reveals, with two or more campaigns: to the active campaign.** "Reveal to everyone" is the choice for common knowledge (§2.2).
2. **Existing reveals stay world-wide.** Nothing changes on upgrade (§2.4).
3. **Each campaign has its own handbook address and code** on the table server; `/player` keeps showing the active campaign (§2.3).
4. **The published GitHub Pages handbook is a demo, not for gameplay.** Publishing stays as it is, one per library, showing what's revealed to everyone; groups play on the table server (§2.3).
5. **Maps, pins and outlines are revealed per campaign too,** the same way as records (§2.1).
6. **An existing installation moves into `libraries/<id>/` on upgrade,** after a backup, so every installation has one layout (§3.4).
7. **Your books' rules are shared across libraries,** imported once per computer; each library keeps its own switches (§3.3).
8. **Removing a library archives it:** hidden from the list, its files kept, to be restored or deleted by hand (§3.2).
