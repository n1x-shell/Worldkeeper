# When something goes wrong

Your worlds are files on your own computer, and the app keeps copies of them. Whatever happened, start here:

- **Don't keep working in a library that looks wrong.** Close the app and read on.
- **Your backups are there.** The app makes one each day you use it, one before every import, and one before any update changes a library. See [Getting your world back](#getting-your-world-back).

## Reporting a bug

A bug report with the app's details is the fastest way to get something fixed.

1. In the app, open **Settings → Help and bug reports** and press **Copy details for a bug report**. If a screen broke and shows "This screen hit an error", the same button is on that screen.
2. Open a [new issue](https://github.com/n1x-shell/Worldkeeper/issues/new/choose), choose **Something went wrong**, say what happened and what you were doing, and paste the details where the form asks for them.

**What the details hold:** the app's version, your system (Windows, macOS or Linux and its version), how big the library is (how many records, campaigns, pictures and backups, as numbers), which parts are switched on, and the newest lines of the app's log. Press **See what is copied** to read them before you send anything.

**What they never hold:** names, text or pictures from your world, your library's name, or what you typed or searched for. The name of your home folder is replaced with `~` in every path.

**Nothing is sent by the app.** It copies text; you paste it. Bug reports are public, so don't attach a library or a backup to one.

## The log

The app writes what it does, and every error it didn't expect, to a small text file on your computer. An error is logged with the kind of request it happened in (for example `POST /api/entities`) and where in the code it happened, never with what was sent.

| How you run the app | The log folder |
| --- | --- |
| Windows | `%APPDATA%\app.worldkeeper.desktop\logs\` |
| macOS | `~/Library/Application Support/app.worldkeeper.desktop/logs/` |
| Linux | `~/.local/share/app.worldkeeper.desktop/logs/` |
| From source | `data/logs/` in the project folder (or `logs/` in your `WORLDKEEPER_DATA_DIR`) |

In the desktop app, **Settings → Help and bug reports → Show the log files** opens the folder.

- `worldkeeper.log` is the app's log. It is kept to about 1 MB; when it is full it becomes `worldkeeper.log.1` and a new one starts.
- `server.log` (desktop app only) holds whatever the app's server printed outside its own log: in practice, why it failed before it could start.
- `table-server.log` is written only if you run the separate players' server from source (`npm run start:player`).

The log is not part of any backup, export or worldbook.

## The app opens, but shows "The Worldkeeper could not start"

The window says the local server did not answer, and names the log folder. Open `server.log` and `worldkeeper.log` there: the last lines say why.

- Another copy of the app may still be running from before. Close it (or restart the computer) and open the app again.
- Security software may be blocking the app's own server (it is a program called `worldkeeper-server` beside the app, and only ever answers on your own computer). Allow it.
- If neither helps, [report it](#reporting-a-bug) with the last lines of both files. The app can't copy the details for you when it hasn't started.

## "This library could not be updated" or "could not be opened"

The app shows this page instead of your world when a library can't be opened. **Nothing has been changed**: an update of a library either goes through completely or not at all, and a copy was made first.

The page says what to do for each case, and has the details for a bug report at the bottom (select and copy them). From it you can try again or open another library.

- **It needs a newer version:** the library was last opened by a newer version of the app. [Install the newest version](INSTALL.md).
- **It could not be updated:** install the version you had before to keep working (it opens the library as it is), and please report it.
- **It could not be opened:** check that the disk isn't full and that no other copy of the app is open; otherwise restore a backup, below.

## Getting your world back

In the app: **Library → Backups** lists every backup of the open library with when and why it was made. **Restore** puts the library back exactly as it was then (the app first makes a backup of how it is now, so restoring can itself be undone). See [Backups](DATA.md#backups).

If the library won't open at all:

1. Find the backups of the library that won't open. They are files ending in `.wkbackup.zip`, in your data folder under `libraries/<the library's folder>/backups/`. The page the app shows names the library's folder.
2. Make a new, empty library to restore into (**Library → Libraries → New library**) and open it. If the app has no library it can open, the page it shows offers your other libraries; if there are none, close the app, move the broken library's folder out of `libraries/` to somewhere safe (its backups are inside it), and open the app again: it opens an empty library in its place.
3. In the new library, open **Library → Backups**, and under **Restore from a backup file** pick the newest backup from before the problem.

A backup made before an update is marked "before an update". If you went back to an older version of the app, that is the one to restore.

## "Update and restart" didn't work

The app says why in **Settings → Updates**, and nothing was installed: an update is only ever installed whole. You can try again, or download the new version from the [releases page](https://github.com/n1x-shell/Worldkeeper/releases) and install it over the old one ([Updating](INSTALL.md#updating)). You never need to uninstall first.

## "This address isn't one the app answers to"

The app answers when it is opened by an IP address, by `localhost`, or by a name that only your own network has (`gm-laptop`, `gm-laptop.local`). It refuses a name the wider internet could answer for, because that is how another website would reach it. If you have deliberately put the app behind a name of your own, start it with that name listed: `WORLDKEEPER_ALLOWED_HOSTS=keeper.example.org`.

"That request didn't come from the app's own pages" means something other than the app's own page tried to change something. If you see it while using the app normally, please [report it](#reporting-a-bug).

## Players can't open the table

- They need to be on the same network as your computer (the same Wi-Fi), and the table must be open: the campaign's overview shows its address while it is.
- The first time, Windows or macOS asks whether to let the app accept connections. Allow it (on Windows, for private networks).
- Guest Wi-Fi networks often stop devices from seeing each other. Use the main network, or a phone's hotspot.

More in [the players' view](PLAYER_VIEW.md#player-only-lan-server).
