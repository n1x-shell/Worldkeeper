/**
 * The table display (v0.9.9, docs/BETA_PLAN.md B4): a page for a television or second screen at the table. The GM
 * chooses what it shows: the campaign's title card, a map, a handout or a record's picture. Whatever is chosen is
 * read for the display through the players' projection, so it can only ever show what players may see.
 */
import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson } from '../lib/json.js';
import { playerEntity, playerMaps } from '../player/projection.js';
import { pushHandout } from './handouts.js';

const displaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('title') }),
  z.object({ kind: z.literal('map'), map_id: z.number().int() }),
  z.object({ kind: z.literal('handout'), handout_id: z.number().int() }),
  /** One of a record's pictures (entity_images.id). */
  z.object({ kind: z.literal('picture'), image_id: z.number().int() }),
]);
export type Display = z.infer<typeof displaySchema>;

const key = (campaignId: number) => `table_display:${campaignId}`;

/** What the GM chose (the title card until they choose). */
export function getDisplay(db: DB, campaignId: number): Display {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key(campaignId)) as { value: string } | undefined;
  const d = displaySchema.safeParse(parseJson<unknown>(row?.value ?? '', null));
  return d.success ? d.data : { kind: 'title' };
}

interface Picture {
  entity_id: string;
  file: string;
  caption: string;
}
const picture = (db: DB, imageId: number) =>
  db.prepare('SELECT entity_id, file, caption FROM entity_images WHERE id = ? AND player_visible = 1 AND removed = 0').get(imageId) as Picture | undefined;

/** Choose what the display shows. Refused if players couldn't see it; a handout shown is a handout given. */
export function setDisplay(db: DB, campaignId: number, body: unknown): Display {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  const d = displaySchema.parse(body ?? {});
  if (d.kind === 'map' && !playerMaps(db, campaignId).some((m) => m.id === d.map_id)) throw badRequest('Players can’t see that map yet: show it to them first (Atlas, the map’s settings)');
  if (d.kind === 'handout') {
    const h = db.prepare('SELECT pushed_at FROM handouts WHERE id = ? AND campaign_id = ?').get(d.handout_id, campaignId) as { pushed_at: string | null } | undefined;
    if (!h) throw notFound('Handout');
    if (!h.pushed_at) pushHandout(db, d.handout_id, true);
  }
  if (d.kind === 'picture') {
    const p = picture(db, d.image_id);
    if (!p) throw badRequest('Tick “Players see it” on that picture first');
    if (!playerEntity(db, p.entity_id, campaignId)) throw badRequest('Players don’t know that record yet: reveal it first');
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key(campaignId), JSON.stringify(d));
  return d;
}

/** What the GM can choose from: the maps players see, the campaign's handouts, and what is on the display now. */
export function displayOptions(db: DB, campaignId: number) {
  if (!db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(campaignId)) throw notFound('Campaign');
  return {
    display: getDisplay(db, campaignId),
    maps: playerMaps(db, campaignId).map((m) => ({ id: m.id, name: m.name })),
    handouts: db.prepare('SELECT id, title, pushed_at FROM handouts WHERE campaign_id = ? ORDER BY pushed_at IS NULL, pushed_at DESC, id DESC').all(campaignId) as {
      id: number;
      title: string;
      pushed_at: string | null;
    }[],
  };
}

export type PlayerDisplay =
  | { kind: 'title'; title: string; date: string }
  | { kind: 'map'; map_id: number; title: string }
  | { kind: 'handout'; title: string; body: string; image_file: string | null }
  | { kind: 'picture'; title: string; caption: string; file: string };

/**
 * The display as players may see it. Something chosen that players can no longer see (a map hidden again, a handout
 * taken back, a picture unticked) falls back to the title card.
 */
export function playerDisplay(db: DB, campaignId: number | null): PlayerDisplay {
  const c = campaignId == null ? undefined : (db.prepare('SELECT title, current_date FROM campaigns WHERE id = ?').get(campaignId) as { title: string; current_date: string } | undefined);
  const title: PlayerDisplay = { kind: 'title', title: c?.title ?? '', date: c?.current_date ?? '' };
  if (!c || campaignId == null) return title;
  const d = getDisplay(db, campaignId);
  if (d.kind === 'map') {
    const m = playerMaps(db, campaignId).find((x) => x.id === d.map_id);
    return m ? { kind: 'map', map_id: m.id, title: m.name } : title;
  }
  if (d.kind === 'handout') {
    const h = db.prepare('SELECT title, body, image_file FROM handouts WHERE id = ? AND campaign_id = ? AND pushed_at IS NOT NULL').get(d.handout_id, campaignId) as
      | { title: string; body: string; image_file: string | null }
      | undefined;
    return h ? { kind: 'handout', ...h } : title;
  }
  if (d.kind === 'picture') {
    const p = picture(db, d.image_id);
    const e = p ? playerEntity(db, p.entity_id, campaignId) : null;
    return p && e ? { kind: 'picture', title: e.name, caption: p.caption, file: p.file } : title;
  }
  return title;
}
