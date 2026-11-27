# Development Status

_Last updated: 2026-11-27 · v0.9.29_

This file is the hand-over document for anyone (human or AI) continuing the project. Keep it current.

## Source archive findings (Phase 1)

- Archive `Amsel_Unified_World_Lore_Reference_v10.zip`: 475 Markdown files, 422 distinct `ID:` values (+ template placeholders).
- Metadata convention: 9 standard keys (`ID, Name, Alternate names, Category, Parent, Continent or realm, Canon status, Source, Tags`) then template-specific keys, then the Markdown body.
- ID families: WLD CON REG LOC SET VLT KEY NPC FAC CLT FAM PPL CAL DEI COS HIS SHD ART ITM CRE RUL ETH SYS HOOK DEC, plus GDE/IDX and suffixed forms (`CON-001-DOM`, `PPL-008-009`, `IDX-AETH-FAI`).
- Cross-references: `Name [ID]`. Embedded duplicates: `00_World/03_World_Cosmology.md` (COS-901…915), `05_World_Geography.md` (REG-901, LOC-901, LOC-902), `Worked_Examples/` (5). Redirect stub: LOC-015 → LOC-505. Dual roles kept separate by design (FAC-301/SET-302, FAC-310/NPC-302, FAC-311/LOC-302).
- Authority: `07_Continuity/Canonical_Entry_Locator_v8.md` is used to pick authoritative pages; `References/` (both setting bibles, implementation guide, audits) are stored as protected source documents.

**Import result on the real archive:** 421 records (all non-reference IDs), 475 source documents, 1,008 relationships, 17 timeline rows, 17 templates, 18 duplicate IDs resolved, 23 copies skipped, **0 broken references**. Counts include 13 vaults, 13 shards, 7 Ethereal domains, 110 NPCs. Re-import: 421 unchanged.

## Player view redesign (working and tested)

- The player view (in-app `/player`, the LAN player server and the published handbook share one codebase) now uses the DM app's shell.
- **Sidebar** built only from revealed content:
  - World: Home and the realms that have entries.
  - Encyclopedia: All Lore, then only the categories with revealed entries (Places, People, Factions, Peoples and Callings, Gods and Myths, History, Magic, Rules and Customs, Shards and Treasures, Creatures).
  - Campaign: Maps, Quests and Session Recaps, each shown only when something is published.
- **Shell:** top search, collapsible sidebar, phone drawer, light/dark toggle.
- **Pages:** a home dashboard (overview link, realm cards, browse counts, open quests, latest session), category pages with realm filters, realm pages (intro, then entries grouped by category), and entry pages with breadcrumbs, an "At a glance" panel and Connections (other revealed entries linked from the text). There are also search results, maps, a quest log (open / finished) and session recaps.
- Files: `client/src/player/{PlayerApp,PlayerLayout,PlayerPages,context,categories,source}.ts(x)`. Still no DM code in the player bundle.

## Player Handbook on GitHub Pages (working and tested)

- **Static Player Handbook** (`client/player-site/`, `client/src/player/static-main.tsx`, `vite.player.config.ts`):
  - The same player view, built separately into `dist-player/`. It contains no DM screens; this was checked on the bundle.
  - It reads one `data/player.json` snapshot through a `PlayerSource` abstraction; the in-app player view uses the live API through the same abstraction.
  - Hash routing, so it works under a sub-path on any static host. Strict CSP, `noindex` and `robots.txt`.
- **Site assembly** (`server/src/publish/site.ts`):
  - The static app + the player-safe projection + only the images of maps published to players + `.nojekyll`.
  - Unchanged content keeps its date, so republishing identical data makes no commit.
- **Publishing** (`server/src/publish/github.ts`):
  - One commit per publish on `gh-pages` through the Git Data API. Blobs whose git id already matches are not uploaded again. A full tree replaces the branch, so unpublished files disappear. Fast-forward ref update.
  - Then it reads or creates the Pages site. A Pages site on another branch, or no permission to create one, produces plain instructions.
  - Errors are worded for the DM (token rejected, repository not found).
- **Token** (`server/src/publish/secrets.ts`): stored in `<data>/secrets.json` with owner-only permissions. Never in the database, backups, exports or API responses.
- **UI:** a **Publish for Players** page.
  - It shows what players will see (counts), Preview, Download as ZIP, setup steps, a confirmation dialog naming the repository and that the site is public, and the result link with any Pages note.
- **Desktop:** the desktop app ships the handbook build (`player-site/` resource, `WORLDKEEPER_PLAYER_SITE_DIR`). `desktop:prepare` checks that the publish page sees it.
- **Tests** (`tests/publish.test.ts`), with an in-memory stand-in for the GitHub API:
  - git blob ids
  - ZIP contents and that it has no secrets, no unpublished map images and no unrevealed IDs
  - first publish (branch and Pages created), unchanged republish (no commit), a single changed file uploaded with the right parent commit
  - rejected token and unknown repository messages, configuration validation, the confirmation requirement
  - the token absent from the API, settings, meta, JSON export and backup; the secrets file is mode 600
- **Browser test** against a stand-in GitHub that writes the branch to a folder served under `/Worldkeeper/`:
  - DM side: configure, confirm, publish, see the link and the Pages note; a republish shows "Already up to date".
  - Player side, on the published static site: the lore list, an entry with revealed facts and section, `@[Mara Venn]` linking to another revealed entry, the map image with a marker opening the entry, the quest journal, offline search.
  - No console errors, and no secret strings in the pages or `player.json`.
- **Not tested against real GitHub from here.** The first real publish will confirm token permissions and Pages setup on your account.

## Interface clean-up and `@[Name]` links (working and tested)

- **Debug flag:** technical details are hidden unless debug mode is on. Turn it on with **Settings → Technical details** (stored as setting `debug`), or force it with `WORLDKEEPER_DEBUG=1`. `/api/meta` reports the state. What is hidden:
  - stable IDs in headers, lists, pickers, search results, graph nodes, vault and shard cards, and Canon Review
  - source files and citations, tags, raw category/realm/canon strings
  - the source's editorial sections: Source, References, Unspecified fields, Tome implementation, Review notes, Limits, Limits of the source, Record boundaries, Source boundary, Use and verification, Missing facts, Limitations, Open questions, Unknowns, Status
  - import-report detail tabs and how-it-works page notes (`PageHeader note=`)
  - the Source Documents and Broken References pages, removed from the sidebar
  - The record text itself is unchanged; this is display only. GM-only sections stay visible to the DM and flagged.
- **`@[Name]` links** (`shared/mentions.ts`, used by both server and client):
  - Mentions resolve by name, by name without "the", or by alias. Records that share a name take a type qualifier, `@[Kaelholm (Settlement)]`; `@[Name|ID]` is accepted as an explicit fallback.
  - The source's `Name [ID]` references render as the name; when the words before the ID are not the record's name, a small ↗ link is shown.
  - Typing `@` in any DM text area suggests records and inserts the shortest unambiguous mention. Esc dismisses it for that `@`, and long prose without a match stops suggesting.
  - Mentions create text-derived relationships (graph, connections). Unresolved and ambiguous mentions appear in Broken References and render with a dotted underline.
  - Player text shows names only: links go to revealed records; other mentions become plain words.
  - Recap drafts and from-hook adventures now write `@[Name]`.
- **Relationship wording** reads from each side, e.g. "Leads" and "Led by", "Mentions" and "Mentioned in".
- **Tests:** `tests/mentions.test.ts` covers resolution, qualifiers, aliases, redirects, legacy parsing, collected and broken refs, relationships created from mentions, the broken-reference report, player text and user-created records. The E2E test checks that IDs, files, tags and editorial sections are absent without debug and present with it, that `@` inserts `@[The Blind Seer]`, and that typed `@[Hollow Refuge]` renders as a link.

## v0.9.29: a painted style for plans

docs/BETA_PLAN.md C8, sixth part, and decision 7 of §5 (27 November 2026). The owner brought a list of free art; the licences were read on each source's own page; two trials were shown; the owner chose painted grounds only, before the beta.

- **A style, not a plan.** `DrawOptions.style` is `'ink'` (the default) or `'painted'`; `DrawOptions.art` carries the pictures. Nothing about a plan, its settings or what the server keeps has changed: the style is one more thing the GM chooses about how a plan is shown, remembered on the device with the rest (`wk.plan.view`).
- **Ink is byte for byte what it was.** The painted code is a separate branch in `drawGrid` and a palette in `drawTown` whose ink values are the old ones; the fingerprint of every ink drawing checked while building did not change, and `tests/planPaint.test.ts` checks that ink ignores `style: 'ink'` and any `art` given.
- **The pictures** are six 512-pixel JPEGs in `client/src/assets/plan/` (about 360 KB together): stone, earth, rock, wood, grass, dirt, cut from Poly Haven textures (CC0), recoloured and made to tile. `paints(o)` in `shared/plan/draw.ts` makes one SVG `<pattern>` for each ground a drawing uses, so each picture is in a drawing once however much it covers; each has its own size and turn so that the repeat does not show. A value that is not `data:image/(jpeg|png|webp);base64,…` is not used, and without pictures the style falls back to flat colours.
- **Plans on squares:** rock (or grass round a building, sky, sea, mist or stars by the ground) behind; textured floors with a soft shade along the walls (a blurred stroke clipped to the floor); a dark grid; walls with a dark edge and a stone or timber core; furnishings in flat tones of wood, stone and iron, drawn by the app as before. **Settlements:** grass, earth roads, a cobbled square, tilled fields, roofs in three colours with their ridges, stone walls and towers.
- **The client** loads the pictures only when a plan is first shown painted (`client/src/lib/planArt.ts`, a chunk of its own of about 490 KB, by Vite's `?inline`), and they go into the SVG, so a saved picture or drawing needs nothing else. Rock and Paper are not asked when painted. A painted SVG is about 500 KB larger than an ink one.
- **Checked:** every kind on every ground is well-formed and uses no id it does not make (a browser refuses a drawing that is not); the first-run browser check chooses Painted, waits for the photographs, checks the picture decodes at the same size, saves the PNG, reloads to see the choice remembered, and goes back to ink.
- **Not done, on purpose:** furnishings from other artists' packs (the owner chose grounds only); pictures of the GM's own choosing. **Not verified:** painted pictures opened in a virtual tabletop or Arkenforge; how the larger SVG behaves in other programs.

## v0.9.28: the lie of the land, and ships

docs/BETA_PLAN.md C8, fifth part, and decision 6 of §5 (27 November 2026), the last of the four steps the owner asked for on seeing the location generator. The owner asked about the fungus of Kaelmar, the shattered places, the floating city, places like the Ethereal Realm, and ships between worlds. These are a choice any world can use, under plain names of the app's own (`LANDS`: plain, overgrown, shattered, aloft, adrift, unearthly, void). No new table and no migration: the choice is `PlanSettings.land`, and a plan carries its ground (`land`, `rifts`, `island`, `growths`).

- **A plan is laid out on ordinary ground first, then changed to suit its ground** (`shared/plan/land.ts`: `lieGrid`, `lieTown`), from its own seed, so it is the same every time. With ordinary ground nothing runs: every plan and drawing made before this version has the same fingerprint as before.
  - **Overgrown:** growth on free floor squares (17% by a wall, 3.5% in the open, an occasional clump of four), and two rooms in five with their walls broken (drawn rough). A town loses one unnumbered house in six to great growths, has them among its houses, and its fields become groves.
  - **Shattered:** one rift across the sheet (two on a large one), a wandering line with a width. Furnishings in it go; a passage square in it gets a bridge; a room it crosses says "the rift runs through it" among its ways out; a number in it moves to firm floor of its room. In a town the houses on it go and a great road that crosses it is bridged where it goes in and comes out.
  - **Adrift:** in a dungeon each connected run of passage with two or more room doors on it is removed down to a stub at each door, and those doors are given one letter (`Opening.to`): the key says "door east, marked A". The way in keeps its passage. A town stands on an island parted by a channel of mist.
  - **Unearthly:** every room and passage is drawn rough, the drawing bends every wall in long curves (the grid stays true, so tokens still fit), and a dungeon is laid out with the most ways round whatever was asked. A town has every point turned about its middle, more the nearer it is.
  - **Aloft** and **the void** change nothing in a dungeon's layout: they are what is drawn around it. A town on either (and adrift) stands on an island: an outline a little past its houses, with everything beyond removed, its water gone, and a landing stage where a great road meets the edge. Numbered places left beyond the edge are brought in to the brink.
- **The drawing** (`shared/plan/drawLand.ts`, and in `draw.ts` and `drawTown.ts`): stars on a black sheet, clouds, mist, the sea round a ship; an island's ragged edge with the strokes of the drop under its southern side; a rift as a broken dark band over floors and walls, with bridges over it; lettered doors on the GM's copy. On see-through paper there are no surroundings.
- **Ships** (`shared/plan/ship.ts`, kind `ship`): a hull whose width follows a curve from stern to bow, deck by deck, each deck down two squares shorter and the hold narrower; compartments by bulkheads with a door on the centre line (bars for a brig); a ladder between each pair of decks, to alternate sides so that two never meet; masts through every deck; a helm, casks and (on the larger two) a ballista on the open deck. Named compartments go to the deck their names suit. The hull is drawn fair: the corners where it steps in are left out and the rest rounded.
- **Suggested from the record** (`suggest`): a ship from its name or "Used for" (not if the words also name a kind of building: "The Ship Inn" is an inn); the ground from the name, "Used for", the first sentence of the text and the realm's name.
- **By hand:** a ship has the tools a building has, less the ready-made pieces. Growth, bridges, masts, helms and ballistae can be set down on any plan. The ground is fixed once a plan is drawn by hand; its rifts move with the sheet when it grows.

**Tests.** `tests/planLand.test.ts` has 13: every kind of plan on every ground, three seeds each, sound (doors in walls, things and numbers on floors), the same every time, drawn four ways with every mark well-formed, and the same after being put away; ordinary ground changing nothing; what each ground does, checked square by square; ships of each size (decks, masts, helm, ladders, a hull the same either side of its centre line, a door in every bulkhead); named compartments on their decks; the suggestions, and that the names used are the app's own; every kind on every ground kept by the server as chosen and as drawn. The first-run browser test draws a ship at sea and among the stars, checks the browser can show the picture, and keeps it as a record.

**Found on the way.** The new things (masts, growth, bridges, helms, ballistae) each gave a line its width twice. A page shows such a drawing well enough when it is part of the page, and refuses it whole as a picture: every ship, and every overgrown or shattered plan, was a broken image in the app while looking right in the pictures made for checking. The test for well-formed marks is there for this. A boat had no helm (its cabin door stood where the helm goes). A district cut from a town on an island lost the island.

**Not done.** A rift cannot be moved or drawn by hand, and an island's edge follows the floors rather than being drawn. A cave or a building adrift is only drawn in mist: nothing in it is parted. Doors that share a letter are not joined on the plan in any other way, and a hand-drawn door cannot be given a letter. A ship has no oars, sails or rigging drawn, no sweeps or rams, and one hull shape; its decks are not laid one over another. Growth is one drawing, whatever grows. Nothing here is per campaign: a town cannot be whole in one campaign and shattered in another.

## v0.9.27: joined plans

docs/BETA_PLAN.md C8, fourth part, and decision 6 of §5 (27 November 2026): levels of a dungeon linked by their stairs, a place inside a place, and a city in districts. The joins are between records: every plan is still one record's plan, so each joined plan has its own text, key, pictures, Atlas map and reveals. No new table and no migration.

- **Ways on** (`KEY_KINDS` gains `way`; `shared/plan/key.ts`): an entry of a numbered place that names another place's record and says how it is reached. Marked W on the GM's copy. Written into the record's text as "Way on: Stairs down. To @[The Lower Halls|DUN-0002]", a link the text follows.
- **A place that is a record** (`KeyRoom.record`): a numbered place tied to a record of its own, in the key ("Make it one" makes the record, under this one). A record kept under this one with the same name as a numbered place is tied to it without being asked, as its Atlas pin already was. The pin now follows an explicit tie first.
- **What a plan is joined to** (`joinedTo` in `server/src/repo/plans.ts`; `PlanInfo.joined`): the place it is kept under, with its number on that place's plan or the district it is; the places kept under it, and whether each has a plan; and the ways on that lead to it from other plans (found by looking in kept plans that mention its ID). The page shows these, with a link each way, in "Joined plans" under the key (`client/src/components/PlanJoins.tsx`).
- **A level below** ("Add a level below"): makes a record under this one (a dungeon or a cave), keeps a plan for it whose way in is worded from here (`PlanSettings.from`: "stairs up to the Cellar of the Gilded Flagon, north"), keys a way on to the chosen place, and, if asked, draws stairs in it (`stairsDown` in `shared/plan/edit.ts`: two free squares of the place's floor, off its number and its doorsteps, as far from its doors as may be), which makes the plan above a drawing of the GM's own. Done from the page with the existing routes.
- **Districts** (`shared/plan/districts.ts`; `PlanSettings.districts`, `PlanSettings.wards`): a town has four and a city six. They are worked out from the plan as drawn, with no dice: the houses about the middle are one ward and the rest are shared out around it, then each house goes to the nearest ward's middle until they settle; a ward of a handful of houses is given to its neighbours. Each is named for what stands in it (Market Ward, Castle Ward, Temple Ward, The Docks, and so on), then "Old Town" for the middle one, then by where it lies. Drawn as a broken line between neighbours and a name across each; the key says which district a place is in. The GM's names (`wards`) are laid over the plan's and are kept like the key, unasked. A plan without districts is exactly the plan it was (checked: the same fingerprint over every kind of plan and its drawing, before and after).
- **A district's own plan** (`districtPlan`): the district cut from the town's plan and drawn at 10 feet to a square, with everything on it (streets, houses, wall, water, trees) in the same place and the same size in feet. Kept as a drawing on a record under the town, so it is changed by hand and keyed like any other. Its numbered places are the town's that stand on its sheet, numbered afresh.
- A new town or city is suggested in districts; plans kept before this version are not changed.

**Tests.** `tests/planJoin.test.ts` has 8: districts over sixteen towns and cities (every house in one district, names unique and on their own ground, the same every time, and nothing else on the plan moved); their names, on the drawing and in the key, and the GM's own names drawn as words whatever they are; a district's own plan for every district of four places (the same houses, the same size in feet, places numbered afresh), and every district of a city kept by the server; a way on in a line, in the record's text, and read back; the way in worded from above with nothing else changed; stairs set down in every room that has space, and refused where there is none; what each of five joined records is told, and that players are sent none of it; a pin tied to its record. The first-run browser test adds a level below and follows the link down and back. The accessibility check's town is in districts, with a place tied to a record and a way on.

**Found on the way.** A place's ways out were limited to 80 letters each by the server, which the way in to a level below ("stairs up to the … of the …") could exceed once that level was changed by hand; the limit is now 260. Two checkboxes side by side in the choices sat on one line. The accessibility check, given a town with two records under it, found that the links in a record's "Contains" and "Mentioned in" lists were 20 pixels high, too short to press one under another; they are 24 now. A place renamed since its plan was drawn ("Inn", now "The Gilded Flagon") lost what it was when made a record, and got a house's plan; the record is now given "Used for: inn".

**Not done.** Levels are not laid one over another: each is its own sheet, and the stairs on one are not lined up with the stairs on the other. The words for where a level's way in comes from are fixed when the level is made, and do not follow a later change of name. A district's own plan is cut when it is made and does not follow later changes to the town's plan, nor the other way about. A building's plan opened from a town's is laid out afresh from its record: it is not the shape of its roof on the town's plan. Districts cannot be redrawn by hand (their lines are worked out, not drawn), and a hamlet or a village has none. Removing a record leaves any tie or way on that named it pointing at nothing, which the page says ("a record that is gone").

## v0.9.26: plans changed by hand, and made of parts

docs/BETA_PLAN.md C8, third part, and decision 6 of §5 (27 November 2026). Until now a plan could only be changed through its choices, by drawing another, or through its list of places. The owner asked for plans to be "modular and hand editable": rooms, passages and doors; things in rooms; squares painted; settlements too; parts kept while the rest is redrawn; and ready-made pieces.

- **A plan changed by hand is its own drawing** (`PlanSettings.drawn`, a `PackedPlan`). `makePlan` gives that drawing back as it stands; the seed and the choices no longer make it. A plan on squares is kept as runs of squares; a settlement's plan as it is. Nothing changes for a plan that has not been touched: it is still remembered by its settings alone. No new table and no migration: the drawing is part of the settings kept in `place_plans`.
- **The changes** (`shared/plan/edit.ts`), each giving a new plan and leaving the old one alone: `addRoom`, `moveRoom`, `resizeRoom`, `removeRoom`, `paint`, `rubOut`, `setOpening`, `putThing`, `turnThing`, `takeThing`, `addNumber`, `moveNumber`, `renumber`, `keep`; for a settlement `moveBuilding`, `turnBuilding`, `scaleBuilding`, `addBuilding`, `removeBuilding`, `numberBuilding`, `unnumber`. After each, what no longer makes sense is tidied: a door left in no wall goes, a thing left on no floor goes, a number left on solid ground moves to its room's nearest square, sizes and "ways out" are read again from the drawing, and the sheet grows or shrinks to keep its margins. Drawn past the edge, the sheet grows (`reach`).
- **Numbers and the key stay in step.** A change never renumbers by itself; `closeUp` then closes the numbers up and says which place each one was, and the page puts the key in the same order: a new room gets a place in the key, a room rubbed out loses its own, and what is keyed to the others stays with them.
- **Ready-made pieces** (`shared/plan/pieces.ts`): twelve (guard post, shrine, cells, crypt, vault, great hall, well room, crossroads, stair, secret room, barracks, collapse), each a few rooms and passages with doors and furnishings on a small grid of its own, set down turned any of four ways.
- **Kept rooms, and the rest drawn again** (`redrawRest`; `kept` and `keptOpenings` in `makeDungeon`): rooms marked Keep are handed to the dungeon maker as rooms already set down, of any shape, with what stands in them and the doors between two of them. The other rooms are placed around them and every passage is cut anew. The maker draws exactly what it drew before when nothing is kept (checked: the same fingerprint over 360 plans before and after the change). Dungeons only: a cave is one space with no rooms to keep, and a building's storeys are packed too tightly to place rooms around fixed ones.
- **One room furnished again** (`refurnish`, `shared/plan/again.ts`), in a dungeon or a building: its walls, doors, stairs and traps stay; its furnishings are set down afresh for the name it has now, and its number moves off anything that lands on it.
- **The page** (`client/src/components/PlanEditor.tsx`, in `PlacePlan.tsx`): "Change it by hand" shows a toolbar (Choose, Room, Floor, Rub out, Door, Thing, Number, Piece; for a settlement Choose and House) and lays a surface over the picture. Pointer and touch drag; the keyboard has a cursor that moves a square at a time and says what is under it, Enter to use the tool, Alt and Shift with the arrows to move and resize a chosen room, Delete to remove it. Undo and redo hold sixty steps of the drawing and the key's places; what has been written in the key since is kept through an undo. While it is being changed the plan is shown whole (numbers, secret doors, traps, furnishings) whatever copy is chosen for pictures. `?edit=1` in the address opens it so.
- **Saving:** a plan that has been kept, once changed by hand, is saved a moment after each change, like the key. A plan made afresh ("Start again", "Draw another") is still kept only when the GM says so.
- **The key, for a plan changed by hand:** a place is added on the plan (a room drawn, a floor numbered, a building numbered), not in the key; one removed from the key comes off the plan (a settlement's building stays, as a house); moving one earlier or later renumbers the drawing. Renaming never redraws.
- **The server** checks a drawing for shape and size, not for sense (`zDrawn` in `server/src/repo/plans.ts`): a sheet of at most 300 squares each way, squares that add up to the sheet, known kinds of door and thing, bounded lists.

**Tests.** `tests/planEdit.test.ts` has 22: a drawing put away and brought back is the same plan and the same picture, for every kind; each change; a run of 300 changes at random after each of which every door is in a wall, every thing and number on a floor, no two doors in one place, the numbers in order and the margins right; pieces in all four turns; kept rooms unmoved to one another with their contents through six redraws, every room still reachable, a door between two kept rooms left where it was; a room furnished again; a settlement's buildings; the drawing kept by the server for every kind and size of place, refused when it is not one, carried in a backup, and never sent to players. The first-run browser test draws a room and sets an altar down with the keyboard alone, undoes and redoes, and finds the drawing there on coming back. The accessibility check has the plan with the editor open (45 screens).

**Faults found on the way, all fixed.** The random run found three in the changes themselves: a room moved onto another's door left two doors in one place; a bed or a stair could be set down half in a wall; and removing a room renumbered the others before the key could follow. The browser check found that a settlement changed by hand could not be saved at all (a river runs on past the edge of the sheet, and the server's check allowed only ten squares past it), and that choosing a room on the plan scrolled the page down to its line in the key, away from the plan being worked on. A dungeon room that found no space on the plan used to shift the numbers of every room after it; a room now always has the number of its place in the key.

**Not done.** Walls cannot be drawn where there is no room edge (a wall is where two rooms meet, so a partition is made by drawing a room). A cave has no kept chambers and no pieces. A building's rooms added by hand are on no named storey. A settlement's streets, walls, water and trees cannot be changed, and a building's shape (its corners) cannot. There is no copy and paste, and no pieces of the GM's own. Undo does not outlast the page. On a very large city each change redraws the whole picture, which takes a moment.

## v0.9.25: the key to a plan

docs/BETA_PLAN.md C8, second part, and decision 6 of §5 (27 November 2026). v0.9.24 numbered a plan's rooms and gave each a size and its ways out; it had nowhere to say what was in them. The owner asked for a key whose encounters, traps, puzzles and loot can be changed, added and removed in the page.

- **The key** (`shared/plan/key.ts`): a `KeyRoom` for each numbered place (an ID of its own, its name, the name the plan was drawn for, a building's storey, words to read aloud, and entries); a `KeyItem` is an encounter, trap, puzzle, hazard, loot, secret, clue, person or note, with a few words, the rest, and the particulars of its kind (creatures with counts and stat block IDs; a DC and harm; coin and things; a record). Kept inside the plan's settings (`PlanSettings.key`), so there is no new table and it travels wherever the plan does (backups).
- **Until the GM touches the key** its places follow the record or are made up, as in v0.9.24, and change with the choices. From the first change the key is the GM's own, and the plan is drawn from its places.
- **Renaming a room does not redraw the plan** (`drawnAs`); "Draw it to suit the names" does, and so does "Draw another". Adding, removing or moving a room, or changing its storey, draws the plan again, because the plan is made from the list of places. (v0.9.26 is to make a kept plan its own geometry, which ends this.)
- **A building's usual rooms** stay drawn from its use while they are only keyed or renamed; when rooms are added, removed or moved they are drawn from their names and storeys (a name can carry its storey to the generator: `upper:Solar`).
- **Suggestions** (`POST /api/plan/suggest`, `suggestKeyItem` in `server/src/repo/plans.ts`): an encounter through the existing `suggestEncounters` (the party's level, the place's Danger and Terrain); loot through `rollTreasure` from the books (the party's level, the place's Wealth; a hoard in a treasury or a vault); a trap, puzzle or hazard from the app's own lists in `shared/plan/key.ts`, with a DC and dice by the party's tier and the place's Danger.
- **The page** (`client/src/components/PlanKey.tsx`, in `PlacePlan.tsx`): the key is under the drawing; a button over each number on the plan opens that place; the open place is ringed on the page (never in a picture taken away). Creatures and things are offered from the books as they are typed; an encounter goes to the tracker as an encounter of the active campaign. `?room=3` in the address opens a place.
- **Saving:** once a plan is kept, its key is saved a moment after each change. If the layout differs from the one kept, nothing is saved until the GM keeps the plan, and the page says so.
- **In the record's text:** "Write the key into the record" now writes a heading for each place, its size and ways out, the words to read aloud as a quotation, and a line for each entry, under "Map key (GM only)". `keyedNames` reads the places back from the headings alone (a first version read the "Encounter" and "Trap" lines back as rooms; a test caught it).
- **On the plan:** letters under a number on the GM's copy for what is keyed there (`DrawOptions.marks`).

**Tests.** `tests/plan.test.ts` has 26 (8 new): the key for a plan and a building's storeys carried into the drawing; each entry in a line; the Markdown reading back as the same places; marks on the GM's copy only; following the record's text by name; the numbers of suggested traps; the key kept, refused when it is not one, and absent from what players are sent even when its section is "revealed"; suggestions from the open rules. `scripts/e2e-first-run.mjs` keys a room in a real browser. `scripts/e2e-a11y.mjs` has the key with a room open and an entry of every kind (44 screens, no findings).

**Two faults the browser check found, both of the same kind and both fixed:** an answer that came back after a wait (the books matching a typed creature to its stat block; a suggestion) was applied to the key as it had been when the question was asked, undoing anything changed meanwhile. And the page compared the key as sent with the key as saved letter for letter, so a difference in the order of fields left it saying "Saving…" for ever.

**Not done.** Entries have no state at the table (sprung, looted, cleared) and nothing is per campaign. Loot does not go to the party's treasure from here. There is no way to key a passage, only a numbered place. The ideas for traps, puzzles and hazards are a dozen or so each, in English.

## v0.9.24: plans of places

docs/BETA_PLAN.md C8, the last step before 1.0-BETA. A dungeon, a cave, a building or a settlement laid out from its record and drawn as an ink line plan with a grid, to use as it is or dress up in a mapping tool.

**The laying out and the drawing are pure and seeded** (`shared/plan/`, no dependencies, the same code on the server, in the page and in tests): the same settings give the same plan and the same SVG, byte for byte, so a plan is remembered by its settings alone.

- `model.ts`: the plan types (`GridPlan`: a region number for every square, walls wherever neighbours differ, openings on square edges, features, numbered areas; `TownPlan`: roads, roofs, water, wall, trees, fields), a seeded random source, `noise` for the hand-drawn wobble.
- `dungeon.ts`: rooms set down one after another beside one already there (so they are met roughly in key order), nothing past the entrance side of room 1; passages by cheapest path through solid ground (turning little, joining a passage already cut, not running beside one); extra ways round between near rooms, and only those carry secret doors; `furnish` puts into a room what its name says. A cave is the same with ragged chambers, wandering tunnels and no doors (`natural`).
- `building.ts`: twelve uses, each with its storeys and rooms; the outline divided by weight (or rooms off a middle passage); stairs on the same squares of every storey; doors by a spanning tree from the stair room through the busiest rooms; windows; a storey with little in it covers part of the outline.
- `settlement.ts`: worked in feet, handed over in squares (10, 10, 20, 30 ft to a square by size). Roads out from a market place, lanes off them that stop at another street, the water or the edge of town; a river with bridges or the sea with jetties; a wall with gates where the roads cross it (lanes are cut short of it); the named places as the larger buildings nearest the middle (a "market", "bridge", "gate", "docks" or "field" is that feature, not a building); then a house on every plot the streets have room for, thinning outward.
- `draw.ts`, `drawTown.ts`: SVG at 100 units to a square. The floor's outline is traced once and used for the fill, the grid's clip and the walls, so they agree; rough walls are rounded through the same corners.
- `index.ts`: `PlanSettings`, `makePlan`, `suggest` (the plan that suits a record: its type, name, Population, Terrain, Danger, Wealth, Rooms and Used for facts, and words in its description), `keyedNames` (the places a record's text names), `planKey` and `keyMarkdown`.

**Server.** Migration 38, `place_plans` (the settings kept for a record, and the Atlas map made from them): in the backup table list and in record merging. `server/src/repo/plans.ts` and routes in `routes/atlas.ts`: `GET/PUT/DELETE /api/entities/:id/plan`, `POST …/plan/key` (writes a "Map key" section into the record's text, in place of the one there, through `updateEntity`, so History has it), `POST …/plan/map` (the players' copy as an Atlas map, a hidden pin per numbered place, the scale set; drawn again on the same map, the GM's own pins kept). `POST /api/plan-files` and `GET /api/plan-files/:token` (`server/src/lib/handBack.ts`) hand a picture made in the page back as a download with a name: every file the app offers to save comes from the server, which is the one way that works in the desktop app too. Six files at most, ten minutes, in memory; PNG or SVG only, served as an attachment under a sandbox policy.

**Client.** `client/src/pages/PlacePlan.tsx`: `PlanMaker` (used at `/e/:id/plan` and as the Places tab of Generators), `PlanPanel` on place records. The PNG is made in the page (SVG to a canvas at the pixels asked for).

**Tests.** `tests/plan.test.ts` (18): the same plan for the same settings; 60 dungeons and 60 caves each all of a piece, every named room numbered, every door in a wall; a dungeon still all of a piece without its secret doors; every building use on 12 seeds, each storey of a piece, with a way in and stairs; settlements of each size with each kind of water; the SVG whole and escaped; the players' copy without secrets, traps or numbers; reading a record; the key reading back as the same names; keeping, forgetting, the key written once, the map and its pins, the backup round trip, the download route. `scripts/e2e-first-run.mjs` now draws a plan in a real browser, keeps it, saves the picture and checks its size in pixels, and makes the map. `scripts/e2e-a11y.mjs` has the plan page (43 screens, none with a finding).

**Looked at, not only tested.** The drawings were rendered to pictures and looked at through the work, and changed for what was seen: hatching too coarse; the entrance buried in the middle; caves that were one great hall; a town with thirty houses (plots were tried one stretch of road at a time); a river that read as a road; lanes through the wall. One fault only looking found: the Atlas measures a pin's place up from the bottom of a map, so the plan's pins were upside down.

**What this is not, and what is left.**

- Nobody has run a game from one of these, and no picture has been opened in Arkenforge or a virtual tabletop: that the grid lines up at the pixels given is arithmetic, not experience.
- A plan cannot be edited by hand (move a wall, add a room): the choices are the settings, another seed, and the record's own list of rooms.
- Rooms are oblongs; there are no round rooms, diagonal walls, or levels of a dungeon joined by stairs. A cave has one way in.
- A settlement's streets and houses do not follow hills, and a city is a large town: there are no districts.
- A plan's settings do not travel in a worldbook (the picture added to the record and the map made from it do).
- `keyedNames` reads English headings ("Rooms", "Inside", "Places in town", "Map key"); `suggest` reads English words.

## v0.9.23: security, and publishing by GitHub's rules

docs/BETA_PLAN.md A7.

**Found: any website open in the GM's browser could reach the GM's server.** It asks for no password because it answers only on the GM's own computer, but a browser on that computer carries requests from any page. Shown against a running copy before the fix: a request under another name (`Host: evil.example`) got every record back (so a site that points a name at 127.0.0.1 after loading, "DNS rebinding", could read the library); a plain cross-site POST opened the table to the network; and a cross-site file upload reached the restore-a-backup route (a browser sends those without asking). True of every version before this one; the fixed port the desktop app took in v0.9.21 made it easier to aim at.

- **The guard** (`server/src/guard.ts`, first thing in `createApp` and in the recovery app, so on the GM's server, the table and the network listener): (1) the `Host` asked for must be an IP address, `localhost`, a single-label name, or one ending `.local`, `.lan`, `.home.arpa` and the like, or be listed in `WORLDKEEPER_ALLOWED_HOSTS`; (2) a request that is not GET, HEAD or OPTIONS must not say it comes from elsewhere (`Origin` equal to `Host`, or `Sec-Fetch-Site` of `same-origin` or `none`; a request with neither is not from a browser and passes). Every answer carries `Cross-Origin-Resource-Policy: same-origin`.
- **The desktop window** (`may_show` in `src-tauri/src/lib.rs`): navigation is allowed only to the app's own server and the shell's start page.
- **Reviewed and left as they are:** uploads (sniffed, SVG refused, strict names), archives (every path checked, nothing unpacked as it stands), the page's content security policy, secrets (owner-only file outside the library), the table's codes (40 bits, addresses not passwords: documented).
- **Tests:** `tests/guard.test.ts` (10): the two rules; the three attacks above refused with nothing changed; the app's own pages and scripts still served; the table and the recovery page held to the same; the guard is first in each app. `scripts/e2e-table.mjs` now has a second website on the same computer, in a real browser, try to open the table and upload a backup; checked that it fails with the guard taken out ("A page on another site opened the table to the network") and passes with it in. (A first try used a page with no address of its own, which the browser stopped before it could ask: some browsers add protection of their own here, but it differs between them and is not what the app relies on.) `cargo test` covers `may_show`.

**Publishing had only ever met a stand-in for GitHub.** GitHub's documentation (read for this step; the stand-in in `tests/publish.test.ts` now behaves as it says) showed three things the publisher did not handle:

- **An empty repository** ("You are unable to create new references for empty repositories"), which is what a GM following the guide makes. The publisher now starts it with a README through the Contents API, then publishes as before.
- **"No more than 80 content-generating requests per minute and no more than 500 per hour."** A handbook is 72 files of the app before any picture, each sent by itself. Text files now go inside the tree request (`content`), in batches of at most 80 files and 900 kB, each tree built on the last; only pictures, fonts and files over 200 kB are sent one by one, a second apart when there are more than forty. If GitHub refuses text in a tree, those files fall back to being sent singly.
- **Being told to slow down** (403 or 429 with `retry-after` or `x-ratelimit-reset`): it waits as long as asked (a minute if not told), up to four times and five minutes each, then says when to publish again.
- Also: each request has a two-minute limit; a token without the right permission is told which one, in the words GitHub's settings use.

**The one thing not done: none of this has run against GitHub itself.** This session has no way to (it needs the owner's token and a repository of theirs). `npm run publish:check -- owner/repo` (`scripts/publish-check.ts`) does it in a minute: four test files to a branch of its own, read back and compared byte for byte, published again, the branch deleted. The parts resting on documentation alone are: that the Contents API starts an empty repository; that a tree accepts a few hundred kB of inline text; the exact words of GitHub's empty-repository error (the publisher looks for a 409 whose message has "empty" in it).

## v0.9.22: accessibility and devices

docs/BETA_PLAN.md A6. There had been no keyboard-only, screen-reader or contrast pass, and no pass of the GM's app on a tablet.

**The audit** (`scripts/e2e-a11y.mjs`, `npm run e2e:a11y`, a step of CI's `e2e` job; `axe-core` is a dev dependency): on a small seeded world, 42 screens (39 of the GM's app, 3 of the handbook) plus the open search box, in both themes, against axe-core's WCAG 2.1 and 2.2 A and AA rules; the same screens at 820×1180 and 1180×820 with touch (nothing wider than the screen, axe's `target-size`); and the keyboard alone on four screens (the first Tab is "Skip to the page" and the next lands in the page; 45 stops each with a name and a visible focus; the search dialog keeps Tab, closes on Esc and returns the focus; a screen change sets the title and is announced). The first run found 106 things; it now finds none.

**What it found, and the fixes**

- **Faint text (13 screens).** The colour tokens pass AA at full strength, but they were used part see-through: `text-gold/90` on section titles and prose headings, `text-gold/80` on empty states, `text-dim/NN` in 47 places, `opacity-60` on fact labels, and gold words on a 15% gold tint (the chosen option of a segmented control, `btn-primary`). All are now solid; the tint is 10%; and Warm Parchment's gold is a shade darker (`121 85 16`) so it reads on its own tint over the page. `tests/designTokens.test.ts` now checks gold on the tint over every surface and refuses the see-through patterns in the stylesheet.
- **Names that didn't match what is shown (40 screen checks: the top bar is on every screen).** The search button (called "Search", showing "Search… Ctrl K"), the campaign menu (called "Active campaign", showing the campaign's title), roll buttons on the sheet (called "Roll Stealth", showing "+4"), "Level up", and the picture frame. Each is now named by its visible words, with the rest added out of sight (`sr-only`) where needed.
- **Links marked only by colour:** `className="text-arcane"` links are underlined.
- **Too small to press:** the sheet's diamonds were 16×16; they are 24×24 with clear space between (`.diamond`), and `btn-ghost` is never under 24.
- **Structure:** an unnamed icon button (Treasure), and an empty state that was a `<div>` straight inside a `<ul>` (the initiative tracker).
- **Keyboard:** there was no way past the bars and menu (`SkipLink` in `client/src/components/ui/feedback.tsx`, first in both layouts; `<main id="main" tabIndex={-1}>`); text boxes hid the focus ring (`.input` and `.input-bare` no longer remove it); the search box let Tab out to the page behind and ignored Esc once the focus had left its text box (`useOverlay` in `overlays.tsx` now keeps Tab inside every dialog and drawer, and the search box uses it).
- **Screen readers, beyond what axe checks:** nothing said the screen had changed and the window's title never did (`PageAnnouncer`: the new screen's `h1` goes into the title and a polite live region, in both layouts); every long-text editor was called "Text" (the editor is not a text box to the browser, so a `<label>` round it names nothing; `Field` now passes its label down through `FieldLabel`, and `AutoTextarea` falls back to its placeholder).
- **Motion:** `prefers-reduced-motion` now stops every transition and animation, not only the loading shimmer.

**Not found:** nothing ran off the side of a tablet held either way on any of the 41 screens.

**What this is not.** A machine finds perhaps a third of what gets in a person's way. Nobody has used the app with a screen reader, by switch or by voice, and it has not been held as a real tablet. The audit covers 42 screens of about 70, each in one state (few dialogs, no map with pins, no combat under way, no builder steps). axe marks contrast it can't work out (text over the page's gradient) as "can't tell", which this does not count; the token test covers those colours instead.

## v0.9.21: help inside the app

docs/BETA_PLAN.md A5. The manual was Markdown in the repository; in the app there was a first-run wizard, a Getting started card, and nothing after.

- **The guides are part of the app.** `GUIDES` in `shared/help.ts` names ten files of `docs/` (quick start, features, players, data, rules, worldbooks, shortcuts, installing, troubleshooting, what's new); `client/src/lib/helpDocs.ts` bundles them with `import.meta.glob(..., '?raw')`, each its own chunk, loaded when first wanted. Offline, in the desktop app, and always the installed version's. Nothing was added to the server or the desktop packaging.
- **The page** (`client/src/pages/Help.tsx`, `/help` and `/help/:guide`, in the Library menu): the list of guides, a search box, the guide rendered with headings addressable as GitHub addresses them (`slugify`), and "In this guide". `resolveLink` keeps a link to another guide in the app and sends any other file of the project to GitHub.
- **Help for the screen you are on:** `?` in the top bar and the `?` key go to `helpFor(pathname)`: `HELP_FOR_PAGE` maps the start of an address to a guide and a heading (the longest match wins; the quick start otherwise).
- **Search:** `searchHelp` splits the guides at their headings (`sections`, which ignores a `#` inside a code example), needs every word, and weighs a word in a heading far above one in the text. The Help page shows up to twelve parts; the search palette (`Ctrl+K`) adds up to three after the world's own results.
- **What's new:** `docs/WHATS_NEW.md` (written for GMs, 0.9.3 to now). `server/src/whatsNew.ts` keeps the version that last ran in `shared/app.json`; `/api/meta` returns `updated: { from, to }` while the GM hasn't seen it, and `WhatsNewNote` shows one line under the top bar. A first install shows nothing (noted at start, before anything is made); an installation from before this was kept shows it without a "from"; going back a version shows nothing.
- **New guide:** `docs/SHORTCUTS.md` (the table that was in DEVELOPMENT.md, completed with the editor's keys and `?`).
- **Fixed on the way: the desktop app forgot every preference at each start.** The shell took any free port, and the page keeps the theme, the folded menu, pinned records and the editor's mode under its address, port included. The shell now takes port 43110 when it is free (`HOME_PORT` in `src-tauri/src/lib.rs`) and any free one otherwise.
- **Tests:** `tests/help.test.ts` (10): the bundled files are the guides; headings and their addresses; every link in every guide leads to a heading or a file that exists (checked that it fails on a broken one); every screen's help names a real heading; search; What's new has this version first and is said once. `cargo test` covers the port.
- **Tried in a browser** on a library with a world in it: the note, `?` from the campaign page landing on Campaigns, What's new and the note gone after, search, links between guides and out of them, the shortcut tables, the `?` key, and help in `Ctrl+K`.
- **Not done:** help in the players' handbook (it has its own short pages); pictures in the guides (none of them has any); the guides are in English only.

## v0.9.20: tested like a product

docs/BETA_PLAN.md A4. CI drove only the first-run wizard; the table, the built desktop app and a large library had never been tried automatically.

**Three new checks**

- **A session at the table** (`scripts/e2e-table.mjs`, `npm run e2e:table`, in CI's `e2e` job): the GM's app and two players' phones in real browsers, on an empty data folder. The table is unreachable until opened and again once closed; the table's server refuses the GM's API; a revealed record reaches a phone with its revealed section only (an unrevealed section stays hidden, and so does a section headed "GM notes" even when it is ticked by mistake); every answer the table's server gave a phone is searched for the secret texts; hit points follow both ways without a reload; a player's roll shows on the GM's screen and the other phone, and the GM's hidden roll doesn't. Checked that it fails when the unrevealed section is revealed.
- **The built desktop app** (`scripts/desktop-smoke.mjs`, `npm run desktop:smoke`, in `.github/workflows/desktop.yml` before the upload): the real app on an empty data folder. Its server starts; its window loads the app (the server logs "the app's page has loaded" at the first `/api/meta`, which only the page's own script asks for: `notePageLoaded` in `server/src/log.ts`); pages, scripts and the API answer; a record round-trips and a backup is made; adding the Oros worldbook brings its records; nothing is logged as an error; closing it stops its server. Linux: the installed `.deb` and the AppImage. macOS: the program in the `.app`. Windows: the app as the NSIS installer installs it.
- **A large library** (`tests/largeLibrary.test.ts`): 10,000 linked records, a third revealed, with a limit on each thing a GM does often. Timings on this machine: the list of every record 115 ms, a search 16 ms, a record's page 5 ms, a save 6 ms, the graph 139 ms, the consistency check 127 ms, a backup 495 ms, a JSON export 613 ms, the players' list 248 ms.

**What trying the release build found: the app had not built on Windows or macOS since v0.9.6**

`client/src/player/sheet` held `LevelUp.tsx` and `levelUp.ts`. On Windows and macOS those are one file, so `import './LevelUp'` found the wrong one and the build stopped. Linux, where the project is written and where CI ran, never noticed; the last published release (v0.9.2) is from before it. The rules are now `levelUpRules.ts`, and `tests/fileNames.test.ts` refuses two names in a folder that differ only in capitals or only in their ending.

With that fixed, the release workflow was run by hand on this branch (build only, nothing published; run 45802330601) and the smoke test passed on all three: Windows on `C:\Users\runneradmin\AppData\Local\The Worldkeeper\worldkeeper.exe` (the copy the installer installed), macOS on the program inside `The Worldkeeper.app`, Linux on `/usr/bin/worldkeeper` from the `.deb` and on the AppImage. This is the first time the app has been started on Windows or macOS by anything but a person.

**What the large library found: every save read every other record**

Making 10,000 records took more than ten minutes, because each save took longer than the last (37 ms at 3,000 records; it would have been about 125 ms at 10,000). Four things each read the whole library on every save:

- **The two indexes of names** (`loadMentionIndex` for `@[Name]`, `loadNameIndex` for names written plainly) were built from every record each time, the second with one search pattern of every name. They are now kept for the connection and brought up to date (`server/src/repo/mentions.ts`): temporary triggers on `entities` note the IDs that changed, so no code path can forget to say; another connection's change shows in `data_version` and rebuilds them; and a rolled-back transaction is noticed by marks kept in a temporary table that the rollback empties. `MentionIndex` gained `add`/`remove`; `NameStore` (`server/src/repo/nameMatch.ts`) replaces the built-per-call index and finds names in prose by how each word starts instead of one pattern of every name.
- **The search index**: replacing a record's entry meant finding it by reading every entry (FTS5 can't look one up by its record). `server/src/repo/search.ts` keeps a temporary table of (kind, ref) to entry.
- **The next free ID** read every ID of the type. It now asks the ID index for the highest (and, as a side effect, no longer offers `NPC-10000` for ever once 9,999 of a type exist).
- **Deleting a record's field-derived links** read every link; it now uses the indexes on the two ends.

After: 10,000 records in 14 s, and a save costs the same at 10,000 records as at 10.

**Why this is safe** (a stale name index would link records wrongly without saying so): `tests/keptIndexes.test.ts` holds the kept indexes to freshly built ones (`buildIndexes`) through 400 random changes of every kind, made through the functions and straight into the database, with rolled-back and nested transactions; a first look inside a rolled-back transaction; a change through a second connection; the new prose scan against the old pattern on 3,000 generated texts; the search entries through edits, a rollback, a rebuild and a stray duplicate; and the next ID past 9,999. Separately, the new scan was compared with the old on every line of the Oros world (11,187 lines, 4,500 names found): no difference.

**Not fixed, noted:** `db.prepare` is called afresh for every statement (about a fifth of a save's time is compiling SQL); a statement cache would help everything a little. After a very large import the server pauses for a moment while Node clears up (seen as a 2.4 s pause after 10,000 saves in one unbroken run; a server answering requests between saves never builds this up). A GM app in one process and the players' server in another (`npm run start:player`) rebuild the name indexes after each other's writes (150 ms at 10,000 records); the table opened from the app shares the connection and doesn't.

**Not done:** component tests of the client (the browser tests cover it end to end instead); the archive-based smoke test stays local.

## v0.9.19: when something goes wrong

docs/BETA_PLAN.md A3. Until now the server's words went to a terminal a desktop GM never sees, an unexpected error left nothing behind, and there was nothing to put in a bug report and nowhere obvious to send one.

- **The log** (`server/src/log.ts`): `startLog` (called first thing in `server/src/index.ts`) writes `logs/worldkeeper.log` in the data folder and makes everything the server already says through `console` go there too. `logError(doing, err)` writes an error with its stack; `logInfo` writes only to the file (silent in tests). The file is rotated at about 1 MB with one older file kept. In the desktop app the server writes only to this file, so the shell's `logs/server.log` (which captures the server's output) is left for what happens before the log starts; the shell now sets a `server.log` over 1 MB aside at launch (`set_aside_if_large`).
- **What is logged:** the start (version, system), the library that opened and any update of it (with the name of the copy made first), an automatic backup or its failure, the table and the network door opening, stopping, every request that failed unexpectedly (the method and path only: `POST /api/entities failed`, never the body or the query), anything nothing caught (`uncaughtExceptionMonitor`), and what the page ran into.
- **Errors in the page** (`client/src/lib/report.ts`): `watchForErrors` (window errors and unhandled rejections) and the error boundaries send the message, the stack and the screen's path to `POST /api/log/client`, which cuts them to size and accepts twenty a minute (`clientReport`). An `ApiError` is not reported from the page: the server already logged it if it was unexpected.
- **Copy details for a bug report** (`server/src/diagnostics.ts`, `GET /api/diagnostics`): the version, the system, the library's schema and sizes as numbers, which parts are on, the update check's state and the newest 150 log lines, as text. No library name, record or campaign is in it; the bundled worldbook is named and a GM's own are only counted; `scrub` replaces the home folder with `~`. Nothing is sent: the GM copies and pastes.
- **Where it is offered:** **Settings → Help and bug reports** (`client/src/components/Help.tsx`: the button, "See what is copied", a link to the new-issue page, and "Show the log files" in the desktop app); on a screen that broke; and on the page shown when no library can be opened (`server/src/recovery.ts`), which has no app to copy from, so the details are on the page.
- **Found while trying it:** an error outside any one screen (in the frame every screen sits in) left a blank window, because only the screens had an error boundary. `AppSafetyNet` in `client/src/main.tsx` now catches those and shows the error with "Try again", "Go to the start page", "Copy details" and "Report a bug".
- **Issue forms:** `.github/ISSUE_TEMPLATE/` has "Something went wrong" (asks for the copied details, which app, and whether data is affected; says reports are public) and "An idea".
- **Docs:** `docs/TROUBLESHOOTING.md` (reporting, the log and where it is, the app not starting, a library that won't open, getting a world back from a backup, a failed update, players who can't reach the table).
- **Tests:** `tests/log.test.ts` (12): the file's format, rotation and tail; errors logged with the kind of request and not what was sent; the page's reports cut and limited; the details hold no names and no home folder; the recovery page carries them; the log is not in "back up everything"; the issue form names the button as the app does. `cargo test` covers the shell's log trim.
- **Tried in a browser** on a scratch library: the Help panel, the copied text read back from the clipboard, a single broken screen (the menu stays), the whole frame broken (no blank window), and the recovery page on a deliberately damaged database.
- **Not tried:** "Show the log files" (desktop app only: it uses the same `openFolder` as "Show the library's folder"); the desktop build writing only to `worldkeeper.log`; the issue forms as GitHub renders them (they are checked as text, and appear only once this is on the default branch).
- **Left out:** no "send report" button (it would need somewhere to send to and would be the app's first upload of anything); the details are text only, with no file to attach.

## v0.9.18: the app updates itself

The owner asked for updating to be seamless (26 November 2026). Installing a newer version over an older one already upgraded in place, but by hand, and with the unsigned-app warning each time.

- **The shell** (`src-tauri/src/lib.rs`, `tauri-plugin-updater`): `on_navigation` sees the page go to `/__shell/update?tag=…` on `127.0.0.1`, cancels the navigation and calls `start_update`. `valid_tag` lets only `vN.N.N` (with an optional pre-release part) into the address; the address is otherwise fixed (`RELEASE_DOWNLOADS/<tag>/latest.json`). `run_update`: check, download (the plugin verifies the signature against `plugins.updater.pubkey`), stop the server, install, `restart`. `can_self_update`: Windows, macOS, and on Linux only an AppImage; the server is told with `WORLDKEEPER_SHELL_UPDATER`. A failure after the server was stopped still restarts the app (this version), with the reason on record. `WORLDKEEPER_UPDATE_ENDPOINT` replaces the address in development builds only.
- **Status:** the shell writes `update-status.json` in the data folder (`checking`, `downloading`, `installing`, `failed`); `installStatus` in `server/src/updateCheck.ts` reads it, clears it once the running version is the one it was updating to, and calls it failed if it has been left half-way for 30 minutes. `GET /api/update` adds `canInstall` and `install`; `POST /api/update/dismiss` forgets a failure.
- **Offered only where it can work:** the daily check records `latest.installable` (the release has a `latest.json`); the button needs that, `canInstall`, and a session on the computer itself (not the tablet). Otherwise the card shows the link, and now says that nothing needs removing first.
- **Releases** (`.github/workflows/desktop.yml`, `scripts/updater-manifest.mjs`): with the repository secret `TAURI_SIGNING_PRIVATE_KEY`, the build makes signed update files and the release gets `latest.json`; without it, both are as before. The manifest uses GitHub's names for the files (spaces become dots).
- **The key:** the public half is in `src-tauri/tauri.conf.json`; the private half is not in the repository (a test checks). See `docs/DESKTOP.md`.
- **Two bugs found while trying it on a real build, both older than this release:**
  - **A backup downloaded from the Backups page was eleven bytes of `{"ok":true}`, not the backup.** `res.download` sends in the background, and the route's wrapper (`h`) answered first. The route now waits for the download. The backups on disk were always whole, and restoring one from the list worked; only the downloaded copy was wrong. (`GET /api/backups/:file`.)
  - **In the Linux AppImage the app's pages did not load** (`{"error":"Not Found"}`), and on any Linux desktop install pictures would not have shown: Express refuses to send a file whose full path passes through a hidden folder, and an AppImage runs from `/tmp/.mount_…` while a Linux data folder is under `~/.local`. The app's page, uploaded pictures and backups are now sent by name inside their folder (`{ root }`). `tests/hiddenFolders.test.ts` covers all three.
- **Tests:** `tests/updateCheck.test.ts` (installable, the status file, the manifest script, no private key in the repository); `cargo test` in `src-tauri` (the tag and the address).
- **Tried for real, on Linux:** two signed AppImages (0.9.18 and one built as 0.9.19) and a local file server standing in for the release. Pressing **Update and restart** in the running 0.9.18 app: the confirmation, "Downloading the new version…", then the AppImage on disk was the 0.9.19 file byte for byte and the app had started again, about fifteen seconds later. With one byte of the download changed: "The signature verification failed", the AppImage untouched, the app still running, and the page saying why. `docs/DESKTOP.md` has the steps.
- **Not tried:** Windows (the NSIS installer run by the updater) and macOS (the `.app` replaced in place, on an unsigned app) at all; the release workflow's new steps (they run only on a tag); an update fetched from GitHub itself rather than a local stand-in.

## v0.9.17: the update check, and installing an unsigned app

`docs/BETA_PLAN.md` A2, as the owner decided: no paid signing; a daily check for a newer version, on by default.

- **`server/src/updateCheck.ts`:** `checkForUpdate` asks GitHub's list of this project's releases (`RELEASES_API`, the list and not `…/releases/latest`: every release so far is marked pre-release on GitHub, and that address leaves those out and answers 404), takes the highest version among the published ones (`parseVersion`, `isNewer`; a draft is skipped), and keeps the answer in `shared/update.json` for the installation. At most once a day unless `force`; never when switched off unless `force`; a failure keeps what was known and records why. The request carries `Accept` and `User-Agent: The-Worldkeeper/<version>` and nothing else. A release's link is only kept if it is under this project's releases page.
- **When:** `scheduleUpdateChecks` in `server/src/index.ts`: 20 seconds after the GM's server starts, then every six hours (the once-a-day rule decides). Not on the table server, not in tests, and not at all with `WORLDKEEPER_NO_UPDATE_CHECK=1`. Opening the app's pages asks GitHub nothing.
- **Routes:** `GET /api/update`, `PUT /api/update` (`{ enabled }`), `POST /api/update/check` ("Check now").
- **Client:** `client/src/components/Updates.tsx`: `UpdatesPanel` in Settings (the switch, Check now, what is known, what the check sends) and `UpdateIndicator` in the top bar, shown only when a newer version exists.
- **`docs/INSTALL.md`:** which file to download for each system, opening the unsigned app on Windows and macOS, checking a download against the SHA-256 GitHub shows for each file, updating, going back, removing. README points to it.
- **Not done:** the install steps were written from the systems' standard behaviour and the names of the real release files; they have not been tried on a Mac or a Windows PC. No installer for Intel Macs. The app doesn't download or install updates itself.
- **Tests:** `tests/updateCheck.test.ts` (GitHub's answer is given to it; no test uses the network).

## v0.9.16: the bundled world is Oros

The owner's decision of 26 November 2026 (`docs/BETA_PLAN.md` §5): "Worldkeeper" is the app; its bundled world has a name of its own, Oros. Sections below this one were written before the rename and still say "the Worldkeeper world" or "the Worldkeeper worldbook".

- **The pack** (`packs/worldkeeper/pack.json`): `name` is "Oros", and its world realm (`id: world`) is named "Oros". The pack's ID, folder and every record ID are unchanged, so nothing in an installed library moves.
- **In a library** (`server/src/packs/registry.ts`): `syncPackDefinitions` renames the library's world realm to the pack's name only while it still has the default name "The World" (a name the GM gave it is kept); `uninstallPack` puts "The World" back if the realm still carries the pack's name; `syncInstalledPacks` updates the worldbook's stored name. Records are matched to realms by ID and by the pack's own words, never by the world realm's name, so imports are unaffected.
- **The rules pack** is "The Oros worldbook" and its credit line "The Oros worldbook's rules (CC BY 4.0)" (`server/src/repo/settingPack.ts`, `rulesPacks.ts`); the licensor is still the Worldkeeper contributors.
- **The lore:** `DEC-910` (the owner's decisions register) records the name, and that its origin is UNDEFINED. The archive's own text is not edited.
- **Wording:** the first-run wizard ("Play in Oros", "Add the Oros worldbook"), empty states, README, Quick Start, Features, Worldbooks and Rules packs docs. Code comments and the plans keep the old wording.
- **Tests:** `tests/settingPack.test.ts` and others for the names; `tests/settingPacks.test.ts` for the realm's name on install, with a GM's own name, and on uninstall.

## v0.9.15: safe upgrades

`docs/BETA_PLAN.md` A1, the first step of section A (trust).

- **`migrate`** (`server/src/db/migrations.ts`): refuses a library with steps this version doesn't know (`NewerLibraryError`); calls `beforeUpgrade(from, to)` before changing a library made by an earlier version; runs every missing step in one transaction, so a failure keeps none (`UpgradeError`, with `from`, `to`, the backup's name and the failing step). `openDatabase` passes the hook through and closes the file if it throws.
- **The backup** (`AppContext.open`): `createBackup(db, paths, 'pre-update-step-<from>', { uploads: false })`, the database only. `createBackup` now makes its folders, tolerates a library too old to have every counted table, and writes `uploads: false` in the manifest. `pruneBackups` keeps the newest eight `pre-update` backups, and counts `pre-merge` and `pre-replace` among the automatic ones.
- **Said once:** `finishOpening` writes the setting `upgrade_notice` (`{ from, to, backup, at }`); `GET /api/meta` returns it as `upgrade` with `version`; the client shows a toast and posts `/api/meta/upgrade-seen`. The Backups page says why each backup was made.
- **Switching libraries** (`AppContext.openLibrary`): the other library is opened before the open one is closed, and `libraries.json` is only updated on success, so a library that can't be opened leaves the GM where they were (409 with the reason).
- **At the start** (`server/src/index.ts`, `server/src/recovery.ts`): if the library can't be opened, the GM's server still listens and serves a plain page (no client bundle, no database): what happened, that nothing changed, the backup, what to do, the details for a bug report, **Try again**, and the other libraries to open. `POST /recover` tries again and the real app takes over without a restart. `/api/health` is 503 `{ recovery: true }` meanwhile. The table server process stops, as before.
- **`shared/version.ts`** (`APP_VERSION`): one more place the version is written; the test checks all seven agree.
- **Tests:** `tests/migrations.test.ts`: the checksum lock (`tests/migrations.lock.json`); libraries at steps 1, 4, 9, 15, 22, 30 and the one before last, opened and checked; a new library needs no backup; a failing step changes nothing; a newer library is refused; in the app, the backup, the notice and a restore; staying put when another library can't open; the recovery page.
- **Not done:** the old libraries in the tests are built by running the first N steps, not files kept from real old releases; the steps that run after `migrate` when a library opens (adopting dates, syncing types and templates) are not in the transaction.

## v0.9.14: the GM app on another device

`docs/BETA_PLAN.md` B8, the last step of section B.

- **`server/src/remote.ts`:** a second listener (`openRemote`, `closeRemote`; port 4330 or `WORLDKEEPER_REMOTE_PORT`, on `0.0.0.0`) serving the same GM app as `createApp(ctx, { gate })`. `createApp` takes an optional `gate` that runs before anything else, the JSON body parser included.
- **The gate** (`remoteGate`): requests outside `/api` (the built client) pass; under `/api`, only `health`, `GET /api/remote/session`, `POST /api/remote/login` (a body of at most 4 kB) and `POST /api/remote/logout` answer without a session; everything else is 401 `{ signIn: true }`. The path is compared in lower case, as Express routes it (`/API/entities` is `/api/entities`). With a session: `/api/remote…` is 403 (the password and the door are for the computer itself), and a change whose `Origin` isn't the listener's own host is 403.
- **Password and sessions:** `setPassword` keeps `scrypt$salt$hash` in `shared/secrets.json` (`gm_remote_password`; not in the database, so not in backups or exports) and clears every session. A session is a random 32-byte token in an `HttpOnly; SameSite=Strict` cookie (`wk_gm`), kept in memory as its SHA-256 with a 12-hour sliding life; closing, restarting or `signEveryoneOut` ends them. `signIn` counts failures: from the fifth, a lockout of 30 seconds doubling to 15 minutes (429).
- **Local routes** (`server/src/routes/table.ts`): `GET /api/remote`, `GET /api/remote/session` (`{ remote: false, signedIn: true }`), `PUT /api/remote/password`, `POST /api/remote` (`{ open }`), `POST /api/remote/sign-out-all`.
- **Client:** `client/src/components/RemoteAccess.tsx`: `RemoteGate` around the GM app (asks `/api/remote/session`; shows the sign-in page on another device; a 401 with `signIn` anywhere raises `wk-sign-in`, from `client/src/lib/api.ts`), and `RemoteAccessPanel` in Settings (the controls on the computer; **Sign out** on the other device).
- **Limits:** plain HTTP, so the password and the cookie can be read by someone listening on the same network; the lockout is for everyone at once, so a device on the network guessing passwords can keep others from signing in until the GM changes the password or closes the door. No per-device names or permissions: a signed-in device is the GM.
- **Tests:** `tests/remote.test.ts`.

## v0.9.13: bulk tools

`docs/BETA_PLAN.md` B7. All of it is in `server/src/repo/bulk.ts` and `client/src/pages/BulkTools.tsx`.

- **Tags** (`tagList`, `renameTag`, `deleteTag`; `GET /api/tags`, `POST /api/tags/rename`, `/api/tags/delete`; page `/tags`): every tag with its count. Renaming onto a tag that exists merges the two. Tags the app keeps (`realm/`, `status/`, `vis/`) are listed apart and can't be renamed or removed by hand.
- **One change to many records** (`bulkEdit`; `POST /api/entities/bulk` with `{ ids, action }`): add or take off tags, move to a world or realm, put inside a record (never inside itself or its own contents), set the canon status, reveal or hide (to everyone, or one campaign with `campaign_id`), archive. One transaction. The `realm/` and `status/` tags follow. In the client it is **Select** on any record list (`EntityTable`'s `pick` prop) and the `BulkBar` under it.
- **Merge** (`mergeRecords`; `POST /api/entities/:id/merge` with `{ from }`, after a `pre-merge` backup; **More → Merge another record into this**): the kept record takes the other's name and alternate names as alternate names, its tags, the facts it lacks (a fact that differs is written into the text), its text under `## From <name>`, its notes, and the players' text if it had none. Every column that holds a record's ID is pointed at the kept record (`POINTERS`: parents, quests, map pins and outlines, campaign state, standing, pictures, reveals, stat blocks…); where each record has one row of its own, the kept record's stays. The other record becomes a redirect (`type = 'redirect'`, `redirect_to`), so its ID, and links written with it, still lead somewhere. Players see none of the merged-in text until its section is revealed.
- **Find and replace** (`findInRecords`, `replaceInRecords`; `POST /api/find`, `POST /api/replace` after a `pre-replace` backup; page `/find-replace`): plain words (never a pattern), whole words and capitals optional, in the text, players' text, facts, notes, and (when asked) names and alternate names; by type and realm. The preview shows each record with the first match before and after; only ticked records change.
- **History:** every record changed by any of these has a revision (`bulk` or `merge`, with what was done as the reason), so each can be put back from its History tab. There is no one-click undo of a whole bulk change; merging and replacing make a backup first.
- **Not done:** merging more than two at once; a merge from the Canon Review duplicates list in one click (it says how); bulk change of type; find-and-replace in sessions, scenes and handouts (records only); replacing with a pattern.
- **Tests:** `tests/bulkTools.test.ts`.

## v0.9.12: generators

`docs/BETA_PLAN.md` B5: somebody to meet, a shop and what it sells, and the weather.

- **`shared/generators.ts`** holds the making, pure and seeded (the same seed gives the same result), with this app's own word lists:
  - `npcIdea` (name and people from the name generator; a role, a look, a manner, a want and a secret) and `npcText` (the record's text, the secret under `## Secrets`).
  - `NAME_STYLES`: eight built-in styles of first name, for worlds whose peoples have no common names yet.
  - `SHOP_KINDS` (general store, smithy, apothecary, stable, tavern, tools and instruments, arcane shop: each a match on item types and names, and which magic items it might hold), `makeShop` (stock and prices from the item catalogue; a poor place has less and nothing over 50 gp, a rich one more and rarer magic; a shop's prices are cheap, fair or dear), `RARITY_VALUE` (a magic item with no price of its own: 100, 400, 4,000, 40,000, 200,000 gp; a potion half), `coins`, `shopText`.
  - `weatherOn({ season, terrain, seed, day })`: warmth from the season's name (any words; unknown is mild) and the terrain, wind, rain or snow, fog, dust; a "front" shared by three days running so weather comes in spells; `effects` in rules terms (heavy precipitation, strong wind, extreme cold and heat, fog). Null where there is no sky (underdark, underwater, planar).
- **Server** (`server/src/repo/generators.ts`): `nameSources` (the world's peoples with common names, then the styles), `namesFrom`, `npcIdeas`, `shopFor` (wealth from the place's facts via `placeProfile`, or the GM's choice; the keeper is an `npcIdea`), `shopPlaces`, `campaignWeather` (the campaign's date and calendar; the party's last stop on a map, else the starting place; seeded by the campaign, so a day's weather doesn't change).
- **Routes:** `GET /api/generate/sources`, `/api/generate/npcs`, `/api/generate/shop`, `GET /api/campaigns/:id/weather`. `/api/names/peoples` and `/api/names` now include the built-in styles (`style:<key>`), so the Name Generator works in a blank world. The session briefing carries today's `weather`.
- **Client:** `client/src/pages/Generators.tsx` (`GeneratorsPage` at `/generators`, under Characters → Reference as "People and Shops"; `WeatherCard` on the campaign calendar). **Keep as a record** makes an NPC or a Building (in its place) through `POST /api/entities`, GM only. The prep board's "Where the party is" shows today's weather.
- Surnames from the name generator no longer come out with a letter three times running ("Millley").
- **Not done:** a GM's own override of a day's weather; weather on the players' pages or the table display; shops' stock running down as the party buys; gems and art objects in shops (the SRD's item list has none); services and lodging prices.
- **Tests:** `tests/generators.test.ts`.

## v0.9.11: bring your notes

`docs/BETA_PLAN.md` B6: an Obsidian vault or a folder of plain Markdown becomes records.

- **The converter** (`server/src/import/notes.ts`) turns notes into the library's own record files and hands them to the importer that was already there, so the preview, the backup, conflicts with local edits and the history are the same as any import. `readNotesZip` reads `.md` and pictures (not dot-folders or `__MACOSX`); `scanNotes` lists the folders with `guessFolder`'s first guess; `convertNotes` takes the GM's choices (`folders`, `fallback`, `realm`).
  - Name: front matter `title`/`name`, the first `# Heading`, the file name. Type: front matter `type`/`category`/`kind`, the nearest folder with a choice, the fallback. Aliases, tags (front matter and `#inline`), a `parent`, and other front matter keys as facts.
  - `[[Target]]`, `[[Target|shown]]`, `[[Target#heading]]` become `Name [ID]` (or `shown [ID]`), which the importer already turns into relationships. Targets resolve by file name, path, name or alias, then against records already in the library. Unresolved links stay as words and are counted.
  - `![[picture]]` and `![](local picture)` are taken out of the text and become the record's pictures (`attachNotePictures`, origin `notes:<path>`, so a second import adds none twice). `%%comments%%` are dropped.
  - IDs: a note with the name and type of a record already here keeps that record's ID (so a re-import updates it, and a record the GM made here is a conflict, kept by default); otherwise the next free ID of its type.
- **Routes** (`server/src/routes/library.ts`): `POST /api/import/notes/scan` (the archive; one held at a time, for an hour) and `POST /api/import/notes/preview` (`{ token, folders, fallback, realm }`), which stages a plan for the existing `POST /api/import/commit`; commit attaches the pictures and returns their count.
- **Canon Review** defaults to on once any import has completed (where the switch was never set). A notes import doesn't count: commit pins the switch off if it was off before.
- **A folder, not only a ZIP:** `zipStored` in `shared/zipParts.ts` writes a store-only ZIP in the browser from a folder chosen with `webkitdirectory` (notes and pictures only, up to 280 MB), which goes to the same route. The ZIP button stays for where a folder can't be chosen. `sniffImage` moved to `server/src/lib/images.ts`.
- **Client:** `client/src/components/NotesImport.tsx` (`NotesImport`, `NotesReportCard`) on **Add and Share**, feeding the page's existing preview and confirm.
- **Not done:** character import (B6's other half); creatures and items in Markdown rules packs (B2's leftover); Obsidian canvases and Dataview; embedded notes (they become links); choosing a folder in the desktop app is untested on macOS and Windows (the ZIP button is the fallback).
- **Tests:** `tests/notesImport.test.ts` (front matter, folder guesses, the folder ZIP, scan → preview → commit through the routes, a second import, the canon switch).

## v0.9.10: combat depth

`docs/BETA_PLAN.md` B9, and B3's leftover (experience from an encounter).

- **Combatants** (`shared/play.ts`, and the encounter schema in `server/src/repo/campaigns.ts`): `characterId`, `group`, `xp`, `effects` (`{ id, name, endRound, anchor }`) and `counters` (`{ name, max, used, eachTurn?, recharge? }`). No migration: combatants are JSON on the encounter.
- **Turns:** `startTurn` takes off effects that end now (at the start of their anchor's turn in their end round, or when that round comes if the anchor is down or gone), gives each-turn uses back, and returns what to tell the GM (what ended, which recharge to roll). `addEffect` anchors an effect to whoever's turn it is. `rollInitiatives` rolls once for a group and takes rolls already given. `defeatedXp` adds up defeated foes.
- **From the stat block** (`shared/statblock.ts`): `countersFrom` reads legendary actions ("Legendary Action Uses: 3"), "(3/Day…)", "(Recharge 5–6)" and "(Recharge after a Short or Long Rest)" from entry names; `rollsIn` finds "Attack Roll: +7" and each "(2d8 + 4) Bludgeoning" in an entry's text. `StatBlock` takes `onRoll` and shows them as buttons, with ability checks; a card's book block opens with them.
- **Tracker** (`EncounterTracker` in `client/src/pages/DmTools.tsx`): adding from a stat block fetches it for XP and counters; rolls go through `POST /api/campaigns/:id/rolls`, hidden, with "Show the table"; a recharge is a d6 through the same route. A party member is tied to its character (`characterId`; one added before is tied by name): the tracker writes hit points to the sheet with `sheet_patch` and takes the sheet's when the party changes (the change feed). Roll missing asks the roll log for players' Initiative rolls of the last 15 minutes. End combat offers the defeated's XP as an award.
- **Not done:** lair actions and regional effects as their own turn in the order; effects on a player's own sheet; conditions with a duration (use an effect of the same name); damage types against resistances.
- **Tests:** `tests/combatDepth.test.ts`.

## v0.9.9: a table display

The last part of `docs/BETA_PLAN.md` B4. The next release is 0.9.10 (versions stay 0.9.x until the beta).

- **State** (`server/src/repo/tableDisplay.ts`): each campaign's choice is a setting (`table_display:<campaign id>`): `title`, `map` (`map_id`), `handout` (`handout_id`) or `picture` (`image_id`, an `entity_images` row). `setDisplay` refuses what players couldn't see (a map not shown to them, a picture not ticked or on a record they don't know); a handout shown is pushed if it wasn't. `playerDisplay` reads the choice through the players' projection each time, and falls back to the title card when it can no longer be seen. Routes: `GET/PUT /api/campaigns/:id/display` (GM; the GET lists the maps players see and the campaign's handouts), `GET /api/player/display` and `/api/player/c/<code>/display`.
- **The page** (`client/src/player/TableDisplay.tsx`): `/player/table` and `/player/c/<code>/table`, outside the handbook's layout. Dark whatever the theme. The map is drawn whole in one SVG (`DisplayMap`: the image, fog with clear patches as on the players' map, the trail, pins by name, the party); a map's y runs up from its bottom edge. The turn order and the rolls of the last five minutes come from the live view; everything follows the change feed.
- **GM app** (`client/src/components/TableDisplayControl.tsx`): in Live Session's tools and on the DM Screen; `showOnDisplay` is also behind "Show on the table display" on a record's player-visible pictures.
- **Fixed:** bold text and links on a handout's paper were invisible in the dark theme (the paper stays light; they took the page's light ink). Players' Handouts page had this too.
- **Fixed:** a player's own roll now reads "You rolled" on a device that opened its character's page in this visit.
- **Not done:** zooming or panning the map on the display (the GM chooses which map; a region map is the zoom); showing a record's text; a battle map (C1).
- **Tests:** `tests/tableDisplay.test.ts`.

## v0.9.8: rolls the whole table sees

The second part of `docs/BETA_PLAN.md` B4. Next: a table display for a second screen.

- **Data:** migration 37, `table_rolls` (campaign, character or none for the GM, `who`, label, expression, mode, total, detail, `hidden`). The latest 200 of a campaign are kept. In the backup table list; not in campaign exports (it is the table's evening, not the campaign's record).
- **Server** (`server/src/repo/tableRolls.ts`): `makeRoll` rolls with `shared/play.ts` (`rollDice`, with `adv`/`dis`), so a result is never the client's word. Players: `POST /api/player/me/:code/roll` (their own character, never hidden). GM: `GET/POST/DELETE /api/campaigns/:id/rolls`, `PATCH /api/campaigns/:id/rolls/:roll` (show, or take back behind the screen); `character_id` rolls for one of the campaign's characters. The players' live view (`playerLive`) carries the newest twelve that aren't hidden, session running or not.
- **Sheet** (`client/src/player/sheet/rolls.tsx`): `RollProvider`, `RollBar`, `Rollable`. `FullSheet` takes `onRoll`; without it (the builder's preview, the printed sheet, a read-only sheet) the numbers are plain. Advantage and Disadvantage apply to d20 rolls only and last one roll. `damageDice` and `attackDice` read what players write in the attack rows ("1d8 + 3 Slashing", "+5"; a save DC isn't a roll).
- **Players' screens** (`TableRollsCard` in `LivePlay.tsx`): the newest roll in a line, the rest on a tap; rolls made since the page opened or in the last ten minutes.
- **GM app** (`client/src/components/TableRolls.tsx`): the roll log with the GM's own dice, in the Dice Roller, the DM Screen and Live Session (the plain roller stays where no campaign is open).
- **Not done:** rolling Hit Dice and spell attacks or damage from the Spells tab; the tracker taking a rolled initiative or damage by itself; a monster's attacks rolled from its stat block (B9).
- **Tests:** `tests/tableRolls.test.ts`.

## v0.9.7: the table hears at once

The first part of `docs/BETA_PLAN.md` B4. Next: rolls from sheets into a shared log, then a table display.

- **The change feed** (`server/src/live/feed.ts`): `GET /api/player/events` and `GET /api/events` are event streams (Server-Sent Events) that say only "changed". `ChangeFeed.stamp()` is `PRAGMA data_version` (another connection committed: the table server as its own process) with `total_changes()` (this connection wrote: the table opened inside the GM's app), looked at every 400 ms while someone listens. Each page then fetches what it shows through its usual routes, so the feed carries nothing those routes wouldn't.
- **Client** (`client/src/player/changes.ts`): `onServerChange(url, listener)`: one connection for each address, shared; a few changes together count as one; a hidden page lets its connection go and looks again when it's back; every 30 seconds anyway. The players' live view (turn order, handouts) no longer asks every 4 seconds, and the player's sheet no longer every 20.
- **Saves send what changed** (`shared/sheetDiff.ts`): the player's page and the GM's sheet keep the copy the server last gave them and send `sheet_patch` (`{ set, unset }`, the sheet's top-level fields), and of the name, class and so on only what changed. The server lays it onto the sheet as it is then and checks the result as before; the answer brings everyone's changes back, with anything typed since laid on top. A whole `sheet` still replaces it (the builder's Send to my sheet). The level isn't the player's to send, as before.
- **The GM's party page** listens too: the party is read again when something changes, and the open sheet takes the server's copy in when nothing of the GM's is waiting to be saved.
- v0.9.6's guard for a sheet left open (experience and the level mark kept) stays for whole-sheet saves.
- **Not done:** the same for other pages two people can change (a character's memories and notes are still saved whole); what players read (records, maps) still refreshes only when a handout is given or the page is reloaded.
- **Tests:** `tests/liveTable.test.ts`.

## v0.9.6: party progression

`docs/BETA_PLAN.md` B3.

- **Data:** migration 36: `campaigns.advancement` (`milestone` or `xp`), `sessions.attendance_taken`, `progress_awards` (one row for each character an award went to; `batch` ties them), `session_attendance`. In the backup table list and in campaign exports (ids remapped on import).
- **Awards** (`server/src/repo/progress.ts`): `giveAward` (XP each, or a total shared out; or a level), `listAwards`, `removeAward` (takes XP back; a milestone's level stays), `attendance`, `setAttendance`, `attendanceCounts`. Routes: `GET/POST /api/campaigns/:id/awards`, `DELETE /api/campaigns/:id/awards/:batch`, `GET/PUT /api/sessions/:id/attendance`. Each change is in the character's log as the GM's.
- **The sheet's mark:** `sheet.builtLevel` is the level the sheet has taken in. A level given (not one set by hand) leaves it behind the level, and `pendingLevels` (`shared/progression.ts`) says which levels wait. A sheet with no mark is up to date, so nothing changes for existing characters.
- **Taking a level** (`client/src/player/sheet/levelUp.ts`, pure and tested; `LevelUp.tsx`): `levelGain` (what a level gives, from `shared/rules2024.ts` and the rules in use) and `takeLevel` (the sheet with it taken). The banner is in `FullSheet`, so the player's sheet on the table server and the GM's both have it; the player's save needs no new route (the mark is part of the sheet).
- **A sheet left open** (`updatePlayerCharacterPage`, `PlayerMe.tsx`): the player's page now carries `sheet_at` (the character row's stamp) and sends it back with an edit. An edit made on a sheet from before an award keeps the award: the experience given, and the mark that a level waits. The player can move the mark up to their level (taking a level), never down or past it. The player's page looks for the GM's changes when it comes back into view and every 20 seconds, while nothing of the player's is waiting to be saved.
- **GM app:** `PartyProgress` on Party and Characters (mode, who has earned a level, awards and their list); `Attendance` on a session's page. An award first saves any edit on its way from the open sheet, then the sheet is read afresh, so neither writes over the other.
- **Not done:** XP worked out from an encounter's creatures (the tracker knows them; B9); multiclassing (the sheet has one class); feats' own ability increases are left to the player; the GM's other edits to a sheet a player has open could still be written over by the player's next save, and the other way round (settled in v0.9.7).
- **Tests:** `tests/progression.test.ts`.

## v0.9.5: items and spells of the GM's own

The second part of `docs/BETA_PLAN.md` B2.

- **Fixed: the page of an item record the GM made crashed** ("This screen hit an error"). `GET /api/treasure/catalogue/:id` answers `{ ok: true }` for an item the Worldkeeper catalogue doesn't list (the route helper `h` turns `null` into that), and `TreasurePanel` read it as catalogue notes. Every Item or Artifact record of a GM's own was affected, in every earlier version with the panel. The panel now needs a rarity to show.
- **Data:** migration 35, `homebrew` (kind `item` or `spell`, name unique per kind, optional `entity_id` for an item record's rules, `pack_id` for one a worldbook brought, `data`). In the backup table list. Per library, not in `shared/rules.db`: these are the world's, and travel with it.
- **Server** (`server/src/repo/homebrew.ts`): `listHomebrew`, `homebrewForRecord`, `saveHomebrew`, `deleteHomebrew`; routes `GET/POST /api/homebrew`, `PUT/DELETE /api/homebrew/:id`, `GET /api/homebrew/record/:id`. Items join `entries(db, 'item')` in `bookData.ts` after the packs (so Your Books, `itemByName`, sheets, and the Treasure tool's rarity pools have them; the cache stamp includes `homebrewStamp`); spells join `rulesView` and `publishedRuleEntries`. Both count whatever Books only is set to. Rules linked to a record go by the record's current name.
- **GM app** (`client/src/components/Homebrew.tsx`): **Your Books → Your own** (items and spells, New item, New spell, change, remove), the editor with the card as it will read, and **Give it rules** on an Item's or Artifact's page.
- **Worldbooks:** shared in `homebrew/homebrew.json` (with players in mind: spells only); added once each by name (`applyHomebrew`), marked with the worldbook's id; a changed one becomes the GM's; the rest leave when the worldbook is removed from the library (`uninstallPack`).
- **First-run check in CI** (`scripts/e2e-first-run.mjs`, own world): opens the page of a creature, item, artifact, person, place and group of the GM's own, makes a stat block of its own and an item's rules.
- **Not done:** feats, species, classes and backgrounds of the GM's own (a Markdown rules pack still does those); a picker for a base weapon or armor; charges or other tracked state on a sheet.
- **Tests:** `tests/homebrew.test.ts`.

## v0.9.4: a stat block editor

The first part of `docs/BETA_PLAN.md` B2 (the homebrew workshop). Next: the GM's own magic items and spells, then creatures and items in Markdown rules packs.

- **Editor** (`client/src/components/StatBlockEditor.tsx`, replacing the three-field form): "A book's stat block" (a creature and what's different, as before), "Its own" (every field of the 2024 layout, with entry lists that add, remove and move up, and the block shown as it will read), or "A hazard" (trigger, effect, countermeasures). "Start from a creature" copies an open creature (ids `srd:`, `wk:`, `open5e:`) into the form; a `book:` creature isn't copied, so a book's text doesn't end up in a block that can be shared.
- **Server** (`setLibraryStatblock` in `server/src/repo/statblocks.ts`): one schema for the three kinds; a card keeps only a card's fields, a hazard only a hazard's. Filled in: Hit Points from dice (`hitPoints`), XP and Proficiency Bonus from Challenge Rating, initiative from Dexterity. Refused: a Challenge Rating that isn't one, Hit Points that are neither a number nor dice, fewer than six ability scores, nothing at all.
- **Shared arithmetic** (`shared/statblock.ts`): `XP_BY_CR` (moved from the 5etools importer), `CHALLENGE_RATINGS`, `crPb`, `abilityMod`, `hitPoints`; used by the server, the editor and both importers.
- **Cards take their numbers from the book block** (`GET /api/statblocks/:id`): a card with no AC, Hit Points, initiative or Challenge Rating of its own shows the named creature's, so the tracker fills in from a card too. A stat block goes by its record's current name (it kept the name it was made under).
- **Any record** can have one: creatures and people show the panel always; other records show it once they have a block, and **More → Stat block or hazard** opens the editor (starting as a hazard). A worldbook's block has **Write your own**, which starts from it; the GM's own comes first, and removing it brings the worldbook's back.
- **Tests clean up:** `tempContext` and the new `tempDir` (`tests/helpers.ts`) remove their folders when a test file is done. A full run left about 2 GB in the system's temp folder.
- **Not done:** the GM's own magic items and spells; a list of all the GM's stat blocks in one place; attack rolls from a block in the tracker (B9).
- **Tests:** `tests/statblockEditor.test.ts`.

## v0.9.3: pictures on records

The first step of `docs/BETA_PLAN.md` (B1). The owner's decision: the whole beta plan happens in v0.9.x releases, section B first.

- **Data:** migration 34, `entity_images` (record, file, caption, `player_visible`, `sort_order`, `origin`, `removed`); the first by `sort_order` is the record's picture. Files are in the library's uploads folder, named `record-<id>-<random>`. In the backup table list, so it's in JSON exports, backups and full-world ZIPs. Deleting a record deletes its rows (cascade).
- **Upgrade:** the `portrait` field of NPC and faction profiles is gone (`shared/profiles.ts`, and the `image` field type with it); on upgrade each profile's portrait becomes its record's first picture, GM only as it was (`onUpgrade`).
- **API** (`server/src/routes/atlas.ts`, `server/src/repo/entityImages.ts`): `GET` and `POST /api/entities/:id/images` (field `image`; PNG, JPEG, WebP or GIF by content, 60 MB), `PATCH /api/entity-images/:id` (`caption`, `player_visible`, `main: true`), `DELETE /api/entity-images/:id` (the file goes too).
- **GM app:** `RecordPictures` at the top of a record page's side column (add several at once, captions, "Players see it", "Make it the record's picture", remove, full-size view); the record's picture on hover cards and in the inspector (`peek.image`).
- **Players:** a revealed record's ticked pictures on its handbook page (`PlayerEntity.images`). The table server's uploads allow-list sends a record picture only when it is ticked and its record isn't archived (`isPlayerRecordPicture`); the published handbook copies only those of records it shows. Pictures are per record, not per campaign: every group that knows the record sees its ticked pictures.
- **Worldbooks:** shared in `pictures/` with `lore/pictures.json`; with players in mind, only ticked ones. Added once each (keyed by `origin`); one the GM removed keeps a `removed` row so an update doesn't bring it back.
- **Not done:** pictures inside a record's text (the editor has no image syntax yet); thumbnails or resizing (the original file is served everywhere); per-campaign picture reveals.
- **Tests:** `tests/pictures.test.ts`.

## v0.9.2: stat blocks in shared worldbooks

The last open item of FUTURE_WORK's Worldbooks list.

- **Sharing** (`buildWorldbook` in `server/src/packs/share.ts`): the GM's stat blocks for the shared records go into `statblocks/statblocks.json` (`{ "statblocks": { "<record id>": block } }`, the format a worldbook's statblocks folder already has), so they show on the added worldbook's records as its own (`packBlocks`); a GM's own block for a record still comes first. Left out, with adventures, of a world shared with players in mind.
- **What a world names** (`ruleRefs`): the creature each block is built on (`base`, "uses the Owlbear stat block"), from the library's own blocks or a worldbook's statblocks folder, so a book creature is in the books list, gets a safe-mode stand-in and is reported when missing; the block's card shows the stand-in, labelled, where the book isn't (`GET /api/statblocks/:id` `baseBlock`). The Worldkeeper world's 30 blocks with a base use SRD creatures, so nothing changes for it.
- **Share panel:** "its adventures, random tables and stat blocks"; "Leave out GM-only sections, adventures and stat blocks".
- **Tests:** `tests/worldbookBooks.test.ts` (a block built on a book creature: counted, left out for players, shared whole, and on another computer shown with its stand-in).

## v0.9.1: the Windows installer builds again

- **The desktop build failed on Windows** for v0.8.0 and v0.9.0 (macOS and Linux built): `scripts/desktop-prepare.mjs` checks that the bundled server starts, then deleted the check's temporary data folder while the server process was still exiting, and Windows refuses to delete files a process still has open (`EPERM` on `wk-desktop-check-…`). It now waits for the server to exit, retries the delete while Windows releases the files, and never fails the build over that temporary folder.

## v0.9.0: the world's own species

Completes [docs/PLAN_0.9.md](docs/PLAN_0.9.md) (v0.8.1 to v0.8.3 below). The owner approved all 40 drafts as written.

- **40 species** (`packs/worldkeeper/rules/species/*.md`, rules-pack Markdown, CC BY 4.0) for the peoples that played only as a book species: written fresh, balanced against the SRD's nine, granting only SRD spells (levels 0 to 2, at character levels 3 and 5). Named after the world's own names (Stormborn, Shadowkin, Taur'n, Reptilian; alternate names such as Cat-folk, Crow-folk, Made; open names kept: Bugbear, Goblin, Sea Elf…; and eleven proposed names the owner accepted: Starlit Elf, Clockwork Gnome, Hidden Giant, Ironhide, Riftborn Warrior and Seeker, Glidefolk, Silverflow, Mantis-folk, Shell-folk, Deepwarden).
- **Loaded** with the world's rules pack (`worldSpecies` in `server/src/repo/rulesPacks.ts`): in `rulesView` while the pack is on and the open rules count for species (Books only sets them aside), and in `publishedRuleEntries`, so the published handbook's builder has them. Rules packs lists them (40 species).
- **The book wins:** the 29 peoples whose world species has a name of its own now say both ("Use the tabaxi rules. Without the book, use the cat-folk rules (the world's own, open to all)."), in their records and player text (57 lines). `rulesSpeciesNames` reads every name in order and `speciesInRules` picks the first the rules in use have, with its own spelling; `peoplesFrom` (builder and sheet) uses it. The eleven with the book's open name (Bugbear, Goblin…) need nothing: a book's species of that name replaces the world's.
- **What a world names** counts a people's first species that the rules have, and the world's species resolve as the world's: adding the Worldkeeper world no longer reports any species missing.
- **Tests:** `tests/worldSpecies.test.ts` (40 well-formed; both names read and the right one picked; with the world's pack the 9 + 40 species, the Tabaxi people as Cat-folk, the handbook gets them; with the book the book's; Books only and the pack off set them aside), and the Worldkeeper report in `tests/worldbookBooks.test.ts`. Browser: the builder shows the Tabaxi people as Cat-folk without the book.

## v0.8.3: stand-ins for creatures

Step 3 of [docs/PLAN_0.9.md](docs/PLAN_0.9.md).

- **What a world names** (`ruleRefs` in `server/src/packs/worldbookRules.ts`) now includes the creatures its encounter tables roll: `creatureMatcher` matches every creature name the GM's rules know (the SRD, the world's, every pack on the computer) against each row, longest first, with written plurals (wolves, harpies, wolfmen), after taking out `[ID]` references.
- **Safe mode's creature stand-in** (`closestStandIn`): an SRD creature of the same type (read from the block's meta, "Large Dragon") and the nearest challenge rating, else the nearest challenge rating of any type. The review list offers every SRD creature.
- **Applied** where a creature is looked up (`bookData` entries since v0.7.5: stat blocks, the encounter tracker, encounter ideas), labelled "standing in for …"; adding reports a missing creature under its book.
- **Not yet:** stat blocks aren't shared in a worldbook, so the creatures they're built on aren't counted (FUTURE_WORK).
- **Tests:** `tests/worldbookBooks.test.ts` (a book creature and SRD ones found in a table's rows; the dragon stand-in; added without the book, the stand-in; with it, the original). Adding the Worldkeeper world still takes under four seconds.

## v0.8.2: adventures, random tables and loose pins in shared worldbooks

Step 2 of [docs/PLAN_0.9.md](docs/PLAN_0.9.md).

- **Adventures** (`adventureToMarkdown` in `server/src/adventureAdditions.ts`, the format `parseAdventure` reads): the library's own adventures (no `pack_id`), with their header (title, arc, hook, levels, linked records), sections, clues (found or not is the GM's, so it comes back unfound) and scenes in order (kind, linked records, read-aloud as `> ` lines, notes), into `adventures/<title>.md`; links and the hook only to records the worldbook carries. Left out of a world shared with players in mind.
- **Random tables** (`tablesToMarkdown` in `server/src/tableAdditions.ts`): every table of the library's own into `tables/tables.md`; the format gains optional `Kind:`, `Levels:` and per-row weights (`3. [x2] …`), which `parseTables` and `applyTableSpecs` now read (the die is the weights' total; older files read as before). A worldbook's tables are labelled with its name (the Worldkeeper world's still "Worldkeeper additions").
- **Loose pins:** a map pin with no record travels in `pins.json` with its label and whether players see it, and comes back as a label, once (`applyMaps`); the handbook build adds only those players see.
- **Share panel:** names adventures and tables; "Leave out GM-only sections and adventures".
- **Tests:** `tests/worldbookShare.test.ts` round-trips an adventure (header, premise, a clue, two scenes with read-aloud), a weighted encounter table (die, kind, levels, weights) and a label pin, and checks a players-in-mind share leaves adventures out.

## v0.8.1: remove a worldbook from this computer

First step of [docs/PLAN_0.9.md](docs/PLAN_0.9.md) (after Worldbooks; decisions in DEC-910, "After Worldbooks").

- **`DELETE /api/worldbooks/:id`** (`server/src/routes/libraries.ts`): refused while any library has it (`librariesWithPack` in `server/src/libraries.ts` reads each library's database read-only, archived ones too; one that can't be read counts as having it), naming them; then `removeWorldbookFile` (`server/src/packs/share.ts`) deletes `data/shared/packs/<id>`. Never one that comes with the app; never anything in a library.
- **Library → Worldbooks:** a bin on each worldbook added to the computer, asking first; the refusal names the libraries.
- **Tests:** `tests/worldbookShare.test.ts` (refused while a library has it, gone once removed from it, the app's own refused, an unknown id).

## v0.8.0 “Worldbooks” (step W4)

The release that completes [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md): the words (W1, v0.7.1), the Worldkeeper world complete inside the app (W2, v0.7.2), Books only (W3a, v0.7.3), sharing and adding `.worldbook` files (W3b, v0.7.4) and worldbooks and the GM's books (W3c, v0.7.5), below.

- **Worldbooks:** a whole world as one file. Setting packs are worldbooks now, and bringing one in is adding it. **Library → Worldbooks** adds, updates and removes them; **Share as a worldbook…** makes one from your own world (never campaigns or what players saw); **Add a worldbook…** and **Start a library with it** bring one another GM shared. The page **Add and Share** (was Import and Export).
- **The Worldkeeper world, complete:** its archive ships in the app, so adding the worldbook brings every record, source document, map and adventure, with no file to choose.
- **Your books:** a worldbook never holds book text, only names. Sharing asks whether the books it draws on are required, optional, or swapped for open stand-ins (originals kept for GMs with the book); adding says which books are missing; **Books only** (Settings → Rules packs) sets the open rules aside, and a new library whose worldbook's books are all here uses them alone.
- **In W4:** a worldbook shared from a library is marked "Made from this library" there and isn't offered back to it (`worldbook_made_here`; `madeHere` on `/api/setting-packs`); the Renown module's badge; README (status, a Worldbooks section with two new screenshots, features, using your own books, roadmap), Quick Start (share your world, or add someone else's), the screenshots list, FUTURE_WORK (what worldbooks don't do yet), the plan's status.
- **Screenshots** (`docs/images`): `worldbooks.jpg` (the Worldkeeper world's library, with Ostmark added to the computer) and `share-worldbook.jpg` (sharing Ostmark from its own library).

## v0.7.5: worldbooks and the GM's books

Step W3c of [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md) (§2a). W3 is complete.

- **What a world names** (`server/src/packs/worldbookRules.ts` `ruleRefs`): species from folk records ("Use the tabaxi rules", `rulesSpeciesName`), classes from **Class** facts (first word(s) before a bracket or full stop, `Fighter/Wizard` split, Unknown skipped), items from a worldbook's `treasure/pools.json`.
- **Where each comes from** (`resolveRefs`): the SRD, the world's own rules (the Worldkeeper rules pack), a GM book (a closed pack anywhere on the computer, on or off here), an open pack, or missing; item names through `itemNameCandidates`; a missing item's book from its tag ("(XGE)" → Xanathar's Guide to Everything).
- **Sharing** (`GET /api/worldbooks/share/books`; `share?books=required|optional|safe&swaps={"species:Tabaxi":"Human"}`): the manifest's `rules` (`mode`, `books` with their things, `standIns`, `open` packs); safe mode's stand-ins (`closestStandIn`: a species of the same size and speed, a class by a small table, Artificer → Wizard, an item of the same rarity and kind) reviewed and changed in the share panel; open entries the world names in `open-rules/<pack>.json`.
- **Adding** (`requireBooks` before, `settleBooks` after, in `/api/setting-packs/:id/install` and `/api/libraries/from-worldbook/:id`): required books missing → refused (a new library is discarded); the books it draws on switched on in the library; its open rules brought in (never replacing a pack the GM already has); stand-ins stored (`rules_stand_ins`, `server/src/repo/standIns.ts`), removed with the worldbook; a report of what's missing by book. A new library whose worldbook's books are all here goes Books only, keeping the open rules for the gaps, and the answer says so once.
- **Stand-ins applied** where the original is missing: `rulesView` (species and classes, labelled "…, standing in for Tabaxi (Book)") and `bookData` entries (items and creatures).
- **UI:** the share panel asks Books required / optional / Safe mode with the stand-in list; Worldbooks shows what adding found; Start a library with it says it once before opening; the first-run setup lists the books the Worldkeeper world draws on.
- **Tests:** `tests/worldbookBooks.test.ts` (what a world names; safe mode without and with the book, books only, open rules bundled and only those named; required refused then accepted; optional warns; books switched on; the Worldkeeper report by book).

## v0.7.4: sharing and adding worldbooks

Step W3b of [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md).

- **A `.worldbook` file** is a ZIP of a worldbook folder in the same format as `packs/worldkeeper` ([docs/WORLDBOOKS.md](docs/WORLDBOOKS.md)), so adding one reuses the worldbook machinery (`installPack`, `updatePack`).
- **Share as a worldbook** (`server/src/packs/share.ts` `buildWorldbook`, `GET /api/worldbooks/share?name=&description=&author=&licence=&gmOnly=leave-out`): the open library's own world, meaning rows with no `pack_id`: realms (with their names and descriptions), custom record types, the GM's templates (one per type), the world's calendar if it's the library's own, the modules on, every unarchived record (`entityToMarkdown`, under `lore/<realm>/`), hand-made links (`lore/links.json`), timeline rows (`lore/timeline.json`), and image maps (picture, `pins.json` for pins on shared records, `routes.json`, `regions.json`; pixels from the top-left). The manifest's `shared` block: format, when, app version, GM-only left out, the worldbooks it was built on, counts. GM-only sections (`## … (GM only)`) can be left out (`leaveOutGmOnly`).
- **Add a worldbook** (`readWorldbook`, `addWorldbookFile`, `POST /api/worldbooks/add`): checks the ZIP (a `pack.json`, read from inside one folder if it was zipped with it; only `lore`, `templates`, `maps`, `adventures`, `tables`, `treasure`, `statblocks`, `encounters`, `player-text`, `archive` and root `pack.json`, `calendar.json`, `README.md`; only `.md`, `.json` and pictures; no `..`, absolute or backslash paths; 20,000 files, 50 MB a file, 500 MB in all; an id of lower-case letters, digits and hyphens that no bundled worldbook uses), drops `importProfile`, `cleaning`, `handbook` and `rulesPack` (patterns the app would run; only bundled worldbooks may), and unpacks it into `data/shared/packs/<id>` through a staging folder (replacing an earlier version).
- **Start a library with it** (`POST /api/libraries/from-worldbook/:id`): a new library named after it, opened, the worldbook added, and its realm names adopted (`adoptWorldbookRealms`: the world is "Ostmark", not "The World"). A failure goes back to the library that was open and discards the new one.
- **Library → Worldbooks:** "Share as a worldbook…" (name, by, what it is, licence, leave out GM-only sections; "Make the .worldbook" downloads it) and "Add a worldbook…" (then "Start a library with it" or "Add to this library"); worldbooks added to the computer also offer "Start a library with it".
- **Not yet:** adventures and random tables aren't shared; pins not on a record don't travel.
- **Tests:** `tests/worldbookShare.test.ts`: a world shared, added on another computer and started as a library (realms, records, link, timeline, map, pins, route; no campaign; GM-only left out; removable); files refused (not a ZIP, no manifest, outside the folder, unknown folder or kind, a bundled id, a bad id); patterns dropped; GM-only sections.

## v0.7.3: Books only

Step W3a of [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md) (W3 is now three PRs: Books only; sharing and adding `.worldbook` files; the books checks and safe mode).

- **`server/src/repo/booksOnly.ts`:** the library setting `rules_books_only` (`{ "keep": [kinds] }`, absent when off). `openRulesFor(db, kind)`: whether the open rules (the built-in SRD, packs whose source names an open licence) count for a kind. A filter, not a change to the pack switches: turning it off puts everything back. A worldbook's own rules (the Worldkeeper rules pack) are the world's and stay on.
- **Where it applies:** `rulesView` (sheets and builder: the SRD's spells, species, feats, backgrounds, classes and subclasses, and open packs' entries, by kind) and `bookData` entries (creatures and items, for stat blocks, encounters and treasure). The published handbook is unchanged (books never reach it).
- **The gaps check** (`checkBooksOnly`): the books in use (closed packs that are on), what they hold and what the open rules in use hold, by kind; a gap is a kind the open rules have and the books don't. Turning it on keeps the open rules for the gaps unless the call names `keep`. It needs at least one book in use.
- **API:** `GET /api/rules/books-only` (state and check), `PUT /api/rules/books-only` `{ on, keep? }`.
- **Settings → Rules packs → Books only:** the switch; turning it on with gaps says what the books lack first ("Your books have no classes… kept for those alone"); while on, it names the books and what's kept.
- **Tests:** `tests/booksOnly.test.ts` (needs books, an open pack isn't one, the gaps, what's set aside and kept, nothing kept, the switches unchanged, everything back when off).

## v0.7.2: the Worldkeeper worldbook, complete

Step W2 of [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md). The whole world now ships with the app; no one adds an archive by hand.

- **`packs/worldkeeper/archive/`:** the world's original archive (472 Markdown files, 2.3 MB), at the paths it had. Left out, by the owner's decision: the archive's working notes (`References/Phase_1_Verification_Audit.md`, `Project_Context_Addendum.md`, `Amsel_Suite_Implementation_Guide.md`). The maps were already in `packs/worldkeeper/maps/`.
- **Adding the worldbook brings everything** (`applyAdditions` in `server/src/additions.ts`, `archiveFiles`): the archive and `lore/` go through one import (`buildPlan`/`commitPlan` with the pack's id), then links, rumours, mysteries, timeline, errata, maps, adventures and tables as before. A fresh library gets 878 records, 929 source documents, both maps, 15 adventures; checked field by field against the old way (the archive ZIP added by hand, then the setting): the same records, links and timeline.
- **A library that already has the archive** (added by hand, as before) is unchanged by an update: 878 records unchanged, nothing duplicated. Its copies of the three working notes stay.
- **Eras:** the era list came from the implementation guide's tag table; it's now in the manifest (`importProfile.eras`), used when no file lists them.
- **Wizard:** the "your copy of the archive" field is gone; "Add the Worldkeeper worldbook" brings the whole world.
- **"Apply additions" removed** (the card on Add and Share and `/api/additions`): Library → Worldbooks → Update does the same.
- **Tests and scripts:** `tests/archive.test.ts` runs on the shipped archive every time (`WORLDKEEPER_TEST_ARCHIVE` can name another copy). The first-run e2e checks the setting path brings 878+ records and both maps. The smoke test zips the shipped archive itself when no archive is named. `scripts/build-player-tagged-handbook.ts <data dir> <out dir> [archive]` defaults to the shipped archive.

## v0.7.1: worldbooks and adding (the words)

Step W1 of [docs/WORLDBOOKS_PLAN.md](docs/WORLDBOOKS_PLAN.md). Words only; nothing behaves differently.

- **Setting pack → worldbook** in the GM app, the wizard, server messages and the docs. **Library → Worldbooks** (`/worldbooks`, `client/src/pages/Worldbooks.tsx`; the old `/setting-packs` address redirects): "Add to this library" and "Remove from this library". The Worldkeeper worldbook is named "The Worldkeeper world" (`packs/worldkeeper/pack.json`); its rules pack "The Worldkeeper worldbook", credited "The Worldkeeper worldbook's rules (CC BY 4.0)".
- **Import and Export → Add and Share**, with tabs **Add** and **Share**: "Preview", "Confirm and add", "Add in parts", "Added before", "Add a shared file", "One campaign".
- **Wizard:** "Play in the Worldkeeper world", "Add the Worldkeeper worldbook", "Added".
- **Docs:** `docs/SETTING_PACKS.md` is now [docs/WORLDBOOKS.md](docs/WORLDBOOKS.md) ("Writing a worldbook"); README, FEATURES, QUICKSTART, DATA, DESKTOP, RULES_PACKS and the rules pack's README follow. Release history keeps the old words.
- **Unchanged inside:** `packs/`, the `setting_packs` table, `/api/setting-packs`, `/api/import/*`, `installPack`, `SETTING_PACK`, the command `npm run import`.
- The e2e scripts click the new labels.

## v0.7.0: the timeline, for the GM and for players

- **The owner's choices:** the players' timeline holds their campaign's story (sessions and shown calendar events) and the history the GM reveals; the GM's timeline shows the active campaign's sessions, with a switch.
- **Storage** (migration 33): `timeline_rows.player_visible` (to everyone) and `campaign_timeline_reveals` (to one campaign), as records have. Nothing was revealed before, so older libraries need nothing done.
- **`server/src/repo/timeline.ts`:** `revealTimelineRow` (refuses a SECRET row), `revealedTimelineRows` (never a SECRET row, even if flagged by hand), `keepTimelineReveals` (re-importing the archive and Apply additions replace their rows; reveals are carried across by time and event, never onto a row the new source marks SECRET).
- **`shared/timeline.ts` `mergeByDate`:** history rows keep their order; each dated item goes after the last dated row on or before its date, else before the first after it. Undated rows stay where they are.
- **Routes:** `GET /api/timeline` adds `player_visible` and `campaigns` per row; `GET /api/timeline/reveal-choices`; `POST /api/timeline/:id/reveal` (`campaign_id` or null for everyone, `on`).
- **Players** (`playerTimeline` in `server/src/player/projection.ts`, `timeline` on each campaign): revealed history (scrubbed of links to unrevealed records), sessions `live` or `completed` with a date (titled only once the recap is shown), and one-off calendar events shown to players (titles only, as the calendar). The published handbook passes no campaign for the history (everyone's only), as with records. Page **Campaign → Timeline** (`PlayerTimeline`).
- **GM** (`TimelinePage`): sessions among the rows (not while grouped by era), undated ones listed, **Players:** chips per row.
- **Exports:** the JSON export has `campaign_timeline_reveals`; a campaign export carries its timeline reveals by time and event, and its import finds the rows again (never a SECRET one).
- **Tests:** `tests/timeline.test.ts` (merge order; reveal to everyone and to a campaign, SECRET refused and never shown; the published handbook; sessions and events placed, titles hidden until the recap, planned and undated left out; re-import and additions keep reveals; campaign export round trip). Browser check on the archive library with two campaigns: the GM's timeline and chips, the players' timeline on desktop and phone.

## v0.6.12: the first run in a browser, in CI

- **`.github/workflows/ci.yml`, job `e2e`:** builds the app, installs Playwright (pinned in the workflow; it isn't a project dependency) and its Chromium, then runs `scripts/e2e-first-run.mjs` twice, each against a server on an empty data folder: your own world, and the Worldkeeper setting (without the archive). On failure it prints the servers' logs and keeps the screenshots as an artifact. Runs beside the `test` job, so it doesn't slow it.
- The smoke test (`e2e-smoke.mjs`) needs the Worldkeeper archive, which never goes on GitHub, so it stays a local check.

## v0.6.11: Tailwind CSS 4

- **What moved:** `tailwind.config.js` is gone; the theme is an `@theme inline` block in `client/src/styles/index.css` (inline, so a colour such as `realm` reads `--rc` where it's used, as v3 did: a badge's own `rc-*` class still colours it). Tailwind reads only the app's own markup (`@import 'tailwindcss' source(none)` with `@source` for the two `index.html` files and `client/src`). PostCSS uses `@tailwindcss/postcss`; autoprefixer is gone (Tailwind 4 prefixes itself). Components are `@utility` blocks. The official upgrade tool renamed classes (`rounded` → `rounded-sm`, `outline-none` → `outline-hidden`, `!x` → `x!`, `bg-gradient-to-*` → `bg-linear-to-*` and so on).
- **Kept as v3 had it** (each with its reason in the CSS):
  - borders default to the old grey, buttons show the pointing hand, a file input's button is the browser's own, placeholders are v3's grey;
  - `space-y-*` puts the gap above each item after the first, adding to an item's own bottom margin (v4 puts it below, and an item's margin replaces it, which closed up the gap under page headers);
  - text sizes set fixed line heights (v4's are ratios, which changed text of another size inside, such as the top bar's Ctrl K);
  - the app's own CSS sits with the utilities, after them, so a rule wins by specificity and order as in v3 (outside a layer it would beat every utility, and `[&>h2:first-child]:mt-0` stopped working);
  - React Flow's CSS (in its own `xyflow` layer since 13) sits above Tailwind's reset, which in v4 clears every margin and moved the graph's controls.
- **Checked by screenshots:** 166 full pages (83 routes of the GM app and handbook, light and dark, on a library made from the Worldkeeper archive plus the smoke test's campaign), 20 at phone width and 6 with overlays open (search, New menu, record peek), Tailwind 3 against 4. Every page is pixel-identical except what also differs between two Tailwind 3 runs (the name generator's random names, the dashboard, a backup's timestamp, one line of the Hollow Refuge record) and React Flow's connection dots, now drawn at the library's own size. Smoke and first-run E2E pass.
- **Browsers:** Tailwind 4 needs Safari 16.4, Chrome 111 or Firefox 128 or later (it uses `color-mix()` and cascade layers). The desktop app on macOS uses the system's Safari engine.

## v0.6.10: Dependabot's first round

- **Merged from Dependabot** (by the owner): the npm minor-and-patch group (better-sqlite3 13.2, lucide-react, React Router, Tauri CLI, autoprefixer, PostCSS, Vite, Vitest), Tauri 2.12.7 and tauri-build 2.7.6, and the GitHub Actions majors (checkout 7, setup-node 7, upload-artifact 7, download-artifact 8, action-gh-release 3).
- **@xyflow/react 13** (Dependabot's PR failed CI): `onNodesChange` now receives a `NodeChangeset` (`changes.applyTo(nodes)` replaces `applyNodeChanges`), and `colorMode` is `forceColorMode`. Checked in a browser: a scene dragged in an adventure's flow diagram moves and saves its place; the relationship graph follows the theme.
- **Tailwind 4** (Dependabot's PR fails the build): migrated separately, in v0.6.11.

## v0.6.9: a linter, dead code and dependency checks

- **Checks** (all in CI): `npm run lint` (Oxlint 1.95 with type-aware rules through `oxlint-tsgolint`; typescript-eslint doesn't support TypeScript 7), `npm run deadcode` (knip), `npm run audit` (`npm audit --audit-level=high`). Dependabot (`.github/dependabot.yml`): npm weekly, Cargo and GitHub Actions monthly, minor and patch grouped. ESLint was the plan; its TypeScript support needs TypeScript 6.1 or earlier.
- **First run:** 8,245 findings; about 7,800 from rules that don't fit (the old React-in-scope rule, unsafe-assertion on SQLite rows), 414 after configuring. Switched off, each with its reason in `.oxlintrc.json`: React Compiler rules (no compiler here), comma one-liners, the text-conversion rules (checked against all 123 books of a 5etools copy: nothing prints "[object Object]"), deliberate copies, unbound methods (the repos never use `this`), style rules.
- **Fixed:**
  - **Stat block crash:** a book that gives ability scores in words (two shape-change forms in an unofficial book) crashed Your Books; scores in words are kept as a note and shown as dashes.
  - **Stale labels:** "Mentioned in" on a record, Live, the Atlas explorer and the player map computed type labels once; they now update when the record types load.
  - **Components made during render:** Markdown links (GM app and handbook), the calendar's days and extra days, the handbook's quests and the player map's links are no longer remade (and remounted) on every render.
  - **Silent failures:** quick initiative now says when it can't make its encounter; a failed record preview no longer leaves an unhandled rejection. Page changes and reloads that can't fail are marked as such.
  - **Recomputed every render:** New record's template and the character builder's people.
  - **Fog of war:** the mask id comes from `useId`, not `Math.random` during render.
- **Dead code removed:** `LinkSuggest.tsx` (the old suggestion box; the editor's `@` links replaced it), `server/src/assetsDir.ts`, `@types/adm-zip` (adm-zip ships its types), 19 unused exports and 6 unused types, about 40 unused imports and variables, and about 60 unneeded type assertions (removed by `oxlint --fix`).

## v0.6.8: books off until a library switches them on

- **The owner's decision:** a rules pack is on in the library it's imported in, and off in the other libraries until the GM ticks it there (DEC-910). Before, a library with no switch for a pack used it. The SRD and the setting's rules pack are unchanged.
- **`server/src/repo/sharedRules.ts`:** the `rules_packs` view reads a missing switch as off; `setPackSwitch` makes a new switch off unless it says otherwise (so publishing alone doesn't switch a pack on); `saveRulesPack` still switches the pack on in the open library.
- **Libraries keep what they used** (migration 32, `keepOldDefaults`): a migration may now have `onUpgrade` SQL, run only in a database made by an earlier version. Migration 32 marks such a library (`rules_switches_pending`); when it opens, every shared pack it has no switch for gets one, on. The first time v0.6.8 opens a data folder (no `switches_kept` in `shared.rules_meta`), it does this for every other library at once, so a book imported afterwards stays off in them. A library from before that arrives later (a restored backup, or one in a "back up everything" file) is marked the same way and keeps every book when it opens.
- **Tests:** `tests/sharedRules.test.ts`: a second library has a new book off until switched on; a v0.6.7 folder with two libraries keeps the book in both, the one not open too; a book imported afterwards is on only in the open library; a restored old library keeps every book.

## v0.6.7: large imports

- **`shared/zipParts.ts`** (runs in the browser on a `File`, read in slices, and in tests on a Buffer): `listZip` reads a ZIP's central directory (ZIP and ZIP64) without reading or unpacking any file; `measure`, `commonRoot` (the folder an import strips, as the server does); `planParts` splits the Markdown files into parts by size, keeping each top folder together where it fits (a compendium and its entries are read in one part) and putting the sidecar and any every-part files in each; `buildPart` writes a part as a ZIP by copying each file's local header and compressed bytes as they are (stored or deflated; nothing is recompressed).
- **`server/src/import/largeImport.ts`:** `assessImport` says whether an archive is large: its text needs more than half of what the process can spare (an import holds the text about six times over; the budget is the smaller of free memory and the JavaScript heap's headroom; `WORLDKEEPER_IMPORT_BUDGET_MB` overrides it for tests), or it's past an import's limits (300 MB of text, 20,000 files, near the 300 MB upload). A file over 8 MB can't be imported at all. It also gives the part size.
- **Routes:** `POST /api/import/check` (the listing's measures; with `paths` and `root` for a large one, also the setting it belongs to, `packForFiles` on the names, and the files every part needs, the setting's locator); `/import/preview` takes `root`, `part` and `pack` (so every part strips the same root and reads as the same setting); `/import/commit` takes `part` (one backup, before the first); `POST /api/import/relink` (links between records in different parts, `rebuildAllDerivedRelationships`). `readZip` takes an explicit root.
- **Client:** Import and Export reads the listing first; a normal archive goes straight to its preview as before. A large one shows why and offers **Import in parts**; each part is built in the browser, previewed and confirmed (**Confirm part N and go on**, **Confirm the last part**, **Stop here**), then relinked.
- **Checked on the Worldkeeper archive** (1,811 Markdown files, 4.7 MB): imported whole and in 2 and in 9 parts, the libraries are identical (879 records with their types, realms, text, canon and reveals; 3,591 links; 17 timeline rows; 1,811 source documents; 12 realms). The first try found two real differences, both fixed: a part not recognised as the setting (detection now uses the whole listing, and each part names the setting), and the setting's locator in one part only (now in every part).
- **Tests:** `tests/largeImport.test.ts`: listing and parts (a stored and a deflated file, a picture left out, every file intact); the check silent for a normal archive and offering parts when the budget is small or limits are passed; a fixture archive imported in parts through the API with the same records and links as whole, one backup, a run per part; the check endpoint. A browser run of the real archive: a normal server goes straight to preview; a small-budget one offers parts and imports them.

## v0.6.6: undo for faction plans and campaign changes

- **Migration 31:** `undo_actions` (label, campaign, when, undone), `undo_rows` (each row's before and after as JSON, by action) and `undo_recording` (a switch). `server/src/repo/undo.ts` makes triggers on `faction_plans` and `campaign_state` when a library opens (`ensureUndoTriggers`, from the tables' current columns); they record only while an action runs.
- **One action, one step:** `undoable(db, label, campaign, fn)` runs a GM action in one transaction and collects what it changed, however many rows: recording a value (which supersedes the old one), accepting or rejecting a proposed change, advancing a plan (and the change it logs), adding, editing or deleting either. The same edit again within two minutes joins the step before (a plan autosaves while you type). The last 200 steps are kept. Writes outside an action (imports, restores, campaign deletion) record nothing.
- **Undo** (`undoAction`) puts every row the step touched back as it was before it (re-adding deleted rows with their ids), and refuses (409) if any has changed since: undo the later change first. `GET /api/undo` lists the recent steps for a campaign with whether each can be undone; `POST /api/undo/:id`.
- **Client:** **Recent changes** with **Undo** (`client/src/components/RecentChanges.tsx`) on Faction Agendas and on the campaign's world changes card.
- **Not exported:** the undo tables are about this computer's recent clicks, not the world (listed in the exports coverage test).
- **Tests:** `tests/undo.test.ts`: recording and the superseded value coming back; advancing a plan with its logged change; editing, deleting (re-added with its id) and adding; refusing over a later change, then allowing it; accepting a proposed change; nothing recorded outside an action; joined autosave edits; no undo on the table server. A browser check on both pages.

## v0.6.5: Node.js LTS

Checked against the Node.js project's own schedule (`nodejs/Release` schedule.json, 24 November 2026): **Node.js 26 “Lithium” is the Active LTS** (since 28 October 2026, end of life 30 April 2029); 24 and 22 are in maintenance; 20 reached end of life on 30 April 2026.

- **The desktop app is built with Node.js 26.** `.nvmrc` says 26; CI and the desktop workflow read it (`node-version-file`). `scripts/desktop-prepare.mjs` stops on a Node.js that isn't an LTS release (`process.release.lts`), unless `WORLDKEEPER_ALLOW_NON_LTS=1`.
- **`engines`:** `>=22` (was `>=20`, past end of life).
- **better-sqlite3 11.10 → 13.0.3.** 11.x doesn't build on Node 26 (V8 functions it used were removed). 13.x uses Node-API, with prebuilt builds for Windows, macOS and Linux (x64 and ARM) in the package, which work across Node.js versions; it needs no runtime dependencies (`bindings`, `file-uri-to-path` and the `prebuild-install` chain, 32 packages, are gone). The desktop bundle copies only its own platform's build. No API changes affect the app (12.0 and 13.0 dropped old Node.js versions and moved to Node-API).
- **Size:** Node 26's runtime is larger than 22's (143.4 MB against 119.1 MB; about 47 against 41 MB compressed with gzip). On Linux the desktop build now strips the runtime's debug symbols (dynamic symbols kept; the smoke check runs the stripped binary): 111.6 MB, so the Linux app is smaller than before (about 128 MB against 135 MB). Not on macOS (stripping breaks the binary's signature) or Windows (symbols are separate there).
- **Node 26's npm** doesn't run packages' install scripts unless approved: nothing needs them now (the SQLite driver uses its prebuilt build; esbuild uses its platform package).
- **Checked on Node 26.13.1** (in a separate copy, dependencies installed fresh): typecheck, the full suite (379 tests, all passing apart from 1 skipped), both builds, `desktop:prepare` with its smoke check (also with a stripped runtime), the suite with a stripped runtime, and the own-world first-run and archive smoke browser tests against a Node 26 server. On Node 22: the same suite, builds and `desktop:prepare`.

## v0.6.4: housekeeping

- **Next development steps** rewritten: the v0.6.5 to v0.6.7 queue, then candidates. The old list (written for v0.4) had mostly shipped: the single-instance lock (v0.5.1), the table switch (v0.6.1), per-campaign handbooks (v0.6), handouts, session dates (v0.5.1), code splitting (v0.5.1) and keyboard save (v0.4.7).
- **Partially completed:** the editor note now describes the Markdown editor.
- **CI** runs `npm run build` (both builds: the GM app and the player site, after typechecking) instead of `npx vite build` alone, so a broken player build fails the PR.
- **No linter was set up then** (v0.6.9 adds one). Earlier PR descriptions said "lint passes": `npm run lint` didn't exist, and its error was hidden; typecheck, tests, build and the browser tests were the checks that ran.

## v0.6.3: back up everything

- **`server/src/backup/installation.ts`:** `exportInstallation` makes one ZIP: `manifest.json` (`worldkeeper-installation`, format 1, the libraries with their names, folders and archived state), each library's database (`VACUUM INTO`, the open one through its connection; a library never opened has none and comes over empty) and pictures, `shared/rules.db` (`VACUUM shared INTO`) and `shared/packs/`. Never `secrets.json`, never a library's own backups or staging.
- **`importInstallation` adds, never replaces:** each library becomes a new one ("… (from file)" when the name is taken; archived stays archived); a rules pack is added when this installation lacks it or has an older copy, and the open library's own switch for it is kept; setting packs this installation lacks are added. Entry names are checked (folders, picture names, pack paths), so nothing is written outside its folder.
- **Routes** (GM only): `GET /api/libraries/everything` (the file), `POST /api/libraries/everything` (open one).
- **Client:** **Library → Libraries** has **Back up everything** and **Open everything from a file** (asks first, then says what was added). The Backups page points to it.
- **Tests:** `tests/installationBackup.test.ts`: every library (with a never-opened one), pictures, rules and packs carried and the token and backups not; added to another installation without replacing its own; a library's own switch kept; a path leaving its folder ignored; not such a file refused. A browser check downloads the file from the page and opens it again.

## v0.6.2: campaign addresses only

- **A setting per library**, `table_addresses_only` (Settings API allow-list; off by default): on the table (player mode, including the table opened from the GM app), the plain `/api/player` answers only `/info` (the app's name and `addressesOnly`, no realms or types), a character's page (`/me/…`, which names its campaign's handbook) and pictures; everything else is 403. Campaign addresses work as before; the GM's own `/player` preview is never limited.
- **Client:** `PlainHandbookGate` (`client/src/player/CampaignHandbook.tsx`) wraps the plain handbook: on such a table, a character's link goes on to `/player/c/<handbook>/me/<code>`, and anyone else gets a box for their campaign's code. The campaign's handbook card has **Only campaign addresses on the table**; its data adds `addresses_only`.
- **Tests:** `tests/handbookAddress.test.ts` adds the plain address refused but for info, a character's page and pictures; campaign addresses unchanged; the GM preview unlimited; off again. A browser check: the code box, a lower-case code, a character's link sent on to its campaign's address, the GM preview.

## v0.6.1: open the table

- **Open the table from the GM app** (`server/src/table.ts`): the GM's server starts the player-only table server itself, on the network (`0.0.0.0`, port 4320 or `WORLDKEEPER_TABLE_PORT`). It serves a player-mode view of the GM's context (`Object.create(ctx)` with `mode: 'player'`), so it shares the open library's database connection and paths: a library switch or a restore is seen at once, and only the player routes exist on it. Closed at every start; closed on shutdown. A port in use says so (409).
- **Routes** (GM only): `GET /api/table`, `POST /api/table` (`open`). The campaign handbook card's address data adds `table_open`.
- **Client:** the campaign's **The players' handbook** card shows whether the table is open, with **Open the table** / **Close the table**; **Table open** shows in the top bar while it is (`TableIndicator`). The top bar's search box now gives up width when the bar is full, so the Library menu never falls off the edge (checked from 1280 to 1920 px).
- The desktop app can now serve players' phones: no repository or terminal needed.
- **Tests:** `tests/table.test.ts`: opened on a free port, only player routes there (GM, table and library routes 404), following a library switch, opening twice, closing, a port in use, and no table routes on the table server. A browser check: open from the card, a phone on the campaign's address, the indicator, close.

## v0.6.0 “Many Tables, Many Worlds” (step B4)

The release that completes [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md): per-campaign reveals (A1 to A3, v0.5.2 to v0.5.4) and separate libraries (B1 to B3, v0.5.5 to v0.5.7), below.

- **Several groups in one world:** a reveal goes to one campaign or to everyone, and each group sees what's common knowledge plus what it learned (records, sections, facts, maps, pins, outlines). The GM chooses who learns it in the Player view and the live session, sees who knows what, and promotes a reveal to everyone or takes one back to one campaign. Each campaign has its own handbook address on the table server (`/player/c/<code>`), with a QR code on its overview. Existing reveals stayed "to everyone", so every handbook looked the same after upgrading.
- **Several worlds in one installation:** the data folder holds libraries, each with its own database, pictures and backups; an existing installation moved into its first library on upgrade, after a backup. Your books' rules, installed setting packs and the publishing token are shared (`shared/`); each library keeps its own switches. The Library menu switches libraries and makes new ones (into Start your world); **Library → Libraries** renames, duplicates, archives and restores them, and opens one from a full-world ZIP. The desktop app asks which library to open when there are several.
- **Docs:** README (status, a "Several groups, several worlds" section with three new screenshots, features at a glance), Quick Start (each campaign's handbook; more than one world), FEATURES, PLAYER_VIEW, DATA, DESKTOP, RULES_PACKS, SETTING_PACKS, FUTURE_WORK and the plan's status.
- **Screenshots** (`docs/images`): `reveal-per-campaign.jpg`, `handbook-address.jpg`, `libraries.jpg`, from the Worldkeeper setting's library with two campaigns and two more libraries.

## v0.5.7: libraries for the GM (v0.6 step B3)

Step B3 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md).

- **The Library menu** names the open library, lists the others to open, and has **New library…** (a name, then it opens with Start your world) and **Manage libraries** (`client/src/components/Libraries.tsx`). Opening a library reloads the app, since everything on screen belongs to the library that was open.
- **Library → Libraries** (`client/src/pages/Libraries.tsx`): each library's name (rename in place), records and when it was last opened; **Open**, **Duplicate** (asks a name), **Archive** (not the open one; asks first) and **Restore**; **Show in folder** in the desktop app, the folder's path elsewhere; **New library** and **Open a library from a file** (a full-world ZIP, named on the way in).
- **The desktop start:** with two or more libraries, the desktop app first shows them to pick from, the last opened first, once per window (`LibraryPicker`, in the saved theme).
- **Server** (`server/src/routes/libraries.ts`): `GET /api/libraries?all=1` (with archived, each library's folder and record count, read without opening it), `POST /api/libraries/:id/duplicate` (`VACUUM INTO` of its database, and its pictures; not its backups), `POST /api/libraries/:id/archive` (`archived`; the open library can't be archived), `POST /api/libraries/import` (a full-world ZIP into a new library, opened; on failure the library before is reopened and the new one removed), `POST /api/libraries/:id/show` (desktop only: `openFolder` in `server/src/lib/desktop.ts`, for the library's own folder).
- **Tests:** `tests/libraries.test.ts` adds duplicating the open library and another, archiving (not the open one) and restoring, opening from a full-world ZIP with its records and pictures, a bad file leaving everything as it was, show-in-folder outside the desktop app refused, and a backup restored in one library leaving another untouched. A browser walk-through (desktop mode): New library into the wizard, switching from the menu, duplicate, archive, restore, open from a file, and the start picker.

## v0.5.6: shared rules and packs (v0.6 step B2)

Step B2 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md).

- **`shared/`** in the data folder holds what every library shares: the books' rules (`rules.db`), installed setting packs (`packs/`) and the publishing token (`secrets.json`). `Paths.sharedDir`. Packs and the token move there from the data folder on the first start (`moveIntoShared`, safe to repeat, never overwrites).
- **The books' rules** (`server/src/repo/sharedRules.ts`): `shared/rules.db` is attached to each library's connection as `shared` (WAL), with `rules_packs (id, name, source, imported_at)` and `rules_entries`. Each library keeps its switches in `rules_pack_switches (pack_id, enabled, publish)` (migration 30); a pack it has no switch for is in use and not published. Reads are unchanged: `rules_packs` and `rules_entries` are temporary views over the shared tables and the library's switches. Writes go through `saveRulesPack` (the 5etools, Open5e and Markdown importers), `setPackSwitch` and `removeRulesPack` (removes a pack from every library).
- **Rules a library kept itself** (v0.5.5 and earlier, or a backup made then) move into `shared/rules.db` when it opens (`adoptSharedRules`), its switches staying with it; where the shared rules already have the pack, the more recently imported copy is kept.
- **Settings → Rules packs** says a pack is imported once for all libraries, and **Remove** asks to remove it from all of them (untick to stop using it in one).
- Backups hold a library's own database and pictures, not `shared/`; exports never held rules. The SRD and the setting's rules switches (`rules_srd`, `rules_worldkeeper`) were already each library's.
- **Tests:** `tests/sharedRules.test.ts`: books imported once and in a second library at once (in use, unpublished); each library's switches its own; the table server reading them; a newer import for every library; removal from every library; old rules moved with their switches, older and newer copies; packs and the token moved into `shared/`.

## v0.5.5: the library root (v0.6 step B1)

Step B1 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md).

- **The data folder is a library root** (`server/src/libraries.ts`): `libraries.json` (format 1: the libraries with id, name, folder, created, last opened, archived; which one is open) and `libraries/<id>/` with each library's `worldkeeper.db`, `uploads/`, `backups/` and `staging/`. Installed packs (`packs/`) and the publishing token (`secrets.json`) stay in the root, shared by every library (B2, in v0.5.6, moves them into `shared/`, with the books' rules).
- **`Paths`** (`server/src/config.ts`) gains `rootDir` and `libraryId`; `dataDir`, `dbFile` and the rest are the open library's. `resolvePaths(root)` makes sure the root holds libraries and returns the open one's paths.
- **The upgrade** (§3.4): a data folder with `worldkeeper.db` in it becomes its first library, named after its app name, else its world, else "My library". First a normal backup of the untouched database and pictures (`…-before-libraries.wkbackup.zip`, not migrated); then `libraries.json` is written with `moving` set, and the database (with its `-wal`/`-shm`), `uploads/`, `backups/` and `staging/` move into the library's folder. An interrupted start finishes the move on the next; a folder already there that isn't empty stops it rather than overwrite.
- **Opening another library:** `AppContext.openLibrary(id)` closes the database and opens the other, bringing it up to date the way a start does (types, templates, packs, dates, codes, eras), and records it in `libraries.json`. The table server follows: `followOpenLibrary` watches `libraries.json` and switches when the GM does (`syncOpenLibrary`).
- **Routes** (GM only): `GET /api/libraries`, `POST /api/libraries` (`name`, `open`), `POST /api/libraries/:id/open`, `PATCH /api/libraries/:id` (`name`). `/api/meta` names the open library; **Settings → Installation** (debug) shows it.
- **Not yet:** the switcher, New library with the wizard, Manage libraries and open from a file (B3, in v0.5.7); shared rules (B2, in v0.5.6).
- **Tests:** `tests/libraries.test.ts`: a new data folder; an old installation upgraded with its records, settings, pictures and backups, a backup made first, and a second start changing nothing; an interrupted move finished; a second library opened and closed, with records, settings, pictures and backups each its own; the table server following; rename; unknown, blank and archived refused; no library routes on the table server.

## v0.5.4: each campaign's handbook address (v0.6 step A3)

Step A3 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md). Part A (per-campaign reveals) is complete.

- **Codes** (migration 29): `campaigns.handbook_code`, unique, eight characters without look-alikes (`server/src/repo/handbookCodes.ts`). Every campaign gets one at startup (`adoptHandbookCodes`) or when first shown; `renewHandbookCode` replaces it. An archived campaign's code opens nothing.
- **The table server** (`server/src/routes/player.ts`): the player routes are mounted twice, at `/api/player` (the active campaign, as before) and at `/api/player/c/:handbook` (that campaign only). On a campaign's address, `/campaigns` lists only it, `/campaigns/:id` opens only it, the faction web, modules and live feed are its own, and character pages open only for its characters. `/info` names the campaign. `playerLive` and `inPlay` take a campaign.
- **GM routes:** `GET /api/campaigns/:id/handbook` (code, this computer's network addresses, the table server's port: 4320 or `WORLDKEEPER_TABLE_PORT`) and `POST /api/campaigns/:id/handbook/new-code`.
- **Exports:** a campaign export leaves the code out; its import gets a code of its own. The JSON export keeps codes (a restored library keeps its addresses).
- **Client:** `/player/c/:code/*` opens the handbook with `makeApiSource('/api/player/c/<code>')` and the address as its base, so links stay on the campaign's address; the header names the campaign; an unknown code says so. The campaign overview has **The players' handbook** (code, address, QR code, Copy, New code). A character's page links to its campaign's handbook (`handbook` on the player's page).
- **QR codes** (`shared/qr.ts`): a small encoder (byte mode, level M, versions 1 to 10), written in the app rather than added as a dependency.
- **Tests:**
  - `tests/handbookAddress.test.ts`: two groups at once on one table server (records, search, quests, campaigns by id, info); the plain address unchanged; unknown, lower-case and archived codes; a new code; codes out of campaign exports and fresh on import; character pages linked and kept to their campaign; codes given at startup.
  - `tests/qr.test.ts`: the standard's worked example ("01234567", 1-M) for Reed–Solomon, published format and version bits and alignment positions, and a reader that decodes each code back (both format copies, unmasking, de-interleaving, error correction syndromes) for versions up to 10.

## v0.5.3: revealing per campaign, for the GM (v0.6 step A2)

Step A2 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md).

- **Who learns this** (`server/src/repo/reveals.ts`): `defaultRevealTarget` is the campaign at hand (a live session's) or the active one once the library has two or more campaigns not archived, otherwise everyone. `recordReveals` (everyone's, each campaign's, the choices and the default), `unrevealFromCampaign`, `promoteToEveryone`, `onlyToCampaign`, `revealMapPart` (null is everyone: the map's `player_visible`, a pin's or outline's `hidden`) and `mapRevealsFor`.
- **The live reveal** (`revealDuringPlay`) takes `to: campaign | everyone` and `campaign_id`; unset, it follows the default with the session's campaign. The session log names who learned it ("Revealed to Table A: …"; "Revealed to players: …" with one campaign).
- **Routes:** `GET/POST /api/entities/:id/reveals` (reveal to a campaign, take sections or facts back, `hide`), `POST …/reveals/everyone` and `…/reveals/only`, `GET /api/entities/:id/player-preview?campaign_id=`, `POST /api/map-reveals`, `GET /api/maps/:id/reveals`. A record's page data has `knownTo`.
- **Client:** the Player view tab asks who learns what's revealed there, shows who knows each section and fact, previews what the chosen campaign sees, and has **Reveal to everyone** and **Only <campaign>** (with a confirmation). The record header says "Known to …". The live reveal offers **This campaign** or **Everyone**. The Atlas (map settings, outlines, pins) and the map explorer's pin panel offer a chip per campaign (`client/src/components/MapReveals.tsx`). With one campaign, everything looks and works as before.
- **Not yet:** an address per campaign on the table server (A3, in v0.5.4).
- **Tests:** `tests/campaignReveals.test.ts` adds: a live session's reveal goes to its own group and the other group's handbook doesn't change; everyone when chosen; who knows what and the default; promote and take back; a section revealed and taken back for one campaign; GM-only refused; map parts to a campaign or everyone.

## v0.5.2: reveals per campaign, storage and what players see (v0.6 step A1)

Step A1 of [docs/LIBRARIES_PLAN.md](docs/LIBRARIES_PLAN.md).

- **Storage** (migration 28): `campaign_reveals (campaign_id, entity_id, revealed, revealed_sections, revealed_facts)` and `campaign_map_reveals (campaign_id, kind: map | marker | shape, ref_id)`, both deleted with their campaign. A record's own reveal columns, and a map's `player_visible` and a pin's or outline's `hidden`, keep meaning "revealed to everyone"; every existing reveal stays that way, so nothing changes on upgrade.
- **`server/src/repo/reveals.ts`:** a reveal scope is a campaign or null (everyone). `REVEALED_IN_SCOPE` (SQL), `revealedIds`, `isRevealed`, `inScope` (a record's sections and facts as a campaign sees them: everyone's and the campaign's, merged), `campaignMapReveals`; `revealToCampaign` (adds sections and facts, refuses GM-only sections, `hide` takes the record back), `revealMapPartToCampaign`, `whoKnows`.
- **The player projection** takes a scope: records, sections, facts, search, realms and types players can name, the lexicon of linked names, links in text, maps, pins and outlines. The table server uses the active campaign's scope (A3 adds an address per campaign). A campaign's own parts (quests, recaps, handouts, treasure, regions, standing, the faction web, the party export) link and show records as that campaign knows them. The published handbook (a demo, §5 answer 4) shows what's revealed to everyone.
- **Exports:** both tables are in the JSON export; a campaign export carries its reveals (records by ID; maps, pins and outlines by their map's name and what they mark) and the import restores them where the library has them.
- **Not yet:** revealing to a campaign from the GM app (A2, in v0.5.3) and an address per campaign (A3).
- **Tests:** `tests/campaignReveals.test.ts` (two groups in one world: records, sections, facts, search and links per group; maps and pins per group; the published handbook; GM-only sections refused; taking a record back; a campaign export and import; deleting a campaign; a library with reveals from before unchanged for every campaign).

## v0.5.1: follow-ups and housekeeping

- **Session dates** (migration 27): sessions keep `date_year`/`date_day` through the campaign's calendar, in step with `in_world_date` (`syncSessionDate`). A new session starts on the campaign's date; the session page's **Pick** opens the calendar's date picker; words the calendar can't read are kept as written, undated. Existing sessions are read at start (`adoptSessionDates`).
- **Timeline dates** (migration 27): timeline rows keep an optional `year` and `day` (`parseWhen` in `shared/calendar.ts` tells a year from a day). `POST /api/timeline` takes `year` (and `day`): the event goes after the last dated event on or before it, and its time is written in the world's calendar when no words are given. Existing rows are read at start (`adoptTimelineDates`; "22 AB" and "300 AB / Year 31 Unbound" read as years, "Before the Cycle" stays undated).
- **The handbook's Classes tab** lists the classes in the rules in use (`loadRulesText`), not only the setting's callings. A class with a calling page shows it; the others show the rules: hit die, saves, skills, weapons, features by level, subclasses with their source. An empty handbook links to Species and Classes and the builder.
- **Stat blocks from any pack:** an installed pack's `statblocks/*.json` gives its records their stat blocks (`packBlocks` in `server/src/repo/statblocks.ts`); the Worldkeeper setting's stay tied to its rules pack. Documented in `docs/SETTING_PACKS.md`.
- **The wizard's town:** Getting started gains "Write <town>: fill in a section or two", done once any of its sections has text; the card shows on the campaign overview too, since the app opens there once a campaign is active.
- **Housekeeping:**
  - **Desktop:** one app at a time (`tauri-plugin-single-instance`: a second launch brings the open window forward instead of starting a second server on the same library; `cargo check` passes).
  - **The GM app's pages load on first visit:** the main chunk went from 1.42 MB to 327 kB (413 to 99 kB gzipped).
  - `docs/FUTURE_WORK.md` ticks what shipped, and Known issues drops what's fixed.
- **Tests:**
  - `tests/dates.test.ts`: parseWhen; a session dated on creation, by typing and by picking, and adopted; timeline rows by year, in order, written out, and adopted.
  - A pack's stat blocks: installed and uninstalled.
  - The checklist's town item.

## v0.5.0 “A World of Your Own” (own-world step 10)

Step 10 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md), and the release that completes it: steps 1 to 9 (v0.4.1 to v0.4.9, below) made realms, record types, templates, packs, modules, calendars and rules data, added the Markdown editor, New ▸ anything and the first-run wizard.

- **Complete exports** (§2.10):
  - **JSON:** `tests/exports.test.ts` checks the export's table list against the schema. The only tables left out are your books' rules (`rules_packs`, `rules_entries`), the migration log and the search index, each named with its reason.
  - **Markdown:** the ZIP carries `_worldkeeper/library.json` (`server/src/backup/sidecar.ts`): the realms as they are (kind, parent, colour, icon, description), the GM's and the archive's templates, and every record's canon flags and reveal state. The importer reads it: realms before the records, templates and state after (`applySidecarRealms`, `applySidecarState`). A Markdown export imported into a fresh library makes the same library.
  - **Full-world ZIP:** it now imports. **Load an export** takes it into an empty library: its JSON, and the plain picture files under `uploads/` (`importFullWorldZip`).
  - **Campaigns** (format 2): everything the campaign keeps. Besides what was there:
    - standing and renown, the clock and its log, faction ties revealed;
    - party treasure (with fading-salvage data), handouts (pictures inside the export), Bastions and their turns, downtime, calendar events, profiles;
    - what the party heard and found: rumours, secrets and clues, matched by key or wording, since ids differ between libraries;
    - map discoveries and travel, matched by the map's name.
  - **What a campaign needs:** the export carries a `needs` header (its world, the setting packs installed, the records it refers to, the maps it travelled). Importing reports what the library lacks (`importCampaignWithReport`), and the Import page lists it. An export from before format 2 still imports.
- **A second pack beside the setting:** `tests/settingPacks.test.ts` installs a small synthetic pack next to the Worldkeeper setting. Each updates and uninstalls without touching the other, or the GM's own record.
- **Advanced creation's preview:** each header line ends in a Markdown line break, so the preview shows one fact to a line.
- **Docs:**
  - Quick Start for both ways to begin, and for bringing in a world you already have.
  - [Writing a setting pack](docs/SETTING_PACKS.md): the smallest pack, installing and testing it, the manifest, every folder a pack can hold, and good practice.
  - README for v0.5, with screenshots of the wizard, Getting started, Guided creation and Advanced in Split view.
  - FEATURES, DATA (export formats), DEVELOPMENT (the first-run E2E).
- **The plan's cross-step tests,** all in place:
  - the realms migration on an archive library and an empty one;
  - export and re-import keeping types, realms, templates and canon flags;
  - the editor's autosave and conflict protection;
  - creation both ways;
  - encounters and treasure for a region of one's own;
  - installing the setting pack into a fresh library, and an existing setting library unchanged;
  - a second pack beside the setting;
  - no setting IDs in app code;
  - the JSON export covering every table;
  - an own-world E2E that needs no archive (`e2e-first-run own`) beside the archive E2E;
  - the wizard both ways;
  - the bundle guard.

## v0.4.9: the first run (own-world step 9)

Step 9 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **Start your world** (`client/src/pages/StartWorld.tsx`, `/start`): the dashboard sends a fresh library there (`GET /api/setup` `needed`: no records, campaigns, setting pack or completed import, and the wizard neither finished nor skipped). Welcome offers **Build my own world**, **Play in the Worldkeeper setting**, **Restore a backup** and **Skip** (`POST /api/setup/skip`).
  - Own world: the world's name and pitch (the `world` realm's name and description), the app's name, the calendar (a preset with the starting year and the year's name, written as the world's calendar) or "decide later", and the shape (one continent, several, a world and another plane, or empty; rows renamed, added or removed).
  - The setting: your archive, if given, through the importer (`/api/import/preview`, `/commit`), then the pack (`/api/setting-packs/worldkeeper/install`), and what was installed.
  - Both: rules (the SRD always; books and open content in Settings; the setting's rules pack, which can be unticked) and modules (from `/api/modules`: the setting's on, all off for your own world), a first campaign (a place to pick, a town made for you or none; party names become blank characters), an optional map (uploaded as the world's map), and Finish with a summary.
- **`POST /api/setup/finish`** (`server/src/repo/setup.ts` `finishSetup`, one transaction, zod-checked plan): the app name; Canon Review off for your own world and on for the setting (§2.5); the world's name and pitch, its realms (parents before children), its calendar; the modules; the campaign (active), its town from the Settlement template with each section's guidance waiting ("make a town for me" makes it directly rather than opening the guided creation, so the wizard ends in one step), its characters; and the records that teach. Records already there at Finish are counted, so the checklist can tell when the GM makes one.
- **Records that teach** (`makeTutorial`, own world, ticked by default; §2.7): Start Here (what records, realms and campaigns are, and six things to try), an inn in the town (or a sample town, Millbrook, if the wizard made none), an NPC who keeps it with a GM-only secret, a faction allied with her, and a landmark, pinned in the middle of the map when one was uploaded. Tagged `tutorial`, Canon, never revealed, with IDs of their own (`<PREFIX>-TUT1`), so removing them never frees an ID the GM's records could take. `DELETE /api/setup/tutorial` (after a backup) deletes them with everything that names them, read from the schema's foreign keys (deleted, or cleared where the column may be empty), plus their links, history, pins, search entries and children's parent; the GM's town and campaign stay.
- **Getting started** (`client/src/components/GettingStarted.tsx`, `GET`/`PUT /api/getting-started`): the dashboard card after the wizard, worked out from the library (Start Here opened, a record of one's own made, a section revealed, a map added, a session planned) or ticked by hand (peeking), with Remove the tutorial records (confirmed) and Hide.
- **Empty states and the setting's copy:** the Name Generator says how to give a people names instead of loading forever; Open Questions and the Dominions page say they come with the setting; the empty dashboard offers Start your world, New record and Import; the search box, the record source hint and the eras note no longer name the setting; the sidebar's "Shards and Artifacts" is "Artifacts and Items" without the setting (`packLabel` on nav items). A page-by-page scan of an own-world library and an empty one finds no endless loading and no setting names outside the setting's own pages, Templates' examples and Settings.
- **Tests:** `tests/setup.test.ts` (own world end to end through the API: realms, calendar, modules, campaign, town, party, the records that teach and their links, players seeing none of them, Getting started following along, removing them; the setting path; not offered to a library with records; skipping; a bad plan makes nothing). `scripts/e2e-first-run.mjs` (`npm run e2e:first-run -- <url> own|setting`): a fresh install in a real browser, either way, Next, Next, Finish. The smoke E2E now meets the wizard on its fresh library before importing.

## v0.4.8: New ▸ anything (own-world step 8)

Step 8 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **The New menu** in the top bar (`NewMenu` in `client/src/components/Layout.tsx`): every type the library offers, grouped as the Codex is (Places, People, Myth and history, Things, Rules and adventures; anything else under Other), with the types this device made recently first (`wk.new.recent`, `client/src/lib/recentTypes.ts`). `shared/newRecord.ts` `newMenu`, `noteRecentType`.
- **Add … here:** a place's page offers what belongs inside it (`addHere`: a settlement or landmark in a region, an NPC who lives in a settlement or a building in it, a member of a faction, and so on), in its header and under Connections, opening `/new?type=&parent=&realm=` with the parent and realm filled in and the facts that name the place (Home, Region, Found in…) filled from it (`factsFromParent`).
- **The New record page** (`client/src/pages/NewRecord.tsx`, replacing `NewEntity`), Guided or Advanced, remembered per device (`wk.new.mode`):
  - **Guided:** the basics (name, type, where it is, realm, canon status, the template, and the type's facts as inputs: Danger and Wealth from their scales, Terrain suggesting the twelve terrains, and pickers from the rules packs in use for a creature's stat block, which also fills Challenge, an NPC's species and class, a people's species rules, and an item to start from, which fills rarity, attunement and kind; `client/src/components/RulesPickers.tsx`); one step per section with its guidance, example, the full editor and **Skip for now**, GM-only sections marked; and a review (the record as it will read, its links and broken links, what players can be shown and what they never see, what's still to write). Create opens the record.
  - **Advanced:** the template as Markdown in the full editor, opening in Split (`startMode`), with the header in the library's own record format (`Name`, `Category`, `Parent`, `Continent or Realm`, `Canon Status`, then the facts; `draftMarkdown`), read back on Create (`parseDraft`; the type through `fromCategory`, the realm by name or id, the parent by name, `@[Name]` or `[ID]`). What's written in Guided carries over when you switch.
  - Both make the same record (`buildRecord`): a skipped section stays as its heading with the template's guidance in a comment, `<!-- To write: … -->` (`toWrite`). The record page shows it as a quiet "To write" note; other comments don't show; and every text players get drops comments (`stripComments` in the projection's `scrubRefs`).
- **Canon for your own world** (§2.5): `canonReview(db)` decides a new record's status when none is given: the GM's choice (`settings.canon_review` on or off, **Settings → Canon → Approve new records in Canon Review**), else on for a library with a completed archive import and off otherwise. Off, new records are Canon at once (still Proposed when chosen); on, they start Proposed with a Canon Review proposal, as before. `/api/meta` gives `canonReview`; the status tag is added when the caller sends none.
- **Tests:** `tests/newRecord.test.ts` (the New menu's groups and recent types; Add … here; making a town both ways, guided and advanced, giving the same record, Canon at once in one's own world, with players never seeing the notes or the GM-only section; Proposed in an imported archive and by choice, back to automatic). The E2E makes a town both ways from a region's **Add a settlement here** in the imported archive (Proposed, inside the region) and checks the New menu's recent types.

## v0.4.7: the editor (own-world step 7)

Step 7 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **The Markdown editor** (`client/src/components/editor/`), CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `lang-markdown`, `autocomplete`, `@lezer/highlight`): Markdown highlighting in the app's fonts and colours (both themes, through the CSS variables); bold, italic, heading, list, quote, table, record link and GM-only section on a toolbar and shortcuts (Ctrl+B, Ctrl+I, Ctrl+Alt+2, Ctrl+Shift+8, Ctrl+Shift+9, Ctrl+K); `@` and `[[` record links completed from the library (inserting `@[Name]`, as before); and, in its full form, Write, Split and Preview (remembered per device in `wk.editor.mode`), a section outline beside long texts, and full screen. Tab leaves the editor, as in any form.
- **Everywhere:** `AutoTextarea` is now the editor with a text area's props (`onChange(e)` with `e.target.value`, `onKeyDown` seen first, so Ctrl+Enter shortcuts still work), so every long text changed at once. The full editor is on records' descriptions and player text, notes, recaps, scenes, handouts and templates; the record editor's separate preview is replaced by the editor's own. Autosave, the save status, change reasons and conflict protection are unchanged (the editor is controlled, as the text area was).
- **Load:** the editor is its own chunk (about 190 kB gzipped), loaded the first time a long text is shown; a plain text area stands in meanwhile, so the GM app's first page is no bigger.
- **Tests:** `tests/editor.test.ts` (record-link completion), and the E2E edits a record (toolbar, GM-only section, Split preview, outline), a scene and a handout, with `@` suggestions and the live log through the editor.

## v0.4.6: rules for any world (own-world step 6)

Step 6 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **Places' facts** (`shared/places.ts`, `server/src/repo/places.ts`): Terrain (the twelve environments creatures use, read from plain words: "rolling downs and farmland" is grassland and hill), Danger (safe, risky, deadly) and Wealth (poor, modest, rich), from the place's own facts, else the places it sits in, else (terrain only) an installed setting pack's `encounters/terrain.json`. Danger defaults to risky, wealth to modest. The region, nation, settlement and landmark templates ask for them. `placeProfile(db, id)`, `regionPlaces`, `placesWithTerrain`; `difficultyFor(danger)`.
- **Treasure tiers in the rules layer** (`shared/treasureTiers.ts`); the setting's `pools.json` keeps only its regions, pools, goods and hooks.
- **Random tables** (migration 25) have `region_id`, `level_min`/`level_max`, `kind` (encounter, treasure, other) and `auto`, read from the old source text and names (`adoptTableBands` at start, and on save). `server/src/repo/tables.ts`: `tablesFor` (hand-made first), `encounterTableFor` (with `generate`), `generateEncounterTable` (eight rows from the rules packs in use, by terrain, danger and level band, regenerated in place), `copyTable`. The briefing, the region panel and journeys use them; a journey that rolls where there's no table gets one. `POST /api/regions/:id/encounter-table`, `POST /api/random-tables/:id/copy`, `GET /api/campaigns/:id/party-level`.
- **Treasure for any place:** `treasureSourceFor` picks the setting pack's region that holds a place (when the setting's treasure is on), else the books with the place's wealth (`rollTreasure` `place`: poor halves the coin and takes an item away, rich doubles the coin and adds one). The Treasure tool lists every region-sized place.
- **Stat blocks in the library** (migration 26, table `statblocks`): the GM's own block for a record (a book block, its changes, tactics and numbers), `PUT`/`DELETE /api/statblocks/:id`, shown first; the setting pack's cards only while its rules pack is on. `pack.json` `rulesPack` switches that rules pack on at install (an existing Aetheris library that never chose keeps it on) and off at uninstall.
- **Open rules for players:** `rules_packs.publish`; a pack whose source names an open licence can be published (`PATCH /api/rules/packs/:id { publish }`), and the snapshot's `openRules` join the bundled SRD in the handbook's builder.
- **Consistency** reads classes from the rules packs in use.
- **Tests:** `tests/rulesAnyWorld.test.ts` (a region of one's own with the SRD alone: its profile, a generated table, regenerate, copy, a generated table on travel; treasure by wealth; an own stat block; the setting's rules pack; publishing open rules), and the encounter test reads a place's facts.

## v0.4.5: the calendar as data (own-world step 5)

Step 5 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **Calendar definitions** (`shared/calendar.ts`): months (name, days, season), days outside the months (placed after a month), weekdays, moons (cycle and offset), ways of writing the year (`{y} AB`, `Year {y} Unbound` with its offset; the first is the main one), festivals (by month and day, by a day outside the months, or by day of the year) and the year a campaign starts. Every function takes the definition: `yearDays`, `dayOfYear`, `monthDay`, `dayName`, `formatDate`, `formatYear`, `parseDate`, `addDays`, `daysBetween`, `weekday`, `seasonOf`, `festivalsOf`, `upcoming`, `moonPhase`, `isValidDate`. Presets: twelve months of thirty days (the default) and like ours (January to December, no leap years).
- **The setting's calendar is pack data** (`packs/worldkeeper/calendar.json`, `pack.json` `calendar`), checked against the old code for every day of the year: dates, parsing, seasons, weekdays, both moons and every festival match.
- **Storage** (migration 24): table `calendars` (a pack's, written at start; a world's own), `realms.calendar_id` (a world's calendar; realms above it are tried next, then the default), and campaign dates as `date_year`/`date_day` and `start_year`/`start_day`, read from the old text dates at start through the world's calendar (`adoptCampaignDates`). The text columns are kept in step for exports; a date typed as text into the API is read through the calendar. Removing a pack takes its calendar with it; campaigns keep their year and day.
- **API:** `/api/calendar` gives the definition with the date and the start; `PUT /api/calendar/start`; `/api/calendars` (each world's calendar, the presets, the packs' calendars); `PUT /api/calendars/:worldId` with `preset`, `calendar_id` or `def` (checked). Events are checked against the calendar's year before they're written.
- **Pages:** the Calendar page and the players' calendar draw any calendar (the handbook snapshot carries the definition); a date picker with the calendar's months sets a campaign's start and date; **The world's calendar** card chooses a pack's or a preset, or edits one's own line by line. The setting's "300 AB" defaults are gone (campaigns, Settings, the importer), and the timeline no longer names the setting's years.
- **Tests:** `tests/calendars.test.ts`, and the calendar tests in `tests/worldTools.test.ts` (the setting's year round trip, the presets, a new world's calendar changed under a campaign, a calendar of one's own).
- **Not yet:** a session's in-world date is still free text; timeline rows keep their text dates.

## v0.4.4: modules (own-world step 4)

Step 4 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md). The setting's systems are modules any world can switch on.

- **The registry** (`shared/modules.ts`): Thinning, the Return (a clock), fading salvage, the setting's treasure, vaults, shards, the depths explorer, Quick Reference and Renown, each with its pages, the API routes it owns, its sheet tabs, its handbook parts and where its data lives. `Campaign mechanics` (`shared/mechanics.ts`, `/api/mechanics`) is gone.
- **Switches** (`server/src/repo/modules.ts`): a module is on if the campaign says so (`campaigns.modules`), else the library (`settings.modules`), else if an installed setting pack lists it in its `modules`; otherwise off. `/api/modules` (GET, PUT; null goes back to the default) and `PUT /api/campaigns/:id/modules`. **Settings → Modules** has a switch per module and, with a campaign active, "As the library / On / Off" for it.
- **Off means off:** a module's routes are refused (400, "switched off") by a check in `app.ts`; its pages leave the menus and show a notice; its realm-page tools, sheet tabs and Live panels hide; the table server and the handbook get only the modules on (`modules` in `/api/player/info` and the snapshot; handbooks published with `mechanics` are read as modules). Nothing is deleted.
- **Module data out of the core tables** (migration 23): Thinning's true name, memories, who knows it, track and Shardscarred move from `character_pages` to `module_data` (module `thinning`, owner `character`), and fading and anchoring from `party_treasure` (module `fading-salvage`, owner `treasure`); triggers remove a module's data with its character or treasure. The APIs give the same fields as before. Players' notes stay core, in a **Notes** tab of their own. Saved mechanics become module switches, and a library with campaigns keeps Renown on. Full and campaign exports carry `module_data`; older exports are adopted.
- **Pack-defined parts:** Renown's ladder comes from `pack.json` `renown` (the setting's: Hostile to Champion), else a plain ladder (Hostile, Unfriendly, Neutral, Friendly, Honoured, Revered); the clock's name, stages and jump come from the pack's `return/omens.json`, and the clock no longer fixes its stages at 0 to 7. Full exports now include the clock and revealed faction ties.
- **Tests:** `tests/mechanics.test.ts` (defaults from packs, library and campaign switches, routes refused while off), `tests/modulesMigration.test.ts` (a v0.4.3 library's Thinning, fading and mechanics after migration; export round trip in a blank library with Thinning on), the standing tests on both ladders.
- **Not yet:** the Dominions page and the realm pages' Bloom link still name the setting's realms; the calendar is the next step.

## v0.4.3: setting packs (own-world step 3)

Step 3 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md). The Worldkeeper setting is now a pack the app can add to a library or leave out; the core knows nothing about its world.

- **The pack format** (`shared/packs.ts`): a folder with a `pack.json` manifest (id, name, version, description, licence, realms, record types, roles, modules, import profile, cleaning rules, handbook rules) and the pack's content folders (`lore/`, `player-text/`, `maps/`, `adventures/`, `tables/`, `treasure/`, `statblocks/`, `encounters/`, `return/`, `rules/`, `templates/`). The setting moved from `assets/` into **`packs/worldkeeper/`**; `assets/templates/` keeps only the core templates.
- **The registry** (`server/src/packs/registry.ts`): packs bundled with the app (`packs/`, or `WORLDKEEPER_PACKS_DIR`, which the desktop app sets) and packs installed into a library's data folder (`<data>/packs/<id>`, which replaces a bundled one with the same id). Table `setting_packs` (migration 22) records which a library has. At every start an installed pack's realms, types and templates are brought up to date.
- **Provenance:** migration 22 adds `pack_id` to records, links, timeline rows, rumours, mysteries, secrets, clues, maps, pins, shapes, adventures, random tables, templates, realms and eras, and marks an existing Aetheris library's shipped rows as the pack's (the GM's own work never is). A pack's update (`server/src/packs/content.ts`, what Apply additions did) marks everything it brings, matched by what its folder holds, so a library from before packs is adopted on its next update. Removing a pack deletes only its rows, and its realms and types where nothing of the GM's uses them; links from the GM's records to its records show in Broken references.
- **ID clashes:** an update leaves a record of the GM's that has an ID the pack also uses as it is, and reports it (Library → Setting packs lists them). A pack's type whose prefix another type already has is skipped.
- **Importing an archive** detects a pack's archive by its `importProfile.detect` patterns and reads it through the profile (file kinds, the locator, Category wording, ID types, realm wording, the domain records); the pack is installed with the import. Checked against the full archive and additions: 879 records, their types, realms and 4,953 links identical to v0.4.2.
- **Library → Setting packs** lists the packs with install, update and remove, each taking a backup. `/api/setting-packs`.
- **Pack actions need their pack:** Apply additions, the rumours and mysteries updates, the handbook match and Open Questions are refused (400) and hidden without the Worldkeeper pack; the consistency checker runs the treasure checks only with it; mechanics default to the setting's only with it.
- **Roles, not IDs:** the manifest's `roles` name the record that plays each part (`world.overview`, `register.conflicts`, `rules.travel`, `clock.stages`, `depths.border`...), `role(db, key)` on the server and `usePacks().roles` / `useRole()` on the client; a role whose record is missing hides its part. Region state keeps the top-level regions and domains of any world (by trait, the same 19 for Aetheris), the briefing's region falls back to the place itself, a new `uninhabited` trait marks vaults, and the Style guide's examples are the library's own records. `tests/noSettingIds.test.ts` fails if app code names a setting record ID (comments and migrations aside).
- **Cleaning and handbook rules in the pack:** the source clean-up (`shared/loreText.ts`, now `makeCleaner(rules)`) and the handbook's section rules read the manifest, and the clean-up applies only to that pack's records (records carry `pack_id`); the GM's own read as written.
- **Tests:** `tests/settingPacks.test.ts` (a test pack installed, updated and removed; clashes; roles; a fresh library refusing the setting's actions), `tests/noSettingIds.test.ts`, and the clean-up tests run against the pack's rules.

## v0.4.2: record types and templates (own-world step 2)

Step 2 of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md).

- **The record-type registry** (`shared/recordTypes.ts`; table `record_types`, migration 20; `/api/record-types`): every kind of record with its label, plural, ID prefix, icon, pin kind (an area or a site), category, Codex browse groups, handbook group and traits (`place`, `regionLike`, `holdable`, `group`, `folk`, `person`, `commonNoun`, `intro`, `meta`). The built-ins are written into the library at every start; the GM can add their own (Library → Templates → New record type). The setting's own types (vault, vault key, shard, calling, Ethereal domain) are marked with its pack and offered for new records only where the library uses them. The handbook gets only the types its revealed records use.
- **Nothing names types any more.** Server and client ask the registry by trait: relationships read from lists, map pins and layers, the region panel, the session briefing's chain of places (it used ID prefixes), State of the World's place count (ID prefixes), the dashboard's key places and factions, the faction web and stance matrix (families now take part, as groups), autolinking, name matching, consistency checks, intro records, the name generator, the Codex's browse pages, the graph's groups, every record picker (`types={['@place']}`, `@group`, `@person`), New record and the editor's type list, and the handbook's groups. `ENTITY_TYPES`, `ENTITY_TYPE_LABELS` and `TYPE_GROUPS` are derived from the built-ins for code with no library at hand. `tests/recordTypes.test.ts` fails if a list of type names is written into app code again.
- **IDs:** any type's prefix links (`[A-Z]{2,5}-…`, checked against the whole archive: no false matches). New records get their type's prefix with four digits (`SET-0001`, `TAV-0001`), which an archive's three-digit IDs never take; `CUS-` is only for the Custom type now.
- **Import and export:** the importer reads `Category:` through the registry (after the setting's own import rules, which move into its pack in step 3); on the real archive this changes one record, LOC-042 The Radiant Expanse, which says `Category: Region` and is now a region. The Markdown export writes the original Category and realm when they still read back as the record's type and realm, and otherwise the type's label and the realm's name, so an export re-imports with every record's type and realm, the GM's own and changed ones included. JSON exports carry the types table.
- **Templates with guidance** (`shared/templates.ts`, `assets/templates/*.md`, 32 of them, one per type; migration 21; `/api/templates`; shipped with the desktop app): each template lists its type's facts and sections, each with guidance, an example quoted from the setting's records, and whether it is GM only (`(GM only)` on the heading, which the reveal rules already honour). Built-in templates are written at every start; the archive's stay as imported; the GM's own come first. **Library → Templates** shows every type and its templates; duplicate any to make it your own, then edit it in Markdown with a live preview. **New record** shows what the template asks for and starts the record with its facts and sections.
- **Facts features read first:** a region's *Ruling faction* (State of the World), a people's *Common names* (the name generator) and *Found in* (the handbook's continents for a people) are read before the prose they used to be parsed from. Tests in `tests/facts.test.ts`.

## v0.4.1: realms as data (own-world step 1)

The first step of [docs/OWN_WORLD_PLAN.md](docs/OWN_WORLD_PLAN.md). Realms are no longer four names in the code; each library holds its own.

- **The `realms` table** (migration 19): id, name, kind (realm, world, continent, domain, region group, nested in that order and enforced by `checkPlacement` in `server/src/repo/realms.ts`: a realm is top level and may hold several worlds, a world sits in a realm or stands alone, a domain in a realm or another domain), parent, colour, icon, description, order and archived. Every library starts with "The World". The setting's others become rows only where a library already uses them, with the same ids: Aetheris and Kaelmar (continents of The World), the realm of Evershroud holding The World, the Ethereal Realm (a realm beside it), and its domains: the Hollow Verge, with the six deeper domains beneath it (owner decisions in DEC-910). Records follow the same pattern as Aetheris and Kaelmar: each belongs to its most specific place. The setting's additions name their domain first in their realm field (`Continent or realm: The Hollow Verge (Ethereal Realm)`, 65 files in `assets/lore`); archive records are placed by their domain's record (`SETTING_DOMAIN_RECORDS`: the ETH records and their landmarks); migration 19 moves existing libraries' 81 records. They keep the Ethereal Realm in their `realms`, so its lists and the handbook still find them; the dashboard folds domains into the Ethereal Realm's card. Realm-wide records (cosmology, rules, factions, peoples, people with no place given) stay in the Ethereal Realm. Each domain's page opens with its ETH record, so records, links and published handbooks don't change. Maps get `realm_id`, timeline rows `realm_ids` (read from their old label), campaigns `world_id`.
- **Codex → Worlds & Realms** (`client/src/pages/Realms.tsx`): a tree (each realm, world and continent drawn inside what holds it) with Add a continent, Add a world, Add a domain and Add a realm, and an Inside picker offering only valid places; rename, nest, colour, icon, reorder among siblings, archive, and delete when empty. The World can't be deleted, and nor can a realm still holding records, maps or campaigns (`server/src/repo/realms.ts`, `/api/realms`).
- **Everything reads the library's realms:** the sidebar's Worlds & Realms group (nested, in the GM app and the handbook), badges and colours (`rc-<colour>` classes and the `realm` Tailwind colour, eight colours checked for AA in both themes), the record editor, New record, lists, search, the graph, the dashboard's realm cards (built per realm on the server), realm pages (kind, parent, description, what's inside), the Timeline's realm filter, Faction Web, the stance matrix, the Atlas (a realm per map) and the campaign (a world, when there's more than one).
- **The handbook** gets realms from `/api/player/info` or the published snapshot (`RealmsProvider` in `client/src/components/realms.tsx`, player-safe). It only names realms that hold a revealed record (and what contains those): a realm the GM made and revealed nothing in is never listed, and no people is "found" there.
- **Import:** an archive naming a realm the library lacks creates it (a continent in The World, with the next free colour), and the setting's names keep their ids and look. JSON export and import carry realms; an export from before them gets its realms back from its records.
- Records must name a realm that exists (400 otherwise).
- **No realm is written into the app's code** outside the setting's own files (`normalize.ts`, `settingRealms.ts`, the importer's domain rule, `mapAdditions.ts`, migration 19); `tests/realms.test.ts` fails if one appears. Each realm is introduced by its own record, found by type and name (`realmIntros`, `intro_id` on `/api/realms`), so the realm pages, the dashboard, World Overview (now every world with its continents, then the realms beside them) and the graph's starting record need no record ids.
- **Still hard-wired, by plan:** the setting's record ids in its own features (the region list in `regionState.ts`, the Return clock's COS-032, the setting check in `mechanics.ts`, the dashboard's mysteries, the briefing's Kaelholm case, the Special pages, a handbook reveal rule). Step 3 replaces them with roles from the setting pack, and step 4 makes those features modules.
- Tests: `tests/realms.test.ts` (the migration on an older library and an empty one, CRUD and its limits, import creating a realm, the handbook's realms, export and import). Tests that write setting records into an empty library now add the setting's realms first (`tempContext({ settingRealms: true })`).

## v0.4.0 "Illuminated"

- **The design overhaul is complete** (`docs/DESIGN_OVERHAUL.md`, steps 1 to 7, v0.3.7 to v0.4.0): Warm Parchment and Dark Codex themes on one set of tokens; the shell with five workspaces; the shared components; Quick-Peek (hover cards, the inspector, split view, pinned stat blocks); the six key pages at high fidelity; the player side (the table server and the published handbook) on the same design, kept free of GM code by `tests/playerBundle.test.ts`.
- **Docs:** new README screenshots (`docs/images/`, listed in its README), a Quick-Peek section and the themes in `docs/FEATURES.md`, the new keys in `docs/DEVELOPMENT.md` (`]`, `Esc`, middle-click), prep and live play in `docs/QUICKSTART.md`, and the handbook's navigation in `docs/PLAYER_VIEW.md`.

## v0.3.17

- **Design overhaul step 6: the player side** (`docs/DESIGN_OVERHAUL.md` §10, `docs/PLAYER_VIEW.md`). The player view, table server and published handbook get the GM app's design: a top bar with World, Records, Maps, Campaign and My Character and a sidebar for the current one (a drawer on phones); parchment by default. Hover cards from the player projection only. Every page redesigned: home, entries, browse, realm, search, quests, recaps, standing, treasure, handouts, calendar, around the world, signs and omens, the faction web, the maps (filling the page under the top bar like the GM's Atlas, the legend in the sidebar), My Character and the shared sheet (also on the GM's Party page), the live card, Print's controls, the character builder and Species and Classes. `tests/playerBundle.test.ts` guards the handbook against GM code (it found MapView pulling in the GM app's state since v0.3.14; fixed). Shared ui split so most of it is player-safe (`pageHeader.tsx`, `textarea.tsx` hold the app-dependent parts).

## v0.3.16

- **Design overhaul step 5: the six key pages at high fidelity** (`docs/DESIGN_OVERHAUL.md` §9, "As built"): the record page (illuminated title band, lore column, record details in the inspector's new "This page" tab via `useInspectorPanel`, which auto-opens at 1440px+), Party and Characters (summary strip, character cards, full-width sheet), Session prep (title band, "Your prep", the board from the world), Live Session (header with round and turn, tracker and log beside Scene / Map / Record, folding tools; the tracker is a two-line row per combatant), the Atlas explorer (record pins hover-peek, the place panel matches the inspector) and the World Dashboard. Links on parchment use a `parchlink` token. The top bar fits at 1440 (Player View shows its label from 1536px). The dev server's API target can be set with `WK_API`.

## v0.3.15

- **Design overhaul step 4: Quick-Peek** (`client/src/components/peek/`, `server/src/repo/peek.ts`, see `docs/DESIGN_OVERHAUL.md` §8). Hover a record link (EntityLink or `@[Name]` in any lore) for 350ms, or focus it, for a card: type, realm, reveal state, a short summary, three facts, and Peek / Open beside / Pin / Open. Middle-click peeks. On touch, the first tap shows the card and the second opens; a long press peeks. **The inspector** (`]`, Esc, the top-bar button; docked at 1280px and up, an overlay below) shows peeked records (sections fold, GM-only marked, connections, stat block) with Back, and the **pinned stat blocks**, which last until the live session ends (pin from a card, a peek, split view or the tracker). **Split view**: `?beside=<ID>` opens a record beside any page, the Atlas map included, with a draggable, remembered divider (a drawer under 1024px). `GET /api/entities/:id/peek` doesn't count as a visit. Tests: `tests/peek.test.ts`; the E2E hovers a link, peeks, opens beside and closes it.

## v0.3.14

- **Design overhaul step 3: the shared components** (`client/src/components/ui/`, see `docs/DESIGN_OVERHAUL.md` §7), applied across every GM page. Titled panels are Cards (featured ones with gilt corners); GM-only text everywhere, record secrets and Markdown `wk-secret` blocks included, has the same stitched red margin and "GM only" label (GmOnly); read-only lists are sortable DataTables with sticky headers and tabular numbers; the tracker's hit points are HpBar and HpStepper, its conditions ConditionChips; settings that take effect at once are switches (Toggle, role "switch"), filters and list choices checkboxes (Check); one-of-a-few choices are Segmented controls (theme, rumour truth, mystery state, treasure kind, book sections, timeline realm); badges use tones, not raw colours; empties say what's missing and offer the next step; loading shows skeleton lines. Every `confirm()`, `prompt()` and `alert()` is now the app's own dialog (`ask()`, `askText()`, `toast()`), in the player sheet and builder too. The relationship graph follows the theme. Stat blocks' traits and actions fold. The style guide shows the whole set. E2E answers the app's dialogs.

## v0.3.13

- **Map look and usability** (`client/src/components/map/MapView.tsx`, GM and player maps): **Find a place** in the legend (fog-aware, Enter picks the first); grouped pins (greedy screen-space grouping at 34px, off at the closest zoom and while drawing; a click zooms in 1.5 levels or until they separate); a framed edge and vignette, a compass, and an overview inset when zoomed in (click to pan); a **Panels** choice, dark or the app's theme (`wk.map.panels`, `wk.map.overview` kept per device). The fog's blur has an explicit filter region, which removes a seam at high zoom.

## v0.3.12

- **The world map is drawn to scale, and every travel time follows it** (owner decisions, DEC-910). The map is about 2,700 miles across (`scale_miles` in `assets/maps/world-map.pins.json`), as the known world; the pins stay where they were, and the times were rewritten to match them at a normal pace (24 miles a day on foot, about 50 by ship). The Hollow Marches are about a month across: the Crossroads of Fate about three days from Hollow Refuge, the Bloodmarked Fields about a week, Blackveil Fortress about a week and a half. Dominion borders are one to two weeks from the Refuge and the capitals two to three and a half weeks; Ashvale's villages are two to four weeks from the town; Kaelholm to Ashvale is about 1,300 km (800 miles). The crossing of the Black Tides stays about two weeks (about 600 miles). Updated: all 34 timed route labels and their 31 matching links, *Distances in Aetheris* [RUL-651], *Crossing the Black Tides* [RUL-652], the capitals, the towns, Tollrock, Kittiwake, two histories, the handbook's pages, and three adventures (the dead man now walks three days and nights to the waystone).
- **Errata** (`assets/lore/errata.json`, `server/src/errata.ts`): corrections to wording a library already has, applied by Apply additions and the handbook build only where the old wording is still there: records' text, fields and player text (the archive's own records too: Hollow Refuge, the Hollow Marches, the Bloodmarked Fields, the Crossroads, the Rift, the five dominions, the world layout, the dominions directory), and adventures by title, including campaign copies. Record changes are revisions and show in Canon Review. Route labels (`assets/maps/world-map.moves.json`) and curated links (`was_label` in `links.json`) are relabelled the same way, only where unchanged; Apply additions also sets the world map's scale if it has none. On the old test library all 84 errata, 34 route labels and 31 links applied, and nothing the GM changed was touched.
- The maps zoom in to four times the image's size (was about 1.4).

## v0.3.11

- **Travel tools on the map** (GM). Each map has a **Scale** (miles across, in the GM tools; migration 18 adds `maps.scale_miles`); the shipped maps have none until the GM sets one. With a scale: a scale bar, route tooltips with their length and days at a normal pace, and **Measure**, a ruler that shows the distance of the points clicked and the days at each 2024 pace (slow 18, normal 24, fast 30 miles a day). **Travel here** (place panel) and **Travel to a point** (GM tools) open a dialog: the distance from the party's last position, the pace, the days on the road (worked out, and editable), and two choices, to move the campaign's calendar on by those days and to roll the region's encounter table for the party's level once for each day (up to 30); the region is found from the place's parents or the region outline around the point. A live session logs every roll. `shared/travel.ts` and `server/src/repo/journey.ts`, with tests.

## v0.3.10

- **The map's controls live in the sidebar.** In the Atlas's full map view, the app's sidebar holds the map: a map switcher at the top, then the legend (kinds of place, routes, the Campaign layers), your notes and the GM tools, with **Manage maps** (the former World Atlas page) at the bottom. The map no longer has a panel floating over its left side, a back button or its own map buttons. Collapsing the sidebar (`[`) shows just the map; the legend then floats over it, closed, behind its **Legend** button (as at tablet widths, where the sidebar starts collapsed, and on phones). On other Atlas pages the sidebar lists each map and Manage maps; the separate Map Explorer and "Each map" links are gone. The place panel on the right is unchanged. The players' handbook map keeps its floating legend.

## v0.3.9

- **The campaign on the map** (GM's Map Explorer). A new **Campaign** section in the legend switches four layers on and off, each drawn as a small badge beside the pin of its place (or of the nearest place above it with a pin): **Open quests** (open, active and rumoured quests at their place, marked when hidden from players), **Adventure places** (the places in the active campaign's adventures and their scenes, unless finished or shelved), **Who is here** (where people live or are found; off to start, as there are many) and **Prepared encounters**. Hovering a badge lists what's there; clicking it opens a list that links to each quest, adventure, record or encounter. A **Hidden from players** switch hides the GM-only pins, to see the map as players do. Encounters have a new **Where** field in the tracker (migration 17), which puts them on the map; campaign exports carry it.
- **Region panel.** Clicking a region (or a realm, nation, continent or Ethereal domain) shows, above its text: its terrain, its state in the active campaign (who holds it, faction agendas with their clocks, standing, recent changes, places found, clues and rumours, with a link to State of the World), its encounter tables with a **Roll** button (results link the stat blocks they name), and the places inside it, each opening on the map.

## v0.3.8

- **Design overhaul, step 2: the new layout** (docs/DESIGN_OVERHAUL.md). The 66-link sidebar is replaced by a top bar of five workspaces (Codex, Campaign, Characters, Atlas, Live) and a sidebar with only the current workspace's pages, in short groups; it collapses to an icon rail with `[` (or `Ctrl+\`), and below 1280px wide starts as the rail. The top bar also holds search, an **active campaign** switcher, Player View, the theme and the **Library** menu (gear) for maintenance pages and Settings. Characters links the builder (Make a Character). The Atlas opens on the full map view (the Map Explorer, with its legend, place panel and GM tools), which now fills the main view beside the sidebar instead of covering the whole window, and keeps its dark chart palette in either theme; the sidebar lists each map, opening in that view, and World Atlas is where maps are added and managed. the Live tab shows a red dot while a session is live. The app opens on the active campaign's overview when there is one, and the app mark goes to the World Dashboard. Every page keeps its URL; `tests/navigation.test.ts` checks that all 66 old links still have a home and that every route belongs to the right workspace. Phones get every page in the menu drawer.

## v0.3.7

- **Design overhaul, step 1: tokens and themes** (docs/DESIGN_OVERHAUL.md). **Warm Parchment is now the GM app's default theme**; Dark Codex stays one click away, and a saved choice is kept. Both themes were retuned so every text colour reaches WCAG AA on every surface, with new tokens for control borders, warnings, item rarity, the realms and canon labels (`tests/designTokens.test.ts` checks all of them). New shared styles: aligned numbers, three elevations, gilt title rules and title bands, gilt corner marks, an illuminated first letter, rarity tags and one GM-only treatment. Shared badges and the pages' warning and success colours now use the tokens, so they read on parchment. A **Style Guide** page for developers (debug mode only, with the other developer pages) shows every token and piece in both themes, with live contrast. **Settings → Theme** now offers Warm Parchment (default) or Dark Codex, and a **Reduce texture** switch for the parchment's paper grain. The player side keeps its current default until step 6.

## v0.3.6

- **Save to Party and Characters** in the Make a Character builder: in the GM's own app (Player View), the finished build is added to a campaign's party (the active campaign, or one chosen from a list), with its portrait, and the Party and Characters page opens on it. The button needs the GM's routes, so it never appears on the table server or the published handbook.

## v0.3.5

- **Campaign import keeps sessions' adventures in play:** importing a campaign export copied each session's "Adventures in play" unchanged, so they still named the original campaign's adventures (unrelated adventures in another library). They now point at the imported copies; one that wasn't exported is dropped.

## v0.3.4

- **Match the published handbook also shows map pins:** pins added while their place was unrevealed were hidden from players; matching now shows the pin of every place the handbook reveals (on the real world: 60 on the world map and 16 on the Ethereal Realm, as on the handbook). Other pins are left alone.

## v0.3.3

- **Match the published handbook** (Player View & Publishing): reveals in the GM's library what the GitHub Pages handbook shows (player-tagged records' safe sections, and the setting's player text). Preview first, backup, only adds. The handbook build and the app share the rules (`server/src/player/handbookReveals.ts`); the build's output is unchanged.
- **Desktop links:** the Player View button and other new-tab links open in the default browser (`server/src/lib/desktop.ts`).
- **Tests:** 158 passing (1 skipped).

## v0.3.2

- **Windows desktop fix:** the app failed to start its server on Windows ("EISDIR: illegal operation on a directory, lstat 'C:'"), because Windows gives the install folder as an extended-length path (`\\?\C:\...`) that Node can't run a script from. The desktop shell now passes ordinary paths (`plain_path` in `src-tauri/src/lib.rs`, with a test).
- **Desktop data files:** stat blocks, the Return's omens, encounter terrains and the setting pack are now bundled with the desktop app and found through one helper (`server/src/assetsDir.ts`); before, the installed app couldn't find them. Checked by running the bundled server as the app does.

## v0.3.1 (working and tested)

- **The complete SRD 5.2.1** is built in: besides the character rules, its 330 creatures, magic items, gear, poisons, traps and magical contagions, read from the SRD itself (`scripts/srd/`). A campaign runs with no books imported.
- **The Worldkeeper setting pack** (`server/src/repo/settingPack.ts`, `assets/setting-pack/`): the setting's creatures, hazards and items as a built-in pack, off until turned on, CC BY 4.0; standard-rules versions when Thinning is off.
- **Open content from Open5e** (`server/src/repo/open5e.ts`): openly licensed sources, each as its own pack with its licence.
- **Desktop releases** attach their installers to the release automatically.
- **Tests:** 153 passing (1 skipped).
- **Next (tabled):** Knave (1e built in, 2e importer) and OSE as full rulesets.

## v0.3 "Your books, your table" (working and tested)

- **Character sheet (D&D 2024):** everything on the official sheet, laid out as a ledger with a portrait and tabs; species, class, subclass and background dropdowns; the GM can edit everything, and every change is logged with who made it; portraits; character pages (true names, memories, Thinning) on the table server.
- **Builder:** a full character at any level from 1 to 20, with a live preview and a printable two-page sheet; on the table server it sends the build to the player's sheet.
- **Rules packs** (`server/src/repo/rulesPacks.ts`, `shared/rulesView.ts`): the SRD 5.2.1 built in and removable; Markdown packs; packs stay in the library's database and are never published or exported.
- **5etools import** (`server/src/repo/fivetools.ts`): the GM uploads a zip of their own 5etools copy and chooses books; spells, species, classes, subclasses, backgrounds, feats, creatures (as GM-only stat blocks) and items. Any combination of books works. Nothing from it is in the repository.
- **Your books in play** (`server/src/repo/bookData.ts`, `encounters.ts`): Your Books page; the encounter tracker adds book creatures; NPC cards carry the book stat block they name; item rules in treasure and on sheets; treasure and encounters generated from the books; the setting's regions mapped to terrain.
- **Campaign mechanics** (`shared/mechanics.ts`): switches for the setting's pages, Thinning, the Return, fading salvage and the setting's treasure, with Standard D&D and Worldkeeper presets. A library without the setting starts as standard D&D.
- **Tests:** 148 passing (1 skipped). The 5etools tests use a made-up stand-in in its shape.

## v0.2 "At the table" (working and tested)

- **Record-link suggestions while typing** (now triggered by `@`; see above): typing `[[` in any DM text area opens a ranked list of records. The text areas covered: record body, DM notes, session prep, scenes, adventure fields, recaps, quests, notes, NPC profile fields and the live log. Choosing one inserts `Name [ID]`, the library's own reference format. Keyboard: arrows, Enter or Tab, Esc. Redirects and archived records are excluded.
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

- **Editor:** a Markdown editor (CodeMirror 6, v0.4.7) with highlighting, a toolbar and shortcuts (Ctrl/Cmd+S saves), `@` record links, GM-only sections and Write/Preview/Split; there is no WYSIWYG editor. Undo is the editor's own, plus revision restore.
- **Desktop builds:** the Linux build was compiled, launched and tested here (see Tests). The macOS and Windows builds are configured (`desktop.yml`, platform-specific code paths in `lib.rs`) but have **not been built or run yet**. Builds are unsigned.
- **Resizable panels:** layouts are responsive but panels are not drag-resizable.
- **Relationship era filter:** the graph filters by type/realm/canon/relationship; there is no structured "historical era" field in the source to filter on (era tags exist on some records only).
- **Map labels:** markers can be used as labels (category `label`, permanent tooltips on abstract maps); no free-floating text-only label type.
- **Player access control:** player mode is a separate read-only server; there is no per-player login.

## Not started

- Optional AI assistant (Phase 22) — intentionally deferred until the core is in daily use.
- Rich-text/WYSIWYG editor, map marker icon library, timeline drag-reordering.

## Known issues

- The desktop app is about 130 MB on Linux, most of it the bundled Node.js 26 runtime (stripped); more on macOS and Windows, where the runtime isn't stripped.
- A handbook code keeps groups apart; it is not a password. (With two groups at once, turn on **Only campaign addresses on the table**.)
- The QR codes come from a small encoder in the app (`shared/qr.ts`), checked against the standard's worked example and a reader in the tests; scan one with a phone before relying on it at the table.
- A library's backups hold its own database and pictures, not `shared/`; **Back up everything** holds both.

- A Markdown import reads only `.md` files (pictures in an archive aren't imported; a full-world ZIP brings them). A large archive is imported in parts (v0.6.7); a single file over 8 MB can't be imported.
- The dashboard shows the active campaign's date; with no campaign it shows the world date from Settings, which is free text.

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

## Next development steps (after v0.6.4)

The queue agreed with the owner, one PR each:

1. ~~**v0.6.5, Node.js LTS**~~ (done: Node.js 26).
2. ~~**v0.6.6, undo**~~ (done).
3. ~~**v0.6.7, large imports**~~ (done).

After that, candidates (not yet agreed):

- **Desktop builds for macOS and Windows:** run `desktop.yml` on both and fix what comes up; code signing, so the system's warnings go away.
- **Optional AI assistant** that cites records and only makes PROPOSED drafts (deferred until the core is in daily use).
