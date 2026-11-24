# Worldbooks: plan

Status: proposed, November 2026. Decisions so far are in DEC-910 ("Worldbooks").

## 1. What changes, in one paragraph

A **worldbook** is a whole world you can hand to someone: its records, maps, calendar, realms, record types, templates, rules and adventures. It is what the app called a "setting pack", renamed because "setting" collides with Settings. The Worldkeeper world becomes a worldbook that **ships complete with the app**: no one adds an archive by hand any more. GMs who build their own world can **share it as a worldbook**, and other GMs **add** it. "Import" stops being a word the app uses for worlds.

## 2. Decided (owner, November 2026)

- The name is **worldbook**.
- Bringing one in is **adding** it ("Add a worldbook…"), never importing.
- The Worldkeeper worldbook ships **pre-installed and whole, GM-only secrets included**, knowing the repository and the app are public.
- The archive's working notes (the Phase 1 audit, the project-context note, the ChatGPT implementation guide) are left out.
- Adding a worldbook someone shared starts a **new library** named after it by default; "Add to this library" is the other choice.

## 2a. Worldbooks and the GM's books

A worldbook works with whatever rules a GM has; nothing breaks without a book, some things show less.

- **A worldbook never contains book text.** It names rules ("Tabaxi", "Moon-Touched Sword") and the app finds each name in the rules this GM has: the SRD (always), open rules packs, the GM's own books. That also keeps sharing legal.
- **Adding says what's missing.** Adding a worldbook lists the books it draws on that this GM doesn't have, and what each gives ("Xanathar's Guide: 6 treasure items; Monsters of the Multiverse: 5 species").
- **Sharing asks how the books count** (owner, November 2026). Three choices:
  - **Books required:** the worldbook names the books it needs; it can't be added unless those books are in the GM's rules.
  - **Books optional:** it can be added without them, with the warning above; those things show by name only.
  - **Safe mode:** it uses open rules only, so anyone can add it. Each thing that exists only in a closed book is swapped for the closest open-rules match of the same kind (an item of the same rarity and type, a creature of the same type and challenge, an SRD species), in a list the GM reviews and can change before sharing. Open-licensed rules the library uses beyond the SRD (an Open5e pack, for example) travel inside the worldbook, with their credits.
- **Safe mode keeps the originals.** Each swap is stored as a pair, the book's thing and its open stand-in ("Tabaxi, Monsters of the Multiverse → its open stand-in"). A GM who adds the worldbook and has that book gets the original; one who hasn't gets the stand-in.
- **Books only** (owner, November 2026): one switch per library, on Settings → Rules packs, turns the open rules off (the built-in SRD, open packs such as Open5e, a worldbook's bundled open rules and its stand-ins) so only the GM's books are used; turning it off puts back what was on before. Before switching, it says what the books don't cover that the open rules did ("your books have no classes").
- **All the books there: books only, silently** (owner, November 2026). When a GM adds a worldbook and has every book it draws on, the new library is set to Books only without asking. The one exception: if the books leave a gap the open rules filled (no book with classes, say), the open rules stay on for that alone, and the app says so once.
- **A worldbook can carry its own fallback**: its own open rules for what it needs, as the Worldkeeper worldbook already carries its creatures and a standard-rules version of what Thinning touches. For Worldkeeper, open (CC BY) species rules for the few peoples that borrow book species would make it whole on the SRD alone: writing work, the owner's call, not part of these steps.
- Today, for Worldkeeper: its creatures, hazards, items and NPC fight cards, the classes and most species work on the SRD alone; a few peoples' species (Tortle, Tabaxi, Kenku, Firbolg, Aarakocra and the like), some faction-pool treasure and subclasses beyond the SRD need the GM's books.

## 3. Words

| Today                                 | After                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| Setting pack, Library → Setting packs | Worldbook, Library → Worldbooks                       |
| Install a pack / Uninstall            | Add to this library / Remove from this library        |
| Import (an archive, a Markdown ZIP)   | Add (records from files)                              |
| Import and Export page                | Add and Share                                         |
| Full world (ZIP) to move a world      | Share as a worldbook (the world, not your campaigns)  |
| "Play in the Worldkeeper setting"     | "Play in the Worldkeeper world"                       |

Internally the code keeps its names (`packs/`, `setting_packs`, `installPack`): renaming tables and files gains nothing and risks upgrades. Backups (one library, or everything) stay backups: a backup restores your whole state, campaigns included; a worldbook is the world only.

## 4. Steps (one PR each)

### W1 (v0.7.1): the words

Done in v0.7.1.

- Rename in the GM app, the wizard, the handbook's help text and the docs: setting pack → worldbook, import → add (for worlds and records). `docs/SETTING_PACKS.md` becomes `docs/WORLDBOOKS.md`.
- No behaviour changes. Screens checked with the screenshot comparison from v0.6.11 (only the words differ).

### W2 (v0.7.2): the Worldkeeper worldbook, complete

Done in v0.7.2. The maps were already in the pack; the archive's 472 files are in `packs/worldkeeper/archive/`; "Apply additions" went, as Library → Worldbooks → Update does the same.

- The Worldkeeper archive's records, its two maps and its source documents move into `packs/worldkeeper/` (about 12 MB of Markdown and two pictures), so the worldbook carries the whole world.
- Adding the Worldkeeper worldbook to a library (the wizard's "Play in the Worldkeeper world", New library, or Library → Worldbooks) brings in every record, map and pin, with no file to choose. The wizard's "add your archive" step goes.
- A library that already has the records (yours) is updated the way an import is today: records you edited are kept and flagged, nothing you wrote is lost.
- Left out: the archive's working notes about how it was built (the Phase 1 audit, the project-context note, the ChatGPT implementation guide), unless you want them in.

### W3: share and add any worldbook

In three PRs: W3a (v0.7.3) Books only; W3b (v0.7.4) sharing and adding `.worldbook` files; W3c (v0.7.5) the books (required, optional, safe mode, what's missing, books only when every book is there). W3b is done too: sharing and adding `.worldbook` files (adventures and random tables aren't shared yet; only pins on records travel). W3a: Books only is a filter, not a change to the switches, and a worldbook's own rules (the Worldkeeper world's creatures and items) stay on, as they are the world's, not stand-ins for a book's.

- **Books only** (§2a, W3a): the switch on Settings → Rules packs, with the gaps check; safe-mode stand-ins give way to the originals when the GM has the books.
- **The books** (§2a): sharing asks Books required, Books optional or Safe mode (with the review list of open-rules swaps, and open rules bundled); adding lists the books missing, and refuses a worldbook whose required books the GM doesn't have.
- **Share as a worldbook** (Library → Worldbooks): makes a `.worldbook` file (a ZIP) from the open library: a manifest (name, description, version, author, licence), its realms, record types, templates and calendar, every record as Markdown, its maps and pictures. Never campaigns, characters, sessions or what players were shown. An option leaves out GM-only sections, for sharing a world with players in mind.
- **Add a worldbook…**: choose a `.worldbook` file; it is checked (paths, sizes, IDs that clash with yours) and added to the computer's worldbooks, shared by every library like books' rules. Then **Start a library with it**, or **Add to this library**.
- The old route (Full world ZIP, then "Open a library from a file") keeps working for files made before.

### W4 (v0.8.0 "Worldbooks"): docs, screenshots, release

- README, Quick Start (both ways to begin, now without the archive step), FEATURES, DEVELOPMENT_STATUS, screenshots, release notes.

## 5. Questions

1. **File name:** `Name.worldbook` (a ZIP inside)? _Proposed: yes; the app also accepts `.zip`._
