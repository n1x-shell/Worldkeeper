# Development, Commands & Testing

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [Desktop](DESKTOP.md)

## Requirements and stack

Node.js 20 or newer (22 recommended). Application stack: React, TypeScript, Vite, Tailwind CSS, Lucide, React Flow, Leaflet, Express, SQLite via `better-sqlite3` and FTS5, zod, plus a Tauri desktop wrapper.

```bash
git clone https://github.com/n1x-shell/Worldkeeper.git
cd Worldkeeper
npm ci
npm run build
npm start
```

Use a supported Rust toolchain and your OS-specific dependencies for desktop packaging; consult [DESKTOP.md](DESKTOP.md). Desktop support should be considered validated per platform only after its build and installation have actually been tested.

## Commands

| Command | Description |
| --- | --- |
| `npm run setup` | Install dependencies and build the client |
| `npm start` | Production DM app, default `127.0.0.1:4310` |
| `npm run start:player` | Player-only server, default `0.0.0.0:4320` |
| `npm run dev` | API and client development servers with live reload |
| `npm run build` | Type-check/build app and static Player Handbook (`dist/`, `dist-player/`) |
| `npm run import -- <zip or folder> [--dry-run] [--take-source]` | Import lore |
| `npm run backup [-- reason]` | Write a backup archive |
| `npm test` | Unit, API and integration suite |
| `npm run typecheck` | Type-check client and server |
| `npm run e2e -- <url> [screenshot dir]` | Browser smoke test against running app |
| `npm run e2e:first-run -- <url> own\|setting [screenshot dir]` | The first-run wizard in a browser, on an empty data folder |
| `npm run desktop:prepare` | Bundle app, server, SQLite driver and Node runtime |
| `npm run desktop:dev` | Desktop development |
| `npm run desktop:build` | Build desktop installers |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORLDKEEPER_DATA_DIR` | `./data` | Database, uploads and backup root for Node run |
| `PORT` | `4310` DM / `4320` player | Listening port |
| `HOST` | `127.0.0.1` DM / `0.0.0.0` player | Network binding |
| `WORLDKEEPER_MODE` | `dm` | Use `player` for player-only server |
| `WORLDKEEPER_STATIC_DIR` | `./dist` | Built DM client |
| `WORLDKEEPER_PLAYER_SITE_DIR` | `./dist-player` | Built player handbook |
| `WORLDKEEPER_DEBUG` | Off | `1` displays IDs, sources and technical notes |

**Security:** The DM server has privileged routes and should remain loopback-only unless an independently reviewed access-control layer protects it. The player-only server exposes player material to other devices on the listening network; restrict access with your firewall.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` or `/` | Global search |
| `Alt+D` | DM screen |
| `[` or `Ctrl+\` | Collapse/expand the sidebar (its icon rail) |
| `]` | Open or close the inspector (peeked records, the page's own details, pinned stat blocks) |
| `Esc` | Close the hover card, the inspector or a dialog |
| Middle-click a record link | Peek it into the inspector |
| `Ctrl+Enter` | Save live-session log entry |
| `@` in a text area | Suggest a record; `Enter`/`Tab` selects, `Esc` cancels |

## Tests

```bash
npm test
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip npm test
npm run typecheck
npm run build
```

The second command adds import testing against a real archive, where configured. The regular tests use synthetic fixtures for import planning, deduplication, rollback, idempotency, edit/source protection, relationships, revision history, campaigns, recaps, player projection, backups and exports, maps, dice and initiative.

Browser smoke testing requires Playwright, Chromium and a running application:

```bash
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip \
  node scripts/e2e-smoke.mjs http://127.0.0.1:4310 ./screenshots
```

The first run, on an app started with an empty data folder (`WORLDKEEPER_DATA_DIR`): a world of one's own needs no archive; the setting takes one if given.

```bash
node scripts/e2e-first-run.mjs http://127.0.0.1:4310 own ./screenshots
WORLDKEEPER_TEST_ARCHIVE=path/to/archive.zip node scripts/e2e-first-run.mjs http://127.0.0.1:4310 setting ./screenshots
```

Test claims describe intended suite coverage, not a guarantee that tests have been executed in a given release. Consult [Development Status](../DEVELOPMENT_STATUS.md) for recorded outcomes and remaining gaps.

## Project layout

```text
shared/            Domain vocabulary and pure play logic
server/src/
  db/              SQLite connection and migrations
  import/          Scanning, parsing, planning, commit
  repo/            Entities, relationships, search, campaigns, maps
  player/          Player-safe data projection
  backup/          Backups, restore, exports
  routes/          HTTP API
  cli/             Import and backup commands
client/src/
  components/      Layout, Markdown, search, UI primitives
  pages/           Encyclopedia, atlas, realms, campaigns, sessions
  player/          Player view
tests/             Unit, API and integration tests
scripts/           Browser smoke testing
docs/              Technical and user documentation
src-tauri/         Desktop shell
desktop/           Desktop assets
```

## Windows terminal compatibility

Some package scripts may use POSIX environment-variable assignment, such as `NODE_ENV=production`, which is not portable to Windows Command Prompt as written. Use a cross-platform script solution (for example, a compatible Node-based wrapper) before documenting raw Node execution as supported across all Windows shells. Tauri packaging is a separate workflow.

## Architecture invariants

- Source originals remain protected, and IDs retain identity across imports.
- Missing source facts are not fabricated.
- Campaign state does not directly overwrite shared world canon.
- Player responses must be derived through the player-safe projection.
- All externally supplied writes require validation.

For implementation details, see [Architecture](ARCHITECTURE.md). For responsible reports of security issues, see [Security Policy](../SECURITY.md).
