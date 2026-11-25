import { role } from '../packs/registry.js';
import { timelineCalendar } from '../repo/calendars.js';
import { formatDate, formatYear, parseWhen } from '../../../shared/calendar.js';
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
import { isSecretHeading, playerEntity } from '../player/projection.js';
import { peekEntity } from '../repo/peek.js';
import { createRealm, deleteRealm, getRealm, listRealms, realmExists, reorderRealms, updateRealm } from '../repo/realms.js';
import { timelineRealms } from '../import/importer.js';
import { createRecordType, deleteRecordType, listRecordTypes, updateRecordType } from '../repo/recordTypes.js';
import { createTemplate, deleteTemplate, duplicateTemplate, listTemplates, updateTemplate } from '../repo/templates.js';
import { TYPE_GROUPS } from '../../../shared/domain.js';
import { revealDuringPlay } from '../repo/reveal.js';
import { defaultRevealTarget, onlyToCampaign, promoteToEveryone, recordReveals, revealCampaigns, revealToCampaign, unrevealFromCampaign, whoKnows } from '../repo/reveals.js';
import { revealTimelineRow, timelineCampaignReveals } from '../repo/timeline.js';
import { createEra, listEras, setRowEra, updateEra } from '../repo/eras.js';
import { getProfile, influenceMatrix, saveProfile } from '../repo/profiles.js';
import { bulkEdit, deleteTag, findInRecords, mergeRecords, renameTag, replaceInRecords, tagList } from '../repo/bulk.js';
import { createBackup } from '../backup/backup.js';
import { nameSources, namesFrom, npcIdeas, shopFor, shopPlaces } from '../repo/generators.js';
import { SHOP_KINDS } from '../../../shared/generators.js';
import { types as typeRegistry } from '../repo/recordTypes.js';

export function worldRoutes(ctx: AppContext) {
  const r = Router();

  // The name generator: the world's peoples with common names and the built-in styles, and new names in a style that
  // nobody has yet.
  r.get(
    '/names/peoples',
    h(() => nameSources(ctx.db)),
  );
  r.get(
    '/names',
    h((req) => namesFrom(ctx.db, String(req.query.people ?? ''), Math.min(40, Number(req.query.count) || 12), req.query.seed ? Number(req.query.seed) : Date.now())),
  );
  // Generators (v0.9.12): people to meet, and a shop with its stock and prices. Nothing is saved: the GM keeps what
  // they like as a record.
  const text = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 200) : undefined);
  const seedOf = (v: unknown) => (Number.isFinite(Number(v)) && v ? Number(v) : undefined);
  r.get(
    '/generate/sources',
    h(() => ({ names: nameSources(ctx.db), shops: SHOP_KINDS.map((k) => ({ key: k.key, label: k.label })), places: shopPlaces(ctx.db) })),
  );
  r.get(
    '/generate/npcs',
    h((req) => npcIdeas(ctx.db, { source: text(req.query.source), role: text(req.query.role), count: Number(req.query.count) || 6, seed: seedOf(req.query.seed) })),
  );
  r.get(
    '/generate/shop',
    h((req) => shopFor(ctx.db, { kind: String(req.query.kind ?? ''), place: text(req.query.place), wealth: text(req.query.wealth), source: text(req.query.source), seed: seedOf(req.query.seed) })),
  );

  // Bulk tools (v0.9.13): tags across the library, one change to many records, two records made one, and
  // find-and-replace. Merging and replacing make a backup first; every record changed keeps its history.
  r.get(
    '/tags',
    h(() => tagList(ctx.db)),
  );
  r.post(
    '/tags/rename',
    h((req) => renameTag(ctx.db, String(req.body?.from ?? ''), String(req.body?.to ?? ''))),
  );
  r.post(
    '/tags/delete',
    h((req) => deleteTag(ctx.db, String(req.body?.tag ?? ''))),
  );
  r.post(
    '/entities/bulk',
    h((req) => bulkEdit(ctx.db, req.body)),
  );
  r.post(
    '/entities/:id/merge',
    h((req) => {
      const backup = createBackup(ctx.db, ctx.paths, 'pre-merge');
      return { entity: mergeRecords(ctx.db, String(req.params.id), String(req.body?.from ?? '')), backup: backup.file };
    }),
  );
  r.post(
    '/find',
    h((req) => findInRecords(ctx.db, req.body)),
  );
  r.post(
    '/replace',
    h((req) => {
      const backup = createBackup(ctx.db, ctx.paths, 'pre-replace');
      return { ...replaceInRecords(ctx.db, req.body), backup: backup.file };
    }),
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
        knownTo: whoKnows(ctx.db, id).map((c) => ({ id: c.campaign_id, title: c.title })),
        baseline: e.modified_since_import ? baselineFor(ctx.db, id) : null,
      };
    }),
  );
  // Record types: the registry (shared/recordTypes.ts), with the GM's own types.
  r.get(
    '/record-types',
    h((req) => listRecordTypes(ctx.db, { counts: true, includeArchived: req.query.archived === '1' })),
  );
  r.post(
    '/record-types',
    h((req) => createRecordType(ctx.db, req.body)),
  );
  r.patch(
    '/record-types/:key',
    h((req) => updateRecordType(ctx.db, String(req.params.key), req.body)),
  );
  r.delete(
    '/record-types/:key',
    h((req) => {
      deleteRecordType(ctx.db, String(req.params.key));
      return { ok: true };
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
      res.send(entityToMarkdown(e, ctx.db));
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
  // Who knows what (docs/LIBRARIES_PLAN.md §2.2): a record's reveals to everyone and to each campaign.
  r.get(
    '/entities/:id/reveals',
    h((req) => recordReveals(ctx.db, String(req.params.id))),
  );
  // Reveal to one campaign, or take back from it: { campaign_id, sections?, facts?, remove_sections?, remove_facts?, hide? }.
  r.post(
    '/entities/:id/reveals',
    h((req) => {
      const id = String(req.params.id);
      const b = (req.body ?? {}) as Record<string, unknown>;
      const cid = intParam(b.campaign_id, 'campaign_id');
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
      ctx.db.transaction(() => {
        if (b.hide) revealToCampaign(ctx.db, cid, id, { hide: true });
        else {
          if (list(b.remove_sections) || list(b.remove_facts)) unrevealFromCampaign(ctx.db, cid, id, { sections: list(b.remove_sections), facts: list(b.remove_facts) });
          if (list(b.sections)?.length || list(b.facts)?.length || b.revealed) revealToCampaign(ctx.db, cid, id, { sections: list(b.sections), facts: list(b.facts) });
        }
      })();
      return recordReveals(ctx.db, id);
    }),
  );
  // Exactly what a campaign's players see of a record (or everyone's, with no campaign_id): the GM's Player view preview.
  r.get(
    '/entities/:id/player-preview',
    h((req) => playerEntity(ctx.db, String(req.params.id), req.query.campaign_id ? intParam(req.query.campaign_id, 'campaign_id') : null)),
  );
  r.post(
    '/entities/:id/reveals/everyone',
    h((req) => promoteToEveryone(ctx.db, String(req.params.id), intParam(req.body?.campaign_id, 'campaign_id'))),
  );
  r.post(
    '/entities/:id/reveals/only',
    h((req) => onlyToCampaign(ctx.db, String(req.params.id), intParam(req.body?.campaign_id, 'campaign_id'))),
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
      {
        const shown = timelineCampaignReveals(ctx.db);
        return (ctx.db.prepare('SELECT * FROM timeline_rows ORDER BY sort_order, id').all() as { id: number; entity_ids: string; realm_ids: string | null; player_visible: number }[]).map((t) => ({
          ...t,
          entity_ids: parseJson(t.entity_ids, []),
          realm_ids: parseJson(t.realm_ids ?? '[]', []),
          // Who has been shown the row: everyone, and each campaign (repo/timeline.ts).
          player_visible: !!t.player_visible,
          campaigns: shown.get(t.id) ?? [],
        }));
      },
    ),
  );
  // Revealing a row: to everyone (campaign_id null) or to one campaign. The campaigns a reveal can go to, and the default.
  r.get(
    '/timeline/reveal-choices',
    h(() => ({ choices: revealCampaigns(ctx.db), default: defaultRevealTarget(ctx.db) })),
  );
  r.post(
    '/timeline/:id/reveal',
    h((req) => {
      const c = req.body?.campaign_id;
      return revealTimelineRow(ctx.db, intParam(req.params.id), c == null || c === '' ? null : intParam(c, 'campaign_id'), req.body?.on !== false);
    }),
  );
  r.post(
    '/timeline',
    h((req) => {
      const b = req.body ?? {};
      const year = Number.isInteger(b.year) ? (b.year as number) : null;
      const day = year != null && Number.isInteger(b.day) ? (b.day as number) : null;
      if ((!b.time_label && year == null) || !b.event) throw badRequest('A time (a date, or words) and an event are required');
      const max = (ctx.db.prepare('SELECT MAX(sort_order) m FROM timeline_rows').get() as { m: number | null }).m ?? 0;
      // The realms it belongs to: as picked (each must exist), or read from the label.
      const picked = Array.isArray(b.realm_ids) ? (b.realm_ids as unknown[]).map(String).filter((id) => realmExists(ctx.db, id)) : null;
      const label = String(b.realm_label ?? '') || (picked ?? []).map((id) => getRealm(ctx.db, id)?.name ?? id).join(', ');
      const realmIds = picked ?? timelineRealms(ctx.db, label);
      // A date through its world's calendar: written out when no words are given, read from the words otherwise.
      const def = timelineCalendar(ctx.db, realmIds);
      const when = year != null ? { year, day } : parseWhen(def, String(b.time_label ?? ''));
      const time = String(b.time_label ?? '').trim() || (day != null ? formatDate(def, { year: year!, day }, 'short') : formatYear(def, year!));
      // A dated event goes after the last one on or before its date; otherwise at the end.
      let order = Number(b.sort_order ?? max + 1);
      if (b.sort_order == null && when) {
        const after = ctx.db
          .prepare('SELECT MAX(sort_order) m FROM timeline_rows WHERE year IS NOT NULL AND (year < ? OR (year = ? AND COALESCE(day, 0) <= ?))')
          .get(when.year, when.year, when.day ?? 0) as { m: number | null };
        if (after.m != null && after.m < max) {
          order = after.m + 1;
          ctx.db.prepare('UPDATE timeline_rows SET sort_order = sort_order + 1 WHERE sort_order >= ?').run(order);
        }
      }
      ctx.db
        .prepare(`INSERT INTO timeline_rows (sort_order, time_label, event, realm_label, realm_ids, source, access, entity_ids, origin, year, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`)
        .run(order, time, String(b.event), label, JSON.stringify(realmIds), String(b.source ?? 'DM'), String(b.access ?? 'PROPOSED'), '[]', when?.year ?? null, when?.day ?? null);
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
  // Templates: the built-in ones, the archive's, and the GM's own (Library → Templates).
  r.get(
    '/templates',
    h(() => listTemplates(ctx.db)),
  );
  r.post(
    '/templates',
    h((req) => createTemplate(ctx.db, req.body)),
  );
  r.post(
    '/templates/:id/duplicate',
    h((req) => duplicateTemplate(ctx.db, String(req.params.id))),
  );
  r.put(
    '/templates/:id',
    h((req) => updateTemplate(ctx.db, String(req.params.id), req.body)),
  );
  r.delete(
    '/templates/:id',
    h((req) => {
      deleteTemplate(ctx.db, String(req.params.id));
      return { ok: true };
    }),
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
          const intro = (r.intro_id ? db.prepare('SELECT id, name, realm, body FROM entities WHERE id = ?').get(r.intro_id) : undefined) as { id: string; name: string; realm: string; body: string } | undefined;
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
        // The pack's registers of open questions (by role), and anything tagged as a secret.
        mysteries: (() => {
          const ids = ['register.mysteries', 'register.futures', 'register.decisions'].map((k) => role(db, k)).filter((x): x is string => !!x);
          return db
            .prepare(`SELECT id, name, type, realm FROM entities WHERE archived = 0 AND (id IN (${ids.map(() => '?').join(',') || "''"}) OR tags LIKE '%"cat/secret"%') ORDER BY id LIMIT 10`)
            .all(...ids);
        })(),
        keyPlaces: quick(typeRegistry(db).list.filter((t) => t.pin === 'site').map((t) => t.key), 10),
        keyPeople: db.prepare(`SELECT id, name, type, realm FROM entities WHERE type = 'npc' AND archived = 0 ORDER BY favorite DESC, id LIMIT 8`).all(),
        factions: quick(typeRegistry(db).with('group'), 12),
        importRuns: db.prepare(`SELECT id, source_name, status, started_at FROM import_runs ORDER BY id DESC LIMIT 3`).all(),
        typeGroups: TYPE_GROUPS,
      };
    }),
  );

  return r;
}
