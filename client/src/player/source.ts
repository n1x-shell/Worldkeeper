import type { CalendarDef } from '../../../shared/calendar';
import type { Sheet } from '@shared/sheet';
import type { RealmInfo } from '@shared/realms';
import type { RecordTypeDef } from '@shared/recordTypes';
import { useEffect, useState } from 'react';

/**
 * Where the player view gets its data.
 *  - apiSource: the live player API (/api/player/*), used inside the app and by the LAN player server.
 *  - staticSource: one published snapshot file, used by the static handbook on GitHub Pages.
 * Both only ever see the server's player-safe projection.
 */

export interface PEntity {
  id: string;
  name: string;
  type: string;
  realm: string;
  typeLabel: string;
  realmLabel: string;
  /** Every continent it belongs to (older handbooks don't have this). */
  realms?: string[];
  bloom?: boolean;
  summary: string;
  facts?: string[];
  sections?: { heading: string; content: string }[];
}
export interface PMap {
  id: number;
  name: string;
  image_file: string | null;
  width: number;
  height: number;
  parent_map_id: number | null;
  markers: { id: number; label: string; x: number; y: number; entity_id: string | null; child_map_id: number | null }[];
  shapes: { id: number; kind: string; label: string; color: string; points: [number, number][]; entity_id?: string | null }[];
  /** Fog of war and the party's trail, sent only while the active campaign has a live session. */
  exploration?: { discovered: string[]; trail: { x: number; y: number; label: string }[] } | null;
}
export interface PCampaign {
  id: number;
  title: string;
  current_date: string;
  quests: { id: number; title: string; status: string; description: string }[];
  recaps: { id: number; number: number; title: string; played_on: string; recap: string }[];
  /** The campaign's date and what's coming (festivals, and events the GM shares). */
  calendar?: {
    def: CalendarDef;
    date: { year: number; day: number };
    coming: { kind: string; title: string; notes: string; where: string | null; inDays: number; date: { year: number; day: number } }[];
  };
  /** Regions the party knows, and what it has seen and heard there. */
  regions?: { id: string; name: string; discovered: string[]; lastVisit: { place: string | null; session: number | null } | null; heard: string[] }[];
  /** Handouts the GM has given the players, newest first. */
  handouts?: { id: number; title: string; body: string; image_file: string | null; pushed_at: string }[];
  /** What the party carries or has stored. */
  treasure?: {
    id: number;
    name: string;
    kind: string;
    quantity: number;
    value_gp: number;
    rarity: string;
    entity_id: string | null;
    holder: string;
    status: string;
    found_at: string;
    fades: boolean;
    anchored: boolean;
  }[];
  /** Omens of something coming: one for each stage the GM has reached. */
  omens?: { omen: string; rumours: string[] }[];
  /** The party's standing with factions (only ones the GM shares), and what its ranks bring. */
  standing?: {
    faction_id: string;
    name: string;
    renown: number;
    rank: string;
    next: { name: string; at: number } | null;
    ladder?: string[];
    neutral?: string;
    earned: { rank: string; text: string }[];
  }[];
}
/** A tie in the faction web: allied or opposed. */
export interface PTie {
  a: string;
  b: string;
  aName: string;
  bName: string;
  kind: 'allied' | 'opposed';
  aRealm: string;
  bRealm: string;
}
export interface PlayerSnapshot {
  app: string;
  appName?: string;
  generated_at: string;
  entities: PEntity[];
  maps: PMap[];
  campaigns: PCampaign[];
  factionWeb?: PTie[];
  realms?: RealmInfo[];
  types?: RecordTypeDef[];
  /** False when the GM turned the built-in SRD rules off. */
  rulesSrd?: boolean;
  /** Openly licensed rules the GM publishes, to join the SRD in the builder. */
  openRules?: { kind: string; name: string; cls: string; data: Record<string, unknown>; source: string }[];
  /** The modules on (v0.4.4 on). */
  modules?: string[];
  /** Before modules: the setting's "campaign mechanics". */
  mechanics?: Record<string, boolean>;
}

/** During a live session: the running fight's turn order (no monster numbers) and the newest handout. */
export interface PLive {
  live: boolean;
  fight?: { round: number; order: { name: string; pc: boolean; current: boolean; hp: { hp: number; max: number } | null }[] } | null;
  latest_handout?: { id: number; title: string } | null;
}

export interface PlayerSource {
  info(): Promise<{
    appName: string;
    publishedAt?: string;
    realms?: RealmInfo[];
    types?: RecordTypeDef[];
    rulesSrd?: boolean;
    openRules?: PlayerSnapshot['openRules'];
    modules?: string[];
    mechanics?: Record<string, boolean>;
  }>;
  entities(): Promise<PEntity[]>;
  entity(id: string): Promise<PEntity | null>;
  search(q: string): Promise<PEntity[]>;
  maps(): Promise<PMap[]>;
  campaigns(): Promise<PCampaign[]>;
  factionWeb(): Promise<PTie[]>;
  imageUrl(file: string): string;
  /** Only in the app (not the published handbook): the live session feed. */
  live?(): Promise<PLive>;
  /** Only on the table server: a character's own page, by its private code. */
  myPage?(code: string): Promise<PCharacterPage | null>;
  saveMyPage?(
    code: string,
    patch: Partial<Pick<PCharacterPage, 'true_name' | 'memories' | 'known_by' | 'notes'>> & { character?: Partial<Pick<PCharacterPage, 'name' | 'species' | 'class_name' | 'sheet'>> },
  ): Promise<PCharacterPage>;
  /** The character's change log, without the GM's own notes. */
  myLog?(code: string): Promise<import('./sheet/LogTab').LogEntry[]>;
  /** Save a new portrait (a small data URL), or remove it (null). */
  myPortrait?(code: string, image: string | null): Promise<PCharacterPage>;
  /** Only in the GM's own app (never the table server or the handbook): the campaigns a new character can join. */
  gmCampaigns?(): Promise<{ campaigns: { id: number; title: string }[]; active: number | null } | null>;
  /** Only in the GM's own app: add a character to a campaign's Party and Characters. Returns the new character's id. */
  gmSaveCharacter?(campaignId: number, c: { name: string; species: string; class_name: string; level: number; sheet: Record<string, unknown> }, portrait?: string): Promise<number>;
}

/** A character's own page: memories, true name, who knows it, and Thinning (set by the GM). */
export interface PCharacterPage {
  name: string;
  species: string;
  class_name: string;
  level: number;
  true_name: string;
  memories: { id?: number; text: string; struck: boolean }[];
  known_by: string[];
  thinning: number;
  shardscarred: boolean;
  notes: string;
  updated_at: string;
  /** The character's D&D 2024 sheet (without the GM's own notes). */
  sheet: Sheet;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return (await r.json()) as T;
}

export const apiSource: PlayerSource = {
  info: () => getJson('/api/player/info'),
  entities: () => getJson('/api/player/entities'),
  entity: async (id) => {
    const r = await fetch(`/api/player/entities/${encodeURIComponent(id)}`);
    return r.ok ? ((await r.json()) as PEntity) : null;
  },
  search: (q) => getJson(`/api/player/search?q=${encodeURIComponent(q)}`),
  maps: () => getJson('/api/player/maps'),
  campaigns: () => getJson('/api/player/campaigns'),
  factionWeb: () => getJson('/api/player/faction-web'),
  imageUrl: (file) => `/api/player/uploads/${encodeURIComponent(file)}`,
  live: () => getJson('/api/player/live'),
  myPage: async (code) => {
    const r = await fetch(`/api/player/me/${encodeURIComponent(code)}`);
    return r.ok ? ((await r.json()) as PCharacterPage) : null;
  },
  saveMyPage: async (code, patch) => {
    const r = await fetch(`/api/player/me/${encodeURIComponent(code)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const body = (await r.json().catch(() => ({}))) as PCharacterPage & { error?: string };
    if (!r.ok) throw new Error(body.error ?? `Couldn't save (${r.status})`);
    return body;
  },
  myLog: (code) => getJson(`/api/player/me/${encodeURIComponent(code)}/log`),
  myPortrait: async (code, image) => {
    const r = await fetch(
      `/api/player/me/${encodeURIComponent(code)}/portrait`,
      image ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) } : { method: 'DELETE' },
    );
    const body = (await r.json().catch(() => ({}))) as PCharacterPage & { error?: string };
    if (!r.ok) throw new Error(body.error ?? `Couldn't save the portrait (${r.status})`);
    return body;
  },
  // The table server runs in player mode, where the GM's routes don't exist: these are for the GM's app only.
  gmCampaigns: async () => {
    const h = await getJson<{ mode?: string }>('/api/health').catch(() => null);
    if (h?.mode !== 'dm') return null;
    const [campaigns, active] = await Promise.all([getJson<{ id: number; title: string }[]>('/api/campaigns'), getJson<{ id: number | null }>('/api/campaigns/active')]);
    return { campaigns: campaigns.map((c) => ({ id: c.id, title: c.title })), active: active.id };
  },
  gmSaveCharacter: async (campaignId, c, portrait) => {
    const send = async <T>(url: string, method: string, body: unknown) => {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = (await r.json().catch(() => ({}))) as T & { error?: string };
      if (!r.ok) throw new Error(out.error ?? `Couldn't save (${r.status})`);
      return out;
    };
    const made = await send<{ id: number }>('/api/characters', 'POST', { campaign_id: campaignId, kind: 'pc', ...c });
    if (portrait) await send('/api/characters/' + made.id + '/portrait', 'POST', { image: portrait });
    return made.id;
  },
};

export function staticSource(snapshotUrl: string, uploadsBase: string): PlayerSource {
  let loaded: Promise<PlayerSnapshot> | null = null;
  const snap = () => (loaded ??= getJson<PlayerSnapshot>(snapshotUrl));
  return {
    info: async () => {
      const s = await snap();
      return {
        appName: s.appName ?? 'The Worldkeeper',
        publishedAt: s.generated_at,
        realms: s.realms,
        types: s.types,
        rulesSrd: s.rulesSrd !== false,
        openRules: s.openRules,
        modules: s.modules,
        mechanics: s.mechanics,
      };
    },
    entities: async () => (await snap()).entities,
    entity: async (id) => (await snap()).entities.find((e) => e.id === id) ?? null,
    search: async (q) => {
      const n = q.trim().toLowerCase();
      if (!n) return [];
      return (await snap()).entities.filter((e) => [e.name, e.summary, ...(e.facts ?? []), ...(e.sections ?? []).map((s) => `${s.heading} ${s.content}`)].join('\n').toLowerCase().includes(n));
    },
    maps: async () => (await snap()).maps,
    campaigns: async () => (await snap()).campaigns,
    factionWeb: async () => (await snap()).factionWeb ?? [],
    imageUrl: (file) => `${uploadsBase}${encodeURIComponent(file)}`,
  };
}

/** Load something from the player source; re-runs when `key` changes. */
export function usePlayerData<T>(load: () => Promise<T>, key: string): { data: T | undefined; error: Error | null } {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; key: string | null }>({ data: undefined, error: null, key: null });
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ data, error: null, key }),
      (error: Error) => live && setState({ data: undefined, error, key }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error } : { data: undefined, error: null };
}
