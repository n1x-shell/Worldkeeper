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
  shapes: { id: number; kind: string; label: string; color: string; points: [number, number][] }[];
}
export interface PCampaign {
  id: number;
  title: string;
  current_date: string;
  quests: { id: number; title: string; status: string; description: string }[];
  recaps: { id: number; number: number; title: string; played_on: string; recap: string }[];
}
export interface PlayerSnapshot {
  app: string;
  appName?: string;
  generated_at: string;
  entities: PEntity[];
  maps: PMap[];
  campaigns: PCampaign[];
}

export interface PlayerSource {
  info(): Promise<{ appName: string; publishedAt?: string }>;
  entities(): Promise<PEntity[]>;
  entity(id: string): Promise<PEntity | null>;
  search(q: string): Promise<PEntity[]>;
  maps(): Promise<PMap[]>;
  campaigns(): Promise<PCampaign[]>;
  imageUrl(file: string): string;
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
  imageUrl: (file) => `/api/player/uploads/${encodeURIComponent(file)}`,
};

export function staticSource(snapshotUrl: string, uploadsBase: string): PlayerSource {
  let loaded: Promise<PlayerSnapshot> | null = null;
  const snap = () => (loaded ??= getJson<PlayerSnapshot>(snapshotUrl));
  return {
    info: async () => {
      const s = await snap();
      return { appName: s.appName ?? 'The Worldkeeper', publishedAt: s.generated_at };
    },
    entities: async () => (await snap()).entities,
    entity: async (id) => (await snap()).entities.find((e) => e.id === id) ?? null,
    search: async (q) => {
      const n = q.trim().toLowerCase();
      if (!n) return [];
      return (await snap()).entities.filter((e) =>
        [e.name, e.summary, ...(e.facts ?? []), ...(e.sections ?? []).map((s) => `${s.heading} ${s.content}`)].join('\n').toLowerCase().includes(n),
      );
    },
    maps: async () => (await snap()).maps,
    campaigns: async () => (await snap()).campaigns,
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
