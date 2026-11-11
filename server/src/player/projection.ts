/**
 * PLAYER-SAFE DATA PROJECTION
 *
 * This module is the only path by which data reaches players. It builds brand-new objects from an
 * allow-list of fields; it never spreads a database row. Rules:
 *  - A record appears only if the DM has marked it revealed.
 *  - Its text consists ONLY of: the DM-written player summary, the DM-revealed facts, and sections the DM
 *    explicitly revealed whose headings are not GM-only/secret headings.
 *  - Aliases, sources, notes, fields, canon flags, GM sections and unrevealed records are never included.
 *  - References inside revealed text to unrevealed records are reduced to plain names-free placeholders.
 */
import type { DB } from '../db/connection.js';
import { BRACKET_REF_RE, SECRET_HEADING_RE, ENTITY_TYPE_LABELS, REALM_LABELS, type EntityType, type Realm } from '../../../shared/domain.js';
import { parseJson } from '../lib/json.js';
import { splitSections } from '../import/parseMarkdown.js';

export interface PlayerEntity {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  realm: string;
  realmLabel: string;
  summary: string;
  facts: string[];
  sections: { heading: string; content: string }[];
}

interface Row {
  id: string;
  name: string;
  type: string;
  realm: string;
  body: string;
  player_summary: string;
  revealed_sections: string;
  revealed_facts: string;
  revealed: number;
  archived: number;
}

export function isSecretHeading(heading: string) {
  return SECRET_HEADING_RE.test(heading);
}

function revealedIdSet(db: DB): Set<string> {
  return new Set((db.prepare('SELECT id FROM entities WHERE revealed = 1 AND archived = 0').all() as { id: string }[]).map((r) => r.id));
}

/** Replace `Name [ID]` references to unrevealed records so no hidden record's ID leaks. */
function scrubRefs(text: string, revealed: Set<string>): string {
  return text.replace(BRACKET_REF_RE(), (m, id: string) => (revealed.has(id) ? m : ''));
}

function project(r: Row, revealed: Set<string>): PlayerEntity {
  const wanted = new Set(parseJson<string[]>(r.revealed_sections, []));
  const sections = splitSections(r.body)
    .filter((s) => s.heading && wanted.has(s.heading) && !isSecretHeading(s.heading))
    .map((s) => ({ heading: s.heading, content: scrubRefs(s.content, revealed) }));
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    typeLabel: ENTITY_TYPE_LABELS[r.type as EntityType] ?? r.type,
    realm: r.realm,
    realmLabel: REALM_LABELS[r.realm as Realm] ?? r.realm,
    summary: scrubRefs(r.player_summary, revealed),
    facts: parseJson<string[]>(r.revealed_facts, []).map((f) => scrubRefs(f, revealed)),
    sections,
  };
}

const COLS = 'id, name, type, realm, body, player_summary, revealed_sections, revealed_facts, revealed, archived';

export function playerEntities(db: DB): PlayerEntity[] {
  const revealed = revealedIdSet(db);
  return (db.prepare(`SELECT ${COLS} FROM entities WHERE revealed = 1 AND archived = 0 ORDER BY name`).all() as Row[]).map((r) =>
    project(r, revealed),
  );
}

export function playerEntity(db: DB, id: string): PlayerEntity | null {
  const r = db.prepare(`SELECT ${COLS} FROM entities WHERE id = ? AND revealed = 1 AND archived = 0`).get(id) as Row | undefined;
  return r ? project(r, revealedIdSet(db)) : null;
}

export function playerSearch(db: DB, q: string): PlayerEntity[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return playerEntities(db).filter((e) =>
    [e.name, e.summary, ...e.facts, ...e.sections.map((s) => s.heading + ' ' + s.content)].join('\n').toLowerCase().includes(needle),
  );
}

export function playerMaps(db: DB) {
  const revealed = revealedIdSet(db);
  const maps = db.prepare('SELECT id, name, kind, parent_map_id, image_file, width, height FROM maps WHERE player_visible = 1 ORDER BY name').all() as {
    id: number;
    name: string;
    kind: string;
    parent_map_id: number | null;
    image_file: string | null;
    width: number;
    height: number;
  }[];
  const visibleMapIds = new Set(maps.map((m) => m.id));
  return maps.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    parent_map_id: m.parent_map_id && visibleMapIds.has(m.parent_map_id) ? m.parent_map_id : null,
    image_file: m.image_file,
    width: m.width,
    height: m.height,
    markers: (
      db.prepare('SELECT id, entity_id, label, x, y, category, child_map_id FROM map_markers WHERE map_id = ? AND hidden = 0').all(m.id) as {
        id: number;
        entity_id: string | null;
        label: string;
        x: number;
        y: number;
        category: string;
        child_map_id: number | null;
      }[]
    ).map((mk) => ({
      id: mk.id,
      label: mk.label,
      x: mk.x,
      y: mk.y,
      category: mk.category,
      entity_id: mk.entity_id && revealed.has(mk.entity_id) ? mk.entity_id : null,
      child_map_id: mk.child_map_id && visibleMapIds.has(mk.child_map_id) ? mk.child_map_id : null,
    })),
    shapes: (
      db.prepare('SELECT id, kind, label, points, color FROM map_shapes WHERE map_id = ? AND hidden = 0').all(m.id) as {
        id: number;
        kind: string;
        label: string;
        points: string;
        color: string;
      }[]
    ).map((s) => ({ id: s.id, kind: s.kind, label: s.label, color: s.color, points: parseJson<[number, number][]>(s.points, []) })),
  }));
}

export function playerCampaign(db: DB, campaignId: number) {
  const c = db.prepare('SELECT id, title, current_date FROM campaigns WHERE id = ?').get(campaignId) as
    | { id: number; title: string; current_date: string }
    | undefined;
  if (!c) return null;
  const quests = db
    .prepare(`SELECT id, title, status, description FROM quests WHERE campaign_id = ? AND player_visible = 1 ORDER BY status = 'completed', id`)
    .all(campaignId) as { id: number; title: string; status: string; description: string }[];
  const recaps = db
    .prepare(`SELECT id, number, title, played_on, recap FROM sessions WHERE campaign_id = ? AND recap_player_visible = 1 ORDER BY number`)
    .all(campaignId) as { id: number; number: number; title: string; played_on: string; recap: string }[];
  const revealed = revealedIdSet(db);
  return {
    id: c.id,
    title: c.title,
    current_date: c.current_date,
    quests: quests.map((q) => ({ id: q.id, title: q.title, status: q.status, description: scrubRefs(q.description, revealed) })),
    recaps: recaps.map((r) => ({ id: r.id, number: r.number, title: r.title, played_on: r.played_on, recap: scrubRefs(r.recap, revealed) })),
  };
}

export function playerCampaigns(db: DB) {
  return (db.prepare(`SELECT id FROM campaigns WHERE status != 'archived' ORDER BY id`).all() as { id: number }[]).map((c) => playerCampaign(db, c.id)!);
}

export function playerSnapshot(db: DB) {
  return {
    app: 'worldkeeper-player-snapshot',
    generated_at: new Date().toISOString(),
    entities: playerEntities(db),
    maps: playerMaps(db),
    campaigns: playerCampaigns(db),
  };
}
