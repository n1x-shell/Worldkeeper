/**
 * Parses the library's Markdown convention:
 *
 *   ID: NPC-010
 *   Name: Mara Venn
 *   ...nine standard keys, then template-specific keys...
 *
 *   # Heading
 *   body...
 *
 * A single file may hold several such blocks (compendium files); each block
 * starts with an `ID:` line at the top of the file or after a blank line / `---`.
 */

export interface ParsedBlock {
  id: string;
  meta: [string, string][];
  body: string;
  startLine: number;
}

export interface ParsedFile {
  path: string;
  blocks: ParsedBlock[];
  /** Text before the first block (normally empty). */
  preamble: string;
  title: string | null;
}

const META_LINE = /^([A-Z][A-Za-z0-9 ,/()'’-]{0,60}?):\s?(.*)$/;

export function parseMarkdownFile(path: string, content: string): ParsedFile {
  const text = content.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^ID:\s*\S/.test(lines[i])) continue;
    const prev = i === 0 ? '' : lines[i - 1].trim();
    if (i === 0 || prev === '' || prev === '---') starts.push(i);
  }

  const blocks: ParsedBlock[] = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const meta: [string, string][] = [];
    let i = start;
    for (; i < end; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.startsWith('#')) break;
      const m = META_LINE.exec(line);
      if (!m) break;
      meta.push([m[1].trim(), m[2].trim()]);
    }
    let bodyLines = lines.slice(i, end);
    // Drop trailing separators that divide compendium entries.
    while (bodyLines.length && (bodyLines[bodyLines.length - 1].trim() === '' || bodyLines[bodyLines.length - 1].trim() === '---')) {
      bodyLines = bodyLines.slice(0, -1);
    }
    const id = meta.find(([k]) => k === 'ID')?.[1] ?? '';
    blocks.push({ id, meta, body: bodyLines.join('\n').trim(), startLine: start + 1 });
  }

  const preamble = starts.length ? lines.slice(0, starts[0]).join('\n').trim() : text.trim();
  const heading = lines.find((l) => /^#\s+/.test(l));
  return { path, blocks, preamble, title: heading ? heading.replace(/^#\s+/, '').trim() : null };
}

export function metaValue(meta: [string, string][], key: string): string | null {
  const hit = meta.find(([k]) => k.toLowerCase() === key.toLowerCase());
  return hit ? hit[1] : null;
}

/** Split Markdown into level-2 sections. Content before the first `## ` heading has heading ''. */
export function splitSections(body: string): { heading: string; content: string }[] {
  const out: { heading: string; content: string }[] = [];
  let current = { heading: '', lines: [] as string[] };
  for (const line of body.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('###')) {
      out.push({ heading: current.heading, content: current.lines.join('\n').trim() });
      current = { heading: m[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push({ heading: current.heading, content: current.lines.join('\n').trim() });
  return out.filter((s) => s.heading !== '' || s.content !== '');
}

/** Parse the first Markdown pipe table found after a given heading (or anywhere). */
export function parsePipeTable(markdown: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        inTable = true;
        continue;
      }
      rows.push(cells);
      inTable = true;
    } else if (inTable && rows.length) {
      break;
    }
  }
  return rows;
}
