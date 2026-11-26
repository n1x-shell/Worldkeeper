# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, not through public GitHub issues or discussions: use the repository's **Security → Report a vulnerability** action ([GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository)). If that action is not there, open an issue that says only that you have something to report privately, and wait to be contacted.

Do not include unpublished exploits, access tokens or GM secrets in public reports. A useful report has: the version, the steps, what you expected and what happened, the impact, and a small made-up example.

## What the app trusts, and what it does not

The Worldkeeper is a program on the GM's own computer. It has three doors, and each trusts different people.

| Door | Who can reach it | What it asks for | What it answers |
| --- | --- | --- | --- |
| **The GM's app** (port 4310 from source, 43110 in the desktop app) | Only programs on the GM's own computer | Nothing: the computer is the lock | Everything |
| **The table** (port 4320), closed until the GM opens it | Anyone on the same network | A campaign's address (an 8-character code) for that campaign's handbook; a character's own code for its sheet | Only what the GM has revealed to players |
| **The GM's app on another device** (port 4330), closed until the GM opens it | Anyone on the same network | The password the GM set (kept as a salted scrypt hash); wrong tries are slowed, then locked out | Everything, once signed in |

**What follows from that:**

- **Anyone who can use the GM's computer as the GM can read and change the world.** The app does not defend against other programs or other people on that account. Nor does it encrypt the library: protect the disk and your backups as you would any private file.
- **The table's codes are addresses, not passwords.** They keep one group's handbook apart from another's and stop a guess from landing; they are not meant to keep out someone on your network who has been given, or has seen, the address. Everything the table serves is something you chose to show players.
- **The table and the GM's app on another device speak plain HTTP.** Use them on a network you trust (your home, a phone's hotspot), not on public Wi-Fi, and do not forward their ports to the internet. A snapshot for players who are elsewhere is what [publishing a handbook](docs/PLAYER_VIEW.md#static-handbook-on-github-pages) is for.

## Other websites, open in the same browser

A web browser will carry requests from any page it has open to any address, the GM's own computer included. So the app's servers check two things on every request, on all three doors (`server/src/guard.ts`, from v0.9.23):

1. **The address asked for must be one a stranger's name can't be.** An IP address, `localhost`, a bare name on your network (`gm-laptop`) or one ending in `.local`, `.lan`, `.home.arpa` and their kind is answered. A name with a dot in it that the public name service could answer for is refused, so a site that points a name of its own at `127.0.0.1` reads nothing ("DNS rebinding"). If you put the app behind a name of your own, list it: `WORLDKEEPER_ALLOWED_HOSTS=keeper.example.org`.
2. **A request that changes anything must come from the app's own pages.** The browser says where a request comes from; if that is another site, it is refused, so a page elsewhere cannot open your table, restore a backup over your world or change a record ("cross-site request forgery").

Before v0.9.23 neither check existed. **Versions up to 0.9.22 should not be left running while you browse sites you don't trust**; update to the current version.

Also:

- The app's pages carry a strict content security policy (no inline or remote scripts), and lore text is never rendered as HTML, so text in a record, a worldbook or an imported note cannot run code.
- Pictures are checked by what they are, not what they are called; SVG is refused (it can carry script). Files are served by a strict name from one folder.
- Archives (backups, worldbooks, notes, rules packs) are read entry by entry with every path checked; none is unpacked onto the disk as it stands.
- The desktop app's window only ever shows the app's own pages. A link elsewhere opens in your browser.
- The only requests the app makes by itself are the daily check for a newer version (switchable off) and, when you ask, publishing a handbook and fetching open content. See [Installing](docs/INSTALL.md#updating).

## Publishing a handbook

- Use a **fine-grained token limited to the one repository** the handbook goes to, with "Contents: Read and write" and "Pages: Read and write". It is kept in `shared/secrets.json` in your data folder with owner-only permissions: not in the library, so never in a backup, an export or a bug report's details.
- **Whatever is published is public** (on a free GitHub plan), and stays in the repository's history after it is removed. Check the preview before you publish. See [the risks](docs/PLAYER_VIEW.md#important-publication-risks).

## Updates

The desktop app installs only updates signed with this project's update key, downloaded from this project's releases. The installers themselves are not signed with a certificate from Apple or Microsoft; [Installing](docs/INSTALL.md) says what that means and how to check a download.

## Supported versions

Fixes go into the newest release. There is no long-term support line. See [What's new](docs/WHATS_NEW.md) and [Releases](https://github.com/n1x-shell/Worldkeeper/releases).
