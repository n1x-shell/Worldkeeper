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
import { publishedRuleEntries } from '../repo/rulesPacks.js';
import { playerOmens } from '../repo/returnClock.js';
import { moduleOn, modulesOn } from '../repo/modules.js';
import { playerFactionWeb } from '../repo/factionWeb.js';
import { playerStanding } from '../repo/standing.js';
import { playerTreasure } from '../repo/treasure.js';
import { playerHandouts } from '../repo/handouts.js';
import { campaignDate, comingUp } from '../repo/calendar.js';
import { campaignCalendar } from '../repo/calendars.js';
import { playerRegions } from '../repo/regionState.js';
import type { DB } from '../db/connection.js';
import { SECRET_HEADING_RE, ENTITY_TYPE_LABELS, type EntityType } from '../../../shared/domain.js';
import { listRealms } from '../repo/realms.js';
import { listRecordTypes } from '../repo/recordTypes.js';
import type { RecordTypeDef } from '../../../shared/recordTypes.js';
import type { RealmInfo } from '../../../shared/realms.js';
import { parseJson } from '../lib/json.js';
import { splitSections } from '../import/parseMarkdown.js';
import { parseRefs, type MentionIndex } from '../../../shared/mentions.js';
import { loadMentionIndex } from '../repo/mentions.js';
import { playerExploration } from '../repo/exploration.js';
import { types } from '../repo/recordTypes.js';

export interface PlayerEntity {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  realm: string;
  realmLabel: string;
  /** Every continent it belongs to, for filtering: a people found on both continents counts under each. */
  realms: string[];
  /** Shaped by the Bloom: a species the spore-storms rewrote (tagged origin/bloom). */
  bloom?: boolean;
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
  tags?: string;
  revealed_sections: string;
  revealed_facts: string;
  revealed: number;
  archived: number;
  /** Read for structured facts only (a people's "Found in"); never sent to players. */
  fields?: string;
}

export function isSecretHeading(heading: string) {
  return SECRET_HEADING_RE.test(heading);
}

function revealedIdSet(db: DB): Set<string> {
  return new Set((db.prepare('SELECT id FROM entities WHERE revealed = 1 AND archived = 0').all() as { id: string }[]).map((r) => r.id));
}

/**
 * Rewrite record references for players: links to revealed records become player links showing the name;
 * references to unrevealed records keep only the words the DM wrote (never an ID or a link).
 */
function scrubRefs(text: string, revealed: Set<string>, index: MentionIndex): string {
  return parseRefs(text, index)
    .map((s) => {
      if (s.kind === 'text') return s.text;
      if (s.kind === 'link') return revealed.has(s.id) ? `[${s.label}](/player/e/${encodeURIComponent(s.id)})` : s.label;
      if (s.kind === 'broken') return /^[A-Z]{2,4}-/.test(s.label) ? '' : s.label;
      return '';
    })
    .join('');
}

/** Kinds of record whose names are ordinary words too often to link from prose. */
interface Lexicon {
  re: RegExp | null;
  byName: Map<string, string>;
}

/** Names of revealed records, as they are written in prose (no leading "The", no nickname or bracketed note; a god by the name before the comma). */
function buildLexicon(db: DB): Lexicon {
  const reg = types(db);
  // Not linked from prose: ordinary-word names, bookkeeping and adventure hooks. A shared name goes to the place.
  const NO_AUTOLINK = new Set(reg.list.filter((t) => t.traits.commonNoun || t.traits.meta || t.category === 'adventure').map((t) => t.key));
  const PLACE_TYPES = new Set(reg.with('place'));
  const rows = db.prepare(`SELECT id, name, type FROM entities WHERE revealed = 1 AND archived = 0`).all() as { id: string; name: string; type: string }[];
  const groups = new Map<string, { id: string; type: string }[]>();
  for (const r of rows) {
    if (NO_AUTOLINK.has(r.type)) continue;
    let base = r.name
      .split(/["“]/)[0]
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/^The\s+/, '')
      .trim();
    if (r.type === 'deity') base = base.split(',')[0].trim();
    if (base.length < 5 || base === 'World') continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push({ id: r.id, type: r.type });
  }
  const byName = new Map<string, string>();
  for (const [name, rs] of groups) {
    // A name shared by a place and something else (Kaelholm the city, Kaelholm the power) links to the place.
    const pick = rs.length === 1 ? rs[0] : rs.filter((x) => PLACE_TYPES.has(x.type)).length === 1 ? rs.find((x) => PLACE_TYPES.has(x.type))! : null;
    if (pick) byName.set(name, pick.id);
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = names.length ? new RegExp(`(?<![\\w'’-])(${names.map(esc).join('|')})(?![\\w-]|['’](?!s\\b))`, 'g') : null;
  return { re, byName };
}

/** Link the first plain mention of each revealed record on a page. Existing links, and the page's own record, are left alone. */
function autoLink(md: string, selfId: string, lex: Lexicon, linked: Set<string>): string {
  if (!lex.re || !md) return md;
  for (const m of md.matchAll(/\]\(\/player\/e\/([^)]+)\)/g)) linked.add(decodeURIComponent(m[1]));
  // Name lists ("Common names.") are lists of names, not mentions of people.
  return md
    .split('\n')
    .map((line) => (/Common names/.test(line) ? line : autoLinkLine(line, selfId, lex, linked)))
    .join('\n');
}

function autoLinkLine(md: string, selfId: string, lex: Lexicon, linked: Set<string>): string {
  return md
    .split(/(\[[^\]]*\]\([^)]*\))/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(lex.re!, (name: string) => {
            const id = lex.byName.get(name);
            if (!id || id === selfId || linked.has(id)) return name;
            linked.add(id);
            return `[${name}](/player/e/${encodeURIComponent(id)})`;
          }),
    )
    .join('');
}

function project(r: Row, revealed: Set<string>, index: MentionIndex, realmsInfo: RealmContext, lex?: Lexicon, placeRealm?: Map<string, string>): PlayerEntity {
  const wanted = new Set(parseJson<string[]>(r.revealed_sections, []));
  const sections = splitSections(r.body)
    .filter((s) => s.heading && wanted.has(s.heading) && !isSecretHeading(s.heading))
    .map((s) => ({
      heading: s.heading,
      content: scrubRefs(s.content, revealed, index),
    }));
  const linked = new Set<string>();
  // Peoples and callings belong wherever their player-visible text says they're found (never from GM text).
  const realms = new Set<string>([r.realm]);
  // A people's "Found in" fact (its template's) says where it lives; without one, it's read from the player text.
  const foundIn = realmsInfo.folk.has(r.type) ? (parseJson<[string, string][]>(r.fields ?? '[]', []).find(([k, v]) => /^found in$/i.test(k) && v.trim())?.[1] ?? '') : '';
  if (foundIn) {
    for (const c of realmsInfo.continents) if (c.nameRe.test(foundIn) || foundIn.toLowerCase().includes(c.id)) realms.add(c.id);
  } else if (realmsInfo.folk.has(r.type)) {
    // A people of a world is found on its continents; and on any continent its player text names.
    const own = realmsInfo.byId.get(r.realm);
    if (own?.kind === 'world') realmsInfo.continents.filter((c) => c.parent_id === own.id || !c.parent_id).forEach((c) => realms.add(c.id));
    const text = [r.player_summary, ...sections.map((s) => `${s.heading}\n${s.content}`)].join('\n');
    for (const c of realmsInfo.continents) if (c.nameRe.test(text)) realms.add(c.id);
  }
  const out: PlayerEntity = {
    id: r.id,
    name: r.name,
    type: r.type,
    typeLabel: ENTITY_TYPE_LABELS[r.type as EntityType] ?? r.type,
    realm: r.realm,
    realmLabel: realmsInfo.byId.get(r.realm)?.name ?? r.realm,
    realms: [...realms],
    ...(parseJson<string[]>(r.tags ?? '[]', []).includes('origin/bloom') ? { bloom: true } : {}),
    summary: lex ? autoLink(scrubRefs(r.player_summary, revealed, index), r.id, lex, linked) : scrubRefs(r.player_summary, revealed, index),
    facts: parseJson<string[]>(r.revealed_facts, []).map((f) => scrubRefs(f, revealed, index)),
    sections: lex
      ? sections.map((x) => ({
          ...x,
          content: autoLink(x.content, r.id, lex, linked),
        }))
      : sections,
  };
  // A people found in a named place of a continent (the Radiant Expanse, the Deepwood) is found on that continent.
  if (placeRealm && !foundIn && realmsInfo.folk.has(r.type)) {
    for (const m of [out.summary, ...out.sections.map((x) => x.content)].join('\n').matchAll(/\/player\/e\/([A-Z]{2,5}-\d{3,4})/g)) {
      const realm = placeRealm.get(m[1]);
      if (realm && realmsInfo.continents.some((c) => c.id === realm)) realms.add(realm);
    }
    out.realms = [...realms];
  }
  return out;
}

interface RealmContext {
  byId: Map<string, RealmInfo>;
  /** Continents, with a pattern for their name in text. */
  continents: (RealmInfo & { nameRe: RegExp })[];
  /** Peoples, species, cultures and callings (the registry's folk), whose continents are worked out. */
  folk: Set<string>;
}
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * The realms players may know of: those their revealed records are in, and what holds them (a continent's world).
 * A realm the GM has made but revealed nothing in stays unnamed, in the handbook and in every list.
 */
function visibleRealmIds(db: DB, list: RealmInfo[]): Set<string> {
  const byId = new Map(list.map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const { realm } of db.prepare('SELECT DISTINCT realm FROM entities WHERE revealed = 1 AND archived = 0').all() as { realm: string }[]) {
    for (let r = byId.get(realm); r && !out.has(r.id); r = r.parent_id ? byId.get(r.parent_id) : undefined) out.add(r.id);
  }
  return out;
}

function realmContext(db: DB): RealmContext {
  const list = listRealms(db, { includeArchived: true });
  const visible = visibleRealmIds(db, list);
  return {
    byId: new Map(list.map((r) => [r.id, r])),
    continents: list.filter((r) => r.kind === 'continent' && visible.has(r.id)).map((r) => ({ ...r, nameRe: new RegExp(`\\b${esc(r.name.replace(/^the\s+/i, ''))}\\b`) })),
    folk: new Set(types(db).of('folk')),
  };
}

/** The record types players see: those their revealed records have (a GM's own type stays unnamed until then). */
export function playerTypes(db: DB): RecordTypeDef[] {
  const used = new Set((db.prepare('SELECT DISTINCT type FROM entities WHERE revealed = 1 AND archived = 0').all() as { type: string }[]).map((r) => r.type));
  return listRecordTypes(db)
    .filter((t) => used.has(t.key))
    .map(({ builtin: _b, archived: _a, sort_order: _s, records: _r, ...t }) => t);
}

/** The realms players see: unarchived ones their revealed records are in (and what holds those), without counts. */
export function playerRealms(db: DB): Omit<RealmInfo, 'records'>[] {
  const list = listRealms(db);
  const visible = visibleRealmIds(db, list);
  return list.filter((r) => visible.has(r.id)).map(({ records: _r, ...rest }) => rest);
}

/** The continent of every place record, for working out where a people is found. */
function placeRealms(db: DB) {
  const P = types(db).with('place');
  const rows = db.prepare(`SELECT id, realm FROM entities WHERE type IN (${P.map(() => '?').join(',') || "''"}) AND archived = 0`).all(...P) as {
    id: string;
    realm: string;
  }[];
  return new Map(rows.map((x) => [x.id, x.realm]));
}

const COLS = 'id, name, type, realm, tags, body, player_summary, revealed_sections, revealed_facts, revealed, archived, fields';

export function playerEntities(db: DB): PlayerEntity[] {
  const revealed = revealedIdSet(db);
  const index = loadMentionIndex(db);
  const lex = buildLexicon(db);
  const places = placeRealms(db);
  const rc = realmContext(db);
  return (db.prepare(`SELECT ${COLS} FROM entities WHERE revealed = 1 AND archived = 0 ORDER BY name`).all() as Row[]).map((r) => project(r, revealed, index, rc, lex, places));
}

export function playerEntity(db: DB, id: string): PlayerEntity | null {
  const r = db.prepare(`SELECT ${COLS} FROM entities WHERE id = ? AND revealed = 1 AND archived = 0`).get(id) as Row | undefined;
  return r ? project(r, revealedIdSet(db), loadMentionIndex(db), realmContext(db), buildLexicon(db), placeRealms(db)) : null;
}

export function playerSearch(db: DB, q: string): PlayerEntity[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return playerEntities(db).filter((e) => [e.name, e.summary, ...e.facts, ...e.sections.map((s) => s.heading + ' ' + s.content)].join('\n').toLowerCase().includes(needle));
}

export function playerMaps(db: DB) {
  const revealed = revealedIdSet(db);
  const maps = db.prepare('SELECT id, name, kind, parent_map_id, image_file, width, height FROM maps WHERE player_visible = 1 ORDER BY id').all() as {
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
      db.prepare('SELECT id, kind, label, points, color, entity_id FROM map_shapes WHERE map_id = ? AND hidden = 0').all(m.id) as {
        id: number;
        kind: string;
        label: string;
        points: string;
        color: string;
        entity_id: string | null;
      }[]
    )
      // A shape tied to a record (a region's outline) is shown only once that record is revealed.
      .filter((s) => !s.entity_id || revealed.has(s.entity_id))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        color: s.color,
        entity_id: s.entity_id && revealed.has(s.entity_id) ? s.entity_id : null,
        points: parseJson<[number, number][]>(s.points, []),
      })),
    // Fog of war and the party's trail: only while the active campaign has a live session.
    exploration: playerExploration(db, m.id, revealed),
  }));
}

export function playerCampaign(db: DB, campaignId: number) {
  const c = db.prepare('SELECT id, title, "current_date" FROM campaigns WHERE id = ?').get(campaignId) as { id: number; title: string; current_date: string } | undefined;
  if (!c) return null;
  const quests = db.prepare(`SELECT id, title, status, description FROM quests WHERE campaign_id = ? AND player_visible = 1 ORDER BY status = 'completed', id`).all(campaignId) as {
    id: number;
    title: string;
    status: string;
    description: string;
  }[];
  const recaps = db.prepare(`SELECT id, number, title, played_on, recap FROM sessions WHERE campaign_id = ? AND recap_player_visible = 1 ORDER BY number`).all(campaignId) as {
    id: number;
    number: number;
    title: string;
    played_on: string;
    recap: string;
  }[];
  const revealed = revealedIdSet(db);
  const index = loadMentionIndex(db);
  return {
    id: c.id,
    title: c.title,
    current_date: c.current_date,
    quests: quests.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      description: scrubRefs(q.description, revealed, index),
    })),
    recaps: recaps.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      played_on: r.played_on,
      recap: scrubRefs(r.recap, revealed, index),
    })),
    // The party's standing with the factions it has dealt with, and what the ranks it has reached bring.
    // The campaign's date, and what's coming in the next 60 days (festivals, and events the GM shares).
    // The world's calendar goes with it, so the players' calendar reads like the GM's.
    calendar: { def: campaignCalendar(db, c.id), date: campaignDate(db, c.id), coming: comingUp(db, c.id, 60, true) },
    // Each known region: what the party has seen and heard there.
    regions: playerRegions(db, c.id),
    // Handouts the GM has given the players.
    handouts: playerHandouts(db, c.id).map((h) => ({ ...h, body: scrubRefs(h.body, revealed, index) })),
    // What the party carries or has stored (the GM can hide any line).
    treasure: playerTreasure(db, c.id),
    // Omens of the Return, for each stage it has reached (never the clock itself).
    omens: moduleOn(db, 'the-return', c.id) ? playerOmens(db, c.id) : [],
    // The faction web as the party knows it: public rivalries, and the ties the GM has revealed.
    factionWeb: playerFactionWeb(db, c.id),
    standing: (moduleOn(db, 'renown', c.id) ? playerStanding(db, c.id) : []).map((f) => ({ ...f, earned: f.earned.map((e) => ({ rank: e.rank, text: scrubRefs(e.text, revealed, index) })) })),
  };
}

export function playerCampaigns(db: DB) {
  return (db.prepare(`SELECT id FROM campaigns WHERE status != 'archived' ORDER BY id`).all() as { id: number }[]).map((c) => playerCampaign(db, c.id)!);
}

/** The active campaign, if there is one, for what players know across the handbook. */
export function activeCampaignId(db: DB): number | null {
  const v = (db.prepare(`SELECT value FROM settings WHERE key = 'active_campaign_id'`).get() as { value: string } | undefined)?.value;
  return v && Number(v) > 0 ? Number(v) : null;
}

export function playerSnapshot(db: DB) {
  return {
    app: 'worldkeeper-player-snapshot',
    appName: (db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper',
    generated_at: new Date().toISOString(),
    entities: playerEntities(db),
    realms: playerRealms(db),
    types: playerTypes(db),
    maps: playerMaps(db),
    campaigns: playerCampaigns(db),
    factionWeb: playerFactionWeb(db, activeCampaignId(db)),
    // Whether the published handbook's builder may use the SRD rules it ships with (the GM can turn the SRD off).
    // The GM's own rules packs are never published.
    rulesSrd: (db.prepare(`SELECT value FROM settings WHERE key = 'rules_srd'`).get() as { value: string } | undefined)?.value !== 'off',
    // Openly licensed rules packs the GM publishes: their options join the SRD in the handbook's builder.
    openRules: publishedRuleEntries(db),
    // Which modules the handbook shows (Thinning, the Return's omens, fading salvage, renown...).
    modules: [...modulesOn(db)],
  };
}
