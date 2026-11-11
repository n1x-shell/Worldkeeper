import { SECRET_HEADING_RE } from '@shared/domain';

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

/** Sections to display: editorial notes are dropped unless debug mode is on. */
export function displaySections(body: string, debug: boolean): Section[] {
  const all = splitSections(body);
  return debug ? all : all.filter((s) => !s.heading || !isEditorial(s.heading));
}
