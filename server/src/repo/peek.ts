/**
 * A record at a glance, for hover cards, the inspector and split view (GM app): what it is, a short summary, a few
 * facts, its sections and its links. Unlike opening the record, a peek isn't counted as a visit.
 */
import type { DB } from '../db/connection.js';
import { getEntity } from './entities.js';
import { listRelationshipsFor } from './relationships.js';
import { splitSections } from '../import/parseMarkdown.js';
import { isSecretHeading } from '../player/projection.js';
import { statblockFor } from './statblocks.js';
import { relationshipLabel } from '../../../shared/domain.js';

const BLANK = /^(undefined|none|unknown|n\/a|-|—)?$/i;

/** The first paragraph of prose, cut at a sentence near `max` characters. */
export function firstParagraph(text: string, max = 320): string {
  const para =
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^[#>|*-]|^\d+\.\s/.test(p) && !/^[A-Z][A-Za-z ]+:\s/.test(p)) ?? '';
  const flat = para.replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

export function peekEntity(db: DB, id: string) {
  let e = getEntity(db, id);
  if (e.redirect_to) e = getEntity(db, e.redirect_to);
  // The body's own "# Name" title line isn't a section.
  const sections = splitSections(e.body)
    .map((s) => ({ heading: s.heading, content: s.content.replace(/^#\s+.*(\n|$)/, '').trim(), secret: s.heading ? isSecretHeading(s.heading) : false }))
    .filter((s) => s.content);
  const open = sections.filter((s) => !s.secret);
  const summary = firstParagraph(open.map((s) => s.content).join('\n\n')) || firstParagraph(e.player_summary ?? '');
  const facts = e.fields.filter(([k, v]) => v && !BLANK.test(v.trim()) && !/secret|gm only|dm only/i.test(k)).slice(0, 3);
  const links = listRelationshipsFor(db, e.id)
    .filter((r) => r.type !== 'references')
    .slice(0, 12)
    .map((r) => {
      const out = r.source_id === e.id;
      return { id: out ? r.target_id : r.source_id, name: (out ? r.target_name : r.source_name) ?? (out ? r.target_id : r.source_id), label: relationshipLabel(r.type, out) };
    });
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    realm: e.realm,
    canon_status: e.canon_status,
    canon_flags: e.canon_flags,
    revealed: e.revealed,
    archived: e.archived,
    summary,
    facts,
    sections,
    links,
    hasStatBlock: !!statblockFor(e.id),
  };
}
