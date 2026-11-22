# Putting the world map to scale (superseded)

**Status:** superseded. The owner preferred to keep every pin where it was drawn, and to change the travel times instead; that is what was applied in v0.3.12 (DEC-910). Kept as the record of the reasoning.
**Owner's choice (21 November 2026):** "the known world", at about 2,700 miles across, keeping the canon crossing of the Black Tides.

## 1. Why the map doesn't add up today

Three things were made separately and never agreed:

- **The painted map** (`packs/worldkeeper/maps/world-map.webp`), whose coastlines and painted cities can't move.
- **Our map data:** the 60 pins, 35 routes and 11 region outlines in `packs/worldkeeper/maps/`. These are ours and can move.
- **The lore's travel times and distances:** *Distances in Aetheris* [RUL-651], *Crossing the Black Tides* [RUL-652], the route labels, and the handbook's player text.

RUL-651 even says so: "The world map is not drawn to scale. Route labels (travellers' times) remain the measure." Measured on the map today, only 6 of the 34 timed routes match their stated time, even within a factor of two. The worst are short hops: the Ashvale villages are "a day's walk" from Ashvale but sit 350 to 730 miles away on the map.

## 2. The scale

**0.8 miles to a pixel of the map image, so the map is about 2,700 miles across.** The map shows **the known world**: two continents with the sea between them, about the size of Europe together. The world itself is larger, and the Far Places lie beyond the frame.

How the canon distances fit at this scale:

| Canon distance | Lore | On the map at this scale | Verdict |
| --- | --- | --- | --- |
| The Eternal Veil to Kaelholm (RUL-652) | about 700 miles, two weeks by ship | 671 miles (Mothhaven to Kaelholm) | **Keeps** |
| Kaelholm to Ashvale (route) | about 1,500 km (930 miles) | 793 miles (1,280 km) | Text changes to "about 1,300 km (800 miles)" |
| Kaelmar across (RUL-651) | about 1,500 km | about 1,030 miles (1,650 km) | **Keeps** ("about") |
| Aetheris across (RUL-651) | about 1,200 km (750 miles) | about 1,300 miles (2,100 km) | Text changes: the painted continent is far wider than the canon figure |
| Hollow Refuge to each capital (RUL-651) | about two weeks, 340 miles | 344 to 595 miles | Text changes per capital (§4.3). The capitals are painted |
| The Hollow Marches across (RUL-651) | about four days, 100 miles | our outline: about 800 miles | **Keeps**: the outline is ours and is redrawn (§4.1) |

## 3. The rule from now on

- A day's travel is about 24 miles at a normal pace on roads, less where the roads give out. That's 18, 24 or 30 miles at a slow, normal or fast pace (2024 rules). By ship it's about 50 miles a day, slower in the dark middle of the Tides.
- **The painted map decides** where painted things are: coasts, the capitals, Hollow Refuge, Kaelholm, Ashvale, the Bloodmarked Fields.
- **The lore decides** where our pins are, for places the painting doesn't show (the Crossroads, the Marches sites, the towns and villages). Those pins move to match the lore's times.
- Where a painted place and a lore time disagree, **the time changes**.

## 4. Route by route

Distances are at the new scale. "Move" means our pin (and its route line) moves; the lore stays. "Retime" means the lore and the route label change; the pins stay.

### 4.1 The Hollow Marches (keep "about four days across, 100 miles")

The Marches outline is redrawn to about 100 miles (125 pixels) around Hollow Refuge and the Crossroads. Every Marches site moves inside it, at its stated time:

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| Hollow Refuge – the Crossroads of Fate | half a day | 82 mi | **Move** the Crossroads to 12 mi from the Refuge |
| Hollow Refuge – Blackveil Fortress | a day | 282 mi | **Move** Blackveil to 22 mi |
| the Crossroads – the Scar | half a day, dangerous | 150 mi | **Move** the Scar to 12 mi from the Crossroads |
| the Crossroads – the Sunken Archive | a day | 233 mi | **Move** the Archive to 22 mi |
| Blackveil – the Rift / the Archive – the Rift / Wither's Hollow – the Rift | a day / half a day / half a day | 105–421 mi | **Move** Wither's Hollow and the Rift's route end so all three fit (the Rift lies between them, on the Marches' eastern edge) |

The Bloodmarked Fields are painted about 175 miles east of the Refuge, which is wider than the whole canon Marches. **Proposal:** the Fields are a great plain beyond the Marches' eastern edge, not inside it.

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| Hollow Refuge – the Bloodmarked Fields | half a day | 179 mi | **Retime**: "half a day to the Fields' western edge; about a week to the lines where the armies are dug in" |
| the Bloodmarked Fields – the Scar | half a day | 208 mi | **Retime**: "half a day from the Fields' western edge" (the Scar sits on the Marches' eastern edge, by the Fields) |
| the Bloodmarked Fields – Wither's Hollow | a day | 443 mi | **Retime**, the same way: "a day from the Fields' western edge" |
| Stakewall – Hollow Refuge | a day, round the edge of the Fields | 301 mi | **Move** Stakewall to 22 mi, on the Fields' side |

### 4.2 Towns near Hollow Refuge (move; the lore stays)

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| Archwell – Hollow Refuge | a day on foot | 285 mi | **Move** Archwell to 24 mi |
| Tallowmarch – Hollow Refuge | a day on foot, past Blackveil | 378 mi | **Move** Tallowmarch to 24 mi, beyond Blackveil |
| Lastlight – Hollow Refuge | half a day | 207 mi | **Move** Lastlight to 12 mi |

### 4.3 The capitals (painted, so retime)

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| Hollow Refuge – the Rootspire | about two weeks | 344 mi | **Keeps** (two weeks) |
| Hollow Refuge – Varkhaal | about two weeks | 404 mi | **Retime**: "about two and a half weeks" |
| Hollow Refuge – Noctis | about two weeks | 457 mi | **Retime**: "nearly three weeks" |
| Hollow Refuge – Empyrean Spire | about two weeks | 590 mi | **Retime**: "about three and a half weeks" |
| Hollow Refuge – Zepharyos | about two weeks | 595 mi | **Retime**: "about three and a half weeks" |

RUL-651 changes from "each capital about a further week, roughly 340 miles" to "the capitals are two to four weeks from the Refuge, 340 to 600 miles". The pattern stays: about a week to each dominion's border, then the rest within it.

### 4.4 Towns near the capitals (move; the lore stays)

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| Dawnmere – Empyrean Spire | about three days, as pilgrims walk | 277 mi | **Move** Dawnmere to 60 mi (pilgrims walk slowly) |
| Ironwake – Varkhaal | about two days | 232 mi | **Move** Ironwake to 48 mi |
| Driftholm – Zepharyos | about two days, by chain-ladder | ~195 mi | **Move** Driftholm to 40 mi (the climb is slow) |
| Mothhaven – Noctis | about three days down the coast | ~220 mi | **Move** Mothhaven 70 mi up the coast from Noctis; the crossing to Kaelholm stays about 700 miles |
| Highbough – the Rootspire | about four days, roadless forest | ~250 mi | **Move** Highbough to 70 mi (slow going) |

### 4.5 Ashvale's villages (move; the lore stays)

All nine sit 350 to 730 miles from Ashvale on the map, but are a half day to a day and a half away in the lore. They **move into a ring around Ashvale**, each at its stated time and in the direction its route takes now:

| Village | Lore | Proposal |
| --- | --- | --- |
| Haskett's Mill, Sallow Cross | half a day (cart, the best road) | 14 mi |
| Coldwater, Greyfold, Oakhallow, Kettleby, Thornmere | about a day on foot | 22–24 mi |
| Low Fenn, Brannock | a day and a half (barge, ridges) | 30–36 mi |

### 4.6 The long routes

| Route | Lore | Now | Proposal |
| --- | --- | --- | --- |
| The crossing, Noctis to Kaelholm | about two weeks by ship, in the dark | 534 mi | **Keeps** (ships go slowly in the dark) |
| Kaelholm – Ashvale | about 1,500 km | 793 mi | **Retime** the text: "about 1,300 km (800 miles)" |

## 5. What changes, and what doesn't

- **Map data:** about 30 pins and their route lines, the Hollow Marches outline, and the world map's scale. Your own library gets these through **Apply additions**, which moves only pins you haven't moved yourself.
- **Lore (canon edits, with revisions and a DEC-910 entry):**
  - RUL-651 (new figures; it says the map is drawn to scale at about 2,700 miles across, as the known world);
  - the Kaelholm–Ashvale text;
  - the Bloodmarked Fields' route times;
  - the capital route times.
- **Player text:** the matching lines in `far-places.md`, `towns.md`, `aetheris-towns.md`, `five-places.md`, `remaining-places.md` and `villages.md`, so the handbook agrees.
- **Unchanged:** the crossing of the Black Tides (two weeks, about 700 miles), the Crossroads half a day from the Refuge, and the Marches about four days across. The Loose Thread, The Lightless Crossing and the other adventures keep their times.
- **The Ethereal Realm map stays unscaled.** Its distances lie, by design (RUL-653).
- **Grouped pins** (the next map PR) keep the Hollow Marches and Ashvale clusters readable when zoomed out. Zooming in separates them.
