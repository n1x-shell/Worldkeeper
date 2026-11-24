# Writing a setting pack

[← README](../README.md) · [Quick Start](QUICKSTART.md) · [Full Features](FEATURES.md) · [Rules packs](RULES_PACKS.md)

A **setting pack** is a folder that brings a whole setting into a library: its realms, its own kinds of record and their templates, its records, maps, adventures and tables, the parts certain records play, and the optional systems (modules) it turns on. The Worldkeeper setting is one: everything in `packs/worldkeeper` is data the app reads, and nothing about that world is written into the app's own code. Yours works the same way.

A pack is for a setting you want to install, update and share as a whole. For a world you're writing yourself in the app, you don't need one: **Start your world** and **New** do everything here from inside the app.

## The smallest pack

```
packs/the-isle/
  pack.json
  lore/
    BCN-0001_The_Lamp.md
  templates/
    beacon.md
```

`pack.json`:

```json
{
  "id": "the-isle",
  "name": "The Isle",
  "version": "1.0.0",
  "description": "A lighthouse island at the edge of the map.",
  "licence": "CC BY 4.0",
  "realms": [{ "id": "the-isle", "name": "The Isle", "kind": "continent", "parent_id": "world", "color": "teal", "icon": "waves", "sort_order": 1 }],
  "types": [
    {
      "key": "beacon",
      "label": "Beacon",
      "plural": "Beacons",
      "prefix": "BCN",
      "icon": "flame",
      "pin": "site",
      "category": "place",
      "browse": ["landmarks"],
      "handbook": "places",
      "traits": { "place": true }
    }
  ],
  "roles": {},
  "modules": []
}
```

`lore/BCN-0001_The_Lamp.md` is a record in the library's own format: a header, a blank line, then the text.

```markdown
ID: BCN-0001
Name: The Lamp
Alternate names: None
Category: Beacon
Parent: None
Continent or realm: The Isle
Canon status: CANON
Source: The Isle pack
Tags: vis/player
Terrain: coastal

# The Lamp

## A first look

A white tower on the cliff. Its light has not gone out in three hundred years.

## Secrets (GM only)

The keeper died in the first winter. Something else lights it now.
```

Header lines after the nine standard ones (`Terrain` here) become the record's facts. A section whose heading ends in **(GM only)** is never shown to players, whatever is revealed. Link records with `@[Name]` or the archive style, `Name [ID]`.

`templates/beacon.md` is what **New ▸ Beacon** asks for (the same format as **Library → Templates**):

```markdown
Template for: beacon
Name: Beacon

# Beacon

A light that guides ships, or lures them.

## Facts

- **Terrain**: The ground around it, such as coastal or hill.
- **Keeper**: Who tends it. Example: Old Maren

## A first look

> Guidance: What a ship sees from the water at night.

## Secrets (GM only)

> Guidance: What the keeper hides.
```

## Installing and testing it

- **While you write it:** put the folder in the data folder, under `shared/packs/` (run from source, that's `data/shared/packs/the-isle`, or wherever `WORLDKEEPER_DATA_DIR` points; every library sees it, and each installs it or not; with **Technical details** on, **Settings → Installation** shows the data folder). It appears in **Library → Setting packs**. An installed copy takes precedence over a bundled pack with the same id.
- **Install** adds its realms, types, templates and roles, then its content. **Update** brings in a changed version. **Uninstall** removes what it shipped. Each makes a backup first.
- **What's yours stays yours.** Everything a pack ships is marked as the pack's (`pack_id`), and update and uninstall touch only that. Records the GM made, or edited, are kept. If the GM already has a record with an ID the pack uses, the update reports the clash and keeps the GM's record.
- **Two packs side by side** work: each updates and uninstalls without touching the other (see `tests/settingPacks.test.ts`, which installs a small test pack beside the Worldkeeper setting).
- New records in a pack's world go through **Canon Review** when the GM chooses so (**Settings → Canon**), which protects your text.

## pack.json

| Field                                   | What it is                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                    | Lower-case, unique. The folder's name.                                                                                                                                                                                                                                                                                                                                |
| `name`                                  | Shown in Setting packs and the wizard.                                                                                                                                                                                                                                                                                                                                |
| `version`                               | Shown when an update is available.                                                                                                                                                                                                                                                                                                                                    |
| `description`                           | One or two sentences.                                                                                                                                                                                                                                                                                                                                                 |
| `licence`                               | What others may do with it.                                                                                                                                                                                                                                                                                                                                           |
| `realms`                                | The realms it brings: `id`, `name`, `kind` (`realm` for a plane, `world`, `continent`, `domain`, `region_group`), `parent_id` (`world` is every library's world), `color` (blue, amber, green, violet, red, teal, rose, slate), `icon` (globe, mountain, flame, ghost, trees, waves, castle, sun, moon, snowflake, sparkles, compass, skull, crown) and `sort_order`. |
| `types`                                 | Its own kinds of record, as in the example. `prefix` is the ID prefix (two to five capitals). `category` is one of place, person, group, folk, myth, thing, creature, rule, adventure. `pin` is `site`, `area` or null (how it shows on maps). `traits` say what it is: `place`, `regionLike`, `holdable`, `group`, and the others in `shared/recordTypes.ts`.        |
| `roles`                                 | Which record plays which part, by ID: `world.overview`, `world.timeline`, the registers and the like (see the Worldkeeper pack). A role whose record is missing just hides that part.                                                                                                                                                                                 |
| `modules`                               | The optional systems it switches on (keys from `shared/modules.ts`). The GM can switch any off.                                                                                                                                                                                                                                                                       |
| `rulesPack`                             | A rules pack it brings and switches on at install.                                                                                                                                                                                                                                                                                                                    |
| `calendar`                              | `{ "file": "calendar.json", "worlds": ["world"] }`: its calendar (the format in `shared/calendar.ts`: months, days outside them, weekdays, moons, eras, festivals), for those worlds.                                                                                                                                                                                 |
| `renown`                                | The Renown module's ladder of ranks.                                                                                                                                                                                                                                                                                                                                  |
| `importProfile`, `cleaning`, `handbook` | For a pack whose players also have an archive of their own: how to read that archive's folders and wording, which source notes to hide outside debug mode, and which sections the published handbook leaves out. Optional; see the Worldkeeper pack.                                                                                                                  |

## What else a pack can hold

Each folder is optional. The Worldkeeper pack has all of them, and is the fullest example of each format.

| Folder                    | What it brings                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lore/`                   | Records (`.md`, any sub-folders), plus `links.json` (curated links between records), `mysteries.json` (mysteries with their secrets and clues), `errata.json` (corrections to wording a library already has) and a timeline.                                                                                                                  |
| `templates/`              | A template for each of its types (and any core type it wants to ask more of).                                                                                                                                                                                                                                                                 |
| `player-text/`            | Rumours and player-facing text.                                                                                                                                                                                                                                                                                                               |
| `maps/`                   | A map image and `<name>.pins.json` (its name, image, realm, scale and pins by record ID, in pixels), with optional `.routes.json` and `.regions.json`.                                                                                                                                                                                        |
| `adventures/`             | Ready-to-run adventures: a header (`Title`, `Arc`, `Hook`, `Levels`, `Linked`), then sections (Premise, Hook, Stakes, Clues, Encounters, Rewards…) and scenes.                                                                                                                                                                                |
| `tables/`                 | Random tables: `# Encounters: Place, levels 1 to 4`, a `Region:` line with the region's ID, then numbered rows.                                                                                                                                                                                                                               |
| `treasure/`               | Treasure pools by region and tier.                                                                                                                                                                                                                                                                                                            |
| `statblocks/`             | Stat blocks for its creatures and people, by record ID (`{ "statblocks": { "BCN-0001": { "name": …, "meta": …, "ac": …, "hpAvg": …, "cr": … } } }`; the fields are in `server/src/repo/statblocks.ts`). Shown on each record's page and in the encounter tracker while the pack is installed; a GM's own stat block for a record comes first. |
| `encounters/terrain.json` | Terrain for its places, where their records don't give it.                                                                                                                                                                                                                                                                                    |
| `return/omens.json`       | The stages of the clock module, if the pack uses it.                                                                                                                                                                                                                                                                                          |

## Good practice

- **Write records the way the GM will read them:** short sections, a first look, what anyone knows, then the GM-only truth. Give places **Terrain**, **Danger** and **Wealth** facts, so encounter tables and treasure work for them.
- **Choose a prefix no one else uses**, and four-digit IDs (`BCN-0001`), so they don't meet records a GM makes or another pack's.
- **Keep rules text out unless you may share it.** Creatures, items and spells belong in a rules pack, under a licence that allows it (the SRD's CC BY 4.0, or your own). Never ship text from a book you don't own the rights to.
- **Bump `version` for each release** so GMs see the update.
