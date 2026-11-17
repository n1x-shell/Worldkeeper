# Rules packs

The character sheet and the character builder draw on **rules packs**: spells, species, classes, subclasses, backgrounds and feats.

- The **SRD 5.2.1** is built in, under CC-BY-4.0. You can turn it off in **Settings → Rules packs**.
- Anything else, such as material from your own books or your homebrew, comes in as a pack you import. Import it in **Settings → Rules packs**.

Packs are for your own table. They are stored in your library's database, and so are in your backups, but nowhere else:

- they are not in the app's repository or its releases;
- they never appear in the published handbook, the player export, a campaign export or the JSON export;
- the GM app and your table server use them, so your players get them in their sheets and the builder at the table.

Keep pack files in a `rules-packs/` folder, or name them `…-rules-pack.zip`. The repository's `.gitignore` keeps both out of git.

## Importing your books from 5etools

If you have a copy of the 5etools data, **Settings → Rules packs → Import your books from 5etools** reads it directly: upload the zip of the 5etools repository (or of just its `data` folder). It makes one pack, **Your books (from 5etools)**, holding spells, species, classes and subclasses with their features, backgrounds and feats from these books:

- Player's Handbook (2024)
- Dungeon Master's Guide (2024)
- Monster Manual (2025)
- Eberron: Forge of the Artificer
- Tasha's Cauldron of Everything
- Xanathar's Guide to Everything
- Mordenkainen Presents: Monsters of the Multiverse
- Spelljammer: Astral Adventurer's Guide

Where books overlap, the newest printing wins. A species from another book comes in only when a people page in your world names it (for example "Use the half-orc rules"), and is marked as an older printing. Every entry names its book and page. Importing again replaces the pack. The 5etools data itself is never stored, only the rules taken from it, and like every pack they never leave your library.

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
