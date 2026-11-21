# Design Overhaul: Product Requirements

**Status:** Draft for owner review
**Scope:** The look and layout of the GM app, the in-app Player View, the table server and the published Player Handbook. No changes to data, rules or what players can see.

## 1. Why

The Worldkeeper has the features a GM needs, but the layout has grown one page at a time:

- The sidebar holds **66 links in 5 groups**: World, Encyclopedia, Campaigns, Dungeon Master Tools and Library Management. Finding a page means scrolling a list, and the most-used pages sit next to maintenance pages.
- Every page is full width, one at a time. During play the GM jumps between the initiative tracker, a stat block, a record and the map.
- The styling is one stylesheet with a dozen colour variables and per-page choices. Cards, tables, headings and spacing differ from page to page.
- There is no way to glance at a linked record without leaving the page.

The goal is a clean, consistent workspace that is fast at the table, without losing anything that exists today.

## 2. Design principles: "Illuminated Functionalism"

The look of a medieval codex, with the discipline of a modern tool. The character sheet's Kingdom Come-style redesign is the reference point.

1. **Function first.** Ornament frames content and never takes its space. Borders are thin (1px) and structural; decoration (rules, corner marks, the gold accent) is used sparingly, mostly on headings and record titles.
2. **Easy to scan in dim light.** Dense data (stat blocks, spell lists, initiative, inventory) uses a readable sans-serif with tabular numbers, clear row rhythm and strong contrast. Lore text is set in a book serif.
3. **Navigation stays out of the way.** Workspaces are in a compact top bar. The sidebar shows only the current workspace's pages.
4. **Two speeds.** Every linked thing has a **Quick-Peek** (a hover card or slide-out drawer that doesn't leave the page) and a **Dedicated View** (its full page).
5. **Nothing is lost.** Every current page, URL, feature and keyboard shortcut keeps working. Bookmarks and links inside records still resolve.

## 3. Owner decisions (2026-11-21)

| Decision | Choice |
| --- | --- |
| Navigation | The PRD layout: workspace top bar, contextual collapsible sidebar, canvas, optional right inspector |
| Themes | **Warm Parchment is the default**; **Dark Codex** is kept as the alternative |
| Order | Merge pending work first (done: v0.3.6), then overhaul in reviewed steps |

## 4. Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◈ Worldkeeper │ Codex  Campaign  Characters  Atlas  Live │ ⌕ Ctrl K │ ⚙ ☀ ▣ │  top bar 52px
├─────────────┬────────────────────────────────────────────────┬───────────────┤
│ sidebar     │ canvas                                         │ inspector     │
│ 248px       │ (fluid; optional split into two panes)         │ 360px         │
│ collapsible │                                                │ contextual,   │
│ to 56px     │                                                │ closable      │
└─────────────┴────────────────────────────────────────────────┴───────────────┘
```

### 4.1 Top bar (52px)
- **Left:** the app mark and name (goes to the World Dashboard), then the **five workspaces**: Codex, Campaign, Characters, Atlas, Live. The current one is underlined in gold.
- **Centre-right:** the search trigger, showing "Search… Ctrl K". It opens the existing search palette.
- **Right:**
  - the **active campaign** chip (click to switch campaigns);
  - **Player View**;
  - the theme toggle (parchment or dark);
  - the **Library** menu (gear icon) for maintenance pages and Settings.
- During a live session, a pulsing "Live" badge appears on the Live tab.

### 4.2 Sidebar (248px, collapsible to a 56px icon rail)
- It shows only the pages of the current workspace, in short labelled groups (section 5).
- Collapsing it is remembered per browser. `[` toggles it.
- Codex adds a filter box at the top that narrows the list of record types.

### 4.3 Canvas
- The page itself. Long text runs in a readable column (max ~72 characters), and tables and boards use the full width.
- **Split view** (Live, Atlas and record pages): open a second item beside the first, e.g. the map with a stat block, or two records. The divider can be dragged, and either pane can be closed.

### 4.4 Inspector (360px, right, contextual)
- It shows whatever you Quick-Peeked: a record's summary, sections and backlinks, a stat block, a character, a quest.
- On a record page it shows that record's details panel (links, mentions, revisions), freeing the canvas for text.
- In Live it holds the turn order or pinned stat blocks.
- `]` toggles it and Esc closes it. Below 1280px it opens as an overlay instead of pushing the canvas.

## 5. Information architecture

Every one of today's 66 sidebar links has a home. URLs don't change; only where the link sits changes.

**Codex: the world and its records**
- *World:* World Dashboard, World Overview, World Timeline, Cosmology, Pantheon, Cultures and Peoples, Magic Systems
- *Realms:* Aetheris, Kaelmar, Ethereal Realm (only while the setting mechanics are on)
- *Records:* All Lore, Regions and Settlements, Landmarks and Buildings, NPCs, Factions and Cults, Shards and Artifacts, Creatures, Historical Events
- *Secrets and links:* Mysteries and Secrets, Relationships

**Campaign: the active campaign, prep and its state**
- *Campaign:* All Campaigns, Overview (Active Campaign), Sessions, Session Journal, Calendar
- *Story:* Adventures, Story Arcs, Quests, Handouts
- *Prep:* Encounters, Faction Agendas, Rumours, World Events
- *World state:* Faction Standing, Faction Web, State of the World, The Return (when on), Treasure, Bastions and Downtime
- *For players:* What the Party Knows

**Characters: people at the table and in the books**
- *Party:* Party and Characters, Make a Character (the builder, in-app)
- *Reference:* NPC Quick Reference, Your Books (creatures, items, encounter ideas), Name Generator

**Atlas: maps**
- *Maps:* World Atlas and each map, with the explorer. Later: layer toggles (section 9).

**Live: running the session**
- *Session:* Live Session, DM Screen, Notes and Scratchpad
- *Combat:* Encounter Tracker, Initiative, Combat Conditions, Dice Roller
- *Reference:* Rules Reference, Quick Reference (when on), Random Tables

**Library menu (gear, top right): maintenance**
- Search (full page), Publish for Players, Import and Export, Canon Review, Consistency Check, Open Questions, Change History, Backups, Settings
- In debug mode only: Broken References, Source Documents

Mechanics gating stays as it is: pages for the setting's mechanics appear only while those mechanics are switched on.

## 6. Visual system

### 6.1 Themes and colour tokens
Both themes share one set of semantic tokens. Components never use raw colours.

| Token | Warm Parchment (default) | Dark Codex |
| --- | --- | --- |
| `bg` (page) | warm parchment, ~#EFE6D2 | #111216 |
| `panel` (cards, bars) | lighter vellum, ~#F7F1E3 | #181A1F |
| `raised` (inputs, hovers) | ~#FBF7EE | #21242B |
| `line` (borders) | ~#D3C4A3 | #343842 |
| `ink` (text) | iron-gall brown-black, ~#2A2219 | #E4DFD2 |
| `dim` (secondary text) | ~#6B5D48 | #969288 |
| `gold` (accent, focus) | deeper gilt, ~#8A6418 | #C9A24A |
| `arcane`, `danger`, `ok`, `warn` | muted pigment tones | as today, retuned for contrast |
| rarity accents | common → artifact, six tones | same hues, lighter |

- Final values are tuned so that body text, secondary text, links and focus rings all pass **WCAG AA** in both themes. A test checks every text/background pair.
- Parchment gets a very faint paper texture on the page background only (CSS, no images in tables). It can be turned off with "reduce texture" in Settings.
- The setting's region colours (pins, realms) stay, retuned per theme.

### 6.2 Type
- **Display:** Cinzel, for page titles, record names and workspace tabs only. It's never used for body text or data.
- **Lore:** EB Garamond, for record text, read-aloud boxes and handouts.
- **UI and data:** system sans, with **tabular numbers** for every stat, HP, AC, DC and modifier.
- **Scale** (px): 12, 13, 14 (UI base), 16 (lore base), 18, 22, 28, 36. Line height is 1.5 for prose and 1.3 for data.
- Both fonts are already bundled, so it works offline and the security policy is unchanged.

### 6.3 Spacing, borders, elevation
- 4px grid: 4, 8, 12, 16, 24, 32, 48.
- Radius 4px on controls and 6px on cards. No pill shapes except tags.
- Borders are 1px `line`. The gold accent is a 2px rule under titles and a 1px inner frame on featured cards.
- Three elevation levels: flat (panels), raised (hover cards, menus) and overlay (drawers, dialogs). Parchment uses soft warm shadows; dark uses a border plus shadow.

### 6.4 Icons
Lucide stays (it's already bundled), at 16px in navigation and 14px inline. There's one icon per workspace, used consistently in the sidebar rail and the tabs.

## 7. Components

Shared components replace per-page styling. Each has default, hover, active, focus, disabled, loading and empty states.

- **Shell:** TopBar, WorkspaceTabs, Sidebar (with groups and the icon rail), Inspector, SplitPane, LibraryMenu, CampaignSwitcher.
- **Content:**
  - PageHeader: title, subtitle and actions, with an optional "about this page" note.
  - Card and EntityCard (type icon, name, realm, canon badge, reveal state).
  - Section, with its secret and GM-only treatment: a stitched red margin and a "GM only" label, the same everywhere.
  - Tag and badge (canon, reveal, rarity, status).
- **Data:** DataTable (sortable, sticky header, tabular numbers), StatBlock (one style for setting creatures, SRD and books, with collapsible trait and action groups), KeyValue list, Tracker row (initiative), HP stepper and condition chips.
- **Input:** Field, Input, Select, Textarea, MarkdownEditor (with `@` linking as today), Toggle, Segmented control and EntityPicker.
- **Overlay:** HoverCard (Quick-Peek), Drawer (the inspector content), Dialog, Confirm, Toast and SearchPalette (restyled).
- **Feedback:** loading skeletons, empty states with one clear next action, error states with retry, and SaveStatus.

## 8. Quick-Peek and Dedicated View

- **Hover cards.** Hovering a record link (`@[Name]`, EntityLink, a map pin, a combatant) for 350ms shows a card with the type, realm, summary, reveal state and up to three facts. Players' views show only revealed text, as today.
- **Peek.** Clicking the peek icon on the card, or middle-clicking a link, opens the record in the **inspector**. The canvas doesn't change.
- **Open.** A normal click opens the Dedicated View, as today. **Open beside** (on the card) opens it in split view.
- **Touch.** On tablets, tapping a link shows the card and a second tap opens it. A long press peeks.
- **Live.** Stat blocks can be **pinned** in the inspector during a session (several at once, collapsible), and stay pinned until the session ends.

## 9. Pages to redesign first (high fidelity)

1. **Record page** (Codex): title band, lore column, inspector with links, mentions and revisions, and GM-only sections clearly marked.
2. **Party and Characters**, with the full sheet.
3. **Session prep** (Campaign, Sessions): a prep board with quests, likely NPCs, clues, encounters and adventures in play.
4. **Live Session** in split view: initiative and the map or a record, with pinned stat blocks in the inspector.
5. **Atlas explorer**, with the new shell and inspector peeks on pins.
6. **World Dashboard** as the home page.

The other pages get the shell and shared components without bespoke layouts.

## 10. Player side

- The published handbook and the table server use the **same tokens and components**, with parchment as the default and dark as a toggle, remembered per device.
- Their own navigation stays simpler: a top bar with World, Records, Maps, Campaign and My Character, and a sidebar for the current section.
- Hover cards show only what players may see. That information comes from the player projection, as today.
- The printable sheet and printable handbook keep their print layouts.

## 11. Responsive behaviour

| Width | Behaviour |
| --- | --- |
| 1440px and up | All three columns; split view available |
| 1280–1439px | Sidebar and canvas; the inspector overlays |
| 1024–1279px (tablet landscape) | Sidebar as the icon rail; the inspector overlays; split view in Live only |
| Under 1024px | Workspaces in a menu; the sidebar as a drawer; one column. Player phones keep today's mobile layout, restyled |

Touch targets are at least 40px in Live and on the player side.

## 12. Non-functional requirements

- **Speed:** switching workspaces or records feels instant (no full reload, under 150ms to render). Search stays as fast as today. Hover cards use data that's already cached.
- **Accessibility:** WCAG AA contrast in both themes. Full keyboard use: Ctrl K, `[`, `]`, Esc, and arrow keys in the sidebar and palette. Visible focus rings. Reduced-motion respected.
- **Offline:** unchanged. Everything is bundled, no remote fonts or scripts, and the strict security policy stays.
- **No regressions:**
  - The existing unit, API and E2E tests keep passing.
  - The E2E tests are updated for the new navigation.
  - Screenshots of each redesigned page are reviewed in both themes, at 1440px and at tablet width.

## 13. Not in scope

- **Data and formats.** The archive's metadata-header Markdown, the JSON exports and campaign exports stay as they are. No YAML front matter.
- **New features.** These are good ideas from the original brief, to plan separately: equipment loadout presets, map pin clustering, map layer toggles, and turning scratchpad notes into lore in one step.
- **Player visibility.** Nothing about what players can see changes.

## 14. Delivery plan

Each step is its own PR with before-and-after screenshots. Nothing merges without your OK.

| Step | What | You review |
| --- | --- | --- |
| 1 | **Tokens and themes:** the parchment default, retuned dark, type scale, spacing, and a contrast test. A style-guide page in the app (Library menu → Style guide) shows every token and component | The style guide in both themes |
| 2 | **Shell:** the top bar, workspaces, contextual sidebar, Library menu and campaign switcher. Every page reachable, same URLs | Navigation on every workspace |
| 3 | **Components:** the shared set, applied across all pages; per-page styling removed | A page tour |
| 4 | **Quick-Peek:** hover cards, the inspector, and split view in Live, Atlas and records; pinned stat blocks | Live Session and a record page |
| 5 | **Key pages** from section 9 at high fidelity | Each page |
| 6 | **Player side:** the handbook and table server on the same system | Handbook and phone screenshots |
| 7 | Docs, screenshots in the README, and a release | The release |

## 15. Open questions for the owner

1. **Ornament.** How much medieval decoration do you want: minimal (rules and title bands only), or a little more (corner marks on featured cards, illuminated initials on record titles)?
2. **Live mode.** Should the Live workspace hide the other workspaces' tabs during a session (a distraction-free mode), or keep them visible?
3. **Handbook default.** Should the published handbook also default to parchment, or keep dark?
4. **Dashboard.** Should the World Dashboard stay the home page, or should the active campaign's overview be home once a campaign exists?
