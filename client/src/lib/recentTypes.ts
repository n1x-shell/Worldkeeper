/** The record types this device made most recently, for the New menu (docs/OWN_WORLD_PLAN.md §2.4). */
import { noteRecentType } from '@shared/newRecord';

const KEY = 'wk.new.recent';

export function recentTypes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberType(key: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(noteRecentType(recentTypes(), key)));
  } catch {
    /* per-device only */
  }
}
