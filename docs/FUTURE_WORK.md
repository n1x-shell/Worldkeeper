# Future work

Ideas for what comes next, after the lore checklist (`LORE_CHECKLIST.md`) was finished. Tick items off as they're done. v0.6 (per-campaign reveals, then separate libraries) shipped as planned in [LIBRARIES_PLAN.md](LIBRARIES_PLAN.md).

## Maps (building on the explorer)

- [x] **Fog of war per campaign.** Each campaign keeps its own map, where places stay dim or hidden until the party discovers them, and the GM reveals them during a live session. The most Kingdom Come idea of all, and it fits the rule that the Ethereal chart can't be trusted. *Done: only while the active campaign has a live session. Players see only the places the party has found (plus the starting place); the GM explorer shows the rest dimmed and can mark places discovered or not.*
- [x] **Party marker and travel log.** Show where the party is now, with a dotted trail of where they've been, drawn from the session logs. *Done: only during a live session. "The party is here" in the GM explorer moves the party flag, draws the trail and writes the journey into the session log.*
- [x] **Region outlines on hover.** Light up a region's borders when its name is hovered, and click to open its codex page. *Done: traced for the 11 world regions and 6 Ethereal ones (Kaelmar's are approximate, since its map draws no inner borders). Players see an outline only once that region is revealed. Redraw or reshape any of them, or give any place an outline, in Atlas → Explore: open the place and choose Draw its outline.*
- [x] **Player notes on the map.** Players drop their own pins and notes, saved only on their own device. *Done.*
- [x] **The same explorer in the GM Atlas,** with drag-to-place pins, so pinning the dominion fortresses or Kaelmar's vaults later takes seconds. *Done: Atlas → Explore. Drag pins to move them, or pick an unplaced place and click the map.*

## At the table

- [x] **Opening adventures for all three starting points.** Equal first-level hooks and a fleshed-out first session each for Hollow Refuge, Ashvale and the Nameless Asylum. Still the biggest content gap. *Done: The Dead Man at the Crooked Nail, The Hum Under the West Road and The Lamplighter, linked by the Loose Thread. Each scales from level 1 to 10 and arrives in Adventures with its scenes.*
- [x] **Random encounter tables** by region, and by depth in the Ethereal Realm, built from the bestiary. *Done: 41 d12 tables in Random Tables, by region and tier (1–4, 5–10, 11–20), and by depth in the Ethereal Realm.*
- [x] **Faction standing tracks.** Renown with each faction in the campaign tools, with what each rank unlocks, as the archive's rules describe. *Done: Campaign → Faction Standing, with rank rewards for fifteen factions; players see theirs in the handbook.*
- [x] **Treasure.** Loot tables and the world's own items, fleshed out. *Done: the Treasure rules, a catalogue of the 34 setting items and 20 artifacts (rules, where they rest, leads, who wants them), the Treasure tool, magic item tables by region and rarity, and the party's treasure log, which players see in the handbook.*
- [x] **A handbook that works offline.** Players install it on their phones and use it at the table without a signal. *Done: the published handbook installs and works offline, with offline search.*

## Play tools

- [x] **Session prep from the world.** *Done: a "From the world" briefing on each session that can fill empty prep fields.*
- [x] **Live-session tools.** *Done: the region's tables, treasure, standing and handouts on the live page, all logged.*
- [x] **Player turn order and handouts.** *Done: on players' phones in the app's player view; handouts with text and pictures.*
- [x] **Bastions and downtime.** *Done: tracked by the 2024 DMG, with the host faction's standing.*
- [x] **State of the World.** *Done: each region as the campaign has left it; "Around the World" for players.*
- [x] **Starting guides.** *Done: Hollow Refuge, Ashvale and the Nameless Asylum.*
- [x] **Calendar.** *Done: the campaign date, time passing, festivals, the two moons and your own events, for GM and players.*
- [x] **Consistency check.** *Done: a Library report.*
- [x] **What the Party Knows.** *Done: printable and Markdown.*
- [x] **The Return as a visible threat.** A panel for the Return clock: what each stage changes, which encounters and rumours switch on. *Done: Campaign → The Return (the clock module), with omens players see in the handbook.*

## Lore

- [x] **The elder gods.** The biggest open creative decision: how many there are, what they want, and how they tie to the Elders and the Nameless Sepulcher. Best done interactively, like the Orb. *Done: seven makers (four asleep, three returning with their Guests), the Return clock, the Unburied Sovereign, the Black Sun's secret, Laws of Existence instead of statistics, heralds, and a players' legend, The Ones Before.*
- [x] **Mysteries for the newer secrets.** The families', towns', Asylum's and relics' secrets, as clues in the Mysteries tool. *Done: eight new mysteries and six new secrets for Echoes of Erased Worlds, 45 secrets in all, with clues checked against real rumours and records.*
- [x] **More people** for Kaelholm, the eastern mountains and the Ethereal factions. *Done: 22 people, with public pages and GM secrets.*

## Housekeeping

- [x] **Speed up the handbook's first load.** It's about 610 KB of code; splitting it would make the first load faster on phones. *Done: the map, builder, faction web and print pages load when opened. In v0.5.1 the GM app's pages do too: its first load went from 1.4 MB to 330 kB.*
- [x] **Refresh the GM's own app.** Rebuild the desktop app so it carries all the latest additions, and apply them to the laptop library (Library → Worldbooks → Update). *Done: v0.8.0 published; the Worldkeeper world now ships whole in the app.*

## Worldbooks (after v0.8.0)

Planned in [PLAN_0.9.md](PLAN_0.9.md): v0.8.1 to v0.9.0, in this order.


- [x] **Share adventures and random tables** in a `.worldbook`, and pins that aren't on a record. *Done in v0.8.2.*
- [x] **Stand-ins for creatures in encounter tables.** *Done in v0.8.3: found by name, swapped by type and challenge rating.*
- [x] **Share stat blocks in a worldbook.** *Done in v0.9.2: the GM's blocks travel, and the book creatures they're built on count like any other, with stand-ins.*
- [x] **Open species rules for the Worldkeeper world's book-only peoples.** *Done in v0.9.0: 40 species, named after the world's own names, the book winning when the GM has it.*
- [x] **Remove a worldbook from this computer.** *Done in v0.8.1: once no library has it.*

