import { creatureMentions, suggestEncounters, TERRAINS, type Difficulty } from '../repo/encounters.js';
import { placeProfile, placesWithTerrain, regionPlaces } from '../repo/places.js';
import { copyTable, generateEncounterTable } from '../repo/tables.js';
import { partyLevel } from '../repo/journey.js';
import { difficultyFor } from '../../../shared/places.js';
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { characterLog, logged } from '../repo/characterLog.js';
import { keepPortrait, removePortrait, savePortrait } from '../repo/portraits.js';
import { h, intParam, listParam, mountCrud } from './util.js';
import {
  adventureFromHook,
  adventures,
  advancePlan,
  campaignOverview,
  campaignState,
  campaigns,
  characters,
  sheetPatchSchema,
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
  partyTiesFor,
} from '../repo/campaigns.js';
import {
  createClue,
  createMystery,
  createSecret,
  deleteClue,
  deleteSecret,
  listMysteries,
  setClueFound,
  setSecretState,
  syncMysteries,
  updateMystery,
  updateSecret,
  type SecretState,
} from '../repo/mysteries.js';
import { TRUTHS, createRumour, deleteRumour, listRumours, readPlayerText, setHeard, syncRumours, updateRumour, type Truth } from '../repo/rumours.js';
import { rollDice } from '../../../shared/play.js';
import { nearbyPeople, sessionBriefing } from '../repo/briefing.js';
import { partyExport } from '../player/partyExport.js';
import { allRegionStates } from '../repo/regionState.js';
import { calendarEvents, campaignDate, comingUp, setCampaignDate } from '../repo/calendar.js';
import { campaignCalendar, campaignDates, listCalendars, setWorldCalendar, writeCampaignDate } from '../repo/calendars.js';
import { handouts, pushHandout } from '../repo/handouts.js';
import { bastionTurns, bastions, downtime, hostStanding, takeBastionTurn } from '../repo/bastions.js';
import { adjustRenown, setStandingOptions, standingFor, undoRenown, ladder } from '../repo/standing.js';
import { requirePack } from '../packs/registry.js';
import { BOOKS_REGION, addRollToParty, catalogueFor, partyTreasure, rollTreasure, treasureData, treasureSourceFor } from '../repo/treasure.js';
import { moduleOn, setCampaignModules } from '../repo/modules.js';
import { badRequest } from '../lib/errors.js';
import { types as typeRegistry } from '../repo/recordTypes.js';
import { parseJson } from '../lib/json.js';
import { returnClock, setReturnStage } from '../repo/returnClock.js';
import { factionWeb, revealTie } from '../repo/factionWeb.js';
import { streamChanges } from '../live/feed.js';
import { applySheetDiff } from '../../../shared/sheetDiff.js';
import { attendance, attendanceCounts, giveAward, listAwards, removeAward, setAttendance } from '../repo/progress.js';
import { deleteHomebrew, homebrewForRecord, listHomebrew, saveHomebrew } from '../repo/homebrew.js';
import { deleteLibraryStatblock, setLibraryStatblock, statblockFor, statblockIndex, type StatBlock } from '../repo/statblocks.js';
import { bookCounts, bookCreature, bookTreasure, bookCreatureIndex, bookCreatures, bookItems, creatureByName, itemByName, requireBookCreature } from '../repo/bookData.js';
import { characterPage, renewCharacterCode, updateCharacterPage } from '../repo/characterPages.js';
import { handbookCode, renewHandbookCode } from '../repo/handbookCodes.js';
import { tableStatus } from '../table.js';
import { recentActions, undoAction, undoable } from '../repo/undo.js';
import { addressesOnly } from './player.js';

/** Where players reach the table server: this computer's network addresses, the port, and whether it's open. */
function tableAddress(ctx: AppContext) {
  const t = tableStatus();
  return { addresses: t.addresses, port: t.port, table_open: t.open, addresses_only: addressesOnly(ctx) };
}

export function campaignRoutes(ctx: AppContext) {
  const r = Router();
  r.get(
    '/campaigns/active',
    h(() => ({ id: getActiveCampaignId(ctx.db) })),
  );
  r.put(
    '/campaigns/active',
    h((req) => {
      setActiveCampaign(ctx.db, req.body?.id == null ? null : intParam(req.body.id));
      return { id: getActiveCampaignId(ctx.db) };
    }),
  );
  // A campaign's own module switches (null follows the library's).
  r.put(
    '/campaigns/:id/modules',
    h((req) => setCampaignModules(ctx.db, intParam(req.params.id), req.body)),
  );
  // Each campaign's handbook address on the table server (docs/LIBRARIES_PLAN.md §2.3): its code, and a new one.
  r.get(
    '/campaigns/:id/handbook',
    h((req) => ({ code: handbookCode(ctx.db, intParam(req.params.id)), ...tableAddress(ctx) })),
  );
  r.post(
    '/campaigns/:id/handbook/new-code',
    h((req) => ({ code: renewHandbookCode(ctx.db, intParam(req.params.id)), ...tableAddress(ctx) })),
  );
  r.get(
    '/campaigns/:id/overview',
    h((req) => campaignOverview(ctx.db, intParam(req.params.id))),
  );
  mountCrud(r, ctx, '/campaigns', campaigns);
  // Character pages: memories, true name and Thinning. The GM sees and edits all of it, and can renew the private code.
  // (Registered before the characters CRUD, so /characters/:id/page isn't taken for a character id.)
  r.get(
    '/characters/:id/page',
    h((req) => characterPage(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/characters/:id/page/new-code',
    h((req) => renewCharacterCode(ctx.db, intParam(req.params.id))),
  );
  // Everything the GM changes on a character or its page goes in the change log, marked as the GM's.
  r.patch(
    '/characters/:id/page',
    h((req) => logged(ctx.db, intParam(req.params.id), 'gm', () => updateCharacterPage(ctx.db, intParam(req.params.id), req.body))),
  );
  r.patch(
    '/characters/:id',
    h((req) => {
      const id = intParam(req.params.id);
      // A patch changes only the sheet's fields it names (shared/sheetDiff.ts): what the player changed meanwhile stays.
      const { sheet_patch, ...body } = (req.body ?? {}) as { sheet_patch?: unknown } & Record<string, unknown>;
      if (sheet_patch !== undefined) {
        const d = sheetPatchSchema.parse(sheet_patch);
        body.sheet = applySheetDiff(characters.get(ctx.db, id).sheet as Record<string, unknown>, d);
      }
      return logged(ctx.db, id, 'gm', () => characters.update(ctx.db, id, keepPortrait(ctx.db, id, body)));
    }),
  );
  r.get(
    '/characters/:id/log',
    h((req) => characterLog(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/characters/:id/portrait',
    h((req) => {
      const id = intParam(req.params.id);
      logged(ctx.db, id, 'gm', () => savePortrait(ctx.db, ctx.paths.uploadsDir, id, req.body?.image));
      return characters.get(ctx.db, id);
    }),
  );
  r.delete(
    '/characters/:id/portrait',
    h((req) => {
      const id = intParam(req.params.id);
      logged(ctx.db, id, 'gm', () => removePortrait(ctx.db, ctx.paths.uploadsDir, id));
      return characters.get(ctx.db, id);
    }),
  );
  // "Something changed", for the GM's pages that show what players can change (their sheets).
  r.get('/events', streamChanges(ctx));
  // Party progression: awards of experience or a level, and who was at each session.
  r.get(
    '/campaigns/:id/awards',
    h((req) => ({ awards: listAwards(ctx.db, intParam(req.params.id)), attendance: attendanceCounts(ctx.db, intParam(req.params.id)) })),
  );
  r.post(
    '/campaigns/:id/awards',
    h((req) => giveAward(ctx.db, intParam(req.params.id), req.body)),
  );
  r.delete(
    '/campaigns/:id/awards/:batch',
    h((req) => removeAward(ctx.db, intParam(req.params.id), String(req.params.batch))),
  );
  r.get(
    '/sessions/:id/attendance',
    h((req) => ({ present: attendance(ctx.db, intParam(req.params.id)) })),
  );
  r.put(
    '/sessions/:id/attendance',
    h((req) => ({ present: setAttendance(ctx.db, intParam(req.params.id), req.body) })),
  );
  mountCrud(r, ctx, '/characters', characters, ['campaign_id']);
  mountCrud(r, ctx, '/quests', quests, ['campaign_id', 'status']);
  r.post(
    '/adventures/from-hook',
    h((req) => adventureFromHook(ctx.db, String(req.body?.hookId), req.body?.campaignId ?? null)),
  );
  mountCrud(r, ctx, '/adventures', adventures, ['campaign_id', 'status']);
  r.post(
    '/scenes/:id/copy',
    h((req) => copyScene(ctx.db, intParam(req.params.id), intParam(req.body?.adventureId, 'adventureId'))),
  );
  mountCrud(r, ctx, '/scenes', scenes, ['adventure_id']);
  mountCrud(r, ctx, '/scene-links', sceneLinks, ['adventure_id']);
  r.post(
    '/sessions/next',
    h((req) => createNextSession(ctx.db, intParam(req.body?.campaignId, 'campaignId'), String(req.body?.title ?? ''))),
  );
  r.get(
    '/sessions/:id/briefing',
    h((req) => sessionBriefing(ctx.db, intParam(req.params.id))),
  );
  // Stat blocks for creatures, hazards and fight-ready people.
  // The world's own, then the creatures from the GM's books. An NPC card that names a Monster Manual stat block
  // ("base") carries that block too, when the GM's books have it.
  r.get(
    '/statblocks',
    h(() => [...statblockIndex(ctx.db), ...bookCreatureIndex(ctx.db)]),
  );
  r.get(
    '/statblocks/:id',
    h((req) => {
      const id = String(req.params.id);
      if (/^(book|srd|wk|open5e):/.test(id)) return bookCreature(ctx.db, id);
      const s = statblockFor(ctx.db, id);
      if (!s?.base) return s;
      // A short card takes the numbers it doesn't give from the book block it names (the tracker reads them).
      const baseBlock = creatureByName(ctx.db, s.base) as Partial<StatBlock> | null;
      return { ...s, ac: s.ac ?? baseBlock?.ac, hp: s.hp ?? baseBlock?.hp, hpAvg: s.hpAvg ?? baseBlock?.hpAvg, init: s.init ?? baseBlock?.init, cr: s.cr ?? baseBlock?.cr, baseBlock };
    }),
  );
  // The GM's own stat block for a record of theirs: a book block and its changes.
  r.put(
    '/statblocks/:id',
    h((req) => setLibraryStatblock(ctx.db, String(req.params.id), req.body)),
  );
  r.delete(
    '/statblocks/:id',
    h((req) => {
      deleteLibraryStatblock(ctx.db, String(req.params.id));
      return { ok: true };
    }),
  );
  // The GM's books: creatures and items to browse, and an item's rules by the name it goes by.
  r.get(
    '/books',
    h(() => bookCounts(ctx.db)),
  );
  r.get(
    '/books/creatures',
    h((req) => bookCreatures(ctx.db, String(req.query.q ?? ''), Number(req.query.limit ?? 2000))),
  );
  r.get(
    '/books/creatures/:id',
    h((req) => requireBookCreature(ctx.db, String(req.params.id))),
  );
  r.get(
    '/books/items',
    h((req) => bookItems(ctx.db, String(req.query.q ?? ''), Number(req.query.limit ?? 2000))),
  );
  // The GM's own magic items and spells (kept in the library; they join the books' in every list).
  r.get(
    '/homebrew',
    h((req) => listHomebrew(ctx.db, req.query.kind === 'item' || req.query.kind === 'spell' ? req.query.kind : undefined)),
  );
  r.get(
    '/homebrew/record/:id',
    h((req) => ({ rules: homebrewForRecord(ctx.db, String(req.params.id)) })),
  );
  r.post(
    '/homebrew',
    h((req) => saveHomebrew(ctx.db, req.body)),
  );
  r.put(
    '/homebrew/:id',
    h((req) => saveHomebrew(ctx.db, req.body, intParam(req.params.id))),
  );
  r.delete(
    '/homebrew/:id',
    h((req) => {
      deleteHomebrew(ctx.db, intParam(req.params.id));
      return { ok: true };
    }),
  );
  // Encounters from the books: groups for the party's level, in a terrain or one of the world's regions.
  r.get(
    '/books/encounters',
    h((req) => {
      // A place gives its terrain, and its danger the difficulty unless one is asked for.
      const region = String(req.query.region ?? '');
      const profile = region ? placeProfile(ctx.db, region) : null;
      const terrain = profile ? profile.terrain : (listParam(req.query.terrain) ?? []);
      return {
        terrain,
        ...suggestEncounters(ctx.db, {
          level: Number(req.query.level ?? 1),
          size: Number(req.query.size ?? 4),
          difficulty: (req.query.difficulty ? String(req.query.difficulty) : profile ? difficultyFor(profile.danger) : 'moderate') as Difficulty,
          terrain,
        }),
      };
    }),
  );
  r.get(
    '/books/terrains',
    h(() => ({
      terrains: TERRAINS,
      // Every region-sized place with a terrain (its own fact, a place it's in, or its setting pack's).
      regions: placesWithTerrain(ctx.db).map((p) => ({ id: p.id, label: p.label, terrain: p.terrain, danger: p.danger, wealth: p.wealth })),
    })),
  );
  r.get(
    '/books/item',
    h((req) => itemByName(ctx.db, String(req.query.name ?? ''))),
  );
  // The Return: a clock only the GM sees; players get its omens.
  r.get(
    '/return',
    h((req) => returnClock(ctx.db, intParam(req.query.campaign_id, 'campaign_id'))),
  );
  r.post(
    '/return',
    h((req) => setReturnStage(ctx.db, intParam(req.body?.campaign_id, 'campaign_id'), req.body ?? {})),
  );
  // The faction web: every tie, with what players know.
  r.get(
    '/faction-web',
    h((req) => factionWeb(ctx.db, req.query.campaign_id ? intParam(req.query.campaign_id, 'campaign_id') : null)),
  );
  r.post(
    '/faction-web/reveal',
    h((req) => revealTie(ctx.db, intParam(req.body?.campaign_id, 'campaign_id'), String(req.body?.a ?? ''), String(req.body?.b ?? ''), !!req.body?.on)),
  );
  r.get(
    '/sessions/:id/nearby',
    h((req) => nearbyPeople(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/sessions/:id/recap-draft',
    h((req) => ({ draft: generateRecapDraft(ctx.db, intParam(req.params.id)) })),
  );
  r.post(
    '/sessions/:id/start',
    h((req) => {
      const id = intParam(req.params.id);
      const s = sessions.get(ctx.db, id) as { played_on: string };
      return sessions.update(ctx.db, id, { status: 'live', played_on: s.played_on || new Date().toISOString().slice(0, 10) });
    }),
  );
  r.post(
    '/sessions/:id/end',
    h((req) => sessions.update(ctx.db, intParam(req.params.id), { status: 'completed' })),
  );
  mountCrud(r, ctx, '/sessions', sessions, ['campaign_id', 'status']);
  mountCrud(r, ctx, '/session-log', sessionLog, ['session_id', 'kind']);

  // Every change to campaign state and faction plans is one undo step (repo/undo.ts); GETs come from mountCrud below.
  type StateRow = { campaign_id: number; field: string; value: string };
  type PlanRow = { campaign_id: number | null; title: string };
  const stateRow = (id: number) => campaignState.get(ctx.db, id) as StateRow;
  const planRow = (id: number) => factionPlans.get(ctx.db, id) as PlanRow;
  r.post(
    '/campaign-state',
    h((req) => {
      const b = (req.body ?? {}) as Partial<StateRow> & { status?: string };
      const verb = b.status === 'proposed' ? 'Proposed' : 'Recorded';
      return undoable(ctx.db, `${verb} ${b.field ?? 'a change'} → ${b.value ?? ''}`, b.campaign_id, () => recordState(ctx.db, req.body));
    }),
  );
  r.post(
    '/campaign-state/:id/decide',
    h((req) => {
      const s = stateRow(intParam(req.params.id));
      return undoable(ctx.db, `${req.body?.accept ? 'Accepted' : 'Rejected'} ${s.field} → ${s.value}`, s.campaign_id, () => decideState(ctx.db, intParam(req.params.id), !!req.body?.accept));
    }),
  );
  r.post(
    '/campaign-state/:id/promote',
    h((req) => ({ proposalId: proposePromotion(ctx.db, intParam(req.params.id), String(req.body?.reason ?? '')) })),
  );
  r.patch(
    '/campaign-state/:id',
    h((req) => {
      const s = stateRow(intParam(req.params.id));
      return undoable(ctx.db, `Edited ${s.field}`, s.campaign_id, () => campaignState.update(ctx.db, intParam(req.params.id), req.body));
    }),
  );
  r.delete(
    '/campaign-state/:id',
    h((req) => {
      const s = stateRow(intParam(req.params.id));
      undoable(ctx.db, `Deleted ${s.field} → ${s.value}`, s.campaign_id, () => campaignState.remove(ctx.db, intParam(req.params.id)));
      return { ok: true };
    }),
  );
  mountCrud(r, ctx, '/campaign-state', campaignState, ['campaign_id', 'entity_id', 'session_id', 'status']);

  r.post(
    '/faction-plans/:id/advance',
    h((req) => {
      const p = planRow(intParam(req.params.id));
      const delta = Number(req.body?.delta ?? 1);
      return undoable(ctx.db, `${delta >= 0 ? 'Advanced' : 'Set back'} “${p.title}” by ${Math.abs(delta)}`, p.campaign_id, () =>
        advancePlan(ctx.db, intParam(req.params.id), delta, String(req.body?.reason ?? '')),
      );
    }),
  );
  r.post(
    '/faction-plans',
    h((req) => {
      const b = (req.body ?? {}) as Partial<PlanRow>;
      return undoable(ctx.db, `Added the plan “${b.title ?? ''}”`, b.campaign_id, () => factionPlans.create(ctx.db, req.body));
    }),
  );
  r.patch(
    '/faction-plans/:id',
    h((req) => {
      const p = planRow(intParam(req.params.id));
      return undoable(ctx.db, `Edited the plan “${p.title}”`, p.campaign_id, () => factionPlans.update(ctx.db, intParam(req.params.id), req.body));
    }),
  );
  r.delete(
    '/faction-plans/:id',
    h((req) => {
      const p = planRow(intParam(req.params.id));
      undoable(ctx.db, `Deleted the plan “${p.title}”`, p.campaign_id, () => factionPlans.remove(ctx.db, intParam(req.params.id)));
      return { ok: true };
    }),
  );
  // The recent changes to plans and campaign state that can be undone, and undoing one.
  r.get(
    '/undo',
    h((req) => recentActions(ctx.db, req.query.campaign_id ? Number(req.query.campaign_id) : getActiveCampaignId(ctx.db))),
  );
  r.post(
    '/undo/:id',
    h((req) => undoAction(ctx.db, intParam(req.params.id))),
  );
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
  r.post(
    '/rumours',
    h((req) => createRumour(ctx.db, req.body)),
  );
  r.get(
    '/party-ties',
    h((req) => partyTiesFor(ctx.db, String(req.query.entity ?? ''), req.query.campaign_id ? Number(req.query.campaign_id) : getActiveCampaignId(ctx.db))),
  );
  // How factions feel about each other: links between groups (allied, uneasy, rival, at war).
  r.get(
    '/faction-stances',
    h(() => {
      const G = typeRegistry(ctx.db).with('group');
      const gIn = `(${G.map(() => '?').join(',') || "''"})`;
      const groups = ctx.db.prepare(`SELECT id, name, type, realm FROM entities WHERE type IN ${gIn} AND archived = 0 ORDER BY realm, type, name`).all(...G) as {
        id: string;
        name: string;
        type: string;
        realm: string;
      }[];
      const links = ctx.db
        .prepare(
          `SELECT r.source_id, r.target_id, r.type, r.label, r.description FROM relationships r
           JOIN entities a ON a.id = r.source_id JOIN entities b ON b.id = r.target_id
           WHERE r.type IN ('allied_with','opposes','related_to') AND a.type IN ${gIn} AND b.type IN ${gIn}`,
        )
        .all(...G, ...G) as { source_id: string; target_id: string; type: string; label: string; description: string }[];
      return { groups, links };
    }),
  );
  // Mysteries, secrets and clues (GM only; never part of player data).
  const campaignOf = (v: unknown) => Number(v ?? getActiveCampaignId(ctx.db) ?? 0);
  r.get(
    '/mysteries',
    h((req) => listMysteries(ctx.db, campaignOf(req.query.campaign_id), req.query.entity ? String(req.query.entity) : undefined)),
  );
  r.post(
    '/mysteries',
    h((req) => createMystery(ctx.db, req.body)),
  );
  r.post(
    '/mysteries/sync',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      return { rumours: syncRumours(ctx.db, readPlayerText()), mysteries: syncMysteries(ctx.db) };
    }),
  );
  r.patch(
    '/mysteries/:id',
    h((req) => updateMystery(ctx.db, intParam(req.params.id), req.body)),
  );
  r.post(
    '/secrets',
    h((req) => createSecret(ctx.db, req.body)),
  );
  r.patch(
    '/secrets/:id',
    h((req) => updateSecret(ctx.db, intParam(req.params.id), req.body)),
  );
  r.delete(
    '/secrets/:id',
    h((req) => deleteSecret(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/secrets/:id/state',
    h((req) => setSecretState(ctx.db, intParam(req.params.id), campaignOf(req.body?.campaign_id), String(req.body?.state) as SecretState, req.body?.note)),
  );
  r.post(
    '/clues',
    h((req) => createClue(ctx.db, req.body)),
  );
  r.delete(
    '/clues/:id',
    h((req) => deleteClue(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/clues/:id/found',
    h((req) => setClueFound(ctx.db, intParam(req.params.id), campaignOf(req.body?.campaign_id), !!req.body?.found)),
  );
  r.post(
    '/rumours/sync',
    h(() => {
      requirePack(ctx.db, 'worldkeeper');
      return syncRumours(ctx.db, readPlayerText());
    }),
  );
  r.patch(
    '/rumours/:id',
    h((req) => updateRumour(ctx.db, intParam(req.params.id), req.body)),
  );
  r.delete(
    '/rumours/:id',
    h((req) => (deleteRumour(ctx.db, intParam(req.params.id)), { ok: true })),
  );
  r.post(
    '/rumours/:id/heard',
    h((req) => setHeard(ctx.db, intParam(req.params.id), Number(req.body?.campaign_id ?? getActiveCampaignId(ctx.db) ?? 0), !!req.body?.heard, String(req.body?.note ?? ''))),
  );
  mountCrud(r, ctx, '/encounters', encounters, ['campaign_id', 'session_id', 'status']);
  mountCrud(r, ctx, '/notes', notes, ['campaign_id']);
  r.post(
    '/random-tables/:id/roll',
    h((req) => {
      // The book creatures a row names, for their stat blocks.
      const r = rollTable(ctx.db, intParam(req.params.id)) as { result: string };
      return { ...r, creatures: creatureMentions(ctx.db, r.result ?? '') };
    }),
  );
  // The party's level (the average of its player characters), for tables and encounters.
  r.get(
    '/campaigns/:id/party-level',
    h((req) => ({ level: partyLevel(ctx.db, intParam(req.params.id)) })),
  );
  // A place's encounter table, generated (or regenerated) from the rules packs for a level; any table copied to edit.
  r.post(
    '/regions/:id/encounter-table',
    h((req) => generateEncounterTable(ctx.db, String(req.params.id), Number(req.body?.level ?? 1))),
  );
  r.post(
    '/random-tables/:id/copy',
    h((req) => copyTable(ctx.db, intParam(req.params.id))),
  );
  mountCrud(r, ctx, '/random-tables', randomTables, ['region_id', 'kind']);

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
  r.get(
    '/dice/log',
    h(() => ctx.db.prepare('SELECT * FROM dice_log ORDER BY id DESC LIMIT 50').all()),
  );

  // ---- World-specific views (read canon + overlay campaign state; never modify canon) ----
  r.get(
    '/special/vaults',
    h((req) => {
      const cid = req.query.campaign ? Number(req.query.campaign) : getActiveCampaignId(ctx.db);
      const vaults = ctx.db.prepare(`SELECT id, name, fields, body, canon_status, pack_id FROM entities WHERE type = 'vault' ORDER BY id`).all() as {
        id: string;
        pack_id: string | null;
        name: string;
        fields: string;
        body: string;
        canon_status: string;
      }[];
      return vaults.map((v) => {
        const fields = parseJson<[string, string][]>(v.fields, []);
        const state = cid
          ? (ctx.db.prepare(`SELECT * FROM campaign_state WHERE campaign_id = ? AND entity_id = ? AND status IN ('active','proposed') ORDER BY id DESC`).all(cid, v.id) as {
              field: string;
              value: string;
              status: string;
              note: string;
              id: number;
            }[])
          : [];
        const related = ctx.db
          .prepare(
            `SELECT DISTINCT e.id, e.name, e.type FROM relationships r JOIN entities e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
             WHERE (r.source_id = ? OR r.target_id = ?) AND e.type IN ('faction','cult','npc','adventure_hook','vault_key','landmark','settlement','region')`,
          )
          .all(v.id, v.id, v.id);
        return { id: v.id, name: v.name, canon_status: v.canon_status, pack_id: v.pack_id, fields, body: v.body, campaignState: state, related };
      });
    }),
  );
  r.get(
    '/special/shards',
    h((req) => {
      const cid = req.query.campaign ? Number(req.query.campaign) : getActiveCampaignId(ctx.db);
      const shards = ctx.db.prepare(`SELECT id, name, fields, body, canon_status, canon_flags, pack_id FROM entities WHERE type = 'shard' ORDER BY id`).all() as {
        id: string;
        pack_id: string | null;
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
        pack_id: s.pack_id,
        canon_flags: parseJson(s.canon_flags, []),
        fields: parseJson(s.fields, []),
        body: s.body,
        campaignState: cid ? ctx.db.prepare(`SELECT * FROM campaign_state WHERE campaign_id = ? AND entity_id = ? AND status IN ('active','proposed') ORDER BY id DESC`).all(cid, s.id) : [],
        related: ctx.db
          .prepare(
            `SELECT DISTINCT e.id, e.name, e.type FROM relationships r JOIN entities e ON e.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
             WHERE (r.source_id = ? OR r.target_id = ?) AND e.type IN ('faction','cult','npc','landmark','settlement','region','ethereal_domain','artifact')`,
          )
          .all(s.id, s.id, s.id),
      }));
    }),
  );
  const standingCampaign = (v: unknown) => {
    const id = v != null && v !== '' ? Number(v) : getActiveCampaignId(ctx.db);
    if (!id || !Number.isInteger(id)) throw badRequest('Choose an active campaign first');
    return id;
  };
  // Treasure: the world's own items (catalogue), the Treasure tool, and the party's treasure log.
  r.get(
    '/treasure/options',
    h((req) => {
      const d = treasureData();
      const worldTreasure = moduleOn(ctx.db, 'setting-treasure', req.query.campaign_id ? Number(req.query.campaign_id) : undefined);
      const books = bookTreasure(ctx.db);
      // The setting's regions when its treasure is on; and the books, whenever they hold magic items.
      return {
        tiers: d.tiers.map((t) => ({ key: t.key, label: t.label })),
        regions: [
          ...(worldTreasure ? Object.entries(d.regions).map(([key, v]) => ({ key, label: v.label, ids: v.ids })) : []),
          ...(books.magic.length ? [{ key: BOOKS_REGION, label: 'From the SRD and your books', ids: [] }] : []),
        ],
        // Any region-sized place: the setting's pools where its pack covers it, else the books by the place's wealth.
        places: books.magic.length || worldTreasure ? regionPlaces(ctx.db).map((p) => ({ id: p.id, label: p.label, wealth: p.wealth })) : [],
      };
    }),
  );
  r.get(
    '/treasure/catalogue/:id',
    h((req) => catalogueFor(String(req.params.id))),
  );
  r.post(
    '/treasure/roll',
    h((req) => {
      const cid = req.body?.campaign_id ? Number(req.body.campaign_id) : undefined;
      // A place picks its own source (the setting's region that holds it, or the books by its wealth).
      const src = req.body?.place ? treasureSourceFor(ctx.db, String(req.body.place), moduleOn(ctx.db, 'setting-treasure', cid)) : null;
      const region = src?.region ?? String(req.body?.region ?? '');
      if (!moduleOn(ctx.db, 'setting-treasure', cid) && region !== BOOKS_REGION) throw badRequest('The setting’s treasure is switched off: roll from your books.');
      return rollTreasure({
        tier: String(req.body?.tier ?? ''),
        region,
        kind: req.body?.kind === 'individual' ? 'individual' : 'hoard',
        books: region === BOOKS_REGION ? bookTreasure(ctx.db) : undefined,
        place: src?.place,
        fading: moduleOn(ctx.db, 'fading-salvage', cid),
      });
    }),
  );
  r.post(
    '/party-treasure/from-roll',
    h((req) => addRollToParty(ctx.db, standingCampaign(req.body?.campaign_id), req.body?.roll, String(req.body?.found_at ?? ''))),
  );
  mountCrud(r, ctx, '/party-treasure', partyTreasure, ['campaign_id', 'status']);
  // The state of the world, region by region.
  r.get(
    '/regions/state',
    h((req) => allRegionStates(ctx.db, standingCampaign(req.query.campaign_id))),
  );
  // "What the party knows", for players: JSON for the page, or a Markdown file.
  r.get(
    '/campaigns/:id/party-export',
    h((req) => partyExport(ctx.db, intParam(req.params.id))),
  );
  r.get('/campaigns/:id/party-export.md', (req, res, next) => {
    try {
      const x = partyExport(ctx.db, intParam(req.params.id));
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${x.title.replace(/[^\w -]/g, '').trim() || 'campaign'} - what the party knows.md"`);
      res.send(x.markdown);
    } catch (e) {
      next(e);
    }
  });
  // The campaign calendar: its date, time passing, and the GM's events.
  mountCrud(r, ctx, '/calendar-events', calendarEvents, ['campaign_id']);
  r.get(
    '/calendar',
    h((req) => {
      const id = standingCampaign(req.query.campaign_id);
      return { def: campaignCalendar(ctx.db, id), date: campaignDate(ctx.db, id), start: campaignDates(ctx.db, id).start, coming: comingUp(ctx.db, id, Number(req.query.days) || 30) };
    }),
  );
  // Each world's calendar: a setting pack's, a preset, or the GM's own.
  r.get(
    '/calendars',
    h(() => listCalendars(ctx.db)),
  );
  r.put(
    '/calendars/:worldId',
    h((req) => setWorldCalendar(ctx.db, String(req.params.worldId), req.body)),
  );
  // A campaign's starting date (its current date moves with /calendar/date).
  r.put(
    '/calendar/start',
    h((req) => ({ text: writeCampaignDate(ctx.db, standingCampaign(req.body?.campaign_id), 'start', req.body?.date) })),
  );
  r.post(
    '/calendar/date',
    h((req) => setCampaignDate(ctx.db, standingCampaign(req.body?.campaign_id), { date: req.body?.date, days: req.body?.days == null ? undefined : Number(req.body.days), reason: req.body?.reason })),
  );
  // Bastions and downtime.
  mountCrud(r, ctx, '/bastions', bastions, ['campaign_id']);
  r.get(
    '/bastions/:id/turns',
    h((req) => bastionTurns(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/bastions/:id/turn',
    h((req) => takeBastionTurn(ctx.db, intParam(req.params.id), { event: req.body?.event, notes: req.body?.notes })),
  );
  r.get(
    '/bastions/:id/host',
    h((req) => {
      const b = bastions.get(ctx.db, intParam(req.params.id)) as { campaign_id: number; host_faction_id: string | null };
      return hostStanding(ctx.db, b.campaign_id, b.host_faction_id);
    }),
  );
  mountCrud(r, ctx, '/downtime', downtime, ['campaign_id']);
  // Handouts: give one to the players (or take it back).
  mountCrud(r, ctx, '/handouts', handouts, ['campaign_id']);
  r.post(
    '/handouts/:id/push',
    h((req) => pushHandout(ctx.db, intParam(req.params.id), req.body?.pushed !== false)),
  );
  // Faction standing: the party's Renown with each faction in a campaign (the active one unless named).

  // The Renown ladder (the setting pack's, or the plain one), as written.
  r.get(
    '/standing/ladder',
    h(() => ladder(ctx.db).spec),
  );
  r.get(
    '/standing',
    h((req) => standingFor(ctx.db, standingCampaign(req.query.campaign_id))),
  );
  r.post(
    '/standing/adjust',
    h((req) => adjustRenown(ctx.db, standingCampaign(req.body?.campaign_id), String(req.body?.faction_id ?? ''), Number(req.body?.delta), String(req.body?.reason ?? ''))),
  );
  r.delete(
    '/standing/log/:id',
    h((req) => undoRenown(ctx.db, standingCampaign(req.query.campaign_id), intParam(req.params.id))),
  );
  r.patch(
    '/standing/:factionId',
    h((req) =>
      setStandingOptions(ctx.db, standingCampaign(req.body?.campaign_id), String(req.params.factionId), {
        player_visible: req.body?.player_visible === undefined ? undefined : !!req.body.player_visible,
        notes: req.body?.notes,
      }),
    ),
  );
  return r;
}
