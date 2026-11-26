# Worldkeeper Feature Reference

[← README](../README.md) · [Quick Start](QUICKSTART.md) · [Development Status](../DEVELOPMENT_STATUS.md)

This document describes Worldkeeper's features as of v0.6. For implementation completeness, test outcomes and known issues, refer to [DEVELOPMENT_STATUS.md](../DEVELOPMENT_STATUS.md). No official rulebook text or monster stat blocks are bundled; rules and statistics come from your own sources or entries.

## Starting out

A fresh library opens on **Start your world**. Choose how to begin; every step can be skipped and everything it makes can be changed later.

- **Build my own world:** your world's name, a line about it and the name the app goes by; the calendar now (the months, the year it starts and the year's name, as in "1247 AR") or later; and its shape: one continent, several, a world and another plane, or nothing yet, each renamed or added to as you like.
- **Play in Oros:** adds the Oros worldbook, the whole world that ships with the app (its realms, every record with its source documents, maps, adventures, tables, rules and modules), and shows what came in.

Both ways then go through the same steps: **rules** (the SRD is always on; import your books or open content now or later; the setting's rules and modules, any of which you can untick), **a first campaign** (its name, where it starts, a place you pick or a town made for you, and the party's names, each a blank character ready for the builder), **a map** of the world if you have one, and **Finish**, which shows what will be made. **Restore a backup** is on the first page too.

In your own world the wizard can add a few **records that teach**, ticked by default: **Start Here**, an inn in your town, an NPC who keeps it with a GM-only secret, a faction allied with her and a landmark (pinned on your map, if you added one). They're real records, linked together and never shown to players unless you reveal them. The dashboard's **Getting started** card follows what you've tried (reading Start Here, peeking at a link, making a record, revealing a section, adding a map, planning a session) and has **Remove the tutorial records** for when you're done; a backup is made first, and your own records and town stay.

Pages with nothing to show say so and point the way: the Name Generator offers built-in styles until a people has common names of its own, the setting's own pages (the dominions, Open Questions) say they come with the setting.

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

Record pages provide facts, identified GM-only text, child records, connections, campaign state and revision history. Every long text in the GM app (records, scenes and adventures, session prep and recaps, handouts, notes, player text and templates) uses one Markdown editor: headings, lists, tables, links and quotes highlighted as you type; a toolbar and shortcuts for bold (Ctrl+B), italic (Ctrl+I), heading, list, quote, table, a **record link** (Ctrl+K or just type @) and a **GM-only section**; **Write, Split and Preview** (remembered on each device); a section **outline** for long texts; and full screen. Autosave, the save indicator, change reasons and conflict protection work as before. A line-by-line history diff lets you restore prior versions; duplication creates a `PROPOSED` record rather than changing the source.

To cross-link records in natural prose, use `@[Mara Venn]` or type `@` and select a suggested record. If names collide, a suggestion can include a distinguishing type, such as `@[Kaelholm (Settlement)]`. Links feed the relationship graph. Existing `Name [ID]` references remain supported and render using the record name.

**Pictures:** any record can have pictures (PNG, JPEG, WebP or GIF, up to 60 MB each), added from its page: a record with none shows an empty frame to click (or drop pictures on). The first is the record's picture: it shows large on the page, on hover cards and in the inspector. Each picture can have a caption, and each is **GM only until you tick "Players see it"**; a ticked picture shows on the record's handbook page once the record itself is revealed (in the app's Player View, on the table server and in a published handbook). Removing a picture deletes its file. Pictures travel with backups, full-world exports and shared worldbooks.

IDs, source citations, filenames, tags and editorial annotations are hidden by default in normal play-focused screens. Enable **Settings → Technical details**, or launch with `WORLDKEEPER_DEBUG=1`, to show them. New records start from library templates; unsupported facts remain `UNDEFINED`, and likely duplicates trigger a warning.


## NPC and faction profiles

### NPCs

Structured fields include pronouns, species, role, appearance, voice, home, factions, goals, pressures, secrets, knowledge, disguise and game statistics. Each field shows the corresponding source-library text read-only alongside your own value; fields with no source fact show `UNDEFINED`. A portrait is one of the record's pictures (see Encyclopedia); a portrait set on a profile before v0.9.3 became the record's first picture.

Campaign-specific fields track attitude toward the party, status, current location, last encounter (updated from the session log), known information, promises, debts and recent actions. These do not rewrite the canonical character record.

### Factions, cults and families

Structured fields include ideology, leaders, headquarters, resources, allies, rivals, goals and secrets. Campaign fields include active plans, attitude, recent events and influence by region. **Faction Agendas** shows a regional influence matrix and marks areas contested by multiple factions. Agenda progress tracks are advanced explicitly by the GM, with a reason.

## Search and relationships

Global search (`Ctrl+K`) covers names, aliases, stable IDs, tags, full text, original sources, sessions, quests, adventures and notes. Filters include realm, record type and canon status.

Relationships include Lives in, Leads, Member of, Allied with, Opposes, Controls and Seeks. Source-derived relationships can come from parent fields, leaders and cross-references, while others are curated. An interactive graph displays a focused neighborhood with filters for depth, entity type, continent, era, canon status and relationship type.

## Worlds & Realms

Your cosmos is yours to define (**Codex → Worlds & Realms**): realms (planes of existence) hold worlds or domains, worlds hold continents, continents can hold region groups, and domains can hold deeper domains. The app keeps that nesting. Each has a name, colour, icon and one-line description, a page, and a place in the sidebar under what holds it; records, maps and timeline events belong to one, and a campaign is set in a world. Rename a realm and everything follows; archive one to hide it without touching its records. In Oros, The World sits in the realm of Evershroud with Aetheris and Kaelmar as its continents, and the Ethereal Realm is a realm beside Evershroud, holding the Hollow Verge with its six deeper domains beneath it, all built the same way. Players only ever see realms that hold something you've revealed.

## Record types and templates

Every kind of record (settlement, NPC, faction, deity...) knows what it is: a place, a group, a person, something you can carry. The app uses that, not a fixed list, so a type you add yourself works everywhere a built-in one does: on maps, in pickers, on the handbook. Add your own in **Library → Templates** (a Tavern, a Starship), with its own ID prefix.

Each type has a **template**: the facts it should have (a town's population and who rules it; an NPC's pronouns, looks and manner) and its sections, each with guidance on what to write and an example from Oros. Sections marked GM only are never shown to players. Duplicate any template to make it your own and change it as you like; a change affects only new records.

## Making a record

**New** in the top bar opens every kind of record, grouped the way the Codex is (places, people, myth and history, things, rules and adventures), with the ones you made recently first. A place's page also offers what belongs inside it: **Add a settlement here** on a region, **Add an NPC who lives here** on a settlement, with where it is already filled in.

Make it **Guided** or **Advanced**; the app remembers which you prefer.

- **Guided** walks through the type's template. First the basics: its name, where it is, and its facts as proper inputs, with the stat blocks, items, species and classes in your rules to pick from (choosing a stat block fills in the challenge; choosing an item fills its rarity and attunement). Then one step per section, with what to write, an example, and the editor; **Skip for now** leaves it for later. GM-only sections are marked. Last, a review: the record as it will read, what it links to, and what players can be shown. Create, and it opens on its page.
- **Advanced** opens the template as Markdown in the editor, side by side with the preview, its header filled in: write it, then **Create**.

Either way you get the same record. A section you skipped stays as its heading with the guidance under it, shown on the record page as **To write** so you can see what's left; players never see it.

**Canon.** In a world of your own, new records are Canon at once; you can still mark one Proposed while you're unsure of it. A library built from an imported archive keeps **Canon Review**: new records start Proposed until you approve them, which protects the source. Change it in **Settings → Canon → Approve new records in Canon Review**.

## Worldbooks

A worldbook is a whole world you can add to your library or leave out (and **Share as a worldbook…** makes one from your own world, a `.worldbook` file another GM adds with **Add a worldbook…**, to start a library with it or add it to one; one you added can be removed from the computer once no library has it): its realms, record types, templates, records, maps, adventures, tables and tools. **Library → Worldbooks** adds, updates and removes them, taking a backup first each time. Updating brings in what's new without touching your own records; removing takes out only what the pack brought. If one of your records already has an ID the pack uses, yours is kept and the page tells you. The Oros worldbook is the first; a library without it is plain D&D, with none of its tools in the menus.

## Calendars

Each world has its own calendar: its months and how long they are, days outside the months (an equinox, a festival day), weekdays, seasons, moons, how years are written ("1247 AR", or "300 AB" with "Year 31 Unbound" alongside), and its yearly festivals. A setting pack brings its own (Oros's 363-day year of Aetheris and Kaelmar); a world of your own starts with twelve months of thirty days, and **Campaign → Calendar → The world's calendar** switches it to one like ours, back to a pack's, or to one you write out yourself, line by line.

A campaign's date is kept as a year and a day, so changing the calendar keeps every campaign where it was; only how the date reads changes. The campaign's page sets where it started and where it is now with the calendar's own months; the Calendar page, travel, the session briefing, the players' calendar and the party export all read the world's calendar.

A session's in-world date works the same way: a new session starts on the campaign's date, **Pick** sets it with the calendar's months, and words the calendar can't read ("the morning after") are kept as written. A timeline event can be given a year: it's placed in order among the dated events, and its time is written out in the world's calendar if you leave the words empty. Existing sessions and timeline rows are read through the calendar when the library opens.

## World branches and timelines

### Aetheris

A Crystal Shards table tracks lore power, GM-only canonical location and interested parties, plus campaign-specific holder, location, shardscarred bearer and cult activity. A dominions and factions overview connects the political and geographical structure.

### Kaelmar

The Thirteen Vaults tracker records location, purpose, key and canon state, alongside campaign-specific clues, guardians, consequences and vault state. The documented default campaign starts at **300 AB**, with all vaults sealed.

### Ethereal Realm

An explorer distinguishes the border layer from deep domains. It connects crossing requirements, hazards, Thinning and Unmaking, inhabitants and access conditions.

### World overview and chronology

World views connect the timeline, cosmology, pantheon, peoples, magical systems and mysteries. **300 AB = Year 31 Unbound** in the documented chronology. Events without documented dates are not assigned invented ones. Timeline eras are drawn from the library's `era/` tags where possible. Linked records can supply an event's era; other events can be manually classified. Eras can be renamed, ordered and filtered.

**Sessions on the timeline.** The World Timeline shows the active campaign's sessions among the world's history at their in-world dates, each linking to its session; **The campaign's sessions** hides them, and sessions without a date are listed so you can give them one. **Showing history to players:** each event has **Players:** controls: **Everyone**, or (with two or more campaigns) each campaign, as records are revealed. An event marked SECRET can't be shown. In the handbook, **Campaign → Timeline** gives each group its story: the history shown to it, the sessions it has played at their dates (a session's title, and a link to its recap, once the recap is shown), and the dated calendar events it has been shown. The published handbook shows history revealed to everyone only.

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

**Party progression.** On **Party and Characters**, the **Progress** panel sets how the campaign's party advances: **Milestones** (you say when) or **Experience**.

- **Award experience:** an amount shared between the characters you tick, or the amount for each; the session it was for and what for. Each character's XP goes up on their sheet, and the award is in the panel's list (**Take back** takes the XP off again). A character with enough XP for the next level (the 2024 rules' totals) is marked **Has earned level N**, with a **Level up** button.
- **A milestone:** the characters you tick gain a level.
- **Taking a level:** when a level is given (a milestone, the Level up button on the panel or on the GM's sheet), the character's sheet shows **Level N is waiting**, for the player on the table server and for you. **Level up** shows what the level gives and asks for the choices:
  - hit points: the fixed value, or the Hit Die rolled (typed in, or rolled there), with Constitution;
  - a subclass, at the level it is chosen;
  - an Ability Score Improvement (two +1s, or one +2) or a feat instead; an Epic Boon at level 19;
  - the level's class and subclass features, with their text;
  - what else changes: Proficiency Bonus, spell slots, cantrips and prepared spells to choose, weapon masteries.

  **Take level N** fills the sheet in: hit points (and one more for each earlier level if Constitution's modifier rose), features, spell slots and rest uses (keeping what's spent), and the Armor Class and weapon attacks the sheet had worked out. Anything the player wrote or changed by hand is left alone, and **I'll do it by hand** changes nothing. A level set with the Level box on the sheet is set by hand and offers nothing.
- **Who was there:** a session's page has a tick for each character. Award experience ticks those who were at the session, and the Progress panel shows how many sessions each character was at.
- **Rolls the whole table sees.** On a character's sheet (the player's own on the table server, and yours), the numbers can be tapped to roll: an ability check, a saving throw, a skill, initiative, a death saving throw, and each attack's **Roll to hit** and **Roll damage**. **Advantage** or **Disadvantage** applies to the next d20 and then goes back to normal. The app rolls the dice (a result can't be typed in), and the roll goes to the table's log:
  - on every player's phone, a line at the bottom shows the newest roll ("Ash rolled 17 · Stealth"); a tap opens the last few, and the cross puts it away until the next one;
  - your **Dice Roller**, DM Screen and Live Session show everyone's rolls as they happen;
  - your own rolls are **behind the screen** unless you untick it, and one made behind it can be shown to the table afterwards (**Show the table**);
  - the log keeps the latest 200 rolls of a campaign; **Clear** empties it.
- **A table display.** A page made for a television or second screen at the table: the campaign's handbook address followed by `/table` (**Open the display** in the GM app opens it in a new window to drag across; **Full screen** fills the screen). You choose what it shows, from **Live Session → Table display** or the DM Screen:
  - the **title card** (the campaign's name and date);
  - a **map** players can see, whole on the screen, with its pins by name, the party's trail and where it is now, and darkness over what it hasn't found while a session is running;
  - a **handout** (its picture and text, large); showing one gives it to the players, as handing it out does;
  - a **record's picture**, from the record's page (**Edit pictures → Show on the table display**), if you ticked "Players see it" and the players know the record.

  Beside it, while there are any: the **turn order** of the running fight, and the table's **rolls** of the last five minutes. It follows what you do at once, and it can only show what players may see: something hidden again goes back to the title card.
- **One sheet, two people.** You and a player can both have a character's sheet open. What either changes shows on the other's screen at once, without reloading: damage you deal, an award, a spell slot they spend. A save sends only the fields that changed, so if you both change different things at the same moment, both stay. If you both change the same field, the later one stands.
- Awards and attendance travel with a campaign export.

The handbook's **Make a Character** builder makes a complete character at any level from 1 to 20, step by step, with the sheet building itself alongside: people, class and subclass, background, ability scores (standard array, point buy, rolled or entered, then the background's increases and each Ability Score Improvement or feat), skills, Expertise, languages and weapon masteries, starting equipment or gold, spells, portrait, looks and personality, and ties to the world. It ends with the sheet on two printable pages laid out like the official one, and on the table server **Send to my sheet** fills in the player's sheet (at the level the GM set). In the GM's own app (Player View), **Save to Party and Characters** adds the finished character to a campaign's party, with its portrait, and opens it there; the table server and the published handbook never show this button.

Quests support a **players see** flag. Adventures include premise, hook, stakes, opposition, clues, obstacles, rewards, approaches, consequences and an **if ignored** outcome. Story arcs connect related adventures. Scenes can be reordered, reused across adventures, and arranged in a branching visual flow editor.


**Undo for plans and campaign changes:** faction plans and campaign-specific world changes show **Recent changes**, each with **Undo**. One action is one step (recording a new value also brings back the one it replaced; advancing a plan also removes the change it logged), and typing in a plan joins one step. A change that something later changed again waits until that one is undone.
## Session preparation and play

### Session preparation

Prepare recaps, party location, goals, scenes, NPC notes, read-aloud text, clues, encounters, treasure, consequences and unresolved questions.

### Live Session Mode

The table-side dashboard consolidates current scene and read-aloud material, encounter tracking, a quick event log, quest updates, proposed changes, relevant NPC cards and dice. From the session you can reveal a record's existence, an allowed section or a fact written for players. Reveals are recorded in the session log and available to the recap workflow. GM-only and secret sections are not selectable for ordinary publication. With two or more campaigns, a reveal goes to the session's campaign unless you choose **Everyone**, so one group never sees what another learned.

### After the session

Generate a recap draft from recorded events and edit it before sharing. Review proposed world changes and choose what should remain campaign-specific or enter Canon Review.

### Encounter and initiative tracker

Roll or enter initiative, manage rounds and turns, track damage, healing, temporary HP, 15 conditions, 2024 concentration saving throw DC, defeated and hidden combatants, and add the complete party to an encounter.

- **The party's hit points are their sheets'.** A party member in a fight shows the hit points on their sheet. Damage or healing in the tracker goes to the sheet, and what the player changes on their phone shows in the tracker.
- **Initiative.** **Roll missing** rolls for everyone without one. Creatures added together (Count 3) roll once for all of them. A player who rolled Initiative from their sheet in the last quarter of an hour keeps that roll.
- **Rolls from the stat block.** Open a combatant's stat block in its row: each attack has its **to hit** and its damage as buttons, and each ability score rolls a check. The roll shows above the turn order and goes to the table's roll log behind the screen; **Show the table** shows it to the players.
- **What runs out.** A creature added from a stat block brings what it has that runs out: **legendary actions** (back at the start of its turn), uses each day (Legendary Resistance 3/Day) and abilities that **recharge** (Fire Breath, Recharge 5–6). Use one with the minus; at the start of its turn the tracker says which to roll a recharge for, and the die on the chip rolls it.
- **Effects that end.** **Effect** on a combatant's row takes a name and a number of rounds (Bless, 10). It ends at the start of the turn of whoever's turn it was when it began (the caster's, as the rules run), and the tracker says so.
- **Experience at the end.** **End combat** adds up what the foes marked defeated were worth, from their stat blocks, and **Award it** shares it among the party members who were in the fight (see Party progression).

Other table tools include a DM screen, NPC quick-reference cards, faction agendas, world events, random tables and dice notation such as `2d6+3`, `1d20 adv`, `4d6kh3` and `d%`.

**Generators** (Characters → People and Shops) are for when the party goes where you hadn't planned:

- **People:** six at a time, each with a name in one of your world's styles (or a built-in style: common folk, dwarven, elven, halfling, gnomish, orcish, draconic, infernal), what they do, a look, a manner, something they want and a secret. Say what they do yourself ("ferry keeper") or leave it to chance.
- **Shops:** a general store, smithy, apothecary, stable, tavern, tool shop or arcane shop, with a name, a keeper, and its stock and prices from your rules' items. Put it in a place and its **Wealth** fact decides how much it has: a poor place has less and nothing costly, a rich one has more and rarer magic. A magic item with no price of its own is priced by its rarity.
- **Keep as a record** turns either into an ordinary record (the shop inside its place), for you only until you reveal it. Nothing else is saved.
- **Weather** is on the campaign calendar and the session prep board: today's and the six days after, from the season of the campaign's date and the **Terrain** of where the party is. A day's weather stays the same however often you look, it comes in spells of a few days, and it says what it does at the table (heavy rain, strong wind, extreme cold or heat, fog). Places with no sky have none.

Rules reference entries use labels: `OFFICIAL`, `HOMEBREW`, `OUTSIDE 2024 CORE` or `UNVERIFIED`. Worldkeeper does not bundle purchased rulebooks or licensed monster stat blocks.

## Modules: a standard D&D campaign, or Oros

The app runs as a plain D&D 2024 campaign tool with whatever books you import. Optional features are **modules**: a worldbook switches on its own, and you can switch any of them on or off for your own world in **Settings → Modules**, for the whole library or for one campaign.

| Module | What it covers |
| --- | --- |
| Thinning, true names and memories | The Thinning tab on sheets and character pages, with true names, named memories and Shardscarred |
| The Return (a clock) | A clock for the GM, with stages, omens and a jump from the worldbook; its signs and omens for players |
| Fading salvage | Treasure from some regions fades unless it's anchored |
| The setting's treasure | The Treasure tool's regional tables and the world's own items. Off: it rolls from your books |
| Vaults | The sealed vaults page: keys, conditions and state per campaign |
| Shards | The shards page: holders, locations and state per campaign |
| Depths explorer | A realm of layered domains, from the border to the deep |
| Quick reference | The setting's own one-page reference |
| Renown | Faction standing, with ranks from the worldbook (or a plain ladder: Hostile, Unfriendly, Neutral, Friendly, Honoured, Revered) |

A switched-off module leaves the menus, the sheets, the player view and the published handbook, and its pages and actions are refused. Nothing is deleted: its data stays, and comes back when you switch it on. A library without a setting pack starts with every module off. Your players' own notes are always on their character page, in their own tab.

**From your books** (see [Rules packs](RULES_PACKS.md)):

- **Character options.** The sheet and the builder list the world's peoples, classes and backgrounds first, then every other species, class, subclass and background in your rules packs. With no world pages, the books' options are the whole list.
- **Species and Classes in the handbook.** The Classes tab lists every class in the rules in use: a class with a page of its own (the setting's callings) shows that page; the others show their hit die, saves, skills, features by level and subclasses from the rules. A handbook with nothing revealed yet still offers Species and Classes and the character builder.
- **Treasure.** The Treasure tool rolls at any place in your world: a place your worldbook covers uses its regional tables (when the setting's treasure is on); anywhere else rolls magic items by tier and rarity from the SRD and your books, with gems and art objects for goods, scaled by the place's **Wealth** (a poor place has half the coin and an item fewer; a rich one double the coin and an item more). The 2024 treasure tiers belong to the rules, not to any setting.
- **Encounters.** Your Books → Encounters, and "Suggest from your books" in a live session, offer groups of creatures for the party's level within the Dungeon Master's Guide (2024) XP budget, in a place's terrain. A place's **Terrain**, **Danger** and **Wealth** are facts on its record (forest, hills, coast…; safe, risky or deadly; poor, modest or rich), and a place takes any it doesn't give from the place it's in; a setting pack can give terrain for its own places (Oros's `encounters/terrain.json`). Danger sets the difficulty. "Put in the tracker" makes it an encounter, with HP, AC, initiative and stat blocks filled in.
- **Encounter tables for any region.** A region's panel on the map has **Make a table**: eight rows of creatures from the rules packs you have on, for its terrain and danger and the party's level. **Regenerate** rebuilds it; **Copy to edit** makes it your own. Hand-made tables (a pack's or yours) come first, and a journey that rolls encounters where there is no table gets one made. Random tables now belong to a region and a band of levels.
- **The worldbook's rules.** The Oros worldbook brings its own rules pack (84 creatures, 8 hazards, 34 items and 40 species for its peoples, CC BY 4.0; a people plays as the book's species where the GM has the book, else the world's own), switched on when you add the worldbook and off when you remove it; you can also turn it on in any library in Settings → Rules packs. Its stat block cards show only while it's on. With Thinning switched off, its few Thinning-based entries use standard-rules versions.
- **Stat blocks of your own.** Any creature or NPC of yours can have a stat block, made on its page (**Give it a stat block**), three ways:
  - **A book's stat block:** a creature from the SRD or your books, with what's different about this one and how it fights. The card takes its AC, Hit Points, initiative and Challenge Rating from the book block, which is folded under it.
  - **Its own:** the whole stat block in the 2024 layout: size, type and alignment, Armor Class, Hit Points, speed, the six ability scores, Challenge Rating, saving throws, skills, vulnerabilities, resistances, immunities, gear, senses, languages, and its traits, actions, bonus actions, reactions and legendary actions. The block shows as it will read while you write it. What follows from what you wrote is filled in: type `7d8 + 7` and Hit Points read `38 (7d8 + 7)`; the Challenge Rating gives XP and Proficiency Bonus; initiative comes from Dexterity unless you give one. **Start from a creature** copies a creature from the open rules (the SRD and open packs) for you to change; a creature from a book you own isn't copied, so the book's words stay in the book.
  - **A hazard:** a trap, a sickness or a dangerous place, with its trigger, effect and countermeasures. Any record can have one (**More → Stat block or hazard**), not only creatures and people.
  - A worldbook's stat block for a record can be replaced with your own (**Write your own**); remove yours and the worldbook's is back. Your stat blocks show on the record's page and in the encounter tracker, and travel in backups and shared worldbooks.
- **Open rules for players.** An openly licensed pack (CC BY, OGL, CC0, ORC) can be published: tick Publish to players, and its options join the SRD in the published handbook's character builder. Packs from your own books never are.
- **Open content.** Settings → Rules packs → Add open content from Open5e brings in openly licensed sources (Level Up A5E, Kobold Press and others), each as its own pack with its licence.
- **Worldbooks and your books.** A worldbook names rules, never holds book text. Sharing one asks whether the books it draws on are required, optional, or swapped for open stand-ins (safe mode, which keeps the originals for GMs who have the books); adding one says what's missing, by book, and a new library started with a worldbook whose books you all have uses your books alone.
- **Books only.** Settings → Rules packs → Books only sets the open rules (the SRD, open packs) aside so a library uses only your books. It says first what your books don't cover, and keeps the open rules for just that (no classes in your books: the SRD's classes stay); turning it off brings everything back as it was.
- **Items and spells of your own.** **Your Books → Your own** holds the magic items and spells you made, with **New item** and **New spell**. They are kept in the library (not with your books' rules), so they travel with its backups and shared worldbooks.
  - **An item** has a kind (Wondrous Item, Weapon (Longsword)…), a rarity or none, attunement, worth, weight and what it does. It joins the books' items: it is in Your Books → Items, the Treasure tool rolls it at its rarity, and a sheet or the party's treasure shows its rules by its name. An item of yours wins over a book's of the same name.
  - **An item record** (an Item or Artifact in your world) has **Give it rules** on its page: the same form, and the rules go by the record's name.
  - **A spell** has a level, school, casting time, range, components, duration, ritual, the classes whose spell list it is on, and what it does. It shows in the sheet's and the builder's spell lists for those classes, at your table and in the published handbook. A spell of yours replaces a book's of the same name.
- **Encounter tables.** When a table row names creatures in plain words ("4 bandits and a bandit captain"), their stat blocks from your books are a click away. The setting's own creatures keep their own stat blocks.

**The rules are D&D 2024.** The sheet and builder do their arithmetic by the 2024 rules: backgrounds raise ability scores, the 2024 class tables, weapon mastery. Books written for the 2014 rules import fine, and their species, subclasses, spells, feats, items and creatures can be used, but characters are built and calculated the 2024 way.

## Libraries: more than one world

One installation holds several **libraries**. Each is a world (or set of worlds) of its own: its own records, campaigns, settings, backups and handbook. Your books' rules and worldbooks are shared, so they're imported once; each library chooses which it uses. A book you import is on in the library that's open and off in the others until you tick it there.

- **The Library menu** (the gear, top right) names the open library and lists the others to open. **New library…** makes one and opens it with **Start your world**.
- **Library → Libraries** manages them: rename, **Duplicate** (a copy of the records, campaigns, settings and pictures, to try something risky in), **Archive** (hidden from the list, its files kept; **Restore** brings it back), and **Show in folder** in the desktop app.
- **Open a library from a file** turns a full-world ZIP (**Add and Share → Full world**) into a new library: how a world goes to a co-GM or another computer.
- Backups and restores are each library's own. **Back up everything** keeps every library and your books' rules and packs in one file; **Open everything from a file** adds them to another installation. The table server serves the library that's open.
- **The desktop app** opens the last library; with several, its start asks which.

## The GM app on another device

The GM app normally answers only on the computer it runs on. To run a session from a tablet at the table, or prepare from a laptop in another room, open **Settings → The GM app on another device** on that computer:

1. **Set a password** (at least 8 characters).
2. **Open it to the network.** The card shows the address (and a QR code) for the other device, on a port of its own (4330).
3. On the other device, open the address in its browser and give the password. It is the whole GM app, working on the same library.

How it is kept safe:

- Nothing of the library is sent to a device that hasn't signed in: only the app's sign-in page.
- It is closed every time the app starts, until you open it. Closing it, changing the password or **Sign them all out** signs every device out at once. A device stays signed in for 12 hours after it was last used.
- After five wrong passwords, signing in is locked for 30 seconds, then longer each time, up to 15 minutes.
- The password, and opening and closing, can only be changed on the computer itself. Only a salted hash of the password is kept, outside the library, so it is never in a backup or an export.
- The connection is not encrypted. Use it on your own network at home; don't open it on public Wi-Fi, and don't forward its port to the internet.

Players never need this: they use the table's address.

## Library management

The **Library** menu (the gear, top right) holds import preview, confirmation and history, exports, Canon Review, broken-reference reporting, change history, backup and restore, and app settings.

**Canon controls:** Changes are versioned with reasons. Edited canonical records can be reviewed using diffs and either approved or reverted. Where Canon Review is on (an imported archive or Oros, or by choice in **Settings → Canon**), new entries start `PROPOSED`; in your own world they are Canon at once. Campaign overlays do not silently promote local developments to universal canon. Protected setting bibles and original references are retained verbatim.

**Import controls:** Preview handles duplicates, source precedence, redirects, templates, edits made locally, and unavailable references. Unchanged entries stay untouched, and disappearing source entries are not automatically removed.

**Bulk tools:**

- **Select** on any list of records, tick the ones you mean (or the box at the top for all the list shows), then change them together: add or take off a tag, put them inside another record, move them to another world or realm, set their canon status, reveal them to players or hide them (everyone's, or only the active campaign's), or archive them.
- **Tags** (Library → Tags) lists every tag with how many records carry it. Rename one everywhere, rename it onto another to merge the two, or remove it.
- **Merge** (a record's **More → Merge another record into this**) is for two records of the same thing. The one you're on stays and takes the other's names, tags, facts, text, notes and pictures; whatever pointed at the other (records inside it, quests, map pins, what campaigns know, links in text) now points here, and the other's address leads here too.
- **Find and Replace** (Library → Find and Replace) changes a word or a name wherever it is written in your records. You see each record's first change before and after, untick any you don't want, and then replace.

Every record these change keeps its earlier state in its History, where it can be put back; merging and replacing also make a backup first.

**Your own notes:** **Add and Share → Your notes** brings in an Obsidian vault or any folder of Markdown: choose the folder (or a ZIP of it), say what each folder holds, and each note becomes a record. Links between notes (`[[Like this]]`) link the records, pictures a note embeds become its record's pictures, and front matter gives the name, alternate names, tags, type and facts. It goes through the same preview and confirmation, and bringing the same notes in again updates the records instead of doubling them. See [Data](DATA.md#bringing-your-own-notes-an-obsidian-vault-or-plain-markdown).

**Exports are complete:** the JSON export holds every table; a Markdown export brings back its realms, templates, canon flags and reveals when imported again; a full-world ZIP loads into an empty library with its pictures; a campaign export carries everything the campaign keeps, names what it needs, and reports what an importing library lacks.

**Worldbooks:** **Library → Worldbooks** adds, updates and removes a whole world. What a pack ships is marked as the pack's, so an update or an uninstall never touches your own records. See [Writing a worldbook](WORLDBOOKS.md).

For the detailed import/export and restore workflow, see [Data, Imports, Backups & Exports](DATA.md).

## Player view and distribution

The local `/player` interface provides a preview of material that has been explicitly revealed. **Several groups in one world:** each reveal goes to one campaign or to everyone, and each group sees what's common knowledge plus what it learned; a record's Player view shows who knows each section and fact, and promotes a campaign's reveal to everyone or takes one back to a single campaign. Maps, pins and outlines work the same way. **Each campaign has its own handbook address** on the table server (`/player/c/<code>`), shown with a QR code on the campaign's overview, so two groups can use the table server at once, each seeing only its own. A separate player-only server on port 4320 mounts no DM routes and is intended for trusted LAN use. Its one write route is a character's own page, opened with that character's private code. A static handbook can be exported as a ZIP or published to a GitHub Pages branch. The handbook updates when republished, not whenever the local campaign changes.

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
