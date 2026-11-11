# Architecture

## Stack (and why)

| Layer | Choice | Reason |
| --- | --- | --- |
| Client | React 19 + TypeScript + Vite, Tailwind CSS 3, Lucide icons | Requested stack; fast builds; fully offline (fonts bundled via @fontsource) |
| Maps | Leaflet + react-leaflet with `CRS.Simple` | Mature image-map viewer: zoom/pan, draggable markers, polygons, polylines |
| Graphs | @xyflow/react (React Flow) | Relationship explorer and adventure scene-flow editor |
| Markdown | react-markdown + remark-gfm | Raw HTML is never rendered (no rehype-raw); URL transform blocks `javascript:` links |
| Server | Node.js + Express 5 + TypeScript (run with `tsx`) | Small local backend for DB and file access |
| Database | SQLite via better-sqlite3, WAL mode, FTS5 search | Durable single file, transactions, fast full-text search, works offline |
| Validation | zod | Every write is validated server-side |
| Archives | adm-zip | ZIP import, exports, backup archives |
| Tests | vitest + supertest; Playwright smoke script | Data operations, HTTP API, player safety, browser flows |

**Desktop packaging:** Tauri 2 shell (`src-tauri/`) that launches the server, bundled into one ESM file with esbuild, on a bundled Node.js runtime (sidecar), with data in the OS app-data folder. See [DESKTOP.md](DESKTOP.md).

## Folder layout

```
shared/              Domain vocabulary + pure play logic used by client and server
  domain.ts          canon statuses, entity types, relationship types, ID pattern, secret-heading rule
  play.ts            dice parser, initiative order, damage/healing, concentration DC, proficiency
server/src/
  index.ts           entry point (DM or player mode, daily backup)
  app.ts             Express app, security headers, error handling, route mounting by mode
  context.ts         holds the live DB handle (swappable on restore)
  config.ts          data directory paths
  db/                connection + append-only migrations
  import/            scan (zip/dir, path sanitising) → parseMarkdown → normalize → importer (plan/commit)
  repo/              data access: entities (revisions, versioning), relationships (graph), search (FTS5),
                     campaigns (sessions, state overlay, plans, encounters, proposals), maps, review, crud helper
  player/projection  the ONLY code that produces player-visible data (allow-list projection)
  backup/            backups (VACUUM INTO + zip), restore staging with integrity check, exports
  routes/            thin HTTP handlers per area
  cli/import.ts      command-line import
client/src/
  components/        Layout (sidebar/top bar), SearchPalette, Markdown, EntityPicker, ui primitives
  lib/               api client + autosave hook, app state (theme, active campaign, record index)
  pages/             Dashboard, EntityList, EntityPage (view/edit/relationships/player/campaign/history),
                     WorldPages, Atlas, Graph, Special (vaults/shards/dominions/ethereal), Campaign, Live,
                     DmTools, Library (import/export, canon review, backups, settings)
  player/            Player app (calls /api/player/* only)
tests/               vitest suites (+ synthetic fixture library in helpers.ts)
scripts/e2e-smoke.mjs  browser smoke test
```

## Database schema (summary)

All tables are created by `server/src/db/migrations.ts` (versioned, append-only).

**Encyclopedia**
- `entities` — one row per stable ID. Keeps every original field verbatim (`category_raw`, `parent_raw`, `realm_raw`, `canon_raw`, `source_raw`, `aliases`, extra template `fields` in order, Markdown `body`) next to normalised columns (`type`, `realm`, `canon_status`, `canon_flags`, `parent_id`). Also DM `notes`, reveal state (`revealed`, `player_summary`, `revealed_sections`, `revealed_facts`), `origin` (import/user), `source_file`, `source_hash`, `import_content_hash` (reviewed baseline), `redirect_to` (legacy IDs such as LOC-015 → LOC-505), `version`, `archived`, `favorite`.
- `entity_revisions` — snapshot of the record *before* each change (and right after import/approval), with change type and reason. Autosave bursts are coalesced into one revision.
- `relationships` — structured edges `(source, target, type, directed, label, canon_status, origin)`. Origins: `user` (curated), `import-parent`, `import-field` (e.g. *Leaders* → `leads`), `import-reference` (each `Name [ID]` in the text). Text-derived edges are regenerated whenever a record's text changes; curated edges are never touched automatically.
- `source_documents` — every imported file verbatim. `References/` files (both setting bibles, guides) are `immutable`: a changed copy is stored beside the original, never over it.
- `templates`, `timeline_rows` (from the World Timeline table), `import_runs` (reports, backup used), `recent_views`, `settings`, `search_index` (FTS5).

**Campaigns and play**
- `campaigns`, `characters` (2024 sheet basics in JSON), `quests`, `adventures` (+ `scenes`, `scene_links`), `sessions` (prep JSON, recap), `session_log`, `encounters` (combatants JSON), `faction_plans`, `notes`, `random_tables`, `dice_log`.
- `campaign_state` — the overlay: `(campaign, entity, field, value, status)`. A new active value supersedes the previous one. Statuses: proposed → active / rejected; promoted.
- `proposals` — Canon Review queue (new records, campaign promotions).

**Profiles and eras (v0.2)**
- `profiles` — DM values for NPC/faction profile fields, keyed by `(entity_id, campaign_id)`; `campaign_id = 0` is the world-level profile. Field definitions live in `shared/profiles.ts`; source values are extracted read-only from the record's sections/fields at request time, never copied.
- `eras` — era vocabulary seeded from the library's `era/` tag documentation and `era/*` tags (DM can rename, reorder, add). `timeline_rows.era` / `era_origin` (`derived` from linked records' era tags, or `user`); DM assignments survive re-imports.

**Atlas**
- `maps` (image or abstract, parent map, linked record, layers, player visibility), `map_markers` (x/y in image pixels, linked record, layer, category, hidden, child map), `map_shapes` (region polygons, routes).

## Import strategy

1. **Scan** a ZIP or folder recursively; reject traversal/absolute paths, oversized files; strip the archive's top folder.
2. **Parse** every Markdown file into metadata blocks: a block starts with `ID:` at the top of a file or after a blank line / `---`, followed by `Key: value` lines. One file can hold many blocks.
3. **Classify** files: `References/` → protected sources (bibles/guides); `Templates/` → templates; `Worked_Examples/` → skipped (instructional copies); files without real IDs → index/continuity documents (searchable, not records).
4. **Choose one authoritative block per ID:** the *Canonical Entry Locator* table first, then the standalone page over compendium copies (e.g. `03_World_Cosmology.md` embeds COS-901…915). Every skipped copy is reported, with a warning if its text differs.
5. **Normalise** without inventing: type from category/ID prefix, realm, primary canon status + flags; raw strings are kept.
6. **Plan against the database:** create / update (source changed, no local edits) / unchanged / **conflict** (you edited it and the source changed → default *keep yours*). Records missing from a new archive are kept.
7. **Preview** (counts by type/realm/action, skipped, duplicates, broken references, protected-document changes). Nothing is written.
8. **Commit** after explicit confirmation: automatic backup, then one transaction (documents, records + revisions, derived relationships, timeline, templates, search index). Any error rolls everything back and the run is logged as failed.

Re-importing the same archive is a no-op (verified: 421 unchanged).

## Safety model

- **Canon:** imported text changes only through visible, revisioned edits; Canon Review lists every changed canon record with a diff (approve as new baseline, or revert). New records are PROPOSED. Campaign developments become canon only by approving a proposal.
- **Player data:** `player/projection.ts` builds new objects from an allow-list; unrevealed records do not exist for players, references to unrevealed IDs are scrubbed, GM/secret-headed sections cannot be published, hidden markers/shapes and non-published maps/quests/recaps are excluded. `WORLDKEEPER_MODE=player` mounts only these routes.
- **Input:** zod validation on all writes; optimistic concurrency (`expected_version`) on record edits; Markdown rendered without raw HTML; uploaded images checked by magic bytes (SVG refused) and served by strict file name; strict CSP on the built client.
- **Data loss:** WAL SQLite, daily/pre-import/pre-restore backups, restore validates the archive and runs an integrity check before swapping databases, error boundaries per page, visible save state with unload warning.
