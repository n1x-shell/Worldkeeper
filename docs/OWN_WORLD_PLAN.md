# Your own world: a plan

**Status:** draft for the owner's review (22 November 2026). Nothing here is built yet.
**Goal:** someone who opens a fresh Worldkeeper with no archive to import can click **Next, Next, Finish** and have their own world: named realms, a first campaign and a few records that teach them the system. From then on, every kind of record has a template, a guided way to fill it in, and a modern Markdown editor for anyone who'd rather write it themselves.

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

## 2. The ideas

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

The setting's own types (vault, vault key, shard, calling, Ethereal domain) keep their templates, but appear only while the setting is switched on.

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

1. **Welcome.** "What would you like to do?"
   - **Make my own world** (this wizard).
   - **Play in the Worldkeeper setting** (the archive import and Apply additions).
   - **Restore a backup.**
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

Inside the GM app, **Library → Start a new world** runs the same wizard for a second world in another library. Adding a realm to the same library is §2.1's **New realm**.

### 2.7 Records that teach

The wizard can add a small set of **starter records**, tagged `tutorial`. They are real records, built from the templates, set in the GM's own world (named after the realms they chose) and linked together, so every feature has something to show:

- **Start Here**: what records, realms, campaigns and reveals are, with a checklist of things to try ("Hover the link to The Lantern Inn", "Press `]`", "Reveal the Rumours section to your players", "Open the Atlas").
- **A town** (the starting place, if the wizard made one) with each section filled in briefly. A note in each section explains what the section is for.
- **An NPC** who lives there, with a **GM only** secret, to show how secrets and reveals work.
- **A faction** with an allied link to the NPC, so the inspector and the Relationship graph have something to show.
- **A landmark** nearby, pinned on the map if a map was uploaded.

The dashboard's **Getting started** card follows that checklist and has **Remove the tutorial records** (with a confirmation) once you're done. Tutorial records are never revealed to players unless you reveal them yourself.

### 2.8 What changes for the Worldkeeper setting

Nothing is lost:

- The archive keeps its realms, colours and records.
- **Apply additions** and the published handbook work as before.
- The setting's own record types and pages stay, shown while the setting is on.
- Archive libraries keep Canon Review on.

The setting simply becomes one way to start, next to **Make my own world**.

## 3. Delivery plan

Each step is its own PR with screenshots, merged on the owner's OK. As before, the release comes last.

| Step | What                                                                                                                                                                                                                                                                                                                                     | You review                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | **Realms as data:** the `realms` table and migration (the setting's four become rows, ids unchanged), the API, Codex → Realms (new, edit, recolour, reorder), and everything that reads realms reading the library instead of the code: sidebar, badges, colours, filters, dashboard, handbook. No visible change for existing libraries | A new realm appearing everywhere; Aetheris unchanged |
| 2    | **Templates:** the built-in set in `assets/templates/`, loaded into the library (without overwriting the GM's own), Library → Templates (view, edit, duplicate, new), setting-only types shown only with the setting on                                                                                                                  | The templates for a town, an NPC and a faction       |
| 3    | **The editor:** CodeMirror with Write/Preview/Split, toolbar, `@` links, GM-only sections and an outline, used for every long text in the app                                                                                                                                                                                            | Editing a record, a scene and a handout              |
| 4    | **New ▸ anything:** the New menu, contextual "Add … here", Guided and Advanced creation, and the Canon setting for your own world                                                                                                                                                                                                        | Making a town both ways                              |
| 5    | **The first-run wizard and the starter records:** Start your world, the shapes, the first campaign and town, the optional map, the tutorial records and the Getting started checklist                                                                                                                                                    | A fresh install, Next, Next, Finish                  |
| 6    | **Docs, screenshots and a release** (v0.5): Quick Start rewritten around both ways to begin                                                                                                                                                                                                                                              | The release                                          |

**Tests at each step:**

- the realms migration on an archive library and an empty one;
- templates round-tripping through import and export;
- the editor's autosave and conflict protection;
- creation in both modes;
- the wizard end to end in the E2E smoke, with a fresh library to a finished world;
- the bundle guard, so the player side still carries no GM code.

## 4. Questions for you

1. **Realm kinds.** Are World / Continent / Plane / Region group the right kinds, or do you think of the layers differently?
2. **Canon for your own world.** Should new records be Canon at once in a world you make yourself, with Canon Review only for imported archives?
3. **Tutorial records.** Should they be on by default in the wizard (with one-click removal), off by default, or not made at all? The alternative is a guided tour over empty pages.
4. **The editor.** CodeMirror 6 is my recommendation (about 150 KB, fully offline). A lighter option keeps the text area and adds the toolbar, Split view and outline around it.
5. **Setting-only record types.** Should they be hidden while the setting is off, or always shown, marked as the setting's?
6. **Scope.** Should this include more than one world per library (§2.1, recommended) or also several separate libraries you switch between (a bigger change, for later)?
