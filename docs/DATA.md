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
| `data/shared/packs/` | Installed setting packs, shared by every library |
| `data/shared/secrets.json` | The publishing token, shared by every library |

The base path is controlled by `WORLDKEEPER_DATA_DIR` (default `./data` for the Node-based run). Desktop installations use the OS application-data location described in [DESKTOP.md](DESKTOP.md). The local data directory is git-ignored.

**Upgrading from v0.5.4 or earlier:** on the first start, a data folder with `worldkeeper.db` in it becomes its first library. A backup of the database and pictures as they were is made first (in the library's backups, named `…-before-libraries`), then the database, `uploads/`, `backups/` and `staging/` move into `libraries/<id>/`. The library is named after the app name you set, or your world. If the start is interrupted, the next one finishes the move. Pointing `WORLDKEEPER_DATA_DIR` at an old data folder works the same way.

Backups and restores are per library: restoring one never touches another. A library's backup holds its own database and pictures, not what's in `shared/` (your books' rules come back by importing them again). From v0.5.6, a library's rules from before (or in a backup made then) move into `shared/rules.db` when it opens, its switches staying with it; packs and the token move from the data folder into `shared/` on the first start. The table server (`npm run start:player`) serves whichever library is open in the GM app, and switches when it does.

GitHub publishing credentials are held separately in `shared/secrets.json` in the data folder and are not intended to be included in ordinary database backups and exports. Protect this file from unauthorized access.

## Importing Markdown lore

In **Library (the gear, top right) → Import and Export**, select a ZIP archive, preview changes, and confirm only after examining the report. The importer understands:

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

### Command line

```bash
npm run import -- path/to/archive.zip --dry-run
npm run import -- path/to/archive.zip
npm run import -- path/to/folder
npm run import -- path/to/archive.zip --take-source
```

Use `--take-source` only after reviewing its effect on conflicting local changes. An archive's contents should be treated as untrusted input; use import limits and inspect suspicious archives before processing.

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
