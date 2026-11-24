/**
 * Display-only clean-up of imported source text, so records read as lore.
 *
 * A setting's archive can carry notes about where its text came from: citations, tags like "[SOURCE-PROVIDED]",
 * file names, sentences about rulebooks or what is undefined. Its pack says how to spot them (pack.json "cleaning"),
 * and outside debug mode they're hidden on that pack's records only; the GM's own records are shown as written. The
 * stored record is never changed, and secrecy markers ([SECRET], GM only) are always kept, because the GM needs them.
 */
import { compile, type CleaningRules } from './packs.js';

export interface Cleaner {
  /** Clean a block of Markdown text for display. */
  text: (md: string) => string;
  /** Clean one heading: source tags and "from the source" go; secrecy markers stay. */
  heading: (h: string) => string;
  /** A section of notes about the source itself (shown in debug mode only). */
  editorial: (heading: string) => boolean;
  /** A section whose heading only describes the source (shown in debug mode only). */
  sourceOnly: (heading: string) => boolean;
}

/** Shows text as written (a record of the GM's own, or a pack with no cleaning rules). */
export const AS_WRITTEN: Cleaner = { text: (md) => md, heading: (h) => h, editorial: () => false, sourceOnly: () => false };

export function makeCleaner(rules: CleaningRules | undefined | null): Cleaner {
  if (!rules) return AS_WRITTEN;
  const tag = compile(rules.sourceTag, 'g');
  const citation = compile(rules.citation, 'g');
  const phrases = (rules.sourcePhrases ?? []).map((p) => [compile(p, 'g')!, p.to] as const);
  const meta = compile(rules.metaSentence);
  const sourceOnly = compile(rules.sourceOnlyHeading);
  const editorial = compile(rules.editorialHeading);
  const isMeta = (s: string) => !!meta?.test(s);

  const cleanSentences = (line: string) => {
    // Keep list markers and quote markers; split the rest into sentences.
    const m = /^(\s*(?:[-*]|\d+\.|>)\s+)?(.*)$/.exec(line)!;
    const lead = m[1] ?? '';
    const kept = m[2].split(/(?<=[.!?])\s+(?=[A-Z*_"'([])/).filter((s) => !isMeta(s));
    return kept.length ? lead + kept.join(' ') : '';
  };
  const cleanTableRow = (line: string) =>
    line
      .split('|')
      .map((cell) =>
        cell.trim()
          ? ` ${cell
              .trim()
              .split(/(?<=[.!?])\s+(?=[A-Z])/)
              .filter((s) => !isMeta(s))
              .join(' ')} `
          : cell,
      )
      .join('|');
  const strip = (s: string) => {
    let out = tag ? s.replace(tag, '') : s;
    for (const [re, to] of phrases) out = out.replace(re, to);
    return out;
  };

  return {
    heading: (h) => strip(h).trim() || h,
    text: (md) => {
      const out: string[] = [];
      for (const raw of md.split('\n')) {
        let line = tag ? raw.replace(tag, '') : raw;
        if (citation) line = line.replace(citation, '');
        for (const [re, to] of phrases) line = line.replace(re, to);
        if (/^\s*\|/.test(line)) {
          // Table rows keep the table's shape.
          out.push(cleanTableRow(line));
          continue;
        }
        if (!line.trim()) {
          out.push(line);
          continue;
        }
        const cleaned = cleanSentences(line);
        // A line that was only source notes disappears entirely.
        if (cleaned.trim() || !raw.trim()) out.push(cleaned);
      }
      return out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },
    editorial: (h) => !!editorial?.test(h.trim()),
    sourceOnly: (h) => !!sourceOnly?.test(h.trim()),
  };
}
