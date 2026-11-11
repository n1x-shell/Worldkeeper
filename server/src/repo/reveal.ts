import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { getEntity, updateEntity } from './entities.js';
import { splitSections } from '../import/parseMarkdown.js';
import { isSecretHeading } from '../player/projection.js';

export const revealSchema = z.object({
  /** Make the record known to players (default true when revealing anything). */
  revealed: z.boolean().optional(),
  /** Reveal one section by heading. GM-only/secret headings are refused. */
  section: z.string().max(300).optional(),
  /** Add a DM-written fact for players. */
  fact: z.string().trim().min(1).max(5000).optional(),
  /** When given, the reveal is written to that session's log. */
  session_id: z.number().int().optional(),
});

/**
 * Reveal information to players during play, in one transaction:
 * update the record's player-visible state and log what was revealed to the session.
 */
export function revealDuringPlay(db: DB, id: string, input: unknown) {
  const d = revealSchema.parse(input);
  if (d.revealed === undefined && !d.section && !d.fact) throw badRequest('Nothing to reveal');
  const tx = db.transaction(() => {
    const e = getEntity(db, id);
    const patch: { revealed?: boolean; revealed_sections?: string[]; revealed_facts?: string[]; reason: string } = { reason: 'Revealed during play' };
    const notes: string[] = [];
    if (d.revealed !== undefined) {
      patch.revealed = d.revealed;
      notes.push(d.revealed ? 'record made known to players' : 'record hidden from players');
    } else if (!e.revealed) {
      patch.revealed = true;
      notes.push('record made known to players');
    }
    if (d.section) {
      const exists = splitSections(e.body).some((s) => s.heading === d.section);
      if (!exists) throw badRequest(`No section “${d.section}” in ${e.name}`);
      if (isSecretHeading(d.section)) throw badRequest('GM-only sections cannot be published. Write a revealed fact instead.');
      if (!e.revealed_sections.includes(d.section)) patch.revealed_sections = [...e.revealed_sections, d.section];
      notes.push(`section “${d.section}”`);
    }
    if (d.fact) {
      patch.revealed_facts = [...e.revealed_facts, d.fact];
      notes.push(`fact: ${d.fact}`);
    }
    const updated = updateEntity(db, id, patch, 'reveal');
    if (d.session_id) {
      if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(d.session_id)) throw badRequest('Unknown session');
      db.prepare(`INSERT INTO session_log (session_id, kind, text, entity_id) VALUES (?, 'reveal', ?, ?)`).run(d.session_id, `Revealed to players: ${notes.join('; ')}`, id);
    }
    return updated;
  });
  return tx();
}
