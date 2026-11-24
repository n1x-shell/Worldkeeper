import { z } from 'zod';
import type { DB } from '../db/connection.js';
import { badRequest } from '../lib/errors.js';
import { getEntity, updateEntity } from './entities.js';
import { splitSections } from '../import/parseMarkdown.js';
import { activeCampaignId, isSecretHeading } from '../player/projection.js';
import { defaultRevealTarget, isRevealed, revealCampaigns, revealToCampaign } from './reveals.js';

export const revealSchema = z.object({
  /** Make the record known to players (default true when revealing anything). */
  revealed: z.boolean().optional(),
  /** Reveal one section by heading. GM-only/secret headings are refused. */
  section: z.string().max(300).optional(),
  /** Add a DM-written fact for players. */
  fact: z.string().trim().min(1).max(5000).optional(),
  /** When given, the reveal is written to that session's log. */
  session_id: z.number().int().optional(),
  /**
   * Who learns it: one campaign or everyone. Unset, it follows the library: with two or more campaigns, the session's
   * campaign (or the active one); otherwise everyone (docs/LIBRARIES_PLAN.md §2.2).
   */
  to: z.enum(['campaign', 'everyone']).optional(),
  /** The campaign that learns it, when `to` is campaign (default: the session's, else the active one). */
  campaign_id: z.number().int().optional(),
});

/**
 * Reveal information to players during play, in one transaction:
 * update what players know (everyone's, or one campaign's) and log what was revealed, and to whom, to the session.
 */
export function revealDuringPlay(db: DB, id: string, input: unknown) {
  const d = revealSchema.parse(input);
  if (d.revealed === undefined && !d.section && !d.fact) throw badRequest('Nothing to reveal');
  const tx = db.transaction(() => {
    const e = getEntity(db, id);
    if (d.section && !splitSections(e.body).some((s) => s.heading === d.section)) throw badRequest(`No section “${d.section}” in ${e.name}`);
    if (d.section && isSecretHeading(d.section)) throw badRequest('GM-only sections cannot be published. Write a revealed fact instead.');
    if (d.session_id && !db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(d.session_id)) throw badRequest('Unknown session');
    const sessionCampaign = d.session_id ? ((db.prepare('SELECT campaign_id FROM sessions WHERE id = ?').get(d.session_id) as { campaign_id: number }).campaign_id ?? null) : null;
    const target = d.to === 'everyone' ? null : d.to === 'campaign' ? (d.campaign_id ?? sessionCampaign ?? activeCampaignId(db)) : (d.campaign_id ?? defaultRevealTarget(db, sessionCampaign));
    if (d.to === 'campaign' && target == null) throw badRequest('Choose the campaign that learns this');
    const log = (who: string, notes: string[]) => {
      if (d.session_id) db.prepare(`INSERT INTO session_log (session_id, kind, text, entity_id) VALUES (?, 'reveal', ?, ?)`).run(d.session_id, `Revealed to ${who}: ${notes.join('; ')}`, id);
    };
    if (target != null) {
      const title = (db.prepare('SELECT title FROM campaigns WHERE id = ?').get(target) as { title: string } | undefined)?.title;
      if (!title) throw badRequest('Unknown campaign');
      const notes: string[] = [];
      if (d.revealed === false) {
        revealToCampaign(db, target, id, { hide: true });
        notes.push('record hidden from them');
      } else {
        const knew = isRevealed(db, id, target);
        revealToCampaign(db, target, id, { sections: d.section ? [d.section] : [], facts: d.fact ? [d.fact] : [] });
        if (!knew) notes.push('record made known to them');
        if (d.section) notes.push(`section “${d.section}”`);
        if (d.fact) notes.push(`fact: ${d.fact}`);
      }
      log(title, notes);
      return getEntity(db, id);
    }
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
      if (!e.revealed_sections.includes(d.section)) patch.revealed_sections = [...e.revealed_sections, d.section];
      notes.push(`section “${d.section}”`);
    }
    if (d.fact) {
      patch.revealed_facts = [...e.revealed_facts, d.fact];
      notes.push(`fact: ${d.fact}`);
    }
    const updated = updateEntity(db, id, patch, 'reveal');
    log(revealCampaigns(db).length < 2 ? 'players' : 'everyone', notes);
    return updated;
  });
  return tx();
}
