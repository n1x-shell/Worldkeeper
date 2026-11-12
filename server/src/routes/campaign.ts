import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h, intParam, mountCrud } from './util.js';
import {
  adventureFromHook,
  adventures,
  advancePlan,
  campaignOverview,
  campaignState,
  campaigns,
  characters,
  copyScene,
  createNextSession,
  decideState,
  encounters,
  factionPlans,
  generateRecapDraft,
  getActiveCampaignId,
  notes,
  proposePromotion,
  quests,
  randomTables,
  recordState,
  rollTable,
  sceneLinks,
  scenes,
  sessionLog,
  sessions,
  setActiveCampaign,
} from '../repo/campaigns.js';
import { createClue, createMystery, createSecret, deleteClue, deleteSecret, listMysteries, setClueFound, setSecretState, syncMysteries, updateMystery, updateSecret, type SecretState } from '../repo/mysteries.js';
import { TRUTHS, createRumour, deleteRumour, listRumours, readPlayerText, setHeard, syncRumours, updateRumour, type Truth } from '../repo/rumours.js';
import { rollDice } from '../../../shared/play.js';
import { badRequest } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';

export function campaignRoutes(ctx: AppContext) {
  const r = Router();
  r.get('/campaigns/active', h(() => ({ id: getActiveCampaignId(ctx.db) })));
  r.put(
    '/campaigns/active',
    h((req) => {
      setActiveCampaign(ctx.db, req.body?.id == null ? null : intParam(req.body.id));
      return { id: getActiveCampaignId(ctx.db) };
    }),
  );
  r.get('/campaigns/:id/overview', h((req) => campaignOverview(ctx.db, intParam(req.params.id))));
  mountCrud(r, ctx, '/campaigns', campaigns);
  mountCrud(r, ctx, '/characters', characters, ['campaign_id']);
  mountCrud(r, ctx, '/quests', quests, ['campaign_id', 'status']);
  r.post('/adventures/from-hook', h((req) => adventureFromHook(ctx.db, String(req.body?.hookId), req.body?.campaignId ?? null)));
  mountCrud(r, ctx, '/adventures', adventures, ['campaign_id', 'status']);
  r.post('/scenes/:id/copy', h((req) => copyScene(ctx.db, intParam(req.params.id), intParam(req.body?.adventureId, 'adventureId'))));
  mountCrud(r, ctx, '/scenes', scenes, ['adventure_id']);
  mountCrud(r, ctx, '/scene-links', sceneLinks, ['adventure_id']);
  r.post('/sessions/next', h((req) => createNextSession(ctx.db, intParam(req.body?.campaignId, 'campaignId'), String(req.body?.title ?? ''))));
  r.post('/sessions/:id/recap-draft', h((req) => ({ draft: generateRecapDraft(ctx.db, intParam(req.params.id)) })));
  r.post(
    '/sessions/:id/start',
    h((req) => {
      const id = intParam(req.params.id);
      const s = sessions.get(ctx.db, id) as { played_on: string };
      return sessions.update(ctx.db, id, { status: 'live', played_on: s.played_on || new Date().toISOString().slice(0, 10) });
    }),
  );
  r.post('/sessions/:id/end', h((req) => sessions.update(ctx.db, intParam(req.params.id), { status: 'completed' })));
  mountCrud(r, ctx, '/sessions', sessions, ['campaign_id', 'status']);
  mountCrud(r, ctx, '/session-log', sessionLog, ['session_id', 'kind']);

  r.post('/campaign-state', h((req) => recordState(ctx.db, req.body)));
  r.post('/campaign-state/:id/decide', h((req) => decideState(ctx.db, intParam(req.params.id), !!req.body?.accept)));
  r.post('/campaign-state/:id/promote', h((req) => ({ proposalId: proposePromotion(ctx.db, intParam(req.params.id), String(req.body?.reason ?? '')) })));
  mountCrud(r, ctx, '/campaign-state', campaignState, ['campaign_id', 'entity_id', 'session_id', 'status']);

  r.post('/faction-plans/:id/advance', h((req) => advancePlan(ctx.db, intParam(req.params.id), Number(req.body?.delta ?? 1), String(req.body?.reason ?? ''))));
  mountCrud(r, ctx, '/faction-plans', factionPlans, ['campaign_id', 'faction_id', 'status']);
  // Rumours (GM only; never part of player data).
  r.get(
    '/rumours',
    h((req) => {
      const q = req.query as Record<string, string | undefined>;
      return listRumours(ctx.db, {
        campaignId: q.campaign_id ? Number(q.campaign_id) : getActiveCampaignId(ctx.db),
        entityId: q.entity || undefined,
        truth: TRUTHS.includes(q.truth as Truth) ? (q.truth as Truth) : undefined,
        heard: q.heard === 'heard' || q.heard === 'unheard' ? q.heard : undefined,
        q: q.q,
      });
    }),
  );
  r.post('/rumours', h((req) => createRumour(ctx.db, req.body)));
  // How factions feel about each other: links between groups (allied, uneasy, rival, at war).
  r.get(
    '/faction-stances',
    h(() => {
      const groups = ctx.db
        .prepare(`SELECT id, name, type, realm FROM entities WHERE type IN ('faction','cult') AND archived = 0 ORDER BY realm, type, name`)
        .all() as { id: string; name: string; type: string; realm: string }[];
      const links = ctx.db
        .prepare(
          `SELECT r.source_id, r.target_id, r.type, r.label, r.description FROM relationships r
           JOIN entities a ON a.id = r.source_id JOIN entities b ON b.id = r.target_id
           WHERE r.type IN ('allied_with','opposes','related_to') AND a.type IN ('faction','cult') AND b.type IN ('faction','cult')`,
        )
        .all() as { source_id: string; target_id: string; type: string; label: string; description: string }[];
      return { groups, links };
    }),
  );
  // Mysteries, secrets and clues (GM only; never part of player data).
  const campaignOf = (v: unknown) => Number(v ?? getActiveCampaignId(ctx.db) ?? 0);
  r.get('/mysteries', h((req) => listMysteries(ctx.db, campaignOf(req.query.campaign_id), req.query.entity ? String(req.query.entity) : undefined)));
  r.post('/mysteries', h((req) => createMystery(ctx.db, req.body)));
  r.post('/mysteries/sync', h(() => ({ rumours: syncRumours(ctx.db, readPlayerText()), mysteries: syncMysteries(ctx.db) })));
  r.patch('/mysteries/:id', h((req) => updateMystery(ctx.db, intParam(req.params.id), req.body)));
  r.post('/secrets', h((req) => createSecret(ctx.db, req.body)));
  r.patch('/secrets/:id', h((req) => updateSecret(ctx.db, intParam(req.params.id), req.body)));
  r.delete('/secrets/:id', h((req) => deleteSecret(ctx.db, intParam(req.params.id))));
  r.post('/secrets/:id/state', h((req) => setSecretState(ctx.db, intParam(req.params.id), campaignOf(req.body?.campaign_id), String(req.body?.state) as SecretState, req.body?.note)));
  r.post('/clues', h((req) => createClue(ctx.db, req.body)));
  r.delete('/clues/:id', h((req) => deleteClue(ctx.db, intParam(req.params.id))));
  r.post('/clues/:id/found', h((req) => setClueFound(ctx.db, intParam(req.params.id), campaignOf(req.body?.campaign_id), !!req.body?.found)));
  r.post('/rumours/sync', h(() => syncRumours(ctx.db, readPlayerText())));
  r.patch('/rumours/:id', h((req) => updateRumour(ctx.db, intParam(req.params.id), req.body)));
  r.delete('/rumours/:id', h((req) => (deleteRumour(ctx.db, intParam(req.params.id)), { ok: true })));
  r.post(
    '/rumours/:id/heard',
    h((req) => setHeard(ctx.db, intParam(req.params.id), Number(req.body?.campaign_id ?? getActiveCampaignId(ctx.db) ?? 0), !!req.body?.heard, String(req.body?.note ?? ''))),
  );
  mountCrud(r, ctx, '/encounters', encounters, ['campaign_id', 'session_id', 'status']);
  mountCrud(r, ctx, '/notes', notes, ['campaign_id']);
  r.post('/random-tables/:id/roll', h((req) => rollTable(ctx.db, intParam(req.params.id))));
  mountCrud(r, ctx, '/random-tables', randomTables);

  r.post(
    '/dice/roll',
    h((req) => {
      const expr = String(req.body?.expression ?? '');
      let result;
      try {
        result = rollDice(expr);
      } catch (e) {
        throw badRequest((e as Error).message);
      }
      ctx.db.prepare('INSERT INTO dice_log (expression, result, total) VALUES (?, ?, ?)').run(result.expression, result.detail, result.total);
      return result;
    }),
  );
  r.get('/dice/log', h(() => ctx.db.prepare('SELECT * FROM dice_log ORDER BY id DESC LIMIT 50').all()));

  // ---- World-specific views (read canon + overlay campaign state; never modify canon) ----
  r.get(
    '/special/vaults',
    h((req) => {
      const cid = req.query.campaign ? Number(req.query.campaign) : getActiveCampaignId(ctx.db);
      const vaults = ctx.db.prepare(`SELECT id, name, fields, body, canon_status FROM entities WHERE type = 'vault' ORDER BY id`).all() as {
        id: string;
        name: string;
        fields: string;
        body: string;
        canon_status: string;
      }[];
      return vaults.map((v) => {
        const fields = parseJson<[string, string][]>(v.fields, []);
        const state = cid
          ? (ctx.db
              .prepare(`SELECT * FROM campaign_state WHERE campaign_id = ? AND entity_id = ? AND status IN ('active','proposed') ORDER BY id DESC`)
              .all(cid, v.id) as { field: string; value: string; status: string; note: string; id: number }[])
          : [];
        const related = ctx.db
          .prepare(
            `SELECT DISTINCT e.id, e.name, e.type FROM relationships r JOIN entities e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
             WHERE (r.source_id = ? OR r.target_id = ?) AND e.type IN ('faction','cult','npc','adventure_hook','vault_key','landmark','settlement','region')`,
          )
          .all(v.id, v.id, v.id);
        return { id: v.id, name: v.name, canon_status: v.canon_status, fields, body: v.body, campaignState: state, related };
      });
    }),
  );
  r.get(
    '/special/shards',
    h((req) => {
      const cid = req.query.campaign ? Number(req.query.campaign) : getActiveCampaignId(ctx.db);
      const shards = ctx.db.prepare(`SELECT id, name, fields, body, canon_status, canon_flags FROM entities WHERE type = 'shard' ORDER BY id`).all() as {
        id: string;
        name: string;
        fields: string;
        body: string;
        canon_status: string;
        canon_flags: string;
      }[];
      return shards.map((s) => ({
        id: s.id,
        name: s.name,
        canon_status: s.canon_status,
        canon_flags: parseJson(s.canon_flags, []),
        fields: parseJson(s.fields, []),
        body: s.body,
        campaignState: cid
          ? ctx.db.prepare(`SELECT * FROM campaign_state WHERE campaign_id = ? AND entity_id = ? AND status IN ('active','proposed') ORDER BY id DESC`).all(cid, s.id)
          : [],
        related: ctx.db
          .prepare(
            `SELECT DISTINCT e.id, e.name, e.type FROM relationships r JOIN entities e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
             WHERE (r.source_id = ? OR r.target_id = ?) AND e.type IN ('faction','cult','npc','landmark','settlement','region','ethereal_domain','artifact')`,
          )
          .all(s.id, s.id, s.id),
      }));
    }),
  );
  return r;
}
