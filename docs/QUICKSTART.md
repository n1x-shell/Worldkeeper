# Quick Start

[← README](../README.md) · [Full Features](FEATURES.md) · [Data & Backups](DATA.md)

This walkthrough takes you from a fresh install to your first tracked session, either in a world of your own or in the Worldkeeper world. Worldkeeper is local-first and does not require an account or AI service.

## 1. Install and start

Requires Node.js 22 or later; Node.js 26, the current LTS, is recommended.

```bash
git clone https://github.com/n1x-shell/Worldkeeper.git
cd Worldkeeper
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4310>. Alternatively, use a tested desktop installer from [GitHub Releases](https://github.com/n1x-shell/Worldkeeper/releases) when one is available for your operating system. Desktop build prerequisites are in [DESKTOP.md](DESKTOP.md).

For development, `npm run dev` serves the API at `:4310` and Vite at <http://localhost:5173>.

## 2. Start your world

A fresh library opens on **Start your world**. There are two ways to begin, on one path; every step can be skipped and everything it makes can be changed later.

### A world of your own

1. Choose **Build my own world**.
2. **Your world:** its name, a line about it and the name the app goes by. Set the calendar now (twelve months of thirty days, or months like ours; the year it starts and the year's name, as in "1247 AR"), or decide later.
3. **Its shape:** one continent, several, a world and another plane (a fey realm, an underworld), or nothing yet. Rename the rows or add more; **Manage worlds & realms** changes them any time.
4. **Rules:** the SRD 5.2.1 is always on. Import your books now or later (see below), and switch on any optional modules you want.
5. **A first campaign:** its name, where it starts (a town made for you, from the Settlement template) and the party's names.
6. **A map:** an image of your world, if you have one.
7. **Finish:** check the summary and choose **Create my world**. Leave **Add records that teach** ticked for a few linked example records (Start Here, an inn, an NPC with a secret, a faction and a landmark).

The dashboard's **Getting started** card lists things to try. Open **Start Here** first. In your own world, new records are Canon at once (**Settings → Canon**).

### The Worldkeeper world

1. Choose **Play in the Worldkeeper world**.
2. Choose **Add the Worldkeeper worldbook**. The whole world comes with the app, so there's no file to find; you'll see what came in.
3. **Rules:** the setting's rules (its creatures, hazards and items) and its modules (Thinning, the Return, vaults, shards and the rest) are on; untick any you won't use.
4. **A first campaign:** pick its starting place (Hollow Refuge, say) and add the party.
5. **Finish:** choose **Start playing**. New records wait for you in **Canon Review**, which protects the setting's text.

### Bringing in a world you already have

Choose **Restore a backup** on the first page, or skip the wizard and open **Library (the gear, top right) → Add and Share**:

1. Choose a ZIP archive of your Markdown lore (a Worldkeeper Markdown export, or an archive in the same format).
2. Select **Preview import**.
3. Inspect the new/updated/unchanged counts, duplicate IDs, skipped templates and copies, broken references, protected originals and conflicts with your edits.
4. Select **Confirm import** only after reviewing the report. Worldkeeper creates a backup and commits changes in a database transaction. A Worldkeeper Markdown export brings back its realms, your templates, canon flags and what players had been shown.

A full JSON export or a full-world ZIP loads into an empty library from **Load an export** on the same page; a campaign export is added as a new campaign, with a list of anything it refers to that the library doesn't have.

Command-line equivalents:

```bash
npm run import -- path/to/archive.zip --dry-run
npm run import -- path/to/archive.zip
npm run import -- path/to/folder
```

Re-imports preserve unchanged records and do not delete records merely because they are absent from a newer archive. When source material and local edits diverge, review the preserved alternatives and revision history. See [Data & Backups](DATA.md) for important limitations and recovery guidance.

### Your rules and your kind of campaign

- **Your books.** The SRD 5.2.1 is built in. To use the books you own, find the 5etools project's source repository yourself, download an archive of it as a zip, and import it in **Settings → Rules packs → Import your books from 5etools**. Tick the books you own. See [Rules packs](RULES_PACKS.md).
- **Standard D&D or the setting.** A world of your own starts as standard D&D 2024. With the setting installed, switch any of its modules off in **Settings → Modules** (for the library, or just for one campaign).
- **Your own world, packaged.** A world can be a worldbook of its own: see [Writing a worldbook](WORLDBOOKS.md).

## 3. Explore the encyclopedia

Open the **World Dashboard** (the app mark, top left), then browse records in **Codex** or use `Ctrl+K` to search. Hover a record link for its card, and press `]` for the inspector. Records retain their canonical stable IDs, source references and provenance, even when the interface hides editorial details. Enable **Settings → Technical details** to inspect those fields.

Create links in descriptions or notes with `@[Record Name]`; type `@` in the editor to select a record. Check the relationship graph and atlas for existing links. Missing or ambiguous source facts remain `UNDEFINED`, rather than being guessed by the application.

## 4. Grow the world and the campaign

Make anything with **New** in the top bar, **Guided** (step by step through the type's template) or **Advanced** (the template as Markdown). A place's page offers what belongs inside it: **Add a settlement here**, **Add an NPC who lives here**. Sections you skip stay as headings with their guidance, shown as **To write**.

The wizard made your first campaign. For another:

1. Open **All Campaigns** and create a campaign with a premise, dates and status.
2. Select it as active.
3. Add the party and its character sheets.
4. Add quests and adventures, optionally starting from source hooks.
5. Set any campaign-specific NPC attitude, faction influence or location changes as **campaign state**, not edits to source canon.

An event in one campaign does not automatically alter the shared world encyclopedia.

## 5. Prepare and run a session

Create a session and open its **Preparation** tab: your prep notes (goals, scenes, relevant NPCs, clues, encounters, possible consequences) sit on top, and below them a board built from the world: where the party is, quests in play, likely NPCs, clues to find, encounters, adventures in play and the tables for that region. **Fill the empty prep fields** copies the useful parts into your notes. Click **Start live session** to run it: the encounter tracker and the log on the left, the scene, the map or any record on the right, and pinned stat blocks in the inspector (`]`).

When players discover something, use the explicit **Reveal to players** flow. You can reveal a record's existence, an allowed section, or a GM-authored player-safe fact. Inspect each reveal before confirming it.

## 6. End the session

Generate a recap draft from recorded session events. Edit it before publication, then review proposed world changes. Accept changes into the appropriate campaign state, and use **Canon Review** only for developments that should become permanent world canon.

## 7. Share with players

Use the in-app `/player` view for local preview. For other devices on a trusted LAN, **Open the table** on a campaign's overview (or run the separate player-only server), or publish a static handbook after checking exactly what it contains.

**Each campaign has its own handbook address** on the player-only server: the campaign's overview shows it with a QR code (**The players' handbook**). With two or more campaigns, each reveal goes to the active campaign unless you choose **Everyone**, so one group never sees what another learned.

**Do not share the DM server with players.** The default DM server is for localhost. See [Player View & Publishing](PLAYER_VIEW.md) for the network and public-publication precautions.

## 8. More than one world

Each world can be a **library** of its own, with its own records, campaigns, settings and backups. Use the Library menu (the gear) for **New library…** (it opens with Start your world) or to switch, and **Library → Libraries** to rename, duplicate, archive, or open a library from a full-world ZIP. Your books' rules are shared: import them once.

## 9. Share your world, or add someone else's

**Library → Worldbooks → Share as a worldbook…** makes a `.worldbook` file of the open library's world: its realms, record types, templates, calendar, records, links, timeline and maps, never your campaigns or what your players saw. If the world uses something only one of your books has (a species, a class, an item), choose whether that book is **required**, **optional**, or swapped for an open stand-in (**safe mode**).

To use one another GM shared, choose **Add a worldbook…**, then **Start a library with it** (a new library named after the world) or **Add to this library**. The app says which books it draws on that you don't have; with all of them, the new library uses your books alone.

## 10. Protect your progress

Use **Backups → Back up now** and make an independent copy of the resulting backup archive. Confirm that a restore works before your world grows large. Automatic backups are not a substitute for tested off-device copies.

## Next reads

- [Complete feature reference](FEATURES.md)
- [Rules packs and your own books](RULES_PACKS.md)
- [Writing a worldbook](WORLDBOOKS.md)
- [Player access and publication](PLAYER_VIEW.md)
- [Data, backup, restore and exports](DATA.md)
- [Commands, configuration and testing](DEVELOPMENT.md)
