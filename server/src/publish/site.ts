import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import type { DB } from '../db/connection.js';
import type { Paths } from '../config.js';
import { playerSnapshot } from '../player/projection.js';
import { HttpError } from '../lib/errors.js';
import { sha256 } from '../lib/hash.js';

export interface SiteFile {
  path: string;
  data: Buffer;
}

export interface SiteSummary {
  entries: number;
  maps: number;
  quests: number;
  recaps: number;
  files: number;
  bytes: number;
  generated_at: string;
}

/** Where the built static Player Handbook lives (`npm run build` creates `dist-player/`). */
export function playerSiteDir(): string {
  if (process.env.WORLDKEEPER_PLAYER_SITE_DIR) return process.env.WORLDKEEPER_PLAYER_SITE_DIR;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  return path.join(root, 'dist-player');
}

export function siteBuildAvailable(): boolean {
  return fs.existsSync(path.join(playerSiteDir(), 'index.html'));
}

function walk(dir: string, prefix = ''): SiteFile[] {
  const out: SiteFile[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full, rel));
    else if (ent.isFile()) out.push({ path: rel, data: fs.readFileSync(full) });
  }
  return out;
}

/**
 * Assemble the Player Handbook: the static player app + ONE data file built by the player-safe projection
 * + the images of maps published to players. Nothing else from the library is included.
 */
export function buildPlayerSite(
  db: DB,
  paths: Paths,
  previous?: { contentHash: string; generated_at: string } | null,
): { files: SiteFile[]; summary: SiteSummary; contentHash: string } {
  if (!siteBuildAvailable()) throw new HttpError(500, 'The player handbook has not been built. Run `npm run build` first.');
  const appName = (db.prepare(`SELECT value FROM settings WHERE key = 'app_name'`).get() as { value: string } | undefined)?.value ?? 'The Worldkeeper';
  const fresh = playerSnapshot(db);
  const { generated_at: _ignored, ...content } = fresh;
  const contentHash = sha256(JSON.stringify({ ...content, appName }));
  // Unchanged content keeps its "updated" date, so republishing identical data changes nothing.
  const generated_at = previous && previous.contentHash === contentHash ? previous.generated_at : fresh.generated_at;
  const snap = { ...fresh, appName, generated_at };
  const files: SiteFile[] = walk(playerSiteDir()).filter((f) => !f.path.startsWith('data/') && !f.path.startsWith('uploads/'));
  files.push({ path: 'data/player.json', data: Buffer.from(JSON.stringify(snap)) });
  for (const m of snap.maps) {
    if (!m.image_file || !/^[\w.-]+$/.test(m.image_file)) continue;
    const full = path.join(paths.uploadsDir, m.image_file);
    if (fs.existsSync(full)) files.push({ path: `uploads/${m.image_file}`, data: fs.readFileSync(full) });
  }
  // GitHub Pages: serve files as-is (no Jekyll); keep the handbook out of search engines.
  files.push({ path: '.nojekyll', data: Buffer.alloc(0) });
  files.push({ path: 'robots.txt', data: Buffer.from('User-agent: *\nDisallow: /\n') });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    summary: {
      entries: snap.entities.length,
      maps: snap.maps.length,
      quests: snap.campaigns.reduce((n, c) => n + c.quests.length, 0),
      recaps: snap.campaigns.reduce((n, c) => n + c.recaps.length, 0),
      files: files.length,
      bytes: files.reduce((n, f) => n + f.data.length, 0),
      generated_at: snap.generated_at,
    },
    contentHash,
  };
}

export function playerSiteZip(files: SiteFile[]): Buffer {
  const zip = new AdmZip();
  for (const f of files) zip.addFile(`player-handbook/${f.path}`, f.data);
  return zip.toBuffer();
}
