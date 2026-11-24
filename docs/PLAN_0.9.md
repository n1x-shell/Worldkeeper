# After Worldbooks: plan for v0.8.1 to v0.9.0

Status: agreed with the owner, November 2026. Decisions are in DEC-910 ("After Worldbooks"). Picks up the open items of [FUTURE_WORK.md](FUTURE_WORK.md) after v0.8.0.

## Decided (owner, November 2026)

- **All four** open Worldbooks items go in: removing a worldbook from the computer, sharing adventures, tables and loose pins, stand-ins for creatures, and open species for the Worldkeeper world.
- **The Worldkeeper world gets its own open species rules** (CC BY 4.0) for its 40 peoples that today use a book species, so the world is whole on the SRD alone.
- **They are named after the people's own name in the world**, never a book's ("Cat-folk", not "Tabaxi"), since many book species names aren't open. People pages keep "Use the tabaxi rules" for GMs with the book and name the open rules too.
- **The book wins.** A GM who has the book gets the book's species; the world's open rules are the fallback, as safe-mode stand-ins are. Books only sets them aside like any open rules.
- **Review:** all 40 written as drafts at once, for the owner to review before they ship.
- **Releases** in the order below: small and safe first, the writing last so review never blocks the code.

## Steps (one PR each)

### v0.8.1: remove a worldbook from this computer

Done in v0.8.1.

- **Library → Worldbooks:** a worldbook added to the computer (not one that comes with the app) gets **Remove from this computer**.
- **If a library uses it**, the app says which ("Ostmark is in 2 libraries: Ostmark, Test") and refuses, until it's removed from those libraries first; nothing is ever deleted from a library this way.
- Its stand-ins and open rules stay with the libraries that had it; a backup isn't needed (the file came from somewhere), but the app asks first.

### v0.8.2: share adventures, random tables and loose pins

- **Adventures** travel in `adventures/` in the format the Worldkeeper worldbook already uses (a header, sections, scenes and their links), written from the library's own adventures (not another worldbook's), with GM-only sections left out when asked.
- **Random tables** travel in `tables/` (`# Name`, a `Region:` line, numbered rows), the GM's own and generated ones alike.
- **Pins that aren't on a record** (labels such as "Here be dragons") travel in the map's `pins.json` with no record id, and come back as labels.
- Adding a worldbook brings them in as the Worldkeeper worldbook's do: adventures and tables the library already has are left alone.

### v0.8.3: stand-ins for creatures

- **What a world names** grows to creatures: the creatures its random tables roll, and the creatures its stat blocks are built on (a GM's block "based on" a book creature).
- **Safe mode** swaps a book-only creature for an open one of the **same type and challenge rating** (the closest CR when none matches), in the same review list as species, classes and items; adding a worldbook reports missing creatures by book.
- Stand-ins apply wherever a creature is looked up (encounter tables, the tracker, stat blocks), labelled "standing in for …", as items already are.

### v0.9.0: the world's own species

- **Drafts** (`packs/worldkeeper/lore/drafts/species/`): 40 open species rules in the 2024 format (creature type, size, speed, three or four traits, as the SRD's species are), written fresh in the world's voice and balanced against the SRD's nine. Never book text; each follows what its people page already says the people are like. Names: the people's alternate name where it has one (Cat-folk, Crow-folk, the Made); a proposed world name where it hasn't, for the owner to accept or change.
- **Owner's review** of all 40 at once, before anything ships.
- **Then:** the approved species join the Worldkeeper world's rules (CC BY 4.0, `packs/worldkeeper/rules/`), each people page names both ("Use the tabaxi rules; without the book, the cat-folk rules"), and the sheet and builder use the book's species when the GM has it, else the world's.
- **Docs and release:** README, FEATURES, RULES_PACKS, the screenshots that change, release notes.

The 40: aarakocra, aasimar, air genasi, astral elf, autognome, bugbear, centaur, changeling, deep gnome, duergar, earth genasi, eladrin, fairy, firbolg, fire genasi, giff, githyanki, githzerai, goblin, hadozee, half-elf, half-orc, harengon, hobgoblin, kenku, kobold, lizardfolk, minotaur, plasmoid, satyr, sea elf, shadar-kai, shifter, tabaxi, thri-kreen, tortle, triton, warforged, water genasi, yuan-ti (as their people pages name them).
