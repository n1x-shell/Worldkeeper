import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { parseJson, now } from '../lib/json.js';
import { badRequest } from '../lib/errors.js';
import { getEntity } from './entities.js';
import { splitSections } from '../import/parseMarkdown.js';
import { extractRefs } from '../import/normalize.js';
import { indexAux } from './search.js';
import { profileFields, profileKindFor, type ProfileData, type ProfileField, type ProfileKind } from '../../../shared/profiles.js';

export interface SourceValue {
  text: string;
  from: string;
  refs: string[];
}

/** Read-only values the imported record already provides for each profile field. */
export function extractSourceValues(db: DB, entityId: string, fields: ProfileField[]): Record<string, SourceValue[]> {
  const e = getEntity(db, entityId);
  const sections = splitSections(e.body);
  const out: Record<string, SourceValue[]> = {};
  const rels = db
    .prepare(
      `SELECT r.type, r.source_id, r.target_id, s.name AS source_name, t.name AS target_name FROM relationships r
       LEFT JOIN entities s ON s.id = r.source_id LEFT JOIN entities t ON t.id = r.target_id
       WHERE (r.source_id = ? OR r.target_id = ?) AND r.origin IN ('user','import-field','import-parent')`,
    )
    .all(entityId, entityId) as { type: string; source_id: string; target_id: string; source_name: string; target_name: string }[];
  for (const f of fields) {
    const vals: SourceValue[] = [];
    if (f.source?.fields) {
      const re = new RegExp(f.source.fields, 'i');
      for (const [k, v] of e.fields) if (re.test(k) && v.trim()) vals.push({ text: v, from: `Field: ${k}`, refs: extractRefs(v) });
    }
    if (f.source?.sections) {
      const re = new RegExp(f.source.sections, 'i');
      for (const s of sections) if (s.heading && re.test(s.heading) && s.content.trim()) vals.push({ text: s.content, from: `Section: ${s.heading}`, refs: extractRefs(s.content) });
    }
    if (f.relationships?.length) {
      const refs = rels
        .filter((r) => f.relationships!.includes(r.type))
        .filter((r) => (f.key === 'leaders' ? r.target_id === entityId : true))
        .map((r) => (r.source_id === entityId ? r.target_id : r.source_id));
      const uniq = [...new Set(refs)];
      if (uniq.length) vals.push({ text: uniq.map((id) => `[${id}]`).join(', '), from: `Relationships: ${f.relationships.join(', ')}`, refs: uniq });
    }
    out[f.key] = vals;
  }
  return out;
}

function valueSchema(f: ProfileField) {
  switch (f.type) {
    case 'short':
      return z.string().max(500);
    case 'text':
    case 'stats':
      return z.string().max(50_000);
    case 'image':
      return z.string().regex(/^[\w.-]+\.(png|jpg|webp|gif)$/).max(200);
    case 'ref':
      return z.string().max(40);
    case 'refs':
      return z.array(z.string().max(40)).max(200);
    case 'list':
      return z.array(z.string().max(2000)).max(200);
    case 'influence':
      return z.array(z.object({ region: z.string().max(300), level: z.string().max(60), note: z.string().max(2000).default('') })).max(200);
  }
}

export function kindOf(db: DB, entityId: string): ProfileKind {
  const kind = profileKindFor(getEntity(db, entityId).type);
  if (!kind) throw badRequest('Profiles exist for NPCs, factions, cults and families');
  return kind;
}

function readData(db: DB, entityId: string, campaignId: number): ProfileData {
  const row = db.prepare('SELECT data FROM profiles WHERE entity_id = ? AND campaign_id = ?').get(entityId, campaignId) as { data: string } | undefined;
  return parseJson<ProfileData>(row?.data, {});
}

export function getProfile(db: DB, entityId: string, campaignId: number | null) {
  const kind = kindOf(db, entityId);
  const fields = profileFields(kind);
  let lastLogged: { text: string; session_number: number; session_title: string; played_on: string; created_at: string } | null = null;
  if (campaignId) {
    lastLogged =
      (db
        .prepare(
          `SELECT l.text, l.created_at, s.number AS session_number, s.title AS session_title, s.played_on FROM session_log l
           JOIN sessions s ON s.id = l.session_id WHERE l.entity_id = ? AND s.campaign_id = ? ORDER BY l.id DESC LIMIT 1`,
        )
        .get(entityId, campaignId) as typeof lastLogged) ?? null;
  }
  return {
    entityId,
    kind,
    fields,
    source: extractSourceValues(db, entityId, fields),
    world: readData(db, entityId, 0),
    campaignId,
    campaign: campaignId ? readData(db, entityId, campaignId) : null,
    lastLogged,
  };
}

/**
 * Save DM values for one scope. Keys are merged; an empty string/array removes a key.
 * World-scope values are DM additions shown beside (never replacing) the source text.
 */
export function saveProfile(db: DB, entityId: string, scope: 'world' | 'campaign', campaignId: number | null, patch: unknown) {
  const kind = kindOf(db, entityId);
  const fields = profileFields(kind).filter((f) => f.scope === scope);
  if (scope === 'campaign') {
    if (!campaignId) throw badRequest('Campaign fields need an active campaign');
    if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw badRequest('Unknown campaign');
  }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw badRequest('Profile data must be an object');
  const cid = scope === 'world' ? 0 : campaignId!;
  const data = readData(db, entityId, cid);
  for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
    const f = fields.find((x) => x.key === key);
    if (!f) throw badRequest(`Unknown ${scope} profile field: ${key}`);
    const v = valueSchema(f).parse(raw) as ProfileData[string];
    const empty = v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) delete data[key];
    else data[key] = v;
  }
  db.prepare(
    `INSERT INTO profiles (entity_id, campaign_id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(entity_id, campaign_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(entityId, cid, JSON.stringify(data), now());
  const flat = Object.values(data)
    .map((v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : `${x.region} ${x.level} ${x.note}`)).join(' ') : ''))
    .join('\n');
  indexAux(db, 'profile', `${entityId}:${cid}`, `${getEntity(db, entityId).name} (profile)`, flat);
  return getProfile(db, entityId, campaignId);
}

/** Influence-by-region matrix across factions for one campaign (from campaign profiles). */
export function influenceMatrix(db: DB, campaignId: number) {
  const rows = db
    .prepare(`SELECT p.entity_id, p.data, e.name FROM profiles p JOIN entities e ON e.id = p.entity_id WHERE p.campaign_id = ?`)
    .all(campaignId) as { entity_id: string; data: string; name: string }[];
  const out: { faction_id: string; faction_name: string; region: string; level: string; note: string }[] = [];
  for (const r of rows) {
    const d = parseJson<ProfileData>(r.data, {});
    const inf = d.influence;
    if (Array.isArray(inf)) for (const i of inf) if (typeof i === 'object') out.push({ faction_id: r.entity_id, faction_name: r.name, ...i });
  }
  return out;
}
