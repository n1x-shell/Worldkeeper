# Field, Tag, and ID Standard

**Status:** IMPLEMENTATION DESIGN; no claims about the installed Amsel app's exact controls or import behavior.

## Standard metadata order

1. `ID:` stable reference ID, never recycled.
2. `Name:` published in-world name or canonical page label.
3. `Alternate names:` other source-supported names, or None.
4. `Category:` one entry type.
5. `Parent:` parent page name followed by its ID in brackets.
6. `Continent or realm:` Aetheris / Kaelmar / Ethereal Realm / World.
7. `Canon status:` CANON, PROPOSED, CONFLICT, UNDEFINED, BELIEF, RUMOR, or SECRET as appropriate.
8. `Source:` A: section; K: section; or documented owner decision.
9. `Tags:` comma-separated lowercase tags.

Additional fields appear under these nine in a fixed order by template. Use `UNDEFINED` for missing source-backed values; never use an invented placeholder as fact.

## Stable ID families

- World `WLD`; continent or realm `CON`; region `REG`; site `LOC`; settlement `SET`; vault `VLT`; vault key `KEY`.
- NPC `NPC`; faction `FAC`; cult `CLT`; family `FAM`; people `PPL`; calling `CAL`; deity `DEI`.
- Cosmology `COS`; history `HIS`; shard `SHD`; artifact `ART`; item `ITM`; creature `CRE`; rule `RUL`; ethereal domain `ETH`; shared system `SYS`; adventure hook `HOOK`; decision `DEC`.
- Number ranges: `001–299` Aetheris; `300–499` Kaelmar; `500–599` Ethereal; `900–999` shared/world. Existing IDs in older files take precedence over these conventions.

## Tag families

`realm/world`, `realm/aetheris`, `realm/kaelmar`, `realm/ethereal`.

`cat/world`, `cat/continent`, `cat/region`, `cat/settlement`, `cat/landmark`, `cat/building`, `cat/vault`, `cat/key`, `cat/npc`, `cat/faction`, `cat/cult`, `cat/people`, `cat/deity`, `cat/religion`, `cat/cosmology`, `cat/history`, `cat/artifact`, `cat/shard`, `cat/item`, `cat/creature`, `cat/rule`, `cat/ethereal-domain`, `cat/system`, `cat/hook`, `cat/index`, `cat/secret`.

`status/canon`, `status/proposed`, `status/conflict`, `status/undefined`, `status/rumor`, `status/belief`, `status/secret`.

`vis/player` and `vis/gm`; `mech/official`, `mech/homebrew`, `mech/outside-core`.

Faction tags, era tags, and magic tags follow the existing Amsel Suite Implementation Guide. Tags are text until actual Lore behavior is verified.

## Connections

- Hierarchy = where it sits in the reference tree.
- Tags = filtering categories, provenance and visibility.
- Cross-reference = relation to another entity, written `Name [ID]` until manually linked.
- A relationship doesn't create a second NPC or place page.

## Template use

- `Templates/TEMPLATE_*.md` are editorial starting points, not canon.
- The worked examples demonstrate consistent field ordering and narrative separation.
- Keep in-world beliefs separate from GM truth.
