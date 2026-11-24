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
 * The uploaded pictures a handbook needs, and no others: its maps' images, and the pictures of the records it shows
 * that are marked for players.
 */
export function siteUploads(snap: { maps: { image_file?: string | null }[]; entities: { images?: { file: string }[] }[] }, uploadsDir: string): SiteFile[] {
  const names = new Set<string>();
  for (const m of snap.maps) if (m.image_file) names.add(m.image_file);
  for (const e of snap.entities) for (const i of e.images ?? []) names.add(i.file);
  const out: SiteFile[] = [];
  for (const name of names) {
    if (!/^[\w.-]+$/.test(name)) continue;
    const full = path.join(uploadsDir, name);
    if (fs.existsSync(full)) out.push({ path: `uploads/${name}`, data: fs.readFileSync(full) });
  }
  return out;
}

/**
 * Assemble the Player Handbook: the static player app + ONE data file built by the player-safe projection
 * + the images of maps published to players. Nothing else from the library is included.
 */
export function buildPlayerSite(db: DB, paths: Paths, previous?: { contentHash: string; generated_at: string } | null): { files: SiteFile[]; summary: SiteSummary; contentHash: string } {
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
  files.push(...siteUploads(snap, paths.uploadsDir));
  // GitHub Pages: serve files as-is (no Jekyll); keep the handbook out of search engines.
  files.push({ path: '.nojekyll', data: Buffer.alloc(0) });
  files.push({ path: 'robots.txt', data: Buffer.from('User-agent: *\nDisallow: /\n') });
  // Every file the offline copy needs (the service worker saves them all on the first visit).
  const offline = files.map((f) => f.path).filter((p) => !/^(\.nojekyll|robots\.txt|sw\.js)$/.test(p));
  files.push({ path: 'precache.json', data: Buffer.from(JSON.stringify(['./', ...offline])) });
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
