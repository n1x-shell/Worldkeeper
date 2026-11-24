import type Database from 'better-sqlite3';

/**
 * Ordered, append-only schema migrations.
 * NEVER edit a migration that has shipped; add a new one instead.
 */
/** `onUpgrade` runs only in a database made by an earlier version, not in a new one. */
export const MIGRATIONS: { version: number; name: string; sql: string; onUpgrade?: string }[] = [
  {
    version: 1,
    name: 'core encyclopedia',
    sql: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  category_raw TEXT,
  type TEXT NOT NULL,
  parent_raw TEXT,
  parent_id TEXT,
  realm_raw TEXT,
  realm TEXT NOT NULL DEFAULT 'world',
  realms TEXT NOT NULL DEFAULT '[]',
  canon_raw TEXT,
  canon_status TEXT NOT NULL DEFAULT 'UNDEFINED',
  canon_flags TEXT NOT NULL DEFAULT '[]',
  source_raw TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_visibility TEXT,
  revealed INTEGER NOT NULL DEFAULT 0,
  player_summary TEXT NOT NULL DEFAULT '',
  revealed_sections TEXT NOT NULL DEFAULT '[]',
  revealed_facts TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'user',
  source_file TEXT,
  source_hash TEXT,
  import_content_hash TEXT,
  redirect_to TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_realm ON entities(realm);
CREATE INDEX idx_entities_parent ON entities(parent_id);

CREATE TABLE entity_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_revisions_entity ON entity_revisions(entity_id, id);

CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  directed INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  canon_status TEXT NOT NULL DEFAULT 'CANON',
  origin TEXT NOT NULL DEFAULT 'user',
  source_context TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_id, target_id, type, origin)
);
CREATE INDEX idx_rel_source ON relationships(source_id);
CREATE INDEX idx_rel_target ON relationships(target_id);

CREATE TABLE source_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  doc_id TEXT,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '[]',
  sections TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'import'
);

CREATE TABLE import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  backup_file TEXT,
  report TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE timeline_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL,
  time_label TEXT NOT NULL,
  event TEXT NOT NULL,
  realm_label TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL DEFAULT '',
  entity_ids TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'import'
);

CREATE TABLE recent_views (
  entity_id TEXT PRIMARY KEY,
  viewed_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
  ref UNINDEXED,
  kind UNINDEXED,
  title,
  aliases,
  tags,
  body,
  tokenize = 'porter unicode61'
);
`,
  },
  {
    version: 2,
    name: 'campaigns, sessions, play tools',
    sql: `
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  premise TEXT NOT NULL DEFAULT '',
  starting_location_id TEXT,
  starting_date TEXT NOT NULL DEFAULT '300 AB / Year 31 Unbound',
  current_date TEXT NOT NULL DEFAULT '300 AB / Year 31 Unbound',
  status TEXT NOT NULL DEFAULT 'planning',
  players TEXT NOT NULL DEFAULT '[]',
  active_factions TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  player TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'pc',
  species TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  sheet TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  description TEXT NOT NULL DEFAULT '',
  giver_id TEXT,
  location_id TEXT,
  player_visible INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE adventures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  arc TEXT NOT NULL DEFAULT '',
  source_hook_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  linked_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adventure_id INTEGER NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'scene',
  body TEXT NOT NULL DEFAULT '',
  read_aloud TEXT NOT NULL DEFAULT '',
  linked_ids TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0
);

CREATE TABLE scene_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adventure_id INTEGER NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
  from_scene INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  to_scene INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  played_on TEXT NOT NULL DEFAULT '',
  in_world_date TEXT NOT NULL DEFAULT '',
  prep TEXT NOT NULL DEFAULT '{}',
  recap TEXT NOT NULL DEFAULT '',
  recap_player_visible INTEGER NOT NULL DEFAULT 0,
  current_scene_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE session_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note',
  text TEXT NOT NULL,
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE campaign_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_id TEXT,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_campaign_state ON campaign_state(campaign_id, entity_id);

CREATE TABLE faction_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  faction_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  segments INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'active',
  attitude TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id INTEGER,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  round INTEGER NOT NULL DEFAULT 0,
  turn_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'prepared',
  combatants TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  entity_id TEXT,
  campaign_id INTEGER,
  title TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  title TEXT NOT NULL DEFAULT 'Untitled note',
  body TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE random_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  die TEXT NOT NULL DEFAULT '',
  entries TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE dice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expression TEXT NOT NULL,
  result TEXT NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
  {
    version: 3,
    name: 'atlas',
    sql: `
CREATE TABLE maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image',
  parent_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  entity_id TEXT,
  image_file TEXT,
  width INTEGER NOT NULL DEFAULT 2000,
  height INTEGER NOT NULL DEFAULT 1400,
  layers TEXT NOT NULL DEFAULT '["Locations"]',
  player_visible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE map_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  entity_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL,
  y REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'location',
  layer TEXT NOT NULL DEFAULT 'Locations',
  hidden INTEGER NOT NULL DEFAULT 1,
  child_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL
);

CREATE TABLE map_shapes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  points TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT '#c9a24a',
  entity_id TEXT,
  layer TEXT NOT NULL DEFAULT 'Regions',
  hidden INTEGER NOT NULL DEFAULT 1
);
`,
  },
  {
    version: 4,
    name: 'profiles, eras, timeline eras',
    sql: `
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  campaign_id INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(entity_id, campaign_id)
);

CREATE TABLE eras (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'import'
);

ALTER TABLE timeline_rows ADD COLUMN era TEXT;
ALTER TABLE timeline_rows ADD COLUMN era_origin TEXT;
`,
  },
  {
    version: 5,
    name: 'rumours',
    sql: `
CREATE TABLE rumours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  truth TEXT NOT NULL DEFAULT 'unknown' CHECK (truth IN ('true','false','partly','unknown')),
  gm_note TEXT NOT NULL DEFAULT '',
  source_id TEXT,
  about TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'handbook',
  stale INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX rumours_source ON rumours(source_id);

CREATE TABLE rumour_heard (
  campaign_id INTEGER NOT NULL,
  rumour_id INTEGER NOT NULL REFERENCES rumours(id) ON DELETE CASCADE,
  heard_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (campaign_id, rumour_id)
);
`,
  },
  {
    version: 6,
    name: 'mysteries, secrets and clues',
    sql: `
CREATE TABLE mysteries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'additions'
);

CREATE TABLE secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  mystery_id INTEGER REFERENCES mysteries(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  truth TEXT NOT NULL DEFAULT '',
  gm_note TEXT NOT NULL DEFAULT '',
  source_id TEXT,
  about TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'additions'
);
CREATE INDEX secrets_source ON secrets(source_id);

CREATE TABLE clues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  secret_id INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rumour','npc','place','item','text')),
  note TEXT NOT NULL DEFAULT '',
  entity_id TEXT,
  rumour_ids TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'additions'
);

CREATE TABLE secret_progress (
  campaign_id INTEGER NOT NULL,
  secret_id INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown','suspected','known')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, secret_id)
);

CREATE TABLE clue_found (
  campaign_id INTEGER NOT NULL,
  clue_id INTEGER NOT NULL REFERENCES clues(id) ON DELETE CASCADE,
  found_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, clue_id)
);
`,
  },
  {
    version: 7,
    name: 'map exploration: places the party has discovered, and where it has travelled',
    sql: `
CREATE TABLE map_discoveries (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, map_id, entity_id)
);

CREATE TABLE map_travel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  entity_id TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX map_travel_campaign ON map_travel(campaign_id, map_id, id);
`,
  },
  {
    version: 8,
    name: "faction standing: the party's Renown with each faction, and how it changed",
    sql: `
CREATE TABLE faction_standing (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  faction_id TEXT NOT NULL,
  renown INTEGER NOT NULL DEFAULT 0,
  player_visible INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, faction_id)
);
CREATE TABLE renown_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  faction_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX renown_log_campaign ON renown_log(campaign_id, faction_id, id);
`,
  },
  {
    version: 9,
    name: "party treasure: what each campaign's party has found, and who carries it",
    sql: `
CREATE TABLE party_treasure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'item',
  quantity INTEGER NOT NULL DEFAULT 1,
  value_gp REAL NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL DEFAULT '',
  entity_id TEXT,
  holder TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'carried',
  found_at TEXT NOT NULL DEFAULT '',
  fades INTEGER NOT NULL DEFAULT 0,
  anchored INTEGER NOT NULL DEFAULT 0,
  player_visible INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX party_treasure_campaign ON party_treasure(campaign_id, status);
`,
  },
  {
    version: 10,
    name: 'handouts: letters, read-aloud and pictures pushed to players during play',
    sql: `
CREATE TABLE handouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_file TEXT,
  pushed_at TEXT,
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX handouts_campaign ON handouts(campaign_id, pushed_at);
`,
  },
  {
    version: 11,
    name: "bastions and downtime: the party's strongholds, their turns, and what characters do between adventures",
    sql: `
CREATE TABLE bastions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  location_id TEXT,
  host_faction_id TEXT,
  gold INTEGER NOT NULL DEFAULT 0,
  defenders INTEGER NOT NULL DEFAULT 0,
  facilities TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE bastion_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bastion_id INTEGER NOT NULL REFERENCES bastions(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  orders TEXT NOT NULL DEFAULT '[]',
  event TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE downtime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  activity TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 0,
  cost_gp INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
  {
    version: 12,
    name: "the campaign calendar: the GM's own events, once or every year",
    sql: `
CREATE TABLE calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  year INTEGER,
  day INTEGER NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  yearly INTEGER NOT NULL DEFAULT 0,
  player_visible INTEGER NOT NULL DEFAULT 0
);
`,
  },
  {
    version: 13,
    name: 'the Return clock and the faction web',
    sql: `
CREATE TABLE return_clock (
  campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 7),
  held_until TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE return_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE faction_ties_revealed (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  PRIMARY KEY (campaign_id, a, b)
);
`,
  },
  {
    version: 14,
    name: "character pages: each character's memories, true name and Thinning, kept by its player",
    sql: `
CREATE TABLE character_pages (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  true_name TEXT NOT NULL DEFAULT '',
  memories TEXT NOT NULL DEFAULT '[]',
  known_by TEXT NOT NULL DEFAULT '[]',
  thinning INTEGER NOT NULL DEFAULT 0 CHECK (thinning BETWEEN 0 AND 6),
  shardscarred INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
  {
    version: 15,
    name: 'character change log: who changed what on a sheet or character page, the player or the GM',
    sql: `
CREATE TABLE character_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  by TEXT NOT NULL CHECK (by IN ('player', 'gm')),
  field TEXT NOT NULL,
  before TEXT NOT NULL DEFAULT 'null',
  after TEXT NOT NULL DEFAULT 'null'
);
CREATE INDEX character_changes_by_character ON character_changes (character_id, id);
`,
  },
  {
    version: 16,
    name: "rules packs: game rules from the GM's own books or homebrew, for the character sheet and builder",
    sql: `
CREATE TABLE rules_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  imported_at TEXT NOT NULL
);
CREATE TABLE rules_entries (
  pack_id TEXT NOT NULL REFERENCES rules_packs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  cls TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  PRIMARY KEY (pack_id, kind, cls, name)
);
`,
  },
  {
    version: 17,
    name: 'encounters: where they happen, for the map',
    sql: `ALTER TABLE encounters ADD COLUMN location_id TEXT;`,
  },
  {
    version: 18,
    name: 'maps: their scale (miles across), for distances and travel times',
    sql: `ALTER TABLE maps ADD COLUMN scale_miles REAL;`,
  },
  {
    version: 19,
    name: "realms as data: the library's realms, worlds and continents; maps, timeline rows and campaigns belong to them",
    // Every library starts with "The World". The Worldkeeper setting's realms become rows only where the library already
    // uses them, with the ids its records already carry, so nothing about them changes: Aetheris and Kaelmar are
    // continents of The World, which sits in the realm of Evershroud; the Ethereal Realm is a realm beside it, holding
    // the Hollow Verge with its six deeper domains.
    sql: `
CREATE TABLE realms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'world' CHECK (kind IN ('realm','world','continent','domain','region_group')),
  parent_id TEXT REFERENCES realms(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  icon TEXT NOT NULL DEFAULT 'globe',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO realms (id, name, kind, color, icon, sort_order) VALUES ('world', 'The World', 'world', 'blue', 'globe', 0);
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'aetheris', 'Aetheris', 'continent', 'world', 'amber', 'mountain', 1
  WHERE EXISTS (SELECT 1 FROM entities WHERE realm = 'aetheris' OR realms LIKE '%"aetheris"%');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'kaelmar', 'Kaelmar', 'continent', 'world', 'green', 'flame', 2
  WHERE EXISTS (SELECT 1 FROM entities WHERE realm = 'kaelmar' OR realms LIKE '%"kaelmar"%');
INSERT INTO realms (id, name, kind, color, icon, sort_order)
  SELECT 'ethereal', 'The Ethereal Realm', 'realm', 'violet', 'ghost', 3
  WHERE EXISTS (SELECT 1 FROM entities WHERE realm = 'ethereal' OR realms LIKE '%"ethereal"%');
INSERT INTO realms (id, name, kind, color, icon, sort_order)
  SELECT 'evershroud', 'Evershroud', 'realm', 'slate', 'moon', 0
  WHERE EXISTS (SELECT 1 FROM realms WHERE id IN ('aetheris','kaelmar','ethereal'));
UPDATE realms SET parent_id = 'evershroud' WHERE id = 'world' AND EXISTS (SELECT 1 FROM realms WHERE id = 'evershroud');
-- The Ethereal Realm's domains: the Hollow Verge (the border layer), with the six deeper domains beneath it.
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'hollow-verge', 'The Hollow Verge', 'domain', 'ethereal', 'violet', 'ghost', 4 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'fields-of-lost-realities', 'The Fields of Lost Realities', 'domain', 'hollow-verge', 'teal', 'sparkles', 5 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'ossuary-of-kings', 'The Ossuary of Kings', 'domain', 'hollow-verge', 'slate', 'skull', 6 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'silent-archive', 'The Silent Archive', 'domain', 'hollow-verge', 'blue', 'moon', 7 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'loom-of-eternity', 'The Loom of Eternity', 'domain', 'hollow-verge', 'amber', 'snowflake', 8 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'citadel-of-the-hidden', 'The Citadel of the Hidden', 'domain', 'hollow-verge', 'rose', 'castle', 9 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');
INSERT INTO realms (id, name, kind, parent_id, color, icon, sort_order)
  SELECT 'black-horizon', 'The Black Horizon', 'domain', 'hollow-verge', 'red', 'compass', 10 WHERE EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal');

-- The Ethereal Realm's records that sit in a domain (by their own text: where they live, sleep or stand, or the depth
-- a creature is met at) belong to that domain, and stay in the Ethereal Realm too.
UPDATE entities SET realm = 'hollow-verge', realms = '["hollow-verge","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'hollow-verge') AND id IN ('CRE-501', 'CRE-502', 'CRE-503', 'CRE-504', 'CRE-505', 'DEI-911', 'ETH-501', 'LOC-506', 'NPC-371', 'NPC-372', 'NPC-373', 'NPC-374', 'NPC-375', 'NPC-376', 'NPC-392', 'NPC-393', 'NPC-394', 'NPC-400', 'NPC-403', 'NPC-404', 'RUL-632', 'RUL-643');
UPDATE entities SET realm = 'fields-of-lost-realities', realms = '["fields-of-lost-realities","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'fields-of-lost-realities') AND id IN ('CRE-506', 'CRE-507', 'CRE-508', 'CRE-509', 'CRE-510', 'CRE-511', 'DEI-912', 'ETH-502', 'LOC-501', 'LOC-502', 'NPC-391', 'NPC-399', 'NPC-401', 'NPC-402', 'NPC-464');
UPDATE entities SET realm = 'ossuary-of-kings', realms = '["ossuary-of-kings","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'ossuary-of-kings') AND id IN ('CRE-512', 'CRE-513', 'CRE-514', 'DEI-913', 'ETH-503', 'LOC-503', 'LOC-504', 'NPC-389', 'NPC-390', 'NPC-395', 'NPC-396');
UPDATE entities SET realm = 'silent-archive', realms = '["silent-archive","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'silent-archive') AND id IN ('CRE-515', 'CRE-516', 'CRE-517', 'CRE-518', 'DEI-914', 'ETH-504');
UPDATE entities SET realm = 'loom-of-eternity', realms = '["loom-of-eternity","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'loom-of-eternity') AND id IN ('CRE-519', 'CRE-520', 'CRE-521', 'CRE-522', 'CRE-533', 'ETH-505');
UPDATE entities SET realm = 'citadel-of-the-hidden', realms = '["citadel-of-the-hidden","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'citadel-of-the-hidden') AND id IN ('CRE-523', 'CRE-524', 'ETH-506', 'LOC-505', 'NPC-466');
UPDATE entities SET realm = 'black-horizon', realms = '["black-horizon","ethereal"]' WHERE realm = 'ethereal' AND EXISTS (SELECT 1 FROM realms WHERE id = 'black-horizon') AND id IN ('CRE-525', 'CRE-526', 'CRE-527', 'CRE-528', 'CRE-529', 'CRE-530', 'CRE-531', 'CRE-532', 'ETH-507', 'LOC-507', 'LOC-508', 'LOC-509', 'NPC-397', 'NPC-398', 'NPC-465', 'NPC-902');

ALTER TABLE maps ADD COLUMN realm_id TEXT REFERENCES realms(id) ON DELETE SET NULL;
UPDATE maps SET realm_id = CASE
  WHEN lower(name) LIKE '%ethereal%' AND EXISTS (SELECT 1 FROM realms WHERE id = 'ethereal') THEN 'ethereal'
  ELSE 'world' END;

ALTER TABLE timeline_rows ADD COLUMN realm_ids TEXT NOT NULL DEFAULT '[]';
UPDATE timeline_rows SET realm_ids = '[' || rtrim(
    (CASE WHEN lower(realm_label) LIKE '%aetheris%' OR lower(realm_label) LIKE '%both%' THEN '"aetheris",' ELSE '' END) ||
    (CASE WHEN lower(realm_label) LIKE '%kaelmar%' OR lower(realm_label) LIKE '%both%' THEN '"kaelmar",' ELSE '' END) ||
    (CASE WHEN lower(realm_label) LIKE '%ethereal%' THEN '"ethereal",' ELSE '' END) ||
    (CASE WHEN lower(realm_label) LIKE '%world%' THEN '"world",' ELSE '' END), ',') || ']';
-- Only realms the library has (a "Both" row in a library without Kaelmar names just Aetheris).
UPDATE timeline_rows SET realm_ids = (SELECT json_group_array(value) FROM json_each(timeline_rows.realm_ids) WHERE value IN (SELECT id FROM realms));

ALTER TABLE campaigns ADD COLUMN world_id TEXT REFERENCES realms(id) ON DELETE SET NULL;
UPDATE campaigns SET world_id = 'world';
`,
  },
  {
    version: 20,
    name: 'the record-type registry: kinds of record with their prefixes, traits, icons and pin kinds',
    // The built-in types are written by syncBuiltinTypes (server/src/repo/recordTypes.ts) at every start, from
    // shared/recordTypes.ts; a GM's own types (and, from step 3, packs') are rows here too.
    sql: `
CREATE TABLE record_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  plural TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT 'file',
  pin TEXT CHECK (pin IN ('area','site')),
  category TEXT NOT NULL DEFAULT 'thing',
  browse TEXT NOT NULL DEFAULT '[]',
  handbook TEXT NOT NULL DEFAULT 'other',
  traits TEXT NOT NULL DEFAULT '{}',
  aliases TEXT NOT NULL DEFAULT '[]',
  pack_id TEXT,
  builtin INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
  {
    version: 21,
    name: "templates with guidance: each template's facts and sections, with what to write, an example and who it's for",
    // Built-in templates (assets/templates) are written at every start by syncBuiltinTemplates; the archive's stay as
    // imported; the GM's own are origin 'user'.
    sql: `
ALTER TABLE templates ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE templates ADD COLUMN spec TEXT NOT NULL DEFAULT '{}';
ALTER TABLE templates ADD COLUMN updated_at TEXT;
`,
  },
  {
    version: 22,
    name: 'setting packs: which packs a library has, and which pack each shipped row came from',
    // A library that already holds the Worldkeeper setting becomes "a library with the Worldkeeper pack installed":
    // the rows it shipped (everything not the GM's own) are marked as the pack's. Shipped maps, adventures, tables and
    // curated links are marked by the pack's next update, which matches them against its content.
    sql: `
CREATE TABLE setting_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
ALTER TABLE entities ADD COLUMN pack_id TEXT;
ALTER TABLE relationships ADD COLUMN pack_id TEXT;
ALTER TABLE timeline_rows ADD COLUMN pack_id TEXT;
ALTER TABLE rumours ADD COLUMN pack_id TEXT;
ALTER TABLE mysteries ADD COLUMN pack_id TEXT;
ALTER TABLE secrets ADD COLUMN pack_id TEXT;
ALTER TABLE clues ADD COLUMN pack_id TEXT;
ALTER TABLE maps ADD COLUMN pack_id TEXT;
ALTER TABLE map_markers ADD COLUMN pack_id TEXT;
ALTER TABLE map_shapes ADD COLUMN pack_id TEXT;
ALTER TABLE adventures ADD COLUMN pack_id TEXT;
ALTER TABLE random_tables ADD COLUMN pack_id TEXT;
ALTER TABLE templates ADD COLUMN pack_id TEXT;
ALTER TABLE realms ADD COLUMN pack_id TEXT;
ALTER TABLE eras ADD COLUMN pack_id TEXT;
CREATE INDEX idx_entities_pack ON entities(pack_id);

INSERT INTO setting_packs (id, name, version)
  SELECT 'worldkeeper', 'The Worldkeeper setting', '0.4.2'
  WHERE EXISTS (SELECT 1 FROM realms WHERE id IN ('aetheris','kaelmar','ethereal'));
UPDATE entities SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE relationships SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE timeline_rows SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE rumours SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE mysteries SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE secrets SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE clues SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE templates SET pack_id = 'worldkeeper' WHERE origin = 'import' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE eras SET pack_id = 'worldkeeper' WHERE origin <> 'user' AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper');
UPDATE realms SET pack_id = 'worldkeeper' WHERE id NOT IN ('world') AND EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper')
  AND id IN ('aetheris','kaelmar','ethereal','evershroud','hollow-verge','fields-of-lost-realities','ossuary-of-kings','silent-archive','loom-of-eternity','citadel-of-the-hidden','black-horizon');
UPDATE record_types SET pack_id = 'worldkeeper', builtin = 0 WHERE key IN ('vault','vault_key','shard','calling','ethereal_domain');
`,
  },
  {
    version: 23,
    name: 'modules: switches per library and per campaign; module data out of the core tables (Thinning, fading)',
    sql: `
-- A campaign's own module switches (JSON, only those it sets differently from the library).
ALTER TABLE campaigns ADD COLUMN modules TEXT;

-- A module's data about a character or a treasure (Thinning's track and true names; fading and anchoring).
CREATE TABLE module_data (
  module TEXT NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('character', 'treasure')),
  owner_id INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (module, owner, owner_id)
);
CREATE TRIGGER module_data_character_gone AFTER DELETE ON characters BEGIN
  DELETE FROM module_data WHERE owner = 'character' AND owner_id = OLD.id;
END;
CREATE TRIGGER module_data_treasure_gone AFTER DELETE ON party_treasure BEGIN
  DELETE FROM module_data WHERE owner = 'treasure' AND owner_id = OLD.id;
END;

INSERT INTO module_data (module, owner, owner_id, data, updated_at)
  SELECT 'thinning', 'character', character_id,
    json_object('true_name', true_name, 'memories', json(memories), 'known_by', json(known_by), 'thinning', thinning,
      'shardscarred', CASE WHEN shardscarred THEN json('true') ELSE json('false') END),
    updated_at
  FROM character_pages
  WHERE true_name <> '' OR memories <> '[]' OR known_by <> '[]' OR thinning <> 0 OR shardscarred <> 0;
CREATE TABLE character_pages_core (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO character_pages_core (character_id, code, notes, updated_at) SELECT character_id, code, notes, updated_at FROM character_pages;
DROP TABLE character_pages;
ALTER TABLE character_pages_core RENAME TO character_pages;

INSERT INTO module_data (module, owner, owner_id, data)
  SELECT 'fading-salvage', 'treasure', id,
    json_object('fades', CASE WHEN fades THEN json('true') ELSE json('false') END, 'anchored', CASE WHEN anchored THEN json('true') ELSE json('false') END)
  FROM party_treasure WHERE fades <> 0 OR anchored <> 0;
ALTER TABLE party_treasure DROP COLUMN fades;
ALTER TABLE party_treasure DROP COLUMN anchored;

-- The clock's stages come from its pack: no fixed number.
CREATE TABLE return_clock_any (
  campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage >= 0),
  held_until TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO return_clock_any SELECT campaign_id, stage, held_until, updated_at FROM return_clock;
DROP TABLE return_clock;
ALTER TABLE return_clock_any RENAME TO return_clock;

-- The campaign mechanics a library chose (v0.4.0 to v0.4.3) become its module switches.
INSERT INTO settings (key, value)
  SELECT 'modules', json_object(
    'thinning', CASE WHEN json_extract(value, '$.thinning') THEN json('true') ELSE json('false') END,
    'the-return', CASE WHEN json_extract(value, '$.theReturn') THEN json('true') ELSE json('false') END,
    'fading-salvage', CASE WHEN json_extract(value, '$.fading') THEN json('true') ELSE json('false') END,
    'setting-treasure', CASE WHEN json_extract(value, '$.worldTreasure') THEN json('true') ELSE json('false') END,
    'vaults', CASE WHEN json_extract(value, '$.setting') THEN json('true') ELSE json('false') END,
    'shards', CASE WHEN json_extract(value, '$.setting') THEN json('true') ELSE json('false') END,
    'depths-explorer', CASE WHEN json_extract(value, '$.setting') THEN json('true') ELSE json('false') END,
    'quick-reference', CASE WHEN json_extract(value, '$.setting') THEN json('true') ELSE json('false') END)
  FROM settings WHERE key = 'mechanics'
  ON CONFLICT(key) DO NOTHING;
DELETE FROM settings WHERE key = 'mechanics';
-- Faction standing was always there: a library with campaigns keeps it.
INSERT INTO settings (key, value) SELECT 'modules', '{}' WHERE EXISTS (SELECT 1 FROM campaigns) ON CONFLICT(key) DO NOTHING;
UPDATE settings SET value = json_set(value, '$.renown', json('true')) WHERE key = 'modules' AND EXISTS (SELECT 1 FROM campaigns);
`,
  },
  {
    version: 24,
    name: 'calendars as data: a calendar per world, and campaign dates as a year and a day',
    sql: `
CREATE TABLE calendars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  def TEXT NOT NULL,
  pack_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE realms ADD COLUMN calendar_id TEXT REFERENCES calendars(id) ON DELETE SET NULL;
-- Filled from the old text dates at start, through the campaign's calendar (server/src/repo/calendars.ts).
ALTER TABLE campaigns ADD COLUMN date_year INTEGER;
ALTER TABLE campaigns ADD COLUMN date_day INTEGER;
ALTER TABLE campaigns ADD COLUMN start_year INTEGER;
ALTER TABLE campaigns ADD COLUMN start_day INTEGER;
`,
  },
  {
    version: 25,
    name: 'random tables belong to a region and a level band; generated tables are marked',
    sql: `
ALTER TABLE random_tables ADD COLUMN region_id TEXT;
ALTER TABLE random_tables ADD COLUMN level_min INTEGER;
ALTER TABLE random_tables ADD COLUMN level_max INTEGER;
ALTER TABLE random_tables ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';
ALTER TABLE random_tables ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
-- A region named in the source ("Worldkeeper additions (REG-001)"); the level band is read at start (tables.ts).
UPDATE random_tables SET region_id = substr(source, instr(source, '(') + 1, instr(source, ')') - instr(source, '(') - 1)
  WHERE source LIKE '%(%)%' AND instr(source, ')') > instr(source, '(');
UPDATE random_tables SET kind = 'encounter' WHERE name LIKE 'Encounters%';
UPDATE random_tables SET kind = 'treasure' WHERE name LIKE 'Treasure%';
CREATE INDEX idx_random_tables_region ON random_tables(region_id);
`,
  },
  {
    version: 26,
    name: "stat blocks in the library: the GM's own, for their own creatures and people",
    sql: `
CREATE TABLE statblocks (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- An openly licensed rules pack the GM chooses to publish goes into the players' handbook.
ALTER TABLE rules_packs ADD COLUMN publish INTEGER NOT NULL DEFAULT 0;
-- The setting's stat blocks now come with its rules pack: a library with the setting that never chose keeps them.
INSERT INTO settings (key, value) SELECT 'rules_worldkeeper', 'on' WHERE EXISTS (SELECT 1 FROM setting_packs WHERE id = 'worldkeeper')
  ON CONFLICT(key) DO NOTHING;
`,
  },
  {
    version: 27,
    name: 'dates for sessions and timeline rows',
    // A session's in-world date, and a timeline row's year (and day, when it names one), through the world's calendar.
    // The text stays as written; startup reads existing text into them (calendars.ts adoptSessionDates, adoptTimelineDates).
    sql: `
ALTER TABLE sessions ADD COLUMN date_year INTEGER;
ALTER TABLE sessions ADD COLUMN date_day INTEGER;
ALTER TABLE timeline_rows ADD COLUMN year INTEGER;
ALTER TABLE timeline_rows ADD COLUMN day INTEGER;
`,
  },
  {
    version: 28,
    name: 'reveals per campaign',
    // What one campaign's players have learned (docs/LIBRARIES_PLAN.md §2.1). A record's own reveal columns keep
    // meaning "revealed to everyone"; these add what only one campaign knows. Maps, pins and outlines the same way.
    sql: `
CREATE TABLE campaign_reveals (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  revealed INTEGER NOT NULL DEFAULT 1,
  revealed_sections TEXT NOT NULL DEFAULT '[]',
  revealed_facts TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, entity_id)
);
CREATE INDEX campaign_reveals_entity ON campaign_reveals(entity_id);
CREATE TABLE campaign_map_reveals (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('map', 'marker', 'shape')),
  ref_id INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, kind, ref_id)
);
`,
  },
  {
    version: 29,
    name: 'campaign handbook codes',
    // Each campaign's handbook address on the table server, /player/c/<code> (docs/LIBRARIES_PLAN.md §2.3). Codes are
    // given at startup and when a campaign is first shown (repo/handbookCodes.ts).
    sql: `
ALTER TABLE campaigns ADD COLUMN handbook_code TEXT;
CREATE UNIQUE INDEX campaigns_handbook_code ON campaigns(handbook_code) WHERE handbook_code IS NOT NULL;
`,
  },
  {
    version: 30,
    name: "each library's own switches for the shared books' rules",
    // Your books' rules move to shared/rules.db, imported once for every library (docs/LIBRARIES_PLAN.md §3.3); each
    // library keeps whether it uses a pack, and whether it publishes it. Filled, and the old tables emptied, when the
    // library opens (repo/sharedRules.ts adoptSharedRules).
    sql: `
CREATE TABLE rules_pack_switches (
  pack_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  publish INTEGER NOT NULL DEFAULT 0
);
`,
  },
  {
    version: 31,
    name: 'undo for faction plans and campaign changes',
    // One GM action (record a change, advance a plan, edit or delete one) is one undo step: triggers (made when the
    // library opens, repo/undo.ts) record each row's before and after while an action runs.
    sql: `
CREATE TABLE undo_actions (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  campaign_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  undone_at TEXT
);
CREATE TABLE undo_rows (
  id INTEGER PRIMARY KEY,
  action_id INTEGER REFERENCES undo_actions(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  before TEXT,
  after TEXT
);
CREATE INDEX undo_rows_action ON undo_rows(action_id);
CREATE TABLE undo_recording (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), recording INTEGER NOT NULL DEFAULT 0);
INSERT INTO undo_recording (singleton, recording) VALUES (1, 0);
`,
  },
  {
    version: 32,
    name: "a library uses only the books it's switched on for",
    // From v0.6.8 a book's rules are off in a library until it's switched on there (importing a book switches it on
    // in the open library). A library from before used every book it had no switch for: when it opens, those books
    // get a switch, on, so it keeps them (repo/sharedRules.ts keepOldDefaults). A new library has nothing to keep.
    sql: `
CREATE TABLE rules_switches_pending (singleton INTEGER PRIMARY KEY CHECK (singleton = 1));
`,
    onUpgrade: `INSERT INTO rules_switches_pending (singleton) VALUES (1);`,
  },
  {
    version: 33,
    name: 'timeline rows players know',
    // A history row can be revealed like a record: to everyone (player_visible) or to one campaign. Nothing was
    // revealed before, so older libraries need nothing done.
    sql: `
ALTER TABLE timeline_rows ADD COLUMN player_visible INTEGER NOT NULL DEFAULT 0;
CREATE TABLE campaign_timeline_reveals (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  row_id INTEGER NOT NULL REFERENCES timeline_rows(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, row_id)
);
`,
  },
  {
    version: 34,
    name: 'pictures on records',
    // Any record can have pictures; the first is the record's picture. `origin` is a worldbook's own name for one, so
    // an update doesn't add it twice; `removed` marks one of those the GM removed, so an update doesn't bring it back.
    sql: `
CREATE TABLE entity_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  player_visible INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  origin TEXT,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX entity_images_entity ON entity_images(entity_id, sort_order);
`,
    // The portrait an NPC's or faction's profile had becomes the record's first picture (GM-only, as it was).
    onUpgrade: `
INSERT INTO entity_images (entity_id, file)
SELECT p.entity_id, json_extract(p.data, '$.portrait') FROM profiles p
WHERE p.campaign_id = 0 AND COALESCE(json_extract(p.data, '$.portrait'), '') <> '' AND p.entity_id IN (SELECT id FROM entities);
`,
  },
];

export function migrate(db: Database.Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const upgrading = applied.size > 0;
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const run = db.transaction(() => {
      db.exec(m.sql);
      if (upgrading && m.onUpgrade) db.exec(m.onUpgrade);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });
    run();
    count++;
  }
  return count;
}

export function schemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  return row.v ?? 0;
}
