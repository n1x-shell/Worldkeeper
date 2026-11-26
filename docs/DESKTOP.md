# Desktop app (Tauri)

The desktop app is the same Worldkeeper you get from `npm start`, packaged as a normal application window. You don't need a terminal or a browser to use it.

## How it works

```
The Worldkeeper (Tauri window)
  └─ starts → bundled Node.js runtime (sidecar, installed as `worldkeeper-node`)
                └─ runs → server/index.mjs  (API + built client, bound to 127.0.0.1 on a free port)
                            └─ data → OS app-data folder (SQLite database, map images, backups)
```

- The Rust shell (`src-tauri/src/lib.rs`) does five things:
  1. picks a free local port;
  2. starts the bundled server, bound only to `127.0.0.1`;
  3. waits until the server answers, then loads it in the window;
  4. shows a readable error with the log location if the server fails to start;
  5. stops the server cleanly (SIGTERM, then a forced stop) when you quit.
- No Tauri commands are exposed to the page, so the page has no native access beyond a normal browser tab.
- Everything works offline. The one request the app makes by itself is a daily check of this project's list of releases on GitHub for a newer version (**Settings → Updates**, switchable off); it sends nothing about you or your worlds. Set `WORLDKEEPER_NO_UPDATE_CHECK=1` to leave the check out altogether.

### Your table

Players can use the handbook on their phones while you play: on a campaign's overview, **Open the table**, then they scan its QR code or open its address. The app serves them on your network until you **Close the table** (or quit). The first time, your system may ask whether to allow network connections; allow it on your home network only.

### Libraries

The app opens the library you used last. With more than one, its start shows them to pick from, the last opened first (once per window). Switch any time from the Library menu (the gear), and manage them in **Library → Libraries**, where **Show in folder** opens a library's folder.

### Where your data lives

| OS | Folder |
| --- | --- |
| Linux | `~/.local/share/app.worldkeeper.desktop/` |
| macOS | `~/Library/Application Support/app.worldkeeper.desktop/` |
| Windows | `%APPDATA%\app.worldkeeper.desktop\` |

That folder contains:
- `libraries.json` and `libraries/`: your libraries, each with its own `worldkeeper.db`, `uploads/` and `backups/` (see [DATA.md](DATA.md))
- `shared/`: your books' rules (`rules.db`), worldbooks (`packs/`) and the publishing token (`secrets.json`), shared by every library
- `logs/worldkeeper.log` (the app's log: see [When something goes wrong](TROUBLESHOOTING.md#the-log)) and `logs/server.log` (whatever the server printed outside it; set aside as `server.log.1` at launch once it passes 1 MB)

To keep your data somewhere else, such as a synced folder, start the app with `WORLDKEEPER_DATA_DIR` set.

**Moving from the web version:** in the web version, use **Backups → Back up now** and download the backup file. Then, in the desktop app, use **Backups → Restore from a backup file**.

## Building

Build on each operating system you want to ship for. Tauri builds the window shell for the machine it runs on and does not cross-compile.

### Prerequisites

- Node.js 26 (the Active LTS, as in `.nvmrc`) and `npm install` completed. The Node version you build with is the one that ships inside the app, so `desktop:prepare` stops on one that isn't an LTS release (set `WORLDKEEPER_ALLOW_NON_LTS=1` to try one anyway). On Linux it strips the runtime's debug symbols, which keeps the app smaller (`WORLDKEEPER_NO_STRIP=1` keeps them).
- Rust (stable) through [rustup](https://rustup.rs).
- System libraries:
  - **Linux (Debian/Ubuntu):**
    ```bash
    sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev file
    ```
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Windows:** Microsoft C++ Build Tools and WebView2. WebView2 is preinstalled on Windows 10 and 11.

### Commands

```bash
npm run desktop:prepare   # bundle server + client + SQLite driver + Node runtime, and check that the bundle starts
npm run desktop:dev       # prepare, then open the app in development mode
npm run desktop:build     # prepare, then build installers into src-tauri/target/release/bundle/
```

Installers produced by `desktop:build`:

| OS | Installers |
| --- | --- |
| Linux | `.deb`, `.rpm`, `.AppImage` |
| macOS | `.app`, `.dmg` |
| Windows | `.msi`, `.exe` (NSIS) |

### Links

The app's window can't open new tabs, so links meant for one (the **Player View** button, links to GitHub) open in your default web browser. The player view opens at the app's local address, for example `http://127.0.0.1:<port>/player`.

### Trying a build

```bash
npm run desktop:smoke                                        # the app a release build made or installed on this system
node scripts/desktop-smoke.mjs path/to/the/app [arguments]   # or any build's program (a debug build, an AppImage)
```

`scripts/desktop-smoke.mjs` starts the real app on an empty data folder and checks it from outside: its server starts (the bundled Node.js, the database's native code); its window loads the app (the page's own script asks the server for `/api/meta`, and the server logs "the app's page has loaded" the first time); pages, scripts and the API answer; a record is written and read back and a backup made; the rules and the Oros worldbook that ship inside it are there; nothing was logged as an error; and closing the app stops its server. On Linux it needs a display (`xvfb-run -a`).

The release workflow runs it on every system before uploading anything: on Linux against the installed `.deb` and against the AppImage, on macOS against the program inside the `.app`, on Windows against the app as the installer installs it. A build that fails it is not published.

### Release builds

The **Desktop installers** workflow (`.github/workflows/desktop.yml`) builds on Linux, macOS and Windows, because Tauri doesn't cross-compile:

- **Pushing a version tag** (such as `v0.3.0`), or publishing a release that creates one, builds all three. When every build passes, their installers are attached to that tag's release.
- **Running it by hand** from the Actions tab builds any branch. Give it a release tag to build that tag and attach the installers to its release (for example, to add installers to a release made before this step existed).

Each run also keeps the installers as downloads on its Actions page for 90 days.

`desktop:prepare` writes:
- `desktop/build/server/` — `index.mjs` (one bundled file) plus the native `better-sqlite3` module
- `desktop/build/client/` — the built client
- `src-tauri/binaries/worldkeeper-node-<target-triple>` — the Node.js runtime

These are build outputs and are git-ignored.

### Size

Installers are about 50 MB (Linux `.deb` and `.rpm` were measured; other formats should be similar). The installed app is about 140 MB:
- the Node.js runtime: about 120 MB
- the server and client: about 16 MB

A later version could shrink this with Node's single-executable feature once it supports native modules cleanly.

### Updating itself ("Update and restart")

From v0.9.18 the app can replace itself with a newer release (Windows, macOS, and the Linux AppImage; a `.deb` or `.rpm` is the package manager's to upgrade).

How it works:

1. The page asks by going to `/__shell/update?tag=v1.2.3` on the local server. The shell sees that navigation (`on_navigation` in `src-tauri/src/lib.rs`), cancels it, and does the rest itself. No Tauri command is exposed to the page.
2. The shell reads `https://github.com/n1x-shell/Worldkeeper/releases/download/<tag>/latest.json`. The tag must be a plain version tag; the address is otherwise fixed in the shell.
3. It downloads the file that manifest names for this system and checks its signature against the public key in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). A file that doesn't match is refused.
4. It stops the local server (which closes the library), installs, and restarts.
5. What it is doing is written to `update-status.json` in the data folder; the server passes that to the page (`GET /api/update` → `install`).

**The update key.** Updates are signed with a key pair made by `tauri signer generate`. This has nothing to do with Apple or Microsoft code signing, and costs nothing.

- The **public** key is in `tauri.conf.json`. It is not a secret.
- The **private** key is the repository secret `TAURI_SIGNING_PRIVATE_KEY` (with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has a password). It is never in the repository; `tests/updateCheck.test.ts` checks that.
- Keep a copy of the private key somewhere safe. **If it is lost, apps already installed can't be updated in place any more** (a new key means a new public key, which only a manually installed version can bring). **If it leaks, whoever has it could sign an update those apps would accept**, though they would also need to get it onto this project's releases page.

**In the release workflow** (`.github/workflows/desktop.yml`): with the secret set, the build adds `--config '{"bundle":{"createUpdaterArtifacts":true}}'`, which makes a `.sig` beside each file the updater can install; the release job runs `scripts/updater-manifest.mjs` to write `latest.json` (each system's file, as GitHub names it, with its signature) and attaches it to the release. Without the secret the build and the release are exactly as before, and the app shows a link instead of the button (the server only offers the button for a release that has `latest.json`).

**Trying it locally** (how v0.9.18 was checked, on Linux):

1. Build two signed development AppImages, the second as a higher version: `TAURI_SIGNING_PRIVATE_KEY=… npm run desktop:build -- --debug --bundles appimage --config '{"bundle":{"createUpdaterArtifacts":true}}'`, then the same with `"version":"<higher>"` added to the config.
2. Put the second AppImage (named as GitHub would name it, spaces as dots) in a folder with a `latest.json` from `scripts/updater-manifest.mjs`, its `url` changed to `http://127.0.0.1:8765/…`, and serve the folder (`python3 -m http.server 8765`).
3. Run the first AppImage with `WORLDKEEPER_UPDATE_ENDPOINT=http://127.0.0.1:8765/latest.json`, and press **Update and restart** (give the data folder a `shared/update.json` that names the higher version as `installable`, so the button shows). `WORLDKEEPER_UPDATE_NOW=v<higher>` does the same without a hand on the mouse.
4. The AppImage file becomes the second one, byte for byte, and the app opens again. Change one byte of the served file and the update is refused ("The signature verification failed"), with the app file untouched and the app still running.

Both variables are read by development builds only (`cfg!(debug_assertions)`); a release build ignores them.

### Signing

The released installers are unsigned (the owner's decision, `docs/BETA_PLAN.md` §5); [Installing The Worldkeeper](INSTALL.md) tells GMs how to open them.

Unsigned builds work, but:
- **macOS** Gatekeeper and **Windows** SmartScreen will show warnings.
- To remove the warnings, configure signing in `src-tauri/tauri.conf.json` (see the Tauri documentation on code signing) before you distribute the app.

## Troubleshooting

- **The window shows "could not start":** open `logs/server.log` and `logs/worldkeeper.log` in the data folder. Common causes:
  - the app was built without `npm run desktop:prepare` — rebuild with it
- **A page says a library could not be opened or updated:** see [When something goes wrong](TROUBLESHOOTING.md).
- **Two windows open at once:** both use the same database. SQLite handles this safely, but stick to one window to avoid confusion.
- **Players on your network:** the desktop app only listens on this computer. Run `npm run start:player` from the repository for a LAN player server. A desktop toggle for this is planned.
