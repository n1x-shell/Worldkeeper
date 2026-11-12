import type Database from 'better-sqlite3';

/**
 * Ordered, append-only schema migrations.
 * NEVER edit a migration that has shipped; add a new one instead.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
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
];

export function migrate(db: Database.Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const run = db.transaction(() => {
      db.exec(m.sql);
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
