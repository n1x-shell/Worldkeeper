# Worldkeeper Feature Reference

[← README](../README.md) · [Quick Start](QUICKSTART.md) · [Development Status](../DEVELOPMENT_STATUS.md)

This document describes Worldkeeper's features as of v0.4. For implementation completeness, test outcomes and known issues, refer to [DEVELOPMENT_STATUS.md](../DEVELOPMENT_STATUS.md). No official rulebook text or monster stat blocks are bundled; rules and statistics come from your own sources or entries.

## Finding your way

The top bar holds the five workspaces: **Codex** (the world and its records), **Campaign** (the active campaign, its prep and the state of the world), **Characters** (the party, the builder and reference), **Atlas** (the full map view; its sidebar holds the map switcher and the map's legend and tools, and Manage maps) and **Live** (running the session; a red dot shows while a session is live). The sidebar lists only the current workspace's pages, and collapses to an icon rail (`[`); below 1280px wide it starts as the rail. Search (`Ctrl+K`), the active campaign (switch it from its menu), Player View, the theme and the **Library** menu (the gear: import and export, Canon Review, backups, Settings and the other maintenance pages) are on the right. The app opens on the active campaign's overview when there is one; the app mark always goes to the World Dashboard.

## Quick-Peek: hover cards, the inspector and split view

Rest the pointer on any record link (or tab to it) and a card shows what it is: its type, realm, whether players can see it, a short summary and a few facts. From the card, **Peek** opens it in the **inspector**, a panel on the right (`]` toggles it; middle-click a link to peek straight away), **Open beside** opens it next to the page you're on (drag the divider; it's remembered), **Pin** keeps a creature's stat block in the inspector until the live session ends, and **Open** goes to it. On a tablet, tap once for the card and again to open; a long press peeks. On a record page the inspector shows the record's connections, what mentions it and its latest changes (it opens by itself on wide screens). Pins on the Atlas and combatants in the tracker peek too.

## The map, for the GM

The Atlas opens on the full map view. The sidebar holds the map: switch maps at its top, then the legend (kinds of place, routes, the campaign layers), your notes and the GM tools, with **Manage maps** at the bottom; collapse it (`[`) to see just the map, and the legend floats over it behind its **Legend** button. The legend's **Campaign** section adds the active campaign to the map, as badges beside the pins: open quests, adventure places, who lives where, and prepared encounters (give an encounter a place with **Where** in the tracker). Hover a badge to see what's there, or click it to open any of it. **Hidden from players** hides the GM-only pins, to see the map as players do. Click a region for its panel: terrain, its state in the campaign, faction clocks, its encounter tables with a **Roll** button, and the places inside it.

**Travel.** Each map can have a **Scale** (how many miles it is across), set in the GM tools; the world map ships drawn to scale, about 2,700 miles across, as the known world (the Ethereal Realm's map has none: distances there lie). The map then shows a scale bar, routes show their length and days at a normal pace, and **Measure** (bottom left) measures any path you click, with the days at a slow, normal and fast pace (18, 24 and 30 miles a day, by the 2024 rules). **Travel here** (in a place's panel) and **Travel to a point** move the party: the dialog shows the distance from where the party is and the days on the road at the pace you choose, and can move the campaign's calendar on by those days and roll the region's encounter table (for the party's level) once for each day. A live session gets every roll in its log.

**Reading the map.** **Find a place** (at the top of the legend) searches the places this reader can see by name; Enter goes to the first. Places too close together to tell apart at the current zoom are drawn as one numbered group: hover it for the names, click it to zoom in until they separate (groups never form at the closest zoom, or while you draw an outline). The map has a framed edge, a compass and, when you are zoomed in, an **overview** of the whole map in the corner showing where you are; click the overview to go there. **Panels** sets the map's panels dark (the chart's own palette) or in the app's theme; the overview can be turned off. Both choices are kept on this device, and the player maps have them too.

## Encyclopedia

Each entry has a stable ID (for example `NPC-010`, `VLT-305` or `CON-001-DOM`), original name and aliases, category, parent, realm, canon status, source references and tags. Those fields are preserved through imports and revision history.

Record pages provide facts, identified GM-only text, child records, connections, campaign state and revision history. The Markdown editor supports live preview, autosave, a save indicator, change reasons and conflict protection. A line-by-line history diff lets you restore prior versions; duplication creates a `PROPOSED` record rather than changing the source.

To cross-link records in natural prose, use `@[Mara Venn]` or type `@` and select a suggested record. If names collide, a suggestion can include a distinguishing type, such as `@[Kaelholm (Settlement)]`. Links feed the relationship graph. Existing `Name [ID]` references remain supported and render using the record name.

IDs, source citations, filenames, tags and editorial annotations are hidden by default in normal play-focused screens. Enable **Settings → Technical details**, or launch with `WORLDKEEPER_DEBUG=1`, to show them. New records start from library templates; unsupported facts remain `UNDEFINED`, and likely duplicates trigger a warning.


## NPC and faction profiles

### NPCs

Structured fields include pronouns, species, role, appearance, voice, home, factions, goals, pressures, secrets, knowledge, disguise, game statistics and portrait. Each field shows the corresponding source-library text read-only alongside your own value; fields with no source fact show `UNDEFINED`.

Campaign-specific fields track attitude toward the party, status, current location, last encounter (updated from the session log), known information, promises, debts and recent actions. These do not rewrite the canonical character record.

### Factions, cults and families

Structured fields include ideology, leaders, headquarters, resources, allies, rivals, goals and secrets. Campaign fields include active plans, attitude, recent events and influence by region. **Faction Agendas** shows a regional influence matrix and marks areas contested by multiple factions. Agenda progress tracks are advanced explicitly by the GM, with a reason.

## Search and relationships

Global search (`Ctrl+K`) covers names, aliases, stable IDs, tags, full text, original sources, sessions, quests, adventures and notes. Filters include realm, record type and canon status.

Relationships include Lives in, Leads, Member of, Allied with, Opposes, Controls and Seeks. Source-derived relationships can come from parent fields, leaders and cross-references, while others are curated. An interactive graph displays a focused neighborhood with filters for depth, entity type, continent, era, canon status and relationship type.

## Worlds & Realms

Your cosmos is yours to define (**Codex → Worlds & Realms**): realms (planes of existence) hold worlds or domains, worlds hold continents, continents can hold region groups, and domains can hold deeper domains. The app keeps that nesting. Each has a name, colour, icon and one-line description, a page, and a place in the sidebar under what holds it; records, maps and timeline events belong to one, and a campaign is set in a world. Rename a realm and everything follows; archive one to hide it without touching its records. In the Worldkeeper setting, The World sits in the realm of Evershroud with Aetheris and Kaelmar as its continents, and the Ethereal Realm is a realm beside Evershroud, holding the Hollow Verge with its six deeper domains beneath it, all built the same way. Players only ever see realms that hold something you've revealed.

## Record types and templates

Every kind of record (settlement, NPC, faction, deity...) knows what it is: a place, a group, a person, something you can carry. The app uses that, not a fixed list, so a type you add yourself works everywhere a built-in one does: on maps, in pickers, on the handbook. Add your own in **Library → Templates** (a Tavern, a Starship), with its own ID prefix.

Each type has a **template**: the facts it should have (a town's population and who rules it; an NPC's pronouns, looks and manner) and its sections, each with guidance on what to write and an example from the Worldkeeper setting. Sections marked GM only are never shown to players. **New record** shows you what the template asks for and starts your record with it. Duplicate any template to make it your own and change it as you like; a change affects only new records.

## Setting packs

A setting is a pack you can add to your library or leave out: its realms, record types, templates, records, maps, adventures, tables and tools. **Library → Setting packs** installs, updates and removes them, taking a backup first each time. Updating brings in what's new without touching your own records; removing takes out only what the pack brought. If one of your records already has an ID the pack uses, yours is kept and the page tells you. The Worldkeeper setting is the first pack; a library without it is plain D&D, with none of its tools in the menus.

## Calendars

Each world has its own calendar: its months and how long they are, days outside the months (an equinox, a festival day), weekdays, seasons, moons, how years are written ("1247 AR", or "300 AB" with "Year 31 Unbound" alongside), and its yearly festivals. A setting pack brings its own (the Worldkeeper setting's 363-day year of Aetheris and Kaelmar); a world of your own starts with twelve months of thirty days, and **Campaign → Calendar → The world's calendar** switches it to one like ours, back to a pack's, or to one you write out yourself, line by line.

A campaign's date is kept as a year and a day, so changing the calendar keeps every campaign where it was; only how the date reads changes. The campaign's page sets where it started and where it is now with the calendar's own months; the Calendar page, travel, the session briefing, the players' calendar and the party export all read the world's calendar.

## World branches and timelines

### Aetheris

A Crystal Shards table tracks lore power, GM-only canonical location and interested parties, plus campaign-specific holder, location, shardscarred bearer and cult activity. A dominions and factions overview connects the political and geographical structure.

### Kaelmar

The Thirteen Vaults tracker records location, purpose, key and canon state, alongside campaign-specific clues, guardians, consequences and vault state. The documented default campaign starts at **300 AB**, with all vaults sealed.

### Ethereal Realm

An explorer distinguishes the border layer from deep domains. It connects crossing requirements, hazards, Thinning and Unmaking, inhabitants and access conditions.

### World overview and chronology

World views connect the timeline, cosmology, pantheon, peoples, magical systems and mysteries. **300 AB = Year 31 Unbound** in the documented chronology. Events without documented dates are not assigned invented ones. Timeline eras are drawn from the library's `era/` tags where possible. Linked records can supply an event's era; other events can be manually classified. Eras can be renamed, ordered and filtered.

## World Atlas

Import maps in PNG, JPEG, WEBP or GIF format, or create abstract diagrams for unusual spaces such as the Ethereal Realm. Navigate World → Continent → Region → Settlement → Building, including drill-down from markers to more detailed maps.

Maps support draggable record-linked markers, categories, layers, region boundaries, routes and GM-only or player-visible items. The **Unplaced locations** view includes source wording such as “east of centre” or “half a day from…” and leaves placement to the GM; it does not fabricate coordinates.

**Disclosure caution:** Map assets, marker labels, and descriptive metadata should be reviewed before they are made available to players. A location name can disclose lore even when the associated record is hidden. See [Player View & Publishing](PLAYER_VIEW.md).

## Campaigns

Create multiple campaigns within the same world, each with a premise, dates, status, players, active factions and notes. A **campaign state overlay** records campaign developments without overwriting encyclopedia records. Developments that should become shared lore are proposed through **Canon Review**, then approved or rejected separately.

Party sheets provide 2024-oriented D&D basics: ability scores and modifiers, level-based proficiency, saving throws, skills, AC, HP, initiative, conditions, exhaustion, concentration, spell slots, rest tracking, equipment and custom setting mechanics.

Each character has a full **D&D 2024 character sheet** that holds everything on the official sheet, laid out like a ledger. A framed portrait, identity and the numbers needed every turn sit down the side: Armor Class with Shield, initiative, speed, Proficiency Bonus, passive Perception, size, Hit Points with a damage and healing box, Hit Dice, death saves, Heroic Inspiration, and short and long rest buttons. Everything else is in tabs:

- **Abilities**: ability scores with their saving throws and skills grouped under them, proficiency and Expertise shown as diamonds, passive scores, armor training, weapon, tool and language proficiencies, and Weapon Mastery.
- **Combat**: weapons and damaging cantrips (pick a weapon and its bonus and damage are worked out), class resources such as Rage or Focus Points, conditions, Exhaustion and concentration.
- **Spells**: spellcasting ability, modifier, save DC and attack bonus, spell slots with totals from the class table, and cantrips and prepared spells with casting time, range, Concentration, Ritual, Material and notes. Spells are picked from the SRD 5.2.1's 339 spells, with their full text.
- **Inventory**: armor worn (which sets AC), equipment, three magic item attunement slots and coins.
- **Features**: class features, species traits and feats as cards with their rules text, filled in from the SRD for its classes, subclasses, species and feats.
- **Story**: appearance, personality and backstory.
- **Thinning**: the world's own page (below).
- **Log**: every change, who made it (the player or the GM) and when. A burst of typing makes one entry.

The rules come from **rules packs**: the built-in SRD 5.2.1 (character rules and spells, plus its creatures, magic items, gear and hazards for the GM), which you can turn off, and packs you import from your own books or homebrew as a zip of Markdown files (see [Rules packs](RULES_PACKS.md)). Packs stay in your library: the GM app and table server use them, but they never reach the published handbook or an export. Each people page names the species rules it uses, and the sheet uses exactly those, so a Sea Elf never picks up the SRD's Elf traits.

Packs imported from your books also bring **creatures and items**:

- **Your Books** (DM Tools) lists every creature and item, with search and filters by challenge rating and rarity. Only the GM sees it.
- The **encounter tracker** has a "From your books" field: pick a creature and its name, HP, AC and initiative fill in, and its stat block opens from its row.
- An **NPC card** that says "Use the Priest stat block" carries the full Priest block from your books, folded under the card.
- **Treasure** shows what rolled items and the party's items do, and so do the players' Party Treasure page, a sheet's equipment and attuned items, and the builder's starting kit. Generic magic items work on any base item, so "Flame Tongue Longsword" or "Weapon, +1" find their rules.

Species, class, subclass and background are dropdowns: the world's peoples (each noting which species rules it uses), the classes, the subclasses each class page lists, and the world's and the Player's Handbook's backgrounds, with **Other…** for anything else. **Fill in basics** sets a class's saving throws, Hit Die, training and resources. The GM edits everything on the sheet, the level and Thinning included; the GM's setting mechanics, world ties and notes are on a **GM only** tab that players never see, in the sheet or its log.

Each character also has a **character page** for the world's own rules: their named memories, their true name and who knows it, and their Thinning track. Players keep their sheet and page up to date on the player server with a private code (they can change everything but level and Thinning); the GM is the only one who changes Thinning, and can give a sheet a new code. A struck memory stays struck. Portraits, sheets, pages and their change logs travel with campaign exports and backups, and never appear in the published handbook.

The handbook's **Make a Character** builder makes a complete character at any level from 1 to 20, step by step, with the sheet building itself alongside: people, class and subclass, background, ability scores (standard array, point buy, rolled or entered, then the background's increases and each Ability Score Improvement or feat), skills, Expertise, languages and weapon masteries, starting equipment or gold, spells, portrait, looks and personality, and ties to the world. It ends with the sheet on two printable pages laid out like the official one, and on the table server **Send to my sheet** fills in the player's sheet (at the level the GM set). In the GM's own app (Player View), **Save to Party and Characters** adds the finished character to a campaign's party, with its portrait, and opens it there; the table server and the published handbook never show this button.

Quests support a **players see** flag. Adventures include premise, hook, stakes, opposition, clues, obstacles, rewards, approaches, consequences and an **if ignored** outcome. Story arcs connect related adventures. Scenes can be reordered, reused across adventures, and arranged in a branching visual flow editor.

## Session preparation and play

### Session preparation

Prepare recaps, party location, goals, scenes, NPC notes, read-aloud text, clues, encounters, treasure, consequences and unresolved questions.

### Live Session Mode

The table-side dashboard consolidates current scene and read-aloud material, encounter tracking, a quick event log, quest updates, proposed changes, relevant NPC cards and dice. From the session you can reveal a record's existence, an allowed section or a fact written for players. Reveals are recorded in the session log and available to the recap workflow. GM-only and secret sections are not selectable for ordinary publication.

### After the session

Generate a recap draft from recorded events and edit it before sharing. Review proposed world changes and choose what should remain campaign-specific or enter Canon Review.

### Encounter and initiative tracker

Roll or enter initiative, manage rounds and turns, track damage, healing, temporary HP, 15 conditions, 2024 concentration saving throw DC, defeated and hidden combatants, and add the complete party to an encounter.

Other table tools include a DM screen, NPC quick-reference cards, faction agendas, world events, random tables and dice notation such as `2d6+3`, `1d20 adv`, `4d6kh3` and `d%`.

Rules reference entries use labels: `OFFICIAL`, `HOMEBREW`, `OUTSIDE 2024 CORE` or `UNVERIFIED`. Worldkeeper does not bundle purchased rulebooks or licensed monster stat blocks.

## Modules: a standard D&D campaign, or the Worldkeeper setting

The app runs as a plain D&D 2024 campaign tool with whatever books you import. Optional features are **modules**: a setting pack switches on its own, and you can switch any of them on or off for your own world in **Settings → Modules**, for the whole library or for one campaign.

| Module | What it covers |
| --- | --- |
| Thinning, true names and memories | The Thinning tab on sheets and character pages, with true names, named memories and Shardscarred |
| The Return (a clock) | A clock for the GM, with stages, omens and a jump from the setting pack; its signs and omens for players |
| Fading salvage | Treasure from some regions fades unless it's anchored |
| The setting's treasure | The Treasure tool's regional tables and the world's own items. Off: it rolls from your books |
| Vaults | The sealed vaults page: keys, conditions and state per campaign |
| Shards | The shards page: holders, locations and state per campaign |
| Depths explorer | A realm of layered domains, from the border to the deep |
| Quick reference | The setting's own one-page reference |
| Renown | Faction standing, with ranks from the setting pack (or a plain ladder: Hostile, Unfriendly, Neutral, Friendly, Honoured, Revered) |

A switched-off module leaves the menus, the sheets, the player view and the published handbook, and its pages and actions are refused. Nothing is deleted: its data stays, and comes back when you switch it on. A library without a setting pack starts with every module off. Your players' own notes are always on their character page, in their own tab.

**From your books** (see [Rules packs](RULES_PACKS.md)):

- **Character options.** The sheet and the builder list the world's peoples, classes and backgrounds first, then every other species, class, subclass and background in your rules packs. With no world pages, the books' options are the whole list.
- **Treasure.** The Treasure tool rolls at any place in your world: a place your setting pack covers uses its regional tables (when the setting's treasure is on); anywhere else rolls magic items by tier and rarity from the SRD and your books, with gems and art objects for goods, scaled by the place's **Wealth** (a poor place has half the coin and an item fewer; a rich one double the coin and an item more). The 2024 treasure tiers belong to the rules, not to any setting.
- **Encounters.** Your Books → Encounters, and "Suggest from your books" in a live session, offer groups of creatures for the party's level within the Dungeon Master's Guide (2024) XP budget, in a place's terrain. A place's **Terrain**, **Danger** and **Wealth** are facts on its record (forest, hills, coast…; safe, risky or deadly; poor, modest or rich), and a place takes any it doesn't give from the place it's in; a setting pack can give terrain for its own places (the Worldkeeper setting's `encounters/terrain.json`). Danger sets the difficulty. "Put in the tracker" makes it an encounter, with HP, AC, initiative and stat blocks filled in.
- **Encounter tables for any region.** A region's panel on the map has **Make a table**: eight rows of creatures from the rules packs you have on, for its terrain and danger and the party's level. **Regenerate** rebuilds it; **Copy to edit** makes it your own. Hand-made tables (a pack's or yours) come first, and a journey that rolls encounters where there is no table gets one made. Random tables now belong to a region and a band of levels.
- **The setting's rules.** The Worldkeeper setting brings its own rules pack (84 creatures, 8 hazards and 34 items, CC BY 4.0), switched on when you install the setting and off when you remove it; you can also turn it on in any library in Settings → Rules packs. Its stat block cards show only while it's on. With Thinning switched off, its few Thinning-based entries use standard-rules versions.
- **Stat blocks of your own.** A creature or NPC of yours can have a stat block: a block from the SRD or your books, with what's different about this one and how it fights. It shows on its page and in the encounter tracker.
- **Open rules for players.** An openly licensed pack (CC BY, OGL, CC0, ORC) can be published: tick Publish to players, and its options join the SRD in the published handbook's character builder. Packs from your own books never are.
- **Open content.** Settings → Rules packs → Add open content from Open5e brings in openly licensed sources (Level Up A5E, Kobold Press and others), each as its own pack with its licence.
- **Encounter tables.** When a table row names creatures in plain words ("4 bandits and a bandit captain"), their stat blocks from your books are a click away. The setting's own creatures keep their own stat blocks.

**The rules are D&D 2024.** The sheet and builder do their arithmetic by the 2024 rules: backgrounds raise ability scores, the 2024 class tables, weapon mastery. Books written for the 2014 rules import fine, and their species, subclasses, spells, feats, items and creatures can be used, but characters are built and calculated the 2024 way.

## Library management

The **Library** menu (the gear, top right) holds import preview, confirmation and history, exports, Canon Review, broken-reference reporting, change history, backup and restore, and app settings.

**Canon controls:** Changes are versioned with reasons. Edited canonical records can be reviewed using diffs and either approved or reverted. New entries start `PROPOSED`; campaign overlays do not silently promote local developments to universal canon. Protected setting bibles and original references are retained verbatim.

**Import controls:** Preview handles duplicates, source precedence, redirects, templates, edits made locally, and unavailable references. Unchanged entries stay untouched, and disappearing source entries are not automatically removed.

For the detailed import/export and restore workflow, see [Data, Imports, Backups & Exports](DATA.md).

## Player view and distribution

The local `/player` interface provides a preview of material that has been explicitly revealed. A separate player-only server on port 4320 mounts no DM routes and is intended for trusted LAN use. Its one write route is a character's own page, opened with that character's private code. A static handbook can be exported as a ZIP or published to a GitHub Pages branch. The handbook updates when republished, not whenever the local campaign changes.

**Important:** Publication filtering should be tested and manually reviewed, especially for labels and other indirect disclosure paths. Content placed in Git history may remain accessible after it is removed from a newer snapshot. See [Player View & Publishing](PLAYER_VIEW.md).

## Interface and technical options

The application has two themes, **Warm Parchment** (the default) and **Dark Codex**, switched from the top bar and remembered on each device (Settings also has **Reduce texture**). Navigation collapses to an icon rail; the Live page and the player side are laid out for tablets and phones at the table. The shared components and the design rules are in [the design overhaul](DESIGN_OVERHAUL.md); developers can see every one on the Style Guide page (debug mode). A Tauri desktop build path bundles the server, SQLite driver and its runtime to avoid requiring an external Node installation for end users.

The world is stored locally in SQLite plus an uploads folder; no paid API or AI dependency is required. An optional AI assistant is planned, but is not represented as a shipping feature. If developed, generated content should enter as `PROPOSED` drafts and require GM approval.

## Canon and safety principles

- Missing source facts are left `UNDEFINED`, not invented.
- Original source documents and stable IDs are preserved.
- Revisions and review decisions remain traceable.
- Campaign state is distinct from shared world canon.
- Player-facing information is built through a dedicated, filtered projection.
- Markdown rendering excludes raw HTML; uploaded images are content-checked and SVG files are refused under the documented policy.
- External writes are validated.

These describe the application's intended and tested design constraints, not an absolute promise of bug-free operation. For security issues, see [Security Policy](../SECURITY.md).
