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
