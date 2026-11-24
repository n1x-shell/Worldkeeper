/**
 * "What the party knows": a Markdown document for players, built only from the player-safe projection (recaps,
 * quests, standing, treasure, handouts) plus the places the party has discovered and the people it has met, where
 * players already know those records. Nothing here can carry a GM secret that the projection wouldn't.
 */
import { revealedIds } from '../repo/reveals.js';
import type { DB } from '../db/connection.js';
import { notFound } from '../lib/errors.js';
import { playerCampaign } from './projection.js';
import { formatDate } from '../../../shared/calendar.js';

const strip = (md: string) => md.replace(/\]\(\/player\/e\/[^)]+\)/g, ']').replace(/\[([^\]]+)\]/g, '$1');

export function partyExport(db: DB, campaignId: number): { title: string; markdown: string } {
  const c = playerCampaign(db, campaignId);
  if (!c) throw notFound('Campaign');
  // Names of records revealed to everyone, or to this campaign.
  const revealedHere = revealedIds(db, campaignId);
  const known = { get: (id: string) => (revealedHere.has(id) ? (db.prepare('SELECT name FROM entities WHERE id = ?').get(id) as { name: string } | undefined) : undefined) };
  const nameOf = (id: string) => known.get(id)?.name ?? null;
  const places = [
    ...new Set((db.prepare('SELECT entity_id FROM map_discoveries WHERE campaign_id = ?').all(campaignId) as { entity_id: string }[]).map((r) => nameOf(r.entity_id)).filter((x): x is string => !!x)),
  ].sort();
  const people = [
    ...new Set(
      (
        db
          .prepare(`SELECT DISTINCT l.entity_id FROM session_log l JOIN sessions s ON s.id = l.session_id JOIN entities e ON e.id = l.entity_id WHERE s.campaign_id = ? AND e.type = 'npc'`)
          .all(campaignId) as { entity_id: string }[]
      )
        .map((r) => nameOf(r.entity_id))
        .filter((x): x is string => !!x),
    ),
  ].sort();
  const L: string[] = [`# ${c.title}: what the party knows`, ''];
  if (c.calendar) L.push(`*${formatDate(c.calendar.def, c.calendar.date)}*`, '');
  if (c.recaps.length) {
    L.push('## The story so far', '');
    for (const r of c.recaps) L.push(`### Session ${r.number}${r.title ? `: ${r.title}` : ''}`, '', strip(r.recap), '');
  }
  const open = c.quests.filter((q) => ['open', 'active', 'rumoured'].includes(q.status));
  const done = c.quests.filter((q) => !['open', 'active', 'rumoured'].includes(q.status));
  if (c.quests.length) {
    L.push('## Quests', '');
    for (const q of open) L.push(`- **${q.title}** (${q.status})${q.description ? `: ${strip(q.description)}` : ''}`);
    for (const q of done) L.push(`- ~~${q.title}~~ (${q.status})`);
    L.push('');
  }
  if (c.standing.length) {
    L.push('## Standing with the factions', '');
    for (const s of c.standing) {
      L.push(`- **${s.name}**: ${s.rank} (Renown ${s.renown})${s.next ? `, ${s.next.name} at ${s.next.at}` : ''}`);
      for (const e of s.earned) L.push(`  - *${e.rank}:* ${strip(e.text)}`);
    }
    L.push('');
  }
  if (c.treasure.length) {
    L.push('## Treasure', '');
    const by = new Map<string, typeof c.treasure>();
    for (const t of c.treasure) by.set(t.holder || 'The party', [...(by.get(t.holder || 'The party') ?? []), t]);
    for (const [who, list] of by) {
      L.push(`**${who}**`, '');
      for (const t of list)
        L.push(`- ${t.quantity > 1 && t.kind !== 'coins' ? `${t.quantity} × ` : ''}${t.name}${t.rarity ? ` (${t.rarity})` : ''}${t.status === 'stored' ? ', stored' : ''}${t.fades ? ', fading' : ''}`);
      L.push('');
    }
  }
  if (c.handouts.length) {
    L.push('## Handouts', '');
    for (const h of c.handouts) L.push(`### ${h.title}`, '', h.image_file ? '*(A picture: see the handbook.)*' : '', strip(h.body), '');
  }
  if (places.length) L.push('## Places discovered', '', places.map((p) => `- ${p}`).join('\n'), '');
  if (people.length) L.push('## People met', '', people.map((p) => `- ${p}`).join('\n'), '');
  if (L.length <= 4) L.push('Nothing yet. The story is just beginning.');
  return { title: c.title, markdown: L.join('\n').replace(/\n{3,}/g, '\n\n') };
}
