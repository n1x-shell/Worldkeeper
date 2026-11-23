/**
 * Faction standing: the party's Renown with each faction in a campaign, the ranks it has reached, and a log of every
 * change. What each rank brings comes from the faction's "Standing with…" rule record (a rule with a Faction field),
 * so the GM edits it like any other record.
 */
import { revealedIds } from './reveals.js';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { PLAIN_LADDER, earnedRanks, makeLadder, nextRank, rankOf, type RankLadder } from '../../../shared/standing.js';
import { installedManifests } from '../packs/registry.js';

type RankName = string;

/** The Renown ladder: an installed setting pack's, else the plain one. */
export function ladder(db: DB): RankLadder {
  const spec = installedManifests(db).find((m) => m.renown?.ranks?.length)?.renown;
  return spec ? makeLadder(spec) : PLAIN_LADDER;
}

export interface StandingRow {
  faction_id: string;
  name: string;
  type: string;
  revealed: boolean;
  renown: number;
  rank: RankName;
  next: { name: RankName; at: number } | null;
  player_visible: boolean;
  notes: string;
  /** The faction's standing record, and what it says each rank brings. */
  rule_id: string | null;
  values: string;
  ranks: Partial<Record<RankName, string>>;
  log: { id: number; delta: number; reason: string; session_id: number | null; created_at: string }[];
}

/** Each faction's "Standing with…" record: faction id -> record id, values and rank texts. */
export function standingRules(db: DB) {
  const L = ladder(db);
  const out = new Map<string, { rule_id: string; values: string; ranks: Partial<Record<RankName, string>> }>();
  const rows = db.prepare(`SELECT id, fields, body FROM entities WHERE type = 'rule' AND archived = 0 AND fields LIKE '%"Faction"%'`).all() as { id: string; fields: string; body: string }[];
  for (const r of rows) {
    const faction = parseJson<[string, string][]>(r.fields, [])
      .find(([k]) => k.toLowerCase() === 'faction')?.[1]
      ?.match(/[A-Z]{2,5}-\d{3,4}/)?.[0];
    if (!faction) continue;
    const sections = new Map<string, string>();
    for (const part of r.body.split(/^## /m).slice(1)) {
      const nl = part.indexOf('\n');
      sections.set(part.slice(0, nl).trim().toLowerCase(), part.slice(nl + 1).trim());
    }
    const ranks: Partial<Record<RankName, string>> = {};
    for (const { name } of L.ranks) {
      const t = sections.get(name.toLowerCase());
      if (t) ranks[name] = t;
    }
    out.set(faction, { rule_id: r.id, values: sections.get('what they value') ?? '', ranks });
  }
  return out;
}

function checkCampaign(db: DB, campaignId: number) {
  const c = db.prepare('SELECT active_factions FROM campaigns WHERE id = ?').get(campaignId) as { active_factions: string } | undefined;
  if (!c) throw notFound('Campaign');
  return parseJson<string[]>(c.active_factions, []);
}

/**
 * The campaign's standing with every faction worth showing: those with a standing record, those the campaign lists
 * as active, and any the party has Renown with.
 */
export function standingFor(db: DB, campaignId: number): StandingRow[] {
  const active = checkCampaign(db, campaignId);
  const rules = standingRules(db);
  const L = ladder(db);
  const rows = new Map(
    (
      db.prepare('SELECT faction_id, renown, player_visible, notes FROM faction_standing WHERE campaign_id = ?').all(campaignId) as {
        faction_id: string;
        renown: number;
        player_visible: number;
        notes: string;
      }[]
    ).map((r) => [r.faction_id, r]),
  );
  const ids = [...new Set([...rules.keys(), ...active, ...rows.keys()])];
  const ent = db.prepare('SELECT name, type, revealed FROM entities WHERE id = ?');
  const logQ = db.prepare('SELECT id, delta, reason, session_id, created_at FROM renown_log WHERE campaign_id = ? AND faction_id = ? ORDER BY id DESC LIMIT 20');
  const out: StandingRow[] = [];
  for (const id of ids) {
    const e = ent.get(id) as { name: string; type: string; revealed: number } | undefined;
    if (!e) continue;
    const s = rows.get(id);
    const renown = s?.renown ?? 0;
    const rule = rules.get(id);
    out.push({
      faction_id: id,
      name: e.name,
      type: e.type,
      revealed: !!e.revealed,
      renown,
      rank: rankOf(renown, L),
      next: nextRank(renown, L),
      player_visible: s ? !!s.player_visible : true,
      notes: s?.notes ?? '',
      rule_id: rule?.rule_id ?? null,
      values: rule?.values ?? '',
      ranks: rule?.ranks ?? {},
      log: logQ.all(campaignId, id) as StandingRow['log'],
    });
  }
  // Most standing first, then by name.
  return out.sort((a, b) => Math.abs(b.renown) - Math.abs(a.renown) || a.name.localeCompare(b.name));
}

function liveSessionId(db: DB, campaignId: number): number | null {
  const s = db.prepare(`SELECT id FROM sessions WHERE campaign_id = ? AND status = 'live' ORDER BY number DESC LIMIT 1`).get(campaignId) as { id: number } | undefined;
  return s?.id ?? null;
}

/** Change the party's Renown with a faction, log why, and note it in the live session's log. */
export function adjustRenown(db: DB, campaignId: number, factionId: string, delta: number, reason = '') {
  checkCampaign(db, campaignId);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) throw badRequest('Renown changes by a whole number, from -100 to 100.');
  const f = db.prepare('SELECT name FROM entities WHERE id = ?').get(factionId) as { name: string } | undefined;
  if (!f) throw notFound('Faction');
  const sessionId = liveSessionId(db, campaignId);
  db.transaction(() => {
    const before = (db.prepare('SELECT renown FROM faction_standing WHERE campaign_id = ? AND faction_id = ?').get(campaignId, factionId) as { renown: number } | undefined)?.renown ?? 0;
    const after = before + delta;
    db.prepare(
      `INSERT INTO faction_standing (campaign_id, faction_id, renown) VALUES (?, ?, ?)
       ON CONFLICT(campaign_id, faction_id) DO UPDATE SET renown = excluded.renown, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).run(campaignId, factionId, after);
    db.prepare('INSERT INTO renown_log (campaign_id, faction_id, delta, reason, session_id) VALUES (?, ?, ?, ?, ?)').run(campaignId, factionId, delta, reason.trim().slice(0, 500), sessionId);
    if (sessionId != null) {
      const L = ladder(db);
      const rankNote = rankOf(after, L) !== rankOf(before, L) ? ` Now ${rankOf(after, L)}.` : '';
      db.prepare(`INSERT INTO session_log (session_id, kind, text, entity_id) VALUES (?, 'standing', ?, ?)`).run(
        sessionId,
        `Standing with ${f.name}: ${delta > 0 ? '+' : ''}${delta}${reason.trim() ? ` (${reason.trim()})` : ''}.${rankNote}`,
        factionId,
      );
    }
  })();
  return standingFor(db, campaignId).find((r) => r.faction_id === factionId)!;
}

/** Undo one logged change. */
export function undoRenown(db: DB, campaignId: number, logId: number) {
  const l = db.prepare('SELECT faction_id, delta FROM renown_log WHERE id = ? AND campaign_id = ?').get(logId, campaignId) as { faction_id: string; delta: number } | undefined;
  if (!l) throw notFound('Change');
  db.transaction(() => {
    db.prepare('UPDATE faction_standing SET renown = renown - ? WHERE campaign_id = ? AND faction_id = ?').run(l.delta, campaignId, l.faction_id);
    db.prepare('DELETE FROM renown_log WHERE id = ?').run(logId);
  })();
  return standingFor(db, campaignId).find((r) => r.faction_id === l.faction_id)!;
}

/** Show or hide a faction's standing from players, and the GM's notes on it. */
export function setStandingOptions(db: DB, campaignId: number, factionId: string, opts: { player_visible?: boolean; notes?: string }) {
  checkCampaign(db, campaignId);
  db.prepare(`INSERT INTO faction_standing (campaign_id, faction_id) VALUES (?, ?) ON CONFLICT DO NOTHING`).run(campaignId, factionId);
  if (opts.player_visible !== undefined) db.prepare('UPDATE faction_standing SET player_visible = ? WHERE campaign_id = ? AND faction_id = ?').run(opts.player_visible ? 1 : 0, campaignId, factionId);
  if (opts.notes !== undefined) db.prepare('UPDATE faction_standing SET notes = ? WHERE campaign_id = ? AND faction_id = ?').run(String(opts.notes).slice(0, 5000), campaignId, factionId);
  return standingFor(db, campaignId).find((r) => r.faction_id === factionId)!;
}

/**
 * What players see: their standing with revealed factions the GM hasn't hidden, once it isn't Neutral, and what the
 * ranks they've reached bring. No GM notes, no log reasons.
 */
export function playerStanding(db: DB, campaignId: number | null) {
  if (campaignId == null) return [];
  const L = ladder(db);
  const known = revealedIds(db, campaignId);
  return standingFor(db, campaignId)
    .filter((r) => known.has(r.faction_id) && r.player_visible && r.rank !== L.neutral)
    .map((r) => ({
      faction_id: r.faction_id,
      name: r.name,
      renown: r.renown,
      rank: r.rank,
      next: r.next,
      // The ladder's ranks, lowest first, and which is neutral (for the player's view of where they stand).
      ladder: L.ranks.map((k) => k.name),
      neutral: L.neutral,
      earned: earnedRanks(r.renown, L)
        .filter((k) => r.ranks[k])
        .map((k) => ({ rank: k, text: r.ranks[k]! })),
    }));
}
