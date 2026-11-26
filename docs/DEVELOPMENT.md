# Development, Commands & Testing

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [Desktop](DESKTOP.md)

## Requirements and stack

Node.js 22 or newer (26, the current LTS, recommended; `.nvmrc`). Application stack: React, TypeScript, Vite, Tailwind CSS, Lucide, React Flow, Leaflet, Express, SQLite via `better-sqlite3` and FTS5, zod, plus a Tauri desktop wrapper.

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
| `npm run lint` | Oxlint, with type-aware rules (`.oxlintrc.json`); CI fails on any warning |
| `npm run deadcode` | knip: unused files, exports and packages (`knip.json`) |
| `npm run audit` | Known security holes in the packages (high or critical) |
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
| `WORLDKEEPER_REMOTE_PORT` | `4330` | The GM app's password-protected network listener (opened from Settings) |
| `WORLDKEEPER_ALLOWED_HOSTS` | unset | Names the servers answer to besides IP addresses, `localhost` and home-network names (comma-separated), for the app behind a name of your own. See [SECURITY.md](../SECURITY.md) |
| `WORLDKEEPER_NO_UPDATE_CHECK` | unset | Set to `1` to leave out the daily check for a newer version |
| `WORLDKEEPER_MODE` | `dm` | Use `player` for player-only server |
| `WORLDKEEPER_STATIC_DIR` | `./dist` | Built DM client |
| `WORLDKEEPER_PLAYER_SITE_DIR` | `./dist-player` | Built player handbook |
| `WORLDKEEPER_DEBUG` | Off | `1` displays IDs, sources and technical notes |

**Security:** The DM server has privileged routes and should remain loopback-only unless an independently reviewed access-control layer protects it. The player-only server exposes player material to other devices on the listening network; restrict access with your firewall.

## Keyboard shortcuts

They are listed for GMs in [the shortcuts guide](SHORTCUTS.md), which is also in the app's Help. Add a new one there.

## Help inside the app

The guides in `docs/` that are written for GMs are bundled into the GM app and shown at `/help` (`client/src/pages/Help.tsx`). To add or change them:

- **Which files are guides** is `GUIDES` in `shared/help.ts` (the address, the title, one line about it). The same files must be named in the `import.meta.glob` in `client/src/lib/helpDocs.ts`; a test checks the two agree.
- **Write for both places.** A link to another guide (`DATA.md#backups`) opens in the app; a link to any other file of the project opens on GitHub. A test follows every link in every guide to a heading or a file that exists. No guide may have two headings with the same words.
- **Help for a screen** (the `?`) is `HELP_FOR_PAGE` in `shared/help.ts`: the start of a page's address, a guide and a heading. A test checks each heading exists, so renaming a heading in a guide fails until the table follows.
- **What's new** (`docs/WHATS_NEW.md`) needs an entry for each version, newest first, written for GMs; a test fails if the current version has none.

## Tests

```bash
npm test
npm run typecheck
npm run lint -- --deny-warnings
npm run deadcode
npm run audit
npm run build
```

CI runs all of these on every pull request, and then real browsers (screenshots and server logs are kept when one fails):

- **The first run**, both ways (`npm run e2e:first-run`): your own world and Oros, each on an empty data folder.
- **A session at the table** (`npm run e2e:table`): the GM's app and two players' phones. The table is closed until opened; players see what was revealed and nothing else (not in the page, and not in anything the table's server answers); a character's page follows both sides at once; a roll crosses the table and a hidden one doesn't.

- **Accessibility** (`npm run e2e:a11y`): forty-two screens of the GM's app and the players' handbook, in both themes, against the WCAG 2.1 and 2.2 A and AA rules that axe-core tests; the same screens on a tablet held both ways (nothing off the side, nothing too small to press); and the keyboard alone (the skip link, a name and a visible focus at every stop, a dialog that keeps the focus and gives it back, and a screen change that is announced). Add `--report` to list what it finds without failing. When you add a screen, add it to the list at the top of `scripts/e2e-a11y.mjs`.

Each takes the GM app's address: start the app on an empty data folder (`WORLDKEEPER_DATA_DIR`), then `node scripts/e2e-table.mjs http://127.0.0.1:4310`. Playwright isn't a dependency of the project; install it where you run them.

Two more checks run without a browser:

- **A large library** (`tests/largeLibrary.test.ts`, part of `npm test`): 10,000 linked records, with a limit on everything a GM does all the time (opening the app, searching, opening and saving a record, a backup, an export, the players' handbook). The limits are several times what each takes on an ordinary computer, so a slow build machine passes and something that grows with the square of the library doesn't. Run it alone with `--silent=false` to see the timings.
- **The built desktop app** (`npm run desktop:smoke`, after `npm run desktop:build`): see [the desktop notes](DESKTOP.md#trying-a-build). The release workflow runs it on each system before anything is published.

The older smoke test (`npm run e2e`) needs the archive, so it is run locally. The linter is Oxlint because typescript-eslint doesn't support TypeScript 7 yet; rules that don't fit the codebase are switched off in `.oxlintrc.json` with the reason. Dependabot (`.github/dependabot.yml`) opens update pull requests: npm weekly, Cargo and GitHub Actions monthly, minor and patch updates grouped.

The tests import the world's archive as the Oros worldbook ships it (`packs/worldkeeper/archive`; `WORLDKEEPER_TEST_ARCHIVE` can name another copy), and use synthetic fixtures for import planning, deduplication, rollback, idempotency, edit/source protection, relationships, revision history, campaigns, recaps, player projection, backups and exports, maps, dice and initiative.

Browser smoke testing requires Playwright, Chromium and a running application:

```bash
node scripts/e2e-smoke.mjs http://127.0.0.1:4310 ./screenshots
```

On an empty library it adds the shipped archive through **Add and Share**.

The first run, on an app started with an empty data folder (`WORLDKEEPER_DATA_DIR`): a world of one's own, or Oros (the whole world, with no file to choose).

```bash
node scripts/e2e-first-run.mjs http://127.0.0.1:4310 own ./screenshots
node scripts/e2e-first-run.mjs http://127.0.0.1:4310 setting ./screenshots
```

Test claims describe intended suite coverage, not a guarantee that tests have been executed in a given release. Consult [Development Status](../DEVELOPMENT_STATUS.md) for recorded outcomes and remaining gaps.

## Changing how a library is stored

A library's database is brought up to date by the steps in `MIGRATIONS` (`server/src/db/migrations.ts`), in order, when it is opened.

- **Add a step; never edit one.** Libraries already took the old steps. `tests/migrations.test.ts` holds each shipped step's checksum in `tests/migrations.lock.json` and fails if one changes. When you add a step, add its checksum to the lock (the failing test prints it).
- **Steps run together.** All the steps a library is missing run in one transaction, after a backup; a failure keeps none of them. So a step can't rely on an earlier one having been committed on its own, and can't use statements that don't work inside a transaction.
- **Test it on an old library.** The same test opens libraries as they were at several earlier steps and checks nothing is lost. If a step moves or rewrites data, add rows for it there.
- **The version** is in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `packs/worldkeeper/pack.json` and `shared/version.ts`; the same test checks they agree.

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
