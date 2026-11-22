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

### 2.10 What the audit added (22 November 2026)

A full audit of the code (Appendix A) found more of the setting built into the app than §1 listed. These parts of the foundation come from it.

**Record types become a registry.** Each type, core or added by a pack, declares:

- its key, label and plural;
- its ID prefix;
- its icon, colour and map pin kind;
- its template;
- its **traits**:
  - `place` (can be somewhere and have people in it);
  - `regionLike` (can have a region panel, terrain and encounter tables);
  - `holdable` (an item someone can carry);
  - `group` (a faction-like body);
  - `commonNoun` (too ordinary a name to auto-link).

Every hard-coded list of types reads these traits instead: map pins, region panels, place pickers, the session briefing's chain of places, State of the World's place counts, the handbook's place types, the consistency checks and the graph's groups. **Nothing works out a record's type from its ID prefix any more.** New records get their type's prefix (e.g. `TWN-0001`), not `CUS-`. ID patterns are built from the registry at run time, so a pack's own prefixes import and link. The importer reads `Category:` against the registry's keys and labels and `Realm:` against the library's realms. A Markdown export therefore re-imports with every record's type and realm intact.

**Where each thing came from.** Every row a pack or an import adds is marked with its source (`pack_id`):

- records and relationships;
- timeline rows;
- rumours, mysteries, secrets and clues;
- maps, markers and outlines;
- adventures, random tables and templates.

Syncs, updates and deletes are scoped by that mark. Shipped content is keyed by pack and key, never by title or map name. That makes it safe to:

- install a second pack beside the first;
- update a pack without touching the GM's own work;
- uninstall a pack.

A pack's IDs are checked for clashes when it installs. Packs live in folders with a manifest:

- the ones bundled with the app stay in the app's resources;
- installed ones go to `<data>/packs/<id>`, so the desktop app can install them too.

The loaders (stat blocks, the treasure catalogue, omens and the rest) go through the installed packs. They no longer read one fixed `assets/` folder.

**Pack actions only when the pack is there.** These become actions of the installed pack, scoped by `pack_id`, and are hidden without it:

- Apply additions (the pack's update);
- Mysteries → Update from drafts;
- Rumours → Update from handbook;
- Match the published handbook;
- the open-questions rules;
- the treasure checks in Consistency.

Today they all run in any library: one click in your own world imports about 460 Aetheris records.

**The setting's handbook rules move into its pack**, along with its archive-cleaning rules, as pack data:

- its spoiler terms (the 13 vault names, the Forgotten One…);
- its editorial headings;
- its citation style;
- the sentences it hides ("the bible", "verify"…).

These cleaners then apply only to records from that pack, because today they would silently delete a GM's own "## Status" section, or any sentence mentioning "the books". The core keeps only the generic rule: GM-only and secret sections stay GM only. The archive's folder layout and timeline file become that pack's **import profile**.

**Modules own their storage, routes and exports.** Each module declares:

- its tables, or its data in a per-character or per-item extension;
- its server routes, switched off with the module;
- its pages and sheet tabs;
- its player-handbook parts;
- its export tables.

Thinning's track, true names and Shardscarred leave the core `character_pages` columns. Fading and anchored leave `party_treasure`. The players' own notes move to a core tab: today they sit inside the Thinning tab and vanish when Thinning is off. The module list grows:

- **Renown:** faction standing with ranks a pack defines; the setting's ladder comes from its rules.
- **A clock:** stages, triggers and omens a pack defines; the setting's Return is one.
- **Quick Reference:** the setting's own reference, as a module page.

Modules default to **off** unless a pack turns them on. Today an unknown library defaults to the setting's preset, and the setting is detected by whether records `SYS-907` or `REG-001` exist. They can be set per campaign, falling back to the library's choice.

**The calendar becomes data.** A **calendar definition** belongs to each world, or comes from a pack. It holds:

- the months (names and lengths);
- intercalary days;
- weekdays;
- seasons;
- moons;
- eras and how years are written ("AB", "Year N Unbound");
- yearly festivals.

The Worldkeeper calendar ships in its pack. A new world picks one of these:

- _twelve months of thirty days_;
- _like ours_;
- its own.

Campaign dates are stored as a year and day, not text, and formatted through the world's calendar. The 363-day limit, the AB parsing, the "300 AB" defaults and the fallback to year 300 all go. The setting's festivals, with their gods and places, become pack data (or records with a holy-day fact), plus the GM's own yearly events. The players' calendar gets its definition in the handbook snapshot. Timeline rows get realm ids and calendar dates in place of free text, and eras are defined in the calendar, no longer read from the archive's tag documentation.

**Features read structured facts, not the archive's prose.** The templates (§2.2) carry, as fields, what features now find by parsing the setting's writing:

| Feature                            | Fact                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Region holder (State of the World) | ruling faction                                                              |
| Name generator                     | common names and naming style                                               |
| Rumours                            | what people say                                                             |
| Faction web                        | allies and opposed                                                          |
| Who's nearby                       | looks, manner, pronouns                                                     |
| Standing                           | ranks                                                                       |
| Character builder                  | species rules for a people; backgrounds, starting places and subclass names |
| Handbook                           | a people's continents                                                       |

Features read the facts first. For the pack's own records, the pack's import profile converts its prose into facts once, at install. The handbook stops guessing a people's continents from the words "Aetheris" and "Kaelmar" in its text. The **Classes** tab of the players' Species and Classes stops depending on the setting's calling records: it lists the classes from the rules packs, with a world's own names for them where a record gives them.

**Roles, not IDs, wherever a page needs "the" record.** These all name their records by role:

- the world's overview, and each realm's overview (the handbook's "Start here" too);
- the travel rules;
- the Return's stages;
- the canon conflict and decisions registers;
- the table cards for Print;
- the graph's starting record.

A role with no record simply hides its part of the page.

**Per world, not per library,** wherever it matters:

- **campaigns** belong to a world (a realm of kind World);
- **reveals** are per campaign, as rumours and discoveries already are;
- **the published handbook** is per campaign or world;
- **settings that are per world**, the calendar, date and default realm among them, live on the world.

**Rules data in the rules layer.**

- **The 2024 treasure tiers** move into the rules layer: today they're in the setting's `pools.json`, so treasure doesn't work without it.
- **Random tables** get a region, level band and pack column, so a table belongs to a region in the data, not in a `source` string.
- **Stat blocks** can live in the library, so a GM can give their own NPC one. The setting's cards show only while its rules pack is on.
- **A pack's open-licence rules** can be published to players.
- **Consistency** checks classes against the rules packs, not the 13 core names.

**Exports are complete.**

- A test checks the JSON export's table list against the schema.
- **Campaign exports** carry all campaign data (standing, treasure, handouts, Bastions, calendar events, the clock…). They also carry a header naming the world and packs they need, with a report of anything missing on import.
- **The Markdown export** keeps canon flags, reveal state, templates and realms.
- **The full-world zip** gets an import.

**Empty libraries just work.** Every page has a proper empty state and never waits forever or opens on a missing record. Today:

- the Name Generator loads forever with no peoples;
- the Graph opens on Kaelmar;
- the Faction Web is blank for any realm the setting doesn't have;
- Treasure falls back to "the Marches".

**The name.** "The Worldkeeper" is both the app's name and the setting's. The wizard's copy needs them told apart (§4).

## 3. Delivery plan

Each step is its own PR with screenshots, merged on the owner's OK. As before, the release comes last. The audit made the foundation steps (1 to 6) larger than first planned. They come first, because everything after builds on them.

| Step | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | You review                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | **Realms as data:** the `realms` table (the setting's four become rows, ids unchanged); Codex → Realms; everything that reads realms reads the library (sidebar, badges, colours, filters, dashboard, the handbook's realm lists, Faction Web, Rumours, Timeline); maps and timeline rows belong to a realm; campaigns belong to a world                                                                                                                                                                                        | A new realm appearing everywhere; Aetheris unchanged                            |
| 2    | **The record-type registry and templates:** types with prefixes, traits, icons and pin kinds; every hard-coded type list and prefix test replaced; per-type IDs for new records; the importer reading Category and Realm through the registry (export and re-import keeps types); the built-in templates with structured facts; Library → Templates                                                                                                                                                                             | Making a town and an NPC; an export re-imported intact                          |
| 3    | **Packs:** the pack format, manifest and registry (bundled and installed folders); `pack_id` provenance on every shipped row; scoped syncs, update and uninstall; ID clash checks; the Worldkeeper setting moved into its pack with its import profile, handbook rules, cleaning rules, roles and player text; pack actions (additions, mysteries, rumours, handbook match, open questions, treasure checks) shown only with their pack; roles in place of record IDs everywhere, with a test that app code names no setting ID | An existing Aetheris library unchanged; a blank library with no setting actions |
| 4    | **Modules:** the module registry (settings, routes, pages, sheet tabs, storage, exports); Thinning, the clock (the Return), fading and the setting's treasure, vaults and shards, the Ethereal explorer, Renown and Quick Reference as modules; module data moved out of core tables; players' notes to a core tab; default off; per-campaign toggles; Settings → Modules                                                                                                                                                       | A blank library with Thinning on; the Aetheris library unchanged                |
| 5    | **The calendar as data:** calendar definitions (months, days, weekdays, moons, eras, year formats, festivals); the setting's in its pack; presets for new worlds; structured campaign dates; the calendar pages, journeys, briefing, player calendar and party export reading it                                                                                                                                                                                                                                                | A twelve-month calendar on a new world; Aetheris dates unchanged                |
| 6    | **Rules for any world:** terrain, danger and wealth on records; encounter tables and treasure for any region from your rules packs; random tables with a region and level band; treasure tiers in the rules layer; stat blocks in the library; the setting's rules pack switched on by its pack; publishable open rules; consistency against the rules packs                                                                                                                                                                    | An encounter table and treasure rolled for a region of your own, SRD only       |
| 7    | **The editor:** CodeMirror with Write/Preview/Split, toolbar, `@` links, GM-only sections and an outline, for every long text                                                                                                                                                                                                                                                                                                                                                                                                   | Editing a record, a scene and a handout                                         |
| 8    | **New ▸ anything:** the New menu, contextual "Add … here", Guided and Advanced creation, pickers for stat blocks, items and species rules, and the Canon setting for your own world                                                                                                                                                                                                                                                                                                                                             | Making a town both ways                                                         |
| 9    | **The first-run wizard and the starter records:** both ways to start on one path, the shapes, the calendar choice, rules and modules, the first campaign and town, the optional map, the tutorial records, the Getting started checklist, Library → Setting packs, and every empty state                                                                                                                                                                                                                                        | A fresh install both ways: Next, Next, Finish                                   |
| 10   | **Docs, screenshots and a release** (v0.5): Quick Start for both ways to begin, a guide to writing a setting pack, and complete exports                                                                                                                                                                                                                                                                                                                                                                                         | The release                                                                     |

**Tests across the steps:**

- the realms migration on an archive library and an empty one;
- export and re-import keeping types, realms, templates and canon flags;
- the editor's autosave and conflict protection;
- creation in both modes;
- encounters and treasure for a region of your own, from the SRD alone and with books imported;
- the setting pack:
  - installing into a fresh library;
  - an existing setting library migrating with no change to its records, maps or handbook;
- **a second, synthetic pack installed beside the setting**, then updated and uninstalled, with neither touching the other or the GM's own records;
- no setting record IDs or terms in app code;
- the JSON export covering every table;
- **an own-world E2E that needs no archive**, besides today's archive E2E;
- the wizard end to end, both ways;
- the bundle guard.

**Before any step:** the README says the app "runs just as well … in a world of your own: switch the setting's mechanics off". The audit shows that isn't true yet, so that sentence is softened now.

## 4. Owner answers (22 November 2026)

1. **Canon for your own world: Canon at once.** In a world you make yourself, new records are Canon as soon as they're created. Canon Review stays on for imported archives, and the setting can be switched either way (§2.5).
2. **Tutorial records: on by default, removable.** The wizard ticks them by default. The dashboard's Getting started card removes them in one click (§2.7).
3. **The editor: CodeMirror 6** (§2.3).
4. **Worlds: realms in one library.** One library holds as many worlds, continents and planes as you like (§2.1). Several separate libraries you switch between are left for later.

Still to decide:

- **The name.** "The Worldkeeper" is both the app and the setting today. Should the app keep the name, with the setting called something like "The Worldkeeper setting" (or *Aetheris*), or the other way round? This affects the wizard's wording, export folder names and the default app name.

Decided by default, unless the owner says otherwise:

- **Realm kinds:** World, Continent, Plane and Region group.
- **Pack record types** (for the setting: vault, vault key, shard, calling, Ethereal domain): shown while their pack or module is in the library, hidden otherwise. Existing records of those types always show.

Added on 22 November 2026, at the owner's request: **rules for any world** (§2.9). There is one game system, D&D 2024, whose content comes from rules packs (the SRD, your books, Open5e, a setting's own). A setting pack can bring and switch on its own rules pack. Terrain, danger and wealth become facts on records, so encounter tables and treasure work for any region.

Added on 22 November 2026, at the owner's request: **one foundation.** The Worldkeeper setting is built on the same model as a world of your own: a setting pack of realms, record types, templates, content and roles, plus modules for its systems. The first run offers both ways to start in one wizard (§2.0, §2.6, §2.8, step 3).

## Appendix A. The audit (22 November 2026)

Four read-only passes covered the server, the GM app, the player side with the shared code, and the data, formats and infrastructure. This is the condensed list; severity is **C**ritical (blocks your own world or a second pack), **I**mportant or **M**inor. The step that handles each is in brackets.

**Critical**

- **Record IDs and types:**
  - ID prefixes are a fixed list (`shared/domain.ts` `ID_PREFIXES`), so other prefixes are skipped at import and their `[ID]` references don't link [2].
  - Every record the GM creates is `CUS-####`, while the briefing, State of the World and the handbook find places by ID prefix (`briefing.ts`, `regionState.ts`, `projection.ts`) [2].
  - The Markdown export, re-imported, turns most of the GM's records into type `custom` and realm `world` (`normalize.ts`) [2].
- **No provenance:** nothing records which pack or import a row came from. A second pack wipes or collides with the first: timeline rows, rumours, maps by name, adventures and tables by title. Two packs' `NPC-005` stat blocks overwrite each other [3].
- **The calendar is the setting's** (`shared/calendar.ts`):
  - a 363-day year, its months and moons, AB / Unbound years and its festivals;
  - an own-world date falls back to 300 AB (`repo/calendar.ts`);
  - "300 AB" is the default in the schema, the campaigns, Settings and every import [5].
- **Archive-cleaning applies to every record:**
  - `loreText.ts` hides sentences mentioning "the books", "verify", "Tome" and the like;
  - `sections.ts` hides sections headed "Status", "Open questions" and the like [3].
- **The handbook's spoiler rules hold the setting's secrets** (`handbookReveals.ts`) [3].
- **The Faction Web** (GM and player) shows nothing for realms other than the setting's three [1].
- **Species and Classes:** the Classes tab lists only the setting's calling records [6, 8].

**Important**

- **Setting actions run in any library:** Apply additions, the mysteries and rumours syncs, Match the published handbook, open questions, and the treasure checks in Consistency [3].
- **Detection and defaults:**
  - the setting is detected by `SYS-907` / `REG-001`;
  - the client defaults unknown libraries to the setting's preset [4].
- **Module data sits in core tables:**
  - Thinning and Shardscarred in `character_pages`;
  - fading in `party_treasure`;
  - the Return's tables, with stages 0 to 7 fixed in the schema;
  - module routes are never switched off;
  - players' notes are lost when Thinning is off [4].
- **Hard-coded type lists** (map pins, region panels, place pickers, the graph's groups, relationships, consistency) include the setting's types and can't include a pack's [2].
- **Prose conventions:** features depend on the archive's wording and page names, including region holders, names, rumours, who's nearby, standing, backgrounds, starting places, species rules and subclass names [2, 8].
- **Realms elsewhere:**
  - the handbook guesses a people's continents from the words "Aetheris" and "Kaelmar";
  - the timeline realm filter is free text;
  - Rumours keeps its own realm names [1].
- **Treasure tiers and tables:**
  - treasure tiers live in the setting's `pools.json`;
  - random tables find their region by text in `source`;
  - stat blocks exist only as setting files and show in every library [6].
- **Faction standing ranks and the Return's stages** are the setting's, fixed in code [4].
- **Hard-coded roles:**
  - the Graph opens on `CON-301`;
  - Canon Review links `DEC-903` and `DEC-904`;
  - the Return reads `COS-032`;
  - the briefing falls back to `SET-301`;
  - the handbook's "Start here" is the first world record [3].
- **One library-wide scope:**
  - one library, one date, one handbook;
  - reveals are library-wide;
  - campaigns have no world [1, 4].
- **Exports:**
  - the JSON export misses the Return's tables, revealed ties and homebrew rules packs;
  - the campaign export misses most campaign data and names no world or packs;
  - there's no full-world import [10].
- **One content root:**
  - desktop and server read one fixed content folder;
  - there's nowhere to install a second pack [3].
- **Tests:**
  - the E2E needs the private archive and checks setting text;
  - unit tests read the setting's asset paths [3, 9].

**Minor**

- **Setting copy** in placeholders, empty states and help text ("Mara Venn, Black Sun, vault key…", "The wedding at Varkhaal", "apply the Worldkeeper additions") [9].
- **Group labels:**
  - "Shards and Artifacts" / "Shards and Treasures" as group labels [2];
  - the setting's peoples in the name generator [2].
- **Print's table cards** are chosen by record name [3].
- **Treasure defaults** to "the Marches" [6].
- **Maps match by name;** a map's colours are fixed [3].
- **Miscellaneous:**
  - the owner's own books are the 5etools default;
  - the e2e and handbook build script are setting-only [9, 10].
