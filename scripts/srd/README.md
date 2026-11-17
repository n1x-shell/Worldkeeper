# Building the built-in SRD 5.2.1 creatures, items and hazards

`shared/srd/creatures.json`, `items.json` and `hazards.json` are made from the **System Reference Document 5.2.1** PDF (Wizards of the Coast, CC-BY-4.0), read by font and position so every stat block, item and hazard is the SRD's own text and numbers:

```bash
python3 scripts/srd/parse_creatures.py SRD_CC_v5.2.1.pdf creatures.pdf.json   # stat blocks (Monsters A–Z, Animals)
python3 scripts/srd/parse_items.py     SRD_CC_v5.2.1.pdf items.pdf.json       # magic items and adventuring gear
python3 scripts/srd/parse_hazards.py   SRD_CC_v5.2.1.pdf hazards.pdf.json     # traps, poisons, magical contagions
npx tsx scripts/srd/book_metadata.ts <5etools data folder> <srd text> metadata.json
python3 scripts/srd/merge.py creatures.pdf.json items.pdf.json metadata.json \
  shared/srd/creatures.json shared/srd/items.json hazards.pdf.json shared/srd/hazards.json
```

The merge takes only facts from `metadata.json`, never text: each creature's environments (for the encounter generator), the price and weight of gear, the generic magic items' name patterns ("+1 Weapon" fits any weapon), and the kinds the SRD tables under one entry ("Belt of Hill Giant Strength" under "Belt of Giant Strength"). It checks every stat block (each modifier must fit its score) and reports anything incomplete.
