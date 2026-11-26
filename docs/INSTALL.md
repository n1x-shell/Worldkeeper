# Installing The Worldkeeper

The desktop app is one download for each system, from the project's [releases page](https://github.com/n1x-shell/Worldkeeper/releases). Open the newest release and pick the file for your computer:

| Your computer | The file to download |
| --- | --- |
| Windows 10 or 11 | `The.Worldkeeper_<version>_x64-setup.exe` (or the `.msi`, if your workplace prefers one) |
| A Mac with Apple silicon (M1 or later) | `The.Worldkeeper_<version>_aarch64.dmg` |
| Linux, Debian or Ubuntu | `The.Worldkeeper_<version>_amd64.deb` |
| Linux, Fedora or openSUSE | `The.Worldkeeper-<version>-1.x86_64.rpm` |
| Linux, anything else | `The.Worldkeeper_<version>_amd64.AppImage` |

There is no installer for Macs with Intel processors; on one, [run it from source](../README.md#run-from-source).

## The installers are not signed

Signing an app means paying Apple and a certificate company each year to vouch for it. This project doesn't, so **Windows and macOS will warn you the first time you open it**. The warning says the system doesn't know who made the app; it doesn't mean anything was found wrong with it. The steps below are each system's own way of opening such an app.

If you would rather not, you can always [run it from source](../README.md#run-from-source), where you can read every line first.

### Windows

1. Run the `-setup.exe`. A blue box says **Windows protected your PC**.
2. Click **More info**.
3. Click **Run anyway**, and follow the installer.

Your browser may also ask whether to keep the download: choose **Keep**. The first time the app opens the table for your players, Windows asks whether to allow it on your network: allow it for private networks only.

### macOS

1. Open the `.dmg` and drag **The Worldkeeper** into **Applications**.
2. Open it from Applications. macOS says it can't be opened because it can't check it for malicious software. Click **Done** (not "Move to Bin").
3. Open **System Settings → Privacy & Security** and scroll down to **Security**. Beside "The Worldkeeper was blocked…", click **Open Anyway**, then confirm with your password or Touch ID.
4. Open it again from Applications and choose **Open**. From then on it opens like any app.

On macOS 14 and earlier, you can instead hold **Control**, click the app in Applications, choose **Open**, and then **Open** again.

If macOS says the app **"is damaged and can't be opened"**, it isn't: that message is what Apple silicon Macs show for a downloaded app with no signature. Open **Terminal** and run this, then open the app again:

```bash
xattr -dr com.apple.quarantine "/Applications/The Worldkeeper.app"
```

### Linux

- `.deb`: `sudo apt install ./The.Worldkeeper_<version>_amd64.deb`
- `.rpm`: `sudo dnf install ./The.Worldkeeper-<version>-1.x86_64.rpm`
- `.AppImage`: make it executable (`chmod +x The.Worldkeeper_*.AppImage`) and run it.

## Checking the download

Each file on a release page has its **SHA-256** shown beside it (click the copy icon next to the file's name). To check that what you downloaded is that file:

- **Windows** (PowerShell): `Get-FileHash .\The.Worldkeeper_<version>_x64-setup.exe`
- **macOS**: `shasum -a 256 ~/Downloads/The.Worldkeeper_<version>_aarch64.dmg`
- **Linux**: `sha256sum The.Worldkeeper_<version>_amd64.deb`

The long string it prints should be the same as the one on the release page.

## Updating

**In the app:** when a newer version is out, a note appears in the top bar. Open **Settings → Updates** and choose **Update and restart**. The app downloads the new version from this project's releases, checks that it is the real one, installs it and opens again. You don't download or run anything yourself, and Windows and macOS don't ask about an unsigned app again.

**By hand:** you can always download the new version and install it over the old one, the same way as the first time. **You never need to uninstall first.** This is the way for the Linux `.deb` and `.rpm` (your package manager upgrades them) and for a release that has no in-app update.

Either way, your worlds are not in the app: they are in your data folder, and an update never replaces them.

| System | Your data folder |
| --- | --- |
| Windows | `%APPDATA%\app.worldkeeper.desktop\` |
| macOS | `~/Library/Application Support/app.worldkeeper.desktop/` |
| Linux | `~/.local/share/app.worldkeeper.desktop/` |

- The app checks once a day whether a newer version exists and shows a note when one does (**Settings → Updates**; you can turn the check off). It never downloads or installs anything until you choose **Update and restart**.
- An update is only installed if it carries this project's signature. A file that was changed on the way, or that came from anywhere else, is refused and nothing is installed.
- If the table is open, your players are cut off while the app restarts. Update between sessions.
- When a new version needs to change how a library is stored, it makes a backup of that library first. See [Updating the app](DATA.md#updating-the-app).
- To go back to an older version, install it over the new one. A library the newer version has already updated won't open in the older one; restore the backup made before the update (**Library → Backups**, the one marked "before an update") from the older version.

## Removing it

Uninstall it like any app (Windows: **Settings → Apps**; macOS: drag it from Applications to the Bin; Linux: your package manager). Your data folder stays, so your worlds are still there if you install it again. Delete that folder too if you want everything gone; make a backup first (**Library → Libraries → Back up everything**).

## What these steps were checked on

The installers are built automatically for each release on GitHub's Windows, macOS (Apple silicon) and Ubuntu machines. The steps above are each system's standard ones for an unsigned app; the wording of the systems' own dialogs changes between versions. If yours differs, please [open an issue](https://github.com/n1x-shell/Worldkeeper/issues).
