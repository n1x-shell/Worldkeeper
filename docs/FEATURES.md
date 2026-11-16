# Worldkeeper Feature Reference

[← README](../README.md) · [Quick Start](QUICKSTART.md) · [Development Status](../DEVELOPMENT_STATUS.md)

This document describes the features documented for Worldkeeper v0.2. For implementation completeness, test outcomes and known issues, refer to [DEVELOPMENT_STATUS.md](../DEVELOPMENT_STATUS.md). No official rulebook text or monster stat blocks are bundled; rules and statistics come from your own sources or entries.

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

Each character has a full **D&D 2024 character sheet**: species, class, subclass, background, alignment, size and experience; ability scores and saving throws; skills with proficiency and expertise; Armor Class, initiative, speed, Hit Points (current, maximum and temporary), Hit Dice, death saves, Heroic Inspiration, Exhaustion, conditions and concentration; armor, weapon, tool and language training and Weapon Mastery; weapons and damaging cantrips; spellcasting ability, save DC, attack bonus, spell slots and a spell list; class features, species traits and feats; equipment and coins; and appearance, personality and backstory. Modifiers, proficiency bonus, save and skill bonuses, passive scores and spell DC are worked out, and a long-rest button restores what a 2024 long rest restores. The GM's setting mechanics, world ties and notes stay GM-only.

Each character also has a **character page** for the world's own rules: their named memories, their true name and who knows it, and their Thinning track. Players keep their page and their character sheet up to date on the player server with a private code (they can change everything but level and Thinning), and the handbook's guided character builder can fill the sheet in; the GM sees it on the party screen, is the only one who changes Thinning, and can give a page a new code. A struck memory stays struck. Character pages travel with campaign exports and backups, and never appear in the published handbook.

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

## Library management

Library Management contains import preview, confirmation and history, exports, Canon Review, broken-reference reporting, change history, backup and restore, and app settings.

**Canon controls:** Changes are versioned with reasons. Edited canonical records can be reviewed using diffs and either approved or reverted. New entries start `PROPOSED`; campaign overlays do not silently promote local developments to universal canon. Protected setting bibles and original references are retained verbatim.

**Import controls:** Preview handles duplicates, source precedence, redirects, templates, edits made locally, and unavailable references. Unchanged entries stay untouched, and disappearing source entries are not automatically removed.

For the detailed import/export and restore workflow, see [Data, Imports, Backups & Exports](DATA.md).

## Player view and distribution

The local `/player` interface provides a preview of material that has been explicitly revealed. A separate player-only server on port 4320 mounts no DM routes and is intended for trusted LAN use. Its one write route is a character's own page, opened with that character's private code. A static handbook can be exported as a ZIP or published to a GitHub Pages branch. The handbook updates when republished, not whenever the local campaign changes.

**Important:** Publication filtering should be tested and manually reviewed, especially for labels and other indirect disclosure paths. Content placed in Git history may remain accessible after it is removed from a newer snapshot. See [Player View & Publishing](PLAYER_VIEW.md).

## Interface and technical options

The application includes a dark fantasy default theme, a readable light theme, collapsible navigation, search shortcuts, and responsive layouts for tablet and phone use. A Tauri desktop build path bundles the server, SQLite driver and its runtime to avoid requiring an external Node installation for end users.

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
