# Rules packs

The character sheet and the character builder draw on **rules packs**: spells, species, classes, subclasses, backgrounds and feats. Packs imported from 5etools also hold creatures and items (see below).

- The **SRD 5.2.1** is built in, under CC-BY-4.0. You can turn it off in **Settings → Rules packs**. It holds everything the SRD has:
  - for players: 12 classes (each with its SRD subclass), 9 species, 4 backgrounds, 17 feats, 339 spells, weapons and armor;
  - for the GM: 330 creatures (stat blocks for the GM, the encounter tracker and NPC cards), 395 magic items, adventuring gear, poisons, 8 traps and 3 magical contagions (as hazard cards).

  So treasure, encounters, stat blocks and item rules work with no books imported. The SRD's text and numbers are read from the SRD itself (`scripts/srd/`).
- Anything else, such as material from your own books or your homebrew, comes in as a pack you import. Import it in **Settings → Rules packs**.

Packs are for your own table. They are stored once for all your libraries, in the data folder's `shared/rules.db`, and nowhere else. Each library keeps its own switches: whether it uses a pack, and whether it publishes it (a library that hasn't chosen uses a pack, as a newly imported one is). **Remove** takes a pack out of every library; to stop using it in one, untick it there. A library's backups don't include the packs (they're in `shared/`): keep your source books, or back up the data folder, to bring them back. Packs are:

- not in the app's repository or its releases;
- never in the published handbook, the player export, a campaign export or the JSON export;
- used by the GM app and your table server, so your players get them in their sheets and the builder at the table.

Keep pack files in a `rules-packs/` folder, or name them `…-rules-pack.zip`. The repository's `.gitignore` keeps both out of git.

## Importing your books from 5etools

### Getting a copy

5etools is a community project that keeps the published books' data as JSON files in a public source repository. Worldkeeper doesn't link to it or include any of it: find the project's source repository yourself, and download an archive of it as a zip (your code host's "Download ZIP" option for the repository works). The whole repository is large; a zip of just its `data` folder is enough. Only import books you own.

### Importing

**Settings → Rules packs → Import your books from 5etools** reads the zip directly: upload the zip of the 5etools repository (or of just its `data` folder). The app lists every book in it that has rules for character sheets, newest first, with how many spells, species, classes, subclasses, backgrounds, feats, creatures and items each holds. Tick the books you want and choose **Import**. Playtest (Unearthed Arcana) and unlisted sources are hidden unless you ask to see them.

The first time, these books are ticked:

- Player's Handbook (2024)
- Dungeon Master's Guide (2024)
- Monster Manual (2025)
- Eberron: Forge of the Artificer
- Tasha's Cauldron of Everything
- Xanathar's Guide to Everything
- Mordenkainen Presents: Monsters of the Multiverse
- Spelljammer: Astral Adventurer's Guide

After that, your last choice is remembered. The import makes one pack, **Your books (from 5etools)**, holding spells, species, classes and subclasses with their features, backgrounds, feats, creatures and items from the chosen books.

Where books overlap, the newest printing wins. A species from a book you didn't choose comes in only when a people page in your world names it (for example "Use the half-orc rules"), and is marked as an older printing. Every entry names its book and page. Importing again replaces the pack. The uploaded copy is kept only until you import (an hour at most) and then deleted; only the rules taken from it are stored, and like every pack they never leave your library.

Any combination of books works, from one book to every book in the copy, adventures included. The import was checked against a full 5etools copy with single books, the 2014 core books, the 2014 core with supplements, a single adventure, every official book, and everything in the copy. When you import again, your last choice is ticked, so tick any newly listed books yourself (the Dungeon Master's Guide and Monster Manual, for instance, if you chose before they had anything to import). A book that has only empty placeholder classes never replaces the real ones.

### Creatures and items

- **Creatures** become stat blocks in the app's own layout. They are for the GM only: they appear in **Your Books**, the encounter tracker's "From your books" field, and on NPC cards that name a book stat block (for example "Use the Priest stat block"). They are never sent to players: not in the rules the table server gives players, nor anywhere in the handbook.
- **Items** are the magic items, gear, weapons and armor of the chosen books, plus the generic magic items that fit many base items ("+1 Weapon", "Flame Tongue"). Their rules show in **Your Books**, in treasure (the GM's and the players' Party Treasure page), on character sheets (equipment and attuned items) and in the builder's starting kit. A player's server looks items up only by the names on their sheet or in the party's treasure; it has no way to list the books.

Items are found by the names people write: "Weapon, +1" finds "+1 Weapon", "Moon-Touched Sword (XGE)" drops the book code, "2 Daggers" finds the Dagger, and "Flame Tongue Longsword" finds Flame Tongue, with the Longsword's own rules.

## The Worldkeeper setting pack

A second built-in pack, **The Worldkeeper setting**, holds the setting's own creatures and items for use in any campaign: 84 creatures and 8 hazards, and 34 items (the Aetheris and Kaelmar treasures, with their rules). It's off until you turn it on in **Settings → Rules packs**.

When the **Thinning** mechanic is switched off, the few entries that use Thinning, true names or Shardscarred use standard-rules versions instead (for example, the Glass's Thinning save becomes a DC 15 Charisma save that costs a level of Exhaustion and a memory). The pack is licensed CC BY 4.0, credited "The Worldkeeper setting pack, by the Worldkeeper contributors"; see `packs/worldkeeper/rules/README.md`.

## Open content from Open5e

**Settings → Rules packs → Add open content from Open5e** lists the openly licensed fifth-edition sources that [Open5e](https://open5e.com) publishes, each with its publisher and licence. Tick the ones you want and choose **Import**. Each source becomes its own pack, named after it, with its publisher and licence as the pack's source, so you can turn one off or remove it on its own. Importing a source again replaces its pack.

What comes in: creatures (as stat blocks for the GM), magic items and gear, spells, feats and backgrounds. Species and classes from these sources aren't imported yet.

The licences, as Open5e lists them (November 2026):

| Licence | Sources |
| --- | --- |
| CC BY 4.0 | Black Flag SRD (Kobold Press); Spells That Don't Suck |
| CC BY 4.0 or OGL 1.0a | Level Up A5E Adventurer's Guide, Dungeon Delver's Guide and Gate Pass Gazette (EN Publishing); SRD 5.1 |
| OGL 1.0a | Level Up A5E Monstrous Menagerie; Kobold Press's Tome of Beasts 1–3, Creature Codex, Deep Magic, Vault of Magic and Tome of Heroes; Tal'Dorei Campaign Setting |

The SRD 5.2 is already built in, so it's shown but can't be ticked. Many of these sources were written for the 2014 rules: check them before your players use them. Like every pack, what you import stays in your library.

## How packs combine

- Where an imported pack and the SRD both have something, the pack wins.
- Where two imported packs both have something, the one imported most recently wins.
- Turning a pack off removes its rules from the sheets' choices and fill-ins. Sheets keep anything already filled in from it.
- A people's page in the world names the species rules it uses, for example "Use the sea elf rules". The sheet looks for a species of exactly that name (Sea Elf) in your packs.
- A world class page lists its subclasses. Any extra subclasses your packs add appear after the listed ones.

## The format

A pack is a **zip of Markdown files**. Folders are up to you.

Each file is one entry:

- first, `Key: value` lines;
- then a blank line;
- then the text.

Inside the text, `## ` headings mark traits (species) or features (classes and subclasses). A feature heading is written `## Level N: Name`.

### `pack.md` (required)

```
Pack: My Books
Source: PHB 2024 and others
```

The pack's name is its identity: importing a pack with the same name replaces it.

### Spell

```
Kind: spell
Name: Frost Lance
Level: 2
School: Evocation
Classes: Sorcerer, Wizard
Casting Time: Action
Range: 60 feet
Components: V, S, M (a sliver of ice)
Duration: Concentration, up to 1 minute

The text of the spell…
```

- `Level` is `0` (or `Cantrip`) to `9`.
- Concentration comes from `Duration`, Ritual from `Casting Time` (for example `Action or Ritual`), and Material from `Components`.

### Species

```
Kind: species
Name: Sea Elf
Size: Medium
Speed: 30
Creature Type: Humanoid

## Child of the Sea
The trait's text…

## Friend of the Sea
…
```

### Subclass

```
Kind: subclass
Name: Circle of the Moon
Class: Druid

What the subclass is about…

## Level 3: Circle Forms
…

## Level 6: Improved Circle Forms
…
```

### Class

Use this for a class whose features aren't in the SRD (for example the Artificer):

```
Kind: class
Name: Artificer

## Level 1: Tinkering Magic
…
```

### Background

```
Kind: background
Name: Artisan
Ability Scores: Strength, Dexterity, Intelligence
Feat: Crafter
Skills: Investigation, Persuasion
Tool: One kind of Artisan's Tools
Equipment: Choose A or B: (A) Artisan's Tools, 2 Pouches, Traveler's Clothes, 32 GP; or (B) 50 GP

A short description…
```

The builder takes its kit A (items and gold) from `Equipment`.

### Feat

```
Kind: feat
Name: Tough
Category: Origin
Prerequisite:

The feat's text…
```

`Category` is `Origin`, `General`, `Fighting Style` or `Epic Boon`.

If `Kind` is missing, a file's folder name gives it: `spells/`, `species/`, `classes/`, `subclasses/`, `backgrounds/` or `feats/`.

Files that can't be read are listed when you import. The rest of the pack still comes in.
