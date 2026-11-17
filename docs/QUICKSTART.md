# Quick Start

[← README](../README.md) · [Full Features](FEATURES.md) · [Data & Backups](DATA.md)

This walkthrough takes you from an existing Markdown lore library to your first tracked session. Worldkeeper is local-first and does not require an account or AI service.

## 1. Install and start

Requires Node.js 20 or later; Node.js 22 is recommended.

```bash
git clone https://github.com/n1x-shell/Worldkeeper.git
cd Worldkeeper
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4310>. Alternatively, use a tested desktop installer from [GitHub Releases](https://github.com/n1x-shell/Worldkeeper/releases) when one is available for your operating system. Desktop build prerequisites are in [DESKTOP.md](DESKTOP.md).

For development, `npm run dev` serves the API at `:4310` and Vite at <http://localhost:5173>.

## 2. Import your world

1. Open **Library Management → Import and Export**.
2. Choose a ZIP archive of your Markdown lore, for example `Amsel_Unified_World_Lore_Reference_v10.zip`.
3. Select **Preview import**.
4. Inspect the new/updated/unchanged counts, duplicate IDs, skipped templates and copies, broken references, protected originals and conflicts with your edits.
5. Select **Confirm import** only after reviewing the report. Worldkeeper creates a backup and commits changes in a database transaction.

Command-line equivalents:

```bash
npm run import -- path/to/archive.zip --dry-run
npm run import -- path/to/archive.zip
npm run import -- path/to/folder
```

Re-imports preserve unchanged records and do not delete records merely because they are absent from a newer archive. When source material and local edits diverge, review the preserved alternatives and revision history. See [Data & Backups](DATA.md) for important limitations and recovery guidance.

### Your rules and your kind of campaign

- **Your books.** The SRD 5.2.1 is built in. To use the books you own, find the 5etools project's source repository yourself, download an archive of it as a zip, and import it in **Settings → Rules packs → Import your books from 5etools**. Tick the books you own. See [Rules packs](RULES_PACKS.md).
- **Standard D&D or the setting.** A library without the Worldkeeper setting starts as standard D&D 2024. If you imported the setting but want a plain campaign, choose **Settings → Campaign mechanics → Standard D&D**.

## 3. Explore the encyclopedia

Open **Dashboard**, then browse records or use `Ctrl+K` to search. Records retain their canonical stable IDs, source references and provenance, even when the interface hides editorial details. Enable **Settings → Technical details** to inspect those fields.

Create links in descriptions or notes with `@[Record Name]`; type `@` in the editor to select a record. Check the relationship graph and atlas for existing links. Missing or ambiguous source facts remain `UNDEFINED`, rather than being guessed by the application.

## 4. Create a campaign

1. Open **All Campaigns** and create a campaign with a premise, dates and status.
2. Select it as active.
3. Add the party and its character sheets.
4. Add quests and adventures, optionally starting from source hooks.
5. Set any campaign-specific NPC attitude, faction influence or location changes as **campaign state**, not edits to source canon.

An event in one campaign does not automatically alter the shared world encyclopedia.

## 5. Prepare and run a session

Create a session with a recap, party location, goals, scenes, relevant NPCs, clues, encounters and possible consequences. Click **Live Session** to track initiative, conditions, events, quests and proposed changes as play unfolds.

When players discover something, use the explicit **Reveal to players** flow. You can reveal a record's existence, an allowed section, or a GM-authored player-safe fact. Inspect each reveal before confirming it.

## 6. End the session

Generate a recap draft from recorded session events. Edit it before publication, then review proposed world changes. Accept changes into the appropriate campaign state, and use **Canon Review** only for developments that should become permanent world canon.

## 7. Share with players

Use the in-app `/player` view for local preview. For other devices on a trusted LAN, use the separate player-only server, or publish a static handbook after checking exactly what it contains.

**Do not share the DM server with players.** The default DM server is for localhost. See [Player View & Publishing](PLAYER_VIEW.md) for the network and public-publication precautions.

## 8. Protect your progress

Use **Backups → Back up now** and make an independent copy of the resulting backup archive. Confirm that a restore works before your world grows large. Automatic backups are not a substitute for tested off-device copies.

## Next reads

- [Complete feature reference](FEATURES.md)
- [Rules packs and your own books](RULES_PACKS.md)
- [Player access and publication](PLAYER_VIEW.md)
- [Data, backup, restore and exports](DATA.md)
- [Commands, configuration and testing](DEVELOPMENT.md)
