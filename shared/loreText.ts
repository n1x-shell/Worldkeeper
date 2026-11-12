/**
 * Display-only clean-up of imported source text, so records read as lore.
 *
 * The imported library carries notes about where its text came from: citations like "(A: Geography)", tags like
 * "[SOURCE-PROVIDED]", file names, "as described by the cards", and sentences about rulebooks or what is undefined.
 * Outside debug mode these are hidden. The stored record is never changed, and secrecy markers ([SECRET], GM only)
 * are always kept, because the GM needs them.
 */

/** Bracket tags that are about the source, not the world. [SECRET] and GM-only markers are not in this list. */
const SOURCE_TAG = /\s*\[(?:SOURCE[- ]PROVIDED[^\]]*|OPTIONAL[^\]]*|OUTSIDE[^\]]*|HOMEBREW[^\]]*|NEW|PROPOSED[^\]]*|UNDEFINED[^\]]*|INFERENCE[^\]]*|BELIEF[^\]]*|EXTRAPOLATED[^\]]*|CANON[^\]]*|DERIVED[^\]]*|OFFICIAL[^\]]*|v\d+[^\]]*)\]/gi;

/** Short citations to the setting bibles: "(A: Geography)", "(K: Peoples and creatures; A: Everyday life)". */
const CITATION = /\s*\((?:[AKW]\s*:[^()]*)\)|\s*\([^()]*\[[A-Z]{3}-\d{3}\][^()]*\)/g;

/** Phrases that point at the source inside an otherwise good sentence. */
const SOURCE_PHRASES: [RegExp, string][] = [
  [/\s+as described by the cards/gi, ''],
  [/\s+from the source\b/gi, ''],
  [/\s+in the (?:novel|cards|bible|setting bible)\b/gi, ''],
  [/,?\s+called [^,.]+ in the novel/gi, ''],
  [/What the cards say/g, 'What is told'],
  [/\b[Tt]he (\d+ AB) novel\b/g, '$1'],
  [/\s+appear in (?:the )?(?:\w+ )?character cards as /gi, ' are '],
  [/,?\s*but the (?:bibles?|books|cards|source) (?:do|does) not say so/gi, ''],
  [/\bThe source (?:proposes|suggests) representing /g, 'Represent '],
  [/\bThe source suggests this route for /g, 'This route suits '],
];

/** A sentence that is about the source, the rules books or the editing of the library, not about the world. */
const META_SENTENCE =
  /\.md\b|Setting[_ ]Bible|\bthe bible\b|\bthe source (?:proposes|suggests|gives|says|states)\b|\bsetting-facing\b|official character class|\brulebooks?\b|character-build interpretation|\bverif(?:y|ied)\b|\bUNDEFINED\b|\bSee [A-Z]{3,4}-\d{3}|\bno (?:additional|further) [^.]* (?:assumed|assigned)\b|\bdo not (?:assign|place|create|invent)\b|\bowner decision\b|\bstated (?:flexible )?convention\b|\bTome\b|\bLore entries\b|\bstandalone page\b|\bnot a replacement for\b|\bauthoritative\b|\brule reference\b|\bthe (?:cards|bibles|books|Lorebook|GM Lorebook)\b|\b(?:cards|books|bibles|Lorebook)'s?\s|`[^`]*\/[^`]*`|\b[A-Z]{3}-\d{3}[\u2013-]\d{3}\b|\bsee (?:the )?[^.]*\b[A-Z]{3}-\d{3}\b|\bbibles?\b|\bcharacter cards?\b|\bno [^.]*\bis established\b|\bonly [^.]*\bis established\b|\bonly the pressures apparent\b/i;

/** Whole-section headings that only describe the source (shown in debug mode only). */
export const SOURCE_ONLY_HEADING = /^(?:undefined|shared-world relationship|cross-entry role link.*|position and map use|limit of the record)$/i;

function cleanSentences(line: string): string {
  // Keep list markers and quote markers; split the rest into sentences.
  const m = /^(\s*(?:[-*]|\d+\.|>)\s+)?(.*)$/.exec(line)!;
  const lead = m[1] ?? '';
  const sentences = m[2].split(/(?<=[.!?])\s+(?=[A-Z*_"'(\[])/);
  const kept = sentences.filter((s) => !META_SENTENCE.test(s));
  if (!kept.length) return '';
  return lead + kept.join(' ');
}

function cleanTableRow(line: string): string {
  return line
    .split('|')
    .map((cell) => {
      if (!cell.trim()) return cell;
      const kept = cell
        .trim()
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .filter((s) => !META_SENTENCE.test(s))
        .join(' ');
      return ` ${kept} `;
    })
    .join('|');
}

/** Clean one heading: source tags and "from the source" go; secrecy markers stay. */
export function loreHeading(heading: string): string {
  let h = heading.replace(SOURCE_TAG, '');
  for (const [re, to] of SOURCE_PHRASES) h = h.replace(re, to);
  return h.trim() || heading;
}

/** Clean a block of markdown text for display. */
export function loreText(md: string): string {
  const out: string[] = [];
  for (const raw of md.split('\n')) {
    let line = raw.replace(SOURCE_TAG, '').replace(CITATION, '');
    for (const [re, to] of SOURCE_PHRASES) line = line.replace(re, to);
    if (/^\s*\|/.test(line)) {
      // Table rows: drop a mapping column header word but keep the table shape.
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
}
