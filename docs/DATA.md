# Data, Imports, Backups & Exports

[← README](../README.md) · [Quick Start](QUICKSTART.md)

## Local storage

Worldkeeper stores world records, relationships, campaigns, revision history and map metadata in SQLite. Map image files are stored separately.

The data folder (`./data` by default) holds one or more **libraries**. Each is a complete world, or set of worlds, with its own database, pictures and backups; one is open at a time.

| Default path | Contents |
| --- | --- |
| `data/libraries.json` | The libraries, and which one is open |
| `data/libraries/<id>/worldkeeper.db` | A library's SQLite database |
| `data/libraries/<id>/uploads/` | Its uploaded images |
| `data/libraries/<id>/backups/` | Its versioned `.wkbackup.zip` backup archives |
| `data/shared/rules.db` | Your books' rules (rules packs), imported once for every library |
| `data/shared/packs/` | Worldbooks added to this computer, shared by every library |
| `data/shared/secrets.json` | The publishing token, shared by every library |

The base path is controlled by `WORLDKEEPER_DATA_DIR` (default `./data` for the Node-based run). Desktop installations use the OS application-data location described in [DESKTOP.md](DESKTOP.md). The local data directory is git-ignored.

**Upgrading from v0.5.4 or earlier:** on the first start, a data folder with `worldkeeper.db` in it becomes its first library. A backup of the database and pictures as they were is made first (in the library's backups, named `…-before-libraries`), then the database, `uploads/`, `backups/` and `staging/` move into `libraries/<id>/`. The library is named after the app name you set, or your world. If the start is interrupted, the next one finishes the move. Pointing `WORLDKEEPER_DATA_DIR` at an old data folder works the same way.

Make, open, rename, duplicate and archive libraries in **Library → Libraries** (and switch from the Library menu). **Open a library from a file** makes a new library from a full-world ZIP. Backups and restores are per library: restoring one never touches another. A library's backup holds its own database and pictures, not what's in `shared/`.

**Back up everything** (**Library → Libraries**) downloads one file with every library (its database and pictures) and what they share: your books' rules and worldbooks. It leaves out the publishing token and each library's own backups. **Open everything from a file** adds, never replaces: each library in it becomes a new library (named "… (from file)" where the name is taken), books' rules this installation lacks or has an older copy of are added (each library's own switches kept), and setting packs it lacks are added. That's how a whole installation moves to a new computer. From v0.5.6, a library's rules from before (or in a backup made then) move into `shared/rules.db` when it opens, its switches staying with it; packs and the token move from the data folder into `shared/` on the first start. The table server (`npm run start:player`) serves whichever library is open in the GM app, and switches when it does.

GitHub publishing credentials are held separately in `shared/secrets.json` in the data folder and are not intended to be included in ordinary database backups and exports. Protect this file from unauthorized access. The password for the GM app on another device is kept there too, as a salted hash, never the password itself.

## Importing Markdown lore

In **Library (the gear, top right) → Add and Share**, select a ZIP archive, preview changes, and confirm only after examining the report.

**Large archives:** before uploading, the app reads the ZIP's listing (from the end of the file; nothing is unpacked) and checks whether its text is too much to import in one go on this computer, or past an import's limits (300 MB of text, 20,000 files). Only then does it say so, and offer to **import it in parts**: the browser builds each part from the archive's own compressed bytes, so neither it nor the app holds the whole archive. Files stay with their folder, every part is read as the same setting and carries what all parts need (a setting's locator, a Worldkeeper export's realms and reveals), each part is previewed and confirmed like any import, one backup is made before the first, and the links between records in different parts are made after the last. The result is the same library as one import (checked on the Worldkeeper archive: records, links, timeline, source documents and realms identical). A single file over 8 MB can't be imported either way.

The importer understands:

- Record metadata including `ID`, `Name`, aliases, category, parent, realm/continent, canon status, source and tags.
- Multiple records in one Markdown file.
- Canonical Entry Locator information for choosing authoritative pages.
- Legacy redirect IDs and cross-references.
- `References/` and protected source originals, such as setting bibles.
- Templates, examples, copied compendium entries and duplicate IDs, which may need to be skipped or resolved.

The preview summarizes records to create, update or retain, duplicate ID resolution, broken references, protected files and conflicts with local edits.

### Import behavior

- A backup is created before confirmation.
- The database changes are applied in one transaction so a failed commit can roll back the database writes.
- An unchanged record remains untouched on re-import.
- Records with local edits are preserved by default where the imported source has also changed, with alternatives retained in history.
- A record missing from a later archive is not automatically deleted.
- Original protected source text is preserved rather than overwritten by free-form editing.

A database transaction cannot by itself provide an all-or-nothing guarantee for every external filesystem side effect. Retain independent backups, especially before importing unfamiliar archives.

### Bringing your own notes (an Obsidian vault or plain Markdown)

Notes that weren't written for this app come in through **Add and Share → Your notes**. Choose the folder they are in (only its `.md` notes and its pictures are read; hidden folders such as `.obsidian` are passed over), or a ZIP of it. The app lists each folder with a first guess at what it holds (`NPCs` → NPC, `Places` → Landmark, `Sessions` → left out), and you say what each really is, the type for everything else, and which world or realm the records are in. Then comes the same preview and confirmation as any import.

What a note becomes:

| In the note | In the record |
| --- | --- |
| Front matter `title` or `name`, else the first `# Heading`, else the file name | The name |
| Front matter `type`, `category` or `kind` (a record type's name) | The type, over its folder's |
| Front matter `aliases`, `tags`, and `#tags` in the text | Alternate names and tags |
| Other front matter (`race: Elf`) | Facts on the record |
| `[[Another note]]`, `[[Note\|shown words]]`, `[[Note#Heading]]` | A link to that record, and a relationship between the two. A link to a note that isn't there stays as plain words, and the preview counts them. |
| `![[picture.png]]`, `![](pictures/map.jpg)` | The record's pictures, for the GM only until shown to players |
| `%%a comment%%` | Left out |

Records get this library's IDs. Bringing the same notes in again matches each note to its record by name and type: an unchanged note changes nothing, a changed one updates its record, and a record you have edited here (or made here under the same name) is asked about first and kept by default. Pictures aren't added twice. Your own notes don't switch Canon Review on.

Not read: Obsidian canvases, Dataview queries (they stay as text), notes embedded in other notes (they become a link), and files that aren't Markdown or pictures.

### Command line

```bash
npm run import -- path/to/archive.zip --dry-run
npm run import -- path/to/archive.zip
npm run import -- path/to/folder
npm run import -- path/to/archive.zip --take-source
```

Use `--take-source` only after reviewing its effect on conflicting local changes. An archive's contents should be treated as untrusted input; use import limits and inspect suspicious archives before processing.

## Updating the app

A new version of the app sometimes has to change how a library is stored. When it does:

- **A backup is made first.** Before anything is changed, the library's database is copied into its backups as `…-pre-update-step-N.wkbackup.zip`. It holds no pictures (an update doesn't touch them) and restores like any other backup. The newest eight are kept. The app says once that the library was updated and where the copy is.
- **An update is all or nothing.** Every change a version needs is made together. If any of it fails, none of it is kept: the library is exactly as the version before left it, and that version still opens it.
- **A library from a newer version is refused.** If you open a library with an older version of the app than last opened it, the app leaves it untouched and says to install the newest version.
- **If the library can't be opened at the start**, the app still starts and shows a page that says what happened, that nothing was changed, where the copy from before is, and what to do. From there you can try again or open another library. If another library can't be opened while one is open, you stay in the one you have.

Each library is updated when it is first opened by the new version, so a library you haven't opened since an update still has its own backup and update ahead of it.

## Backups

Worldkeeper creates backups daily **while the application is running**, before imports and restores, and on demand via **Backups → Back up now** or:

```bash
npm run backup
npm run backup -- reason
```

A backup archive includes the information required to restore the world, including the database and managed uploads as supported by the backup workflow. Keep off-device copies: automatic backups on the same drive do not protect against loss of that drive, malware or accidental deletion of the whole directory.

### Restore

The restore flow checks the archive and SQLite integrity before replacing live data, and saves a safety backup of the current state. **Restoration is still a destructive operation**: stop other processes accessing the same data, make a separate copy, and verify the result afterward. Practice restoration on a nonproduction copy of your data.

## Export formats

| Format | Intended use |
| --- | --- |
| Full world ZIP | Markdown library, complete JSON, original source files and uploaded pictures (maps, handouts, portraits). Loads into an empty installation from **Load an export**, pictures and all |
| Markdown library | One Markdown file per record for re-import or external editing, with `_worldkeeper/library.json` beside them: the realms as they are (kind, place, colour, icon), your templates, and each record's canon flags and what players have been shown. Imported again, it makes the same library |
| JSON data | Every table in the database (a test checks this against the schema), for importing into a fresh installation. Only your books' rules are left out: import them again from your own copy |
| Campaign-only | One campaign and everything it keeps (party, sheets and pages, quests, adventures, sessions and their logs, state, standing and renown, the clock, treasure, handouts with their pictures, Bastions, downtime, calendar events, what the party has heard and found, and their travel), imported as a new campaign. It names what it needs (its world, setting packs, the records it refers to and the maps it travelled); importing reports anything the library doesn't have. Its handbook code (the table's private address) is left out; the imported copy gets a code of its own |
| Player-safe export | Only deliberately revealed/published material, generated from the player projection |

**Privacy:** Full-world exports and backups may contain GM secrets, unpublished records and personally authored notes. Treat them as private. Player-safe exports should be reviewed before sharing, particularly maps, markers, hyperlinks and image assets.

## Recommended operating habits

1. Back up before major edits and imports.
2. Keep at least one copy off the primary computer.
3. Test restoring a backup before depending on it.
4. Review player exports as a player would before uploading publicly.
5. Retain original Markdown sources independently of the application.
