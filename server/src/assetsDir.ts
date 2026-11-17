/**
 * Where the app's own data files are (assets/): the source tree when run from source, or the folder the desktop build
 * copies them to (WORLDKEEPER_ADDITIONS_DIR, see scripts/desktop-prepare.mjs).
 */
import path from 'node:path';

export const assetsPath = (...parts: string[]) =>
  process.env.WORLDKEEPER_ADDITIONS_DIR ? path.join(process.env.WORLDKEEPER_ADDITIONS_DIR, ...parts) : path.resolve(import.meta.dirname, '../../assets', ...parts);
