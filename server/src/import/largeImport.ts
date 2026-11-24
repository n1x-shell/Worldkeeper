/**
 * Large imports (v0.6.7): whether an archive is too big to import in one go on this computer, and if so how big each
 * part should be. Only the Markdown text counts (pictures aren't read by a Markdown import). An import holds the text
 * about six times over while it previews and commits (strings, the parsed records, the plan), so the check compares
 * that with what this process can spare: the smaller of the system's free memory and the JavaScript heap's headroom.
 */
import os from 'node:os';
import v8 from 'node:v8';

const MB = 1024 * 1024;
/** What one import reads at most (as scan.ts enforces): beyond these, parts are needed whatever the memory. */
export const LIMITS = { textBytes: 300 * MB, files: 20000, fileBytes: 8 * MB, uploadBytes: 300 * MB };
const FACTOR = 6;

export interface ArchiveMeasure {
  files: number;
  textBytes: number;
  archiveBytes: number;
  largestFile: number;
}

/** Memory this process can spend on an import (WORLDKEEPER_IMPORT_BUDGET_MB overrides it, for tests). */
export function importBudget(): number {
  const forced = Number(process.env.WORLDKEEPER_IMPORT_BUDGET_MB);
  if (forced > 0) return forced * MB;
  const h = v8.getHeapStatistics();
  return Math.min(os.freemem(), h.heap_size_limit - h.used_heap_size);
}

export function assessImport(m: ArchiveMeasure) {
  const budget = importBudget();
  const needs = m.textBytes * FACTOR;
  const reasons: string[] = [];
  if (m.largestFile > LIMITS.fileBytes)
    return { large: true, possible: false, reason: `One of its files is over ${LIMITS.fileBytes / MB} MB, more than any import reads.`, partTextBytes: 0, parts: 0, budget };
  if (needs > budget / 2) reasons.push(`its text (${(m.textBytes / MB).toFixed(0)} MB) needs more memory than this computer can comfortably spare`);
  if (m.textBytes > LIMITS.textBytes) reasons.push(`it holds more than ${LIMITS.textBytes / MB} MB of text`);
  if (m.files > LIMITS.files) reasons.push(`it holds more than ${LIMITS.files} files`);
  if (m.archiveBytes > LIMITS.uploadBytes * 0.9) reasons.push(`the file is close to the ${LIMITS.uploadBytes / MB} MB upload limit`);
  // Each part: a quarter of the budget for its text (times the factor), within the import's own limits.
  const partTextBytes = Math.max(2 * MB, Math.min(LIMITS.textBytes / 3, Math.floor(budget / 4 / FACTOR)));
  return {
    large: reasons.length > 0,
    possible: true,
    reason: reasons.length ? `This archive is large: ${reasons.join(', and ')}.` : null,
    partTextBytes,
    parts: reasons.length ? Math.max(2, Math.ceil(m.textBytes / partTextBytes)) : 1,
    budget,
  };
}
