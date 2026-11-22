import { SECRET_HEADING_RE } from '@shared/domain';
import { AS_WRITTEN, type Cleaner } from '@shared/loreText';

export interface Section {
  heading: string;
  content: string;
  secret: boolean;
}

/** Client mirror of the server's level-2 section splitter (display only; the server enforces visibility). */
export function splitSections(body: string): Section[] {
  const out: Section[] = [];
  let cur = { heading: '', lines: [] as string[] };
  for (const line of body.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('###')) {
      out.push({ heading: cur.heading, content: cur.lines.join('\n').trim(), secret: SECRET_HEADING_RE.test(cur.heading) });
      cur = { heading: m[1], lines: [] };
    } else cur.lines.push(line);
  }
  out.push({ heading: cur.heading, content: cur.lines.join('\n').trim(), secret: SECRET_HEADING_RE.test(cur.heading) });
  return out.filter((s) => s.heading || s.content);
}

/**
 * Sections to display. Outside debug mode a pack's record reads as lore: its pack's cleaning rules (shared/loreText.ts)
 * drop the sections about the source, and clean notes about the source out of what is left. The GM's own records are
 * shown as written. The record itself is never changed, and secrecy is decided from the original heading.
 */
export function displaySections(body: string, debug: boolean, clean: Cleaner = AS_WRITTEN): Section[] {
  const all = splitSections(body);
  if (debug) return all;
  return all
    .filter((s) => !s.heading || (!clean.editorial(s.heading) && !clean.sourceOnly(s.heading)))
    .map((s) => ({ ...s, heading: s.heading ? clean.heading(s.heading) : s.heading, content: clean.text(s.content) }))
    .filter((s) => s.content.trim() || !s.heading);
}
