# Final Cross-Reference and Canon Audit: v8

**Scope:** Full integrity review of the 380 Markdown files in the v7 archive, compared with both approved continent bibles and the standing implementation policies. This is an organizational audit; it is **not** an independent re-verification of every narrative sentence or 2024 rules mechanic.

## Executive findings

- Archived Markdown files scanned: **380**.
- Unique, standalone canonical IDs (excluding worked examples): **331**.
- Standalone IDs repeated by training examples: **4** (`CON-001, CON-301, SET-301, VLT-301`).
- IDs referenced but recorded only within larger world documents: **18**.
- Other IDs referenced without a confirmed standalone/embedded entry: **16**.
- Standalone pages lacking one or more required metadata fields: **0**.
- Parent links pointing to IDs without standalone/embedded targets: **0**.

## Canon and source boundaries

- The source of truth remains `References/Aetheris_Setting_Bible.md` and `References/Kaelmar_Setting_Bible.md` plus the owner-approved reconciliation decisions.
- No proposed historical, cosmological or gameplay change was applied during this audit.
- The prebuilt `References/` copies and `08_Amsel_Lore_Foundation/Worked_Examples/` are **not** Lore entries to create in the application. `GDE-901` lives in the reference implementation guide and should not be mistaken for missing world lore.
- The published files remain **manual-entry Markdown**, not a native Amsel Suite export.

## Issue A: worked-example duplicate IDs (non-canon file duplicates)

### `CON-001`
- `01_Aetheris/Aetheris_Overview.md`
- `08_Amsel_Lore_Foundation/Worked_Examples/CON-001_Aetheris.md`
**Action:** Enter the fully populated encyclopedia file only. The `Worked_Examples` copy is an instructional reference, not a second world record.

### `CON-301`
- `02_Kaelmar/Kaelmar_Overview.md`
- `08_Amsel_Lore_Foundation/Worked_Examples/CON-301_Kaelmar.md`
**Action:** Enter the fully populated encyclopedia file only. The `Worked_Examples` copy is an instructional reference, not a second world record.

### `SET-301`
- `02_Kaelmar/Ashvale_and_the_Rift/SET-301_Ashvale.md`
- `08_Amsel_Lore_Foundation/Worked_Examples/SET-301_Ashvale.md`
**Action:** Enter the fully populated encyclopedia file only. The `Worked_Examples` copy is an instructional reference, not a second world record.

### `VLT-301`
- `02_Kaelmar/Vaults/VLT-301_The_Seed_Vault.md`
- `08_Amsel_Lore_Foundation/Worked_Examples/VLT-301_Seed_Vault.md`
**Action:** Enter the fully populated encyclopedia file only. The `Worked_Examples` copy is an instructional reference, not a second world record.

## Issue B: multiple IDs representing overlapping objects

**The Memory-House**
- `FAC-311`: `02_Kaelmar/Factions/FAC-311_The_memory_house.md`
- `LOC-302`: `02_Kaelmar/Sites/LOC-302_The_Memory_House.md`

**The Root Core**
- `FAC-310`: `02_Kaelmar/Factions/FAC-310_The_Root_Core.md`
- `NPC-302`: `02_Kaelmar/NPCs/NPC-302_The_Root_Core.md`

**Kaelholm**
- `FAC-301`: `02_Kaelmar/Factions/FAC-301_Kaelholm.md`
- `SET-302`: `02_Kaelmar/Settlements/SET-302_Kaelholm.md`

**The Shadowed Sanctum**
- `LOC-505`: `03_Ethereal_Realm/Sites/LOC-505_The_Shadowed_Sanctum.md`
- `LOC-015`: `01_Aetheris/Legendary_Sites/LOC-015_The_Shadowed_Sanctum.md`

**High-priority:** The two *Shadowed Sanctum* pages both identify the Hidden Ones’ true stronghold. The source’s Ethereal regional table places it in the Citadel of the Hidden. **Proposed organizational correction, not applied:** use `LOC-505` as the authoritative page and treat `LOC-015` as a redirect/legacy alias. Do not delete the legacy ID until every link is repointed.

The Kaelholm, Root Core, and memory-house pairs can reflect legitimate distinct views (settlement vs. political power, being vs. faction entry, location vs. active mind). Keep them separate for now, but cross-link them and avoid duplicating descriptive lore.

## Issue C: embedded but non-standalone IDs

These are not actually broken links to absent *content*, but they are **not independent Amsel pages** yet. They must be found within the parent index or extracted.

- `COS-901` → `00_World/03_World_Cosmology.md`
- `COS-902` → `00_World/03_World_Cosmology.md`
- `COS-903` → `00_World/03_World_Cosmology.md`
- `COS-904` → `00_World/03_World_Cosmology.md`
- `COS-905` → `00_World/03_World_Cosmology.md`
- `COS-906` → `00_World/03_World_Cosmology.md`
- `COS-907` → `00_World/03_World_Cosmology.md`
- `COS-908` → `00_World/03_World_Cosmology.md`
- `COS-909` → `00_World/03_World_Cosmology.md`
- `COS-910` → `00_World/03_World_Cosmology.md`
- `COS-911` → `00_World/03_World_Cosmology.md`
- `COS-912` → `00_World/03_World_Cosmology.md`
- `COS-913` → `00_World/03_World_Cosmology.md`
- `COS-914` → `00_World/03_World_Cosmology.md`
- `COS-915` → `00_World/03_World_Cosmology.md`
- `LOC-901` → `00_World/05_World_Geography.md`
- `LOC-902` → `00_World/05_World_Geography.md`
- `REG-901` → `00_World/05_World_Geography.md`

## Issue D: referenced IDs with no canonical standalone page

An ID mentioned in another page or in a planning guide does not by itself prove that an encyclopedia entry was created. Check the source bible before making it.

- `DEI-901`: 3 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-902`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-903`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-904`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-905`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-906`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-907`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-908`: 1 reference file(s); example: `00_World/03_World_Cosmology.md`
- `DEI-909`: 3 reference file(s); example: `00_World/03_World_Cosmology.md`
- `FAC-007`: 5 reference file(s); example: `00_World/03_World_Cosmology.md`
- `HIS-901`: 1 reference file(s); example: `References/Amsel_Suite_Implementation_Guide.md`
- `HIS-902`: 1 reference file(s); example: `00_World/05_World_Geography.md`
- `HIS-910`: 2 reference file(s); example: `00_World/05_World_Geography.md`
- `HIS-912`: 2 reference file(s); example: `00_World/05_World_Geography.md`
- `HOOK-001`: 2 reference file(s); example: `01_Aetheris/README_Aetheris_Regional_Pack.md`
- `PPL-008`: 2 reference file(s); example: `01_Aetheris/Peoples_and_Callings/Moonborn_and_Stormborn.md`

### Priority interpretation

- **`FAC-007` (Hidden Ones):** substantial established lore exists, but no standalone faction file with that ID was found. This is a content-index gap.
- **`DEI-901`–`DEI-909` (pantheon):** the world cosmology has the table of deities, but the planned nine individual god pages have not been created.
- **`HIS-902`, `HIS-910`, `HIS-912`:** these event IDs are referenced in geography and mystery pages without standalone timeline entries.
- **`HOOK-001`:** starter adventure hook belongs to the Tome phase and is not yet a standalone document.
- **`PPL-008`:** appears in a supplemental peoples list, but the intended standalone entry is not present.

## Issue E: metadata and parent-child integrity

- Several indexes use extended IDs such as `CON-001-DOM`, `REG-001-PEOPLE`, and `HOOK-001-INDEX`. These are valid project-local identifiers but differ from the three-digit numeric convention; standardize them only if desired, without overwriting established primary IDs.
- The foundation templates contain placeholder `ID: [UNDEFINED: check source]` fields. These are templates, not duplicate canonical records.

- All identified standalone records contain the required metadata fields.
- All explicit parent IDs resolve to a canonical or embedded entry.

## Preserved unknowns

- The missing twelfth shard, Watchers’ motives, Forgotten One’s personal identity, and uncharted geographic coordinates remain UNDEFINED.
- The 927 AB events from *Persistence Through Ruin* remain a possible future, not a settled outcome.
- No unverified official monster stat blocks were certified.

## Remediation order

1. In Amsel, enter each full encyclopedia page **once**. Keep worked examples out of the live Lore tree.
2. Decide the Shadowed Sanctum legacy alias before linking the duplicate entries.
3. Create the nine deity pages and Hidden Ones entry from the existing source bibles.
4. Extract world cosmology and geography embedded IDs as individual pages when the hierarchy requires them.
5. Build historical event pages and the Tome hook records in their respective phases.
6. Run a second audit after the remaining Lore pages are materialized, then proceed to Tome.

## Files created in v8

- `07_Continuity/Final_Cross_Reference_and_Canon_Audit_v8.md` (this report)
- `07_Continuity/Canonical_Entry_Locator_v8.md` (lookup table)
- `07_Continuity/Amsel_Preflight_Checklist_v8.md` (practical entry checklist)

**Approval needed:** No lore change was made. A future choice is required only for the Shadowed Sanctum canonical-page/legacy-ID handling and whether to consolidate the other multi-role entries.
