import { SECRET_HEADING_RE } from '@shared/domain';
import { SOURCE_ONLY_HEADING, loreHeading, loreText } from '@shared/loreText';

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
 * Editorial notes in the source library about the source itself (citations, what is undefined, how to
 * enter the page in other tools). Hidden outside debug mode; the record text is not changed.
 */
export const EDITORIAL_HEADING_RE =
  /^(sources?|references|unspecified fields|tome implementation|review notes|limits( of the source)?|record boundaries|source boundary|use and verification|missing facts|limitations|open questions|unknowns|amsel entry (rule|notes)|use in amsel|status)(\s*\[[^\]]*\])?$/i;

export function isEditorial(heading: string): boolean {
  return EDITORIAL_HEADING_RE.test(heading.trim());
}

/**
 * Sections to display. Outside debug mode the text reads as lore: editorial sections are dropped, and notes about
 * the source (citations, tags, file names, rulebook caveats) are cleaned out of what is left. The record itself is
 * never changed, and secrecy is decided from the original heading.
 */
export function displaySections(body: string, debug: boolean): Section[] {
  const all = splitSections(body);
  if (debug) return all;
  return all
    .filter((s) => !s.heading || (!isEditorial(s.heading) && !SOURCE_ONLY_HEADING.test(s.heading.trim())))
    .map((s) => ({ ...s, heading: s.heading ? loreHeading(s.heading) : s.heading, content: loreText(s.content) }))
    .filter((s) => s.content.trim() || !s.heading);
}
