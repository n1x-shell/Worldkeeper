import { Router } from 'express';
import multer from 'multer';
import { handouts } from '../repo/handouts.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { h, intParam, mountCrud } from './util.js';
import { mapDetail, maps, markers, shapes, unplacedLocations } from '../repo/maps.js';
import { defaultRevealTarget, mapRevealsFor, revealCampaigns, revealMapPart } from '../repo/reveals.js';
import { badRequest, notFound } from '../lib/errors.js';
import { addImage, deleteImage, listImages, updateImage } from '../repo/entityImages.js';
import { clearTrail, explorationFor, inPlay, removeTravel, setDiscovered, travel } from '../repo/exploration.js';
import { getActiveCampaignId } from '../repo/campaigns.js';
import { campaignLayers, regionPanel } from '../repo/mapLayers.js';
import { journey } from '../repo/journey.js';
import { sniffImage } from '../lib/images.js';
import { forgetPlan, planInfo, planToMap, savePlan, writeKey } from '../repo/plans.js';
import { handBack, hold } from '../lib/handBack.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Read pixel dimensions from PNG/JPEG/GIF/WEBP headers so the map keeps its true aspect ratio. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  const ext = sniffImage(buf);
  if (ext === '.png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (ext === '.gif') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (ext === '.webp') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (ext === '.jpg') {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

export function atlasRoutes(ctx: AppContext) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 1 } });

  r.get(
    '/maps/unplaced',
    h((req) => unplacedLocations(ctx.db, req.query.scope ? String(req.query.scope) : null)),
  );
  r.get(
    '/maps/:id/detail',
    h((req) => mapDetail(ctx.db, intParam(req.params.id))),
  );
  r.post(
    '/handouts/:id/image',
    upload.single('image'),
    h((req) => {
      const id = intParam(req.params.id);
      handouts.get(ctx.db, id);
      if (!req.file) throw badRequest('Choose an image file');
      if (!IMAGE_TYPES[req.file.mimetype]) throw badRequest('Handout pictures must be PNG, JPEG, WEBP or GIF images');
      const ext = sniffImage(req.file.buffer);
      if (!ext) throw badRequest('The file is not a valid image');
      const name = `handout-${id}-${randomBytes(6).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(ctx.paths.uploadsDir, name), req.file.buffer);
      return handouts.update(ctx.db, id, { image_file: name });
    }),
  );
  r.post(
    '/maps/:id/image',
    upload.single('image'),
    h((req) => {
      const id = intParam(req.params.id);
      maps.get(ctx.db, id);
      if (!req.file) throw badRequest('Choose an image file');
      if (!IMAGE_TYPES[req.file.mimetype]) throw badRequest('Maps must be PNG, JPEG, WEBP or GIF images');
      const ext = sniffImage(req.file.buffer);
      if (!ext) throw badRequest('The file is not a valid image');
      const size = imageSize(req.file.buffer) ?? { width: 2000, height: 1400 };
      const name = `map-${id}-${randomBytes(6).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(ctx.paths.uploadsDir, name), req.file.buffer);
      return maps.update(ctx.db, id, { image_file: name, kind: 'image', width: size.width, height: size.height });
    }),
  );
  // Pictures on records (v0.9.3): any record's pictures, the first being the record's picture.
  r.get(
    '/entities/:id/images',
    h((req) => listImages(ctx.db, String(req.params.id))),
  );
  r.post(
    '/entities/:id/images',
    upload.single('image'),
    h((req) => {
      const id = String(req.params.id);
      if (!req.file) throw badRequest('Choose a picture');
      const ext = sniffImage(req.file.buffer);
      if (!ext || !IMAGE_TYPES[req.file.mimetype]) throw badRequest('Pictures must be PNG, JPEG, WEBP or GIF images');
      const name = `record-${id.replace(/[^\w-]/g, '')}-${randomBytes(6).toString('hex')}${ext}`;
      const body = (req.body ?? {}) as { caption?: unknown; player_visible?: unknown };
      // The row first: an unknown record is refused before anything is written.
      const image = addImage(ctx.db, id, name, { caption: typeof body.caption === 'string' ? body.caption : '', player_visible: body.player_visible === 'true' || body.player_visible === true });
      fs.writeFileSync(path.join(ctx.paths.uploadsDir, name), req.file.buffer);
      return image;
    }),
  );
  r.patch(
    '/entity-images/:id',
    h((req) => updateImage(ctx.db, intParam(req.params.id), req.body)),
  );
  r.delete(
    '/entity-images/:id',
    h((req) => deleteImage(ctx.db, intParam(req.params.id), ctx.paths.uploadsDir)),
  );
  // Plans of places (v0.9.24): what suits a record, the plan the GM kept, its key in the record's text, and a map of it.
  r.get(
    '/entities/:id/plan',
    h((req) => planInfo(ctx.db, String(req.params.id))),
  );
  r.put(
    '/entities/:id/plan',
    h((req) => savePlan(ctx.db, String(req.params.id), req.body)),
  );
  r.delete(
    '/entities/:id/plan',
    h((req) => forgetPlan(ctx.db, String(req.params.id))),
  );
  r.post(
    '/entities/:id/plan/key',
    h((req) => writeKey(ctx.db, String(req.params.id), req.body)),
  );
  r.post(
    '/entities/:id/plan/map',
    upload.single('image'),
    h((req) => {
      if (!req.file) throw badRequest('The plan’s picture is missing');
      const ext = sniffImage(req.file.buffer);
      const size = ext ? imageSize(req.file.buffer) : null;
      if (ext !== '.png' || !size) throw badRequest('The plan’s picture must be a PNG image');
      let about: unknown;
      try {
        about = JSON.parse(String((req.body as { plan?: unknown })?.plan ?? ''));
      } catch {
        throw badRequest('The plan’s details are missing');
      }
      return planToMap(ctx.db, String(req.params.id), ctx.paths.uploadsDir, { buffer: req.file.buffer, ext, ...size }, about);
    }),
  );
  // A plan's picture, made in the window, handed back as a file to save (the same way in a browser and the desktop app).
  r.post(
    '/plan-files',
    upload.single('file'),
    h((req) => {
      if (!req.file) throw badRequest('Nothing to save');
      const svg = req.file.mimetype === 'image/svg+xml' && req.file.buffer.subarray(0, 5).toString('utf8') === '<svg ';
      if (!svg && sniffImage(req.file.buffer) !== '.png') throw badRequest('Only a plan’s picture can be saved this way');
      return { token: hold(String((req.body as { name?: unknown })?.name ?? 'plan'), svg ? 'image/svg+xml' : 'image/png', req.file.buffer) };
    }),
  );
  r.get('/plan-files/:token', (req, res) => {
    const file = handBack(String(req.params.token));
    if (!file) return void res.status(404).json({ error: 'That file is no longer waiting. Make it again.' });
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    // Only ever saved, never shown: a drawing has no business running anything.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'no-store');
    res.end(file.data);
  });
  // Exploration: what the active campaign's party has discovered on a map, and where it has travelled.
  const campaignOf = (v: unknown) => {
    const id = v != null && v !== '' ? Number(v) : getActiveCampaignId(ctx.db);
    if (!id || !Number.isInteger(id)) throw badRequest('Choose an active campaign first');
    return id;
  };
  // The campaign on the map (GM only): quests, adventure places, people and encounters at their places.
  r.get(
    '/map-layers',
    h((req) => {
      const id = req.query.campaign_id ? Number(req.query.campaign_id) : getActiveCampaignId(ctx.db);
      return id ? campaignLayers(ctx.db, id, Number(req.query.map_id)) : [];
    }),
  );
  // A region's panel: terrain, encounter tables, places, and its state in the active (or given) campaign.
  r.get(
    '/regions/:id/panel',
    h((req) => regionPanel(ctx.db, String(req.params.id), req.query.campaign_id ? Number(req.query.campaign_id) : getActiveCampaignId(ctx.db))),
  );
  r.get(
    '/exploration/status',
    h(() => ({ active_campaign_id: getActiveCampaignId(ctx.db), in_play: inPlay(ctx.db) })),
  );
  r.get(
    '/exploration',
    h((req) => explorationFor(ctx.db, campaignOf(req.query.campaign_id), Number(req.query.map_id))),
  );
  r.post(
    '/exploration/discover',
    h((req) => setDiscovered(ctx.db, campaignOf(req.body?.campaign_id), Number(req.body?.map_id), String(req.body?.entity_id ?? ''), req.body?.discovered !== false)),
  );
  // Travel to here: move the party, and optionally move the calendar on and roll the region's encounters each day.
  r.post(
    '/exploration/journey',
    h((req) => {
      const b = req.body ?? {};
      return journey(ctx.db, {
        campaign_id: campaignOf(b.campaign_id),
        map_id: Number(b.map_id),
        to: {
          entity_id: b.entity_id ? String(b.entity_id) : null,
          x: b.x != null ? Number(b.x) : undefined,
          y: b.y != null ? Number(b.y) : undefined,
          label: b.label != null ? String(b.label).slice(0, 200) : undefined,
        },
        pace: b.pace,
        days: b.days != null && b.days !== '' ? Number(b.days) : null,
        advance: !!b.advance,
        roll: !!b.roll,
      });
    }),
  );
  r.post(
    '/exploration/travel',
    h((req) =>
      travel(ctx.db, campaignOf(req.body?.campaign_id), Number(req.body?.map_id), {
        entity_id: req.body?.entity_id ? String(req.body.entity_id) : null,
        x: req.body?.x != null ? Number(req.body.x) : undefined,
        y: req.body?.y != null ? Number(req.body.y) : undefined,
        label: req.body?.label ? String(req.body.label).slice(0, 200) : undefined,
      }),
    ),
  );
  r.delete(
    '/exploration/travel/:id',
    h((req) => removeTravel(ctx.db, campaignOf(req.query.campaign_id), intParam(req.params.id))),
  );
  r.delete(
    '/exploration/trail',
    h((req) => clearTrail(ctx.db, campaignOf(req.query.campaign_id), Number(req.query.map_id))),
  );
  // Show a map, pin or outline to everyone (campaign_id null) or to one campaign; and who was shown what on a map.
  r.post(
    '/map-reveals',
    h((req) => {
      const kind = String(req.body?.kind);
      if (kind !== 'map' && kind !== 'marker' && kind !== 'shape') throw badRequest('kind must be map, marker or shape');
      const cid = req.body?.campaign_id == null ? null : intParam(req.body.campaign_id, 'campaign_id');
      return revealMapPart(ctx.db, kind, intParam(req.body?.ref_id, 'ref_id'), cid, !!req.body?.on);
    }),
  );
  r.get(
    '/maps/:id/reveals',
    h((req) => ({ ...mapRevealsFor(ctx.db, intParam(req.params.id)), choices: revealCampaigns(ctx.db), default: defaultRevealTarget(ctx.db) })),
  );
  mountCrud(r, ctx, '/maps', maps, ['parent_map_id', 'entity_id']);
  mountCrud(r, ctx, '/markers', markers, ['map_id', 'entity_id']);
  mountCrud(r, ctx, '/shapes', shapes, ['map_id']);
  return r;
}

/** Serve uploaded images by strict file name only (no paths). */
export function uploadsHandler(ctx: AppContext) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const name = String(req.params.file);
    if (!/^[\w.-]+\.(png|jpg|webp|gif)$/.test(name)) return next(notFound('File'));
    const full = path.join(ctx.paths.uploadsDir, name);
    if (!fs.existsSync(full)) return next(notFound('File'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // By name inside the uploads folder: on Linux a GM's data is under ~/.local, and a full path through a hidden
    // folder would be refused.
    res.sendFile(name, { root: ctx.paths.uploadsDir });
  };
}
