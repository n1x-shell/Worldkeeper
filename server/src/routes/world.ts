import { Router } from 'express';
import type { AppContext } from '../context.js';
import { h, intParam, listParam } from './util.js';
import {
  createEntity,
  duplicateAsDraft,
  findSimilarNames,
  getEntity,
  getRevision,
  listEntities,
  listRevisions,
  recentViews,
  recentlyEdited,
  recordView,
  revertToRevision,
  updateEntity,
} from '../repo/entities.js';
import { brokenReferences, createRelationship, deleteRelationship, listRelationshipsFor, neighbourhood, updateRelationship } from '../repo/relationships.js';
import { search } from '../repo/search.js';
import { stateForEntity, getActiveCampaignId, listProposals } from '../repo/campaigns.js';
import { entityToMarkdown } from '../backup/exporter.js';
import { parseJson } from '../lib/json.js';
import { badRequest, notFound } from '../lib/errors.js';
import { canonReview, baselineFor, reviewDecision } from '../repo/review.js';
import { decideProposal } from '../repo/campaigns.js';
import { splitSections } from '../import/parseMarkdown.js';
import { isSecretHeading } from '../player/projection.js';
import { peekEntity } from '../repo/peek.js';
import { createRealm, deleteRealm, getRealm, listRealms, realmExists, reorderRealms, updateRealm } from '../repo/realms.js';
import { timelineRealms } from '../import/importer.js';
import { TYPE_GROUPS } from '../../../shared/domain.js';
import { revealDuringPlay } from '../repo/reveal.js';
import { createEra, listEras, setRowEra, updateEra } from '../repo/eras.js';
import { getProfile, influenceMatrix, saveProfile } from '../repo/profiles.js';
import { makeNames, namePeoples } from '../repo/names.js';

export function worldRoutes(ctx: AppContext) {
  const r = Router();

  // The name generator: peoples with common names, and new names in a people's style that nobody has yet.
  r.get(
    '/names/peoples',
    h(() => namePeoples(ctx.db)),
  );
  r.get(
    '/names',
    h((req) => makeNames(ctx.db, String(req.query.people ?? ''), Math.min(40, Number(req.query.count) || 12), req.query.seed ? Number(req.query.seed) : undefined)),
  );

  r.get(
    '/entities',
    h((req) =>
      listEntities(ctx.db, {
        type: listParam(req.query.type),
        realm: listParam(req.query.realm),
        canon: listParam(req.query.canon),
        tag: req.query.tag ? String(req.query.tag) : undefined,
        parent: req.query.parent ? String(req.query.parent) : undefined,
        includeArchived: req.query.archived === '1',
        includeMeta: req.query.meta === '1',
        favorite: req.query.favorite === '1',
        q: req.query.q ? String(req.query.q) : undefined,
      }),
    ),
  );
  r.get(
    '/entities/similar',
    h((req) => findSimilarNames(ctx.db, String(req.query.name ?? ''), req.query.exclude ? String(req.query.exclude) : undefined)),
  );
  r.post(
    '/entities',
    h((req) => createEntity(ctx.db, req.body, req.body?.reason || 'Created in The Worldkeeper')),
  );
  r.get(
    '/entities/:id',
    h((req) => {
      let id = String(req.params.id);
      let e = getEntity(ctx.db, id);
      let redirectedFrom: string | null = null;
      if (e.redirect_to && req.query.follow !== '0') {
        redirectedFrom = e.id;
        id = e.redirect_to;
        e = getEntity(ctx.db, id);
      }
      recordView(ctx.db, id);
      const children = listEntities(ctx.db, { parent: id, includeMeta: false });
      const sections = splitSections(e.body).map((s) => ({ heading: s.heading, secret: s.heading ? isSecretHeading(s.heading) : false }));
      return {
        entity: e,
        redirectedFrom,
        relationships: listRelationshipsFor(ctx.db, id),
        children,
        parent: e.parent_id ? (listEntities(ctx.db, { q: e.parent_id, includeMeta: true }).find((p) => p.id === e.parent_id) ?? null) : null,
        campaignState: stateForEntity(ctx.db, id),
        activeCampaignId: getActiveCampaignId(ctx.db),
        sections,
        baseline: e.modified_since_import ? baselineFor(ctx.db, id) : null,
      };
    }),
  );
  // Realms: the library's worlds, continents and planes (docs/OWN_WORLD_PLAN.md §2.1).
  r.get(
    '/realms',
    h((req) => listRealms(ctx.db, { counts: true, includeArchived: req.query.archived === '1' })),
  );
  r.post(
    '/realms',
    h((req) => createRealm(ctx.db, req.body)),
  );
  r.post(
    '/realms/order',
    h((req) => reorderRealms(ctx.db, Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [])),
  );
  r.patch(
    '/realms/:id',
    h((req) => updateRealm(ctx.db, String(req.params.id), req.body)),
  );
  r.delete(
    '/realms/:id',
    h((req) => {
      deleteRealm(ctx.db, String(req.params.id));
      return { ok: true };
    }),
  );
  // A record at a glance (hover cards, the inspector, split view). Not counted as a visit.
  r.get(
    '/entities/:id/peek',
    h((req) => peekEntity(ctx.db, String(req.params.id))),
  );
  r.patch(
    '/entities/:id',
    h((req) => updateEntity(ctx.db, String(req.params.id), req.body)),
  );
  r.post(
    '/entities/:id/duplicate',
    h((req) => duplicateAsDraft(ctx.db, String(req.params.id))),
  );
  r.get(
    '/entities/:id/revisions',
    h((req) => listRevisions(ctx.db, String(req.params.id))),
  );
  r.get(
    '/revisions/:rev',
    h((req) => getRevision(ctx.db, intParam(req.params.rev))),
  );
  r.post(
    '/entities/:id/revert',
    h((req) => revertToRevision(ctx.db, String(req.params.id), intParam(req.body?.revisionId, 'revisionId'), String(req.body?.reason ?? ''))),
  );
  r.get(
    '/entities/:id/export.md',
    h((req, res) => {
      const e = getEntity(ctx.db, String(req.params.id));
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${e.id}.md"`);
      res.send(entityToMarkdown(e));
    }),
  );

  // Relationships & graph
  r.post(
    '/relationships',
    h((req) => createRelationship(ctx.db, req.body)),
  );
  r.patch(
    '/relationships/:id',
    h((req) => updateRelationship(ctx.db, intParam(req.params.id), req.body)),
  );
  r.delete(
    '/relationships/:id',
    h((req) => {
      deleteRelationship(ctx.db, intParam(req.params.id));
      return { ok: true };
    }),
  );
  r.get(
    '/graph',
    h((req) =>
      neighbourhood(ctx.db, String(req.query.focus ?? ''), {
        depth: req.query.depth ? Number(req.query.depth) : 1,
        types: listParam(req.query.types),
        relTypes: listParam(req.query.rel),
        realms: listParam(req.query.realms),
        canon: listParam(req.query.canon),
        eras: listParam(req.query.eras),
        includeReferences: req.query.refs !== '0',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    ),
  );
  r.get(
    '/broken',
    h(() => brokenReferences(ctx.db)),
  );

  // Live reveal (record + session log in one transaction)
  r.post(
    '/entities/:id/reveal',
    h((req) => revealDuringPlay(ctx.db, String(req.params.id), req.body)),
  );

  // Eras
  r.get(
    '/eras',
    h(() => listEras(ctx.db)),
  );
  r.post(
    '/eras',
    h((req) => createEra(ctx.db, req.body)),
  );
  r.patch(
    '/eras/:key',
    h((req) => updateEra(ctx.db, String(req.params.key), req.body)),
  );
  r.patch(
    '/timeline/:id/era',
    h((req) => {
      const era = req.body?.era;
      setRowEra(ctx.db, intParam(req.params.id), era === 'auto' ? 'auto' : era == null || era === '' ? null : String(era));
      return { ok: true };
    }),
  );

  // Structured NPC / faction profiles
  r.get(
    '/profiles/influence',
    h((req) => influenceMatrix(ctx.db, intParam(req.query.campaign, 'campaign'))),
  );
  r.get(
    '/profiles/:id',
    h((req) => getProfile(ctx.db, String(req.params.id), req.query.campaign ? intParam(req.query.campaign, 'campaign') : getActiveCampaignId(ctx.db))),
  );
  r.put(
    '/profiles/:id',
    h((req) => {
      const scope = req.body?.scope === 'campaign' ? 'campaign' : 'world';
      const cid = req.body?.campaign_id != null ? intParam(req.body.campaign_id, 'campaign_id') : getActiveCampaignId(ctx.db);
      return saveProfile(ctx.db, String(req.params.id), scope, cid, req.body?.data);
    }),
  );

  // Search
  r.get(
    '/search',
    h((req) =>
      search(ctx.db, String(req.query.q ?? ''), {
        kinds: listParam(req.query.kinds),
        types: listParam(req.query.types),
        realms: listParam(req.query.realms),
        canon: listParam(req.query.canon),
        limit: req.query.limit ? Number(req.query.limit) : 40,
      }),
    ),
  );

  // Timeline, documents, templates
  r.get(
    '/timeline',
    h(() =>
      (ctx.db.prepare('SELECT * FROM timeline_rows ORDER BY sort_order, id').all() as { entity_ids: string; realm_ids: string | null }[]).map((t) => ({
        ...t,
        entity_ids: parseJson(t.entity_ids, []),
        realm_ids: parseJson(t.realm_ids ?? '[]', []),
      })),
    ),
  );
  r.post(
    '/timeline',
    h((req) => {
      const b = req.body ?? {};
      if (!b.time_label || !b.event) throw badRequest('Time and event are required');
      const max = (ctx.db.prepare('SELECT MAX(sort_order) m FROM timeline_rows').get() as { m: number | null }).m ?? 0;
      // The realms it belongs to: as picked (each must exist), or read from the label.
      const picked = Array.isArray(b.realm_ids) ? (b.realm_ids as unknown[]).map(String).filter((id) => realmExists(ctx.db, id)) : null;
      const label = String(b.realm_label ?? '') || (picked ?? []).map((id) => getRealm(ctx.db, id)?.name ?? id).join(', ');
      const realmIds = picked ?? timelineRealms(ctx.db, label);
      ctx.db
        .prepare(`INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, realm_ids, source, access, entity_ids, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user')`)
        .run(Number(b.sort_order ?? max + 1), String(b.time_label), String(b.event), label, JSON.stringify(realmIds), String(b.source ?? 'DM'), String(b.access ?? 'PROPOSED'), '[]');
      return { ok: true };
    }),
  );
  r.get(
    '/documents',
    h(() => ctx.db.prepare('SELECT id, path, title, kind, doc_id, immutable, imported_at, length(content) AS size FROM source_documents ORDER BY path').all()),
  );
  r.get(
    '/documents/content',
    h((req) => {
      const d = ctx.db.prepare('SELECT * FROM source_documents WHERE path = ?').get(String(req.query.path ?? ''));
      if (!d) throw notFound('Document');
      return d;
    }),
  );
  r.get(
    '/templates',
    h(() =>
      (ctx.db.prepare('SELECT * FROM templates ORDER BY name').all() as { fields: string; sections: string }[]).map((t) => ({
        ...t,
        fields: parseJson(t.fields, []),
        sections: parseJson(t.sections, []),
      })),
    ),
  );

  // Canon review
  r.get(
    '/review',
    h(() => canonReview(ctx.db)),
  );
  r.post(
    '/review/:id',
    h((req) => reviewDecision(ctx.db, String(req.params.id), req.body?.decision === 'revert' ? 'revert' : 'approve', String(req.body?.note ?? ''))),
  );
  r.get(
    '/proposals',
    h((req) => listProposals(ctx.db, String(req.query.status ?? 'pending'))),
  );
  r.post(
    '/proposals/:id',
    h((req) => {
      const d = String(req.body?.decision);
      if (!['approved', 'rejected', 'revise'].includes(d)) throw badRequest('decision must be approved, rejected or revise');
      return decideProposal(ctx.db, intParam(req.params.id), d as 'approved', String(req.body?.note ?? ''));
    }),
  );

  // Dashboard
  r.get(
    '/dashboard',
    h(() => {
      const db = ctx.db;
      const count = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;
      const byRealm = db.prepare(`SELECT realm, COUNT(*) n FROM entities WHERE type NOT IN ('redirect','index','register') AND archived = 0 GROUP BY realm`).all();
      const byType = db.prepare(`SELECT type, COUNT(*) n FROM entities WHERE archived = 0 GROUP BY type ORDER BY n DESC`).all();
      const activeId = getActiveCampaignId(db);
      const active = activeId
        ? {
            campaign: db.prepare('SELECT * FROM campaigns WHERE id = ?').get(activeId),
            lastSession: db.prepare(`SELECT * FROM sessions WHERE campaign_id = ? ORDER BY number DESC LIMIT 1`).get(activeId) ?? null,
            liveSession: db.prepare(`SELECT * FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(activeId) ?? null,
            nextSession: db.prepare(`SELECT * FROM sessions WHERE campaign_id = ? AND status = 'planned' ORDER BY number ASC LIMIT 1`).get(activeId) ?? null,
            openQuests: db.prepare(`SELECT id, title, status FROM quests WHERE campaign_id = ? AND status IN ('open','active') ORDER BY updated_at DESC LIMIT 8`).all(activeId),
            plans: db
              .prepare(
                `SELECT p.*, e.name AS faction_name FROM faction_plans p LEFT JOIN entities e ON e.id = p.faction_id WHERE p.campaign_id = ? AND p.status = 'active' ORDER BY p.updated_at DESC LIMIT 8`,
              )
              .all(activeId),
            recentChanges: db
              .prepare(
                `SELECT s.*, e.name AS entity_name FROM campaign_state s LEFT JOIN entities e ON e.id = s.entity_id WHERE s.campaign_id = ? AND s.status IN ('active','proposed') ORDER BY s.id DESC LIMIT 8`,
              )
              .all(activeId),
          }
        : null;
      // One card per realm that holds records: its introducing record (world, continent or realm), or its description.
      const SETTING_ROOT: Record<string, string> = { aetheris: 'CON-001', kaelmar: 'CON-301', ethereal: 'CON-501' };
      // Domains and region groups count towards the realm, world or continent that holds them, not cards of their own.
      const allRealms = listRealms(db, { counts: true });
      const folded = (r: { id: string }): string[] => [
        r.id,
        ...allRealms.filter((c) => c.parent_id === r.id && (c.kind === 'domain' || c.kind === 'region_group')).flatMap(folded),
      ];
      const branches = allRealms
        .filter((r) => r.kind !== 'domain' && r.kind !== 'region_group')
        .map((r) => ({ ...r, ids: folded(r) }))
        .filter((r) => allRealms.some((x) => r.ids.includes(x.id) && (x.records ?? 0) > 0))
        .map((r) => {
          const intro = (db.prepare('SELECT id, name, realm, body FROM entities WHERE id = ? AND realm = ?').get(SETTING_ROOT[r.id] ?? '', r.id) ??
            db
              .prepare(
                `SELECT id, name, realm, body FROM entities WHERE realm = ? AND archived = 0 AND type IN ('world','continent','realm') ORDER BY CASE type WHEN 'world' THEN 0 WHEN 'continent' THEN 1 ELSE 2 END, id LIMIT 1`,
              )
              .get(r.id)) as { id: string; name: string; realm: string; body: string } | undefined;
          const first = intro ? splitSections(intro.body).find((x) => x.heading && x.content && !isSecretHeading(x.heading)) : undefined;
          return {
            id: intro?.id ?? null,
            name: r.name,
            realm: r.id,
            excerpt: r.description || (first ? first.content.slice(0, 420) : ''),
            count: count(
              `SELECT COUNT(*) n FROM entities WHERE realm IN (${r.ids.map(() => '?').join(',')}) AND archived = 0 AND type NOT IN ('redirect','index','register')`,
              ...r.ids,
            ),
          };
        });
      const quick = (types: string[], limit = 8) =>
        db.prepare(`SELECT id, name, type, realm FROM entities WHERE type IN (${types.map(() => '?').join(',')}) AND archived = 0 ORDER BY favorite DESC, id LIMIT ?`).all(...types, limit);
      return {
        worldDate: (db.prepare(`SELECT value FROM settings WHERE key = 'world_date'`).get() as { value: string } | undefined)?.value ?? null,
        counts: {
          entities: count(`SELECT COUNT(*) n FROM entities WHERE type NOT IN ('redirect') AND archived = 0`),
          relationships: count('SELECT COUNT(*) n FROM relationships'),
          documents: count('SELECT COUNT(*) n FROM source_documents'),
          campaigns: count('SELECT COUNT(*) n FROM campaigns'),
          pendingReview: count(`SELECT COUNT(*) n FROM proposals WHERE status IN ('pending','revise')`),
        },
        byRealm,
        byType,
        branches,
        active,
        recentViews: recentViews(db, 10),
        recentEdits: recentlyEdited(db, 8),
        favorites: listEntities(db, { favorite: true }).slice(0, 12),
        mysteries: db.prepare(`SELECT id, name, type, realm FROM entities WHERE archived = 0 AND (id IN ('WLD-907','WLD-908','DEC-901') OR tags LIKE '%"cat/secret"%') ORDER BY id LIMIT 10`).all(),
        keyPlaces: quick(['settlement', 'vault', 'ethereal_domain'], 10),
        keyPeople: db.prepare(`SELECT id, name, type, realm FROM entities WHERE type = 'npc' AND archived = 0 ORDER BY favorite DESC, id LIMIT 8`).all(),
        factions: quick(['faction', 'cult'], 12),
        importRuns: db.prepare(`SELECT id, source_name, status, started_at FROM import_runs ORDER BY id DESC LIMIT 3`).all(),
        typeGroups: TYPE_GROUPS,
      };
    }),
  );

  return r;
}
