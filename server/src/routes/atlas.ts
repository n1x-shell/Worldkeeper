import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppContext } from '../context.js';
import { h, intParam, mountCrud } from './util.js';
import { mapDetail, maps, markers, shapes, unplacedLocations } from '../repo/maps.js';
import { badRequest, notFound } from '../lib/errors.js';
import { kindOf, saveProfile } from '../repo/profiles.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Check the file's magic bytes, not only its declared type. SVG is refused (it can carry script). */
function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return '.gif';
  return null;
}

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

  r.get('/maps/unplaced', h((req) => unplacedLocations(ctx.db, req.query.scope ? String(req.query.scope) : null)));
  r.get('/maps/:id/detail', h((req) => mapDetail(ctx.db, intParam(req.params.id))));
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
  r.post(
    '/profiles/:id/portrait',
    upload.single('image'),
    h((req) => {
      const id = String(req.params.id);
      kindOf(ctx.db, id);
      if (!req.file) throw badRequest('Choose an image file');
      const ext = sniffImage(req.file.buffer);
      if (!ext || !IMAGE_TYPES[req.file.mimetype]) throw badRequest('Portraits must be PNG, JPEG, WEBP or GIF images');
      const name = `portrait-${id.replace(/[^\w-]/g, '')}-${randomBytes(6).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(ctx.paths.uploadsDir, name), req.file.buffer);
      return saveProfile(ctx.db, id, 'world', null, { portrait: name });
    }),
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
    res.sendFile(full);
  };
}
