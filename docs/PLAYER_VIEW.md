# Player View & Publishing

[← README](../README.md) · [Quick Start](QUICKSTART.md)

Worldkeeper separates GM-managed material from material deliberately revealed to players. Its player endpoints generate a dedicated player-safe projection, rather than sending every field to a browser and hiding secret elements with CSS. This is a security design, not a guarantee that every possible disclosure bug has been eliminated.

## Local player view

Open <http://127.0.0.1:4310/player> on the DM machine, or select **Player View** in the application. This is useful for inspecting what the player interface displays, but **the local DM server also has DM routes**. Do not treat this URL alone as an access control boundary when making the server reachable over a network.

## Player-only LAN server

Run:

```bash
npm run start:player
```

The separate process listens by default on port `4320` on all interfaces (`0.0.0.0`) and mounts no DM routes. Players on the same trusted network can open `http://<your-computer>:4320`.

**Network precautions:** LAN exposure is not authentication. Use a trusted network and firewall restrictions; do not forward the port to the public internet. The DM server should remain bound to `127.0.0.1`. Do not set its `HOST` to `0.0.0.0` on a shared or untrusted network.


### Character sheets

Each character in a campaign has a full D&D 2024 character sheet with a portrait, and a page for the world's own rules: their named memories, their true name and who knows it, and their Thinning track. On the GM's party screen, the sheet's **GM only** tab shows the player's private code and a link, `http://<your-computer>:4320/player/me/<code>`. A player opens that link (or **My Character** in the player menu, then types the code) to keep their sheet up to date.

- Players keep their whole sheet up to date, portrait included, except their level and Thinning, which the GM sets. The GM can edit everything, for a player who would rather not.
- The sheet's **Log** tab lists every change, who made it (the player or the GM) and when. Changes to the GM's setting mechanics, world ties and notes are never shown to players, and a player's save never changes them.
- Players can add memories, reword the ones they still have, and strike one when their Thinning goes up. A struck memory stays struck. The GM can restore one if the table agrees.
- On the table server, the **Make a Character** builder's **Send to my sheet** button fills in the sheet from a finished build. **Print** on My Character prints the sheet on two pages, laid out like the official one.
- A character's sheet is visible only to whoever has its code, and to the GM. **New code** stops an old link working.
- The code is the only protection, so the same network precautions apply.
- Rules from the GM's imported rules packs (see [Rules packs](RULES_PACKS.md)) appear in sheets and the builder on the table server. The published handbook's builder has only the SRD, and nothing if the GM turned the SRD off.
- Character sheets are never part of the published handbook, which can't save anything, so it has no **My Character** item. Its builder still makes and prints a complete character.

## What players can see

On a record's **Player view** tab, enable **Players know this record exists** before allowing the record to appear. Then select which material is allowed:

- The GM-authored player summary.
- Facts explicitly revealed through the application.
- Sections deliberately selected for publication, excluding sections identified as GM-only or secret.

References to unrevealed records are designed to be removed. Other player-visible content includes only maps, markers, regions, quests and session recaps that meet publication controls. **Inspect maps, marker labels, relationship names, links, recaps, and uploaded images manually before publishing**, as those surfaces may reveal information indirectly.

## Reveal during a live session

1. Open the current live session.
2. Select the relevant record.
3. Choose to reveal existence, a permitted section, or a custom fact in your own words.
4. Review the exact material players will receive.
5. Confirm. The event is logged in the session and can appear in the recap.

Do not copy secret text into an unrestricted player-summary field. A GM-only heading prevents that section from being selected, but it cannot judge the intent of newly written prose.

## Static handbook on GitHub Pages

The static handbook is a published **snapshot**, not a continuously synchronized live application.

1. Create a dedicated repository for player publication, preferably separate from your development repository.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new), restricted to that repository, with only the repository permissions required by the app's publisher (the documented setup uses **Contents** and **Pages**, read/write).
3. Open **Publish for Players** and enter `owner/repository` plus the token.
4. Review the player-visible material and select **Publish to GitHub Pages**.
5. Verify the live site in a private browsing session before distributing the link.
6. Re-publish after subsequent sessions when you want to update the snapshot.

Worldkeeper uploads the static site to `gh-pages`, enabling GitHub Pages when its permissions and repository settings allow it. Only changed files are uploaded on subsequent publishes. The application also offers **Download as ZIP** for another static host.

### Important publication risks

- **Public access:** GitHub Pages content is accessible to people beyond your intended group unless the hosting platform provides and you configure access restrictions. A hard-to-guess URL is not access control. Check GitHub's current plan and Pages visibility requirements before relying on private-repository behavior.
- **Git history:** Removing a secret from a later build does not automatically erase it from prior Git commits, caches, forks or downloaded snapshots. Treat anything published as potentially permanent.
- **Review indirect disclosures:** A marker label, image filename, map title, or a quest recap can reveal information even when the corresponding encyclopedia record is unpublished.
- **Secrets and credentials:** Publishing credentials are stored in `secrets.json` in the Worldkeeper data directory, outside the primary database and normal world exports. Protect filesystem access to this file and revoke a compromised token promptly.
- **No automatic update:** Players see the last successfully published snapshot, not necessarily the latest in-session changes.

For more on source records and safe imports, read [Data & Backups](DATA.md). To report a suspected disclosure vulnerability, see [Security Policy](../SECURITY.md).
