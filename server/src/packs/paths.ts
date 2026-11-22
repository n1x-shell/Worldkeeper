/**
 * Where setting packs live (docs/OWN_WORLD_PLAN.md §2.0, §2.10): the ones bundled with the app (packs/ in the source
 * tree, or the folder the desktop build copies them to, WORLDKEEPER_PACKS_DIR) and the ones a GM installs, in
 * <data>/packs/<id>. An installed copy of a pack takes precedence over the bundled one.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BUNDLED_PACKS_DIR = process.env.WORLDKEEPER_PACKS_DIR || path.resolve(import.meta.dirname, '../../../packs');

let installedDir: string | null = null;
/** Set where this library's installed packs go (<data>/packs); the app context does this when it opens a library. */
export function setInstalledPacksDir(dir: string) {
  installedDir = dir;
}
export const installedPacksDir = () => installedDir;

/** A pack's folder: the installed copy if there is one, else the bundled one (null if neither exists). */
export function packRoot(id: string): string | null {
  for (const base of [installedDir, BUNDLED_PACKS_DIR]) {
    if (!base) continue;
    const dir = path.join(base, id);
    if (fs.existsSync(path.join(dir, 'pack.json'))) return dir;
  }
  return null;
}

/** A path inside a pack (its folder need not exist yet: callers check). */
export function packPath(id: string, ...parts: string[]): string {
  return path.join(packRoot(id) ?? path.join(BUNDLED_PACKS_DIR, id), ...parts);
}

/** The Worldkeeper setting's pack id. Only pack-aware code (its loaders and the pack registry) uses it. */
export const WORLDKEEPER = 'worldkeeper';
export const worldkeeperPath = (...parts: string[]) => packPath(WORLDKEEPER, ...parts);
