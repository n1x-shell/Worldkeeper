# The Worldkeeper

A local-first worldbuilding encyclopedia and D&D 5e (2024) campaign manager, built for one world with three branches: **Aetheris**, **Kaelmar** and the **Ethereal Realm**. ("The Worldkeeper" is a working title; rename it in Settings.)

Everything runs on your own computer. There is no account, no cloud service, no AI requirement and no paid API. Your data lives in one SQLite file plus a folder of map images, and it is backed up automatically.

## Quick start

Requirements: **Node.js 20 or newer** (22 recommended).

```bash
npm install          # install dependencies
npm run build        # build the web client
npm start            # start the app at http://127.0.0.1:4310
```

Then open http://127.0.0.1:4310 and go to **Library Management → Import and Export**. Choose your world archive ZIP (e.g. `Amsel_Unified_World_Lore_Reference_v10.zip`), review the preview, and click **Confirm import**.

Or import from the command line:

```bash
npm run import -- path/to/Amsel_Unified_World_Lore_Reference_v10.zip --dry-run   # preview only
npm run import -- path/to/Amsel_Unified_World_Lore_Reference_v10.zip             # import (backs up first)
```

### Development mode

```bash
npm run dev          # API on :4310 with reload, Vite client on http://localhost:5173
```

### Where your data is

By default in `./data/` (ignored by git):

| Path | Contents |
| --- | --- |
| `data/worldkeeper.db` | The SQLite database (records, history, campaigns, maps) |
| `data/uploads/` | Uploaded map images |
| `data/backups/` | Versioned `.wkbackup.zip` backups (daily, before every import and restore, and on demand) |

Set `WORLDKEEPER_DATA_DIR=/some/folder` to keep data elsewhere (for example a synced folder). `PORT` and `HOST` change where the server listens; the DM server listens on `127.0.0.1` only by default.

### Player view

- **Same machine:** open http://127.0.0.1:4310/player (or the **Player View** button). It only calls player endpoints.
- **Players on your network:** run a second, player-only server:
  ```bash
  npm run start:player     # http://<your-computer>:4320 — serves ONLY revealed, player-safe data
  ```
  This process does not contain any DM routes at all, so secrets cannot be fetched from it.

Players see a record only after you tick **Players know this record exists** on its *Player view* tab, and then only your player summary, revealed facts, and the sections you tick. Sections whose headings say *GM only* or *Secret* can never be published.

## Tests

```bash
npm test                                         # unit + API tests (synthetic fixtures)
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip npm test   # also runs the full real-archive import test
npm run typecheck
# Browser end-to-end smoke test (start the app first, needs Playwright + Chromium):
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip node scripts/e2e-smoke.mjs http://127.0.0.1:4310 ./screenshots
```

## Keyboard shortcuts

`Ctrl+K` or `/` search · `Alt+D` DM screen · `Ctrl+\` collapse sidebar · `Ctrl+Enter` save a live-session log entry.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, folder layout, database schema, import strategy, safety model.
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md): what is done, what is partial, known issues, tests performed and next steps.
