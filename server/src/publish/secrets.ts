import fs from 'node:fs';
import path from 'node:path';
import type { Paths } from '../config.js';

/**
 * Local secrets (e.g. the GitHub token for publishing the player handbook).
 * Kept in `<data dir>/secrets.json` with owner-only permissions: NOT in the database, so never in
 * backups, exports or any API response.
 */
const file = (paths: Paths) => path.join(paths.dataDir, 'secrets.json');

function readAll(paths: Paths): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file(paths), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function getSecret(paths: Paths, key: string): string | null {
  return readAll(paths)[key] ?? null;
}

export function setSecret(paths: Paths, key: string, value: string | null) {
  const all = readAll(paths);
  if (value) all[key] = value;
  else delete all[key];
  const tmp = file(paths) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
  fs.renameSync(tmp, file(paths));
  try {
    fs.chmodSync(file(paths), 0o600);
  } catch {
    /* not supported on every filesystem */
  }
}
