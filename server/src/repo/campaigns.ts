import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { makeCrud, zId, zText } from './crud.js';
import { indexAux, removeAux } from './search.js';
import { parseJson, now } from '../lib/json.js';
import { badRequest, notFound } from '../lib/errors.js';
import { acceptAsBaseline, getEntity, updateEntity } from './entities.js';
import { loadMentionIndex } from './mentions.js';

// ---------- Campaigns ----------
export const campaigns = makeCrud({
  table: 'campaigns',
  schema: z.object({
    title: z.string().trim().min(1).max(300),
    premise: zText().default(''),
    starting_location_id: zId,
    starting_date: z.string().max(200).default('300 AB / Year 31 Unbound'),
    current_date: z.string().max(200).default('300 AB / Year 31 Unbound'),
    status: z.enum(['planning', 'active', 'paused', 'completed', 'archived']).default('planning'),
    players: z.array(z.object({ name: z.string().max(200), contact: z.string().max(300).default('') })).max(50).default([]),
    active_factions: z.array(z.string().max(40)).max(200).default([]),
    notes: zText().default(''),
  }),
  jsonColumns: ['players', 'active_factions'],
  orderBy: 'updated_at DESC',
});

export const characters = makeCrud({
  table: 'characters',
  schema: z.object({
    campaign_id: z.number().int(),
    name: z.string().trim().min(1).max(200),
    player: z.string().max(200).default(''),
    kind: z.enum(['pc', 'companion', 'retired', 'dead']).default('pc'),
    species: z.string().max(200).default(''),
    class_name: z.string().max(200).default(''),
    level: z.number().int().min(1).max(20).default(1),
    sheet: z
      .object({
        abilities: z.record(z.string(), z.number().int().min(1).max(30)).optional(),
        saves: z.array(z.string()).optional(),
        skills: z.array(z.string()).optional(),
        ac: z.number().int().min(0).max(50).optional(),
        maxHp: z.number().int().min(0).max(2000).optional(),
        hp: z.number().int().min(-2000).max(2000).optional(),
        initiativeBonus: z.number().int().min(-10).max(30).optional(),
        speed: z.string().max(100).optional(),
        spellSlots: z.record(z.string(), z.object({ max: z.number().int(), used: z.number().int() })).optional(),
        concentration: z.string().max(200).nullable().optional(),
        conditions: z.array(z.string()).optional(),
        exhaustion: z.number().int().min(0).max(6).optional(),
        equipment: z.string().max(20000).optional(),
        lastRest: z.string().max(200).optional(),
        shardscarred: z.string().max(5000).optional(),
      })
      .passthrough()
      .default({}),
    notes: zText().default(''),
  }),
  jsonColumns: ['sheet'],
  orderBy: 'kind, name',
});

export const quests = makeCrud({
  table: 'quests',
  schema: z.object({
    campaign_id: z.number().int(),
    title: z.string().trim().min(1).max(300),
    status: z.enum(['open', 'active', 'completed', 'failed', 'abandoned', 'rumoured']).default('open'),
    description: zText().default(''),
    giver_id: zId,
    location_id: zId,
    player_visible: z.boolean().default(false),
    notes: zText().default(''),
  }),
  boolColumns: ['player_visible'],
  orderBy: "status = 'completed', updated_at DESC",
  onChange: (db, r) => indexAux(db, 'quest', r.id as number, r.title as string, `${r.description}\n${r.notes}`),
  onDelete: (db, id) => removeAux(db, 'quest', id),
});

const adventureData = z
  .object({
    premise: z.string().max(50000).default(''),
    hook: z.string().max(50000).default(''),
    stakes: z.string().max(50000).default(''),
    opposition: z.string().max(50000).default(''),
    clues: z.array(z.object({ text: z.string().max(5000), found: z.boolean().default(false) })).default([]),
    obstacles: z.string().max(50000).default(''),
    encounters: z.string().max(50000).default(''),
    rewards: z.string().max(50000).default(''),
    approaches: z.string().max(50000).default(''),
    consequences: z.string().max(50000).default(''),
    ifIgnored: z.string().max(50000).default(''),
  })
  .passthrough();

export const adventures = makeCrud({
  table: 'adventures',
  schema: z.object({
    campaign_id: z.number().int().nullable().optional(),
    title: z.string().trim().min(1).max(300),
    status: z.enum(['draft', 'ready', 'running', 'completed', 'shelved']).default('draft'),
    arc: z.string().max(300).default(''),
    source_hook_id: zId,
    data: adventureData.default(adventureData.parse({})),
    linked_ids: z.array(z.string().max(40)).max(500).default([]),
  }),
  jsonColumns: ['data', 'linked_ids'],
  orderBy: 'updated_at DESC',
  onChange: (db, r) => indexAux(db, 'adventure', r.id as number, r.title as string, JSON.stringify(r.data)),
  onDelete: (db, id) => removeAux(db, 'adventure', id),
});

export const scenes = makeCrud({
  table: 'scenes',
  schema: z.object({
    adventure_id: z.number().int(),
    title: z.string().trim().min(1).max(300),
    kind: z.enum(['scene', 'location', 'encounter', 'clue', 'social', 'travel', 'climax', 'branch']).default('scene'),
    body: zText().default(''),
    read_aloud: zText().default(''),
    linked_ids: z.array(z.string().max(40)).max(200).default([]),
    sort_order: z.number().int().default(0),
    x: z.number().default(0),
    y: z.number().default(0),
  }),
  jsonColumns: ['linked_ids'],
  orderBy: 'sort_order, id',
});

export const sceneLinks = makeCrud({
  table: 'scene_links',
  schema: z.object({
    adventure_id: z.number().int(),
    from_scene: z.number().int(),
    to_scene: z.number().int(),
    label: z.string().max(300).default(''),
  }),
});

/** Copy a scene (and nothing else) into another adventure. */
export function copyScene(db: DB, sceneId: number, targetAdventureId: number) {
  const s = scenes.get(db, sceneId) as Record<string, unknown>;
  adventures.get(db, targetAdventureId);
  const { id: _id, adventure_id: _a, ...rest } = s;
  return scenes.create(db, { ...rest, adventure_id: targetAdventureId, title: `${s.title}` });
}

/** Create an adventure workspace from a source hook record without inventing content. */
export function adventureFromHook(db: DB, hookId: string, campaignId: number | null) {
  const hook = getEntity(db, hookId);
  return adventures.create(db, {
    campaign_id: campaignId,
    title: hook.name,
    source_hook_id: hook.id,
    linked_ids: [hook.id],
    data: { ...adventureData.parse({}), premise: `See the source hook ${loadMentionIndex(db).mentionFor(hook.id)}.` },
  });
}

// ---------- Sessions ----------
const prepSchema = z
  .object({
    recap: z.string().max(50000).default(''),
    partyLocation: z.string().max(2000).default(''),
    goals: z.string().max(50000).default(''),
    scenes: z.string().max(50000).default(''),
    npcNotes: z.string().max(50000).default(''),
    readAloud: z.string().max(50000).default(''),
    clues: z.string().max(50000).default(''),
    encounters: z.string().max(50000).default(''),
    treasure: z.string().max(50000).default(''),
    consequences: z.string().max(50000).default(''),
    questions: z.string().max(50000).default(''),
    relevantIds: z.array(z.string().max(40)).default([]),
    adventureIds: z.array(z.number().int()).default([]),
  })
  .passthrough();

export const sessions = makeCrud({
  table: 'sessions',
  schema: z.object({
    campaign_id: z.number().int(),
    number: z.number().int().min(0),
    title: z.string().max(300).default(''),
    status: z.enum(['planned', 'live', 'completed']).default('planned'),
    played_on: z.string().max(100).default(''),
    in_world_date: z.string().max(200).default(''),
    prep: prepSchema.default(prepSchema.parse({})),
    recap: zText().default(''),
    recap_player_visible: z.boolean().default(false),
    current_scene_id: z.number().int().nullable().optional(),
  }),
  jsonColumns: ['prep'],
  boolColumns: ['recap_player_visible'],
  orderBy: 'number DESC',
  onChange: (db, r) => indexAux(db, 'session', r.id as number, `Session ${r.number}: ${r.title}`, `${r.recap}\n${JSON.stringify(r.prep)}`),
  onDelete: (db, id) => removeAux(db, 'session', id),
});

export function createNextSession(db: DB, campaignId: number, title = '') {
  campaigns.get(db, campaignId);
  const last = db.prepare('SELECT * FROM sessions WHERE campaign_id = ? ORDER BY number DESC LIMIT 1').get(campaignId) as
    | { number: number; recap: string }
    | undefined;
  const prep = prepSchema.parse({ recap: last?.recap ?? '' });
  return sessions.create(db, { campaign_id: campaignId, number: (last?.number ?? 0) + 1, title, prep });
}

export const sessionLog = makeCrud({
  table: 'session_log',
  schema: z.object({
    session_id: z.number().int(),
    kind: z.enum(['note', 'quest', 'combat', 'npc', 'location', 'loot', 'change', 'scene', 'reveal']).default('note'),
    text: z.string().trim().min(1).max(20000),
    entity_id: zId,
  }),
  orderBy: 'id',
});

/** Build an editable recap draft strictly from what was recorded. Nothing is invented. */
export function generateRecapDraft(db: DB, sessionId: number): string {
  const s = sessions.get(db, sessionId) as { number: number; title: string; in_world_date: string; played_on: string; campaign_id: number };
  const log = sessionLog.list(db, { session_id: sessionId }) as { kind: string; text: string; entity_id: string | null; created_at: string }[];
  const mentions = loadMentionIndex(db);
  const name = (id: string | null) => (id && mentions.byId.has(id) ? ` (${mentions.mentionFor(id)})` : '');
  const sections: [string, string[]][] = [
    ['Scenes', []],
    ['Events and notes', []],
    ['People met', []],
    ['Places visited', []],
    ['Quest updates', []],
    ['Combat', []],
    ['Treasure and items', []],
    ['Revealed to players', []],
  ];
  const bucket: Record<string, number> = { scene: 0, note: 1, npc: 2, location: 3, quest: 4, combat: 5, loot: 6, reveal: 7 };
  for (const l of log) {
    if (l.kind === 'change') continue;
    sections[bucket[l.kind] ?? 1][1].push(`- ${l.text}${name(l.entity_id)}`);
  }
  const encs = db.prepare('SELECT title, round, combatants FROM encounters WHERE session_id = ?').all(sessionId) as {
    title: string;
    round: number;
    combatants: string;
  }[];
  for (const e of encs) {
    const cs = parseJson<{ name: string; defeated: boolean; hidden: boolean }[]>(e.combatants, []);
    sections[5][1].push(
      `- ${e.title}: ${e.round} round(s). Participants: ${cs.map((c) => c.name + (c.defeated ? ' (defeated)' : '')).join(', ') || 'none recorded'}.`,
    );
  }
  const changes = db
    .prepare(`SELECT entity_id, field, value, status FROM campaign_state WHERE session_id = ? ORDER BY id`)
    .all(sessionId) as { entity_id: string | null; field: string; value: string; status: string }[];
  const out = [
    `# Session ${s.number}${s.title ? `: ${s.title}` : ''}`,
    '',
    `_Draft generated from ${log.length} recorded log entr${log.length === 1 ? 'y' : 'ies'}. Edit before sharing; nothing here was added that was not recorded._`,
    s.in_world_date ? `\n**In-world date:** ${s.in_world_date}` : '',
    s.played_on ? `**Played on:** ${s.played_on}` : '',
  ];
  for (const [title, lines] of sections) if (lines.length) out.push('', `## ${title}`, ...lines);
  if (changes.length) {
    out.push('', '## Recorded world changes (campaign only)');
    for (const c of changes) out.push(`- ${c.field}: ${c.value}${name(c.entity_id)} _(${c.status})_`);
  }
  if (!log.length && !encs.length && !changes.length) out.push('', '_No events were recorded during this session._');
  return out.filter((l, i) => !(l === '' && out[i - 1] === '')).join('\n');
}

// ---------- Campaign state (overlay on canon; never edits the encyclopedia) ----------
export const campaignState = makeCrud({
  table: 'campaign_state',
  schema: z.object({
    campaign_id: z.number().int(),
    entity_id: zId,
    field: z.string().trim().min(1).max(200),
    value: z.string().max(20000),
    note: z.string().max(20000).default(''),
    session_id: z.number().int().nullable().optional(),
    status: z.enum(['proposed', 'active', 'superseded', 'rejected', 'promoted']).default('active'),
  }),
  orderBy: 'id DESC',
});

/** Recording a new value for (entity, field) supersedes the previous active one. */
export function recordState(db: DB, input: Record<string, unknown>) {
  const tx = db.transaction(() => {
    const row = campaignState.create(db, input) as { id: number; campaign_id: number; entity_id: string | null; field: string; status: string };
    if (row.status === 'active') supersede(db, row);
    return row;
  });
  return tx();
}

function supersede(db: DB, row: { id: number; campaign_id: number; entity_id: string | null; field: string }) {
  db.prepare(
    `UPDATE campaign_state SET status = 'superseded' WHERE campaign_id = ? AND field = ? AND status = 'active' AND id != ?
       AND ((entity_id IS NULL AND ? IS NULL) OR entity_id = ?)`,
  ).run(row.campaign_id, row.field, row.id, row.entity_id, row.entity_id);
}

export function decideState(db: DB, id: number, accept: boolean) {
  const row = campaignState.get(db, id) as { id: number; campaign_id: number; entity_id: string | null; field: string; status: string };
  if (row.status !== 'proposed') throw badRequest('Only proposed changes can be accepted or rejected');
  const tx = db.transaction(() => {
    campaignState.update(db, id, { status: accept ? 'active' : 'rejected' });
    if (accept) supersede(db, row);
  });
  tx();
  return campaignState.get(db, id);
}

export function stateForEntity(db: DB, entityId: string) {
  return db
    .prepare(
      `SELECT s.*, c.title AS campaign_title FROM campaign_state s JOIN campaigns c ON c.id = s.campaign_id
       WHERE s.entity_id = ? AND s.status IN ('active','proposed') ORDER BY s.id DESC`,
    )
    .all(entityId);
}

/** Ask for a campaign development to become world canon. Nothing changes until the DM approves. */
export function proposePromotion(db: DB, stateId: number, reason: string) {
  const s = campaignState.get(db, stateId) as { id: number; campaign_id: number; entity_id: string | null; field: string; value: string; note: string };
  if (!s.entity_id) throw badRequest('Only changes attached to a record can be promoted to canon');
  const c = campaigns.get(db, s.campaign_id) as { title: string };
  const res = db
    .prepare(`INSERT INTO proposals (kind, entity_id, campaign_id, title, payload, reason) VALUES ('campaign_promotion', ?, ?, ?, ?, ?)`)
    .run(s.entity_id, s.campaign_id, `${s.field} → ${s.value}`, JSON.stringify({ stateId: s.id, field: s.field, value: s.value, note: s.note, campaign: c.title }), reason);
  return Number(res.lastInsertRowid);
}

// ---------- Faction plans ----------
export const factionPlans = makeCrud({
  table: 'faction_plans',
  schema: z.object({
    campaign_id: z.number().int().nullable().optional(),
    faction_id: z.string().min(1).max(40),
    title: z.string().trim().min(1).max(300),
    goal: zText(50000).default(''),
    deadline: z.string().max(300).default(''),
    progress: z.number().int().min(0).max(100).default(0),
    segments: z.number().int().min(1).max(100).default(6),
    status: z.enum(['active', 'paused', 'succeeded', 'failed', 'abandoned']).default('active'),
    attitude: z.string().max(300).default(''),
    notes: zText().default(''),
  }),
  orderBy: "status != 'active', updated_at DESC",
});

/** Advancing a plan is always an explicit DM action and is logged in the campaign state. */
export function advancePlan(db: DB, id: number, delta: number, reason: string) {
  const p = factionPlans.get(db, id) as { progress: number; segments: number; campaign_id: number | null; faction_id: string; title: string };
  const progress = Math.max(0, Math.min(p.segments, p.progress + delta));
  const updated = factionPlans.update(db, id, { progress });
  if (p.campaign_id) {
    campaignState.create(db, {
      campaign_id: p.campaign_id,
      entity_id: p.faction_id,
      field: `Plan: ${p.title}`,
      value: `${progress}/${p.segments}`,
      note: reason,
      status: 'active',
    });
  }
  return updated;
}

// ---------- Encounters ----------
export const encounters = makeCrud({
  table: 'encounters',
  schema: z.object({
    campaign_id: z.number().int().nullable().optional(),
    session_id: z.number().int().nullable().optional(),
    title: z.string().trim().min(1).max(300),
    notes: zText().default(''),
    round: z.number().int().min(0).default(0),
    turn_index: z.number().int().min(0).default(0),
    status: z.enum(['prepared', 'running', 'finished']).default('prepared'),
    combatants: z
      .array(
        z.object({
          id: z.string().max(40),
          name: z.string().max(200),
          initiative: z.number().int().nullable(),
          initiativeBonus: z.number().int().default(0),
          hp: z.number().int(),
          maxHp: z.number().int(),
          tempHp: z.number().int().default(0),
          ac: z.number().int().nullable(),
          conditions: z.array(z.string().max(100)).default([]),
          concentration: z.string().max(200).nullable().default(null),
          isPC: z.boolean().default(false),
          hidden: z.boolean().default(false),
          entityId: z.string().max(40).nullable().default(null),
          notes: z.string().max(5000).default(''),
          defeated: z.boolean().default(false),
        }),
      )
      .max(200)
      .default([]),
  }),
  jsonColumns: ['combatants'],
  orderBy: 'updated_at DESC',
});

// ---------- Notes, random tables, dice ----------
export const notes = makeCrud({
  table: 'notes',
  schema: z.object({
    campaign_id: z.number().int().nullable().optional(),
    title: z.string().max(300).default('Untitled note'),
    body: zText(2_000_000).default(''),
    pinned: z.boolean().default(false),
  }),
  boolColumns: ['pinned'],
  orderBy: 'pinned DESC, updated_at DESC',
  onChange: (db, r) => indexAux(db, 'note', r.id as number, r.title as string, r.body as string),
  onDelete: (db, id) => removeAux(db, 'note', id),
});

export const randomTables = makeCrud({
  table: 'random_tables',
  schema: z.object({
    name: z.string().trim().min(1).max(300),
    die: z.string().max(50).default(''),
    entries: z.array(z.object({ weight: z.number().int().min(1).max(1000).default(1), text: z.string().max(5000) })).max(1000).default([]),
    source: z.string().max(1000).default('user'),
  }),
  jsonColumns: ['entries'],
  orderBy: 'name',
});

export function rollTable(db: DB, id: number, rng: () => number = Math.random) {
  const t = randomTables.get(db, id) as { name: string; entries: { weight: number; text: string }[] };
  if (!t.entries.length) throw badRequest('This table has no entries');
  const total = t.entries.reduce((a, e) => a + e.weight, 0);
  let r = Math.floor(rng() * total);
  for (const e of t.entries) {
    if (r < e.weight) return { table: t.name, result: e.text };
    r -= e.weight;
  }
  return { table: t.name, result: t.entries[t.entries.length - 1].text };
}

// ---------- Overview ----------
export function campaignOverview(db: DB, id: number) {
  const c = campaigns.get(db, id);
  return {
    campaign: c,
    characters: characters.list(db, { campaign_id: id }),
    quests: quests.list(db, { campaign_id: id }),
    sessions: sessions.list(db, { campaign_id: id }),
    adventures: adventures.list(db, { campaign_id: id }),
    plans: factionPlans.list(db, { campaign_id: id }),
    state: db.prepare(`SELECT s.*, e.name AS entity_name FROM campaign_state s LEFT JOIN entities e ON e.id = s.entity_id WHERE s.campaign_id = ? ORDER BY s.id DESC`).all(id),
    encounters: encounters.list(db, { campaign_id: id }),
  };
}

export function getActiveCampaignId(db: DB): number | null {
  const s = db.prepare(`SELECT value FROM settings WHERE key = 'active_campaign_id'`).get() as { value: string } | undefined;
  if (!s) return null;
  const id = Number(s.value);
  return db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(id) ? id : null;
}

export function setActiveCampaign(db: DB, id: number | null) {
  if (id == null) db.prepare(`DELETE FROM settings WHERE key = 'active_campaign_id'`).run();
  else {
    campaigns.get(db, id);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('active_campaign_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(id));
  }
}

// ---------- Proposals / canon review ----------
export function listProposals(db: DB, status = 'pending') {
  type Row = { id: number; kind: string; entity_id: string | null; campaign_id: number | null; title: string; payload: string; reason: string; status: string; entity_name: string | null; created_at: string };
  return (db.prepare('SELECT p.*, e.name AS entity_name FROM proposals p LEFT JOIN entities e ON e.id = p.entity_id WHERE p.status = ? ORDER BY p.id DESC').all(status) as Row[]).map(
    (p) => ({ ...p, payload: parseJson<Record<string, unknown>>(p.payload, {}) }),
  );
}

export function decideProposal(db: DB, id: number, decision: 'approved' | 'rejected' | 'revise', note: string) {
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as
    | { id: number; kind: string; entity_id: string | null; payload: string; status: string; title: string }
    | undefined;
  if (!p) throw notFound('Proposal');
  if (p.status !== 'pending' && p.status !== 'revise') throw badRequest('This proposal has already been decided');
  const tx = db.transaction(() => {
    if (decision === 'approved' && p.entity_id) {
      const payload = parseJson<Record<string, string | number>>(p.payload, {});
      if (p.kind === 'new_entity') {
        const e = getEntity(db, p.entity_id);
        updateEntity(
          db,
          p.entity_id,
          {
            canon_status: 'CANON',
            canon_flags: e.canon_flags.filter((f) => f !== 'PROPOSED').concat(e.canon_flags.includes('CANON') ? [] : ['CANON']),
            tags: e.tags.filter((t) => t !== 'status/proposed').concat(e.tags.includes('status/canon') ? [] : ['status/canon']),
            reason: `Approved as canon in Canon Review. ${note}`.trim(),
          },
          'canon-approval',
        );
      } else if (p.kind === 'campaign_promotion') {
        const e = getEntity(db, p.entity_id);
        const field = String(payload.field);
        const fields = e.fields.filter(([k]) => k !== field);
        fields.push([field, String(payload.value)]);
        updateEntity(
          db,
          p.entity_id,
          { fields, reason: `Promoted from campaign "${payload.campaign}" with DM approval. ${note}`.trim() },
          'canon-approval',
        );
        // The DM approved this change, so it becomes the reviewed baseline for this record.
        if (e.origin === 'import') acceptAsBaseline(db, p.entity_id, `Campaign promotion approved: ${p.title}`);
        if (payload.stateId) db.prepare(`UPDATE campaign_state SET status = 'promoted' WHERE id = ?`).run(payload.stateId);
      }
    }
    db.prepare('UPDATE proposals SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?').run(decision, note, now(), id);
  });
  tx();
  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
}
