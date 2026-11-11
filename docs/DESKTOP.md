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
- Everything works offline. Nothing is sent anywhere.

### Where your data lives

| OS | Folder |
| --- | --- |
| Linux | `~/.local/share/app.worldkeeper.desktop/` |
| macOS | `~/Library/Application Support/app.worldkeeper.desktop/` |
| Windows | `%APPDATA%\app.worldkeeper.desktop\` |

That folder contains:
- `worldkeeper.db`
- `uploads/`
- `backups/`
- `logs/server.log`

To keep your data somewhere else, such as a synced folder, start the app with `WORLDKEEPER_DATA_DIR` set.

**Moving from the web version:** in the web version, use **Backups → Back up now** and download the backup file. Then, in the desktop app, use **Backups → Restore from a backup file**.

## Building

Build on each operating system you want to ship for. Tauri builds the window shell for the machine it runs on and does not cross-compile.

### Prerequisites

- Node.js 20+ and `npm install` completed. The Node version you build with is the one that ships inside the app.
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

### Signing

Unsigned builds work, but:
- **macOS** Gatekeeper and **Windows** SmartScreen will show warnings.
- To remove the warnings, configure signing in `src-tauri/tauri.conf.json` (see the Tauri documentation on code signing) before you distribute the app.

## Troubleshooting

- **The window shows "could not start":** open `logs/server.log` in the data folder. Common causes:
  - a damaged database — restore the newest file from `backups/`
  - the app was built without `npm run desktop:prepare` — rebuild with it
- **Two windows open at once:** both use the same database. SQLite handles this safely, but stick to one window to avoid confusion.
- **Players on your network:** the desktop app only listens on this computer. Run `npm run start:player` from the repository for a LAN player server. A desktop toggle for this is planned.
