import type { DB } from '../db/connection.js';
import { parseJson } from '../lib/json.js';
import { MentionIndex } from '../../../shared/mentions.js';

/** Name/alias index of every record, for resolving @[Name] mentions. */
export function loadMentionIndex(db: DB): MentionIndex {
  const rows = db.prepare('SELECT id, name, type, aliases, redirect_to FROM entities').all() as {
    id: string;
    name: string;
    type: string;
    aliases: string;
    redirect_to: string | null;
  }[];
  return new MentionIndex(rows.map((r) => ({ id: r.id, name: r.name, type: r.type, aliases: parseJson<string[]>(r.aliases, []), redirect_to: r.redirect_to })));
}
