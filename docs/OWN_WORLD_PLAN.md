# Your own world: a plan

**Status:** approved direction (owner answers in §4, 22 November 2026). Nothing here is built yet.
**Goal:** someone who opens a fresh Worldkeeper with no archive to import can click **Next, Next, Finish** and have their own world: named realms, a first campaign and a few records that teach them the system. From then on, every kind of record has a template, a guided way to fill it in, and a modern Markdown editor for anyone who'd rather write it themselves.

**The principle: one foundation.** The app is a framework: realms, record types, templates, records, maps, campaigns, the editor, guided creation and optional modules. The Worldkeeper setting is **content on that framework**, packaged as a **setting pack**. It has no special place in the app's code. A GM's own world and the Worldkeeper setting are built the same way, stored the same way and edited the same way. The only difference is where the content came from:

- a world you make is written by you, starting from the wizard;
- the setting's world arrives in its pack.

The framework has three layers, each independent of the others:

1. **The game system:** D&D 2024 (5e). The sheet, builder, stat blocks, CR and XP maths, the paces and the treasure tiers belong to it.
2. **Rules packs:** the system's content. These are the species, classes, spells, feats and backgrounds, plus the creatures, items and hazards. The SRD 5.2.1 is built in; your books, Open5e sources and a setting's own rules are added as packs.
3. **The world:** realms, records, maps and campaigns. A world is either your own or installed from a setting pack.

A setting pack sits in layer 3 but can bring a rules pack of its own into layer 2 (§2.9).

Anything the setting can do, a world of your own can do too: add realms, use the setting's record types, or switch on one of its modules (§2.0).

## 1. Where we are today

What already helps:

- **Standard D&D mode.** Settings → Campaign mechanics → Standard D&D switches off the setting's own systems (Thinning, the Return, fading salvage, the setting's treasure), and a library without the setting starts that way.
- **Templates exist in the database.** A `templates` table (type, fields, sections, body) exists, but only the archive import fills it, and nothing in the app shows or uses it.
- **Records can be created and edited.** **New record** is a short form with a raw Markdown body. The Edit tab is a plain text area with `@` link suggestions and a Preview beside it. Autosave, revisions and Canon Review all work.
- **The player side is generic.** Realms, reveals and the handbook work for any world.

What stands in the way:

1. **The realms are hard-coded.** `world`, `aetheris`, `kaelmar` and `ethereal` are a fixed list in `shared/domain.ts`, with their own labels, colours, icons and CSS tokens, used in about 13 files. Someone's own world can't have its own continents or planes, or its own colours for them. The database already stores the realm as free text, so this is a code limit, not a data one.
2. **A fresh library is a dead end without the archive.** The dashboard says "Your world is waiting" and offers only **Import world archive**.
3. **Record types mix the generic and the setting's own.** The list includes vaults, vault keys, shards, callings and Ethereal domains alongside towns and NPCs.
4. **New records start as `PROPOSED`.** That suits guarding an imported canon. In your own world, it makes you approve your own writing in Canon Review.
5. **There are no guided paths.** Writing a good town or NPC means knowing what the Aetheris records look like.
6. **Encounters and treasure only know the setting's regions.** Encounters from your books are picked by party level and terrain. But each region's terrain comes from a file keyed by Aetheris region IDs (`assets/encounters/terrain.json`), and treasure pools are keyed the same way. A region in a world of your own has no terrain, so it gets no encounter table or regional treasure.
7. **The setting's rules pack is off by default**, even in a library playing the setting. It holds 84 creatures, 8 hazards and 34 items.
8. **The setting is partly built into the code**, rather than sitting on top of it like any other world:
   - the four realms, and the importer that maps the archive onto exactly those four;
   - State of the World, which works from a fixed list of 19 Aetheris, Kaelmar and Ethereal region IDs;
   - the Vaults, Shards, Dominions and Ethereal explorer pages, and parts of the World Overview and dashboard, which look up specific record IDs (such as `ETH-591` or `WLD-907`);
   - its systems (Thinning, the Return, fading salvage, the setting's treasure), which are switches in Settings and not part of the setting itself.

## 2. The ideas

### 2.0 Setting packs and modules

A **setting pack** is a folder in one format, which anyone could write. It holds:

- its **realms** (§2.1);
- any **record types** it adds to the core ones, each with its own template (§2.2);
- its **templates**;
- its **content**: records in the archive Markdown format, maps with their pins and routes, adventures, encounter and treasure tables, stat blocks and player text;
- the **modules** it turns on;
- its **roles**: which of its records plays which part, e.g. "the overview of the world is `WLD-901`", or "the travel rules are `SYS-906`".

**The Worldkeeper setting is the first pack.** Its content is what the archive and Apply additions supply today. Its realms are _The World_, _Aetheris_, _Kaelmar_ and _The Ethereal Realm_. It adds five record types: vault, vault key, shard, calling and Ethereal domain. It turns on these modules:

- Thinning;
- the Return;
- fading salvage and the setting's treasure;
- vaults and shards;
- the Ethereal depths explorer.

**Modules** are optional features. They live in the app's code but know nothing about Aetheris. Each declares:

- its settings;
- its pages and where they sit in the navigation;
- what it adds to character sheets and the player handbook.

A module finds its records by **type, tag or role**, never by ID. For example, the vaults page lists records of type vault, and the Ethereal explorer lists the realm marked as the _depths_ in its pack. So Settings → Campaign mechanics becomes **Settings → Modules**. A GM with their own world can switch on Thinning, or a Return-style clock, if they want.

The app's generic pages stop naming setting records:

- **State of the World** covers every region and nation in the library.
- The **World Overview** shows each realm's overview record, found by role.
- The **Dominions** page becomes a generic **Nations** view of any continent.

**A world of your own** is the same thing with no pack. Realms come from the wizard, the core record types and templates are there, and no modules are on unless you turn them on.

### 2.1 Realms become data

A **realm** becomes a row the GM owns, no longer a value in the code. It holds:

- **id** (stable, like the record IDs);
- **name**;
- **kind**: World (a material world), Continent, Plane (another realm of existence) or Region group;
- **parent realm** (optional), so a continent can sit inside its world;
- **colour**, chosen from a set of colours already checked for AA contrast in both themes;
- **icon**;
- **one-line description**;
- **order**.

The Worldkeeper setting becomes four rows: _The World_ (World), _Aetheris_ and _Kaelmar_ (Continents in The World) and _The Ethereal Realm_ (Plane). Their ids stay the same, so every existing record, map, filter, export and published handbook carries on unchanged.

**Codex → Realms** lists them, with **New realm** and editing (rename, recolour, reorder, archive). The sidebar's Realms group, the realm badges and colours, the dashboard's realm cards, the filters and the handbook's realm pages all read the realms from the library. Adding "another world in another realm" means adding a World or Plane row; it appears everywhere at once.

Below the realms, the record hierarchy stays as it is: region or nation → settlement → building or landmark, using the existing parent links.

### 2.2 Templates for every kind of record

There is one built-in template per record type, modelled on the Aetheris records: the standard header (name, other names, parent, realm, canon status, tags), the type's own facts, and its sections. Each section carries:

- **guidance**: what goes here, and why it matters at the table;
- **an example** drawn from the setting ("Hollow Refuge: _Every faction needs a place to talk…_");
- **its visibility**: a section is either for players to learn or **GM only**, so the reveal rules work from the first day.

The generic set covers:

- **Places:** World, Continent, Plane, Region, Nation, Settlement (town, city or village), Landmark, Building, Dungeon.
- **People:** NPC, Faction, Cult, Family, People or Culture, Species.
- **Myth and history:** Deity, Event, Cosmology, Magic system.
- **Things:** Artifact, Magic item, Creature.
- **Rules and adventures:** Rule or custom, Adventure hook, Adventure location.

Record types a pack adds (for the setting: vault, vault key, shard, calling, Ethereal domain) come with the pack's own templates. They appear in New and the Codex while that pack, or a module that uses them, is in the library.

Templates ship as Markdown in the archive format (`assets/templates/*.md`), so the archive import, the exporter and people writing by hand all read the same thing. **Library → Templates** lists them and lets the GM edit, duplicate or add their own. A changed template affects only new records; existing records are left alone.

### 2.3 A modern Markdown editor, everywhere

The plain text area gives way to a real editor (CodeMirror 6: bundled, offline, small, and accessible). It brings:

- **Write, Preview and Split** modes, remembered per device, plus full screen.
- **Markdown highlighting**: headings, lists, tables, links and quotes as you type, in the app's fonts and both themes.
- **A toolbar and shortcuts**: bold, italic, heading, list, quote, table, **record link** (the `@` search, carried over), and **GM-only section** (inserts a section the reveals treat as secret).
- **A section outline** beside the text, for jumping around long records.
- **Everything that works today**: autosave, the save status, revision reasons, conflict protection and the "Edited, not yet reviewed" flag.

The same editor is used wherever there's long text: records, adventures and scenes, session prep and recaps, handouts, notes, the player text, and the templates themselves.

### 2.4 New ▸ anything, guided or advanced

A **New** button in the top bar opens a menu of record types, grouped the way the Codex sidebar is (Places, People, Myth and history, Things, Rules and adventures), with recently used types first. Each page can also offer it in context: a region's page has **Add a settlement here**, a settlement's page **Add an NPC who lives here**, with the parent and realm filled in.

Choosing a type opens one of two modes. A switch remembers which one you prefer.

- **Guided.** A short stepper through the template:
  1. **The basics:** the name, where it is (the parent and realm pickers), and the type's own facts as proper inputs (a settlement's population and who governs it; an NPC's role, pronouns and home).
  2. **One step per section:** the guidance, the example, a text box with the editor's toolbar, and **Skip for now**. GM-only sections are marked as they are on record pages.
  3. **Review:** the record as it will look, with its links and what players will see.
  4. **Create.** It opens on its record page, and you can keep editing there.
- **Advanced.** The template's Markdown opens straight in the editor (Split view), with the header filled in. Write, then **Create**.

Both modes make the same kind of record, and either can be finished later. Skipped sections stay in the record as headings with their guidance in a comment, so the record shows what's still to write.

### 2.5 Canon for your own world

Who must approve a new record depends on where the world comes from:

- **Your own world:** new records are **Canon** at once. Canon Review stays available but is quiet. Creating as Proposed remains possible, for ideas you're not sure of.
- **An imported archive** (like Aetheris): today's behaviour stays. New records start Proposed and changes go through Canon Review, which protects the source.

This is one switch, **Settings → Canon → Approve new records in Canon Review**. The wizard sets it, and it can be changed at any time.

### 2.6 The first-run wizard

A fresh library opens on **Start your world** instead of the empty dashboard. Each step can be skipped, and anything it creates can be changed later.

1. **Welcome.** "How would you like to start?"
   - **Build my own world.**
   - **Play in the Worldkeeper setting.**
   - **Restore a backup** (leaves the wizard).

   Both ways continue through the same wizard and end with the same kind of library. **Build my own world** goes through steps 2 to 4. **The Worldkeeper setting** installs the setting's pack instead: its realms, record types, templates, content and modules, from the bundled pack plus the GM's copy of the archive. It then shows what was installed and joins at step 4.

2. **Your world.** The world's name, a one-line pitch, and the name the app goes by. Optionally, the calendar: the year and its name ("1247 AR"), or "I'll decide later".
3. **Its shape.** Pick a starting shape, then rename or add rows. The choices are previews, not commitments:
   - _One continent_: a world with one continent.
   - _Several continents_: a world with two or three named continents.
   - _A world and another plane_: a world, plus a plane such as a fey realm or an underworld.
   - _Start empty_: no realms yet.
4. **Rules.**
   - **Standard D&D 2024** (default) or the setting's mechanics.
   - "Import your books now or later" (the existing rules-pack import).
5. **A first campaign.**
   - The campaign's name.
   - The starting place: pick one, or "make a town for me", which runs the guided Settlement creation with the name filled in.
   - Optionally, the party's names: they become blank characters ready for the builder.
6. **A map (optional).** Upload an image for the world. You can place pins later in the Atlas.
7. **Finish.** A summary of what will be created, then **Create my world**. It opens on the dashboard, with a **Getting started** checklist card.

A finished library can always grow: **New realm** (§2.1) adds another world or plane, and **Library → Setting packs** can install a pack into a world you started yourself. The pack's realms and content then sit beside your own.

### 2.7 Records that teach

The wizard can add a small set of **starter records**, tagged `tutorial`. They are real records, built from the templates, set in the GM's own world (named after the realms they chose) and linked together, so every feature has something to show:

- **Start Here**: what records, realms, campaigns and reveals are, with a checklist of things to try ("Hover the link to The Lantern Inn", "Press `]`", "Reveal the Rumours section to your players", "Open the Atlas").
- **A town** (the starting place, if the wizard made one) with each section filled in briefly. A note in each section explains what the section is for.
- **An NPC** who lives there, with a **GM only** secret, to show how secrets and reveals work.
- **A faction** with an allied link to the NPC, so the inspector and the Relationship graph have something to show.
- **A landmark** nearby, pinned on the map if a map was uploaded.

The dashboard's **Getting started** card follows that checklist and has **Remove the tutorial records** (with a confirmation) once you're done. Tutorial records are never revealed to players unless you reveal them yourself.

### 2.8 What changes for the Worldkeeper setting

**For people playing it, nothing.** An existing library becomes "a library with the Worldkeeper pack installed" when it updates. It keeps:

- its realms, colours and records;
- **Apply additions** (now the pack's update);
- the published handbook;
- every page;
- Canon Review.

**Under the hood, everything that was special about the setting becomes one of three things:** pack data (realms, types, templates, roles, content), a module (Thinning, the Return, vaults and shards, the Ethereal explorer, the setting's treasure), or a generic page. After step 3, a test checks that the app's code names no record ID of the setting outside the pack.

### 2.9 Rules, creatures and items for any world

Rules stay one layer, shared by every world. What changes is how a world, and a setting pack, connect to it.

- **The system is D&D 2024.** Books for the 2014 rules work as they do today, marked as older printings. Other game systems (Pathfinder and the like) are out of scope: the sheet, builder and maths are D&D's.
- **Rules packs belong to the library,** not to a world. The SRD is always there. **Settings → Rules packs** turns your books, Open5e sources and any setting's rules on or off, as now.
- **A setting pack can include a rules pack.** Installing the Worldkeeper setting turns its rules pack on (84 creatures, 8 hazards, 34 items). It also brings the links between its world and the rules:
  - which book stat block an NPC uses ("Use the Bandit Captain stat block, with these changes");
  - which species rules each people uses;
  - its own encounter and treasure tables.

  A pack can also _suggest_ books, as the setting does with the 2024 core books. It never needs them: everything falls back to the SRD.

- **Terrain and danger become facts on records,** not a side file. Every region, nation, settlement and landmark template has:
  - **Terrain:** forest, hills, coast, underdark, planar and the rest, the same terms the creatures' environments use;
  - **Danger:** safe, risky, deadly; with the party's level, this sets the encounter difficulty;
  - **Wealth:** poor, modest, rich; this weights treasure.

  The setting's `terrain.json` becomes these facts on its own region records, so nothing about the setting is special here either.

- **Encounter tables for any region.** A region's encounter table is built from the creatures in the rules packs you have on. They are picked by the region's terrain and the party's level, then grouped by the 2024 XP budgets, as the generator does today. A pack's or the GM's own hand-made table for a region takes precedence. **Regenerate** rebuilds an automatic one. **Copy to edit** turns it into your own.
- **Treasure for any region,** the same way. The automatic pools come from the items in your rules packs, by tier and the region's wealth. Hand-made pools from a pack or the GM come first.
- **Records tied to rules,** in the templates:
  - a **Creature** or **NPC** names the stat block it uses and its changes (the mechanism the setting's NPCs already use), and its page shows the block;
  - a **Magic item** names its rules entry, or carries its own rarity, attunement and text;
  - a **People** names the species rules its members use;
  - a **Deity** can name its domains for clerics.

  The guided creation offers a stat-block or item picker from your packs for these.

- **The wizard's Rules step** (§2.6) shows what's on:
  - the SRD, always;
  - **Import your books** (5etools) and **Add open content** (Open5e), now or later;
  - for the setting path, the setting's rules pack, already ticked;
  - the setting's systems (Thinning, the Return…) as modules you can untick.

## 3. Delivery plan

Each step is its own PR with screenshots, merged on the owner's OK. As before, the release comes last.

| Step | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | You review                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Realms as data:** the `realms` table and migration (the setting's four become rows, ids unchanged), the API, Codex → Realms (new, edit, recolour, reorder), and everything that reads realms reading the library instead of the code: sidebar, badges, colours, filters, dashboard, handbook. No visible change for existing libraries                                                                                                                                                                                                                                                                                                                                                                                       | A new realm appearing everywhere; Aetheris unchanged                                                                                  |
| 2    | **Record types and templates:** the core types and their built-in templates in `assets/templates/`, record types a pack can add, Library → Templates (view, edit, duplicate, new)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The templates for a town, an NPC and a faction                                                                                        |
| 3    | **The setting as a pack:** the pack format and its manifest (realms, types, templates, content, modules, roles); the Worldkeeper setting moved into it; modules for Thinning, the Return, fading salvage and treasure, vaults and shards, and the Ethereal explorer; Settings → Modules; State of the World, the World Overview and Nations made generic; no setting record IDs left in app code (with a test); existing libraries migrated to "Worldkeeper pack installed"; its rules pack switched on by the pack; terrain, danger and wealth as facts on records (`terrain.json` folded into the setting\'s records); encounter tables and treasure built for any region from your rules packs, with hand-made tables first | An existing Aetheris library unchanged; a blank library with Thinning switched on; an encounter table rolled for a region of your own |
| 4    | **The editor:** CodeMirror with Write/Preview/Split, toolbar, `@` links, GM-only sections and an outline, used for every long text in the app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Editing a record, a scene and a handout                                                                                               |
| 5    | **New ▸ anything:** the New menu, contextual "Add … here", Guided and Advanced creation, and the Canon setting for your own world                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Making a town both ways                                                                                                               |
| 6    | **The first-run wizard and the starter records:** the choice between your own world and the Worldkeeper setting on one path, the shapes, the first campaign and town, the optional map, the tutorial records and the Getting started checklist; Library → Setting packs                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A fresh install both ways: Next, Next, Finish                                                                                         |
| 7    | **Docs, screenshots and a release** (v0.5): Quick Start rewritten around both ways to begin, and a guide to writing a setting pack                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The release                                                                                                                           |

**Tests at each step:**

- the realms migration on an archive library and an empty one;
- templates round-tripping through import and export;
- the editor's autosave and conflict protection;
- creation in both modes;
- encounters and treasure for a region of your own, from the SRD alone and with books imported;
- the setting pack installing into a fresh library, and an existing setting library migrating to it with no change to its records, maps or handbook;
- no setting record IDs in app code;
- the wizard end to end in the E2E smoke, both ways, from a fresh library to a finished world;
- the bundle guard, so the player side still carries no GM code.

## 4. Owner answers (22 November 2026)

1. **Canon for your own world: Canon at once.** In a world you make yourself, new records are Canon as soon as they're created. Canon Review stays on for imported archives, and the setting can be switched either way (§2.5).
2. **Tutorial records: on by default, removable.** The wizard ticks them by default. The dashboard's Getting started card removes them in one click (§2.7).
3. **The editor: CodeMirror 6** (§2.3).
4. **Worlds: realms in one library.** One library holds as many worlds, continents and planes as you like (§2.1). Several separate libraries you switch between are left for later.

Decided by default, unless the owner says otherwise:

- **Realm kinds:** World, Continent, Plane and Region group.
- **Pack record types** (for the setting: vault, vault key, shard, calling, Ethereal domain): shown while their pack or module is in the library, hidden otherwise. Existing records of those types always show.

Added on 22 November 2026, at the owner's request: **rules for any world** (§2.9). There is one game system, D&D 2024, whose content comes from rules packs (the SRD, your books, Open5e, a setting's own). A setting pack can bring and switch on its own rules pack. Terrain, danger and wealth become facts on records, so encounter tables and treasure work for any region.

Added on 22 November 2026, at the owner's request: **one foundation.** The Worldkeeper setting is built on the same model as a world of your own: a setting pack of realms, record types, templates, content and roles, plus modules for its systems. The first run offers both ways to start in one wizard (§2.0, §2.6, §2.8, step 3).
