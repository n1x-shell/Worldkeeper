/**
 * The Worldkeeper setting's realms (moves to the setting's pack in own-world step 3): Aetheris and Kaelmar are
 * continents of The World, which sits in the realm of Evershroud; the Ethereal Realm is a realm beside it.
 */
import type { DB } from '../db/connection.js';
import { ensureRealm, realmExists } from '../repo/realms.js';
import { SETTING_REALMS } from './normalize.js';

/** The Ethereal Realm's domains, outermost first (the Hollow Verge, then the six beneath it). */
export const SETTING_DOMAINS = Object.keys(SETTING_REALMS).filter((id) => SETTING_REALMS[id].kind === 'domain');

/**
 * Once a library uses the setting, The World belongs to Evershroud (unless the GM has put it somewhere already), and
 * the Ethereal Realm holds its domains.
 */
export function placeSettingWorld(db: DB) {
  if (!['aetheris', 'kaelmar', 'ethereal'].some((id) => realmExists(db, id))) return;
  ensureRealm(db, 'evershroud', SETTING_REALMS.evershroud);
  db.prepare(`UPDATE realms SET parent_id = 'evershroud' WHERE id = 'world' AND parent_id IS NULL AND kind = 'world'`).run();
  if (realmExists(db, 'ethereal')) for (const id of SETTING_DOMAINS) ensureRealm(db, id, SETTING_REALMS[id]);
}

/** Make sure one of the setting's realms exists, with its place in the setting. Returns its id. */
export function ensureSettingRealm(db: DB, id: string): string {
  ensureRealm(db, id, SETTING_REALMS[id]);
  placeSettingWorld(db);
  return id;
}
